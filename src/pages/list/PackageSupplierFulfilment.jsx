// Admin confirmation of paid package bookings (backend switch
// package.admin-confirmation.enabled, frontend flag packageAdminConfirmation).
//
// Used by PackageBookingDetailView's "Selected Services" section:
//   • FulfilmentStatusBadge — "Awaiting confirmation" / "Confirmed" / … for
//     every login (agents see only this, never a supplier).
//   • SupplierFulfilmentCell — admin-only "Supplier" column of the hotel row:
//     the supplier the hotel was booked with, or the "Book with supplier" button.
//   • SupplierFulfilmentModal — admin-only: the booked hotel's rooms at its
//     suppliers (found through Hotel Mapping), book one through the system,
//     record a hotel booked by hand, or reject the booking.
//
// Everything talks to /api/v1/package-booking/fulfilment; nothing here runs
// while the flag is off (the detail view doesn't render these).

import React, { useEffect, useState } from "react";
import { Modal, Button, Table, Form, Spinner, Badge } from "react-bootstrap";
import { toast } from "react-hot-toast";
import axiosInstance from "../../components/AxiosInstance";

const BASE = "/api/v1/package-booking/fulfilment";
// Supplier searches can take over a minute (GRN is slow); the backend waits up to 230 s.
const SUPPLIER_TIMEOUT_MS = 250000;

