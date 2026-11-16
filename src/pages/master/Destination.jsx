import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, Button, Table, Modal, Form, Pagination } from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEdit, FaTrash } from "react-icons/fa";
import axios from "axios";
import Select from "react-select";
import BackButton from "../../components/BackButton";

export default function Destination() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState("");
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [countryOptions, setCountryOptions] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedCountryOption, setSelectedCountryOption] = useState(null);
  const [stateOptions, setStateOptions] = useState([]);
  const [selectedState, setSelectedState] = useState("");
  const [selectedStateOption, setSelectedStateOption] = useState(null);
  const [destinationCode, setDestinationCode] = useState("");
  const [isCountryLoading, setIsCountryLoading] = useState(false);
  const [isStateLoading, setIsStateLoading] = useState(false);
  const countryDebounceRef = useRef(null);
  const stateDebounceRef = useRef(null);

  const customSelectStyles = {
    control: (base) => ({
      ...base,
      minHeight: "42px",
      borderRadius: "0.5rem",
      border: "1px solid #dee2e6",
      boxShadow: "none",
      "&:hover": { borderColor: "#86b7fe" },
    }),
    menu: (base) => ({
      ...base,
      zIndex: 9999,
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? "#f8f9fa" : "white",
      color: state.isSelected ? "#0d6efd" : "#212529",
      "&:active": { backgroundColor: "#0d6efd", color: "white" },
    }),
  };

  const nextId = useMemo(
    () => Math.max(0, ...items.map((i) => i.id)) + 1,
    [items]
  );

  const openCreate = () => {
    setEditing(null);
    setSelectedCountry("");
    setSelectedCountryOption(null);
    setSelectedState("");
    setSelectedStateOption(null);
    setStateOptions([]);
    setName("");
    setDestinationCode("");
    fetchCountries("");
    setShowModal(true);
  };

  const openEdit = (item) => {
    console.log("edit itm::", item);
    setEditing(item);
    setSelectedCountry(item.countryId || "");
    setSelectedState(item.stateId || "");
    setName(item.name || "");
    setDestinationCode(item.placeCode || "");
    // Preload country options and set selected country option
    fetchCountries("").then((options) => {
      const matched = (options || []).find(
        (opt) => String(opt.value) === String(item.countryId)
      );
      setSelectedCountryOption(matched || null);
    });
    // Preload provinces for the existing country
    if (item.countryId) {
      fetchStates(item.countryId, "").then((options) => {
        const matched = (options || []).find(
          (opt) => String(opt.value) === String(item.stateId)
        );
        setSelectedStateOption(matched || null);
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setSelectedCountry("");
    setSelectedCountryOption(null);
    setSelectedState("");
    setSelectedStateOption(null);
    setCountryOptions([]);
    setStateOptions([]);
    setName("");
    setDestinationCode("");
    setError("");
  };

  const handleEdit = async () => {
    if (!editing) return;

    try {
      setIsLoading(true);
      const editRes = await axiosInstance.put(
        `/api/destination/${editing.id}`,
        {
          countryId: `${selectedCountry}`,
          stateId: `${selectedState}`,
          name: `${name}`,
          placeCode: `${destinationCode}`,
        }
      );

      if (editRes.data) {
        toast.success("Destination Updated Successfully!");
        // First refresh the list
        await fetchDestinationList(page, search);
        // Then close modal and reset state
        closeModal();
      }
    } catch (error) {
      setError("Failed to update destination");
      toast.error("Failed to update destination");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDestinationList = async (pageNum = 0, searchTerm = search) => {
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
        `/api/destination?${params.toString()}`
      );

      // Check if response has data and pagination info
      if (res.data && Array.isArray(res.data)) {
        setItems(res.data);
        // Since backend doesn't return totalPages, we'll calculate it based on data length
        // If we get less than 10 items, it's likely the last page
        if (res.data.length < 10) {
          setTotalPages(pageNum + 1);
        } else {
          // If we get exactly 10 items, there might be more pages
          // We'll set a reasonable total or keep the current totalPages
          setTotalPages(Math.max(totalPages, pageNum + 2));
        }

        setPage(pageNum);
      } else {
        setItems([]);
        setTotalPages(0);
        setPage(0);
      }
    } catch (err) {
      toast.error("Failed to load destinations");
      setItems([]);
      setTotalPages(0);
      setPage(0);
    } finally {
      setIsLoading(false);
    }
  };

  const saveDestination = async () => {
    try {
      setIsLoading(true);
      const destinationPayload = {
        countryId: `${selectedCountry}`,
        stateId: `${selectedState}`,
        name: `${name}`,
        placeCode: `${destinationCode}`,
      };
      const saveRes = await axiosInstance.post(
        "/api/destination/save",
        destinationPayload
      );
      if (saveRes.data !== 0) {
        toast.success("Destination added Successfully!");
        // First refresh the list
        await fetchDestinationList(page, search);
        // Then close modal
        closeModal();
      }
    } catch (error) {
      setError("Sorry! Data not saved to db..");
      toast.error("Failed to save destination data");
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced search effect
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Set new timeout for search
    if (search !== "") {
      const timeout = setTimeout(() => {
        fetchDestinationList(0, search);
      }, 500); // 500ms delay
      setSearchTimeout(timeout);
    } else if (search === "") {
      // If search is cleared, fetch all data
      fetchDestinationList(0, "");
    }

    // Cleanup timeout on unmount
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [search]);

  const handleDelete = (item) => {
    Swal.fire({
      titleText: `Are you sure? You want to delete ${item.name}`,
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
          .delete(`/api/destination/${item.id}`)
          .then(() => {
            toast.success("Destination deleted successfully");
            fetchDestinationList(page, search);
          })
          .catch(() => {
            toast.error("Sorry!!Destination not deleted");
          });
      }
    });
  };

  // Fetch countries with search-as-you-type; returns options array for use in openEdit
  const fetchCountries = async (searchTerm = "") => {
    setIsCountryLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/country?page=0&limit=20&search=${encodeURIComponent(searchTerm)}`
      );
      if (Array.isArray(res.data)) {
        const options = res.data.map((c) => ({ value: c.id, label: c.name }));
        setCountryOptions(options);
        return options;
      } else {
        setCountryOptions([]);
        return [];
      }
    } catch (error) {
      console.error("Error fetching countries:", error);
      setCountryOptions([]);
      return [];
    } finally {
      setIsCountryLoading(false);
    }
  };

  // Fetch provinces filtered by countryId + search term; returns options array for use in openEdit
  const fetchStates = async (countryId, searchTerm = "") => {
    if (!countryId) {
      setStateOptions([]);
      return [];
    }
    setIsStateLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/province/countryId?countryId=${countryId}&page=0&limit=50&search=${encodeURIComponent(searchTerm)}`
      );
      if (Array.isArray(res.data)) {
        const options = res.data.map((s) => ({ value: s.id, label: s.stateName }));
        setStateOptions(options);
        return options;
      } else {
        setStateOptions([]);
        return [];
      }
    } catch (error) {
      console.error("Error fetching provinces:", error);
      setStateOptions([]);
      return [];
    } finally {
      setIsStateLoading(false);
    }
  };

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
                <span className="fw-semibold">Destination</span>
              </span>
              {/* Destination Name Search */}
              <Form.Group className="hotel-search-bar flex-grow-1 flex-sm-grow-0">
                <Form.Control
                  type="text"
                  placeholder="Search Destination..."
                  className="form-control-modern-sm"
                  value={searchTerm}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearchTerm(value);
                    fetchDestinationList(0, value); // pass value to API
                  }}
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
                    <th style={{ width: 100 }}>S/N</th>
                    <th>Province</th>
                    <th>Destination</th>
                    <th>Destination Code</th>
                    <th style={{ width: 160 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1 + page * 10}</td>
                      <td>{item.state}</td>
                      <td>{item.name}</td>
                      <td>{item.placeCode}</td>
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
                      <td colSpan={3} className="text-center text-muted py-4">
                        <div
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        >
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        Loading available destinations...
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={3} className="text-center text-muted py-4">
                        No destinations found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center p-3 border-top">
                  <div>
                    <small className="text-muted">
                      Showing {items.length} of {totalPages * 10} destinations
                    </small>
                  </div>
                  <div>
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={page === 0}
                        onClick={() => fetchDestinationList(page - 1, search)}
                      />
                      {[...Array(totalPages).keys()].map((num) => (
                        <Pagination.Item
                          key={num}
                          active={num === page}
                          onClick={() => fetchDestinationList(num, search)}
                        >
                          {num + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={page === totalPages - 1}
                        onClick={() => fetchDestinationList(page + 1, search)}
                      />
                    </Pagination>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>

          <Modal show={showModal} onHide={closeModal} centered backdrop="static" keyboard={false}>
            <Modal.Header closeButton={!isLoading}>
              <Modal.Title>
                {editing ? "Update Destination" : "Create Destination"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Country</Form.Label>
                  <Select
                    options={countryOptions}
                    value={selectedCountryOption}
                    onChange={(option) => {
                      setSelectedCountryOption(option);
                      setSelectedCountry(option ? option.value : "");
                      // Clear province when country changes
                      setSelectedState("");
                      setSelectedStateOption(null);
                      setStateOptions([]);
                      // Preload provinces for newly selected country
                      if (option) fetchStates(option.value, "");
                    }}
                    onInputChange={(inputValue) => {
                      clearTimeout(countryDebounceRef.current);
                      countryDebounceRef.current = setTimeout(() => {
                        fetchCountries(inputValue);
                      }, 400);
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
                <Form.Group className="mb-3">
                  <Form.Label>Province</Form.Label>
                  <Select
                    options={stateOptions}
                    value={selectedStateOption}
                    onChange={(option) => {
                      setSelectedStateOption(option);
                      setSelectedState(option ? option.value : "");
                    }}
                    onInputChange={(inputValue) => {
                      if (!selectedCountry) return;
                      clearTimeout(stateDebounceRef.current);
                      stateDebounceRef.current = setTimeout(() => {
                        fetchStates(selectedCountry, inputValue);
                      }, 400);
                    }}
                    filterOption={() => true}
                    placeholder={
                      selectedCountry
                        ? "Search and Select Province"
                        : "Select a country first"
                    }
                    isSearchable
                    isClearable
                    isLoading={isStateLoading}
                    isDisabled={!selectedCountry}
                    styles={customSelectStyles}
                    noOptionsMessage={({ inputValue }) =>
                      inputValue ? "No provinces found" : "Type to search provinces"
                    }
                  />
                  {error && (
                    <div className="text-danger small mt-1">
                      {error}
                    </div>
                  )}
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Destination</Form.Label>
                  <Form.Control
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter Destination"
                    autoFocus
                    isInvalid={!!error}
                  />
                  {error && (
                    <Form.Control.Feedback type="invalid">
                      {error}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Destination Code</Form.Label>
                  <Form.Control
                    value={destinationCode}
                    onChange={(e) => setDestinationCode(e.target.value)}
                    placeholder="Enter Destination code"
                    autoFocus
                    isInvalid={!!error}
                  />
                  {error && (
                    <Form.Control.Feedback type="invalid">
                      {error}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={closeModal}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                className="btn-indigo"
                onClick={editing ? handleEdit : saveDestination}
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
