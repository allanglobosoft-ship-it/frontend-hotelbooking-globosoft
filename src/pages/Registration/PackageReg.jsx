import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  Button,
  Table,
  Modal,
  Form,
  Row,
  Col,
  Tab,
  Tabs,
  FormCheck,
  Pagination,
} from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import axios from "axios";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import Select from "react-select";
import {
  FaEdit,
  FaTrash,
  FaEye,
  FaPlus,
  FaBackward,
  FaDollarSign,
  FaCopy,
  FaChevronDown,
  FaArrowLeft,
  FaArrowRight,
  FaCheck,
} from "react-icons/fa";
import DateTimeApplyPicker, {
  parseLocalDateTime,
} from "../../components/DateTimeApplyPicker";
import DashboardRedirections from "../../components/DashboardRedirections";

// Enhanced SearchableSelect Component with loading support
const SearchableSelect = ({
  options,
  value,
  onChange,
  placeholder,
  className,
  isInvalid,
  name,
  disabled = false,
  isLoading = false,
  onInputChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredOptions, setFilteredOptions] = useState(options || []);

  useEffect(() => {
    if (!options || !Array.isArray(options)) {
      setFilteredOptions([]);
      return;
    }

    if (searchTerm) {
      const filtered = options.filter((option) => {
        // Handle different possible data structures
        const optionName = option.name || String(option);
        return optionName.toLowerCase().includes(searchTerm.toLowerCase());
      });
      setFilteredOptions(filtered);
    } else {
      setFilteredOptions(options);
    }
  }, [searchTerm, options]);

  const handleSelect = (option) => {
    try {
      console.log("Selecting option:", option);
      // Ensure we pass a proper value
      const value = option.id !== undefined ? option.id : option;
      onChange({
        target: {
          name: name,
          value: value,
        },
      });
      setIsOpen(false);
      setSearchTerm("");
      if (onInputChange) onInputChange("");
    } catch (error) {
      console.error("Error in handleSelect:", error);
    }
  };

  const selectedOption = options?.find(
    (option) => String(option.id) === String(value)
  );

  return (
    <div className="position-relative">
      <Form.Control
        type="text"
        value={isOpen ? searchTerm : selectedOption?.name || ""}
        onChange={(e) => {
          if (disabled) return;
          const val = e.target.value;
          if (isOpen) {
            setSearchTerm(val);
          } else {
            // If not open, open dropdown and set search term
            setIsOpen(true);
            setSearchTerm(val);
          }
          if (onInputChange) onInputChange(val);
        }}
        onFocus={() => !disabled && setIsOpen(true)}
        placeholder={placeholder}
        className={`form-input pe-5 ${isInvalid ? "is-invalid" : ""}`}
        disabled={disabled}
        readOnly={disabled}
        autoComplete="off"
      />
      <div
        className="position-absolute end-0 top-50 translate-middle-y pe-3"
        style={{ pointerEvents: "none" }}
      >
        <FaChevronDown className="text-muted small" />
      </div>

      {isOpen && !disabled && (
        <div
          className="position-absolute w-100 bg-white border border-top-0 rounded-bottom shadow-lg"
          style={{
            zIndex: 1050,
            maxHeight: "200px",
            overflowY: "auto",
            top: "100%",
          }}
        >
          {isLoading ? (
            <div className="px-3 py-2 text-center">
              <div
                className="spinner-border spinner-border-sm me-2"
                role="status"
              >
                <span className="visually-hidden">Loading...</span>
              </div>
              Loading...
            </div>
          ) : filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <div
                key={option.id}
                className="px-3 py-2 cursor-pointer"
                style={{
                  cursor: "pointer",
                  borderBottom: "1px solid #eee",
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = "#f8f9fa";
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = "white";
                }}
                onClick={() => handleSelect(option)}
              >
                {option.name ||
                  option.countryName ||
                  option.stateName ||
                  option.placeName ||
                  String(option)}
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-muted">No options found</div>
          )}
        </div>
      )}

      {/* Overlay to close dropdown when clicking outside */}
      {isOpen && (
        <div
          className="position-fixed"
          style={{
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1040,
          }}
          onClick={() => {
            setIsOpen(false);
            setSearchTerm("");
          }}
        />
      )}
    </div>
  );
};

