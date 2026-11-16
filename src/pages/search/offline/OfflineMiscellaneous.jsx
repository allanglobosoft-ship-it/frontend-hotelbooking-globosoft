import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Form, Button, Spinner } from "react-bootstrap";
import Select from "react-select";
import axiosInstance from "../../../components/AxiosInstance";
import { toast } from "react-hot-toast";

const initialForm = {
  supplier: null,
  miscellaneousDescription: "",
  price: "",
  tax: "0",
  quantity: "1",
  sellingPrice: "",
};

// A row of the Offline screen's line table → this form's fields. The row
// carries the same values the line was saved with (description, quantity,
// unit price, tax, selling price, supplier id + name).
const formFromEntry = (entry) => {
  const hasSupplier = entry.supplierId && entry.supplierId !== "null";
  const asText = (v, fallback) => (v === null || v === undefined ? fallback : String(v));
  return {
    supplier: hasSupplier
      ? {
          value: Number.isNaN(Number(entry.supplierId)) ? entry.supplierId : Number(entry.supplierId),
          label: entry.supplierName || entry.supplierId,
        }
      : null,
    miscellaneousDescription: entry.description || "",
    price: asText(entry.unitPrice, ""),
    tax: asText(entry.tax, "0"),
    quantity: asText(entry.quantity, "1"),
    sellingPrice: asText(entry.sellingPrice, ""),
  };
};

