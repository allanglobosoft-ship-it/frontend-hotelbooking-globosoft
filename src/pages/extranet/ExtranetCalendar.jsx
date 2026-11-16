import React, { useState, useEffect } from "react";
import { Card, Button, Row, Col, Modal, Badge, Spinner, Table } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import HotelTitleBadge from "../../components/HotelTitleBadge";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import {
  FaChevronLeft,
  FaChevronRight,
  FaArrowLeft,
  FaUser,
  FaEnvelope,
  FaPhone,
  FaGlobe,
  FaHotel,
  FaCalendarCheck,
  FaCalendarTimes,
  FaMoon,
  FaDoorOpen,
  FaUsers,
  FaHashtag,
} from "react-icons/fa";
import "../../styles/Calendar.css";

/**
 * Extranet (hotel-login) calendar. Same layout as the shared Calendar page,
 * but scoped to the logged-in hotel's bookings only (filtered by hotelId,
 * resolved from /api/personalProfile) and with a cleaned-up Booking Details
 * modal. Lives at /extranet/calendar.
 */
export default function ExtranetCalendar() {
  const navigate = useNavigate();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hotelId, setHotelId] = useState(null);

  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingDetails, setBookingDetails] = useState(null);
  const [loadingBookingDetails, setLoadingBookingDetails] = useState(false);

  // Resolve this hotel's id, then fetch + filter its bookings.
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const userName =
          sessionStorage.getItem("UserName");
        let hid = null;
        if (userName) {
          try {
            const profile = await axiosInstance.get(
              `/api/personalProfile/${userName}`
            );
            hid = profile.data?.id ?? null;
            setHotelId(hid);
          } catch {
            /* profile lookup failed — fall back to showing nothing below */
          }
        }

        const response = await axiosInstance.get("/api/bookings/list");
        if (response.data && response.data.success) {
          const { upcomingBookings, completedBookings, cancelledBookings } =
            response.data;

          const allBookingsData = [
            ...(upcomingBookings?.content || []),
            ...(completedBookings?.content || []),
            ...(cancelledBookings?.content || []),
          ];

          // Only this hotel's bookings.
          const mine =
            hid != null
              ? allBookingsData.filter(
                  (b) => String(b.hotelId) === String(hid)
                )
              : [];

          const calendarEvents = mine.map((booking) => {
            const checkInDate = new Date(booking.checkInDate);
            const status = (booking.bookingStatus || "").toUpperCase();

            let color = "info";
            if (status === "UPCOMING") {
              color =
                booking.confirmationStatus === "Confirmed"
                  ? "success"
                  : "warning";
            } else if (status === "COMPLETED") {
              color = "primary";
            } else if (status === "CANCELLED") {
              color = "danger";
            }

            return {
              id: booking.bookingCode,
              bookingId: booking.bookingId,
              date: checkInDate,
              status: status.toLowerCase() || "upcoming",
              color,
              bookingData: booking,
            };
          });

          setEvents(calendarEvents);
        }
      } catch (error) {
        console.error("Error fetching bookings:", error);
        toast.error("Failed to load bookings. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    return days;
  };

  const getEventsForDate = (date) => {
    if (!date) return [];
    return events.filter(
      (event) => event.date.toDateString() === date.toDateString()
    );
  };

  const navigateMonth = (direction) => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + direction);
      return newDate;
    });
  };

  const goToToday = () => setCurrentDate(new Date());

  const formatDate = (date) =>
    date.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const getEventIcon = (event) => {
    if (event.status === "cancelled") return "❌";
    if (event.status === "completed") return "✅";
    return event.status === "confirmed" ||
      event.bookingData?.confirmationStatus === "Confirmed"
      ? "👍"
      : "⏳";
  };

  const handleBookingClick = async (eventId) => {
    const event = events.find((e) => e.id === eventId);
    if (event && event.bookingData) {
      setShowBookingModal(true);
      setLoadingBookingDetails(true);
      setBookingDetails(null);
      try {
        const bookingId = event.bookingData.bookingId || event.bookingId;
        if (bookingId) {
          const response = await axiosInstance.get(
            `/api/hotel-booking/details/${bookingId}`
          );
          if (response.data && response.data.success) {
            setBookingDetails(response.data);
          } else {
            toast.error("Failed to load booking details");
          }
        }
      } catch (error) {
        console.error("Error fetching booking details:", error);
        toast.error("Failed to load booking details. Please try again.");
      } finally {
        setLoadingBookingDetails(false);
      }
    }
  };

  const closeBookingModal = () => {
    setShowBookingModal(false);
    setBookingDetails(null);
  };

  const prettyDate = (value) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const days = getDaysInMonth(currentDate);
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const header = bookingDetails?.bookingHeader;
  const guest = bookingDetails?.guestInformation;
  const details = bookingDetails?.bookingDetails;
  const confirmed = header?.confirmationStatus === "Confirmed";

  // Small labelled field used across the modal cards.
  const Field = ({ icon, label, value }) => (
    <div className="mb-2">
      <div
        className="text-muted d-flex align-items-center gap-2"
        style={{ fontSize: "0.72rem" }}
      >
        {icon}
        {label}
      </div>
      <div className="fw-semibold text-dark" style={{ fontSize: "0.9rem" }}>
        {value || "-"}
      </div>
    </div>
  );

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex align-items-center justify-content-between flex-wrap gap-2">
              <div className="d-flex align-items-center gap-3 flex-wrap">
                <span className="fw-semibold" style={{ color: "#EC0B43" }}>
                  My Bookings
                </span>
                {hotelId && <HotelTitleBadge hotelId={hotelId} />}
              </div>
              <Button
                variant="outline-secondary"
                size="sm"
                className="d-flex align-items-center gap-2"
                onClick={() => navigate("/extranetDashboard")}
              >
                <FaArrowLeft /> Back
              </Button>
            </Card.Header>

            <Card.Body className="p-0">
              <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center p-3 border-bottom">
                <div className="d-flex align-items-center">
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="me-2"
                    onClick={() => navigateMonth(-1)}
                  >
                    <FaChevronLeft />
                  </Button>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="me-2"
                    onClick={() => navigateMonth(1)}
                  >
                    <FaChevronRight />
                  </Button>
                  <Button variant="primary" size="sm" onClick={goToToday}>
                    Today
                  </Button>
                </div>
                <h5 className="text-primary mb-0 text-nowrap">
                  {formatDate(currentDate)}
                </h5>
              </div>

              {loading ? (
                <div className="text-center py-5">
                  <Spinner animation="border" variant="primary" />
                  <p className="mt-3 text-muted">Loading bookings...</p>
                </div>
              ) : (
                <div className="calendar-container">
                  <div className="d-flex">
                    {weekDays.map((day) => (
                      <div
                        key={day}
                        className="flex-fill text-center week-day-header"
                      >
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="calendar-grid">
                    {days.map((day, index) => {
                      const dayEvents = getEventsForDate(day);
                      const isToday =
                        day && day.toDateString() === new Date().toDateString();
                      return (
                        <div
                          key={index}
                          className={`calendar-day ${
                            day ? "bg-white" : "bg-light"
                          } ${isToday ? "today" : ""}`}
                        >
                          {day && (
                            <>
                              <div className="day-number">{day.getDate()}</div>
                              <div className="events-container">
                                {dayEvents.map((event, eventIndex) => (
                                  <div
                                    key={eventIndex}
                                    className="event-item"
                                    onClick={() => handleBookingClick(event.id)}
                                    style={{ cursor: "pointer" }}
                                    title="Click to view booking details"
                                  >
                                    <div className="d-flex align-items-center">
                                      <span className="me-1">
                                        {getEventIcon(event)}
                                      </span>
                                      <span className="text-truncate">
                                        {event.id}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>

          {/* ── Booking Details Modal (polished) ── */}
          <Modal
            show={showBookingModal}
            onHide={closeBookingModal}
            size="lg"
            centered
            scrollable
          >
            <Modal.Header
              closeButton
              closeVariant="white"
              style={{
                background:
                  "linear-gradient(135deg, #EC0B43 0%, #C90939 100%)",
                color: "#fff",
                borderBottom: "none",
              }}
            >
              <div className="w-100 me-3">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <Modal.Title className="fw-bold fs-5 d-flex align-items-center gap-2">
                    <FaHotel /> Booking Details
                  </Modal.Title>
                  <Badge
                    bg={confirmed ? "light" : "warning"}
                    text={confirmed ? "success" : "dark"}
                    style={{ fontSize: "0.72rem", padding: "0.45rem 0.8rem" }}
                  >
                    {header?.confirmationStatus
                      ? header.confirmationStatus.toUpperCase()
                      : "-"}
                  </Badge>
                </div>
                <div className="small" style={{ opacity: 0.9 }}>
                  <span className="me-3">
                    <FaHashtag className="me-1" />
                    {header?.bookingCode || header?.bookingId || "-"}
                  </span>
                  <span>
                    <strong>Ref:</strong> {header?.referenceNumber || "-"}
                  </span>
                </div>
              </div>
            </Modal.Header>

            <Modal.Body className="px-4 py-3 bg-light">
              {loadingBookingDetails ? (
                <div className="text-center py-5">
                  <Spinner animation="border" variant="primary" />
                  <p className="mt-2 text-muted">Loading booking details...</p>
                </div>
              ) : bookingDetails && bookingDetails.success ? (
                <>
                  {/* Top summary strip */}
                  <Row className="g-3 mb-1">
                    <Col xs={6} md={3}>
                      <div className="bg-white rounded-3 border p-3 h-100">
                        <div className="text-muted small d-flex align-items-center gap-2 mb-1">
                          <FaCalendarCheck color="#1E9E6A" /> Check-In
                        </div>
                        <div className="fw-semibold">
                          {prettyDate(details?.checkInDate)}
                        </div>
                      </div>
                    </Col>
                    <Col xs={6} md={3}>
                      <div className="bg-white rounded-3 border p-3 h-100">
                        <div className="text-muted small d-flex align-items-center gap-2 mb-1">
                          <FaCalendarTimes color="#EC0B43" /> Check-Out
                        </div>
                        <div className="fw-semibold">
                          {prettyDate(details?.checkOutDate)}
                        </div>
                      </div>
                    </Col>
                    <Col xs={6} md={3}>
                      <div className="bg-white rounded-3 border p-3 h-100">
                        <div className="text-muted small d-flex align-items-center gap-2 mb-1">
                          <FaMoon color="#6366f1" /> Nights
                        </div>
                        <div className="fw-semibold">
                          {details?.numberOfNights ?? "0"}
                        </div>
                      </div>
                    </Col>
                    <Col xs={6} md={3}>
                      <div className="bg-white rounded-3 border p-3 h-100">
                        <div className="text-muted small d-flex align-items-center gap-2 mb-1">
                          <FaDoorOpen color="#f59e0b" /> Rooms
                        </div>
                        <div className="fw-semibold">
                          {details?.numberOfRooms ?? "0"}
                        </div>
                      </div>
                    </Col>
                  </Row>

                  <Row className="g-3 mt-0">
                    {/* Guest */}
                    <Col md={7}>
                      <Card className="border-0 shadow-sm h-100">
                        <Card.Header className="bg-white fw-semibold d-flex align-items-center gap-2 py-2">
                          <FaUser color="#EC0B43" /> Guest Information
                        </Card.Header>
                        <Card.Body className="py-3">
                          <Field
                            icon={<FaUser color="#9A9A95" />}
                            label="Guest Name"
                            value={guest?.guestName}
                          />
                          <Row>
                            <Col xs={6}>
                              <Field
                                icon={<FaEnvelope color="#9A9A95" />}
                                label="Email"
                                value={guest?.email}
                              />
                            </Col>
                            <Col xs={6}>
                              <Field
                                icon={<FaPhone color="#9A9A95" />}
                                label="Mobile"
                                value={guest?.mobileNumber}
                              />
                            </Col>
                            <Col xs={6}>
                              <Field
                                icon={<FaGlobe color="#9A9A95" />}
                                label="Nationality"
                                value={guest?.nativeCountry}
                              />
                            </Col>
                            <Col xs={6}>
                              <Field
                                icon={<FaUsers color="#9A9A95" />}
                                label="Total Guests"
                                value={`${details?.numberOfAdults || 0} Adult(s)${
                                  details?.numberOfChildren > 0
                                    ? `, ${details.numberOfChildren} Child(ren)`
                                    : ""
                                }`}
                              />
                            </Col>
                          </Row>
                          {/* Hotel folded into the same card to avoid a sparse
                              full-width "Reservation" card below. */}
                          <div className="border-top pt-3 mt-1">
                            <Field
                              icon={<FaHotel color="#9A9A95" />}
                              label="Hotel"
                              value={details?.hotelName}
                            />
                          </div>
                        </Card.Body>
                      </Card>
                    </Col>

                    {/* Pricing */}
                    <Col md={5}>
                      <Card className="border-0 shadow-sm h-100">
                        <Card.Header className="bg-white fw-semibold py-2">
                          Pricing Summary
                        </Card.Header>
                        <Card.Body className="py-3 d-flex flex-column">
                          <div className="d-flex justify-content-between mb-2">
                            <span className="text-muted">Room Rate</span>
                            <span className="fw-semibold">
                              {details?.currency || "AED"}{" "}
                              {details?.total ? details.total.toFixed(2) : "0.00"}
                            </span>
                          </div>
                          <div className="d-flex justify-content-between mb-2">
                            <span className="text-muted">Nights</span>
                            <span className="fw-semibold">
                              {details?.numberOfNights ?? "0"}
                            </span>
                          </div>
                          <div className="d-flex justify-content-between mb-2">
                            <span className="text-muted">Rooms</span>
                            <span className="fw-semibold">
                              {details?.numberOfRooms ?? "0"}
                            </span>
                          </div>
                          <hr className="my-2" />
                          <div className="mt-auto d-flex justify-content-between align-items-center px-3 py-2 rounded-3 bg-light">
                            <span className="fw-bold">Total</span>
                            <span className="text-success fw-bold fs-5">
                              {details?.currency || "AED"}{" "}
                              {details?.total?.toFixed(2) || "0.00"}
                            </span>
                          </div>
                        </Card.Body>
                      </Card>
                    </Col>
                  </Row>

                  {/* Rooms table */}
                  {details?.rooms && details.rooms.length > 0 && (
                    <Card className="border-0 shadow-sm mt-3">
                      <Card.Header className="bg-white fw-semibold">
                        Room Details
                      </Card.Header>
                      <Card.Body className="p-0">
                        <div className="table-responsive">
                          <Table hover className="mb-0 align-middle">
                            <thead className="table-light">
                              <tr>
                                <th className="py-2 px-3">Room</th>
                                <th className="py-2 px-3">Category</th>
                                <th className="py-2 px-3">Meal Plan</th>
                                <th className="py-2 px-3 text-center">Adults</th>
                                <th className="py-2 px-3 text-center">Children</th>
                                <th className="py-2 px-3 text-end">Rate</th>
                              </tr>
                            </thead>
                            <tbody>
                              {details.rooms.map((room, index) => (
                                <tr key={index}>
                                  <td className="px-3">
                                    <span className="fw-bold text-primary">
                                      Room {room.roomNo || index + 1}
                                    </span>
                                  </td>
                                  <td className="px-3">
                                    {room.roomCategory || "-"}
                                  </td>
                                  <td className="px-3">{room.mealPlan || "-"}</td>
                                  <td className="px-3 text-center">
                                    {room.adults || "0"}
                                  </td>
                                  <td className="px-3 text-center">
                                    {room.children || "0"}
                                  </td>
                                  <td className="px-3 text-end">
                                    {details?.currency || "AED"}{" "}
                                    {room.rate?.toFixed(2) || "0.00"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        </div>
                      </Card.Body>
                    </Card>
                  )}
                </>
              ) : (
                <div className="text-center py-5">
                  <p className="text-muted">
                    Information unavailable at this time.
                  </p>
                </div>
              )}
            </Modal.Body>

            <Modal.Footer style={{ backgroundColor: "#f8f9fa" }}>
              <Button variant="secondary" onClick={closeBookingModal}>
                Close
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
}
