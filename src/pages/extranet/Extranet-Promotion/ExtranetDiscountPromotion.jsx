import React, { useState, useEffect } from "react";
import {
  Container,
  Row,
  Col,
  Form,
  Button,
  Table,
  Card,
  Spinner,
} from "react-bootstrap";
import { FaArrowLeft, FaPlus, FaTrash, FaSave, FaTimes } from "react-icons/fa";
import { useNavigate, useParams } from "react-router-dom";
import Sidebar from "../../../components/Sidebar";
import Topbar from "../../../components/TopBar";
import axiosInstance from "../../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Select from "react-select";

export default function ExtranetDiscountPromotion() {
  const navigate = useNavigate();
  const { id } = useParams(); // hotelId

  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [countries, setCountries] = useState([]);
  const [filteredCountries, setFilteredCountries] = useState([]);
  const [roomDetails, setRoomDetails] = useState([]);
  const [hotelRoomsData, setHotelRoomsData] = useState([]);
  const [seasonData, setSeasonData] = useState([]);
  const [validationErrors, setValidationErrors] = useState({});

  // ✅ Validation function
  const validateForm = () => {
    const errors = {};

    // Season validation
    if (!formData.season || formData.season === "") {
      errors.season = "Please select a season";
    }

    // Rate Code validation
    if (!formData.rateCode || formData.rateCode.trim() === "") {
      errors.rateCode = "Please enter a rate code";
    }

    // Market Type validation
    if (!formData.marketType || formData.marketType.length === 0) {
      errors.marketType = "Please select at least one market type";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Helper function to get current date in YYYY-MM-DDTHH:MM format for date inputs
  const getCurrentDate = () => {
    const today = new Date();
    // Offset for local timezone if needed, but for now simple ISO substring
    // To get local ISO string:
    const tzOffset = today.getTimezoneOffset() * 60000; // offset in milliseconds
    const localISOTime = (new Date(today - tzOffset)).toISOString().slice(0, 16);
    return localISOTime;
  };

  const [formData, setFormData] = useState({
    season: "",
    rateCode: "",
    marketType: [],
    excludeNationality: [],
    isRefundable: false,
    weekType: "all",
    discountForRooms: true,
    discountForExtraBed: false,
    bookByDate: "",
    bookByPriorDays: "",
    validityList: [{ from: "", to: "" }],
    blackoutDates: [{ from: "", to: "" }],
    discounts: [],
    remarks: "",
  });

  // ✅ Fetch rooms
  const fetchRooms = async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(`/api/hotel/${id}/room-meal-data`);
      const roomData = res.data || [];

      const formatted = roomData.map((room) => ({
        roomId: room.roomId,
        roomName: room.roomName,
        mealPlans: room.mealPlans.map((meal) => ({
          mealPlanId: meal.mealPlanId,
          mealName: meal.mealName,
          discountPercent: 0,
          discountValue: 0,
          minStay: 0,
        })),
      }));

      setRooms(formatted);
    } catch {
      // toast.error("Failed to load rooms");
    } finally {
      setLoading(false);
    }
  };


  // ✅ Load hotel room data dynamically
  const loadHotelRoomDatas = async () => {
    try {
      const response = await axiosInstance.get(
        `/api/hotelRoomDetailsController/${id}`
      );
      console.log("Hotel Rooms Data:", response.data);
      setHotelRoomsData(response.data || []);
    } catch (error) {
      toast.error("Failed to load Hotel Rooms Data");
    }
  };

  // ✅ Fetch season data
  const seasonList = async () => {
    try {
      setLoading(true);
      const seasonRes = await axiosInstance.get(`/api/seasonType`);
      console.log("seasonRes::", seasonRes.data);
      if (seasonRes.data) {
        setSeasonData(seasonRes.data);
      }
    } catch {
      toast.error("Failed to load seasons");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Fetch dropdown data (market + countries)
  const fetchDropdowns = async () => {
    try {
      const [marketRes, countryRes] = await Promise.all([
        axiosInstance.get("/api/marketType"),
        axiosInstance.get("/api/country"),
      ]);

      // Add "All" option with value -1 at the beginning
      const marketsWithAll = [
        { marketTypeId: 100, name: "All" },
        ...(marketRes.data || [])
      ];
      setMarkets(marketsWithAll);
      setCountries(countryRes.data || []);
      setFilteredCountries(countryRes.data || []);
    } catch {
      toast.error("Failed to load dropdown data");
    }
  };

  useEffect(() => {
    fetchRooms();
    fetchDropdowns();
    fetchRoomDetails();
    loadHotelRoomDatas();
    seasonList();
  }, [id]);


  // ✅ Fetch Contract Rate Details
  const fetchRoomDetails = async () => {
    try {
      const res = await axiosInstance.get(`/api/hotelRoomDetailsController/${id}`);
      const data = res.data || [];

      const formatted = data.map((room) => ({
        id: room.id,
        roomCategory: room.roomCategory,
        occupancies: room.occupancyDetailsDTOs.map((occ) => ({
          id: occ.id,
          occupancyType: occ.occupanyType,
          rateSingle: 0,
          rateDouble: 0,
          rateExtraAdult: 0,
          rateExtraChild: 0,
        })),
      }));

      setRoomDetails(formatted);
    } catch (error) {
      toast.error("Failed to fetch room contract details");
    }
  };


  // ✅ Filter countries based on selected markets
  useEffect(() => {
    if (!formData.marketType?.length) {
      setFilteredCountries(countries);
    } else {
      const selectedIds = formData.marketType.map((m) => m.value);
      const filtered = countries.filter((c) =>
        selectedIds.includes(c.marketTypeId)
      );
      setFilteredCountries(filtered);
    }
  }, [formData.marketType, countries]);

  // ✅ Handle validity & blackout
  const handleAddDate = (field) => {
    setFormData({
      ...formData,
      [field]: [...formData[field], { from: getCurrentDate(), to: getCurrentDate() }],
    });
  };

  const handleRemoveDate = (field, index) => {
    const updated = [...formData[field]];
    updated.splice(index, 1);
    setFormData({ ...formData, [field]: updated });
  };

  // ✅ Helper function to get minimum validity to date (From date + 1 minute)
  const getMinValidityToDate = (fromDate) => {
    if (!fromDate) return "";
    const date = new Date(fromDate);
    // Add 1 minute to the from date to ensure validityTo is after validityFrom
    date.setMinutes(date.getMinutes() + 1);
    // Format to YYYY-MM-DDTHH:MM for datetime-local input
    const pad = (num) => num.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const handleDateChange = (field, index, key, value) => {
    const updated = [...formData[field]];
    updated[index][key] = value;
    setFormData({ ...formData, [field]: updated });
  };

  // ✅ Handle discount changes
  const handleDiscountChange = (index, field, value) => {
    const updated = [...formData.discounts];
    updated[index][field] = value;
    setFormData({ ...formData, discounts: updated });
  };

  // ✅ Handle contract rate input change
  const handleContractRateChange = (roomIndex, occIndex, field, value) => {
    const updated = [...roomDetails];
    updated[roomIndex].occupancies[occIndex][field] = value;
    setRoomDetails(updated);
  };

  // ✅ Submit
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate form before submission
    if (!validateForm()) {

      return;
    }

    try {
      const formatDate = (date) => {
        if (!date) return "";
        return `${date}:00`;
      };

      const weekDay = formData.weekType === "weekdays" ? true : false;
      const weekEnd = formData.weekType === "weekends" ? true : false;
      const allDays = formData.weekType === "all" ? true : false;

      const validityList = formData.validityList.map((v) => ({
        promo_validity_id: "",
        validityFrom: formatDate(v.from),
        validityTo: formatDate(v.to),
        isType: "V",
      }));

      const blackoutDates = formData.blackoutDates.map((b) => ({
        promo_validity_id: "",
        validityFrom: formatDate(b.from),
        validityTo: formatDate(b.to),
        isType: "B",
      }));

      // Create room DTO from dynamic hotel rooms data
      const roomDTO = hotelRoomsData.flatMap(
        (roomCategory) =>
          roomCategory.roomTypeDetailsDTOs?.map((roomType) => ({
            promo_room_id: "",
            hotelRoomcategoryId: String(roomCategory.rommCategoryId),
            hotelRoomtypeId: String(roomType.roomTypeId),
            discountPercent: "20", // Default value, can be made dynamic
            discountValue: "0", // Default value, can be made dynamic
            lengthRestriction: "2", // Default value, can be made dynamic
          })) || []
      );

      const payload = {
        marketype: formData.marketType.map((m) => m.value),
        hotelId: String(id),
        seasonId: String(formData.season),
        discountId: "",
        rateCode: formData.rateCode,
        excludeCountry: formData.excludeNationality.map((c) => c.value),
        weekDay: weekDay,
        weekEnd: weekEnd,
        allDays: allDays,
        refund: formData.isRefundable ? 1 : 0,
        extraBed: formData.discountForExtraBed,
        bookDate: formatDate(formData.bookByDate),
        bookDay: String(formData.bookByPriorDays),
        remark: formData.remarks || "",
        validityDTO: [...validityList, ...blackoutDates],
        roomDTO: roomDTO,
      };

      console.log("Discount payload:", payload);

      const response = await axiosInstance.post("/api/discount/save", payload);

      if (response.data) {
        toast.success("Discount Promotion Saved Successfully!");
        navigate(`/extranet/${id}/promotions`);
      }
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save discount promotion");
    }
  };


  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Container fluid>
            {/* Header */}
            <div className="d-flex justify-content-between align-items-center mb-4">
              <Button
                variant="outline-secondary"
                onClick={() => navigate(`/extranet/${id}/promotions`)}
                className="rounded-pill px-3"
              >
                <FaArrowLeft className="me-2" /> Back
              </Button>
              <h4 className="fw-semibold mb-0 text-dark">
                Create Extranet Discount Promotion
              </h4>
            </div>

            <Card className="p-4 shadow-sm border-0 mb-4 rounded-4">
              {loading ? (
                <div className="text-center py-5">
                  <Spinner animation="border" variant="primary" />
                </div>
              ) : (
                <Form onSubmit={handleSubmit}>
                  {/* ================= BASIC INFO ================= */}
                  <Row className="mb-4 g-3">
                    {/* Season */}
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label>Season *</Form.Label>
                        <Form.Select
                          value={formData.season}
                          onChange={(e) => {
                            setFormData({
                              ...formData,
                              season: e.target.value,
                            });
                            // Clear validation error when user selects
                            if (validationErrors.season) {
                              setValidationErrors({ ...validationErrors, season: "" });
                            }
                          }}
                          className="rounded-pill"
                          isInvalid={!!validationErrors.season}
                        >
                          <option value="">Select Season</option>
                          {seasonData?.map((season) => (
                            <option key={season.seasonTypeId} value={season.seasonTypeId}>
                              {season.season}
                            </option>
                          ))}
                        </Form.Select>
                        {validationErrors.season && (
                          <Form.Control.Feedback type="invalid">
                            {validationErrors.season}
                          </Form.Control.Feedback>
                        )}
                      </Form.Group>
                    </Col>

                    {/* Rate Code */}
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label>Rate Code *</Form.Label>
                        <Form.Control
                          value={formData.rateCode}
                          onChange={(e) => {
                            setFormData({
                              ...formData,
                              rateCode: e.target.value,
                            });
                            // Clear validation error when user types
                            if (validationErrors.rateCode) {
                              setValidationErrors({ ...validationErrors, rateCode: "" });
                            }
                          }}
                          placeholder="Enter rate code"
                          isInvalid={!!validationErrors.rateCode}
                        />
                        {validationErrors.rateCode && (
                          <Form.Control.Feedback type="invalid">
                            {validationErrors.rateCode}
                          </Form.Control.Feedback>
                        )}
                      </Form.Group>
                    </Col>

                    {/* Market Type */}
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label>Market Type *</Form.Label>
                        <Select
                          isMulti
                          options={markets.map((m) => ({
                            value: m.marketTypeId,
                            label: m.name,
                          }))}
                          value={formData.marketType}
                          onChange={(selected) => {
                            setFormData({ ...formData, marketType: selected });
                            // Clear validation error when user selects
                            if (validationErrors.marketType) {
                              setValidationErrors({ ...validationErrors, marketType: "" });
                            }
                          }}
                          classNamePrefix="react-select"
                          placeholder="Select Market Type"
                          className={validationErrors.marketType ? 'is-invalid' : ''}
                          styles={{
                            control: (base, state) => ({
                              ...base,
                              borderColor: validationErrors.marketType ? '#dc3545' : base.borderColor,
                              boxShadow: validationErrors.marketType ? '0 0 0 0.25rem rgba(220, 53, 69, 0.25)' : base.boxShadow,
                            })
                          }}
                        />
                        {validationErrors.marketType && (
                          <div className="invalid-feedback d-block">
                            {validationErrors.marketType}
                          </div>
                        )}
                      </Form.Group>
                    </Col>

                    {/* Exclude Nationality */}
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label>Exclude Nationality</Form.Label>
                        <Select
                          isMulti
                          options={filteredCountries.map((c) => ({
                            value: c.id,
                            label: `${c.name} (${c.marketType})`,
                          }))}
                          value={formData.excludeNationality}
                          onChange={(selected) =>
                            setFormData({
                              ...formData,
                              excludeNationality: selected,
                            })
                          }
                          classNamePrefix="react-select"
                          placeholder="Select Countries"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  {/* ================= DAY TYPE & REFUND ================= */}
                  <Row className="align-items-center mb-4">
                    <Col md={4}>
                      <Form.Label>Day Type:</Form.Label>
                      <div className="d-flex gap-3">
                        <Form.Check
                          type="radio"
                          label="All Days"
                          name="days"
                          checked={formData.weekType === "all"}
                          onChange={() =>
                            setFormData({ ...formData, weekType: "all" })
                          }
                        />
                        <Form.Check
                          type="radio"
                          label="Weekdays"
                          name="days"
                          checked={formData.weekType === "weekdays"}
                          onChange={() =>
                            setFormData({ ...formData, weekType: "weekdays" })
                          }
                        />
                        <Form.Check
                          type="radio"
                          label="Weekends"
                          name="days"
                          checked={formData.weekType === "weekends"}
                          onChange={() =>
                            setFormData({ ...formData, weekType: "weekends" })
                          }
                        />
                      </div>
                    </Col>

                    <Col md={4}>
                      <Form.Label>Discount For *</Form.Label>
                      <div className="d-flex gap-3">
                        <Form.Check
                          type="checkbox"
                          label="Rooms"
                          checked={formData.discountForRooms}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              discountForRooms: e.target.checked,
                            })
                          }
                        />
                        <Form.Check
                          type="checkbox"
                          label="Extra Bed"
                          checked={formData.discountForExtraBed}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              discountForExtraBed: e.target.checked,
                            })
                          }
                        />
                      </div>
                    </Col>

                    <Col md={2}>
                      <Form.Group>
                        <Form.Label>Book By Date</Form.Label>
                        <Form.Control
                          type="date"
                          value={formData.bookByDate}
                          min={getCurrentDate()}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              bookByDate: e.target.value,
                            })
                          }
                        />
                      </Form.Group>
                    </Col>

                    <Col md={2}>
                      <Form.Group>
                        <Form.Label>Prior Days</Form.Label>
                        <Form.Control
                          type="number"
                          value={formData.bookByPriorDays}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              bookByPriorDays: e.target.value,
                            })
                          }
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  {/* ================= VALIDITY & BLACKOUT ================= */}
                  <Row className="mb-4">
                    <Col md={6}>
                      <Card className="p-3 border rounded-3">
                        <div className="d-flex justify-content-between mb-2">
                          <strong>Validity List</strong>
                          <Button
                            size="sm"
                            variant="outline-primary"
                            onClick={() => handleAddDate("validityList")}
                          >
                            <FaPlus /> Add
                          </Button>
                        </div>
                        {formData.validityList.map((v, i) => (
                          <Row key={i} className="align-items-center mb-2">
                            <Col>
                              <Form.Control
                                type="datetime-local"
                                value={v.from}
                                onChange={(e) =>
                                  handleDateChange(
                                    "validityList",
                                    i,
                                    "from",
                                    e.target.value
                                  )
                                }
                              />
                            </Col>
                            <Col>
                              <Form.Control
                                type="datetime-local"
                                value={v.to}
                                min={getMinValidityToDate(v.from)}
                                onChange={(e) =>
                                  handleDateChange(
                                    "validityList",
                                    i,
                                    "to",
                                    e.target.value
                                  )
                                }
                              />
                            </Col>
                            <Col xs="auto">
                              {i > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline-danger"
                                  onClick={() =>
                                    handleRemoveDate("validityList", i)
                                  }
                                >
                                  <FaTrash />
                                </Button>
                              )}
                            </Col>
                          </Row>
                        ))}
                      </Card>
                    </Col>

                    <Col md={6}>
                      <Card className="p-3 border rounded-3">
                        <div className="d-flex justify-content-between mb-2">
                          <strong>Blackout Dates</strong>
                          <Button
                            size="sm"
                            variant="outline-primary"
                            onClick={() => handleAddDate("blackoutDates")}
                          >
                            <FaPlus /> Add
                          </Button>
                        </div>
                        {formData.blackoutDates.map((b, i) => (
                          <Row key={i} className="align-items-center mb-2">
                            <Col>
                              <Form.Control
                                type="datetime-local"
                                value={b.from}
                                onChange={(e) =>
                                  handleDateChange(
                                    "blackoutDates",
                                    i,
                                    "from",
                                    e.target.value
                                  )
                                }
                              />
                            </Col>
                            <Col>
                              <Form.Control
                                type="datetime-local"
                                value={b.to}
                                min={getMinValidityToDate(b.from)}
                                onChange={(e) =>
                                  handleDateChange(
                                    "blackoutDates",
                                    i,
                                    "to",
                                    e.target.value
                                  )
                                }
                              />
                            </Col>
                            <Col xs="auto">
                              {i > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline-danger"
                                  onClick={() =>
                                    handleRemoveDate("blackoutDates", i)
                                  }
                                >
                                  <FaTrash />
                                </Button>
                              )}
                            </Col>
                          </Row>
                        ))}
                      </Card>
                    </Col>
                  </Row>

                  {/* ================= DISCOUNT TABLE ================= */}
                  {/* ================= DISCOUNT DETAILS ================= */}
                  <Card className="p-3 border-0 mb-4">
                    <h6 className="fw-bold mb-3 text-primary">DISCOUNT DETAILS</h6>

                    <div className="table-responsive">
                      <Table bordered hover size="sm">
                        <thead className="table-light text-center align-middle">
                          <tr>
                            <th>Room Category</th>
                            <th>Room Type</th>
                            <th>Occupancy</th>
                            <th>Discount (%)</th>
                            <th>Discount (Value)</th>
                            <th>Minlength & Stay Restriction</th>
                            <th>Maxlength & Stay Restriction</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hotelRoomsData.map((roomCategory, categoryIndex) => (
                            <React.Fragment key={roomCategory.id}>
                              {/* Room Category Header Row */}
                              <tr className="bg-light fw-bold text-primary">
                                <td colSpan={6}>{roomCategory.roomCategory}</td>
                              </tr>

                              {/* Room Types and Occupancies */}
                              {roomCategory.roomTypeDetailsDTOs?.map((roomType, typeIndex) => (
                                <React.Fragment key={roomType.roomTypeId}>
                                  {/* Room Type Header Row */}
                                  <tr className="bg-light">
                                    <td></td>
                                    <td className="fw-semibold">{roomType.roomTypeName}</td>
                                    <td colSpan={5}></td>
                                  </tr>

                                  {/* Occupancy Rows */}
                                  {roomCategory.occupancyDetailsDTOs?.map((occupancy, occIndex) => (
                                    <tr key={`${roomCategory.rommCategoryId}_${roomType.roomTypeId}_${occupancy.id}`}>
                                      <td></td>
                                      <td></td>
                                      <td>{occupancy.occupanyType}</td>
                                      <td>
                                        <Form.Control
                                          type="number"
                                          min="0"
                                          max="100"
                                          placeholder="0"
                                          defaultValue="0"
                                          size="sm"
                                        />
                                      </td>
                                      <td>
                                        <Form.Control
                                          type="number"
                                          min="0"
                                          placeholder="0"
                                          defaultValue="0"
                                          size="sm"
                                        />
                                      </td>
                                      <td>
                                        <Form.Control
                                          type="number"
                                          min="0"
                                          placeholder="0"
                                          defaultValue="0"
                                          size="sm"
                                        />
                                      </td>
                                      <td>
                                        <Form.Control
                                          type="number"
                                          min="0"
                                          placeholder="0"
                                          defaultValue="25"
                                          size="sm"
                                        />
                                      </td>
                                    </tr>
                                  ))}
                                </React.Fragment>
                              ))}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </Card>


                  {/* ================= REMARKS + BUTTONS ================= */}
                  <Form.Group className="mb-3">
                    <Form.Label>Remarks</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      value={formData.remarks}
                      onChange={(e) =>
                        setFormData({ ...formData, remarks: e.target.value })
                      }
                    />
                  </Form.Group>

                  <div className="d-flex justify-content-end gap-3 mt-3 pt-3 border-top">
                    <Button
                      variant="outline-danger"
                      className="px-4 rounded-pill"
                      onClick={() => navigate(`/extranet/${id}/promotions`)}
                    >
                      ✖ Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="success"
                      className="px-4 rounded-pill"
                    >
                      <FaSave className="me-2" /> Save
                    </Button>
                  </div>
                </Form>
              )}
            </Card>
          </Container>
        </main>
      </div>
    </div>
  );
}
