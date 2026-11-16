import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Col, Form, Modal, Row, Spinner } from "react-bootstrap";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import {
  FaChevronRight,
  FaCity,
  FaGlobeAsia,
  FaMapMarkerAlt,
  FaPlus,
  FaTrash,
} from "react-icons/fa";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import BackButton from "../../components/BackButton";
import "../../styles/LocationHierarchy.css";

// Country / City / Location manager (Manage Masters → Location settings).
//
// City = master_state (/api/province) and Location = master_place
// (/api/destination) — the same masters behind the Country / City / Location
// dropdowns on the registration forms (e.g. AgentReg). Lists are read through
// the same GET endpoints those dropdowns use, so this page shows exactly what
// they show. Adds and deletes go through /api/location-hierarchy. Deletes are
// soft: the row disappears from the dropdowns, while agents / hotels /
// bookings that already store its id keep working. A country or city that
// still has children cannot be deleted (the backend answers 409).

const MAX_VISIBLE_ROWS = 300;
const NAME_MAX = 100;
const COUNTRY_CODE_MAX = 10;
const CODE_MAX = 100;

const LEVELS = {
  country: { label: "Country", deletePath: "/api/location-hierarchy/countries" },
  city: { label: "City", deletePath: "/api/location-hierarchy/cities" },
  location: { label: "Location", deletePath: "/api/location-hierarchy/locations" },
};

const EMPTY_FORM = { name: "", code: "", regionId: "", marketTypeId: "" };

const cleanName = (value) => String(value ?? "").trim().replace(/\s+/g, " ");

