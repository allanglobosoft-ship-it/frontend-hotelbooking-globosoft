import React, { useEffect, useState, useRef } from "react";
import {
  Card,
  Button,
  Table,
  Modal,
  Form,
  Pagination,
} from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import axios from "axios";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEdit, FaTrash, FaPlus, FaEye } from "react-icons/fa";
import BackButton from "../../components/BackButton";

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
  onInputChange,
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
        const optionName = option.name || String(option);
        return optionName.toLowerCase().includes(searchTerm.toLowerCase());
      });
      setFilteredOptions(filtered);
    } else {
      setFilteredOptions(options);
    }
  }, [searchTerm, options]);

  const handleSelect = (option) => {
    try {
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
            : selectedOption?.name || ""
        }
        onChange={(e) => {
          if (disabled) return;
          if (!isOpen) setIsOpen(true);
          setSearchTerm(e.target.value);
          if (onInputChange) onInputChange(e.target.value);
        }}
        onFocus={() => {
          if (!disabled) {
            setIsOpen(true);
          }
        }}
        placeholder={isLoading ? "Loading..." : placeholder}
        className={`${className} ${isInvalid ? "is-invalid" : ""}`}
        disabled={disabled || isLoading}
        autoComplete="off"
      />
      {isOpen && (
        <div
          className="position-absolute w-100 bg-white border border-top-0 rounded-bottom shadow-sm"
          style={{ zIndex: 1000, maxHeight: "200px", overflowY: "auto" }}
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => (
              <div
                key={index}
                className="px-3 py-2 cursor-pointer hover-bg-light"
                onClick={() => handleSelect(option)}
                style={{ cursor: "pointer" }}
              >
                {option.name || String(option)}
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-muted">No options found</div>
          )}
        </div>
      )}
      {isOpen && (
        <div
          className="position-fixed w-100 h-100"
          style={{ top: 0, left: 0, zIndex: 999 }}
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default function DayActivities() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isViewMode, setIsViewMode] = useState(false);
  const [countries, setCountries] = useState([]);
  const [places, setPlaces] = useState([]);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState("");
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [searchTerm, setSearchTerm] = useState(null);

  const [formData, setFormData] = useState({
    countryId: "",
    stateId: "",
    activityName: "",
    activityCode: "",
    description: "",
  });

  // Validation functions
  const validateForm = () => {
    const newErrors = {};

    if (!formData.countryId) {
      newErrors.countryId = "Country is required";
    }

    if (!formData.stateId) {
      newErrors.stateId = "Place is required";
    }

    if (!formData.activityName || formData.activityName.trim() === "") {
      newErrors.activityName = "Activity Name is required";
    } else if (formData.activityName.trim().length < 2) {
      newErrors.activityName = "Activity Name must be at least 2 characters long";
    } else if (formData.activityName.trim().length > 100) {
      newErrors.activityName = "Activity Name must not exceed 100 characters";
    }

    if (!formData.activityCode || formData.activityCode.trim() === "") {
      newErrors.activityCode = "Activity Code is required";
    } else if (formData.activityCode.trim().length < 2) {
      newErrors.activityCode = "Activity Code must be at least 2 characters long";
    } else if (formData.activityCode.trim().length > 20) {
      newErrors.activityCode = "Activity Code must not exceed 20 characters";
    }

    if (!formData.description || formData.description.trim() === "") {
      newErrors.description = "Description is required";
    } else if (formData.description.trim().length < 10) {
      newErrors.description = "Description must be at least 10 characters long";
    } else if (formData.description.trim().length > 500) {
      newErrors.description = "Description must not exceed 500 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const clearError = (fieldName) => {
    if (errors[fieldName]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
    }
  };

  const openCreate = () => {
    setEditing(null);
    setIsViewMode(false);
    setFormData({
      countryId: "",
      stateId: "",
      activityName: "",
      activityCode: "",
      description: "",
    });
    setError("");
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setIsViewMode(false);
    setFormData({
      countryId: item.countryId || "",
      stateId: item.stateId || "",
      activityName: item.activityName || "",
      activityCode: item.activityCode || "",
      description: item.description || "",
    });
    setError("");
    setErrors({});
    setShowModal(true);
  };

  const openView = (item) => {
    setEditing(item);
    setIsViewMode(true);
    setFormData({
      countryId: item.countryId || "",
      stateId: item.stateId || "",
      activityName: item.activityName || "",
      activityCode: item.activityCode || "",
      description: item.description || "",
    });
    setError("");
    setErrors({});
    setShowModal(true);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    clearError(name);
  };

  const handleCountryChange = (e) => {
    try {
      const value = e.target.value;
      const stringValue = String(value); // Convert to string to avoid trim error
      const selectedCountry = countries.find(country => String(country.id) === String(value));
      const countryName = selectedCountry?.name || selectedCountry?.countryName || "Unknown";
      
      console.log(
        "Country selected:",
        value,
        "Country name:",
        countryName
      );
      
      // Clear places and place selection when country changes
      setPlaces([]);
      setIsLoadingPlaces(false);
      
      setFormData((prev) => ({
        ...prev,
        countryId: stringValue,
        stateId: "", // Clear state selection
      }));
      
      // Fetch cities for the selected country
      if (value && stringValue.trim() !== "") {
        cityList(value);
      }
      
      // Clear validation errors
      if (errors.countryId) {
        clearError('countryId');
      }
      if (errors.stateId) {
        clearError('stateId');
      }
    } catch (error) {
      console.error("Error in handleCountryChange:", error);
    }
  };

  const handleStateChange = (e) => {
    try {
      const value = e.target.value;
      const stringValue = String(value); // Convert to string for consistency
      console.log("State selected:", value);
      
      setFormData(prev => ({
        ...prev,
        stateId: stringValue
      }));
      
      // Clear validation errors
      if (errors.stateId) {
        clearError('stateId');
      }
    } catch (error) {
      console.error("Error in handleStateChange:", error);
    }
  };

  const handleEdit = async () => {
    if (!editing) return;

    if (!validateForm()) {
      toast.error("Please fix the validation errors");
      return;
    }

    try {
      setIsLoading(true);
      const editRes = await axiosInstance.put(
        `/api/dayActivities/${editing.dayActivityId}`,
        formData
      );

      if (editRes.data) {
        toast.success("Day Activity Updated Successfully!");
        await fetchDayActivityList(page, search);
        closeModal();
      }
    } catch (error) {
      setError("Failed to update day activity");
      toast.error("Failed to update day activity");
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setIsViewMode(false);
    setFormData({
      countryId: "",
      stateId: "",
      activityName: "",
      activityCode: "",
      description: "",
    });
    setError("");
    setErrors({});
  };

  const fetchDayActivityList = async (pageNum = 0, searchTerm = search) => {
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
        `/api/dayActivities?${params.toString()}`
      );
     
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
      toast.error("Failed to load day activities");
      setItems([]);
      setTotalPages(0);
      setPage(0);
    } finally {
      setIsLoading(false);
    }
  };

  const saveDayActivity = async () => {
    if (!validateForm()) {
      toast.error("Please fix the validation errors");
      return;
    }

    try {
      setIsLoading(true);
      const dayActivitySaveRes = await axiosInstance.post(
        "/api/dayActivities/save",
        formData
      );
      if (dayActivitySaveRes.data !== 0) {
        toast.success("Day Activity added Successfully!");
        await fetchDayActivityList(page, search);
        closeModal();
      }
    } catch (error) {
      setError("Sorry! Data not saved to db..");
      toast.error("Failed to save day activity data");
    } finally {
      setIsLoading(false);
    }
  };

  const countryList = async (search = "") => {
    try {
      const response = await axiosInstance.get(`/api/country?page=0&limit=10000&search=${search}`);
      setCountries(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log("axios call error for country list : ", error);
      setCountries([]);
    }
  };

  // Debounced server-side country search
  const countrySearchTimeout = useRef(null);
  const debouncedCountryList = (term) => {
    if (countrySearchTimeout.current) clearTimeout(countrySearchTimeout.current);
    countrySearchTimeout.current = setTimeout(() => countryList(term), 500);
  };

  const cityList = async (countryId) => {
    try {
      setIsLoadingPlaces(true);
      const response = await axiosInstance.post(`/api/destination/getCitiesByCountryId/${countryId}`);
      setPlaces(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log("axios call error for city list : ", error);
      setPlaces([]);
    } finally {
      setIsLoadingPlaces(false);
    }
  };

  useEffect(() => {
    fetchDayActivityList();
    countryList();
  }, []);

  // Debounced search effect
  useEffect(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    if (search !== "") {
      const timeout = setTimeout(() => {
        fetchDayActivityList(0, search);
      }, 500);
      setSearchTimeout(timeout);
    } else if (search === "") {
      fetchDayActivityList(0, "");
    }

    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [search]);

  const handleDelete = (item) => {
    Swal.fire({
      titleText: `Are you sure? You want to delete ${item.activityName} Day Activity`,
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
          .delete(`/api/dayActivities/${item.dayActivityId}`)
          .then(() => {
            toast.success("Day Activity deleted successfully");
            fetchDayActivityList(page, search);
          })
          .catch(() => {
            toast.error("Sorry!! Day Activity not deleted");
          });
      }
    });
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span className="d-flex align-items-center gap-2">
                <BackButton fallback="/adminDashboard" />
                <span className="fw-semibold">Day Activities</span>
              </span>
              <div className="d-flex align-items-center gap-3">
                {/* <Form.Select className="form-select-sm" style={{ width: "auto" }}>
                  <option>Display 10 records</option>
                </Form.Select> */}
                <Form.Control
                  type="text"
                  placeholder="Search:"
                  className="form-control-sm"
                  style={{ width: "200px" }}
                  value={searchTerm}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearchTerm(value);
                    fetchDayActivityList(0, value);
                  }}
                />
                <Button className="btn-green" onClick={openCreate}>
                  <FaPlus className="me-1" />
                  Create
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>S.N</th>
                    <th>Day Activity name</th>
                    <th>Place</th>
                    <th style={{ width: 160 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.dayActivityId}>
                      <td>{index + 1 + page * 10}</td>
                      <td>{item.activityName}</td>
                      <td>
                        {places.find(p => String(p.id) === String(item.stateId))?.name || item.stateId}
                      </td>
                      <td>
                        <div className="d-flex gap-2">
                          <FaEye
                            className="text-info"
                            style={{ cursor: "pointer", fontSize: "18px" }}
                            onClick={() => openView(item)}
                            title="View"
                          />
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
                      <td colSpan={4} className="text-center text-muted py-4">
                        <div
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        >
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        Loading available day activities...
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={4} className="text-center text-muted py-4">
                        No day activities found.
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
                      Showing {items.length} of {totalPages * 10} day activities
                    </small>
                  </div>
                  <div>
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={page === 0}
                        onClick={() => fetchDayActivityList(page - 1, search)}
                      />
                      {[...Array(totalPages).keys()].map((num) => (
                        <Pagination.Item
                          key={num}
                          active={num === page}
                          onClick={() => fetchDayActivityList(num, search)}
                        >
                          {num + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={page === totalPages - 1}
                        onClick={() => fetchDayActivityList(page + 1, search)}
                      />
                    </Pagination>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>

          {/* Save Day Activity Modal */}
          <Modal show={showModal} onHide={() => {}} centered backdrop="static" keyboard={false} size="lg">
            <Modal.Header 
              closeButton={!isLoading} 
              onHide={closeModal}
              className="bg-primary text-white"
            >
              <Modal.Title>
                {isViewMode ? "View Day Activity" : editing ? "Update Day Activity" : "Save Day Activity"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body className="p-4">
              <Form>
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <Form.Label>Country <span className="text-danger">*</span></Form.Label>
                    <SearchableSelect
                      name="countryId"
                      value={formData.countryId}
                      onChange={handleCountryChange}
                      onInputChange={debouncedCountryList}
                      placeholder="SELECT"
                      options={Array.isArray(countries) ? countries.map(country => ({ id: country.id, name: country.name })) : []}
                      isInvalid={!!errors.countryId}
                      disabled={isViewMode}
                    />
                    {errors.countryId && (
                      <div className="text-danger small mt-1">
                        {errors.countryId}
                      </div>
                    )}
                  </div>

                  <div className="col-md-6 mb-3">
                    <Form.Label>Place <span className="text-danger">*</span></Form.Label>
                    <SearchableSelect
                      name="stateId"
                      value={formData.stateId}
                      onChange={handleStateChange}
                      placeholder={isLoadingPlaces ? "Loading places..." : "SELECT"}
                      options={Array.isArray(places) ? places.map(place => ({ id: place.id, name: place.name })) : []}
                      isInvalid={!!errors.stateId}
                      disabled={isViewMode || !formData.countryId || isLoadingPlaces}
                      isLoading={isLoadingPlaces}
                    />
                    {errors.stateId && (
                      <div className="text-danger small mt-1">
                        {errors.stateId}
                      </div>
                    )}
                  </div>

                  <div className="col-md-6 mb-3">
                    <Form.Label>Activity Name <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      name="activityName"
                      value={formData.activityName}
                      onChange={handleInputChange}
                      placeholder="Enter activity name"
                      isInvalid={!!errors.activityName}
                      maxLength={100}
                      disabled={isViewMode}
                    />
                    {errors.activityName && (
                      <Form.Control.Feedback type="invalid">
                        {errors.activityName}
                      </Form.Control.Feedback>
                    )}
                  </div>

                  <div className="col-md-6 mb-3">
                    <Form.Label>Activity Code <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      name="activityCode"
                      value={formData.activityCode}
                      onChange={handleInputChange}
                      placeholder="Enter activity code"
                      isInvalid={!!errors.activityCode}
                      maxLength={20}
                      disabled={isViewMode}
                    />
                    {errors.activityCode && (
                      <Form.Control.Feedback type="invalid">
                        {errors.activityCode}
                      </Form.Control.Feedback>
                    )}
                  </div>

                  <div className="col-12 mb-3">
                    <Form.Label>Description <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      as="textarea"
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="Enter activity description"
                      rows={4}
                      isInvalid={!!errors.description}
                      maxLength={500}
                      style={{ resize: "vertical" }}
                      disabled={isViewMode}
                    />
                    {errors.description && (
                      <Form.Control.Feedback type="invalid">
                        {errors.description}
                      </Form.Control.Feedback>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="alert alert-danger" role="alert">
                    {error}
                  </div>
                )}
              </Form>
            </Modal.Body>
            <Modal.Footer className="d-flex justify-content-between">
              <Button
                variant="danger"
                onClick={closeModal}
                disabled={isLoading}
                className="d-flex align-items-center"
              >
                <i className="fas fa-times me-1"></i>
                {isViewMode ? "Close" : "Cancel"}
              </Button>
              {!isViewMode && (
                <div className="d-flex gap-2">
                  <Button
                    variant="success"
                    onClick={editing ? handleEdit : saveDayActivity}
                    disabled={isLoading}
                    className="d-flex align-items-center"
                  >
                    {isLoading ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                          aria-hidden="true"
                        ></span>
                        {editing ? "Updating..." : "Creating..."}
                      </>
                    ) : (
                      <>
                        <i className="fas fa-arrow-right me-1"></i>
                        {editing ? "Update" : "Create"}
                      </>
                    )}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setFormData({
                        countryId: "",
                        stateId: "",
                        activityName: "",
                        activityCode: "",
                        description: "",
                      });
                      setErrors({});
                    }}
                    disabled={isLoading}
                    className="d-flex align-items-center"
                  >
                    <i className="fas fa-redo me-1"></i>
                    Reset
                  </Button>
                </div>
              )}
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
}