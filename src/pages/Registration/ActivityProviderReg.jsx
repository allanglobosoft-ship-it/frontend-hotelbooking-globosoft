import React, { useEffect, useState } from "react";
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
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import {
  FaEdit,
  FaTrash,
  FaEye,
  FaDollarSign,
  FaArrowLeft,
} from "react-icons/fa";
import Select from "react-select";
import DashboardRedirections from "../../components/DashboardRedirections";

const ActivityProviderReg = () => {
  const navigate = useNavigate();

  // ── list state ─────────────────────────────────────────────────────
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // List-page filter dropdowns — let the operator narrow the providers
  // table by country and/or city without having to type anything.
  const [filterCountry, setFilterCountry] = useState(null);
  const [filterCity, setFilterCity] = useState(null);
  const [filterCityOptions, setFilterCityOptions] = useState([]);

  // Shared country list (used by both the list filter and the create
  // form). Loaded once on mount via /api/country.
  const [countryOptions, setCountryOptions] = useState([]);

  // ── form state ─────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isViewMode, setIsViewMode] = useState(false);
  const [formData, setFormData] = useState({
    providerName: "",
    providerCode: "",
    firstName: "",
    lastName: "",
    mobileNo: "",
    emailId: "",
    address: "",
    countryId: null,
    countryName: "",
    cityId: null,
    cityName: "",
  });
  const [formCityOptions, setFormCityOptions] = useState([]);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState({});

  // ── helpers ────────────────────────────────────────────────────────
  // Picks the city list for a given country — the same country-scoped
  // City list the "City" dropdown on Hotel Registration shows
  // (HotelReg.jsx → loadProvinces, /api/province/getByCountryId/{id}).
  // Returns an array of {value, label}.
  const loadCitiesForCountry = async (countryId) => {
    if (!countryId) return [];
    try {
      const res = await axiosInstance.get(
        `/api/province/getByCountryId/${countryId}`
      );
      const list = Array.isArray(res.data) ? res.data : [];
      return list
        .filter((p) => !p.isDeleted)
        .map((p) => ({
          value: p.id,
          label: p.stateName || p.name,
        }));
    } catch (err) {
      console.error("Load cities failed", err);
      return [];
    }
  };

  // Loads the master country list — /api/country?page=0&limit=250
  const loadCountries = async () => {
    try {
      const res = await axiosInstance.get(
        "/api/country?page=0&limit=250&search="
      );
      const list = Array.isArray(res.data) ? res.data : res.data?.content || [];
      setCountryOptions(
        list.map((c) => ({
          value: c.id,
          label: c.name,
          code: c.countryCode,
        }))
      );
    } catch (err) {
      console.error("Load countries failed", err);
      setCountryOptions([]);
    }
  };

  // ── fetch list ─────────────────────────────────────────────────────
  // Wraps the new combined endpoint:
  //   /api/activityProvider?page=...&limit=...&search=...
  //                       [&countryId=...&cityId=...]
  const fetchActivityList = async (
    pageNum = 0,
    searchValue = search,
    countryIdValue = filterCountry?.value || null,
    cityIdValue = filterCity?.value || null
  ) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: "10",
      });
      if (searchValue && searchValue.trim())
        params.append("search", searchValue.trim());
      if (countryIdValue) params.append("countryId", String(countryIdValue));
      if (cityIdValue) params.append("cityId", String(cityIdValue));

      const response = await axiosInstance.get(
        `/api/activityProvider?${params.toString()}`
      );
      const data = response.data;
      const list = data?.content || data || [];
      setItems(Array.isArray(list) ? list : []);
      setTotalPages(data?.totalPages || (list.length < 10 ? pageNum + 1 : pageNum + 2));
    } catch (err) {
      console.error("Error fetching activity providers:", err);
      toast.error("Failed to fetch activity providers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCountries();
    fetchActivityList();
    // eslint-disable-next-line
  }, []);

  // Debounced re-fetch whenever the search keyword changes.
  useEffect(() => {
    const t = setTimeout(() => fetchActivityList(0, search), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [search]);

  // Refetch when country/city filters change. Also resets city options
  // when the country filter changes.
  useEffect(() => {
    (async () => {
      if (filterCountry?.value) {
        const cities = await loadCitiesForCountry(filterCountry.value);
        setFilterCityOptions(cities);
        if (filterCity && !cities.find((c) => c.value === filterCity.value)) {
          setFilterCity(null); // city no longer valid for new country
        }
      } else {
        setFilterCityOptions([]);
        setFilterCity(null);
      }
    })();
    // eslint-disable-next-line
  }, [filterCountry]);

  useEffect(() => {
    fetchActivityList(0, search, filterCountry?.value || null, filterCity?.value || null);
    // eslint-disable-next-line
  }, [filterCountry, filterCity]);

  // ── modal open / close ─────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setIsViewMode(false);
    setValidationErrors({});
    setFormData({
      providerName: "",
      providerCode: "",
      firstName: "",
      lastName: "",
      mobileNo: "",
      emailId: "",
      address: "",
      countryId: null,
      countryName: "",
      cityId: null,
      cityName: "",
    });
    setFormCityOptions([]);
    setError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setIsViewMode(false);
    setValidationErrors({});
    setFormData({
      providerName: "",
      providerCode: "",
      firstName: "",
      lastName: "",
      mobileNo: "",
      emailId: "",
      address: "",
      countryId: null,
      countryName: "",
      cityId: null,
      cityName: "",
    });
    setFormCityOptions([]);
    setError("");
  };

  // Shared by openEdit + handleView — fetches a single provider and
  // populates the modal form. The view flag toggles read-only inputs.
  const openProviderModal = async (item, viewOnly) => {
    setIsLoading(true);
    try {
      const response = await axiosInstance.get(
        `/api/activityProvider/${item.providerId}`
      );
      const data = response.data;
      if (!data) {
        toast.error("Failed to fetch provider details");
        return;
      }
      setEditing(data);
      setIsViewMode(viewOnly);
      setFormData({
        providerName: data.providerName || "",
        providerCode: data.providerCode || "",
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        mobileNo: data.mobileNo || "",
        emailId: data.emailId || "",
        address: data.address || "",
        countryId: data.countryId || null,
        countryName: data.countryName || "",
        cityId: data.cityId || null,
        cityName: data.cityName || "",
      });
      // Pre-load the city dropdown for the saved country.
      if (data.countryId) {
        const cities = await loadCitiesForCountry(data.countryId);
        setFormCityOptions(cities);
      }
      setValidationErrors({});
      setShowModal(true);
    } catch (err) {
      console.error("Error fetching provider details:", err);
      toast.error("Failed to fetch provider details");
    } finally {
      setIsLoading(false);
    }
  };

  const openEdit = (item) => openProviderModal(item, false);
  const handleView = (item) => openProviderModal(item, true);

  const handleDelete = (item) => {
    Swal.fire({
      title: `Are you sure? You want to delete ${item.providerName}`,
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
          .delete(`/api/activityProvider/${item.providerId}`)
          .then(() => {
            toast.success("Activity Provider deleted successfully");
            fetchActivityList(page, search);
          })
          .catch((err) => {
            console.error("Delete error:", err);
            toast.error(
              `Failed to delete activity provider: ${err.response?.data?.message || err.message}`
            );
          });
      }
    });
  };

  const handleActivityRates = (item) => {
    navigate("/activity-rates", {
      state: {
        activityProvider: item,
        activityProviderId: item.providerId,
        activityProviderName: item.providerName,
      },
    });
  };

  // ── validation ─────────────────────────────────────────────────────
  const validateForm = (data) => {
    const errors = {};
    if (!data.providerName?.trim())
      errors.providerName = "Provider Name is required";
    return errors;
  };

  // Build the payload — sends countryId/cityId + their denormalised names
  // so the backend can persist both for fast listing.
  const buildPayload = () => ({
    providerName: formData.providerName,
    providerCode: formData.providerCode,
    firstName: formData.firstName,
    lastName: formData.lastName,
    mobileNo: formData.mobileNo,
    emailId: formData.emailId,
    address: formData.address,
    countryId: formData.countryId,
    countryName: formData.countryName,
    cityId: formData.cityId,
    cityName: formData.cityName,
  });

  const saveActivity = async (e) => {
    e.preventDefault();
    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    try {
      setIsLoading(true);
      const response = await axiosInstance.post(
        "/api/activityProvider/register",
        buildPayload(),
        { headers: { "Content-Type": "application/json" } }
      );
      if (response.data) {
        // /register returns the new providerId (a Long). Keep it so the
        // hint below can deep-link straight to its Activity Rates page.
        const newProviderId =
          typeof response.data === "object"
            ? response.data.providerId ?? response.data.id
            : response.data;
        const newProviderName = formData.providerName;

        setValidationErrors({});
        await fetchActivityList(page, search);
        closeModal();

        // Hint: a provider has no searchable activities until at least
        // one Activity Rate is added against it. Nudge the operator to
        // add rates now (deep-links to /activity-rates for this provider).
        Swal.fire({
          icon: "success",
          title: "Activity Provider Added",
          html:
            "Next, add <b>Activity Rates</b> for this provider so its " +
            "activities show up in the <b>search results</b>.",
          showCancelButton: true,
          confirmButtonText: "Add Activity Rates Now",
          cancelButtonText: "Later",
          confirmButtonColor: "#198754",
          cancelButtonColor: "#6c757d",
        }).then((result) => {
          if (result.isConfirmed) {
            navigate("/activity-rates", {
              state: {
                activityProvider: {
                  providerId: newProviderId,
                  providerName: newProviderName,
                },
                activityProviderId: newProviderId,
                activityProviderName: newProviderName,
              },
            });
          }
        });
      }
    } catch (err) {
      console.error("Save activity error:", err);
      setError("Failed to save activity provider");
      toast.error(
        `Failed to save activity: ${err.response?.data?.message || err.message}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const updateActivity = async (e) => {
    e.preventDefault();
    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    if (!editing) return;
    try {
      setIsLoading(true);
      const response = await axiosInstance.put(
        `/api/activityProvider/${editing.providerId}`,
        buildPayload(),
        { headers: { "Content-Type": "application/json" } }
      );
      if (response.data) {
        toast.success("Activity Provider updated successfully!");
        setValidationErrors({});
        await fetchActivityList(page, search);
        closeModal();
      }
    } catch (err) {
      console.error("Update activity error:", err);
      setError("Failed to update activity provider");
      toast.error(
        `Failed to update activity: ${err.response?.data?.message || err.message}`
      );
    } finally {
      setIsLoading(false);
    }
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
            <Card.Header className="d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span className="fw-semibold">Activity Providers</span>
              <div className="d-flex flex-wrap gap-2 align-items-center">
                {/* Country filter — narrows providers to the picked country */}
                <div style={{ minWidth: 180 }}>
                  <Select
                    placeholder="Filter by country"
                    options={countryOptions}
                    value={filterCountry}
                    onChange={(opt) => {
                      setFilterCountry(opt);
                      setPage(0);
                    }}
                    isClearable
                    isSearchable
                    menuPortalTarget={document.body}
                    styles={{
                      menuPortal: (b) => ({ ...b, zIndex: 9999 }),
                      control: (b) => ({ ...b, minHeight: 36 }),
                    }}
                  />
                </div>
                {/* City filter — only enabled once a country is picked */}
                <div style={{ minWidth: 180 }}>
                  <Select
                    placeholder={
                      filterCountry
                        ? "Filter by city"
                        : "Pick country first"
                    }
                    options={filterCityOptions}
                    value={filterCity}
                    onChange={(opt) => {
                      setFilterCity(opt);
                      setPage(0);
                    }}
                    isClearable
                    isSearchable
                    isDisabled={!filterCountry}
                    menuPortalTarget={document.body}
                    styles={{
                      menuPortal: (b) => ({ ...b, zIndex: 9999 }),
                      control: (b) => ({ ...b, minHeight: 36 }),
                    }}
                  />
                </div>
                <Form.Group
                  className="hotel-search-bar position-relative"
                  style={{ minWidth: 220 }}
                >
                  <Form.Control
                    type="text"
                    placeholder="Search by name, city or country..."
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
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>S/N</th>
                    <th>Provider Name</th>
                    <th>First Name</th>
                    <th>Last Name</th>
                    <th>Country</th>
                    <th>City</th>
                    <th style={{ width: 160 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.providerId || item.id}>
                      <td>{index + 1 + page * 10}</td>
                      <td>{item.providerName}</td>
                      <td>{item.firstName}</td>
                      <td>{item.lastName}</td>
                      <td>{item.countryName || "-"}</td>
                      <td>{item.cityName || "-"}</td>
                      <td>
                        <div className="d-flex gap-2">
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
                          <FaDollarSign
                            className="text-success"
                            style={{ cursor: "pointer", fontSize: "18px" }}
                            onClick={() => handleActivityRates(item)}
                            title="Activity Rates"
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
                  {loading && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        <div
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        >
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        Loading available activity providers...
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        No activity providers found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>

              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center p-3 border-top">
                  <div>
                    <small className="text-muted">
                      Showing {items.length} of {totalPages * 10} activity
                      providers
                    </small>
                  </div>
                  <div>
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={page === 0}
                        onClick={() => {
                          setPage(page - 1);
                          fetchActivityList(page - 1, search);
                        }}
                      />
                      {[...Array(totalPages).keys()].map((num) => (
                        <Pagination.Item
                          key={num}
                          active={num === page}
                          onClick={() => {
                            setPage(num);
                            fetchActivityList(num, search);
                          }}
                        >
                          {num + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={page === totalPages - 1}
                        onClick={() => {
                          setPage(page + 1);
                          fetchActivityList(page + 1, search);
                        }}
                      />
                    </Pagination>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>

          {/* ── Modal ───────────────────────────────────────────────── */}
          <Modal
            show={showModal}
            onHide={closeModal}
            centered
            size="lg"
            backdrop="static"
            keyboard={false}
          >
            <Modal.Header
              closeButton={!isLoading}
              style={
                isViewMode
                  ? { backgroundColor: "#f1f3f5" }
                  : { backgroundColor: "#1e3a8a", color: "white" }
              }
              className={isViewMode ? "border-bottom" : ""}
            >
              <Modal.Title className={isViewMode ? "text-dark" : ""}>
                {isViewMode
                  ? "Activity Provider Details"
                  : editing
                  ? "Update Provider"
                  : "Create Provider"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body className={isViewMode ? "bg-white py-3" : ""}>
              {isViewMode ? (
                (() => {
                  // ── Read-only view layout. Keeps text light — labels
                  //    muted, values in plain body color (no bold, no
                  //    text-dark/text-primary darken). */}
                  const SectionHeader = ({ children }) => (
                    <div
                      className="px-3 py-2 border rounded-top text-dark"
                      style={{
                        backgroundColor: "#f1f3f5",
                        fontWeight: 500,
                      }}
                    >
                      {children}
                    </div>
                  );
                  const SectionBody = ({ children }) => (
                    <div className="border border-top-0 rounded-bottom px-3 py-2 mb-3 bg-white">
                      {children}
                    </div>
                  );
                  const KV = ({ label, value }) => (
                    <Row className="g-0 py-2 border-bottom border-light-subtle">
                      <Col xs={5} md={4} className="text-muted">
                        {label}
                      </Col>
                      <Col xs={7} md={8}>
                        {value || "—"}
                      </Col>
                    </Row>
                  );

                  return (
                    <>
                      <SectionHeader>Provider Information</SectionHeader>
                      <SectionBody>
                        <Row className="g-3">
                          <Col md={6}>
                            <KV
                              label="Provider Name"
                              value={formData.providerName}
                            />
                            <KV
                              label="Provider Code"
                              value={formData.providerCode}
                            />
                            <KV
                              label="First Name"
                              value={formData.firstName}
                            />
                            <KV
                              label="Last Name"
                              value={formData.lastName}
                            />
                          </Col>
                          <Col md={6}>
                            <KV
                              label="Mobile No"
                              value={formData.mobileNo}
                            />
                            <KV label="Email Id" value={formData.emailId} />
                            <KV
                              label="Country"
                              value={formData.countryName}
                            />
                            <KV label="City" value={formData.cityName} />
                          </Col>
                          <Col md={12}>
                            <KV label="Address" value={formData.address} />
                          </Col>
                        </Row>
                      </SectionBody>
                    </>
                  );
                })()
              ) : (
              <>
              <div className="mb-2">
                <small style={{ color: "red" }}>* mandatory fields</small>
              </div>
              <Form>
                <Row>
                  {/* Left column */}
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        <span style={{ color: "red" }}>*</span> Provider Name
                      </Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.providerName}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            providerName: e.target.value,
                          }))
                        }
                        disabled={isViewMode}
                        isInvalid={!!validationErrors.providerName}
                      />
                      {validationErrors.providerName && (
                        <Form.Control.Feedback type="invalid">
                          {validationErrors.providerName}
                        </Form.Control.Feedback>
                      )}
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>First Name</Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.firstName}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            firstName: e.target.value,
                          }))
                        }
                        disabled={isViewMode}
                      />
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Mobile No</Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.mobileNo}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            mobileNo: e.target.value,
                          }))
                        }
                        disabled={isViewMode}
                      />
                    </Form.Group>

                    {/* Country dropdown — drives the city list below */}
                    <Form.Group className="mb-3">
                      <Form.Label>Country</Form.Label>
                      <Select
                        options={countryOptions}
                        value={
                          countryOptions.find(
                            (o) => o.value === formData.countryId
                          ) || null
                        }
                        onChange={async (opt) => {
                          setFormData((prev) => ({
                            ...prev,
                            countryId: opt?.value || null,
                            countryName: opt?.label || "",
                            cityId: null,
                            cityName: "",
                          }));
                          // Refresh dependent city list.
                          const cities = opt
                            ? await loadCitiesForCountry(opt.value)
                            : [];
                          setFormCityOptions(cities);
                        }}
                        isDisabled={isViewMode}
                        isSearchable
                        isClearable
                        placeholder="Select country"
                        menuPortalTarget={document.body}
                        styles={{
                          menuPortal: (b) => ({ ...b, zIndex: 9999 }),
                        }}
                      />
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Address</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={3}
                        value={formData.address}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            address: e.target.value,
                          }))
                        }
                        disabled={isViewMode}
                      />
                    </Form.Group>
                  </Col>

                  {/* Right column */}
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Provider Code</Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.providerCode}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            providerCode: e.target.value,
                          }))
                        }
                        disabled={isViewMode}
                      />
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Last Name</Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.lastName}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            lastName: e.target.value,
                          }))
                        }
                        disabled={isViewMode}
                      />
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Email Id</Form.Label>
                      <Form.Control
                        type="email"
                        value={formData.emailId}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            emailId: e.target.value,
                          }))
                        }
                        disabled={isViewMode}
                      />
                    </Form.Group>

                    {/* City dropdown — depends on selected country */}
                    <Form.Group className="mb-3">
                      <Form.Label>City</Form.Label>
                      <Select
                        options={formCityOptions}
                        value={
                          formCityOptions.find(
                            (o) => o.value === formData.cityId
                          ) || null
                        }
                        onChange={(opt) =>
                          setFormData((prev) => ({
                            ...prev,
                            cityId: opt?.value || null,
                            cityName: opt?.label || "",
                          }))
                        }
                        isDisabled={isViewMode || !formData.countryId}
                        isSearchable
                        isClearable
                        placeholder={
                          formData.countryId
                            ? "Select city"
                            : "Pick country first"
                        }
                        menuPortalTarget={document.body}
                        styles={{
                          menuPortal: (b) => ({ ...b, zIndex: 9999 }),
                        }}
                      />
                    </Form.Group>
                  </Col>
                </Row>

                {error && (
                  <Form.Control.Feedback type="invalid">
                    {error}
                  </Form.Control.Feedback>
                )}
              </Form>
              </>
              )}
            </Modal.Body>
            <Modal.Footer
              style={
                isViewMode ? { backgroundColor: "#f8f9fa" } : undefined
              }
            >
              <Button
                variant="danger"
                onClick={closeModal}
                disabled={isLoading}
                className="d-flex align-items-center gap-2"
              >
                <i className="fas fa-times"></i>
                {isViewMode ? "Close" : "Cancel"}
              </Button>
              {!isViewMode && (
                <>
                  <Button
                    variant="primary"
                    onClick={editing ? updateActivity : saveActivity}
                    disabled={isLoading}
                    className="d-flex align-items-center gap-2"
                  >
                    <i className="fas fa-arrow-right"></i>
                    {isLoading
                      ? editing
                        ? "Updating..."
                        : "Saving..."
                      : editing
                      ? "Update"
                      : "Create"}
                  </Button>
                  <Button
                    variant="info"
                    onClick={() => {
                      setFormData({
                        providerName: "",
                        providerCode: "",
                        firstName: "",
                        lastName: "",
                        mobileNo: "",
                        emailId: "",
                        address: "",
                        countryId: null,
                        countryName: "",
                        cityId: null,
                        cityName: "",
                      });
                      setFormCityOptions([]);
                    }}
                    disabled={isLoading}
                    className="d-flex align-items-center gap-2"
                  >
                    <i className="fas fa-undo"></i>
                    Reset
                  </Button>
                </>
              )}
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
};

export default ActivityProviderReg;
