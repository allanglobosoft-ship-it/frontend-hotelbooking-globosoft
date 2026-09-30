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
} from "react-bootstrap";
import toast from "react-hot-toast";
import axiosInstance from "../../components/AxiosInstance";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import AsyncSelect from "react-select/async";
import BackButton from "../../components/BackButton";
import "../../styles/CityMapping.css";

const CityMapping = () => {
  const [loading, setLoading] = useState(false);
  const [mappings, setMappings] = useState([]);
  const [selectedCountryOption, setSelectedCountryOption] = useState(null);
  const [selectedCityOption, setSelectedCityOption] = useState(null);
  const [selectedPlatformCountryOption, setselectedPlatformCountryOption] =
    useState(null);
  const [selectedPlatformCityOption, setSelectedPlatformCityOption] =
    useState(null);

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

  // Row-wise selections and status per platform in the overview table
  const [rowState, setRowState] = useState({});

  useEffect(() => {
    // Initialize per-platform state
    const initial = {};
    platforms.forEach((p) => {
      initial[p] = {
        countryOption: null,
        cityOption: null,
        searching: false,
        status: null, // 'success' | 'fail' | null
      };
    });
    setRowState(initial);
  }, []);

  const [formData, setFormData] = useState({
    masterCountryId: "",
    masterCityId: "",
    apiProvider: "",
    apiCountryId: "",
    apiCityId: "",
  });

  // Generic form input handler
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "apiProvider") {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
        apiCountryId: "",
        apiCityId: "",
      }));
      setselectedPlatformCountryOption(null);
      setSelectedPlatformCityOption(null);
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  // Load countries dynamically for AsyncSelect
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
        label: `${c.stateName}, ${c.country}`,
      }));
    } catch (error) {
      console.error("Error loading cities:", error);
      return [];
    }
  };

  const platformCountryApis = {
    Iwtx: {
      countries: "api/iwtx/countrylist",
    },
    Darina: {
      countries: "/api/darina/countrylist",
    },
    Jumeirah: {
      countries: "/api/jumeirah/countrylist",
    },
    X3: {
      // X3 has no city master of its own — bulk-generated api_city_mapping
      // rows use INHOUSE master ids (see X3CitySource.buildRow). The row's
      // dropdowns therefore need to feed master ids, not IWTX ids, or the
      // Search button would never find its own row. See ticket comments.
      countries: "/api/country",
    },
    Ratehawk: {
      countries: "/api/ratehawk/countrylist",
    },
    Atharva: {
      countries: "/api/atharva/countrylist",
    },
    Grn: {
      countries: "/api/grn/countrylist",
    },
    Goglobal: {
      countries: "/api/goglobal/countrylist",
    },
  };

  const platformCityApis = {
    Iwtx: {
      cities: "api/iwtx/citylist",
    },
    Darina: {
      cities: "/api/darina/citylist",
    },
    Jumeirah: {
      cities: "/api/jumeirah/citylist",
    },
    X3: {
      // Same reason as X3 countries above — feeds master state ids so the
      // row matches the bulk-generated api_city_mapping.api_city_id.
      // {countryId} is substituted by loadPlatformCity from the selected
      // country's value.
      cities: "/api/province/getByCountryId/{countryId}",
    },
    Ratehawk: {
      cities: "/api/ratehawk/citylist",
    },
    Atharva: {
      cities: "/api/atharva/citylist",
    },
    Grn: {
      cities: "/api/grn/citylist",
    },
    Goglobal: {
      cities: "/api/goglobal/citylist",
    },
  };

  // Load platform country
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

  // Load platform city
  const loadPlatformCity = (platform, countryId) => async (inputValue) => {
    if (!platform || !countryId) return [];

    try {
      const apiUrlTemplate = platformCityApis[platform]?.cities;
      if (!apiUrlTemplate) return [];

      // Suppliers whose city list is served as a path-param endpoint use a
      // {countryId} placeholder in the URL template (currently X3, whose
      // dropdowns feed master state ids from /api/province/getByCountryId).
      // For those, do NOT also pass countryId as a query param.
      const hasCountryPlaceholder = apiUrlTemplate.includes("{countryId}");
      const apiUrl = hasCountryPlaceholder
        ? apiUrlTemplate.replace("{countryId}", encodeURIComponent(countryId))
        : apiUrlTemplate;
      const params = hasCountryPlaceholder
        ? { search: inputValue }
        : { search: inputValue, countryId: countryId };

      const response = await axiosInstance.get(apiUrl, { params });

      return response.data.map((c) => ({
        // stateName is set by /api/province/getByCountryId (MasterStateDTO);
        // every other supplier response already lands via cityName or name.
        value: c.cityId || c.id,
        label: c.cityName || c.name || c.stateName,
      }));
    } catch (error) {
      console.error("Error loading platform cities:", error);
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
  };

  // City select handler
  const handleCitySelect = (option) => {
    setSelectedCityOption(option);
    setFormData((prev) => ({
      ...prev,
      masterCityId: option ? option.value : "",
    }));
  };

  // Row handlers
  const handleRowCountryChange = (platform, option) => {
    setRowState((prev) => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        countryOption: option,
        cityOption: null,
        status: null,
      },
    }));
  };

  const handleRowCityChange = (platform, option) => {
    console.log("handleRowCityChange::option val::", option);
    setRowState((prev) => ({
      ...prev,
      [platform]: { ...prev[platform], cityOption: option, status: null },
    }));
  };

  const handleRowSearch = async (platform) => {
    console.log("platform:::", platform);
    const current = rowState[platform] || {};
    const apiCountryId = current.countryOption?.value || "";
    const apiCityId = current.cityOption?.value || "";

    console.log("current:::", current);
    console.log("apiCountryId:::", apiCountryId);
    console.log("apiCityId:::", apiCityId);

    if (!apiCountryId) {
      toast.error("Select Platform Country first");
      return;
    }
    if (!apiCityId) {
      toast.error("Select Platform City first");
      return;
    }

    setRowState((prev) => ({
      ...prev,
      [platform]: { ...prev[platform], searching: true, status: null },
    }));

    try {
      let searchReq = {
        apiProvider: platform.toLowerCase(),
        apiCountryId,
        apiCityId,
      };
      const response = await axiosInstance.post(
        "/api/cityMapping/search",
        searchReq,
      );

      const data = response?.data;
      const found = Array.isArray(data) ? data.length > 0 : Boolean(data);

      setRowState((prev) => ({
        ...prev,
        [platform]: {
          ...prev[platform],
          status: found ? "success" : "fail",
          searching: false,
        },
      }));
    } catch (error) {
      console.error("Row validation error:", error);
      toast.error("Search failed");
      setRowState((prev) => ({
        ...prev,
        [platform]: { ...prev[platform], status: "fail", searching: false },
      }));
    }
  };

  // Platform  Country select handler
  const handlePlatformCountrySelect = (option) => {
    setselectedPlatformCountryOption(option);
    setFormData((prev) => ({
      ...prev,
      apiCountryId: option ? option.value : "",
      apiCityId: "", // reset city when country changes
    }));
    setSelectedPlatformCityOption(null);
  };

  //Platform City select handler
  const handlePlatformCitySelect = (option) => {
    setSelectedPlatformCityOption(option);
    setFormData((prev) => ({
      ...prev,
      apiCityId: option ? option.value : "",
    }));
  };

  // Save mapping
  const handleAddMapping = async () => {
    if (
      !formData.masterCountryId ||
      !formData.masterCityId ||
      !formData.apiProvider
    ) {
      toast.error("⚠ Please fill all required fields");
      return;
    }

    try {
      const res = await axiosInstance.post("/api/cityMapping/save", formData);
      setMappings((prev) => [...prev, res.data]);
      toast.success("Mapping added successfully ✅");

      // Reset form
      setFormData({
        masterCountryId: "",
        masterCityId: "",
        apiProvider: "",
        apiCountryId: "",
        apiCityId: "",
      });
      setSelectedCountryOption(null);
      setSelectedCityOption(null);
    } catch (err) {
      toast.error("Failed to save mapping ❌");
      console.error(err);
    }
  };

  // Example rules for each platform
  const platformVisibility = {
    Iwtx: { showCountry: true, showCity: true },
    Darina: { showCountry: true, showCity: true },
    Jumeirah: { showCountry: true, showCity: true },
    X3: { showCountry: true, showCity: true },
    Ratehawk: { showCountry: true, showCity: true },
    Atharva: { showCountry: true, showCity: true },
    // GRN uses the same shape as the other suppliers — country picker
    // (2-letter ISO code) then city picker keyed by countryId. Without
    // this entry the Platform Country/City AsyncSelects render as `undefined`
    // and the user can never pick a GRN city to map.
    Grn: { showCountry: true, showCity: true },
    // GoGlobal same shape as the others — numeric CountryId picker
    // then city picker paged from goglobal_destinations.
    Goglobal: { showCountry: true, showCity: true },
    // add more platforms as needed
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <span className="d-flex align-items-center gap-2 mb-3">
            <BackButton fallback="/adminDashboard" />
            <h3 className="mb-0">City Mapping</h3>
          </span>
          <p className="text-muted">
            Map master countries & cities to external API platforms.
          </p>

          {loading ? (
            <div className="d-flex justify-content-center my-5">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : (
            <>
              <Card className="mb-4 shadow-sm">
                <Card.Body>
                  <Row className="mb-3">
                    {/* Country */}
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label>Master Country</Form.Label>
                        <AsyncSelect
                          cacheOptions
                          defaultOptions
                          isClearable
                          placeholder="Search country..."
                          value={selectedCountryOption}
                          loadOptions={loadCountries}
                          onChange={handleCountrySelect}
                          menuPortalTarget={document.body} // 👈 force portal
                          styles={{
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }), // 👈 keep menu on top
                            control: (base) => ({
                              ...base,
                              minHeight: "36px",
                              border: "1px solid #dee2e6",
                              borderRadius: "6px",
                              fontSize: "0.875rem",
                              "&:hover": {
                                borderColor: "#86b7fe",
                              },
                            }),
                            menu: (base) => ({
                              ...base,
                              zIndex: 99999,
                              position: "absolute",
                              marginTop: "2px",
                              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                              border: "1px solid #dee2e6",
                              borderRadius: "6px",
                            }),
                          }}
                        />
                      </Form.Group>
                    </Col>

                    {/* City */}
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label>Master City</Form.Label>
                        <AsyncSelect
                          cacheOptions
                          defaultOptions
                          isClearable
                          placeholder="Search  here & select city..."
                          value={selectedCityOption}
                          loadOptions={loadCities}
                          onChange={handleCitySelect}
                          isDisabled={!formData.masterCountryId}
                          menuPortalTarget={document.body} // 👈 force portal
                          styles={{
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }), // 👈 keep menu on top
                            control: (base) => ({
                              ...base,
                              minHeight: "36px",
                              border: "1px solid #dee2e6",
                              borderRadius: "6px",
                              fontSize: "0.875rem",
                              "&:hover": {
                                borderColor: "#86b7fe",
                              },
                            }),
                            menu: (base) => ({
                              ...base,
                              zIndex: 99999,
                              position: "absolute",
                              marginTop: "2px",
                              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                              border: "1px solid #dee2e6",
                              borderRadius: "6px",
                            }),
                          }}
                        />
                      </Form.Group>
                    </Col>

                    {/* Platform */}
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label>Platform</Form.Label>
                        <Form.Select
                          name="apiProvider"
                          value={formData.apiProvider}
                          onChange={handleChange}
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
                  </Row>

                  <Row className="mb-3">
                    {/* Conditionally render based on config */}
                    {platformVisibility[formData.apiProvider]?.showCountry && (
                      <Col md={4}>
                        <Form.Group>
                          <Form.Label>Platform Country</Form.Label>
                          <AsyncSelect
                            key={`country-${formData.apiProvider}`}
                            cacheOptions
                            defaultOptions
                            isClearable
                            placeholder="Search country..."
                            value={selectedPlatformCountryOption}
                            loadOptions={loadPlatformCountry(
                              formData.apiProvider,
                            )}
                            onChange={handlePlatformCountrySelect}
                            menuPortalTarget={document.body} // 👈 force portal
                            styles={{
                              menuPortal: (base) => ({ ...base, zIndex: 9999 }), // 👈 keep menu on top
                              control: (base) => ({
                                ...base,
                                minHeight: "36px",
                                border: "1px solid #dee2e6",
                                borderRadius: "6px",
                                fontSize: "0.875rem",
                                "&:hover": {
                                  borderColor: "#86b7fe",
                                },
                              }),
                              menu: (base) => ({
                                ...base,
                                zIndex: 99999,
                                position: "absolute",
                                marginTop: "2px",
                                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                                border: "1px solid #dee2e6",
                                borderRadius: "6px",
                              }),
                            }}
                          />
                        </Form.Group>
                      </Col>
                    )}

                    {platformVisibility[formData.apiProvider]?.showCity && (
                      <Col md={4}>
                        <Form.Group>
                          <Form.Label>Platform City</Form.Label>
                          <AsyncSelect
                            key={`city-${formData.apiProvider}-${formData.apiCountryId}`}
                            cacheOptions
                            defaultOptions
                            isClearable
                            placeholder="Search & select city..."
                            value={selectedPlatformCityOption}
                            loadOptions={loadPlatformCity(
                              formData.apiProvider,
                              formData.apiCountryId,
                            )}
                            onChange={handlePlatformCitySelect}
                            isDisabled={!formData.apiCountryId}
                            menuPortalTarget={document.body} // 👈 force portal
                            styles={{
                              menuPortal: (base) => ({ ...base, zIndex: 9999 }), // 👈 keep menu on top
                              control: (base) => ({
                                ...base,
                                minHeight: "36px",
                                border: "1px solid #dee2e6",
                                borderRadius: "6px",
                                fontSize: "0.875rem",
                                "&:hover": {
                                  borderColor: "#86b7fe",
                                },
                              }),
                              menu: (base) => ({
                                ...base,
                                zIndex: 99999,
                                position: "absolute",
                                marginTop: "2px",
                                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                                border: "1px solid #dee2e6",
                                borderRadius: "6px",
                              }),
                            }}
                          />
                        </Form.Group>
                      </Col>
                    )}

                    <Col md={4} className="d-flex align-items-end">
                      <Button variant="primary" onClick={handleAddMapping}>
                        ➕ Add Mapping
                      </Button>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
              {/* Mappings Table */}

              <Card className="shadow-sm">
                <Card.Body>
                  <h5 className="mb-3">Mappings Overview</h5>
                  <Table
                    striped
                    bordered
                    hover
                    responsive
                    className="mapping-table"
                  >
                    <thead>
                      <tr>
                        <th>Api Provider</th>
                        <th>Country</th>
                        <th>City</th>
                        <th>Action</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {platforms.map((p, idx) => {
                        const state = rowState[p] || {};

                        return (
                          <tr key={idx}>
                            <td>{p}</td>

                            {/* Dropdown for Platform Country */}
                            <td>
                              <div style={{ width: "100%", maxWidth: 360 }}>
                                <AsyncSelect
                                  key={`table-country-${p}`}
                                  cacheOptions
                                  defaultOptions
                                  placeholder="Search country..."
                                  value={state.countryOption}
                                  loadOptions={loadPlatformCountry(p)}
                                  onChange={(opt) =>
                                    handleRowCountryChange(p, opt)
                                  }
                                  classNamePrefix="pill-select"
                                  styles={{
                                    control: (base) => ({
                                      ...base,
                                      borderRadius: 999,
                                      minHeight: 40,
                                    }),
                                  }}
                                />
                              </div>
                            </td>

                            {/* Dropdown or readonly for Platform City */}
                            <td>
                              <div style={{ width: "100%", maxWidth: 380 }}>
                                <AsyncSelect
                                  key={`table-city-${p}-${state.countryOption?.value}`}
                                  cacheOptions
                                  defaultOptions
                                  placeholder="Search & select city..."
                                  value={state.cityOption}
                                  loadOptions={loadPlatformCity(
                                    p,
                                    state.countryOption?.value,
                                  )}
                                  onChange={(opt) =>
                                    handleRowCityChange(p, opt)
                                  }
                                  isDisabled={!state.countryOption}
                                  classNamePrefix="pill-select"
                                  styles={{
                                    control: (base) => ({
                                      ...base,
                                      borderRadius: 999,
                                      minHeight: 40,
                                    }),
                                  }}
                                />
                              </div>
                            </td>

                            {/* Action */}
                            <td>
                              <Button
                                className="btn-indigo"
                                disabled={state.searching}
                                onClick={() => handleRowSearch(p)}
                              >
                                {state.searching ? "Searching..." : "Search"}
                              </Button>
                            </td>

                            {/* Status */}
                            <td>
                              {state.status === "success" && (
                                <Badge bg="success">✔</Badge>
                              )}
                              {state.status === "fail" && (
                                <Badge bg="danger">✖</Badge>
                              )}
                              {!state.status && <span>-</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </Card.Body>
              </Card>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default CityMapping;
