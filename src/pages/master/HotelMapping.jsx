import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  Form,
  Button,
  Table,
  Badge,
  Spinner,
  Row,
  Col,
} from "react-bootstrap";
import toast from "react-hot-toast";
import axiosInstance from "../../components/AxiosInstance";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import Select from "react-select";
import AsyncSelect from "react-select/async";
import "../../styles/CityMapping.css";
import "../../styles/AutomatedHotelMapping.css";
import BackButton from "../../components/BackButton";
import useAutoMappingStatus from "./automap/useAutoMappingStatus";
import { statusMeta } from "./automap/automapFormat";
import { getCurrentActiveRole, getUserRole } from "../../utils/authSession";

// The Automated Hotel Mapping screen (pages/master/automap/
// AutomatedHotelMappingPage.jsx). Opened in a NEW TAB from the pill below.
const AUTOMATED_MAPPING_PATH = "/masters/hotel-mapping/automated";

const HotelMapping = () => {
  const navigate = useNavigate();
  const [loading] = useState(false);

  // "Automated Mapping" pill (background engine state + review badge). The
  // screen itself lives at AUTOMATED_MAPPING_PATH. The backend restricts
  // /api/hotel-mapping/auto/** to ADMIN / SUPER_ADMIN, so the pill is only
  // rendered for those roles.
  const isAdminUser = useMemo(() => {
    const active = (getCurrentActiveRole() || "").trim().toLowerCase();
    const roles = (getUserRole() || "")
      .split(",")
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean);
    const role = active || roles[0] || "";
    return role === "admin" || role === "super_admin";
  }, []);
  // 15 s keeps the pill's state dot and review badge current; the screen
  // itself polls every 5 s in its own tab.
  const autoStatus = useAutoMappingStatus({
    enabled: isAdminUser,
    intervalMs: 15000,
  });
  const autoMeta = statusMeta(autoStatus.status?.status || (autoStatus.error ? "ERROR" : "IDLE"));
  const autoRunning = autoStatus.status?.status === "RUNNING";
  // Deliberately no "noopener": a tab opened by window.open inherits a clone
  // of this tab's sessionStorage, i.e. the per-tab auth session
  // (utils/authSession.js), so the new tab is already logged in. This is
  // the same hand-off the search → booking pages use.
  const openAutomatedMapping = () => {
    window.open(AUTOMATED_MAPPING_PATH, "_blank");
  };
  const [selectedCountryOption, setSelectedCountryOption] = useState(null);
  const [selectedCityOption, setSelectedCityOption] = useState(null);

  // Supplier codes surfaced in the Base Supplier + Target Supplier
  // dropdowns. Must stay in sync with the backend Supplier enum at
  // hotelmapping/entity/Supplier.java — any code the backend accepts
  // MUST appear here or admins can't select it. GRN + GOGLOBAL were
  // missing which is why the two suppliers didn't show in the
  // dropdown even though the backend already accepted them.
  const [platforms] = useState([
    "IWTX",
    "DARINA",
    "JUMEIRAH",
    "X3",
    "RATEHAWK",
    "ATHARVA",
    "GRN",
    "GOGLOBAL",
  ]);

  const platformOptions = platforms.map((p) => ({ value: p, label: p }));

  const [formData, setFormData] = useState({
    masterCountryId: "",
    masterCityId: "",
    baseSupplier: "",
    targetSuppliers: [],
    hotelName: "",
  });

  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [errors, setErrors] = useState({});
  const [mappingId, setMappingId] = useState(null); // to track which group is being mapped
  const [bulkMapping] = useState(false); // global bulk loading
  const [resultsFilter, setResultsFilter] = useState("");

  // Generic form input handler
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  // Load countries dynamically for AsyncSelect
  const loadCountries = async (inputValue) => {
    try {
      const response = await axiosInstance.get("/api/country", {
        params: { search: inputValue },
      });
      return response.data.map((c) => ({
        value: c.id,
        label: c.name,
        code: c.countryCode,
      }));
    } catch (error) {
      console.error("Error loading countries:", error);
      return [];
    }
  };

  // Load cities dynamically for AsyncSelect based on selected country
  const loadCities = async (inputValue) => {
    if (!formData.masterCountryId) return [];
    try {
      const response = await axiosInstance.get(
        `/api/province/getByCountryId/${formData.masterCountryId}`,
        { params: { search: inputValue } },
      );
      return response.data.map((c) => ({
        value: c.id,
        label: c.stateName,
        stateCode: c.stateCode,
      }));
    } catch (error) {
      console.error("Error loading cities:", error);
      return [];
    }
  };

  // Country select handler
  const handleCountrySelect = (option) => {
    setSelectedCountryOption(option);
    setFormData((prev) => ({
      ...prev,
      masterCountryId: option ? option.value : "",
      masterCityId: "", // reset city when country changes
    }));
    setSelectedCityOption(null);
    // Clear error
    if (errors.masterCountryId) {
      setErrors((prev) => ({ ...prev, masterCountryId: "" }));
    }
  };

  // City select handler
  const handleCitySelect = (option) => {
    setSelectedCityOption(option);
    setFormData((prev) => ({
      ...prev,
      masterCityId: option ? option.value : "",
    }));
    // Clear error
    if (errors.masterCityId) {
      setErrors((prev) => ({ ...prev, masterCityId: "" }));
    }
  };

  // Save mapping (kept for reference, but search is primary now)
  // eslint-disable-next-line no-unused-vars
  const handleAddMapping = async () => {
    toast.error(
      "Add mapping functionality needs to be updated for new structure.",
    );
  };

  const handleMapGroup = async (match, index) => {
    setMappingId(index);
    try {
      const sourceHotel = match.hotels[0];
      const payload = [
        {
          sourceSupplier: sourceHotel.supplier,
          sourceSupplierHotelId: sourceHotel.supplierHotelId,
          hotelsToMap: match.hotels.map((h) => ({
            supplier: h.supplier,
            supplierHotelId: h.supplierHotelId,
            name: h.name,
            latitude: h.latitude,
            longitude: h.longitude,
            city: h.city,
            country: h.country,
          })),
        },
      ];

      const response = await axiosInstance.post(
        "/api/hotel-mapping/map-duplicates",
        payload,
        { timeout: 0 },
      );

      if (response.status === 200) {
        // The bulk endpoint answers 200 with one result per group: a group
        // can fail (success=false) and targets already mapped to another
        // master hotel are listed in `skipped` — both used to be ignored
        // and the whole group was shown as mapped.
        const results = Array.isArray(response.data) ? response.data : [];
        const failed = results.filter((r) => r && r.success === false);
        if (failed.length > 0) {
          toast.error(failed.map((r) => r.message).filter(Boolean).join(" | ") || "Failed to map hotels.");
          return;
        }
        const skipped = results.flatMap((r) => (Array.isArray(r?.skipped) ? r.skipped : []));
        const isSkipped = (h) =>
          skipped.some((s) => s.startsWith(`${h.supplier} ${h.supplierHotelId}`));
        if (skipped.length > 0) {
          toast(results.map((r) => r.message).filter(Boolean).join(" "), {
            icon: "⚠️",
            duration: 10000,
          });
        } else {
        toast.success("Hotels mapped successfully!");
        }

        setSearchResults((prev) =>
          prev.map((group, i) => {
            if (i === index) {
              return {
                ...group,
                hotels: group.hotels.map((h) => ({
                  ...h,
                  mappingStatus: isSkipped(h) ? h.mappingStatus : true,
                })),
              };
            }
            return group;
          }),
        );
      } else {
        toast.error("Failed to map hotels.");
      }
    } catch (error) {
      console.error("Mapping error:", error);
      toast.error(
        error.response?.data?.message || "Error occurred during mapping.",
      );
    } finally {
      setMappingId(null);
    }
  };

  const handleBulkMap = () => {
    // Collect all unmapped groups to pass to the new page
    const unmappedGroups = searchResults.filter((group) =>
      group.hotels.some((h) => !h.mappingStatus),
    );

    if (unmappedGroups.length === 0) {
      toast.success("All visible hotels are already mapped.");
      return;
    }

    // Redirect to the bulk list page passing the data
    navigate("/masters/hotel-upcooming-mapped-list", {
      state: { searchResults },
    });
  };

  const handleHotelSearch = async () => {
    const newErrors = {};
    if (!formData.masterCountryId)
      newErrors.masterCountryId = "Country is required";
    if (!formData.masterCityId) newErrors.masterCityId = "City is required";
    if (!formData.baseSupplier)
      newErrors.baseSupplier = "Base Supplier is required";
    if (formData.targetSuppliers.length === 0)
      newErrors.targetSuppliers = "At least one Target Supplier is required";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error("Please fill all mandatory fields.");
      return;
    }

    setErrors({});
    setSearching(true);
    setSearchResults([]);
    try {
      const countryCode = selectedCountryOption?.code || "";
      const cityName = selectedCityOption?.label || "";

      const response = await axiosInstance.get(
        "/api/hotel-mapping/find-duplicates-by-city",
        {
          params: {
            city: cityName,
            country: countryCode,
            baseSupplier: formData.baseSupplier,
            targetSuppliers: formData.targetSuppliers.join(","), // multi-select
            page: 0,
            size: 1000000,
          },
          timeout: 0,
        },
      );
      let data = response.data || [];

      // Optional: Local filter by hotel name if provided
      if (formData.hotelName) {
        const term = formData.hotelName.toLowerCase();
        data = data.filter((group) =>
          group.hotels.some((h) => h.name.toLowerCase().includes(term)),
        );
      }

      setSearchResults(data);
      if (data.length === 0) {
        toast.error("No matches found.");
      } else {
        toast.success(`Found ${data.length} potential matches.`);
      }
    } catch (error) {
      console.error("Hotel search error:", error);
      toast.error("Failed to fetch hotel matches.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <span className="d-flex align-items-center gap-2 mb-3 flex-wrap">
            <BackButton fallback="/adminDashboard" />
            <h3 className="mb-0">Hotel Mapping</h3>
            {isAdminUser && (
              <button
                type="button"
                className="ahm-pill ms-auto"
                onClick={openAutomatedMapping}
                title="Open the Automated Hotel Mapping screen in a new tab"
              >
                <span className={`ahm-dot tone-${autoMeta.tone}${autoRunning ? " pulse" : ""}`}></span>
                <span className="ahm-pill-text">Automated Mapping</span>
                <span className="text-muted fw-normal">· {autoMeta.label}</span>
                {autoRunning && <Spinner animation="border" size="sm" role="presentation" />}
                {autoStatus.status?.manualReviewCount > 0 && (
                  <Badge bg="warning" text="dark" pill title="Hotels waiting for manual review">
                    {autoStatus.status.manualReviewCount}
                  </Badge>
                )}
                <i className="fas fa-external-link-alt text-muted small" aria-hidden="true"></i>
              </button>
            )}
          </span>
          <p className="text-muted">
            Map same hotels across countries & cities.
          </p>

          {loading ? (
            <div className="d-flex justify-content-center my-5">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : (
            <>
              <Card className="mb-4 shadow-sm border-0 rounded-xl">
                <Card.Body className="p-4">
                  <Row className="g-3">
                    {/* Country */}
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label className="fw-semibold small text-muted">
                          Country
                        </Form.Label>
                        <AsyncSelect
                          cacheOptions
                          defaultOptions
                          placeholder="Search country..."
                          value={selectedCountryOption}
                          loadOptions={loadCountries}
                          onChange={handleCountrySelect}
                          menuPortalTarget={document.body}
                          styles={{
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                            control: (base) => ({
                              ...base,
                              minHeight: "50px",
                              border: errors.masterCountryId
                                ? "1px solid #dc3545"
                                : "1px solid #e9ecef",
                              borderRadius: "10px",
                              fontSize: "0.9rem",
                              boxShadow: "none",
                              "&:hover": {
                                borderColor: errors.masterCountryId
                                  ? "#dc3545"
                                  : "#0d6efd",
                              },
                            }),
                          }}
                        />
                        {errors.masterCountryId && (
                          <div className="text-danger small mt-1 ps-1">
                            {errors.masterCountryId}
                          </div>
                        )}
                      </Form.Group>
                    </Col>

                    {/* City */}
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label className="fw-semibold small text-muted">
                          City
                        </Form.Label>
                        <AsyncSelect
                          cacheOptions
                          defaultOptions
                          placeholder="Search city..."
                          value={selectedCityOption}
                          loadOptions={loadCities}
                          onChange={handleCitySelect}
                          isDisabled={!formData.masterCountryId}
                          menuPortalTarget={document.body}
                          styles={{
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                            control: (base) => ({
                              ...base,
                              minHeight: "50px",
                              border: errors.masterCityId
                                ? "1px solid #dc3545"
                                : "1px solid #e9ecef",
                              borderRadius: "10px",
                              fontSize: "0.9rem",
                              boxShadow: "none",
                              "&:hover": {
                                borderColor: errors.masterCityId
                                  ? "#dc3545"
                                  : "#0d6efd",
                              },
                            }),
                          }}
                        />
                        {errors.masterCityId && (
                          <div className="text-danger small mt-1 ps-1">
                            {errors.masterCityId}
                          </div>
                        )}
                      </Form.Group>
                    </Col>

                    {/* Base Supplier */}
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label className="fw-semibold small text-muted">
                          Base Supplier
                        </Form.Label>
                        <Form.Select
                          name="baseSupplier"
                          value={formData.baseSupplier}
                          onChange={handleChange}
                          isInvalid={!!errors.baseSupplier}
                          className="form-select-modern"
                          style={{ height: "50px", borderRadius: "15px" }}
                        >
                          <option value="">Select Base Supplier</option>
                          {platforms.map((p, idx) => (
                            <option key={idx} value={p}>
                              {p}
                            </option>
                          ))}
                        </Form.Select>
                        {errors.baseSupplier && (
                          <div className="text-danger small mt-1 ps-1">
                            {errors.baseSupplier}
                          </div>
                        )}
                      </Form.Group>
                    </Col>

                    {/* Target Supplier */}
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label className="fw-semibold small text-muted">
                          Target Supplier
                        </Form.Label>

                       <Select
  isMulti
  options={platformOptions}
  value={platformOptions.filter((opt) =>
    formData.targetSuppliers.includes(opt.value)
  )}
  onChange={(selectedOptions) => {
    setFormData((prev) => ({
      ...prev,
      targetSuppliers: selectedOptions
        ? selectedOptions.map((opt) => opt.value)
        : [],
    }));
  }}
  placeholder="Select Target Suppliers..."

  // ✅ ADD THIS
  menuPortalTarget={document.body}

  styles={{
    menuPortal: (base) => ({ ...base, zIndex: 9999 }), // 🔥 important
    control: (base) => ({
      ...base,
      minHeight: "50px",
      border: errors.targetSuppliers
        ? "1px solid #dc3545"
        : "1px solid #e9ecef",
      borderRadius: "10px",
      overflow: "visible",
    }),
  }}
/>
                        {errors.targetSuppliers && (
                          <div className="text-danger small mt-1 ps-1">
                            {errors.targetSuppliers}
                          </div>
                        )}
                      </Form.Group>
                    </Col>

                    {/* Hotel Name */}
                    <Col md={9}>
                      <Form.Group>
                        <Form.Label className="fw-semibold small text-muted">
                          Hotel Name
                        </Form.Label>
                        <Form.Control
                          type="text"
                          name="hotelName"
                          placeholder="Type hotel names to filter..."
                          value={formData.hotelName}
                          onChange={handleChange}
                          style={{ height: "42px", borderRadius: "10px" }}
                        />
                      </Form.Group>
                    </Col>

                    <Col md={3} className="d-flex align-items-end">
                      <Button
                        variant="primary"
                        onClick={handleHotelSearch}
                        className="w-100 fw-semibold"
                        style={{ height: "42px", borderRadius: "10px" }}
                        disabled={searching}
                      >
                        {searching ? (
                          <>
                            <Spinner
                              animation="border"
                              size="sm"
                              className="me-2"
                            />
                            Searching...
                          </>
                        ) : (
                          "🔍 Search Hotels"
                        )}
                      </Button>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>

              {/* Search Results */}
              <div className="mt-4">
                <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-4">
                  <h5 className="mb-0 fw-bold text-dark">
                    Search Results{" "}
                    {searchResults.length > 0 &&
                      `(${searchResults.length} Matches)`}
                  </h5>
                  {searchResults.length > 0 && (
                    <div className="d-flex flex-wrap align-items-center gap-3">
                      <Button
                        variant="success"
                        size="sm"
                        className="rounded-pill px-4 fw-bold shadow-sm"
                        onClick={handleBulkMap}
                        disabled={bulkMapping || searching}
                      >
                        {bulkMapping ? (
                          <>
                            <Spinner
                              animation="border"
                              size="sm"
                              className="me-2"
                            />
                            Mapping All...
                          </>
                        ) : (
                          "✅ Map All Results"
                        )}
                      </Button>
                      <div
                        className="position-relative"
                        style={{ width: "min(300px, 100%)" }}
                      >
                        <Form.Control
                          type="text"
                          placeholder="Filter by hotel name..."
                          value={resultsFilter}
                          onChange={(e) => setResultsFilter(e.target.value)}
                          className="ps-4 rounded-pill shadow-sm"
                          style={{ height: "40px", border: "1px solid #e0e0e0" }}
                        />
                        <i
                          className="fas fa-search position-absolute text-muted"
                          style={{
                            left: "12px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            fontSize: "0.9rem",
                          }}
                        ></i>
                      </div>
                    </div>
                  )}
                </div>

                {searchResults.length > 0 ? (
                  <div className="search-results-container">
                    {searchResults
                      .filter((group) =>
                        group.hotels.some((h) =>
                          h.name
                            .toLowerCase()
                            .includes(resultsFilter.toLowerCase()),
                        ),
                      )
                      .map((match, mIdx) => (
                        <Card
                          key={mIdx}
                          className="mb-4 border-0 shadow-sm overflow-hidden"
                          style={{ borderRadius: "15px" }}
                        >
                          <Card.Header className="bg-white border-bottom-0 py-3 d-flex justify-content-between align-items-center">
                            <div className="d-flex align-items-center">
                              <div
                                className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center me-3"
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  fontSize: "0.8rem",
                                }}
                              >
                                {mIdx + 1}
                              </div>
                              <h6 className="mb-0 fw-bold text-dark">
                                {/* Potential Match Group */}
                              </h6>
                              Match Score :
                              <span
                                style={{
                                  color:
                                    match.matchScore >= 90
                                      ? "#198754"
                                      : "#ffc107", // green / yellow
                                  fontWeight: "600",
                                }}
                              >
                                {Number(match.matchScore).toFixed(2)} %
                              </span>
                            </div>
                            <div className="d-flex align-items-center">
                              <Button
                                size="sm"
                                variant="success"
                                className="me-3 px-4 rounded-pill fw-bold"
                                onClick={() => handleMapGroup(match, mIdx)}
                                disabled={mappingId !== null}
                              >
                                {mappingId === mIdx ? (
                                  <>
                                    <Spinner
                                      animation="border"
                                      size="sm"
                                      className="me-2"
                                    />
                                    Mapping...
                                  </>
                                ) : (
                                  "Map Hotels"
                                )}
                              </Button>
                            </div>
                          </Card.Header>
                          <Card.Body className="p-0">
                            <Table responsive bordered hover className="mb-0">
                              <thead className="bg-light">
                                <tr>
                                  <th className="ps-4 py-3 small text-muted text-uppercase fw-bold">
                                    Supplier
                                  </th>
                                  <th
                                    className="py-3 small text-muted text-uppercase fw-bold"
                                    style={{ width: "15%" }}
                                  >
                                    Hotel ID
                                  </th>
                                  <th
                                    className="py-3 small text-muted text-uppercase fw-bold"
                                    style={{ width: "30%" }}
                                  >
                                    Name
                                  </th>
                                  <th className="py-3 small text-muted text-uppercase fw-bold">
                                    Coordinates
                                  </th>
                                  <th className="py-3 small text-muted text-uppercase fw-bold">
                                    City/Country
                                  </th>
                                  <th className="pe-4 py-3 small text-muted text-uppercase fw-bold text-end">
                                    Status
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {match.hotels.map((hotel, hIdx) => (
                                  <tr key={hIdx}>
                                    <td className="ps-4 align-middle">
                                      {/* <Badge bg="secondary" className="px-2 py-1">
                                      {hotel.supplier}
                                    </Badge> */}
                                      {hotel.supplier}
                                    </td>
                                    <td className="align-middle fw-medium small text-break">
                                      {hotel.supplierHotelId}
                                    </td>
                                    <td
                                      className="align-middle fw-bold text-break"
                                      style={{ color: "#2c3e50" }}
                                    >
                                      {hotel.name}
                                    </td>
                                    <td className="align-middle small text-muted">
                                      {hotel.latitude || "N/A"},{" "}
                                      {hotel.longitude || "N/A"}
                                    </td>
                                    <td className="align-middle small">
                                      {[hotel.city, hotel.country]
                                        .filter(Boolean)
                                        .join(", ")}
                                    </td>
                                    <td className="align-middle text-end pe-4">
                                      {hotel.mappingStatus ? (
                                        <i
                                          className="fas fa-check-circle text-success"
                                          title="Mapped"
                                        ></i>
                                      ) : (
                                        <i
                                          className="fas fa-times-circle text-danger"
                                          title="Not Mapped"
                                        ></i>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          </Card.Body>
                        </Card>
                      ))}
                  </div>
                ) : (
                  !searching && (
                    <div className="text-center py-5 bg-white rounded-xl shadow-sm border">
                      <div className="mb-3" style={{ fontSize: "3rem" }}>
                        🏨
                      </div>
                      <h6 className="text-muted">
                        Fill the form and search to find matching hotels across
                        suppliers.
                      </h6>
                    </div>
                  )
                )}
              </div>
            </>
          )}

        </main>
      </div>
    </div>
  );
};

export default HotelMapping;
