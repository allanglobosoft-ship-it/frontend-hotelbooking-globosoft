import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Container,
  Row,
  Col,
  Form,
  Button,
  Card,
  Spinner,
} from "react-bootstrap";
import { FaArrowLeft, FaSave, FaPlus, FaTrash } from "react-icons/fa";
import Select from "react-select";
import Sidebar from "../../../components/Sidebar";
import Topbar from "../../../components/TopBar";
import axiosInstance from "../../../components/AxiosInstance";
import { toast } from "react-hot-toast";

export default function EditSpecialRateExtranet() {
  const navigate = useNavigate();
  const { id, editId } = useParams();

  const [loading, setLoading] = useState(false);
  const [markets, setMarkets] = useState([]);
  const [countries, setCountries] = useState([]);
  const [filteredCountries, setFilteredCountries] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [roomDetails, setRoomDetails] = useState([]);
  const [hotelRoomsData, setHotelRoomsData] = useState([]);
  const [roomRates, setRoomRates] = useState({});
  const [hotelPromotions, setHotelPromotions] = useState([]);
  const [seasonData, setSeasonData] = useState([]);

  const [formData, setFormData] = useState({
    season: "",
    rateCode: "",
    marketType: [],
    excludeNationality: [],
    isRefundable: false,
    weekType: "all",
    bookByDate: "",
    bookByPriorDays: "",
    minimumStay: 0,
    maximumStay: 0,
    validityList: [{ from: "", to: "" }],
    blackoutDates: [{ from: "", to: "" }],
    remarks: "",
    combinedStayPay: "",
    combinedDiscount: "",
  });

  // ✅ Load hotel room data dynamically
  const loadHotelRoomDatas = async () => {
    try {
      const response = await axiosInstance.get(
        `/api/hotelRoomDetailsController/${id}`,
      );
      // console.log("Hotel Rooms Data:", response.data);
      setHotelRoomsData(response.data || []);
    } catch (error) {
      toast.error("Failed to load Hotel Rooms Data");
    }
  };

  const fetchDropdowns = async () => {
    try {
      const [marketRes, countryRes] = await Promise.all([
        axiosInstance.get("/api/marketType"),
        axiosInstance.get("/api/country"),
      ]);

      // Add "All" option with value -1 at the beginning
      const marketsWithAll = [
        { marketTypeId: 100, name: "All" },
        ...(marketRes.data || []),
      ];

      setMarkets(marketsWithAll);
      setCountries(countryRes.data || []);
      setFilteredCountries(countryRes.data || []);
    } catch {
      toast.error("Failed to load dropdown data");
    }
  };

  const fetchHotelPromotions = async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(`/api/hotelPromotions/${id}`);
      const hotelPromotionsData = res.data || [];
      setHotelPromotions(hotelPromotionsData);
    } catch {
      toast.error("Failed to load hotelpromotions");
    } finally {
      setLoading(false);
    }
  };

  const seasonList = async () => {
    try {
      setLoading(true);
      const seasonRes = await axiosInstance.get(`/api/seasonType`);
      // console.log("seasonRes::", seasonRes.data);
      if (seasonRes.data) {
        setSeasonData(seasonRes.data);
      }
    } catch {
      toast.error("Failed to load seasons");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDropdowns();
    loadHotelRoomDatas();
    fetchHotelPromotions();
    seasonList();
  }, []);

  // ✅ Filter countries based on selected markets
  useEffect(() => {
    if (!formData.marketType?.length) {
      setFilteredCountries(countries);
    } else {
      const selectedIds = formData.marketType.map((m) => m.value);
      const filtered = countries.filter((c) =>
        selectedIds.includes(c.marketTypeId),
      );
      setFilteredCountries(filtered);
    }
  }, [formData.marketType, countries]);

  // ✅ Fetch Special Rate Data for Edit
  const fetchSpecialRateData = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get(
        `/api/hotelSpecialRate/${editId}`,
      );
      const specialData = response.data;
      console.log("Special Rate Data for Edit:", specialData);
      console.log(
        "Combined fields from API - combinedPromoId:",
        specialData.combinedPromoId,
        "promotype:",
        specialData.promotype,
      );

      // Convert date format from API (DD-MM-YYYY or YYYY-MM-DDTHH:MM:SS) to
      // YYYY-MM-DD  for <input type="date">  (isDateOnly=true)
      // YYYY-MM-DDTHH:MM for <input type="datetime-local">  (isDateOnly=false)
      const convertDateForInput = (dateStr, isDateOnly = false) => {
        if (!dateStr) return "";
        // Already ISO with T separator
        if (dateStr.includes("T")) {
          return isDateOnly
            ? dateStr.substring(0, 10)
            : dateStr.substring(0, 16);
        }
        // DD-MM-YYYY  format
        const parts = dateStr.split("-");
        if (parts.length === 3) {
          const yyyy = parts[2].padStart(4, "0");
          const mm   = parts[1].padStart(2, "0");
          const dd   = parts[0].padStart(2, "0");
          return isDateOnly ? `${yyyy}-${mm}-${dd}` : `${yyyy}-${mm}-${dd}T00:00`;
        }
        return dateStr;
      };

      // Prefill form data with existing values
      setFormData({
        season: String(specialData.seasonId || ""),
        rateCode: specialData.rateCode || "",
        marketType:
          specialData.marketype?.map((m) => ({
            value: m,
            label:
              markets.find((x) => x.marketTypeId === m)?.name || `Market ${m}`,
          })) || [],
        excludeNationality:
          specialData.excludeCountrys?.map((id) => ({
            value: id,
            label: countries.find((c) => c.id === id)?.name || `Country ${id}`,
          })) || [],
        isRefundable: specialData.isRefund || false,
        weekType:
          specialData.allDays
            ? "all"
            : specialData.weekDay
              ? "weekdays"
              : "weekends",
        bookByDate: convertDateForInput(specialData.bookDate, true) || "",
        bookByPriorDays: specialData.bookDay || "",
        minimumStay: specialData.minlengthStay || 0,
        maximumStay: specialData.maxlengthStay || 0,
        validityList: specialData.specialRateValidityDTO
          ?.filter((v) => v.isType === "V")
          ?.map((v) => ({
            from: convertDateForInput(v.validityFrom, false) || "",
            to: convertDateForInput(v.validityTo, false) || "",
          })) || [{ from: "", to: "" }],
        blackoutDates: specialData.specialRateValidityDTO
          ?.filter((v) => v.isType === "B")
          ?.map((b) => ({
            from: convertDateForInput(b.validityFrom, false) || "",
            to: convertDateForInput(b.validityTo, false) || "",
          })) || [{ from: "", to: "" }],
        remarks: specialData.remark || "",
        combinedStayPay:
          specialData.promotype === "SAP"
            ? specialData.combinedPromoId || ""
            : "",
        combinedDiscount:
          specialData.promotype === "DSR"
            ? specialData.combinedPromoId || ""
            : "",
      });

      console.log(
        "Form data set - combinedStayPay:",
        specialData.promotype === "SAP"
          ? specialData.combinedPromoId || ""
          : "",
        "combinedDiscount:",
        specialData.promotype === "DSR"
          ? specialData.combinedPromoId || ""
          : "",
      );

      // Load existing room rates if available
      if (specialData.specialRateRoomDTO) {
        const existingRates = {};
        specialData.specialRateRoomDTO.forEach((rate) => {
          if (rate.ocuppancyTypeIid === null || rate.ocuppancyTypeIid === "") {
            // Extra bed entry — map adultrate / childrate to the extra-bed keys
            const base = `${rate.hotelRoomcategoryId}_${rate.hotelRoomTypeId}`;
            if (rate.adultrate != null && rate.adultrate !== "") {
              existingRates[`${base}_extraAdult`] = String(rate.adultrate);
            }
            if (rate.childrate != null && rate.childrate !== "") {
              existingRates[`${base}_extraChild`] = String(rate.childrate);
            }
          } else {
            const key = `${rate.hotelRoomcategoryId}_${rate.hotelRoomTypeId}_${rate.ocuppancyTypeIid}`;
            existingRates[key] = String(rate.rate);
          }
        });
        setRoomRates(existingRates);
        console.log("Loaded existing room rates:", existingRates);
      }
    } catch (err) {
      console.error("Error loading special rate data:", err);
      toast.error("Failed to load special rate details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id && editId) {
      // console.log("Both id and editId are available, fetching data...");
      fetchSpecialRateData();
    } else {
      // console.log("Missing parameters - id:", id, "editId:", editId);
    }
  }, [id, editId]);

  // ✅ Re-populate form when markets and countries are loaded
  useEffect(() => {
    const repopulateFormData = async () => {
      if (!editId || !markets.length || !countries.length) return;

      try {
        const response = await axiosInstance.get(
          `/api/hotelSpecialRate/${editId}`,
        );
        const specialData = response.data;

        // Convert date format for date inputs
        const convertDateForInput = (dateStr, isDateOnly = false) => {
          if (!dateStr) return "";
          if (dateStr.includes("T")) {
            return isDateOnly
              ? dateStr.substring(0, 10)
              : dateStr.substring(0, 16);
          }
          const parts = dateStr.split("-");
          if (parts.length === 3) {
            const yyyy = parts[2].padStart(4, "0");
            const mm   = parts[1].padStart(2, "0");
            const dd   = parts[0].padStart(2, "0");
            return isDateOnly ? `${yyyy}-${mm}-${dd}` : `${yyyy}-${mm}-${dd}T00:00`;
          }
          return dateStr;
        };

        // Update form data with proper market and country labels
        setFormData((prev) => ({
          ...prev,
          season: String(specialData.seasonId || ""),
          rateCode: specialData.rateCode || "",
          marketType:
            specialData.marketype?.map((m) => ({
              value: m,
              label:
                markets.find((x) => x.marketTypeId === m)?.name ||
                `Market ${m}`,
            })) || [],
          excludeNationality:
            specialData.excludeCountrys?.map((id) => ({
              value: id,
              label:
                countries.find((c) => c.id === id)?.name || `Country ${id}`,
            })) || [],
          isRefundable: specialData.isRefund || false,
          weekType:
            specialData.allDays
              ? "all"
              : specialData.weekDay
                ? "weekdays"
                : "weekends",
          bookByDate: convertDateForInput(specialData.bookDate, true) || "",
          bookByPriorDays: specialData.bookDay || "",
          minimumStay: specialData.minlengthStay || 0,
          maximumStay: specialData.maxlengthStay || 0,
          validityList: specialData.specialRateValidityDTO
            ?.filter((v) => v.isType === "V")
            ?.map((v) => ({
              from: convertDateForInput(v.validityFrom, false) || "",
              to: convertDateForInput(v.validityTo, false) || "",
            })) || [{ from: "", to: "" }],
          blackoutDates: specialData.specialRateValidityDTO
            ?.filter((v) => v.isType === "B")
            ?.map((b) => ({
              from: convertDateForInput(b.validityFrom, false) || "",
              to: convertDateForInput(b.validityTo, false) || "",
            })) || [{ from: "", to: "" }],
          remarks: specialData.remark || "",
          combinedStayPay:
            specialData.promotype === "SAP"
              ? specialData.combinedPromoId || ""
              : "",
          combinedDiscount:
            specialData.promotype === "DSR"
              ? specialData.combinedPromoId || ""
              : "",
        }));

        // Load existing room rates if available
        if (specialData.specialRateRoomDTO) {
          const existingRates = {};
          specialData.specialRateRoomDTO.forEach((rate) => {
            if (rate.ocuppancyTypeIid === null || rate.ocuppancyTypeIid === "") {
              const base = `${rate.hotelRoomcategoryId}_${rate.hotelRoomTypeId}`;
              if (rate.adultrate != null && rate.adultrate !== "") {
                existingRates[`${base}_extraAdult`] = String(rate.adultrate);
              }
              if (rate.childrate != null && rate.childrate !== "") {
                existingRates[`${base}_extraChild`] = String(rate.childrate);
              }
            } else {
              const key = `${rate.hotelRoomcategoryId}_${rate.hotelRoomTypeId}_${rate.ocuppancyTypeIid}`;
              existingRates[key] = String(rate.rate);
            }
          });
          setRoomRates(existingRates);
        }
      } catch (err) {
        console.error("Error re-populating form data:", err);
      }
    };

    repopulateFormData();
  }, [editId, markets, countries]);

  // ✅ Debug form data changes
  useEffect(() => {
    console.log(
      "Form data changed - combinedStayPay:",
      formData.combinedStayPay,
      "combinedDiscount:",
      formData.combinedDiscount,
    );
  }, [formData.combinedStayPay, formData.combinedDiscount]);

  // ✅ Handlers
  const handleMealRateChange = (roomIndex, mealIndex, field, value) => {
    const updated = [...rooms];
    updated[roomIndex].mealPlans[mealIndex][field] = value;
    setRooms(updated);
  };

  const handleContractRateChange = (roomIndex, occIndex, value) => {
    const updated = [...roomDetails];
    updated[roomIndex].occupancies[occIndex].rate = value;
    setRoomDetails(updated);
  };

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
    const pad = (num) => num.toString().padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const handleDateChange = (field, index, key, value) => {
    const updated = [...formData[field]];
    updated[index][key] = value;
    setFormData({ ...formData, [field]: updated });
  };

  // ✅ Update Special Rate
  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      // datetime-local input gives YYYY-MM-DDTHH:MM → append :00 for seconds
      // date input gives YYYY-MM-DD → append T00:00:00 for full datetime
      const formatDate = (date) => {
        if (!date) return "";
        if (date.includes("T")) return `${date}:00`;
        return `${date}T00:00:00`;
      };

      const weekDay = formData.weekType === "weekdays" ? 1 : 0;
      const weekEnd = formData.weekType === "weekends" ? 1 : 0;
      const allDays = formData.weekType === "all" ? 1 : 0;

      const validityList = formData.validityList.map((v) => ({
        promoValidityId: "",
        validityFrom: formatDate(v.from),
        validityTo: formatDate(v.to),
        isType: "V",
      }));

      const blackoutDates = formData.blackoutDates.map((b) => ({
        promoValidityId: "",
        validityFrom: formatDate(b.from),
        validityTo: formatDate(b.to),
        isType: "B",
      }));

      // Create special rate room DTO from dynamic hotel rooms data
      const specialRateRoomDTO = hotelRoomsData.flatMap(
        (roomCategory) =>
          roomCategory.roomTypeDetailsDTOs?.flatMap(
            (roomType) =>
              roomCategory.occupancyDetailsDTOs?.map((occupancy) => {
                const rateKey = `${roomCategory.rommCategoryId}_${roomType.roomTypeId}_${occupancy.id}`;
                const rate = roomRates[rateKey] || "0";
                return {
                  hotelRoomcategoryId: String(roomCategory.rommCategoryId),
                  hotelRoomTypeId: String(roomType.roomTypeId),
                  ocuppancyTypeIid: String(occupancy.id),
                  rate: rate,
                  extraBed: false,
                  meal: false,
                  adultrate: "",
                  childrate: "",
                };
              }) || [],
          ) || [],
      );

      // Also include meal plan rates if they exist
      const mealRateDTO = rooms.flatMap((room) =>
        room.mealPlans.map((meal) => ({
          hotelRoomcategoryId: String(room.roomId),
          hotelRoomTypeId: String(room.roomId),
          ocuppancyTypeIid: String(meal.occupancyId),
          rate: meal.single || meal.double || "0",
          extraBed: !!meal.extraAdult || !!meal.extraChild,
          meal: true,
          adultrate: meal.extraAdult || "",
          childrate: meal.extraChild || "",
        })),
      );

      // Combine both room and meal rates
      const allSpecialRateRoomDTO = [...specialRateRoomDTO, ...mealRateDTO];

      const specialratesaveReq = {
        marketype: formData.marketType.map((m) => m.value),
        excludeCountrys: formData.excludeNationality.map((c) => c.value),
        promotypeArray: null,
        hotelId: String(id),
        seasonId: String(formData.season),
        specialrateId: String(editId),
        rateCode: formData.rateCode.trim(),
        weekDay,
        weekEnd,
        allDays,
        isRefund: formData.isRefundable,
        bookDate: formatDate(formData.bookByDate),
        bookDay: String(formData.bookByPriorDays),
        minlengthStay: String(formData.minimumStay),
        maxlengthStay: String(formData.maximumStay),
        remark: formData.remarks || "",
        combinedPromoId:
          formData.combinedStayPay || formData.combinedDiscount || "",
        promotype: formData.combinedStayPay
          ? "SAP"
          : formData.combinedDiscount
            ? "DSR"
            : "",
        specialRateValidityDTO: [...validityList, ...blackoutDates],
        promotionCompulsoryDTO: [],
        specialRateRoomDTO: allSpecialRateRoomDTO,
      };

      // console.log("Payload specialratesaveReq:", specialratesaveReq);
      // console.log("Combined fields - StayPay:", formData.combinedStayPay, "Discount:", formData.combinedDiscount);
      // console.log("Promotype logic - StayPay selected:", !!formData.combinedStayPay, "Discount selected:", !!formData.combinedDiscount);
      // console.log("Final promotype value:", formData.combinedStayPay ? "SAP" : formData.combinedDiscount ? "DSR" : "");

      const response = await axiosInstance.put(
        `/api/hotelSpecialRate/${editId}`,
        specialratesaveReq,
      );

      if (response.data) {
        toast.success("Special Rate Updated Successfully!");
        navigate(`/hotel-actions/${id}/promotions`);
      }
    } catch (error) {
      console.error("Update error:", error);
      toast.error("Failed to update special rate");
    }
  };

  // ✅ UI Rendering
  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Container fluid>
            {/* Header */}
            <div className="d-flex justify-content-between align-items-center mb-4 border-bottom pb-2">
              <Button
                variant="outline-secondary"
                className="rounded-pill px-3"
                onClick={() => navigate(-1)}
              >
                <FaArrowLeft className="me-2" /> Back
              </Button>
              <h4 className="fw-semibold text-dark mb-0">Edit Special Rate</h4>
            </div>

            <Card className="shadow-sm border-0 p-4 rounded-4 bg-white">
              {loading ? (
                <div className="text-center py-5">
                  <Spinner animation="border" variant="primary" />
                </div>
              ) : (
                <Form onSubmit={handleUpdate}>
                  {/* ✅ IDENTICAL UI CONTENT FROM CREATE PAGE STARTS HERE */}

                  {/* Season / Rate / Market / Exclude */}
                  <Row className="mb-4 g-4">
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label>Season *</Form.Label>
                        <Form.Select
                          value={formData.season}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              season: e.target.value,
                            })
                          }
                          className="rounded-pill"
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
                      </Form.Group>
                    </Col>

                    <Col md={3}>
                      <Form.Group>
                        <Form.Label>Rate Code *</Form.Label>
                        <Form.Control
                          value={formData.rateCode}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              rateCode: e.target.value,
                            })
                          }
                          placeholder="Enter rate code"
                        />
                      </Form.Group>
                    </Col>

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
                          onChange={(selected) =>
                            setFormData({ ...formData, marketType: selected })
                          }
                          classNamePrefix="react-select"
                          placeholder="Select Market Type"
                        />
                      </Form.Group>
                    </Col>

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

                  {/* ✅ Week Type / Refund / Booking */}
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
                    <Col md={2}>
                      <Form.Check
                        type="checkbox"
                        label="Is Refundable"
                        checked={formData.isRefundable}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            isRefundable: e.target.checked,
                          })
                        }
                      />
                    </Col>
                    <Col md={2}>
                      <Form.Group>
                        <Form.Label>Book By Date</Form.Label>
                        <Form.Control
                          type="date"
                          value={formData.bookByDate}
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
                    <Col md={2}>
                      <Form.Group>
                        <Form.Label>Min Stay *</Form.Label>
                        <Form.Control
                          type="number"
                          value={formData.minimumStay}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              minimumStay: e.target.value,
                            })
                          }
                        />
                      </Form.Group>
                    </Col>
                    <Col md={2}>
                      <Form.Group>
                        <Form.Label>Max Stay *</Form.Label>
                        <Form.Control
                          type="number"
                          value={formData.maximumStay}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              maximumStay: e.target.value,
                            })
                          }
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  {/* ✅ Validity & Blackout */}
                  <Row className="mb-4">
                    {/* ================= VALIDITY LIST ================= */}
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
                          <Row key={i} className="align-items-center mb-3">
                            {/* FROM DATE */}
                            <Col md={5}>
                              <Form.Group>
                                <Form.Label className="small mb-1">
                                  From
                                </Form.Label>
                                <Form.Control
                                  type="datetime-local"
                                  value={v.from}
                                  onChange={(e) =>
                                    handleDateChange(
                                      "validityList",
                                      i,
                                      "from",
                                      e.target.value,
                                    )
                                  }
                                />
                              </Form.Group>
                            </Col>

                            {/* TO DATE */}
                            <Col md={5}>
                              <Form.Group>
                                <Form.Label className="small mb-1">
                                  To
                                </Form.Label>
                                <Form.Control
                                  type="datetime-local"
                                  value={v.to}
                                  min={getMinValidityToDate(v.from)}
                                  onChange={(e) =>
                                    handleDateChange(
                                      "validityList",
                                      i,
                                      "to",
                                      e.target.value,
                                    )
                                  }
                                />
                              </Form.Group>
                            </Col>

                            {/* DELETE BUTTON */}
                            <Col md={2} className="d-flex align-items-end">
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

                    {/* ================= BLACKOUT DATES ================= */}
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
                          <Row key={i} className="align-items-center mb-3">
                            {/* FROM DATE */}
                            <Col md={5}>
                              <Form.Group>
                                <Form.Label className="small mb-1">
                                  From
                                </Form.Label>
                                <Form.Control
                                  type="datetime-local"
                                  value={b.from}
                                  onChange={(e) =>
                                    handleDateChange(
                                      "blackoutDates",
                                      i,
                                      "from",
                                      e.target.value,
                                    )
                                  }
                                />
                              </Form.Group>
                            </Col>

                            {/* TO DATE */}
                            <Col md={5}>
                              <Form.Group>
                                <Form.Label className="small mb-1">
                                  To
                                </Form.Label>
                                <Form.Control
                                  type="datetime-local"
                                  value={b.to}
                                  min={getMinValidityToDate(b.from)}
                                  onChange={(e) =>
                                    handleDateChange(
                                      "blackoutDates",
                                      i,
                                      "to",
                                      e.target.value,
                                    )
                                  }
                                />
                              </Form.Group>
                            </Col>

                            {/* DELETE BUTTON */}
                            <Col md={2} className="d-flex align-items-end">
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

                  {/* ✅ Room / Meal Rates */}
                  {rooms.map((room, roomIndex) => (
                    <Card
                      key={room.roomId}
                      className="p-3 mb-4 border shadow-sm rounded-4"
                    >
                      <h6 className="fw-bold text-primary mb-3">
                        <Form.Check
                          type="checkbox"
                          defaultChecked
                          label={room.roomName}
                        />
                      </h6>

                      {room.mealPlans.map((meal, mealIndex) => (
                        <Row
                          key={meal.mealPlanId}
                          className="align-items-center py-2 border-bottom"
                        >
                          <Col md={3}>
                            <Form.Label className="text-muted small">
                              {meal.mealName}
                            </Form.Label>
                          </Col>
                          <Col md={2}>
                            <Form.Control
                              type="number"
                              placeholder="Single"
                              value={meal.single}
                              onChange={(e) =>
                                handleMealRateChange(
                                  roomIndex,
                                  mealIndex,
                                  "single",
                                  e.target.value,
                                )
                              }
                            />
                          </Col>
                          <Col md={2}>
                            <Form.Control
                              type="number"
                              placeholder="Double"
                              value={meal.double}
                              onChange={(e) =>
                                handleMealRateChange(
                                  roomIndex,
                                  mealIndex,
                                  "double",
                                  e.target.value,
                                )
                              }
                            />
                          </Col>
                          <Col md={2}>
                            <Form.Control
                              type="number"
                              placeholder="Extra Adult"
                              value={meal.extraAdult}
                              onChange={(e) =>
                                handleMealRateChange(
                                  roomIndex,
                                  mealIndex,
                                  "extraAdult",
                                  e.target.value,
                                )
                              }
                            />
                          </Col>
                          <Col md={2}>
                            <Form.Control
                              type="number"
                              placeholder="Extra Child"
                              value={meal.extraChild}
                              onChange={(e) =>
                                handleMealRateChange(
                                  roomIndex,
                                  mealIndex,
                                  "extraChild",
                                  e.target.value,
                                )
                              }
                            />
                          </Col>
                        </Row>
                      ))}
                    </Card>
                  ))}

                  {/* ✅ Contract Rate Details Section */}
                  {hotelRoomsData.length > 0 && (
                    <Card className="p-3 mb-4 border shadow-sm rounded-4">
                      <h6 className="fw-bold text-primary mb-3">
                        Contract Rate Details
                      </h6>

                      {hotelRoomsData.map((roomCategory, roomIndex) => (
                        <Card
                          key={roomCategory.rommCategoryId}
                          className="mb-3 border"
                        >
                          <Card.Header className="bg-light">
                            <Form.Check
                              type="checkbox"
                              id={`room-category-${roomCategory.rommCategoryId}`}
                              label={`${roomCategory.roomCategory?.toUpperCase()}`}
                              defaultChecked
                              className="fw-bold text-primary"
                            />
                          </Card.Header>
                          <Card.Body>
                            {/* Room Types and Occupancy Rates Table */}
                            <div className="table-responsive">
                              <table className="table table-bordered">
                                <thead className="table-light">
                                  <tr>
                                    <th>Room Type</th>
                                    {roomCategory.occupancyDetailsDTOs?.map(
                                      (occupancy) => (
                                        <th key={occupancy.id}>
                                          {occupancy.occupanyType}
                                        </th>
                                      ),
                                    )}
                                    <th>Extra Bed Adult</th>
                                    <th>Extra Bed Child</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {roomCategory.roomTypeDetailsDTOs?.map(
                                    (roomType, roomTypeIndex) => (
                                      <tr key={roomType.roomTypeId}>
                                        <td className="fw-semibold">
                                          {roomType.roomTypeName}
                                        </td>
                                        {roomCategory.occupancyDetailsDTOs?.map(
                                          (occupancy, occIndex) => (
                                            <td key={occupancy.id}>
                                              <Form.Control
                                                type="number"
                                                placeholder="0"
                                                value={
                                                  roomRates[
                                                    `${roomCategory.rommCategoryId}_${roomType.roomTypeId}_${occupancy.id}`
                                                  ] || ""
                                                }
                                                onChange={(e) => {
                                                  const key = `${roomCategory.rommCategoryId}_${roomType.roomTypeId}_${occupancy.id}`;
                                                  setRoomRates((prev) => ({
                                                    ...prev,
                                                    [key]: e.target.value,
                                                  }));
                                                }}
                                                size="sm"
                                              />
                                            </td>
                                          ),
                                        )}

                                        {/* ✅ Extra Bed Adult */}
                                        <td>
                                          <Form.Control
                                            type="number"
                                            placeholder="0"
                                            value={
                                              roomRates[
                                                `${roomCategory.rommCategoryId}_${roomType.roomTypeId}_extraAdult`
                                              ] || ""
                                            }
                                            onChange={(e) => {
                                              const key = `${roomCategory.rommCategoryId}_${roomType.roomTypeId}_extraAdult`;
                                              setRoomRates((prev) => ({
                                                ...prev,
                                                [key]: e.target.value,
                                              }));
                                            }}
                                            size="sm"
                                          />
                                        </td>
                                        {/* ✅ Extra Bed Child */}
                                        <td>
                                          <Form.Control
                                            type="number"
                                            placeholder="0"
                                            value={
                                              roomRates[
                                                `${roomCategory.rommCategoryId}_${roomType.roomTypeId}_extraChild`
                                              ] || ""
                                            }
                                            onChange={(e) => {
                                              const key = `${roomCategory.rommCategoryId}_${roomType.roomTypeId}_extraChild`;
                                              setRoomRates((prev) => ({
                                                ...prev,
                                                [key]: e.target.value,
                                              }));
                                            }}
                                            size="sm"
                                          />
                                        </td>
                                      </tr>
                                    ),
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </Card.Body>
                        </Card>
                      ))}
                    </Card>
                  )}

                  {/* ✅ Additional Fields Section */}
                  <Card className="p-3 mb-4 border shadow-sm rounded-4">
                    <h6 className="fw-bold text-primary mb-3">
                      Additional Details
                    </h6>
                    <Row className="g-3">
                      {/* Remarks */}
                      <Col md={6}>
                        <Form.Group>
                          <Form.Label>Remarks</Form.Label>
                          <Form.Control
                            as="textarea"
                            rows={3}
                            placeholder="Enter remarks..."
                            value={formData.remarks || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                remarks: e.target.value,
                              })
                            }
                          />
                        </Form.Group>
                      </Col>

                      {/* Combined with Stay Pay */}
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>Combined with Stay Pay</Form.Label>
                          <Form.Select
                            value={formData.combinedStayPay || ""}
                            onChange={(e) => {
                              const selectedValue = e.target.value;
                              // console.log("Stay Pay changed to:", selectedValue);
                              setFormData({
                                ...formData,
                                combinedStayPay: selectedValue,
                                // Clear the other field when this one is selected
                                combinedDiscount: selectedValue
                                  ? ""
                                  : formData.combinedDiscount,
                              });
                            }}
                          >
                            <option value="">SELECT</option>
                            {Array.isArray(hotelPromotions) &&
                              hotelPromotions
                                .filter(
                                  (promo) => promo.promotionType === "StayPay",
                                )
                                .map((promo) => (
                                  <option key={promo.id} value={promo.id}>
                                    {promo.promotionCode}
                                  </option>
                                ))}
                          </Form.Select>
                        </Form.Group>
                      </Col>

                      {/* Combined with Discount */}
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>Combined with Discount</Form.Label>
                          <Form.Select
                            value={formData.combinedDiscount || ""}
                            onChange={(e) => {
                              const selectedValue = e.target.value;
                              // console.log("Discount changed to:", selectedValue);
                              setFormData({
                                ...formData,
                                combinedDiscount: selectedValue,
                                // Clear the other field when this one is selected
                                combinedStayPay: selectedValue
                                  ? ""
                                  : formData.combinedStayPay,
                              });
                            }}
                          >
                            <option value="">SELECT</option>
                            {Array.isArray(hotelPromotions) &&
                              hotelPromotions
                                .filter(
                                  (promo) => promo.promotionType === "Discount",
                                )
                                .map((promo) => (
                                  <option key={promo.id} value={promo.id}>
                                    {promo.promotionCode}
                                  </option>
                                ))}
                          </Form.Select>
                        </Form.Group>
                      </Col>
                    </Row>
                  </Card>

                  {/* ✅ Buttons */}
                  <div className="d-flex justify-content-end gap-3 mt-4 pt-3 border-top">
                    <Button
                      variant="outline-danger"
                      className="px-4 rounded-pill"
                      onClick={() => navigate(`/extranet/${id}}/promotions`)}
                    >
                      ✖ Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="success"
                      className="px-4 rounded-pill"
                    >
                      <FaSave className="me-2" /> Update Special Rate
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
