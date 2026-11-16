// Per-service admin confirmation of paid package bookings (backend switch
// package.service-fulfilment.enabled, frontend flag packageServiceFulfilment,
// which is only on while packageAdminConfirmation is on too).
//
// ServiceFulfilmentSections renders, ONLY while that flag is on, three cards
// below PackageBookingDetailView's "Selected Services" card (which stays as
// it was). Each lists the services the agent booked with their own status:
//   • Book Hotel — for each hotel the package needs: search the suppliers'
//     live hotel lists for the package's city and stay (or the city and dates
//     the admin picks, for a package with more than one hotel or city), view
//     a hotel's rooms and book one through the system, or record a booking
//     made by hand. The agent's own pick is not repeated here.
//   • Book Transfer / Book Activities — record a booking made by hand
//     (transporter or provider, reference, driver, time, cost).
//   • Book Activities also lists the package's day-wise itinerary, one line
//     per day, while backend package.service-fulfilment.itinerary.enabled is
//     on (the backend sends no itinerary lines otherwise): book the day by
//     hand, or mark it "Not needed" with a reason.
// Agents see only the statuses (never a supplier or a cost). When the last
// service is confirmed the booking is Confirmed (backend). Rejecting the
// whole booking uses the existing /fulfilment/{id}/reject.
//
// Everything talks to /api/v1/package-booking/service-fulfilment. The
// existing PackageSupplierFulfilment.jsx (hotel-only flow) is untouched.

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Modal, Button, Table, Form, Spinner, Badge } from "react-bootstrap";
import { toast } from "react-hot-toast";
import { FaCar, FaChevronDown, FaHotel, FaPlane, FaTicketAlt } from "react-icons/fa";
import axiosInstance from "../../components/AxiosInstance";

const BASE = "/api/v1/package-booking/service-fulfilment";
const REJECT_BASE = "/api/v1/package-booking/fulfilment";
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

const OVERALL_VARIANTS = {
  NOT_PAID: "secondary",
  AWAITING_CONFIRMATION: "warning",
  CONFIRMED: "success",
  REJECTED: "danger",
  CANCELLED: "secondary",
};

const LINE_VARIANTS = {
  NOT_PAID: "secondary",
  PENDING_CONFIRMATION: "warning",
  CONFIRMED: "success",
  NOT_REQUIRED: "secondary",
  REJECTED: "danger",
  CANCELLED: "secondary",
};

/** Confirmed, or an itinerary day marked not needed. */
const isDone = (status) => status === "CONFIRMED" || status === "NOT_REQUIRED";

const SUPPLIER_STATUS_TEXT = {
  BOOKED: "Booked with supplier",
  CANCELLED: "Cancelled with supplier",
  CANCEL_BY_HAND: "Package cancelled: cancel with the supplier by hand",
};

const BOOK_LABEL = {
  HOTEL: "Book hotel",
  TRANSFER: "Book transfer",
  ACTIVITY: "Book activity",
  ITINERARY: "Book day",
  ARRIVAL_TRANSFER: "Book transfer",
  DEPARTURE_TRANSFER: "Book transfer",
};

const StatusBadge = ({ status, label, variants }) => {
  if (!status || status === "NOT_TRACKED") return null;
  const variant = variants[status] || "secondary";
  return (
    <Badge
      bg={variant}
      text={variant === "warning" ? "dark" : undefined}
      style={{ fontSize: "0.72rem", verticalAlign: "middle", fontWeight: 500 }}
    >
      {label || status}
    </Badge>
  );
};

/** Admin-only "Supplier" cell: the booking made for this service, or its Book button. */
const LineSupplierCell = ({ line, onBook, onSkip }) => {
  if (line.status === "NOT_REQUIRED") {
    return (
      <div className="small">
        <div>
          <strong>Not needed</strong>
        </div>
        {line.remarks && <div className="text-muted">{line.remarks}</div>}
        {line.actionBy && (
          <div className="text-muted">
            by {line.actionBy}
            {line.actionAt ? `, ${new Date(line.actionAt).toLocaleString()}` : ""}
          </div>
        )}
      </div>
    );
  }
  if (line.status === "CONFIRMED") {
    // Book Hotel: the hotel actually booked (the agent's pick when it was booked with the package).
    const bookedHotel =
      line.serviceType === "HOTEL"
        ? line.supplierHotelName || (line.agentSupplierHotel ? line.name : null)
        : null;
    return (
      <div className="small">
        {bookedHotel && <div className="fw-semibold">{bookedHotel}</div>}
        <div>
          <strong>{line.supplierLabel || line.supplier || "—"}</strong>
          {" · "}
          {line.bookedVia === "SYSTEM" ? "Booked by the system" : "Booked by hand"}
        </div>
        {line.supplierReference && <div>Ref: {line.supplierReference}</div>}
        {line.hotelBookingCode && (
          <div className="text-muted">Hotel booking: {line.hotelBookingCode}</div>
        )}
        {line.roomCategory && (
          <div className="text-muted">
            {line.roomCategory}
            {line.mealPlan ? ` · ${line.mealPlan}` : ""}
          </div>
        )}
        {line.serviceDate && <div className="text-muted">{line.serviceDate}</div>}
        {(line.driverName || line.driverContact) && (
          <div className="text-muted">
            Driver: {[line.driverName, line.driverContact].filter(Boolean).join(", ")}
          </div>
        )}
        {(line.routeFrom || line.routeTo) && (
          <div className="text-muted">
            {line.routeFrom || "—"} → {line.routeTo || "—"}
          </div>
        )}
        {line.flightNumber && isTransferType(line.serviceType) && (
          <div className="text-muted">Flight: {line.flightNumber}</div>
        )}
        {line.vehicle && <div className="text-muted">Vehicle: {line.vehicle}</div>}
        {line.pickupPoint && <div className="text-muted">Pickup: {line.pickupPoint}</div>}
        {line.costAmount != null && (
          <div>Cost {money(line.costAmount, line.costCurrency)}</div>
        )}
        {line.supplierStatus && SUPPLIER_STATUS_TEXT[line.supplierStatus] && (
          <div
            className={line.supplierStatus === "CANCEL_BY_HAND" ? "text-danger" : "text-muted"}
          >
            {SUPPLIER_STATUS_TEXT[line.supplierStatus]}
          </div>
        )}
        {line.actionBy && (
          <div className="text-muted">
            by {line.actionBy}
            {line.actionAt ? `, ${new Date(line.actionAt).toLocaleString()}` : ""}
          </div>
        )}
      </div>
    );
  }
  if (line.canAct) {
    return (
      <div className="d-flex flex-wrap gap-1">
        <Button size="sm" variant="primary" onClick={() => onBook(line)}>
          {BOOK_LABEL[line.serviceType] || "Book"}
        </Button>
        {line.canSkip && onSkip && (
          <Button size="sm" variant="outline-secondary" onClick={() => onSkip(line)}>
            Not needed
          </Button>
        )}
      </div>
    );
  }
  return <span className="text-muted">—</span>;
};

/** The day's activity text, shortened to a few lines with a toggle. */
const DayActivities = ({ text }) => {
  const [open, setOpen] = useState(false);
  if (!text) return <span className="text-muted">—</span>;
  const long = text.length > 160 || text.split(/\r?\n/).length > 3;
  return (
    <div>
      <div
        style={{
          whiteSpace: "pre-line",
          ...(open || !long
            ? {}
            : { maxHeight: "4.2em", overflow: "hidden" }),
        }}
      >
        {text}
      </div>
      {long && (
        <Button size="sm" variant="link" className="p-0 small" onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Show more"}
        </Button>
      )}
    </div>
  );
};

