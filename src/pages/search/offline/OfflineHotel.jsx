import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Form, Button, Spinner, Modal } from "react-bootstrap";
import Select from "react-select";
import axiosInstance from "../../../components/AxiosInstance";
import { toast } from "react-hot-toast";

const initialForm = {
  supplier: null,
  hotel: null,
  roomType: "",
  mealPlan: null,
  addOn: null,
  bookingCode: "",
  noOfRooms: "",
  unitPrice: "",
  tax: "",
  sellingPrice: "",
  checkIn: "",
  checkOut: "",
  summary: "",
};

const OfflineHotel = ({ mainBasicId, invoiceNo, onAdd }) => {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [supplierOptions, setSupplierOptions] = useState([]);
  const [hotelOptions, setHotelOptions] = useState([]);
  const [mealPlanOptions, setMealPlanOptions] = useState([]);

  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);
  const [isLoadingHotels, setIsLoadingHotels] = useState(false);
  const [isLoadingMealPlans, setIsLoadingMealPlans] = useState(false);

  // "+" next to HOTEL — popup to enter a hotel that isn't in the hotel list.
  // The typed name is saved on this offline line only (hotelId sent blank);
  // the backend falls back to the name for the list, description and PDF.
  const [showAddHotel, setShowAddHotel] = useState(false);
  const [newHotelName, setNewHotelName] = useState("");
  const [newHotelError, setNewHotelError] = useState("");
  const [hotelInput, setHotelInput] = useState("");

  // ─────────────────────────────────────────────
  // API Fetchers
  // ─────────────────────────────────────────────
  const fetchSuppliers = async (search = "") => {
    setIsLoadingSuppliers(true);
    try {
      const res = await axiosInstance.get(`/api/supplier?page=0&limit=10&search=${search}`);
      const options = (res.data || []).map(s => ({ value: s.supplierId, label: s.name }));
      setSupplierOptions(options);
    } catch (err) { console.error(err); }
    finally { setIsLoadingSuppliers(false); }
  };

  const fetchHotels = async (search = "") => {
    setIsLoadingHotels(true);
    try {
      const res = await axiosInstance.get(`/api/hotels?page=0&limit=20&search=${search}`);
      const options = (res.data || []).map(h => ({ value: h.id, label: h.hotelName }));
      setHotelOptions(options);
    } catch (err) { console.error(err); }
    finally { setIsLoadingHotels(false); }
  };

  const fetchMealPlans = async () => {
    setIsLoadingMealPlans(true);
    try {
      const res = await axiosInstance.get(`/api/roomType?page=0&limit=10`);
      const options = (res.data || []).map(r => ({ value: r.roomtypeId, label: r.name }));
      setMealPlanOptions(options);
    } catch (err) { console.error(err); }
    finally { setIsLoadingMealPlans(false); }
  };

  // Debounce helpers
  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  const debouncedFetchSuppliers = useCallback(debounce(fetchSuppliers, 500), []);
  const debouncedFetchHotels = useCallback(debounce(fetchHotels, 500), []);

  useEffect(() => {
    fetchSuppliers();
    fetchHotels();
    fetchMealPlans();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => { const { [name]: _, ...rest } = prev; return rest; });
  };

  const handleSelectChange = (name, val) => {
    setForm(prev => ({ ...prev, [name]: val }));
    if (errors[name]) setErrors(prev => { const { [name]: _, ...rest } = prev; return rest; });
  };

  const openAddHotel = () => {
    // Prefill with whatever was typed into the Hotel search box.
    setNewHotelName(hotelInput.trim());
    setNewHotelError("");
    setShowAddHotel(true);
  };

  const closeAddHotel = () => {
    setShowAddHotel(false);
    setNewHotelName("");
    setNewHotelError("");
  };

  const handleSaveNewHotel = () => {
    const name = newHotelName.trim();
    if (!name) {
      setNewHotelError("Hotel name is required");
      return;
    }
    // Typed name matches a listed hotel — select that one instead of
    // creating a duplicate manual entry.
    const existing = hotelOptions.find(
      (o) => (o.label || "").trim().toLowerCase() === name.toLowerCase()
    );
    const option = existing || { value: `manual-${Date.now()}`, label: name, isManual: true };
    if (!existing) setHotelOptions((prev) => [option, ...prev]);
    handleSelectChange("hotel", option);
    closeAddHotel();
  };

  // Auto-calculate selling price from unit price + tax
  const handleUnitPriceChange = (e) => {
    const unitPrice = e.target.value;
    const tax = parseFloat(form.tax) || 0;
    const taxAmt = (parseFloat(unitPrice) || 0) * (tax / 100);
    const selling = ((parseFloat(unitPrice) || 0) + taxAmt).toFixed(2);
    setForm((prev) => ({
      ...prev,
      unitPrice,
      sellingPrice: unitPrice ? selling : "",
    }));
    if (errors.unitPrice) setErrors((prev) => { const { unitPrice: _, ...rest } = prev; return rest; });
  };

  const handleTaxChange = (e) => {
    const tax = e.target.value;
    const unit = parseFloat(form.unitPrice) || 0;
    const taxAmt = unit * ((parseFloat(tax) || 0) / 100);
    const selling = (unit + taxAmt).toFixed(2);
    setForm((prev) => ({
      ...prev,
      tax,
      sellingPrice: form.unitPrice ? selling : "",
    }));
  };

  // Min checkout = day after checkin
  const getMinCheckOut = () => {
    if (!form.checkIn) return "";
    const d = new Date(form.checkIn);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  };

  const validate = () => {
    const e = {};
    if (!form.supplier) e.supplier = "Supplier is required";
    if (!form.hotel) e.hotel = "Hotel is required";
    if (!form.roomType.trim()) e.roomType = "Room Type is required";
    if (!form.mealPlan) e.mealPlan = "Meal Plan is required";
    if (!form.noOfRooms.trim()) e.noOfRooms = "No of Rooms is required";
    if (!form.unitPrice.trim()) e.unitPrice = "Unit Price is required";
    if (!form.checkIn) e.checkIn = "Check In is required";
    if (!form.checkOut) e.checkOut = "Check Out is required";
    if (!form.bookingCode.trim()) e.bookingCode = "Booking Code is required";
    if (!form.tax.trim()) e.tax = "Tax is required";
    return e;
  };

  const formatDatePayload = (dateStr) => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formErrors = validate();
    if (Object.keys(formErrors).length > 0) { setErrors(formErrors); return; }

    setIsSubmitting(true);
    const payload = {
      supplierHotelTypeId: "0",
      supplierMainBasicId: String(mainBasicId),
      supplierId: String(form.supplier?.value),
      roomType: form.roomType,
      mealPlanTypeId: String(form.mealPlan?.value),
      qty: String(form.noOfRooms),
      unitPrice: String(form.unitPrice),
      taxPercent: String(form.tax || "0"),
      sellingPrice: String(form.sellingPrice),
      summary: form.summary || "",
      invoiceNumber: invoiceNo,
      isDeleted: false,
      hotelName: form.hotel?.label,
      hotelcheckIndate: formatDatePayload(form.checkIn),
      hotelcheckoutdate: formatDatePayload(form.checkOut),
      bedType: form.addOn?.value || "",
      // Manually added hotels have no master id — send blank so the
      // backend skips the hotel lookup and keeps hotelName.
      hotelId: form.hotel?.isManual ? "" : String(form.hotel?.value ?? ""),
      bookingCode: form.bookingCode,
    };

    try {
      const response = await axiosInstance.post(
        "/api/v1/offline-booking/supplier-hotel-type/save",
        payload
      );
      if (response.data && response.data !== 0) {
        toast.success("Hotel details added successfully");
        if (onAdd) {
          onAdd(); // Trigger refresh in parent
        }
        setForm(initialForm);
        setErrors({});
      } else {
        toast.error("Failed to add hotel details");
      }
    } catch (error) {
      console.error("Error saving hotel:", error);
      toast.error("An error occurred while saving");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputCls = (field) =>
    `form-control-premium${errors[field] ? " is-invalid" : ""}`;

  return (
    <div className="supplier-form-panel">
      <h5 className="supplier-form-title">Hotel</h5>
      <Form onSubmit={handleSubmit}>
        <Row className="g-3">
          {/* Supplier */}
          <Col lg={4} md={6}>
            <Form.Group>
              <Form.Label className="form-label-modern">Supplier</Form.Label>
              <Select
                className={`react-select-premium ${errors.supplier ? "is-invalid-select" : ""}`}
                classNamePrefix="react-select"
                options={supplierOptions}
                value={form.supplier}
                onChange={(opt) => handleSelectChange("supplier", opt)}
                onInputChange={(val) => debouncedFetchSuppliers(val)}
                isLoading={isLoadingSuppliers}
                placeholder="SELECT"
                isSearchable
              />
              {errors.supplier && <div className="text-danger small mt-1">{errors.supplier}</div>}
            </Form.Group>
          </Col>

          {/* Hotel */}
          <Col lg={4} md={6}>
            <Form.Group>
              <div className="d-flex justify-content-between align-items-center mb-1">
                <Form.Label className="form-label-modern mb-0">Hotel</Form.Label>
                <Button
                  variant="primary"
                  type="button"
                  className="p-0 d-flex align-items-center justify-content-center"
                  style={{ width: "20px", height: "20px", fontSize: "12px", borderRadius: "4px" }}
                  title="Add Hotel"
                  onClick={openAddHotel}
                >
                  +
                </Button>
              </div>
              <Select
                className={`react-select-premium ${errors.hotel ? "is-invalid-select" : ""}`}
                classNamePrefix="react-select"
                options={hotelOptions}
                value={form.hotel}
                onChange={(opt) => handleSelectChange("hotel", opt)}
                onInputChange={(val, meta) => {
                  if (meta?.action === "input-change") setHotelInput(val);
                  debouncedFetchHotels(val);
                }}
                isLoading={isLoadingHotels}
                placeholder="SELECT"
                isSearchable
              />
              {errors.hotel && <div className="text-danger small mt-1">{errors.hotel}</div>}
            </Form.Group>
          </Col>

          {/* Room Type */}
          <Col lg={4} md={6}>
            <Form.Group>
              <Form.Label className="form-label-modern">Room Type</Form.Label>
              <Form.Control
                type="text"
                className="form-control-premium"
                name="roomType"
                value={form.roomType}
                onChange={handleChange}
                placeholder="Room Type"
              />
            </Form.Group>
          </Col>

          {/* Meal Plan */}
          <Col lg={4} md={6}>
            <Form.Group>
              <Form.Label className="form-label-modern">Meal Plan</Form.Label>
              <Select
                className={`react-select-premium ${errors.mealPlan ? "is-invalid-select" : ""}`}
                classNamePrefix="react-select"
                options={mealPlanOptions}
                value={form.mealPlan}
                onChange={(opt) => handleSelectChange("mealPlan", opt)}
                isLoading={isLoadingMealPlans}
                placeholder="SELECT"
              />
              {errors.mealPlan && <div className="text-danger small mt-1">{errors.mealPlan}</div>}
            </Form.Group>
          </Col>

          {/* Add On */}
          <Col lg={4} md={6}>
            <Form.Group>
              <Form.Label className="form-label-modern">Add On</Form.Label>
              <Select
                className="react-select-premium"
                classNamePrefix="react-select"
                options={[
                  { value: "Extra Per Person", label: "Extra Per Person" },
                  { value: "Child with bed", label: "Child with bed" },
                  { value: "Child without bed", label: "Child without bed" },
                  { value: "Tourism Dhirham", label: "Tourism Dhirham" },
                ]}
                value={form.addOn}
                onChange={(opt) => handleSelectChange("addOn", opt)}
                placeholder="SELECT"
              />
            </Form.Group>
          </Col>

          {/* Booking Code */}
          <Col lg={4} md={6}>
            <Form.Group>
              <Form.Label className="form-label-modern">Booking Code</Form.Label>
              <Form.Control
                type="text"
                className={inputCls("bookingCode")}
                name="bookingCode"
                value={form.bookingCode}
                onChange={handleChange}
                placeholder="Booking Code"
              />
              {errors.bookingCode && <div className="text-danger small mt-1">{errors.bookingCode}</div>}
            </Form.Group>
          </Col>

          {/* No of Rooms */}
          <Col lg={4} md={6}>
            <Form.Group>
              <Form.Label className="form-label-modern">No Of Rooms</Form.Label>
              <Form.Control
                type="number"
                min="1"
                className={inputCls("noOfRooms")}
                name="noOfRooms"
                value={form.noOfRooms}
                onChange={handleChange}
                placeholder="No Of Rooms"
              />
              {errors.noOfRooms && <div className="text-danger small mt-1">{errors.noOfRooms}</div>}
            </Form.Group>
          </Col>

          {/* Unit Price */}
          <Col lg={4} md={6}>
            <Form.Group>
              <Form.Label className="form-label-modern">Unit Price (in AED)</Form.Label>
              <Form.Control
                type="number"
                min="0"
                step="0.01"
                className={inputCls("unitPrice")}
                name="unitPrice"
                value={form.unitPrice}
                onChange={handleUnitPriceChange}
                placeholder="Unit Price"
              />
              {errors.unitPrice && <div className="text-danger small mt-1">{errors.unitPrice}</div>}
            </Form.Group>
          </Col>

          {/* Tax */}
          <Col lg={4} md={6}>
            <Form.Group>
              <Form.Label className="form-label-modern">Tax (%)</Form.Label>
              <Form.Control
                type="number"
                min="0"
                step="0.01"
                className="form-control-premium"
                name="tax"
                value={form.tax}
                onChange={handleTaxChange}
                placeholder="Tax"
              />
            </Form.Group>
          </Col>

          {/* Selling Price */}
          <Col lg={4} md={6}>
            <Form.Group>
              <Form.Label className="form-label-modern">Selling Price (in AED)</Form.Label>
              <Form.Control
                type="number"
                min="0"
                step="0.01"
                className="form-control-premium"
                name="sellingPrice"
                value={form.sellingPrice}
                onChange={handleChange}
                placeholder="Selling Price"
              />
            </Form.Group>
          </Col>

          {/* Check In Date */}
          <Col lg={4} md={6}>
            <Form.Group>
              <Form.Label className="form-label-modern">Check In Date</Form.Label>
              <Form.Control
                type="date"
                className={inputCls("checkIn")}
                name="checkIn"
                value={form.checkIn}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    checkIn: val,
                    checkOut: prev.checkOut && prev.checkOut <= val ? "" : prev.checkOut,
                  }));
                  if (errors.checkIn) setErrors((prev) => { const { checkIn: _, ...rest } = prev; return rest; });
                }}
              />
              {errors.checkIn && <div className="text-danger small mt-1">{errors.checkIn}</div>}
            </Form.Group>
          </Col>

          {/* Check Out Date */}
          <Col lg={4} md={6}>
            <Form.Group>
              <Form.Label className="form-label-modern">Check Out Date</Form.Label>
              <Form.Control
                type="date"
                className={inputCls("checkOut")}
                name="checkOut"
                value={form.checkOut}
                min={getMinCheckOut()}
                onChange={handleChange}
              />
              {errors.checkOut && <div className="text-danger small mt-1">{errors.checkOut}</div>}
            </Form.Group>
          </Col>

          {/* Summary */}
          <Col lg={8} md={12}>
            <Form.Group>
              <Form.Label className="form-label-modern">Summary</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                className="form-control-premium"
                name="summary"
                value={form.summary}
                onChange={handleChange}
                placeholder="Enter summary here..."
              />
            </Form.Group>
          </Col>

          {/* Submit */}
          <Col lg={4} md={12} className="d-flex align-items-end">
            <Button
              type="submit"
              className="supplier-submit-btn w-100"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <><Spinner animation="border" size="sm" className="me-2" />Saving...</>
              ) : (
                <>Add &rarr;</>
              )}
            </Button>
          </Col>
        </Row>
      </Form>

      {/* Add Hotel popup — opened by the "+" next to the HOTEL label */}
      <Modal show={showAddHotel} onHide={closeAddHotel} centered>
        <Modal.Header closeButton>
          <Modal.Title>Add Hotel</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveNewHotel();
            }}
          >
            <Form.Group>
              <Form.Label>
                Hotel Name <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                autoFocus
                value={newHotelName}
                onChange={(e) => {
                  setNewHotelName(e.target.value);
                  setNewHotelError("");
                }}
                placeholder="Enter hotel name"
                isInvalid={!!newHotelError}
              />
              <Form.Control.Feedback type="invalid">{newHotelError}</Form.Control.Feedback>
              <Form.Text className="text-muted">
                For a hotel that isn't in the hotel list. It is saved with this booking only.
              </Form.Text>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeAddHotel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSaveNewHotel}>
            Add Hotel
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default OfflineHotel;