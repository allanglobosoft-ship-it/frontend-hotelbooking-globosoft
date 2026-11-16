import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, Button, Table, Modal, Form, Row, Col } from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEdit, FaTrash, FaEye, FaPlus, FaDollarSign, FaBackward } from "react-icons/fa";

/**
 * Chauffeur-rental rate management. Completely redesigned from the old
 * transfer-style rate page: a rate header (Cab Type / Market / Rate Code /
 * Validity) plus a Rental Packages grid, and a separate Intercity Charges
 * section. Talks to the new /api/scheffer-rental-rates endpoints.
 */
const SchefferDriverRates = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [cabProviderId, setCabProviderId] = useState(() => {
    const state = location.state;
    const id =
      state?.cabProviderId ??
      state?.cabProvider?.cabprovider ??
      state?.cabProvider?.cabproviderId ??
      state?.cabProvider?.id ??
      "";
    return String(id || "");
  });
  const [cabProviderName, setCabProviderName] = useState(
    () => location.state?.cabProviderName || ""
  );

  const [rates, setRates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isViewMode, setIsViewMode] = useState(false);
  const [search, setSearch] = useState("");
  const [marketTypeList, setMarketTypeList] = useState([]);
  const [cabFullList, setCabFullList] = useState([]);
  const [cityList, setCityList] = useState([]);
  const [validationErrors, setValidationErrors] = useState({});

  // ---- Rate header + packages form ----
  const newPackageRow = (id) => ({
    id,
    packageId: null,
    packageName: "",
    hoursIncluded: "",
    kmIncluded: "",
    basePrice: "",
    extraHourRate: "",
    extraKmRate: "",
    nightCharge: "",
    waitingCharge: "",
    airportPickupCharge: "",
    airportDropCharge: "",
    isActive: true,
  });

  const emptyHeader = {
    rentalRateId: "",
    cabId: "",
    rateCode: "",
    marketTypeId: "",
    validityFrom: "",
    validityTo: "",
    // New rates are created INACTIVE by default so the operator has to
    // explicitly turn on the Active switch to publish. Existing rates
    // keep their loaded value (see the edit path further down).
    isActive: false,
  };
  const [formData, setFormData] = useState(emptyHeader);
  const [packageRows, setPackageRows] = useState([newPackageRow(1)]);

  // ── Terms & Conditions / Cancellation Policies state ──────────────
  const newPolicyRow = (id) => ({ id, value: "" });
  const newCancellationRow = (id) => ({
    id: id || Date.now() + Math.random(),
    cancellationFee: "",
    cancellationFeeType: "PERCENT",
    noOfNights: "",
  });

  const formatCancellationPolicyString = (c) => {
    if (!c) return "";
    const fee = c.cancellationFee !== undefined && c.cancellationFee !== null ? String(c.cancellationFee).trim() : "";
    const feeType = c.cancellationFeeType || "PERCENT";
    const days = c.noOfNights !== undefined && c.noOfNights !== null ? String(c.noOfNights).trim() : "";
    if (!fee && !days) return "";
    const feeTypeLabel = feeType === "PERCENT" ? "%" : "Amt";
    return `Cancellation fee of ${fee} ${feeTypeLabel} of total booking if cancelled less than ${days} days prior to arrival`;
  };

  const parseCancellationPolicyString = (str) => {
    if (!str || typeof str !== "string") {
      return { cancellationFee: "", cancellationFeeType: "PERCENT", noOfNights: "" };
    }
    const match = str.match(/Cancellation fee of\s+([\d.]+)\s+(%|Amt|PERCENT|AMOUNT)\s+of total booking if cancelled less than\s+(\d+)\s+days/i);
    if (match) {
      const fee = match[1];
      const rawType = match[2].toUpperCase();
      const feeType = (rawType === "%" || rawType === "PERCENT") ? "PERCENT" : "AMOUNT";
      const days = match[3];
      return { cancellationFee: fee, cancellationFeeType: feeType, noOfNights: days };
    }
    const daysMatch = str.match(/(\d+)\s*days/i);
    const feeMatch = str.match(/(\d+)\s*(%|percent|amt|amount)/i);
    return {
      cancellationFee: feeMatch ? feeMatch[1] : "",
      cancellationFeeType: feeMatch && (feeMatch[2].toLowerCase().includes("amt") || feeMatch[2].toLowerCase().includes("amount")) ? "AMOUNT" : "PERCENT",
      noOfNights: daysMatch ? daysMatch[1] : "",
    };
  };

  const [termsRows, setTermsRows] = useState([newPolicyRow(1)]);
  const [cancellationRows, setCancellationRows] = useState([newCancellationRow(1)]);
  const addPolicyRow = (setter) =>
    setter((prev) => [...prev, newPolicyRow(Date.now())]);
  const removePolicyRow = (setter, id) =>
    setter((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  const updatePolicyRow = (setter, id, value) =>
    setter((prev) => prev.map((r) => (r.id === id ? { ...r, value } : r)));

  // ---- Intercity charges ----
  const [intercityList, setIntercityList] = useState([]);
  const emptyIntercity = {
    intercityChargeId: null,
    fromCityId: "",
    toCityId: "",
    cabType: "",
    additionalCharge: "",
    // New intercity charges are created INACTIVE by default so the operator
    // has to click the Active badge on the list to publish. Mirrors the
    // rental-rate emptyHeader default above. Existing rows loaded into the
    // Edit modal keep their stored value (see editIntercity).
    isActive: false,
  };
  const [intercityForm, setIntercityForm] = useState(emptyIntercity);
  const [savingIntercity, setSavingIntercity] = useState(false);

  const selectedCab = cabFullList.find(
    (c) => String(c.cabId) === String(formData.cabId)
  );

  // distinct cab types available to this provider (for intercity dropdown)
  const cabTypeOptions = Array.from(
    new Set(cabFullList.map((c) => c.cabType).filter(Boolean))
  );

  // ---------------- date helpers (dd/MM/yyyy for the API) ----------------
  const formatDateForAPI = (s) => {
    if (!s) return "";
    const d = new Date(s);
    return `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1
    ).padStart(2, "0")}/${d.getFullYear()}`;
  };
  const convertDateFromAPI = (s) => {
    if (!s) return "";
    const parts = s.split("/");
    if (parts.length === 3)
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    return s;
  };
  const getMinToDate = (fromDate) => {
    if (!fromDate) return "";
    const d = new Date(fromDate);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  };

  // ---------------- data loads ----------------
  const loadMarketTypes = async () => {
    try {
      const r = await axiosInstance.get("/api/marketType");
      setMarketTypeList(r.data || []);
    } catch (e) {
      console.error("Error loading market types:", e);
    }
  };

  const loadCities = async () => {
    try {
      const r = await axiosInstance.get("/api/province", { params: { limit: 500 } });
      const items = Array.isArray(r.data) ? r.data : r.data?.content || [];
      setCityList(
        items.map((it) => ({
          id: it.id ?? it.stateId ?? it.placeid ?? it.provinceId,
          name: it.name ?? it.stateName ?? it.placeName ?? it.provinceName,
        }))
      );
    } catch (e) {
      console.error("Error loading cities:", e);
      // Fallback: derive cities from the provider's cabs.
    }
  };

  const cabsList = async () => {
    if (!cabProviderId) return;
    try {
      const r = await axiosInstance.get(`/api/SchefferDriver/cabs/${cabProviderId}`);
      setCabFullList(r.data || []);
    } catch (e) {
      console.error("cabs list error:", e);
    }
  };

  const fetchRatesList = async (s = "") => {
    if (!cabProviderId) {
      setRates([]);
      return;
    }
    try {
      setIsLoading(true);
      const r = await axiosInstance.get(`/api/scheffer-rental-rates`, {
        params: { providerId: cabProviderId, page: 0, limit: 50, search: s || "" },
      });
      setRates(r.data || []);
    } catch (e) {
      console.error("Error loading rental rates:", e);
      setRates([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchIntercity = async () => {
    if (!cabProviderId) {
      setIntercityList([]);
      return;
    }
    try {
      const r = await axiosInstance.get(`/api/scheffer-rental-rates/intercity`, {
        params: { providerId: cabProviderId },
      });
      setIntercityList(r.data || []);
    } catch (e) {
      console.error("Error loading intercity charges:", e);
      setIntercityList([]);
    }
  };

  useEffect(() => {
    loadMarketTypes();
    loadCities();
  }, []);

  useEffect(() => {
    const state = location.state;
    const newId =
      state?.cabProviderId ??
      state?.cabProvider?.cabprovider ??
      state?.cabProvider?.cabproviderId ??
      state?.cabProvider?.id ??
      "";
    const newName = state?.cabProviderName || "";
    if (String(newId || "") !== String(cabProviderId || "") && String(newId || "") !== "") {
      setRates([]);
      setCabFullList([]);
      setSearch("");
      setCabProviderId(String(newId));
      setCabProviderName(newName);
    } else if (newName !== cabProviderName) {
      setCabProviderName(newName);
    }
  }, [location.state, location.key, cabProviderId, cabProviderName]);

  useEffect(() => {
    if (cabProviderId) {
      fetchRatesList();
      fetchIntercity();
      cabsList();
    } else {
      setRates([]);
      setCabFullList([]);
      setIntercityList([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cabProviderId]);

  useEffect(() => {
    const t = setTimeout(() => fetchRatesList(search), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ---------------- form helpers ----------------
  const updateFormData = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (validationErrors[field]) {
      setValidationErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const addPackageRow = () =>
    setPackageRows((prev) => [...prev, newPackageRow(Date.now())]);
  const removePackageRow = (id) =>
    setPackageRows((prev) =>
      prev.length > 1 ? prev.filter((r) => r.id !== id) : prev
    );
  const updatePackageRow = (id, field, value) =>
    setPackageRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );

  const openCreate = () => {
    setEditing(null);
    setIsViewMode(false);
    setValidationErrors({});
    setFormData(emptyHeader);
    setPackageRows([newPackageRow(1)]);
    setTermsRows([newPolicyRow(1)]);
    setCancellationRows([newCancellationRow(1)]);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setIsViewMode(false);
    setValidationErrors({});
    setFormData(emptyHeader);
    setPackageRows([newPackageRow(1)]);
    setTermsRows([newPolicyRow(1)]);
    setCancellationRows([newCancellationRow(1)]);
  };

  const validateForm = () => {
    const errs = {};
    if (!formData.cabId) errs.cabId = "Cab Type is required";
    if (!formData.rateCode || !formData.rateCode.trim())
      errs.rateCode = "Rate code is required";
    if (!formData.marketTypeId) errs.marketTypeId = "Market is required";
    if (!formData.validityFrom) errs.validityFrom = "Validity From is required";
    if (!formData.validityTo) errs.validityTo = "Validity To is required";
    return errs;
  };

  const packageInvalid = (row) =>
    !row.packageName || !row.hoursIncluded || !row.kmIncluded || row.basePrice === "";

  const num = (v) => (v === "" || v == null ? null : parseFloat(v));
  const int = (v) => (v === "" || v == null ? null : parseInt(v, 10));

  const transformToPayload = () => ({
    rentalRateId: editing ? editing.rentalRateId : null,
    cabId: parseInt(formData.cabId, 10),
    cabProviderId: cabProviderId ? parseInt(cabProviderId, 10) : null,
    rateCode: formData.rateCode,
    marketTypeId: formData.marketTypeId ? parseInt(formData.marketTypeId, 10) : null,
    validityFrom: formatDateForAPI(formData.validityFrom),
    validityTo: formatDateForAPI(formData.validityTo),
    isActive: formData.isActive,
    packages: packageRows.map((r) => ({
      packageId: r.packageId || null,
      packageName: r.packageName,
      hoursIncluded: int(r.hoursIncluded),
      kmIncluded: int(r.kmIncluded),
      basePrice: num(r.basePrice),
      extraHourRate: num(r.extraHourRate),
      extraKmRate: num(r.extraKmRate),
      nightCharge: num(r.nightCharge),
      waitingCharge: num(r.waitingCharge),
      airportPickupCharge: num(r.airportPickupCharge),
      airportDropCharge: num(r.airportDropCharge),
      isActive: Boolean(r.isActive),
    })),
    // Drop empty rows here so the backend never sees a blank policy line;
    // backend also guards but this keeps the payload tidy.
    termsAndConditions: termsRows
      .map((r) => (r.value || "").trim())
      .filter((v) => v.length > 0),
    cancellationPolicies: cancellationRows
      .map((r) => formatCancellationPolicyString(r))
      .filter((v) => v.length > 0),
  });

  const saveRate = async () => {
    const errs = validateForm();
    if (Object.keys(errs).length) {
      setValidationErrors(errs);
      return;
    }
    if (formData.validityTo && formData.validityFrom &&
      new Date(formData.validityTo) <= new Date(formData.validityFrom)) {
      toast.error('"Validity To" must be after "Validity From"');
      return;
    }
    if (packageRows.some(packageInvalid)) {
      toast.error("Each package needs a name, hours, km and base price");
      return;
    }
    try {
      setLoading(true);
      if (editing) {
        await axiosInstance.put(
          `/api/scheffer-rental-rates/${editing.rentalRateId}`,
          transformToPayload()
        );
        toast.success("Rental rate updated successfully!");
      } else {
        await axiosInstance.post(
          "/api/scheffer-rental-rates/register",
          transformToPayload()
        );
        toast.success("Rental rate saved successfully!");
      }
      closeModal();
      fetchRatesList(search);
    } catch (e) {
      console.error("Error saving rental rate:", e);
      toast.error("Failed to save rental rate. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (rate, viewMode = false) => {
    setEditing(rate);
    setIsViewMode(viewMode);
    setValidationErrors({});
    setFormData({
      rentalRateId: rate.rentalRateId,
      cabId: rate.cabId ? String(rate.cabId) : "",
      rateCode: rate.rateCode || "",
      marketTypeId: rate.marketTypeId ? String(rate.marketTypeId) : "",
      validityFrom: convertDateFromAPI(rate.validityFrom),
      validityTo: convertDateFromAPI(rate.validityTo),
      isActive: rate.isActive !== false,
    });
    const pkgs =
      Array.isArray(rate.packages) && rate.packages.length
        ? rate.packages.map((p, i) => ({
            id: i + 1,
            packageId: p.packageId || null,
            packageName: p.packageName || "",
            hoursIncluded: p.hoursIncluded ?? "",
            kmIncluded: p.kmIncluded ?? "",
            basePrice: p.basePrice ?? "",
            extraHourRate: p.extraHourRate ?? "",
            extraKmRate: p.extraKmRate ?? "",
            nightCharge: p.nightCharge ?? "",
            waitingCharge: p.waitingCharge ?? "",
            airportPickupCharge: p.airportPickupCharge ?? "",
            airportDropCharge: p.airportDropCharge ?? "",
            isActive: p.isActive !== false,
          }))
        : [newPackageRow(1)];
    setPackageRows(pkgs);
    // Seed the T&C rows from the saved list. Empty lists fall back to a single blank row.
    const seedTerms = (arr) =>
      Array.isArray(arr) && arr.length > 0
        ? arr.map((v, i) => ({ id: i + 1, value: v || "" }))
        : [newPolicyRow(1)];
    const seedCancellationPolicies = (arr) =>
      Array.isArray(arr) && arr.length > 0
        ? arr.map((v, i) => ({ id: i + 1, ...parseCancellationPolicyString(v) }))
        : [newCancellationRow(1)];
    setTermsRows(seedTerms(rate.termsAndConditions));
    setCancellationRows(seedCancellationPolicies(rate.cancellationPolicies));
    setShowModal(true);
  };

  // ── Active/Inactive confirmation modal ──────────────────────────────
  // Mirrors /hotel-actions/{id}/contract-rate: clicking the Active/Inactive
  // badge in the list opens this modal so the operator explicitly confirms
  // the change before we PUT the update. Kept as a small Bootstrap Modal
  // with the same "Confirm Status Change" wording used there.
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusModalRate, setStatusModalRate] = useState(null);

  const openStatusModal = (rate) => {
    setStatusModalRate(rate);
    setShowStatusModal(true);
  };

  const closeStatusModal = () => {
    if (loading) return; // don't close mid-request
    setShowStatusModal(false);
    setStatusModalRate(null);
  };

  // Actually flip a rate's Active flag once the operator confirms in the
  // modal. Fetches the full rate first so the PUT payload keeps every
  // existing package / policy line — never overwrites those with stale
  // list-row data.
  const confirmToggleRateActive = async () => {
    const rate = statusModalRate;
    if (!rate) return;
    const nextActive = !(rate.isActive !== false);
    try {
      setLoading(true);
      const res = await axiosInstance.get(
        `/api/scheffer-rental-rates/${rate.rentalRateId}`,
      );
      const full = res?.data;
      if (!full) {
        toast.error("Could not load rate details");
        return;
      }
      await axiosInstance.put(
        `/api/scheffer-rental-rates/${rate.rentalRateId}`,
        { ...full, isActive: nextActive },
      );
      toast.success(nextActive ? "Rate activated" : "Rate deactivated");
      setShowStatusModal(false);
      setStatusModalRate(null);
      fetchRatesList(search);
    } catch (e) {
      console.error("Toggle active error:", e);
      toast.error("Failed to update status");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (rate) => {
    Swal.fire({
      titleText: `Delete rental rate: ${rate.rateCode}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await axiosInstance.delete(`/api/scheffer-rental-rates/${rate.rentalRateId}`);
          toast.success("Rental rate deleted");
          fetchRatesList(search);
        } catch (e) {
          console.error("Delete error:", e);
          toast.error("Failed to delete rate");
        }
      }
    });
  };

  // ---------------- intercity handlers ----------------
  const cityName = (id) => {
    const c = cityList.find((x) => String(x.id) === String(id));
    return c ? c.name : "";
  };

  const saveIntercity = async () => {
    if (!intercityForm.fromCityId || !intercityForm.toCityId) {
      toast.error("From City and To City are required");
      return;
    }
    if (intercityForm.additionalCharge === "" || isNaN(parseFloat(intercityForm.additionalCharge))) {
      toast.error("Additional charge is required");
      return;
    }
    try {
      setSavingIntercity(true);
      await axiosInstance.post("/api/scheffer-rental-rates/intercity", {
        intercityChargeId: intercityForm.intercityChargeId,
        cabProviderId: parseInt(cabProviderId, 10),
        fromCityId: parseInt(intercityForm.fromCityId, 10),
        fromCityName: cityName(intercityForm.fromCityId),
        toCityId: parseInt(intercityForm.toCityId, 10),
        toCityName: cityName(intercityForm.toCityId),
        cabType: intercityForm.cabType || null,
        additionalCharge: parseFloat(intercityForm.additionalCharge),
        isActive: Boolean(intercityForm.isActive),
      });
      toast.success("Intercity charge saved");
      setIntercityForm(emptyIntercity);
      fetchIntercity();
    } catch (e) {
      console.error("Error saving intercity charge:", e);
      toast.error("Failed to save intercity charge");
    } finally {
      setSavingIntercity(false);
    }
  };

  // ── Edit Intercity Charge modal ─────────────────────────────────────
  // Previously the edit action populated the top "Add" form and its button
  // label flipped to "Update". Per client request, edits now open a
  // dedicated modal (mirrors the rental-rate edit flow) so the top form
  // stays purely additive — the FaEdit icon is the ONLY entry point to
  // change an existing intercity charge. Reuses the same POST endpoint
  // (with intercityChargeId set) so no backend contract changes.
  const [showEditIntercityModal, setShowEditIntercityModal] = useState(false);
  const [editIntercityForm, setEditIntercityForm] = useState(emptyIntercity);
  const [savingEditIntercity, setSavingEditIntercity] = useState(false);

  const editIntercity = (c) => {
    setEditIntercityForm({
      intercityChargeId: c.intercityChargeId,
      fromCityId: c.fromCityId ? String(c.fromCityId) : "",
      toCityId: c.toCityId ? String(c.toCityId) : "",
      cabType: c.cabType || "",
      additionalCharge: c.additionalCharge ?? "",
      isActive: c.isActive !== false,
    });
    setShowEditIntercityModal(true);
  };

  const closeEditIntercityModal = () => {
    if (savingEditIntercity) return; // don't close mid-request
    setShowEditIntercityModal(false);
    setEditIntercityForm(emptyIntercity);
  };

  const saveEditIntercity = async () => {
    if (!editIntercityForm.fromCityId || !editIntercityForm.toCityId) {
      toast.error("From City and To City are required");
      return;
    }
    if (
      editIntercityForm.additionalCharge === "" ||
      isNaN(parseFloat(editIntercityForm.additionalCharge))
    ) {
      toast.error("Additional charge is required");
      return;
    }
    try {
      setSavingEditIntercity(true);
      await axiosInstance.post("/api/scheffer-rental-rates/intercity", {
        intercityChargeId: editIntercityForm.intercityChargeId,
        cabProviderId: parseInt(cabProviderId, 10),
        fromCityId: parseInt(editIntercityForm.fromCityId, 10),
        fromCityName: cityName(editIntercityForm.fromCityId),
        toCityId: parseInt(editIntercityForm.toCityId, 10),
        toCityName: cityName(editIntercityForm.toCityId),
        cabType: editIntercityForm.cabType || null,
        additionalCharge: parseFloat(editIntercityForm.additionalCharge),
        isActive: Boolean(editIntercityForm.isActive),
      });
      toast.success("Intercity charge updated");
      setShowEditIntercityModal(false);
      setEditIntercityForm(emptyIntercity);
      fetchIntercity();
    } catch (e) {
      console.error("Error updating intercity charge:", e);
      toast.error("Failed to update intercity charge");
    } finally {
      setSavingEditIntercity(false);
    }
  };

  // ── Intercity Active/Inactive confirmation modal ───────────────────
  // Same UX as the rental-rate status confirmation above. Clicking the
  // badge on any intercity row opens this modal; Confirm reuses the same
  // POST endpoint with isActive flipped so no new backend contract is
  // introduced.
  const [showIntercityStatusModal, setShowIntercityStatusModal] = useState(false);
  const [intercityStatusRow, setIntercityStatusRow] = useState(null);
  const [togglingIntercity, setTogglingIntercity] = useState(false);

  const openIntercityStatusModal = (c) => {
    setIntercityStatusRow(c);
    setShowIntercityStatusModal(true);
  };

  const closeIntercityStatusModal = () => {
    if (togglingIntercity) return;
    setShowIntercityStatusModal(false);
    setIntercityStatusRow(null);
  };

  const confirmToggleIntercityActive = async () => {
    const c = intercityStatusRow;
    if (!c) return;
    const nextActive = !(c.isActive !== false);
    try {
      setTogglingIntercity(true);
      await axiosInstance.post("/api/scheffer-rental-rates/intercity", {
        intercityChargeId: c.intercityChargeId,
        cabProviderId: parseInt(cabProviderId, 10),
        fromCityId: c.fromCityId,
        fromCityName: c.fromCityName,
        toCityId: c.toCityId,
        toCityName: c.toCityName,
        cabType: c.cabType || null,
        additionalCharge: c.additionalCharge,
        isActive: nextActive,
      });
      toast.success(nextActive ? "Charge activated" : "Charge deactivated");
      setShowIntercityStatusModal(false);
      setIntercityStatusRow(null);
      fetchIntercity();
    } catch (e) {
      console.error("Error toggling intercity active:", e);
      toast.error("Failed to update status");
    } finally {
      setTogglingIntercity(false);
    }
  };

  const deleteIntercity = (c) => {
    Swal.fire({
      titleText: `Delete intercity charge ${c.fromCityName} → ${c.toCityName}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Delete",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await axiosInstance.delete(`/api/scheffer-rental-rates/intercity/${c.intercityChargeId}`);
          toast.success("Intercity charge deleted");
          fetchIntercity();
        } catch (e) {
          console.error("Delete intercity error:", e);
          toast.error("Failed to delete intercity charge");
        }
      }
    });
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          {/* ---- Rental Rates ---- */}
          <Card className="shadow-sm rounded-xl mb-4">
            <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <Button
                  variant="outline-primary"
                  onClick={() => navigate("/registration/schefferDriver")}
                  className="mb-2 me-3"
                  size="sm"
                >
                  <FaBackward className="me-2" />
                  Back
                </Button>
                <span className="fw-semibold">
                  <FaDollarSign className="me-2 text-success" />
                  Chauffeur Rental Rates
                  {cabProviderId ? (
                    <span className="text-muted ms-2">
                      ({cabProviderName || "Provider"} #{cabProviderId})
                    </span>
                  ) : (
                    <span className="text-warning ms-2">(No Provider Selected)</span>
                  )}
                </span>
              </div>
              <div className="d-flex align-items-center gap-3">
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Search rates..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ width: "220px" }}
                />
                <Button className="btn-green" onClick={openCreate}>
                  + Create Rate
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>S/N</th>
                    <th>Rate Code</th>
                    <th>Cab Type</th>
                    <th>City</th>
                    <th>Market</th>
                    <th>Packages</th>
                    <th>Validity From</th>
                    <th>Validity To</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan="10" className="text-center text-muted py-4">
                        Loading rates...
                      </td>
                    </tr>
                  )}
                  {!isLoading && rates.length === 0 && (
                    <tr>
                      <td colSpan="10" className="text-center text-muted py-4">
                        No rental rates yet. Click "Create Rate" to add one.
                      </td>
                    </tr>
                  )}
                  {!isLoading &&
                    rates.map((rate, index) => (
                      <tr key={rate.rentalRateId || index}>
                        <td>{index + 1}</td>
                        <td>{rate.rateCode || "N/A"}</td>
                        <td>{rate.cabType || rate.cabName || "N/A"}</td>
                        <td>{rate.cityName || "N/A"}</td>
                        <td>{rate.marketTypeName || rate.marketTypeId || "N/A"}</td>
                        <td>{rate.packages ? rate.packages.length : 0}</td>
                        <td>{rate.validityFrom || "N/A"}</td>
                        <td>{rate.validityTo || "N/A"}</td>
                        <td>
                          {/* Click the badge to toggle Active ↔ Inactive
                              (the Edit modal no longer exposes an Active
                              switch, so this is the operator's activation
                              control for a freshly-created rate). */}
                          <span
                            role="button"
                            tabIndex={0}
                            title={
                              rate.isActive !== false
                                ? "Click to deactivate"
                                : "Click to activate"
                            }
                            className={`badge bg-${rate.isActive !== false ? "success" : "secondary"}`}
                            style={{ cursor: "pointer" }}
                            onClick={() => openStatusModal(rate)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openStatusModal(rate);
                              }
                            }}
                          >
                            {rate.isActive !== false ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <div className="d-flex gap-2">
                            <FaEdit
                              className="text-primary"
                              style={{ cursor: "pointer", fontSize: 18 }}
                              onClick={() => handleEdit(rate, false)}
                              title="Edit"
                            />
                            <FaEye
                              className="text-info"
                              style={{ cursor: "pointer", fontSize: 18 }}
                              onClick={() => handleEdit(rate, true)}
                              title="View"
                            />
                            <FaTrash
                              className="text-danger"
                              style={{ cursor: "pointer", fontSize: 18 }}
                              onClick={() => handleDelete(rate)}
                              title="Delete"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>

          {/* ---- Intercity Charges ---- */}
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="fw-semibold">
              Intercity Charges
              <span className="text-muted ms-2" style={{ fontSize: 13 }}>
                (surcharge when travel crosses into another city)
              </span>
            </Card.Header>
            <Card.Body>
              <Row className="g-2 align-items-end mb-3">
                <Col md={3}>
                  <Form.Label>From City</Form.Label>
                  <Form.Select
                    value={intercityForm.fromCityId}
                    onChange={(e) =>
                      setIntercityForm((p) => ({ ...p, fromCityId: e.target.value }))
                    }
                  >
                    <option value="">Select</option>
                    {cityList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Form.Select>
                </Col>
                <Col md={3}>
                  <Form.Label>To City</Form.Label>
                  <Form.Select
                    value={intercityForm.toCityId}
                    onChange={(e) =>
                      setIntercityForm((p) => ({ ...p, toCityId: e.target.value }))
                    }
                  >
                    <option value="">Select</option>
                    {cityList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Form.Select>
                </Col>
                <Col md={2}>
                  <Form.Label>Cab Type</Form.Label>
                  <Form.Select
                    value={intercityForm.cabType}
                    onChange={(e) =>
                      setIntercityForm((p) => ({ ...p, cabType: e.target.value }))
                    }
                  >
                    <option value="">All</option>
                    {cabTypeOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Form.Select>
                </Col>
                <Col md={2}>
                  <Form.Label>Additional Charge</Form.Label>
                  <Form.Control
                    type="number"
                    placeholder="AED"
                    value={intercityForm.additionalCharge}
                    onChange={(e) =>
                      setIntercityForm((p) => ({ ...p, additionalCharge: e.target.value }))
                    }
                  />
                </Col>
                <Col md={2}>
                  <Button
                    className="btn-green w-100"
                    onClick={saveIntercity}
                    disabled={savingIntercity || !cabProviderId}
                  >
                    Add
                  </Button>
                </Col>
              </Row>

              <Table responsive hover striped size="sm" className="align-middle mb-0">
                <thead>
                  <tr>
                    <th>From City</th>
                    <th>To City</th>
                    <th>Cab Type</th>
                    <th>Additional Charge</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {intercityList.length === 0 && (
                    <tr>
                      <td colSpan="6" className="text-center text-muted py-3">
                        No intercity charges configured.
                      </td>
                    </tr>
                  )}
                  {intercityList.map((c) => (
                    <tr key={c.intercityChargeId}>
                      <td>{c.fromCityName}</td>
                      <td>{c.toCityName}</td>
                      <td>{c.cabType || "All"}</td>
                      <td>{c.additionalCharge} AED</td>
                      <td>
                        {/* Click the badge to toggle Active ↔ Inactive
                            (same UX as the rental-rate list badge — opens a
                            confirmation modal before the change). */}
                        <span
                          role="button"
                          tabIndex={0}
                          title={
                            c.isActive !== false
                              ? "Click to deactivate"
                              : "Click to activate"
                          }
                          className={`badge bg-${c.isActive !== false ? "success" : "secondary"}`}
                          style={{ cursor: "pointer" }}
                          onClick={() => openIntercityStatusModal(c)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openIntercityStatusModal(c);
                            }
                          }}
                        >
                          {c.isActive !== false ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <div className="d-flex gap-2">
                          <FaEdit
                            className="text-primary"
                            style={{ cursor: "pointer" }}
                            onClick={() => editIntercity(c)}
                            title="Edit"
                          />
                          <FaTrash
                            className="text-danger"
                            style={{ cursor: "pointer" }}
                            onClick={() => deleteIntercity(c)}
                            title="Delete"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>

          {/* ---- Rate create/edit modal ---- */}
          <style>{`
            .scheffer-rate-modal-wide { max-width: 96vw; }
            .scheffer-rate-modal-wide .rate-grid-table { min-width: 1400px; }
            .scheffer-rate-modal-wide .rate-grid-table th,
            .scheffer-rate-modal-wide .rate-grid-table td { vertical-align: middle; }
          `}</style>
          <Modal
            show={showModal}
            onHide={closeModal}
            centered
            size="xl"
            dialogClassName="scheffer-rate-modal-wide"
          >
            <Modal.Header closeButton>
              <Modal.Title>
                {isViewMode ? "View" : editing ? "Edit" : "Create"} Chauffeur Rental Rate
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <h6 className="text-muted mb-3">Rate Information</h6>
                <Row>
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Cab Type <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Select
                        value={formData.cabId}
                        onChange={(e) => updateFormData("cabId", e.target.value)}
                        isInvalid={!!validationErrors.cabId}
                        disabled={isViewMode}
                      >
                        <option value="">SELECT</option>
                        {cabFullList.map((cab) => (
                          <option key={cab.cabId} value={cab.cabId}>
                            {cab.cabName}
                            {cab.cabType ? ` — ${cab.cabType}` : ""}
                          </option>
                        ))}
                      </Form.Select>
                      <Form.Control.Feedback type="invalid">
                        {validationErrors.cabId}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>City</Form.Label>
                      <Form.Control
                        type="text"
                        value={selectedCab?.placeName || ""}
                        placeholder="Derived from cab"
                        disabled
                      />
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Rate Code <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="Enter rate code"
                        value={formData.rateCode}
                        onChange={(e) => updateFormData("rateCode", e.target.value)}
                        isInvalid={!!validationErrors.rateCode}
                        disabled={isViewMode}
                      />
                      <Form.Control.Feedback type="invalid">
                        {validationErrors.rateCode}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Market <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Select
                        value={formData.marketTypeId}
                        onChange={(e) => updateFormData("marketTypeId", e.target.value)}
                        isInvalid={!!validationErrors.marketTypeId}
                        disabled={isViewMode}
                      >
                        <option value="">Select Market</option>
                        {marketTypeList.map((m) => (
                          <option key={m.marketTypeId} value={m.marketTypeId}>
                            {m.name}
                          </option>
                        ))}
                      </Form.Select>
                      <Form.Control.Feedback type="invalid">
                        {validationErrors.marketTypeId}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Validity From <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="date"
                        value={formData.validityFrom}
                        onChange={(e) => {
                          updateFormData("validityFrom", e.target.value);
                          if (formData.validityTo && e.target.value &&
                            new Date(formData.validityTo) <= new Date(e.target.value))
                            updateFormData("validityTo", "");
                        }}
                        isInvalid={!!validationErrors.validityFrom}
                        disabled={isViewMode}
                      />
                      <Form.Control.Feedback type="invalid">
                        {validationErrors.validityFrom}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Validity To <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="date"
                        value={formData.validityTo}
                        min={getMinToDate(formData.validityFrom)}
                        onChange={(e) => updateFormData("validityTo", e.target.value)}
                        isInvalid={!!validationErrors.validityTo}
                        disabled={isViewMode}
                      />
                      <Form.Control.Feedback type="invalid">
                        {validationErrors.validityTo}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>

                {/* Rental Packages grid */}
                <div className="border-top pt-3 mt-2">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="text-muted mb-0">Rental Packages</h6>
                    {!isViewMode && (
                      <Button variant="outline-primary" size="sm" onClick={addPackageRow}>
                        <FaPlus className="me-2" />
                        Add Package
                      </Button>
                    )}
                  </div>
                  <div className="table-responsive">
                    <Table striped bordered hover size="sm" className="rate-grid-table">
                      <thead className="table-light">
                        <tr>
                          <th style={{ minWidth: 150 }}>Package Name</th>
                          <th style={{ minWidth: 90 }}>Hours</th>
                          <th style={{ minWidth: 90 }}>KM</th>
                          <th style={{ minWidth: 110 }}>Base Price</th>
                          <th style={{ minWidth: 110 }}>Waiting Time</th>
                          <th style={{ minWidth: 120 }}>Airport Pickup</th>
                          <th style={{ minWidth: 120 }}>Airport Drop</th>
                          {!isViewMode && <th style={{ minWidth: 90 }}>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {packageRows.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <Form.Control
                                size="sm"
                                placeholder="Half Day"
                                value={row.packageName}
                                onChange={(e) => updatePackageRow(row.id, "packageName", e.target.value)}
                                disabled={isViewMode}
                              />
                            </td>
                            <td>
                              <Form.Control
                                type="number" size="sm" placeholder="4"
                                value={row.hoursIncluded}
                                onChange={(e) => updatePackageRow(row.id, "hoursIncluded", e.target.value)}
                                disabled={isViewMode}
                              />
                            </td>
                            <td>
                              <Form.Control
                                type="number" size="sm" placeholder="100"
                                value={row.kmIncluded}
                                onChange={(e) => updatePackageRow(row.id, "kmIncluded", e.target.value)}
                                disabled={isViewMode}
                              />
                            </td>
                            <td>
                              <Form.Control
                                type="number" size="sm" placeholder="120"
                                value={row.basePrice}
                                onChange={(e) => updatePackageRow(row.id, "basePrice", e.target.value)}
                                disabled={isViewMode}
                              />
                            </td>
                            <td>
                              <Form.Control
                                type="number" size="sm" placeholder="0"
                                value={row.waitingCharge}
                                onChange={(e) => updatePackageRow(row.id, "waitingCharge", e.target.value)}
                                disabled={isViewMode}
                              />
                            </td>
                            <td className="text-center">
                              {/* Airport Pickup — tick if this package
                                  includes/offers airport pickup. Stored on
                                  the existing airportPickupCharge field as
                                  1 (yes) / 0 (no) so no backend/DTO change
                                  is needed. */}
                              <Form.Check
                                type="checkbox"
                                checked={Number(row.airportPickupCharge) > 0}
                                onChange={(e) =>
                                  updatePackageRow(
                                    row.id,
                                    "airportPickupCharge",
                                    e.target.checked ? 1 : 0,
                                  )
                                }
                                disabled={isViewMode}
                                title="Airport Pickup included"
                              />
                            </td>
                            <td className="text-center">
                              {/* Airport Drop — same tick semantics as
                                  Airport Pickup above. */}
                              <Form.Check
                                type="checkbox"
                                checked={Number(row.airportDropCharge) > 0}
                                onChange={(e) =>
                                  updatePackageRow(
                                    row.id,
                                    "airportDropCharge",
                                    e.target.checked ? 1 : 0,
                                  )
                                }
                                disabled={isViewMode}
                                title="Airport Drop included"
                              />
                            </td>
                            {!isViewMode && (
                              <td>
                                <div className="d-flex gap-1">
                                  <Button variant="outline-primary" size="sm" onClick={addPackageRow}>
                                    <FaPlus size={10} />
                                  </Button>
                                  {packageRows.length > 1 && (
                                    <Button
                                      variant="outline-danger"
                                      size="sm"
                                      onClick={() => removePackageRow(row.id)}
                                    >
                                      <FaTrash size={10} />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </div>

                {/* ── Terms & Conditions ────────────────────────────────
                    Dynamic list of free-form sentences saved per rate.
                    Mirrors the /cab-rates pattern. Empty rows are dropped
                    at save-time (frontend + backend defend). */}
                <div className="border-top pt-3 mt-3">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="text-muted mb-0">Terms &amp; Conditions</h6>
                    {!isViewMode && (
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => addPolicyRow(setTermsRows)}
                        title="Add Terms &amp; Conditions"
                      >
                        <FaPlus className="me-2" />
                        Add
                      </Button>
                    )}
                  </div>
                  {termsRows.map((row, idx) => (
                    <Row key={row.id} className="mb-2">
                      <Col md={10}>
                        <Form.Control
                          as="textarea"
                          rows={2}
                          value={row.value}
                          placeholder={`Term ${idx + 1} — e.g. "Driver waiting time is 30 mins"`}
                          onChange={(e) =>
                            updatePolicyRow(setTermsRows, row.id, e.target.value)
                          }
                          disabled={isViewMode}
                        />
                      </Col>
                      {!isViewMode && (
                        <Col md={2}>
                          <div className="d-flex gap-1">
                            {termsRows.length > 1 && (
                              <Button
                                variant="outline-danger"
                                size="sm"
                                onClick={() => removePolicyRow(setTermsRows, row.id)}
                                title="Remove"
                              >
                                <FaTrash size={10} />
                              </Button>
                            )}
                          </div>
                        </Col>
                      )}
                    </Row>
                  ))}
                </div>

                {/* ── Cancellation Policies ── */}
                <div className="border-top pt-3 mt-3">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="text-muted mb-0">Cancellation Policy</h6>
                    {!isViewMode && (
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() =>
                          setCancellationRows((prev) => [...prev, newCancellationRow()])
                        }
                        title="Add Cancellation Policy"
                      >
                        <FaPlus className="me-2" />
                        Add Policy
                      </Button>
                    )}
                  </div>
                  {cancellationRows.map((c, index) => (
                    <Row
                      key={c.id || index}
                      className="align-items-center mb-3 bg-light p-3 rounded-3 mx-0"
                    >
                      <Col md={12}>
                        {!isViewMode ? (
                          <>
                            <Form.Label className="fw-semibold small">
                              Cancellation fee of
                            </Form.Label>
                            <div className="d-flex align-items-center flex-wrap gap-2 mt-1">
                              <Form.Control
                                type="number"
                                min="0"
                                onKeyDown={(e) => {
                                  if (e.key === "-" || e.key === "e" || e.key === "E")
                                    e.preventDefault();
                                }}
                                placeholder="Fee"
                                value={c.cancellationFee}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCancellationRows((prev) =>
                                    prev.map((row) =>
                                      row.id === c.id
                                        ? { ...row, cancellationFee: val }
                                        : row
                                    )
                                  );
                                }}
                                style={{ width: "120px" }}
                              />
                              <Form.Select
                                value={c.cancellationFeeType}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCancellationRows((prev) =>
                                    prev.map((row) =>
                                      row.id === c.id
                                        ? { ...row, cancellationFeeType: val }
                                        : row
                                    )
                                  );
                                }}
                                style={{ width: "90px" }}
                              >
                                <option value="PERCENT">%</option>
                                <option value="AMOUNT">Amt</option>
                              </Form.Select>
                              <span className="text-muted small">
                                of total booking if cancelled less than
                              </span>
                              <Form.Control
                                type="number"
                                min="0"
                                onKeyDown={(e) => {
                                  if (e.key === "-" || e.key === "e" || e.key === "E")
                                    e.preventDefault();
                                }}
                                placeholder="Days"
                                value={c.noOfNights}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCancellationRows((prev) =>
                                    prev.map((row) =>
                                      row.id === c.id
                                        ? { ...row, noOfNights: val }
                                        : row
                                    )
                                  );
                                }}
                                style={{ width: "90px" }}
                              />
                              <span className="text-muted small">
                                days prior to arrival
                              </span>
                              {cancellationRows.length > 1 && (
                                <Button
                                  size="sm"
                                  variant="outline-danger"
                                  className="rounded-circle ms-auto"
                                  onClick={() =>
                                    setCancellationRows((prev) =>
                                      prev.filter((row) => row.id !== c.id)
                                    )
                                  }
                                  title="Remove"
                                >
                                  <FaTrash size={12} />
                                </Button>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="p-2 bg-light rounded small">
                            {formatCancellationPolicyString(c) || "—"}
                          </div>
                        )}
                      </Col>
                    </Row>
                  ))}
                </div>
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="danger" onClick={closeModal}>
                {isViewMode ? "Close" : "Cancel"}
              </Button>
              {!isViewMode && (
                <Button variant="success" onClick={saveRate} disabled={loading}>
                  {loading ? (editing ? "Updating..." : "Saving...") : editing ? "Update" : "Create"}
                </Button>
              )}
            </Modal.Footer>
          </Modal>

          {/* Status Toggle Confirmation Modal — mirrors the pattern used in
              /hotel-actions/{id}/contract-rate. Opens when the operator
              clicks the Active/Inactive badge in the rates list, so the
              activate/deactivate change is never silent. */}
          <Modal
            show={showStatusModal}
            onHide={closeStatusModal}
            centered
            size="sm"
            backdrop="static"
            keyboard={false}
          >
            <Modal.Header closeButton={!loading}>
              <Modal.Title>Confirm Status Change</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <p className="mb-0">
                Are you sure you want to{" "}
                {statusModalRate && statusModalRate.isActive !== false
                  ? "deactivate"
                  : "activate"}{" "}
                this rental rate
                {statusModalRate?.rateCode ? (
                  <>
                    {" "}
                    <strong>{statusModalRate.rateCode}</strong>
                  </>
                ) : null}
                ?
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={closeStatusModal}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={confirmToggleRateActive}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    Processing...
                  </>
                ) : (
                  "Confirm"
                )}
              </Button>
            </Modal.Footer>
          </Modal>

          {/* Edit Intercity Charge Modal — dedicated dialog for editing an
              existing intercity row. Previously the FaEdit icon populated
              the top "Add" form and its button flipped to "Update"; now the
              top form is add-only and this modal owns editing. */}
          <Modal
            show={showEditIntercityModal}
            onHide={closeEditIntercityModal}
            centered
            size="lg"
            backdrop="static"
            keyboard={false}
          >
            <Modal.Header closeButton={!savingEditIntercity}>
              <Modal.Title>Edit Intercity Charge</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Row className="g-3">
                <Col md={6}>
                  <Form.Label>From City</Form.Label>
                  <Form.Select
                    value={editIntercityForm.fromCityId}
                    onChange={(e) =>
                      setEditIntercityForm((p) => ({ ...p, fromCityId: e.target.value }))
                    }
                    disabled={savingEditIntercity}
                  >
                    <option value="">Select</option>
                    {cityList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Form.Select>
                </Col>
                <Col md={6}>
                  <Form.Label>To City</Form.Label>
                  <Form.Select
                    value={editIntercityForm.toCityId}
                    onChange={(e) =>
                      setEditIntercityForm((p) => ({ ...p, toCityId: e.target.value }))
                    }
                    disabled={savingEditIntercity}
                  >
                    <option value="">Select</option>
                    {cityList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Form.Select>
                </Col>
                <Col md={6}>
                  <Form.Label>Cab Type</Form.Label>
                  <Form.Select
                    value={editIntercityForm.cabType}
                    onChange={(e) =>
                      setEditIntercityForm((p) => ({ ...p, cabType: e.target.value }))
                    }
                    disabled={savingEditIntercity}
                  >
                    <option value="">All</option>
                    {cabTypeOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Form.Select>
                </Col>
                <Col md={6}>
                  <Form.Label>Additional Charge</Form.Label>
                  <Form.Control
                    type="number"
                    placeholder="AED"
                    value={editIntercityForm.additionalCharge}
                    onChange={(e) =>
                      setEditIntercityForm((p) => ({ ...p, additionalCharge: e.target.value }))
                    }
                    disabled={savingEditIntercity}
                  />
                </Col>
              </Row>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={closeEditIntercityModal}
                disabled={savingEditIntercity}
              >
                Cancel
              </Button>
              <Button
                variant="success"
                onClick={saveEditIntercity}
                disabled={savingEditIntercity}
              >
                {savingEditIntercity ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    Updating...
                  </>
                ) : (
                  "Update"
                )}
              </Button>
            </Modal.Footer>
          </Modal>

          {/* Intercity Active/Inactive Confirmation Modal — mirrors the
              rental-rate status modal above so both status toggles feel
              identical. */}
          <Modal
            show={showIntercityStatusModal}
            onHide={closeIntercityStatusModal}
            centered
            size="sm"
            backdrop="static"
            keyboard={false}
          >
            <Modal.Header closeButton={!togglingIntercity}>
              <Modal.Title>Confirm Status Change</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <p className="mb-0">
                Are you sure you want to{" "}
                {intercityStatusRow && intercityStatusRow.isActive !== false
                  ? "deactivate"
                  : "activate"}{" "}
                this intercity charge
                {intercityStatusRow ? (
                  <>
                    {" "}
                    (<strong>
                      {intercityStatusRow.fromCityName} →{" "}
                      {intercityStatusRow.toCityName}
                    </strong>)
                  </>
                ) : null}
                ?
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={closeIntercityStatusModal}
                disabled={togglingIntercity}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={confirmToggleIntercityActive}
                disabled={togglingIntercity}
              >
                {togglingIntercity ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    Processing...
                  </>
                ) : (
                  "Confirm"
                )}
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
};

export default SchefferDriverRates;