const toNodes = (rows, nameKey, codeKey) =>
  (Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.id != null)
    .map((row) => ({
      id: row.id,
      name: cleanName(row[nameKey]),
      code: row[codeKey] ? String(row[codeKey]).trim() : "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

const toNode = (dto) => ({ id: dto?.id, name: cleanName(dto?.name), code: dto?.code || "" });

const filterNodes = (nodes, term) => {
  const needle = term.trim().toLowerCase();
  if (!needle) return nodes;
  return nodes.filter(
    (node) => node.name.toLowerCase().includes(needle) || node.code.toLowerCase().includes(needle)
  );
};

const sameName = (a, b) => cleanName(a).toLowerCase() === cleanName(b).toLowerCase();

const errorMessage = (err, fallback) => {
  const data = err?.response?.data;
  if (typeof data === "string" && data.trim()) return data;
  return data?.message || fallback;
};

function HierarchyPanel({
  icon,
  title,
  subtitle,
  addLabel,
  onAdd,
  addDisabled = false,
  blockedText = "",
  loading,
  nodes,
  search,
  onSearch,
  searchPlaceholder,
  emptyText,
  selectedId,
  onSelect,
  onDelete,
}) {
  const visible = nodes.slice(0, MAX_VISIBLE_ROWS);

  return (
    <Card className="lh-panel shadow-sm h-100">
      <Card.Header className="lh-panel-header">
        <div className="d-flex align-items-center gap-2 lh-panel-title">
          <span className="lh-panel-icon">{icon}</span>
          <div className="lh-panel-title">
            <span className="fw-semibold">{title}</span>
            <span className="lh-panel-subtitle">{subtitle}</span>
          </div>
        </div>
        <Button size="sm" className="btn-green text-nowrap" onClick={onAdd} disabled={addDisabled}>
          <FaPlus className="me-1" /> {addLabel}
        </Button>
      </Card.Header>

      {blockedText ? (
        <div className="lh-empty">{blockedText}</div>
      ) : (
        <>
          <div className="p-2 border-bottom">
            <Form.Control
              size="sm"
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
          </div>

          {loading ? (
            <div className="lh-empty">
              <Spinner animation="border" size="sm" className="me-2" />
              Loading {title.toLowerCase()}...
            </div>
          ) : visible.length === 0 ? (
            <div className="lh-empty">
              {search.trim() ? `No ${title.toLowerCase()} match "${search.trim()}".` : emptyText}
            </div>
          ) : (
            <ul className="lh-list">
              {visible.map((node) => {
                const selected = selectedId != null && node.id === selectedId;
                const content = (
                  <>
                    <span className="lh-row-name" title={node.name}>
                      {node.name}
                    </span>
                    {node.code && <span className="lh-row-code">{node.code}</span>}
                    {onSelect && <FaChevronRight className="lh-row-chevron" />}
                  </>
                );
                return (
                  <li key={node.id} className={`lh-row${selected ? " active" : ""}`}>
                    {onSelect ? (
                      <button
                        type="button"
                        className="lh-row-main"
                        onClick={() => onSelect(node)}
                        aria-pressed={selected}
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="lh-row-main">{content}</div>
                    )}
                    <button
                      type="button"
                      className="lh-row-delete"
                      onClick={() => onDelete(node)}
                      title={`Delete ${node.name}`}
                      aria-label={`Delete ${node.name}`}
                    >
                      <FaTrash />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {!loading && nodes.length > MAX_VISIBLE_ROWS && (
            <div className="lh-list-footer">
              Showing {MAX_VISIBLE_ROWS} of {nodes.length.toLocaleString()}. Type to narrow the list.
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export default function LocationHierarchy() {
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [locations, setLocations] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [citySearch, setCitySearch] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  // Locations have no children, so nothing is "selected" there — the row
  // just added is highlighted instead.
  const [recentLocationId, setRecentLocationId] = useState(null);

  const [regions, setRegions] = useState([]);
  const [marketTypes, setMarketTypes] = useState([]);

  // `level` is kept when the modal closes so its content doesn't blank out
  // during the fade-out animation.
  const [modal, setModal] = useState({ show: false, level: "country" });
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Bumped on every fetch / selection change, so a slow response for a
  // previously selected parent never overwrites the current list.
  const countryReq = useRef(0);
  const cityReq = useRef(0);
  const locationReq = useRef(0);

  const fetchCountries = useCallback(async () => {
    const req = ++countryReq.current;
    setCountriesLoading(true);
    try {
      const res = await axiosInstance.get("/api/country", { params: { page: 0, limit: 1000 } });
      if (req === countryReq.current) setCountries(toNodes(res.data, "name", "countryCode"));
    } catch (err) {
      if (req === countryReq.current) {
        setCountries([]);
        toast.error(errorMessage(err, "Failed to load countries"));
      }
    } finally {
      if (req === countryReq.current) setCountriesLoading(false);
    }
  }, []);

  const fetchCities = useCallback(async (countryId) => {
    const req = ++cityReq.current;
    setCitiesLoading(true);
    try {
      const res = await axiosInstance.get(`/api/province/getByCountryId/${countryId}`);
      if (req === cityReq.current) setCities(toNodes(res.data, "stateName", "stateCode"));
    } catch (err) {
      if (req === cityReq.current) {
        setCities([]);
        toast.error(errorMessage(err, "Failed to load cities"));
      }
    } finally {
      if (req === cityReq.current) setCitiesLoading(false);
    }
  }, []);

  const fetchLocations = useCallback(async (cityId) => {
    const req = ++locationReq.current;
    setLocationsLoading(true);
    try {
      const res = await axiosInstance.get(`/api/destination/getplaces/${cityId}`);
      if (req === locationReq.current) setLocations(toNodes(res.data, "name", "placeCode"));
    } catch (err) {
      if (req === locationReq.current) {
        setLocations([]);
        toast.error(errorMessage(err, "Failed to load locations"));
      }
    } finally {
      if (req === locationReq.current) setLocationsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCountries();
    // Region + market type only feed the "Add Country" form.
    axiosInstance
      .get("/api/region")
      .then((res) => setRegions(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRegions([]));
    axiosInstance
      .get("/api/marketType")
      .then((res) => setMarketTypes(Array.isArray(res.data) ? res.data : []))
      .catch(() => setMarketTypes([]));
  }, [fetchCountries]);

  const resetLocations = () => {
    locationReq.current += 1;
    setLocations([]);
    setLocationsLoading(false);
    setLocationSearch("");
    setRecentLocationId(null);
  };

  const resetCities = () => {
    cityReq.current += 1;
    setCities([]);
    setCitiesLoading(false);
    setCitySearch("");
    setSelectedCity(null);
    resetLocations();
  };

  const selectCountry = (country) => {
    if (selectedCountry?.id === country.id) return;
    resetCities();
    setSelectedCountry(country);
    fetchCities(country.id);
  };

  const selectCity = (city) => {
    if (selectedCity?.id === city.id) return;
    resetLocations();
    setSelectedCity(city);
    fetchLocations(city.id);
  };

  const openAdd = (level) => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setFormError("");
    setModal({ show: true, level });
  };

  const closeModal = () => {
    if (saving) return;
    setModal((prev) => ({ ...prev, show: false }));
  };

  const updateField = (field) => (e) => {
    const { value } = e.target;
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormErrors((prev) => (prev[field] ? { ...prev, [field]: "" } : prev));
    setFormError("");
  };

  const modalLevel = modal.level;
  const modalLabel = LEVELS[modalLevel].label;
  const modalParent =
    modalLevel === "city"
      ? selectedCountry?.name || ""
      : modalLevel === "location" && selectedCity
        ? `${selectedCity.name}, ${selectedCountry?.name || ""}`
        : "";

  const validateForm = () => {
    const errors = {};
    const name = cleanName(form.name);
    const code = form.code.trim();
    const siblings =
      modalLevel === "country" ? countries : modalLevel === "city" ? cities : locations;
    const parentSuffix =
      modalLevel === "city" && selectedCountry
        ? ` in ${selectedCountry.name}`
        : modalLevel === "location" && selectedCity
          ? ` in ${selectedCity.name}`
          : "";

    if (!name) {
      errors.name = `${modalLabel} name is required`;
    } else if (name.length > NAME_MAX) {
      errors.name = `${modalLabel} name must be at most ${NAME_MAX} characters`;
    } else if (siblings.some((node) => sameName(node.name, name))) {
      errors.name = `${modalLabel} "${name}" already exists${parentSuffix}`;
    }

    if (modalLevel === "country") {
      if (!code) {
        errors.code = "Country code is required";
      } else if (code.length > COUNTRY_CODE_MAX) {
        errors.code = `Country code must be at most ${COUNTRY_CODE_MAX} characters`;
      } else if (countries.some((node) => node.code.toLowerCase() === code.toLowerCase())) {
        errors.code = `Country code "${code.toUpperCase()}" is already used by another country`;
      }
      if (!form.regionId) errors.regionId = "Region is required";
      if (!form.marketTypeId) errors.marketTypeId = "Market type is required";
    } else if (code.length > CODE_MAX) {
      errors.code = `Code must be at most ${CODE_MAX} characters`;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving || !validateForm()) return;

    const level = modalLevel;
    const country = selectedCountry;
    const city = selectedCity;
    const payload = { name: cleanName(form.name), code: form.code.trim() || null };

    setSaving(true);
    setFormError("");
    try {
      if (level === "country") {
        const res = await axiosInstance.post("/api/location-hierarchy/countries", {
          ...payload,
          code: payload.code ? payload.code.toUpperCase() : null,
          regionId: Number(form.regionId),
          marketTypeId: Number(form.marketTypeId),
        });
        const created = toNode(res.data);
        toast.success(`Country "${created.name}" added`);
        setModal((prev) => ({ ...prev, show: false }));
        // Narrow the list to the new row — a long list would otherwise hide
        // it past the visible-row cap — and select it so cities can be added
        // straight away.
        setCountrySearch(created.name);
        await fetchCountries();
        selectCountry(created);
      } else if (level === "city" && country) {
        const res = await axiosInstance.post(
          `/api/location-hierarchy/countries/${country.id}/cities`,
          payload
        );
        const created = toNode(res.data);
        toast.success(`City "${created.name}" added to ${country.name}`);
        setModal((prev) => ({ ...prev, show: false }));
        setCitySearch(created.name);
        await fetchCities(country.id);
        selectCity(created);
      } else if (level === "location" && city) {
        const res = await axiosInstance.post(
          `/api/location-hierarchy/cities/${city.id}/locations`,
          payload
        );
        const created = toNode(res.data);
        toast.success(`Location "${created.name}" added to ${city.name}`);
        setModal((prev) => ({ ...prev, show: false }));
        setLocationSearch("");
        await fetchLocations(city.id);
        setRecentLocationId(created.id);
      }
    } catch (err) {
      setFormError(errorMessage(err, `Failed to save ${LEVELS[level].label.toLowerCase()}`));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (level, node) => {
    const { label, deletePath } = LEVELS[level];
    const childNote =
      level === "country"
        ? " A country can only be deleted once it has no cities."
        : level === "city"
          ? " A city can only be deleted once it has no locations."
          : "";

    const result = await Swal.fire({
      titleText: `Delete ${label.toLowerCase()} "${node.name}"?`,
      text: `It will no longer appear in the ${label} dropdowns. Agents, hotels and bookings that already use it are not affected.${childNote}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
      buttonsStyling: false,
      customClass: {
        popup: "swal-small",
        title: "swal-small-title",
        htmlContainer: "swal-small-text",
        confirmButton: "btn btn-danger",
        cancelButton: "btn btn-secondary ms-2",
      },
    });
    if (!result.isConfirmed) return;

    try {
      const res = await axiosInstance.delete(`${deletePath}/${node.id}`);
      toast.success(typeof res.data === "string" && res.data ? res.data : `${label} deleted`);
      if (level === "country") {
        if (selectedCountry?.id === node.id) {
          resetCities();
          setSelectedCountry(null);
        }
        fetchCountries();
      } else if (level === "city") {
        if (selectedCity?.id === node.id) {
          resetLocations();
          setSelectedCity(null);
        }
        if (selectedCountry) fetchCities(selectedCountry.id);
      } else if (selectedCity) {
        if (recentLocationId === node.id) setRecentLocationId(null);
        fetchLocations(selectedCity.id);
      }
    } catch (err) {
      toast.error(errorMessage(err, `Failed to delete ${label.toLowerCase()}`), { duration: 6000 });
    }
  };

  const visibleCountries = useMemo(
    () => filterNodes(countries, countrySearch),
    [countries, countrySearch]
  );
  const visibleCities = useMemo(() => filterNodes(cities, citySearch), [cities, citySearch]);
  const visibleLocations = useMemo(
    () => filterNodes(locations, locationSearch),
    [locations, locationSearch]
  );

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Card className="shadow-sm rounded-xl mb-3">
            <Card.Header className="d-flex flex-column flex-md-row gap-2 justify-content-between align-items-start align-items-md-center">
              <span className="d-flex align-items-center gap-2">
                <BackButton fallback="/adminDashboard" />
                <span className="fw-semibold">Country / City / Location</span>
              </span>
              <div className="lh-breadcrumb" aria-label="Current selection">
                <span className={`lh-crumb${selectedCountry ? "" : " lh-crumb-muted"}`}>
                  {selectedCountry ? selectedCountry.name : "No country selected"}
                </span>
                <FaChevronRight className="lh-crumb-sep" />
                <span className={`lh-crumb${selectedCity ? "" : " lh-crumb-muted"}`}>
                  {selectedCity ? selectedCity.name : "No city selected"}
                </span>
              </div>
            </Card.Header>
            <Card.Body className="py-2">
              <small className="text-muted">
                Select a country to add cities to it, then select a city to add locations to it.
                These are the Country, City and Location options shown on the registration forms.
              </small>
            </Card.Body>
          </Card>

          <Row className="g-3">
            <Col xs={12} lg={4}>
              <HierarchyPanel
                icon={<FaGlobeAsia />}
                title="Countries"
                subtitle={
                  countriesLoading ? "Loading..." : `${countries.length.toLocaleString()} countries`
                }
                addLabel="Add Country"
                onAdd={() => openAdd("country")}
                loading={countriesLoading}
                nodes={visibleCountries}
                search={countrySearch}
                onSearch={setCountrySearch}
                searchPlaceholder="Search countries..."
                emptyText="No countries found."
                selectedId={selectedCountry?.id}
                onSelect={selectCountry}
                onDelete={(node) => handleDelete("country", node)}
              />
            </Col>
            <Col xs={12} lg={4}>
              <HierarchyPanel
                icon={<FaCity />}
                title="Cities"
                subtitle={
                  selectedCountry
                    ? `in ${selectedCountry.name}${citiesLoading ? "" : ` · ${cities.length.toLocaleString()}`}`
                    : "Select a country first"
                }
                addLabel="Add City"
                onAdd={() => openAdd("city")}
                addDisabled={!selectedCountry}
                blockedText={selectedCountry ? "" : "Select a country to see and add its cities."}
                loading={citiesLoading}
                nodes={visibleCities}
                search={citySearch}
                onSearch={setCitySearch}
                searchPlaceholder="Search cities..."
                emptyText={`No cities in ${selectedCountry?.name || "this country"} yet. Use "Add City" to create one.`}
                selectedId={selectedCity?.id}
                onSelect={selectCity}
                onDelete={(node) => handleDelete("city", node)}
              />
            </Col>
            <Col xs={12} lg={4}>
              <HierarchyPanel
                icon={<FaMapMarkerAlt />}
                title="Locations"
                subtitle={
                  selectedCity
                    ? `in ${selectedCity.name}${locationsLoading ? "" : ` · ${locations.length.toLocaleString()}`}`
                    : "Select a city first"
                }
                addLabel="Add Location"
                onAdd={() => openAdd("location")}
                addDisabled={!selectedCity}
                blockedText={selectedCity ? "" : "Select a city to see and add its locations."}
                loading={locationsLoading}
                nodes={visibleLocations}
                search={locationSearch}
                onSearch={setLocationSearch}
                searchPlaceholder="Search locations..."
                emptyText={`No locations in ${selectedCity?.name || "this city"} yet. Use "Add Location" to create one.`}
                selectedId={recentLocationId}
                onDelete={(node) => handleDelete("location", node)}
              />
            </Col>
          </Row>

          <Modal
            show={modal.show}
            onHide={closeModal}
            centered
            backdrop={saving ? "static" : true}
            keyboard={!saving}
          >
            <Form noValidate onSubmit={handleSave}>
              <Modal.Header closeButton={!saving}>
                <Modal.Title>Add {modalLabel}</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                {modalParent && (
                  <div className="lh-modal-parent mb-3">
                    Adding to <strong>{modalParent}</strong>
                  </div>
                )}
                {formError && (
                  <Alert variant="danger" className="py-2">
                    {formError}
                  </Alert>
                )}

                {modalLevel === "country" && (
                  <Row className="g-3 mb-3">
                    <Col sm={6}>
                      <Form.Group controlId="lh-region">
                        <Form.Label>
                          Region <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Select
                          value={form.regionId}
                          onChange={updateField("regionId")}
                          isInvalid={!!formErrors.regionId}
                        >
                          <option value="">Select region</option>
                          {regions.map((region) => (
                            <option key={region.id} value={region.id}>
                              {region.name}
                            </option>
                          ))}
                        </Form.Select>
                        <Form.Control.Feedback type="invalid">
                          {formErrors.regionId}
                        </Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col sm={6}>
                      <Form.Group controlId="lh-market-type">
                        <Form.Label>
                          Market Type <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Select
                          value={form.marketTypeId}
                          onChange={updateField("marketTypeId")}
                          isInvalid={!!formErrors.marketTypeId}
                        >
                          <option value="">Select market type</option>
                          {marketTypes.map((market) => (
                            <option key={market.marketTypeId} value={market.marketTypeId}>
                              {market.name}
                            </option>
                          ))}
                        </Form.Select>
                        <Form.Control.Feedback type="invalid">
                          {formErrors.marketTypeId}
                        </Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                  </Row>
                )}

                <Form.Group className="mb-3" controlId="lh-name">
                  <Form.Label>
                    {modalLabel} Name <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    value={form.name}
                    onChange={updateField("name")}
                    placeholder={`Enter ${modalLabel.toLowerCase()} name`}
                    maxLength={NAME_MAX}
                    autoFocus
                    isInvalid={!!formErrors.name}
                  />
                  <Form.Control.Feedback type="invalid">{formErrors.name}</Form.Control.Feedback>
                </Form.Group>

                <Form.Group controlId="lh-code">
                  <Form.Label>
                    {modalLabel} Code{" "}
                    {modalLevel === "country" ? (
                      <span className="text-danger">*</span>
                    ) : (
                      <span className="text-muted small">(optional)</span>
                    )}
                  </Form.Label>
                  <Form.Control
                    value={form.code}
                    onChange={updateField("code")}
                    placeholder={modalLevel === "country" ? "e.g. AE" : "Enter code"}
                    maxLength={modalLevel === "country" ? COUNTRY_CODE_MAX : CODE_MAX}
                    isInvalid={!!formErrors.code}
                  />
                  <Form.Control.Feedback type="invalid">{formErrors.code}</Form.Control.Feedback>
                </Form.Group>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onClick={closeModal} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" className="btn-indigo" disabled={saving}>
                  {saving ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </Modal.Footer>
            </Form>
          </Modal>
        </main>
      </div>
    </div>
  );
}
