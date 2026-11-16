import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Form, Row, Col, Button, Spinner } from "react-bootstrap";
import Select from "react-select";
import axiosInstance from "../../../components/AxiosInstance";
import AgentBalanceDisplay from "../../../components/AgentBalanceDisplay";
import Sidebar from "../../../components/Sidebar";
import TopBar from "../../../components/TopBar";
import AdvertisementCarousel from "../../../components/AdvertisementCarousel";
import AgentCreditBalance from "../../../components/AgentCreditBalance";
import QuotationPdfCard from "../../../components/quotation/QuotationPdfCard";
import { FaSearch, FaEdit } from "react-icons/fa";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import "../../../styles/OfflineSearch.css";

// Import Supplier Components
import OfflineHotel from "./OfflineHotel";
import OfflineActivity from "./OfflineActivity";
import OfflineCab from "./OfflineCab";
import OfflineVisa from "./OfflineVisa";
import OfflineMiscellaneous from "./OfflineMiscellaneous";

// ─────────────────────────────────────────────
// Guest Selector Components
// ─────────────────────────────────────────────
function GuestCounter({ label, sub, value, min, max, onChange }) {
  return (
    <div className="rgs-counter-row">
      <div className="rgs-counter-info">
        <span className="rgs-counter-title">{label}</span>
        <span className="rgs-counter-sub">{sub}</span>
      </div>
      <div className="rgs-counter">
        <button
          type="button"
          className="rgs-counter-btn"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
        >
          −
        </button>
        <span className="rgs-counter-val">{value}</span>
        <button
          type="button"
          className="rgs-counter-btn"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
        >
          +
        </button>
      </div>
    </div>
  );
}

function RoomGuestSelector({ value, onChange }) {
  const addRoom = () => onChange([...value, { adults: 1, children: 0, childAges: [] }]);
  const removeRoom = (i) => onChange(value.filter((_, idx) => idx !== i));
  const updateRoom = (i, field, val) => {
    const next = [...value];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };

  return (
    <div className="rgs-wrap">
      {value.map((room, i) => (
        <div key={i} className="rgs-room-card mb-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h6 className="mb-0 fw-bold">Room {i + 1}</h6>
            {value.length > 1 && (
              <Button variant="link" className="text-danger p-0" onClick={() => removeRoom(i)}>
                Remove
              </Button>
            )}
          </div>
          <GuestCounter
            label="Adults"
            sub="Age 12+"
            value={room.adults}
            min={1}
            max={10}
            onChange={(v) => updateRoom(i, "adults", v)}
          />
          <GuestCounter
            label="Children"
            sub="Age 0-11"
            value={room.children}
            min={0}
            max={6}
            onChange={(v) => updateRoom(i, "children", v)}
          />
        </div>
      ))}
      <Button variant="outline-primary" size="sm" onClick={addRoom}>+ Add Another Room</Button>
    </div>
  );
}

// Booking Done By / Currency sit on the card's last row, and
// .search-card-premium has overflow: hidden, so their option lists are
// rendered on document.body (menuPortalTarget) instead of being clipped.
// A portaled menu is outside .react-select-premium, so the menu look from
// OfflineSearch.css is repeated here.
const portalSelectStyles = {
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  menu: (base) => ({
    ...base,
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
  }),
};

