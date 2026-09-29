/**
 * MeetAndSpaceBookingPage.jsx
 *
 * Booking creation page for the Meet & Space flow.
 *
 * Upgrades in this revision:
 *   - Inline validation errors (no toast spam) for every required field
 *   - Country derived from the nationality picked on the search page —
 *     rendered as plain read-only text (no input)
 *   - State / City rendered as dropdowns (react-select) loaded from
 *       /api/province/countryId?countryId={nationalityId}
 *       /api/destination?page=0&limit=50&search={term}
 *     (mirrors the SubLocation page pattern)
 *   - "Requested Amenities" rendered as checkboxes loaded from
 *       /api/hotels/{hotelId}.amenities — plus an "Additional amenities"
 *     repeater for custom items the customer wants to bring up.
 *   - The booking payload now sends a `selectedAmenities` list (each item
 *     marked Hotel / Custom), persisted into the new
 *     `meet_and_space_booking_amenity` table.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Form,
  Button,
  Table,
  Spinner,
  Alert,
  Badge,
  Modal,
} from "react-bootstrap";
import {
  FaHotel,
  FaCheckCircle,
  FaCalendarAlt,
  FaClock,
  FaUsers,
  FaMapMarkerAlt,
  FaPlus,
  FaTrash,
  FaEdit,
} from "react-icons/fa";
import { useNavigate, useLocation } from "react-router-dom";
import Select from "react-select";
import { toast } from "react-hot-toast";
import axiosInstance from "../../../components/AxiosInstance";
import Sidebar from "../../../components/Sidebar";
import TopBar from "../../../components/TopBar";
import QuotationPdfCard from "../../../components/quotation/QuotationPdfCard";
import "../../../styles/HotelBookingPage.css";

// Feature flag — Add-ons section hidden for now per spec. Flip to `true`
// to re-enable both the editor card and the summary rows; all the
// underlying state, helpers and payload fields stay intact so flipping
// is reversible without further code changes.
const SHOW_ADDONS = false;

// ── fixed dropdown options ────────────────────────────────────────────────
const SALUTATIONS = ["Mr", "Ms", "Mrs", "Dr"];
const EVENT_TYPES = [
  "Meeting",
  "Conference",
  "Training",
  "Wedding",
  "Birthday",
  "Anniversary",
  "Seminar",
  "Workshop",
  "Other",
];
const LAYOUTS = ["Theatre", "U-Shape", "Classroom", "Boardroom", "Banquet", "Reception"];
const ID_TYPES = ["Aadhaar", "PAN", "Passport", "Driving License", "Voter ID"];
const PAYMENT_MODES = ["Cash", "Card", "UPI", "Bank Transfer", "Cheque"];

/**
 * Read the booking-page criteria.
 *
 * Two delivery paths supported so the URL can stay clean AND so the
 * pre-existing edit link (?editBookingId=…) keeps working:
 *
 *  1. URL query params — used by the edit flow (MeetAndSpaceBookingEditPage
 *     navigates with `?editBookingId=<id>`) and as a fallback when
 *     localStorage is unavailable.
 *  2. localStorage["msBookingDraft"] — written by MeetAndSpaceSearch
 *     .handleBook right before opening this page in a new tab. Keeps
 *     spaceId / bookingDate / rates / agent / nationality out of the
 *     address bar.
 *
 * Precedence: URL wins over draft when both are present. That way an
 * ?editBookingId=… link can never be silently overridden by a stale
 * search draft.
 *
 * The draft is NOT deleted on read. React StrictMode double-invokes
 * useMemo factories in dev, and a self-clearing reader would race with
 * itself and end up returning an empty object on the second call. A
 * fresh "Book" click naturally overwrites the key, so staleness is
 * bounded to "the last criteria this user clicked Book on".
 */
function useQueryParams() {
  const { search } = useLocation();
  return useMemo(() => {
    const urlParams = Object.fromEntries(new URLSearchParams(search));
    if (urlParams.spaceId || urlParams.editBookingId) {
      // URL already carries everything the page needs — don't touch the
      // draft. This also preserves the fallback path from
      // MeetAndSpaceSearch when localStorage was unavailable.
      return urlParams;
    }
    try {
      const raw = localStorage.getItem("msBookingDraft");
      if (raw) {
        const draft = JSON.parse(raw);
        // URL wins over draft on any overlapping key.
        return { ...draft, ...urlParams };
      }
    } catch (e) {
      // Storage disabled / corrupt payload — silently fall back to
      // whatever the URL carries (may be empty). The page's own error
      // path already handles a missing spaceId by showing the empty
      // state.
    }
    return urlParams;
  }, [search]);
}

