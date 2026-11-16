import React, { useEffect, useRef, useState } from "react";
import { Card, Button, Table, Modal, Form, Pagination } from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEdit, FaTrash } from "react-icons/fa";
import Select from "react-select";
import BackButton from "../../components/BackButton";

export default function SubLocation() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

  // Country & State dropdowns
  const [countryOptions, setCountryOptions] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedCountryOption, setSelectedCountryOption] = useState(null);
  const [stateOptions, setStateOptions] = useState([]);
  const [selectedState, setSelectedState] = useState("");
  const [selectedStateOption, setSelectedStateOption] = useState(null);

  // Destination (place) dropdown for SubLocation
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [selectedDestination, setSelectedDestination] = useState("");
  const [selectedDestinationOption, setSelectedDestinationOption] = useState(null);

  const [subLocationCode, setSubLocationCode] = useState("");
  const [isCountryLoading, setIsCountryLoading] = useState(false);
  const [isStateLoading, setIsStateLoading] = useState(false);
  const [isDestinationLoading, setIsDestinationLoading] = useState(false);

  const countryDebounceRef = useRef(null);
  const stateDebounceRef = useRef(null);
  const destinationDebounceRef = useRef(null);
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

  // ─── API Calls ────────────────────────────────────────────────────────────────

  const fetchSubLocationList = async (pageNum = 0, search = "") => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: PAGE_SIZE.toString(),
      });
      if (search && search.trim()) {
        params.append("search", search.trim());
      }
      const res = await axiosInstance.get(`/api/sub-locations?${params.toString()}`);
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
    } catch (err) {
      toast.error("Failed to load sub-locations");
      setItems([]);
      setTotalPages(0);
      setPage(0);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSubLocation = async () => {
    if (!selectedCountry) { setError("Please select a Country"); return; }
    if (!selectedState)   { setError("Please select a Province"); return; }
    if (!selectedDestination) { setError("Please select a Destination"); return; }
    if (!name.trim())     { setError("Sub-location name is required"); return; }

    try {
      setIsLoading(true);
      const payload = {
        countryId:     `${selectedCountry}`,
        stateId:       `${selectedState}`,
        placeId: `${selectedDestination}`,
        locationName:          name.trim(),
        locationCode:     subLocationCode.trim(),
      };
      const res = await axiosInstance.post("/api/sub-locations/save", payload);
      if (res.data) {
        toast.success("Sub-location added successfully!");
        await fetchSubLocationList(page, searchTerm);
        closeModal();
      }
    } catch (err) {
      setError("Failed to save sub-location");
      toast.error("Failed to save sub-location");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editing) return;
    if (!selectedCountry) { setError("Please select a Country"); return; }
    if (!selectedState)   { setError("Please select a Province"); return; }
    if (!selectedDestination) { setError("Please select a Destination"); return; }
    if (!name.trim())     { setError("Sub-location name is required"); return; }

    try {
      setIsLoading(true);
      const payload = {
        countryId:     `${selectedCountry}`,
        stateId:       `${selectedState}`,
        placeId: `${selectedDestination}`,
        locationName:          name.trim(),
        locationCode:     subLocationCode.trim(),
      };
      const res = await axiosInstance.put(`/api/sub-locations/${editing.id}`, payload);
      if (res.data) {
        toast.success("Sub-location updated successfully!");
        await fetchSubLocationList(page, searchTerm);
        closeModal();
      }
    } catch (err) {
      setError("Failed to update sub-location");
      toast.error("Failed to update sub-location");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = (item) => {
    Swal.fire({
      titleText: `Are you sure you want to delete "${item.name}"?`,
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
          .delete(`/api/sub-locations/${item.id}`)
          .then(() => {
            toast.success("Sub-location deleted successfully");
            fetchSubLocationList(page, searchTerm);
          })
          .catch(() => {
            toast.error("Failed to delete sub-location");
          });
      }
    });
  };

  // ─── Dropdown Fetchers ────────────────────────────────────────────────────────

  const fetchCountries = async (search = "") => {
    setIsCountryLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/country?page=0&limit=20&search=${encodeURIComponent(search)}`
      );
      if (Array.isArray(res.data)) {
        const options = res.data.map((c) => ({ value: c.id, label: c.name }));
        setCountryOptions(options);
        return options;
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

  const fetchStates = async (countryId, search = "") => {
    if (!countryId) { setStateOptions([]); return []; }
    setIsStateLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/province/countryId?countryId=${countryId}&page=0&limit=50&search=${encodeURIComponent(search)}`
      );
      if (Array.isArray(res.data)) {
        const options = res.data.map((s) => ({ value: s.id, label: s.stateName }));
        setStateOptions(options);
        return options;
      }
      setStateOptions([]);
      return [];
    } catch {
      setStateOptions([]);
      return [];
    } finally {
      setIsStateLoading(false);
    }
  };

  const fetchDestinations = async (stateId, search = "") => {
    if (!stateId) { setDestinationOptions([]); return []; }
    setIsDestinationLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/destination?page=0&limit=50&search=${encodeURIComponent(search)}`
      );
      if (Array.isArray(res.data)) {
        const options = res.data.map((d) => ({ value: d.id, label: d.name }));
        setDestinationOptions(options);
        return options;
      }
      setDestinationOptions([]);
      return [];
    } catch {
      setDestinationOptions([]);
      return [];
    } finally {
      setIsDestinationLoading(false);
    }
  };

  // ─── Modal Open/Close ─────────────────────────────────────────────────────────

  const resetForm = () => {
    setEditing(null);
    setSelectedCountry("");
    setSelectedCountryOption(null);
    setSelectedState("");
    setSelectedStateOption(null);
    setSelectedDestination("");
    setSelectedDestinationOption(null);
    setCountryOptions([]);
    setStateOptions([]);
    setDestinationOptions([]);
    setName("");
    setSubLocationCode("");
    setError("");
  };

  const openCreate = () => {
    resetForm();
    fetchCountries("");
    setShowModal(true);
  };

  const openEdit = (item) => {
    resetForm();
    setEditing(item);
    setName(item.locationName || "");
    setSubLocationCode(item.locationCode || "");
    setSelectedCountry(item.countryId || "");
    setSelectedState(item.stateId || "");
    setSelectedDestination(item.placeId || "");

    // Pre-load country options and match selected
    fetchCountries("").then((opts) => {
      const matched = (opts || []).find((o) => String(o.value) === String(item.countryId));
      setSelectedCountryOption(matched || null);
    });

    // Pre-load state options and match selected
    if (item.countryId) {
      fetchStates(item.countryId, "").then((opts) => {
        const matched = (opts || []).find((o) => String(o.value) === String(item.stateId));
        setSelectedStateOption(matched || null);
      });
    }

    // Pre-load destination options and match selected
    if (item.stateId) {
      fetchDestinations(item.stateId, "").then((opts) => {
        const matched = (opts || []).find((o) => String(o.value) === String(item.placeId));
        setSelectedDestinationOption(matched || null);
      });
    }

    setShowModal(true);
  };

  const closeModal = () => {
    resetForm();
    setShowModal(false);
  };

  // ─── Debounced Search ─────────────────────────────────────────────────────────

  useEffect(() => {
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      fetchSubLocationList(0, searchTerm);
    }, 500);
    return () => clearTimeout(searchDebounceRef.current);
  }, [searchTerm]);

  // ─── Render ───────────────────────────────────────────────────────────────────

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
                <span className="fw-semibold">Sub-Location / Locality</span>
              </span>
              <Form.Group className="hotel-search-bar flex-grow-1 flex-sm-grow-0">
                <Form.Control
                  type="text"
                  placeholder="Search Sub-Location..."
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
                    <th>Country</th>
                    <th>Province</th>
                    <th>Destination</th>
                    <th>Sub-Location</th>
                    <th>Code</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1 + page * PAGE_SIZE}</td>
                      <td>{item.country  || "—"}</td>
                      <td>{item.state || "—"}</td>
                      <td>{item.place  || "—"}</td>
                      <td>{item.locationName}</td>
                      <td>{item.locationCode || "—"}</td>
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
                      <td colSpan={7} className="text-center text-muted py-4">
                        <div className="spinner-border spinner-border-sm me-2" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        Loading sub-locations...
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        No sub-locations found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center p-3 border-top">
                  <small className="text-muted">
                    Showing {items.length} of {totalPages * PAGE_SIZE} sub-locations
                  </small>
                  <Pagination className="mb-0">
                    <Pagination.Prev
                      disabled={page === 0}
                      onClick={() => fetchSubLocationList(page - 1, searchTerm)}
                    />
                    {[...Array(totalPages).keys()].map((num) => (
                      <Pagination.Item
                        key={num}
                        active={num === page}
                        onClick={() => fetchSubLocationList(num, searchTerm)}
                      >
                        {num + 1}
                      </Pagination.Item>
                    ))}
                    <Pagination.Next
                      disabled={page === totalPages - 1}
                      onClick={() => fetchSubLocationList(page + 1, searchTerm)}
                    />
                  </Pagination>
                </div>
              )}
            </Card.Body>
          </Card>

          {/* Create / Edit Modal */}
          <Modal show={showModal} onHide={closeModal} centered backdrop="static" keyboard={false}>
            <Modal.Header closeButton={!isLoading}>
              <Modal.Title>
                {editing ? "Update Sub-Location" : "Create Sub-Location"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                {/* Country */}
                <Form.Group className="mb-3">
                  <Form.Label>Country <span className="text-danger">*</span></Form.Label>
                  <Select
                    options={countryOptions}
                    value={selectedCountryOption}
                    onChange={(option) => {
                      setSelectedCountryOption(option);
                      setSelectedCountry(option ? option.value : "");
                      // Reset cascades
                      setSelectedState("");
                      setSelectedStateOption(null);
                      setSelectedDestination("");
                      setSelectedDestinationOption(null);
                      setStateOptions([]);
                      setDestinationOptions([]);
                      if (option) fetchStates(option.value, "");
                      setError("");
                    }}
                    onInputChange={(inputValue) => {
                      clearTimeout(countryDebounceRef.current);
                      countryDebounceRef.current = setTimeout(() => fetchCountries(inputValue), 400);
                    }}
                    filterOption={() => true}
                    placeholder="Search and Select Country"
                    isSearchable
                    isClearable
                    isLoading={isCountryLoading}
                    styles={customSelectStyles}
                    noOptionsMessage={({ inputValue }) =>
                      inputValue ? "No countries found" : "Type to search countries"
                    }
                  />
                </Form.Group>

                {/* Province / State */}
                <Form.Group className="mb-3">
                  <Form.Label>Province <span className="text-danger">*</span></Form.Label>
                  <Select
                    options={stateOptions}
                    value={selectedStateOption}
                    onChange={(option) => {
                      setSelectedStateOption(option);
                      setSelectedState(option ? option.value : "");
                      // Reset destination cascade
                      setSelectedDestination("");
                      setSelectedDestinationOption(null);
                      setDestinationOptions([]);
                      if (option) fetchDestinations(option.value, "");
                      setError("");
                    }}
                    onInputChange={(inputValue) => {
                      if (!selectedCountry) return;
                      clearTimeout(stateDebounceRef.current);
                      stateDebounceRef.current = setTimeout(
                        () => fetchStates(selectedCountry, inputValue),
                        400
                      );
                    }}
                    filterOption={() => true}
                    placeholder={selectedCountry ? "Search and Select Province" : "Select a country first"}
                    isSearchable
                    isClearable
                    isLoading={isStateLoading}
                    isDisabled={!selectedCountry}
                    styles={customSelectStyles}
                    noOptionsMessage={({ inputValue }) =>
                      inputValue ? "No provinces found" : "Type to search provinces"
                    }
                  />
                </Form.Group>

                {/* Destination */}
                <Form.Group className="mb-3">
                  <Form.Label>Destination <span className="text-danger">*</span></Form.Label>
                  <Select
                    options={destinationOptions}
                    value={selectedDestinationOption}
                    onChange={(option) => {
                      setSelectedDestinationOption(option);
                      setSelectedDestination(option ? option.value : "");
                      setError("");
                    }}
                    onInputChange={(inputValue) => {
                      if (!selectedState) return;
                      clearTimeout(destinationDebounceRef.current);
                      destinationDebounceRef.current = setTimeout(
                        () => fetchDestinations(selectedState, inputValue),
                        400
                      );
                    }}
                    filterOption={() => true}
                    placeholder={selectedState ? "Search and Select Destination" : "Select a province first"}
                    isSearchable
                    isClearable
                    isLoading={isDestinationLoading}
                    isDisabled={!selectedState}
                    styles={customSelectStyles}
                    noOptionsMessage={({ inputValue }) =>
                      inputValue ? "No destinations found" : "Type to search destinations"
                    }
                  />
                </Form.Group>

                {/* Sub-Location Name */}
                <Form.Group className="mb-3">
                  <Form.Label>Sub-Location Name <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError(""); }}
                    placeholder="Enter sub-location name"
                    isInvalid={!!error && !name.trim()}
                  />
                </Form.Group>

                {/* Sub-Location Code */}
                <Form.Group className="mb-3">
                  <Form.Label>Sub-Location Code</Form.Label>
                  <Form.Control
                    value={subLocationCode}
                    onChange={(e) => setSubLocationCode(e.target.value)}
                    placeholder="Enter sub-location code (optional)"
                  />
                </Form.Group>

                {error && (
                  <div className="alert alert-danger py-2 small">{error}</div>
                )}
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={closeModal} disabled={isLoading}>
                Cancel
              </Button>
              <Button
                className="btn-indigo"
                onClick={editing ? handleEdit : saveSubLocation}
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
