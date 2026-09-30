import React, { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import Select from "react-select";
import {
  FaEdit,
  FaTrash,
  FaEye,
  FaPlus,
  FaDollarSign,
  FaMapMarkedAlt,
  FaMapSigns,
  FaGlobeAsia,
  FaArrowLeft,
} from "react-icons/fa";
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
        const optionName =
          option.name ||
          String(option);
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
        value={
          isOpen
            ? searchTerm
            : selectedOption?.name ||
             ""
        }
        onChange={(e) => {
          if (disabled) return;
          if (isOpen) {
            setSearchTerm(e.target.value);
          } else {
            // If not open, open dropdown and set search term
            setIsOpen(true);
            setSearchTerm(e.target.value);
          }
        }}
        onFocus={() => !disabled && setIsOpen(true)}
        placeholder={placeholder}
        className={`form-input ${isInvalid ? "is-invalid" : ""}`}
        disabled={disabled}
        readOnly={disabled}
        autoComplete="off"
      />

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

const SchefferDriverReg = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isViewMode, setIsViewMode] = useState(false);
  const [countries, setCountries] = useState([]);
  const [places, setPlaces] = useState([]);
  const [cabList, setCabList] = useState([]);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);
  const [pickupDropoffList, setPickupDropoffList] = useState([]);

  // ── Cab Zones (per-cab pickup/dropoff locations) ───────────────────────────
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [zoneProvider, setZoneProvider] = useState(null);   // selected cab provider
  const [zoneProviderCabs, setZoneProviderCabs] = useState([]); // cabs of that provider
  const [zoneSelectedCabId, setZoneSelectedCabId] = useState("");
  const [zoneLocationOptions, setZoneLocationOptions] = useState([]); // combined sublocations + destinations
  const [zonePickupSelected, setZonePickupSelected] = useState([]);   // [{value:"SUBLOCATION:3", label, source, locationId, locationName}]
  const [zoneDropoffSelected, setZoneDropoffSelected] = useState([]);
  const [zoneLoading, setZoneLoading] = useState(false);
  const [zoneSaving, setZoneSaving] = useState(false);
  // Cache of existing zones for the provider, keyed by cabId (string).
  // Populated once when the modal opens via /api/scheffer-zones/by-provider/{id}
  // so picking a cab from the dropdown shows its prior data instantly.
  const [zonesByCabId, setZonesByCabId] = useState({});

  const buildZoneOption = (item) => ({
    value: `${item.source}:${item.id}`,
    label: item.name,
    subtitle: item.subtitle || "",
    source: item.source,
    locationId: Number(item.id),
    locationName: item.name,
    code: item.code || null,
    subLocationId: item.subLocationId || null,
    subLocationName: item.subLocationName || null,
  });

  // Combined Zones / Hotels / Airports source — driven by the new
  // /api/scheffer-search/lookup endpoint. The provider registers the cab's
  // pickup / dropoff against any of these so the cab-search can match
  // them later.
  const fetchZoneLocationOptions = async (search = "") => {
    try {
      const res = await axiosInstance.get(
        `/api/scheffer-search/lookup?search=${encodeURIComponent(search)}&limit=20`
      );
      const d = res?.data || {};
      const groups = [];
      const zones = Array.isArray(d.zones) ? d.zones : [];
      const hotels = Array.isArray(d.hotels) ? d.hotels : [];
      const airports = Array.isArray(d.airports) ? d.airports : [];
      if (zones.length > 0) {
        groups.push({ label: "ZONES", options: zones.map(buildZoneOption) });
      }
      if (hotels.length > 0) {
        groups.push({ label: "HOTELS", options: hotels.map(buildZoneOption) });
      }
      if (airports.length > 0) {
        groups.push({
          label: "AIRPORTS",
          options: airports.map(buildZoneOption),
        });
      }
      setZoneLocationOptions(groups);
    } catch (err) {
      console.error("Error loading zone location options:", err);
      setZoneLocationOptions([]);
    }
  };

  const formatZoneOptionLabel = (opt) => (
    <div>
      <div className="fw-semibold">{opt.label}</div>
      {opt.subtitle && <small className="text-muted">{opt.subtitle}</small>}
    </div>
  );

  const zoneLocationToOption = (loc) => ({
    value: `${loc.source}:${loc.locationId}`,
    label:
      loc.source === "SUBLOCATION"
        ? `${loc.locationName} (Locality)`
        : `${loc.locationName} (Destination)`,
    source: loc.source,
    locationId: Number(loc.locationId),
    locationName: loc.locationName,
  });

  // Apply a cached zone (from zonesByCabId) into the pickup/dropoff selects.
  const applyZoneToSelections = (zone) => {
    if (!zone) {
      setZonePickupSelected([]);
      setZoneDropoffSelected([]);
      return;
    }
    setZonePickupSelected((zone.pickupLocations || []).map(zoneLocationToOption));
    setZoneDropoffSelected((zone.dropoffLocations || []).map(zoneLocationToOption));
  };

  // Fallback path: fetch the cab's zone from the server if it isn't cached.
  // Result is also written into the cache so subsequent picks are instant.
  const loadZoneForCab = async (cabId) => {
    if (!cabId) {
      setZonePickupSelected([]);
      setZoneDropoffSelected([]);
      return;
    }
    try {
      const res = await axiosInstance.get(`/api/scheffer-zones/by-cab/${cabId}`);
      const zone = res.data || null;
      setZonesByCabId((prev) => ({ ...prev, [String(cabId)]: zone }));
      applyZoneToSelections(zone);
    } catch (err) {
      console.error("Error loading zone for cab:", err);
      setZonePickupSelected([]);
      setZoneDropoffSelected([]);
    }
  };

  const openZoneModal = async (provider) => {
    setZoneProvider(provider);
    setZoneSelectedCabId("");
    setZonePickupSelected([]);
    setZoneDropoffSelected([]);
    setZoneProviderCabs([]);
    setZonesByCabId({});
    setShowZoneModal(true);
    setZoneLoading(true);
    try {
      const providerId = provider.cabprovider || provider.id;
      // Fetch in parallel: cabs of this provider, the combined location list,
      // and any zones already saved for this provider so picking a cab below
      // shows its prior data instantly.
      const [cabsRes, zonesRes] = await Promise.all([
        axiosInstance.get(`/api/SchefferDriver/cabs/${providerId}`),
        fetchZoneLocationOptions(),
        axiosInstance.get(`/api/scheffer-zones/by-provider/${providerId}`),
      ]).then(([cabsResLocal, , zonesResLocal]) => [cabsResLocal, zonesResLocal]);

      const cabs = Array.isArray(cabsRes.data) ? cabsRes.data : [];
      setZoneProviderCabs(cabs);

      const zoneList = Array.isArray(zonesRes?.data) ? zonesRes.data : [];
      const cache = {};
      zoneList.forEach((z) => {
        if (z && z.cabId != null) {
          cache[String(z.cabId)] = z;
        }
      });
      setZonesByCabId(cache);

      // If exactly one cab exists, auto-select it so the user sees the
      // saved zone (if any) without an extra click.
      if (cabs.length === 1) {
        const onlyCabId = String(cabs[0].cabId || cabs[0].id || "");
        if (onlyCabId) {
          setZoneSelectedCabId(onlyCabId);
          applyZoneToSelections(cache[onlyCabId]);
        }
      }
    } catch (err) {
      console.error("Error opening zone modal:", err);
      toast.error("Failed to load cabs for this provider");
    } finally {
      setZoneLoading(false);
    }
  };

  const closeZoneModal = () => {
    if (zoneSaving) return;
    setShowZoneModal(false);
    setZoneProvider(null);
    setZoneSelectedCabId("");
    setZonePickupSelected([]);
    setZoneDropoffSelected([]);
    setZoneProviderCabs([]);
    setZonesByCabId({});
  };

  const handleZoneCabChange = async (e) => {
    const cabId = e.target.value;
    setZoneSelectedCabId(cabId);
    if (!cabId) {
      setZonePickupSelected([]);
      setZoneDropoffSelected([]);
      return;
    }
    // Prefer the cached zone fetched on modal open; only hit the network if
    // the cache doesn't have it (e.g., a zone created after the modal opened).
    const cached = zonesByCabId[String(cabId)];
    if (cached !== undefined) {
      applyZoneToSelections(cached);
    } else {
      await loadZoneForCab(cabId);
    }
  };

  const handleSaveZone = async () => {
    if (!zoneSelectedCabId) {
      toast.error("Please select a cab first");
      return;
    }
    if (zonePickupSelected.length === 0 && zoneDropoffSelected.length === 0) {
      toast.error("Add at least one pickup or dropoff location");
      return;
    }
    const providerId = zoneProvider?.cabprovider || zoneProvider?.id;
    const cab = zoneProviderCabs.find(
      (c) => String(c.cabId || c.id) === String(zoneSelectedCabId)
    );
    const payload = {
      cabProviderId: Number(providerId),
      cabId: Number(zoneSelectedCabId),
      cabName: cab?.name || cab?.cabName || "",
      pickupLocations: zonePickupSelected.map((o) => ({
        source: o.source,
        locationId: o.locationId,
        locationName: o.locationName,
      })),
      dropoffLocations: zoneDropoffSelected.map((o) => ({
        source: o.source,
        locationId: o.locationId,
        locationName: o.locationName,
      })),
    };
    try {
      setZoneSaving(true);
      const saveRes = await axiosInstance.post("/api/scheffer-zones/save", payload);
      // Refresh the cache for this cab so the next open shows the latest data.
      const savedZone = saveRes?.data || null;
      if (savedZone) {
        setZonesByCabId((prev) => ({
          ...prev,
          [String(zoneSelectedCabId)]: savedZone,
        }));
      }
      toast.success("Zone saved");
      closeZoneModal();
    } catch (err) {
      console.error("Error saving zone:", err);
      toast.error("Failed to save zone");
    } finally {
      setZoneSaving(false);
    }
  };

  // Hotel & Airport lookup lists used by the per-location Pickup/Dropoff Type dropdowns.
  // Fetched once when the create/edit modal opens.
  const [hotelOptionList, setHotelOptionList] = useState([]);
  const [airportOptionList, setAirportOptionList] = useState([]);

  // Cab-type master, feeds the Cab Type dropdown. Fetched once on mount and on
  // modal open so a freshly-added type at /masters/cab-type is picked up.
  // Each row: { id, name, adultCount, childCount }.
  const [cabTypeOptions, setCabTypeOptions] = useState([]);
  const fetchCabTypeOptions = async () => {
    try {
      const res = await axiosInstance.get("/api/masterCabType?page=0&limit=200");
      const arr = Array.isArray(res.data)
        ? res.data
        : res.data?.content || [];
      setCabTypeOptions(arr);
    } catch {
      setCabTypeOptions([]);
    }
  };
  useEffect(() => {
    fetchCabTypeOptions();
  }, []);

  const fetchHotelOptionList = async () => {
    try {
      const res = await axiosInstance.get("/api/hotels?page=0&limit=20");
      const arr = Array.isArray(res.data)
        ? res.data
        : res.data?.content || res.data?.hotels || [];
      const opts = (arr || []).map((h) => ({
        value: String(h.id ?? h.hotelId ?? ""),
        label: h.hotelName || h.name || `Hotel #${h.id ?? h.hotelId ?? ""}`,
        location:
          h.location ||
          h.placeName ||
          h.cityName ||
          h.city ||
          "",
        address: h.address || "",
      }));
      setHotelOptionList(opts);
    } catch {
      setHotelOptionList([]);
    }
  };

  const fetchAirportOptionList = async () => {
    try {
      const res = await axiosInstance.get("/api/airport?page=0&limit=10");
      const arr = Array.isArray(res.data)
        ? res.data
        : res.data?.content || [];
      const opts = (arr || []).map((a) => ({
        value: String(a.id ?? ""),
        label: a.airportName || `Airport #${a.id}`,
        code: a.airportCode || "",
        location:
          [a.cityName, a.countryName].filter(Boolean).join(", ") ||
          a.placeName ||
          "",
      }));
      setAirportOptionList(opts);
    } catch {
      setAirportOptionList([]);
    }
  };
  const [editingCab, setEditingCab] = useState(null);
  const [placeLookup, setPlaceLookup] = useState({});
  const [selectedCountryOption, setSelectedCountryOption] = useState(null);
  const [isCountryLoading, setIsCountryLoading] = useState(false);
  const countryDebounceRef = useRef(null);
  const placeOptions = useMemo(() => {
    return Array.isArray(places) ? places : [];
  }, [places]);
  const getPlaceIdString = (cab) => {
    const rawId =
      cab.placeid ??
      cab.placeId ??
      cab.placeID ??
      cab.place_id ??
      cab.place ??
      "";
    return rawId !== undefined && rawId !== null ? String(rawId) : "";
  };

  const resolvePlaceName = (cab, lookup = placeLookup) => {
    const placeId = getPlaceIdString(cab);
    return (
      cab.placeName ||
      cab.stateName ||
      cab.cityName ||
      cab.place ||
      (placeId ? lookup[placeId] : "") ||
      ""
    );
  };

  const normalizeCab = (cab, lookup = placeLookup) => {
    const placeId = getPlaceIdString(cab);
    return {
      ...cab,
      placeid: placeId,
      placeName: resolvePlaceName({ ...cab, placeid: placeId }, lookup),
    };
  };
  const [formData, setFormData] = useState({
    cabProviderName: "",
    contactPerson: "",
    contactNumber: "",
    email: "",
    cabCode: "",
    cabName: "",
    cabType: "",
    countryId: "",
    placeId: "",
    pickup: "",
    dropOff: "",
    cabImage: null,
    maxCapacity: "",
    maxLuggageCapacity: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState({});
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState("");
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

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
      className: `${additionalProps.className || ""} ${
        isViewMode ? "bg-light" : ""
      }`.trim(),
      autoFocus: isViewMode ? false : additionalProps.autoFocus,
    };
  };

  const openCreate = () => {
    setEditing(null);
    setFormData({
      cabProviderName: "",
      contactPerson: "",
      contactNumber: "",
        email: "",
      cabCode: "",
      cabName: "",
      countryId: "",
      placeId: "",
      pickup: "",
      dropOff: "",
      maxCapacity: "",
      maxLuggageCapacity: "",
    });
    setCabList([]);
    setPlaces([]);
    setSelectedCountryOption(null);
    fetchCountries("");
    setIsLoadingPlaces(false);
    setValidationErrors({});
    setError("");
    setShowModal(true);
  };

  // Fetch full provider details fresh from the backend and populate all modal
  // state from the response. Used by both Edit and View so the modal always
  // reflects DB state, never the (potentially stale) row data from the list.
  const loadProviderDetails = async (providerId, viewMode) => {
    setIsDetailLoading(true);
    try {
      const res = await axiosInstance.get(`/api/SchefferDriver/${providerId}`);
      const data = res?.data || {};

      setFormData({
        cabProviderName: data.providername || "",
        contactPerson: data.contactperson || "",
        contactNumber: data.phonenumber || "",
        email: data.emailid || "",
        cabCode: "",
        cabName: "",
        cabType: "",
        countryId: "",
        placeId: "",
        pickup: "",
        dropOff: "",
        cabImage: null,
        maxCapacity: "",
        maxLuggageCapacity: "",
      });

      const rawCabs = Array.isArray(data.cabList) ? data.cabList : [];
      const normalized = rawCabs.map((cab) => normalizeCab(cab));
      setCabList(normalized);

      // View mode: preselect the first cab so the form fields show its data,
      // and hydrate the pickup/dropoff list from its locations.
      if (viewMode) {
        const firstCab = rawCabs[0] || null;
        if (firstCab) {
          setFormData((prev) => ({
            ...prev,
            cabCode: firstCab.cabCode || "",
            cabName: firstCab.name || "",
            cabType: firstCab.cabType || "",
            countryId: String(firstCab.countryid || ""),
            placeId: String(firstCab.placeid || ""),
            maxCapacity:
              firstCab.maxCapacity != null ? String(firstCab.maxCapacity) : "",
            maxLuggageCapacity:
              firstCab.maxLuggageCapacity != null
                ? String(firstCab.maxLuggageCapacity)
                : "",
          }));
          if (firstCab.countryid) {
            cityList(firstCab.countryid);
            fetchCountries("").then((options) => {
              const matched = (options || []).find(
                (c) => String(c.value) === String(firstCab.countryid)
              );
              if (matched) setSelectedCountryOption(matched);
            });
          }
          const locs = Array.isArray(firstCab.cabLocationDTOList)
            ? firstCab.cabLocationDTOList
            : [];
          if (locs.length > 0) {
            if (hotelOptionList.length === 0) fetchHotelOptionList();
            if (airportOptionList.length === 0) fetchAirportOptionList();
            setPickupDropoffList(
              locs.map((location, idx) => ({
                id: location.cablocationId || Date.now() + idx,
                pickupType: location.pickupType || "Other",
                pickupRefId:
                  location.pickupRefId != null
                    ? String(location.pickupRefId)
                    : null,
                pickup: location.pickup || "",
                pickupLocation: location.pickupLocation || "",
                pickupAddress: location.pickupAddress || "",
                dropoffType: location.dropoffType || "Other",
                dropoffRefId:
                  location.dropoffRefId != null
                    ? String(location.dropoffRefId)
                    : null,
                dropOff: location.dropoff || "",
                dropoffLocation: location.dropoffLocation || "",
                dropoffAddress: location.dropoffAddress || "",
              }))
            );
          } else {
            setPickupDropoffList([]);
          }
        } else {
          setPickupDropoffList([]);
          setSelectedCountryOption(null);
          fetchCountries("");
        }
      } else {
        // Edit mode: cab form is empty; user edits cabs individually from the list.
        setPickupDropoffList([]);
        setSelectedCountryOption(null);
        fetchCountries("");
      }
    } catch (err) {
      console.error("Failed to load cab provider details:", err);
      toast.error(
        `Failed to load cab provider details: ${
          err.response?.data?.message || err.message
        }`
      );
      setCabList([]);
      setPickupDropoffList([]);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const openEdit = (item) => {
    setEditing(item);
    setIsViewMode(false);
    setPlaces([]);
    setEditingCab(null);
    setValidationErrors({});
    setError("");
    setShowModal(true);
    loadProviderDetails(item.cabprovider || item.id, false);
  };

  const handleView = (item) => {
    setEditing(item);
    setIsViewMode(true);
    setPlaces([]);
    setEditingCab(null);
    setValidationErrors({});
    setError("");
    setShowModal(true);
    loadProviderDetails(item.cabprovider || item.id, true);
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


  const cityList = async (countryId) => {
    try {
      setIsLoadingPlaces(true);

      const response = await axiosInstance.get(
        `/api/province/getByCountryId/${countryId}`
      );

      const provinces = Array.isArray(response.data) ? response.data : [];

      const formattedPlaces = provinces
        .map((province) => {
          const rawId =
            province.id ??
            province.stateId ??
            province.placeId ??
            province.provinceId ??
            "";

          const displayName =
            province.stateName ||
            province.name ||
            province.placeName ||
            province.stateCode ||
            "";

          if (!rawId || !displayName) {
            return null;
          }

          return {
            id: String(rawId),
            name: displayName,
          };
        })
        .filter(Boolean);

      setPlaces(formattedPlaces);
      if (formattedPlaces.length > 0) {
        setPlaceLookup((prev) => {
          const next = { ...prev };
          formattedPlaces.forEach((place) => {
            if (place.id) {
              next[place.id] = place.name;
            }
          });
          return next;
        });
      }
    } catch (error) {
      console.log("axios call error for city list : ", error);
      setPlaces([]);
    } finally {
      setIsLoadingPlaces(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const missingPlaceCabs = cabList.filter((cab) => {
      const placeId = String(cab.placeid || cab.placeId || "");
      if (!placeId) return false;
      return !(cab.placeName || placeLookup[placeId]);
    });

    if (missingPlaceCabs.length === 0) {
      return () => {
        isMounted = false;
      };
    }

    const fetchAndUpdatePlaces = async () => {
      const nameUpdates = {};
      const uniqueCountryIds = [
        ...new Set(
          missingPlaceCabs
            .map((cab) => cab.countryid || cab.countryId)
            .filter(Boolean)
        ),
      ];

      for (const countryId of uniqueCountryIds) {
        try {
          const res = await axiosInstance.get(
            `/api/province/getByCountryId/${countryId}`
          );
          const provinces = Array.isArray(res.data) ? res.data : [];
          provinces.forEach((province) => {
            const rawId =
              province.id ??
              province.stateId ??
              province.placeId ??
              province.provinceId ??
              "";
            const displayName =
              province.stateName ||
              province.name ||
              province.placeName ||
              province.stateCode ||
              "";
            if (rawId && displayName) {
              nameUpdates[String(rawId)] = displayName;
            }
          });
        } catch (error) {
          console.log(
            "Failed to load provinces for country",
            countryId,
            error
          );
        }
      }

      if (!isMounted || Object.keys(nameUpdates).length === 0) {
        return;
      }

      setPlaceLookup((prev) => ({
        ...prev,
        ...nameUpdates,
      }));

      setCabList((prev) =>
        prev.map((cab) => {
          const placeId = String(cab.placeid || cab.placeId || "");
          if (!placeId || cab.placeName) {
            return cab;
          }
          const resolvedName =
            nameUpdates[placeId] ||
            placeLookup[placeId] ||
            cab.stateName ||
            cab.place ||
            cab.placeid;
          if (!resolvedName) {
            return cab;
          }
          return {
            ...cab,
            placeName: resolvedName,
          };
        })
      );
    };

    fetchAndUpdatePlaces();

    return () => {
      isMounted = false;
    };
  }, [cabList, placeLookup]);

  // Handle country change
  const handleCountryChange = (option) => {
    try {
      const value = option ? String(option.value) : "";
      setSelectedCountryOption(option);
      
      console.log(
        "Country selected:",
        value
      );
      
      // Clear places and place selection when country changes
      setPlaces([]);
      setIsLoadingPlaces(false);
      
      setFormData((prev) => ({
        ...prev,
        countryId: value,
        placeId: "", // Clear place selection
      }));
      
      // Fetch cities for the selected country
      if (value) {
        cityList(value);
      }
      
      // Clear validation errors
      if (validationErrors.countryId) {
        setValidationErrors(prev => ({
          ...prev,
          countryId: ""
        }));
      }
      if (validationErrors.placeId) {
        setValidationErrors(prev => ({
          ...prev,
          placeId: ""
        }));
      }
    } catch (error) {
      console.error("Error in handleCountryChange:", error);
    }
  };

  // Handle place change
  const handlePlaceChange = (e) => {
    const value = e.target.value;
    const stringValue = String(value); // Convert to string for consistency
    console.log("Place selected:", value);
    
    setFormData(prev => ({
      ...prev,
      placeId: stringValue,
    }));
    
    // Clear validation error when user makes selection
    if (validationErrors.placeId) {
      setValidationErrors(prev => ({
        ...prev,
        placeId: ""
      }));
    }
  };

  // Remove duplicate useEffect hooks - country change is handled in handleCountryChange

  // Add cab to list
  const addCabToList = () => {
    if (!formData.cabCode || !formData.cabName || !formData.countryId || !formData.placeId) {
      toast.error("Please fill cab code, name, country and place before adding to list");
      return;
    }

    // Pickup/dropoff locations are now managed per-cab via the Zone icon on
    // the cab provider list (after the provider is saved), not in this modal.

    const placeIdString = String(formData.placeId);
    const selectedPlaceName =
      placeLookup[placeIdString] ||
      placeOptions.find((place) => String(place.id) === placeIdString)?.name ||
      "";

    const parsedMaxCapacity =
      formData.maxCapacity === "" || formData.maxCapacity == null
        ? null
        : parseInt(formData.maxCapacity, 10);
    const parsedMaxLuggageCapacity =
      formData.maxLuggageCapacity === "" || formData.maxLuggageCapacity == null
        ? null
        : parseInt(formData.maxLuggageCapacity, 10);

    const newCab = {
      cabId: editingCab ? editingCab.cabId : Date.now(), // Keep existing ID if editing
      cabCode: formData.cabCode,
      name: formData.cabName, // Use 'name' to match your data structure
      cabType: formData.cabType || "", // chauffeur-rental vehicle class
      countryid: formData.countryId, // Use 'countryid' to match your data structure
      placeid: formData.placeId, // Use 'placeid' to match your data structure
      placeName: selectedPlaceName,
      cabImage: formData.cabImage, // Include the uploaded image
      maxCapacity: Number.isFinite(parsedMaxCapacity) ? parsedMaxCapacity : null,
      maxLuggageCapacity: Number.isFinite(parsedMaxLuggageCapacity)
        ? parsedMaxLuggageCapacity
        : null,
      cabLocationDTOList: pickupDropoffList.map((location, index) => ({
        cablocationId: location.id || Date.now() + index,
        cabid: null,
        pickup: location.pickup,
        dropoff: location.dropOff,
        pickupType: location.pickupType || "Other",
        pickupRefId: location.pickupRefId
          ? Number(location.pickupRefId)
          : null,
        pickupLocation: location.pickupLocation || null,
        pickupAddress: location.pickupAddress || null,
        dropoffType: location.dropoffType || "Other",
        dropoffRefId: location.dropoffRefId
          ? Number(location.dropoffRefId)
          : null,
        dropoffLocation: location.dropoffLocation || null,
        dropoffAddress: location.dropoffAddress || null,
      }))
    };

    const normalizedCab = normalizeCab(newCab);
    setCabList((prev) => [...prev, normalizedCab]);
    
    // Clear cab form fields and pickup/dropoff list
    setFormData(prev => ({
      ...prev,
      cabCode: "",
      cabName: "",
      cabType: "",
      countryId: "",
      placeId: "",
      pickup: "",
      dropOff: "",
      cabImage: null,
      maxCapacity: "",
      maxLuggageCapacity: "",
    }));
    setPlaces([]);
    setPickupDropoffList([]); // Clear pickup/dropoff list
    setEditingCab(null); // Clear editing cab
  };

  // Remove cab from list
  const removeCabFromList = (cabId) => {
    setCabList(cabList.filter(cab => (cab.cabId || cab.id) !== cabId));
  };

  // Edit existing cab - populate form fields with cab data
  const editCabFromList = (cab) => {
    console.log("Editing cab:", cab);
    
    // Store the cab being edited
    setEditingCab(cab);
    
    // Populate form fields with existing cab data
    setFormData(prev => ({
      ...prev,
      cabCode: cab.cabCode || "",
      cabName: cab.name || "",
      cabType: cab.cabType || "",
      countryId: String(cab.countryid || ""),
      placeId: String(cab.placeid || ""),
      cabImage: cab.cabImage || null,
      maxCapacity: cab.maxCapacity != null ? String(cab.maxCapacity) : "",
      maxLuggageCapacity:
        cab.maxLuggageCapacity != null ? String(cab.maxLuggageCapacity) : "",
    }));

    // Set pickup/dropoff locations for editing
    if (cab.cabLocationDTOList && cab.cabLocationDTOList.length > 0) {
      // Ensure lookup lists are warm so the dropdowns can preselect.
      if (hotelOptionList.length === 0) fetchHotelOptionList();
      if (airportOptionList.length === 0) fetchAirportOptionList();
      const locations = cab.cabLocationDTOList.map((location, index) => ({
        id: location.cablocationId || Date.now() + index,
        pickupType: location.pickupType || "Other",
        pickupRefId: location.pickupRefId != null ? String(location.pickupRefId) : null,
        pickup: location.pickup || "",
        pickupLocation: location.pickupLocation || "",
        pickupAddress: location.pickupAddress || "",
        dropoffType: location.dropoffType || "Other",
        dropoffRefId: location.dropoffRefId != null ? String(location.dropoffRefId) : null,
        dropOff: location.dropoff || "",
        dropoffLocation: location.dropoffLocation || "",
        dropoffAddress: location.dropoffAddress || "",
      }));
      setPickupDropoffList(locations);
    } else {
      setPickupDropoffList([]);
    }

    // Load places for the selected country
    if (cab.countryid) {
      cityList(cab.countryid);
    }

    // Remove the cab from the list temporarily while editing
    setCabList(cabList.filter(c => (c.cabId || c.id) !== (cab.cabId || cab.id)));

    // Resolve country for editing
    if (cab.countryid) {
      fetchCountries("").then((options) => {
        const matched = (options || []).find(
          (c) => String(c.value) === String(cab.countryid)
        );
        if (matched) {
          setSelectedCountryOption(matched);
        }
      });
    } else {
      setSelectedCountryOption(null);
      fetchCountries("");
    }
  };

  // Add pickup/dropoff location
  const addPickupDropoff = () => {
    // Lazy-fetch lookups the first time a location is added in this modal session.
    if (hotelOptionList.length === 0) fetchHotelOptionList();
    if (airportOptionList.length === 0) fetchAirportOptionList();
    const newLocation = {
      id: Date.now(),
      pickupType: "Other",
      pickupRefId: null,
      pickup: "",
      pickupLocation: "",
      pickupAddress: "",
      dropoffType: "Other",
      dropoffRefId: null,
      dropOff: "",
      dropoffLocation: "",
      dropoffAddress: "",
    };
    setPickupDropoffList([...pickupDropoffList, newLocation]);
  };

  // When the user picks a Hotel/Airport from the typed dropdown, mirror the
  // selection into the location row so the existing save/validation logic
  // (which reads `pickup` / `dropOff`) continues to work, and we also retain
  // the structured ref id + location + address for richer display/save.
  const setLocationTypeSelection = (locationId, side, option) => {
    const isPickup = side === "pickup";
    setPickupDropoffList((prev) =>
      prev.map((loc) =>
        loc.id !== locationId
          ? loc
          : {
              ...loc,
              [isPickup ? "pickupRefId" : "dropoffRefId"]: option ? option.value : null,
              [isPickup ? "pickup" : "dropOff"]: option ? option.label : "",
              [isPickup ? "pickupLocation" : "dropoffLocation"]: option ? option.location || "" : "",
              [isPickup ? "pickupAddress" : "dropoffAddress"]:
                option ? option.address || option.code || "" : "",
            }
      )
    );
  };

  const setLocationType = (locationId, side, type) => {
    const isPickup = side === "pickup";
    setPickupDropoffList((prev) =>
      prev.map((loc) =>
        loc.id !== locationId
          ? loc
          : {
              ...loc,
              [isPickup ? "pickupType" : "dropoffType"]: type,
              // Reset the dependent fields when the type changes
              [isPickup ? "pickupRefId" : "dropoffRefId"]: null,
              [isPickup ? "pickup" : "dropOff"]: "",
              [isPickup ? "pickupLocation" : "dropoffLocation"]: "",
              [isPickup ? "pickupAddress" : "dropoffAddress"]: "",
            }
      )
    );
  };

  // Remove pickup/dropoff location
  const removePickupDropoff = (locationId) => {
    setPickupDropoffList(pickupDropoffList.filter(location => location.id !== locationId));
  };

  // Update pickup/dropoff location
  const updatePickupDropoff = (locationId, field, value) => {
    setPickupDropoffList(pickupDropoffList.map(location => 
      location.id === locationId 
        ? { ...location, [field]: value }
        : location
    ));
  };

  // Validation function
  const validateCabForm = (data) => {
    const newErrors = {};

    const getStringValue = (value) => {
      return value ? String(value).trim() : "";
    };

    // Required field validations
    if (!getStringValue(data.cabProviderName))
      newErrors.cabProviderName = "Cab Provider Name is required";
    if (!getStringValue(data.contactNumber))
      newErrors.contactNumber = "Contact Number is required";
    if (!getStringValue(data.email))
      newErrors.email = "Email ID is required";

    // Additional format validations
    const emailValue = getStringValue(data.email);
    if (emailValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue))
      newErrors.email = "Invalid email format";

    const mobileValue = getStringValue(data.contactNumber);
    if (mobileValue && !/^\+?\d{10,15}$/.test(mobileValue.replace(/\s/g, "")))
      newErrors.contactNumber = "Contact Number must be 10-15 digits";

    return newErrors;
  };

  const saveCab = async (e) => {
    e.preventDefault();
    const errors = validateCabForm(formData);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    if (cabList.length === 0) {
      toast.error("Please add at least one cab to the list");
      return;
    }

    try {
      setIsLoading(true);

      // Ensure cabList is an array before mapping
      const safeCabList = Array.isArray(cabList) ? cabList : [];
      console.log("cabList in saveCab:", cabList);
      console.log("safeCabList:", safeCabList);

      // Create FormData for file upload
      const formDataPayload = new FormData();
      formDataPayload.append('cabprovider', '');
      formDataPayload.append('providername', formData.cabProviderName);
      formDataPayload.append('phonenumber', formData.contactNumber);
      formDataPayload.append('emailid', formData.email);
      formDataPayload.append('contactperson', formData.contactPerson);
      
      // Add cab list data
      safeCabList.forEach((cab, index) => {
        const prefix = `cabList[${index}]`;
        formDataPayload.append(`${prefix}.cabId`, '');
        formDataPayload.append(`${prefix}.name`, cab.name || cab.cabName || '');
        formDataPayload.append(`${prefix}.cabprovider`, '');
        formDataPayload.append(`${prefix}.cabCode`, cab.cabCode || '');
        formDataPayload.append(`${prefix}.cabType`, cab.cabType || '');
        formDataPayload.append(`${prefix}.countryid`, cab.countryid || cab.countryId || '');
        formDataPayload.append(`${prefix}.placeid`, String(cab.placeid || cab.placeId || ''));
        formDataPayload.append(`${prefix}.providername`, '');
        if (cab.maxCapacity != null && cab.maxCapacity !== '') {
          formDataPayload.append(`${prefix}.maxCapacity`, String(cab.maxCapacity));
        }
        if (cab.maxLuggageCapacity != null && cab.maxLuggageCapacity !== '') {
          formDataPayload.append(`${prefix}.maxLuggageCapacity`, String(cab.maxLuggageCapacity));
        }

        const cabPicName =
          cab.cabpic ||
          (cab.cabImage && cab.cabImage.name) ||
          '';
        formDataPayload.append(`${prefix}.cabpic`, cabPicName);

        const cabImageFile =
          cab.cabImage instanceof File
            ? cab.cabImage
            : cab.cabImage && cab.cabImage instanceof Blob
            ? cab.cabImage
            : null;
        if (cabImageFile) {
          formDataPayload.append(`${prefix}.cabImage`, cabImageFile);
        }
        
        if (cab.cabLocationDTOList && cab.cabLocationDTOList.length > 0) {
          cab.cabLocationDTOList.forEach((location, locIndex) => {
            const locPrefix = `${prefix}.cabLocationDTOList[${locIndex}]`;
            formDataPayload.append(`${locPrefix}.cablocationId`, '');
            formDataPayload.append(`${locPrefix}.cabid`, '');
            formDataPayload.append(`${locPrefix}.pickup`, location.pickup || '');
            formDataPayload.append(`${locPrefix}.dropoff`, location.dropoff || location.dropOff || '');
          });
        }
      });

      console.log("formDataPayload:::", formDataPayload);
      const cabSaveResponse = await axiosInstance.post(
        "/api/SchefferDriver/register",
        formDataPayload,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      if (cabSaveResponse.data) {
        toast.success("Cab Provider added Successfully!");
        setValidationErrors({});
        await fetchCabList(page, search);
        closeModal();
      }
    } catch (error) {
      console.error("Save cab error:", error);
      setError("Sorry! Data not saved to db..");
      toast.error(
        `Failed to save cab data: ${
          error.response?.data?.message || error.message
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = async () => {
    const errors = validateCabForm(formData);
  if (Object.keys(errors).length > 0) {
    setValidationErrors(errors);
    return;
  }

  if (!editing) return;

  try {
    setIsLoading(true);

    console.log("Current cabList when saving:", cabList); // Debug log
    console.log("Editing item:", editing); // Debug log to see the editing item
    
    // Ensure cabList is an array before mapping
    const safeCabList = Array.isArray(cabList) ? cabList : [];
    console.log("safeCabList for edit:", safeCabList);
    
   
    // Create FormData for file upload
    const formDataPayload = new FormData();
    formDataPayload.append('cabprovider', editing.cabprovider || '');
    formDataPayload.append('providername', formData.cabProviderName);
    formDataPayload.append('phonenumber', formData.contactNumber);
    formDataPayload.append('emailid', formData.email);
    formDataPayload.append('contactperson', formData.contactPerson);
    
    // Add cab list data
    safeCabList.forEach((cab, index) => {
        // Find the corresponding cab in editing.cabList by cabId or index
        console.log("cab.cabId:", cab);
        const editingCab = (editing.cabList || []).find(c => c.cabId === cab.cabId) || (editing.cabList || [])[index] || {};
        
        const prefix = `cabList[${index}]`;
        formDataPayload.append(`${prefix}.cabId`, editingCab.cabId || '');
        formDataPayload.append(`${prefix}.name`, cab.name || cab.cabName || '');
        formDataPayload.append(`${prefix}.cabprovider`, '');
        formDataPayload.append(`${prefix}.cabCode`, cab.cabCode || '');
        formDataPayload.append(`${prefix}.cabType`, cab.cabType || '');
        formDataPayload.append(`${prefix}.countryid`, cab.countryid || cab.countryId || '');
        formDataPayload.append(`${prefix}.placeid`, String(cab.placeid || cab.placeId || ''));
        formDataPayload.append(`${prefix}.providername`, '');
        if (cab.maxCapacity != null && cab.maxCapacity !== '') {
          formDataPayload.append(`${prefix}.maxCapacity`, String(cab.maxCapacity));
        }
        if (cab.maxLuggageCapacity != null && cab.maxLuggageCapacity !== '') {
          formDataPayload.append(`${prefix}.maxLuggageCapacity`, String(cab.maxLuggageCapacity));
        }

        const cabPicName =
          cab.cabpic ||
          (cab.cabImage && cab.cabImage.name) ||
          '';
        formDataPayload.append(`${prefix}.cabpic`, cabPicName);

        const cabImageFile =
          cab.cabImage instanceof File
            ? cab.cabImage
            : cab.cabImage && cab.cabImage instanceof Blob
            ? cab.cabImage
            : null;
        if (cabImageFile) {
          formDataPayload.append(`${prefix}.cabImage`, cabImageFile);
        }
        
        if (cab.cabLocationDTOList && cab.cabLocationDTOList.length > 0) {
          cab.cabLocationDTOList.forEach((location, locIndex) => {
            const editingLocation = (editingCab.cabLocationDTOList || [])[locIndex] || {};
            const locPrefix = `${prefix}.cabLocationDTOList[${locIndex}]`;
            formDataPayload.append(`${locPrefix}.cablocationId`, editingLocation.cablocationId || '');
            formDataPayload.append(`${locPrefix}.cabid`, '');
            formDataPayload.append(`${locPrefix}.pickup`, location.pickup || '');
            formDataPayload.append(`${locPrefix}.dropoff`, location.dropoff || location.dropOff || '');
          });
        }
    });

    console.log("FormData prepared for edit:", formDataPayload);

    const editRes = await axiosInstance.put(`/api/SchefferDriver/${editing.cabprovider}`, formDataPayload, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    if (editRes.data) {
        toast.success("Cab Provider Updated Successfully!");
      setValidationErrors({});
        await fetchCabList(page, search);
      closeModal();
    }
  } catch (error) {
      console.error("Edit cab error:", error);
      setError("Failed to update cab provider");
    toast.error(
        `Failed to update cab provider: ${
        error.response?.data?.message || error.message
      }`
    );
  } finally {
    setIsLoading(false);
  }
};

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setIsViewMode(false);
    setFormData({
      cabProviderName: "",
      contactPerson: "",
      contactNumber: "",
        email: "",
      cabCode: "",
      cabName: "",
      countryId: "",
      placeId: "",
      pickup: "",
      dropOff: "",
      cabImage: null,
      maxCapacity: "",
      maxLuggageCapacity: "",
    });
    setCabList([]);
    setPlaces([]);
    setPickupDropoffList([]);
    setIsLoadingPlaces(false);
    setValidationErrors({});
    setError("");
    setEditingCab(null);
    setIsDetailLoading(false);
  };

  const fetchCabList = async (pageNum = 0, searchTerm = search) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "10",
      });

      if (searchTerm && searchTerm.trim()) {
        params.append("search", searchTerm.trim());
      }

      const res = await axiosInstance.get(`/api/SchefferDriver?${params.toString()}`);
      console.log("cab list :::" , res)

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
    fetchCabList();
    fetchCountries("");
  }, []);

  useEffect(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    const timeout = setTimeout(() => {
      fetchCabList(0, search);
    }, 500);
    setSearchTimeout(timeout);

    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [search]);

  const handleDelete = (item) => {
    Swal.fire({
      title: `Are you sure? You want to delete ${item.providername}`,
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
        axiosInstance
          .delete(`/api/SchefferDriver/${item.cabprovider}`)
          .then(() => {
            toast.success("Cab Provider deleted successfully");
            fetchCabList(page, search);
          })
          .catch((error) => {
            console.error("Delete error:", error);
            toast.error(`Failed to delete cab provider: ${error.response?.data?.message || error.message}`);
          });
      }
    });
  };

  const handleSchefferDriverRates = (item) => {
    // Navigate to CabRates page with the cab provider data
    console.log("Navigating to SchefferDriverRates page with data:", item);
    const providerId = item.cabprovider || item.id;
    navigate('/scheffer-driver-rates', { 
      state: { 
        cabProvider: item,
        cabProviderId: providerId,
        cabProviderName: item.providername 
      } 
    });
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
              <span className="fw-semibold">Chauffeur Driver and Limousine</span>
              <Form.Group className="hotel-search-bar position-relative">
                <Form.Control
                  type="text"
                  placeholder="Search cab provider by name..."
                  className="form-control-modern-sm"
                  value={searchTerm}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearchTerm(value);
                    setSearch(value);
                    setPage(0);
                  }}
                />
                {searchTerm && (
                  <button
                    type="button"
                    className="btn btn-link position-absolute top-50 end-0 translate-middle-y"
                    style={{
                      border: "none",
                      background: "none",
                      color: "#6c757d",
                      padding: "0 12px",
                      zIndex: 10,
                    }}
                    onClick={() => {
                      setSearchTerm("");
                      setSearch("");
                      setPage(0);
                    }}
                    title="Clear search"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </Form.Group>
              <Button className="btn-green" onClick={openCreate}>
                + Create
              </Button>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>S/N</th>
                    <th>Transfer Provider Name</th>
                    <th>Contact Person</th>
                    <th>Contact Number</th>
                    <th>Email</th>
                    <th style={{ width: 160 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1 + page * 10}</td>
                      <td>{item.providername}</td>
                      <td>{item.contactperson}</td>
                      <td>{item.phonenumber}</td>
                      <td>{item.emailid}</td>
                      <td>
                        <div className="d-flex gap-2">
                          <FaGlobeAsia
                            className="text-success"
                            style={{ cursor: "pointer", fontSize: "18px" }}
                            onClick={() => openZoneModal(item)}
                            title="Manage Zones"
                          />
                           <FaDollarSign
                            className="text-success"
                            style={{ cursor: "pointer", fontSize: "18px" }}
                            onClick={() => handleSchefferDriverRates(item)}
                            title="Cab Rates"
                          />
                          <FaEdit
                            className="text-primary edit"
                            style={{ cursor: "pointer", fontSize: "18px" }}
                            onClick={() => openEdit(item)}
                            title="Edit"
                          />
                          <FaEye
                            className="text-info view"
                            style={{ cursor: "pointer", fontSize: "18px" }}
                            onClick={() => handleView(item)}
                            title="View"
                          />
                         
                          
                          <FaTrash
                            className="text-danger delete"
                            style={{ cursor: "pointer", fontSize: "18px" }}
                            onClick={() => handleDelete(item)}
                            title="Delete"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {isLoading && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        <div
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        >
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        Loading available cab providers...
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        No cab providers found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>

              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center p-3 border-top">
                  <div>
                    <small className="text-muted">
                      Showing {items.length} of {totalPages * 10} cab providers
                    </small>
                  </div>
                  <div>
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={page === 0}
                        onClick={() => fetchCabList(page - 1, search)}
                      />
                      {[...Array(totalPages).keys()].map((num) => (
                        <Pagination.Item
                          key={num}
                          active={num === page}
                          onClick={() => fetchCabList(num, search)}
                        >
                          {num + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={page === totalPages - 1}
                        onClick={() => fetchCabList(page + 1, search)}
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
            size="lg"
            backdrop="static"
            keyboard={false}
          >
            <Modal.Header closeButton={!isLoading}>
              <Modal.Title>
                {isViewMode
                  ? "View Details"
                  : editing
                  ? "Update Cab Provider"
                  : "Create Cab"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {isDetailLoading && (
                <div className="text-center py-4">
                  <div
                    className="spinner-border spinner-border-sm me-2"
                    role="status"
                  >
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  Loading cab provider details...
                </div>
              )}
              <Form style={{ display: isDetailLoading ? "none" : "block" }}>
                <Card className="mb-3">
                  <Card.Header>Cab Provider Details</Card.Header>
                  <Card.Body>
                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>
                            <span style={{ color: 'red' }}>*</span>Cab Provider Name
                          </Form.Label>
                          <Form.Control
                            value={formData.cabProviderName}
                            placeholder="Enter cab provider name"
                            isInvalid={!!validationErrors.cabProviderName}
                            {...getFormControlProps(
                              "cabProviderName",
                              (e) => {
                                setFormData({
                                  ...formData,
                                  cabProviderName: e.target.value,
                                });
                                if (validationErrors.cabProviderName) {
                                  setValidationErrors(prev => ({
                                    ...prev,
                                    cabProviderName: ""
                                  }));
                                }
                              },
                              {
                                className: `form-input ${
                                  validationErrors.cabProviderName ? "is-invalid" : ""
                                }`,
                                autoFocus: true,
                              }
                            )}
                          />
                          {validationErrors.cabProviderName && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.cabProviderName}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>Contact Person</Form.Label>
                          <Form.Control
                            value={formData.contactPerson}
                            placeholder="Enter contact person"
                            {...getFormControlProps(
                              "contactPerson",
                              (e) =>
                                setFormData({
                                  ...formData,
                                  contactPerson: e.target.value,
                                }),
                              {}
                            )}
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>
                            <span style={{ color: 'red' }}>*</span>Contact Number
                          </Form.Label>
                          <Form.Control
                            value={formData.contactNumber}
                            placeholder="Enter contact number"
                            isInvalid={!!validationErrors.contactNumber}
                            {...getFormControlProps(
                              "contactNumber",
                              (e) => {
                                setFormData({
                                  ...formData,
                                  contactNumber: e.target.value,
                                });
                                if (validationErrors.contactNumber) {
                                  setValidationErrors(prev => ({
                                    ...prev,
                                    contactNumber: ""
                                  }));
                                }
                              },
                              {
                                className: `form-input ${
                                  validationErrors.contactNumber ? "is-invalid" : ""
                                }`,
                              }
                            )}
                          />
                          {validationErrors.contactNumber && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.contactNumber}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                      </Col>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                          <Form.Label>
                            <span style={{ color: 'red' }}>*</span>Email
                          </Form.Label>
                              <Form.Control
                                value={formData.email}
                                placeholder="Enter email"
                                isInvalid={!!validationErrors.email}
                                {...getFormControlProps(
                                  "email",
                                  (e) => {
                                    setFormData({
                                      ...formData,
                                      email: e.target.value,
                                    });
                                    if (validationErrors.email) {
                                      setValidationErrors(prev => ({
                                        ...prev,
                                        email: ""
                                      }));
                                    }
                                  },
                                  {
                                    className: `form-input ${
                                      validationErrors.email ? "is-invalid" : ""
                                    }`,
                                  }
                                )}
                              />
                              {validationErrors.email && (
                                <Form.Control.Feedback type="invalid">
                                  {validationErrors.email}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>

                    <Card className="mb-3">
                  <Card.Header>Cab List</Card.Header>
                      <Card.Body>
                        <Row>
                      <Col md={3}>
                            <Form.Group className="mb-3">
                          <Form.Label>
                            <span style={{ color: 'red' }}>*</span>Cab Code
                          </Form.Label>
                              <Form.Control
                            value={formData.cabCode}
                            placeholder="Enter cab code"
                                {...getFormControlProps(
                              "cabCode",
                              (e) =>
                                    setFormData({
                                      ...formData,
                                  cabCode: e.target.value,
                                }),
                              {}
                            )}
                          />
                            </Form.Group>
                          </Col>
                      <Col md={3}>
                            <Form.Group className="mb-3">
                          <Form.Label>
                            <span style={{ color: 'red' }}>*</span>Cab Name
                          </Form.Label>
                              <Form.Control
                            value={formData.cabName}
                            placeholder="Enter cab name"
                                {...getFormControlProps(
                              "cabName",
                                  (e) =>
                                    setFormData({
                                      ...formData,
                                  cabName: e.target.value,
                                    }),
                                  {}
                                )}
                              />
                            </Form.Group>
                          </Col>
                      <Col md={6}>
                            <Form.Group className="mb-3">
                          <Form.Label>Cab Type</Form.Label>
                              <Form.Select
                            value={formData.cabType || ""}
                            disabled={isViewMode}
                            onChange={(e) =>
                              setFormData({ ...formData, cabType: e.target.value })
                            }
                          >
                            <option value="">Select type</option>
                            {cabTypeOptions.map((ct) => (
                              <option key={ct.id} value={ct.name}>
                                {ct.name} (Adults: {ct.adultCount ?? 0}, Children: {ct.childCount ?? 0})
                              </option>
                            ))}
                          </Form.Select>
                            </Form.Group>
                          </Col>
                      <Col md={3}>
                            <Form.Group className="mb-3">
                          <Form.Label>
                            <span style={{ color: 'red' }}>*</span>Country
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
                            menuPortalTarget={document.body}
                            styles={{
                              menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                              menu: (base) => ({ ...base, zIndex: 9999 })
                            }}
                            filterOption={() => true} // Server-side filtering
                            placeholder="Search and select country"
                            isSearchable
                            isClearable
                            isLoading={isCountryLoading}
                            options={countries}
                            isDisabled={isViewMode}
                            className={`react-select-container ${
                              validationErrors.countryId ? "is-invalid" : ""
                            }`}
                            classNamePrefix="react-select"
                          />
                          {validationErrors.countryId && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.countryId}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                      </Col>
                      <Col md={3}>
                        <Form.Group className="mb-3">
                          <Form.Label>
                            <span style={{ color: 'red' }}>*</span>STATE
                          </Form.Label>
                          <SearchableSelect
                            name="placeId"
                            value={formData.placeId}
                            onChange={handlePlaceChange}
                            placeholder={
                              isLoadingPlaces
                                ? "Loading states..."
                                : "Search and select state"
                            }
                            options={placeOptions}
                            isInvalid={!!validationErrors.placeId}
                            disabled={
                              isViewMode || !formData.countryId || isLoadingPlaces
                            }
                            isLoading={isLoadingPlaces}
                          />
                          {validationErrors.placeId && (
                                <Form.Control.Feedback type="invalid">
                              {validationErrors.placeId}
                                </Form.Control.Feedback>
                              )}
                            </Form.Group>
                          </Col>
                    </Row>
                    
                    {/* Cab Image Upload */}
                    <Row>
                      <Col md={12}>
                        <Form.Group className="mb-3">
                          <Form.Label>
                            Cab Image
                          </Form.Label>
                          <Form.Control
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files[0];
                              if (file) {
                                // Validate file size (max 5MB)
                                if (file.size > 5 * 1024 * 1024) {
                                  toast.error("Image size should be less than 5MB");
                                  return;
                                }
                                // Validate file type
                                if (!file.type.startsWith('image/')) {
                                  toast.error("Please select a valid image file");
                                  return;
                                }
                                setFormData(prev => ({
                                  ...prev,
                                  cabImage: file
                                }));
                              }
                            }}
                            disabled={isViewMode}
                          />
                          {formData.cabImage && (
                            <div className="mt-2">
                              <small className="text-muted">Selected: {formData.cabImage.name}</small>
                              <div className="mt-1">
                                <img 
                                  src={URL.createObjectURL(formData.cabImage)} 
                                  alt="Cab preview" 
                                  style={{ maxWidth: '150px', maxHeight: '100px', objectFit: 'cover' }}
                                  className="border rounded"
                                />
                              </div>
                            </div>
                          )}
                        </Form.Group>
                      </Col>
                    </Row>
                    
                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>Max Capacity</Form.Label>
                          <Form.Control
                            type="number"
                            min="0"
                            value={formData.maxCapacity}
                            placeholder=""
                            {...getFormControlProps(
                              "maxCapacity",
                              (e) =>
                                setFormData({
                                  ...formData,
                                  maxCapacity: e.target.value,
                                }),
                              {}
                            )}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>Max Luggage Capacity</Form.Label>
                          <Form.Control
                            type="number"
                            min="0"
                            value={formData.maxLuggageCapacity}
                            placeholder=""
                            {...getFormControlProps(
                              "maxLuggageCapacity",
                              (e) =>
                                setFormData({
                                  ...formData,
                                  maxLuggageCapacity: e.target.value,
                                }),
                              {}
                            )}
                          />
                        </Form.Group>
                      </Col>
                    </Row>

                    {/* Pickup & Dropoff Locations were moved out of this modal.
                        After saving the cab provider, use the Zone icon (map marker)
                        on the cab provider list row to manage zones per cab. */}
                    {/* legacy section removed — keep render placeholder so trailing markup balances */}
                    <div className="d-none">
                    {pickupDropoffList.map((location, index) => (
                        <Card key={location.id} className="mb-3">
                          <Card.Header className="d-flex justify-content-between align-items-center py-2">
                            <small className="fw-semibold">Location {index + 1}</small>
                            {!isViewMode && (
                              <Button
                                variant="outline-danger"
                                size="sm"
                                onClick={() => removePickupDropoff(location.id)}
                              >
                                <FaTrash size={10} />
                              </Button>
                            )}
                          </Card.Header>
                          <Card.Body className="py-2">
                            <Row>
                              {/* ── Pickup ───────────────────────────────── */}
                              <Col md={6}>
                                <Form.Group className="mb-2">
                                  <Form.Label>
                                    <span style={{ color: "red" }}>*</span>Pickup Type
                                  </Form.Label>
                                  <Form.Select
                                    value={location.pickupType || "Other"}
                                    disabled={isViewMode}
                                    onChange={(e) =>
                                      setLocationType(
                                        location.id,
                                        "pickup",
                                        e.target.value
                                      )
                                    }
                                  >
                                    <option value="Other">Other</option>
                                    <option value="Hotel">Hotel</option>
                                    <option value="Airport">Airport</option>
                                  </Form.Select>
                                </Form.Group>

                                <Form.Group className="mb-2">
                                  <Form.Label>
                                    <span style={{ color: "red" }}>*</span>Pickup
                                  </Form.Label>
                                  {location.pickupType === "Hotel" ? (
                                    <>
                                      <Select
                                        options={hotelOptionList}
                                        value={
                                          hotelOptionList.find(
                                            (o) =>
                                              String(o.value) ===
                                              String(location.pickupRefId)
                                          ) || null
                                        }
                                        onChange={(opt) =>
                                          setLocationTypeSelection(
                                            location.id,
                                            "pickup",
                                            opt
                                          )
                                        }
                                        placeholder="Select Hotel"
                                        isClearable
                                        isSearchable
                                        isDisabled={isViewMode}
                                        menuPortalTarget={document.body}
                                        menuPosition="fixed"
                                        styles={{
                                          menuPortal: (base) => ({
                                            ...base,
                                            zIndex: 9999,
                                          }),
                                        }}
                                      />
                                      {(location.pickupLocation ||
                                        location.pickupAddress) && (
                                        <small className="text-muted d-block mt-1">
                                          {location.pickupLocation}
                                          {location.pickupLocation &&
                                          location.pickupAddress
                                            ? " · "
                                            : ""}
                                          {location.pickupAddress}
                                        </small>
                                      )}
                                    </>
                                  ) : location.pickupType === "Airport" ? (
                                    <>
                                      <Select
                                        options={airportOptionList}
                                        value={
                                          airportOptionList.find(
                                            (o) =>
                                              String(o.value) ===
                                              String(location.pickupRefId)
                                          ) || null
                                        }
                                        onChange={(opt) =>
                                          setLocationTypeSelection(
                                            location.id,
                                            "pickup",
                                            opt
                                          )
                                        }
                                        placeholder="Select Airport"
                                        isClearable
                                        isSearchable
                                        isDisabled={isViewMode}
                                        menuPortalTarget={document.body}
                                        menuPosition="fixed"
                                        styles={{
                                          menuPortal: (base) => ({
                                            ...base,
                                            zIndex: 9999,
                                          }),
                                        }}
                                      />
                                      {(location.pickupAddress ||
                                        location.pickupLocation) && (
                                        <small className="text-muted d-block mt-1">
                                          {location.pickupAddress &&
                                            `Code: ${location.pickupAddress}`}
                                          {location.pickupAddress &&
                                          location.pickupLocation
                                            ? " · "
                                            : ""}
                                          {location.pickupLocation}
                                        </small>
                                      )}
                                    </>
                                  ) : (
                                    <Form.Control
                                      value={location.pickup}
                                      placeholder="Enter pickup location"
                                      disabled={isViewMode}
                                      onChange={(e) =>
                                        updatePickupDropoff(
                                          location.id,
                                          "pickup",
                                          e.target.value
                                        )
                                      }
                                    />
                                  )}
                                </Form.Group>
                              </Col>

                              {/* ── Drop Off ─────────────────────────────── */}
                              <Col md={6}>
                                <Form.Group className="mb-2">
                                  <Form.Label>
                                    <span style={{ color: "red" }}>*</span>Dropoff Type
                                  </Form.Label>
                                  <Form.Select
                                    value={location.dropoffType || "Other"}
                                    disabled={isViewMode}
                                    onChange={(e) =>
                                      setLocationType(
                                        location.id,
                                        "dropoff",
                                        e.target.value
                                      )
                                    }
                                  >
                                    <option value="Other">Other</option>
                                    <option value="Hotel">Hotel</option>
                                    <option value="Airport">Airport</option>
                                  </Form.Select>
                                </Form.Group>

                                <Form.Group className="mb-2">
                                  <Form.Label>
                                    <span style={{ color: "red" }}>*</span>Drop Off
                                  </Form.Label>
                                  {location.dropoffType === "Hotel" ? (
                                    <>
                                      <Select
                                        options={hotelOptionList}
                                        value={
                                          hotelOptionList.find(
                                            (o) =>
                                              String(o.value) ===
                                              String(location.dropoffRefId)
                                          ) || null
                                        }
                                        onChange={(opt) =>
                                          setLocationTypeSelection(
                                            location.id,
                                            "dropoff",
                                            opt
                                          )
                                        }
                                        placeholder="Select Hotel"
                                        isClearable
                                        isSearchable
                                        isDisabled={isViewMode}
                                        menuPortalTarget={document.body}
                                        menuPosition="fixed"
                                        styles={{
                                          menuPortal: (base) => ({
                                            ...base,
                                            zIndex: 9999,
                                          }),
                                        }}
                                      />
                                      {(location.dropoffLocation ||
                                        location.dropoffAddress) && (
                                        <small className="text-muted d-block mt-1">
                                          {location.dropoffLocation}
                                          {location.dropoffLocation &&
                                          location.dropoffAddress
                                            ? " · "
                                            : ""}
                                          {location.dropoffAddress}
                                        </small>
                                      )}
                                    </>
                                  ) : location.dropoffType === "Airport" ? (
                                    <>
                                      <Select
                                        options={airportOptionList}
                                        value={
                                          airportOptionList.find(
                                            (o) =>
                                              String(o.value) ===
                                              String(location.dropoffRefId)
                                          ) || null
                                        }
                                        onChange={(opt) =>
                                          setLocationTypeSelection(
                                            location.id,
                                            "dropoff",
                                            opt
                                          )
                                        }
                                        placeholder="Select Airport"
                                        isClearable
                                        isSearchable
                                        isDisabled={isViewMode}
                                        menuPortalTarget={document.body}
                                        menuPosition="fixed"
                                        styles={{
                                          menuPortal: (base) => ({
                                            ...base,
                                            zIndex: 9999,
                                          }),
                                        }}
                                      />
                                      {(location.dropoffAddress ||
                                        location.dropoffLocation) && (
                                        <small className="text-muted d-block mt-1">
                                          {location.dropoffAddress &&
                                            `Code: ${location.dropoffAddress}`}
                                          {location.dropoffAddress &&
                                          location.dropoffLocation
                                            ? " · "
                                            : ""}
                                          {location.dropoffLocation}
                                        </small>
                                      )}
                                    </>
                                  ) : (
                                    <Form.Control
                                      value={location.dropOff}
                                      placeholder="Enter drop off location"
                                      disabled={isViewMode}
                                      onChange={(e) =>
                                        updatePickupDropoff(
                                          location.id,
                                          "dropOff",
                                          e.target.value
                                        )
                                      }
                                    />
                                  )}
                                </Form.Group>
                              </Col>
                            </Row>
                          </Card.Body>
                        </Card>
                      ))}
                    </div>
                    {!isViewMode && (
                    <div className="d-flex justify-content-end">
                      <Button
                        variant="primary"
                        onClick={addCabToList}
                        disabled={isViewMode}
                        className="d-flex align-items-center gap-2"
                      >
                        <FaPlus />
                        Add Cab
                      </Button>
                    </div>
                    )}

                    {/* Display added cabs */}
                    {cabList.length > 0 && (
                      <div className="mt-3">
                        <h6>Added Cabs:</h6>
                        <div className="table-responsive">
                          <Table striped hover size="sm">
                            <thead>
                              <tr>
                                <th>Cab Code</th>
                                <th>Cab Name</th>
                                <th>Country</th>
                                <th>Place</th>
                                <th>Max Capacity</th>
                                <th>Max Luggage</th>
                                <th>Image</th>
                                <th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cabList.map((cab) => (
                                <tr key={cab.cabId || cab.id}>
                                  <td>{cab.cabCode}</td>
                                  <td>{cab.name}</td>
                                  <td>
                                    {cab.countryName ||
                                      countries.find(
                                        (c) => String(c.value) === String(cab.countryid)
                                      )?.label ||
                                      cab.countryid}
                                  </td>
                                  <td>
                                    {cab.placeName ||
                                      placeLookup[
                                        String(cab.placeid || cab.placeId || "")
                                      ] ||
                                      placeOptions.find(
                                        (p) =>
                                          String(p.id) ===
                                          String(cab.placeid || cab.placeId)
                                      )?.name ||
                                      cab.stateName ||
                                      cab.place ||
                                      cab.placeid}
                                  </td>
                                  <td>{cab.maxCapacity != null ? cab.maxCapacity : "—"}</td>
                                  <td>{cab.maxLuggageCapacity != null ? cab.maxLuggageCapacity : "—"}</td>
                                  <td>
                                    {cab.cabImage ? (
                                      <img 
                                        src={URL.createObjectURL(cab.cabImage)} 
                                        alt="Cab" 
                                        style={{ width: '50px', height: '50px', objectFit: 'cover' }}
                                        className="border rounded"
                                      />
                                    ) : (
                                      <div 
                                        className="d-flex align-items-center justify-content-center border rounded bg-light"
                                        style={{ width: '50px', height: '50px' }}
                                      >
                                        <small className="text-muted">No Image</small>
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    {!isViewMode && (
                                      <div className="d-flex gap-1">
                                        <Button
                                          variant="outline-primary"
                                          size="sm"
                                          onClick={() => editCabFromList(cab)}
                                          title="Edit Cab"
                                        >
                                          <FaEdit size={10} />
                                        </Button>
                                        <Button
                                          variant="danger"
                                          size="sm"
                                          onClick={() => removeCabFromList(cab.cabId || cab.id)}
                                          title="Delete Cab"
                                        >
                                          <FaTrash size={10} />
                                        </Button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        </div>
                      </div>
                    )}
                      </Card.Body>
                    </Card>
                {error && (
                  <Form.Control.Feedback type="invalid">
                    {error}
                  </Form.Control.Feedback>
                )}
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={closeModal}
                disabled={isLoading}
              >
                {isViewMode ? "Close" : "Cancel"}
              </Button>
              {!isViewMode && (
                <Button
                  className="btn-indigo"
                  onClick={editing ? handleEdit : saveCab}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm me-2"
                        role="status"
                        aria-hidden="true"
                      ></span>
                      {editing ? "Updating..." : "Saving..."}
                    </>
                  ) : editing ? (
                    "Update"
                  ) : (
                    "Create"
                  )}
                </Button>
              )}
            </Modal.Footer>
          </Modal>

          {/* ── Manage Zones Modal ─────────────────────────────────── */}
          <Modal
            show={showZoneModal}
            onHide={closeZoneModal}
            size="lg"
            centered
            backdrop="static"
            keyboard={false}
          >
            <Modal.Header closeButton={!zoneSaving}>
              <Modal.Title>
                Manage Zones
                {zoneProvider && (
                  <small className="text-muted ms-2 fs-6">
                    — {zoneProvider.providername}
                  </small>
                )}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {zoneLoading ? (
                <div className="text-center py-4">
                  <div
                    className="spinner-border spinner-border-sm me-2"
                    role="status"
                  >
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  Loading cabs and locations…
                </div>
              ) : (
                <>
                  <Form.Group className="mb-3">
                    <Form.Label>
                      Cab <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Select
                      value={zoneSelectedCabId}
                      onChange={handleZoneCabChange}
                      disabled={zoneSaving}
                    >
                      <option value="">Select a cab</option>
                      {zoneProviderCabs.map((cab) => {
                        const cid = String(cab.cabId || cab.id);
                        const hasZone = !!zonesByCabId[cid];
                        return (
                          <option key={cid} value={cid}>
                            {cab.name || cab.cabName}
                            {cab.cabCode ? ` (${cab.cabCode})` : ""}
                            {hasZone ? " — zone saved" : ""}
                          </option>
                        );
                      })}
                    </Form.Select>
                    {zoneProviderCabs.length === 0 && (
                      <small className="text-muted">
                        No cabs registered for this provider yet.
                      </small>
                    )}
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>Pickup Locations (multi-select)</Form.Label>
                    <Select
                      isMulti
                      options={zoneLocationOptions}
                      value={zonePickupSelected}
                      onChange={(opts) =>
                        setZonePickupSelected(opts ? [...opts] : [])
                      }
                      onInputChange={(input, { action }) => {
                        if (action !== "input-change") return;
                        clearTimeout(window.__zonePickupDebounce);
                        window.__zonePickupDebounce = setTimeout(
                          () => fetchZoneLocationOptions(input || ""),
                          300
                        );
                      }}
                      filterOption={() => true}
                      formatOptionLabel={formatZoneOptionLabel}
                      placeholder="Search zones / hotels / airports…"
                      isDisabled={!zoneSelectedCabId || zoneSaving}
                      menuPortalTarget={document.body}
                      menuPosition="fixed"
                      styles={{
                        menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                        groupHeading: (base) => ({
                          ...base,
                          fontWeight: 700,
                          color: "#212529",
                          textTransform: "uppercase",
                          fontSize: "0.75rem",
                        }),
                      }}
                    />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>Dropoff Locations (multi-select)</Form.Label>
                    <Select
                      isMulti
                      options={zoneLocationOptions}
                      value={zoneDropoffSelected}
                      onChange={(opts) =>
                        setZoneDropoffSelected(opts ? [...opts] : [])
                      }
                      onInputChange={(input, { action }) => {
                        if (action !== "input-change") return;
                        clearTimeout(window.__zoneDropoffDebounce);
                        window.__zoneDropoffDebounce = setTimeout(
                          () => fetchZoneLocationOptions(input || ""),
                          300
                        );
                      }}
                      filterOption={() => true}
                      formatOptionLabel={formatZoneOptionLabel}
                      placeholder="Search zones / hotels / airports…"
                      isDisabled={!zoneSelectedCabId || zoneSaving}
                      menuPortalTarget={document.body}
                      menuPosition="fixed"
                      styles={{
                        menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                        groupHeading: (base) => ({
                          ...base,
                          fontWeight: 700,
                          color: "#212529",
                          textTransform: "uppercase",
                          fontSize: "0.75rem",
                        }),
                      }}
                    />
                  </Form.Group>
                </>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={closeZoneModal}
                disabled={zoneSaving}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveZone}
                disabled={zoneSaving || zoneLoading || !zoneSelectedCabId}
              >
                {zoneSaving ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    />
                    Saving…
                  </>
                ) : (
                  "Save Zone"
                )}
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
};

export default SchefferDriverReg;