import React, { useEffect, useState } from "react";
import BackButton from "../components/BackButton";
import {
  Card,
  Button,
  Form,
  Row,
  Col,
  Table,
  Modal,
  Pagination,
} from "react-bootstrap";
import Select from "react-select";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/TopBar";
import axiosInstance from "../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEdit, FaTrash, FaPlus, FaSearch, FaEye } from "react-icons/fa";

export default function CompanyProfile() {
  const [formData, setFormData] = useState({
    companyProfileId: "",
    companyName: "",
    authorizedPerson: "",
    address: "",
    website: "",
    mainOffice: "",
    yearStandUp: "",
    labours: "",
    branches: "",
    mailId: "",
    telephone: "",
    faxNumber: "",
    mobile: "",
    postOffice: "",
    whitelistedSupplierCodes: [],
    // Company-wide branding: a small logo rendered on the LEFT of every
    // voucher / invoice PDF, plus a larger banner image shown on the
    // profile view. Both live as base64 strings (data URL or raw) to
    // mirror the AgentReg.jsx pattern — no separate upload endpoint.
    companyLogo: null,
    companyImage: null,
  });
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState({});
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewData, setViewData] = useState(null);
  const [suppliers, setSuppliers] = useState([]);

  // Helper function to safely convert value to string
  const toString = (value) => {
    if (value == null || value === undefined) return "";
    return String(value);
  };

  // Mirrors AgentReg.jsx's helper — turn a File picked from <input
  // type="file"> into a data: URL so it can be sent in JSON.
  const convertToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });

  // Resolve any of the supported shapes (File object freshly picked,
  // data URL coming back from the backend, or raw base64 without
  // prefix) into an <img src=…>-friendly string. Returns null when
  // the input is empty so the preview block can be skipped.
  const resolveImageSrc = (value) => {
    if (!value) return null;
    if (value instanceof File) return URL.createObjectURL(value);
    if (typeof value === "string") {
      return value.startsWith("data:")
        ? value
        : `data:image/*;base64,${value}`;
    }
    return null;
  };

  // Helper function to safely trim string values
  const safeTrim = (value) => {
    return toString(value).trim();
  };

  const validateForm = () => {
    // Only four fields are business-mandatory: Company Name, Authorized
    // Person, Address, Email. Everything else is optional — but when the
    // user DOES fill in a number/year/URL we still enforce the format so
    // the backend doesn't get garbage.
    const errors = {};

    if (!safeTrim(formData.companyName)) {
      errors.companyName = "Company Name is required";
    }

    if (!safeTrim(formData.authorizedPerson)) {
      errors.authorizedPerson = "Authorized Person is required";
    }

    if (!safeTrim(formData.address)) {
      errors.address = "Address is required";
    }

    const mailId = safeTrim(formData.mailId);
    if (!mailId) {
      errors.mailId = "Email is required";
    } else if (!isValidEmail(mailId)) {
      errors.mailId = "Please enter a valid email address";
    }

    const website = safeTrim(formData.website);
    if (website && !isValidUrl(website)) {
      errors.website = "Please enter a valid website URL";
    }

    // Format-only checks — no "is required".
    const yearStandUp = safeTrim(formData.yearStandUp);
    if (yearStandUp && !isValidYear(yearStandUp)) {
      errors.yearStandUp = "Please enter a valid year (e.g., 2010)";
    }

    const labours = safeTrim(formData.labours);
    if (labours && (isNaN(labours) || parseInt(labours) <= 0)) {
      errors.labours = "Please enter a valid number";
    }

    const branches = safeTrim(formData.branches);
    if (branches && (isNaN(branches) || parseInt(branches) <= 0)) {
      errors.branches = "Please enter a valid number";
    }

    const postOffice = safeTrim(formData.postOffice);
    if (postOffice && (isNaN(postOffice) || parseInt(postOffice) <= 0)) {
      errors.postOffice = "Please enter a valid number";
    }

    return errors;
  };

  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const isValidUrl = (url) => {
    try {
      const urlToCheck =
        url.startsWith("http://") ||
        url.startsWith("https://") ||
        url.startsWith("www.")
          ? url
          : `http://${url}`;
      new URL(urlToCheck);
      return true;
    } catch {
      const urlPattern =
        /^(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;
      return urlPattern.test(url);
    }
  };

  const isValidYear = (year) => {
    const yearNum = parseInt(year);
    return (
      !isNaN(yearNum) && yearNum >= 1900 && yearNum <= new Date().getFullYear()
    );
  };

  const fetchCompanyList = async (pageNum = 0, searchStr = searchTerm) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "20",
      });

      if (searchStr && searchStr.trim()) {
        params.append("search", searchStr.trim());
      }

      const res = await axiosInstance.get(
        `/api/companyProfile?${params.toString()}`,
      );

      if (res.data && Array.isArray(res.data)) {
        setItems(res.data);
        if (res.data.length < 20) {
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
      toast.error("Failed to load company profiles");
      setItems([]);
      setTotalPages(0);
      setPage(0);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormData({
      companyProfileId: "",
      companyName: "",
      authorizedPerson: "",
      address: "",
      website: "",
      mainOffice: "",
      yearStandUp: "",
      labours: "",
      branches: "",
      mailId: "",
      telephone: "",
      faxNumber: "",
      mobile: "",
      postOffice: "",
      whitelistedSupplierCodes: [],
      companyLogo: null,
      companyImage: null,
    });
    setValidationErrors({});
    setShowModal(true);
  };

  const openEdit = async (item) => {
    setEditing(item);
    setIsLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/companyProfile/${item.companyProfileId}`,
      );
      if (res.data) {
        const data = res.data;
        setFormData({
          companyProfileId: data.companyProfileId,
          companyName: toString(data.companyName),
          authorizedPerson: toString(data.authorizedPerson),
          address: toString(data.address),
          website: toString(data.website),
          mainOffice: toString(data.mainOffice),
          yearStandUp: toString(data.yearStandUp),
          labours: toString(data.labours),
          branches: toString(data.branches),
          mailId: toString(data.mailId),
          telephone: toString(data.telephone),
          faxNumber: toString(data.faxNumber),
          mobile: toString(data.mobile),
          postOffice: toString(data.postOffice),
          whitelistedSupplierCodes: data.whitelistedSupplierCodes || [],
          // Backend returns these as base64 strings (or null). Stored
          // as-is so the preview block can render them directly and so
          // an unchanged edit roundtrips without re-uploading.
          companyLogo: data.companyLogo || null,
          companyImage: data.companyImage || null,
        });
        setValidationErrors({});
        setShowModal(true);
      }
    } catch (error) {
      toast.error("Failed to load company details");
    } finally {
      setIsLoading(false);
    }
  };

  const handleView = async (item) => {
    setIsLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/companyProfile/${item.companyProfileId}`,
      );
      if (res.data) {
        setViewData(res.data);
        setShowViewModal(true);
      }
    } catch (error) {
      toast.error("Failed to load company details");
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setShowViewModal(false);
    setEditing(null);
    setValidationErrors({});
    setViewData(null);
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    if (validationErrors[field]) {
      setValidationErrors((prev) => ({
        ...prev,
        [field]: "",
      }));
    }
  };

  const saveCompanyProfile = async () => {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    try {
      setIsLoading(true);
      setValidationErrors({});

      const payload = {
        companyName: safeTrim(formData.companyName),
        authorizedPerson: safeTrim(formData.authorizedPerson),
        address: safeTrim(formData.address),
        website: safeTrim(formData.website),
        mainOffice: safeTrim(formData.mainOffice),
        yearStandUp: safeTrim(formData.yearStandUp),
        labours: safeTrim(formData.labours),
        branches: safeTrim(formData.branches),
        mailId: safeTrim(formData.mailId),
        telephone: safeTrim(formData.telephone),
        faxNumber: safeTrim(formData.faxNumber),
        mobile: safeTrim(formData.mobile),
        postOffice: safeTrim(formData.postOffice),
        whitelistedSupplierCodes: formData.whitelistedSupplierCodes,
      };

      // Logo / image handling — mirror AgentReg.jsx. Only attach the
      // key when the user picked a fresh File on this open of the modal.
      // For edits where the user didn't touch the field, omit the key so
      // the backend preserves whatever logo is already saved.
      try {
        if (formData.companyLogo instanceof File) {
          payload.companyLogo = await convertToBase64(formData.companyLogo);
        } else if (!editing && typeof formData.companyLogo === "string") {
          payload.companyLogo = formData.companyLogo;
        }
        if (formData.companyImage instanceof File) {
          payload.companyImage = await convertToBase64(formData.companyImage);
        } else if (!editing && typeof formData.companyImage === "string") {
          payload.companyImage = formData.companyImage;
        }
      } catch (err) {
        console.error("Error converting image to base64:", err);
        toast.error("Error processing image file");
        return;
      }

      let response;
      if (editing) {
        response = await axiosInstance.put(
          `/api/companyProfile/${editing.companyProfileId}`,
          payload,
        );
        toast.success("Company Profile updated successfully!");
      } else {
        response = await axiosInstance.post(
          "/api/companyProfile/save",
          payload,
        );
        toast.success("Company Profile saved successfully!");
      }

      if (response.data) {
        fetchCompanyList(page, searchTerm);
        closeModal();
      }
    } catch (error) {
      console.error("Save error:", error);
      toast.error(
        editing
          ? "Failed to update company profile"
          : "Failed to save company profile",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = (item) => {
    Swal.fire({
      titleText: `Are you sure? You want to delete ${item.companyName}`,
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
          .delete(`/api/companyProfile/${item.companyProfileId}`)
          .then(() => {
            toast.success("Company Profile deleted successfully");
            fetchCompanyList(page, searchTerm);
          })
          .catch(() => {
            toast.error("Failed to delete company profile");
          });
      }
    });
  };

  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        const res = await axiosInstance.get("/api/external-apis/list");
        if (res.data) {
          setSuppliers(
            res.data.map((s) => ({ value: s.apiCode, label: s.apiCode })),
          );
        }
      } catch (err) {
        console.error("Failed to fetch suppliers", err);
      }
    };
    fetchSuppliers();
    fetchCompanyList();
  }, []);

  useEffect(() => {
    if (searchTimeout) clearTimeout(searchTimeout);

    if (searchTerm !== "") {
      const timeout = setTimeout(() => {
        fetchCompanyList(0, searchTerm);
      }, 500);
      setSearchTimeout(timeout);
    } else {
      fetchCompanyList(0, "");
    }

    return () => {
      if (searchTimeout) clearTimeout(searchTimeout);
    };
  }, [searchTerm]);

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <BackButton/>
              <span className="fw-semibold">Company Profile</span>
              <div className="d-flex gap-3 align-items-center">
                <Form.Group className="mb-0">
                  <div className="position-relative">
                    <Form.Control
                      type="text"
                      placeholder="Search by company name..."
                      className="form-control-modern-sm ps-4"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <FaSearch
                      className="position-absolute top-50 translate-middle-y ms-2 text-muted"
                      style={{ left: "5px", fontSize: "12px" }}
                    />
                  </div>
                </Form.Group>
                <Button
                  className="btn-green d-flex align-items-center gap-2"
                  onClick={openCreate}
                >
                  <FaPlus size={12} /> Create
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>S/N</th>
                    <th style={{ width: 140 }}>Company Code</th>
                    <th>Company Name</th>
                    <th>Address</th>
                    <th>Authorized Person</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.companyProfileId}>
                      <td>{index + 1 + page * 20}</td>
                      <td>
                        {item.companyCode ? (
                          <code>{item.companyCode}</code>
                        ) : (
                          <span className="text-muted small">—</span>
                        )}
                      </td>
                      <td>{item.companyName}</td>
                      <td>{item.address}</td>
                      <td>{item.authorizedPerson}</td>
                      <td>
                        <div className="d-flex gap-2 text-primary">
                          <FaEye
                            style={{ cursor: "pointer", fontSize: "18px" }}
                            onClick={() => handleView(item)}
                            title="View"
                          />
                          <FaEdit
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
                  {isLoading && items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        <div
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        >
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        Loading company profiles...
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        No company profiles found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>

              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center p-3 border-top">
                  <div>
                    <small className="text-muted">
                      Showing {items.length} of {totalPages * 20} profiles
                    </small>
                  </div>
                  <Pagination className="mb-0">
                    <Pagination.Prev
                      disabled={page === 0}
                      onClick={() => fetchCompanyList(page - 1)}
                    />
                    {[...Array(totalPages).keys()].map((num) => (
                      <Pagination.Item
                        key={num}
                        active={num === page}
                        onClick={() => fetchCompanyList(num)}
                      >
                        {num + 1}
                      </Pagination.Item>
                    ))}
                    <Pagination.Next
                      disabled={page === totalPages - 1}
                      onClick={() => fetchCompanyList(page + 1)}
                    />
                  </Pagination>
                </div>
              )}
            </Card.Body>
          </Card>

          <Modal show={showModal} onHide={closeModal} centered size="lg">
            <Modal.Header closeButton={!isLoading}>
              <Modal.Title>
                {editing ? "Update Company Profile" : "Create Company Profile"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Company Name <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.companyName}
                        onChange={(e) =>
                          handleInputChange("companyName", e.target.value)
                        }
                        placeholder="Enter company name"
                        isInvalid={!!validationErrors.companyName}
                      />
                      <Form.Control.Feedback type="invalid">
                        {validationErrors.companyName}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Authorized Person <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.authorizedPerson}
                        onChange={(e) =>
                          handleInputChange("authorizedPerson", e.target.value)
                        }
                        placeholder="Enter authorized person"
                        isInvalid={!!validationErrors.authorizedPerson}
                      />
                      <Form.Control.Feedback type="invalid">
                        {validationErrors.authorizedPerson}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>

                <Form.Group className="mb-3">
                  <Form.Label>
                    Address <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    value={formData.address}
                    onChange={(e) =>
                      handleInputChange("address", e.target.value)
                    }
                    placeholder="Enter company address"
                    isInvalid={!!validationErrors.address}
                  />
                  <Form.Control.Feedback type="invalid">
                    {validationErrors.address}
                  </Form.Control.Feedback>
                </Form.Group>

                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Website</Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.website}
                        onChange={(e) =>
                          handleInputChange("website", e.target.value)
                        }
                        placeholder="www.example.com"
                        isInvalid={!!validationErrors.website}
                      />
                      <Form.Control.Feedback type="invalid">
                        {validationErrors.website}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Main Office</Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.mainOffice}
                        onChange={(e) =>
                          handleInputChange("mainOffice", e.target.value)
                        }
                        placeholder="Enter main office"
                        isInvalid={!!validationErrors.mainOffice}
                      />
                      <Form.Control.Feedback type="invalid">
                        {validationErrors.mainOffice}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Year Stand Up</Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.yearStandUp}
                        onChange={(e) =>
                          handleInputChange("yearStandUp", e.target.value)
                        }
                        placeholder="e.g. 2010"
                        isInvalid={!!validationErrors.yearStandUp}
                      />
                      <Form.Control.Feedback type="invalid">
                        {validationErrors.yearStandUp}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Email <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="email"
                        value={formData.mailId}
                        onChange={(e) =>
                          handleInputChange("mailId", e.target.value)
                        }
                        placeholder="info@company.com"
                        isInvalid={!!validationErrors.mailId}
                      />
                      <Form.Control.Feedback type="invalid">
                        {validationErrors.mailId}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>Labours</Form.Label>
                      <Form.Control
                        type="number"
                        value={formData.labours}
                        onChange={(e) =>
                          handleInputChange("labours", e.target.value)
                        }
                        isInvalid={!!validationErrors.labours}
                      />
                      <Form.Control.Feedback type="invalid">
                        {validationErrors.labours}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>Branches</Form.Label>
                      <Form.Control
                        type="number"
                        value={formData.branches}
                        onChange={(e) =>
                          handleInputChange("branches", e.target.value)
                        }
                        isInvalid={!!validationErrors.branches}
                      />
                      <Form.Control.Feedback type="invalid">
                        {validationErrors.branches}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>Post Office</Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.postOffice}
                        onChange={(e) =>
                          handleInputChange("postOffice", e.target.value)
                        }
                        isInvalid={!!validationErrors.postOffice}
                      />
                      <Form.Control.Feedback type="invalid">
                        {validationErrors.postOffice}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>Telephone</Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.telephone}
                        onChange={(e) =>
                          handleInputChange("telephone", e.target.value)
                        }
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>Mobile</Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.mobile}
                        onChange={(e) =>
                          handleInputChange("mobile", e.target.value)
                        }
                        isInvalid={!!validationErrors.mobile}
                      />
                      <Form.Control.Feedback type="invalid">
                        {validationErrors.mobile}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>Fax Number</Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.faxNumber}
                        onChange={(e) =>
                          handleInputChange("faxNumber", e.target.value)
                        }
                      />
                    </Form.Group>
                  </Col>
                </Row>

                {/* Whitelisted Suppliers picker intentionally hidden —
                    feature not currently used. The formData field and
                    payload key are kept intact so any codes on existing
                    rows are preserved on edit; only the UI is hidden. */}

                {/* Company branding — logo goes on the LEFT of every
                    voucher / invoice PDF, image is the larger cover/
                    banner shown on the profile view. Pattern lifted
                    from AgentReg.jsx so the two flows stay consistent. */}
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Company Logo</Form.Label>
                      <Form.Control
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          handleInputChange(
                            "companyLogo",
                            e.target.files[0] || null,
                          )
                        }
                      />
                      {formData.companyLogo && (
                        <div className="mt-2">
                          <img
                            src={resolveImageSrc(formData.companyLogo)}
                            alt="Company Logo"
                            style={{
                              maxHeight: "60px",
                              maxWidth: "100%",
                              border: "1px solid #ddd",
                              borderRadius: "4px",
                              padding: "2px",
                              background: "#fff",
                            }}
                          />
                        </div>
                      )}
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Company Image</Form.Label>
                      <Form.Control
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          handleInputChange(
                            "companyImage",
                            e.target.files[0] || null,
                          )
                        }
                      />
                      {formData.companyImage && (
                        <div className="mt-2">
                          <img
                            src={resolveImageSrc(formData.companyImage)}
                            alt="Company Image"
                            style={{
                              maxHeight: "100px",
                              maxWidth: "100%",
                              border: "1px solid #ddd",
                              borderRadius: "4px",
                              padding: "2px",
                              background: "#fff",
                            }}
                          />
                        </div>
                      )}
                    </Form.Group>
                  </Col>
                </Row>
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
                onClick={saveCompanyProfile}
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

          <Modal show={showViewModal} onHide={closeModal} centered size="lg">
            <Modal.Header closeButton className="border-0 bg-light">
              <Modal.Title className="h5 fw-bold text-primary">
                <FaEye className="me-2" /> Company Details
              </Modal.Title>
            </Modal.Header>
            <Modal.Body className="p-4">
              {viewData ? (
                <div className="company-details-view">
                  <Row className="mb-4">
                    <Col md={12}>
                      <div className="p-3 bg-indigo-subtle border border-indigo-subtle rounded-3 d-flex align-items-center gap-3">
                        {viewData.companyLogo && (
                          <img
                            src={resolveImageSrc(viewData.companyLogo)}
                            alt="Company Logo"
                            style={{
                              height: "56px",
                              width: "56px",
                              objectFit: "contain",
                              background: "#fff",
                              border: "1px solid #e9ecef",
                              borderRadius: "6px",
                              padding: "4px",
                            }}
                          />
                        )}
                        <div>
                          <h4 className="mb-1 fw-bold text-indigo">
                            {viewData.companyName}
                          </h4>
                          {viewData.companyCode && (
                            <p className="mb-1 small text-muted d-flex align-items-center gap-2">
                              Company Code:{" "}
                              <code>{viewData.companyCode}</code>
                            </p>
                          )}
                          <p className="mb-0 text-muted d-flex align-items-center gap-2">
                            <i className="bi bi-person-check"></i> Authorized:{" "}
                            <strong>{viewData.authorizedPerson}</strong>
                          </p>
                        </div>
                      </div>
                    </Col>
                  </Row>
                  {viewData.companyImage && (
                    <Row className="mb-4">
                      <Col md={12}>
                        <label className="small text-uppercase fw-bold text-muted mb-1">
                          Company Image
                        </label>
                        <div className="p-2 bg-light rounded-3 border text-center">
                          <img
                            src={resolveImageSrc(viewData.companyImage)}
                            alt="Company"
                            style={{
                              maxHeight: "240px",
                              maxWidth: "100%",
                              borderRadius: "4px",
                            }}
                          />
                        </div>
                      </Col>
                    </Row>
                  )}

                  <Row className="g-4">
                    <Col md={6}>
                      <div className="view-group">
                        <label className="small text-uppercase fw-bold text-muted mb-1">
                          Company Information
                        </label>
                        <div className="p-3 bg-light rounded-3 border">
                          <p className="mb-2">
                            <strong>Main Office:</strong> {viewData.mainOffice}
                          </p>
                          <p className="mb-2">
                            <strong>Year Established:</strong>{" "}
                            {viewData.yearStandUp}
                          </p>
                          <p className="mb-2">
                            <strong>Labours:</strong> {viewData.labours}
                          </p>
                          <p className="mb-0">
                            <strong>Branches:</strong> {viewData.branches}
                          </p>
                        </div>
                      </div>
                    </Col>

                    <Col md={6}>
                      <div className="view-group">
                        <label className="small text-uppercase fw-bold text-muted mb-1">
                          Contact Details
                        </label>
                        <div className="p-3 bg-light rounded-3 border">
                          <p className="mb-2">
                            <strong>Email:</strong> {viewData.mailId}
                          </p>
                          <p className="mb-2">
                            <strong>Mobile:</strong> {viewData.mobile}
                          </p>
                          <p className="mb-2">
                            <strong>Telephone:</strong>{" "}
                            {viewData.telephone || "N/A"}
                          </p>
                          <p className="mb-0">
                            <strong>Fax:</strong> {viewData.faxNumber || "N/A"}
                          </p>
                        </div>
                      </div>
                    </Col>

                    <Col md={12}>
                      <div className="view-group">
                        <label className="small text-uppercase fw-bold text-muted mb-1">
                          Location & Identity
                        </label>
                        <div className="p-3 bg-light rounded-3 border">
                          <p className="mb-2">
                            <strong>Address:</strong> {viewData.address}
                          </p>
                          <Row>
                            <Col md={6}>
                              <p className="mb-2">
                                <strong>Post Office:</strong>{" "}
                                {viewData.postOffice}
                              </p>
                            </Col>
                            <Col md={6}>
                              <p className="mb-2">
                                <strong>Website:</strong>{" "}
                                <a
                                  href={
                                    viewData.website?.startsWith("http")
                                      ? viewData.website
                                      : `https://${viewData.website}`
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {viewData.website}
                                </a>
                              </p>
                            </Col>
                            {/* Whitelisted Suppliers row hidden — feature
                                not currently used. Data still round-trips
                                through the DTO untouched. */}
                          </Row>
                        </div>
                      </div>
                    </Col>
                  </Row>
                </div>
              ) : (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading details...</span>
                  </div>
                </div>
              )}
            </Modal.Body>
            <Modal.Footer className="border-0">
              <Button
                variant="indigo"
                className="px-4 rounded-pill"
                onClick={closeModal}
              >
                Close
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
}
