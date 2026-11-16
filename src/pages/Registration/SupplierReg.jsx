import React, { useEffect, useMemo, useState } from "react";
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
import axios from "axios";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";
import {
  FaEdit,
  FaTrash,
  FaEye,
  FaArrowLeft,
} from "react-icons/fa";

// SearchableSelect Component
const SearchableSelect = ({
  options,
  value,
  onChange,
  placeholder,
  className,
  isInvalid,
  name,
  disabled = false,
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
        // Handle different possible data structures
        const optionName =
          option.name ||
          option.countryName ||
          option.stateName ||
          option.placeName ||
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
      onChange({
        target: {
          name: name,
          value: option.id,
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
              selectedOption?.stateName ||
              selectedOption?.placeName ||
              ""
        }
        onChange={(e) => {
          if (disabled) return;
          if (isOpen) {
            setSearchTerm(e.target.value);
          } else {
            // If not open, open dropdown and set search term
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
          {filteredOptions.length > 0 ? (
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

const SupplierReg = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isViewMode, setIsViewMode] = useState(false);

  // Helper function to get form control props based on view mode
  const getFormControlProps = (
    fieldName,
    onChangeHandler,
    additionalProps = {}
  ) => {
    return {
      ...additionalProps,
      readOnly: isViewMode,
      onChange: isViewMode ? undefined : onChangeHandler,
      className: `${additionalProps.className || ""} ${
        isViewMode ? "bg-light" : ""
      }`.trim(),
      autoFocus: isViewMode ? false : additionalProps.autoFocus,
    };
  };
 
  const [formData, setFormData] = useState({
    supplierId: "",
    name: "",
    email: "",
    address: "",
    phoneNumber: "",
    trnNumber: "",
    isActive: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState({});
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState("");
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const nextId = useMemo(
    () => Math.max(0, ...items.map((i) => i.id)) + 1,
    [items]
  );

  // Helper function to convert file to base64
  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  const openCreate = () => {
    setEditing(null);
    setFormData({
      supplierId: "",
      name: "",
      email: "",
      address: "",
      phoneNumber: "",
      trnNumber: "",
      isActive: true,
    });
    
    setValidationErrors({});
    setError("");
    setShowModal(true);
  };

  const openEdit = async (item) => {
    setEditing(item);
    setIsViewMode(false); // Set to edit mode

    // Set form data first - map from API response structure
    setFormData({
      supplierId: item.supplierId || "",
      name: item.name || "",
      email: item.email || "",
      address: item.address || "",
      phoneNumber: item.phoneNumber || "",
      trnNumber: item.trnNumber || "",
      isActive: item.isActive !== undefined ? item.isActive : true,
    });

    setValidationErrors({});
    setShowModal(true);
  };


  const handleEdit = async () => {
  const errors = validateSupplierForm(formData);
  if (Object.keys(errors).length > 0) {
    setValidationErrors(errors);
    return;
  }

  if (!editing) return;

  try {
    setIsLoading(true);

    // Build JSON payload for backend (@RequestBody expects JSON)
    const payload = {
      supplierId: formData.supplierId,
      name: formData.name,
      email: formData.email,
      address: formData.address,
      phoneNumber: formData.phoneNumber,
      trnNumber: formData.trnNumber ? parseInt(formData.trnNumber) : null,
      isActive: formData.isActive,
    };

    console.log("Payload prepared for edit:", payload);

    const editRes = await axiosInstance.put(
      `/api/supplier/${editing.supplierId}`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (editRes.data) {
      toast.success("Supplier Updated Successfully!");
      setValidationErrors({});
      await fetchSupplierList(page, search);
      closeModal();
    }
  } catch (error) {
    console.error("Edit supplier error:", error);
    console.error("Error details:", error.response?.data);
    setError("Failed to update supplier");
    toast.error(
      `Failed to update supplier: ${
        error.response?.data?.message || error.message
      }`
    );
  } finally {
    setIsLoading(false);
  }
};


  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setIsViewMode(false); // Reset view mode
    setFormData({
      supplierId: "",
      name: "",
      email: "",
      address: "",
      phoneNumber: "",
      trnNumber: "",
      isActive: true,
    });
   
    setValidationErrors({});
    setError("");
  };

  const fetchSupplierList = async (pageNum = 0, searchTerm = search) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "10",
      });

      if (searchTerm && searchTerm.trim()) {
        params.append("search", searchTerm.trim());
      }

      const res = await axiosInstance.get(`/api/supplier?${params.toString()}`);

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
      toast.error("Failed to load suppliers");
      setItems([]);
      setTotalPages(0);
      setPage(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSupplierList();
  }, []);

  // Validation function
  const validateSupplierForm = (data) => {
    const newErrors = {};

    // Helper function to safely get string value
    const getStringValue = (value) => {
      return value ? String(value).trim() : "";
    };

    // Required field validations
   
    if (!getStringValue(data.name))
      newErrors.name = "Supplier Name is required";
    if (!getStringValue(data.email))
      newErrors.email = "Email is required";
    if (!getStringValue(data.address))
      newErrors.address = "Address is required";
    if (!getStringValue(data.phoneNumber))
      newErrors.phoneNumber = "Phone Number is required";

    // Additional format validations
    const emailValue = getStringValue(data.email);
    if (emailValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue))
      newErrors.email = "Invalid email format";

    const phoneValue = getStringValue(data.phoneNumber);
    if (phoneValue && !/^\+?\d{10,15}$/.test(phoneValue.replace(/\s/g, "")))
      newErrors.phoneNumber = "Phone Number must be 10-15 digits";

    // TRN Number validation (optional but if provided should be numeric)
    const trnValue = getStringValue(data.trnNumber);
    if (trnValue && !/^\d+$/.test(trnValue))
      newErrors.trnNumber = "TRN Number must be numeric";

    return newErrors;
  };

  const saveSupplier = async (e) => {
    e.preventDefault();
    const errors = validateSupplierForm(formData);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors); 
      return;
    }

    try {
      setIsLoading(true);

      // Prepare JSON payload for backend
      const payload = {
        name: formData.name,
        email: formData.email,
        address: formData.address,
        phoneNumber: formData.phoneNumber,
        trnNumber: formData.trnNumber ? parseInt(formData.trnNumber) : null,
        isActive: formData.isActive,
      };

      console.log("Payload prepared for save:", payload);
      const supplierSaveResponse = await axiosInstance.post(
        "/api/supplier/register",
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (supplierSaveResponse.data) {
        toast.success("Supplier added Successfully!");
        setValidationErrors({});
        await fetchSupplierList(page, search);
        closeModal();
      }
    } catch (error) {
      console.error("Save supplier error:", error);
      console.error("Error details:", error.response?.data);
      setError("Sorry! Data not saved to db..");
      toast.error(
        `Failed to save supplier data: ${
          error.response?.data?.message || error.message
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    const timeout = setTimeout(() => {
      fetchSupplierList(0, search);
    }, 500);
    setSearchTimeout(timeout);

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
          .delete(`/api/supplier/${item.supplierId}`)
          .then(() => {
            toast.success("Supplier deleted successfully");
            fetchSupplierList(page, search);
          })
          .catch(() => {
            toast.error("Sorry!! Supplier not deleted");
          });
      }
    });
  };

  const handleView = async (item) => {
    setEditing(item);
    setIsViewMode(true); // Set to view mode

    // Set form data first - map from API response structure
    setFormData({
      supplierId: item.supplierId || "",
      name: item.name || "",
      email: item.email || "",
      address: item.address || "",
      phoneNumber: item.phoneNumber || "",
      trnNumber: item.trnNumber || "",
      isActive: item.isActive !== undefined ? item.isActive : true,
    });

    setValidationErrors({});
    setShowModal(true);
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          {/* Back to Admin Dashboard — top-left, above the page card */}
          <div className="mb-3">
            <Button
              variant="outline-secondary"
              onClick={() => navigate("/adminDashboard")}
              className="d-inline-flex align-items-center gap-2 rounded-pill px-3 py-2"
            >
              <FaArrowLeft />
              Back
            </Button>
          </div>

          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <span className="fw-semibold">Supplier</span>
              <Form.Group className="hotel-search-bar position-relative">
                <Form.Control
                  type="text"
                  placeholder="Search supplier by name..."
                  className="form-control-modern-sm"
                  value={searchTerm}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearchTerm(value);
                    setSearch(value);
                    // Reset to first page when searching
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
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>S/N</th>
                    <th>Supplier ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone Number</th>
                    <th>Status</th>
                    <th style={{ width: 160 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.supplierId}>
                      <td>{index + 1 + page * 10}</td>
                      <td>{item.supplierId || 'N/A'}</td>
                      <td>{item.name || 'N/A'}</td>
                      <td>{item.email || 'N/A'}</td>
                      <td>{item.phoneNumber || 'N/A'}</td>
                      <td>
                        <span className={`badge ${item.isActive ? 'bg-success' : 'bg-secondary'}`}>
                          {item.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
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
                  {isLoading && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        <div
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        >
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        Loading available suppliers...
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        No suppliers found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>

              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center p-3 border-top">
                  <div>
                    <small className="text-muted">
                      Showing {items.length} of {totalPages * 10} suppliers
                    </small>
                  </div>
                  <div>
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={page === 0}
                        onClick={() => fetchSupplierList(page - 1, search)}
                      />
                      {[...Array(totalPages).keys()].map((num) => (
                        <Pagination.Item
                          key={num}
                          active={num === page}
                          onClick={() => fetchSupplierList(num, search)}
                        >
                          {num + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={page === totalPages - 1}
                        onClick={() => fetchSupplierList(page + 1, search)}
                      />
                    </Pagination>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>

          <Modal show={showModal} onHide={closeModal} centered size="lg">
            <Modal.Header
              closeButton={!isLoading}
              className={isViewMode ? "border-bottom" : ""}
              style={
                isViewMode ? { backgroundColor: "#f1f3f5" } : undefined
              }
            >
              <Modal.Title
                className={
                  isViewMode ? "text-dark fw-bold" : ""
                }
              >
                {isViewMode
                  ? "Supplier Details"
                  : editing
                  ? "Update Supplier"
                  : "Create Supplier"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body className={isViewMode ? "bg-white py-3" : ""}>
              {isViewMode ? (
                (() => {
                  // ── Read-only view layout. Title is darker/bold per
                  //    user spec; body labels stay muted, values stay
                  //    in plain default body color (no bold/darken). */}
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
                      <SectionHeader>Supplier Information</SectionHeader>
                      <SectionBody>
                        <Row className="g-3">
                          <Col md={6}>
                            <KV
                              label="Supplier Name"
                              value={formData.name}
                            />
                            <KV label="Email" value={formData.email} />
                            <KV
                              label="Phone Number"
                              value={formData.phoneNumber}
                            />
                          </Col>
                          <Col md={6}>
                            <KV
                              label="TRN Number"
                              value={formData.trnNumber}
                            />
                            <KV
                              label="Status"
                              value={
                                formData.isActive ? "Active" : "Inactive"
                              }
                            />
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
              <Form>
                <Card className="mb-3">
                  <Card.Header>Supplier Details</Card.Header>
                  <Card.Body>
                    <Row>
                      <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>Supplier Name</Form.Label>
                          <Form.Control
                            value={formData.name}
                            placeholder="Enter supplier name"
                            isInvalid={!!validationErrors.name}
                            {...getFormControlProps(
                              "name",
                              (e) => {
                                setFormData({
                                  ...formData,
                                  name: e.target.value,
                                });
                                // Clear validation error when user starts typing
                                if (validationErrors.name) {
                                  setValidationErrors(prev => ({
                                    ...prev,
                                    name: ""
                                  }));
                                }
                              },
                              {
                                className: `form-input ${
                                  validationErrors.name ? "is-invalid" : ""
                                }`,
                              }
                            )}
                          />
                          {validationErrors.name && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.name}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>Email</Form.Label>
                          <Form.Control
                            value={formData.email}
                            placeholder="Enter email"
                            isInvalid={!!validationErrors.email}
                            {...getFormControlProps(
                              "email",
                              (e) => {
                                setFormData({
                                  ...formData,
                                  email: e.target.value,
                                });
                                // Clear validation error when user starts typing
                                if (validationErrors.email) {
                                  setValidationErrors(prev => ({
                                    ...prev,
                                    email: ""
                                  }));
                                }
                              },
                              {
                                className: `form-input ${
                                  validationErrors.email
                                    ? "is-invalid"
                                    : ""
                                }`,
                              }
                            )}
                          />
                          {validationErrors.email && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.email}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                      </Col>
                       <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>Phone Number</Form.Label>
                          <Form.Control
                            value={formData.phoneNumber}
                            placeholder="Enter phone number"
                            isInvalid={!!validationErrors.phoneNumber}
                            {...getFormControlProps(
                              "phoneNumber",
                              (e) => {
                                setFormData({
                                  ...formData,
                                  phoneNumber: e.target.value,
                                });
                                // Clear validation error when user starts typing
                                if (validationErrors.phoneNumber) {
                                  setValidationErrors(prev => ({
                                    ...prev,
                                    phoneNumber: ""
                                  }));
                                }
                              },
                              {
                                className: `form-input ${
                                  validationErrors.phoneNumber
                                    ? "is-invalid"
                                    : ""
                                }`,
                              }
                            )}
                          />
                          {validationErrors.phoneNumber && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.phoneNumber}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                      </Col>
                    </Row>
                    <Row>
                     
                       <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>TRN Number</Form.Label>
                          <Form.Control
                            value={formData.trnNumber}
                            placeholder="Enter TRN number (optional)"
                            isInvalid={!!validationErrors.trnNumber}
                            {...getFormControlProps(
                              "trnNumber",
                              (e) => {
                                setFormData({
                                  ...formData,
                                  trnNumber: e.target.value,
                                });
                                // Clear validation error when user starts typing
                                if (validationErrors.trnNumber) {
                                  setValidationErrors(prev => ({
                                    ...prev,
                                    trnNumber: ""
                                  }));
                                }
                              },
                              {
                                className: `form-input ${
                                  validationErrors.trnNumber
                                    ? "is-invalid"
                                    : ""
                                }`,
                              }
                            )}
                          />
                          {validationErrors.trnNumber && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.trnNumber}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                      </Col>
                       <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>Address</Form.Label>
                          <Form.Control
                            value={formData.address}
                            placeholder="Enter address"
                            isInvalid={!!validationErrors.address}
                            {...getFormControlProps(
                              "address",
                              (e) => {
                                setFormData({
                                  ...formData,
                                  address: e.target.value,
                                });
                                // Clear validation error when user starts typing
                                if (validationErrors.address) {
                                  setValidationErrors(prev => ({
                                    ...prev,
                                    address: ""
                                  }));
                                }
                              },
                              {
                                className: `form-input ${
                                  validationErrors.address
                                    ? "is-invalid"
                                    : ""
                                }`,
                              }
                            )}
                          />
                          {validationErrors.address && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.address}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                      </Col>

                         <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>Status</Form.Label>
                          <Form.Select
                            value={formData.isActive}
                            isInvalid={!!validationErrors.isActive}
                            {...getFormControlProps(
                              "isActive",
                              (e) => {
                                setFormData({
                                  ...formData,
                                  isActive: e.target.value === "true",
                                });
                                // Clear validation error when user starts typing
                                if (validationErrors.isActive) {
                                  setValidationErrors(prev => ({
                                    ...prev,
                                    isActive: ""
                                  }));
                                }
                              },
                              {
                                className: `form-input ${
                                  validationErrors.isActive
                                    ? "is-invalid"
                                    : ""
                                }`,
                              }
                            )}
                          >
                            <option value={true}>Active</option>
                            <option value={false}>Inactive</option>
                          </Form.Select>
                          {validationErrors.isActive && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.isActive}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                      </Col>
                    </Row>
                    <Row>
                   
                    </Row>
                  </Card.Body>
                </Card>
                 {error && (
                  <Form.Control.Feedback type="invalid">
                    {error}
                  </Form.Control.Feedback>
                )}
              </Form>
              )}
            </Modal.Body>
            <Modal.Footer
              style={
                isViewMode ? { backgroundColor: "#f8f9fa" } : undefined
              }
            >
              <Button
                variant="secondary"
                onClick={closeModal}
                disabled={isLoading}
              >
                {isViewMode ? "Close" : "Cancel"}
              </Button>
              {!isViewMode && (
                <Button
                  className="btn-indigo"
                  onClick={editing ? handleEdit : saveSupplier}
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
              )}
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
};

export default SupplierReg;
