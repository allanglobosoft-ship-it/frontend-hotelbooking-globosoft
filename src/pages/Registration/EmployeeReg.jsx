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
  FaSignInAlt,
  FaCreditCard,
  FaBan,
  FaArrowLeft,
} from "react-icons/fa";
import DashboardRedirections from "../../components/DashboardRedirections";

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

const EmployeeReg = () => {
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
    employeeCode: "",
    firstName: "",
    lastName: "",
    designation: "",
    profileImage: null,
    dob: "",
    contactDetails: {
      email: "",
      telexNumber: "",
      mobileNumber: "",
      faxNumber: "",
      address: "",
      zipcode: "",
    },
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState({});
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState("");
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRolesDropdown, setShowRolesDropdown] = useState(false);
  const [rolesList, setUserRolesList] = useState([]);
  const [loginModalKey, setLoginModalKey] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showRePassword, setShowRePassword] = useState(false);
  const [loginFormData, setLoginFormData] = useState({
    username: "",
    password: "",
    repassword: "",
    userroles: [], // Changed to array for multiple selection
  });
  const [loginErrors, setLoginErrors] = useState({
    username: "",
    password: "",
    repassword: "",
    userroles: "",
  });
  const [isUserRegistered, setIsUserRegistered] = useState(false);

  const [showApiDropdown, setShowApiDropdown] = useState(false);
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
      employeeCode: "",
      firstName: "",
      lastName: "",
      designation: "",
      profileImage: null,
      dob: "",
      contactDetails: {
        email: "",
        telexNumber: "",
        mobileNumber: "",
        faxNumber: "",
        address: "",
        zipcode: "",
      },
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
      employeeCode: item.employeeCode || "",
      firstName: item.firstName || "",
      lastName: item.lastName || "",
      designation: item.designation || "",
      profileImage: item.employeeProfile || null,
      dob: item.dob || "",
      // Map contact details from nested object
      email: item.contactDetails?.email || "",
      telexNumber: item.contactDetails?.telexNumber || "",
      mobileNumber: item.contactDetails?.mobileNumber || "",
      faxNumber: item.contactDetails?.faxNumber || "",
      address: item.contactDetails?.address || "",
      zipcode: item.contactDetails?.zipcode || "",
    
    });

    setValidationErrors({});
    setShowModal(true);
  };

  const userRolesList = async () => {
    try {
      const rolesRes = await axiosInstance.get("/api/userRoles");

      setUserRolesList(rolesRes.data);
    } catch (error) {
      console.log("User roles  api call error::", error);
    }
  };

  const handleEdit = async () => {
  const errors = validateEmployeeForm(formData);
  if (Object.keys(errors).length > 0) {
    setValidationErrors(errors);
    return;
  }

  if (!editing) return;

  try {
    setIsLoading(true);

    // Build JSON payload for backend (@RequestBody expects JSON)
    const payload = {
      employeeCode: formData.employeeCode,
      firstName: formData.firstName,
      lastName: formData.lastName,
      designation: formData.designation,
      dob: formData.dob || null, // keep yyyy-MM-dd format
      contactDetails: {
        email: formData.email,
        telexNumber: formData.telexNumber || "",
        mobileNumber: formData.mobileNumber,
        faxNumber: formData.faxNumber || "",
        address: formData.address,
        zipcode: formData.zipcode || "",
      },
    };

    console.log("Payload prepared for edit:", payload);

    const editRes = await axiosInstance.put(
      `/api/employee/${editing.employeeId}`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (editRes.data) {
      toast.success("Employee Updated Successfully!");
      setValidationErrors({});
      await fetchEmployeeList(page, search);
      closeModal();
    }
  } catch (error) {
    console.error("Edit employee error:", error);
    console.error("Error details:", error.response?.data);
    setError("Failed to update employee");
    toast.error(
      `Failed to update employee: ${
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
       employeeCode: "",
      firstName: "",
      lastName: "",
      designation: "",
      profileImage: null,
      dob: "",
      contactDetails: {
        email: "",
        telexNumber: "",
        mobileNumber: "",
        faxNumber: "",
        address: "",
        zipcode: "",
      },
    });
   
    setValidationErrors({});
    setError("");
  };

  const fetchEmployeeList = async (pageNum = 0, searchTerm = search) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "10",
      });

      if (searchTerm && searchTerm.trim()) {
        params.append("search", searchTerm.trim());
      }

      const res = await axiosInstance.get(`/api/employee?${params.toString()}`);

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
      toast.error("Failed to load employees");
      setItems([]);
      setTotalPages(0);
      setPage(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployeeList();
     userRolesList();
  }, []);

  // Close roles dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showRolesDropdown && !event.target.closest(".position-relative")) {
        setShowRolesDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showRolesDropdown]);

  // Close API dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showApiDropdown && !event.target.closest(".api-dropdown-container")) {
        setShowApiDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showApiDropdown]);

  // Validation function
  const validateEmployeeForm = (data) => {
    const newErrors = {};

    // Helper function to safely get string value
    const getStringValue = (value) => {
      return value ? String(value).trim() : "";
    };

    // Required field validations
    if (!getStringValue(data.employeeCode))
      newErrors.employeeCode = "Employee Code is required";
    if (!getStringValue(data.firstName))
      newErrors.firstName = "First Name is required";
    if (!getStringValue(data.lastName))
      newErrors.lastName = "Last Name is required";
    if (!getStringValue(data.designation))
      newErrors.designation = "Designation is required";
    if (!getStringValue(data.mobileNumber))
      newErrors.mobileNumber = "Mobile Number is required";
    if (!getStringValue(data.email))
      newErrors.email = "Email ID is required";
    if (!getStringValue(data.address))
      newErrors.address = "Address is required";
        // Additional format validations
    const emailValue = getStringValue(data.email);
    if (emailValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue))
      newErrors.email = "Invalid email format";

    const mobileValue = getStringValue(data.mobileNumber);
    if (mobileValue && !/^\+?\d{10,15}$/.test(mobileValue.replace(/\s/g, "")))
      newErrors.mobileNumber = "Mobile Number must be 10-15 digits";
    return newErrors;
  };

  const saveEmployee = async (e) => {
    e.preventDefault();
    const errors = validateEmployeeForm(formData);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors); 
      return;
    }

    try {
      setIsLoading(true);

      // Prepare FormData payload
      const formDataPayload = new FormData();
      
      // Add basic employee fields
      formDataPayload.append('employeeCode', formData.employeeCode);
      formDataPayload.append('firstName', formData.firstName);
      formDataPayload.append('lastName', formData.lastName);
      formDataPayload.append('designation', formData.designation);
      
      // Convert date from yyyy-MM-dd to dd/MM/yyyy format
      if (formData.dob) {
        const dateObj = new Date(formData.dob);
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        const formattedDate = `${day}/${month}/${year}`;
        formDataPayload.append('dob', formattedDate);
      }
      
      // Add contact details as individual fields (matching EmployeeContactDetailsDTO)
      formDataPayload.append('contactDetails.email', formData.email);
      formDataPayload.append('contactDetails.telexNumber', formData.telexNumber || '');
      formDataPayload.append('contactDetails.mobileNumber', formData.mobileNumber);
      formDataPayload.append('contactDetails.faxNumber', formData.faxNumber || '');
      formDataPayload.append('contactDetails.address', formData.address);
      formDataPayload.append('contactDetails.zipcode', formData.zipcode || '');
      
      // Add profile image if present
      if (formData.profileImage && formData.profileImage instanceof File) {
        formDataPayload.append('employeeProfile', formData.profileImage);
      }

      console.log("FormData payload prepared");
      const employeeSaveResponse = await axiosInstance.post(
        "/api/employee/register",
        formDataPayload,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      if (employeeSaveResponse.data !== 0) {
        toast.success("Employee added Successfully!");
        setValidationErrors({});
        await fetchEmployeeList(page, search);
        closeModal();
      }
    } catch (error) {
      console.error("Save employee error:", error);
      console.error("Error details:", error.response?.data);
      setError("Sorry! Data not saved to db..");
      toast.error(
        `Failed to save employee data: ${
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
      fetchEmployeeList(0, search);
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
    title: `Are you sure? You want to delete ${item.firstName} ${item.lastName}`,

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
          .delete(`/api/employee/${item.employeeId}`)
          .then(() => {
            toast.success("Employee deleted successfully");
            fetchEmployeeList(page, search);
          })
          .catch((error) => {
            toast.error(
              error.response?.data?.message || "Sorry!! Employee not deleted"
            );
          });
      }
    });
  };

  const handleView = async (item) => {
    setEditing(item);
    setIsViewMode(true); // Set to view mode

    // Set form data first - map from API response structure
    setFormData({
      employeeCode: item.employeeCode || "",
      firstName: item.firstName || "",
      lastName: item.lastName || "",
      designation: item.designation || "",
      profileImage: item.employeeProfile || null,
      dob: item.dob || "",
      // Map contact details from nested object
      email: item.contactDetails?.email || "",
      telexNumber: item.contactDetails?.telexNumber || "",
      mobileNumber: item.contactDetails?.mobileNumber || "",
      faxNumber: item.contactDetails?.faxNumber || "",
      address: item.contactDetails?.address || "",
      zipcode: item.contactDetails?.zipcode || "",
    
    });

    setValidationErrors({});
    setShowModal(true);
  };

  const handleLogin = async (item) => {
    setEditing(item);

    // Reset form data first
    setLoginFormData({
      username: "",
      password: "",
      repassword: "",
      userroles: [],
    });

    setLoginErrors({
      username: "",
      password: "",
      repassword: "",
      userroles: "",
    });

    setShowRolesDropdown(false);
    setShowPassword(false);
    setShowRePassword(false);

    // Fetch existing login data for this employee
    try {
      // Scope the check to the STAFF user type so entities of other types that
      // share the same numeric id don't resolve to this employee's account.
      const staffRole = rolesList.find((r) => r.roleName === "STAFF");
      const response = await axiosInstance.post(
        staffRole
          ? `/auth/checkRegisteredUserExist/${item.employeeId}?userTypeId=${staffRole.id}`
          : `/auth/checkRegisteredUserExist/${item.employeeId}`
      );

      if (response.data) {
        // User is registered, populate form with existing data
        setIsUserRegistered(true);
        const userNameValue =
          response.data.userName || response.data.username || "";
        // Populate form with existing data
        setLoginFormData({
          username: userNameValue, // actual username
          password: "", // don't set this from username
          repassword: "", // same here
          userroles: [], // fetch separately if needed
        });
      } else {
        console.log("No existing login data found for employee:", item.employeeId);
        setIsUserRegistered(false);
      }
    } catch (error) {
      console.log("Error fetching login data:", error);
      
      // Check if the error is "User is not Registered"
      if (error.response?.data?.message?.includes("User is not Registered")) {
        setIsUserRegistered(false);
        console.log("User is not registered, showing registration form");
      } else {
        // For other errors, assume user is not registered
        setIsUserRegistered(false);
        console.log("Assuming user is not registered due to error");
      }
    }

    // Force modal re-render with new key
    setLoginModalKey((prev) => prev + 1);

    // Show modal
    setShowLoginModal(true);
    console.log("Modal opened with data loaded");
  };

  const handleLoginSubmit = async () => {

   
    let isValid = true;
    const errors = {
      username: "",
      password: "",
      repassword: "",
      userroles: "",
    };

    if (!loginFormData.username.trim()) {
      errors.username = "Username is required";
      isValid = false;
    } else if (loginFormData.username.length < 4) {
      errors.username = "Username must be at least 4 characters long";
      isValid = false;
    } else if (!/^[a-zA-Z0-9_]+$/.test(loginFormData.username)) {
      errors.username =
        "Username can only contain letters, numbers, and underscores";
      isValid = false;
    }

    if (!loginFormData.password) {
      errors.password = "Password is required";
      isValid = false;
    } else if (loginFormData.password.length < 8) {
      errors.password = "Password must be at least 8 characters long";
      isValid = false;
    } else if (!/(?=.*[A-Z])(?=.*[0-9])/.test(loginFormData.password)) {
      errors.password =
        "Password must contain at least one uppercase letter and one number";
      isValid = false;
    }

    if (!loginFormData.repassword) {
      errors.repassword = "Please confirm your password";
      isValid = false;
    } else if (loginFormData.password !== loginFormData.repassword) {
      errors.repassword = "Passwords do not match";
      isValid = false;
    }

    if (!loginFormData.userroles || loginFormData.userroles.length === 0) {
      errors.userroles = "At least one user role is required";
      isValid = false;
    }

    setLoginErrors(errors);
    console.log("isValid" , isValid)

    if (isValid) {
      try {
        setIsLoading(true);

        let activeUserRole = localStorage.getItem("currentActiveRole");
         console.log("activeUserRole::" , activeUserRole)

        let activeRoleObj = rolesList.find((role) => role.roleName === "STAFF");
        console.log("activeRoleObj::" , activeRoleObj)

        let loginPayload = null;

        if (activeRoleObj) {
          loginPayload = {
            userId: editing.employeeId,
            userTypeId: activeRoleObj.id,
            userName: loginFormData.username,
            userRoleIds: loginFormData.userroles,
          };

          if (loginFormData.password) {
            loginPayload.password = loginFormData.password;
          }
        } else {
          console.log("Active role not found in rolesList");
        }

        console.log("login payload::" , loginPayload)

        const response = await axiosInstance.post(
          "/auth/register",
          loginPayload
        );
        console.log("login register success::", response);

        if (response.data) {
          toast.success(
            isUserRegistered 
              ? "Login credentials updated successfully!" 
              : "Login credentials created successfully!"
          );
          setLoginErrors({});
          closeLoginModal();
          await fetchEmployeeList(page, search);
        } else {
          toast.error(
            "Something went wrong!!Failed to save login credentials."
          );
        }
      } catch (error) {
        console.error("Login submission failed:", error);
        toast.error(
          `Failed to save login credentials: ${
            error.response?.data?.message || error.message
          }`
        );
      } finally {
        setIsLoading(false);
      }
    } else {
      toast.error(errors.username || errors.password || errors.repassword);
    }
  };

  const handleLoginChange = (e) => {
    const { name, value } = e.target;

    // Map the new field names back to the original state properties
    let fieldName = name;
    if (name === "login-username") fieldName = "username";
    else if (name === "login-password") fieldName = "password";
    else if (name === "login-repassword") fieldName = "repassword";

    setLoginFormData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const toggleRole = (roleId) => {
    setLoginFormData((prev) => ({
      ...prev,
      userroles: prev.userroles.includes(roleId)
        ? prev.userroles.filter((id) => id !== roleId)
        : [...prev.userroles, roleId],
    }));

    // Close dropdown after selecting a role
    setShowRolesDropdown(false);
  };

  const removeRole = (roleId) => {
    setLoginFormData((prev) => ({
      ...prev,
      userroles: prev.userroles.filter((id) => id !== roleId),
    }));
  };

  // Toggle password visibility
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const toggleRePasswordVisibility = () => {
    setShowRePassword(!showRePassword);
  };

  const closeLoginModal = () => {
    setShowLoginModal(false);
    setShowRolesDropdown(false);
    setShowPassword(false);
    setShowRePassword(false);
    setLoginModalKey((prev) => prev + 1); // Reset modal key
    setIsUserRegistered(false); // Reset registration status
    setLoginFormData({
      username: "",
      password: "",
      repassword: "",
      userroles: [],
    });
    setLoginErrors({
      username: "",
      password: "",
      repassword: "",
      userroles: "",
    });
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
            <Card.Header className="d-flex justify-content-between align-items-center">
              <span className="fw-semibold">Employee</span>
              <Form.Group className="hotel-search-bar position-relative">
                <Form.Control
                  type="text"
                  placeholder="Search employee by name..."
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
                    <th>Employee Code</th>
                    <th>First Name</th>
                    <th>Last Name</th>
                    <th>Mail Id</th>
                    <th style={{ width: 160 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1 + page * 10}</td>
                      <td>{item.employeeCode}</td>
                      <td>{item.firstName}</td>
                      <td>{item.lastName}</td>
                      <td>{item.email}</td>
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
                          <FaSignInAlt
                            className="text-success login"
                            style={{ cursor: "pointer", fontSize: "18px" }}
                            onClick={() => handleLogin(item)}
                            title="Login"
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
                        Loading available employees...
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={4} className="text-center text-muted py-4">
                        No employees found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>

              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center p-3 border-top">
                  <div>
                    <small className="text-muted">
                      Showing {items.length} of {totalPages * 10} employees
                    </small>
                  </div>
                  <div>
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={page === 0}
                        onClick={() => fetchEmployeeList(page - 1, search)}
                      />
                      {[...Array(totalPages).keys()].map((num) => (
                        <Pagination.Item
                          key={num}
                          active={num === page}
                          onClick={() => fetchEmployeeList(num, search)}
                        >
                          {num + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={page === totalPages - 1}
                        onClick={() => fetchEmployeeList(page + 1, search)}
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
              className={isViewMode ? "border-bottom light-modal-header" : ""}
              style={
                isViewMode ? { backgroundColor: "#f1f3f5" } : undefined
              }
            >
              <Modal.Title
                className={
                  isViewMode ? "text-dark fw-semibold" : ""
                }
              >
                {isViewMode
                  ? "Employee Details"
                  : editing
                  ? "Update Employee"
                  : "Create Employee"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body
              className={isViewMode ? "bg-white py-3" : ""}
            >
              {isViewMode ? (
                (() => {
                  // ── Read-only view layout, matched to the standard
                  //    "Booking Details" screenshot (light-shade section
                  //    headers with two-column key/value rows). Keeps
                  //    the existing modal/handlers untouched. */}
                  const SectionHeader = ({ children }) => (
                    <div
                      className="px-3 py-2 fw-semibold text-dark border rounded-top"
                      style={{ backgroundColor: "#f1f3f5" }}
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
                      <Col xs={7} md={8} className="fw-semibold text-dark">
                        {value || "—"}
                      </Col>
                    </Row>
                  );

                  // Profile image preview — handle both a string URL
                  // (existing record) and a freshly-picked File object.
                  let profilePreview = null;
                  if (formData.profileImage) {
                    if (typeof formData.profileImage === "string") {
                      profilePreview = formData.profileImage;
                    } else if (formData.profileImage instanceof File) {
                      profilePreview = URL.createObjectURL(formData.profileImage);
                    }
                  }

                  return (
                    <>
                      <SectionHeader>Employee Information</SectionHeader>
                      <SectionBody>
                        <Row className="g-3">
                          <Col md={6}>
                            <KV
                              label="Employee Code"
                              value={formData.employeeCode}
                            />
                            <KV
                              label="First Name"
                              value={formData.firstName}
                            />
                            <KV
                              label="Last Name"
                              value={formData.lastName}
                            />
                            <KV
                              label="Designation"
                              value={formData.designation}
                            />
                            <KV
                              label="Date of Birth"
                              value={formData.dob}
                            />
                          </Col>
                          <Col md={6} className="text-center text-md-start">
                            <div className="text-muted small mb-2">
                              Profile Image
                            </div>
                            {profilePreview ? (
                              <img
                                src={profilePreview}
                                alt="Employee"
                                style={{
                                  maxWidth: "160px",
                                  maxHeight: "160px",
                                  objectFit: "cover",
                                  border: "1px solid #ddd",
                                  borderRadius: "6px",
                                }}
                              />
                            ) : (
                              <div className="text-muted small">—</div>
                            )}
                          </Col>
                        </Row>
                      </SectionBody>

                      <SectionHeader>Contact Information</SectionHeader>
                      <SectionBody>
                        <Row className="g-3">
                          <Col md={6}>
                            <KV label="Email" value={formData.email} />
                            <KV
                              label="Mobile Number"
                              value={formData.mobileNumber}
                            />
                            <KV
                              label="Telephone Number"
                              value={formData.telexNumber}
                            />
                          </Col>
                          <Col md={6}>
                            <KV
                              label="Fax Number"
                              value={formData.faxNumber}
                            />
                            <KV label="Zip Code" value={formData.zipcode} />
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
                  <Card.Header>Employee Details</Card.Header>
                  <Card.Body>
                    <Row>
                      <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>Employee Code <span className="text-danger">*</span></Form.Label>
                          <Form.Control
                            value={formData.employeeCode}
                            placeholder="Enter Employee name"
                            isInvalid={!!validationErrors.employeeCode}
                            {...getFormControlProps(
                              "employeeCode",
                              (e) => {
                                setFormData({
                                  ...formData,
                                  employeeCode: e.target.value,
                                });
                                // Clear validation error when user starts typing
                                if (validationErrors.employeeCode) {
                                  setValidationErrors(prev => ({
                                    ...prev,
                                    employeeCode: ""
                                  }));
                                }
                              },
                              {
                                className: `form-input ${
                                  validationErrors.employeeCode
                                    ? "is-invalid"
                                    : ""
                                }`,
                                autoFocus: true,
                              }
                            )}
                          />
                          {validationErrors.employeeCode && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.employeeCode}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                      </Col>
                       <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>First Name <span className="text-danger">*</span></Form.Label>
                          <Form.Control
                            value={formData.firstName}
                            placeholder="Enter first name"
                            isInvalid={!!validationErrors.firstName}
                            {...getFormControlProps(
                              "firstName",
                              (e) => {
                                setFormData({
                                  ...formData,
                                  firstName: e.target.value,
                                });
                                // Clear validation error when user starts typing
                                if (validationErrors.firstName) {
                                  setValidationErrors(prev => ({
                                    ...prev,
                                    firstName: ""
                                  }));
                                }
                              },
                              {
                                className: `form-input ${
                                  validationErrors.firstName ? "is-invalid" : ""
                                }`,
                              }
                            )}
                          />
                          {validationErrors.firstName && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.firstName}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>Last Name <span className="text-danger">*</span></Form.Label>
                          <Form.Control
                            value={formData.lastName}
                            placeholder="Enter last name"
                            isInvalid={!!validationErrors.lastName}
                            {...getFormControlProps(
                              "lastName",
                              (e) => {
                                setFormData({
                                  ...formData,
                                  lastName: e.target.value,
                                });
                                // Clear validation error when user starts typing
                                if (validationErrors.lastName) {
                                  setValidationErrors(prev => ({
                                    ...prev,
                                    lastName: ""
                                  }));
                                }
                              },
                              {
                                className: `form-input ${
                                  validationErrors.lastName ? "is-invalid" : ""
                                }`,
                              }
                            )}
                          />
                          {validationErrors.lastName && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.lastName}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                      </Col>
                    </Row>
                    <Row>
                      <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>Designation <span className="text-danger">*</span></Form.Label>
                          <Form.Control
                            value={formData.designation}
                            placeholder="Enter designation"
                            isInvalid={!!validationErrors.designation}
                            {...getFormControlProps(
                              "designation",
                              (e) => {
                                setFormData({
                                  ...formData,
                                  designation: e.target.value,
                                });
                                // Clear validation error when user starts typing
                                if (validationErrors.designation) {
                                  setValidationErrors(prev => ({
                                    ...prev,
                                    designation: ""
                                  }));
                                }
                              },
                              {
                                className: `form-input ${
                                  validationErrors.designation
                                    ? "is-invalid"
                                    : ""
                                }`,
                              }
                            )}
                          />
                          {validationErrors.designation && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.designation}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                      </Col>
                      
                      <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>Profile Image</Form.Label>
                          <Form.Control
                            type="file"
                            accept="image/*"
                            onChange={
                              isViewMode
                                ? undefined
                                : (e) =>
                                    setFormData({
                                      ...formData,
                                      profileImage: e.target.files[0],
                                    })
                            }
                            disabled={isViewMode}
                            className={isViewMode ? "bg-light" : ""}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>Date of Birth</Form.Label>
                          <Form.Control
                            type="date"
                            value={formData.dob}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                dob: e.target.value,
                              })
                            }
                            isInvalid={!!validationErrors.dob}
                            className={`form-input ${
                              validationErrors.dob ? "is-invalid" : ""
                            }`}
                          />
                          {validationErrors.dob && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.dob}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>

                <Row>
                  <Col md={12}>
                    <Card className="mb-3">
                      <Card.Header>Contact Details</Card.Header>
                      <Card.Body>
                        <Row>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>Employee Email <span className="text-danger">*</span></Form.Label>
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
                                      validationErrors.email ? "is-invalid" : ""
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
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>Zip Code</Form.Label>
                              <Form.Control
                                value={formData.zipcode}
                                placeholder="Enter zip code"
                                {...getFormControlProps(
                                  "zipcode",
                                  (e) =>
                                    setFormData({
                                      ...formData,
                                      zipcode: e.target.value,
                                    }),
                                  {}
                                )}
                              />
                            </Form.Group>
                          </Col>
                        </Row>

                        <Row>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>Mobile Number <span className="text-danger">*</span></Form.Label>
                              <Form.Control
                                value={formData.mobileNumber}
                                placeholder="Enter mobile number"
                                isInvalid={!!validationErrors.mobileNumber}
                                {...getFormControlProps(
                                  "mobileNumber",
                                  (e) => {
                                    setFormData({
                                      ...formData,
                                      mobileNumber: e.target.value,
                                    });
                                    // Clear validation error when user starts typing
                                    if (validationErrors.mobileNumber) {
                                      setValidationErrors(prev => ({
                                        ...prev,
                                        mobileNumber: ""
                                      }));
                                    }
                                  },
                                  {
                                    className: `form-input ${
                                      validationErrors.mobileNumber
                                        ? "is-invalid"
                                        : ""
                                    }`,
                                  }
                                )}
                              />

                              {validationErrors.mobileNumber && (
                                <Form.Control.Feedback type="invalid">
                                  {validationErrors.mobileNumber}
                                </Form.Control.Feedback>
                              )}
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>Fax Number</Form.Label>
                              <Form.Control
                                value={formData.faxNumber}
                                placeholder="Enter fax number"
                                {...getFormControlProps(
                                  "faxNumber",
                                  (e) =>
                                    setFormData({
                                      ...formData,
                                      faxNumber: e.target.value,
                                    }),
                                  {}
                                )}
                              />
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>Telephone Number</Form.Label>
                              <Form.Control
                                value={formData.telexNumber}
                                placeholder="Enter telephone number"
                                {...getFormControlProps(
                                  "telexNumber",
                                  (e) =>
                                    setFormData({
                                      ...formData,
                                      telexNumber: e.target.value,
                                    }),
                                  {}
                                )}
                              />
                            </Form.Group>
                          </Col>
                        </Row>
                        <Row></Row>

                        <Col md={12}>
                          <Form.Group className="mb-3">
                            <Form.Label>Address <span className="text-danger">*</span></Form.Label>
                            <Form.Control
                              as="textarea"
                              rows={3}
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
                                    validationErrors.address ? "is-invalid" : ""
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
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
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
                  onClick={editing ? handleEdit : saveEmployee}
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

          <Modal
            show={showLoginModal}
            onHide={closeLoginModal}
            centered
            key={loginModalKey}
          >
            <Modal.Header closeButton>
              <Modal.Title>
                {isUserRegistered 
                  ? "Edit user registration details"
                  : "New user? Register here"
                }
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {isUserRegistered && (
                <div className="alert alert-info mb-3">
                  <small>
                    <i className="fas fa-info-circle me-2"></i>
                    Existing login credentials found. You can update the
                    username and password.
                  </small>
                </div>
              )}
              {!isUserRegistered && (
                <div className="alert alert-warning mb-3">
                  <small>
                    <i className="fas fa-exclamation-triangle me-2"></i>
                    This employee is not registered yet. Please create login credentials.
                  </small>
                </div>
              )}
              <Form className="loginForm">
                <Form.Group className="mb-3">
                  <Form.Label>Username</Form.Label>
                  <Form.Control
                    type="text"
                    name="login-username"
                    value={loginFormData.username}
                    onChange={handleLoginChange}
                    isInvalid={!!loginErrors.username}
                    placeholder="Enter username"
                    autoComplete="new-password"
                    autoFill="off"
                  />

                  <Form.Control.Feedback type="invalid">
                    {loginErrors.username}
                  </Form.Control.Feedback>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Password</Form.Label>
                  <div className="position-relative">
                    <Form.Control
                      type={showPassword ? "text" : "password"}
                      name="login-password"
                      value={loginFormData.password}
                      onChange={handleLoginChange}
                      isInvalid={!!loginErrors.password}
                      placeholder="Enter password"
                      autoComplete="new-password"
                      autoFill="off"
                      style={{ paddingRight: "40px" }}
                    />
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
                      onClick={togglePasswordVisibility}
                    >
                      {showPassword ? (
                        <i className="fas fa-eye-slash"></i>
                      ) : (
                        <i className="fas fa-eye"></i>
                      )}
                    </button>
                  </div>
                  <Form.Control.Feedback type="invalid">
                    {loginErrors.password}
                  </Form.Control.Feedback>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Re-enter Password</Form.Label>
                  <div className="position-relative">
                    <Form.Control
                      type={showRePassword ? "text" : "password"}
                      name="login-repassword"
                      value={loginFormData.repassword}
                      onChange={handleLoginChange}
                      isInvalid={!!loginErrors.repassword}
                      placeholder="Re-enter password"
                      autoComplete="new-password"
                      autoFill="off"
                      style={{ paddingRight: "40px" }}
                    />
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
                      onClick={toggleRePasswordVisibility}
                    >
                      {showRePassword ? (
                        <i className="fas fa-eye-slash"></i>
                      ) : (
                        <i className="fas fa-eye"></i>
                      )}
                    </button>
                  </div>
                  <Form.Control.Feedback type="invalid">
                    {loginErrors.repassword}
                  </Form.Control.Feedback>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>User Roles</Form.Label>
                  <div className="position-relative">
                    <div
                      className="form-control d-flex flex-wrap align-items-center"
                      style={{
                        minHeight: "38px",
                        padding: "4px 8px",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setShowRolesDropdown(!showRolesDropdown);
                      }}
                    >

                        {console.log("rolesList length:::", rolesList.length)}
                      {loginFormData.userroles.length > 0 ? (
                        loginFormData.userroles.map((roleId) => {
                          const role = rolesList.find((r) => r.id === roleId);
                          return role ? (
                            <span
                              key={roleId}
                              className="badge bg-primary me-1 mb-1 d-flex align-items-center"
                              style={{ fontSize: "12px" }}
                            >
                              {role.roleName}
                              <button
                                type="button"
                                className="btn-close btn-close-white ms-1"
                                style={{ fontSize: "8px" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeRole(roleId);
                                }}
                              ></button>
                            </span>
                          ) : null;
                        })
                      ) : (
                        <span className="text-muted">Select roles...</span>
                      )}
                    </div>

                    {showRolesDropdown && (
                      <div
                        className="position-absolute w-100 bg-white border rounded shadow-lg"
                        style={{
                          bottom: "100%",
                          left: 0,
                          zIndex: 9999,
                          maxHeight: "200px",
                          overflowY: "auto",
                          minHeight: "120px",
                          border: "2px solid #007bff",
                          boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                          marginBottom: "2px",
                        }}
                      >
                        {rolesList.map((role) => {
                          const isSelected = loginFormData.userroles.includes(
                            role.id
                          );
                          return (
                            <div
                              key={role.id}
                              className={`px-3 py-2 ${
                                isSelected ? "bg-light text-muted" : ""
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRole(role.id);
                              }}
                              style={{
                                cursor: "pointer",
                                borderBottom: "1px solid #eee",
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) {
                                  e.target.style.backgroundColor = "#f8f9fa";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) {
                                  e.target.style.backgroundColor = "";
                                }
                              }}
                            >
                              {role.roleName}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {/* <Form.Text className="text-muted">
                    Click to select multiple roles (Dropdown state: {showRolesDropdown ? 'Open' : 'Closed'})
                  </Form.Text> */}
                  {loginErrors.userroles && (
                    <div className="text-danger small mt-1">
                      {loginErrors.userroles}
                    </div>
                  )}
                </Form.Group>
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={closeLoginModal}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleLoginSubmit}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    Saving...
                  </>
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
};

export default EmployeeReg;