// editingEntry: a line-table row being edited (null = adding a new line).
// onCancelEdit: leave edit mode without saving.
const OfflineMiscellaneous = ({ mainBasicId, invoiceNo, onAdd, editingEntry, onCancelEdit }) => {
  const isEditing = Boolean(editingEntry);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);

  const fetchSuppliers = async (search = "") => {
    setIsLoadingSuppliers(true);
    try {
      const res = await axiosInstance.get(`/api/supplier?page=0&limit=10&search=${search}`);
      const options = (res.data || []).map(s => ({ value: s.supplierId, label: s.name }));
      setSupplierOptions(options);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingSuppliers(false);
    }
  };

  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  const debouncedFetchSuppliers = useCallback(debounce(fetchSuppliers, 500), []);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  // Edit button in the line table → load that line; leaving edit mode → empty form.
  useEffect(() => {
    setForm(editingEntry ? formFromEntry(editingEntry) : initialForm);
    setErrors({});
  }, [editingEntry]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => { const { [name]: _, ...rest } = prev; return rest; });
  };

  const handleSelectChange = (name, val) => {
    setForm(prev => ({ ...prev, [name]: val }));
    if (errors[name]) setErrors(prev => { const { [name]: _, ...rest } = prev; return rest; });
  };

  const handlePriceChange = (e) => {
    const price = e.target.value;
    const tax = parseFloat(form.tax) || 0;
    const taxAmt = (parseFloat(price) || 0) * (tax / 100);
    const selling = ((parseFloat(price) || 0) + taxAmt).toFixed(2);
    setForm((prev) => ({ ...prev, price, sellingPrice: price ? selling : "" }));
    if (errors.price) setErrors((prev) => { const { price: _, ...rest } = prev; return rest; });
  };

  const handleTaxChange = (e) => {
    const tax = e.target.value;
    const p = parseFloat(form.price) || 0;
    const taxAmt = p * ((parseFloat(tax) || 0) / 100);
    setForm((prev) => ({ ...prev, tax, sellingPrice: form.price ? (p + taxAmt).toFixed(2) : "" }));
  };

  const validate = () => {
    const e = {};
    if (!form.supplier) e.supplier = "Supplier is required";
    if (!form.miscellaneousDescription.trim()) e.miscellaneousDescription = "Description is required";
    if (!form.price.trim()) e.price = "Price is required";
    if (!form.quantity.trim()) e.quantity = "Quantity is required";
    return e;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    const formErrors = validate();
    if (Object.keys(formErrors).length > 0) { setErrors(formErrors); return; }

    setIsSubmitting(true);
    const payload = {
      // "0" adds a new line; an existing id updates that line in place.
      miscellaneousId: isEditing ? String(editingEntry.miscellaneousId) : "0",
      supplierMainBasicId: String(mainBasicId),
      supplierId: String(form.supplier?.value),
      miscellaneousDescription: form.miscellaneousDescription,
      sellingPrice: String(form.sellingPrice),
      tax: String(form.tax),
      price: String(form.price),
      quantity: String(form.quantity),
      isDeleted: false,
      invoiceNumber: invoiceNo,
    };

    try {
      const response = await axiosInstance.post(
        "/api/v1/offline-booking/miscellaneous/save",
        payload
      );
      if (response.data && response.data !== 0) {
        toast.success(
          isEditing
            ? "Miscellaneous details updated successfully"
            : "Miscellaneous details added successfully"
        );
        if (onAdd) onAdd();
        setForm(initialForm);
        setErrors({});
      } else {
        toast.error(
          isEditing ? "Failed to update miscellaneous details" : "Failed to add miscellaneous details"
        );
      }
    } catch (error) {
      console.error("Error saving miscellaneous:", error);
      toast.error("An error occurred while saving");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputCls = (field) =>
    `form-control-premium${errors[field] ? " is-invalid" : ""}`;

  return (
    <div className="supplier-form-panel">
      <h5 className="supplier-form-title">{isEditing ? "Edit Miscellaneous" : "Miscellaneous"}</h5>
      <Form onSubmit={handleSubmit}>
        <Row className="g-3">
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

          <Col lg={4} md={6}>
            <Form.Group>
              <Form.Label className="form-label-modern">Description</Form.Label>
              <Form.Control
                type="text"
                className={inputCls("miscellaneousDescription")}
                name="miscellaneousDescription"
                value={form.miscellaneousDescription}
                onChange={handleChange}
                placeholder="Miscellaneous Description"
              />
              {errors.miscellaneousDescription && <div className="text-danger small mt-1">{errors.miscellaneousDescription}</div>}
            </Form.Group>
          </Col>

          <Col lg={4} md={6}>
            <Form.Group>
              <Form.Label className="form-label-modern">Quantity</Form.Label>
              <Form.Control
                type="number"
                min="1"
                className={inputCls("quantity")}
                name="quantity"
                value={form.quantity}
                onChange={handleChange}
                placeholder="Quantity"
              />
              {errors.quantity && <div className="text-danger small mt-1">{errors.quantity}</div>}
            </Form.Group>
          </Col>

          <Col lg={4} md={6}>
            <Form.Group>
              <Form.Label className="form-label-modern">Price (in AED)</Form.Label>
              <Form.Control
                type="number"
                min="0"
                step="0.01"
                className={inputCls("price")}
                name="price"
                value={form.price}
                onChange={handlePriceChange}
                placeholder="Price"
              />
              {errors.price && <div className="text-danger small mt-1">{errors.price}</div>}
            </Form.Group>
          </Col>

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

          <Col lg={4} md={6}>
            <Form.Group>
              <Form.Label className="form-label-modern">Selling Price (in AED)</Form.Label>
              <Form.Control
                type="number"
                className="form-control-premium"
                name="sellingPrice"
                value={form.sellingPrice}
                onChange={handleChange}
                placeholder="Selling Price"
              />
            </Form.Group>
          </Col>

          <Col lg={4} md={12} className="d-flex align-items-end gap-2">
            <Button
              type="submit"
              className="supplier-submit-btn w-100"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <><Spinner animation="border" size="sm" className="me-2" />Saving...</>
              ) : isEditing ? (
                <>Update &rarr;</>
              ) : (
                <>Add &rarr;</>
              )}
            </Button>
            {isEditing && (
              <Button
                type="button"
                variant="outline-secondary"
                className="w-50"
                disabled={isSubmitting}
                onClick={() => onCancelEdit && onCancelEdit()}
              >
                Cancel
              </Button>
            )}
          </Col>
        </Row>
      </Form>
    </div>
  );
};

export default OfflineMiscellaneous;