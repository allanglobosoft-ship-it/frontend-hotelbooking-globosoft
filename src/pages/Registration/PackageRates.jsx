import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Card,
  Button,
  Table,
  Modal,
  Form,
  Row,
  Col,
  FormCheck,
  Pagination,
} from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import Select from "react-select";
import {
  FaEdit,
  FaTrash,
  FaPlus,
  FaBackward,
  FaCopy,
  FaEye,
} from "react-icons/fa";
import DateTimeApplyPicker, {
  parseLocalDateTime,
} from "../../components/DateTimeApplyPicker";

const PackageRates = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showModal, setShowModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [viewMode, setViewMode] = useState(false);
  const [search, setSearch] = useState("");
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [countries, setCountries] = useState([]);
  const [places, setPlaces] = useState([]);
  // The selected place, when it isn't in the chosen country's list.
  const [savedPlace, setSavedPlace] = useState(null);
  const [marketTypes, setMarketTypes] = useState([]);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);
  const [validityList, setValidityList] = useState([
    {
      id: Date.now(),
      validityFrom: "",
      validityTo: "",
    },
  ]);
  const [occupancyList, setOccupancyList] = useState([
    {
      id: Date.now(),
      minimumPax: "",
      maximumPax: "",
    },
  ]);
  const [packageCategories, setPackageCategories] = useState([]);
  const [isLoadingPackageCategories, setIsLoadingPackageCategories] = useState(false);
  const [isAddingValidity, setIsAddingValidity] = useState(false);
  const [isAddingOccupancy, setIsAddingOccupancy] = useState(false);
  const [showRateDetails, setShowRateDetails] = useState(false);
  // Small side-modal that lists every validity period attached to one
  // package rate, opened from the "View" link in the new Validity column.
  const [validityModalItem, setValidityModalItem] = useState(null);
  const [hotelOptions, setHotelOptions] = useState([]);
  const [hotelCache, setHotelCache] = useState({});
  const [isHotelsLoading, setIsHotelsLoading] = useState(false);
  // Room types per hotel — populated lazily as the user picks a hotel on
  // any sharing row. Keyed by hotelId → array of { rommCategoryId, roomCategory }
  // shapes returned by /api/hotelRoomDetailsController/{hotelId}. Kept in
  // one page-level cache so multiple rows using the same hotel avoid
  // re-fetching.
  const [roomTypesByHotel, setRoomTypesByHotel] = useState({});
  // Ordered list of the 4 meal plans the client asked for. Each is stored
  // as its own row on the backend so the payload flattens cleanly.
  const MEAL_PLANS = [
    { key: "BB", label: "BB" },
    { key: "HB", label: "Half Board" },
    { key: "FB", label: "Full Board" },
    { key: "AI", label: "All Inclusive" },
  ];

  // Refs to track last execution time
  const lastValidityAddTime = useRef(0);
  const lastOccupancyAddTime = useRef(0);
  const countryDebounceRef = useRef(null);
  // The country `places` was last requested for.
  const placesCountryRef = useRef(null);
  const hotelDebounceRef = useRef(null);

  const [selectedCountryOption, setSelectedCountryOption] = useState(null);
  const [isCountryLoading, setIsCountryLoading] = useState(false);

  // Get package info from navigation state
  const packageInfo = location.state || {};
  const packageId = packageInfo.package?.packageId || 0;
  const packageName = packageInfo.packageName || "Unknown Package";
  const packageCode = packageInfo.packageCode || "Unknown";

  // Food-preference choices captured on the Package Rate create/edit
  // modal. Values match the backend column (nullable String) so the
  // enum can grow later without a schema change.
  const FOOD_TYPES = [
    { value: "VEG", label: "Veg" },
    { value: "NON_VEG", label: "Non-Veg" },
    { value: "BOTH", label: "Both" },
  ];

  const [formData, setFormData] = useState({
    packageratesId: "",
    packageId: packageId,
    markettypeId: null,
    packagerateCode: "",
    foodType: "",
    packageRateValidityDTO: [],
    packageAccommodationrateDTO: [],
    rates: {},
    countryId: "",
    placeId: "",
    noOfNights: "",
  });

  // A country's full place list can be long; only this many render at once.
  const MAX_VISIBLE_OPTIONS = 200;

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
      console.log(`SearchableSelect (${name}) - value:`, value);
      console.log(`SearchableSelect (${name}) - options:`, options);

      if (!options || !Array.isArray(options)) {
        setFilteredOptions([]);
        return;
      }

      if (searchTerm) {
        const filtered = options.filter((option) => {
          const optionName =
            option.name ||
            option.countryName ||
            option.placeName ||
            option.marketTypeName ||
            String(option);
          return optionName.toLowerCase().includes(searchTerm.toLowerCase());
        });
        setFilteredOptions(filtered);
      } else {
        setFilteredOptions(options);
      }
    }, [searchTerm, options, name]);

    const handleSelect = (option) => {
      try {
        console.log(`SearchableSelect (${name}) - Selecting option:`, option);
        const optionValue = option.id !== undefined ? option.id : option;
        onChange({
          target: {
            name: name,
            value: optionValue,
          },
        });
        setIsOpen(false);
        setSearchTerm("");
        if (onInputChange) onInputChange("");
      } catch (error) {
        console.error(`Error in handleSelect (${name}):`, error);
      }
    };

    const selectedOption = options?.find(
      (option) => String(option.id) === String(value)
    );

    console.log(`SearchableSelect (${name}) - selectedOption:`, selectedOption);

    const displayValue =
      selectedOption?.name ||
      selectedOption?.countryName ||
      selectedOption?.placeName ||
      selectedOption?.marketTypeName ||
      "";

    return (
      <div className="position-relative">
        <Form.Control
          type="text"
          value={isOpen ? searchTerm : displayValue}
          onChange={(e) => {
            if (disabled) return;
            const val = e.target.value;
            if (isOpen) {
              setSearchTerm(val);
            } else {
              setIsOpen(true);
              setSearchTerm(val);
            }
            if (onInputChange) onInputChange(val);
          }}
          onFocus={() => !disabled && setIsOpen(true)}
          placeholder={placeholder}
          className={`${className || ""} ${isInvalid ? "is-invalid" : ""}`}
          disabled={disabled}
          readOnly={disabled}
          autoComplete="off"
        />

        <div
          className="position-absolute top-50 end-0 translate-middle-y pe-3"
          style={{ pointerEvents: "none" }}
        >
          {isLoading ? (
            <div
              className="spinner-border spinner-border-sm text-muted"
              role="status"
            >
              <span className="visually-hidden">Loading...</span>
            </div>
          ) : (
            <i
              className={`fas fa-chevron-down text-muted ${
                isOpen ? "fa-rotate-180" : ""
              }`}
            ></i>
          )}
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
              filteredOptions.slice(0, MAX_VISIBLE_OPTIONS).map((option) => (
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
                    option.placeName ||
                    option.marketTypeName ||
                    String(option)}
                </div>
              ))
            ) : (
              <div className="px-3 py-2 text-muted">No options found</div>
            )}
            {!isLoading && filteredOptions.length > MAX_VISIBLE_OPTIONS && (
              <div className="px-3 py-2 text-muted small">
                Showing the first {MAX_VISIBLE_OPTIONS}. Type to narrow the list.
              </div>
            )}
          </div>
        )}

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

  const validateForm = (data) => {
    const errors = {};

    if (!data.packagerateCode?.trim())
      errors.packagerateCode = "Rate code is required";
    if (!data.markettypeId) errors.markettypeId = "Market type is required";
    if (!data.foodType) errors.foodType = "Food type is required";
    if (!data.countryId) errors.countryId = "Country is required";
    if (!data.placeId) errors.placeId = "Place is required";
    if (!data.noOfNights) errors.noOfNights = "Number of nights is required";

    const invalidValidity = validityList.some(
      (v) => !v.validityFrom || !v.validityTo
    );
    if (invalidValidity)
      errors.validityList = "All validity periods must have from and to dates";

    const invalidOccupancy = occupancyList.some(
      (o) => !o.minimumPax || !o.maximumPax
    );
    if (invalidOccupancy)
      errors.occupancyList = "All occupancy must have minimum and maximum pax";

    const hasEnabledCategory = Object.values(data.rates || {}).some(
      (rate) => rate.enabled === true
    );
    if (!hasEnabledCategory) {
      errors.packageAccommodationrateDTO =
        "At least one package category must be selected";
    }

    return errors;
  };

  const handleCreate = () => {
    setEditing(null);

    const rates = {};
    packageCategories.forEach((category) => {
      const key = (category.packageCategoryId || category.id).toString();
      rates[key] = {
        enabled: false,
        occupancyRates: {}
      };
    });

    setFormData({
      packageratesId: "",
      packageId: packageId,
      markettypeId: null,
      packagerateCode: "",
      foodType: "",
      packageRateValidityDTO: [],
      packageAccommodationrateDTO: [],
      rates: rates,
      countryId: "",
      placeId: "",
      noOfNights: "",
    });
    setCountries([]);
    setSelectedCountryOption(null);
    setValidityList([
      {
        id: Date.now(),
        validityFrom: "",
        validityTo: "",
      },
    ]);
    setOccupancyList([
      {
        id: Date.now(),
        minimumPax: "",
        maximumPax: "",
      },
    ]);
    setValidationErrors({});
    setShowRateDetails(false);
    setShowModal(true);
    
    // Fetch data on modal open
    fetchCountries("");
    marketTypeList();
    fetchPackageDetails();
    fetchHotels("");
  };

  const fetchPackageRatesList = async (pageNum = 0, searchTerm = search) => {
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
        `/api/packageRates/fullList/${packageId}`
      );
      console.log("package rates list :::", res);

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
      toast.error("Failed to load package rates");
      setItems([]);
      setTotalPages(0);
      setPage(0);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCountries = async (searchTerm = "") => {
    setIsCountryLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/country?page=0&limit=20&search=${encodeURIComponent(searchTerm)}`
      );
      if (Array.isArray(res.data)) {
        const options = res.data.map((country) => ({
          value: country.id,
          label: country.name,
        }));
        setCountries(options);
        return options;
      }
      return [];
    } catch (error) {
      console.error("Error fetching countries:", error);
      return [];
    } finally {
      setIsCountryLoading(false);
    }
  };

  // Edit / Copy: shows the rate's saved country in the Country box.
  // fetchCountries("") loads only the first 20 countries (in id order), so a
  // saved country further down was never found and the box stayed empty. When
  // it isn't among them, the full list is fetched once to find it; it is then
  // selected and kept among the options. Saving is unaffected:
  // formData.countryId already holds the saved id.
  const selectSavedCountry = async (countryId) => {
    if (!countryId) {
      setSelectedCountryOption(null);
      fetchCountries("");
      return;
    }
    const wanted = String(countryId);
    const firstPage = await fetchCountries("");
    let match = (firstPage || []).find((c) => String(c.value) === wanted);
    if (!match) {
      try {
        const res = await axiosInstance.get(`/api/country?page=0&limit=1000`);
        if (Array.isArray(res.data)) {
          const found = res.data.find((country) => String(country.id) === wanted);
          if (found) {
            match = { value: found.id, label: found.name };
          }
        }
      } catch (error) {
        console.error("Error looking up the saved country:", error);
      }
    }
    if (!match) return;
    // Don't override a country the user picked while this was loading.
    setSelectedCountryOption((prev) =>
      prev && String(prev.value) !== wanted ? prev : match
    );
    setCountries((prev) =>
      prev.some((c) => String(c.value) === wanted) ? prev : [match, ...prev]
    );
  };

  // The chosen country's places. /api/province ignores countryId, so this uses the
  // endpoint that filters by it. The whole list comes back, which keeps the
  // selected place among the options; the Place box searches it in the browser.
  const cityList = async (countryId) => {
    const requestedCountry = String(countryId);
    placesCountryRef.current = requestedCountry;
    try {
      setIsLoadingPlaces(true);
      const response = await axiosInstance.get(
        `/api/province/getByCountryId/${countryId}`
      );
      // A newer country was chosen while this was loading.
      if (placesCountryRef.current !== requestedCountry) return;
      setPlaces(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log("axios call error for city list : ", error);
      if (placesCountryRef.current === requestedCountry) setPlaces([]);
    } finally {
      if (placesCountryRef.current === requestedCountry) setIsLoadingPlaces(false);
    }
  };

  // Fetch the given hotel's room types once and cache the result.
  // Endpoint returns [{ rommCategoryId, roomCategory, ... }, ...].
  // Safe to call repeatedly — a hit in `roomTypesByHotel` short-circuits.
  const fetchRoomTypes = async (hotelId) => {
    if (!hotelId) return [];
    if (roomTypesByHotel[hotelId]) return roomTypesByHotel[hotelId];
    try {
      const res = await axiosInstance.get(
        `/api/hotelRoomDetailsController/${hotelId}`
      );
      const rooms = Array.isArray(res.data) ? res.data : [];
      setRoomTypesByHotel((prev) => ({ ...prev, [hotelId]: rooms }));
      return rooms;
    } catch (error) {
      console.error(`Error fetching room types for hotel ${hotelId}:`, error);
      setRoomTypesByHotel((prev) => ({ ...prev, [hotelId]: [] }));
      return [];
    }
  };

  const fetchHotels = async (searchTerm = "") => {
    setIsHotelsLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/hotels?page=0&limit=20&search=${encodeURIComponent(searchTerm)}`
      );
      if (Array.isArray(res.data)) {
        const options = res.data.map((hotel) => ({
          value: hotel.id,
          label: hotel.hotelName || hotel.name || "Unknown Hotel",
        }));
        
        // Update cache
        setHotelCache(prev => {
          const newCache = { ...prev };
          options.forEach(opt => {
            newCache[opt.value] = opt.label;
          });
          return newCache;
        });

        setHotelOptions(options);
        return options;
      }
      return [];
    } catch (error) {
      console.error("Error fetching hotels:", error);
      return [];
    } finally {
      setIsHotelsLoading(false);
    }
  };

  const marketTypeList = async () => {
    try {
      const response = await axiosInstance.get("/api/marketType");
      console.log("Market types API response:", response.data);
      setMarketTypes(response.data);
    } catch (error) {
      console.log("error for market type list :", error);
    }
  };

  const fetchPackageDetails = async () => {
    try {
      setIsLoadingPackageCategories(true);
      const categoriesResponse = await axiosInstance.get(
        `/api/TravelPackage/packageCategories/${packageId}`
      );

      const allCategories = categoriesResponse.data || [];
      console.log("All available package categories:", allCategories);
      setPackageCategories(allCategories);
    } catch (error) {
      console.log("Error fetching package categories:", error);
      setPackageCategories([]);
      toast.error("Failed to load package categories");
    } finally {
      setIsLoadingPackageCategories(false);
    }
  };

  const handleCountryChange = (option) => {
    const value = option ? String(option.value) : "";
    setSelectedCountryOption(option);

    setFormData((prev) => ({
      ...prev,
      countryId: value,
      placeId: "",
    }));

    setPlaces([]);
    setIsLoadingPlaces(false);
    placesCountryRef.current = null;

    if (value) {
      cityList(value);
    }

    if (validationErrors.countryId) {
      setValidationErrors((prev) => ({ ...prev, countryId: "" }));
    }
    if (validationErrors.placeId) {
      setValidationErrors((prev) => ({ ...prev, placeId: "" }));
    }
  };

  const handlePlaceChange = (e) => {
    const value = e.target.value;
    const stringValue = String(value);

    setFormData((prev) => ({
      ...prev,
      placeId: stringValue,
    }));

    if (validationErrors.placeId) {
      setValidationErrors((prev) => ({ ...prev, placeId: "" }));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    try {
      setIsLoading(true);

      const packageRateValidityDTO = validityList.map((validity) => ({
        validityfrom: validity.validityFrom,
        validityto: validity.validityTo,
      }));

      const packageAccommodationrateDTO = occupancyList.map((occupancy) => {
        const enabledCategories = packageCategories.filter((category) => {
          const categoryKey = (category.packageCategoryId || category.id).toString();
          return formData.rates?.[categoryKey]?.enabled === true;
        });

        return {
          countryId: formData.countryId || "",
          placeId: formData.placeId ? [parseInt(formData.placeId)] : [],
          noofnight: formData.noOfNights || "",
          packageAccommodationrateDetailsDTO: enabledCategories.map(
            (category) => {
              const categoryKey = (category.packageCategoryId || category.id).toString();
              const occRate = formData.rates?.[categoryKey]?.occupancyRates?.[occupancy.id] || {};
              const rows = Array.isArray(occRate.hotelRows) ? occRate.hotelRows : [];
              // Two independent sub-sections in the UI both flatten into
              // the same `hotels[]` list — hotel rows carry hotelId (and
              // mealPlan=null); meal-plan rows carry mealPlan (and
              // hotelId=null). The backend accepts either shape.
              const hotelRowEntries = rows
                .map((row) => hotelRowToPayload(row, occRate.hotelCommonRate))
                .filter(Boolean);
              const mealPlanEntries = mealPlanRatesToPayload(occRate.mealPlanRates);
              const hotelsPayload = [...hotelRowEntries, ...mealPlanEntries];
              // Legacy `hotelId` list — keep it populated for any
              // downstream consumer that still reads it directly.
              const hotelIdList = Array.from(
                new Set(hotelRowEntries.map((h) => h.hotelId).filter(Boolean))
              );
              return {
                packagecategoryId: categoryKey,
                minpax: occupancy.minimumPax,
                maxpax: occupancy.maximumPax,
                hotelId: hotelIdList,
                hotels: hotelsPayload,
                // Detail-level rates are no longer edited on the new
                // form. Send nulls so the backend column is cleared on
                // records that used to hold detail-level values.
                adultRate: null,
                childRate: null,
                childRateWithoutbed: null,
              };
            }
          ),
        };
      });

      const payload = {
        packageratesId: "",
        packageId: packageId,
        markettypeId: formData.markettypeId ? [formData.markettypeId] : [],
        packagerateCode: formData.packagerateCode,
        foodType: formData.foodType || null,
        packageRateValidityDTO: packageRateValidityDTO,
        packageAccommodationrateDTO: packageAccommodationrateDTO,
      };

      console.log("package rates save payload::", payload);

      const response = await axiosInstance.post(
        "/api/packageRates/save",
        payload
      );

      if (response.data) {
        toast.success("Package rate added successfully!");
        setValidationErrors({});
        await fetchPackageRatesList(page, search);
        closeModal();
      } else {
        toast.error("Failed to save data!!");
      }
    } catch (error) {
      toast.error(
        `Error!! Something went wrong: ${
          error.response?.data?.message || error.message
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    try {
      setIsLoading(true);

      const packageRateValidityDTO = validityList.map((validity) => ({
        packagerateValidityId: validity.id || "",
        validityfrom: validity.validityFrom,
        validityto: validity.validityTo,
      }));

      const packageAccommodationrateDTO = occupancyList.map((occupancy) => {
        const enabledCategories = packageCategories.filter((category) => {
          const categoryKey = (category.packageCategoryId || category.id).toString();
          return formData.rates?.[categoryKey]?.enabled === true;
        });

        return {
          packageaccommodationrateId: occupancy.id || "",
          countryId: formData.countryId || "",
          placeId: formData.placeId ? [parseInt(formData.placeId)] : [],
          noofnight: formData.noOfNights || "",
          packageAccommodationrateDetailsDTO: enabledCategories.map(
            (category) => {
              const categoryKey = (category.packageCategoryId || category.id).toString();
              const occRate = formData.rates?.[categoryKey]?.occupancyRates?.[occupancy.id] || {};
              const rows = Array.isArray(occRate.hotelRows) ? occRate.hotelRows : [];
              // Two independent sub-sections in the UI both flatten into
              // the same `hotels[]` list — hotel rows carry hotelId (and
              // mealPlan=null); meal-plan rows carry mealPlan (and
              // hotelId=null). The backend accepts either shape.
              const hotelRowEntries = rows
                .map((row) => hotelRowToPayload(row, occRate.hotelCommonRate))
                .filter(Boolean);
              const mealPlanEntries = mealPlanRatesToPayload(occRate.mealPlanRates);
              const hotelsPayload = [...hotelRowEntries, ...mealPlanEntries];
              // Legacy `hotelId` list — keep it populated for any
              // downstream consumer that still reads it directly.
              const hotelIdList = Array.from(
                new Set(hotelRowEntries.map((h) => h.hotelId).filter(Boolean))
              );
              return {
                packagecategoryId: categoryKey,
                minpax: occupancy.minimumPax,
                maxpax: occupancy.maximumPax,
                hotelId: hotelIdList,
                hotels: hotelsPayload,
                // Detail-level rates are no longer edited on the new
                // form. Send nulls so the backend column is cleared on
                // records that used to hold detail-level values.
                adultRate: null,
                childRate: null,
                childRateWithoutbed: null,
              };
            }
          ),
        };
      });

      const payload = {
        packageratesId: editing.packageratesId,
        packageId: packageId,
        markettypeId: formData.markettypeId ? [formData.markettypeId] : [],
        packagerateCode: formData.packagerateCode,
        foodType: formData.foodType || null,
        packageRateValidityDTO: packageRateValidityDTO,
        packageAccommodationrateDTO: packageAccommodationrateDTO,
      };

      console.log("package rates edit payload::", payload);

      const response = await axiosInstance.put(
        `/api/packageRates/${editing.packageratesId}`,
        payload
      );

      if (response.data) {
        toast.success("Package rate updated successfully!");
        setValidationErrors({});
        setEditing(null);
        await fetchPackageRatesList(page, search);
        closeModal();
      } else {
        toast.error("Failed to update data!!");
      }
    } catch (error) {
      toast.error(
        `Error!! Something went wrong: ${
          error.response?.data?.message || error.message
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setValidationErrors({});
    setEditing(null);
    setIsAddingValidity(false);
    setIsAddingOccupancy(false);
    setViewMode(false);
    setShowRateDetails(false);
  };

  const openEdit = (item) => {
    setEditing(item);

    // Update hotel cache from the response
    if (item.packageAccommodationrateDTO) {
      const newCache = { ...hotelCache };
      item.packageAccommodationrateDTO.forEach(acc => {
        if (acc.packageAccommodationrateDetailsDTO) {
          acc.packageAccommodationrateDetailsDTO.forEach(detail => {
            if (detail.hotels && Array.isArray(detail.hotels)) {
              detail.hotels.forEach(h => {
                newCache[h.id] = h.name;
              });
            }
          });
        }
      });
      setHotelCache(newCache);
    }

    const rates = {};
    packageCategories.forEach((category) => {
      const key = (category.packageCategoryId || category.id).toString();
      rates[key] = {
        enabled: false,
        occupancyRates: {}
      };
    });

    if (
      item.packageAccommodationrateDTO &&
      item.packageAccommodationrateDTO.length > 0
    ) {
      const hotelIdsToWarm = new Set();
      item.packageAccommodationrateDTO.forEach((accommodation) => {
        const occupancyId = accommodation.packageaccommodationrateId;
        if (accommodation.packageAccommodationrateDetailsDTO) {
           accommodation.packageAccommodationrateDetailsDTO.forEach((detail) => {
            const categoryKey = detail.packagecategoryId.toString();
            if (!rates[categoryKey]) {
              rates[categoryKey] = { enabled: true, occupancyRates: {} };
            }
            rates[categoryKey].enabled = true;
            // New shape: split backend `hotels[]` back into two blocks —
            // hotelRows (hotelId set) and mealPlanRates (hotelId null +
            // mealPlan set). If the record was saved before this feature
            // (only legacy `hotelId` list), seed one blank hotelRow per
            // legacy id so the user still sees them.
            const occState = splitHotelsIntoOccupancyState(detail.hotels);
            if ((!Array.isArray(detail.hotels) || detail.hotels.length === 0)
                && Array.isArray(detail.hotelId) && detail.hotelId.length > 0) {
              occState.hotelRows = detail.hotelId.map((hid) => ({
                ...emptyHotelRow(),
                hotelId: hid,
              }));
              detail.hotelId.forEach((hid) => hotelIdsToWarm.add(hid));
            } else {
              occState.hotelRows.forEach((r) => {
                if (r.hotelId) hotelIdsToWarm.add(r.hotelId);
              });
            }
            rates[categoryKey].occupancyRates[occupancyId] = occState;
          });
        }
      });
      // Prefetch room-types for every hotel in the loaded rows so the
      // Room Type dropdown renders options without a lag on first click.
      hotelIdsToWarm.forEach((hid) => fetchRoomTypes(hid));
    }

    const firstAcc = item.packageAccommodationrateDTO?.[0];
    const countryId = firstAcc?.countryId || "";
    const placeId = Array.isArray(firstAcc?.placeId) ? firstAcc.placeId[0] : (firstAcc?.placeId || "");

    console.log("openEdit formData conversion:", { countryId, placeId });

    setFormData({
      packageratesId: item.packageratesId || "",
      packageId: item.packageId || packageId,
      markettypeId: Array.isArray(item.markettypeId) ? item.markettypeId[0] : (item.markettypeId || null),
      packagerateCode: item.packagerateCode || "",
      foodType: item.foodType || "",
      packageRateValidityDTO: item.packageRateValidityDTO || [],
      packageAccommodationrateDTO: item.packageAccommodationrateDTO || [],
      rates: rates,
      countryId: countryId,
      placeId: placeId,
      noOfNights: firstAcc?.noofnight || "",
    });

    const validityList = item.packageRateValidityDTO?.map((validity) => ({
      id: validity.packagerateValidityId,
      validityFrom: validity.validityfrom,
      validityTo: validity.validityto,
    })) || [{ id: Date.now(), validityFrom: "", validityTo: "" }];

    const occupancyList = item.packageAccommodationrateDTO?.map(
      (accommodation) => {
        // Find first detail to get min/max pax for this occupancy level
        const firstDetail = accommodation.packageAccommodationrateDetailsDTO?.[0];
        return {
          id: accommodation.packageaccommodationrateId,
          minimumPax: firstDetail?.minpax || "",
          maximumPax: firstDetail?.maxpax || "",
        };
      }
    ) || [{ id: Date.now(), minimumPax: "", maximumPax: "" }];

    setValidityList(validityList);
    setOccupancyList(occupancyList);
    setValidationErrors({});

    // Fetch places for the countryId
    if (countryId) {
      cityList(countryId);
    }
    // Show the saved country, even when it isn't among the first 20 countries.
    selectSavedCountry(countryId);

    setShowModal(true);
    setShowRateDetails(true);

    // Fetch data on modal open
    marketTypeList();
    fetchPackageDetails();
    fetchHotels("");
  };

  const handleDelete = async (item) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: `Do you want to delete rate code "${item.packagerateCode}"?`,
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
          `/api/packageRates/${item.packageratesId}`
        );
        if (response.data) {
          toast.success("Package rate deleted successfully!");
          await fetchPackageRatesList(page, search);
        }
      } catch (error) {
        toast.error(
          `Failed to delete package rate: ${
            error.response?.data?.message || error.message
          }`
        );
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleView = async (item) => {
    try {
      setIsLoading(true);
      const response = await axiosInstance.get(
        `/api/packageRates/${item.packageratesId}`
      );

      if (response.data) {
        setViewMode(true);
        openEdit(response.data);
        toast.success("Package rate details loaded successfully!");
      }
    } catch (error) {
      toast.error(
        `Failed to fetch package rate details: ${
          error.response?.data?.message || error.message
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditClick = async (item) => {
    try {
      setIsLoading(true);
      const response = await axiosInstance.get(
        `/api/packageRates/${item.packageratesId}`
      );

      if (response.data) {
        setViewMode(false);
        openEdit(response.data);
        toast.success("Package rate details loaded successfully!");
      }
    } catch (error) {
      toast.error(
        `Failed to fetch package rate details: ${
          error.response?.data?.message || error.message
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (item) => {
    setEditing(null);

    const rates = {};
    packageCategories.forEach((category) => {
      const key = (category.packageCategoryId || category.id).toString();
      rates[key] = {
        enabled: false,
        occupancyRates: {}
      };
    });

    if (
      item.packageAccommodationrateDTO &&
      item.packageAccommodationrateDTO.length > 0
    ) {
      const hotelIdsToWarm = new Set();
      item.packageAccommodationrateDTO.forEach((accommodation) => {
        const occupancyId = `copy_${Math.random()}`; // Use random ID for copy
        if (accommodation.packageAccommodationrateDetailsDTO) {
          accommodation.packageAccommodationrateDetailsDTO.forEach((detail) => {
            const categoryKey = detail.packagecategoryId.toString();
            if (!rates[categoryKey]) {
              rates[categoryKey] = { enabled: true, occupancyRates: {} };
            }
            rates[categoryKey].enabled = true;
            const occState = splitHotelsIntoOccupancyState(detail.hotels);
            if ((!Array.isArray(detail.hotels) || detail.hotels.length === 0)
                && Array.isArray(detail.hotelId) && detail.hotelId.length > 0) {
              occState.hotelRows = detail.hotelId.map((hid) => ({
                ...emptyHotelRow(),
                hotelId: hid,
              }));
              detail.hotelId.forEach((hid) => hotelIdsToWarm.add(hid));
            } else {
              occState.hotelRows.forEach((r) => {
                if (r.hotelId) hotelIdsToWarm.add(r.hotelId);
              });
            }
            rates[categoryKey].occupancyRates[occupancyId] = occState;
          });
        }
      });
      hotelIdsToWarm.forEach((hid) => fetchRoomTypes(hid));
    }

    setFormData({
      packageratesId: "",
      packageId: packageId,
      markettypeId: item.markettypeId?.[0] || null,
      packagerateCode: `${item.packagerateCode}_COPY`,
      foodType: item.foodType || "",
      packageRateValidityDTO: [],
      packageAccommodationrateDTO: [],
      rates: rates,
      countryId: item.packageAccommodationrateDTO?.[0]?.countryId || "",
      placeId: item.packageAccommodationrateDTO?.[0]?.placeId?.[0] || "",
      noOfNights: item.packageAccommodationrateDTO?.[0]?.noofnight || "",
    });

    const validityList = item.packageRateValidityDTO?.map((validity) => ({
      id: Date.now() + Math.random(),
      validityFrom: validity.validityfrom,
      validityTo: validity.validityto,
    })) || [{ id: Date.now(), validityFrom: "", validityTo: "" }];

    const occupancyList = item.packageAccommodationrateDTO?.map(
      (accommodation) => ({
        id: Date.now() + Math.random(),
        minimumPax:
          accommodation.packageAccommodationrateDetailsDTO?.[0]?.minpax || "",
        maximumPax:
          accommodation.packageAccommodationrateDetailsDTO?.[0]?.maxpax || "",
      })
    ) || [{ id: Date.now(), minimumPax: "", maximumPax: "" }];

    setValidityList(validityList);
    setOccupancyList(occupancyList);
    setValidationErrors({});
    setShowRateDetails(false);
    setShowModal(true);

    // Fetch data on modal open. The copied rate's country is shown in the
    // Country box (it used to stay empty though the copy kept its id).
    selectSavedCountry(item.packageAccommodationrateDTO?.[0]?.countryId || "");
    marketTypeList();
    fetchPackageDetails();
    fetchHotels("");
  };

  const addValidityPeriod = useCallback(
    (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (isAddingValidity) {
        return;
      }

      const currentTime = Date.now();
      const timeSinceLastAdd = currentTime - lastValidityAddTime.current;

      if (timeSinceLastAdd < 1000) {
        return;
      }

      lastValidityAddTime.current = currentTime;
      setIsAddingValidity(true);

      const newValidity = {
        id: `validity_${currentTime}_${Math.random()
          .toString(36)
          .substr(2, 9)}`,
        validityFrom: "",
        validityTo: "",
      };

      setValidityList((prevList) => {
        const newList = [...prevList, newValidity];
        setTimeout(() => {
          setIsAddingValidity(false);
        }, 100);
        return newList;
      });
    },
    [isAddingValidity]
  );

  const removeValidityPeriod = (id) => {
    if (validityList.length > 1) {
      setValidityList(validityList.filter((v) => v.id !== id));
    }
  };

  const updateValidityPeriod = (id, field, value) => {
    setValidityList(
      validityList.map((v) => (v.id === id ? { ...v, [field]: value } : v))
    );
  };

  // Validity is stored as a plain string. Records created before time was
  // added are date-only ("yyyy-MM-dd"); a datetime-local input needs a time
  // part to render them, so append midnight for display. New edits write the
  // full "yyyy-MM-ddTHH:mm" value.
  const toDateTimeLocalValue = (v) =>
    v && v.length === 10 && !v.includes("T") ? `${v}T00:00` : v || "";

  // Human-friendly formatter for the Validity list modal — always shows
  // date + time (e.g. "13 Aug 2026, 10:30 AM"). Records saved as date-only
  // ("yyyy-MM-dd") fall back to 00:00.
  const formatValidityDisplay = (v) => {
    if (!v) return "—";
    const s = String(v);
    const dateOnly = s.length === 10 && !s.includes("T");
    const d = new Date(dateOnly ? `${s}T00:00` : s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Turn a market-type id into its display name using the warmed
  // marketTypes list. Falls back to the id string if the lookup misses.
  const getMarketTypeName = (id) => {
    if (id == null) return "";
    const m = (marketTypes || []).find(
      (mt) => String(mt.marketTypeId) === String(id)
    );
    return m ? m.name : String(id);
  };

  const renderMarketNames = (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return "N/A";
    return ids.map(getMarketTypeName).join(", ");
  };

  const addOccupancy = useCallback(
    (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (isAddingOccupancy) {
        return;
      }

      const currentTime = Date.now();
      const timeSinceLastAdd = currentTime - lastOccupancyAddTime.current;

      if (timeSinceLastAdd < 1000) {
        return;
      }

      lastOccupancyAddTime.current = currentTime;
      setIsAddingOccupancy(true);

      const newOccupancy = {
        id: `occupancy_${currentTime}_${Math.random()
          .toString(36)
          .substr(2, 9)}`,
        minimumPax: "",
        maximumPax: "",
      };

      setOccupancyList((prevList) => {
        const newList = [...prevList, newOccupancy];
        setTimeout(() => {
          setIsAddingOccupancy(false);
        }, 100);
        return newList;
      });
    },
    [isAddingOccupancy]
  );

  const removeOccupancy = (id) => {
    if (occupancyList.length > 1) {
      setOccupancyList(occupancyList.filter((o) => o.id !== id));
    }
  };

  const updateOccupancy = (id, field, value) => {
    setOccupancyList(
      occupancyList.map((o) => (o.id === id ? { ...o, [field]: value } : o))
    );
  };

  // Simpler per-occupancy shape (redesigned 2026-08-13 per client ask —
  // "hotel rate" and "meal plan rate" are kept as two separate blocks so
  // the UI reads at a glance):
  //   occupancyRates[occId] = {
  //     hotelRows: [{ hotelId, roomTypeId, adultRate, childWithBed, childWithoutBed }],
  //     mealPlanRates: {
  //       BB: { adultRate, childWithBed, childWithoutBed },
  //       HB: { adultRate, childWithBed, childWithoutBed },
  //       FB: { adultRate, childWithBed, childWithoutBed, lunchOrDinner },
  //       AI: { adultRate, childWithBed, childWithoutBed },
  //     },
  //   }
  // On save, hotelRows flatten to backend entries with mealPlan=null and
  // mealPlanRates flatten to entries with hotelId=null. Both share the
  // same `hotels[]` list on the DTO — the backend accepts either shape.
  const emptyHotelRow = () => ({
    hotelId: null,
    roomTypeId: null,
  });
  // One shared rate applies to every hotel/room listed in the Hotel Rates
  // table for a given category + occupancy — the client asked for a single
  // Per Adult / Per Child (with bed) / Per Child (without bed) rate instead
  // of repeating it on every row.
  const emptyHotelCommonRate = () => ({
    adultRate: "",
    childWithBed: "",
    childWithoutBed: "",
  });
  const emptyMealPlanRates = () => ({
    BB: { adultRate: "", childWithBed: "", childWithoutBed: "" },
    HB: { adultRate: "", childWithBed: "", childWithoutBed: "" },
    FB: { adultRate: "", childWithBed: "", childWithoutBed: "", lunchOrDinner: "LUNCH" },
    AI: { adultRate: "", childWithBed: "", childWithoutBed: "" },
  });
  const emptyOccupancyRates = () => ({
    hotelRows: [emptyHotelRow()],
    hotelCommonRate: emptyHotelCommonRate(),
    mealPlanRates: emptyMealPlanRates(),
  });

  const handleSharingTypeChange = (categoryId, checked) => {
    setFormData((prev) => {
      const newRates = { ...prev.rates };
      if (!newRates[categoryId]) {
        newRates[categoryId] = { enabled: false, occupancyRates: {} };
      }

      newRates[categoryId] = {
        ...newRates[categoryId],
        enabled: checked,
      };

      // Seed the empty scaffold per occupancy on first tick so the card
      // body shows both sub-sections (Hotel Rates + Meal Plan Rates) with
      // one blank row / four blank plan lines ready to fill.
      occupancyList.forEach((occ) => {
        const current = newRates[categoryId].occupancyRates[occ.id];
        if (!current) {
          newRates[categoryId].occupancyRates[occ.id] = emptyOccupancyRates();
        } else {
          const merged = { ...current };
          if (!Array.isArray(merged.hotelRows)) merged.hotelRows = [emptyHotelRow()];
          if (!merged.hotelCommonRate) merged.hotelCommonRate = emptyHotelCommonRate();
          if (!merged.mealPlanRates) merged.mealPlanRates = emptyMealPlanRates();
          newRates[categoryId].occupancyRates[occ.id] = merged;
        }
      });

      return { ...prev, rates: newRates };
    });
  };

  // Ensure the state path exists for a given (category, occupancy) — used
  // by the row-level mutators before writing.
  const ensureRatesPath = (draft, categoryId, occupancyId) => {
    if (!draft.rates[categoryId]) {
      draft.rates[categoryId] = { enabled: true, occupancyRates: {} };
    }
    const current = draft.rates[categoryId].occupancyRates[occupancyId];
    if (!current) {
      draft.rates[categoryId].occupancyRates[occupancyId] = emptyOccupancyRates();
      return;
    }
    if (!Array.isArray(current.hotelRows)) current.hotelRows = [emptyHotelRow()];
    if (!current.hotelCommonRate) current.hotelCommonRate = emptyHotelCommonRate();
    if (!current.mealPlanRates) current.mealPlanRates = emptyMealPlanRates();
  };

  const addHotelRow = (categoryId, occupancyId) => {
    setFormData((prev) => {
      const next = { ...prev, rates: { ...prev.rates } };
      ensureRatesPath(next, categoryId, occupancyId);
      const rows = next.rates[categoryId].occupancyRates[occupancyId].hotelRows;
      next.rates[categoryId].occupancyRates[occupancyId] = {
        ...next.rates[categoryId].occupancyRates[occupancyId],
        hotelRows: [...rows, emptyHotelRow()],
      };
      return next;
    });
  };

  const removeHotelRow = (categoryId, occupancyId, rowIndex) => {
    setFormData((prev) => {
      const next = { ...prev, rates: { ...prev.rates } };
      ensureRatesPath(next, categoryId, occupancyId);
      const rows = next.rates[categoryId].occupancyRates[occupancyId].hotelRows;
      const filtered = rows.filter((_, i) => i !== rowIndex);
      next.rates[categoryId].occupancyRates[occupancyId] = {
        ...next.rates[categoryId].occupancyRates[occupancyId],
        // Keep at least one empty row so the section always renders scaffold.
        hotelRows: filtered.length ? filtered : [emptyHotelRow()],
      };
      return next;
    });
  };

  const updateHotelRowHotel = (categoryId, occupancyId, rowIndex, selectedOption) => {
    const hotelId = selectedOption ? selectedOption.value : null;
    if (selectedOption) {
      setHotelCache((prev) => ({ ...prev, [selectedOption.value]: selectedOption.label }));
    }
    setFormData((prev) => {
      const next = { ...prev, rates: { ...prev.rates } };
      ensureRatesPath(next, categoryId, occupancyId);
      const rows = [...next.rates[categoryId].occupancyRates[occupancyId].hotelRows];
      rows[rowIndex] = { ...rows[rowIndex], hotelId, roomTypeId: null };
      next.rates[categoryId].occupancyRates[occupancyId] = {
        ...next.rates[categoryId].occupancyRates[occupancyId],
        hotelRows: rows,
      };
      return next;
    });
    if (hotelId) fetchRoomTypes(hotelId);
  };

  const updateHotelRowRoomType = (categoryId, occupancyId, rowIndex, roomTypeId) => {
    setFormData((prev) => {
      const next = { ...prev, rates: { ...prev.rates } };
      ensureRatesPath(next, categoryId, occupancyId);
      const rows = [...next.rates[categoryId].occupancyRates[occupancyId].hotelRows];
      rows[rowIndex] = { ...rows[rowIndex], roomTypeId: roomTypeId || null };
      next.rates[categoryId].occupancyRates[occupancyId] = {
        ...next.rates[categoryId].occupancyRates[occupancyId],
        hotelRows: rows,
      };
      return next;
    });
  };

  const updateHotelCommonRate = (categoryId, occupancyId, field, value) => {
    setFormData((prev) => {
      const next = { ...prev, rates: { ...prev.rates } };
      ensureRatesPath(next, categoryId, occupancyId);
      next.rates[categoryId].occupancyRates[occupancyId] = {
        ...next.rates[categoryId].occupancyRates[occupancyId],
        hotelCommonRate: {
          ...next.rates[categoryId].occupancyRates[occupancyId].hotelCommonRate,
          [field]: value,
        },
      };
      return next;
    });
  };

  const updateMealPlanRate = (categoryId, occupancyId, mealPlan, field, value) => {
    setFormData((prev) => {
      const next = { ...prev, rates: { ...prev.rates } };
      ensureRatesPath(next, categoryId, occupancyId);
      const mpRates = { ...next.rates[categoryId].occupancyRates[occupancyId].mealPlanRates };
      mpRates[mealPlan] = { ...(mpRates[mealPlan] || {}), [field]: value };
      next.rates[categoryId].occupancyRates[occupancyId] = {
        ...next.rates[categoryId].occupancyRates[occupancyId],
        mealPlanRates: mpRates,
      };
      return next;
    });
  };

  // Serialise one hotel row into one backend `hotels[]` entry — mealPlan
  // is null on hotel-base rows. Every row shares the same commonRate (one
  // Adult/Child rate set applies to all hotels/rooms in the section).
  // Empty rows (no hotel selected) collapse.
  const hotelRowToPayload = (row, commonRate) => {
    if (!row || !row.hotelId) return null;
    const rate = commonRate || {};
    return {
      hotelId: row.hotelId || null,
      roomTypeId: row.roomTypeId || null,
      mealPlan: null,
      adultRate: rate.adultRate === "" || rate.adultRate == null ? null : Number(rate.adultRate),
      childRate: rate.childWithBed === "" || rate.childWithBed == null ? null : Number(rate.childWithBed),
      childRateWithoutbed: rate.childWithoutBed === "" || rate.childWithoutBed == null ? null : Number(rate.childWithoutBed),
    };
  };

  // Serialise the meal-plan rate matrix into backend entries — one per
  // plan that has at least one non-empty rate. hotelId stays null so
  // these read back as meal-plan-only surcharge rows.
  const mealPlanRatesToPayload = (mpRates) => {
    if (!mpRates) return [];
    const out = [];
    for (const mp of MEAL_PLANS) {
      const p = mpRates[mp.key] || {};
      const anyRate =
        (p.adultRate !== "" && p.adultRate != null) ||
        (p.childWithBed !== "" && p.childWithBed != null) ||
        (p.childWithoutBed !== "" && p.childWithoutBed != null);
      if (!anyRate) continue;
      const entry = {
        hotelId: null,
        roomTypeId: null,
        mealPlan: mp.key,
        adultRate: p.adultRate === "" ? null : Number(p.adultRate),
        childRate: p.childWithBed === "" ? null : Number(p.childWithBed),
        childRateWithoutbed: p.childWithoutBed === "" ? null : Number(p.childWithoutBed),
      };
      if (mp.key === "FB") entry.lunchOrDinner = p.lunchOrDinner || "LUNCH";
      out.push(entry);
    }
    return out;
  };

  // Group the backend's flat hotels[] back into the two-section UI.
  // Rows with hotelId → hotelRows[]; rows with mealPlan-only → mealPlanRates.
  const splitHotelsIntoOccupancyState = (hotels) => {
    const state = emptyOccupancyRates();
    if (!Array.isArray(hotels) || hotels.length === 0) return state;
    const hotelRowsMap = new Map();
    let commonRateSet = false;
    hotels.forEach((h) => {
      if (h.hotelId != null) {
        const key = `${h.hotelId}|${h.roomTypeId || ""}`;
        if (!hotelRowsMap.has(key)) {
          hotelRowsMap.set(key, {
            hotelId: h.hotelId,
            roomTypeId: h.roomTypeId || null,
          });
        }
        // All hotel rows share one rate — take it from the first row seen.
        if (!commonRateSet) {
          state.hotelCommonRate = {
            adultRate: h.adultRate ?? "",
            childWithBed: h.childRate ?? "",
            childWithoutBed: h.childRateWithoutbed ?? "",
          };
          commonRateSet = true;
        }
      } else if (h.mealPlan && state.mealPlanRates[h.mealPlan]) {
        state.mealPlanRates[h.mealPlan] = {
          ...state.mealPlanRates[h.mealPlan],
          adultRate: h.adultRate ?? "",
          childWithBed: h.childRate ?? "",
          childWithoutBed: h.childRateWithoutbed ?? "",
        };
        if (h.mealPlan === "FB" && h.lunchOrDinner) {
          state.mealPlanRates.FB.lunchOrDinner = h.lunchOrDinner;
        }
      }
    });
    if (hotelRowsMap.size > 0) state.hotelRows = Array.from(hotelRowsMap.values());
    return state;
  };

  useEffect(() => {
    // Market types are needed by the list (Market column shows names, not ids)
    // as well as by the create/edit modal, so warm them once on mount.
    marketTypeList();
  }, []);

  useEffect(() => {
    if (packageId && packageId !== 0) {
      fetchPackageDetails();
    }
  }, [packageId]);

  useEffect(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    const timeout = setTimeout(() => {
      fetchPackageRatesList(0, search);
    }, 500);
    setSearchTimeout(timeout);

    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [search]);

  useEffect(() => {
    if (packageCategories.length > 0 && !editing && !showModal) {
      const rates = {};
      packageCategories.forEach((category) => {
        const key = category.packageCategoryId || category.id;
        rates[key] = {
          enabled: false,
          adultRate: "",
          childWithBed: "",
          childWithoutBed: "",
        };
      });

      setFormData((prev) => ({
        ...prev,
        rates: rates,
      }));
    }
  }, [packageCategories, editing, showModal]);

  // Keyed on the country rather than on an empty list: a country with no places
  // returns an empty list too, and that must not fetch again and again.
  useEffect(() => {
    if (showModal && formData.countryId && placesCountryRef.current !== String(formData.countryId)) {
      cityList(formData.countryId);
    }
  }, [showModal, formData.countryId]);

  // A saved rate can hold a place outside its country's list (picked while the
  // list wasn't filtered by country, or removed since). Look its name up so the
  // field still shows a name.
  useEffect(() => {
    const id = formData.placeId;
    if (!showModal || !id || isLoadingPlaces) return undefined;
    if (places.some((p) => String(p.id) === String(id))) return undefined;
    if (savedPlace && String(savedPlace.id) === String(id)) return undefined;
    let cancelled = false;
    axiosInstance
      .get(`/api/province/${id}`)
      .then((res) => {
        if (!cancelled) {
          setSavedPlace({ id, name: res.data?.name || res.data?.stateName || "" });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [showModal, formData.placeId, places, isLoadingPlaces, savedPlace]);

  const placeOptions = [
    ...(savedPlace &&
    String(savedPlace.id) === String(formData.placeId) &&
    !places.some((p) => String(p.id) === String(savedPlace.id))
      ? [savedPlace]
      : []),
    ...(Array.isArray(places)
      ? places.map((p) => ({ id: p.id, name: p.name || p.stateName }))
      : []),
  ];

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
                  onClick={() => navigate("/registration/package")}
                  className="mb-2 me-3"
                  size="sm"
                >
                  <FaBackward className="me-2" />
                  Back
                </Button>
                <span className="fw-semibold">
                  {/* <FaPlus className="me-2 text-success" /> */}
                  Package Rates - {packageName} ({packageCode})
                </span>
              </div>
              <Button className="btn-green" onClick={handleCreate} disabled={viewMode}>
                + Create
              </Button>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>S/N</th>
                    <th>Rate Code</th>
                    <th>Market</th>
                    <th>No of Nights</th>
                    <th>Validity</th>
                    <th style={{ width: 200 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.packageratesId}>
                      <td>{index + 1 + page * 10}</td>
                      <td>{item.packagerateCode || "N/A"}</td>
                      <td>{renderMarketNames(item.markettypeId)}</td>
                      <td>
                        {item.packageAccommodationrateDTO?.[0]?.noofnight ||
                          "N/A"}
                      </td>
                      <td>
                        {Array.isArray(item.packageRateValidityDTO) &&
                        item.packageRateValidityDTO.length > 0 ? (
                          <Button
                            variant="link"
                            size="sm"
                            className="p-0"
                            onClick={() => setValidityModalItem(item)}
                          >
                            {/* <FaEye className="me-1" /> */}
                            {/* View ({item.packageRateValidityDTO.length}) */}
                            View
                          </Button>
                        ) : (
                          <span className="text-muted">N/A</span>
                        )}
                      </td>
                      <td>
                        <div className="d-flex gap-2">
                          <FaEye
                            className="text-info view"
                            style={{ cursor: "pointer", fontSize: "18px" }}
                            onClick={() => handleView(item)}
                            title="View"
                          />
                          <FaEdit
                            className="text-primary edit"
                            style={{ cursor: "pointer", fontSize: "18px" }}
                            onClick={() => handleEditClick(item)}
                            title="Edit"
                          />
                          <FaCopy
                            className="text-warning copy"
                            style={{ cursor: "pointer", fontSize: "18px" }}
                            onClick={() => handleCopy(item)}
                            title="Copy"
                            disabled={viewMode}
                          />
                          <FaTrash
                            className="text-danger delete"
                            style={{ cursor: "pointer", fontSize: "18px" }}
                            onClick={() => handleDelete(item)}
                            title="Delete"
                            disabled={viewMode}
                          />
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
                        Loading package rates...
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        No package rates found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center p-3 border-top">
                  <div>
                    <small className="text-muted">
                      Showing {items.length} of {totalPages * 10} package rates
                    </small>
                  </div>
                  <div>
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={page === 0}
                        onClick={() => fetchPackageRatesList(page - 1, search)}
                      />
                      {[...Array(totalPages).keys()].map((num) => (
                        <Pagination.Item
                          key={num}
                          active={num === page}
                          onClick={() => fetchPackageRatesList(num, search)}
                        >
                          {num + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={page === totalPages - 1}
                        onClick={() => fetchPackageRatesList(page + 1, search)}
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
                {viewMode
                  ? "View Package Rate"
                  : editing
                  ? "Edit Package Rate"
                  : "Create Package Rate"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form onSubmit={editing ? handleEdit : handleSave}>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Rate Code <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="Enter rate code"
                        value={formData.packagerateCode}
                        onChange={(e) => {
                          setFormData((prev) => ({
                            ...prev,
                            packagerateCode: e.target.value,
                          }));
                          if (validationErrors.packagerateCode) {
                            setValidationErrors((prev) => ({
                              ...prev,
                              packagerateCode: undefined,
                            }));
                          }
                        }}
                        isInvalid={!!validationErrors.packagerateCode}
                        readOnly={viewMode}
                      />
                      {validationErrors.packagerateCode && (
                        <Form.Control.Feedback type="invalid">
                          {validationErrors.packagerateCode}
                        </Form.Control.Feedback>
                      )}
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Market Type <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Select
                        value={formData.markettypeId}
                        onChange={(e) => {
                          const selectedValue = parseInt(e.target.value);
                          setFormData((prev) => ({
                            ...prev,
                            markettypeId: selectedValue,
                          }));
                          if (validationErrors.markettypeId) {
                            setValidationErrors((prev) => ({
                              ...prev,
                              markettypeId: undefined,
                            }));
                          }
                        }}
                        isInvalid={!!validationErrors.markettypeId}
                        disabled={viewMode}
                        readOnly={viewMode}
                      >
                        <option value="">Select Market</option>
                        {marketTypes.map((market) => (
                          <option
                            key={market.marketTypeId}
                            value={market.marketTypeId}
                          >
                            {market.name}
                          </option>
                        ))}
                      </Form.Select>
                      {validationErrors.markettypeId && (
                        <Form.Control.Feedback type="invalid">
                          {validationErrors.markettypeId}
                        </Form.Control.Feedback>
                      )}
                    </Form.Group>
                  </Col>
                </Row>

                {/* Food Type — moved into the Sharing Options section
                    header (see below) at client request, so it sits
                    inside Sharing Options and visually above every
                    Meal Plan Rates matrix. Left as a hidden anchor
                    here so text/anchor searches for "Food Type" still
                    land on the render block. */}

                <Row>
                  <Col md={6}>
                    <div className="mb-3">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6>Validity List</h6>
                        <Button
                          variant="outline-primary"
                          size="sm"
                          onClick={addValidityPeriod}
                          disabled={isAddingValidity || viewMode}
                        >
                          <FaPlus className="me-2" />
                          {isAddingValidity ? "Adding..." : "Add Period"}
                        </Button>
                      </div>
                      {validityList.map((validity, index) => (
                        <Card key={validity.id} className="mb-3">
                          <Card.Header className="d-flex justify-content-between align-items-center">
                            <h6 className="mb-0">
                              Validity Period {index + 1}
                            </h6>
                            {validityList.length > 1 && (
                              <Button
                                variant="outline-danger"
                                size="sm"
                                onClick={() =>
                                  removeValidityPeriod(validity.id)
                                }
                                disabled={viewMode}
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
                                  <Form.Label>Validity From</Form.Label>
                                  <DateTimeApplyPicker
                                    value={toDateTimeLocalValue(
                                      validity.validityFrom
                                    )}
                                    disabled={viewMode}
                                    onApply={(val) => {
                                      updateValidityPeriod(
                                        validity.id,
                                        "validityFrom",
                                        val
                                      );
                                      // Clear Validity To if the new From makes it invalid
                                      if (
                                        validity.validityTo &&
                                        val &&
                                        new Date(
                                          toDateTimeLocalValue(
                                            validity.validityTo
                                          )
                                        ) <= new Date(val)
                                      ) {
                                        updateValidityPeriod(
                                          validity.id,
                                          "validityTo",
                                          ""
                                        );
                                      }
                                    }}
                                  />
                                </Form.Group>
                              </Col>
                              <Col md={6}>
                                <Form.Group className="mb-3">
                                  <Form.Label>Validity To</Form.Label>
                                  <DateTimeApplyPicker
                                    value={toDateTimeLocalValue(
                                      validity.validityTo
                                    )}
                                    disabled={viewMode}
                                    minDate={
                                      validity.validityFrom
                                        ? parseLocalDateTime(
                                            toDateTimeLocalValue(
                                              validity.validityFrom
                                            )
                                          )
                                        : undefined
                                    }
                                    onApply={(val) =>
                                      updateValidityPeriod(
                                        validity.id,
                                        "validityTo",
                                        val
                                      )
                                    }
                                  />
                                </Form.Group>
                              </Col>
                            </Row>
                          </Card.Body>
                        </Card>
                      ))}
                      {validationErrors.validityList && (
                        <div className="text-danger small">
                          {validationErrors.validityList}
                        </div>
                      )}
                    </div>
                  </Col>

                  <Col md={6}>
                    <div className="mb-3">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6>Occupancy List</h6>
                        <Button
                          variant="outline-primary"
                          size="sm"
                          onClick={addOccupancy}
                          disabled={isAddingOccupancy || viewMode}
                        >
                          <FaPlus className="me-2" />
                          {isAddingOccupancy ? "Adding..." : "Add Occupancy"}
                        </Button>
                      </div>
                      {occupancyList.map((occupancy, index) => (
                        <Card key={occupancy.id} className="mb-3">
                          <Card.Header className="d-flex justify-content-between align-items-center">
                            <h6 className="mb-0">Occupancy {index + 1}</h6>
                            {occupancyList.length > 1 && (
                              <Button
                                variant="outline-danger"
                                size="sm"
                                onClick={() => removeOccupancy(occupancy.id)}
                                disabled={viewMode}
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
                                  <Form.Label>Minimum Pax</Form.Label>
                                  <Form.Control
                                    type="number"
                                    placeholder="Enter minimum pax"
                                    value={occupancy.minimumPax}
                                    onChange={(e) =>
                                      updateOccupancy(
                                        occupancy.id,
                                        "minimumPax",
                                        e.target.value
                                      )
                                    }
                                    readOnly={viewMode}
                                    disabled={viewMode}
                                  />
                                </Form.Group>
                              </Col>
                              <Col md={6}>
                                <Form.Group className="mb-3">
                                  <Form.Label>Maximum Pax</Form.Label>
                                  <Form.Control
                                    type="number"
                                    placeholder="Enter maximum pax"
                                    value={occupancy.maximumPax}
                                    onChange={(e) =>
                                      updateOccupancy(
                                        occupancy.id,
                                        "maximumPax",
                                        e.target.value
                                      )
                                    }
                                    readOnly={viewMode}
                                    disabled={viewMode}
                                  />
                                </Form.Group>
                              </Col>
                            </Row>
                          </Card.Body>
                        </Card>
                      ))}
                      {validationErrors.occupancyList && (
                        <div className="text-danger small">
                          {validationErrors.occupancyList}
                        </div>
                      )}
                      
                      {!showRateDetails && (
                        <div className="d-flex justify-content-end mt-4">
                          <Button 
                            variant="primary" 
                            onClick={() => {
                              // Optional: validate top sections before showing details
                              setShowRateDetails(true);
                            }}
                          >
                            Add Rates
                          </Button>
                        </div>
                      )}
                    </div>
                  </Col>
                </Row>

                {showRateDetails && (
                  <>

                <div className="mb-3">
                  <h6 className="border-bottom pb-2 mb-3">RATE DETAILS</h6>
                  <Row>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label>
                          Country <span className="text-danger">*</span>
                        </Form.Label>
                        <Select
                          value={selectedCountryOption}
                          onChange={handleCountryChange}
                          onInputChange={(inputValue) => {
                            if (countryDebounceRef.current) {
                              clearTimeout(countryDebounceRef.current);
                            }
                            countryDebounceRef.current = setTimeout(() => {
                              fetchCountries(inputValue);
                            }, 400);
                          }}
                          filterOption={() => true} // Server-side filtering
                          placeholder="Search and select country"
                          isSearchable
                          isClearable
                          isLoading={isCountryLoading}
                          options={countries}
                          isDisabled={viewMode}
                          className={`react-select-container ${
                            validationErrors.countryId ? "is-invalid" : ""
                          }`}
                          classNamePrefix="react-select"
                        />
                        {validationErrors.countryId && (
                          <div className="text-danger small mt-1">
                            {validationErrors.countryId}
                          </div>
                        )}
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label>
                          Place <span className="text-danger">*</span>
                        </Form.Label>
                        <SearchableSelect
                          name="placeId"
                          value={formData.placeId}
                          onChange={handlePlaceChange}
                          placeholder={
                            !formData.countryId
                              ? "Select country first"
                              : "Search and select place"
                          }
                          options={placeOptions}
                          disabled={!formData.countryId || viewMode}
                          isLoading={isLoadingPlaces}
                          isInvalid={!!validationErrors.placeId}
                        />
                        {validationErrors.placeId && (
                          <Form.Control.Feedback type="invalid">
                            {validationErrors.placeId}
                          </Form.Control.Feedback>
                        )}
                      </Form.Group>
                    </Col>
                    <Col md={4}>
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
                          disabled={viewMode}
                          readOnly={viewMode}
                        >
                          <option value="">SELECT</option>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
                            <option key={val} value={val}>
                              {val}
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
                </div>

                <div className="mb-3">
                  <h6>Sharing Options</h6>
                  {isLoadingPackageCategories ? (
                    <div className="text-center py-3">
                      <div
                        className="spinner-border spinner-border-sm me-2"
                        role="status"
                      >
                        <span className="visually-hidden">Loading...</span>
                      </div>
                      Loading package categories...
                    </div>
                  ) : Array.isArray(packageCategories) &&
                    packageCategories.length > 0 ? (
                    packageCategories.map((category) => {
                      const categoryKey = (
                        category.packageCategoryId ||
                        category.id ||
                        ""
                      ).toString();
                      return (
                        <Card
                          key={
                            category.packageCategoryId ||
                            category.id ||
                            Math.random()
                          }
                          className="mb-3"
                        >
                          <Card.Header>
                            <FormCheck
                              type="checkbox"
                              label={(
                                category.name ||
                                category.categoryName ||
                                "Unknown"
                              ).toUpperCase()}
                              checked={
                                formData.rates?.[categoryKey]?.enabled || false
                              }
                              onChange={(e) =>
                                handleSharingTypeChange(
                                  categoryKey,
                                  e.target.checked
                                )
                              }
                              disabled={viewMode}
                            />
                          </Card.Header>
                          <Card.Body>
                            {formData.rates?.[categoryKey]?.enabled && (
                              <>
                                {/* Two clean sub-sections per occupancy — Hotel
                                    Rates (hotel + room + 3 rates) and Meal
                                    Plan Rates (4 fixed rows × 3 rates). They
                                    save into the same backend list; hotel
                                    rows carry mealPlan=null, meal-plan rows
                                    carry hotelId=null. */}
                                {occupancyList.map((occ) => {
                                  const occRate = formData.rates?.[categoryKey]?.occupancyRates?.[occ.id] || {};
                                  const hotelRows = Array.isArray(occRate.hotelRows) ? occRate.hotelRows : [emptyHotelRow()];
                                  const commonRate = occRate.hotelCommonRate || emptyHotelCommonRate();
                                  const mpRates = occRate.mealPlanRates || emptyMealPlanRates();
                                  return (
                                    <div key={occ.id} className="mb-3">
                                      {occupancyList.length > 1 && (
                                        <div className="fw-semibold small text-muted mb-2">
                                          Occupancy: {occ.minimumPax || "?"} – {occ.maximumPax || "?"} pax
                                        </div>
                                      )}

                                      {/* Hotel Rates — one shared rate applies to every hotel/room
                                          listed below, so the client only enters it once. */}
                                      <div className="mb-3 border rounded p-3 bg-light bg-opacity-50">
                                        <div className="fw-semibold text-primary small mb-1">
                                          Hotel Rates
                                        </div>
                                        <div className="text-muted small mb-3">
                                          Set the rate once below — it applies to every hotel and room you list.
                                        </div>

                                        <div className="mb-3">
                                          <div className="small fw-semibold text-muted mb-2">
                                            1. Rate (applies to all hotels/rooms below)
                                          </div>
                                          <Row className="g-2">
                                            <Col md={4}>
                                              <Form.Label className="small mb-1">Per Adult Rate</Form.Label>
                                              <Form.Control
                                                size="sm"
                                                type="number"
                                                value={commonRate.adultRate ?? ""}
                                                onChange={(e) => updateHotelCommonRate(categoryKey, occ.id, "adultRate", e.target.value)}
                                                placeholder="0"
                                                disabled={viewMode}
                                                readOnly={viewMode}
                                              />
                                            </Col>
                                            <Col md={4}>
                                              <Form.Label className="small mb-1">Per Child (With Bed)</Form.Label>
                                              <Form.Control
                                                size="sm"
                                                type="number"
                                                value={commonRate.childWithBed ?? ""}
                                                onChange={(e) => updateHotelCommonRate(categoryKey, occ.id, "childWithBed", e.target.value)}
                                                placeholder="0"
                                                disabled={viewMode}
                                                readOnly={viewMode}
                                              />
                                            </Col>
                                            <Col md={4}>
                                              <Form.Label className="small mb-1">Per Child (Without Bed)</Form.Label>
                                              <Form.Control
                                                size="sm"
                                                type="number"
                                                value={commonRate.childWithoutBed ?? ""}
                                                onChange={(e) => updateHotelCommonRate(categoryKey, occ.id, "childWithoutBed", e.target.value)}
                                                placeholder="0"
                                                disabled={viewMode}
                                                readOnly={viewMode}
                                              />
                                            </Col>
                                          </Row>
                                        </div>

                                        <div className="d-flex justify-content-between align-items-center mb-2">
                                          <div className="small fw-semibold text-muted">
                                            2. Hotels &amp; room types using this rate
                                          </div>
                                          {!viewMode && (
                                            <Button
                                              size="sm"
                                              variant="outline-primary"
                                              onClick={() => addHotelRow(categoryKey, occ.id)}
                                            >
                                              <FaPlus className="me-1" /> Add Hotel
                                            </Button>
                                          )}
                                        </div>
                                        <div className="table-responsive">
                                          <Table bordered size="sm" className="mb-0 align-middle bg-white">
                                            <thead>
                                              <tr className="bg-light">
                                                <th style={{ minWidth: "220px" }}>Hotel</th>
                                                <th style={{ minWidth: "180px" }}>Room Type</th>
                                                <th style={{ width: "48px" }}></th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {hotelRows.map((row, rowIdx) => {
                                                const rooms = row.hotelId ? (roomTypesByHotel[row.hotelId] || []) : [];
                                                return (
                                                  <tr key={rowIdx}>
                                                    <td>
                                                      <Select
                                                        options={hotelOptions}
                                                        value={
                                                          row.hotelId
                                                            ? {
                                                                value: row.hotelId,
                                                                label: hotelCache[row.hotelId] || (isHotelsLoading ? "Loading..." : `Hotel #${row.hotelId}`),
                                                              }
                                                            : null
                                                        }
                                                        onChange={(opt) => updateHotelRowHotel(categoryKey, occ.id, rowIdx, opt)}
                                                        onInputChange={(inputValue) => {
                                                          if (hotelDebounceRef.current) clearTimeout(hotelDebounceRef.current);
                                                          hotelDebounceRef.current = setTimeout(() => {
                                                            fetchHotels(inputValue);
                                                          }, 400);
                                                        }}
                                                        filterOption={() => true}
                                                        isLoading={isHotelsLoading}
                                                        isClearable
                                                        placeholder="Select hotel..."
                                                        isDisabled={viewMode}
                                                        menuPortalTarget={document.body}
                                                        styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
                                                      />
                                                    </td>
                                                    <td>
                                                      <Form.Select
                                                        size="sm"
                                                        value={row.roomTypeId || ""}
                                                        onChange={(e) => updateHotelRowRoomType(categoryKey, occ.id, rowIdx, e.target.value)}
                                                        disabled={viewMode || !row.hotelId}
                                                      >
                                                        <option value="">
                                                          {row.hotelId
                                                            ? (rooms.length ? "Select..." : "Loading...")
                                                            : "Pick hotel first"}
                                                        </option>
                                                        {rooms.map((r) => (
                                                          <option
                                                            key={r.rommCategoryId || r.roomCategoryId}
                                                            value={r.rommCategoryId || r.roomCategoryId}
                                                          >
                                                            {r.roomCategory || `Room #${r.rommCategoryId || r.roomCategoryId}`}
                                                          </option>
                                                        ))}
                                                      </Form.Select>
                                                    </td>
                                                    <td className="text-end">
                                                      {!viewMode && hotelRows.length > 1 && (
                                                        <Button
                                                          size="sm"
                                                          variant="outline-danger"
                                                          onClick={() => removeHotelRow(categoryKey, occ.id, rowIdx)}
                                                        >
                                                          <FaTrash />
                                                        </Button>
                                                      )}
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </Table>
                                        </div>
                                      </div>

                                      {/* Food Type — rendered right above
                                          Meal Plan Rates per client request.
                                          formData.foodType is a single rate-
                                          level value, so ticking here reflects
                                          in every other occupancy render
                                          automatically. Small helper note
                                          included so the shared-state
                                          behaviour is visible. */}
                                      <div className="mb-2">
                                        <div className="fw-semibold text-primary small mb-1">
                                          Food Type <span className="text-danger">*</span>
                                        </div>
                                        <div
                                          className={`d-flex gap-4 pt-1 ${
                                            validationErrors.foodType ? "is-invalid" : ""
                                          }`}
                                        >
                                          {[
                                            { key: "VEG", label: "Veg" },
                                            { key: "NON_VEG", label: "Non-Veg" },
                                          ].map(({ key, label }) => {
                                            const current = formData.foodType || "";
                                            const checked = current === key || current === "BOTH";
                                            const inputId = `foodType-${key}-${categoryKey}-${occ.id}`;
                                            return (
                                              <Form.Check
                                                key={key}
                                                type="checkbox"
                                                id={inputId}
                                                label={label}
                                                checked={checked}
                                                disabled={viewMode}
                                                onChange={(e) => {
                                                  const isChecked = e.target.checked;
                                                  const otherKey = key === "VEG" ? "NON_VEG" : "VEG";
                                                  const otherChecked = current === otherKey || current === "BOTH";
                                                  let next;
                                                  if (isChecked && otherChecked) next = "BOTH";
                                                  else if (isChecked) next = key;
                                                  else if (otherChecked) next = otherKey;
                                                  else next = "";
                                                  setFormData((prev) => ({ ...prev, foodType: next }));
                                                  if (validationErrors.foodType) {
                                                    setValidationErrors((prev) => ({
                                                      ...prev,
                                                      foodType: undefined,
                                                    }));
                                                  }
                                                }}
                                              />
                                            );
                                          })}
                                        </div>
                                        {validationErrors.foodType && (
                                          <div className="invalid-feedback d-block">
                                            {validationErrors.foodType}
                                          </div>
                                        )}
                                      </div>

                                      {/* Meal Plan Rates */}
                                      <div>
                                        <div className="fw-semibold text-primary small mb-2">
                                          Meal Plan Rates
                                        </div>
                                        <div className="table-responsive">
                                          <Table bordered size="sm" className="mb-0 align-middle">
                                            <thead>
                                              <tr className="bg-light">
                                                <th style={{ minWidth: "160px" }}>Meal Plan</th>
                                                <th>Per Adult Rate</th>
                                                <th>Per Child With Bed</th>
                                                <th>Per Child Without Bed</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {MEAL_PLANS.map((mp) => {
                                                const p = mpRates[mp.key] || {};
                                                return (
                                                  <tr key={mp.key}>
                                                    <td>
                                                      <div className="fw-semibold small">{mp.label}</div>
                                                      {mp.key === "FB" && (
                                                        <Form.Select
                                                          size="sm"
                                                          className="mt-1"
                                                          value={p.lunchOrDinner || "LUNCH"}
                                                          onChange={(e) => updateMealPlanRate(categoryKey, occ.id, "FB", "lunchOrDinner", e.target.value)}
                                                          disabled={viewMode}
                                                        >
                                                          <option value="LUNCH">Lunch</option>
                                                          <option value="DINNER">Dinner</option>
                                                        </Form.Select>
                                                      )}
                                                    </td>
                                                    <td>
                                                      <Form.Control
                                                        size="sm"
                                                        type="number"
                                                        value={p.adultRate ?? ""}
                                                        onChange={(e) => updateMealPlanRate(categoryKey, occ.id, mp.key, "adultRate", e.target.value)}
                                                        placeholder="0"
                                                        disabled={viewMode}
                                                        readOnly={viewMode}
                                                      />
                                                    </td>
                                                    <td>
                                                      <Form.Control
                                                        size="sm"
                                                        type="number"
                                                        value={p.childWithBed ?? ""}
                                                        onChange={(e) => updateMealPlanRate(categoryKey, occ.id, mp.key, "childWithBed", e.target.value)}
                                                        placeholder="0"
                                                        disabled={viewMode}
                                                        readOnly={viewMode}
                                                      />
                                                    </td>
                                                    <td>
                                                      <Form.Control
                                                        size="sm"
                                                        type="number"
                                                        value={p.childWithoutBed ?? ""}
                                                        onChange={(e) => updateMealPlanRate(categoryKey, occ.id, mp.key, "childWithoutBed", e.target.value)}
                                                        placeholder="0"
                                                        disabled={viewMode}
                                                        readOnly={viewMode}
                                                      />
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </Table>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </>
                            )}
                            {!formData.rates?.[categoryKey]?.enabled && (
                              <div className="text-muted text-center py-2 italic text-sm">
                                Enable sharing option above to enter rates.
                              </div>
                            )}
                          </Card.Body>
                        </Card>
                      );
                    })
                  ) : (
                    <div className="text-center py-3 text-muted">
                      <p>No package categories found for this package.</p>
                      <small>
                        Please ensure the package has categories defined in
                        Package Registration.
                      </small>
                    </div>
                  )}
                  {validationErrors.sharingTypes && (
                    <div className="text-danger small mt-2">
                      {validationErrors.sharingTypes}
                    </div>
                  )}
                </div>
              </>
            )}
            </Form>
            </Modal.Body>
            <Modal.Footer>
              {!viewMode && (
                <>
                  <Button variant="danger" onClick={closeModal}>
                    <i className="fas fa-times me-2"></i>
                    Cancel
                  </Button>
                  <Button
                    variant="success"
                    onClick={editing ? handleEdit : handleSave}
                  >
                    <i className="fas fa-arrow-right me-2"></i>
                    {editing ? "Update" : "Create"}
                  </Button>
                </>
              )}
            </Modal.Footer>
          </Modal>

          {/* Validity list — read-only side modal opened from the "View" link
              in the Validity column. Lists every period attached to one rate. */}
          <Modal
            show={!!validityModalItem}
            onHide={() => setValidityModalItem(null)}
            centered
            size="md"
          >
            <Modal.Header closeButton>
              <Modal.Title className="fs-6">
                Validity Periods
                {validityModalItem?.packagerateCode
                  ? ` — ${validityModalItem.packagerateCode}`
                  : ""}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {Array.isArray(validityModalItem?.packageRateValidityDTO) &&
              validityModalItem.packageRateValidityDTO.length > 0 ? (
                <Table bordered size="sm" className="mb-0 align-middle">
                  <thead>
                    <tr className="bg-light">
                      <th style={{ width: 60 }}>#</th>
                      <th>Validity From</th>
                      <th>Validity To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validityModalItem.packageRateValidityDTO.map((v, i) => (
                      <tr key={v.packagerateValidityId || i}>
                        <td>{i + 1}</td>
                        <td>{formatValidityDisplay(v.validityfrom)}</td>
                        <td>{formatValidityDisplay(v.validityto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <div className="text-center text-muted py-3">
                  No validity periods found.
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={() => setValidityModalItem(null)}
              >
                Close
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
};

export default PackageRates;