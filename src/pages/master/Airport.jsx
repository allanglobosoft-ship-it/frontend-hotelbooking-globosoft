import React, { useEffect, useRef, useState } from "react";
import { Card, Button, Table, Modal, Form, Pagination, Row, Col } from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEdit, FaTrash } from "react-icons/fa";
import Select from "react-select";
import BackButton from "../../components/BackButton";

export default function Airport() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [airportName, setAirportName] = useState("");
  const [airportCode, setAirportCode] = useState("");
  // Per-airport meet-and-greet buffer surfaced as a read-only "Estimated
  // Arrival Time" on /cab-booking-page. Free-form so the operator can
  // capture any unit they like (e.g. "02 Hrs 00 Min", "45 Min").
  const [estimatedArrivalTime, setEstimatedArrivalTime] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

  // Region dropdown
  const [regionOptions, setRegionOptions] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedRegionOption, setSelectedRegionOption] = useState(null);
  const [isRegionLoading, setIsRegionLoading] = useState(false);

  // Country / City / Place dropdowns
  const [countryOptions, setCountryOptions] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedCountryOption, setSelectedCountryOption] = useState(null);
  const [isCountryLoading, setIsCountryLoading] = useState(false);

  const [cityOptions, setCityOptions] = useState([]);
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedCityOption, setSelectedCityOption] = useState(null);
  const [isCityLoading, setIsCityLoading] = useState(false);

  const [placeOptions, setPlaceOptions] = useState([]);
  const [selectedPlace, setSelectedPlace] = useState("");
  const [selectedPlaceOption, setSelectedPlaceOption] = useState(null);
  const [isPlaceLoading, setIsPlaceLoading] = useState(false);

  // Sub-Location (locality) the airport sits in — surfaced in cab-search.
  const [subLocationOptions, setSubLocationOptions] = useState([]);
  const [selectedSubLocation, setSelectedSubLocation] = useState("");
  const [selectedSubLocationOption, setSelectedSubLocationOption] = useState(null);
  const [isSubLocationLoading, setIsSubLocationLoading] = useState(false);

  const countryDebounceRef = useRef(null);
  const cityDebounceRef = useRef(null);
  const placeDebounceRef = useRef(null);
  const regionDebounceRef = useRef(null);
  const subLocationDebounceRef = useRef(null);
  const searchDebounceRef = useRef(null);

  const PAGE_SIZE = 10;

  const customSelectStyles = {
    control: (base) => ({
      ...base,
      minHeight: "42px",
      borderRadius: "0.5rem",
      border: "1px solid #dee2e6",
      boxShadow: "none",
      "&:hover": { borderColor: "#86b7fe" },
    }),
    menu: (base) => ({ ...base, zIndex: 9999 }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? "#f8f9fa" : "white",
      color: state.isSelected ? "#0d6efd" : "#212529",
      "&:active": { backgroundColor: "#0d6efd", color: "white" },
    }),
  };

  // ─── List API ─────────────────────────────────────────────────────────
  const fetchAirportList = async (pageNum = 0, search = "") => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: PAGE_SIZE.toString(),
      });
      if (search && search.trim()) params.append("search", search.trim());
      const res = await axiosInstance.get(`/api/airport?${params.toString()}`);
      if (res.data && Array.isArray(res.data)) {
        setItems(res.data);
        if (res.data.length < PAGE_SIZE) {
          setTotalPages(pageNum + 1);
        } else {
          setTotalPages((prev) => Math.max(prev, pageNum + 2));
        }
        setPage(pageNum);
      } else {
        setItems([]);
        setTotalPages(0);
        setPage(0);
      }
    } catch {
      toast.error("Failed to load airports");
      setItems([]);
      setTotalPages(0);
      setPage(0);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Save / Edit / Delete ─────────────────────────────────────────────
  const buildPayload = () => ({
    airportName: airportName.trim(),
    airportCode: airportCode.trim(),
    regionId: selectedRegion || null,
    countryId: selectedCountry || null,
    cityId: selectedCity || null,
    placeId: selectedPlace || null,
    subLocationId: selectedSubLocation || null,
    estimatedArrivalTime: estimatedArrivalTime.trim() || null,
  });

  const validateForm = () => {
    if (!airportName.trim()) return "Airport name is required";
    if (!airportCode.trim()) return "Airport code is required";
    if (!selectedCountry) return "Country is required";
    return "";
  };

  const saveAirport = async () => {
    const err = validateForm();
    if (err) {
      setError(err);
      return;
    }
    try {
      setIsLoading(true);
      const res = await axiosInstance.post("/api/airport/save", buildPayload());
      if (res.data) {
        toast.success("Airport added successfully!");
        await fetchAirportList(page, searchTerm);
        closeModal();
      }
    } catch {
      setError("Failed to save airport");
      toast.error("Failed to save airport");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editing) return;
    const err = validateForm();
    if (err) {
      setError(err);
      return;
    }
    try {
      setIsLoading(true);
      const res = await axiosInstance.put(`/api/airport/${editing.id}`, buildPayload());
      if (res.data) {
        toast.success("Airport updated successfully!");
        await fetchAirportList(page, searchTerm);
        closeModal();
      }
    } catch {
      setError("Failed to update airport");
      toast.error("Failed to update airport");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = (item) => {
    Swal.fire({
      titleText: `Delete "${item.airportName}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
    }).then((result) => {
      if (result.isConfirmed) {
        axiosInstance
          .delete(`/api/airport/${item.id}`)
          .then(() => {
            toast.success("Airport deleted successfully");
            fetchAirportList(page, searchTerm);
          })
          .catch(() => toast.error("Failed to delete airport"));
      }
    });
  };

  // ─── Dropdown fetchers ────────────────────────────────────────────────
  const fetchRegions = async (search = "") => {
    setIsRegionLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/region?page=0&limit=50&search=${encodeURIComponent(search)}`
      );
      if (Array.isArray(res.data)) {
        const opts = res.data.map((r) => ({ value: r.id, label: r.name }));
        setRegionOptions(opts);
        return opts;
      }
      setRegionOptions([]);
      return [];
    } catch {
      setRegionOptions([]);
      return [];
    } finally {
      setIsRegionLoading(false);
    }
  };

  const fetchCountries = async (search = "") => {
    setIsCountryLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/country?page=0&limit=20&search=${encodeURIComponent(search)}`
      );
      if (Array.isArray(res.data)) {
        const opts = res.data.map((c) => ({ value: c.id, label: c.name }));
        setCountryOptions(opts);
        return opts;
      }
      setCountryOptions([]);
      return [];
    } catch {
      setCountryOptions([]);
      return [];
    } finally {
      setIsCountryLoading(false);
    }
  };

  const fetchCities = async (countryId, search = "") => {
    if (!countryId) {
      setCityOptions([]);
      return [];
    }
    setIsCityLoading(true);
    try {
      // Unambiguous endpoint with optional server-side search:
      //   GET /api/province/getByCountryId/{countryId}?search=
      const url = `/api/province/getByCountryId/${countryId}` +
        (search ? `?search=${encodeURIComponent(search)}` : "");
      const res = await axiosInstance.get(url);
      if (Array.isArray(res.data)) {
        const opts = res.data.map((s) => ({
          value: s.id,
          label: s.stateName || s.name,
        }));
        setCityOptions(opts);
        return opts;
      }
      setCityOptions([]);
      return [];
    } catch {
      setCityOptions([]);
      return [];
    } finally {
      setIsCityLoading(false);
    }
  };

  const fetchPlaces = async (cityId) => {
    if (!cityId) {
      setPlaceOptions([]);
      return [];
    }
    setIsPlaceLoading(true);
    try {
      // Backend endpoint: GET /api/destination/getplaces/{stateId}
      const res = await axiosInstance.get(`/api/destination/getplaces/${cityId}`);
      if (Array.isArray(res.data)) {
        const opts = res.data.map((d) => ({ value: d.id, label: d.name }));
        setPlaceOptions(opts);
        return opts;
      }
      setPlaceOptions([]);
      return [];
    } catch {
      setPlaceOptions([]);
      return [];
    } finally {
      setIsPlaceLoading(false);
    }
  };

  // Sub-location list filtered to the currently-selected place. The endpoint
  // also supports an optional ?placeId= filter so we keep the dropdown
  // scoped to the airport's destination.
  const fetchSubLocations = async (placeId, search = "") => {
    setIsSubLocationLoading(true);
    try {
      const params = new URLSearchParams({
        page: "0",
        limit: "50",
      });
      if (placeId) params.append("placeId", String(placeId));
      if (search) params.append("search", search);
      const res = await axiosInstance.get(
        `/api/sub-locations?${params.toString()}`
      );
      if (Array.isArray(res.data)) {
        const opts = res.data.map((s) => ({
          value: s.id,
          label:
            s.locationCode
              ? `${s.locationName} (${s.locationCode})`
              : s.locationName,
        }));
        setSubLocationOptions(opts);
        return opts;
      }
      setSubLocationOptions([]);
      return [];
    } catch {
      setSubLocationOptions([]);
      return [];
    } finally {
      setIsSubLocationLoading(false);
    }
  };

  // ─── Modal open/close ─────────────────────────────────────────────────
  const resetForm = () => {
    setEditing(null);
    setAirportName("");
    setAirportCode("");
    setEstimatedArrivalTime("");
    setSelectedRegion("");
    setSelectedRegionOption(null);
    setSelectedCountry("");
    setSelectedCountryOption(null);
    setSelectedCity("");
    setSelectedCityOption(null);
    setSelectedPlace("");
    setSelectedPlaceOption(null);
    setSelectedSubLocation("");
    setSelectedSubLocationOption(null);
    setRegionOptions([]);
    setCountryOptions([]);
    setCityOptions([]);
    setPlaceOptions([]);
    setSubLocationOptions([]);
    setError("");
  };

  const openCreate = () => {
    resetForm();
    fetchRegions("");
    fetchCountries("");
    setShowModal(true);
  };

  const openEdit = (item) => {
    resetForm();
    setEditing(item);
    setAirportName(item.airportName || "");
    setAirportCode(item.airportCode || "");
    setEstimatedArrivalTime(item.estimatedArrivalTime || "");
    setSelectedRegion(item.regionId || "");
    setSelectedCountry(item.countryId || "");
    setSelectedCity(item.cityId || "");
    setSelectedPlace(item.placeId || "");
    setSelectedSubLocation(item.subLocationId || "");

    fetchRegions("").then((opts) => {
      const m = (opts || []).find((o) => String(o.value) === String(item.regionId));
      setSelectedRegionOption(m || null);
    });
    fetchCountries("").then((opts) => {
      const m = (opts || []).find((o) => String(o.value) === String(item.countryId));
      setSelectedCountryOption(m || null);
    });
    if (item.countryId) {
      fetchCities(item.countryId, "").then((opts) => {
        const m = (opts || []).find((o) => String(o.value) === String(item.cityId));
        setSelectedCityOption(m || null);
      });
    }
    if (item.cityId) {
      fetchPlaces(item.cityId).then((opts) => {
        const m = (opts || []).find((o) => String(o.value) === String(item.placeId));
        setSelectedPlaceOption(m || null);
      });
    }
    fetchSubLocations(item.placeId, "").then((opts) => {
      const m = (opts || []).find(
        (o) => String(o.value) === String(item.subLocationId)
      );
      setSelectedSubLocationOption(m || null);
    });
    setShowModal(true);
  };

  const closeModal = () => {
    resetForm();
    setShowModal(false);
  };

  // ─── Debounced search ─────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      fetchAirportList(0, searchTerm);
    }, 500);
    return () => clearTimeout(searchDebounceRef.current);
  }, [searchTerm]);

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex flex-column flex-sm-row gap-2 justify-content-between align-items-stretch align-items-sm-center">
              <span className="d-flex align-items-center gap-2">
                <BackButton fallback="/adminDashboard" />
                <span className="fw-semibold">Airport Master</span>
              </span>
              <Form.Group className="hotel-search-bar flex-grow-1 flex-sm-grow-0">
                <Form.Control
                  type="text"
                  placeholder="Search Airport..."
                  className="form-control-modern-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </Form.Group>
              <Button className="btn-green" onClick={openCreate}>
                + Create
              </Button>
            </Card.Header>

            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>S/N</th>
                    <th>Airport Name</th>
                    <th>Code</th>
                    <th>Region</th>
                    <th>Country</th>
                    <th>City</th>
                    <th>Place</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1 + page * PAGE_SIZE}</td>
                      <td>{item.airportName}</td>
                      <td>{item.airportCode || "—"}</td>
                      <td>{item.regionName || "—"}</td>
                      <td>{item.countryName || "—"}</td>
                      <td>{item.cityName || "—"}</td>
                      <td>{item.placeName || "—"}</td>
                      <td>
                        <div className="d-flex gap-2">
                          <FaEdit
                            className="text-primary"
                            style={{ cursor: "pointer", fontSize: "18px" }}
                            onClick={() => openEdit(item)}
                            title="Edit"
                          />
                          <FaTrash
                            className="text-danger"
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
                      <td colSpan={8} className="text-center text-muted py-4">
                        <div
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        >
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        Loading airports...
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={8} className="text-center text-muted py-4">
                        No airports found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>

              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center p-3 border-top">
                  <small className="text-muted">
                    Showing {items.length} of {totalPages * PAGE_SIZE} airports
                  </small>
                  <Pagination className="mb-0">
                    <Pagination.Prev
                      disabled={page === 0}
                      onClick={() => fetchAirportList(page - 1, searchTerm)}
                    />
                    {[...Array(totalPages).keys()].map((num) => (
                      <Pagination.Item
                        key={num}
                        active={num === page}
                        onClick={() => fetchAirportList(num, searchTerm)}
                      >
                        {num + 1}
                      </Pagination.Item>
                    ))}
                    <Pagination.Next
                      disabled={page === totalPages - 1}
                      onClick={() => fetchAirportList(page + 1, searchTerm)}
                    />
                  </Pagination>
                </div>
              )}
            </Card.Body>
          </Card>

          {/* Create / Edit Modal */}
          <Modal
            show={showModal}
            onHide={closeModal}
            centered
            backdrop="static"
            keyboard={false}
            size="lg"
          >
            <Modal.Header closeButton={!isLoading}>
              <Modal.Title>{editing ? "Update Airport" : "Create Airport"}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <Row className="g-3">
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>
                        Airport Name <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        value={airportName}
                        onChange={(e) => {
                          setAirportName(e.target.value);
                          setError("");
                        }}
                        placeholder="e.g. Dubai International Airport"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>
                        Airport Code <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        value={airportCode}
                        onChange={(e) => {
                          setAirportCode(e.target.value.toUpperCase());
                          setError("");
                        }}
                        placeholder="e.g. DXB"
                        maxLength={20}
                      />
                    </Form.Group>
                  </Col>

                  {/* Estimated Arrival Time — per-airport buffer surfaced
                      on /cab-booking-page as a read-only display value.
                      Free-form so the operator can capture any unit they
                      like (e.g. "02 Hrs 00 Min"). */}
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Estimated Arrival Time</Form.Label>
                      <Form.Control
                        value={estimatedArrivalTime}
                        onChange={(e) => {
                          setEstimatedArrivalTime(e.target.value);
                          setError("");
                        }}
                        placeholder="e.g. 02 Hrs 00 Min"
                        maxLength={32}
                      />
                    </Form.Group>
                  </Col>

                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Region</Form.Label>
                      <Select
                        options={regionOptions}
                        value={selectedRegionOption}
                        onChange={(option) => {
                          setSelectedRegionOption(option);
                          setSelectedRegion(option ? option.value : "");
                        }}
                        onInputChange={(input) => {
                          clearTimeout(regionDebounceRef.current);
                          regionDebounceRef.current = setTimeout(
                            () => fetchRegions(input),
                            400
                          );
                        }}
                        filterOption={() => true}
                        placeholder="Search and Select Region"
                        isSearchable
                        isClearable
                        isLoading={isRegionLoading}
                        styles={customSelectStyles}
                      />
                    </Form.Group>
                  </Col>

                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>
                        Country <span className="text-danger">*</span>
                      </Form.Label>
                      <Select
                        options={countryOptions}
                        value={selectedCountryOption}
                        onChange={(option) => {
                          setSelectedCountryOption(option);
                          setSelectedCountry(option ? option.value : "");
                          setSelectedCity("");
                          setSelectedCityOption(null);
                          setCityOptions([]);
                          if (option) fetchCities(option.value);
                          setError("");
                        }}
                        onInputChange={(input) => {
                          clearTimeout(countryDebounceRef.current);
                          countryDebounceRef.current = setTimeout(
                            () => fetchCountries(input),
                            400
                          );
                        }}
                        filterOption={() => true}
                        placeholder="Search and Select Country"
                        isSearchable
                        isClearable
                        isLoading={isCountryLoading}
                        styles={customSelectStyles}
                      />
                    </Form.Group>
                  </Col>

                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>City (Province)</Form.Label>
                      <Select
                        options={cityOptions}
                        value={selectedCityOption}
                        onChange={(option) => {
                          setSelectedCityOption(option);
                          setSelectedCity(option ? option.value : "");
                          // Reset Place when city changes and load fresh places for it
                          setSelectedPlace("");
                          setSelectedPlaceOption(null);
                          setPlaceOptions([]);
                          if (option) fetchPlaces(option.value);
                        }}
                        onMenuOpen={() => {
                          if (selectedCountry && cityOptions.length === 0) {
                            fetchCities(selectedCountry);
                          }
                        }}
                        onInputChange={(input, { action }) => {
                          if (action !== "input-change") return;
                          if (!selectedCountry) return;
                          clearTimeout(cityDebounceRef.current);
                          cityDebounceRef.current = setTimeout(
                            () => fetchCities(selectedCountry, input),
                            400
                          );
                        }}
                        filterOption={() => true}
                        placeholder={
                          selectedCountry ? "Search and Select City" : "Select country first"
                        }
                        isSearchable
                        isClearable
                        isLoading={isCityLoading}
                        isDisabled={!selectedCountry}
                        styles={customSelectStyles}
                      />
                    </Form.Group>
                  </Col>

                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Place</Form.Label>
                      <Select
                        options={placeOptions}
                        value={selectedPlaceOption}
                        onChange={(option) => {
                          setSelectedPlaceOption(option);
                          setSelectedPlace(option ? option.value : "");
                          // Reset sub-location whenever place changes — the
                          // available localities depend on the chosen place.
                          setSelectedSubLocation("");
                          setSelectedSubLocationOption(null);
                          setSubLocationOptions([]);
                          if (option) fetchSubLocations(option.value, "");
                        }}
                        onMenuOpen={() => {
                          if (selectedCity && placeOptions.length === 0) {
                            fetchPlaces(selectedCity);
                          }
                        }}
                        filterOption={(option, input) =>
                          !input ||
                          (option.label || "")
                            .toLowerCase()
                            .includes(input.toLowerCase())
                        }
                        placeholder={
                          selectedCity ? "Search and Select Place" : "Select city first"
                        }
                        isSearchable
                        isClearable
                        isLoading={isPlaceLoading}
                        isDisabled={!selectedCity}
                        styles={customSelectStyles}
                      />
                    </Form.Group>
                  </Col>
                </Row>

                {/* Sub-Location (optional locality the airport sits in) */}
                <Row className="mt-3">
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Sub-Location / Locality</Form.Label>
                      <Select
                        options={subLocationOptions}
                        value={selectedSubLocationOption}
                        onChange={(option) => {
                          setSelectedSubLocationOption(option);
                          setSelectedSubLocation(option ? option.value : "");
                        }}
                        onMenuOpen={() => {
                          if (subLocationOptions.length === 0) {
                            fetchSubLocations(selectedPlace, "");
                          }
                        }}
                        onInputChange={(input, { action }) => {
                          if (action !== "input-change") return;
                          clearTimeout(subLocationDebounceRef.current);
                          subLocationDebounceRef.current = setTimeout(
                            () => fetchSubLocations(selectedPlace, input),
                            400
                          );
                        }}
                        filterOption={() => true}
                        placeholder={
                          selectedPlace
                            ? "Search and Select Sub-Location"
                            : "Optional — pick a locality (or leave blank)"
                        }
                        isSearchable
                        isClearable
                        isLoading={isSubLocationLoading}
                        styles={customSelectStyles}
                      />
                      <small className="text-muted">
                        Used by the cab-search dropdown so this airport shows
                        with its locality context.
                      </small>
                    </Form.Group>
                  </Col>
                </Row>

                {error && <div className="alert alert-danger py-2 small mt-3">{error}</div>}
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={closeModal} disabled={isLoading}>
                Cancel
              </Button>
              <Button
                className="btn-indigo"
                onClick={editing ? handleEdit : saveAirport}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    />
                    {editing ? "Updating..." : "Saving..."}
                  </>
                ) : editing ? (
                  "Update"
                ) : (
                  "Save"
                )}
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
}
