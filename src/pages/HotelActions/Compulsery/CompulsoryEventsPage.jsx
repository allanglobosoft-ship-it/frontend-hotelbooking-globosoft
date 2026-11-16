import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Container,
  Table,
  Button,
  Badge,
  Modal,
  Form,
  Row,
  Col,
  Spinner,
  Card,
  Pagination,
} from "react-bootstrap";
import { FaArrowLeft, FaPlus, FaEdit, FaTrash, FaCopy } from "react-icons/fa";
import axiosInstance from "../../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import Sidebar from "../../../components/Sidebar";
import Topbar from "../../../components/TopBar";
import HotelTitleBadge from "../../../components/HotelTitleBadge";
import Select from "react-select";

const CompulsoryEventsPage = () => {
  const { id } = useParams(); // hotelId
  const navigate = useNavigate();

  // Helper function to convert date for datetime-local input (YYYY-MM-DDTHH:mm)
  const convertDateFormat = (dateString) => {
    if (!dateString) return "";

    // Check if format is DD-MM-YYYY HH:mm:ss or DD-MM-YYYY
    const parts = dateString.split(/[- :]/); // split by -, space, or :
    if (parts.length >= 3) {
      // Assuming DD-MM-YYYY HH:mm:ss or DD-MM-YYYY order
      // parts[0] = Day, parts[1] = Month, parts[2] = Year
      const day = parts[0];
      const month = parts[1];
      const year = parts[2];

      if (day.length === 2 && month.length === 2 && year.length === 4) {
        let time = "00:00";
        if (parts.length >= 5) {
          const hour = parts[3].padStart(2, "0");
          const minute = parts[4].padStart(2, "0");
          time = `${hour}:${minute}`;
        }
        return `${year}-${month}-${day}T${time}`;
      }
    }

    // Fallback: If it's already in ISO format or similar, try to parse it
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";

    const pad = (num) => num.toString().padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  // ✅ Helper function to get minimum date for Validity To (From date + 1 minute)
  const getMinValidityToDate = (fromDate) => {
    if (!fromDate) return "";
    const date = new Date(fromDate);
    date.setMinutes(date.getMinutes() + 1); // Add 1 minute
    // Format to YYYY-MM-DDTHH:MM for datetime-local input
    const pad = (num) => num.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marketTypes, setMarketTypes] = useState([]);
  const [masterOccupancies, setMasterOccupancy] = useState([]);
  const [hotelRoomsData, setHotelRoomsData] = useState([]);
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editEvent, setEditEvent] = useState(null);

  // Status-toggle modal state — mirrors the ContractRate pattern: the
  // Active/Inactive badge in each row opens a small confirmation modal
  // that PATCHes /api/compulsoryEvent/{id}/status with the flipped value.
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  // Search + pagination
  const [searchTerm, setSearchTerm] = useState("");
  const itemsPerPage = 8;
  const [currentPage, setCurrentPage] = useState(1);

  // Form state
  const [formData, setFormData] = useState({
    supplymentCode: "",
    supplyments: "",
    marketypeIds: [],
    compulsorySupplymentsRateDTO: [
      {
        supplymentrateId: "",
        hotelRoomcategoryId: "",
        ocuppancytypeId: "",
        rate: "",
        rateAdult: "",
        rateChild: "",
      },
    ],
    compulsorySupplyValidityDTO: [
      { supplymentValidityId: "", validityFrom: "", validityTo: "" },
    ],
  });

  // Form errors state
  const [formErrors, setFormErrors] = useState({
    supplymentCode: "",
    supplyments: "",
    marketypeIds: "",
    validityFrom: "",
    validityTo: "",
  });

  // Fetch compulsory events
  const fetchEvents = async (searchQuery = searchTerm) => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(`/api/compulsoryEvent`, {
        params: {
          limit: 1000,
          search: searchQuery || undefined,
        },
      });
      setEvents(res.data || []);
    } catch (error) {
      console.error("Error fetching events:", error);
      toast.error("Failed to load compulsory events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    loadMarketTypes();
    loadMasterOcccupancies();
    loadHotelRoomDatas();
  }, [id]);

  // Open modal for create
  const handleCreate = () => {
    setEditEvent(null);
    setFormData({
      supplymentCode: "",
      supplyments: "",
      marketypeIds: [],
      compulsorySupplymentsRateDTO: [
        {
          supplymentrateId: "",
          hotelRoomcategoryId: "",
          ocuppancytypeId: "",
          rate: "",
          rateAdult: "",
          rateChild: "",
        },
      ],
      compulsorySupplyValidityDTO: [
        { supplymentValidityId: "", validityFrom: "", validityTo: "" },
      ],
    });
    setFormErrors({
      supplymentCode: "",
      supplyments: "",
      marketypeIds: "",
      validityFrom: "",
      validityTo: "",
    });
    setShowModal(true);
  };

  // Open modal for edit
  const openEdit = (event) => {
    setEditEvent(event);
    setFormData({
      supplymentId: event?.supplymentId || "",
      supplymentCode: event.supplymentCode || "",
      supplyments: event.supplyments || "",
      marketypeIds: event.marketypeIds || [],
      compulsorySupplymentsRateDTO:
        event.compulsorySupplymentsRateDTO?.length > 0
          ? event.compulsorySupplymentsRateDTO.map((rate) => ({
            ...rate,
            uniqueId: rate.uniqueId || Date.now() + Math.random(),
          }))
          : [
            {
              supplymentrateId: "",
              hotelRoomcategoryId: "",
              ocuppancytypeId: "",
              rate: "",
              rateAdult: "",
              rateChild: "",
              uniqueId: Date.now() + Math.random(),
            },
          ],
      compulsorySupplyValidityDTO:
        event.compulsorySupplyValidityDTO?.length > 0
          ? event.compulsorySupplyValidityDTO.map((validity) => ({
            ...validity,
            validityFrom: validity.validityFrom
              ? convertDateFormat(validity.validityFrom)
              : "",
            validityTo: validity.validityTo
              ? convertDateFormat(validity.validityTo)
              : "",
          }))
          : [{ supplymentValidityId: "", validityFrom: "", validityTo: "" }],
    });
    setFormErrors({
      supplymentCode: "",
      supplyments: "",
      marketypeIds: "",
      validityFrom: "",
      validityTo: "",
    });
    setShowModal(true);
  };

  // Open modal for copy
  const openCopy = (event) => {
    setEditEvent(null); // Set to null for create mode
    setFormData({
      supplymentId: "", // Clear ID for new record
      supplymentCode: event.supplymentCode
        ? `${event.supplymentCode}_COPY`
        : "",
      supplyments: event.supplyments || "",
      marketypeIds: event.marketypeIds || [],
      compulsorySupplymentsRateDTO:
        event.compulsorySupplymentsRateDTO?.length > 0
          ? event.compulsorySupplymentsRateDTO.map((rate) => ({
            ...rate,
            supplymentrateId: "", // Clear ID for new record
            uniqueId: Date.now() + Math.random(), // New unique ID for copy
          }))
          : [
            {
              supplymentrateId: "",
              hotelRoomcategoryId: "",
              ocuppancytypeId: "",
              rate: "",
              rateAdult: "",
              rateChild: "",
              uniqueId: Date.now() + Math.random(),
            },
          ],
      compulsorySupplyValidityDTO:
        event.compulsorySupplyValidityDTO?.length > 0
          ? event.compulsorySupplyValidityDTO.map((validity) => ({
            ...validity,
            supplymentValidityId: "", // Clear ID for new record
            validityFrom: validity.validityFrom
              ? convertDateFormat(validity.validityFrom)
              : "",
            validityTo: validity.validityTo
              ? convertDateFormat(validity.validityTo)
              : "",
          }))
          : [{ supplymentValidityId: "", validityFrom: "", validityTo: "" }],
    });
    setFormErrors({
      supplymentCode: "",
      supplyments: "",
      marketypeIds: "",
      validityFrom: "",
      validityTo: "",
    });
    setShowModal(true);
  };

  // Open status-toggle modal — same UX as /contract-rate.
  const handleStatusToggle = (event) => {
    setSelectedEvent(event);
    setShowStatusModal(true);
  };

  // PATCH the new isLive value, refresh the list, close the modal.
  // Matches the ContractRate flow (uses the same HotelContractRatePatchDTO
  // body shape on the backend: { isLive: boolean }).
  const updateEventStatus = async () => {
    if (!selectedEvent) return;
    try {
      setStatusUpdating(true);
      const payload = { isLive: !selectedEvent.isLive };
      await axiosInstance.patch(
        `/api/compulsoryEvent/${selectedEvent.supplymentId}/status`,
        payload
      );
      toast.success(
        selectedEvent.isLive
          ? "Compulsory event deactivated"
          : "Compulsory event activated"
      );
      await fetchEvents();
      setShowStatusModal(false);
      setSelectedEvent(null);
    } catch (error) {
      console.error("Status toggle failed:", error);
      toast.error(
        error?.response?.data?.message ||
          "Failed to update compulsory event status"
      );
    } finally {
      setStatusUpdating(false);
    }
  };

  // Handle delete
  const handleDelete = (event) => {
    Swal.fire({
      titleText: `Are you sure? You want to delete ${event.supplyments}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
      customClass: {
        popup: "swal-small",
        title: "swal-small-title",
        htmlContainer: "swal-small-text",
      },
    }).then((result) => {
      if (result.isConfirmed) {
        axiosInstance
          .delete(`/api/compulsoryEvent/${event.supplymentId}`)
          .then(() => {
            toast.success("Event deleted successfully");
            fetchEvents();
          })
          .catch(() => {
            toast.error("Sorry!! Event not deleted");
          });
      }
    });
  };

  // Validate form data
  const validateForm = () => {
    const errors = {
      supplymentCode: "",
      supplyments: "",
      marketypeIds: "",
      validityFrom: "",
      validityTo: "",
    };
    let isValid = true;

    if (!formData.supplymentCode.trim()) {
      errors.supplymentCode = "Supplement Code is required";
      isValid = false;
    }
    if (!formData.supplyments.trim()) {
      errors.supplyments = "Tagline is required";
      isValid = false;
    }
    if (formData.marketypeIds.length === 0) {
      errors.marketypeIds = "At least one Market Type is required";
      isValid = false;
    }

    // Validate only the first validity period
    if (formData.compulsorySupplyValidityDTO.length === 0) {
      errors.validityFrom = "At least one validity period is required";
      errors.validityTo = "At least one validity period is required";
      isValid = false;
    } else {
      const firstValidity = formData.compulsorySupplyValidityDTO[0];
      if (!firstValidity.validityFrom) {
        errors.validityFrom = "Validity From is required";
        isValid = false;
      }
      if (!firstValidity.validityTo) {
        errors.validityTo = "Validity To is required";
        isValid = false;
      }
      if (firstValidity.validityFrom && firstValidity.validityTo) {
        const fromDate = new Date(firstValidity.validityFrom);
        const toDate = new Date(firstValidity.validityTo);
        if (toDate <= fromDate) {
          errors.validityTo = "Validity To must be after Validity From";
          isValid = false;
        }
      }
    }

    setFormErrors(errors);
    return isValid;
  };

  // Helper to format date for payload: DD-MM-YYYY HH:mm:ss
  const formatDateForPayload = (dateString, isEndOfDay = false) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;

    const pad = (num) => num.toString().padStart(2, "0");
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = "00";

    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  };

  // Save (create)
  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      // Format validity dates to DD-MM-YYYY HH:mm:ss
      const formattedValidityDTO = formData.compulsorySupplyValidityDTO.map(
        (validity) => {
          return {
            supplymentValidityId: validity.supplymentValidityId || null,
            validityFrom: formatDateForPayload(validity.validityFrom),
            validityTo: formatDateForPayload(validity.validityTo),
          };
        }
      );

      const payload = {
        supplymentId: null,
        supplymentCode: formData.supplymentCode,
        supplyments: formData.supplyments,
        hotelId: parseInt(id),
        marketypeIds: formData.marketypeIds.map(Number),
        compulsorySupplymentsRateDTO: formData.compulsorySupplymentsRateDTO
          .filter(
            (rate) =>
              rate.hotelRoomcategoryId &&
              rate.hotelRoomcategoryId !== "" &&
              parseInt(rate.hotelRoomcategoryId) > 0
          )
          .map((rate) => ({
            supplymentrateId: rate.supplymentrateId || null,
            hotelRoomcategoryId: parseInt(rate.hotelRoomcategoryId),
            ocuppancytypeId: parseInt(rate.ocuppancytypeId) || 0,
            rate: parseFloat(rate.rate) || 0,
            rateAdult: parseFloat(rate.rateAdult) || 0,
            rateChild: parseFloat(rate.rateChild) || 0,
          })),
        compulsorySupplyValidityDTO: formattedValidityDTO,
      };

      console.log("Compulsory Event Save Payload:", payload);
      const response = await axiosInstance.post(
        "/api/compulsoryEvent/save",
        payload
      );
      console.log("Compulsory Event Save Response:", response.data);
      if (response.data) {
        toast.success("Event created successfully");
        setShowModal(false);
        fetchEvents();
      }
    } catch (error) {
      console.error("Save error:", error);
      toast.error(error.response?.data?.message || "Failed to save event");
    }
  };

  // Update (edit)
  const handleEdit = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      // Format validity dates to DD-MM-YYYY HH:mm:ss
      const formattedValidityDTO = formData.compulsorySupplyValidityDTO.map(
        (validity) => {
          return {
            supplymentValidityId: validity.supplymentValidityId || null,
            validityFrom: formatDateForPayload(validity.validityFrom),
            validityTo: formatDateForPayload(validity.validityTo),
          };
        }
      );

      const payload = {
        supplymentId: editEvent?.supplymentId || null,
        supplymentCode: formData.supplymentCode,
        supplyments: formData.supplyments,
        hotelId: parseInt(id),
        marketypeIds: formData.marketypeIds.map(Number),
        compulsorySupplymentsRateDTO: formData.compulsorySupplymentsRateDTO
          .filter(
            (rate) =>
              rate.hotelRoomcategoryId &&
              rate.hotelRoomcategoryId !== "" &&
              parseInt(rate.hotelRoomcategoryId) > 0
          )
          .map((rate) => ({
            supplymentrateId: rate.supplymentrateId || null,
            hotelRoomcategoryId: parseInt(rate.hotelRoomcategoryId),
            ocuppancytypeId: parseInt(rate.ocuppancytypeId) || 0,
            rate: parseFloat(rate.rate) || 0,
            rateAdult: parseFloat(rate.rateAdult) || 0,
            rateChild: parseFloat(rate.rateChild) || 0,
          })),
        compulsorySupplyValidityDTO: formattedValidityDTO,
      };

      console.log("Compulsory Event Update Payload:", payload);
      const response = await axiosInstance.put(
        `/api/compulsoryEvent/${editEvent.supplymentId}`,
        payload
      );
      console.log("Compulsory Event Update Response:", response.data);
      toast.success("Event updated successfully");
      setShowModal(false);
      fetchEvents();
    } catch (error) {
      console.error("Update error:", error);
      toast.error(error.response?.data?.message || "Failed to update event");
    }
  };

  const loadMarketTypes = async () => {
    try {
      const response = await axiosInstance.get("/api/marketType");
      console.log("Market Types response:", response.data);
      setMarketTypes(response.data || []);
    } catch (error) {
      console.error("Error loading market types:", error);
      toast.error("Failed to load market types");
    }
  };

  const loadMasterOcccupancies = async () => {
    try {
      const response = await axiosInstance.get(`/api/occupancyType`);
      setMasterOccupancy(response.data || []);
    } catch (error) {
      toast.error("Failed to load Master Occupancy");
    }
  };

  const loadHotelRoomDatas = async () => {
    try {
      const response = await axiosInstance.get(
        `/api/hotelRoomDetailsController/${id}`
      );
      setHotelRoomsData(response.data || []);
    } catch (error) {
      toast.error("Failed to load Hotel Rooms Data");
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? checked : type === "file" ? files[0] : value,
    }));
  };

  // Handle react-select change for marketypeIds
  const handleMarketTypeChange = (selectedOptions) => {
    const selectedIds = selectedOptions
      ? selectedOptions.map((option) => option.value)
      : [];
    setFormData((prev) => ({
      ...prev,
      marketypeIds: selectedIds,
    }));
    if (selectedIds.length > 0 && formErrors.marketypeIds) {
      setFormErrors((prev) => ({ ...prev, marketypeIds: "" }));
    }
  };

  // ---- Search & Pagination derived data ----
  const filteredEvents = events;

  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage) || 1;
  const currentData = filteredEvents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (pageNumber) => {
    if (pageNumber < 1 || pageNumber > totalPages) return;
    setCurrentPage(pageNumber);
  };

  // reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, events.length]);

  // ---- UI ----
  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Container fluid className="px-0">
            {/* Page header — mirrors /contract-rate: outline-primary
                Back + h3 title + HotelTitleBadge, sitting ABOVE the
                card rather than inside Card.Header. */}
            <div className="d-flex align-items-center gap-3 mb-3">
              <Button
                variant="outline-primary"
                onClick={() => navigate(`/hotel-details/${id}`)}
                className="d-flex align-items-center btn-sm gap-2"
              >
                <FaArrowLeft />
                Back
              </Button>
              <h3 className="mb-0">Compulsory Events</h3>
              <HotelTitleBadge hotelId={id} className="ms-2" />
            </div>

            <Card className="shadow-sm rounded-xl mb-3">
              {/* Card header — same shape as /contract-rate: primary-
                  colored title span on the left, plain search input in
                  the middle, btn-green "+ Create" on the right. */}
              <Card.Header className="d-flex justify-content-between align-items-center text-white">
                <span
                  className="fw-semibold cursor-pointer text-primary"
                  style={{ padding: "10px" }}
                >
                  Compulsory Events
                </span>
                <div className="d-flex align-items-center gap-2">
                  <div className="position-relative" style={{ width: "260px" }}>
                    <Form.Control
                      type="text"
                      placeholder="Search by code, tagline, status..."
                      value={searchTerm}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSearchTerm(value);
                        setCurrentPage(1);
                        fetchEvents(value);
                      }}
                      className="border-1 bg-light"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        className="btn btn-link position-absolute top-50 end-0 translate-middle-y"
                        style={{
                          border: "none",
                          background: "none",
                          color: "#6c757d",
                          padding: "0 12px",
                          zIndex: 10,
                        }}
                        onClick={() => {
                          setSearchTerm("");
                          setCurrentPage(1);
                          fetchEvents("");
                        }}
                        title="Clear search"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    )}
                  </div>
                </div>
                <Button className="btn-green create-btn" onClick={handleCreate}>
                  + Create
                </Button>
              </Card.Header>

              {/* ================= Table ================= */}
              <Card.Body className="p-0">
                <Table
                  striped
                  bordered
                  hover
                  responsive
                  className="mb-0 align-middle"
                >
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>S/N</th>
                      <th>Supplement Code</th>
                      <th>Tagline</th>
                      <th>Status</th>
                      <th style={{ width: 160 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="text-center py-4">
                          <Spinner animation="border" variant="primary" />
                        </td>
                      </tr>
                    ) : currentData.length > 0 ? (
                      currentData.map((ev, idx) => (
                        <tr key={ev.supplymentId}>
                          <td>{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                          <td className="text-capitalize">
                            {ev.supplymentCode}
                          </td>
                          <td className="text-capitalize">{ev.supplyments}</td>
                          <td>
                            {/* Clickable Active/Inactive badge — opens
                                the confirm modal, then PATCHes the new
                                isLive value. Color & label follow the
                                /contract-rate convention. */}
                            <Badge
                              bg={ev.isLive ? "success" : "danger"}
                              style={{ cursor: "pointer" }}
                              onClick={() => handleStatusToggle(ev)}
                              title={`Click to ${
                                ev.isLive ? "deactivate" : "activate"
                              } compulsory event`}
                            >
                              {ev.isLive ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td>
                            <div className="d-flex gap-2">
                              <Button
                                size="sm"
                                variant="outline-info"
                                className="d-flex align-items-center gap-1"
                                onClick={() => openCopy(ev)}
                                title="Copy"
                              >
                                <FaCopy /> Copy
                              </Button>
                              <Button
                                size="sm"
                                variant="outline-primary"
                                className="d-flex align-items-center gap-1"
                                onClick={() => openEdit(ev)}
                                title="Edit"
                              >
                                <FaEdit /> Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline-danger"
                                className="d-flex align-items-center gap-1"
                                onClick={() => handleDelete(ev)}
                                title="Delete"
                              >
                                <FaTrash /> Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="text-center py-4 text-muted">
                          No events found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>

                {/* ================= Pagination ================= */}
                {filteredEvents.length > itemsPerPage && (
                  <div className="d-flex justify-content-between align-items-center p-3 border-top bg-white rounded-bottom-4">
                    <small className="text-muted">
                      Showing{" "}
                      <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> to{" "}
                      <strong>
                        {Math.min(
                          currentPage * itemsPerPage,
                          filteredEvents.length
                        )}
                      </strong>{" "}
                      of <strong>{filteredEvents.length}</strong> events
                    </small>
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={currentPage === 1}
                        onClick={() => handlePageChange(currentPage - 1)}
                      />
                      {[...Array(totalPages)].map((_, i) => (
                        <Pagination.Item
                          key={i}
                          active={currentPage === i + 1}
                          onClick={() => handlePageChange(i + 1)}
                        >
                          {i + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={currentPage === totalPages}
                        onClick={() => handlePageChange(currentPage + 1)}
                      />
                    </Pagination>
                  </div>
                )}
              </Card.Body>
            </Card>

            {/* ================= Modal ================= */}
            <Modal
              show={showModal}
              onHide={() => { }} // Prevent closing on outside click
              centered
              size="lg"
              backdrop="static"
              keyboard={false}
            >
              <Modal.Header className="bg-primary text-white">
                <Modal.Title>
                  {editEvent
                    ? "Edit Compulsory Event"
                    : "Create Compulsory Event"}
                </Modal.Title>
                <Button
                  variant="link"
                  className="text-white p-0 ms-auto"
                  onClick={() => {
                    setShowModal(false);
                    setFormErrors({
                      supplymentCode: "",
                      supplyments: "",
                      marketypeIds: "",
                      validityFrom: "",
                      validityTo: "",
                    });
                  }}
                  style={{ fontSize: "1.5rem", textDecoration: "none" }}
                >
                  ×
                </Button>
              </Modal.Header>
              <Modal.Body>
                <Form>
                  <Row className="mb-3">
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="fw-semibold small">
                          Supplement Code <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Control
                          type="text"
                          value={formData.supplymentCode}
                          onChange={(e) => {
                            setFormData({
                              ...formData,
                              supplymentCode: e.target.value,
                            });
                            if (formErrors.supplymentCode) {
                              setFormErrors((prev) => ({
                                ...prev,
                                supplymentCode: "",
                              }));
                            }
                          }}
                          placeholder="Enter code"
                          className={`rounded-3 ${formErrors.supplymentCode ? "is-invalid" : ""
                            }`}
                        />
                        {formErrors.supplymentCode && (
                          <div className="invalid-feedback">
                            {formErrors.supplymentCode}
                          </div>
                        )}
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="fw-semibold small">
                          Tagline <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Control
                          type="text"
                          value={formData.supplyments}
                          onChange={(e) => {
                            setFormData({
                              ...formData,
                              supplyments: e.target.value,
                            });
                            if (formErrors.supplyments) {
                              setFormErrors((prev) => ({
                                ...prev,
                                supplyments: "",
                              }));
                            }
                          }}
                          placeholder="Enter tagline"
                          className={`rounded-3 ${formErrors.supplyments ? "is-invalid" : ""
                            }`}
                        />
                        {formErrors.supplyments && (
                          <div className="invalid-feedback">
                            {formErrors.supplyments}
                          </div>
                        )}
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="fw-semibold small">
                          Market Type <span className="text-danger">*</span>
                        </Form.Label>
                        <Select
                          isMulti
                          options={marketTypes.map((m) => ({
                            value: m.marketTypeId,
                            label: m.name,
                          }))}
                          value={marketTypes
                            .filter((m) =>
                              formData.marketypeIds.includes(m.marketTypeId)
                            )
                            .map((m) => ({
                              value: m.marketTypeId,
                              label: m.name,
                            }))}
                          onChange={(selected) => {
                            setFormData({
                              ...formData,
                              marketypeIds: selected.map((s) => s.value),
                            });
                            if (formErrors.marketypeIds) {
                              setFormErrors((prev) => ({
                                ...prev,
                                marketypeIds: "",
                              }));
                            }
                          }}
                          className={
                            formErrors.marketypeIds ? "is-invalid" : ""
                          }
                          menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
                          menuPosition="fixed"
                          styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
                        />
                        {formErrors.marketypeIds && (
                          <div className="invalid-feedback">
                            {formErrors.marketypeIds}
                          </div>
                        )}
                      </Form.Group>
                    </Col>
                  </Row>

                  {/* Rates Section */}
                  <h5 className="mt-3">Rates</h5>
                  <div className="mb-3 p-3 border rounded bg-light">
                    {hotelRoomsData.map((room, roomIdx) => (
                      <div key={roomIdx} className="mb-4">
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <h6 className="fw-bold text-primary mb-0">
                            {room.roomCategory?.toUpperCase() || "CATEGORY"}
                          </h6>
                          <Button
                            size="sm"
                            variant="success"
                            onClick={() => {
                              const newRate = {
                                supplymentrateId: "",
                                hotelRoomcategoryId:
                                  room.rommCategoryId || room.roomCategoryId,
                                ocuppancytypeId: "",
                                rate: "",
                                rateAdult: "",
                                rateChild: "",
                                uniqueId: Date.now() + Math.random(), // Add unique identifier
                              };
                              setFormData({
                                ...formData,
                                compulsorySupplymentsRateDTO: [
                                  ...formData.compulsorySupplymentsRateDTO,
                                  newRate,
                                ],
                              });
                              // toast.success("Rate added successfully");
                            }}
                          >
                            + Add Rate
                          </Button>
                        </div>

                        {/* Room Type Details */}
                        {room.roomTypeDetailsDTOs &&
                          room.roomTypeDetailsDTOs.length > 0 && (
                            <div className="mb-3">
                              <small className="text-muted">
                                <strong>Room Types:</strong>{" "}
                                {room.roomTypeDetailsDTOs
                                  .map((rt) => rt.roomTypeName)
                                  .join(", ")}
                              </small>
                            </div>
                          )}

                        <Table
                          striped
                          bordered
                          hover
                          responsive
                          className="mt-2"
                        >
                          <thead className="table-white">
                            <tr>
                              <th>Occupancy Type</th>
                              <th>Rate</th>
                              <th>Adult Rate</th>
                              <th>Child Rate</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {formData.compulsorySupplymentsRateDTO
                              .filter(
                                (rate) =>
                                  Number(rate.hotelRoomcategoryId) ===
                                  Number(
                                    room.rommCategoryId || room.roomCategoryId
                                  )
                              )
                              .map((rate, idx) => (
                                <tr key={idx}>
                                  <td>
                                    <Form.Select
                                      value={rate.ocuppancytypeId}
                                      onChange={(e) => {
                                        const newRates = [
                                          ...formData.compulsorySupplymentsRateDTO,
                                        ];
                                        const targetIdx = newRates.findIndex(
                                          (r) =>
                                            r.hotelRoomcategoryId ===
                                            rate.hotelRoomcategoryId &&
                                            r.ocuppancytypeId ===
                                            rate.ocuppancytypeId
                                        );
                                        if (targetIdx > -1) {
                                          newRates[targetIdx].ocuppancytypeId =
                                            e.target.value;
                                        } else {
                                          newRates[idx].ocuppancytypeId =
                                            e.target.value;
                                        }
                                        setFormData({
                                          ...formData,
                                          compulsorySupplymentsRateDTO:
                                            newRates,
                                        });
                                      }}
                                    >
                                      <option value="">
                                        Select Occupancy Type
                                      </option>
                                      {room.occupancyDetailsDTOs?.map(
                                        (occupancy) => (
                                          <option
                                            key={occupancy.id}
                                            value={occupancy.id}
                                          >
                                            {occupancy.occupanyType}
                                          </option>
                                        )
                                      )}
                                    </Form.Select>
                                  </td>
                                  <td>
                                    <Form.Control
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={rate.rate}
                                      onChange={(e) => {
                                        const newRates = [
                                          ...formData.compulsorySupplymentsRateDTO,
                                        ];
                                        const targetIdx = newRates.findIndex(
                                          (r) =>
                                            r.hotelRoomcategoryId ===
                                            rate.hotelRoomcategoryId &&
                                            r.ocuppancytypeId ===
                                            rate.ocuppancytypeId
                                        );
                                        if (targetIdx > -1)
                                          newRates[targetIdx].rate =
                                            e.target.value;
                                        else
                                          newRates[idx].rate = e.target.value;
                                        setFormData({
                                          ...formData,
                                          compulsorySupplymentsRateDTO:
                                            newRates,
                                        });
                                      }}
                                      placeholder="0.00"
                                    />
                                  </td>
                                  <td>
                                    <Form.Control
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={rate.rateAdult}
                                      onChange={(e) => {
                                        const newRates = [
                                          ...formData.compulsorySupplymentsRateDTO,
                                        ];
                                        const targetIdx = newRates.findIndex(
                                          (r) =>
                                            r.hotelRoomcategoryId ===
                                            rate.hotelRoomcategoryId &&
                                            r.ocuppancytypeId ===
                                            rate.ocuppancytypeId
                                        );
                                        if (targetIdx > -1)
                                          newRates[targetIdx].rateAdult =
                                            e.target.value;
                                        else
                                          newRates[idx].rateAdult =
                                            e.target.value;
                                        setFormData({
                                          ...formData,
                                          compulsorySupplymentsRateDTO:
                                            newRates,
                                        });
                                      }}
                                      placeholder="0.00"
                                    />
                                  </td>
                                  <td>
                                    <Form.Control
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={rate.rateChild}
                                      onChange={(e) => {
                                        const newRates = [
                                          ...formData.compulsorySupplymentsRateDTO,
                                        ];
                                        const targetIdx = newRates.findIndex(
                                          (r) =>
                                            r.hotelRoomcategoryId ===
                                            rate.hotelRoomcategoryId &&
                                            r.ocuppancytypeId ===
                                            rate.ocuppancytypeId
                                        );
                                        if (targetIdx > -1)
                                          newRates[targetIdx].rateChild =
                                            e.target.value;
                                        else
                                          newRates[idx].rateChild =
                                            e.target.value;
                                        setFormData({
                                          ...formData,
                                          compulsorySupplymentsRateDTO:
                                            newRates,
                                        });
                                      }}
                                      placeholder="0.00"
                                    />
                                  </td>
                                  <td>
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      onClick={() => {
                                        // Remove rate by unique identifier
                                        const newRates =
                                          formData.compulsorySupplymentsRateDTO.filter(
                                            (r) => r.uniqueId !== rate.uniqueId
                                          );
                                        setFormData({
                                          ...formData,
                                          compulsorySupplymentsRateDTO:
                                            newRates,
                                        });
                                      }}
                                    >
                                      Remove
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            {formData.compulsorySupplymentsRateDTO.filter(
                              (rate) =>
                                Number(rate.hotelRoomcategoryId) ===
                                Number(
                                  room.rommCategoryId || room.roomCategoryId
                                )
                            ).length === 0 && (
                                <tr>
                                  <td
                                    colSpan={5}
                                    className="text-center text-muted py-3"
                                  >
                                    No rates added for this room category. Click
                                    "Add Rate" to add rates.
                                  </td>
                                </tr>
                              )}
                          </tbody>
                        </Table>
                      </div>
                    ))}
                  </div>

                  {/* Validity Periods Section in a box */}
                  <h5 className="mt-3">Validity Periods</h5>
                  <div className="mb-3 p-3 border rounded bg-light">
                    <Table striped bordered hover responsive>
                      <thead>
                        <tr>
                          <th>Validity From</th>
                          <th>Validity To</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.compulsorySupplyValidityDTO.map(
                          (validity, idx) => {
                            // Calculate min date for validityTo (one day after validityFrom)
                            let minToDate = "";
                            if (validity.validityFrom) {
                              const fromDate = new Date(validity.validityFrom);
                              fromDate.setDate(fromDate.getDate() + 1);
                              minToDate = fromDate.toISOString().split("T")[0];
                            }
                            return (
                              <tr key={idx}>
                                <td>
                                  <Form.Control
                                    type="datetime-local"
                                    value={validity.validityFrom}
                                    onChange={(e) => {
                                      const newValidity = [
                                        ...formData.compulsorySupplyValidityDTO,
                                      ];
                                      newValidity[idx].validityFrom =
                                        e.target.value;
                                      // If validityTo is before new validityFrom, reset validityTo
                                      if (
                                        newValidity[idx].validityTo &&
                                        newValidity[idx].validityTo <=
                                        e.target.value
                                      ) {
                                        newValidity[idx].validityTo = "";
                                      }
                                      setFormData({
                                        ...formData,
                                        compulsorySupplyValidityDTO:
                                          newValidity,
                                      });
                                      // Clear error when user starts typing
                                      if (
                                        idx === 0 &&
                                        formErrors.validityFrom
                                      ) {
                                        setFormErrors((prev) => ({
                                          ...prev,
                                          validityFrom: "",
                                        }));
                                      }
                                    }}
                                    className={
                                      idx === 0 && formErrors.validityFrom
                                        ? "is-invalid"
                                        : ""
                                    }
                                  />
                                  {idx === 0 && formErrors.validityFrom && (
                                    <div className="invalid-feedback">
                                      {formErrors.validityFrom}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <Form.Control
                                    type="datetime-local"
                                    value={validity.validityTo}
                                    min={getMinValidityToDate(validity.validityFrom)}
                                    onChange={(e) => {
                                      const newValidity = [
                                        ...formData.compulsorySupplyValidityDTO,
                                      ];
                                      newValidity[idx].validityTo =
                                        e.target.value;
                                      setFormData({
                                        ...formData,
                                        compulsorySupplyValidityDTO:
                                          newValidity,
                                      });
                                      // Clear error when user starts typing
                                      if (idx === 0 && formErrors.validityTo) {
                                        setFormErrors((prev) => ({
                                          ...prev,
                                          validityTo: "",
                                        }));
                                      }
                                    }}
                                    className={
                                      idx === 0 && formErrors.validityTo
                                        ? "is-invalid"
                                        : ""
                                    }
                                  />
                                  {idx === 0 && formErrors.validityTo && (
                                    <div className="invalid-feedback">
                                      {formErrors.validityTo}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => {
                                      const newValidity =
                                        formData.compulsorySupplyValidityDTO.filter(
                                          (_, i) => i !== idx
                                        );
                                      setFormData({
                                        ...formData,
                                        compulsorySupplyValidityDTO:
                                          newValidity,
                                      });
                                    }}
                                  >
                                    Remove
                                  </Button>
                                </td>
                              </tr>
                            );
                          }
                        )}
                      </tbody>
                    </Table>
                    <Button
                      size="sm"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          compulsorySupplyValidityDTO: [
                            ...formData.compulsorySupplyValidityDTO,
                            {
                              supplymentValidityId: "",
                              validityFrom: "",
                              validityTo: "",
                            },
                          ],
                        })
                      }
                    >
                      + Add Validity
                    </Button>
                  </div>
                </Form>
              </Modal.Body>
              <Modal.Footer>
                <Button
                  variant="outline-secondary"
                  className="px-4 rounded-pill"
                  onClick={() => {
                    setShowModal(false);
                    setFormErrors({
                      supplymentCode: "",
                      supplyments: "",
                      marketypeIds: "",
                      validityFrom: "",
                      validityTo: "",
                    });
                  }}
                >
                  ✖ Cancel
                </Button>
                <Button
                  variant="success"
                  className="px-4 rounded-pill"
                  onClick={() => {
                    if (editEvent) {
                      handleEdit(); // Update case
                    } else {
                      handleSave(); // Create case
                    }
                  }}
                >
                  {editEvent ? "Update" : "Create"}
                </Button>
              </Modal.Footer>
            </Modal>

            {/* Status-toggle confirmation modal — mirrors /contract-rate.
                Asks the operator to confirm, then PATCHes the new
                isLive value via updateEventStatus(). */}
            <Modal
              show={showStatusModal}
              onHide={() => setShowStatusModal(false)}
              centered
              size="sm"
              backdrop="static"
              keyboard={false}
            >
              <Modal.Header closeButton={!statusUpdating}>
                <Modal.Title>Confirm Status Change</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <p>
                  Are you sure you want to{" "}
                  {selectedEvent?.isLive ? "deactivate" : "activate"} this
                  compulsory event?
                </p>
              </Modal.Body>
              <Modal.Footer>
                <Button
                  variant="secondary"
                  onClick={() => setShowStatusModal(false)}
                  disabled={statusUpdating}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={updateEventStatus}
                  disabled={statusUpdating}
                >
                  {statusUpdating ? (
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
          </Container>
        </main>
      </div>
    </div>
  );
};

export default CompulsoryEventsPage;
