import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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

/**
 * AutoGrowTextarea — drop-in replacement for `<Form.Control as="textarea">`
 * that resizes itself to fit its current value. Long Terms &
 * Conditions and Additional Cancellation Policies entries used to
 * sit behind a 2-row scrollbar in `?mode=view` (and during edit too);
 * this lets the box auto-grow so the full text is always visible.
 *
 * Defined at module level (not inside EditLongStayContract) so it
 * keeps a stable component identity across the parent's re-renders
 * — that's what lets `useRef` / `useEffect` track the same DOM node
 * over time instead of remounting on every keystroke.
 */
const AutoGrowTextarea = ({ value, style, ...rest }) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <Form.Control
      as="textarea"
      ref={ref}
      value={value}
      {...rest}
      // overflow:hidden + resize:none keeps the scrollbar from
      // appearing once we've sized the box to its content.
      style={{ overflow: "hidden", resize: "none", ...(style || {}) }}
    />
  );
};

// Refundable / Non Refundable is chosen per room category. The choice is kept
// on its own (refundableByCategory), so the radios work for a category with
// no rate rows yet; without a choice it follows the category's rate rows
// (what was saved).
const isCategoryRefundable = (data, roomCategoryId) => {
  const key = String(roomCategoryId);
  const chosen = data.refundableByCategory?.[key];
  if (chosen !== undefined) return chosen;
  return (data.rooms || []).some(
    (r) => r.hotelRoomCategoryId === key && r.refundable
  );
};