export default function MeetAndSpaceBookingPage() {
  const navigate = useNavigate();
  const q = useQueryParams();

  // Edit mode — when the page is opened from the booking-list edit flow we
  // receive an `editBookingId`. We fetch that booking, prefill every section
  // and switch the submit endpoint from POST /save to PUT /{id}/edit. The
  // backend will append `/N` to the bookingNumber on each edit.
  const editBookingId = q.editBookingId ? Number(q.editBookingId) : null;
  const isEditMode = !!editBookingId;
  const [editBooking, setEditBooking] = useState(null); // raw booking loaded for edit
  const [showOrderSummary, setShowOrderSummary] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  const [space, setSpace] = useState(null);
  // Amenities tied to THIS meeting space (saved on the
  // /hotel-actions/{hotelId}/meeting-space page into meet_space_amenty).
  // We populate this list from space.amenityList (normalised) and fall back
  // to the legacy comma-separated `amenities` string if the master list is
  // empty.
  const [spaceAmenities, setSpaceAmenities] = useState([]); // [{id, name, masterAmenityId, isSelected}]
  const [customAmenities, setCustomAmenities] = useState([]); // free-form amenity strings

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  // Pricing-related state — initial values come from search.
  const [criteria, setCriteria] = useState({
    bookingDate: q.bookingDate || "",
    startTime: q.startTime || "",
    endTime: q.endTime || "",
    attendees: q.attendees ? Number(q.attendees) : 1,
    layout: q.layout || "",
    ratePlan: q.ratePlan || "Standard",
    rateType: q.rateType || "Hourly",
    unitRate: q.unitRate ? Number(q.unitRate) : 0,
  });
  const [eventType, setEventType] = useState("Meeting");
  const [additionalRequirements, setAdditionalRequirements] = useState("");

  // Agent + nationality propagated from the search page via query params.
  const agentId = q.agentId ? Number(q.agentId) : null;
  const agentName = q.agentName || "";
  const nationalityId = q.nationalityId ? Number(q.nationalityId) : null;
  const nationalityName = q.nationalityName || "";

  const [customer, setCustomer] = useState({
    salutation: "Mr",
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    alternateMobile: "",
    companyName: "",
    designation: "",
    gstNumber: "",
    address: "",
    cityId: null,
    cityName: "",
    stateId: null,
    stateName: "",
    pincode: "",
    idType: "Aadhaar",
    idNumber: "",
    remarks: "",
  });

  const [payment, setPayment] = useState({
    paymentMode: "Cash",
    paymentStatus: "Partial",
    amountPaid: 0,
    transactionReference: "",
    notes: "",
  });

  const [stateOptions, setStateOptions] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);

  const [addons, setAddons] = useState([]);
  const addAddon = () =>
    setAddons((a) => [
      ...a,
      { addonName: "", quantity: 1, unitPrice: 0, totalPrice: 0, remarks: "" },
    ]);
  const removeAddon = (i) => setAddons((a) => a.filter((_, idx) => idx !== i));
  const updateAddon = (i, k, v) =>
    setAddons((a) => {
      const next = [...a];
      next[i] = { ...next[i], [k]: v };
      if (k === "quantity" || k === "unitPrice") {
        next[i].totalPrice =
          Number(next[i].quantity || 0) * Number(next[i].unitPrice || 0);
      }
      return next;
    });

  // ── Load space details — also seeds the amenities checkbox list from
  //    the meeting-space's own amenityList (meet_space_amenty rows). The
  //    hotel's amenities are NOT used: we want to surface only what the
  //    operator configured for this specific space on the manage page.
  useEffect(() => {
    const spaceId = q.spaceId;
    if (!spaceId) {
      setLoading(false);
      return;
    }
    axiosInstance
      .get(`/api/meet-and-space/${spaceId}`)
      .then((r) => {
        setSpace(r.data);

        // Build the checkbox list from the space's normalised amenityList.
        // If the backend hasn't returned that array (older row, no amenities
        // saved yet, etc.) fall back to splitting the legacy comma-separated
        // `amenities` field so the page still renders something usable.
        let amenities = [];
        if (Array.isArray(r.data?.amenityList) && r.data.amenityList.length) {
          amenities = r.data.amenityList
            .map((a, idx) => ({
              id: a.id ? `db-${a.id}` : `sp-${idx}`,
              name: a.amenityName,
              masterAmenityId: a.masterAmenityId || null,
            }))
            .filter((x) => x.name);
        } else if (typeof r.data?.amenities === "string" && r.data.amenities.trim()) {
          amenities = r.data.amenities
            .split(",")
            .map((n, idx) => ({
              id: `sp-${idx}`,
              name: n.trim(),
              masterAmenityId: null,
            }))
            .filter((x) => x.name);
        }
        setSpaceAmenities(amenities.map((x) => ({ ...x, isSelected: false })));
      })
      .catch((e) => {
        console.error("Load space failed", e);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line
  }, []);

  // ── Edit mode — load existing booking & prefill everything ────────────
  // Mirrors the hotel edit flow: when `editBookingId` is present we GET
  // /api/meet-and-space/booking/{id}, then override criteria, customer,
  // payment, addons, amenities and the additionalRequirements field. The
  // space is loaded from the booking's meetingSpaceId (the search-page
  // criteria query params are not needed in edit mode).
  useEffect(() => {
    if (!isEditMode) return;
    setLoading(true);
    axiosInstance
      .get(`/api/meet-and-space/booking/${editBookingId}`)
      .then((r) => {
        const b = r.data || {};
        setEditBooking(b);

        // Fetch the space record so the page can render the image + amenity
        // checkbox list using the same component logic as the create flow.
        if (b.meetingSpaceId) {
          axiosInstance
            .get(`/api/meet-and-space/${b.meetingSpaceId}`)
            .then((sp) => {
              setSpace(sp.data);
              // Prime the amenity checkboxes from the space's master list and
              // pre-tick the ones that were saved against the booking.
              const saved = (b.amenities || b.selectedAmenities || [])
                .filter((a) => a.source !== "Custom")
                .map((a) => a.amenityName);
              let amenities = [];
              if (
                Array.isArray(sp.data?.amenityList) &&
                sp.data.amenityList.length
              ) {
                amenities = sp.data.amenityList
                  .map((a, idx) => ({
                    id: a.id ? `db-${a.id}` : `sp-${idx}`,
                    name: a.amenityName,
                    masterAmenityId: a.masterAmenityId || null,
                  }))
                  .filter((x) => x.name);
              }
              setSpaceAmenities(
                amenities.map((x) => ({
                  ...x,
                  isSelected: saved.includes(x.name),
                }))
              );
              // Any saved Custom amenities go into the free-form repeater.
              const customs = (b.amenities || b.selectedAmenities || [])
                .filter((a) => a.source === "Custom")
                .map((a) => a.amenityName);
              setCustomAmenities(customs);
            })
            .catch(() => {});
        }

        setCriteria({
          bookingDate: b.bookingDate || "",
          startTime: b.startTime || "",
          endTime: b.endTime || "",
          attendees: b.attendees || 1,
          layout: b.layout || "",
          ratePlan: b.ratePlan || "Standard",
          rateType: b.rateType || "Hourly",
          unitRate: Number(b.unitRate || 0),
        });
        setEventType(b.eventType || "Meeting");
        setAdditionalRequirements(b.additionalRequirements || "");

        if (b.customer) {
          setCustomer({
            salutation: b.customer.salutation || "Mr",
            firstName: b.customer.firstName || "",
            lastName: b.customer.lastName || "",
            email: b.customer.email || "",
            mobile: b.customer.mobile || "",
            alternateMobile: b.customer.alternateMobile || "",
            companyName: b.customer.companyName || "",
            designation: b.customer.designation || "",
            gstNumber: b.customer.gstNumber || "",
            address: b.customer.address || "",
            cityId: b.customer.cityId || null,
            cityName: b.customer.city || "",
            stateId: b.customer.stateId || null,
            stateName: b.customer.state || "",
            pincode: b.customer.pincode || "",
            idType: b.customer.idType || "Aadhaar",
            idNumber: b.customer.idNumber || "",
            remarks: b.customer.remarks || "",
          });
        }
        if (b.payment) {
          setPayment({
            paymentMode: b.payment.paymentMode || "Cash",
            paymentStatus: b.payment.paymentStatus || "Partial",
            amountPaid: b.payment.amountPaid || 0,
            transactionReference: b.payment.transactionReference || "",
            notes: b.payment.notes || "",
          });
        }
        if (Array.isArray(b.addons)) {
          setAddons(
            b.addons.map((a) => ({
              addonName: a.addonName || "",
              quantity: a.quantity || 1,
              unitPrice: Number(a.unitPrice || 0),
              totalPrice: Number(a.totalPrice || 0),
              remarks: a.remarks || "",
            }))
          );
        }
      })
      .catch((e) => {
        console.error("Load booking for edit failed", e);
        toast.error("Failed to load booking for editing");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line
  }, [editBookingId]);

  // ── Load state list for the selected nationality ──────────────────────
  useEffect(() => {
    if (!nationalityId) {
      setStateOptions([]);
      return;
    }
    axiosInstance
      .get(
        `/api/province/countryId?countryId=${nationalityId}&page=0&limit=50&search=`
      )
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        setStateOptions(
          list.map((s) => ({ value: s.id, label: s.stateName || s.name }))
        );
      })
      .catch(() => setStateOptions([]));
  }, [nationalityId]);

  // ── Load city / destination list filtered by nationality ────────────
  useEffect(() => {
    if (!nationalityId) {
      setCityOptions([]);
      return;
    }
    axiosInstance
      .get(`/api/destination?page=0&limit=50&search=`)
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        // Different shapes for the linked country — be defensive.
        const filtered = list.filter((d) => {
          const cId =
            d.countryId ||
            d.country?.id ||
            d.country?.countryId ||
            d.master_country_id;
          return cId == null || Number(cId) === Number(nationalityId);
        });
        setCityOptions(
          filtered.map((d) => ({
            value: d.id,
            label: d.name || d.destinationName,
          }))
        );
      })
      .catch(() => setCityOptions([]));
  }, [nationalityId]);

  // ── Pricing recompute ────────────────────────────────────────────────
  const pricing = useMemo(() => {
    const [sh, sm] = (criteria.startTime || "0:0").split(":").map(Number);
    const [eh, em] = (criteria.endTime || "0:0").split(":").map(Number);
    const mins = eh * 60 + em - (sh * 60 + sm);
    const hours = mins > 0 ? Math.ceil(mins / 60) : 0;
    const unit = Number(criteria.unitRate || 0);
    const subTotal = criteria.rateType === "Hourly" ? unit * hours : unit;
    const addonTotal = addons.reduce(
      (s, a) => s + Number(a.totalPrice || 0),
      0
    );
    const taxPercent = Number(space?.taxPercent || 0);
    const taxAmount = ((subTotal + addonTotal) * taxPercent) / 100;
    const totalAmount = subTotal + addonTotal + taxAmount;
    const amountPaidNum = Number(payment.amountPaid || 0);
    const balanceDue = Math.max(totalAmount - amountPaidNum, 0);
    return {
      hours,
      subTotal,
      addonTotal,
      taxPercent,
      taxAmount,
      totalAmount,
      balanceDue,
    };
  }, [criteria, addons, space, payment.amountPaid]);

  // ── Amenity selection helpers ───────────────────────────────────────
  // Toggles a checkbox bound to one of the space's pre-configured amenities.
  const toggleSpaceAmenity = (id) =>
    setSpaceAmenities((list) =>
      list.map((a) => (a.id === id ? { ...a, isSelected: !a.isSelected } : a))
    );

  const addCustomAmenity = () => setCustomAmenities((l) => [...l, ""]);
  const removeCustomAmenity = (idx) =>
    setCustomAmenities((l) => l.filter((_, i) => i !== idx));
  const updateCustomAmenity = (idx, value) =>
    setCustomAmenities((l) => {
      const next = [...l];
      next[idx] = value;
      return next;
    });

  // ── Validation (inline) ────────────────────────────────────────────
  // Human-readable labels for each errored field — used by `toastErrors`
  // below to tell the user exactly which inputs are missing rather than
  // the generic "Please fix the highlighted fields" they were seeing.
  const FIELD_LABELS = {
    firstName: "First Name",
    mobile: "Mobile",
    email: "Email",
    cityId: "City",
    stateId: "State",
    eventType: "Event Type",
    attendees: "Attendees",
    amountPaid: "Amount Paid",
  };

  /** Pure error-collection — returns the errors map without touching state.
   *  Used both by `validate()` (which commits the map via setErrors) and by
   *  the review/confirm handlers when they need a fresh snapshot to toast
   *  the missing-field names. */
  const collectErrors = () => {
    const e = {};
    if (!customer.firstName.trim()) e.firstName = "First name is required";
    if (!customer.mobile.trim()) e.mobile = "Mobile is required";
    else if (!/^\d{8,15}$/.test(customer.mobile.trim()))
      e.mobile = "Mobile must be 8-15 digits";
    if (customer.email && !/\S+@\S+\.\S+/.test(customer.email))
      e.email = "Invalid email format";
    if (!customer.cityId) e.cityId = "City is required";
    if (!customer.stateId) e.stateId = "State is required";
    if (!eventType) e.eventType = "Event type is required";
    if (!criteria.attendees || Number(criteria.attendees) <= 0)
      e.attendees = "Attendees must be > 0";
    if (Number(payment.amountPaid || 0) < 0)
      e.amountPaid = "Amount cannot be negative";
    return e;
  };

  const validate = () => {
    const e = collectErrors();
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /** Show a toast listing the fields that failed validation. Up to three
   *  field names are surfaced inline; the rest are summarised as "+N more". */
  const toastErrors = (errs) => {
    const labels = Object.keys(errs)
      .filter((k) => k !== "_general")
      .map((k) => FIELD_LABELS[k] || k);
    if (labels.length === 0) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    const head = labels.slice(0, 3).join(", ");
    const more = labels.length > 3 ? ` (+${labels.length - 3} more)` : "";
    toast.error(`Please fill: ${head}${more}`);
  };

  /** react-select style override that surfaces inline error state with a
   *  red border, matching the Bootstrap `.is-invalid` look on the rest of
   *  the form. Used by the State / City pickers below. */
  const invalidSelectStyles = {
    control: (base, state) => ({
      ...base,
      borderColor: "#dc3545",
      boxShadow: state.isFocused ? "0 0 0 .25rem rgba(220,53,69,.25)" : "none",
      "&:hover": { borderColor: "#dc3545" },
    }),
  };

  const cancellationPolicies = useMemo(
    () =>
      Array.isArray(space?.cancellationPolicies)
        ? space.cancellationPolicies.filter((p) => p?.policyText)
        : [],
    [space]
  );

  const setCustomerField = (k, v) => {
    setCustomer((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((er) => ({ ...er, [k]: null }));
  };

  // ── Review (validate + open order-summary modal) ───────────────────
  // The form's main "Review & Confirm" button does NOT save directly. It
  // validates and opens an order-summary modal showing the image + every
  // captured detail. The actual booking endpoint fires from the modal's
  // Confirm button (handleConfirm below).
  const handleReview = () => {
    if (!space) return;
    if (!validate()) {
      // Surface every missing field by name so the user knows exactly what
      // to fix. The validate() call already populated `errors` via state —
      // read the latest map by re-running the same checks instead of relying
      // on a stale `errors` snapshot.
      const fresh = collectErrors();
      toastErrors(fresh);
      const first = document.querySelector(".is-invalid, .text-danger");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setPolicyAccepted(false);
    setShowPolicyModal(true);
  };

  // ── Confirm booking ─────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!space) return;
    if (!validate()) {
      const fresh = collectErrors();
      toastErrors(fresh);
      const first = document.querySelector(".is-invalid, .text-danger");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      setShowOrderSummary(false);
      return;
    }
    setSaving(true);
    try {
      // Combine ticked space-amenities (source="Space" — they came from the
      // meeting-space master) with any free-form items the customer added
      // (source="Custom"). The whole list is persisted into the
      // meet_and_space_booking_amenity table on save.
      const selectedAmenities = [
        ...spaceAmenities
          .filter((a) => a.isSelected)
          .map((a) => ({
            amenityName: a.name,
            source: "Space",
            masterAmenityId: a.masterAmenityId,
          })),
        ...customAmenities
          .filter((n) => n && n.trim())
          .map((n) => ({ amenityName: n.trim(), source: "Custom" })),
      ];

      const payload = {
        meetingSpaceId: space.id,
        bookingDate: criteria.bookingDate,
        startTime: criteria.startTime,
        endTime: criteria.endTime,
        rateType: criteria.rateType,
        ratePlan: criteria.ratePlan,
        unitRate: criteria.unitRate,
        subTotal: pricing.subTotal,
        addonTotal: pricing.addonTotal,
        taxPercent: pricing.taxPercent,
        taxAmount: pricing.taxAmount,
        discountAmount: 0,
        totalAmount: pricing.totalAmount,
        currency: space.currency || "INR",
        currencyId: space.currencyId,
        attendees: Number(criteria.attendees || 1),
        layout: criteria.layout,
        eventType,
        requestedAmenities: selectedAmenities
          .map((a) => a.amenityName)
          .join(", "),
        additionalRequirements,
        agentId,
        agentName,
        nationalityId,
        nationalityName,
        selectedAmenities,
        customer: {
          salutation: customer.salutation,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          mobile: customer.mobile,
          alternateMobile: customer.alternateMobile,
          companyName: customer.companyName,
          designation: customer.designation,
          gstNumber: customer.gstNumber,
          address: customer.address,
          city: customer.cityName,
          cityId: customer.cityId,
          state: customer.stateName,
          stateId: customer.stateId,
          country: nationalityName,
          countryId: nationalityId,
          pincode: customer.pincode,
          idType: customer.idType,
          idNumber: customer.idNumber,
          remarks: customer.remarks,
        },
        payment: {
          ...payment,
          amountPaid: Number(payment.amountPaid || 0),
          balanceDue: pricing.balanceDue,
        },
        addons: addons
          .filter((a) => a.addonName && a.addonName.trim())
          .map((a) => ({
            addonName: a.addonName,
            quantity: Number(a.quantity || 1),
            unitPrice: Number(a.unitPrice || 0),
            totalPrice: Number(a.totalPrice || 0),
            remarks: a.remarks,
          })),
      };
      const res = isEditMode
        ? await axiosInstance.put(
            `/api/meet-and-space/booking/${editBookingId}/edit`,
            payload
          )
        : await axiosInstance.post(
            "/api/meet-and-space/booking/save",
            payload
          );
      const ref = res.data?.bookingNumber || res.data?.bookingCode || "";
      toast.success(
        isEditMode
          ? `Booking updated! New ref: ${ref}`
          : `Booking confirmed! Ref: ${ref}`
      );
      setShowOrderSummary(false);
      setTimeout(
        () =>
          navigate("/booking-details/meet-and-space-booking-list", {
            replace: true,
          }),
        800
      );
    } catch (e) {
      console.error("Save booking failed", e);
      setErrors((p) => ({
        ...p,
        _general:
          e?.response?.data?.message || "Failed to confirm booking",
      }));
    } finally {
      setSaving(false);
    }
  };

  const currency = space?.currency || "INR";
  const money = (n) => `${currency} ${Number(n || 0).toFixed(2)}`;

  // ── Quotation PDF ─────────────────────────────────────────────────────
  // Quotes what this page shows: the Booking Summary (venue, date, time,
  // attendees, layout, event) and the Price Details Sub Total / Tax / Total
  // in the space's currency, like money(). Amount Paid / Balance Due are
  // payment tracking, not quotation content. Cancellation lines use the
  // Policies modal's own wording.
  const buildMeetSpaceQuotationPayload = () => {
    if (!space) return null;
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const unit = Number(criteria.unitRate || 0);
    const selectedAmenities = [
      ...spaceAmenities.filter((a) => a.isSelected).map((a) => a.name),
      ...customAmenities.map((a) => (a || "").trim()),
    ].filter(Boolean);

    const priceItems = [
      {
        description: `Venue hire - ${space.spaceName || "Meeting space"}`,
        details:
          criteria.rateType === "Hourly"
            ? `${pricing.hours} hour${pricing.hours === 1 ? "" : "s"} x ${currency} ${unit.toFixed(2)}`
            : [criteria.ratePlan, criteria.rateType].filter(Boolean).join(", "),
        amount: round2(pricing.subTotal),
      },
    ];
    if (pricing.addonTotal > 0) {
      addons
        .filter((a) => Number(a.totalPrice || 0) !== 0)
        .forEach((a) =>
          priceItems.push({
            description: a.addonName || "Add-on",
            details: `${Number(a.quantity) || 0} x ${currency} ${Number(
              a.unitPrice || 0,
            ).toFixed(2)}`,
            amount: round2(a.totalPrice),
          }),
        );
    }
    if (pricing.taxAmount > 0) {
      priceItems.push({
        description: `Tax (${pricing.taxPercent}%)`,
        details: "",
        amount: round2(pricing.taxAmount),
      });
    }

    const customerName = [customer.firstName, customer.lastName]
      .map((p) => (p || "").trim())
      .filter(Boolean)
      .join(" ");

    return {
      bookingType: "MEET_SPACE",
      agentId: agentId || null,
      currency,
      serviceName: space.spaceName || "Meeting Space",
      serviceSubtitle: space.hotelName || "",
      customerName: customerName
        ? `${customer.salutation ? `${customer.salutation} ` : ""}${customerName}`
        : null,
      customerEmail: customer.email.trim() || null,
      customerMobile: customer.mobile.trim() || null,
      details: [
        { label: "Date", value: criteria.bookingDate || "" },
        {
          label: "Time",
          value:
            criteria.startTime && criteria.endTime
              ? `${criteria.startTime} - ${criteria.endTime} (${pricing.hours}h)`
              : "",
        },
        { label: "Attendees", value: String(criteria.attendees || "") },
        { label: "Layout", value: criteria.layout || "" },
        { label: "Event Type", value: eventType || "" },
        { label: "Space Type", value: space.spaceType || "" },
        {
          label: "Capacity",
          value: space.capacity != null ? String(space.capacity) : "",
        },
        { label: "Rate Plan", value: criteria.ratePlan || "" },
        { label: "Company", value: customer.companyName || "" },
        { label: "Country", value: nationalityName || "" },
        { label: "Amenities", value: selectedAmenities.join(", ") },
      ],
      priceItems,
      totalAmount: round2(pricing.totalAmount),
      cancellationPolicy: cancellationPolicies.map((policy) => {
        const hasDays =
          policy.daysBeforeEvent !== null && policy.daysBeforeEvent !== undefined;
        const hasCharge =
          policy.chargePercent !== null && policy.chargePercent !== undefined;
        const meta = [
          hasDays ? `${policy.daysBeforeEvent} day(s) before event` : "",
          hasCharge ? `${policy.chargePercent}% charge` : "",
        ]
          .filter(Boolean)
          .join(" - ");
        return `${policy.policyText}${meta ? ` (${meta})` : ""}`;
      }),
      notes: additionalRequirements.trim()
        ? [`Additional requirements: ${additionalRequirements.trim()}`]
        : [],
    };
  };

  if (loading) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column hotel-booking-container">
        <TopBar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="content-wrapper py-4 flex-grow-1" style={{ minWidth: 0, overflowX: "hidden" }}>
            <Container fluid="xl">
              <div className="text-center py-5">
                <Spinner animation="border" />
              </div>
            </Container>
          </main>
        </div>
      </div>
    );
  }
  if (!space) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column hotel-booking-container">
        <TopBar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="content-wrapper py-4 flex-grow-1" style={{ minWidth: 0, overflowX: "hidden" }}>
            <Container fluid="xl">
              <Alert variant="danger" className="mt-3">
                Meeting space not found.
              </Alert>
            </Container>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-vh-100 bg-light d-flex flex-column hotel-booking-container">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="content-wrapper py-4 flex-grow-1" style={{ minWidth: 0, overflowX: "hidden" }}>
          <Container fluid="xl">
            {agentName && (
              <div className="d-flex justify-content-end mb-2">
                <span
                  className="fw-bold"
                  style={{ color: "#dc3545", fontSize: "0.95rem" }}
                >
                  Agent: {agentName}
                </span>
              </div>
            )}

            {errors._general && (
              <Alert variant="danger">{errors._general}</Alert>
            )}

            <Form
              onSubmit={(e) => {
                e.preventDefault();
                handleReview();
              }}
            >
              <Row className="g-3">
                <Col lg={8} className="hbp-left-col">
                  {/* Event Details */}
                  <Card className="mb-2 shadow-sm border-0">
                    <Card.Header className="bg-light py-2">
                      <div className="d-flex align-items-center flex-wrap gap-2">
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          onClick={() => {
                            // Three routes this page can be reached by,
                            // each with a different "previous page":
                            //  - Edit flow: opened in the SAME tab from
                            //    /booking-details/... — real history
                            //    exists, so navigate(-1) works.
                            //  - Search flow: opened in a NEW tab via
                            //    window.open from MeetAndSpaceSearch —
                            //    no history to go back to. Close the
                            //    tab; the search tab is still open
                            //    behind it. Same pattern used lower in
                            //    this file for the post-save Back link.
                            //  - Direct load (bookmark / typed URL):
                            //    neither history nor opener — fall back
                            //    to the search page so the user isn't
                            //    dead-ended.
                            if (isEditMode) {
                              navigate(-1);
                              return;
                            }
                            if (window.opener && !window.opener.closed) {
                              window.close();
                              return;
                            }
                            navigate("/new-booking/meet-and-space");
                          }}
                          className="me-3"
                        >
                          ← Back
                        </Button>
                        <h5 className="mb-0 fw-bold text-dark">Event Details</h5>
                        {isEditMode && editBooking && (
                          <Badge bg="warning" text="dark" className="ms-2">
                            <FaEdit className="me-1" /> Edit Mode · #
                            {editBooking.bookingNumber} (next /
                            {(editBooking.editCount ?? 0) + 1})
                          </Badge>
                        )}
                      </div>
                    </Card.Header>
                    <Card.Body>
                      <Row className="g-3">
                        <Col md={4}>
                          <Form.Group>
                            <Form.Label>
                              <span style={{ color: "red" }}>*</span>Event Type
                            </Form.Label>
                            <Form.Select
                              value={eventType}
                              onChange={(e) => {
                                setEventType(e.target.value);
                                if (errors.eventType)
                                  setErrors((p) => ({ ...p, eventType: null }));
                              }}
                              isInvalid={!!errors.eventType}
                            >
                              {EVENT_TYPES.map((t) => (
                                <option key={t}>{t}</option>
                              ))}
                            </Form.Select>
                            <Form.Control.Feedback type="invalid">
                              {errors.eventType}
                            </Form.Control.Feedback>
                          </Form.Group>
                        </Col>
                        <Col md={4}>
                          <Form.Group>
                            <Form.Label>Layout</Form.Label>
                            <Form.Select
                              value={criteria.layout}
                              onChange={(e) =>
                                setCriteria((p) => ({
                                  ...p,
                                  layout: e.target.value,
                                }))
                              }
                            >
                              <option value="">—</option>
                              {LAYOUTS.map((l) => (
                                <option key={l}>{l}</option>
                              ))}
                            </Form.Select>
                          </Form.Group>
                        </Col>
                        <Col md={4}>
                          <Form.Group>
                            <Form.Label>
                              <span style={{ color: "red" }}>*</span>Attendees
                            </Form.Label>
                            <Form.Control
                              type="number"
                              value={criteria.attendees}
                              onChange={(e) => {
                                setCriteria((p) => ({
                                  ...p,
                                  attendees: e.target.value,
                                }));
                                if (errors.attendees)
                                  setErrors((p) => ({ ...p, attendees: null }));
                              }}
                              isInvalid={!!errors.attendees}
                            />
                            <Form.Control.Feedback type="invalid">
                              {errors.attendees}
                            </Form.Control.Feedback>
                          </Form.Group>
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>

                  {/* ── Requested Amenities — driven by the meeting space's
                      own configured amenities (saved on the manage page into
                      meet_space_amenty). Additional Amenities below lets the
                      customer add free-form extras. ── */}
                  <Card className="p-4 mb-4 shadow-sm border-0">
                    <h5 className="mb-1 fw-bold">Requested Amenities</h5>
                    <div className="text-muted small mb-3">
                      Amenities offered by {space.spaceName}
                    </div>
                    {spaceAmenities.length === 0 ? (
                      <div className="text-muted small mb-2">
                        No amenities have been configured for this space yet —
                        add what you need in the "Additional Amenities" section
                        below.
                      </div>
                    ) : (
                      <div className="special-request-grid mb-3">
                        {spaceAmenities.map((a) => (
                          <Form.Check
                            key={a.id}
                            type="checkbox"
                            id={`amenity-${a.id}`}
                            label={a.name}
                            checked={a.isSelected}
                            onChange={() => toggleSpaceAmenity(a.id)}
                            className="mb-2 special-request-check"
                          />
                        ))}
                      </div>
                    )}

                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <strong className="small">Additional Amenities</strong>
                      <Button
                        size="sm"
                        variant="outline-primary"
                        onClick={addCustomAmenity}
                      >
                        <FaPlus /> Add
                      </Button>
                    </div>
                    {customAmenities.length === 0 && (
                      <div className="text-muted small">
                        Nothing extra? Skip this section.
                      </div>
                    )}
                    {customAmenities.map((value, idx) => (
                      <Row key={idx} className="g-2 mb-2 align-items-center">
                        <Col md={10}>
                          <Form.Control
                            size="sm"
                            placeholder="e.g. Photographer, Anchor, Décor team..."
                            value={value}
                            onChange={(e) =>
                              updateCustomAmenity(idx, e.target.value)
                            }
                          />
                        </Col>
                        <Col md={2}>
                          <Button
                            size="sm"
                            variant="outline-danger"
                            className="w-100"
                            onClick={() => removeCustomAmenity(idx)}
                          >
                            <FaTrash /> Remove
                          </Button>
                        </Col>
                      </Row>
                    ))}
                    <Form.Text className="text-muted">
                      Selected amenities save into the
                      meet_and_space_booking_amenity table on confirm.
                    </Form.Text>
                  </Card>

                  {/* Customer Details */}
                  <Card className="p-4 mb-4 shadow-sm border-0">
                    <h5 className="mb-3 fw-bold">Customer Details</h5>
                    <Row className="g-3">
                      <Col md={1}>
                        <Form.Group>
                          <Form.Label>Title</Form.Label>
                          <Form.Select
                            value={customer.salutation}
                            onChange={(e) =>
                              setCustomerField("salutation", e.target.value)
                            }
                          >
                            {SALUTATIONS.map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </Form.Select>
                        </Form.Group>
                      </Col>
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>
                            <span style={{ color: "red" }}>*</span>First Name
                          </Form.Label>
                          <Form.Control
                            value={customer.firstName}
                            onChange={(e) =>
                              setCustomerField("firstName", e.target.value)
                            }
                            isInvalid={!!errors.firstName}
                          />
                          <Form.Control.Feedback type="invalid">
                            {errors.firstName}
                          </Form.Control.Feedback>
                        </Form.Group>
                      </Col>
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>Last Name</Form.Label>
                          <Form.Control
                            value={customer.lastName}
                            onChange={(e) =>
                              setCustomerField("lastName", e.target.value)
                            }
                          />
                        </Form.Group>
                      </Col>
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>
                            <span style={{ color: "red" }}>*</span>Mobile
                          </Form.Label>
                          <Form.Control
                            value={customer.mobile}
                            onChange={(e) =>
                              setCustomerField("mobile", e.target.value)
                            }
                            isInvalid={!!errors.mobile}
                          />
                          <Form.Control.Feedback type="invalid">
                            {errors.mobile}
                          </Form.Control.Feedback>
                        </Form.Group>
                      </Col>
                      <Col md={2}>
                        <Form.Group>
                          <Form.Label>Alt. Mobile</Form.Label>
                          <Form.Control
                            value={customer.alternateMobile}
                            onChange={(e) =>
                              setCustomerField("alternateMobile", e.target.value)
                            }
                          />
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <Form.Group>
                          <Form.Label>Email</Form.Label>
                          <Form.Control
                            type="email"
                            value={customer.email}
                            onChange={(e) =>
                              setCustomerField("email", e.target.value)
                            }
                            isInvalid={!!errors.email}
                          />
                          <Form.Control.Feedback type="invalid">
                            {errors.email}
                          </Form.Control.Feedback>
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <Form.Group>
                          <Form.Label>Company / Organization</Form.Label>
                          <Form.Control
                            value={customer.companyName}
                            onChange={(e) =>
                              setCustomerField("companyName", e.target.value)
                            }
                          />
                        </Form.Group>
                      </Col>
                      <Col md={2}>
                        <Form.Group>
                          <Form.Label>Designation</Form.Label>
                          <Form.Control
                            value={customer.designation}
                            onChange={(e) =>
                              setCustomerField("designation", e.target.value)
                            }
                          />
                        </Form.Group>
                      </Col>
                      <Col md={2}>
                        <Form.Group>
                          <Form.Label>GSTIN</Form.Label>
                          <Form.Control
                            value={customer.gstNumber}
                            onChange={(e) =>
                              setCustomerField("gstNumber", e.target.value)
                            }
                          />
                        </Form.Group>
                      </Col>
                      <Col md={12}>
                        <Form.Group>
                          <Form.Label>Address</Form.Label>
                          <Form.Control
                            value={customer.address}
                            onChange={(e) =>
                              setCustomerField("address", e.target.value)
                            }
                          />
                        </Form.Group>
                      </Col>

                      {/* Country = nationality, plain read-only text */}
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>Country</Form.Label>
                          <div
                            className="form-control bg-light"
                            title="Set by the nationality picked on the search page"
                          >
                            {nationalityName || "—"}
                          </div>
                          <Form.Text className="text-muted">
                            From search nationality.
                          </Form.Text>
                        </Form.Group>
                      </Col>

                      {/* State dropdown (filtered by nationality) */}
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>
                            <span style={{ color: "red" }}>*</span>State
                          </Form.Label>
                          <Select
                            options={stateOptions}
                            value={
                              stateOptions.find(
                                (s) => s.value === customer.stateId
                              ) || null
                            }
                            onChange={(o) => {
                              setCustomer((p) => ({
                                ...p,
                                stateId: o?.value || null,
                                stateName: o?.label || "",
                              }));
                              if (errors.stateId)
                                setErrors((p) => ({ ...p, stateId: null }));
                            }}
                            placeholder="Select state..."
                            isClearable
                            menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
                            menuPosition="fixed"
                            styles={{
                              ...(errors.stateId ? invalidSelectStyles : {}),
                              menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                            }}
                            className={errors.stateId ? "text-danger" : ""}
                          />
                          {errors.stateId && (
                            <div className="text-danger small mt-1">
                              {errors.stateId}
                            </div>
                          )}
                        </Form.Group>
                      </Col>

                      {/* City dropdown (filtered by nationality) */}
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>
                            <span style={{ color: "red" }}>*</span>City
                          </Form.Label>
                          <Select
                            options={cityOptions}
                            value={
                              cityOptions.find(
                                (c) => c.value === customer.cityId
                              ) || null
                            }
                            onChange={(o) => {
                              setCustomer((p) => ({
                                ...p,
                                cityId: o?.value || null,
                                cityName: o?.label || "",
                              }));
                              if (errors.cityId)
                                setErrors((p) => ({ ...p, cityId: null }));
                            }}
                            placeholder="Select city..."
                            isClearable
                            menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
                            menuPosition="fixed"
                            styles={{
                              ...(errors.cityId ? invalidSelectStyles : {}),
                              menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                            }}
                            className={errors.cityId ? "text-danger" : ""}
                          />
                          {errors.cityId && (
                            <div className="text-danger small mt-1">
                              {errors.cityId}
                            </div>
                          )}
                        </Form.Group>
                      </Col>

                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>Pincode</Form.Label>
                          <Form.Control
                            value={customer.pincode}
                            onChange={(e) =>
                              setCustomerField("pincode", e.target.value)
                            }
                          />
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <Form.Group>
                          <Form.Label>ID Type</Form.Label>
                          <Form.Select
                            value={customer.idType}
                            onChange={(e) =>
                              setCustomerField("idType", e.target.value)
                            }
                          >
                            {ID_TYPES.map((t) => (
                              <option key={t}>{t}</option>
                            ))}
                          </Form.Select>
                        </Form.Group>
                      </Col>
                      <Col md={8}>
                        <Form.Group>
                          <Form.Label>ID Number</Form.Label>
                          <Form.Control
                            value={customer.idNumber}
                            onChange={(e) =>
                              setCustomerField("idNumber", e.target.value)
                            }
                          />
                        </Form.Group>
                      </Col>
                      <Col md={12}>
                        <Form.Group>
                          <Form.Label>Remarks</Form.Label>
                          <Form.Control
                            value={customer.remarks}
                            onChange={(e) =>
                              setCustomerField("remarks", e.target.value)
                            }
                          />
                        </Form.Group>
                      </Col>
                      <Col md={12}>
                        <Form.Group>
                          <Form.Label>
                            Additional Requirements / Notes
                          </Form.Label>
                          <Form.Control
                            as="textarea"
                            rows={2}
                            value={additionalRequirements}
                            onChange={(e) =>
                              setAdditionalRequirements(e.target.value)
                            }
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                  </Card>

                  {SHOW_ADDONS && (
                    <Card className="p-4 mb-4 shadow-sm border-0">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h5 className="mb-0 fw-bold">Add-ons</h5>
                        <Button
                          size="sm"
                          variant="outline-primary"
                          onClick={addAddon}
                        >
                          <FaPlus /> Add
                        </Button>
                      </div>
                      {addons.length === 0 ? (
                        <div className="text-muted small">
                          No add-ons added. Click "Add" to include catering, AV
                          rental, etc.
                        </div>
                      ) : (
                        <Table size="sm" bordered>
                          <thead>
                            <tr>
                              <th>Item</th>
                              <th style={{ width: 80 }}>Qty</th>
                              <th style={{ width: 120 }}>Unit Price</th>
                              <th style={{ width: 120 }}>Total</th>
                              <th>Remarks</th>
                              <th style={{ width: 40 }} />
                            </tr>
                          </thead>
                          <tbody>
                            {addons.map((a, i) => (
                              <tr key={i}>
                                <td>
                                  <Form.Control
                                    size="sm"
                                    value={a.addonName}
                                    onChange={(e) =>
                                      updateAddon(i, "addonName", e.target.value)
                                    }
                                  />
                                </td>
                                <td>
                                  <Form.Control
                                    size="sm"
                                    type="number"
                                    value={a.quantity}
                                    onChange={(e) =>
                                      updateAddon(i, "quantity", e.target.value)
                                    }
                                  />
                                </td>
                                <td>
                                  <Form.Control
                                    size="sm"
                                    type="number"
                                    value={a.unitPrice}
                                    onChange={(e) =>
                                      updateAddon(i, "unitPrice", e.target.value)
                                    }
                                  />
                                </td>
                                <td>{Number(a.totalPrice || 0).toFixed(2)}</td>
                                <td>
                                  <Form.Control
                                    size="sm"
                                    value={a.remarks}
                                    onChange={(e) =>
                                      updateAddon(i, "remarks", e.target.value)
                                    }
                                  />
                                </td>
                                <td>
                                  <Button
                                    size="sm"
                                    variant="outline-danger"
                                    onClick={() => removeAddon(i)}
                                  >
                                    <FaTrash />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      )}
                    </Card>
                  )}

                  {/* Payment */}
                  <Card className="p-4 mb-2 shadow-sm border-0">
                    <h5 className="mb-3 fw-bold">Payment</h5>
                    <Row className="g-3">
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>Mode</Form.Label>
                          <Form.Select
                            value={payment.paymentMode}
                            onChange={(e) =>
                              setPayment({
                                ...payment,
                                paymentMode: e.target.value,
                              })
                            }
                          >
                            {PAYMENT_MODES.map((p) => (
                              <option key={p}>{p}</option>
                            ))}
                          </Form.Select>
                        </Form.Group>
                      </Col>
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>Status</Form.Label>
                          <Form.Select
                            value={payment.paymentStatus}
                            onChange={(e) =>
                              setPayment({
                                ...payment,
                                paymentStatus: e.target.value,
                              })
                            }
                          >
                            <option>Pending</option>
                            <option>Partial</option>
                            <option>Paid</option>
                          </Form.Select>
                        </Form.Group>
                      </Col>
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>Amount Paid</Form.Label>
                          <Form.Control
                            type="number"
                            value={payment.amountPaid}
                            onChange={(e) => {
                              setPayment({
                                ...payment,
                                amountPaid: e.target.value,
                              });
                              if (errors.amountPaid)
                                setErrors((p) => ({ ...p, amountPaid: null }));
                            }}
                            isInvalid={!!errors.amountPaid}
                          />
                          <Form.Control.Feedback type="invalid">
                            {errors.amountPaid}
                          </Form.Control.Feedback>
                        </Form.Group>
                      </Col>
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>Transaction Ref</Form.Label>
                          <Form.Control
                            value={payment.transactionReference}
                            onChange={(e) =>
                              setPayment({
                                ...payment,
                                transactionReference: e.target.value,
                              })
                            }
                          />
                        </Form.Group>
                      </Col>
                      <Col md={12}>
                        <Form.Group>
                          <Form.Label>Notes</Form.Label>
                          <Form.Control
                            value={payment.notes}
                            onChange={(e) =>
                              setPayment({ ...payment, notes: e.target.value })
                            }
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                  </Card>
                </Col>

                {/* Right sticky column — Booking Summary + Price */}
                <Col lg={4} className="hbp-right-col">
                  <div className="hbp-sticky-summary">
                    <Card className="shadow-sm rounded-3 mb-3 booking-summary-card border-0 overflow-hidden">
                      <Card.Header className="bg-primary text-white py-2 rounded-top">
                        <h6 className="mb-0 d-flex align-items-center">
                          <FaHotel className="me-2" /> Booking Summary
                        </h6>
                      </Card.Header>
                      <Card.Body className="p-3">
                        <div className="mb-3">
                          <div className="fw-bold text-primary mb-1">
                            {space.spaceName}
                          </div>
                          <div className="text-muted small mb-2">
                            <FaMapMarkerAlt className="me-1" />
                            {space.hotelName}
                          </div>
                          <div className="d-flex flex-wrap align-items-center gap-2">
                            <Badge bg="info">{space.spaceType}</Badge>
                            <Badge bg="secondary">
                              Capacity {space.capacity}
                            </Badge>
                          </div>
                        </div>

                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaCalendarAlt className="me-2 text-primary" />
                            Date
                          </div>
                          <div className="hbp-summary-value">
                            {criteria.bookingDate || "—"}
                          </div>
                        </div>
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaClock className="me-2 text-primary" />
                            Time
                          </div>
                          <div className="hbp-summary-value">
                            {criteria.startTime}—{criteria.endTime} (
                            {pricing.hours}h)
                          </div>
                        </div>
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaUsers className="me-2 text-primary" />
                            Attendees
                          </div>
                          <div className="hbp-summary-value">
                            {criteria.attendees}
                          </div>
                        </div>
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">Layout</div>
                          <div className="hbp-summary-value">
                            {criteria.layout || "—"}
                          </div>
                        </div>
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">Event Type</div>
                          <div className="hbp-summary-value">{eventType}</div>
                        </div>
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">Agent</div>
                          <div className="hbp-summary-value">
                            {agentName || "—"}
                          </div>
                        </div>
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">Country</div>
                          <div className="hbp-summary-value">
                            {nationalityName || "—"}
                          </div>
                        </div>
                      </Card.Body>
                    </Card>

                    <Card className="shadow-sm rounded-3 border-0 hbp-price-card">
                      <Card.Header className="bg-light py-2">
                        <h6 className="mb-0 fw-bold">Price Details</h6>
                      </Card.Header>
                      <Card.Body className="p-3">
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">Sub Total</div>
                          <div className="hbp-summary-value">
                            {money(pricing.subTotal)}
                          </div>
                        </div>
                        {SHOW_ADDONS && (
                          <div className="hbp-summary-row">
                            <div className="hbp-summary-label">Add-ons</div>
                            <div className="hbp-summary-value">
                              {money(pricing.addonTotal)}
                            </div>
                          </div>
                        )}
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            Tax ({pricing.taxPercent}%)
                          </div>
                          <div className="hbp-summary-value">
                            {money(pricing.taxAmount)}
                          </div>
                        </div>
                        <hr className="my-2" />
                        <div className="hbp-summary-row fw-bold">
                          <div className="hbp-summary-label text-danger">
                            Total
                          </div>
                          <div className="hbp-summary-value text-danger">
                            {money(pricing.totalAmount)}
                          </div>
                        </div>
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">Amount Paid</div>
                          <div className="hbp-summary-value">
                            {money(payment.amountPaid)}
                          </div>
                        </div>
                        <div className="hbp-summary-row fw-bold">
                          <div className="hbp-summary-label text-danger">
                            Balance Due
                          </div>
                          <div className="hbp-summary-value text-danger">
                            {money(pricing.balanceDue)}
                          </div>
                        </div>
                      </Card.Body>
                    </Card>

                    {/* Quotation — under the Price Details it quotes, above
                        Review & Confirm. Not offered while editing an
                        existing booking (a quotation precedes a booking). */}
                    {!isEditMode && (
                      <QuotationPdfCard
                        buildPayload={buildMeetSpaceQuotationPayload}
                        disabled={saving}
                      />
                    )}

                    <div className="hbp-action-bar mt-3 d-flex gap-2">
                      <Button
                        variant="outline-secondary"
                        onClick={() =>
                          isEditMode ? navigate(-1) : window.close()
                        }
                        disabled={saving}
                        className="flex-grow-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        type="button"
                        onClick={handleReview}
                        disabled={saving}
                        className="flex-grow-1"
                      >
                        {isEditMode ? "Review & Update" : "Review & Confirm"}
                      </Button>
                    </div>
                  </div>
                </Col>
              </Row>

              {/* ── Order Summary Modal — shown when user clicks Review & Confirm.
                  Displays the space image and a full snapshot of every captured
                  detail. The actual booking endpoint fires from the Confirm button
                  inside the modal (handleConfirm). ── */}
              {/* Policy gate shown before the order summary. */}
              <Modal
                show={showPolicyModal}
                onHide={() => {
                  setShowPolicyModal(false);
                  setPolicyAccepted(false);
                }}
                dialogClassName="policy-modal"
                centered
                backdrop="static"
              >
                <Modal.Header closeButton className="policy-modal-header">
                  <Modal.Title className="policy-modal-title">
                    Meet &amp; Space Policies
                  </Modal.Title>
                </Modal.Header>
                <Modal.Body
                  className="policy-modal-body"
                  style={{ maxHeight: "65vh", overflowY: "auto" }}
                >
                  <section className="policy-section policy-section-last">
                    <h6 className="policy-section-title">Cancellation Policy</h6>
                    {cancellationPolicies.length > 0 ? (
                      cancellationPolicies.map((policy, idx) => (
                        <div key={idx} className="policy-item">
                          <div className="policy-text">
                            {policy.policyText}
                            {(policy.daysBeforeEvent !== null ||
                              policy.chargePercent !== null) && (
                              <div className="small text-muted mt-1">
                                {policy.daysBeforeEvent !== null &&
                                  policy.daysBeforeEvent !== undefined &&
                                  `${policy.daysBeforeEvent} day(s) before event`}
                                {policy.daysBeforeEvent !== null &&
                                  policy.daysBeforeEvent !== undefined &&
                                  policy.chargePercent !== null &&
                                  policy.chargePercent !== undefined
                                  ? " - "
                                  : ""}
                                {policy.chargePercent !== null &&
                                  policy.chargePercent !== undefined &&
                                  `${policy.chargePercent}% charge`}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="policy-empty">
                        No cancellation policy configured for this meeting space.
                      </div>
                    )}
                  </section>
                </Modal.Body>
                <Modal.Footer className="policy-modal-footer">
                  <Form.Check
                    type="checkbox"
                    id="meet-space-policy-acceptance"
                    className="me-auto policy-accept-check"
                    checked={policyAccepted}
                    onChange={(e) => setPolicyAccepted(e.target.checked)}
                    label="I have read and accept the cancellation policies"
                  />
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => {
                      setShowPolicyModal(false);
                      setPolicyAccepted(false);
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!policyAccepted || saving}
                    onClick={() => {
                      if (!policyAccepted) {
                        toast.error(
                          "Please accept the cancellation policies to continue booking."
                        );
                        return;
                      }
                      setShowPolicyModal(false);
                      setShowOrderSummary(true);
                    }}
                  >
                    Proceed
                  </Button>
                </Modal.Footer>
              </Modal>

              <Modal
                show={showOrderSummary}
                onHide={() => !saving && setShowOrderSummary(false)}
                size="xl"
                scrollable
                backdrop="static"
                centered
              >
                <Modal.Header
                  closeButton={!saving}
                  className="bg-primary text-white py-2"
                  style={{ borderBottom: "none" }}
                >
                  <Modal.Title className="fw-semibold d-flex align-items-center">
                    <FaHotel className="me-2" /> Order Summary
                    {isEditMode && (
                      <Badge bg="warning" text="dark" className="ms-2">
                        Edit
                      </Badge>
                    )}
                  </Modal.Title>
                </Modal.Header>
                <Modal.Body className="bg-light">
                  <Row className="g-3">
                    <Col md={5}>
                      {space.images?.[0]?.imageUrl ? (
                        <img
                          src={space.images[0].imageUrl}
                          alt={space.spaceName}
                          className="w-100 rounded mb-3"
                          style={{ height: 220, objectFit: "cover" }}
                          onError={(e) => (e.target.style.display = "none")}
                        />
                      ) : null}
                      <h5 className="mb-1">{space.spaceName}</h5>
                      <div className="text-muted small mb-2">
                        <FaMapMarkerAlt className="me-1" />
                        {space.hotelName}
                      </div>
                      <Badge bg="info" className="me-2">
                        {space.spaceType}
                      </Badge>
                      <Badge bg="secondary">Capacity {space.capacity}</Badge>
                      {space.description && (
                        <p className="small text-muted mt-2 mb-0">
                          {space.description}
                        </p>
                      )}
                      <hr />
                      <div className="small">
                        <div>
                          <FaCalendarAlt className="me-1" />
                          <strong>Date:</strong> {criteria.bookingDate}
                        </div>
                        <div>
                          <FaClock className="me-1" />
                          <strong>Time:</strong> {criteria.startTime} —{" "}
                          {criteria.endTime} ({pricing.hours}h)
                        </div>
                        <div>
                          <FaUsers className="me-1" />
                          <strong>Attendees:</strong> {criteria.attendees}
                        </div>
                        <div>
                          <strong>Layout:</strong> {criteria.layout || "—"}
                        </div>
                        <div>
                          <strong>Event Type:</strong> {eventType}
                        </div>
                        <div>
                          <strong>Rate Plan:</strong> {criteria.ratePlan} (
                          {criteria.rateType})
                        </div>
                        <div>
                          <strong>Unit Rate:</strong> {currency}{" "}
                          {Number(criteria.unitRate).toFixed(2)}
                        </div>
                        <div>
                          <strong>Agent:</strong> {agentName || "—"}
                        </div>
                        <div>
                          <strong>Nationality / Country:</strong>{" "}
                          {nationalityName || "—"}
                        </div>
                      </div>
                    </Col>
                    <Col md={7}>
                      <Card className="mb-2">
                        <Card.Header className="py-2">
                          <strong>Customer</strong>
                        </Card.Header>
                        <Card.Body className="small">
                          <div>
                            <strong>Name:</strong> {customer.salutation}{" "}
                            {customer.firstName} {customer.lastName}
                          </div>
                          <div>
                            <strong>Mobile:</strong> {customer.mobile}{" "}
                            {customer.alternateMobile
                              ? `· Alt: ${customer.alternateMobile}`
                              : ""}
                          </div>
                          <div>
                            <strong>Email:</strong> {customer.email || "—"}
                          </div>
                          <div>
                            <strong>Company:</strong>{" "}
                            {customer.companyName || "—"}{" "}
                            {customer.designation
                              ? `(${customer.designation})`
                              : ""}
                          </div>
                          <div>
                            <strong>GSTIN:</strong> {customer.gstNumber || "—"}
                          </div>
                          <div>
                            <strong>Address:</strong> {customer.address || "—"},{" "}
                            {customer.cityName} {customer.stateName}{" "}
                            {nationalityName} {customer.pincode}
                          </div>
                          <div>
                            <strong>ID:</strong> {customer.idType}{" "}
                            {customer.idNumber || "—"}
                          </div>
                          {customer.remarks && (
                            <div>
                              <strong>Remarks:</strong> {customer.remarks}
                            </div>
                          )}
                        </Card.Body>
                      </Card>

                      <Card className="mb-2">
                        <Card.Header className="py-2">
                          <strong>Requested Amenities</strong>
                        </Card.Header>
                        <Card.Body className="small">
                          {(() => {
                            const picked = [
                              ...spaceAmenities
                                .filter((a) => a.isSelected)
                                .map((a) => a.name),
                              ...customAmenities
                                .filter((n) => n && n.trim())
                                .map((n) => n.trim()),
                            ];
                            return picked.length ? picked.join(", ") : "—";
                          })()}
                          {additionalRequirements && (
                            <div className="mt-2">
                              <strong>Notes:</strong> {additionalRequirements}
                            </div>
                          )}
                        </Card.Body>
                      </Card>

                      {SHOW_ADDONS && (
                        <Card className="mb-2">
                          <Card.Header className="py-2">
                            <strong>Add-ons</strong>
                          </Card.Header>
                          <Card.Body className="small">
                            {addons.filter(
                              (a) => a.addonName && a.addonName.trim()
                            ).length === 0 ? (
                              <em className="text-muted">No add-ons.</em>
                            ) : (
                              <Table size="sm" bordered className="mb-0">
                                <thead>
                                  <tr>
                                    <th>Item</th>
                                    <th>Qty</th>
                                    <th>Unit</th>
                                    <th>Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {addons
                                    .filter(
                                      (a) => a.addonName && a.addonName.trim()
                                    )
                                    .map((a, i) => (
                                      <tr key={i}>
                                        <td>{a.addonName}</td>
                                        <td>{a.quantity}</td>
                                        <td>
                                          {Number(a.unitPrice || 0).toFixed(2)}
                                        </td>
                                        <td>
                                          {Number(a.totalPrice || 0).toFixed(2)}
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </Table>
                            )}
                          </Card.Body>
                        </Card>
                      )}

                      <Card className="mb-2">
                        <Card.Header className="py-2">
                          <strong>Payment</strong>
                        </Card.Header>
                        <Card.Body className="small">
                          <div>
                            <strong>Mode:</strong> {payment.paymentMode}
                          </div>
                          <div>
                            <strong>Status:</strong> {payment.paymentStatus}
                          </div>
                          <div>
                            <strong>Amount Paid:</strong> {currency}{" "}
                            {Number(payment.amountPaid || 0).toFixed(2)}
                          </div>
                          <div>
                            <strong>Transaction Ref:</strong>{" "}
                            {payment.transactionReference || "—"}
                          </div>
                          {payment.notes && (
                            <div>
                              <strong>Notes:</strong> {payment.notes}
                            </div>
                          )}
                        </Card.Body>
                      </Card>

                      <Card border="primary">
                        <Card.Header className="py-2 bg-light">
                          <strong>Price Summary</strong>
                        </Card.Header>
                        <Card.Body className="py-2">
                          <Table size="sm" borderless className="mb-0">
                            <tbody>
                              <tr>
                                <td>Sub Total</td>
                                <td className="text-end">
                                  {pricing.subTotal.toFixed(2)}
                                </td>
                              </tr>
                              {SHOW_ADDONS && (
                                <tr>
                                  <td>Add-ons</td>
                                  <td className="text-end">
                                    {pricing.addonTotal.toFixed(2)}
                                  </td>
                                </tr>
                              )}
                              <tr>
                                <td>Tax ({pricing.taxPercent}%)</td>
                                <td className="text-end">
                                  {pricing.taxAmount.toFixed(2)}
                                </td>
                              </tr>
                              <tr className="fw-bold border-top">
                                <td>Total</td>
                                <td className="text-end text-primary">
                                  {currency} {pricing.totalAmount.toFixed(2)}
                                </td>
                              </tr>
                              <tr className="text-danger fw-bold">
                                <td>Balance Due</td>
                                <td className="text-end">
                                  {pricing.balanceDue.toFixed(2)}
                                </td>
                              </tr>
                            </tbody>
                          </Table>
                        </Card.Body>
                      </Card>
                    </Col>
                  </Row>
                </Modal.Body>
                <Modal.Footer className="bg-light border-0 d-flex justify-content-between">
                  <Button
                    variant="outline-secondary"
                    onClick={() => setShowOrderSummary(false)}
                    disabled={saving}
                  >
                    Back to edit
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleConfirm}
                    disabled={saving}
                    className="px-4 fw-semibold"
                  >
                    {saving ? (
                      <>
                        <Spinner size="sm" animation="border" className="me-2" />
                        {isEditMode ? "Updating..." : "Confirming..."}
                      </>
                    ) : (
                      <>
                        <FaCheckCircle className="me-1" />
                        {isEditMode ? "Update Booking" : "Confirm Booking"} —{" "}
                        {currency} {pricing.totalAmount.toFixed(2)}
                      </>
                    )}
                  </Button>
                </Modal.Footer>
              </Modal>
            </Form>
          </Container>
        </main>
      </div>
    </div>
  );
}
