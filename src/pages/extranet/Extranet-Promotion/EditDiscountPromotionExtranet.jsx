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

export default function EditDiscountPromotionExtranet() {
  const navigate = useNavigate();
  const { id, editId } = useParams(); // hotelId and promoId
  const promoId = editId;

  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [countries, setCountries] = useState([]);
  const [filteredCountries, setFilteredCountries] = useState([]);
  const [roomDetails, setRoomDetails] = useState([]);
  const [hotelRoomsData, setHotelRoomsData] = useState([]);
  const [discountRoomData, setDiscountRoomData] = useState([]);
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

  // Helper function to get current date in YYYY-MM-DD format for date inputs
  const getCurrentDate = () => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  };

  // Helper function to convert dd-mm-yyyy or ISO to YYYY-MM-DDTHH:MM
  const convertToDateInput = (dateString) => {
    if (!dateString) return "";
    if (dateString.includes("T")) {
      return dateString.substring(0, 16);
    }
    const parts = dateString.split("-");
    if (parts.length === 3) {
      const day = parts[0];
      const month = parts[1];
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
    return dateString;
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

  // ✅ Load discount data
  const loadDiscountData = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get(`/api/discount/${promoId}`);
      const data = response.data;

      console.log("Discount data loaded:", data);

      // Convert API data to form format
      const validityList = data.validityDTO
        ?.filter((item) => item.isType === "V")
        .map((item) => ({
          from: convertToDateInput(item.validityFrom),
          to: convertToDateInput(item.validityTo),
        })) || [{ from: "", to: "" }];

      const blackoutDates = data.validityDTO
        ?.filter((item) => item.isType === "B")
        .map((item) => ({
          from: convertToDateInput(item.validityFrom),
          to: convertToDateInput(item.validityTo),
        })) || [{ from: "", to: "" }];

      // Store roomDTO data for discount details
      console.log('Setting discount room data:', data.roomDTO);
      console.log('Available hotel rooms data:', hotelRoomsData);
      setDiscountRoomData(data.roomDTO || []);

      setFormData({
        season: data.seasonId?.toString() || "",
        rateCode: data.rateCode || "",
        marketType:
          data.marketype?.map((id) => ({
            value: id,
            label:
              markets.find((m) => m.marketTypeId === id)?.name ||
              `Market ${id}`,
          })) || [],
        excludeNationality:
          data.excludeCountry?.map((id) => ({
            value: id,
            label: countries.find((c) => c.id === id)?.name || `Country ${id}`,
          })) || [],
        isRefundable: data.refund || false,
        weekType: data.allDays ? "all" : data.weekDay ? "weekdays" : "weekends",
        discountForRooms: true,
        discountForExtraBed: data.extraBed || false,
        bookByDate: convertToDateInput(data.bookDate),
        bookByPriorDays: data.bookDay?.toString() || "",
        validityList: validityList,
        blackoutDates: blackoutDates,
        discounts: [],
        remarks: data.remark || "",
      });
    } catch (error) {
      console.error("Error loading discount data:", error);
      toast.error("Failed to load discount data");
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
      console.error("Error loading hotel rooms data:", error);
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
    fetchDropdowns();
    loadHotelRoomDatas();
    seasonList();
  }, [id]);

  // Load discount data after dropdowns are loaded
  useEffect(() => {
    if (markets.length > 0 && countries.length > 0) {
      loadDiscountData();
    }
  }, [markets, countries, promoId]);

  // Debug effect to log discount room data changes
  useEffect(() => {
    console.log('Discount room data updated:', discountRoomData);
  }, [discountRoomData]);

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
      [field]: [...formData[field], { from: "", to: "" }],
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

      // Use the updated discount room data
      const roomDTO = discountRoomData.map((room) => ({
        promo_room_id: room.promo_room_id || "",
        hotelRoomcategoryId: String(room.hotelRoomcategoryId),
        hotelRoomtypeId: String(room.hotelRoomtypeId),
        discountPercent: room.discountPercent || "0",
        discountValue: room.discountValue || "0",
        lengthRestriction: room.lengthRestriction || "0",
        roomId: room.roomId,
      }));

      const payload = {
        marketype: formData.marketType.map((m) => m.value),
        hotelId: String(id),
        seasonId: String(formData.season),
        discountId: String(promoId),
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

      console.log("Update discount payload:", payload);

      const response = await axiosInstance.put(
        `/api/discount/${promoId}`,
        payload
      );

      if (response.data) {
        toast.success("Discount Promotion Updated Successfully!");
        navigate(`/hotel-actions/${id}/promotions`);
      }
    } catch (error) {
      console.error("Update error:", error);
      toast.error("Failed to update discount promotion");
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
                onClick={() => navigate(-1)}
                className="rounded-pill px-3"
              >
                <FaArrowLeft className="me-2" /> Back
              </Button>
              <h4 className="fw-semibold mb-0 text-dark">
                Edit Discount Promotion
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
                              setValidationErrors({
                                ...validationErrors,
                                season: "",
                              });
                            }
                          }}
                          className="rounded-pill"
                          isInvalid={!!validationErrors.season}
                        >
                          <option value="">Select Season</option>
                          {seasonData?.map((season) => (
                            <option
                              key={season.seasonTypeId}
                              value={season.seasonTypeId}
                            >
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
                              setValidationErrors({
                                ...validationErrors,
                                rateCode: "",
                              });
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
                              setValidationErrors({
                                ...validationErrors,
                                marketType: "",
                              });
                            }
                          }}
                          classNamePrefix="react-select"
                          placeholder="Select Market Type"
                          className={
                            validationErrors.marketType ? "is-invalid" : ""
                          }
                          styles={{
                            control: (base, state) => ({
                              ...base,
                              borderColor: validationErrors.marketType
                                ? "#dc3545"
                                : base.borderColor,
                              boxShadow: validationErrors.marketType
                                ? "0 0 0 0.25rem rgba(220, 53, 69, 0.25)"
                                : base.boxShadow,
                            }),
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

                  {/* ================= DISCOUNT DETAILS ================= */}
                  <Card className="p-3 border-0 mb-4">
                    <h6 className="fw-bold mb-3 text-primary">
                      DISCOUNT DETAILS
                    </h6>

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
                                <td colSpan={7}>{roomCategory.roomCategory}</td>
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
                                  {roomCategory.occupancyDetailsDTOs?.map((occupancy, occIndex) => {
                                    // Find existing discount data for this combination
                                    // First try exact match by hotelRoomcategoryId, hotelRoomtypeId, and roomId
                                    let existingDiscount = discountRoomData.find(d =>
                                      d.hotelRoomcategoryId == roomCategory.rommCategoryId &&
                                      d.hotelRoomtypeId == roomType.roomTypeId &&
                                      d.roomId == occupancy.id
                                    );

                                    // If no exact match, try to find by category and type only
                                    // This handles cases where roomId doesn't match occupancy.id
                                    if (!existingDiscount) {
                                      existingDiscount = discountRoomData.find(d =>
                                        d.hotelRoomcategoryId == roomCategory.rommCategoryId &&
                                        d.hotelRoomtypeId == roomType.roomTypeId
                                      );
                                    }

                                    console.log('Looking for discount data:', {
                                      roomCategory: roomCategory.rommCategoryId,
                                      roomType: roomType.roomTypeId,
                                      occupancy: occupancy.id,
                                      occupancyType: occupancy.occupanyType,
                                      availableDiscounts: discountRoomData,
                                      found: existingDiscount
                                    });

                                    // Debug: Show all occupancy IDs for this room category
                                    console.log('All occupancies for this category:',
                                      roomCategory.occupancyDetailsDTOs?.map(occ => ({
                                        id: occ.id,
                                        type: occ.occupanyType
                                      }))
                                    );

                                    return (
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
                                            value={existingDiscount?.discountPercent || "0"}
                                            size="sm"
                                            onChange={(e) => {
                                              const updated = [...discountRoomData];
                                              // Try exact match first
                                              let existingIndex = updated.findIndex(d =>
                                                d.hotelRoomcategoryId == roomCategory.rommCategoryId &&
                                                d.hotelRoomtypeId == roomType.roomTypeId &&
                                                d.roomId == occupancy.id
                                              );

                                              // If no exact match, try category and type only
                                              if (existingIndex === -1) {
                                                existingIndex = updated.findIndex(d =>
                                                  d.hotelRoomcategoryId == roomCategory.rommCategoryId &&
                                                  d.hotelRoomtypeId == roomType.roomTypeId
                                                );
                                              }

                                              if (existingIndex !== -1) {
                                                updated[existingIndex].discountPercent = e.target.value;
                                              } else {
                                                updated.push({
                                                  hotelRoomcategoryId: roomCategory.rommCategoryId,
                                                  hotelRoomtypeId: roomType.roomTypeId,
                                                  roomId: occupancy.id,
                                                  discountPercent: e.target.value,
                                                  discountValue: "0",
                                                  lengthRestriction: "0"
                                                });
                                              }
                                              setDiscountRoomData(updated);
                                            }}
                                          />
                                        </td>
                                        <td>
                                          <Form.Control
                                            type="number"
                                            min="0"
                                            placeholder="0"
                                            value={existingDiscount?.discountValue || "0"}
                                            size="sm"
                                            onChange={(e) => {
                                              const updated = [...discountRoomData];
                                              // Try exact match first
                                              let existingIndex = updated.findIndex(d =>
                                                d.hotelRoomcategoryId == roomCategory.rommCategoryId &&
                                                d.hotelRoomtypeId == roomType.roomTypeId &&
                                                d.roomId == occupancy.id
                                              );

                                              // If no exact match, try category and type only
                                              if (existingIndex === -1) {
                                                existingIndex = updated.findIndex(d =>
                                                  d.hotelRoomcategoryId == roomCategory.rommCategoryId &&
                                                  d.hotelRoomtypeId == roomType.roomTypeId
                                                );
                                              }

                                              if (existingIndex !== -1) {
                                                updated[existingIndex].discountValue = e.target.value;
                                              } else {
                                                updated.push({
                                                  hotelRoomcategoryId: roomCategory.rommCategoryId,
                                                  hotelRoomtypeId: roomType.roomTypeId,
                                                  roomId: occupancy.id,
                                                  discountPercent: "0",
                                                  discountValue: e.target.value,
                                                  lengthRestriction: "0"
                                                });
                                              }
                                              setDiscountRoomData(updated);
                                            }}
                                          />
                                        </td>
                                        <td>
                                          <Form.Control
                                            type="number"
                                            min="0"
                                            placeholder="0"
                                            value={existingDiscount?.lengthRestriction === "null" ? "0" : existingDiscount?.lengthRestriction || "0"}
                                            size="sm"
                                            onChange={(e) => {
                                              const updated = [...discountRoomData];
                                              // Try exact match first
                                              let existingIndex = updated.findIndex(d =>
                                                d.hotelRoomcategoryId == roomCategory.rommCategoryId &&
                                                d.hotelRoomtypeId == roomType.roomTypeId &&
                                                d.roomId == occupancy.id
                                              );

                                              // If no exact match, try category and type only
                                              if (existingIndex === -1) {
                                                existingIndex = updated.findIndex(d =>
                                                  d.hotelRoomcategoryId == roomCategory.rommCategoryId &&
                                                  d.hotelRoomtypeId == roomType.roomTypeId
                                                );
                                              }

                                              if (existingIndex !== -1) {
                                                updated[existingIndex].lengthRestriction = e.target.value;
                                              } else {
                                                updated.push({
                                                  hotelRoomcategoryId: roomCategory.rommCategoryId,
                                                  hotelRoomtypeId: roomType.roomTypeId,
                                                  roomId: occupancy.id,
                                                  discountPercent: "0",
                                                  discountValue: "0",
                                                  lengthRestriction: e.target.value
                                                });
                                              }
                                              setDiscountRoomData(updated);
                                            }}
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
                                    );
                                  })}
                                </React.Fragment>
                              ))}
                            </React.Fragment>
                          ))}

                          {/* Show message if no hotel rooms data */}
                          {hotelRoomsData.length === 0 && (
                            <tr>
                              <td colSpan={7} className="text-center text-muted py-3">
                                No hotel rooms data available
                              </td>
                            </tr>
                          )}
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
                      onClick={() => navigate(-1)}
                    >
                      ✖ Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="success"
                      className="px-4 rounded-pill"
                    >
                      <FaSave className="me-2" /> Update
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
