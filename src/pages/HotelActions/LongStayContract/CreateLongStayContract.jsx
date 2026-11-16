import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Card,
  Button,
  Form,
  Row,
  Col,
  Spinner,
  Table,
} from "react-bootstrap";
import { FaArrowLeft } from "react-icons/fa";
import axiosInstance from "../../../components/AxiosInstance";
import HotelTitleBadge from "../../../components/HotelTitleBadge";
import { toast } from "react-hot-toast";
import Sidebar from "../../../components/Sidebar";
import Topbar from "../../../components/TopBar";

// Refundable / Non Refundable is chosen per room category. The choice is kept
// on its own (refundableByCategory), so the radios work before any rate is
// typed; without a choice it follows the category's rate rows.
const isCategoryRefundable = (data, roomCategoryId) => {
  const key = String(roomCategoryId);
  const chosen = data.refundableByCategory?.[key];
  if (chosen !== undefined) return chosen;
  return (data.rooms || []).some(
    (r) => r.hotelRoomCategoryId === key && r.refundable
  );
};

export default function CreateLongStayContract() {
  const navigate = useNavigate();
  const { id } = useParams(); // hotel id

  const [formData, setFormData] = useState({
    rateCode: "",
    // Cost type drives how the "extra days" remainder (n % 30) is
    // billed when a long-stay booking isn't an exact multiple of 30.
    //   DAY_WISE → every extra day × Day Rate
    //   WEEKLY   → full 7-day blocks at Weekly Rate, sub-week at Day Rate
    //   PRO_RATE → every extra day × (Monthly Rate / 30) — the "fair
    //              share" model where extras inherit the monthly per-day price
    additionalCostType: "DAY_WISE", // DAY_WISE | WEEKLY | PRO_RATE
    validityFrom: "",
    validityTo: "",
    isLive: false,
    maxBookingDays: "", // empty = no cap
    // Free-text Terms & Conditions — one bullet per array item.
    termsAndConditions: [],
    // Structured Cancellation Policy — modelled on
    // /hotel-actions/1/hotel-policy/create. Each row is
    // { chargeType, value, condition }.
    //   chargeType ∈ "PERCENT" | "AMOUNT" | "FULL_STAY" | "NIGHTS"
    //   value      ∈ number (10, 25, 100, …)
    //   condition  ∈ free text ("cancelled within 30 days", "no-show")
    cancellationPolicy: [],
    // Optional free-text catch-all for any cancellation policies
    // that don't fit the structured table — rendered below the
    // table on the booking page.
    cancellationPolicyNotes: "",
    rooms: [],
    // Refundable choice per room category id (see isCategoryRefundable).
    // Form state only: each rate row carries it to the save payload.
    refundableByCategory: {},
  });

  const [hotelRooms, setHotelRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const fetchRooms = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const res = await axiosInstance.get(
          `/api/hotelRoomDetailsController/${id}`
        );
        const mapped = (res.data || []).map((room) => {
          const seenOcc = new Set();
          const uniqueOcc = (room.occupancyDetailsDTOs || []).filter((o) => {
            if (seenOcc.has(o.id)) return false;
            seenOcc.add(o.id);
            return true;
          });
          return {
            hotelRoomcategoryId: room.rommCategoryId || room.hotelRoomcategoryId,
            roomCategory: room.roomCategory,
            occupancyDetailsDTOs: uniqueOcc,
            roomTypeDetailsDTOs: room.roomTypeDetailsDTOs || [],
          };
        });
        setHotelRooms(mapped);
      } catch {
        toast.error("Failed to load hotel rooms");
      } finally {
        setLoading(false);
      }
    };
    fetchRooms();
  }, [id]);

  const setRateField = (
    roomCategoryId,
    occupancyId,
    roomTypeId,
    roomTypeName,
    field,
    value
  ) => {
    setFormData((prev) => {
      const updated = [...prev.rooms];
      const idx = updated.findIndex(
        (r) =>
          r.hotelRoomCategoryId === String(roomCategoryId) &&
          r.occupancyTypeId === String(occupancyId) &&
          r.hotelRoomTypeId === String(roomTypeId)
      );
      if (idx !== -1) {
        updated[idx][field] = Number(value);
        if (field === "adultRate" || field === "childRate") {
          updated[idx].extraBed = Number(value) > 0;
        }
      } else {
        updated.push({
          hotelRoomCategoryId: String(roomCategoryId),
          hotelRoomTypeId: String(roomTypeId),
          occupancyTypeId: String(occupancyId),
          mealType: roomTypeName,
          hotelMealId: roomTypeName.toLowerCase().includes("breakfast") ? 1 : 0,
          monthlyRate: field === "monthlyRate" ? Number(value) : 0,
          dayRate: field === "dayRate" ? Number(value) : 0,
          weeklyRate: field === "weeklyRate" ? Number(value) : 0,
          // Yearly rate (12-month / 365-day slab). Optional. Surfaces
          // on the rate grid so operators can offer a discounted annual
          // bundle that overrides 12× monthly when the booking matches.
          year1Rate: field === "year1Rate" ? Number(value) : 0,
          adultRate: field === "adultRate" ? Number(value) : 0,
          childRate: field === "childRate" ? Number(value) : 0,
          meal: roomTypeName.toLowerCase().includes("breakfast"),
          extraBed:
            field === "adultRate" || field === "childRate"
              ? Number(value) > 0
              : false,
          // A rate typed after choosing Refundable is refundable too.
          refundable: isCategoryRefundable(prev, roomCategoryId),
        });
      }
      return { ...prev, rooms: updated };
    });
  };

  const setRefundableForCategory = (roomCategoryId, refundable) => {
    setFormData((prev) => {
      const updated = prev.rooms.map((r) =>
        r.hotelRoomCategoryId === String(roomCategoryId)
          ? { ...r, refundable }
          : r
      );
      return {
        ...prev,
        rooms: updated,
        // Remember the choice even when the category has no rate rows yet,
        // so the radio switches straight away.
        refundableByCategory: {
          ...(prev.refundableByCategory || {}),
          [String(roomCategoryId)]: refundable,
        },
      };
    });
  };

  const validate = () => {
    const e = {};
    if (!formData.rateCode.trim()) e.rateCode = "Rate code is required";
    if (!formData.additionalCostType)
      e.additionalCostType = "Select cost type";
    if (!formData.validityFrom) e.validityFrom = "Validity From is required";
    if (!formData.validityTo) e.validityTo = "Validity To is required";
    if (
      formData.validityFrom &&
      formData.validityTo &&
      new Date(formData.validityFrom) > new Date(formData.validityTo)
    ) {
      e.validityTo = "Validity To must be after Validity From";
    }
    if (formData.rooms.length === 0) {
      e.rooms = "Please enter at least one rate";
    } else {
      const hasAny = formData.rooms.some(
        (r) =>
          r.monthlyRate > 0 ||
          r.dayRate > 0 ||
          r.weeklyRate > 0 ||
          r.year1Rate > 0
      );
      if (!hasAny)
        e.rooms = "Enter at least one Monthly / Day / Weekly / Yearly rate";
      // Day Rate is mandatory for DAY_WISE + WEEKLY (sub-week residual
      // also uses it). PRO_RATE doesn't read Day Rate at all — extras
      // are billed off the Monthly Rate — so we don't enforce it there.
      if (formData.additionalCostType !== "PRO_RATE") {
        const missingDayRate = formData.rooms.some(
          (r) => r.monthlyRate > 0 && (!r.dayRate || r.dayRate <= 0)
        );
        if (missingDayRate) {
          e.rooms =
            "Day Rate is required wherever a Monthly Rate is set (it is also used for sub-week remainders in WEEKLY mode)";
        }
      }
      if (formData.additionalCostType === "WEEKLY") {
        const missingWeekly = formData.rooms.some(
          (r) => r.monthlyRate > 0 && (!r.weeklyRate || r.weeklyRate <= 0)
        );
        if (missingWeekly) {
          e.rooms = "WEEKLY mode requires a Weekly Rate for every priced row";
        }
      }
      if (formData.additionalCostType === "PRO_RATE") {
        // PRO_RATE divides the Monthly Rate by 30, so every priced
        // row MUST have a Monthly Rate. Without it the per-day
        // fraction is 0 and the booking would be free.
        const missingMonthly = formData.rooms.some(
          (r) =>
            (r.dayRate > 0 || r.weeklyRate > 0 || r.year1Rate > 0) &&
            (!r.monthlyRate || r.monthlyRate <= 0)
        );
        if (missingMonthly) {
          e.rooms =
            "PRO_RATE mode requires a Monthly Rate for every priced row (extras are billed as Monthly Rate ÷ 30 × extra days).";
        }
      }
    }
    if (
      formData.maxBookingDays !== "" &&
      formData.maxBookingDays !== null &&
      Number(formData.maxBookingDays) <= 0
    ) {
      e.maxBookingDays = "Must be a positive number (or leave empty for no cap)";
    }
    return e;
  };

  const submit = async () => {
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const payload = {
        rateCode: formData.rateCode.trim(),
        hotelId: Number(id),
        additionalCostType: formData.additionalCostType,
        validityFrom: formData.validityFrom,
        validityTo: formData.validityTo,
        isLive: Boolean(formData.isLive),
        maxBookingDays:
          formData.maxBookingDays === "" || formData.maxBookingDays === null
            ? null
            : Number(formData.maxBookingDays),
        // Long-stay free-text fields are stored in VARCHAR(500)
        // columns at the DB level — the backend returns
        // "A field value is too long (max 500 characters allowed)"
        // if any one exceeds that. Truncate as a belt-and-braces in
        // case the textarea maxLength below was bypassed (paste, etc).
        termsAndConditions: (formData.termsAndConditions || [])
          .map((t) => (t || "").trim().slice(0, 500))
          .filter((t) => t.length > 0),
        // Structured rows: { chargeType, value, condition }. The
        // backend's sanitizeCancellationPolicy filters out rows that
        // are completely blank.
        cancellationPolicy: (formData.cancellationPolicy || []).map((c) => ({
          chargeType: c.chargeType || "PERCENT",
          value: c.value === "" || c.value === null ? null : Number(c.value),
          condition: (c.condition || "").trim().slice(0, 500),
        })),
        cancellationPolicyNotes:
          (formData.cancellationPolicyNotes || "").trim().slice(0, 500) || null,
        rooms: formData.rooms.map((r) => ({
          hotelRoomCategoryId: Number(r.hotelRoomCategoryId),
          hotelRoomTypeId: Number(r.hotelRoomTypeId),
          occupancyTypeId: Number(r.occupancyTypeId),
          hotelMealId: Number(r.hotelMealId || 0),
          monthlyRate: Number(r.monthlyRate || 0),
          dayRate: Number(r.dayRate || 0),
          weeklyRate: Number(r.weeklyRate || 0),
          // Yearly slab — sent on every payload; backend ignores when 0.
          year1Rate: Number(r.year1Rate || 0),
          adultRate: Number(r.adultRate || 0),
          childRate: Number(r.childRate || 0),
          meal: Boolean(r.meal),
          extraBed: Boolean(r.extraBed),
          refundable: Boolean(r.refundable),
        })),
      };
      const res = await axiosInstance.post(
        "/api/longStayContract/save",
        payload
      );
      if (res.status === 200 || res.status === 201) {
        toast.success("Long Stay Contract saved");
        navigate(`/hotel-actions/${id}/long-stay-contract`);
      }
    } catch (err) {
      toast.error(
        `Save failed: ${err.response?.data?.message || err.message}`
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isWeekly = formData.additionalCostType === "WEEKLY";

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-3" style={{ minWidth: 0, overflowX: "hidden" }}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <Button variant="outline-secondary" onClick={() => navigate(-1)}>
              <FaArrowLeft className="me-2" />
              Back
            </Button>
            <h4 className="m-0 d-flex align-items-center gap-2">
              Create Long Stay 
              <HotelTitleBadge hotelId={id} />
            </h4>
            <span />
          </div>

          <Card className="p-4">
            {loading ? (
              <div className="text-center py-5">
                <Spinner animation="border" variant="primary" />
              </div>
            ) : (
              <>
                <Row className="mb-3">
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label>Rate Code *</Form.Label>
                      <Form.Control
                        value={formData.rateCode}
                        isInvalid={!!errors.rateCode}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            rateCode: e.target.value,
                          })
                        }
                      />
                      {errors.rateCode && (
                        <Form.Control.Feedback type="invalid">
                          {errors.rateCode}
                        </Form.Control.Feedback>
                      )}
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label>Validity From *</Form.Label>
                      <Form.Control
                        type="date"
                        value={formData.validityFrom}
                        isInvalid={!!errors.validityFrom}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            validityFrom: e.target.value,
                          })
                        }
                      />
                      {errors.validityFrom && (
                        <Form.Control.Feedback type="invalid">
                          {errors.validityFrom}
                        </Form.Control.Feedback>
                      )}
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label>Validity To *</Form.Label>
                      <Form.Control
                        type="date"
                        value={formData.validityTo}
                        isInvalid={!!errors.validityTo}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            validityTo: e.target.value,
                          })
                        }
                      />
                      {errors.validityTo && (
                        <Form.Control.Feedback type="invalid">
                          {errors.validityTo}
                        </Form.Control.Feedback>
                      )}
                    </Form.Group>
                  </Col>
                  {/* Activate-immediately switch removed — the list
                      page shows / toggles Active/Inactive via the
                      clickable status badge, so duplicating it here
                      was confusing. formData.isLive still ships in
                      the payload (default true on create) so the
                      row lands Active. */}
                </Row>

                <Row className="mb-3">
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label>Max Booking Days</Form.Label>
                      <Form.Control
                        type="number"
                        min="1"
                        placeholder="No cap"
                        value={formData.maxBookingDays}
                        isInvalid={!!errors.maxBookingDays}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            maxBookingDays: e.target.value,
                          })
                        }
                      />
                      <Form.Text className="text-muted">
                        Agent bookings cannot exceed this many total nights.
                        Leave blank for no limit.
                      </Form.Text>
                      {errors.maxBookingDays && (
                        <Form.Control.Feedback type="invalid">
                          {errors.maxBookingDays}
                        </Form.Control.Feedback>
                      )}
                    </Form.Group>
                  </Col>
                </Row>

                <Row className="mb-4">
                  <Col md={12}>
                    <Card className="p-3 bg-light border-0">
                      <h6 className="fw-bold text-primary mb-3">
                        Additional Cost Type *
                      </h6>
                      <div className="d-flex gap-4 flex-wrap">
                        <Form.Check
                          type="radio"
                          id="costType_dayWise"
                          name="additionalCostType"
                          label="Day-wise"
                          value="DAY_WISE"
                          checked={formData.additionalCostType === "DAY_WISE"}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              additionalCostType: e.target.value,
                            })
                          }
                        />
                        <Form.Check
                          type="radio"
                          id="costType_weekly"
                          name="additionalCostType"
                          label="Weekly"
                          value="WEEKLY"
                          checked={formData.additionalCostType === "WEEKLY"}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              additionalCostType: e.target.value,
                            })
                          }
                        />
                        <Form.Check
                          type="radio"
                          id="costType_proRate"
                          name="additionalCostType"
                          label="Pro-rate"
                          value="PRO_RATE"
                          checked={formData.additionalCostType === "PRO_RATE"}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              additionalCostType: e.target.value,
                            })
                          }
                        />
                      </div>
                      {errors.additionalCostType && (
                        <div className="invalid-feedback d-block">
                          {errors.additionalCostType}
                        </div>
                      )}
                    </Card>
                  </Col>
                </Row>

                {errors.rooms && (
                  <div className="alert alert-danger">{errors.rooms}</div>
                )}

                {hotelRooms.map((room) => (
                  <div key={room.hotelRoomcategoryId} className="mb-4">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <h6 className="fw-bold mb-0">{room.roomCategory}</h6>
                      {(() => {
                        // Refundable / Non Refundable as a radio pair (was a
                        // single "Is Refundable" checkbox): the category's
                        // own choice, else what its rate rows carry.
                        const isCatRefundable = isCategoryRefundable(
                          formData,
                          room.hotelRoomcategoryId
                        );
                        return (
                          <div className="d-flex align-items-center gap-3">
                            <Form.Check
                              type="radio"
                              inline
                              id={`refundable-yes-${room.hotelRoomcategoryId}`}
                              name={`refundable-${room.hotelRoomcategoryId}`}
                              label="Refundable"
                              checked={isCatRefundable}
                              onChange={() =>
                                setRefundableForCategory(
                                  room.hotelRoomcategoryId,
                                  true
                                )
                              }
                            />
                            <Form.Check
                              type="radio"
                              inline
                              id={`refundable-no-${room.hotelRoomcategoryId}`}
                              name={`refundable-${room.hotelRoomcategoryId}`}
                              label="Non Refundable"
                              checked={!isCatRefundable}
                              onChange={() =>
                                setRefundableForCategory(
                                  room.hotelRoomcategoryId,
                                  false
                                )
                              }
                            />
                          </div>
                        );
                      })()}
                    </div>
                    <Table bordered hover responsive size="sm">
                      <thead className="table-light">
                        <tr>
                          <th>Occupancy</th>
                          <th>Room Type / Meal</th>
                          <th>Monthly Rate</th>
                          <th>Day Rate</th>
                          {/* Weekly column only renders when the cost
                              type is WEEKLY (kept consistent with the
                              previous behaviour). */}
                          {isWeekly && <th>Weekly Rate</th>}
                          {/* Yearly column always renders — it's an
                              optional discounted 12-month slab and
                              applies regardless of additional-cost-type
                              when the booking length matches. */}
                          <th>Yearly Rate</th>
                          <th>Extra Adult</th>
                          <th>Extra Child</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(room.occupancyDetailsDTOs || []).length > 0 &&
                        (room.roomTypeDetailsDTOs || []).length > 0 ? (
                          room.occupancyDetailsDTOs.map((occ) =>
                            room.roomTypeDetailsDTOs.map((rt) => (
                              <tr key={`${occ.id}-${rt.roomTypeId}`}>
                                <td>{occ.occupanyType}</td>
                                <td>{rt.roomTypeName}</td>
                                {(isWeekly
                                  ? [
                                      "monthlyRate",
                                      "dayRate",
                                      "weeklyRate",
                                      "year1Rate",
                                      "adultRate",
                                      "childRate",
                                    ]
                                  : [
                                      "monthlyRate",
                                      "dayRate",
                                      "year1Rate",
                                      "adultRate",
                                      "childRate",
                                    ]
                                ).map((field) => (
                                  <td key={field}>
                                    <Form.Control
                                      type="number"
                                      min="0"
                                      value={
                                        formData.rooms.find(
                                          (r) =>
                                            r.hotelRoomCategoryId ===
                                              String(
                                                room.hotelRoomcategoryId
                                              ) &&
                                            r.occupancyTypeId ===
                                              String(occ.id) &&
                                            r.hotelRoomTypeId ===
                                              String(rt.roomTypeId)
                                        )?.[field] || ""
                                      }
                                      onChange={(e) =>
                                        setRateField(
                                          room.hotelRoomcategoryId,
                                          occ.id,
                                          rt.roomTypeId,
                                          rt.roomTypeName,
                                          field,
                                          e.target.value
                                        )
                                      }
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))
                          )
                        ) : (
                          <tr>
                            <td
                              // Headers: Occupancy + Room + Monthly + Day
                              // (+ Weekly when WEEKLY) + Yearly + ExAdult
                              // + ExChild → 7 or 8 cells.
                              colSpan={isWeekly ? 8 : 7}
                              className="text-center text-muted py-3"
                            >
                              No room types or occupancy details available
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </div>
                ))}

                {/*
                  Cancellation Policy — structured table modelled on
                  /hotel-actions/1/hotel-policy/create:
                    Charge Type | Value | Condition
                  Plus a free-text "Additional cancellation policies"
                  textarea for anything that doesn't fit the grid.
                */}
                <Card className="p-3 bg-light border-0 mt-4">
                  <h6 className="fw-bold text-primary mb-3">
                    Cancellation Policy
                  </h6>
                  <Table bordered hover responsive size="sm" className="mb-2 align-middle">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: 160 }}>Charge Type</th>
                        <th style={{ width: 140 }}>Value</th>
                        <th>Condition</th>
                        <th style={{ width: 60 }}>&nbsp;</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(formData.cancellationPolicy || []).length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="text-center text-muted py-3"
                          >
                            No cancellation rules added yet — click +
                            below to add one.
                          </td>
                        </tr>
                      )}
                      {(formData.cancellationPolicy || []).map((row, index) => (
                        <tr key={`canc-${index}`}>
                          <td>
                            <Form.Select
                              size="sm"
                              value={row.chargeType || "PERCENT"}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  cancellationPolicy: formData.cancellationPolicy.map(
                                    (r, i) =>
                                      i === index
                                        ? { ...r, chargeType: e.target.value }
                                        : r
                                  ),
                                })
                              }
                            >
                              <option value="PERCENT">%</option>
                              <option value="AMOUNT">Amount (AED)</option>
                              <option value="FULL_STAY">Full Stay</option>
                              <option value="NIGHTS">Nights</option>
                            </Form.Select>
                          </td>
                          <td>
                            <Form.Control
                              size="sm"
                              type="number"
                              min={0}
                              placeholder="e.g. 10"
                              value={row.value ?? ""}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  cancellationPolicy: formData.cancellationPolicy.map(
                                    (r, i) =>
                                      i === index
                                        ? { ...r, value: e.target.value }
                                        : r
                                  ),
                                })
                              }
                            />
                          </td>
                          <td>
                            <Form.Control
                              size="sm"
                              type="text"
                              maxLength={500}
                              placeholder="e.g. cancelled within 30 days"
                              value={row.condition || ""}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  cancellationPolicy: formData.cancellationPolicy.map(
                                    (r, i) =>
                                      i === index
                                        ? { ...r, condition: e.target.value }
                                        : r
                                  ),
                                })
                              }
                            />
                          </td>
                          <td className="text-center">
                            <Button
                              variant="outline-danger"
                              size="sm"
                              onClick={() =>
                                setFormData({
                                  ...formData,
                                  cancellationPolicy: formData.cancellationPolicy.filter(
                                    (_, i) => i !== index
                                  ),
                                })
                              }
                            >
                              ✕
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        cancellationPolicy: [
                          ...(formData.cancellationPolicy || []),
                          { chargeType: "PERCENT", value: "", condition: "" },
                        ],
                      })
                    }
                  >
                    + Add Row
                  </Button>

                  <Form.Group className="mt-3">
                    <Form.Label className="small fw-semibold">
                      Additional Cancellation Policies (optional)
                    </Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      maxLength={500}
                      placeholder="Any policies that don't fit the table above…"
                      value={formData.cancellationPolicyNotes}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          cancellationPolicyNotes: e.target.value,
                        })
                      }
                    />
                  </Form.Group>
                </Card>

                <Card className="p-3 bg-light border-0 mt-3">
                  <h6 className="fw-bold text-primary mb-3">
                    Terms &amp; Conditions
                  </h6>
                  {(formData.termsAndConditions || []).length === 0 && (
                    <p className="text-muted small mb-2">
                      No terms &amp; conditions added yet.
                    </p>
                  )}
                  {(formData.termsAndConditions || []).map((term, index) => (
                    <Card key={`term-${index}`} className="mb-2">
                      <Card.Header className="d-flex justify-content-between align-items-center py-2">
                        <span className="fw-semibold small">Term {index + 1}</span>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              termsAndConditions: formData.termsAndConditions.filter(
                                (_, i) => i !== index
                              ),
                            })
                          }
                        >
                          Remove
                        </Button>
                      </Card.Header>
                      <Card.Body className="py-2">
                        <Form.Control
                          as="textarea"
                          rows={2}
                          maxLength={500}
                          placeholder="e.g. A refundable security deposit is collected at check-in"
                          value={term}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              termsAndConditions: formData.termsAndConditions.map(
                                (t, i) => (i === index ? e.target.value : t)
                              ),
                            })
                          }
                        />
                      </Card.Body>
                    </Card>
                  ))}
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        termsAndConditions: [
                          ...(formData.termsAndConditions || []),
                          "",
                        ],
                      })
                    }
                  >
                    + Add Term &amp; Condition
                  </Button>
                </Card>

                <div className="d-flex justify-content-between mt-4">
                  <Button
                    variant="outline-danger"
                    onClick={() => navigate(-1)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="success"
                    onClick={submit}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <Spinner size="sm" animation="border" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              </>
            )}
          </Card>
        </main>
      </div>
    </div>
  );
}