/** Book Activities: the package's day-wise itinerary, one line per day. */
const ItineraryTable = ({ lines, tracked, admin, onBook, onSkip }) => (
  <>
    <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#555", margin: "10px 0 4px" }}>
      Itinerary
    </div>
    <Table size="sm" className="mb-1" style={{ fontSize: "0.82rem", tableLayout: "fixed" }}>
      <thead style={{ backgroundColor: "#f8f8f8" }}>
        <tr>
          <th style={{ width: 50 }}>Day</th>
          <th style={{ width: 100 }}>Date</th>
          <th style={{ width: 120 }}>Place</th>
          <th>Activities</th>
          {tracked && <th style={{ width: 150, paddingLeft: 20 }}>Status</th>}
          {admin && <th style={{ width: 230, paddingLeft: 20 }}>Supplier</th>}
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr key={`${line.serviceType}-${line.serviceRefId}`}>
            <td>{line.day ?? "—"}</td>
            <td>{line.dayDate || "—"}</td>
            <td>{line.placeName || "—"}</td>
            <td>
              {line.heading && <div className="fw-semibold">{line.heading}</div>}
              <DayActivities text={line.description} />
            </td>
            {tracked && (
              <td style={{ paddingLeft: 20 }}>
                <StatusBadge status={line.status} label={line.statusLabel} variants={LINE_VARIANTS} />
              </td>
            )}
            {admin && (
              <td style={{ paddingLeft: 20 }}>
                <LineSupplierCell line={line} onBook={onBook} onSkip={onSkip} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </Table>
  </>
);

/** A section's status from its services: Confirmed once all are done, else pending with a count. */
const sectionSummary = (lines) => {
  if (!lines.length) return null;
  const confirmed = lines.filter((l) => isDone(l.status)).length;
  if (confirmed === lines.length) return { status: "CONFIRMED", label: "Confirmed" };
  if (lines.some((l) => l.status === "PENDING_CONFIRMATION")) {
    return {
      status: "PENDING_CONFIRMATION",
      label:
        lines.length > 1
          ? `Pending confirmation · ${confirmed} of ${lines.length} confirmed`
          : "Pending confirmation",
    };
  }
  const first = lines.find((l) => !isDone(l.status)) || lines[0];
  return { status: first.status, label: first.statusLabel };
};

/** One "Book Hotel" / "Book Transfer" / "Book Activities" card. */
const ServiceSection = ({
  title,
  lines,
  isHotel,
  tracked,
  admin,
  canSeeSuppliers,
  onBook,
  emptyText,
  cardStyle,
  headerStyle,
  headerExtra,
  onSkip,
  // Optional: a small heading above the table, the lines the header badge
  // counts (default: lines) and extra content below the table.
  tableTitle,
  summaryLines,
  children,
  // Optional: starts closed with an open/close arrow at the far right (like
  // Book Hotel / Book Transfer); once opened the body stays mounted.
  collapsible,
  // Optional: inside the Selected Preferred Hotels card (three-column
  // layout): the content only, without this card's frame and heading.
  embedded,
}) => {
  const summary = tracked ? sectionSummary(summaryLines || lines) : null;
  const [open, setOpen] = useState(!collapsible);
  const [opened, setOpened] = useState(!collapsible);
  const toggle = () => {
    setOpen((v) => !v);
    setOpened(true);
  };
  const titleContent = (
    <>
      {title}
      {summary && (
        <StatusBadge status={summary.status} label={summary.label} variants={LINE_VARIANTS} />
      )}
    </>
  );
  return (
  <div style={embedded ? undefined : cardStyle}>
    {!embedded && (
    <div style={{ ...headerStyle, justifyContent: "space-between", flexWrap: "wrap" }}>
      {collapsible ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="d-flex align-items-center gap-2 border-0 bg-transparent p-0 text-start"
          style={{ font: "inherit", color: "inherit", cursor: "pointer" }}
        >
          {titleContent}
        </button>
      ) : (
        <span className="d-flex align-items-center gap-2">{titleContent}</span>
      )}
      {collapsible ? (
        <span className="d-flex align-items-center gap-2 ms-auto">
          {headerExtra}
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={open ? `Close ${title}` : `Open ${title}`}
            className="d-flex align-items-center border-0 bg-transparent p-1"
            style={{ color: "inherit", cursor: "pointer" }}
          >
            <FaChevronDown
              aria-hidden="true"
              style={{
                fontSize: "0.8rem",
                transition: "transform 0.15s",
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>
        </span>
      ) : (
        headerExtra
      )}
    </div>
    )}
    {(embedded || opened) && (
    <div
      style={
        embedded ? undefined : { padding: "10px 16px 12px", display: open ? undefined : "none" }
      }
    >
    {tableTitle && (
      <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#555", margin: "0 0 4px" }}>
        {tableTitle}
      </div>
    )}
    {lines.length === 0 ? (
      <div style={{ fontSize: "0.82rem", color: "#888", fontStyle: "italic" }}>{emptyText}</div>
    ) : (
      <Table size="sm" className="mb-1" style={{ fontSize: "0.82rem" }}>
        <thead style={{ backgroundColor: "#f8f8f8" }}>
          <tr>
            <th>{isHotel ? "Hotel" : "Service"}</th>
            {isHotel && <th style={{ width: 110 }}>Hotel ID</th>}
            <th className="text-end" style={{ width: 150 }}>
              {isHotel ? "Per Pax Rate" : "Rate"}
            </th>
            {tracked && <th style={{ width: 170, paddingLeft: 20 }}>Status</th>}
            {admin && <th style={{ width: 280, paddingLeft: 20 }}>Supplier</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={`${line.serviceType}-${line.serviceRefId}`}>
              <td>
                {line.name || "—"}
                {isHotel && line.agentSupplierHotel && canSeeSuppliers && (
                  <div className="small text-muted">Supplier hotel picked by the agent</div>
                )}
              </td>
              {isHotel && <td>{line.agentSupplierHotel ? "—" : line.hotelId ?? "—"}</td>}
              <td className="text-end">
                {money(line.rate || 0, line.currency)}
                {isHotel && line.agentSupplierHotel && (
                  <div className="small text-muted">Whole stay</div>
                )}
              </td>
              {tracked && (
                <td style={{ paddingLeft: 20 }}>
                  <StatusBadge
                    status={line.status}
                    label={line.statusLabel}
                    variants={LINE_VARIANTS}
                  />
                </td>
              )}
              {admin && (
                <td style={{ paddingLeft: 20 }}>
                  <LineSupplierCell line={line} onBook={onBook} onSkip={onSkip} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
    )}
    {children}
    </div>
    )}
  </div>
  );
};

const FieldError =({ message }) =>
  message ? <div className="small text-danger mt-1">{message}</div> : null;

const EMPTY_MANUAL = {
  supplier: "",
  supplierReference: "",
  supplierHotelName: "",
  serviceDate: "",
  driverName: "",
  driverContact: "",
  vehicle: "",
  pickupPoint: "",
  routeFrom: "",
  routeTo: "",
  flightNumber: "",
  costAmount: "",
  remarks: "",
};

/** The agent's cab and the arrival / departure transfers are all booked as transfers. */
const isTransferType = (type) =>
  type === "TRANSFER" || type === "ARRIVAL_TRANSFER" || type === "DEPARTURE_TRANSFER";

/** Record form for a service booked by hand (hotel, transfer, activity or itinerary day). */
const ManualForm = ({ line, bookingId, onSaved, disabled, prefill }) => {
  const type = line.serviceType;
  // An itinerary day is booked like an activity.
  const activityLike = type === "ACTIVITY" || type === "ITINERARY";
  const transferLike = isTransferType(type);
  // The route and flight fields are for the arrival / departure transfers (and
  // any transfer pre-filled from the transfer search); the agent's cab keeps
  // its old form otherwise.
  const routeFields = transferLike && (type !== "TRANSFER" || !!prefill);
  const [form, setForm] = useState({
    ...EMPTY_MANUAL,
    supplier: prefill?.supplier || line.suggestedSupplier || "",
    supplierHotelName: prefill?.supplierHotelName || "",
    costAmount: prefill?.costAmount || "",
    vehicle: prefill?.vehicle || "",
    routeFrom: prefill?.routeFrom || "",
    routeTo: prefill?.routeTo || "",
    flightNumber: prefill?.flightNumber || line.flightNumber || "",
    serviceDate:
      prefill?.serviceDate ||
      ((type === "ITINERARY" || type === "ARRIVAL_TRANSFER" || type === "DEPARTURE_TRANSFER") && line.dayDate
        ? line.dayDate
        : ""),
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value });
    if (errors[field]) setErrors({ ...errors, [field]: null });
  };

  const supplierLabelText =
    transferLike ? "Transporter *" : activityLike ? "Activity provider *" : "Supplier *";

  const save = async () => {
    const next = {};
    if (!form.supplier.trim()) {
      next.supplier =
        transferLike
          ? "Enter the transporter first."
          : activityLike
            ? "Enter the provider first."
            : "Enter the supplier first.";
    }
    if (!form.supplierReference.trim()) next.supplierReference = "Enter the booking reference first.";
    // The Book Hotel card no longer shows the agent's hotel, so the booked one must be named.
    if (type === "HOTEL" && !form.supplierHotelName.trim()) next.supplierHotelName = "Enter the hotel name first.";
    if (form.costAmount !== "" && Number(form.costAmount) < 0) next.costAmount = "The cost can't be negative.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const trimOrNull = (v) => (v && v.trim() ? v.trim() : null);
      const res = await axiosInstance.post(
        `${BASE}/${bookingId}/services/${type}/${line.serviceRefId}/manual`,
        {
          supplier: form.supplier.trim(),
          supplierReference: form.supplierReference.trim(),
          supplierHotelName: type === "HOTEL" ? trimOrNull(form.supplierHotelName) : null,
          serviceDate: trimOrNull(form.serviceDate),
          driverName: transferLike ? trimOrNull(form.driverName) : null,
          driverContact: transferLike ? trimOrNull(form.driverContact) : null,
          vehicle: transferLike ? trimOrNull(form.vehicle) : null,
          pickupPoint: activityLike ? trimOrNull(form.pickupPoint) : null,
          routeFrom: routeFields ? trimOrNull(form.routeFrom) : null,
          routeTo: routeFields ? trimOrNull(form.routeTo) : null,
          flightNumber: routeFields ? trimOrNull(form.flightNumber) : null,
          costAmount: form.costAmount === "" ? null : Number(form.costAmount),
          currency: "AED",
          remarks: trimOrNull(form.remarks),
        },
      );
      onSaved(res.data, "Booking recorded. The service is confirmed.");
    } catch (error) {
      toast.error(errorMessage(error, "Could not record the booking."));
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || disabled;
  const field = (label, name, props = {}) => (
    <Form.Group className="mb-2" style={props.half ? { flex: "1 1 220px" } : undefined}>
      <Form.Label className="mb-1">{label}</Form.Label>
      <Form.Control
        value={form[name]}
        onChange={set(name)}
        isInvalid={!!errors[name]}
        disabled={busy}
        placeholder={props.placeholder}
        type={props.type}
        min={props.min}
        step={props.step}
        as={props.as}
        rows={props.rows}
      />
      <FieldError message={errors[name]} />
    </Form.Group>
  );

  return (
    <div style={{ maxWidth: 560 }}>
      <p className="text-muted mb-2">
        {transferLike
          ? "Book the transfer with the transporter, then record it here."
          : type === "ACTIVITY"
            ? "Book the activity with its provider, then record it here."
            : type === "ITINERARY"
              ? "Book this day's tours and entries with the provider, then record it here."
              : "Book the hotel with the supplier yourself, then record it here."}{" "}
        The service is then confirmed. The booking is confirmed, and the agent gets the
        final voucher, once every service is confirmed.
      </p>
      <div className="d-flex flex-wrap" style={{ columnGap: 12 }}>
        {field(supplierLabelText, "supplier", { half: true })}
        {field("Supplier booking reference *", "supplierReference", { half: true })}
        {type === "HOTEL" && (
          <>
            {field("Hotel name *", "supplierHotelName", { half: true })}
            {field("Stay dates", "serviceDate", { half: true, placeholder: "2026-11-26 to 2026-11-27" })}
          </>
        )}
        {routeFields && (
          <>
            {field("From", "routeFrom", { half: true, placeholder: "Dubai International Airport (DXB)" })}
            {field("To", "routeTo", { half: true, placeholder: "Hotel name" })}
            {field("Flight number", "flightNumber", { half: true, placeholder: "EK 503" })}
          </>
        )}
        {transferLike && (
          <>
            {field("Driver name", "driverName", { half: true })}
            {field("Driver contact", "driverContact", { half: true })}
            {field("Vehicle", "vehicle", { half: true, placeholder: "Sedan · DXB 12345" })}
            {field("Pickup date and time", "serviceDate", { half: true, placeholder: "15 Dec, 14:30" })}
          </>
        )}
        {activityLike && (
          <>
            {field("Tour date and time", "serviceDate", { half: true, placeholder: "16 Dec, 15:00" })}
            {field("Pickup point", "pickupPoint", { half: true })}
          </>
        )}
        {field(type === "HOTEL" ? "Cost (AED, whole stay)" : "Cost (AED)", "costAmount", {
          half: true,
          type: "number",
          min: "0",
          step: "0.01",
        })}
      </div>
      {field("Remarks", "remarks", { as: "textarea", rows: 2 })}
      <Button variant="success" disabled={busy} onClick={save}>
        {saving ? <Spinner animation="border" size="sm" /> : "Save and confirm service"}
      </Button>
    </div>
  );
};

const HOTELS_PER_PAGE = 10;

const starText = (n) => (n ? "★".repeat(Math.max(0, Math.min(5, Math.round(Number(n))))) : "");

const isWebImage = (src) => typeof src === "string" && /^https?:\/\//i.test(src.trim());

/**
 * Admin-only: the picked supplier hotel's rooms for the stay (and, if the
 * hotel is mapped, its rooms at the other linked suppliers) — book one
 * through the system, or record a booking made by hand.
 */
const SupplierHotelRoomsModal = ({ show, hotel, stay, bookingId, line, onHide, onSaved, onRecord }) => {
  const [rates, setRates] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bookingKey, setBookingKey] = useState(null);

  const request =
    hotel && stay
      ? {
          supplier: hotel.supplier,
          hotelCode: hotel.hotelCode,
          hotelName: hotel.hotelName,
          cityId: stay.cityId,
          checkIn: stay.checkIn,
          checkOut: stay.checkOut,
        }
      : null;

  const load = async () => {
    if (!request || !line) return;
    setLoading(true);
    setRates(null);
    try {
      const res = await axiosInstance.post(
        `${BASE}/${bookingId}/hotels/${line.serviceRefId}/supplier-hotel-rooms`,
        request,
        { timeout: SUPPLIER_TIMEOUT_MS },
      );
      setRates(res.data);
    } catch (error) {
      toast.error(errorMessage(error, "Could not load the hotel's rooms."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show && hotel) load();
    if (!show) setRates(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, hotel?.supplier, hotel?.hotelCode]);

  const recordFrom = (option) =>
    onRecord({
      supplier: option ? option.supplierLabel || option.supplier : hotel.supplierLabel || hotel.supplier,
      supplierHotelName: (option && option.hotelName) || hotel.hotelName || "",
      costAmount: option && option.cost != null ? String(option.cost) : "",
      serviceDate: `${stay.checkIn} to ${stay.checkOut}`,
    });

  const book = async (option) => {
    const ok = window.confirm(
      `Book "${option.roomCategory || "room"}" at ${option.hotelName || hotel.hotelName} ` +
        `with ${option.supplierLabel || option.supplier}\n` +
        `for ${stay.checkIn} → ${stay.checkOut}, ${money(option.price, option.currency)}?\n\n` +
        "This places a REAL booking with the supplier.",
    );
    if (!ok) return;
    setBookingKey(option.optionKey);
    try {
      const res = await axiosInstance.post(
        `${BASE}/${bookingId}/hotels/${line.serviceRefId}/supplier-hotel-book`,
        { ...request, optionKey: option.optionKey, expectedPrice: option.price },
        { timeout: SUPPLIER_TIMEOUT_MS },
      );
      onSaved(res.data, "Hotel booked with the supplier. The hotel is confirmed.");
    } catch (error) {
      toast.error(errorMessage(error, "Booking with the supplier failed."));
    } finally {
      setBookingKey(null);
    }
  };

  const busy = loading || !!bookingKey;
  if (!hotel || !stay) return null;

  return (
    <Modal show={show} onHide={() => !busy && onHide()} size="xl" centered>
      <Modal.Header closeButton={!busy}>
        <Modal.Title style={{ fontSize: "1.05rem" }}>Rooms — {hotel.hotelName}</Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: "0.85rem" }}>
        <div className="mb-2">
          <strong>{hotel.hotelName}</strong>
          {hotel.starRating ? <span className="text-warning ms-1">{starText(hotel.starRating)}</span> : null}
          <span className="text-muted"> · {hotel.supplierLabel || hotel.supplier}</span>
          {rates && (
            <div className="text-muted">
              {rates.checkIn} → {rates.checkOut} ({rates.nights} night{rates.nights === 1 ? "" : "s"}) ·{" "}
              {rates.adults} adult{rates.adults === 1 ? "" : "s"}
              {rates.children ? `, ${rates.children} child${rates.children === 1 ? "" : "ren"}` : ""}
              {rates.childAges?.length ? ` (ages ${rates.childAges.join(", ")})` : ""} · Nationality{" "}
              {rates.nationality} · Agent paid {money(rates.paidAmount)}
            </div>
          )}
        </div>
        {loading && (
          <div className="d-flex align-items-center gap-2 text-muted mb-2">
            <Spinner animation="border" size="sm" />
            <span>Loading the rooms… this can take a minute.</span>
          </div>
        )}
        {rates && (
          <>
            {!rates.systemBookingEnabled && (
              <div className="alert alert-info py-2 mb-2">
                Booking with suppliers through the system is switched off: book the room with
                the supplier and use “Record” to save it.
              </div>
            )}
            {rates.message && <div className="alert alert-secondary py-2 mb-2">{rates.message}</div>}
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
                        <td className="text-center">
                          {o.bookable ? (
                            <Button size="sm" variant="success" disabled={busy} onClick={() => book(o)}>
                              {bookingKey === o.optionKey ? <Spinner animation="border" size="sm" /> : "Book"}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              disabled={busy}
                              title={o.notBookableReason || ""}
                              onClick={() => recordFrom(o)}
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
      </Modal.Body>
      <Modal.Footer className="justify-content-between">
        <div className="d-flex gap-2">
          <Button size="sm" variant="outline-secondary" onClick={load} disabled={busy}>
            Search again
          </Button>
          <Button size="sm" variant="outline-primary" onClick={() => recordFrom(null)} disabled={busy}>
            Booked by hand
          </Button>
        </div>
        <Button variant="secondary" disabled={busy} onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

/**
 * Admin-only: the suppliers' live hotel lists for this hotel's stay — the
 * package's city and whole stay, or (more than one hotel or city) the city
 * and dates the admin picks. Searching never books anything; "View rooms"
 * then lets the admin book or record one.
 */
const SupplierHotelSearch = ({ line, bookingId, onSaved, onRecord }) => {
  const [ctx, setCtx] = useState(null);
  const [ctxError, setCtxError] = useState(null);
  const [cityId, setCityId] = useState(null);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [formError, setFormError] = useState(null);
  // The stay the shown results are for (rooms and booking use the same one).
  const [stay, setStay] = useState(null);
  const [results, setResults] = useState({});
  const [nameFilter, setNameFilter] = useState("");
  const [minStars, setMinStars] = useState(0);
  const [supplierFilter, setSupplierFilter] = useState("");
  const [page, setPage] = useState(1);
  const [roomsHotel, setRoomsHotel] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setCtx(null);
    setCtxError(null);
    axiosInstance
      .post(`${BASE}/${bookingId}/hotels/${line.serviceRefId}/search-context`, {})
      .then((res) => {
        if (cancelled) return;
        setCtx(res.data);
        setCityId(res.data.cityId);
        setCheckIn(res.data.checkIn);
        setCheckOut(res.data.checkOut);
      })
      .catch((err) => {
        if (!cancelled) setCtxError(errorMessage(err, "Could not load this hotel's stay."));
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId, line.serviceRefId]);

  const search = () => {
    if (!ctx) return;
    if (ctx.datesEditable) {
      if (!checkIn || !checkOut) {
        setFormError("Enter the check-in and check-out first.");
        return;
      }
      if (checkOut <= checkIn) {
        setFormError("The check-out must be after the check-in.");
        return;
      }
      if (checkIn < ctx.stayStart || checkOut > ctx.stayEnd) {
        setFormError(`The dates must be inside the package's stay (${ctx.stayStart} to ${ctx.stayEnd}).`);
        return;
      }
    }
    setFormError(null);
    const s = {
      cityId,
      checkIn: ctx.datesEditable ? checkIn : ctx.checkIn,
      checkOut: ctx.datesEditable ? checkOut : ctx.checkOut,
    };
    setStay(s);
    setPage(1);
    setResults(
      Object.fromEntries(ctx.suppliers.map((sp) => [sp.code, { status: "LOADING", hotels: [] }])),
    );
    // Each supplier separately, so one slow supplier doesn't hold back the rest.
    ctx.suppliers.forEach(async (sp) => {
      let result;
      try {
        const res = await axiosInstance.post(
          `${BASE}/${bookingId}/hotels/${line.serviceRefId}/supplier-hotels`,
          { ...s, supplier: sp.code },
          { timeout: SUPPLIER_TIMEOUT_MS },
        );
        result = {
          status: res.data?.status || "OK",
          hotels: Array.isArray(res.data?.hotels) ? res.data.hotels : [],
          message: res.data?.message,
        };
      } catch (err) {
        result = { status: "FAILED", hotels: [], message: errorMessage(err, "The search failed.") };
      }
      setResults((prev) => ({ ...prev, [sp.code]: result }));
    });
  };

  if (ctxError) return <div className="small text-danger">{ctxError}</div>;
  if (!ctx) {
    return (
      <div className="d-flex align-items-center gap-2 text-muted small">
        <Spinner animation="border" size="sm" />
        <span>Loading the stay…</span>
      </div>
    );
  }

  const cityName = (id) => ctx.cities.find((c) => c.id === id)?.name || "—";
  const searching = Object.values(results).some((r) => r.status === "LOADING");
  const all = Object.values(results).flatMap((r) => r.hotels || []);
  const needle = nameFilter.trim().toLowerCase();
  const filtered = all
    .filter((h) => !needle || String(h.hotelName || "").toLowerCase().includes(needle))
    .filter((h) => !minStars || Number(h.starRating || 0) >= minStars)
    .filter((h) => !supplierFilter || h.supplier === supplierFilter)
    .sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  const totalPages = Math.max(1, Math.ceil(filtered.length / HOTELS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const firstIndex = (currentPage - 1) * HOTELS_PER_PAGE;
  const pageRows = filtered.slice(firstIndex, firstIndex + HOTELS_PER_PAGE);

  return (
    <div style={{ fontSize: "0.82rem" }}>
      <div className="text-muted mb-2">
        {ctx.adults} adult{ctx.adults === 1 ? "" : "s"}
        {ctx.children ? `, ${ctx.children} child${ctx.children === 1 ? "" : "ren"}` : ""}
        {ctx.childAges?.length ? ` (ages ${ctx.childAges.join(", ")})` : ""} · 1 room · Nationality{" "}
        {ctx.nationality} · Agent paid {money(ctx.paidAmount)}
        {ctx.datesEditable && (
          <span>
            {" "}
            · Package stay {ctx.stayStart} → {ctx.stayEnd}
          </span>
        )}
      </div>

      <div className="d-flex flex-wrap align-items-end gap-2 mb-2">
        <Form.Group>
          <Form.Label className="mb-1 small">City</Form.Label>
          {ctx.cities.length > 1 ? (
            <Form.Select
              size="sm"
              value={cityId ?? ""}
              onChange={(e) => setCityId(Number(e.target.value))}
              style={{ minWidth: 160 }}
            >
              {ctx.cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Form.Select>
          ) : (
            <div className="form-control form-control-sm bg-light" style={{ minWidth: 140 }}>
              {cityName(cityId)}
            </div>
          )}
        </Form.Group>
        <Form.Group>
          <Form.Label className="mb-1 small">Check-in</Form.Label>
          <Form.Control
            size="sm"
            type="date"
            value={checkIn}
            min={ctx.stayStart}
            max={ctx.stayEnd}
            disabled={!ctx.datesEditable}
            onChange={(e) => {
              setCheckIn(e.target.value);
              setFormError(null);
            }}
          />
        </Form.Group>
        <Form.Group>
          <Form.Label className="mb-1 small">Check-out</Form.Label>
          <Form.Control
            size="sm"
            type="date"
            value={checkOut}
            min={ctx.stayStart}
            max={ctx.stayEnd}
            disabled={!ctx.datesEditable}
            onChange={(e) => {
              setCheckOut(e.target.value);
              setFormError(null);
            }}
          />
        </Form.Group>
        <Button size="sm" variant="primary" onClick={search} disabled={searching || !ctx.suppliers.length}>
          {searching ? <Spinner animation="border" size="sm" /> : stay ? "Search again" : "Search hotels"}
        </Button>
        <Button
          size="sm"
          variant="outline-secondary"
          onClick={() =>
            onRecord({
              serviceDate: `${ctx.datesEditable ? checkIn : ctx.checkIn} to ${
                ctx.datesEditable ? checkOut : ctx.checkOut
              }`,
            })
          }
        >
          Booked by hand
        </Button>
      </div>
      <FieldError message={formError} />

      {!ctx.suppliers.length && (
        <div className="alert alert-secondary py-2 mb-2">
          No supplier is enabled for this booking's agent. Book the hotel by hand and record it.
        </div>
      )}
      {ctx.suppliers.length > 0 && !ctx.systemBookingEnabled && (
        <div className="alert alert-info py-2 mb-2">
          Booking with suppliers through the system is switched off: pick a hotel, book it with the
          supplier and record it.
        </div>
      )}
      {!stay && ctx.suppliers.length > 0 && (
        <div className="text-muted">
          Search the suppliers' hotels in {cityName(cityId)} ({ctx.suppliers.map((s) => s.label).join(", ")}).
          Searching books nothing.
        </div>
      )}

      {stay && (
        <>
          <div className="d-flex flex-wrap gap-1 mb-2">
            {ctx.suppliers.map((sp) => {
              const r = results[sp.code] || {};
              const text =
                r.status === "LOADING"
                  ? "searching…"
                  : r.status === "OK"
                    ? `${(r.hotels || []).length} hotel${(r.hotels || []).length === 1 ? "" : "s"}`
                    : r.status === "UNAVAILABLE"
                      ? "not enabled"
                      : r.status === "FAILED"
                        ? "no answer"
                        : "—";
              return (
                <Badge
                  key={sp.code}
                  bg={r.status === "FAILED" ? "danger" : r.status === "OK" ? "light" : "secondary"}
                  text={r.status === "OK" ? "dark" : undefined}
                  className="border"
                  style={{ fontWeight: 500 }}
                  title={r.message || ""}
                >
                  {sp.label}: {text}
                  {sp.systemBookable ? "" : " · record only"}
                </Badge>
              );
            })}
          </div>

          {all.length > 0 && (
            <div className="d-flex flex-wrap gap-2 mb-2">
              <Form.Control
                size="sm"
                placeholder="Filter by hotel name"
                value={nameFilter}
                onChange={(e) => {
                  setNameFilter(e.target.value);
                  setPage(1);
                }}
                style={{ maxWidth: 240 }}
              />
              <Form.Select
                size="sm"
                value={minStars}
                onChange={(e) => {
                  setMinStars(Number(e.target.value));
                  setPage(1);
                }}
                style={{ maxWidth: 130 }}
              >
                <option value={0}>Any stars</option>
                <option value={3}>3★ and up</option>
                <option value={4}>4★ and up</option>
                <option value={5}>5★</option>
              </Form.Select>
              <Form.Select
                size="sm"
                value={supplierFilter}
                onChange={(e) => {
                  setSupplierFilter(e.target.value);
                  setPage(1);
                }}
                style={{ maxWidth: 160 }}
              >
                <option value="">All suppliers</option>
                {ctx.suppliers.map((sp) => (
                  <option key={sp.code} value={sp.code}>
                    {sp.label}
                  </option>
                ))}
              </Form.Select>
            </div>
          )}

          {!searching && filtered.length === 0 && (
            <div className="text-muted fst-italic">
              {all.length === 0
                ? `No supplier has hotels in ${cityName(stay.cityId)} for ${stay.checkIn} → ${stay.checkOut}.`
                : "No hotels match the filters."}
            </div>
          )}

          {pageRows.length > 0 && (
            <Table size="sm" hover className="mb-1" style={{ fontSize: "0.82rem" }}>
              <thead style={{ backgroundColor: "#f8f8f8" }}>
                <tr>
                  <th>Hotel</th>
                  <th style={{ width: 110 }}>Supplier</th>
                  <th style={{ width: 130 }}>Cancellation</th>
                  <th className="text-end" style={{ width: 130 }}>
                    Price (whole stay)
                  </th>
                  <th style={{ width: 110 }} />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((h) => (
                  <tr key={`${h.supplier}-${h.hotelCode}`}>
                    <td>
                      <div className="d-flex gap-2">
                        {isWebImage(h.image) && (
                          <img
                            src={h.image}
                            alt=""
                            style={{ width: 48, height: 36, objectFit: "cover", borderRadius: 3 }}
                          />
                        )}
                        <div>
                          <div className="fw-semibold">
                            {h.hotelName}
                            {h.starRating ? (
                              <span className="text-warning ms-1">{starText(h.starRating)}</span>
                            ) : null}
                          </div>
                          {h.address && <div className="text-muted small">{h.address}</div>}
                        </div>
                      </div>
                    </td>
                    <td>{h.supplierLabel || h.supplier}</td>
                    <td className="small">
                      {h.hasRefundable && <div className="text-success">Refundable</div>}
                      {h.hasNonRefundable && <div className="text-danger">Non-refundable</div>}
                      {!h.hasRefundable && !h.hasNonRefundable && <span className="text-muted">—</span>}
                    </td>
                    <td className="text-end">{money(h.price, h.currency)}</td>
                    <td className="text-end">
                      <Button size="sm" variant="outline-primary" onClick={() => setRoomsHotel(h)}>
                        View rooms
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          {filtered.length > HOTELS_PER_PAGE && (
            <div className="d-flex align-items-center justify-content-between small">
              <span className="text-muted">
                Showing {firstIndex + 1}–{firstIndex + pageRows.length} of {filtered.length}
              </span>
              <span className="d-flex gap-1">
                <Button
                  size="sm"
                  variant="outline-secondary"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </Button>
                <span className="px-2 align-self-center">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </Button>
              </span>
            </div>
          )}
        </>
      )}

      <SupplierHotelRoomsModal
        show={!!roomsHotel}
        hotel={roomsHotel}
        stay={stay}
        bookingId={bookingId}
        line={line}
        onHide={() => setRoomsHotel(null)}
        onSaved={(view, message) => {
          setRoomsHotel(null);
          onSaved(view, message);
        }}
        onRecord={(prefill) => {
          setRoomsHotel(null);
          onRecord(prefill);
        }}
      />
    </div>
  );
};

/**
 * The "Book Hotel" card: for each hotel the package needs, its status and —
 * for admins while it is pending — the suppliers' hotel lists to pick and book
 * one from. The hotel the agent picked is not repeated here (it is in
 * "Selected Preferred Hotels" above); a booked hotel shows what was booked.
 */
const BookHotelCard = ({
  lines,
  tracked,
  admin,
  bookingId,
  cardStyle,
  headerStyle,
  headerExtra,
  onSaved,
  onRecord,
  // Inside the Selected Preferred Hotels card (three-column layout): the
  // content only, without this card's frame and heading.
  embedded,
}) => {
  const summary = tracked ? sectionSummary(lines) : null;
  // Starts closed, like the supplier hotels on the package booking page. Once
  // opened the body stays mounted (only hidden), so a search isn't lost on close.
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const toggle = () => {
    setOpen((v) => !v);
    setOpened(true);
  };
  const content = (
    <>
        {lines.length === 0 && (
          <div style={{ fontSize: "0.82rem", color: "#888", fontStyle: "italic" }}>No hotels selected.</div>
        )}
        {lines.map((line, i) => (
          <div
            key={`${line.serviceType}-${line.serviceRefId}`}
            className={i > 0 ? "border-top pt-2 mt-2" : undefined}
          >
            {lines.length > 1 && (
              <div className="d-flex align-items-center gap-2 mb-1" style={{ fontSize: "0.82rem" }}>
                <strong>
                  Hotel {i + 1} of {lines.length}
                </strong>
                {tracked && (
                  <StatusBadge status={line.status} label={line.statusLabel} variants={LINE_VARIANTS} />
                )}
              </div>
            )}
            {isDone(line.status) && admin && (
              <div style={{ fontSize: "0.82rem" }}>
                <LineSupplierCell line={line} />
              </div>
            )}
            {isDone(line.status) && !admin && (
              <div className="small text-muted">The hotel is booked.</div>
            )}
            {admin && line.canAct && (
              <SupplierHotelSearch
                line={line}
                bookingId={bookingId}
                onSaved={onSaved}
                onRecord={(prefill) => onRecord(line, prefill)}
              />
            )}
            {!admin && line.status === "PENDING_CONFIRMATION" && (
              <div className="small text-muted">The hotel is being booked.</div>
            )}
            {admin && !line.canAct && !isDone(line.status) && (
              <div className="small text-muted">—</div>
            )}
          </div>
        ))}
    </>
  );
  if (embedded) return <div>{content}</div>;
  return (
    <div style={cardStyle}>
      <div style={{ ...headerStyle, justifyContent: "space-between", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="d-flex align-items-center gap-2 border-0 bg-transparent p-0 text-start"
          style={{ font: "inherit", color: "inherit", cursor: "pointer" }}
        >
          Book Hotel
          {summary && <StatusBadge status={summary.status} label={summary.label} variants={LINE_VARIANTS} />}
        </button>
        {/* Status / Reject booking, then the open-close arrow at the far right. */}
        <span className="d-flex align-items-center gap-2 ms-auto">
          {headerExtra}
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={open ? "Close Book Hotel" : "Open Book Hotel"}
            className="d-flex align-items-center border-0 bg-transparent p-1"
            style={{ color: "inherit", cursor: "pointer" }}
          >
            <FaChevronDown
              aria-hidden="true"
              style={{
                fontSize: "0.8rem",
                transition: "transform 0.15s",
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>
        </span>
      </div>
      {opened && (
      <div style={{ padding: "10px 16px 12px", display: open ? undefined : "none" }}>
        {content}
      </div>
      )}
    </div>
  );
};

const isAirportPlace = (p) => !!p && (p.kind === "AIRPORT" || !!p.iata);

/** A pickup / drop-off picker over iWay's airports and places (search only). */
const PlacePicker = ({ label, value, onChange, initialText, search, disabled }) => {
  const [text, setText] = useState(initialText || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const term = text.trim();
    if (!open || term.length < 3) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const list = await search(term);
        if (!cancelled) setResults(list);
      } catch (err) {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, open, search]);

  if (value) {
    return (
      <Form.Group style={{ flex: "1 1 240px" }}>
        <Form.Label className="mb-1 small">{label}</Form.Label>
        <div className="form-control form-control-sm d-flex align-items-center justify-content-between gap-2">
          <span className="text-truncate">
            {isAirportPlace(value) && <FaPlane aria-hidden="true" className="me-1 text-muted" />}
            {value.name}
            {value.iata ? ` (${value.iata})` : ""}
          </span>
          <Button
            size="sm"
            variant="link"
            className="p-0"
            disabled={disabled}
            onClick={() => {
              setText(value.name || "");
              onChange(null);
              setOpen(true);
            }}
          >
            Change
          </Button>
        </div>
      </Form.Group>
    );
  }

  const term = text.trim();
  return (
    <Form.Group style={{ flex: "1 1 240px", position: "relative" }}>
      <Form.Label className="mb-1 small">{label}</Form.Label>
      <Form.Control
        size="sm"
        value={text}
        disabled={disabled}
        placeholder="Airport code, airport, hotel or address"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && term.length >= 3 && (
        <div
          className="border bg-white shadow-sm"
          style={{ position: "absolute", zIndex: 30, left: 0, right: 0, maxHeight: 260, overflowY: "auto" }}
        >
          {loading && <div className="p-2 small text-muted">Searching iWay…</div>}
          {!loading && results.length === 0 && <div className="p-2 small text-muted">No places found.</div>}
          {results.map((p) => (
            <button
              type="button"
              key={p.placeId}
              className="d-block w-100 text-start border-0 bg-white px-2 py-1 small"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
            >
              {isAirportPlace(p) && <FaPlane aria-hidden="true" className="me-1 text-muted" />}
              <strong>{p.name}</strong>
              {p.iata ? ` (${p.iata})` : ""}
              {p.subtitle && <div className="text-muted">{p.subtitle}</div>}
            </button>
          ))}
        </div>
      )}
    </Form.Group>
  );
};

/**
 * Admin-only: pick the route and time, then see iWay's offers (with the
 * agent's markup) and the in-house cabs. Searching never books anything;
 * "Book" on an iWay offer places a real iWay order (only while the backend's
 * iway-booking switch is on), everything else is recorded by hand.
 */
const TransferSearch = ({ line, bookingId, onSaved, onRecord, onSkip }) => {
  const base = `${BASE}/${bookingId}/transfers/${line.serviceType}/${line.serviceRefId}`;
  const [ctx, setCtx] = useState(null);
  const [ctxError, setCtxError] = useState(null);
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [date, setDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [flightTime, setFlightTime] = useState("");
  const [formError, setFormError] = useState(null);
  const [offers, setOffers] = useState(null);
  const [searching, setSearching] = useState(false);
  // The route and time the shown offers are for (booking uses the same).
  const [searched, setSearched] = useState(null);
  const [bookingKey, setBookingKey] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setCtx(null);
    setCtxError(null);
    axiosInstance
      .post(`${base}/context`, {})
      .then((res) => {
        if (cancelled) return;
        setCtx(res.data);
        setDate(res.data.date || "");
        setFlightNumber(res.data.flightNumber || "");
      })
      .catch((err) => {
        if (!cancelled) setCtxError(errorMessage(err, "Could not load this transfer."));
      });
    return () => {
      cancelled = true;
    };
  }, [base]);

  const searchPlaces = useCallback(
    async (term) => {
      const res = await axiosInstance.post(`${base}/places`, { term }, { timeout: SUPPLIER_TIMEOUT_MS });
      return Array.isArray(res.data) ? res.data : [];
    },
    [base],
  );

  const fromIsAirport = isAirportPlace(from);
  const toIsAirport = isAirportPlace(to);

  const search = async () => {
    if (!from || !to) {
      setFormError("Pick the pickup and the drop-off first.");
      return;
    }
    if (!date) {
      setFormError("Enter the transfer date first.");
      return;
    }
    if (!pickupTime) {
      setFormError("Enter the pickup time first.");
      return;
    }
    setFormError(null);
    const s = { from, to, date, pickupTime };
    setSearching(true);
    setOffers(null);
    try {
      const res = await axiosInstance.post(`${base}/offers`, s, { timeout: SUPPLIER_TIMEOUT_MS });
      setOffers(res.data);
      setSearched(s);
    } catch (err) {
      toast.error(errorMessage(err, "Could not search transfers."));
    } finally {
      setSearching(false);
    }
  };

  const prefill = (extra) => ({
    serviceDate: `${(searched || {}).date || date} ${(searched || {}).pickupTime || pickupTime}`.trim(),
    routeFrom: (searched || {}).from?.name || from?.name || ctx?.fromHint || "",
    routeTo: (searched || {}).to?.name || to?.name || ctx?.toHint || "",
    flightNumber,
    ...extra,
  });

  const book = async (o) => {
    if (!searched) return;
    if (isAirportPlace(searched.from) && !flightNumber.trim()) {
      setFormError("Enter the arriving flight number first: iWay needs it for an airport pickup.");
      return;
    }
    if (isAirportPlace(searched.to) && !isAirportPlace(searched.from) && !flightTime) {
      setFormError("Enter the departing flight's time first: iWay needs it for an airport drop-off.");
      return;
    }
    setFormError(null);
    const ok = window.confirm(
      `Book "${o.vehicle || "vehicle"}" with iWay\n` +
        `${searched.from.name} → ${searched.to.name}\n` +
        `${searched.date} ${searched.pickupTime}, ${money(o.price, o.currency)}?\n\n` +
        "This places a REAL booking with iWay.",
    );
    if (!ok) return;
    setBookingKey(o.priceId);
    try {
      const res = await axiosInstance.post(
        `${base}/book`,
        {
          ...searched,
          priceId: o.priceId,
          expectedPrice: o.price,
          flightNumber: flightNumber.trim() || null,
          flightTime: flightTime || null,
        },
        { timeout: SUPPLIER_TIMEOUT_MS },
      );
      onSaved(res.data, "Transfer booked with iWay. The transfer is confirmed.");
    } catch (err) {
      toast.error(errorMessage(err, "Booking the transfer with iWay failed."));
    } finally {
      setBookingKey(null);
    }
  };

  if (ctxError) return <div className="small text-danger">{ctxError}</div>;
  if (!ctx) {
    return (
      <div className="d-flex align-items-center gap-2 text-muted small">
        <Spinner animation="border" size="sm" />
        <span>Loading the transfer…</span>
      </div>
    );
  }

  const busy = searching || !!bookingKey;
  return (
    <div style={{ fontSize: "0.82rem" }}>
      <div className="text-muted mb-2">
        {ctx.adults} adult{ctx.adults === 1 ? "" : "s"}
        {ctx.children ? `, ${ctx.children} child${ctx.children === 1 ? "" : "ren"}` : ""}
        {ctx.childAges?.length ? ` (ages ${ctx.childAges.join(", ")})` : ""}
        {ctx.flightNumber ? ` · Flight ${ctx.flightNumber}` : ""} · Agent paid {money(ctx.paidAmount)}
      </div>

      <div className="d-flex flex-wrap align-items-end gap-2 mb-2">
        <PlacePicker
          label={ctx.airportPickup === true ? "From (airport)" : "From"}
          value={from}
          onChange={setFrom}
          initialText={ctx.fromHint || ""}
          search={searchPlaces}
          disabled={busy}
        />
        <PlacePicker
          label={ctx.airportPickup === false ? "To (airport)" : "To"}
          value={to}
          onChange={setTo}
          initialText={ctx.toHint || ""}
          search={searchPlaces}
          disabled={busy}
        />
      </div>
      <div className="d-flex flex-wrap align-items-end gap-2 mb-2">
        <Form.Group>
          <Form.Label className="mb-1 small">Date</Form.Label>
          <Form.Control size="sm" type="date" value={date} disabled={busy} onChange={(e) => setDate(e.target.value)} />
        </Form.Group>
        <Form.Group>
          <Form.Label className="mb-1 small">Pickup time</Form.Label>
          <Form.Control
            size="sm"
            type="time"
            value={pickupTime}
            disabled={busy}
            onChange={(e) => setPickupTime(e.target.value)}
          />
        </Form.Group>
        <Form.Group>
          <Form.Label className="mb-1 small">Flight number{fromIsAirport ? " *" : ""}</Form.Label>
          <Form.Control
            size="sm"
            value={flightNumber}
            disabled={busy}
            placeholder="EK 503"
            onChange={(e) => setFlightNumber(e.target.value)}
            style={{ maxWidth: 130 }}
          />
        </Form.Group>
        {toIsAirport && !fromIsAirport && (
          <Form.Group>
            <Form.Label className="mb-1 small">Flight time *</Form.Label>
            <Form.Control
              size="sm"
              type="time"
              value={flightTime}
              disabled={busy}
              onChange={(e) => setFlightTime(e.target.value)}
            />
          </Form.Group>
        )}
        <Button size="sm" variant="primary" onClick={search} disabled={busy}>
          {searching ? <Spinner animation="border" size="sm" /> : searched ? "Search again" : "Search transfers"}
        </Button>
        <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => onRecord(prefill({}))}>
          Booked by hand
        </Button>
        {line.canSkip && (
          <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => onSkip(line)}>
            Not needed
          </Button>
        )}
      </div>
      <FieldError message={formError} />
      {!ctx.iwayBookingEnabled && (
        <div className="alert alert-info py-2 my-2">
          Booking transfers with iWay through the system is switched off: pick an offer, book it
          with iWay and record it.
        </div>
      )}
      {!searched && !searching && (
        <div className="text-muted">
          Pick the pickup and drop-off, the date and the pickup time, then search. Searching books nothing.
        </div>
      )}

      {offers && (
        <>
          <div className="fw-semibold mt-2 mb-1">iWay</div>
          {offers.iwayMessage && <div className="text-muted fst-italic mb-1">{offers.iwayMessage}</div>}
          {offers.iway?.length > 0 && (
            <Table size="sm" hover className="mb-2" style={{ fontSize: "0.82rem" }}>
              <thead style={{ backgroundColor: "#f8f8f8" }}>
                <tr>
                  <th>Vehicle</th>
                  <th style={{ width: 110 }}>Seats / bags</th>
                  <th style={{ width: 150 }}>Cancellation</th>
                  <th className="text-end" style={{ width: 110 }}>
                    Cost
                  </th>
                  <th className="text-end" style={{ width: 110 }}>
                    Price
                  </th>
                  <th style={{ width: 100 }} />
                </tr>
              </thead>
              <tbody>
                {offers.iway.map((o) => (
                  <tr key={o.priceId}>
                    <td>
                      <div className="d-flex gap-2">
                        {isWebImage(o.image) && (
                          <img src={o.image} alt="" style={{ width: 48, height: 32, objectFit: "contain" }} />
                        )}
                        <div>
                          <div className="fw-semibold">{o.vehicle || "—"}</div>
                          {o.details && <div className="text-muted small">{o.details}</div>}
                          {o.meetAndGreetIncluded && <div className="text-muted small">Meet and greet included</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      {o.capacity ?? "—"} / {o.luggage ?? "—"}
                    </td>
                    <td className="small">
                      {o.cancellationTime != null ? `Free until ${o.cancellationTime} h before pickup` : "—"}
                    </td>
                    <td className="text-end">{money(o.cost, o.currency)}</td>
                    <td className="text-end">{money(o.price, o.currency)}</td>
                    <td className="text-end">
                      {o.bookable ? (
                        <Button size="sm" variant="success" disabled={busy} onClick={() => book(o)}>
                          {bookingKey === o.priceId ? <Spinner animation="border" size="sm" /> : "Book"}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          disabled={busy}
                          title={o.notBookableReason || ""}
                          onClick={() =>
                            onRecord(
                              prefill({
                                supplier: "iWay",
                                vehicle: o.vehicle || "",
                                costAmount: o.cost != null ? String(o.cost) : "",
                              }),
                            )
                          }
                        >
                          Record
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          <div className="fw-semibold mt-2 mb-1">In-house cabs</div>
          {offers.inhouseMessage && <div className="text-muted fst-italic mb-1">{offers.inhouseMessage}</div>}
          {offers.inhouse?.length > 0 && (
            <Table size="sm" hover className="mb-1" style={{ fontSize: "0.82rem" }}>
              <thead style={{ backgroundColor: "#f8f8f8" }}>
                <tr>
                  <th>Cab</th>
                  <th style={{ width: 90 }}>Type</th>
                  <th>Route</th>
                  <th style={{ width: 80 }}>Max pax</th>
                  <th className="text-end" style={{ width: 110 }}>
                    Cost
                  </th>
                  <th className="text-end" style={{ width: 110 }}>
                    Price
                  </th>
                  <th style={{ width: 100 }} />
                </tr>
              </thead>
              <tbody>
                {offers.inhouse.map((c, i) => (
                  <tr key={`${c.cabId}-${i}`}>
                    <td>
                      <div className="fw-semibold">{c.name || "—"}</div>
                      {c.details && <div className="text-muted small">{c.details}</div>}
                    </td>
                    <td>{c.type || "—"}</td>
                    <td className="small">
                      {c.location || "—"}
                      {c.dropoff ? ` → ${c.dropoff}` : ""}
                    </td>
                    <td>{c.maxPax ?? "—"}</td>
                    <td className="text-end">{money(c.cost, c.currency)}</td>
                    <td className="text-end">{money(c.price, c.currency)}</td>
                    <td className="text-end">
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        disabled={busy}
                        onClick={() =>
                          onRecord(
                            prefill({
                              supplier: c.name || "",
                              vehicle: c.name || "",
                              costAmount: c.cost != null ? String(c.cost) : "",
                            }),
                          )
                        }
                      >
                        Record
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
    </div>
  );
};

/**
 * The "Book Transfer" card (package.service-fulfilment.transfers): the
 * arrival and departure transfers and the agent's cab, each with its status
 * and — for admins while it is pending — the route search to book it.
 * Starts closed, with the open/close arrow at the far right.
 */
const BookTransferCard = ({
  lines,
  tracked,
  admin,
  bookingId,
  cardStyle,
  headerStyle,
  onSaved,
  onRecord,
  onSkip,
  onBook,
  // Inside the Selected Preferred Hotels card (three-column layout): the content only.
  embedded,
}) => {
  const summary = tracked ? sectionSummary(lines) : null;
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const toggle = () => {
    setOpen((v) => !v);
    setOpened(true);
  };
  const content = (
    <>
          {lines.length === 0 && (
            <div style={{ fontSize: "0.82rem", color: "#888", fontStyle: "italic" }}>No transfer selected.</div>
          )}
          {lines.map((line, i) => (
            <div
              key={`${line.serviceType}-${line.serviceRefId}`}
              className={i > 0 ? "border-top pt-2 mt-2" : undefined}
            >
              <div className="d-flex flex-wrap align-items-center gap-2 mb-1" style={{ fontSize: "0.82rem" }}>
                <strong>{line.name}</strong>
                {line.dayDate && <span className="text-muted">{line.dayDate}</span>}
                {line.flightNumber && <span className="text-muted">· Flight {line.flightNumber}</span>}
                {line.serviceType === "TRANSFER" && line.rate != null && (
                  <span className="text-muted">· {money(line.rate, line.currency)}</span>
                )}
                {tracked && (
                  <StatusBadge status={line.status} label={line.statusLabel} variants={LINE_VARIANTS} />
                )}
              </div>
              {isDone(line.status) && admin && (
                <div style={{ fontSize: "0.82rem" }}>
                  <LineSupplierCell line={line} />
                </div>
              )}
              {isDone(line.status) && !admin && (
                <div className="small text-muted">
                  {line.status === "NOT_REQUIRED" ? "Not needed." : "The transfer is booked."}
                </div>
              )}
              {admin && line.canAct && line.canSearchTransfers && (
                <TransferSearch
                  line={line}
                  bookingId={bookingId}
                  onSaved={onSaved}
                  onRecord={(prefill) => onRecord(line, prefill)}
                  onSkip={onSkip}
                />
              )}
              {admin && line.canAct && !line.canSearchTransfers && (
                <LineSupplierCell line={line} onBook={onBook} onSkip={onSkip} />
              )}
              {!admin && line.status === "PENDING_CONFIRMATION" && (
                <div className="small text-muted">The transfer is being booked.</div>
              )}
            </div>
          ))}
    </>
  );
  if (embedded) return <div>{content}</div>;
  return (
    <div style={cardStyle}>
      <div style={{ ...headerStyle, justifyContent: "space-between", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="d-flex align-items-center gap-2 border-0 bg-transparent p-0 text-start"
          style={{ font: "inherit", color: "inherit", cursor: "pointer" }}
        >
          Book Transfer
          {summary && <StatusBadge status={summary.status} label={summary.label} variants={LINE_VARIANTS} />}
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? "Close Book Transfer" : "Open Book Transfer"}
          className="d-flex align-items-center border-0 bg-transparent p-1 ms-auto"
          style={{ color: "inherit", cursor: "pointer" }}
        >
          <FaChevronDown
            aria-hidden="true"
            style={{
              fontSize: "0.8rem",
              transition: "transform 0.15s",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>
      </div>
      {opened && (
        <div style={{ padding: "10px 16px 12px", display: open ? undefined : "none" }}>
          {content}
        </div>
      )}
    </div>
  );
};

/** Admin-only: record a hotel, the transfer, an activity or an itinerary day booked by hand. */
const ManualServiceModal = ({ show, line, prefill, bookingId, onHide, onSaved }) => {
  if (!line) return null;
  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: "1.05rem" }}>
          {line.serviceType === "ITINERARY"
            ? `Book day ${line.day ?? ""}${line.placeName ? ` (${line.placeName})` : ""} — ${line.name}`
            : line.serviceType === "HOTEL"
              ? `Record hotel booked by hand${prefill?.supplierHotelName ? ` — ${prefill.supplierHotelName}` : ""}`
              : `${BOOK_LABEL[line.serviceType] || "Book"} — ${line.name}`}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: "0.85rem" }}>
        {line.serviceType === "ITINERARY" && line.description && (
          <div
            className="text-muted mb-2 p-2"
            style={{ whiteSpace: "pre-line", background: "#f8f8f8", borderRadius: 4, maxHeight: 160, overflowY: "auto" }}
          >
            {line.description}
          </div>
        )}
        <ManualForm
          key={`${line.serviceType}-${line.serviceRefId}-${prefill?.supplierHotelName || ""}`}
          line={line}
          prefill={prefill}
          bookingId={bookingId}
          onSaved={onSaved}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

/** Admin-only: mark an itinerary day as needing no booking (counts as done). */
const NotNeededModal = ({ show, line, bookingId, onHide, onSaved }) => {
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (show) {
      setReason("");
      setError(null);
    }
  }, [show]);

  if (!line) return null;
  // An itinerary day, or an arrival / departure transfer.
  const isDay = line.serviceType === "ITINERARY";

  const save = async () => {
    if (!reason.trim()) {
      setError("Enter the reason first.");
      return;
    }
    setSaving(true);
    try {
      const res = await axiosInstance.post(
        `${BASE}/${bookingId}/services/${line.serviceType}/${line.serviceRefId}/not-required`,
        { remarks: reason.trim() },
      );
      onSaved(res.data, isDay ? "Day marked as not needed." : "Transfer marked as not needed.");
    } catch (err) {
      toast.error(errorMessage(err, isDay ? "Could not update this day." : "Could not update this transfer."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={() => !saving && onHide()} centered>
      <Modal.Header closeButton={!saving}>
        <Modal.Title style={{ fontSize: "1.05rem" }}>
          {isDay ? `Day ${line.day ?? ""} needs no booking — ${line.name}` : `Not needed — ${line.name}`}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: "0.85rem" }}>
        <p className="text-muted">
          {isDay
            ? "Use this for a day with nothing to book (arrival, leisure, or covered by the hotel)."
            : "Use this when the guests don't need this transfer (for example, they arrange their own)."}{" "}
          It then counts as done, like a confirmed service.
        </p>
        <Form.Group>
          <Form.Label className="mb-1">Reason *</Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            value={reason}
            isInvalid={!!error}
            disabled={saving}
            placeholder="Arrival day: transfer and hotel check-in only"
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
          />
          <FieldError message={error} />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" disabled={saving} onClick={onHide}>
          Close
        </Button>
        <Button variant="primary" disabled={saving} onClick={save}>
          {saving ? <Spinner animation="border" size="sm" /> : "Mark as not needed"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

/** Admin-only: reject the whole booking (existing endpoint): it is cancelled and refunded. */
const RejectModal = ({ show, bookingId, onHide, onDone }) => {
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!show) {
      setReason("");
      setError(null);
    }
  }, [show]);

  const doReject = async () => {
    if (!reason.trim()) {
      setError("Enter the reason first.");
      return;
    }
    const ok = window.confirm(
      "Reject this booking? It will be cancelled and the agent refunded as a normal cancellation.",
    );
    if (!ok) return;
    setSaving(true);
    try {
      const res = await axiosInstance.post(`${REJECT_BASE}/${bookingId}/reject`, {
        reason: reason.trim(),
      });
      toast.success(res?.data?.message || "Booking rejected and cancelled.");
      onDone();
      onHide();
    } catch (err) {
      toast.error(errorMessage(err, "Could not reject the booking."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={() => !saving && onHide()} centered>
      <Modal.Header closeButton={!saving}>
        <Modal.Title style={{ fontSize: "1.05rem" }}>Reject booking</Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: "0.85rem" }}>
        <p className="text-muted">
          Use this when a service can't be booked anywhere. The booking is cancelled and the
          agent is refunded as a normal cancellation (a card payment has to be refunded by
          hand), and the agent is emailed. Services already booked through the system are
          cancelled with their suppliers; services booked by hand have to be cancelled by hand.
        </p>
        <Form.Group>
          <Form.Label className="mb-1">Reason *</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            value={reason}
            isInvalid={!!error}
            disabled={saving}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
          />
          <FieldError message={error} />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" disabled={saving} onClick={onHide}>
          Close
        </Button>
        <Button variant="danger" disabled={saving} onClick={doReject}>
          {saving ? <Spinner animation="border" size="sm" /> : "Reject and cancel booking"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

/**
 * The "Book Hotel", "Book Transfer" and "Book Activities" cards for the
 * per-service flow, shown below the (unchanged) "Selected Services" card.
 *
 * @param refreshKey  changes when the booking's payment / cancellation state changes
 * @param onChanged   called after a service is confirmed or the booking is rejected
 */
export const ServiceFulfilmentSections = ({
  bookingId,
  cardStyle,
  headerStyle,
  canSeeSuppliers,
  refreshKey,
  onChanged,
  // "columns": Book Hotel / Book Transfer / Book Activities as three columns
  // inside the Selected Preferred Hotels card, each opened below; anything
  // else: the three separate cards.
  layout,
  // "columns" layout: the element in the card's heading that gets the
  // booking's status and Reject booking.
  headerTarget,
}) => {
  const [selectedOption, setSelectedOption] = useState(null);
  const [openedOptions, setOpenedOptions] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [manualLine, setManualLine] = useState(null);
  // Book Hotel: what the record-by-hand form starts with (picked hotel, dates, cost).
  const [manualPrefill, setManualPrefill] = useState(null);
  const [skipLine, setSkipLine] = useState(null);
  const [showReject, setShowReject] = useState(false);

  const load = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await axiosInstance.get(`${BASE}/${bookingId}`);
      setData(res.data);
    } catch (error) {
      setLoadError(errorMessage(error, "Could not load the services' status."));
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Admin fields (canReject) are only sent to admin logins.
  const admin = !!canSeeSuppliers && data?.canReject !== undefined && data?.canReject !== null;
  const tracked = !!data && data.status && data.status !== "NOT_TRACKED";

  // Transfer, activity and itinerary days: the record-by-hand form.
  const onBook = (line) => {
    setManualPrefill(null);
    setManualLine(line);
  };
  // Book Hotel: record a hotel booked by hand, pre-filled from the search.
  const onRecordHotel = (line, prefill) => {
    setManualPrefill(prefill || null);
    setManualLine(line);
  };
  const closeManual = () => {
    setManualLine(null);
    setManualPrefill(null);
  };

  const onSaved = async (view, message) => {
    toast.success(
      view?.status === "CONFIRMED" && view?.confirmedCount === view?.totalCount
        ? "All services are confirmed. The booking is confirmed."
        : message,
    );
    closeManual();
    setSkipLine(null);
    if (view) setData(view);
    if (onChanged) await onChanged();
  };

  const common = {
    tracked,
    admin,
    canSeeSuppliers,
    onBook,
    onSkip: setSkipLine,
    cardStyle,
    headerStyle,
  };
  // Itinerary days are only sent while package.service-fulfilment.itinerary is on.
  const itinerary = data?.itinerary || [];
  // The arrival / departure transfers are only sent while
  // package.service-fulfilment.transfers is on; otherwise Book Transfer stays as before.
  const transfersFeature = (data?.transfers || []).some(
    (l) => l.serviceType === "ARRIVAL_TRANSFER" || l.serviceType === "DEPARTURE_TRANSFER",
  );

  // The booking's overall status and the whole-booking Reject sit on the
  // Book Hotel card (the first of the three).
  const hotelHeaderExtra = data ? (
    <span className="d-flex align-items-center gap-2">
      {tracked && data.totalCount > 0 && (
        <StatusBadge
          status={data.status}
          label={`Booking: ${data.statusLabel || data.status} · ${data.confirmedCount} of ${
            data.totalCount
          } services confirmed`}
          variants={OVERALL_VARIANTS}
        />
      )}
      {admin && data.canReject && (
        <Button
          size="sm"
          variant="outline-danger"
          style={{ fontSize: "0.75rem", padding: "1px 8px" }}
          onClick={() => setShowReject(true)}
        >
          Reject booking
        </Button>
      )}
    </span>
  ) : null;

  const modals = admin && (
    <>
      <ManualServiceModal
        show={!!manualLine}
        line={manualLine}
        prefill={manualPrefill}
        bookingId={bookingId}
        onHide={closeManual}
        onSaved={onSaved}
      />
      <NotNeededModal
        show={!!skipLine}
        line={skipLine}
        bookingId={bookingId}
        onHide={() => setSkipLine(null)}
        onSaved={onSaved}
      />
      <RejectModal
        show={showReject}
        bookingId={bookingId}
        onHide={() => setShowReject(false)}
        onDone={async () => {
          await load();
          if (onChanged) await onChanged();
        }}
      />
    </>
  );

  // ── Three-column layout, inside the Selected Preferred Hotels card ──
  if (layout === "columns") {
    const hotels = data?.hotels || [];
    const transfers = data?.transfers || [];
    const activities = data?.activities || [];
    const activityLines = [...activities, ...itinerary];
    const hotelText = !hotels.length
      ? "No hotels selected."
      : admin && hotels.every((l) => isDone(l.status))
        ? hotels.map((l) => l.supplierHotelName || l.name).filter(Boolean).join(", ")
        : `${hotels.length} hotel${hotels.length === 1 ? "" : "s"} to book`;
    const transferText = !transfers.length
      ? "No transfer selected."
      : transfers
          .map((l) =>
            l.serviceType === "ARRIVAL_TRANSFER"
              ? `Arrival${l.flightNumber ? ` ${l.flightNumber}` : ""}`
              : l.serviceType === "DEPARTURE_TRANSFER"
                ? `Departure${l.flightNumber ? ` ${l.flightNumber}` : ""}`
                : l.name,
          )
          .join(" · ");
    const activityText = !activityLines.length
      ? "No activities selected."
      : [
          activities.length ? `${activities.length} activit${activities.length === 1 ? "y" : "ies"}` : null,
          itinerary.length ? `${itinerary.length} itinerary day${itinerary.length === 1 ? "" : "s"}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
    const options = [
      { key: "hotel", title: "Book Hotel", Icon: FaHotel, lines: hotels, text: hotelText },
      { key: "transfer", title: "Book Transfer", Icon: FaCar, lines: transfers, text: transferText },
      { key: "activities", title: "Book Activities", Icon: FaTicketAlt, lines: activityLines, text: activityText },
    ];
    const pick = (key) => {
      setSelectedOption((cur) => (cur === key ? null : key));
      setOpenedOptions((prev) => (prev.includes(key) ? prev : [...prev, key]));
    };
    const panelBody = (key) => {
      if (key === "hotel") {
        return (
          <BookHotelCard
            lines={hotels}
            tracked={tracked}
            admin={admin}
            bookingId={bookingId}
            onSaved={onSaved}
            onRecord={onRecordHotel}
            embedded
          />
        );
      }
      if (key === "transfer") {
        return transfersFeature ? (
          <BookTransferCard
            lines={transfers}
            tracked={tracked}
            admin={admin}
            bookingId={bookingId}
            onSaved={onSaved}
            onRecord={onRecordHotel}
            onSkip={setSkipLine}
            onBook={onBook}
            embedded
          />
        ) : (
          <ServiceSection {...common} title="Book Transfer" lines={transfers} emptyText="No transfer selected." embedded />
        );
      }
      return (
        <ServiceSection
          {...common}
          title="Book Activities"
          lines={activities}
          emptyText="No activities selected."
          tableTitle={itinerary.length > 0 ? "Selected activity" : undefined}
          summaryLines={activityLines}
          embedded
        >
          {itinerary.length > 0 && (
            <ItineraryTable lines={itinerary} tracked={tracked} admin={admin} onBook={onBook} onSkip={setSkipLine} />
          )}
        </ServiceSection>
      );
    };

    return (
      <>
        {/* The booking's status and Reject booking go into the card's heading. */}
        {headerTarget && hotelHeaderExtra && createPortal(hotelHeaderExtra, headerTarget)}
        <div className="border-top mt-2 pt-2">
          {!data && (
            <div className="small">
              {loading && (
                <span className="d-flex align-items-center gap-2 text-muted">
                  <Spinner animation="border" size="sm" /> Loading services…
                </span>
              )}
              {loadError && (
                <span className="d-flex align-items-center gap-2 text-danger">
                  {loadError}
                  <Button size="sm" variant="link" className="p-0" onClick={load}>
                    Retry
                  </Button>
                </span>
              )}
            </div>
          )}
          {data && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 10,
                }}
              >
                {options.map((o) => {
                  const summary = tracked ? sectionSummary(o.lines) : null;
                  const active = selectedOption === o.key;
                  return (
                    <div
                      key={o.key}
                      className="rounded p-2"
                      style={{
                        border: active ? "2px solid #0d6efd" : "1px solid #ddd",
                        background: "#fff",
                        fontSize: "0.82rem",
                      }}
                    >
                      <div className="d-flex align-items-center gap-2 fw-semibold mb-1" style={{ fontSize: "0.86rem" }}>
                        <o.Icon aria-hidden="true" className="text-muted" />
                        {o.title}
                      </div>
                      {summary && (
                        <div className="mb-1">
                          <StatusBadge status={summary.status} label={summary.label} variants={LINE_VARIANTS} />
                        </div>
                      )}
                      <div className="text-muted mb-2" style={{ minHeight: "1.2em" }}>
                        {o.text}
                      </div>
                      <Button
                        size="sm"
                        variant={active ? "primary" : "outline-primary"}
                        aria-expanded={active}
                        onClick={() => pick(o.key)}
                        className="d-inline-flex align-items-center gap-1"
                      >
                        {/* Book; View once everything in it is done, or for agents (who only see statuses). */}
                        {!admin || (o.lines.length > 0 && o.lines.every((l) => isDone(l.status))) ? "View" : "Book"}
                        <FaChevronDown
                          aria-hidden="true"
                          style={{ fontSize: "0.7rem", transform: active ? "rotate(180deg)" : "rotate(0deg)" }}
                        />
                      </Button>
                    </div>
                  );
                })}
              </div>
              {/* Opened options stay mounted (only hidden), so a search isn't lost when switching. */}
              {options
                .filter((o) => openedOptions.includes(o.key))
                .map((o) => (
                  <div
                    key={o.key}
                    className="rounded mt-2"
                    style={{
                      border: "1px solid #ddd",
                      padding: "10px 12px",
                      display: selectedOption === o.key ? undefined : "none",
                    }}
                  >
                    <div className="d-flex align-items-center gap-2 fw-semibold mb-2" style={{ fontSize: "0.86rem" }}>
                      <o.Icon aria-hidden="true" className="text-muted" />
                      {o.title}
                    </div>
                    {panelBody(o.key)}
                  </div>
                ))}
            </>
          )}
        </div>
        {modals}
      </>
    );
  }

  return (
    <>
      {!data && (
        <div style={cardStyle}>
          <div style={headerStyle}>Book Hotel, Transfer and Activities</div>
          <div style={{ padding: "10px 16px 12px" }}>
            {loading && (
              <div className="d-flex align-items-center gap-2 text-muted small">
                <Spinner animation="border" size="sm" />
                <span>Loading services…</span>
              </div>
            )}
            {loadError && (
              <div className="small text-danger d-flex align-items-center gap-2">
                <span>{loadError}</span>
                <Button size="sm" variant="link" className="p-0" onClick={load}>
                  Retry
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
      {data && (
        <>
          <BookHotelCard
            lines={data.hotels || []}
            tracked={tracked}
            admin={admin}
            bookingId={bookingId}
            cardStyle={cardStyle}
            headerStyle={headerStyle}
            headerExtra={hotelHeaderExtra}
            onSaved={onSaved}
            onRecord={onRecordHotel}
          />
          {transfersFeature ? (
            <BookTransferCard
              lines={data.transfers || []}
              tracked={tracked}
              admin={admin}
              bookingId={bookingId}
              cardStyle={cardStyle}
              headerStyle={headerStyle}
              onSaved={onSaved}
              onRecord={onRecordHotel}
              onSkip={setSkipLine}
              onBook={onBook}
            />
          ) : (
            <ServiceSection
              {...common}
              title="Book Transfer"
              lines={data.transfers || []}
              emptyText="No transfer selected."
            />
          )}
          <ServiceSection
            {...common}
            title="Book Activities"
            lines={data.activities || []}
            emptyText="No activities selected."
            tableTitle={itinerary.length > 0 ? "Selected activity" : undefined}
            summaryLines={[...(data.activities || []), ...itinerary]}
            collapsible
          >
            {itinerary.length > 0 && (
              <ItineraryTable
                lines={itinerary}
                tracked={tracked}
                admin={admin}
                onBook={onBook}
                onSkip={setSkipLine}
              />
            )}
          </ServiceSection>
        </>
      )}

      {modals}
    </>
  );
};

export default ServiceFulfilmentSections;