export default function EditLongStayContract() {
  const navigate = useNavigate();
  const { id, contractId } = useParams(); // hotel id, long stay contract id

  // View mode — `?mode=view` makes the form read-only. Mirrors the
  // /occupancy-and-minimumlength view pattern.
  const [searchParams] = useSearchParams();
  const isViewMode = searchParams.get("mode") === "view";

  const [formData, setFormData] = useState({
    rateCode: "",
    additionalCostType: "DAY_WISE",
    validityFrom: "",
    validityTo: "",
    isLive: false,
    maxBookingDays: "",
    // Free-text Terms & Conditions — see CreateLongStayContract.
    termsAndConditions: [],
    // Structured cancellation policy rows + free-text notes — see
    // CreateLongStayContract for the data shape.
    cancellationPolicy: [],
    cancellationPolicyNotes: "",
    rooms: [],
  });

  const [hotelRooms, setHotelRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [roomsRes, contractRes] = await Promise.all([
          axiosInstance.get(`/api/hotelRoomDetailsController/${id}`),
          axiosInstance.get(`/api/longStayContract/${contractId}`),
        ]);

        const mappedRooms = (roomsRes.data || []).map((r) => {
          const seen = new Set();
          const uniq = (r.occupancyDetailsDTOs || []).filter((o) => {
            if (seen.has(o.id)) return false;
            seen.add(o.id);
            return true;
          });
          return {
            hotelRoomcategoryId: r.rommCategoryId || r.hotelRoomcategoryId,
            roomCategory: r.roomCategory,
            occupancyDetailsDTOs: uniq,
            roomTypeDetailsDTOs: r.roomTypeDetailsDTOs || [],
          };
        });
        setHotelRooms(mappedRooms);

        const data = contractRes.data;
        const rooms = (data.rooms || []).map((room) => ({
          longStayRoomId: room.longStayRoomId,
          hotelRoomCategoryId: String(room.hotelRoomCategoryId),
          hotelRoomTypeId: String(room.hotelRoomTypeId),
          occupancyTypeId: String(room.occupancyTypeId),
          hotelMealId: room.hotelMealId || 0,
          monthlyRate: room.monthlyRate || 0,
          dayRate: room.dayRate || 0,
          weeklyRate: room.weeklyRate || 0,
          year1Rate: room.year1Rate || 0,
          adultRate: room.adultRate || 0,
          childRate: room.childRate || 0,
          meal: Boolean(room.meal),
          extraBed: Boolean(room.extraBed),
          refundable: Boolean(room.refundable),
        }));

        setFormData({
          rateCode: data.rateCode || "",
          additionalCostType: data.additionalCostType || "DAY_WISE",
          validityFrom: data.validityFrom || "",
          validityTo: data.validityTo || "",
          isLive: Boolean(data.isLive),
          maxBookingDays:
            data.maxBookingDays === null || data.maxBookingDays === undefined
              ? ""
              : String(data.maxBookingDays),
          termsAndConditions: Array.isArray(data.termsAndConditions)
            ? data.termsAndConditions
            : [],
          // cancellationPolicy comes back as an array of
          // { chargeType, value, condition } objects. Coerce value
          // to string for the input field so React doesn't warn
          // about controlled-component number/string mismatches.
          cancellationPolicy: Array.isArray(data.cancellationPolicy)
            ? data.cancellationPolicy.map((c) => ({
                chargeType: c.chargeType || "PERCENT",
                value: c.value == null ? "" : String(c.value),
                condition: c.condition || "",
              }))
            : [],
          cancellationPolicyNotes: data.cancellationPolicyNotes || "",
          rooms,
        });
      } catch {
        toast.error("Failed to load contract");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, contractId]);

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
          // Yearly slab (12-month). Optional override of 12× monthly.
          year1Rate: field === "year1Rate" ? Number(value) : 0,
          adultRate: field === "adultRate" ? Number(value) : 0,
          childRate: field === "childRate" ? Number(value) : 0,
          meal: roomTypeName.toLowerCase().includes("breakfast"),
          extraBed:
            field === "adultRate" || field === "childRate"
              ? Number(value) > 0
              : false,
          // A rate typed for a refundable category is refundable too.
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
        longStayContractId: Number(contractId),
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
        // Long-stay free-text fields land in VARCHAR(500) columns
        // — the backend returns "A field value is too long (max 500
        // characters allowed)" if any one exceeds. Truncate here as
        // a safety net; the textareas / inputs below also set
        // maxLength={500} so paste bombs get clamped at the source.
        termsAndConditions: (formData.termsAndConditions || [])
          .map((t) => (t || "").trim().slice(0, 500))
          .filter((t) => t.length > 0),
        cancellationPolicy: (formData.cancellationPolicy || []).map((c) => ({
          chargeType: c.chargeType || "PERCENT",
          value: c.value === "" || c.value === null ? null : Number(c.value),
          condition: (c.condition || "").trim().slice(0, 500),
        })),
        cancellationPolicyNotes:
          (formData.cancellationPolicyNotes || "").trim().slice(0, 500) || null,
        rooms: formData.rooms.map((r) => ({
          // Preserve longStayRoomId for existing rows so the backend updates them
          // in place instead of treating them as removed-and-recreated. Omitted for
          // brand-new rows that don't have a server-assigned id yet.
          ...(r.longStayRoomId != null
            ? { longStayRoomId: Number(r.longStayRoomId) }
            : {}),
          hotelRoomCategoryId: Number(r.hotelRoomCategoryId),
          hotelRoomTypeId: Number(r.hotelRoomTypeId),
          occupancyTypeId: Number(r.occupancyTypeId),
          hotelMealId: Number(r.hotelMealId || 0),
          monthlyRate: Number(r.monthlyRate || 0),
          dayRate: Number(r.dayRate || 0),
          weeklyRate: Number(r.weeklyRate || 0),
          year1Rate: Number(r.year1Rate || 0),
          adultRate: Number(r.adultRate || 0),
          childRate: Number(r.childRate || 0),
          meal: Boolean(r.meal),
          extraBed: Boolean(r.extraBed),
          refundable: Boolean(r.refundable),
        })),
      };
      await axiosInstance.put(
        `/api/longStayContract/${contractId}`,
        payload
      );
      toast.success("Long Stay Contract updated");
      navigate(`/hotel-actions/${id}/long-stay-contract`);
    } catch (err) {
      toast.error(
        `Update failed: ${err.response?.data?.message || err.message}`
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
              {isViewMode ? "View" : "Edit"} Long Stay 
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
              <fieldset disabled={isViewMode}>
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
                    </Form.Group>
                  </Col>
                  {/* Active switch removed — toggled from the list
                      page's status badge. formData.isLive is still
                      loaded from the saved record and re-sent in
                      the update payload so the row keeps its
                      current state when the operator only changes
                      other fields. */}
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
                          {isWeekly && <th>Weekly Rate</th>}
                          {/* Yearly column always renders — see
                              CreateLongStayContract for rationale. */}
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
                              // Headers: Occupancy + Room + Monthly +
                              // Day (+ Weekly when WEEKLY) + Yearly +
                              // ExAdult + ExChild → 7 or 8 cells.
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
                  Cancellation Policy — structured table (Charge Type
                  / Value / Condition) + free-text catch-all notes.
                  Mirrors CreateLongStayContract.
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
                    <AutoGrowTextarea
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
                        <AutoGrowTextarea
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
                    {isViewMode ? "Close" : "Cancel"}
                  </Button>
                  {!isViewMode && (
                    <Button
                      variant="success"
                      onClick={submit}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <Spinner size="sm" animation="border" />
                      ) : (
                        "Update"
                      )}
                    </Button>
                  )}
                </div>
              </fieldset>
            )}
          </Card>
        </main>
      </div>
    </div>
  );
}