const PackageReg = () => {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currencies, setCurrencies] = useState([]);
  const [formData, setFormData] = useState({
    packageName: "",
    packageCode: "",
    packageBasicRate: "",
    currencyId: "",
    packageType: "",
    packageCategory: [],
    packageImage: null,
    containHotel: false,
    containCab: false,
    containActivity: false,
    status: "Enable",
    arriveCountry: "",
    arrivePlace: [],
    overview: "",
    noOfNights: "1",
    // Free-text notes captured on the "Information on Package" tab.
    // Persisted as packages.package_information (TEXT) on the backend.
    packageInformation: "",
  });

  // Additional state for itinerary and others
  const [packageItinearyDTOList, setPackageItinearyDTOList] = useState([
    {
      day: 1,
      heading: "",
      placeId: "",
      dayActivities: "",
      packageItinearyImage: null,
    },
  ]);

  const [packageOthersDTOList, setPackageOthersDTOList] = useState([]);

  const [packageValidityDTOList, setPackageValidityDTOList] = useState([
    { validityFrom: "", validityTo: "" },
  ]);

  const [packageCancellationPolicyDTOList, setPackageCancellationPolicyDTOList] = useState([
    { cancellationFee: "", cancellationFeeType: "PERCENT", noOfNights: "" },
  ]);

  const [selectedOthers, setSelectedOthers] = useState([]);
  const [countries, setCountries] = useState([]);
  const [places, setPlaces] = useState([]);
  // Full (never search-narrowed) City list for the selected country, used
  // by every Itinerary day's Place dropdown. Kept apart from `places`
  // because the Arrive City search narrows that list, which used to blank
  // the Place already picked on other days.
  const [itineraryPlaces, setItineraryPlaces] = useState([]);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);
  const [allDestinations, setAllDestinations] = useState([]);
  const [isLoadingDestinations, setIsLoadingDestinations] = useState(false);
  const [isViewMode, setIsViewMode] = useState(false);
  const [termsAndConditions, setTermsAndConditions] = useState([]);
  const [isLoadingTerms, setIsLoadingTerms] = useState(false);
  const [packageCategories, setPackageCategories] = useState([]);
  const [packageCategoryDropdownOpen, setPackageCategoryDropdownOpen] = useState(false);
  const [packageTypes, setPackageTypes] = useState([]);
  const [isLoadingPackageTypes, setIsLoadingPackageTypes] = useState(false);
  const [isCountryLoading, setIsCountryLoading] = useState(false);
  const countryDebounceRef = useRef(null);
  const placeDebounceRef = useRef(null);
  const [selectedCountryOption, setSelectedCountryOption] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);

  // Controlled active tab so Next/Previous buttons and direct tab clicks
  // move through the wizard in a single, known order. The order is
  // basic → itinerary → inclusions → exclusions → policyDetails →
  // packageInformation. Confirm button only shows on the final tab
  // (packageInformation).
  const TAB_ORDER = ["basic", "itinerary", "inclusions", "exclusions", "policyDetails", "packageInformation"];
  const [activeTab, setActiveTab] = useState("basic");

  // Free-text custom entries per bucket. The master-picked entries live
  // in packageOthersDTOList (unchanged). These three arrays collect the
  // user-typed rows they add alongside the master checklist. Each item
  // is { customText, descriptionType, isDeleted:false } — the payload
  // shape the backend now accepts on `packageOthersDTOList[i]`.
  const [customInclusions, setCustomInclusions] = useState([]);
  const [customExclusions, setCustomExclusions] = useState([]);
  const [customTerms, setCustomTerms] = useState([]);
  // Admin-defined "Standard Package Details" that will be auto-attached
  // to this package by the backend on save/edit. Populated whenever a
  // country is selected via /api/master/termsAndCondition/mandatory,
  // and rendered read-only in the Inclusions / Exclusions / Terms tabs
  // so the supplier sees what's already covered by admin. Never sent
  // in the save payload — the backend re-applies these unconditionally.
  const [mandatoryStandards, setMandatoryStandards] = useState([]);
  const [isLoadingMandatory, setIsLoadingMandatory] = useState(false);
  // Draft text bound to the "Add" textarea in each tab, before the user
  // clicks + Add. Kept per bucket so switching tabs doesn't lose the draft.
  const [inclusionDraft, setInclusionDraft] = useState("");
  const [exclusionDraft, setExclusionDraft] = useState("");
  const [termsDraft, setTermsDraft] = useState("");


  // Helper function to get image URL from path
  const getImageUrl = (imagePath) => {
    if (!imagePath) return '';

    // If it's already a URL, return as is
    if (imagePath.startsWith('http')) {
      return imagePath;
    }

    // If it's a local Windows path, extract filename and convert to web URL
    if (imagePath.includes('\\') || imagePath.includes(':')) {
      // Extract just the filename from the Windows path
      const filename = imagePath.split('\\').pop();

      // Try different possible endpoints - prioritize the most likely ones
      const possibleUrls = [
        `${process.env.REACT_APP_API_BASE_URL}/api/files/${filename}`,
        `${process.env.REACT_APP_API_BASE_URL}/filesSave/details/imageDir/${filename}`,
        `${process.env.REACT_APP_API_BASE_URL}/details/imageDir/${filename}`,
        `${process.env.REACT_APP_API_BASE_URL}/api/TravelPackage/image/${filename}`,
        `${process.env.REACT_APP_API_BASE_URL}/images/${filename}`,
        `${process.env.REACT_APP_API_BASE_URL}/static/images/${filename}`,
        `${process.env.REACT_APP_API_BASE_URL}/uploads/${filename}`,
        `${process.env.REACT_APP_API_BASE_URL}/file/${filename}`,
        `${process.env.REACT_APP_API_BASE_URL}/download/${filename}`,
      ];

      // Log for debugging
      console.log('🔍 Image Debug Info:');
      console.log('📁 Original path:', imagePath);
      console.log('📄 Extracted filename:', filename);
      console.log('🌐 Trying URL:', possibleUrls[0]);
      console.log('📋 All possible URLs:', possibleUrls);

      // Test if the URL is accessible
      fetch(possibleUrls[0])
        .then(response => {
          console.log('✅ URL Response Status:', response.status);
          console.log('✅ URL Response OK:', response.ok);
        })
        .catch(error => {
          console.log('❌ URL Fetch Error:', error);
        });

      // Return the first URL - this is the most common pattern
      return possibleUrls[0];
    }

    // If it's not a Windows path, treat it as a filename
    return `${process.env.REACT_APP_API_BASE_URL}/api/files/${imagePath}`;
  };

  // Helper function to get form control props based on view mode
  const getFormControlProps = (
    fieldName,
    onChangeHandler,
    additionalProps = {}
  ) => {
    return {
      ...additionalProps,
      readOnly: isViewMode,
      onChange: isViewMode ? undefined : onChangeHandler,
      className: `${additionalProps.className || ""} ${isViewMode ? "bg-light" : ""
        }`.trim(),
      autoFocus: isViewMode ? false : additionalProps.autoFocus,
    };
  };

  const validateForm = (data) => {
    const errors = {};

    // Basic field validations. Currency + Package Basic Rate were removed
    // from the modal per client request — they are no longer required
    // fields, so nothing validates against them here.
    if (!data.packageName?.trim())
      errors.packageName = "Package Name is required";
    if (!data.packageCode?.trim())
      errors.packageCode = "Package Code is required";
    if (!data.packageType?.trim())
      errors.packageType = "Package Type is required";
    if (!data.packageCategory?.length)
      errors.packageCategory = "Package Category is required";
    if (!data.countryId || (typeof data.countryId === 'string' && !data.countryId.trim()))
      errors.countryId = "Country is required";
    if (!data.placeId || (typeof data.placeId === 'string' && !data.placeId.trim()))
      errors.placeId = "Place is required";
    if (!data.noOfNights?.trim())
      errors.noOfNights = "No of nights is required";

    // Itinerary validation - at least one day must have data
    const hasItineraryData = packageItinearyDTOList.some(
      (day) =>
        day.heading?.trim() ||
        (day.placeId && (typeof day.placeId === 'string' ? day.placeId.trim() : day.placeId)) ||
        day.dayActivities?.trim()
    );
    if (!hasItineraryData) {
      errors.itinerary =
        "Please enter at least one itinerary day with heading, place, or activities";
    }

    // Others validation — a package must have at least one non-deleted
    // entry across the three buckets (master OR custom). The user's
    // typed-in inclusions/exclusions/terms count. Admin-defined
    // "Standard Package Details" (mandatory master terms) for the
    // selected country also count — they are auto-attached by the
    // backend and cover the "at least one item" requirement even if the
    // supplier doesn't add anything of their own.
    const hasMasterOthers = packageOthersDTOList.some((other) => !other.isDeleted);
    const hasCustomOthers =
      customInclusions.some((c) => !c.isDeleted && c.customText?.trim()) ||
      customExclusions.some((c) => !c.isDeleted && c.customText?.trim()) ||
      customTerms.some((c) => !c.isDeleted && c.customText?.trim());
    const hasMandatoryStandards = (mandatoryStandards || []).length > 0;
    if (!hasMasterOthers && !hasCustomOthers && !hasMandatoryStandards) {
      errors.others =
        "Please select or enter at least one item in Inclusion, Exclusion, or Terms & Conditions";
    }

    return errors;
  };

  const handleCreate = () => {
    setIsViewMode(false);
    setFormData({
      packageName: "",
      packageCode: "",
      packageBasicRate: "",
      currencyId: "",
      packageType: "",
      packageCategory: [],
      packageImage: null,
      containHotel: false,
      containCab: false,
      containActivity: false,
      status: "Enable",
      countryId: "",
      placeId: "",
      overview: "",
      noOfNights: "1",
      packageInformation: "",
    });
    setPackageItinearyDTOList([
      {
        day: 1,
        heading: "",
        placeId: "",
        dayActivities: "",
        packageItinearyImage: null,
      },
    ]);
    setSelectedOthers([]);
    setPlaces([]);
    setItineraryPlaces([]);
    setPackageValidityDTOList([{ validityFrom: "", validityTo: "" }]);
    setPackageCancellationPolicyDTOList([
      { cancellationFee: "", cancellationFeeType: "PERCENT", noOfNights: "" },
    ]);

    // Reset packageOthersDTOList to all items selected (not deleted)
    if (termsAndConditions.length > 0) {
      const resetOthersList = termsAndConditions.map((term) => ({
        otherId: term.termsAndConditionsId,
        type: term.description,
        descriptionType: term.descriptionType,
        termsCode: term.termsCode,
        isDeleted: false,
      }));
      setPackageOthersDTOList(resetOthersList);
    }
    setCountries([]); // Clear previous country options
    setSelectedCountryOption(null); // Reset selection
    fetchCountries(""); // Load initial countries
    setCustomInclusions([]);
    setCustomExclusions([]);
    setCustomTerms([]);
    setInclusionDraft("");
    setExclusionDraft("");
    setTermsDraft("");
    setActiveTab("basic");
    setValidationErrors({});
    setShowModal(true);
  };

  const fetchPackageList = async (pageNum = 0, searchTerm = search) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "10",
      });

      if (searchTerm && searchTerm.trim()) {
        params.append("search", searchTerm.trim());
      }

      const res = await axiosInstance.get(
        `/api/TravelPackage?${params.toString()}`
      );
      console.log("package  list :::", res);

      if (res.data && Array.isArray(res.data)) {
        setItems(res.data);
        if (res.data.length < 10) {
          setTotalPages(pageNum + 1);
        } else {
          setTotalPages(Math.max(totalPages, pageNum + 2));
        }
        setPage(pageNum);
      } else {
        setItems([]);
        setTotalPages(0);
        setPage(0);
      }
    } catch (err) {
      toast.error("Failed to load cab providers");
      setItems([]);
      setTotalPages(0);
      setPage(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPackageList();
    fetchCountries("", 250);
    loadCurrencies();
    loadAllDestinations();
    loadTermsAndConditions();
    packageCategoryList();
    fetchPackageTypes();
  }, []);

  const prepareFormDataPayload = () => {
    const formDataPayload = new FormData();
    formDataPayload.append("packageName", formData.packageName);
    formDataPayload.append("packageType", formData.packageType);
    formDataPayload.append("packageCode", formData.packageCode);
    formDataPayload.append("noOfNights", formData.noOfNights);
    formDataPayload.append("overview", formData.overview || "");
    // Free-text notes from the "Information on Package" tab. Always
    // sent (empty string when unset) so an edit that cleared the field
    // is persisted rather than skipped by the backend's null check.
    formDataPayload.append("packageInformation", formData.packageInformation || "");
    // Currency + Basic Rate are hidden fields now — the backend columns
    // still exist so we send whatever value is on the form (blank on
    // create, unchanged on edit). Nothing new to validate for.
    if (formData.packageBasicRate) {
      formDataPayload.append("packageBasicRate", formData.packageBasicRate);
    }
    if (formData.currencyId) {
      formDataPayload.append("currencyId", formData.currencyId);
    }
    formDataPayload.append("arriveCountry", formData.countryId);

    if (formData.placeId) {
      formDataPayload.append("arrivePlace", formData.placeId);
    }

    formDataPayload.append("containHotel", formData.containHotel ? 1 : 0);
    formDataPayload.append("containCab", formData.containCab ? 1 : 0);
    formDataPayload.append("containActivity", formData.containActivity ? 1 : 0);

    formData.packageCategory.forEach((category, index) => {
      formDataPayload.append(`packageCategory[${index}]`, String(category));
    });

    packageItinearyDTOList.forEach((itinerary, index) => {
      formDataPayload.append(`packageItinearyDTOList[${index}].day`, itinerary.day);
      formDataPayload.append(`packageItinearyDTOList[${index}].heading`, itinerary.heading || "");
      // Only append placeId when a real value is set — sending an empty string
      // makes Spring try to convert "" to Long and fail with a 500.
      if (itinerary.placeId !== null && itinerary.placeId !== undefined && itinerary.placeId !== "") {
        formDataPayload.append(`packageItinearyDTOList[${index}].placeId`, itinerary.placeId);
      }
      formDataPayload.append(`packageItinearyDTOList[${index}].dayActivities`, itinerary.dayActivities || "");
      // Only append the binary if the local state holds an actual File object.
      // String values represent an already-uploaded image path that the backend
      // already knows about — sending it again as a file would fail binding.
      // Backend DTO field is `MultipartFile packageItinearyImageFile` (matches
      // the same `packageImageFile` pattern used for the main package image).
      if (itinerary.packageItinearyImage && typeof itinerary.packageItinearyImage !== "string") {
        formDataPayload.append(`packageItinearyDTOList[${index}].packageItinearyImageFile`, itinerary.packageItinearyImage);
      } else if (typeof itinerary.packageItinearyImage === "string" && itinerary.packageItinearyImage) {
        // No new file picked, but an existing image path is known — echo it back
        // as `packageItinearyImagePath` so the backend's editTravelPackage can
        // preserve it (it falls back to this when no MultipartFile is uploaded).
        formDataPayload.append(`packageItinearyDTOList[${index}].packageItinearyImagePath`, itinerary.packageItinearyImage);
      }
    });

    // Master-picked others (checkbox rows). Send otherId + descriptionType
    // + isDeleted so the backend can (a) validate the master FK and
    // (b) know which bucket the row belongs to when it survives the
    // isDeleted filter.
    let othersIdx = 0;
    packageOthersDTOList.forEach((other) => {
      formDataPayload.append(`packageOthersDTOList[${othersIdx}].otherId`, other.otherId);
      formDataPayload.append(`packageOthersDTOList[${othersIdx}].type`, other.type || "");
      if (other.descriptionType != null) {
        formDataPayload.append(`packageOthersDTOList[${othersIdx}].descriptionType`, other.descriptionType);
      }
      formDataPayload.append(`packageOthersDTOList[${othersIdx}].isDeleted`, other.isDeleted ? "true" : "false");
      othersIdx += 1;
    });

    // Custom free-text rows — no otherId; the backend keys them by
    // (customText, descriptionType) alone. Skip blanks so an empty draft
    // never posts as a real row.
    const appendCustom = (list) => {
      list.forEach((row) => {
        const text = (row.customText || "").trim();
        if (!text) return;
        formDataPayload.append(`packageOthersDTOList[${othersIdx}].customText`, text);
        formDataPayload.append(`packageOthersDTOList[${othersIdx}].descriptionType`, row.descriptionType);
        formDataPayload.append(`packageOthersDTOList[${othersIdx}].isDeleted`, row.isDeleted ? "true" : "false");
        othersIdx += 1;
      });
    };
    appendCustom(customInclusions);
    appendCustom(customExclusions);
    appendCustom(customTerms);

    packageValidityDTOList.forEach((validity, index) => {
      if (!validity.validityFrom && !validity.validityTo) return;
      // Match the hotel-policy edit page: send yyyy-MM-ddTHH:mm:ss so the
      // backend can parse it as a LocalDateTime-shaped string.
      const from = validity.validityFrom
        ? (validity.validityFrom.length === 16 ? `${validity.validityFrom}:00` : validity.validityFrom)
        : "";
      const to = validity.validityTo
        ? (validity.validityTo.length === 16 ? `${validity.validityTo}:00` : validity.validityTo)
        : "";
      formDataPayload.append(`packageValidityDTOList[${index}].validityFrom`, from);
      formDataPayload.append(`packageValidityDTOList[${index}].validityTo`, to);
    });

    packageCancellationPolicyDTOList.forEach((cp, index) => {
      if (
        (cp.cancellationFee === "" || cp.cancellationFee === null || cp.cancellationFee === undefined) &&
        (cp.noOfNights === "" || cp.noOfNights === null || cp.noOfNights === undefined)
      ) {
        return;
      }
      formDataPayload.append(
        `packageCancellationPolicyDTOList[${index}].cancellationFee`,
        cp.cancellationFee ?? ""
      );
      formDataPayload.append(
        `packageCancellationPolicyDTOList[${index}].cancellationFeeType`,
        cp.cancellationFeeType || "PERCENT"
      );
      formDataPayload.append(
        `packageCancellationPolicyDTOList[${index}].noOfNights`,
        cp.noOfNights ?? ""
      );
    });

    formDataPayload.append("liveStatus", formData.status === "true" ? 1 : 0);

    // Only send the main package image as a binary when the user picked a new
    // file (File object). On edit, formData.packageImage may be the string
    // returned by getTravelPackageById (packageImagePath) — sending that as
    // `packageImageFile` would fail Spring's String→MultipartFile conversion.
    // When no new file is picked, the backend preserves the existing
    // packageImage column, so nothing else needs to be sent.
    if (formData.packageImage && typeof formData.packageImage !== "string") {
      formDataPayload.append("packageImageFile", formData.packageImage);
    }

    return formDataPayload;
  };

  // Pull the most descriptive line out of an Axios error so the toast
  // shows exactly what the backend said instead of the generic "Network
  // Error" / "Request failed" default. Handles: Spring's validation map
  // ({field: message}), MessageResponse ({message}), plain-text bodies,
  // and payload-too-large (413).
  const extractApiError = (error) => {
    if (!error) return "Unknown error";
    // Payload-too-large — Spring / Tomcat / nginx all return 413 with an
    // empty body, so error.response.data is often "".
    if (error.response?.status === 413) {
      return "The file(s) you uploaded are too large. Please choose a smaller image or reduce the number of items.";
    }
    const data = error.response?.data;
    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object") {
      if (data.message) return data.message;
      if (data.error) return data.error;
      // Spring @Valid failures: {field1: "must not be blank", ...}
      const fieldErrs = Object.entries(data)
        .filter(([, v]) => typeof v === "string")
        .map(([k, v]) => `${k}: ${v}`)
        .join("; ");
      if (fieldErrs) return fieldErrs;
    }
    return error.message || "Something went wrong";
  };

  const handleSave = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      // Jump the user to the tab that owns the first error so they can
      // see and fix it immediately.
      jumpToFirstErrorTab(errors);
      return;
    }

    const formDataPayload = prepareFormDataPayload();

    try {
      setIsLoading(true);
      const res = await axiosInstance.post("/api/TravelPackage/save", formDataPayload, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data) {
        toast.success("Package added successfully!");
        setValidationErrors({});
        await fetchPackageList(page, search);
        closeModal();
      } else {
        toast.error("Failed to save data!!");
      }
    } catch (error) {
      console.error("Package save error:", error);
      toast.error(`Save failed: ${extractApiError(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePackage = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      jumpToFirstErrorTab(errors);
      return;
    }

    const formDataPayload = prepareFormDataPayload();

    try {
      setIsLoading(true);
      const res = await axiosInstance.put(`/api/TravelPackage/${editing.packageId}`, formDataPayload, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data) {
        toast.success("Package updated successfully!");
        setValidationErrors({});
        setEditing(null);
        await fetchPackageList(page, search);
        closeModal();
      } else {
        toast.error("Failed to update data!!");
      }
    } catch (error) {
      console.error("Package update error:", error);
      toast.error(`Update failed: ${extractApiError(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Map a validation-error key to the tab that owns the field, so on
  // submit failure we can auto-switch the user to the tab where their
  // fix has to happen.
  const jumpToFirstErrorTab = (errors) => {
    const basicKeys = [
      "packageName", "packageCode", "packageType", "packageCategory",
      "countryId", "placeId", "noOfNights",
    ];
    if (basicKeys.some((k) => errors[k])) { setActiveTab("basic"); return; }
    if (errors.itinerary) { setActiveTab("itinerary"); return; }
    if (errors.others) { setActiveTab("inclusions"); return; }
  };

  const fetchCountries = async (searchTerm = "", limit = 20) => {
    setIsCountryLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/country?page=0&limit=${limit}&search=${encodeURIComponent(searchTerm)}`
      );
      if (Array.isArray(res.data)) {
        setCountries(res.data);
        return res.data;
      } else {
        setCountries([]);
        return [];
      }
    } catch (error) {
      console.error("Error fetching countries:", error);
      setCountries([]);
      return [];
    } finally {
      setIsCountryLoading(false);
    }
  };

  // Arrive City (and Itinerary Place) options — the same country-scoped
  // City list the "City" dropdown on Hotel Registration shows
  // (HotelReg.jsx → loadProvinces). The `search` param narrows by
  // city name/code.
  const cityList = async (countryId, searchTerm = "") => {
    try {
      setIsLoadingPlaces(true);
      const response = await axiosInstance.get(
        `/api/province/getByCountryId/${countryId}?search=${encodeURIComponent(searchTerm)}`
      );
      const cities = Array.isArray(response.data)
        ? response.data.filter((city) => !city.isDeleted)
        : [];
      setPlaces(cities);
      // An unfiltered load is the country's full City list — that is what
      // the Itinerary Place dropdowns search through (client-side).
      if (!searchTerm) setItineraryPlaces(cities);
    } catch (error) {
      console.log("axios call error for city list : ", error);
      setPlaces([]);
      if (!searchTerm) setItineraryPlaces([]);
    } finally {
      setIsLoadingPlaces(false);
    }
  };

  const loadCurrencies = async () => {
    try {
      const response = await axiosInstance.get("/api/currency");

      setCurrencies(response.data || []);
    } catch (error) {

      toast.error("Failed to load currencies");
    }
  };

  const loadAllDestinations = async () => {
    try {
      setIsLoadingDestinations(true);
      const response = await axiosInstance.get(`/api/destination`);
      setAllDestinations(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log("axios call error for all destinations : ", error);
      setAllDestinations([]);
    } finally {
      setIsLoadingDestinations(false);
    }
  };

  // Fetch admin-defined "Standard Package Details" for a country. These
  // are Master Terms & Conditions rows the admin has flagged as
  // mandatory — the backend auto-attaches them to every package for that
  // country on save/edit, and this preview lets the supplier see them
  // as read-only entries under Inclusions / Exclusions / Terms.
  const loadMandatoryStandards = async (countryId) => {
    if (!countryId) {
      setMandatoryStandards([]);
      return;
    }
    try {
      setIsLoadingMandatory(true);
      const response = await axiosInstance.get(
        `/api/master/termsAndCondition/mandatory?countryId=${encodeURIComponent(countryId)}`
      );
      setMandatoryStandards(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log("axios call error for mandatory standards : ", error);
      setMandatoryStandards([]);
    } finally {
      setIsLoadingMandatory(false);
    }
  };

  const loadTermsAndConditions = async () => {
    try {
      setIsLoadingTerms(true);
      const response = await axiosInstance.get(`/api/master/termsAndCondition`);
      const termsData = Array.isArray(response.data) ? response.data : [];
      setTermsAndConditions(termsData);

      // Initialize packageOthersDTOList with the fetched data
      const initialOthersList = termsData.map((term, index) => ({
        otherId: term.termsAndConditionsId,
        type: term.description,
        descriptionType: term.descriptionType,
        termsCode: term.termsCode,
        isDeleted: false,
      }));
      setPackageOthersDTOList(initialOthersList);
    } catch (error) {
      console.log("axios call error for terms and conditions : ", error);
      setTermsAndConditions([]);
      setPackageOthersDTOList([]);
    } finally {
      setIsLoadingTerms(false);
    }
  };

  const packageCategoryList = async () => {
    try {
      const response = await axiosInstance.get("/api/packageCategory");
      setPackageCategories(response.data);
    } catch (error) {
      console.log("error for package category  list :", error);
    }
  };

  const fetchPackageTypes = async () => {
    try {
      setIsLoadingPackageTypes(true);
      const response = await axiosInstance.get("/api/packageType");
      setPackageTypes(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error fetching package types:", error);
      toast.error("Failed to load package types");
    } finally {
      setIsLoadingPackageTypes(false);
    }
  };

  // Handle country change
  const handleCountryChange = (option) => {
    try {
      const value = option ? option.value : "";
      const selectedCountryName = option ? option.label : "";
      
      setSelectedCountryOption(option);
      
      console.log("Country selected:", value, "Country name:", selectedCountryName);

      // Clear places and place selection when country changes
      setPlaces([]);
      setItineraryPlaces([]);
      setIsLoadingPlaces(false);

      setFormData((prev) => ({
        ...prev,
        countryId: value,
        placeId: "", // Clear place selection
      }));
      // Itinerary Places belong to the old country's City list too — clear
      // them so a hidden, stale City id is never saved.
      setPackageItinearyDTOList((prev) =>
        prev.map((day) => ({ ...day, placeId: "" }))
      );

      // Fetch cities for the selected country
      if (value) {
        cityList(value);
      }

      // Refresh the admin "Standard Package Details" panel for the new
      // country. Clears the list when country is unset.
      loadMandatoryStandards(value);

      // Clear validation errors
      if (validationErrors.countryId) {
        setValidationErrors((prev) => ({
          ...prev,
          countryId: "",
        }));
      }
      if (validationErrors.placeId) {
        setValidationErrors((prev) => ({
          ...prev,
          placeId: "",
        }));
      }
    } catch (error) {
      console.error("Error in handleCountryChange:", error);
    }
  };

  // Handle status toggle
  const handleStatusToggle = (pkg) => {
    setSelectedPackage(pkg);
    setShowStatusModal(true);
  };

  const updatePackageStatus = async () => {
    if (!selectedPackage) return;
    try {
      setIsLoading(true);
      // Determine the new status (if liveStatus is false, it's currently Active, so toggle to true for InActive)
      const newStatus = !selectedPackage.liveStatus;
      
      const res = await axiosInstance.patch(
        `/api/TravelPackage/status/${selectedPackage.packageId}`,
        { liveStatus: newStatus }
      );

      if (res.data) {
        toast.success(`Package ${newStatus ? 'deactivated' : 'activated'} successfully`);
      }

      await fetchPackageList(page, search);
      setShowStatusModal(false);
      setSelectedPackage(null);
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error(
        `Failed to update status: ${
          error.response?.data?.message || error.message
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Handle place change
  const handlePlaceChange = (e) => {
    const value = e.target.value;
    const stringValue = String(value); // Convert to string for consistency
    console.log("Place selected:", value);

    setFormData((prev) => ({
      ...prev,
      placeId: stringValue,
    }));

    // Clear validation error when user makes selection
    if (validationErrors.placeId) {
      setValidationErrors((prev) => ({
        ...prev,
        placeId: "",
      }));
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setValidationErrors({});
    setEditing(null);
    setIsViewMode(false);
    setPackageCategoryDropdownOpen(false);
    setPackageValidityDTOList([{ validityFrom: "", validityTo: "" }]);
    setPackageCancellationPolicyDTOList([
      { cancellationFee: "", cancellationFeeType: "PERCENT", noOfNights: "" },
    ]);
    setCustomInclusions([]);
    setCustomExclusions([]);
    setCustomTerms([]);
    setInclusionDraft("");
    setExclusionDraft("");
    setTermsDraft("");
    setMandatoryStandards([]);
    setActiveTab("basic");
  };

  // CRUD Operations
  const fetchAndShowDetail = async (item, viewMode = false) => {
    try {
      setIsLoading(true);
      const res = await axiosInstance.get(`/api/TravelPackage/${item.packageId}`);
      if (!res.data) throw new Error("No data received from server");
      
      const data = res.data;
      setEditing(data);
      setIsViewMode(viewMode);
      
      setFormData({
        packageName: data.packageName || "",
        packageCode: data.packageCode || "",
        packageBasicRate: data.packageBasicRate || "",
        currencyId: data.currencyId || "",
        packageType: data.packageType || "",
        packageCategory: Array.isArray(data.packageCategory) ? data.packageCategory : (data.packageCategory ? [data.packageCategory] : []),
        packageImage: data.packageImagePath || null,
        containHotel: data.containHotel === 1 || data.containHotel === true,
        containCab: data.containCab === 1 || data.containCab === true,
        containActivity: data.containActivity === 1 || data.containActivity === true,
        status: data.liveStatus === true ? "true" : "false",
        countryId: data.arriveCountry || data.countryId || "",
        placeId: Array.isArray(data.arrivePlace) && data.arrivePlace.length > 0 ? data.arrivePlace[0] : (data.placeId || ""),
        overview: data.overview || "",
        noOfNights: data.noOfNights || "1",
        packageInformation: data.packageInformation || "",
      });

      // Preload admin-defined "Standard Package Details" for the
      // package's country so the read-only panel is populated when the
      // edit / view modal opens (the country-change handler covers the
      // create flow instead).
      loadMandatoryStandards(data.arriveCountry || data.countryId || "");

      // Load places for the selected country
      const countryId = data.arriveCountry || data.countryId;
      if (countryId) {
        cityList(countryId);
        fetchCountries("", 250).then((options) => {
          const matched = (options || []).find(c => String(c.id) === String(countryId));
          if (matched) {
            setSelectedCountryOption({ value: matched.id, label: matched.name });
          }
        });
      } else {
        setSelectedCountryOption(null);
      }

      // Load itinerary data
      if (data.packageItinearyDTOList && Array.isArray(data.packageItinearyDTOList)) {
        const updatedItinerary = data.packageItinearyDTOList.map((itinerary) => ({
          day: itinerary.day,
          heading: itinerary.heading || "",
          placeId: itinerary.placeId || "",
          dayActivities: itinerary.dayActivities || "",
          packageItinearyImage: itinerary.packageItinearyImagePath || itinerary.packageItinearyImage || null,
        }));
        setPackageItinearyDTOList(updatedItinerary);
      } else {
        setPackageItinearyDTOList([{ day: 1, heading: "", placeId: "", dayActivities: "", packageItinearyImage: null }]);
      }

      // Load validity list
      if (data.packageValidityDTOList && Array.isArray(data.packageValidityDTOList) && data.packageValidityDTOList.length > 0) {
        setPackageValidityDTOList(
          data.packageValidityDTOList.map((v) => ({
            validityFrom: v.validityFrom || "",
            validityTo: v.validityTo || "",
          }))
        );
      } else {
        setPackageValidityDTOList([{ validityFrom: "", validityTo: "" }]);
      }

      // Load cancellation policy list
      if (
        data.packageCancellationPolicyDTOList &&
        Array.isArray(data.packageCancellationPolicyDTOList) &&
        data.packageCancellationPolicyDTOList.length > 0
      ) {
        setPackageCancellationPolicyDTOList(
          data.packageCancellationPolicyDTOList.map((c) => ({
            cancellationFee: c.cancellationFee ?? "",
            cancellationFeeType: c.cancellationFeeType || "PERCENT",
            noOfNights: c.noOfNights ?? "",
          }))
        );
      } else {
        setPackageCancellationPolicyDTOList([
          { cancellationFee: "", cancellationFeeType: "PERCENT", noOfNights: "" },
        ]);
      }

      // Load others data — master picks come as rows with `otherId`
      // matching a master row; custom rows come as `otherId == null` with
      // `customText` + `descriptionType`. Split them into the master
      // checklist and the three custom buckets.
      if (data.packageOthersDTOList && Array.isArray(data.packageOthersDTOList)) {
        const backendRows = data.packageOthersDTOList;

        if (termsAndConditions.length > 0) {
          const mergedOthersList = termsAndConditions.map((term) => {
            const backendItem = backendRows.find(
              (backend) => backend.otherId === term.termsAndConditionsId
            );
            return {
              otherId: term.termsAndConditionsId,
              type: term.description,
              descriptionType: term.descriptionType,
              termsCode: term.termsCode,
              isDeleted: backendItem ? (backendItem.isDeleted === true || backendItem.isDeleted === "true") : true,
            };
          });
          setPackageOthersDTOList(mergedOthersList);
        }

        // Custom rows — bucketed by descriptionType (1/2/3).
        const customs = backendRows.filter((r) => !r.otherId && r.customText);
        setCustomInclusions(customs.filter((r) => r.descriptionType === 1).map((r) => ({
          customText: r.customText, descriptionType: 1, isDeleted: false,
        })));
        setCustomExclusions(customs.filter((r) => r.descriptionType === 2).map((r) => ({
          customText: r.customText, descriptionType: 2, isDeleted: false,
        })));
        setCustomTerms(customs.filter((r) => r.descriptionType === 3).map((r) => ({
          customText: r.customText, descriptionType: 3, isDeleted: false,
        })));
      } else {
        setCustomInclusions([]);
        setCustomExclusions([]);
        setCustomTerms([]);
      }
      setInclusionDraft("");
      setExclusionDraft("");
      setTermsDraft("");
      setActiveTab("basic");

      setValidationErrors({});
      setShowModal(true);
    } catch (error) {
      console.error("Error fetching package details:", error);
      toast.error("Failed to load package details");
    } finally {
      setIsLoading(false);
    }
  };


  const handleDelete = async (item) => {
    // console.log("Deleting item:", item);
    const result = await Swal.fire({
      title: "Are you sure?",
      text: `Do you want to delete "${item.packageName}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
    });

    if (result.isConfirmed) {
      try {
        setIsLoading(true);
        const response = await axiosInstance.delete(
          `/api/TravelPackage/${item.packageId}`
        );
        if (response.data) {
          toast.success("Package deleted successfully!");
          await fetchPackageList(page, search);
        }
      } catch (error) {
        console.error("Package delete error:", error);
        toast.error(`Failed to delete package: ${extractApiError(error)}`);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handlePackageRates = (item) => {
    // Navigate to Package Rates page
    // console.log("Navigating to Package Rates for package:", item);
    navigate("/package-rates", {
      state: {
        package: item,
        packageId: item.packageId,
        packageName: item.packageName,
        packageCode: item.packageCode,
      },
    });
  };

  const handleCopy = async (item) => {
    try {
      setIsLoading(true);

      // Prepare form data payload for the copy
      const formDataPayload = new FormData();

      // Basic package details with copied data
      formDataPayload.append("packageName", `${item.packageName} (Copy)`);
      formDataPayload.append("packageType", item.packageType || "");
      formDataPayload.append("packageCode", `${item.packageCode}_COPY`);
      formDataPayload.append("noOfNights", item.noOfNights || "1");
      formDataPayload.append("overview", item.overview || "");
      formDataPayload.append("packageBasicRate", item.packageBasicRate || "");
      formDataPayload.append("currencyId", item.currencyId || "");
      formDataPayload.append(
        "arriveCountry",
        item.arriveCountry || item.countryId || ""
      );

      // Arrive places as array of Long values
      const placeId =
        Array.isArray(item.arrivePlace) && item.arrivePlace.length > 0
          ? item.arrivePlace[0]
          : item.placeId || "";
      if (placeId) {
        formDataPayload.append("arrivePlace", placeId);
      }

      // Include flags as Integer values
      formDataPayload.append(
        "containHotel",
        item.containHotel === 1 || item.containHotel === true ? 1 : 0
      );
      formDataPayload.append(
        "containCab",
        item.containCab === 1 || item.containCab === true ? 1 : 0
      );
      formDataPayload.append(
        "containActivity",
        item.containActivity === 1 || item.containActivity === true ? 1 : 0
      );

      // Package categories as array with proper indexing
      if (item.packageCategory && Array.isArray(item.packageCategory)) {
        item.packageCategory.forEach((category, index) => {
          formDataPayload.append(`packageCategory[${index}]`, String(category));
        });
      }

      // Package itinerary with proper structure (without images for copy)
      if (
        item.packageItinearyDTOList &&
        Array.isArray(item.packageItinearyDTOList)
      ) {
        item.packageItinearyDTOList.forEach((itinerary, index) => {
          formDataPayload.append(
            `packageItinearyDTOList[${index}].day`,
            itinerary.day
          );
          formDataPayload.append(
            `packageItinearyDTOList[${index}].heading`,
            itinerary.heading || ""
          );
          formDataPayload.append(
            `packageItinearyDTOList[${index}].placeId`,
            itinerary.placeId || ""
          );
          formDataPayload.append(
            `packageItinearyDTOList[${index}].dayActivities`,
            itinerary.dayActivities || ""
          );
          // No image for copy - user needs to select new images
        });
      }

      // Package others with proper structure
      if (
        item.packageOthersDTOList &&
        Array.isArray(item.packageOthersDTOList)
      ) {
        item.packageOthersDTOList.forEach((other, index) => {
          formDataPayload.append(
            `packageOthersDTOList[${index}].otherId`,
            other.otherId
          );
          formDataPayload.append(
            `packageOthersDTOList[${index}].type`,
            other.type || ""
          );
          formDataPayload.append(
            `packageOthersDTOList[${index}].isDeleted`,
            other.isDeleted === true || other.isDeleted === "true"
              ? "true"
              : "false"
          );
        });
      }

      // No package image for copy - user needs to select new image

      console.log("package copy payload::", formDataPayload);

      // Create new package
      const packageCopyRes = await axiosInstance.post(
        "/api/TravelPackage/save",
        formDataPayload,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      if (packageCopyRes.data) {
        toast.success("Package copied successfully!");
        await fetchPackageList(page, search); // Refresh the list
      } else {
        toast.error("Failed to copy package!!");
      }
    } catch (error) {
      console.error("Package copy error:", error);
      toast.error(`Copy failed: ${extractApiError(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Policy Details: Validity + Cancellation Policy handlers.
  // Mirrors the hotel-policy edit page so behaviour matches what an
  // agent already knows from /hotel-actions/{id}/hotel-policy/{id}/edit.
  const normalisePolicyDateTime = (value) => {
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
    const date = new Date(value);
    if (isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
  };

  const getMinValidityToDate = (fromDate) => {
    if (!fromDate) return "";
    const date = new Date(fromDate);
    if (isNaN(date.getTime())) return "";
    date.setMinutes(date.getMinutes() + 1);
    return date.toISOString().slice(0, 16);
  };

  const addValidity = () => {
    setPackageValidityDTOList([
      ...packageValidityDTOList,
      { validityFrom: "", validityTo: "" },
    ]);
  };

  const removeValidity = (index) => {
    if (packageValidityDTOList.length > 1) {
      setPackageValidityDTOList(
        packageValidityDTOList.filter((_, i) => i !== index)
      );
    }
  };

  const updateValidity = (index, field, value) => {
    setPackageValidityDTOList(
      packageValidityDTOList.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  };

  const addCancellation = () => {
    setPackageCancellationPolicyDTOList([
      ...packageCancellationPolicyDTOList,
      { cancellationFee: "", cancellationFeeType: "PERCENT", noOfNights: "" },
    ]);
  };

  const removeCancellation = (index) => {
    if (packageCancellationPolicyDTOList.length > 1) {
      setPackageCancellationPolicyDTOList(
        packageCancellationPolicyDTOList.filter((_, i) => i !== index)
      );
    }
  };

  const updateCancellation = (index, field, value) => {
    setPackageCancellationPolicyDTOList(
      packageCancellationPolicyDTOList.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  };

  // Itinerary management functions
  const addItineraryDay = () => {
    const newDay = packageItinearyDTOList.length + 1;
    setPackageItinearyDTOList([
      ...packageItinearyDTOList,
      {
        day: newDay,
        heading: "",
        placeId: "",
        dayActivities: "",
        packageItinearyImage: null,
      },
    ]);

    // Clear itinerary validation error when user adds a new day
    if (validationErrors.itinerary) {
      setValidationErrors((prev) => ({ ...prev, itinerary: undefined }));
    }
  };

  const removeItineraryDay = (index) => {
    if (packageItinearyDTOList.length > 1) {
      const updatedItinerary = packageItinearyDTOList.filter(
        (_, i) => i !== index
      );
      // Renumber the days
      const renumberedItinerary = updatedItinerary.map((item, i) => ({
        ...item,
        day: i + 1,
      }));
      setPackageItinearyDTOList(renumberedItinerary);
    }
  };

  const updateItineraryDay = (index, field, value) => {
    const updatedItinerary = packageItinearyDTOList.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    );
    setPackageItinearyDTOList(updatedItinerary);

    // Clear itinerary validation error when user enters data
    if (validationErrors.itinerary) {
      setValidationErrors((prev) => ({ ...prev, itinerary: undefined }));
    }
  };

  const handleItineraryImageUpload = (index, file) => {
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size should be less than 5MB");
        return;
      }
      // Validate file type
      if (!file.type.startsWith("image/")) {
        toast.error("Please select a valid image file");
        return;
      }
      updateItineraryDay(index, "packageItinearyImage", file);
    }
  };

  // Shared renderer for the Inclusions / Exclusions / Terms sections.
  // Each section is: master checklist (fetched from termsAndCondition
  // API + bucketed by descriptionType) + Add-a-custom-entry textarea +
  // list of the user's already-added custom rows with Remove buttons.
  // Kept as one helper so all three sections stay visually consistent.
  const renderOthersBucket = ({
    bucketType,        // 1 = Inclusion, 2 = Exclusion, 3 = Terms
    heading,
    emptyText,
    customList,
    setCustomList,
    draft,
    setDraft,
    addPlaceholder,
  }) => {
    const masterRows = packageOthersDTOList.filter(
      (other) => other.descriptionType === bucketType
    );

    const clearOthersError = () => {
      if (validationErrors.others) {
        setValidationErrors((prev) => ({ ...prev, others: undefined }));
      }
    };

    const addCustom = () => {
      const text = (draft || "").trim();
      if (!text) {
        toast.error("Please type something before adding");
        return;
      }
      setCustomList([
        ...customList,
        { customText: text, descriptionType: bucketType, isDeleted: false },
      ]);
      setDraft("");
      clearOthersError();
    };

    const removeCustom = (idx) => {
      setCustomList(customList.filter((_, i) => i !== idx));
    };

    const updateCustom = (idx, text) => {
      setCustomList(
        customList.map((row, i) =>
          i === idx ? { ...row, customText: text } : row
        )
      );
    };

    return (
      <>
        {validationErrors.others && (
          <div className="alert alert-danger mb-3">
            <i className="fas fa-exclamation-triangle me-2"></i>
            {validationErrors.others}
          </div>
        )}
        <h6 className="fw-bold mb-3">{heading}</h6>

        {/* Master checklist — same behaviour as before: tick a row to
            keep it on the package, untick to soft-delete.
            Hidden for ALL three sections (Inclusions, Exclusions, and
            Terms & Conditions) per client request. Kept in code (not
            deleted) so it can be reinstated later by flipping the
            condition below back to `true` or `bucketType === 3`. */}
        {false && (
          <div className="mb-3" style={{ maxHeight: "260px", overflowY: "auto" }}>
            {isLoadingTerms ? (
              <div className="text-center text-muted">Loading...</div>
            ) : masterRows.length === 0 ? (
              <div className="text-muted small">{emptyText}</div>
            ) : (
              masterRows.map((other, index) => (
                <FormCheck
                  key={other.otherId}
                  type="checkbox"
                  label={other.type || `${heading} ${index + 1}`}
                  checked={!other.isDeleted}
                  onChange={(e) => {
                    const updated = packageOthersDTOList.map((item) =>
                      item.otherId === other.otherId
                        ? { ...item, isDeleted: !e.target.checked }
                        : item
                    );
                    setPackageOthersDTOList(updated);
                    clearOthersError();
                  }}
                  disabled={isViewMode}
                />
              ))
            )}
          </div>
        )}

        {/* Admin-defined "Standard Package Details" (mandatory master
            terms) for the selected country, bucketed by descriptionType.
            READ-ONLY — the backend re-attaches these on save/edit so a
            supplier cannot remove or alter them here. Rendered only when
            there are rows for THIS bucket so empty tabs stay clean. */}
        {(() => {
          const standardsForBucket = (mandatoryStandards || []).filter(
            (s) => s.descriptionType === bucketType
          );
          if (standardsForBucket.length === 0) return null;
          return (
            <div
              className="mb-3 p-3 rounded border"
              style={{ backgroundColor: "#f8fafc", borderColor: "#dbe4ef" }}
            >
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className="badge bg-secondary">Set by Admin</span>
                <span className="fw-semibold small text-muted">
                  Standard {heading} — auto-included on every package for the selected country
                </span>
              </div>
              {isLoadingMandatory ? (
                <div className="text-muted small">Loading standard {heading.toLowerCase()}…</div>
              ) : (
                <ul className="mb-0 ps-3">
                  {standardsForBucket.map((s) => (
                    <li
                      key={`std-${bucketType}-${s.termsAndConditionsId}`}
                      className="small text-dark"
                      title={s.termsCode || ""}
                    >
                      {s.description}
                      {s.termsCode ? (
                        <span className="text-muted ms-2">({s.termsCode})</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })()}

        {/* Custom entries — visible in view mode too so users can see
            what a package contains, but only editable when not viewing.
            The "Custom {heading} (N)" title and the "No custom entries
            added yet." empty-state line are hidden for ALL three
            sections (Inclusions, Exclusions, and Terms & Conditions)
            per client request. Kept in code (not deleted) so they can
            be reinstated later by flipping the conditions below. */}
        <div className="border-top pt-3 mt-3">
          {false && (
            <div className="fw-semibold small mb-2">
              Custom {heading} ({customList.length})
            </div>
          )}
          {false && customList.length === 0 && (
            <div className="text-muted small mb-2">
              No custom entries added yet.
            </div>
          )}
          {customList.map((row, idx) => (
            <div key={idx} className="mb-2 d-flex gap-2">
              <Form.Control
                as="textarea"
                rows={4}
                style={{ resize: "vertical", minHeight: "90px" }}
                value={row.customText}
                onChange={(e) => updateCustom(idx, e.target.value)}
                disabled={isViewMode}
                placeholder={`Custom ${heading.toLowerCase()} #${idx + 1}`}
              />
              {!isViewMode && (
                <Button
                  variant="outline-danger"
                  size="sm"
                  onClick={() => removeCustom(idx)}
                  title="Remove"
                  style={{ height: "38px", alignSelf: "flex-start" }}
                >
                  <FaTrash />
                </Button>
              )}
            </div>
          ))}

          {/* Add-new textarea — 6 rows by default and resizable, so a
              user can comfortably paste in a 15-20 line clause before
              clicking Add. */}
          {!isViewMode && (
            <div className="mt-2">
              <Form.Control
                as="textarea"
                rows={6}
                style={{ resize: "vertical", minHeight: "140px" }}
                placeholder={addPlaceholder}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="d-flex justify-content-between align-items-center mt-2">
                <small className="text-muted">
                  {(draft || "").length} characters
                </small>
                <Button
                  size="sm"
                  variant="outline-primary"
                  onClick={addCustom}
                  disabled={!draft || !draft.trim()}
                >
                  <FaPlus className="me-1" /> Add {heading.replace(/s$/, "")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </>
    );
  };

  // Wizard navigation — Next/Previous move through TAB_ORDER; Confirm
  // (Create / Update) is only enabled on the final tab. Also validates
  // Basic Details before allowing Next off the first tab, so users can't
  // silently paper over required fields.
  const currentTabIdx = TAB_ORDER.indexOf(activeTab);
  const isFirstTab = currentTabIdx <= 0;
  const isLastTab = currentTabIdx === TAB_ORDER.length - 1;
  const goPrevTab = () => {
    if (!isFirstTab) setActiveTab(TAB_ORDER[currentTabIdx - 1]);
  };
  const goNextTab = () => {
    // Light per-tab guardrails: on Basic Details, warn if the required
    // fields aren't filled but still let the user proceed (final submit
    // enforces). On other tabs just advance.
    if (activeTab === "basic") {
      const errs = validateForm(formData);
      const basicKeys = [
        "packageName", "packageCode", "packageType", "packageCategory",
        "countryId", "placeId", "noOfNights",
      ];
      const basicErrs = Object.fromEntries(
        Object.entries(errs).filter(([k]) => basicKeys.includes(k))
      );
      if (Object.keys(basicErrs).length > 0) {
        setValidationErrors((prev) => ({ ...prev, ...basicErrs }));
        toast.error("Please fill required fields in Basic Details before continuing.");
        return;
      }
    }
    if (!isLastTab) setActiveTab(TAB_ORDER[currentTabIdx + 1]);
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          {/* Back to the signed-in user's dashboard — top-left, above the page card */}
          <div className="mb-3">
            <Button
              variant="outline-secondary"
              onClick={() => DashboardRedirections((localStorage.getItem("currentActiveRole") || "").trim().toUpperCase(), navigate)}
              className="d-inline-flex align-items-center gap-2 rounded-pill px-3 py-2"
            >
              <FaArrowLeft />
              Back
            </Button>
          </div>

          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <div>
                {/* <Button
                  variant="outline-primary"
                  onClick={() => navigate(-1)}
                  className="mb-2 me-3"
                  size="sm"
                >
                  <FaBackward className="me-2" />
                  Back to Registration
                </Button> */}
                <span className="fw-semibold">
                  <FaPlus className="me-2 text-success" />
                  Packages
                </span>
              </div>
              <Button className="btn-green" onClick={handleCreate}>
                + Create
              </Button>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>S/N</th>
                    <th>Package Name</th>
                    <th>Package Code</th>
                    {/* <th>Basic Rate</th> */}
                    <th>No of Nights</th>
                    <th>Status</th>
                    <th style={{ width: 380 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {console.log("items list:::package cat::", items)}
                  {items.map((item, index) => (
                    <tr key={item.packageId}>
                      <td>{index + 1 + page * 10}</td>
                      <td>{item.packageName || "N/A"}</td>
                      <td>{item.packageCode || "N/A"}</td>
                      {/* <td>{item.packageBasicRate || "N/A"}</td> */}
                      <td>{item.noOfNights || "N/A"}</td>
                      <td>
                        <span
                          className={`badge ${item.liveStatus === true
                              ? "bg-success"
                              : "bg-danger"
                            }`}
                          style={{ cursor: "pointer" }}
                          onClick={() => handleStatusToggle(item)}
                          title={`Click to ${item.liveStatus === true ? "deactivate" : "activate"} package`}
                        >
                          {item.liveStatus === true ? "Active" : "InActive"}
                        </span>
                      </td>
                      <td>
                        {/* Action row: compact icon-only buttons so five
                            controls fit on a single line at typical table
                            widths (View / Edit / Copy / Rates / Delete).
                            Tooltip via `title` keeps the label discoverable
                            on hover. Same onClick handlers as before. */}
                        <div className="d-flex flex-nowrap gap-1">
                          <Button
                            size="sm"
                            variant="outline-info"
                            className="view p-1 lh-1"
                            onClick={() =>
                              navigate(`/registration/package/view/${item.packageId}`)
                            }
                            title="View"
                          >
                            <FaEye />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-primary"
                            className="edit p-1 lh-1"
                            onClick={() => fetchAndShowDetail(item, false)}
                            title="Edit"
                          >
                            <FaEdit />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-warning"
                            className="copy p-1 lh-1"
                            onClick={() => handleCopy(item)}
                            title="Copy"
                          >
                            <FaCopy />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-success"
                            className="p-1 lh-1"
                            onClick={() => handlePackageRates(item)}
                            title="Package Rates"
                          >
                            <FaDollarSign />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-danger"
                            className="delete p-1 lh-1"
                            onClick={() => handleDelete(item)}
                            title="Delete"
                          >
                            <FaTrash />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {isLoading && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        <div
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        >
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        Loading available packages ....
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        No packages found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center p-3 border-top">
                  <div>
                    <small className="text-muted">
                      Showing {items.length} of {totalPages * 10} Transfer providers
                    </small>
                  </div>
                  <div>
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={page === 0}
                        onClick={() => fetchPackageList(page - 1, search)}
                      />
                      {[...Array(totalPages).keys()].map((num) => (
                        <Pagination.Item
                          key={num}
                          active={num === page}
                          onClick={() => fetchPackageList(num, search)}
                        >
                          {num + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={page === totalPages - 1}
                        onClick={() => fetchPackageList(page + 1, search)}
                      />
                    </Pagination>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>

          <Modal
            show={showModal}
            onHide={closeModal}
            centered
            size="xl"
            backdrop="static"
            keyboard={false}
            enforceFocus={false}
            restoreFocus={false}
          >
            <Modal.Header closeButton>
              <Modal.Title>
                {isViewMode
                  ? "View Package Details"
                  : editing
                    ? "Edit Package"
                    : "Create Package"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {/*
                Cross-tab validation summary — visible regardless of which
                tab the user is on. The original UI only rendered the
                "itinerary" / "others" error messages inside their own tab
                panels, so a user clicking Create from the Basic Details
                tab saw nothing and thought the form was silently broken.
                This block surfaces *all* validation errors at the top.
              */}
              {/* {Object.keys(validationErrors).some((k) => validationErrors[k]) && (
                <div className="alert alert-danger mb-3" role="alert">
                  <div className="fw-semibold mb-1">
                    <i className="fas fa-exclamation-triangle me-2"></i>
                    Please fix the following before saving:
                  </div>
                  <ul className="mb-0 ps-3">
                    {validationErrors.packageName && (
                      <li><strong>Basic Details:</strong> {validationErrors.packageName}</li>
                    )}
                    {validationErrors.packageCode && (
                      <li><strong>Basic Details:</strong> {validationErrors.packageCode}</li>
                    )}
                    {validationErrors.packageType && (
                      <li><strong>Basic Details:</strong> {validationErrors.packageType}</li>
                    )}
                    {validationErrors.packageCategory && (
                      <li><strong>Basic Details:</strong> {validationErrors.packageCategory}</li>
                    )}
                    {validationErrors.countryId && (
                      <li><strong>Basic Details:</strong> {validationErrors.countryId}</li>
                    )}
                    {validationErrors.placeId && (
                      <li><strong>Basic Details:</strong> {validationErrors.placeId}</li>
                    )}
                    {validationErrors.noOfNights && (
                      <li><strong>Basic Details:</strong> {validationErrors.noOfNights}</li>
                    )}
                    {validationErrors.itinerary && (
                      <li>{validationErrors.itinerary}</li>
                    )}
                    {validationErrors.others && (
                      <li><strong>Others tab:</strong> {validationErrors.others}</li>
                    )}
                  </ul>
                </div>
              )} */}
              <Tabs
                activeKey={activeTab}
                onSelect={(k) => k && setActiveTab(k)}
                id="package-tabs"
                className="mb-3"
              >
                <Tab
                  eventKey="basic"
                  title={
                    <span>
                      Basic Details
                      {(validationErrors.packageName ||
                        validationErrors.packageCode ||
                        validationErrors.packageType ||
                        validationErrors.packageCategory ||
                        validationErrors.countryId ||
                        validationErrors.placeId ||
                        validationErrors.noOfNights) && (
                        <span className="text-danger ms-1" title="Has errors">!</span>
                      )}
                    </span>
                  }
                >
                  <Form onSubmit={handleSave}>
                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>
                            Package Name <span className="text-danger">*</span>
                          </Form.Label>
                          <Form.Control
                            type="text"
                            placeholder="Enter package name"
                            value={formData.packageName}
                            isInvalid={!!validationErrors.packageName}
                            {...getFormControlProps(
                              "packageName",
                              (e) => {
                                setFormData((prev) => ({
                                  ...prev,
                                  packageName: e.target.value,
                                }));
                                if (validationErrors.packageName) {
                                  setValidationErrors((prev) => ({
                                    ...prev,
                                    packageName: undefined,
                                  }));
                                }
                              },
                              {
                                className: `form-input ${validationErrors.packageName
                                    ? "is-invalid"
                                    : ""
                                  }`,
                                autoFocus: true,
                              }
                            )}
                          />
                          {validationErrors.packageName && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.packageName}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>
                            Package Code <span className="text-danger">*</span>
                          </Form.Label>
                          <Form.Control
                            type="text"
                            placeholder="Enter package code"
                            value={formData.packageCode}
                            onChange={(e) => {
                              setFormData((prev) => ({
                                ...prev,
                                packageCode: e.target.value,
                              }));
                              if (validationErrors.packageCode) {
                                setValidationErrors((prev) => ({
                                  ...prev,
                                  packageCode: undefined,
                                }));
                              }
                            }}
                            isInvalid={!!validationErrors.packageCode}
                          />
                          {validationErrors.packageCode && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.packageCode}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                        {/* Currency + Package Basic Rate fields were hidden
                            per client request — the backend columns are
                            preserved (see prepareFormDataPayload) but the
                            user no longer picks either here; rates live on
                            the Package Rates screen. */}
                        <Form.Group className="mb-3">
                          <Form.Label>
                            Package Type <span className="text-danger">*</span>
                          </Form.Label>
                          <Form.Select
                            value={formData.packageType}
                            onChange={(e) => {
                              setFormData((prev) => ({
                                ...prev,
                                packageType: e.target.value,
                              }));
                              if (validationErrors.packageType) {
                                setValidationErrors((prev) => ({
                                  ...prev,
                                  packageType: undefined,
                                }));
                              }
                            }}
                            isInvalid={!!validationErrors.packageType}
                          >
                            <option value="">SELECT</option>
                            {isLoadingPackageTypes ? (
                              <option disabled>Loading...</option>
                            ) : (
                              packageTypes.map((type) => (
                                <option
                                  key={type.packageTypeId}
                                  value={type.packageTypeId}
                                >
                                  {type.name}
                                </option>
                              ))
                            )}
                          </Form.Select>
                          {validationErrors.packageType && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.packageType}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>
                            Occupancy Type{" "}
                            <span className="text-danger">*</span>
                          </Form.Label>
                          <div className="position-relative">
                            <Form.Control
                              type="text"
                              value={
                                formData.packageCategory.length > 0
                                  ? `${formData.packageCategory.length} category(ies) selected`
                                  : "Select Package Categories"
                              }
                              onClick={() => {
                                if (!isViewMode) {
                                  setPackageCategoryDropdownOpen(!packageCategoryDropdownOpen);
                                }
                              }}
                              readOnly
                              className={`form-input pe-5 ${validationErrors.packageCategory ? "is-invalid" : ""} ${isViewMode ? "bg-light" : ""}`}
                              style={{ cursor: isViewMode ? "default" : "pointer" }}
                              placeholder="Select Package Categories"
                            />
                            <div
                              className="position-absolute end-0 top-50 translate-middle-y pe-3"
                              style={{ pointerEvents: "none" }}
                            >
                              <FaChevronDown className="text-muted small" />
                            </div>

                            {packageCategoryDropdownOpen && !isViewMode && (
                              <div
                                className="position-absolute w-100 bg-white border border-top-0 rounded-bottom shadow-lg"
                                style={{
                                  zIndex: 1050,
                                  maxHeight: "200px",
                                  overflowY: "auto",
                                  top: "100%",
                                }}
                              >
                                {packageCategories.length > 0 ? (
                                  packageCategories.map((pkgCat) => {
                                    const isSelected = formData.packageCategory.includes(pkgCat.packageCategoryId);
                                    return (
                                      <div
                                        key={pkgCat.packageCategoryId}
                                        className="px-3 py-2"
                                        style={{
                                          cursor: "pointer",
                                          borderBottom: "1px solid #eee",
                                          backgroundColor: isSelected ? "#e3f2fd" : "white",
                                        }}
                                        onMouseEnter={(e) => {
                                          if (!isSelected) {
                                            e.target.style.backgroundColor = "#f8f9fa";
                                          }
                                        }}
                                        onMouseLeave={(e) => {
                                          if (!isSelected) {
                                            e.target.style.backgroundColor = "white";
                                          }
                                        }}
                                        onClick={() => {
                                          setFormData((prev) => {
                                            const newCategories = isSelected
                                              ? prev.packageCategory.filter(id => id !== pkgCat.packageCategoryId)
                                              : [...prev.packageCategory, pkgCat.packageCategoryId];

                                            return {
                                              ...prev,
                                              packageCategory: newCategories,
                                            };
                                          });

                                          // Clear validation error when user makes selection
                                          if (validationErrors.packageCategory) {
                                            setValidationErrors((prev) => ({
                                              ...prev,
                                              packageCategory: undefined,
                                            }));
                                          }
                                        }}
                                      >
                                        <div className="d-flex align-items-center justify-content-between">
                                          <div className="d-flex flex-column">
                                            <span>{pkgCat.name}</span>
                                            {/* Detail line — only renders when at least one of the
                                                optional fields was set on the master record. */}
                                            {(pkgCat.adults != null || pkgCat.children != null || pkgCat.childAge || pkgCat.occupancy != null) && (
                                              <small className="text-muted">
                                                {pkgCat.adults != null && <>{pkgCat.adults} Adult{pkgCat.adults === 1 ? "" : "s"}</>}
                                                {pkgCat.adults != null && pkgCat.children != null && " + "}
                                                {pkgCat.children != null && <>{pkgCat.children} Child{pkgCat.children === 1 ? "" : "ren"}</>}
                                                {pkgCat.childAge && (
                                                  <> {(pkgCat.adults != null || pkgCat.children != null) ? "•" : ""} Child Age: {pkgCat.childAge}</>
                                                )}
                                                {pkgCat.occupancy != null && (
                                                  <> {(pkgCat.adults != null || pkgCat.children != null || pkgCat.childAge) ? "•" : ""} Occupancy: {pkgCat.occupancy}</>
                                                )}
                                              </small>
                                            )}
                                          </div>
                                          {isSelected && (
                                            <span className="text-primary">✓</span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="px-3 py-2 text-muted">No categories available</div>
                                )}
                              </div>
                            )}

                            {/* Overlay to close dropdown when clicking outside */}
                            {packageCategoryDropdownOpen && (
                              <div
                                className="position-fixed"
                                style={{
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  zIndex: 1040,
                                }}
                                onClick={() => setPackageCategoryDropdownOpen(false)}
                              />
                            )} 
                          </div>
                          {validationErrors.packageCategory && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.packageCategory}
                            </Form.Control.Feedback>
                          )}
                          {formData.packageCategory.length > 0 && (
                            <div className="mt-2">
                              <small className="text-muted">
                                Selected: {formData.packageCategory.map(id => {
                                  const category = packageCategories.find(cat => cat.packageCategoryId === id);
                                  return category ? category.name : `ID: ${id}`;
                                }).join(", ")}
                              </small>
                              {/* Category detail summary for each selected category. Only renders
                                  rows for categories that actually have any of the optional fields
                                  configured on the master record — keeps the UI clean for legacy
                                  categories. */}
                              {(() => {
                                const detailed = formData.packageCategory
                                  .map(id => packageCategories.find(cat => cat.packageCategoryId === id))
                                  .filter(cat => cat && (cat.adults != null || cat.children != null || cat.childAge || cat.occupancy != null));
                                if (detailed.length === 0) return null;
                                return (
                                  <div className="mt-2 p-2 border rounded bg-light">
                                    <div className="fw-semibold small mb-1">Category Details</div>
                                    {detailed.map(cat => (
                                      <div key={cat.packageCategoryId} className="small text-muted">
                                        <strong>{cat.name}:</strong>{" "}
                                        {cat.adults != null && <>{cat.adults} Adult{cat.adults === 1 ? "" : "s"}</>}
                                        {cat.adults != null && cat.children != null && " + "}
                                        {cat.children != null && <>{cat.children} Child{cat.children === 1 ? "" : "ren"}</>}
                                        {cat.childAge && (
                                          <> {(cat.adults != null || cat.children != null) ? "•" : ""} Child Age: {cat.childAge}</>
                                        )}
                                        {cat.occupancy != null && (
                                          <> {(cat.adults != null || cat.children != null || cat.childAge) ? "•" : ""} Occupancy: {cat.occupancy}</>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>Package Image</Form.Label>
                          <Form.Control
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              // Guardrails matching the itinerary image
                              // uploader so the backend never sees a file
                              // bigger than what our multipart config
                              // accepts (5MB is a safe common ceiling).
                              if (file.size > 5 * 1024 * 1024) {
                                toast.error(
                                  `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)}MB — max is 5MB.`
                                );
                                e.target.value = "";
                                return;
                              }
                              if (!file.type.startsWith("image/")) {
                                toast.error("Please select a valid image file");
                                e.target.value = "";
                                return;
                              }
                              setFormData((prev) => ({
                                ...prev,
                                packageImage: file,
                              }));
                            }}
                            disabled={isViewMode}
                          />
                          {/* Show existing image preview when editing */}
                          {formData.packageImage &&
                            typeof formData.packageImage === "string" && (
                              <div className="mt-2">
                                <small className="text-muted">
                                  Current Image:
                                </small>
                                <div className="mt-1">
                                  <img
                                    src={getImageUrl(formData.packageImage)}
                                    alt="Package preview"
                                    style={{
                                      maxWidth: "200px",
                                      maxHeight: "150px",
                                      objectFit: "cover",
                                    }}
                                    className="border rounded"
                                    onLoad={(e) => {
                                      console.log("Package image loaded successfully:", e.target.src);
                                    }}
                                    onError={(e) => {
                                      console.log("Package image load error:");
                                      console.log("Original path:", formData.packageImage);
                                      console.log("Constructed URL:", e.target.src);
                                      console.log("Error details:", e);
                                      e.target.style.display = "none";
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          {/* Show new image preview when file is selected */}
                          {formData.packageImage &&
                            typeof formData.packageImage === "object" && (
                              <div className="mt-2">
                                <small className="text-muted">
                                  Selected: {formData.packageImage.name}
                                </small>
                                <div className="mt-1">
                                  <img
                                    src={URL.createObjectURL(
                                      formData.packageImage
                                    )}
                                    alt="Package preview"
                                    style={{
                                      maxWidth: "200px",
                                      maxHeight: "150px",
                                      objectFit: "cover",
                                    }}
                                    className="border rounded"
                                  />
                                </div>
                              </div>
                            )}
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>Include</Form.Label>
                          <FormCheck
                            type="checkbox"
                            label="Hotel"
                            checked={formData.containHotel}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                containHotel: e.target.checked,
                              }))
                            }
                          />
                          <FormCheck
                            type="checkbox"
                            label="Transfer"
                            checked={formData.containCab}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                containCab: e.target.checked,
                              }))
                            }
                          />
                          <FormCheck
                            type="checkbox"
                            label="Tours"
                            checked={formData.containActivity}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                containActivity: e.target.checked,
                              }))
                            }
                          />
                        </Form.Group>
                        {/* Status dropdown removed — package status is
                            toggled from the list row's Status badge. */}
                        <Form.Group className="mb-3">
                          <Form.Label>
                            Arriving Destination{" "}
                            <span className="text-danger">*</span>
                          </Form.Label>
                          <Select
                            options={Array.isArray(countries) ? countries.map(c => ({ value: c.id, label: c.name })) : []}
                            value={selectedCountryOption}
                            onChange={handleCountryChange}
                            onInputChange={(inputValue) => {
                              clearTimeout(countryDebounceRef.current);
                              countryDebounceRef.current = setTimeout(() => {
                                fetchCountries(inputValue);
                              }, 400);
                            }}
                            filterOption={() => true} // Server-side filtering
                            placeholder="Search and select country"
                            isSearchable
                            isClearable
                            isLoading={isCountryLoading}
                            readOnly={isViewMode}
                            isDisabled={isViewMode}
                            className={`react-select-container ${validationErrors.countryId ? "is-invalid" : ""}`}
                            classNamePrefix="react-select"
                          />
                          {validationErrors.countryId && (
                            <div className="text-danger small mt-1">
                              {validationErrors.countryId}
                            </div>
                          )}
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>
                            Arrive City <span className="text-danger">*</span>
                          </Form.Label>
                          <Form.Group className="mb-3">
                            <SearchableSelect
                              name="placeId"
                              value={formData.placeId}
                              onChange={handlePlaceChange}
                              onInputChange={(inputValue) => {
                                if (placeDebounceRef.current) {
                                  clearTimeout(placeDebounceRef.current);
                                }
                                placeDebounceRef.current = setTimeout(() => {
                                  if (formData.countryId) {
                                    cityList(formData.countryId, inputValue);
                                  }
                                }, 400);
                              }}
                              placeholder={
                                isLoadingPlaces
                                  ? "Loading places..."
                                  : "Search and select place"
                              }
                              options={
                                Array.isArray(places)
                                  ? places.map((place) => ({
                                    id: place.id,
                                    name: place.name || place.stateName,
                                  }))
                                  : []
                              }
                              isInvalid={!!validationErrors.placeId}
                              disabled={
                                isViewMode ||
                                !formData.countryId ||
                                isLoadingPlaces
                              }
                              isLoading={isLoadingPlaces}
                            />
                            {validationErrors.placeId && (
                              <Form.Control.Feedback type="invalid">
                                {validationErrors.placeId}
                              </Form.Control.Feedback>
                            )}
                          </Form.Group>
                        </Form.Group>

                        <Form.Group className="mb-3">
                          <Form.Label>Overview</Form.Label>
                          {/* Made rows 10 and vertically resizable so a
                              long overview (10-20 lines) is visible in the
                              field itself instead of being clipped to 4
                              rows. Users can drag the resize handle to
                              expand further if needed. Max cap is 10,000
                              characters (matches the TEXT column on the
                              backend and stops runaway paste). */}
                          {(() => {
                            const OVERVIEW_MAX = 10000;
                            const overviewLen = (formData.overview || "").length;
                            const overviewWords = (formData.overview || "")
                              .trim()
                              .split(/\s+/)
                              .filter(Boolean).length;
                            const nearCap = overviewLen > OVERVIEW_MAX * 0.9;
                            return (
                              <>
                                <Form.Control
                                  as="textarea"
                                  rows={10}
                                  style={{ resize: "vertical", minHeight: "200px" }}
                                  placeholder="Enter package overview"
                                  value={formData.overview}
                                  maxLength={OVERVIEW_MAX}
                                  onChange={(e) =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      overview: e.target.value.slice(0, OVERVIEW_MAX),
                                    }))
                                  }
                                />
                                <div className="d-flex justify-content-between mt-1">
                                  {/* <small className="text-muted">
                                    {overviewWords} words • drag corner to enlarge
                                  </small> */}
                                  <small className={nearCap ? "text-danger fw-semibold" : "text-muted"}>
                                    {overviewLen} / {OVERVIEW_MAX} characters
                                  </small>
                                </div>
                              </>
                            );
                          })()}
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>
                            No of nights <span className="text-danger">*</span>
                          </Form.Label>
                          <Form.Select
                            value={formData.noOfNights}
                            onChange={(e) => {
                              setFormData((prev) => ({
                                ...prev,
                                noOfNights: e.target.value,
                              }));
                              if (validationErrors.noOfNights) {
                                setValidationErrors((prev) => ({
                                  ...prev,
                                  noOfNights: undefined,
                                }));
                              }
                            }}
                            isInvalid={!!validationErrors.noOfNights}
                          >
                            {[...Array(15)].map((_, i) => (
                              <option key={i + 1} value={i + 1}>
                                {i + 1}
                              </option>
                            ))}
                          </Form.Select>
                          {validationErrors.noOfNights && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.noOfNights}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                      </Col>
                    </Row>
                  </Form>
                </Tab>

                <Tab
                  eventKey="itinerary"
                  title={
                    <span>
                      Itinerary
                      {validationErrors.itinerary && (
                        <span className="text-danger ms-1" title="Has errors">!</span>
                      )}
                    </span>
                  }
                >
                  {/* Sticky header — keeps the Add Day button visible
                      while the user scrolls through many day cards, so
                      they never have to scroll back to the top of the
                      tab to add another day. */}
                  <div
                    className="d-flex justify-content-between align-items-center mb-3 py-2 bg-white"
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 5,
                      borderBottom: "1px solid #e0e0e0",
                    }}
                  >
                    <h6 className="mb-0">Itinerary Details</h6>
                    {!isViewMode && (
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={addItineraryDay}
                      >
                        <FaPlus className="me-2" />
                        Add Day
                      </Button>
                    )}
                  </div>
                  {console.log("packageItinearyDTOList::" , packageItinearyDTOList)}
                  {packageItinearyDTOList.map((day, index) => (
                    <Card key={index} className="mb-3">
                      <Card.Header className="d-flex justify-content-between align-items-center">
                        <h6 className="mb-0">Day {day.day}</h6>
                        {/* Card only carries Remove — Add Day lives in
                            the sticky header at the top of the tab so a
                            single, always-visible button covers every
                            card without duplication. */}
                        {packageItinearyDTOList.length > 1 && (
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => removeItineraryDay(index)}
                          >
                            <FaTrash className="me-1" />
                            Remove
                          </Button>
                        )}
                      </Card.Header>
                      <Card.Body>
                        <Row>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>Place</Form.Label>
                              {/* Searches the country's full City list in
                                  the browser — no server call per keystroke,
                                  so the field never disables itself (and
                                  drops focus) while the user is typing. */}
                              <SearchableSelect
                                name={`placeId_${index}`}
                                value={day.placeId}
                                onChange={(e) =>
                                  updateItineraryDay(
                                    index,
                                    "placeId",
                                    e.target.value
                                  )
                                }
                                placeholder={
                                  !formData.countryId
                                    ? "Select Arriving Destination in Basic Details first"
                                    : isLoadingPlaces && itineraryPlaces.length === 0
                                      ? "Loading places..."
                                      : "Search and select destination"
                                }
                                options={
                                  Array.isArray(itineraryPlaces)
                                    ? itineraryPlaces.map((place) => ({
                                      id: place.id,
                                      name: place.name || place.stateName,
                                    }))
                                    : []
                                }
                                disabled={isViewMode || !formData.countryId}
                                isLoading={isLoadingPlaces && itineraryPlaces.length === 0}
                              />
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              {/* Dynamic label: "Heading of Day 01",
                                  "Heading of Day 02" — matches the day
                                  number shown in the card header so users
                                  always know which day this heading is
                                  for. Day is zero-padded to 2 digits. */}
                              <Form.Label>
                                Heading of Day {String(day.day).padStart(2, "0")}
                              </Form.Label>
                              <Form.Control
                                type="text"
                                placeholder={`Enter heading for Day ${String(day.day).padStart(2, "0")}`}
                                value={day.heading}
                                onChange={(e) =>
                                  updateItineraryDay(
                                    index,
                                    "heading",
                                    e.target.value
                                  )
                                }
                              />
                            </Form.Group>
                          </Col>
                        </Row>
                        <Row>
                          {/* Day Activities takes the full row now (md=12)
                              so 15-20 lines of activity text is readable
                              inside the field. Rows raised to 8 and the
                              user can drag-resize vertically. */}
                          <Col md={12}>
                            <Form.Group className="mb-3">
                              <Form.Label>Day Activities</Form.Label>
                              <Form.Control
                                as="textarea"
                                rows={8}
                                style={{ resize: "vertical", minHeight: "180px" }}
                                placeholder="Enter day activities (use multiple lines for a detailed itinerary)"
                                value={day.dayActivities}
                                onChange={(e) =>
                                  updateItineraryDay(
                                    index,
                                    "dayActivities",
                                    e.target.value
                                  )
                                }
                              />
                              <small className="text-muted">
                                {(day.dayActivities || "").length} characters
                              </small>
                            </Form.Group>
                          </Col>
                        </Row>
                        <Row>
                          <Col md={12}>
                            <Form.Group className="mb-3">
                              <Form.Label>Day Image</Form.Label>
                              <Form.Control
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                  handleItineraryImageUpload(
                                    index,
                                    e.target.files[0]
                                  )
                                }
                                disabled={isViewMode}
                              />
                              {day.packageItinearyImage && (
                                <div className="mt-2">
                                  <small className="text-muted">
                                    {typeof day.packageItinearyImage ===
                                      "object"
                                      ? `Selected: ${day.packageItinearyImage.name}`
                                      : "Current Image:"}
                                  </small>
                                  <div className="mt-1">
                                    <img
                                      src={
                                        typeof day.packageItinearyImage === "object"
                                          ? URL.createObjectURL(day.packageItinearyImage)
                                          : getImageUrl(day.packageItinearyImage)
                                      }
                                      alt="Day preview"
                                      style={{
                                        maxWidth: "150px",
                                        maxHeight: "100px",
                                        objectFit: "cover",
                                      }}
                                      className="border rounded"
                                      onLoad={(e) => {
                                        console.log("Itinerary image loaded successfully:", e.target.src);
                                      }}
                                      onError={(e) => {
                                        console.log("Itinerary image load error:");
                                        console.log("Original path:", day.packageItinearyImage);
                                        console.log("Constructed URL:", e.target.src);
                                        console.log("Error details:", e);
                                        e.target.style.display = "none";
                                      }}
                                    />
                                  </div>
                                </div>
                              )}
                            </Form.Group>
                          </Col>
                        </Row>
                      </Card.Body>
                    </Card>
                  ))}
                </Tab>

                <Tab
                  eventKey="inclusions"
                  title={
                    <span>
                      Inclusions
                      {validationErrors.others && (
                        <span className="text-danger ms-1" title="Has errors">!</span>
                      )}
                    </span>
                  }
                >
                  {renderOthersBucket({
                    bucketType: 1,
                    heading: "Inclusions",
                    emptyText: "No master inclusions available",
                    customList: customInclusions,
                    setCustomList: setCustomInclusions,
                    draft: inclusionDraft,
                    setDraft: setInclusionDraft,
                    addPlaceholder:
                      "Type a custom inclusion (up to 20+ lines) and click Add",
                  })}
                </Tab>

                <Tab
                  eventKey="exclusions"
                  title={
                    <span>
                      Exclusions
                      {validationErrors.others && (
                        <span className="text-danger ms-1" title="Has errors">!</span>
                      )}
                    </span>
                  }
                >
                  {renderOthersBucket({
                    bucketType: 2,
                    heading: "Exclusions",
                    emptyText: "No master exclusions available",
                    customList: customExclusions,
                    setCustomList: setCustomExclusions,
                    draft: exclusionDraft,
                    setDraft: setExclusionDraft,
                    addPlaceholder:
                      "Type a custom exclusion (up to 20+ lines) and click Add",
                  })}
                </Tab>

                <Tab
                  eventKey="policyDetails"
                  title={
                    <span>
                      Policy Details
                      {validationErrors.others && (
                        <span className="text-danger ms-1" title="Has errors">!</span>
                      )}
                    </span>
                  }
                >
                  <div style={{ maxHeight: "500px", overflowY: "auto" }}>
                    {/* Validity List — uses the shared DateTimeApplyPicker
                        (same OK-gated calendar as the Occupancy & Minimum
                        Length page). normalisePolicyDateTime maps the
                        backend-shaped string into the "YYYY-MM-DDTHH:mm"
                        the picker consumes. */}
                    <div className="mb-4">
                      <h6 className="fw-bold text-dark mb-3">Validity List</h6>
                      {packageValidityDTOList.map((v, index) => (
                        <Row key={index} className="align-items-end mb-2 g-2">
                          <Col md={5}>
                            <Form.Label className="small text-secondary">
                              Validity From
                            </Form.Label>
                            <DateTimeApplyPicker
                              value={normalisePolicyDateTime(v.validityFrom)}
                              disabled={isViewMode}
                              onApply={(val) => {
                                updateValidity(index, "validityFrom", val);
                                // Clear Validity To if it is now on/before the new From
                                const to = packageValidityDTOList[index]?.validityTo;
                                if (to && val && new Date(normalisePolicyDateTime(to)) <= new Date(val)) {
                                  updateValidity(index, "validityTo", "");
                                }
                              }}
                            />
                          </Col>
                          <Col md={5}>
                            <Form.Label className="small text-secondary">
                              Validity Date Include
                            </Form.Label>
                            <DateTimeApplyPicker
                              value={normalisePolicyDateTime(v.validityTo)}
                              disabled={isViewMode}
                              minDate={
                                v.validityFrom
                                  ? parseLocalDateTime(normalisePolicyDateTime(v.validityFrom))
                                  : undefined
                              }
                              onApply={(val) => updateValidity(index, "validityTo", val)}
                            />
                          </Col>
                          <Col md={2} className="text-end">
                            {packageValidityDTOList.length > 1 && (
                              <Button
                                variant="outline-danger"
                                size="sm"
                                className="rounded-circle"
                                onClick={() => removeValidity(index)}
                                disabled={isViewMode}
                              >
                                <FaTrash />
                              </Button>
                            )}
                          </Col>
                        </Row>
                      ))}
                      {!isViewMode && (
                        <Button
                          size="sm"
                          variant="outline-primary"
                          className="mt-2"
                          onClick={addValidity}
                        >
                          <FaPlus className="me-1" /> Add Validity
                        </Button>
                      )}
                    </div>

                    {/* Cancellation Policy */}
                    <div className="border-top pt-4 mt-4">
                      <h6 className="fw-bold text-dark mb-3">Cancellation Policy</h6>
                      {packageCancellationPolicyDTOList.map((c, index) => (
                        <Row
                          key={index}
                          className="align-items-center mb-3 bg-light p-3 rounded-3"
                        >
                          <Col md={12}>
                            <Form.Label className="fw-semibold small">
                              Cancellation fee of
                            </Form.Label>
                            <div className="d-flex align-items-center flex-wrap gap-2 mt-1">
                              <Form.Control
                                type="number"
                                min="0"
                                onKeyDown={(e) => {
                                  if (e.key === "-" || e.key === "e" || e.key === "E") e.preventDefault();
                                }}
                                style={{ width: "120px" }}
                                value={c.cancellationFee}
                                onChange={(e) =>
                                  updateCancellation(index, "cancellationFee", e.target.value)
                                }
                                disabled={isViewMode}
                              />
                              <Form.Select
                                style={{ width: "90px" }}
                                value={c.cancellationFeeType}
                                onChange={(e) =>
                                  updateCancellation(index, "cancellationFeeType", e.target.value)
                                }
                                disabled={isViewMode}
                              >
                                <option value="PERCENT">%</option>
                                <option value="AMOUNT">Amt</option>
                              </Form.Select>
                              <span className="text-muted small">
                                of total booking if cancelled less than
                              </span>
                              <Form.Control
                                type="number"
                                min="0"
                                onKeyDown={(e) => {
                                  if (e.key === "-" || e.key === "e" || e.key === "E") e.preventDefault();
                                }}
                                style={{ width: "90px" }}
                                value={c.noOfNights}
                                onChange={(e) =>
                                  updateCancellation(index, "noOfNights", e.target.value)
                                }
                                disabled={isViewMode}
                              />
                              <span className="text-muted small">
                                days prior to arrival
                              </span>
                              {!isViewMode && (
                                <Button
                                  size="sm"
                                  variant="outline-primary"
                                  className="rounded-circle"
                                  onClick={addCancellation}
                                >
                                  <FaPlus />
                                </Button>
                              )}
                              {!isViewMode && packageCancellationPolicyDTOList.length > 1 && (
                                <Button
                                  size="sm"
                                  variant="outline-danger"
                                  className="rounded-circle"
                                  onClick={() => removeCancellation(index)}
                                >
                                  <FaTrash />
                                </Button>
                              )}
                            </div>
                          </Col>
                        </Row>
                      ))}
                    </div>

                    {/* Terms & Conditions — moved here from its own tab
                        per client request. Same master-checklist + custom
                        entry pattern used by Inclusions/Exclusions, just
                        rendered inline under Policy Details. */}
                    <div className="border-top pt-4 mt-4">
                      {renderOthersBucket({
                        bucketType: 3,
                        heading: "Terms & Conditions",
                        emptyText: "No master terms & conditions available",
                        customList: customTerms,
                        setCustomList: setCustomTerms,
                        draft: termsDraft,
                        setDraft: setTermsDraft,
                        addPlaceholder:
                          "Type a custom term or condition (up to 20+ lines) and click Add",
                      })}
                    </div>
                  </div>
                </Tab>

                {/* Information on Package — final wizard tab. A single
                    free-text area that saves to packages.package_information
                    (TEXT) on the backend. Prefills on edit/view and clears
                    on Create; validation is intentionally left off so an
                    empty note is accepted. */}
                <Tab eventKey="packageInformation" title="Information on Package">
                  <div style={{ maxHeight: "500px", overflowY: "auto" }}>
                    <h6 className="fw-bold text-dark mb-3">
                      {/* Information on Package */}
                    </h6>
                    <Form.Group>
                      <Form.Label className="small text-secondary">
                        Additional information / notes about this package
                      </Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={12}
                        style={{ resize: "vertical", minHeight: "220px" }}
                        placeholder="Type any additional information about this package (booking notes, meal plan clarifications, special conditions, etc.)"
                        value={formData.packageInformation || ""}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            packageInformation: e.target.value,
                          }))
                        }
                        disabled={isViewMode}
                      />
                      <div className="text-muted small mt-1">
                        {(formData.packageInformation || "").length} characters
                      </div>
                    </Form.Group>
                  </div>
                </Tab>
              </Tabs>
            </Modal.Body>
            <Modal.Footer className="d-flex justify-content-between">
              <Button variant="danger" onClick={closeModal}>
                <i className="fas fa-times me-2"></i>
                {isViewMode ? "Close" : "Cancel"}
              </Button>

              {/* Wizard nav: Previous is always visible when not on the
                  first tab; Next on any tab that isn't the last; the
                  final submit (Create / Update) only appears on the last
                  tab. In view mode we skip the submit but still expose
                  Previous/Next so users can navigate through the tabs. */}
              <div className="d-flex gap-2">
                <Button
                  variant="outline-secondary"
                  onClick={goPrevTab}
                  disabled={isFirstTab}
                >
                  <FaArrowLeft className="me-2" /> Previous
                </Button>

                {!isLastTab && (
                  <Button variant="primary" onClick={goNextTab}>
                    Next <FaArrowRight className="ms-2" />
                  </Button>
                )}

                {isLastTab && !isViewMode && (
                  <Button
                    variant="success"
                    onClick={editing ? handleUpdatePackage : handleSave}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                          aria-hidden="true"
                        ></span>
                        Saving...
                      </>
                    ) : (
                      <>
                        <FaCheck className="me-2" />
                        {editing ? "Update Package" : "Confirm & Create"}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </Modal.Footer>
          </Modal>

          {/* Status Toggle Modal */}
          <Modal
            show={showStatusModal}
            onHide={() => !isLoading && setShowStatusModal(false)}
            centered
            size="sm"
            backdrop="static"
            keyboard={false}
          >
            <Modal.Header closeButton={!isLoading}>
              <Modal.Title>Confirm Status Change</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <p>
                Are you sure you want to{" "}
                {selectedPackage?.liveStatus === true ? "deactivate" : "activate"} this package?
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={() => setShowStatusModal(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={updatePackageStatus}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    Processing...
                  </>
                ) : (
                  "Confirm"
                )}
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
}; 

export default PackageReg;