const money = (value, currency = "AED") =>
  value === null || value === undefined || value === ""
    ? "—"
    : `${currency || "AED"} ${Number(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const errorMessage = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const STATUS_VARIANTS = {
  NOT_PAID: "secondary",
  AWAITING_CONFIRMATION: "warning",
  CONFIRMED: "success",
  REJECTED: "danger",
  CANCELLED: "secondary",
};

const SUPPLIER_STATUS_TEXT = {
  BOOKED: "Booked with supplier",
  CANCELLED: "Cancelled with supplier",
  CANCEL_BY_HAND: "Package cancelled: cancel with the supplier by hand",
};

/** GET the booking's confirmation status (admins also get the supplier details). */
export const fetchFulfilment = async (bookingId) => {
  const res = await axiosInstance.get(`${BASE}/${bookingId}`);
  return res.data;
};

export const isTracked = (fulfilment) =>
  !!fulfilment && !!fulfilment.status && fulfilment.status !== "NOT_TRACKED";

export const FulfilmentStatusBadge = ({ fulfilment }) => {
  if (!isTracked(fulfilment)) return null;
  const awaiting = fulfilment.status === "AWAITING_CONFIRMATION";
  return (
    <Badge
      bg={STATUS_VARIANTS[fulfilment.status] || "secondary"}
      text={awaiting ? "dark" : undefined}
      className="ms-2"
      style={{ fontSize: "0.72rem", verticalAlign: "middle" }}
    >
      {fulfilment.statusLabel || fulfilment.status}
    </Badge>
  );
};

/** Admin-only "Supplier" cell of the booked hotel's row. */
export const SupplierFulfilmentCell = ({ fulfilment, onOpen }) => {
  if (!isTracked(fulfilment)) return <span className="text-muted">—</span>;

  if (fulfilment.supplier && fulfilment.status !== "REJECTED") {
    return (
      <div className="small">
        <div>
          <strong>{fulfilment.supplierLabel || fulfilment.supplier}</strong>
          {" · "}
          {fulfilment.bookedVia === "SYSTEM" ? "Booked by the system" : "Booked by hand"}
        </div>
        {fulfilment.supplierReference && (
          <div>Ref: {fulfilment.supplierReference}</div>
        )}
        {fulfilment.hotelBookingCode && (
          <div className="text-muted">Hotel booking: {fulfilment.hotelBookingCode}</div>
        )}
        {fulfilment.roomCategory && (
          <div className="text-muted">
            {fulfilment.roomCategory}
            {fulfilment.mealPlan ? ` · ${fulfilment.mealPlan}` : ""}
          </div>
        )}
        {fulfilment.costAmount != null && (
          <div>
            Cost {money(fulfilment.costAmount, fulfilment.currency)}
            {fulfilment.margin != null && (
              <span className={Number(fulfilment.margin) < 0 ? "text-danger" : "text-success"}>
                {" "}
                · Margin {money(fulfilment.margin, fulfilment.currency)}
              </span>
            )}
          </div>
        )}
        {fulfilment.supplierStatus && SUPPLIER_STATUS_TEXT[fulfilment.supplierStatus] && (
          <div
            className={
              fulfilment.supplierStatus === "CANCEL_BY_HAND" ? "text-danger" : "text-muted"
            }
          >
            {SUPPLIER_STATUS_TEXT[fulfilment.supplierStatus]}
          </div>
        )}
        {fulfilment.actionBy && (
          <div className="text-muted">
            by {fulfilment.actionBy}
            {fulfilment.actionAt
              ? `, ${new Date(fulfilment.actionAt).toLocaleString()}`
              : ""}
          </div>
        )}
      </div>
    );
  }

  if (fulfilment.status === "REJECTED") {
    return (
      <div className="small text-danger">
        Rejected{fulfilment.remarks ? `: ${fulfilment.remarks}` : ""}
      </div>
    );
  }

  if (fulfilment.canAct) {
    return (
      <Button size="sm" variant="primary" onClick={onOpen}>
        Book with supplier
      </Button>
    );
  }
  return <span className="small text-muted">{fulfilment.statusLabel || "—"}</span>;
};

const EMPTY_MANUAL = {
  supplier: "",
  supplierHotelName: "",
  supplierReference: "",
  costAmount: "",
  remarks: "",
};

/** Admin-only: find the booked hotel at its suppliers, book / record it, or reject. */
export const SupplierFulfilmentModal = ({ show, onHide, bookingId, fulfilment, onDone }) => {
  const [mode, setMode] = useState("rates"); // rates | manual | reject
  const [rates, setRates] = useState(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [bookingKey, setBookingKey] = useState(null);
  const [manual, setManual] = useState(EMPTY_MANUAL);
  const [rejectReason, setRejectReason] = useState("");
  const [saving, setSaving] = useState(false);

  const loadRates = async () => {
    setLoadingRates(true);
    setRates(null);
    try {
      const res = await axiosInstance.post(
        `${BASE}/${bookingId}/supplier-rates`,
        {},
        { timeout: SUPPLIER_TIMEOUT_MS },
      );
      setRates(res.data);
    } catch (error) {
      toast.error(errorMessage(error, "Could not load the supplier rates."));
    } finally {
      setLoadingRates(false);
    }
  };

  // Search as soon as the window opens on the rates view.
  useEffect(() => {
    if (show && mode === "rates" && rates === null && !loadingRates) {
      loadRates();
    }
    if (!show) {
      setMode("rates");
      setRates(null);
      setManual(EMPTY_MANUAL);
      setRejectReason("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const finish = (message) => {
    toast.success(message);
    if (onDone) onDone();
    onHide();
  };

  const bookOption = async (option) => {
    const ok = window.confirm(
      `Book "${option.roomCategory || "room"}" with ${option.supplierLabel || option.supplier} ` +
        `for ${money(option.price, option.currency)}?\n\nThis places a REAL booking with the supplier.`,
    );
    if (!ok) return;
    setBookingKey(option.optionKey);
    try {
      await axiosInstance.post(
        `${BASE}/${bookingId}/supplier-book`,
        { optionKey: option.optionKey, expectedPrice: option.price },
        { timeout: SUPPLIER_TIMEOUT_MS },
      );
      finish("Hotel booked with the supplier. The booking is confirmed.");
    } catch (error) {
      toast.error(errorMessage(error, "Booking with the supplier failed."));
    } finally {
      setBookingKey(null);
    }
  };

  const recordFromOption = (option) => {
    setManual({
      ...EMPTY_MANUAL,
      supplier: option.supplierLabel || option.supplier || "",
      supplierHotelName: option.hotelName || "",
      costAmount: option.cost != null ? String(option.cost) : "",
    });
    setMode("manual");
  };

  const saveManual = async () => {
    if (!manual.supplier.trim() || !manual.supplierReference.trim()) {
      toast.error("Please enter the supplier and its booking reference.");
      return;
    }
    setSaving(true);
    try {
      await axiosInstance.post(`${BASE}/${bookingId}/supplier-manual`, {
        supplier: manual.supplier.trim(),
        supplierHotelName: manual.supplierHotelName.trim() || null,
        supplierReference: manual.supplierReference.trim(),
        costAmount: manual.costAmount === "" ? null : Number(manual.costAmount),
        currency: "AED",
        remarks: manual.remarks.trim() || null,
      });
      finish("Supplier booking recorded. The booking is confirmed.");
    } catch (error) {
      toast.error(errorMessage(error, "Could not record the supplier booking."));
    } finally {
      setSaving(false);
    }
  };

  const doReject = async () => {
    if (!rejectReason.trim()) {
      toast.error("Please enter the reason.");
      return;
    }
    const ok = window.confirm(
      "Reject this booking? It will be cancelled and the agent refunded as a normal cancellation.",
    );
    if (!ok) return;
    setSaving(true);
    try {
      const res = await axiosInstance.post(`${BASE}/${bookingId}/reject`, {
        reason: rejectReason.trim(),
      });
      finish(res?.data?.message || "Booking rejected and cancelled.");
    } catch (error) {
      toast.error(errorMessage(error, "Could not reject the booking."));
    } finally {
      setSaving(false);
    }
  };

  const busy = loadingRates || saving || !!bookingKey;

  return (
    <Modal show={show} onHide={() => !busy && onHide()} size="xl" centered>
      <Modal.Header closeButton={!busy}>
        <Modal.Title style={{ fontSize: "1.05rem" }}>
          Book with supplier{fulfilment?.bookingCode ? ` — ${fulfilment.bookingCode}` : ""}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: "0.85rem" }}>
        <div className="d-flex gap-2 mb-3">
          <Button
            size="sm"
            variant={mode === "rates" ? "primary" : "outline-primary"}
            disabled={busy}
            onClick={() => setMode("rates")}
          >
            Supplier rates
          </Button>
          <Button
            size="sm"
            variant={mode === "manual" ? "primary" : "outline-primary"}
            disabled={busy}
            onClick={() => setMode("manual")}
          >
            Booked by hand
          </Button>
          <Button
            size="sm"
            variant={mode === "reject" ? "danger" : "outline-danger"}
            disabled={busy}
            onClick={() => setMode("reject")}
          >
            Reject booking
          </Button>
        </div>

        {mode === "rates" && (
          <>
            {loadingRates && (
              <div className="d-flex align-items-center gap-2 text-muted mb-2">
                <Spinner animation="border" size="sm" />
                <span>Searching the hotel at its suppliers… this can take a minute.</span>
              </div>
            )}
            {rates && (
              <>
                <div className="mb-2">
                  <strong>{rates.hotelName}</strong>
                  {rates.masterHotelName && rates.masterHotelName !== rates.hotelName
                    ? ` (${rates.masterHotelName})`
                    : ""}
                  <div className="text-muted">
                    {rates.checkIn} → {rates.checkOut} ({rates.nights} night
                    {rates.nights === 1 ? "" : "s"}) · {rates.adults} adult
                    {rates.adults === 1 ? "" : "s"}
                    {rates.children ? `, ${rates.children} child${rates.children === 1 ? "" : "ren"}` : ""}
                    {rates.childAges?.length ? ` (ages ${rates.childAges.join(", ")})` : ""} ·
                    Nationality {rates.nationality} · Agent paid{" "}
                    {money(rates.paidAmount)}
                  </div>
                </div>
                {!rates.systemBookingEnabled && (
                  <div className="alert alert-info py-2 mb-2">
                    Booking with suppliers through the system is switched off: book the
                    room with the supplier and use “Record” to save it.
                  </div>
                )}
                {rates.multiDestination && (
                  <div className="alert alert-warning py-2 mb-2">
                    This package covers more than one city: book its hotels by hand and
                    record them.
                  </div>
                )}
                {rates.message && (
                  <div className="alert alert-secondary py-2 mb-2">{rates.message}</div>
                )}
                {rates.supplierStatus?.length > 0 && (
                  <div className="text-muted small mb-2">
                    {rates.supplierStatus
                      .map(
                        (s) =>
                          `${s.supplier}: ${s.rooms ?? 0} room${s.rooms === 1 ? "" : "s"}` +
                          (s.status && s.status !== "OK" && s.status !== "SUCCESS"
                            ? ` (${s.status}${s.message ? ` – ${s.message}` : ""})`
                            : ""),
                      )
                      .join(" · ")}
                  </div>
                )}
                {rates.options?.length > 0 && (
                  <div style={{ maxHeight: "55vh", overflowY: "auto" }}>
                    <Table size="sm" bordered hover className="mb-0">
                      <thead style={{ backgroundColor: "#f8f8f8", position: "sticky", top: 0 }}>
                        <tr>
                          <th>Supplier</th>
                          <th>Room</th>
                          <th>Meal plan</th>
                          <th>Cancellation</th>
                          <th className="text-end">Cost</th>
                          <th className="text-end">Price</th>
                          <th className="text-end">Margin</th>
                          <th style={{ width: 120 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {rates.options.map((o) => (
                          <tr key={o.optionKey}>
                            <td>{o.supplierLabel || o.supplier}</td>
                            <td>{o.roomCategory || "—"}</td>
                            <td>{o.mealPlan || "—"}</td>
                            <td>
                              {o.nonRefundable ? (
                                <span className="text-danger">Non-refundable</span>
                              ) : (
                                <span className="text-success">Refundable</span>
                              )}
                              {o.deadlineDate && (
                                <div className="text-muted small">Free until {o.deadlineDate}</div>
                              )}
                              {o.cancellationPolicy?.length > 0 && (
                                <div className="text-muted small" title={o.cancellationPolicy.join("\n")}>
                                  {o.cancellationPolicy[0]}
                                  {o.cancellationPolicy.length > 1 ? " …" : ""}
                                </div>
                              )}
                            </td>
                            <td className="text-end">{money(o.cost, o.currency)}</td>
                            <td className="text-end">{money(o.price, o.currency)}</td>
                            <td
                              className={`text-end ${
                                o.margin != null && Number(o.margin) < 0 ? "text-danger fw-bold" : ""
                              }`}
                            >
                              {money(o.margin, o.currency)}
                              {o.margin != null && Number(o.margin) < 0 && (
                                <div className="small">Loss</div>
                              )}
                            </td>
                            <td className="text-center">
                              {o.bookable ? (
                                <Button
                                  size="sm"
                                  variant="success"
                                  disabled={busy}
                                  onClick={() => bookOption(o)}
                                >
                                  {bookingKey === o.optionKey ? (
                                    <Spinner animation="border" size="sm" />
                                  ) : (
                                    "Book"
                                  )}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline-secondary"
                                  disabled={busy}
                                  title={o.notBookableReason || ""}
                                  onClick={() => recordFromOption(o)}
                                >
                                  Record
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </>
            )}
            {!loadingRates && (
              <div className="mt-2">
                <Button size="sm" variant="outline-secondary" onClick={loadRates} disabled={busy}>
                  Search again
                </Button>
              </div>
            )}
          </>
        )}

        {mode === "manual" && (
          <div style={{ maxWidth: 520 }}>
            <p className="text-muted">
              Book the hotel with the supplier yourself, then record it here. The
              booking is then confirmed and the agent receives the final voucher.
            </p>
            <Form.Group className="mb-2">
              <Form.Label className="mb-1">Supplier *</Form.Label>
              <Form.Control
                value={manual.supplier}
                onChange={(e) => setManual({ ...manual, supplier: e.target.value })}
                placeholder="e.g. IWTX"
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label className="mb-1">Supplier booking reference *</Form.Label>
              <Form.Control
                value={manual.supplierReference}
                onChange={(e) => setManual({ ...manual, supplierReference: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label className="mb-1">Hotel name at the supplier</Form.Label>
              <Form.Control
                value={manual.supplierHotelName}
                onChange={(e) => setManual({ ...manual, supplierHotelName: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label className="mb-1">Cost (AED, whole stay)</Form.Label>
              <Form.Control
                type="number"
                min="0"
                step="0.01"
                value={manual.costAmount}
                onChange={(e) => setManual({ ...manual, costAmount: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="mb-1">Remarks</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={manual.remarks}
                onChange={(e) => setManual({ ...manual, remarks: e.target.value })}
              />
            </Form.Group>
            <Button variant="success" disabled={saving} onClick={saveManual}>
              {saving ? <Spinner animation="border" size="sm" /> : "Save and confirm booking"}
            </Button>
          </div>
        )}

        {mode === "reject" && (
          <div style={{ maxWidth: 520 }}>
            <p className="text-muted">
              Use this when no supplier has the hotel. The booking is cancelled and the
              agent is refunded as a normal cancellation (a card payment has to be
              refunded by hand), and the agent is emailed.
            </p>
            <Form.Group className="mb-3">
              <Form.Label className="mb-1">Reason *</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </Form.Group>
            <Button variant="danger" disabled={saving} onClick={doReject}>
              {saving ? <Spinner animation="border" size="sm" /> : "Reject and cancel booking"}
            </Button>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" disabled={busy} onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