const OfflineSearch = () => {
  // Agent logins book under themselves — the backend forces the booking to
  // the logged-in agent, so the manual Agent picker is hidden and the
  // agent-required validation is skipped. currentActiveRole isn't set for
  // single-role logins, so fall back to userRole; admin/super-admin/staff
  // keep the picker exactly as before.
  const activeRole = (sessionStorage.getItem("currentActiveRole") || "")
    .trim()
    .toUpperCase();
  const storedRoles = (sessionStorage.getItem("userRole") || "").toUpperCase();
  const isAgentRole = activeRole
    ? activeRole === "AGENT"
    : storedRoles.includes("AGENT") && !storedRoles.includes("ADMIN");

  const [formData, setFormData] = useState({
    agentId: null,
    refNo: "",
    searchGuest: "",
    customerName: "",
    invoiceNo: "",
    contactNo: "",
    bookingDoneBy: null,
    currency: null,
  });

  const [agents, setAgents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [isLoadingCurrencies, setIsLoadingCurrencies] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commonOrderNote, setCommonOrderNote] = useState("");
  const navigate = useNavigate();

  // Guest state
  const [rooms, setRooms] = useState([{ adults: 1, children: 0, childAges: [] }]);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [errors, setErrors] = useState({});

  // Supplier Section State
  const [mainBasicId, setMainBasicId] = useState(null);
  const [savedInvoiceNo, setSavedInvoiceNo] = useState("");
  // Once the basic booking is created the top criteria form collapses into a
  // sticky summary strip. "Modify Search" flips this true to re-expand it.
  const [isEditingSearch, setIsEditingSearch] = useState(false);
  const [activeSupplier, setActiveSupplier] = useState("Hotel");
  const [supplierEntries, setSupplierEntries] = useState([]);
  const resultsRef = useRef(null);

  // After the form is submitted and the supplier section appears, jump the
  // viewport down a bit so the operator sees the supplier tabs without
  // having to scroll past the form.
  useEffect(() => {
    if (!mainBasicId) return;
    const id = window.setTimeout(() => {
      if (resultsRef.current) {
        resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
    return () => window.clearTimeout(id);
  }, [mainBasicId]);
  const fetchNextInvoiceNumber = async () => {
    try {
      const response = await axiosInstance.get("/api/v1/offline-booking/next-invoice-number");
      if (response.data) {
        setFormData((prev) => ({
          ...prev,
          invoiceNo: response.data,
        }));
      }
    } catch (error) {
      console.error("Error fetching next invoice number:", error);
    }
  };

  // ─────────────────────────────────────────────
  // API: Fetch Agents (Searchable)
  // ─────────────────────────────────────────────
  const fetchAgents = async (searchTerm = "") => {
    setIsLoadingAgents(true);
    try {
      const response = await axiosInstance.get(`/api/agent?page=0&limit=100&activeOnly=true&search=${searchTerm}`);
      const options = (response.data || []).map((agent) => ({
        value: agent.id,
        label: agent.companyName,
      }));
      setAgents(options);
    } catch (error) {
      console.error("Error fetching agents:", error);
      toast.error("Failed to load agents");
    } finally {
      setIsLoadingAgents(false);
    }
  };

  // ─────────────────────────────────────────────
  // API: Fetch Employees
  // ─────────────────────────────────────────────
  const fetchEmployees = async () => {
    setIsLoadingEmployees(true);
    try {
      const response = await axiosInstance.get("/api/employee?page=0&limit=1000");
      const options = (response.data || []).map((emp) => ({
        value: emp.employeeId,
        label: emp.firstName,
      }));
      setEmployees(options);
    } catch (error) {
      console.error("Error fetching employees:", error);
    } finally {
      setIsLoadingEmployees(false);
    }
  };

  // ─────────────────────────────────────────────
  // API: Fetch Currencies
  // ─────────────────────────────────────────────
  const fetchCurrencies = async () => {
    setIsLoadingCurrencies(true);
    try {
      const response = await axiosInstance.get("/api/currency?page=0&limit=100");
      const options = (response.data || []).map((curr) => ({
        value: curr.currencyId,
        label: `${curr.currencyCode} - ${curr.name}`,
      }));
      setCurrencies(options);
    } catch (error) {
      console.error("Error fetching currencies:", error);
    } finally {
      setIsLoadingCurrencies(false);
    }
  };

  useEffect(() => {
    fetchAgents();
    fetchEmployees();
    fetchCurrencies();
    fetchNextInvoiceNumber();
  }, []);

  // ─────────────────────────────────────────────
  // Validation & Helpers
  // ─────────────────────────────────────────────
  const validateForm = () => {
    const newErrors = {};
    if (!isAgentRole && !formData.agentId) newErrors.agentId = "Agent is required";
    if (!formData.refNo.trim()) newErrors.refNo = "REF No is required";
    if (!formData.customerName.trim()) newErrors.customerName = "Customer Name is required";
    if (!formData.contactNo.trim()) newErrors.contactNo = "Contact No is required";
    if (!formData.bookingDoneBy) newErrors.bookingDoneBy = "Booking Done By is required";
    if (!formData.currency) newErrors.currency = "Currency is required";
    return newErrors;
  };

  // ─────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => { const { [name]: _, ...rest } = prev; return rest; });
  };

  const handleSelectChange = (name, selectedOption) => {
    setFormData((prev) => ({ ...prev, [name]: selectedOption }));
    if (errors[name]) setErrors((prev) => { const { [name]: _, ...rest } = prev; return rest; });
  };

  // dd-mm-yyyy for the Quotation PDF card (fork feature). HBS dropped this
  // helper from its own submit payload, but the quotation rows still use it.
  const formatDate = (dateString) => {
    if (!dateString) return "";
    const [year, month, day] = dateString.split("-");
    return `${day}-${month}-${year}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const formErrors = validateForm();
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      return;
    }

    setIsSubmitting(true);

    const payload = {
      supplierMainBasicId: "0",
      agentId: formData.agentId?.value || "1",
      customerName: formData.customerName,
      trn: "",
      refNo: formData.refNo,
      childAge: ["0"],
      adult: String(rooms.reduce((acc, r) => acc + r.adults, 0)),
      child: String(rooms.reduce((acc, r) => acc + r.children, 0)),
      invoiceNumber: formData.invoiceNo,
      isDeleted: false,
      contactNo: formData.contactNo,
      employeeId: formData.bookingDoneBy?.value || "1",
      currency: formData.currency?.label?.split(" - ")[0] || "AED",
    };

    try {
      const response = await axiosInstance.post(
        "/api/v1/offline-booking/supplier-main-basic/save",
        payload
      );

      if (response.data && response.data !== 0) {
        toast.success("basic supplier details added successfully");
        setMainBasicId(response.data); // Store the returned ID
        setSavedInvoiceNo(formData.invoiceNo); // Keep the invoice number used for this booking
        setIsEditingSearch(false); // collapse the criteria form into the summary strip
        fetchNextInvoiceNumber(); // Get the next one for the next possible booking
        setErrors({});
      } else {
        toast.error("Failed to add supplier details");
      }
    } catch (error) {
      console.error("Error saving offline booking:", error);
      toast.error("An error occurred while saving");
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchSupplierEntries = async () => {
    if (!mainBasicId || !savedInvoiceNo) return;
    try {
      const res = await axiosInstance.get(`/api/v1/offline-booking/list/${savedInvoiceNo}/${mainBasicId}`);
      setSupplierEntries(res.data || []);
    } catch (err) {
      console.error("Error fetching supplier entries:", err);
    }
  };

  useEffect(() => {
    if (mainBasicId && savedInvoiceNo) {
      fetchSupplierEntries();
    }
  }, [mainBasicId, savedInvoiceNo]);

  const handleAddEntry = () => {
    fetchSupplierEntries();
  };

  // Edit button in the line table (Miscellaneous rows only): the row is
  // loaded into the Miscellaneous form, which saves it back under its own
  // miscellaneousId instead of adding a new line.
  const [editingMiscEntry, setEditingMiscEntry] = useState(null);

  // A new basic booking (Modify Search → ADD) starts with no line being edited.
  useEffect(() => {
    setEditingMiscEntry(null);
  }, [mainBasicId]);

  const handleEditMiscEntry = (entry) => {
    setActiveSupplier("Miscellaneous");
    setEditingMiscEntry(entry);
    if (resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleMiscSaved = () => {
    setEditingMiscEntry(null);
    handleAddEntry();
  };

  // Trash button in the line table: soft-deletes the line on the server
  // (DELETE /api/v1/offline-booking/line/{id}), then reloads the table so
  // the totals below follow.
  const [deletingLineId, setDeletingLineId] = useState(null);

  const handleDeleteEntry = async (entry) => {
    const result = await Swal.fire({
      title: "Delete this item?",
      text: `${entry.supplierType || "Item"}${entry.description ? ` – ${entry.description}` : ""}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
    });
    if (!result.isConfirmed) return;

    setDeletingLineId(entry.id);
    try {
      await axiosInstance.delete(`/api/v1/offline-booking/line/${entry.id}`);
      toast.success("Item deleted");
      if (editingMiscEntry && editingMiscEntry.id === entry.id) setEditingMiscEntry(null);
      await fetchSupplierEntries();
    } catch (error) {
      console.error("Error deleting offline booking line:", error);
      toast.error(error.response?.data?.message || "Failed to delete item");
    } finally {
      setDeletingLineId(null);
    }
  };

  const handleFinalSubmit = async () => {
    if (!mainBasicId) {
      toast.error("Please add basic details first");
      return;
    }
    if (supplierEntries.length === 0) {
      toast.error("Please add at least one supplier entry");
      return;
    }

    try {
      setIsSubmitting(true);
      
      const totalQty = supplierEntries.reduce((sum, entry) => sum + (parseFloat(entry.quantity) || 0), 0);
      const subTot = supplierEntries.reduce((sum, entry) => sum + (parseFloat(entry.subTotal) || 0), 0);

      const payload = {
        totalQuantity: String(totalQty),
        subTotal: String(subTot),
        grandTotal: String(subTot), // Assuming grandTotal is same as subTotal for now
        commonOrderNote: commonOrderNote,
        invoiceNumber: savedInvoiceNo
      };

      const response = await axiosInstance.post(`/api/v1/offline-booking/final-submit`, payload);
      if (response.status === 200) {
        toast.success("Booking submitted successfully");
        navigate("/booking-details/offline-booking-list");
      }
    } catch (error) {
      console.error("Error final submitting:", error);
      toast.error("Failed to submit booking");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderSupplierForm = () => {
    const commonProps = { 
      mainBasicId, 
      invoiceNo: savedInvoiceNo, 
      onAdd: handleAddEntry 
    };
    switch (activeSupplier) {
      case "Hotel":
        return <OfflineHotel {...commonProps} />;
      case "Activity":
        return <OfflineActivity {...commonProps} />;
      case "Cab":
        return <OfflineCab {...commonProps} />;
      case "Visa":
        return <OfflineVisa {...commonProps} />;
      case "Miscellaneous":
        return (
          <OfflineMiscellaneous
            {...commonProps}
            onAdd={handleMiscSaved}
            editingEntry={editingMiscEntry}
            onCancelEdit={() => setEditingMiscEntry(null)}
          />
        );
      default:
        return null;
    }
  };

  // Debounce for agent search
  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  const debouncedFetchAgents = useCallback(
    debounce((inputValue) => fetchAgents(inputValue), 500),
    []
  );

  // Once the basic booking record exists the criteria form collapses into the
  // sticky summary strip (the supplier-entries panel below stays visible),
  // unless the user chose to modify the criteria.
  const collapseSearch = !!mainBasicId && !isEditingSearch;

  // ── Quotation PDF ─────────────────────────────────────────────────────
  // Quotes exactly what the summary table and totals below show: one price
  // line per supplier entry at its Sub Total (selling price, tax included)
  // and the Grand Total. Amounts are in AED, as every supplier form states.
  const buildOfflineQuotationPayload = () => {
    if (!mainBasicId || supplierEntries.length === 0) return null;
    const adults = rooms.reduce((a, r) => a + r.adults, 0);
    const children = rooms.reduce((a, r) => a + r.children, 0);
    const grandTotal = supplierEntries.reduce(
      (sum, entry) => sum + (parseFloat(entry.subTotal) || 0),
      0,
    );
    const serviceTypes = Array.from(
      new Set(supplierEntries.map((entry) => entry.supplierType).filter(Boolean)),
    );
    return {
      bookingType: "OFFLINE",
      agentId: Number(formData.agentId?.value) || null,
      currency: "AED",
      serviceName: "Offline Booking",
      serviceSubtitle: serviceTypes.length
        ? `Services: ${serviceTypes.join(", ")}`
        : "",
      customerName: formData.customerName || null,
      customerMobile: formData.contactNo || null,
      details: [
        { label: "Check-in", value: formatDate(formData.checkIn) },
        { label: "Check-out", value: formatDate(formData.checkOut) },
        {
          label: "Guests",
          value: `${adults} Adult${adults === 1 ? "" : "s"}${
            children ? `, ${children} Child${children === 1 ? "" : "ren"}` : ""
          }`,
        },
        { label: "Rooms", value: String(rooms.length) },
        { label: "Reference No.", value: formData.refNo || "" },
      ],
      priceItems: supplierEntries.map((entry) => ({
        description: [entry.supplierType, entry.hotelName]
          .filter(Boolean)
          .join(" - "),
        details: [entry.description, entry.quantity ? `Qty: ${entry.quantity}` : ""]
          .filter(Boolean)
          .join("\n"),
        amount: parseFloat(entry.subTotal) || 0,
      })),
      totalAmount: grandTotal,
    };
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 offline-search-container hs-page">
          {/* ── Search Card + Ads ── */}
          <div className="d-flex gap-3 align-items-start mb-4 hs-search-ads-row">
            <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <Card className="search-card-premium animate-fade-in-up">
            <Card.Body className="p-2">
              {/* ── Collapsed sticky summary strip ──
                  Shown once the basic booking exists. "Modify Search"
                  re-expands the criteria form by flipping isEditingSearch. */}
              {collapseSearch && (
                <div className="hs-summary-bar">
                  <div className="hs-summary-chips">
                    {formData.customerName && (
                      <span className="hs-summary-chip hs-summary-chip-main">
                        {formData.customerName}
                      </span>
                    )}
                    <span className="hs-summary-chip">
                      {rooms.reduce((a, r) => a + r.adults, 0)} adults
                      {rooms.reduce((a, r) => a + r.children, 0)
                        ? `, ${rooms.reduce((a, r) => a + r.children, 0)} child`
                        : ""}{" "}
                      · {rooms.length} room{rooms.length > 1 ? "s" : ""}
                    </span>
                    {savedInvoiceNo && (
                      <span className="hs-summary-chip">Inv {savedInvoiceNo}</span>
                    )}
                  </div>
                  <Button
                    type="button"
                    className="hs-summary-modify"
                    onClick={() => {
                      setIsEditingSearch(true);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <FaSearch className="me-2" />
                    Modify Search
                  </Button>
                </div>
              )}

              {!collapseSearch && (
              <div className="hs-form-expand">
              <div className="mb-3 d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div>
                  <h3 className="card-title-modern">Offline Booking</h3>
                  <p className="text-muted small">Search and add criteria for offline bookings</p>
                </div>
                {/* Agent logins see their available credit balance at the
                    right end of the heading row (renders nothing for other
                    roles). */}
                <AgentCreditBalance />
              </div>

              <Form onSubmit={handleSubmit}>
                <div className="mb-2">
                  {/* <h6 className="fw-bold text-primary mb-3">Search Criteria</h6> */}
                  <Row className="g-4">
                    {/* Search Agent */}
                    {!isAgentRole && (
                    <Col lg={3}>
                      <Form.Group>
                        <Form.Label className="form-label-modern">Search Agent <span className="text-danger">*</span></Form.Label>
                        <Select
                          className={`react-select-premium ${errors.agentId ? "is-invalid-select" : ""}`}
                          classNamePrefix="react-select"
                          options={agents}
                          value={formData.agentId}
                          onChange={(opt) => handleSelectChange("agentId", opt)}
                          onInputChange={(val) => debouncedFetchAgents(val)}
                          isLoading={isLoadingAgents}
                          placeholder="Select Agent..."
                          isSearchable
                          isClearable
                          menuPortalTarget={document.body}
                          menuPosition="fixed"
                          styles={{
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          }}
                        />
                        {errors.agentId && <div className="text-danger small mt-1">{errors.agentId}</div>}
                        <AgentBalanceDisplay agentId={formData.agentId?.value} />
                      </Form.Group>
                    </Col>
                    )}

                    {/* REF NO */}
                    <Col lg={3}>
                      <Form.Group>
                        <Form.Label className="form-label-modern">REF NO <span className="text-danger">*</span></Form.Label>
                        <Form.Control
                          type="text"
                          className={`form-control-premium ${errors.refNo ? "is-invalid" : ""}`}
                          name="refNo"
                          value={formData.refNo}
                          onChange={handleInputChange}
                          placeholder="REF NO"
                        />
                        {errors.refNo && <div className="text-danger small mt-1">{errors.refNo}</div>}
                      </Form.Group>
                    </Col>

                     {/* Search Guest – Rooms & Guests selector */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="form-label-modern">Search Guest</Form.Label>
                      <Button
                        variant="outline-primary"
                        className="w-100 text-start rooms-summary-btn-modern"
                        type="button"
                        onClick={() => setRoomsOpen((o) => !o)}
                      >
                        {rooms.reduce((a, r) => a + r.adults, 0)} adult{rooms.reduce((a, r) => a + r.adults, 0) !== 1 ? "s" : ""}
                        {rooms.reduce((a, r) => a + r.children, 0) > 0
                          ? `, ${rooms.reduce((a, r) => a + r.children, 0)} child`
                          : ""}{" "}
                        · {rooms.length} room{rooms.length > 1 ? "s" : ""}
                        <span className="float-end">{roomsOpen ? "▴" : "▾"}</span>
                      </Button>
                    </Form.Group>
                  </Col>

                  {/* Customer Name */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="form-label-modern">Customer Name <span className="text-danger">*</span></Form.Label>
                      <Form.Control
                        type="text"
                        className={`form-control-premium ${errors.customerName ? "is-invalid" : ""}`}
                        name="customerName"
                        value={formData.customerName}
                        onChange={handleInputChange}
                        placeholder="Customer Name"
                      />
                      {errors.customerName && <div className="text-danger small mt-1">{errors.customerName}</div>}
                    </Form.Group>
                  </Col>

                  </Row>

                {roomsOpen && (
                  <Row className="g-3 mt-3">
                    <Col md={12}>
                      <RoomGuestSelector value={rooms} onChange={setRooms} />
                    </Col>
                  </Row>
                )}
                </div>

                <Row className="g-4 mb-5">
                   {/* Invoice No */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="form-label-modern">Invoice No</Form.Label>
                      <Form.Control
                        type="text"
                        className="form-control-premium"
                        name="invoiceNo"
                        value={formData.invoiceNo}
                        onChange={handleInputChange}
                        placeholder="Invoice No"
                        readOnly
                      />
                    </Form.Group>
                  </Col>

                  {/* Contact No */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="form-label-modern">Contact No <span className="text-danger">*</span></Form.Label>
                      <Form.Control
                        type="text"
                        className={`form-control-premium ${errors.contactNo ? "is-invalid" : ""}`}
                        name="contactNo"
                        value={formData.contactNo}
                        onChange={handleInputChange}
                        placeholder="Contact Number"
                      />
                      {errors.contactNo && <div className="text-danger small mt-1">{errors.contactNo}</div>}
                    </Form.Group>
                  </Col>

                  {/* Booking Done By */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="form-label-modern">Booking Done By <span className="text-danger">*</span></Form.Label>
                      <Select
                        className={`react-select-premium ${errors.bookingDoneBy ? "is-invalid-select" : ""}`}
                        classNamePrefix="react-select"
                        options={employees}
                        value={formData.bookingDoneBy}
                        onChange={(opt) => handleSelectChange("bookingDoneBy", opt)}
                        isLoading={isLoadingEmployees}
                        placeholder="Select Employee..."
                        isSearchable
                        menuPortalTarget={document.body}
                        styles={portalSelectStyles}
                      />
                      {errors.bookingDoneBy && <div className="text-danger small mt-1">{errors.bookingDoneBy}</div>}
                    </Form.Group>
                  </Col>

                  {/* Currency */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="form-label-modern">Currency <span className="text-danger">*</span></Form.Label>
                      <Select
                        className={`react-select-premium ${errors.currency ? "is-invalid-select" : ""}`}
                        classNamePrefix="react-select"
                        options={currencies}
                        value={formData.currency}
                        onChange={(opt) => handleSelectChange("currency", opt)}
                        isLoading={isLoadingCurrencies}
                        placeholder="Select Currency..."
                        isSearchable
                        menuPortalTarget={document.body}
                        styles={portalSelectStyles}
                      />
                      {errors.currency && <div className="text-danger small mt-1">{errors.currency}</div>}
                    </Form.Group>
                  </Col>
                </Row>

                <div className="d-flex justify-content-center pt-0">
                  <Button
                    type="submit"
                    className="btn-add-premium d-flex align-items-center gap-2"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Spinner animation="border" size="sm" />
                        Processing...
                      </>
                    ) : (
                      "Add"
                    )}
                  </Button>
                </div>
              </Form>
              </div>
              )}

              {/* Dynamic Supplier Section */}
              {mainBasicId && (
                <div ref={resultsRef} className="mt-3 pt-2 border-top animate-fade-in">
                  <div className="supplier-tabs-container">
                    <Row>
                      <Col lg={2} md={3} className="border-end">
                        <div className="supplier-sidebar">
                          <h6 className="supplier-sidebar-title">SUPPLIER TYPES</h6>
                          <div className="supplier-nav-list">
                            {["Hotel", "Activity", "Cab", "Visa", "Miscellaneous"].map((type) => (
                              <button
                                key={type}
                                type="button"
                                className={`supplier-nav-item ${activeSupplier === type ? "active" : ""}`}
                                onClick={() => {
                                  setActiveSupplier(type);
                                  // Leaving the Miscellaneous tab drops an unsaved edit.
                                  if (type !== "Miscellaneous") setEditingMiscEntry(null);
                                }}
                              >
                                <span className="chevron-icon">
                                  {activeSupplier === type ? "▾" : "▸"}
                                </span>
                                {type}
                              </button>
                            ))}
                          </div>
                        </div>
                      </Col>
                      <Col lg={10} md={9}>
                        <div className="supplier-form-wrapper px-3">
                          {renderSupplierForm()}
                        </div>
                      </Col>
                    </Row>
                  </div>

                  {/* Summary Table */}
                  <div className="mt-3">
                    <div className="table-responsive summary-table-container">
                      <table className="table table-hover align-middle summary-table-modern">
                        <thead>
                          <tr>
                            <th>S.N</th>
                            <th>Supplier Type</th>
                            <th>Description</th>
                            <th>Qty</th>
                            <th>Unit Price</th>
                            <th>Selling Price</th>
                            <th>Tax (%)</th>
                            <th>Tax Amount</th>
                            <th>Sub Total</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {supplierEntries.length > 0 ? (
                            supplierEntries.map((entry, idx) => (
                              <tr
                                key={idx}
                                className={editingMiscEntry && editingMiscEntry.id === entry.id ? "table-active" : ""}
                              >
                                <td>{idx + 1}</td>
                                <td>{entry.supplierType}</td>
                                <td>{entry.description}</td>
                                <td>{entry.quantity}</td>
                                <td>{entry.unitPrice}</td>
                                <td>{entry.sellingPrice}</td>
                                <td>{entry.tax}%</td>
                                <td>{entry.taxAmount}</td>
                                <td>{entry.subTotal}</td>
                                <td className="text-nowrap">
                                  {/* Edit: Miscellaneous lines only. Rows from a backend
                                      that doesn't send miscellaneousId get no button, so
                                      a save can't add a duplicate line instead of updating. */}
                                  {entry.supplierType === "Miscellaneous" && entry.miscellaneousId ? (
                                    <Button
                                      variant="link"
                                      className="p-0 me-3 text-primary"
                                      title="Edit"
                                      aria-label="Edit"
                                      disabled={deletingLineId === entry.id}
                                      onClick={() => handleEditMiscEntry(entry)}
                                    >
                                      <FaEdit />
                                    </Button>
                                  ) : null}
                                  <Button
                                    variant="link"
                                    className="p-0 text-danger"
                                    title="Delete"
                                    aria-label="Delete"
                                    disabled={deletingLineId === entry.id}
                                    onClick={() => handleDeleteEntry(entry)}
                                  >
                                    {deletingLineId === entry.id ? (
                                      <Spinner animation="border" size="sm" />
                                    ) : (
                                      "🗑"
                                    )}
                                  </Button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="10" className="text-center py-4 text-muted">
                                No entries added yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Summary Totals and Notes */}
                  <div className="mt-3 p-3 border rounded-3 bg-white shadow-sm">
                    <Row className="g-4">
                      <Col md={8}>
                        <Form.Group>
                          <Form.Label className="fw-bold text-secondary">Order Notes</Form.Label>
                          <Form.Control
                            as="textarea"
                            rows={4}
                            placeholder="Order Notes If Any..."
                            value={commonOrderNote}
                            onChange={(e) => setCommonOrderNote(e.target.value)}
                            style={{ borderRadius: "8px", border: "1px solid #ced4da" }}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <div className="d-flex flex-column gap-3">
                          <div>
                            <Form.Label className="small fw-semibold text-muted mb-1">Total Quantity</Form.Label>
                            <Form.Control
                              type="text"
                              readOnly
                              value={supplierEntries.reduce((sum, entry) => sum + (parseFloat(entry.quantity) || 0), 0)}
                              className="bg-light text-center fw-bold"
                              style={{ height: "45px", borderRadius: "8px" }}
                            />
                          </div>
                          <div>
                            <Form.Label className="small fw-semibold text-muted mb-1">Sub Total</Form.Label>
                            <Form.Control
                              type="text"
                              readOnly
                              value={supplierEntries.reduce((sum, entry) => sum + (parseFloat(entry.subTotal) || 0), 0).toFixed(2)}
                              className="bg-light text-center fw-bold"
                              style={{ height: "45px", borderRadius: "8px" }}
                            />
                          </div>
                          <div>
                            <Form.Label className="small fw-semibold text-muted mb-1">Grand Total</Form.Label>
                            <Form.Control
                              type="text"
                              readOnly
                              value={supplierEntries.reduce((sum, entry) => sum + (parseFloat(entry.subTotal) || 0), 0).toFixed(2)}
                              className="bg-light text-center fw-bold"
                              style={{ height: "45px", borderRadius: "8px", border: "1px solid #dee2e6" }}
                            />
                          </div>
                        </div>
                      </Col>
                    </Row>
                  </div>

                  <div className="d-flex justify-content-end mt-3 pt-3">
                    {/* Quotation — this flow has no price sidebar, so it sits
                        beside Submit, under the Grand Total it quotes. */}
                    <QuotationPdfCard
                      variant="button"
                      className="me-2 align-self-center"
                      buildPayload={buildOfflineQuotationPayload}
                      disabled={isSubmitting || supplierEntries.length === 0}
                    />
                    <Button
                      variant="success"
                      className="btn-final-submit-premium d-flex align-items-center gap-2"
                      onClick={handleFinalSubmit}
                      disabled={isSubmitting || supplierEntries.length === 0}
                      style={{
                        padding: "12px 40px",
                        fontSize: "1.1rem",
                        fontWeight: "600",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                        transition: "all 0.3s ease"
                      }}
                    >
                      {isSubmitting ? (
                        <>
                          <Spinner animation="border" size="sm" />
                          Submitting...
                        </>
                      ) : (
                        <>Submit</>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>
            </div>
            {/* Ads carousel — only before the booking is created. Hidden once
                the supplier-entries panel takes over the working area. */}
            {!mainBasicId && <AdvertisementCarousel />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default OfflineSearch;