import React, { useState, useEffect } from "react";
import {
  Card,
  Form,
  Button,
  Table,
  Badge,
  Spinner,
  Row,
  Col,
  Modal,
} from "react-bootstrap";
import toast from "react-hot-toast";
import axiosInstance from "../../components/AxiosInstance";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import AsyncSelect from "react-select/async";
import { FaUnlink, FaSearch, FaExclamationTriangle } from "react-icons/fa";
import "../../styles/CityMapping.css";
import BackButton from "../../components/BackButton";
import { apiErrorMessage } from "../../utils/apiErrorMessage";

// Rows per page. The list used to load only the first 100 rows with no way
// to see the rest (bulk mapping created thousands per supplier).
const PAGE_SIZE = 100;

const UnMappingCity = () => {
  const [loading, setLoading] = useState(false);
  const [mappings, setMappings] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  // Same supplier list as the City Mapping page — GRN and GoGlobal were
  // missing, so their mappings could not be unmapped here.
  const [platforms] = useState([
    "Iwtx",
    "Darina",
    "Jumeirah",
    "X3",
    "Ratehawk",
    "Atharva",
    "Grn",
    "Goglobal",
  ]);

  const [filters, setFilters] = useState({
    apiProvider: "",
    countryId: "",
    cityId: "",
    apiCountryId: "",
    apiCityId: ""
    
  });

  const [selectedCountryOption, setSelectedCountryOption] = useState(null);
  const [selectedCityOption, setSelectedCityOption] = useState(null);
  const [selectedPlatformCountryOption, setSelectedPlatformCountryOption] =
    useState(null);
  const [selectedPlatformCityOption, setSelectedPlatformCityOption] =
    useState(null);

  // Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [itemToUnmap, setItemToUnmap] = useState(null);
  const [isUnmapping, setIsUnmapping] = useState(false);

  const platformCountryApis = {
    Iwtx: { countries: "api/iwtx/countrylist" },
    Darina: { countries: "/api/darina/countrylist" },
    Jumeirah: { countries: "/api/jumeirah/countrylist" },
    X3: { countries: "api/iwtx/countrylist" },
    Ratehawk: { countries: "/api/ratehawk/countrylist" },
    Atharva: { countries: "/api/atharva/countrylist" },
    Grn: { countries: "/api/grn/countrylist" },
    Goglobal: { countries: "/api/goglobal/countrylist" },
  };

  const platformCityApis = {
    Iwtx: { cities: "api/iwtx/citylist" },
    Darina: { cities: "/api/darina/citylist" },
    Jumeirah: { cities: "/api/jumeirah/citylist" },
    X3: { cities: "/api/iwtx/citylist" },
    Ratehawk: { cities: "/api/ratehawk/citylist" },
    Atharva: { cities: "/api/atharva/citylist" },
    Grn: { cities: "/api/grn/citylist" },
    Goglobal: { cities: "/api/goglobal/citylist" },
  };

  // 1. Load Master Countries
  const loadCountries = async (inputValue) => {
    try {
      const response = await axiosInstance.get("/api/country", {
        params: { search: inputValue },
      });
      return response.data.map((c) => ({ value: c.id, label: c.name }));
    } catch (error) {
      console.error("Error loading countries:", error);
      return [];
    }
  };

  // 2. Load Master Cities
  const loadCities = async (inputValue) => {
    if (!filters.countryId) return [];
    try {
      const response = await axiosInstance.get(
        `/api/province/getByCountryId/${filters.countryId}`,
        { params: { search: inputValue } },
      );
      return response.data.map((c) => ({
        value: c.id,
        label: `${c.stateName}, ${c.country}`,
      }));
    } catch (error) {
      console.error("Error loading cities:", error);
      return [];
    }
  };

  // 3. Load Platform Countries
  const loadPlatformCountry = (platform) => async (inputValue) => {
    if (!platform) return [];
    try {
      const apiUrl = platformCountryApis[platform]?.countries;
      if (!apiUrl) return [];
      const response = await axiosInstance.get(apiUrl, {
        params: { search: inputValue },
      });
      return response.data.map((c) => ({
        value: c.id || c.countryId,
        label: c.name || c.countryName,
      }));
    } catch (error) {
      console.error("Error loading platform countries:", error);
      return [];
    }
  };

  // 4. Load Platform Cities
  const loadPlatformCity = (platform, countryId) => async (inputValue) => {
    if (!platform || !countryId) return [];
    try {
      const apiUrl = platformCityApis[platform]?.cities;
      if (!apiUrl) return [];
      const response = await axiosInstance.get(apiUrl, {
        params: { search: inputValue, countryId: countryId },
      });
      return response.data.map((c) => ({
        value: c.cityId || c.id,
        label: c.cityName || c.name,
      }));
    } catch (error) {
      console.error("Error loading platform cities:", error);
      return [];
    }
  };

  const handleCountrySelect = (option) => {
    setSelectedCountryOption(option);
    setFilters((prev) => ({
      ...prev,
      countryId: option ? option.value : "",
      cityId: "",
    }));
    setSelectedCityOption(null);
  };

  const handleCitySelect = (option) => {
    setSelectedCityOption(option);
    setFilters((prev) => ({
      ...prev,
      cityId: option ? option.value : "",
    }));
  };

  const handlePlatformCountrySelect = (option) => {
    setSelectedPlatformCountryOption(option);
    setFilters((prev) => ({
      ...prev,
      apiCountryId: option ? option.value : "",
      apiCityId: "",
    }));
    setSelectedPlatformCityOption(null);
  };

  const handlePlatformCitySelect = (option) => {
    setSelectedPlatformCityOption(option);
    setFilters((prev) => ({
      ...prev,
      apiCityId: option ? option.value : "",
    }));
  };

  const handlePlatformChange = (e) => {
    const platform = e.target.value;
    setFilters((prev) => ({
      ...prev,
      apiProvider: platform,
      apiCountryId: "",
      apiCityId: "",
    }));
    setSelectedPlatformCountryOption(null);
    setSelectedPlatformCityOption(null);
  };

  const fetchMappings = async (pageToLoad = 0) => {
    if (!filters.apiProvider) {
      toast.error("Please select a Platform");
      return;
    }

    setLoading(true);
    try {
      const response = await axiosInstance.get("/api/cityMapping", {
        params: {
          apiProvider: filters.apiProvider || "",
          countryId: filters.countryId || "",
          cityId: filters.cityId || "",
          page: pageToLoad,
          limit: PAGE_SIZE,
        },
      });
      const rows = Array.isArray(response.data) ? response.data : [];
      setMappings(rows);
      setPage(pageToLoad);
      // The endpoint returns a plain list; a full page means there may be more.
      setHasMore(rows.length === PAGE_SIZE);
    } catch (error) {
      console.error("Error fetching mappings:", error);
      toast.error(apiErrorMessage(error, "Failed to fetch mappings"));
    } finally {
      setLoading(false);
    }
  };

  const initiateUnmap = (item) => {
    setItemToUnmap(item);
    setShowConfirmModal(true);
  };

  const handleUnmap = async () => {
    if (!itemToUnmap) return;
    setIsUnmapping(true);

    console.log("itemToUnmap::", itemToUnmap);
    try {
      const { id, masterCountryId, apiProvider } = itemToUnmap;
      await axiosInstance.delete("/api/cityMapping/unmap", {
        params: {
          id: id,
          countryId: masterCountryId, 
          apiProvider: apiProvider,
        },
      });
      toast.success("City unmapped successfully ✅");
      setMappings((prev) => prev.filter((m) => m.id !== id));
      setShowConfirmModal(false);
      setItemToUnmap(null);
    } catch (error) {
      console.error("Unmapping error:", error);
      toast.error(apiErrorMessage(error, "Failed to unmap city ❌"));
    } finally {
      setIsUnmapping(false);
    }
  };

  const selectStyles = {
    control: (base) => ({
      ...base,
      minHeight: "38px",
      border: "1px solid #dee2e6",
      borderRadius: "6px",
      fontSize: "0.875rem",
      "&:hover": { borderColor: "#86b7fe" },
    }),
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <div className="mb-4">
            <span className="d-flex align-items-center gap-2">
              <BackButton fallback="/adminDashboard" />
              <h3 className="fw-bold text-dark mb-1">City Unmapping</h3>
            </span>
            <p className="text-muted">
              View and remove mapped cities from external API platforms.
            </p>
          </div>

          <Card className="border-0 shadow-sm mb-4 rounded-4">
            <Card.Body className="p-4">
              <Row className="g-3">                

                <Col md={3}>
                  <Form.Group>
                    <Form.Label className="fw-semibold small text-uppercase text-muted">
                      Platform
                    </Form.Label>
                    <Form.Select
                      value={filters.apiProvider}
                      onChange={handlePlatformChange}
                      className="form-control-lg fs-6"
                    >
                      <option value="">Select Platform</option>
                      {platforms.map((p, idx) => (
                        <option key={idx} value={p}>
                          {p}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>

                <Col md={3}>
                  <Form.Group>
                    <Form.Label className="fw-semibold small text-uppercase text-muted">
                    Country
                    </Form.Label>
                    <AsyncSelect
                      key={`p-country-${filters.apiProvider}`}
                      cacheOptions
                      defaultOptions
                      placeholder="Search country..."
                      value={selectedCountryOption}
                      loadOptions={loadCountries}
                      onChange={handleCountrySelect}
                      styles={selectStyles}
                      menuPortalTarget={document.body}
                    />
                  </Form.Group>
                </Col>

                <Col md={3}>
                  <Form.Group>
                    <Form.Label className="fw-semibold small text-uppercase text-muted">
                    City
                    </Form.Label>
                    <AsyncSelect
                      key={`p-city-${filters.apiProvider}-${filters.apiCountryId}`}
                      cacheOptions
                      defaultOptions
                      placeholder="Search city..."
                      value={selectedCityOption}
                      loadOptions={loadCities}
                      onChange={handleCitySelect}
                      isDisabled={!filters.countryId}
                      styles={selectStyles}
                      menuPortalTarget={document.body}
                    />
                  </Form.Group>
                </Col>

                <Col md={3} className="d-flex align-items-end">
                  <Button
                    variant="primary"
                    className="w-100 btn-lg fs-6 fw-bold d-flex align-items-center justify-content-center"
                    onClick={() => fetchMappings(0)}
                    style={{ height: "38px" }}
                    disabled={loading}
                  >
                    {loading ? (
                      <Spinner size="sm" className="me-2" />
                    ) : (
                      <FaSearch className="me-2" />
                    )}
                    Search
                  </Button>
                </Col>
              </Row>
            </Card.Body>
          </Card>

          <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
            <Card.Body className="p-0">
              <div className="p-3 bg-white border-bottom">
                <h5 className="mb-0 fw-bold">Mapped Data Overview</h5>
              </div>
              <Table
                striped
                bordered
                hover
                responsive
                className="un-mapping-table"
              >
                <thead className="bg-light text-muted small text-uppercase">
                  <tr>
                    <th className="px-4 py-3 border-0">API Provider</th>
                    <th className="py-3 border-0 text-start">Country</th>
                    <th className="py-3 border-0 text-start">City</th>
                    <th className="py-3 border-0">Mapped Id</th>
                    <th className="py-3 border-0">Status</th>
                    <th className="py-3 border-0">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="py-5">
                        <Spinner
                          animation="border"
                          variant="primary"
                          size="sm"
                        />
                        <span className="ms-2">Loading...</span>
                      </td>
                    </tr>
                  ) : mappings.length > 0 ? (
                    mappings.map((item, idx) => (
                      <tr key={idx} className="align-middle border-bottom">
                        <td className="px-4 py-3 fw-medium">
                          {item.apiProvider}
                        </td>
                        <td className="py-3 text-start">
                          {item.apiCountryCode || "-"}
                        </td>
                        <td className="py-3 text-start">
                          {item.apiCityCode || "-"}
                        </td>
                        <td className="py-3">{item.id}</td>
                        <td className="py-3">
                          <span bg="success-subtle" className="text-success">
                            Active
                          </span>
                        </td>
                        <td className="py-3">
                          <Button
                            variant="outline-danger"
                            size="sm"
                            className="rounded-pill px-3"
                            onClick={() => initiateUnmap(item)}
                          >
                            <FaUnlink className="me-1" /> Un Map
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="py-5 text-muted">
                        No mappings found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
              {(page > 0 || hasMore) && (
                <div className="d-flex justify-content-between align-items-center p-3 border-top bg-white">
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    disabled={loading || page === 0}
                    onClick={() => fetchMappings(page - 1)}
                  >
                    Previous
                  </Button>
                  <span className="small text-muted">
                    Page {page + 1} · rows {page * PAGE_SIZE + 1}–
                    {page * PAGE_SIZE + mappings.length}
                  </span>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    disabled={loading || !hasMore}
                    onClick={() => fetchMappings(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </Card.Body>
          </Card>

          <Modal
            show={showConfirmModal}
            onHide={() => !isUnmapping && setShowConfirmModal(false)}
            centered
          >
            <Modal.Header closeButton className="border-0">
              <Modal.Title className="text-danger h5 d-flex align-items-center">
                <FaExclamationTriangle className="me-2" /> Confirm Unmapping
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <p>Are you sure you want to unmap this city?</p>
              {/* <div className="p-3 bg-light rounded shadow-sm">
                <div className="d-flex justify-content-between mb-1">
                  <span className="text-muted">Provider:</span>{" "}
                  <strong>{itemToUnmap?.apiProvider}</strong>
                </div>
                <div className="d-flex justify-content-between">
                  {" "}
                  <span className="text-muted">City:</span>{" "}
                  <strong>
                    {itemToUnmap?.cityName || itemToUnmap?.masterCityName}
                  </strong>
                </div>
              </div> */}
            </Modal.Body>
            <Modal.Footer className="border-0">
              <Button
                variant="light"
                onClick={() => setShowConfirmModal(false)}
                disabled={isUnmapping}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleUnmap}
                disabled={isUnmapping}
              >
                {isUnmapping ? <Spinner size="sm" className="me-2" /> : null} Un
                Map
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
};

export default UnMappingCity;
