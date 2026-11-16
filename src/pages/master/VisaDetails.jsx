import React, { useEffect, useMemo, useState } from "react";
import { Card, Button, Table, Modal, Form, Pagination, Row, Col } from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import axios from "axios";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEdit, FaTrash, FaTimes, FaCheck, FaUndo, FaEye } from "react-icons/fa";
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
             selectedOption?.countryName ||
             ""
        }
        onChange={(e) => {
          if (disabled) return;
          if (isOpen) {
            setSearchTerm(e.target.value);
          } else {
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

export default function VisaDetails() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isViewMode, setIsViewMode] = useState(false);
  const [countries, setCountries] = useState([]);
  const [formData, setFormData] = useState({
    passportCountry: "",
    country: "",
    passportCode: "",
    description: ""
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState("");
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [searchTerm, setSearchTerm] = useState(null);

  // Validation functions
  const validateForm = () => {
    const newErrors = {};

    // Passport Country validation
    const passportCountryStr = String(formData.passportCountry || "");
    if (!formData.passportCountry || passportCountryStr.trim() === "") {
      newErrors.passportCountry = "Passport Country is required";
    }

    // Country validation
    const countryStr = String(formData.country || "");
    if (!formData.country || countryStr.trim() === "") {
      newErrors.country = "Country is required";
    }

    // Passport Code validation
    const passportCodeStr = String(formData.passportCode || "");
    if (!formData.passportCode || passportCodeStr.trim() === "") {
      newErrors.passportCode = "Passport Code is required";
    } else if (passportCodeStr.trim().length < 2) {
      newErrors.passportCode = "Passport Code must be at least 2 characters long";
    } else if (passportCodeStr.trim().length > 20) {
      newErrors.passportCode = "Passport Code must not exceed 20 characters";
    }

    // Description validation
    const descriptionStr = String(formData.description || "");
    if (!formData.description || descriptionStr.trim() === "") {
      newErrors.description = "Visa Description is required";
    } else if (descriptionStr.trim().length < 10) {
      newErrors.description = "Visa Description must be at least 10 characters long";
    } else if (descriptionStr.trim().length > 500) {
      newErrors.description = "Visa Description must not exceed 500 characters";
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

  const nextId = useMemo(
    () => Math.max(0, ...items.map((i) => i.id)) + 1,
    [items]
  );

  const openCreate = () => {
    setEditing(null);
    setIsViewMode(false);
    setFormData({
      passportCountry: "",
      country: "",
      passportCode: "",
      description: ""
    });
    setError("");
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setIsViewMode(false);
    
    // Map backend data to form fields
    const passportCountryId = item.paxPassportCountryId || item.passportCountry;
    const countryId = item.countryId || item.country;
    
    setFormData({
      passportCountry: passportCountryId || "",
      country: countryId || "",
      passportCode: item.passportCode || "",
      description: item.visaDescription || item.description || ""
    });
    setError("");
    setErrors({});
    setShowModal(true);
  };

  const openView = (item) => {
    console.log("View item data:", item); // Debug log
    setEditing(item);
    setIsViewMode(true);
    
    // Map backend data to form fields
    const passportCountryId = item.paxPassportCountryId || item.passportCountry;
    const countryId = item.countryId || item.country;
    
    console.log("Mapped values:", { passportCountryId, countryId, passportCode: item.passportCode, description: item.visaDescription || item.description }); // Debug log
    
    setFormData({
      passportCountry: passportCountryId || "",
      country: countryId || "",
      passportCode: item.passportCode || "",
      description: item.visaDescription || item.description || ""
    });
    setError("");
    setErrors({});
    setShowModal(true);
  };

  const handleEdit = async () => {
    if (!editing) return;

    // Validate form before submitting
    if (!validateForm()) {
      toast.error("Please fix the validation errors");
      return;
    }

    try {
      setIsLoading(true);
      
      const visaDetailsPayload = {
        countryId: formData.country,
        paxPassportCountryId: formData.passportCountry,
        passportCode: String(formData.passportCode).trim(),
        visaDescription: String(formData.description).trim()
      };

      const editRes = await axiosInstance.put(
        `/api/master/visaInfo/${editing.visaId}`,
        visaDetailsPayload
      );

     if (editRes.data) {
        toast.success("Visa Details Updated Successfully!");
        // First refresh the list
        await fetchVisaDetailsList(page, search);
        // Then close modal and reset state
        closeModal();
      }
    } catch (error) {
      setError("Failed to update visa details");
      toast.error("Failed to update visa details");
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setIsViewMode(false);
    setFormData({
      passportCountry: "",
      country: "",
      passportCode: "",
      description: ""
    });
    setError("");
    setErrors({});
  };

  const fetchVisaDetailsList = async (pageNum = 0, searchTerm = search) => {
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
        `/api/master/visaInfo?${params.toString()}`
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
      toast.error("Failed to load visa details");
      setItems([]);
      setTotalPages(0);
      setPage(0);
    } finally {
      setIsLoading(false);
    }
  };

  const saveVisaDetails = async () => {
    // Validate form before submitting
    if (!validateForm()) {
      toast.error("Please fix the validation errors");
      return;
    }

    try {
      setIsLoading(true);
      
      const visaDetailsPayload = {
        countryId: formData.country,
        paxPassportCountryId: formData.passportCountry,
        passportCode: String(formData.passportCode).trim(),
        visaDescription: String(formData.description).trim()
      };

      const visaDetailsSaveRes = await axiosInstance.post(
        "/api/master/visaInfo/save",
        visaDetailsPayload
      );
      if (visaDetailsSaveRes.data) {
        toast.success("Visa Details added Successfully!");
        // First refresh the list
        await fetchVisaDetailsList(page, search);
        // Then close modal
        closeModal();
      }
    } catch (error) {
      setError("Sorry! Data not saved to db..");
      toast.error("Failed to save visa details data");
    } finally {
      setIsLoading(false);
    }
  };

  // Load countries list
  const countryList = async () => {
    try {
      const response = await axiosInstance.get("/api/country");
      setCountries(response.data);
    } catch (error) {
      console.log("error for country list :", error);
    }
  };

  useEffect(() => {
    fetchVisaDetailsList();
    countryList();
  }, []);

  // Debounced search effect
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Set new timeout for search
    if (search !== "") {
      const timeout = setTimeout(() => {
        fetchVisaDetailsList(0, search);
      }, 500); // 500ms delay
      setSearchTimeout(timeout);
    } else if (search === "") {
      // If search is cleared, fetch all data
      fetchVisaDetailsList(0, "");
    }

    // Cleanup timeout on unmount
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [search]);

  const handleDelete = (item) => {
    console.log("delete item :::" , item);
    Swal.fire({
      titleText: `Are you sure? You want to delete ${item.passportCode} Visa Details`,
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
          .delete(`/api/master/visaInfo/${item.visaId}`)
          .then(() => {
            toast.success("Visa Details deleted successfully");
            fetchVisaDetailsList(page, search);
          })
          .catch(() => {
            toast.error("Sorry!! Visa Details not deleted");
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
            <Card.Header className="d-flex flex-column flex-sm-row gap-2 justify-content-between align-items-stretch align-items-sm-center">
              <div className="d-flex align-items-center gap-2">
                <BackButton fallback="/adminDashboard" />
                <div>
                  <h4 className="fw-bold text-primary mb-0">Visa Details</h4>
                  <p className="text-muted mb-0">Visa Details List</p>
                </div>
              </div>
              <div className="d-flex align-items-center gap-3">
                <Form.Group className="mb-0">
                  <Form.Control
                    type="text"
                    placeholder="Search"
                    className="form-control-sm"
                    value={searchTerm}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSearchTerm(value);
                      fetchVisaDetailsList(0, value);
                    }}
                  />
                </Form.Group>
                <Button className="btn btn-success" onClick={openCreate}>
                  Create +
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>S.N</th>
                    <th>Country</th>
                    <th>Passport Code</th>
                    <th style={{ width: 160 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.visaId}>
                      <td>{index + 1 + page * 10}</td>
                      <td>
                        <div className="fw-semibold">
                          {countries.find(c => String(c.id) === String(item.countryId))?.name || 
                           countries.find(c => String(c.id) === String(item.country))?.name || 
                           item.countryName || 
                           'Unknown Country'}
                        </div>
                      </td>
                      <td>
                        <div className="fw-semibold">{item.passportCode}</div>
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
                            className="text-success"
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
                        Loading available visa details...
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={4} className="text-center text-muted py-4">
                        No visa details found.
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
                      Showing {items.length} of {totalPages * 10} visa details
                    </small>
                  </div>
                  <div>
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={page === 0}
                        onClick={() => fetchVisaDetailsList(page - 1, search)}
                      />
                      {[...Array(totalPages).keys()].map((num) => (
                        <Pagination.Item
                          key={num}
                          active={num === page}
                          onClick={() => fetchVisaDetailsList(num, search)}
                        >
                          {num + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={page === totalPages - 1}
                        onClick={() => fetchVisaDetailsList(page + 1, search)}
                      />
                    </Pagination>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>

          <Modal show={showModal} onHide={() => {}} centered backdrop="static" keyboard={false} size="lg">
            <Modal.Header className="bg-primary text-white">
              <Modal.Title className="fw-bold">
                {isViewMode ? "View Visa Details" : "Save Visa Details"}
              </Modal.Title>
              {!isViewMode && <div className="text-danger small">* mandatory fields</div>}
            </Modal.Header>
            <Modal.Body className="p-4">
              {isViewMode ? (
                // View Mode - Display data in cards
                <div>
                  <Row>
                    <Col md={6}>
                      <div className="mb-4">
                        <h6 className="fw-bold text-primary mb-2">Passport Country</h6>
                        <div className="p-3 bg-light rounded border">
                          <span className="fw-semibold">
                            {countries.find(c => String(c.id) === String(formData.passportCountry))?.name || 
                             countries.find(c => String(c.id) === String(formData.passportCountry))?.countryName || 
                             'Not specified'}
                          </span>
                        </div>
                      </div>
                    </Col>
                    <Col md={6}>
                      <div className="mb-4">
                        <h6 className="fw-bold text-primary mb-2">Country</h6>
                        <div className="p-3 bg-light rounded border">
                          <span className="fw-semibold">
                            {countries.find(c => String(c.id) === String(formData.country))?.name || 
                             countries.find(c => String(c.id) === String(formData.country))?.countryName || 
                             'Not specified'}
                          </span>
                        </div>
                      </div>
                    </Col>
                  </Row>
                  <Row>
                    <Col md={6}>
                      <div className="mb-4">
                        <h6 className="fw-bold text-primary mb-2">Passport Code</h6>
                        <div className="p-3 bg-light rounded border">
                          <span className="fw-semibold">{formData.passportCode || 'Not specified'}</span>
                        </div>
                      </div>
                    </Col>
                    <Col md={6}>
                      <div className="mb-4">
                        <h6 className="fw-bold text-primary mb-2">Visa ID</h6>
                        <div className="p-3 bg-light rounded border">
                          <span className="fw-semibold">{editing?.visaId || 'N/A'}</span>
                        </div>
                      </div>
                    </Col>
                  </Row>
                  <Row>
                    <Col md={12}>
                      <div className="mb-4">
                        <h6 className="fw-bold text-primary mb-2">Visa Description</h6>
                        <div className="p-3 bg-light rounded border" style={{ minHeight: '120px' }}>
                          <span className="fw-semibold">{formData.description || 'No description provided'}</span>
                        </div>
                      </div>
                    </Col>
                  </Row>
                </div>
              ) : (
                // Edit/Create Mode - Form fields
                <Form>
                  <Row>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label className="fw-semibold">
                          Passport Country
                        </Form.Label>
                        <SearchableSelect
                          name="passportCountry"
                          value={formData.passportCountry}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, passportCountry: e.target.value }));
                            clearError('passportCountry');
                          }}
                          placeholder="SELECT"
                          options={countries}
                          isInvalid={!!errors.passportCountry}
                          disabled={isViewMode}
                        />
                        {errors.passportCountry && (
                          <Form.Control.Feedback type="invalid">
                            {errors.passportCountry}
                          </Form.Control.Feedback>
                        )}
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label className="fw-semibold">
                          Country
                        </Form.Label>
                        <SearchableSelect
                          name="country"
                          value={formData.country}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, country: e.target.value }));
                            clearError('country');
                          }}
                          placeholder="SELECT"
                          options={countries}
                          isInvalid={!!errors.country}
                          disabled={isViewMode}
                        />
                        {errors.country && (
                          <Form.Control.Feedback type="invalid">
                            {errors.country}
                          </Form.Control.Feedback>
                        )}
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-semibold">
                          Passport Code
                    </Form.Label>
                        <Form.Control
                          value={formData.passportCode}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, passportCode: e.target.value }));
                            clearError('passportCode');
                          }}
                          placeholder="Enter passport code"
                          autoFocus={!isViewMode}
                          isInvalid={!!errors.passportCode}
                          maxLength={20}
                          readOnly={isViewMode}
                          className={isViewMode ? "bg-light" : ""}
                        />
                    <Form.Text className="text-muted">
                          {formData.passportCode.length}/20 characters
                    </Form.Text>
                        {errors.passportCode && (
                      <Form.Control.Feedback type="invalid">
                        {errors.passportCode}
                      </Form.Control.Feedback>
                    )}
                      </Form.Group>
                    </Col>
                  </Row>

                  <Form.Group className="mb-3">
                    <Form.Label className="fw-semibold">
                      * Visa Description
                    </Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={4}
                      value={formData.description}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, description: e.target.value }));
                        clearError('description');
                      }}
                      placeholder="Enter visa description"
                      isInvalid={!!errors.description}
                      maxLength={500}
                      readOnly={isViewMode}
                      className={isViewMode ? "bg-light" : ""}
                    />
                    <Form.Text className="text-muted">
                      {formData.description.length}/500 characters
                    </Form.Text>
                    {errors.description && (
                      <Form.Control.Feedback type="invalid">
                        {errors.description}
                      </Form.Control.Feedback>
                    )}
                  </Form.Group>

                  {error && (
                    <div className="alert alert-danger" role="alert">
                      {error}
                    </div>
                  )}
                </Form>
              )}
            </Modal.Body>
            <Modal.Footer className="d-flex justify-content-between">
              <Button
                variant="danger"
                onClick={closeModal}
                disabled={isLoading}
                className="d-flex align-items-center gap-2"
              >
                <FaTimes />
                {isViewMode ? "Close" : "Cancel"}
              </Button>
              {!isViewMode && (
                <div className="d-flex gap-2">
                  <Button
                    variant="success"
                    onClick={editing ? handleEdit : saveVisaDetails}
                    disabled={isLoading}
                    className="d-flex align-items-center gap-2"
                  >
                    <FaCheck />
                    {isLoading ? (editing ? "Updating..." : "Saving...") : (editing ? "Update" : "Create")}
                  </Button>
                  <Button
                    variant="info"
                    onClick={() => {
                      setFormData({
                        passportCountry: "",
                        country: "",
                        passportCode: "",
                        description: ""
                      });
                      setErrors({});
                    }}
                    disabled={isLoading}
                    className="d-flex align-items-center gap-2"
                  >
                    <FaUndo />
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