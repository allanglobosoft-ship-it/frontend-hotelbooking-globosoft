import React, { useEffect, useState, useRef } from "react";
import { Card, Button, Table, Modal, Form, Row, Col, Spinner, InputGroup } from "react-bootstrap";
import Sidebar from "../../../components/Sidebar";
import Topbar from "../../../components/TopBar";
import axiosInstance from "../../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEdit, FaTrash, FaPlus, FaSearch, FaChevronDown, FaUndo, FaTimes, FaCheck, FaSignInAlt, FaCreditCard, FaEye, FaEyeSlash, FaToggleOn, FaToggleOff } from "react-icons/fa";
import { formatDateTimeDisplay } from "../../../utils/dateUtils";
import AgentSelect from "../../../components/AgentSelect";

// Searchable Select Component for large lists
const SearchableSelect = ({ label, name, value, options, onChange, placeholder, onSearch, isLoading, error, required }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (option) => {
    onChange({ target: { name, value: option.id } });
    setIsOpen(false);
    setSearchTerm("");
  };

  const selectedOption = options.find(opt => String(opt.id) === String(value));

  return (
    <Form.Group className="mb-3" ref={dropdownRef}>
      <Form.Label className="small fw-bold">{required && <span className="text-danger">* </span>}{label}</Form.Label>
      <div className="position-relative">
        <div 
          className={`form-select ${error ? 'is-invalid' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
          style={{ 
            cursor: 'pointer', 
            fontSize: '0.85rem',
            minHeight: '35px',
            backgroundColor: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingRight: '2rem',
            backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\'%3e%3cpath fill=\'none\' stroke=\'%23343a40\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'m2 5 6 6 6-6\'/%3e%3c/svg%3e")', 
            backgroundRepeat: 'no-repeat', 
            backgroundPosition: 'right .75rem center', 
            backgroundSize: '12px 9px'
          }}
        >
          <span className={selectedOption ? "" : "text-muted"}>
            {selectedOption ? (selectedOption.name || selectedOption.stateName || selectedOption.cityName) : "SELECT"}
          </span>
        </div>
        {error && <div className="invalid-feedback d-block" style={{ fontSize: '0.7rem' }}>{error}</div>}
        
        {isOpen && (
          <div className="position-absolute w-100 bg-white shadow-lg rounded-2 border mt-1" style={{ zIndex: 1050, maxHeight: '200px', overflowY: 'auto' }}>
            <div className="p-2 border-bottom sticky-top bg-white">
              <Form.Control
                size="sm"
                autoFocus
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  if (onSearch) onSearch(e.target.value);
                }}
              />
            </div>
            <div className="py-1">
              {isLoading ? (
                <div className="text-center py-2"><Spinner animation="border" size="sm" /></div>
              ) : options.length > 0 ? (
                options.map(opt => (
                  <div 
                    key={opt.id} 
                    className="px-3 py-1 cursor-pointer hover-bg-light"
                    style={{ cursor: 'pointer', fontSize: '0.85rem' }}
                    onClick={() => handleSelect(opt)}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                  >
                    {opt.name || opt.stateName || opt.cityName}
                  </div>
                ))
              ) : (
                <div className="px-3 py-1 text-muted small text-center">No options found</div>
              )}
            </div>
          </div>
        )}
      </div>
    </Form.Group>
  );
};

// Build the Markup Type dropdown label. The /api/markupType master returns
// { name, markup, markupType } where markupType is "Percent" | "Amount", so
// "Gold" (markup 6, Percent) renders as "Gold - 6%" and an Amount type like
// "Discovery" (markup 1) as "Discovery - 1". Falls back to just the name when
// the markup value is missing.
const formatMarkupOption = (m) => {
  if (!m) return "";
  const value = m.markup;
  if (value === null || value === undefined || String(value).trim() === "") {
    return m.name || "";
  }
  const isPercent = String(m.markupType || "").toLowerCase() === "percent";
  return `${m.name || ""} - ${value}${isPercent ? "%" : ""}`;
};

const sortMarkupTypesByPercentage = (items = []) => {
  return [...items].sort((a, b) => {
    const aMarkup = Number(a?.markup);
    const bMarkup = Number(b?.markup);
    const aValue = Number.isFinite(aMarkup) ? aMarkup : Number.POSITIVE_INFINITY;
    const bValue = Number.isFinite(bMarkup) ? bMarkup : Number.POSITIVE_INFINITY;

    if (aValue !== bValue) return aValue - bValue;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });
};

// The Login Details modal only offers the SUB_AGENT role (see the dropdown
// below). Match it tolerantly — trim, upper-case, and treat spaces / hyphens
// as underscores — so a row saved as "Sub Agent" or "SUB-AGENT" through the
// User Roles master still resolves instead of leaving the dropdown empty.
const normalizeRoleName = (name) =>
  String(name || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
const isSubAgentRole = (role) => normalizeRoleName(role?.roleName) === "SUB_AGENT";

export default function SubAgent() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Master Data States
  const [categories, setCategories] = useState([]);
  const [countries, setCountries] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [places, setPlaces] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [markupTypes, setMarkupTypes] = useState([]);
  // Main-agent options for the owner picker — only fetched for admin/staff.
  const [agents, setAgents] = useState([]);
  // The logged-in MAIN agent's currency. A sub-agent must inherit it and
  // cannot pick a different one, so the Currency field is locked to this
  // single value. Resolved once on mount (personalProfile -> own agent id ->
  // /api/agent/{id}); stays null (field shows a placeholder) if it can't be
  // resolved. Shape: { id, code }.
  const [mainAgentCurrency, setMainAgentCurrency] = useState(null);
  
  const [isDataLoading, setIsDataLoading] = useState({
    countries: false,
    provinces: false,
    places: false
  });

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRolesDropdown, setShowRolesDropdown] = useState(false);
  const [rolesList, setRolesList] = useState([]);
  const [loginModalKey, setLoginModalKey] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showRePassword, setShowRePassword] = useState(false);
  const [loginFormData, setLoginFormData] = useState({
    username: "",
    password: "",
    repassword: "",
    userroles: [],
  });
  const [loginErrors, setLoginErrors] = useState({
    username: "",
    password: "",
    repassword: "",
    userroles: "",
  });

  // ─── Credit Limit modal state ───────────────────────────────────────────────
  // Mirrors the Manage Credit Limit modal on registration/agent/view/{id}
  // (AgentView.jsx) so both screens behave identically. The only difference is
  // the endpoint family: a sub-agent's credit lives in its own
  // /api/sub-agent-credit-limit/* tables, because sub_agent_register ids and
  // agent ids are unrelated sequences.
  const [showCreditLimitModal, setShowCreditLimitModal] = useState(false);
  const [creditLimitType, setCreditLimitType] = useState("initial");
  // Update Credit Limit — whether the entered amount is added to or subtracted
  // from the current total. The amount field always takes a positive number;
  // this flips its sign before it's sent as additionalCredit.
  const [creditAdjustDirection, setCreditAdjustDirection] = useState("add");
  const [hasInitialCredit, setHasInitialCredit] = useState(false);
  const [creditRowExists, setCreditRowExists] = useState(false);
  const [creditLimitFormData, setCreditLimitFormData] = useState({
    addCreditLimit: "",
    remarks: "",
    totalCreditLimit: "0",
    availableCreditLimit: "0",
    usedCreditLimit: "0",
    // "Paid Through" dropdown.
    paymentMode: "",
  });
  const [creditLimitErrors, setCreditLimitErrors] = useState({
    addCreditLimit: "",
    remarks: "",
  });

  // ─── Temporary Credit Limit state (extends the Credit Limit modal) ──────────
  const [tempCredits, setTempCredits] = useState([]);
  const [tempCreditsLoading, setTempCreditsLoading] = useState(false);
  const [showTempCreditForm, setShowTempCreditForm] = useState(false);
  const [editingTempCreditId, setEditingTempCreditId] = useState(null);
  const [tempCreditTogglingId, setTempCreditTogglingId] = useState(null);
  const [tempCreditFormData, setTempCreditFormData] = useState({
    amount: "",
    startDateTime: "",
    endDateTime: "",
    remarks: "",
  });
  const [tempCreditErrors, setTempCreditErrors] = useState({});
  const [tempCreditSaving, setTempCreditSaving] = useState(false);

  const initialFormState = {
    businessType: "",
    agentCategoryId: "",
    companyName: "",
    firstName: "",
    lastName: "",
    countryId: "",
    provinceId: "",
    placeId: "",
    personalEmail: "",
    mobileNumber: "",
    address: "",
    companyCode: "",
    zipCode: "",
    contactPerson: "",
    markup: "",
    currency: "",
    status: "Active",
    faxNumber: "",
    telephoneNumber: "",
    // Owning main agent. Only filled in (and only shown) for admin/staff
    // logins — see isAgentLogin below.
    mainAgentId: ""
  };

  const mainAgentName = localStorage.getItem("UserName") || "";

  // A sub agent always belongs to a main agent. An AGENT login owns the sub
  // agents it creates, so the backend resolves the parent from the JWT and the
  // form hides the field. An ADMIN / STAFF login has no agent identity of its
  // own (an admin's user_accounts.user_id is null), so it must pick the parent
  // explicitly — without it the backend cannot resolve an owner at all.
  // Role resolution mirrors Sidebar.jsx.
  const storedRoles = (localStorage.getItem("userRole") || "")
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  const activeRole =
    (localStorage.getItem("currentActiveRole") || "").toLowerCase() ||
    storedRoles[0] ||
    "";
  const isAgentLogin = activeRole === "agent";

  const [formData, setFormData] = useState(initialFormState);
  const [validationErrors, setValidationErrors] = useState({});

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const fetchSubAgents = async () => {
    setIsLoading(true);
    try {
      const res = await axiosInstance.get("/api/sub-agent/my-sub-agents");
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error("Failed to load sub agents");
    } finally {
      setIsLoading(false);
    }
  };

  const searchTimeoutRef = useRef(null);
  const fetchCountries = async (search = "") => {
    setIsDataLoading(prev => ({ ...prev, countries: true }));
    try {
      const res = await axiosInstance.get(`/api/country?page=0&limit=50&search=${encodeURIComponent(search)}`);
      setCountries(res.data || []);
    } catch (err) {
      console.error("Error fetching countries", err);
    } finally {
      setIsDataLoading(prev => ({ ...prev, countries: false }));
    }
  };

  const handleCountrySearch = (val) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchCountries(val);
    }, 500);
  };

  const fetchProvinces = async (countryId) => {
    if (!countryId) return;
    setIsDataLoading(prev => ({ ...prev, provinces: true }));
    try {
      const res = await axiosInstance.get(`/api/province/getByCountryId/${countryId}`);
      setProvinces(res.data || []);
    } catch (err) {
      console.error("Error fetching provinces", err);
    } finally {
      setIsDataLoading(prev => ({ ...prev, provinces: false }));
    }
  };

  const fetchPlaces = async (provinceId) => {
    if (!provinceId) return;
    setIsDataLoading(prev => ({ ...prev, places: true }));
    try {
      const res = await axiosInstance.get(`/api/destination/getplaces/${provinceId}`);
      setPlaces(res.data || []);
    } catch (err) {
      console.error("Error fetching places", err);
    } finally {
      setIsDataLoading(prev => ({ ...prev, places: false }));
    }
  };

  const fetchInitialMasterData = async () => {
    try {
      const [catRes, currRes, markupRes, rolesRes] = await Promise.all([
        axiosInstance.get("/api/agentCategory"),
        axiosInstance.get("/api/currency"),
        axiosInstance.get("/api/markupType"),
        axiosInstance.get("/api/userRoles")
      ]);
      setCategories(catRes.data || []);
      setCurrencies(currRes.data || []);
      setMarkupTypes(sortMarkupTypesByPercentage(Array.isArray(markupRes.data) ? markupRes.data : []));
      setRolesList(rolesRes.data || []);
      fetchCountries("");
    } catch (err) {
      console.error("Error fetching initial master data", err);
    }
  };

  // Returns the roles master, re-fetching it when the mount-time load left
  // it empty. Keeps state in sync so the dropdown re-renders with the list.
  const ensureRolesLoaded = async () => {
    if (rolesList.length > 0) return rolesList;
    try {
      const res = await axiosInstance.get("/api/userRoles");
      const list = Array.isArray(res.data) ? res.data : [];
      setRolesList(list);
      return list;
    } catch (err) {
      return rolesList;
    }
  };

  // Main agents to choose an owner from. Only an admin/staff login needs this —
  // an agent login is always its own sub agents' parent.
  const fetchAgents = async () => {
    try {
      const res = await axiosInstance.get("/api/agent");
      setAgents(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error fetching agents", err);
      setAgents([]);
    }
  };

  // Resolve the logged-in main agent's currency so the sub-agent Currency
  // field can be locked to it. Best-effort: any failure leaves the field
  // empty rather than blocking registration (currency is optional on submit).
  const resolveMainAgentCurrency = async () => {
    try {
      const uname = localStorage.getItem("UserName");
      if (!uname) return;
      const prof = await axiosInstance.get(`/api/personalProfile/${uname}`);
      const agentId = prof?.data?.id;
      if (agentId == null) return;
      const agentRes = await axiosInstance.get(`/api/agent/${agentId}`);
      const currId = agentRes?.data?.currency;
      if (currId == null) return;
      setMainAgentCurrency({ id: currId, code: agentRes?.data?.currencyCode || "" });
    } catch (err) {
      console.error("Could not resolve main agent currency", err);
    }
  };

  useEffect(() => {
    fetchSubAgents();
    fetchInitialMasterData();
    resolveMainAgentCurrency();
    if (!isAgentLogin) fetchAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the form's currency pinned to the main agent's currency once it
  // resolves — the sub-agent inherits it and the field is not editable.
  useEffect(() => {
    if (mainAgentCurrency?.id != null) {
      setFormData((prev) => ({ ...prev, currency: String(mainAgentCurrency.id) }));
    }
  }, [mainAgentCurrency]);

  useEffect(() => {
    if (formData.countryId) {
      fetchProvinces(formData.countryId);
    } else {
      setProvinces([]);
    }
  }, [formData.countryId]);

  useEffect(() => {
    if (formData.provinceId) {
      fetchPlaces(formData.provinceId);
    } else {
      setPlaces([]);
    }
  }, [formData.provinceId]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (validationErrors[name]) {
      setValidationErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  const validate = () => {
    const errors = {};
    if (!formData.companyName) errors.companyName = "Required";
    if (!formData.businessType) errors.businessType = "Required";
    if (!formData.agentCategoryId) errors.agentCategoryId = "Required";
    if (!formData.firstName) errors.firstName = "Required";
    if (!formData.lastName) errors.lastName = "Required";
    if (!formData.personalEmail) errors.personalEmail = "Required";
    if (!formData.mobileNumber) errors.mobileNumber = "Required";
    if (!formData.countryId) errors.countryId = "Required";
    if (!formData.provinceId) errors.provinceId = "Required";
    if (!formData.placeId) errors.placeId = "Required";
    if (!formData.address) errors.address = "Required";
    if (!formData.markup) errors.markup = "Required";
    if (!formData.status) errors.status = "Required";
    // Admin/staff must name the owning main agent; an agent login is implicitly
    // the owner and never sees the field.
    if (!isAgentLogin && !formData.mainAgentId) {
      errors.mainAgentId = "Select the main agent this sub agent belongs to";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      const payload = {
        ...formData,
        agentCategoryId: parseInt(formData.agentCategoryId),
        countryId: parseInt(formData.countryId),
        provinceId: parseInt(formData.provinceId),
        placeId: parseInt(formData.placeId),
        currency: mainAgentCurrency?.id != null
          ? Number(mainAgentCurrency.id)
          : (formData.currency ? parseInt(formData.currency) : null),
        markup: formData.markup ? parseInt(formData.markup) : null,
        // Only meaningful for admin/staff — the backend ignores it for an
        // agent login and uses the authenticated agent instead.
        mainAgentId: formData.mainAgentId ? parseInt(formData.mainAgentId) : null,
      };

      await axiosInstance.post("/api/sub-agent/register", payload);
      toast.success("Sub Agent registered successfully");
      fetchSubAgents();
      handleClose();
    } catch (err) {
      toast.error(err.response?.data?.message || "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdate = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      const payload = {
        ...formData,
        agentCategoryId: parseInt(formData.agentCategoryId),
        countryId: parseInt(formData.countryId),
        provinceId: parseInt(formData.provinceId),
        placeId: parseInt(formData.placeId),
        currency: mainAgentCurrency?.id != null
          ? Number(mainAgentCurrency.id)
          : (formData.currency ? parseInt(formData.currency) : null),
      };

      await axiosInstance.put(`/api/sub-agent/${editing.id}`, payload);
      toast.success("Sub Agent updated successfully");
      fetchSubAgents();
      handleClose();
    } catch (err) {
      toast.error(err.response?.data?.message || "Update failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = (id) => {
    Swal.fire({
      title: "Are you sure?",
      text: "This action cannot be undone!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Yes, delete it!"
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await axiosInstance.delete(`/api/sub-agent/${id}`);
          toast.success("Sub Agent deleted");
          fetchSubAgents();
        } catch (err) {
          toast.error("Delete failed");
        }
      }
    });
  };

  // Toggle a sub-agent between Active / Inactive (status field only). Confirms
  // first, then refreshes the list and shows a success message.
  const handleToggleStatus = (item) => {
    const isActive =
      String(item.status || "").trim().toLowerCase() !== "inactive";
    const nextLabel = isActive ? "Inactive" : "Active";
    Swal.fire({
      title: `Set ${item.companyName || "this sub agent"} to ${nextLabel}?`,
      icon: "warning",
      showCancelButton: true,
      reverseButtons: true,
      confirmButtonColor: isActive ? "#d33" : "#198754",
      cancelButtonColor: "#3085d6",
      confirmButtonText: `Yes, set ${nextLabel}`,
    }).then(async (result) => {
      if (!result.isConfirmed) return;
      try {
        await axiosInstance.patch(`/api/sub-agent/${item.id}/status`, {
          active: !isActive,
        });
        toast.success(`Sub Agent set to ${nextLabel}`);
        fetchSubAgents();
      } catch (err) {
        toast.error("Failed to update status");
      }
    });
  };

  const handleOpen = async (item = null) => {
    if (item) {
      try {
        const res = await axiosInstance.get(`/api/sub-agent/${item.id}`);
        const data = res.data;
        setEditing(data);
        setFormData({
          ...initialFormState,
          ...data,
          agentCategoryId: String(data.agentCategoryId || ""),
          countryId: String(data.countryId || ""),
          provinceId: String(data.provinceId || ""),
          placeId: String(data.placeId || ""),
          // Currency is inherited from the main agent, not editable — always
          // pin it to the main agent's currency (fall back to the stored value
          // only if the main agent's currency hasn't resolved yet).
          currency: mainAgentCurrency?.id != null
            ? String(mainAgentCurrency.id)
            : (data.currency ? String(data.currency) : ""),
          markup: data.markup ? String(data.markup) : "",
          mainAgentId: data.mainAgentId ? String(data.mainAgentId) : "",
        });
      } catch (err) {
        toast.error("Failed to fetch sub-agent details");
        return;
      }
    } else {
      setEditing(null);
      setFormData({
        ...initialFormState,
        currency: mainAgentCurrency?.id != null ? String(mainAgentCurrency.id) : "",
      });
    }
    setValidationErrors({});
    setShowModal(true);
  };

  const handleClose = () => {
    setShowModal(false);
    setEditing(null);
  };

  const handleLogin = async (item) => {
    setEditing(item);
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

    // The roles master is normally loaded on mount, but if that request
    // failed (or hasn't finished yet) the modal would open with an empty
    // dropdown and no AGENT id for the lookup below — retry here so a single
    // failed mount fetch doesn't block issuing credentials for the session.
    const roles = await ensureRolesLoaded();

    try {
      // Scope the check to the AGENT user type so entities of other types that
      // share the same numeric id don't resolve to this agent's account (the
      // backend keys user_accounts by user_id + user_type_id).
      const agentRole = roles.find((r) => r.roleName === "AGENT");
      // subUserType=SUB_AGENT keeps this from returning a MAIN-agent /
      // SUB_USER row that happens to share the same numeric id.
      const checkUrl = agentRole
        ? `/auth/checkRegisteredUserExist/${item.id}?userTypeId=${agentRole.id}&subUserType=SUB_AGENT`
        : `/auth/checkRegisteredUserExist/${item.id}`;
      const response = await axiosInstance.post(checkUrl);
      if (response.data) {
        let userNameValue = response.data.userName || response.data.username || "";
        // Strip the suffix if it exists to only show the prefix in the input
        if (mainAgentName && userNameValue.endsWith(`.${mainAgentName}`)) {
          userNameValue = userNameValue.substring(0, userNameValue.length - mainAgentName.length - 1);
        }
        setLoginFormData(prev => ({
          ...prev,
          username: userNameValue,
        }));
      }
    } catch (error) {
      console.error("No existing login data found", error);
    }
    setLoginModalKey(prev => prev + 1);
    setShowLoginModal(true);
  };

  const handleLoginSubmit = async () => {
    let isValid = true;
    const errors = { username: "", password: "", repassword: "", userroles: "" };

    if (!loginFormData.username.trim()) { errors.username = "Username is required"; isValid = false; }
    if (!loginFormData.password) { errors.password = "Password is required"; isValid = false; }
    if (loginFormData.password !== loginFormData.repassword) { errors.repassword = "Passwords do not match"; isValid = false; }
    if (loginFormData.userroles.length === 0) { errors.userroles = "At least one user role is required"; isValid = false; }

    setLoginErrors(errors);

    if (isValid) {
      try {
        setIsLoading(true);
        let activeRoleObj = rolesList.find((role) => role.roleName === "AGENT");
        const loginPayload = {
          userId: editing?.id,
          userTypeId: activeRoleObj?.id,
          userName: `${loginFormData.username}.${mainAgentName}`,
          password: loginFormData.password,
          userRoleIds: loginFormData.userroles,
        };

        const response = await axiosInstance.post("/auth/register", loginPayload);
        if (response.data) {
          toast.success("Login credentials saved successfully!");
          setShowLoginModal(false);
        }
      } catch (error) {
        const serverMsg =
          error.response?.data?.message ||
          error.response?.data?.error ||
          error.message ||
          "Failed to save login credentials";
        toast.error(serverMsg);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // ─── Credit Limit ───────────────────────────────────────────────────────────

  // Temporary-credit rows for the sub-agent currently open in the modal.
  const fetchTempCredits = async (subAgentId) => {
    setTempCreditsLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/sub-agent-credit-limit/temporary/sub-agent/${subAgentId}`,
      );
      setTempCredits(Array.isArray(res.data) ? res.data : []);
    } catch (_) {
      setTempCredits([]);
    } finally {
      setTempCreditsLoading(false);
    }
  };

  const handleCreditLimit = async (item) => {
    setEditing(item);
    setCreditLimitFormData({
      addCreditLimit: "",
      remarks: "",
      totalCreditLimit: "0",
      availableCreditLimit: "0",
      usedCreditLimit: "0",
      paymentMode: "",
    });
    setCreditLimitErrors({ addCreditLimit: "", remarks: "" });
    setCreditAdjustDirection("add");
    setTempCredits([]);
    setShowTempCreditForm(false);
    setEditingTempCreditId(null);

    try {
      const response = await axiosInstance.get(
        `/api/sub-agent-credit-limit/sub-agent/${item.id}`,
      );
      // 204 No Content (no credit limit yet) arrives as an empty body.
      const creditData = response.data || null;
      if (creditData && Number(creditData.totalCreditLimit) > 0) {
        // Second and subsequent visits — the initial limit is already set, so
        // the modal opens on Update and "Add Initial Credit Limit" is locked.
        setCreditRowExists(true);
        setHasInitialCredit(true);
        setCreditLimitType("update");
        setCreditLimitFormData((prev) => ({
          ...prev,
          totalCreditLimit: creditData.totalCreditLimit ?? "0",
          availableCreditLimit: creditData.availableCreditLimit ?? "0",
          usedCreditLimit: creditData.usedCreditLimit ?? "0",
          paymentMode: creditData.paymentMode || "",
        }));
        fetchTempCredits(item.id);
      } else {
        // First visit — Add Initial Credit Limit only.
        setCreditRowExists(Boolean(creditData));
        setHasInitialCredit(false);
        setCreditLimitType("initial");
      }
    } catch (_) {
      setCreditRowExists(false);
      setHasInitialCredit(false);
      setCreditLimitType("initial");
    }
    setShowCreditLimitModal(true);
  };

  const validateCreditLimitForm = (data, type) => {
    const newErrors = {};
    if (!data.addCreditLimit.toString().trim()) {
      newErrors.addCreditLimit =
        type === "initial"
          ? "Add Credit Limit is required"
          : "Add-on Credit Limit is required";
    } else if (isNaN(data.addCreditLimit)) {
      newErrors.addCreditLimit =
        type === "initial"
          ? "Add Credit Limit must be a number"
          : "Add-on Credit Limit must be a number";
    }
    if (type === "update" && !data.remarks.trim()) {
      newErrors.remarks = "Remarks is required";
    }
    return newErrors;
  };

  const handleCreditLimitSubmit = async () => {
    const errors = validateCreditLimitForm(creditLimitFormData, creditLimitType);
    if (Object.keys(errors).length > 0) {
      setCreditLimitErrors(errors);
      return;
    }

    try {
      setIsLoading(true);
      const addAmount = parseFloat(creditLimitFormData.addCreditLimit);
      const pm = creditLimitFormData.paymentMode || undefined;
      const subAgentId = Number(editing?.id);
      let response;

      if (creditLimitType === "initial") {
        if (creditRowExists) {
          // A row already exists but sits at zero (e.g. a previous Reduce took
          // it down to 0), so /create would be rejected as a duplicate — top it
          // back up through the update path instead.
          response = await axiosInstance.put("/api/sub-agent-credit-limit/update", {
            subAgentId,
            additionalCredit: addAmount,
            totalCreditLimit: parseFloat(creditLimitFormData.totalCreditLimit) || 0,
            availableCreditLimit:
              parseFloat(creditLimitFormData.availableCreditLimit) || 0,
            paymentMode: pm,
          });
        } else {
          response = await axiosInstance.post(
            "/api/sub-agent-credit-limit/create",
            null,
            {
              params: {
                subAgentId,
                totalCreditLimit: addAmount,
                ...(pm ? { paymentMode: pm } : {}),
              },
            },
          );
        }
      } else {
        // Reduce flips the entered (always-positive) amount negative — the
        // backend applies the same signed delta to both total and available.
        const signedAmount =
          creditAdjustDirection === "reduce"
            ? -Math.abs(addAmount)
            : Math.abs(addAmount);
        response = await axiosInstance.put("/api/sub-agent-credit-limit/update", {
          subAgentId,
          additionalCredit: signedAmount,
          remarks: creditLimitFormData.remarks,
          totalCreditLimit: parseFloat(creditLimitFormData.totalCreditLimit) || 0,
          availableCreditLimit:
            parseFloat(creditLimitFormData.availableCreditLimit) || 0,
          paymentMode: pm,
        });
      }

      if (response.data) {
        toast.success(
          creditLimitType === "initial"
            ? "Initial credit limit created successfully!"
            : "Credit limit updated successfully!",
        );
        // Close on success — same as the agent screen. Re-opening Credit now
        // lands on "Update Credit Limit" with the stored balances.
        setCreditRowExists(true);
        setHasInitialCredit(true);
        closeCreditLimitModal();
      }
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to update credit limit",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Temporary Credit Limit — Add / Edit / Delete / Toggle ──────────────────

  // datetime-local inputs need "yyyy-MM-ddTHH:mm"; the backend returns a plain
  // LocalDateTime ISO string ("...THH:mm:ss").
  const toDatetimeLocalValue = (value) => (value ? String(value).slice(0, 16) : "");

  const openAddTempCreditForm = () => {
    setEditingTempCreditId(null);
    setTempCreditFormData({ amount: "", startDateTime: "", endDateTime: "", remarks: "" });
    setTempCreditErrors({});
    setShowTempCreditForm(true);
  };

  const openEditTempCreditForm = (row) => {
    setEditingTempCreditId(row.id);
    setTempCreditFormData({
      amount: row.amount ?? "",
      startDateTime: toDatetimeLocalValue(row.startDateTime),
      endDateTime: toDatetimeLocalValue(row.endDateTime),
      remarks: row.remarks || "",
    });
    setTempCreditErrors({});
    setShowTempCreditForm(true);
  };

  const closeTempCreditForm = () => {
    setShowTempCreditForm(false);
    setEditingTempCreditId(null);
    setTempCreditFormData({ amount: "", startDateTime: "", endDateTime: "", remarks: "" });
    setTempCreditErrors({});
  };

  const handleTempCreditFormChange = (e) => {
    const { name, value } = e.target;
    setTempCreditFormData((prev) => ({ ...prev, [name]: value }));
    if (tempCreditErrors[name]) {
      setTempCreditErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateTempCreditForm = (data) => {
    const errors = {};
    if (!data.amount.toString().trim()) {
      errors.amount = "Amount is required";
    } else if (isNaN(data.amount) || Number(data.amount) <= 0) {
      errors.amount = "Amount must be a positive number";
    }
    if (!data.startDateTime) errors.startDateTime = "Start date & time is required";
    if (!data.endDateTime) errors.endDateTime = "End date & time is required";
    if (
      data.startDateTime &&
      data.endDateTime &&
      new Date(data.endDateTime) <= new Date(data.startDateTime)
    ) {
      errors.endDateTime = "End date & time must be after the start date & time";
    }
    return errors;
  };

  const handleTempCreditSubmit = async () => {
    const errors = validateTempCreditForm(tempCreditFormData);
    if (Object.keys(errors).length > 0) {
      setTempCreditErrors(errors);
      return;
    }
    setTempCreditSaving(true);
    try {
      const payload = {
        amount: Number(tempCreditFormData.amount),
        startDateTime: tempCreditFormData.startDateTime,
        endDateTime: tempCreditFormData.endDateTime,
        remarks: tempCreditFormData.remarks || undefined,
      };
      if (editingTempCreditId) {
        await axiosInstance.put(
          `/api/sub-agent-credit-limit/temporary/${editingTempCreditId}`,
          payload,
        );
        toast.success("Temporary credit limit updated successfully!");
      } else {
        await axiosInstance.post("/api/sub-agent-credit-limit/temporary", {
          subAgentId: Number(editing?.id),
          ...payload,
        });
        toast.success("Temporary credit limit added successfully!");
      }
      closeTempCreditForm();
      await fetchTempCredits(editing?.id);
    } catch (e) {
      toast.error(
        e.response?.data?.message || "Failed to save temporary credit limit",
      );
    } finally {
      setTempCreditSaving(false);
    }
  };

  const handleDeleteTempCredit = (row) => {
    Swal.fire({
      title: "Delete this temporary credit limit?",
      html: `Amount: <b>${row.amount}</b><br/>This removes it immediately — it will no longer count toward the sub agent's available credit.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete",
    }).then(async (result) => {
      if (!result.isConfirmed) return;
      try {
        await axiosInstance.delete(
          `/api/sub-agent-credit-limit/temporary/${row.id}`,
        );
        toast.success("Temporary credit limit deleted");
        await fetchTempCredits(editing?.id);
      } catch (e) {
        toast.error(
          e.response?.data?.message || "Failed to delete temporary credit limit",
        );
      }
    });
  };

  const handleToggleTempCreditEnabled = async (row) => {
    const nextEnabled = !row.enabled;
    setTempCreditTogglingId(row.id);
    try {
      await axiosInstance.patch(
        `/api/sub-agent-credit-limit/temporary/${row.id}/status`,
        { enabled: nextEnabled },
      );
      toast.success(
        nextEnabled
          ? "Temporary credit limit activated"
          : "Temporary credit limit deactivated",
      );
      await fetchTempCredits(editing?.id);
    } catch (e) {
      toast.error(
        e.response?.data?.message ||
          "Failed to update temporary credit limit status",
      );
    } finally {
      setTempCreditTogglingId(null);
    }
  };

  const handleReset = () => {
    setFormData(initialFormState);
    setValidationErrors({});
  };

  const handleLoginChange = (e) => {
    const { name, value } = e.target;
    let fieldName = name;
    if (name === "login-username") fieldName = "username";
    else if (name === "login-password") fieldName = "password";
    else if (name === "login-repassword") fieldName = "repassword";
    setLoginFormData(prev => ({ ...prev, [fieldName]: value }));
  };

  const toggleRole = (roleId) => {
    setLoginFormData(prev => ({
      ...prev,
      userroles: prev.userroles.includes(roleId)
        ? prev.userroles.filter(id => id !== roleId)
        : [...prev.userroles, roleId]
    }));
    setShowRolesDropdown(false);
  };

  const removeRole = (roleId) => {
    setLoginFormData(prev => ({
      ...prev,
      userroles: prev.userroles.filter(id => id !== roleId)
    }));
  };

  const closeLoginModal = () => {
    setShowLoginModal(false);
    setShowRolesDropdown(false);
  };

  const closeCreditLimitModal = () => {
    setShowCreditLimitModal(false);
    setCreditLimitType("initial");
    setCreditRowExists(false);
    setHasInitialCredit(false);
    setCreditLimitFormData({
      addCreditLimit: "",
      remarks: "",
      totalCreditLimit: "0",
      availableCreditLimit: "0",
      usedCreditLimit: "0",
      paymentMode: "",
    });
    setCreditLimitErrors({ addCreditLimit: "", remarks: "" });
    setCreditAdjustDirection("add");
    setTempCredits([]);
    setShowTempCreditForm(false);
    setEditingTempCreditId(null);
  };

  const handleCreditLimitChange = (e) => {
    const { name, value } = e.target;
    setCreditLimitFormData(prev => ({ ...prev, [name]: value }));
    if (creditLimitErrors[name]) {
      setCreditLimitErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  const handleCreditLimitTypeChange = (e) => {
    setCreditLimitType(e.target.value);
    setCreditLimitFormData(prev => ({ ...prev, addCreditLimit: "", remarks: "" }));
    setCreditLimitErrors({ addCreditLimit: "", remarks: "" });
    setCreditAdjustDirection("add");
  };

  // Display label for the (locked) main-agent currency — "AED - UAE dirham"
  // when the name is resolvable from the currency master, else just the code.
  const mainAgentCurrencyLabel = () => {
    if (!mainAgentCurrency) return "";
    const match = currencies.find(
      (c) => String(c.currencyId || c.id) === String(mainAgentCurrency.id),
    );
    const code = mainAgentCurrency.code || match?.currencyCode || match?.code || "";
    const name = (match?.name || match?.currencyName || "").trim();
    return name ? `${code} - ${name}` : code || `#${mainAgentCurrency.id}`;
  };

  // Only the SUB_AGENT role is offered in the Login Details modal.
  const selectableRoles = rolesList.filter(isSubAgentRole);

  const filteredItems = items.filter(item =>
    item.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.lastName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectStyle = { 
    appearance: 'none', 
    backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\'%3e%3cpath fill=\'none\' stroke=\'%23343a40\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'m2 5 6 6 6-6\'/%3e%3c/svg%3e")', 
    backgroundRepeat: 'no-repeat', 
    backgroundPosition: 'right .75rem center', 
    backgroundSize: '12px 9px',
    fontSize: '0.85rem',
    minHeight: '35px'
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Card className="shadow-sm rounded-3 border-0">
            <Card.Header className="bg-white border-0 py-3 d-flex justify-content-between align-items-center border-bottom">
              {/* Title markup matches SubUser.jsx ("Sub User Registration") so
                  both registration screens share a size and weight. The brand
                  red comes from the site-wide card-header rule in custom.scss —
                  no colour is set here. Bootstrap's `text-dark` was previously
                  overriding that rule (colour utilities carry !important). */}
              <span className="fw-semibold">Sub Agent Registration</span>
              <div className="d-flex gap-2">
                <Button className="btn-indigo d-flex align-items-center gap-2" size="sm" onClick={() => handleOpen()}>
                  Create +
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="p-0">
               <div className="p-3 bg-light border-bottom d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center gap-2">
                  <span className="small text-muted">Display</span>
                  <Form.Select size="sm" style={{ width: '70px' }}>
                    <option>10</option>
                    <option>25</option>
                    <option>50</option>
                  </Form.Select>
                  <span className="small text-muted">records</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className="small text-muted">Search:</span>
                  <Form.Control 
                    size="sm" 
                    type="text" 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    style={{ width: '200px' }}
                  />
                </div>
              </div>
              <Table responsive hover className="mb-0 align-middle">
                <thead style={{ backgroundColor: '#2d3e50', color: 'white' }}>
                  <tr>
                    <th className="ps-4 py-2 small">S.N</th>
                    <th className="py-2 small">Company(Agent)</th>
                    <th className="py-2 small">Contact</th>
                    <th className="py-2 small">Email</th>
                    <th className="py-2 small">Country</th>
                    <th className="py-2 small">City</th>
                    <th className="text-center py-2 small">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-5">
                        <Spinner animation="border" variant="primary" size="sm" />
                      </td>
                    </tr>
                  ) : filteredItems.length > 0 ? (
                    filteredItems.map((item, idx) => (
                      <tr key={item.id} className="small">
                        <td className="ps-4">{idx + 1}</td>
                        <td className="fw-bold text-primary">{item.companyName}</td>
                        <td>{item.firstName} {item.lastName}</td>
                        <td>{item.personalEmail}</td>
                        <td>{item.countryName || "—"}</td>
                        <td>{item.provinceName || "—"}</td>
                        <td className="text-center">
                          <div className="d-flex flex-wrap justify-content-center gap-2">
                            <Button
                              variant="outline-primary"
                              size="sm"
                              className="d-flex align-items-center gap-1"
                              onClick={() => handleLogin(item)}
                            >
                              <FaSignInAlt /> Login
                            </Button>
                            <Button
                              variant="outline-warning"
                              size="sm"
                              className="d-flex align-items-center gap-1"
                              onClick={() => handleCreditLimit(item)}
                            >
                              <FaCreditCard /> Credit
                            </Button>
                            <Button
                              variant="outline-success"
                              size="sm"
                              className="d-flex align-items-center gap-1"
                              onClick={() => handleOpen(item)}
                            >
                              <FaEdit /> Edit
                            </Button>
                            {(() => {
                              const isActive =
                                String(item.status || "").trim().toLowerCase() !==
                                "inactive";
                              return (
                                <Button
                                  variant={isActive ? "success" : "secondary"}
                                  size="sm"
                                  className="d-flex align-items-center gap-1"
                                  onClick={() => handleToggleStatus(item)}
                                  title={
                                    isActive
                                      ? "Active — click to set Inactive"
                                      : "Inactive — click to set Active"
                                  }
                                >
                                  {isActive ? "Active" : "Inactive"}
                                </Button>
                              );
                            })()}
                            {/* Delete — permanently removes the sub-agent
                                row. The existing handleDelete() function
                                already fires a Swal confirmation and calls
                                DELETE /api/sub-agent/{id}. Prefer the
                                Active/Inactive toggle above whenever the
                                sub-agent has bookings, invoices, or credit
                                history — the DB refuses hard-delete on
                                rows with linked records, and handleDelete
                                surfaces that error via toast.error. */}
                            <Button
                              variant="outline-danger"
                              size="sm"
                              className="d-flex align-items-center gap-1"
                              onClick={() => handleDelete(item.id)}
                            >
                              <FaTrash /> Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center py-5 text-muted small">No entries found</td>
                    </tr>
                  )}
                </tbody>
              </Table>
              <div className="p-3 bg-light border-top d-flex justify-content-between align-items-center small text-muted">
                <div>Showing 1 to {filteredItems.length} of {items.length} entries</div>
                <div className="d-flex gap-1">
                  <Button variant="outline-secondary" size="sm" disabled>Previous</Button>
                  <Button variant="primary" size="sm">1</Button>
                  <Button variant="outline-secondary" size="sm" disabled>Next</Button>
                </div>
              </div>
            </Card.Body>
          </Card>

          <Modal show={showModal} onHide={handleClose} size="xl" centered backdrop="static">
            <Modal.Body className="p-0">
               <style>{`
                .custom-fieldset {
                  border: 1px solid #ddd;
                  padding: 1.5rem 1rem 1rem 1rem;
                  margin-top: 1rem;
                  position: relative;
                  border-radius: 4px;
                }
                .custom-legend {
                  position: absolute;
                  top: -12px;
                  left: 15px;
                  background: white;
                  padding: 0 10px;
                  font-weight: bold;
                  font-size: 0.85rem;
                  color: #666;
                  border: 1px solid #ddd;
                  border-radius: 4px;
                  width: auto;
                  margin-bottom: 0;
                }
                .form-label-custom {
                  font-size: 0.8rem;
                  font-weight: 600;
                  margin-bottom: 2px;
                }
                .form-control-custom {
                  font-size: 0.85rem;
                  padding: 4px 8px;
                  min-height: 35px;
                }
                .btn-footer {
                  font-size: 0.85rem;
                  font-weight: 600;
                  padding: 6px 20px;
                  border-radius: 4px;
                }
              `}</style>
              
              <div className="p-4 bg-white">
                <Form onSubmit={editing ? handleUpdate : handleSubmit}>
                  {/* Agent Details Section */}
                  <div className="custom-fieldset">
                    <div className="custom-legend">Agent Details</div>
                    <Row className="g-3">
                      {/* Owning main agent — admin/staff only. An agent login
                          is implicitly the owner, so the field is hidden and
                          the backend resolves the parent from the JWT. */}
                      {!isAgentLogin && (
                        <Col md={12}>
                          <Form.Group>
                            <Form.Label className="form-label-custom">
                              <span className="text-danger">* </span>Main Agent
                            </Form.Label>
                            <AgentSelect
                              agents={agents}
                              value={formData.mainAgentId}
                              onChange={(id) =>
                                handleChange({ target: { name: "mainAgentId", value: id } })
                              }
                              placeholder="Select the main agent this sub agent belongs to"
                              isInvalid={!!validationErrors.mainAgentId}
                            />
                            {validationErrors.mainAgentId && (
                              <div className="text-danger" style={{ fontSize: '0.7rem', marginTop: 2 }}>
                                {validationErrors.mainAgentId}
                              </div>
                            )}
                          </Form.Group>
                        </Col>
                      )}
                      <Col md={4}>
                        <Form.Group>
                          <Form.Label className="form-label-custom"><span className="text-danger">* </span>Company Name</Form.Label>
                          <Form.Control 
                            name="companyName" 
                            value={formData.companyName} 
                            onChange={handleChange} 
                            isInvalid={!!validationErrors.companyName}
                            className="form-control-custom"
                          />
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <Form.Group>
                          <Form.Label className="form-label-custom"><span className="text-danger">* </span>Business Type</Form.Label>
                          <Form.Control 
                            name="businessType" 
                            value={formData.businessType} 
                            onChange={handleChange} 
                            isInvalid={!!validationErrors.businessType}
                            className="form-control-custom"
                          />
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <Form.Group>
                          <Form.Label className="form-label-custom"><span className="text-danger">* </span>Company Type</Form.Label>
                          <Form.Select 
                            name="agentCategoryId" 
                            value={formData.agentCategoryId} 
                            onChange={handleChange} 
                            isInvalid={!!validationErrors.agentCategoryId}
                            style={selectStyle}
                          >
                            <option value="">SELECT</option>
                            {categories.map(c => <option key={c.agentCategoryId} value={c.agentCategoryId}>{c.name}</option>)}
                          </Form.Select>
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <Form.Group>
                          <Form.Label className="form-label-custom"><span className="text-danger">* </span>Company Code</Form.Label>
                          <Form.Control 
                            name="companyCode" 
                            value={formData.companyCode} 
                            onChange={handleChange} 
                            className="form-control-custom"
                          />
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <Form.Group>
                          <Form.Label className="form-label-custom"><span className="text-danger">* </span>Authorized person - First Name</Form.Label>
                          <Form.Control 
                            name="firstName" 
                            value={formData.firstName} 
                            onChange={handleChange} 
                            isInvalid={!!validationErrors.firstName}
                            className="form-control-custom"
                          />
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <Form.Group>
                          <Form.Label className="form-label-custom"><span className="text-danger">* </span>Authorized person - Last Name</Form.Label>
                          <Form.Control 
                            name="lastName" 
                            value={formData.lastName} 
                            onChange={handleChange} 
                            isInvalid={!!validationErrors.lastName}
                            className="form-control-custom"
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                  </div>

                  <Row className="mt-2 g-3">
                    {/* Contact Details Section */}
                    <Col md={9}>
                      <div className="custom-fieldset h-100">
                        <div className="custom-legend">Contact Details</div>
                        <Row className="g-3">
                          <Col md={4}>
                            <Form.Group>
                              <Form.Label className="form-label-custom"><span className="text-danger">* </span>Agent Email</Form.Label>
                              <Form.Control 
                                name="personalEmail" 
                                type="email"
                                value={formData.personalEmail} 
                                onChange={handleChange} 
                                isInvalid={!!validationErrors.personalEmail}
                                className="form-control-custom"
                              />
                            </Form.Group>
                          </Col>
                          <Col md={4}>
                            <Form.Group>
                              <Form.Label className="form-label-custom">Zip Code</Form.Label>
                              <Form.Control 
                                name="zipCode" 
                                value={formData.zipCode} 
                                onChange={handleChange} 
                                className="form-control-custom"
                              />
                            </Form.Group>
                          </Col>
                          <Col md={4}>
                            <Form.Group>
                              <Form.Label className="form-label-custom"><span className="text-danger">* </span>Mobile Number</Form.Label>
                              <Form.Control 
                                name="mobileNumber" 
                                value={formData.mobileNumber} 
                                onChange={handleChange} 
                                isInvalid={!!validationErrors.mobileNumber}
                                className="form-control-custom"
                              />
                            </Form.Group>
                          </Col>
                          <Col md={4}>
                            <Form.Group>
                              <Form.Label className="form-label-custom">Contact Person</Form.Label>
                              <Form.Control 
                                name="contactPerson" 
                                value={formData.contactPerson} 
                                onChange={handleChange} 
                                className="form-control-custom"
                              />
                            </Form.Group>
                          </Col>
                          <Col md={4}>
                            <Form.Group>
                              <Form.Label className="form-label-custom">Fax Number</Form.Label>
                              <Form.Control 
                                name="faxNumber" 
                                value={formData.faxNumber} 
                                onChange={handleChange} 
                                className="form-control-custom"
                              />
                            </Form.Group>
                          </Col>
                          <Col md={4}>
                            <Form.Group>
                              <Form.Label className="form-label-custom">Telephone Number</Form.Label>
                              <Form.Control 
                                name="telephoneNumber" 
                                value={formData.telephoneNumber} 
                                onChange={handleChange} 
                                className="form-control-custom"
                              />
                            </Form.Group>
                          </Col>
                          <Col md={4}>
                             <SearchableSelect
                              label="Country"
                              name="countryId"
                              value={formData.countryId}
                              options={countries}
                              placeholder="SELECT"
                              onSearch={handleCountrySearch}
                              onChange={handleChange}
                              isLoading={isDataLoading.countries}
                              error={validationErrors.countryId}
                              required
                            />
                          </Col>
                          <Col md={4}>
                             <Form.Group className="mb-3">
                              <Form.Label className="form-label-custom"><span className="text-danger">* </span>City</Form.Label>
                              <Form.Select
                                name="provinceId"
                                value={formData.provinceId} 
                                onChange={handleChange} 
                                isInvalid={!!validationErrors.provinceId}
                                disabled={!formData.countryId}
                                style={selectStyle}
                              >
                                <option value="">SELECT</option>
                                {provinces.map(p => <option key={p.id} value={p.id}>{p.stateName}</option>)}
                              </Form.Select>
                            </Form.Group>
                          </Col>
                          <Col md={4}>
                             <Form.Group className="mb-3">
                              <Form.Label className="form-label-custom"><span className="text-danger">* </span>Location</Form.Label>
                              <Form.Select
                                name="placeId"
                                value={formData.placeId} 
                                onChange={handleChange} 
                                isInvalid={!!validationErrors.placeId}
                                disabled={!formData.provinceId}
                                style={selectStyle}
                              >
                                <option value="">SELECT</option>
                                {places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </Form.Select>
                            </Form.Group>
                          </Col>
                          <Col md={12}>
                            <Form.Group>
                              <Form.Label className="form-label-custom"><span className="text-danger">* </span>Address</Form.Label>
                              <Form.Control 
                                as="textarea" 
                                rows={3} 
                                name="address" 
                                value={formData.address} 
                                onChange={handleChange} 
                                isInvalid={!!validationErrors.address}
                                className="form-control-custom"
                              />
                            </Form.Group>
                          </Col>
                        </Row>
                      </div>
                    </Col>

                    {/* Settings Section */}
                    <Col md={3}>
                      <div className="custom-fieldset h-100">
                        <div className="custom-legend">Settings</div>
                        <Form.Group className="mb-3">
                          <Form.Label className="form-label-custom"><span className="text-danger">* </span>Markup Type</Form.Label>
                          <Form.Select 
                            name="markup" 
                            value={formData.markup} 
                            onChange={handleChange} 
                            isInvalid={!!validationErrors.markup}
                            style={selectStyle}
                          >
                            <option value="">SELECT</option>
                            {markupTypes.map(m => (
                              <option key={m.id} value={m.id}>
                                {formatMarkupOption(m)}
                              </option>
                            ))}
                          </Form.Select>
                          {validationErrors.markup && (
                            <Form.Control.Feedback type="invalid" style={{ fontSize: '0.7rem' }}>
                              {validationErrors.markup}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label className="form-label-custom">Currency</Form.Label>
                          {/* Locked to the main agent's currency — a sub-agent
                              inherits it and cannot select a different one. */}
                          <Form.Select
                            name="currency"
                            value={
                              mainAgentCurrency?.id != null
                                ? String(mainAgentCurrency.id)
                                : (formData.currency || "")
                            }
                            disabled
                            style={selectStyle}
                            title="Sub agents inherit the main agent's currency"
                          >
                            {mainAgentCurrency?.id != null ? (
                              <option value={String(mainAgentCurrency.id)}>
                                {mainAgentCurrencyLabel()}
                              </option>
                            ) : (
                              <option value="">—</option>
                            )}
                          </Form.Select>
                          <div className="text-muted" style={{ fontSize: '0.7rem', marginTop: 2 }}>
                            Inherited from the main agent
                          </div>
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label className="form-label-custom"><span className="text-danger">* </span>Status</Form.Label>
                          <Form.Select 
                            name="status" 
                            value={formData.status} 
                            onChange={handleChange}
                            style={selectStyle}
                          >
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                          </Form.Select>
                        </Form.Group>
                      </div>
                    </Col>
                  </Row>

                  <div className="mt-4 p-3 border-top d-flex justify-content-between align-items-center">
                    <Button variant="danger" className="btn-footer d-flex align-items-center gap-2" onClick={handleClose}>
                      <FaTimes /> Cancel
                    </Button>
                    <div className="d-flex gap-2">
                      <Button variant="success" className="btn-footer d-flex align-items-center gap-2" type="submit" disabled={isLoading}>
                        <FaCheck /> {editing ? "Update" : "Create"}
                      </Button>
                      <Button variant="primary" className="btn-footer d-flex align-items-center gap-2" style={{ backgroundColor: '#4b57cc' }} onClick={handleReset}>
                        <FaUndo /> Reset
                      </Button>
                    </div>
                  </div>
                </Form>
              </div>
            </Modal.Body>
          </Modal>

          {/* Login Modal */}
          <Modal show={showLoginModal} onHide={closeLoginModal} centered key={loginModalKey} backdrop="static">
            <Modal.Header closeButton>
              <Modal.Title>Login Details for: {editing?.companyName}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Username</Form.Label>
                  <div className="input-group">
                    <Form.Control 
                      name="login-username" 
                      value={loginFormData.username} 
                      onChange={handleLoginChange} 
                      isInvalid={!!loginErrors.username} 
                      placeholder="Enter username"
                    />
                    <span className="input-group-text">.</span>
                    <Form.Control 
                      value={mainAgentName} 
                      readOnly 
                      disabled 
                      className="bg-light text-muted"
                      style={{ maxWidth: '150px' }}
                    />
                  </div>
                  <div className="mt-2" style={{ fontSize: '0.85rem' }}>
                    Your username is: <span className="text-danger fw-bold">{loginFormData.username ? `${loginFormData.username}.${mainAgentName}` : `prefix.${mainAgentName}`}</span>
                  </div>
                  {loginErrors.username && <div className="text-danger small mt-1">{loginErrors.username}</div>}
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Password</Form.Label>
                  <InputGroup hasValidation>
                    <Form.Control
                      type={showPassword ? "text" : "password"}
                      name="login-password"
                      value={loginFormData.password}
                      onChange={handleLoginChange}
                      isInvalid={!!loginErrors.password}
                    />
                    <Button
                      variant="outline-secondary"
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      title={showPassword ? "Hide password" : "Show password"}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <FaEyeSlash /> : <FaEye />}
                    </Button>
                    <Form.Control.Feedback type="invalid">{loginErrors.password}</Form.Control.Feedback>
                  </InputGroup>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Confirm Password</Form.Label>
                  <InputGroup hasValidation>
                    <Form.Control
                      type={showRePassword ? "text" : "password"}
                      name="login-repassword"
                      value={loginFormData.repassword}
                      onChange={handleLoginChange}
                      isInvalid={!!loginErrors.repassword}
                    />
                    <Button
                      variant="outline-secondary"
                      type="button"
                      onClick={() => setShowRePassword((v) => !v)}
                      title={showRePassword ? "Hide password" : "Show password"}
                      aria-label={showRePassword ? "Hide password" : "Show password"}
                    >
                      {showRePassword ? <FaEyeSlash /> : <FaEye />}
                    </Button>
                    <Form.Control.Feedback type="invalid">{loginErrors.repassword}</Form.Control.Feedback>
                  </InputGroup>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>User Roles</Form.Label>
                  <div className="form-control d-flex flex-wrap align-items-center" style={{ cursor: 'pointer' }} onClick={() => setShowRolesDropdown(!showRolesDropdown)}>
                    {loginFormData.userroles.length > 0 ? loginFormData.userroles.map(roleId => {
                      const role = rolesList.find(r => r.id === roleId);
                      return role ? <span key={roleId} className="badge bg-primary me-1 mb-1">{role.roleName}</span> : null;
                    }) : <span className="text-muted">Select roles...</span>}
                  </div>
                  {showRolesDropdown && (
                    <div className="border rounded mt-1 bg-white shadow-sm" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                      {/* Sub-agent creation page — the only meaningful role
                          here is SUB_AGENT, so hide every other option to
                          prevent operators from picking the wrong bucket. */}
                      {selectableRoles.length > 0 ? (
                        selectableRoles.map(role => (
                          <div key={role.id} className="p-2 cursor-pointer hover-bg-light" onClick={() => toggleRole(role.id)} onMouseEnter={e => e.target.style.backgroundColor='#f8f9fa'} onMouseLeave={e => e.target.style.backgroundColor=''}>
                            {role.roleName}
                          </div>
                        ))
                      ) : (
                        // Without this the dropdown opens as an empty strip and
                        // looks broken. The SUB_AGENT row is seeded by the backend
                        // (SubAccountRoleSeeder) but can be missing on a database
                        // that predates it — say so instead of staying silent.
                        <div className="p-2 text-muted small">
                          {rolesList.length === 0
                            ? "Could not load user roles. Close this dialog and try again."
                            : "The SUB_AGENT role is not configured. Ask an administrator to add it under Manage Masters → Roles."}
                        </div>
                      )}
                    </div>
                  )}
                  {loginErrors.userroles && <div className="text-danger small">{loginErrors.userroles}</div>}
                </Form.Group>
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={closeLoginModal}>Cancel</Button>
              <Button variant="primary" onClick={handleLoginSubmit} disabled={isLoading}>Save</Button>
            </Modal.Footer>
          </Modal>

          {/* Credit Limit Modal — mirrors the Manage Credit Limit modal on
              registration/agent/view/{id} (AgentView.jsx). First open shows
              "Add Initial Credit Limit" only; once a limit exists the modal
              opens on Update with the Add/Reduce controls, the readonly
              balances and the Temporary Credit Limit list. */}
          <Modal
            show={showCreditLimitModal}
            onHide={closeCreditLimitModal}
            centered
            size="xl"
            backdrop="static"
            keyboard={false}
          >
            <Modal.Header closeButton={!isLoading}>
              <Modal.Title>Manage Credit Limit - {editing?.companyName}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <Form.Group className="mb-4">
                  <Form.Label className="fw-bold">Select Action:</Form.Label>
                  <Row>
                    <Col xs="auto">
                      <Form.Check
                        type="radio"
                        id="sub-agent-initial-credit"
                        name="creditLimitType"
                        value="initial"
                        label="Add Initial Credit Limit"
                        checked={creditLimitType === "initial"}
                        onChange={handleCreditLimitTypeChange}
                        disabled={hasInitialCredit}
                        className="mb-2"
                      />
                    </Col>
                    <Col xs="auto">
                      <Form.Check
                        type="radio"
                        id="sub-agent-update-credit"
                        name="creditLimitType"
                        value="update"
                        label="Update Credit Limit"
                        checked={creditLimitType === "update"}
                        onChange={handleCreditLimitTypeChange}
                        disabled={!hasInitialCredit}
                        className="mb-2"
                      />
                    </Col>
                  </Row>
                </Form.Group>
                <hr className="my-3" />
                {creditLimitType === "initial" ? (
                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>
                          <span className="text-danger">*</span>Add Credit Limit
                        </Form.Label>
                        <Form.Control
                          type="number"
                          name="addCreditLimit"
                          value={creditLimitFormData.addCreditLimit}
                          onChange={handleCreditLimitChange}
                          placeholder="Enter initial credit limit amount"
                          isInvalid={!!creditLimitErrors.addCreditLimit}
                          min="0"
                          step="0.01"
                        />
                        <Form.Control.Feedback type="invalid">
                          {creditLimitErrors.addCreditLimit}
                        </Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Paid Through</Form.Label>
                        <Form.Select
                          name="paymentMode"
                          value={creditLimitFormData.paymentMode}
                          onChange={handleCreditLimitChange}
                          style={selectStyle}
                        >
                          <option value="">SELECT</option>
                          <option value="CASH">Cash</option>
                          <option value="CREDIT_CARD">Credit Card</option>
                          <option value="BANK_TRANSFER">Bank Transfer</option>
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  </Row>
                ) : (
                  <>
                    <Form.Group className="mb-3">
                      <Form.Label className="fw-bold d-block">Add or Reduce</Form.Label>
                      <Form.Check
                        inline
                        type="radio"
                        id="sub-agent-credit-adjust-add"
                        name="creditAdjustDirection"
                        value="add"
                        label="Add"
                        checked={creditAdjustDirection === "add"}
                        onChange={() => setCreditAdjustDirection("add")}
                      />
                      <Form.Check
                        inline
                        type="radio"
                        id="sub-agent-credit-adjust-reduce"
                        name="creditAdjustDirection"
                        value="reduce"
                        label="Reduce"
                        checked={creditAdjustDirection === "reduce"}
                        onChange={() => setCreditAdjustDirection("reduce")}
                      />
                    </Form.Group>
                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>
                            <span className="text-danger">*</span>
                            {creditAdjustDirection === "reduce"
                              ? "Reduce Credit Limit By"
                              : "Add-on Credit Limit"}
                          </Form.Label>
                          <Form.Control
                            type="number"
                            name="addCreditLimit"
                            value={creditLimitFormData.addCreditLimit}
                            onChange={handleCreditLimitChange}
                            placeholder={
                              creditAdjustDirection === "reduce"
                                ? "Enter amount to reduce"
                                : "Enter amount to add"
                            }
                            isInvalid={!!creditLimitErrors.addCreditLimit}
                            min="0"
                            step="0.01"
                          />
                          <Form.Control.Feedback type="invalid">
                            {creditLimitErrors.addCreditLimit}
                          </Form.Control.Feedback>
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>
                            <span className="text-danger">*</span>Remarks
                          </Form.Label>
                          <Form.Control
                            as="textarea"
                            rows={3}
                            name="remarks"
                            value={creditLimitFormData.remarks}
                            onChange={handleCreditLimitChange}
                            placeholder="Enter remarks"
                            isInvalid={!!creditLimitErrors.remarks}
                          />
                          <Form.Control.Feedback type="invalid">
                            {creditLimitErrors.remarks}
                          </Form.Control.Feedback>
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>Paid Through</Form.Label>
                          <Form.Select
                            name="paymentMode"
                            value={creditLimitFormData.paymentMode}
                            onChange={handleCreditLimitChange}
                            style={selectStyle}
                          >
                            <option value="">SELECT</option>
                            <option value="CASH">Cash</option>
                            <option value="CREDIT_CARD">Credit Card</option>
                            <option value="BANK_TRANSFER">Bank Transfer</option>
                          </Form.Select>
                        </Form.Group>
                      </Col>
                    </Row>
                    <hr className="my-3" />
                    <Row>
                      <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>Total Credit Limit</Form.Label>
                          <Form.Control
                            type="text"
                            value={creditLimitFormData.totalCreditLimit}
                            readOnly
                            className="bg-light"
                          />
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>Available Credit Limit</Form.Label>
                          <Form.Control
                            type="text"
                            value={creditLimitFormData.availableCreditLimit}
                            readOnly
                            className="bg-light"
                          />
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>Used Credit Limit</Form.Label>
                          <Form.Control
                            type="text"
                            value={creditLimitFormData.usedCreditLimit}
                            readOnly
                            className="bg-light"
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                  </>
                )}

                {/* ---- Temporary Credit Limit — only available once a regular
                    credit limit exists (mirrors the backend guard). ---- */}
                {hasInitialCredit && (
                  <>
                    <hr className="my-3" />
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <span className="fw-bold">Temporary Credit Limit</span>
                      {!showTempCreditForm && (
                        <Button
                          size="sm"
                          variant="outline-primary"
                          className="d-inline-flex align-items-center gap-1"
                          onClick={openAddTempCreditForm}
                        >
                          <FaPlus size={11} /> Add Temporary Credit
                        </Button>
                      )}
                    </div>

                    {showTempCreditForm ? (
                      <div className="border rounded p-3 mb-3 bg-light">
                        <Row>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                <span className="text-danger">*</span>Temporary Credit Limit Amount
                              </Form.Label>
                              <Form.Control
                                type="number"
                                name="amount"
                                value={tempCreditFormData.amount}
                                onChange={handleTempCreditFormChange}
                                placeholder="Enter amount"
                                isInvalid={!!tempCreditErrors.amount}
                                min="0"
                                step="0.01"
                              />
                              <Form.Control.Feedback type="invalid">
                                {tempCreditErrors.amount}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>Remarks</Form.Label>
                              <Form.Control
                                type="text"
                                name="remarks"
                                value={tempCreditFormData.remarks}
                                onChange={handleTempCreditFormChange}
                                placeholder="Optional"
                              />
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                <span className="text-danger">*</span>Start Date &amp; Time
                              </Form.Label>
                              <Form.Control
                                type="datetime-local"
                                name="startDateTime"
                                value={tempCreditFormData.startDateTime}
                                onChange={handleTempCreditFormChange}
                                isInvalid={!!tempCreditErrors.startDateTime}
                              />
                              <Form.Control.Feedback type="invalid">
                                {tempCreditErrors.startDateTime}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                <span className="text-danger">*</span>End Date &amp; Time
                              </Form.Label>
                              <Form.Control
                                type="datetime-local"
                                name="endDateTime"
                                value={tempCreditFormData.endDateTime}
                                onChange={handleTempCreditFormChange}
                                isInvalid={!!tempCreditErrors.endDateTime}
                              />
                              <Form.Control.Feedback type="invalid">
                                {tempCreditErrors.endDateTime}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                        </Row>
                        <div className="d-flex justify-content-end gap-2">
                          <Button
                            size="sm"
                            variant="outline-secondary"
                            onClick={closeTempCreditForm}
                            disabled={tempCreditSaving}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={handleTempCreditSubmit}
                            disabled={tempCreditSaving}
                          >
                            {tempCreditSaving
                              ? "Saving..."
                              : editingTempCreditId
                                ? "Update"
                                : "Save"}
                          </Button>
                        </div>
                      </div>
                    ) : tempCreditsLoading ? (
                      <div className="text-center py-3">
                        <Spinner animation="border" size="sm" />
                      </div>
                    ) : tempCredits.length === 0 ? (
                      <div className="text-muted small mb-3">
                        No temporary credit limits added yet.
                      </div>
                    ) : (
                      <div className="table-responsive mb-3 border rounded" style={{ minWidth: 0 }}>
                        <table className="table align-middle mb-0" style={{ minWidth: "760px" }}>
                          <thead>
                            <tr style={{ fontSize: "0.75rem", backgroundColor: "#f8f9fa" }}>
                              <th className="py-3 px-3">Amount</th>
                              <th className="py-3 px-3">Available</th>
                              <th className="py-3 px-3">Start</th>
                              <th className="py-3 px-3">End</th>
                              <th className="py-3 px-3">Remarks</th>
                              <th className="py-3 px-3">Status</th>
                              <th className="py-3 px-3 text-center" style={{ width: "160px" }}>
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody style={{ fontSize: "0.82rem" }}>
                            {tempCredits.map((row) => (
                              <tr key={row.id}>
                                <td className="py-2 px-3">{row.amount}</td>
                                <td className="py-2 px-3">{row.availableAmount}</td>
                                <td className="py-2 px-3 text-nowrap">
                                  {formatDateTimeDisplay(row.startDateTime)}
                                </td>
                                <td className="py-2 px-3 text-nowrap">
                                  {formatDateTimeDisplay(row.endDateTime)}
                                </td>
                                <td className="py-2 px-3">{row.remarks || "-"}</td>
                                <td className="py-2 px-3">
                                  <Button
                                    size="sm"
                                    variant={row.status === "Active" ? "success" : "outline-secondary"}
                                    className="d-inline-flex align-items-center gap-1"
                                    disabled={tempCreditTogglingId === row.id}
                                    title={row.enabled ? "Click to deactivate" : "Click to activate"}
                                    onClick={() => handleToggleTempCreditEnabled(row)}
                                  >
                                    {row.status === "Active" ? <FaToggleOn /> : <FaToggleOff />}
                                    {row.status}
                                  </Button>
                                </td>
                                <td className="py-2 px-3">
                                  <div className="d-flex justify-content-center gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline-primary"
                                      onClick={() => openEditTempCreditForm(row)}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline-danger"
                                      onClick={() => handleDeleteTempCredit(row)}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={closeCreditLimitModal} disabled={isLoading}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreditLimitSubmit} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    {creditLimitType === "initial" ? "Creating..." : "Updating..."}
                  </>
                ) : creditLimitType === "initial" ? (
                  "Save"
                ) : (
                  "Update"
                )}
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
}
