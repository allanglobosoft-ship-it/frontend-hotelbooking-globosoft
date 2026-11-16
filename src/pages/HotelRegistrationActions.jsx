import React, { useState, useEffect } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Badge,
  Button,
  Spinner,
  Alert,
  Modal,
  Form,
  Table,
  OverlayTrigger,
  Tooltip,
} from "react-bootstrap";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  FaArrowLeft,
  FaUser,
  FaPhone,
  FaEnvelope,
  FaMobile,
  FaCheck,
  FaAt,
  FaArrowRight,
  FaUsers,
  FaBullhorn,
  FaMoneyBill,
  FaCalendarAlt,
  FaGift,
  FaFileAlt,
  FaCheckSquare,
  FaImage,
  FaEdit,
  FaExclamationTriangle,
  FaBed,
  FaImages,
  FaEye,
  FaUnlink,
  FaCreditCard,
  FaFileContract,
  FaCog,
  FaMapMarkerAlt,
  FaStar,
  FaSwimmingPool,
  FaUtensils,
  FaSpa,
  FaWifi,
  FaHotel,
  FaSearch,
  FaEyeSlash,
} from "react-icons/fa";
import axiosInstance from "../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/TopBar";
import Select from "react-select";
import "../styles/HotelRegistrationActions.css";

// Add custom styles for mail type dropdown
const mailTypeDropdownStyles = `
  .mail-type-dropdown .react-select__menu {
    z-index: 9999 !important;
    position: fixed !important;
  }
  .mail-type-dropdown .react-select__menu-portal {
    z-index: 9999 !important;
  }
  .mail-type-dropdown .react-select__menu-list {
    z-index: 9999 !important;
  }
`;

// Inject styles
if (typeof document !== "undefined") {
  const styleSheet = document.createElement("style");
  styleSheet.type = "text/css";
  styleSheet.innerText = mailTypeDropdownStyles;
  document.head.appendChild(styleSheet);
}

const HotelRegistrationActions = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // When this hub is opened under /extranet/hotel-details/:id (hotel login),
  // keep the action links inside the /extranet namespace. The hotel-action
  // sub-pages that have an /extranet route share the SAME suffix shape, so
  // only the prefix differs. Pages without an /extranet route fall back to
  // the admin /hotel-actions path.
  const isExtranet = location.pathname.startsWith("/extranet");
  const actionsBase = isExtranet ? "/extranet" : "/hotel-actions";
  const [activeTab, setActiveTab] = useState("basic-details");
  const [hotelData, setHotelData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loginErrors, setLoginErrors] = useState({
    username: "",
    password: "",
    repassword: "",
    userroles: "",
  });

  // Modal states
  const [showMailCenterModal, setShowMailCenterModal] = useState(false);
  const [showLoginDetailsModal, setShowLoginDetailsModal] = useState(false);
  const [showImageUploadModal, setShowImageUploadModal] = useState(false);
  const [showRoomSearchModal, setShowRoomSearchModal] = useState(false);
  const [mailCenterData, setMailCenterData] = useState([]);

  // Image upload states
  const [uploadedImages, setUploadedImages] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [editingImage, setEditingImage] = useState(null);
  const [rolesList, setUserRolesList] = useState([]);

  // Room search states
  const [roomSearchForm, setRoomSearchForm] = useState({
    checkIn: "",
    checkOut: "",
    nights: 1,
    rooms: [{ adults: 1, children: 0, childAges: [] }],
    nationality: null,
    agent: "",
  });
  const [roomSearchResults, setRoomSearchResults] = useState([]);
  const [isRoomSearchLoading, setIsRoomSearchLoading] = useState(false);
  const [hasRoomSearched, setHasRoomSearched] = useState(false);
  const [roomSearchErrors, setRoomSearchErrors] = useState({});
  const [nationalityList, setNationalityList] = useState([]);
  const [agents, setAgents] = useState([]);
  const [stateList, setStateList] = useState([]);
  const [placeList, setPlaceList] = useState([]);

  console.log("hotel complete data::", hotelData);

  // Mail Center data - now fetched when modal opens
  // Removed the old useEffect as we now fetch data dynamically

  // Login Details form data
  const [loginFormData, setLoginFormData] = useState({
    username: "",
    password: "",
    repassword: "",
    userroles: [],
  });

  // Track if login details have been saved and store saved username
  const [loginDetailsSaved, setLoginDetailsSaved] = useState(false);
  const [savedUsername, setSavedUsername] = useState("");

  // Mail center save loading state
  const [isMailCenterSaving, setIsMailCenterSaving] = useState(false);
  const [mailCenterValidationError, setMailCenterValidationError] =
    useState("");
  const [isMailCenterSaved, setIsMailCenterSaved] = useState(false);
  const [isLoadingMailCenterData, setIsLoadingMailCenterData] = useState(false);

  // Login details loading state
  const [isLoadingLoginData, setIsLoadingLoginData] = useState(false);
  const [loginFormKey, setLoginFormKey] = useState(0);
  const [formTimestamp, setFormTimestamp] = useState(Date.now());
  const [showPassword, setShowPassword] = useState(false);
  const [showRePassword, setShowRePassword] = useState(false);

  // Per-module configuration counts shown next to each Action item.
  // Populated from GET /api/hotels/{id}/action-counts. Defaults to an empty
  // object so the actions array (which reads `actionCounts.xxx ?? 0`) always
  // renders 0 until the fetch resolves.
  const [actionCounts, setActionCounts] = useState({});

  const navigationTabs = [
    { id: "basic-details", label: "Basic details", icon: FaUser },
    // { id: "gallery", label: "Gallery", icon: FaImages },
    // { id: "360-view", label: "360 degree view", icon: FaEye },
    { id: "contact-details", label: "Contact details", icon: FaPhone },
    { id: "bank-details", label: "Bank details", icon: FaCreditCard },
    { id: "room-details", label: "Room details", icon: FaBed },
    {
      id: "terms-conditions",
      label: "Terms and Conditions",
      icon: FaFileContract,
    },
  ];

  // Debug: Log current status values
  console.log("🔍 Current Status Values:", {
    isMailCenterSaved,
    loginDetailsSaved,
    mailCenterStatus: isMailCenterSaved ? "success" : "pending",
    loginDetailsStatus: isMailCenterSaved
      ? loginDetailsSaved
        ? "success"
        : "pending"
      : "disabled",
  });

  // Counts come from GET /api/hotels/{id}/action-counts (single round-trip,
  // each module = one SELECT COUNT(*) — see HotelActionCountsService).
  // `mandatory: true` flags the configurations the user MUST set up before
  // a hotel is considered properly configured. Those items get a small red
  // asterisk + tooltip and switch to a warning state when count = 0.
  const actions = [
    {
      label: "Mail center",
      icon: FaAt,
      status: isMailCenterSaved ? "success" : "pending",
      count: null,
    },
    {
      label: "Login Details",
      icon: FaArrowRight,
      status: isMailCenterSaved
        ? loginDetailsSaved
          ? "success"
          : "pending"
        : "disabled",
      count: null,
    },
    {
      label: "Occupancy & Minimum length",
      icon: FaUsers,
      status: "count",
      count: actionCounts.occupancyAndMinimumLength ?? 0,
      mandatory: true,
    },
    {
      label: "Hotel Availability",
      icon: FaBullhorn,
      status: "count",
      count: actionCounts.hotelAvailability ?? 0,
    },
    {
      label: "Contract Rate",
      icon: FaMoneyBill,
      status: "count",
      count: actionCounts.contractRate ?? 0,
      mandatory: true,
    },
    // Last Minute Booking — Phase 1 entry point (separate from normal contract rate)
    {
      label: "Last Minute Contract Rate",
      icon: FaMoneyBill,
      status: "count",
      count: actionCounts.lastMinuteContractRate ?? 0,
    },
    // 24 Hour Check-In configuration entry point
    {
      label: "24 Hour Check-In",
      icon: FaCalendarAlt,
      status: "count",
      count: actionCounts.twentyFourHourCheckin ?? 0,
    },
    // Day Stay Check-In configuration entry point
    {
      label: "Day Stay",
      icon: FaCalendarAlt,
      status: "count",
      count: actionCounts.dayStay ?? 0,
    },
    {
      label: "Long Stay Contract",
      icon: FaCalendarAlt,
      status: "count",
      count: actionCounts.longStayContract ?? 0,
    },
    // Meet & Space — entry point for the new Meeting & Space feature (manage spaces + rates)
    {
      label: "Meeting & Space",
      icon: FaUsers,
      status: "count",
      count: actionCounts.meetingAndSpace ?? 0,
    },
    {
      label: "Promotion",
      icon: FaGift,
      status: "count",
      count: actionCounts.promotion ?? 0,
    },
    {
      label: "Policy",
      icon: FaFileAlt,
      status: "count",
      count: actionCounts.policy ?? 0,
      mandatory: true,
    },
    {
      label: "Govt Employee Discount",
      icon: FaGift,
      status: "count",
      count: actionCounts.govEmployeeDiscount ?? 0,
    },
    {
      label: "Student Discount",
      icon: FaGift,
      status: "count",
      count: actionCounts.studentDiscount ?? 0,
    },
    // Senior Citizen — master CRUD + per-hotel discount promotion. Opens
    // a list page from which the user can register / edit / delete senior
    // citizens and configure the discount for this hotel.
    {
      label: "Senior Citizen",
      icon: FaUser,
      status: "count",
      count: actionCounts.seniorCitizen ?? 0,
    },
    {
      label: "Compulsory Events",
      icon: FaCheckSquare,
      status: "count",
      count: actionCounts.compulsoryEvents ?? 0,
    },
    // { label: "Image Upload", icon: FaImage, status: "count", count: 0 },
    { label: "Hotel Edit", icon: FaEdit, status: "none", count: null },
    {
      label: "Validity Periods",
      icon: FaExclamationTriangle,
      status: "none",
      count: null,
    },
    // { label: "Book Hotel", icon: FaBed, status: "none", count: null },
  ];

  // Fetch hotel data
  useEffect(() => {
    const fetchHotelData = async () => {
      try {
        setIsLoading(true);
        const response = await axiosInstance.get(`/api/hotels/${id}`);
        setHotelData(response.data);
        // console.log("Hotel Data:", response.data);
        setError(null);
      } catch (error) {
        console.error("Error fetching hotel data:", error);
        setError("Failed to load hotel details");
        toast.error("Failed to load hotel details");
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      fetchHotelData();
    }
  }, [id]);

  // Fetch per-module configuration counts for the Actions panel. Backed by
  // GET /api/hotels/{id}/action-counts → HotelActionCountsService which runs
  // one SELECT COUNT(*) per module (no N+1, single round-trip). Failures
  // silently leave counts at 0 — the page still functions, just shows zeros.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    axiosInstance
      .get(`/api/hotels/${id}/action-counts`)
      .then((res) => {
        if (!cancelled && res?.data) setActionCounts(res.data);
      })
      .catch((err) => {
        console.error("Error fetching hotel action counts:", err);
        if (!cancelled) setActionCounts({});
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Reset login-related state when hotel ID changes
  useEffect(() => {
    // console.log("Hotel ID changed to:", id);
    // console.log("Resetting login state for new hotel");

    // Reset all login-related state variables
    setLoginFormData({
      username: "",
      password: "",
      repassword: "",
      userroles: [],
    });
    setLoginDetailsSaved(false);
    setSavedUsername("");
    setLoginFormKey((prev) => prev + 1);
    setFormTimestamp(Date.now()); // Update timestamp for unique keys
    setLoginErrors({
      username: "",
      password: "",
      repassword: "",
      userroles: "",
    });

    // console.log("✅ Login state reset for hotel ID:", id);
  }, [id]);

  // Load nationality and agent data
  useEffect(() => {
    const loadDropdownData = async () => {
      try {
        // Load nationalities
        const nationalityResponse = await axiosInstance.get("/api/country");
        const nationalityOptions = Array.isArray(nationalityResponse.data)
          ? nationalityResponse.data.map((country) => ({
              value: country.id,
              label: country.name,
              code: country.countryCode,
            }))
          : [];
        setNationalityList(nationalityOptions);

        // Load agents
        const agentResponse = await axiosInstance.get("/api/agent");
        setAgents(agentResponse.data || []);

        // Load states
        const statesResponse = await axiosInstance.get("/api/states");
        const stateOptions = Array.isArray(statesResponse.data)
          ? statesResponse.data.map((state) => ({
              value: state.id,
              label: state.name,
            }))
          : [];
        setStateList(stateOptions);

        // Load places
        const placesResponse = await axiosInstance.get("/api/places");
        const placeOptions = Array.isArray(placesResponse.data)
          ? placesResponse.data.map((place) => ({
              value: place.id,
              label: place.name,
            }))
          : [];
        setPlaceList(placeOptions);
      } catch (error) {
        console.error("Error loading dropdown data:", error);
      }
    };

    loadDropdownData();
  }, []);

  // Check for previously saved mail center (login details are now fetched when modal opens)
  useEffect(() => {
    const checkMailCenterStatus = async () => {
      try {
        // Check if mail center has been saved for this hotel
        const mailCenterResponse = await axiosInstance.get(
          `/api/hotels/getMailCentre/${id}`,
        );
        console.log("Mail center check response:", mailCenterResponse.data);

        // NOTE: getMailCentre returns the hotel's contact details rows even
        // when NO mail type has been assigned yet (each row just has an empty
        // mailTyIds). So "array is non-empty" does NOT mean the mail center is
        // configured. Only treat it as saved when at least one contact has an
        // actual mail type (mailTyIds) — otherwise the Login Details gate would
        // be unlocked before any mail type is set.
        const records = Array.isArray(mailCenterResponse.data)
          ? mailCenterResponse.data
          : mailCenterResponse.data &&
              typeof mailCenterResponse.data === "object"
            ? [mailCenterResponse.data]
            : [];
        const hasData = records.some(
          (r) => Array.isArray(r.mailTyIds) && r.mailTyIds.length > 0,
        );

        if (hasData) {
          console.log("✅ Mail center data found - enabling login details");
          setIsMailCenterSaved(true);
        } else {
          console.log(
            "❌ No mail center data found - login details will be disabled",
          );
          setIsMailCenterSaved(false);
        }
      } catch (error) {
        // If no data found or error, that's fine - user hasn't saved yet
        console.log("❌ No saved mail center data found for this hotel");
        setIsMailCenterSaved(false);
      }
    };

    console.log("Checking mail center status for hotelId:", id);
    if (id) {
      checkMailCenterStatus();
    }
  }, [id]);

  const getAmenityIcon = (amenityId) => {
    const iconMap = {
      1: FaSwimmingPool,
      2: FaUtensils,
      3: FaSpa,
      4: FaSpa,
      5: FaWifi,
      6: FaCog,
      7: FaCog,
      8: FaCog,
    };
    return iconMap[amenityId] || FaCheck;
  };

  // Helper function to get state name from ID.
  // Coerces both sides to String — /api/states returns numeric ids,
  // /api/hotels/{id} sometimes serializes stateId as a string (depends
  // on Jackson config), and strict === between the two silently fails,
  // which is why "State ID: 3" was rendering instead of the name.
  // Also no-ops on null/undefined so legacy rows don't print "State ID: null".
  const getStateName = (stateId) => {
    if (stateId == null || stateId === "") return "";
    const state = stateList.find((s) => String(s.value) === String(stateId));
    return state ? state.label : `State ID: ${stateId}`;
  };

  // Helper function to get place name from ID — same coercion + null guard.
  const getPlaceName = (placeId) => {
    if (placeId == null || placeId === "") return "";
    const place = placeList.find((p) => String(p.value) === String(placeId));
    return place ? place.label : `Place ID: ${placeId}`;
  };

  const renderContent = () => {
    if (!hotelData) return null;

    switch (activeTab) {
      case "basic-details":
        return (
          <div>
            <h4 className="mb-3">Basic Details</h4>
            <div className="hotel-basic-info">
              <div className="hotel-image-section mb-4">
                <div className="row">
                  {/* Left Column - Image */}
                  <div className="col-md-6">
                    <div className="hotel-image-container">
                      {hotelData.image360 ? (
                        <img
                          src={hotelData.image360}
                          alt={hotelData.hotelName}
                          className="hotel-main-image"
                          style={{
                            width: "100%",
                            height: "300px",
                            objectFit: "cover",
                            borderRadius: "8px",
                            boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                          }}
                          onError={(e) => {
                            e.target.style.display = "none";
                            e.target.nextSibling.style.display = "flex";
                          }}
                        />
                      ) : null}
                      <div
                        className="no-image-placeholder"
                        style={{
                          display: hotelData.image360 ? "none" : "flex",
                          width: "100%",
                          height: "300px",
                          borderRadius: "8px",
                        }}
                      >
                        <FaImages className="placeholder-icon" />
                        <p>NO IMAGE AVAILABLE</p>
                      </div>
                    </div>
                  </div>

                  {/* Right Column - Hotel Info */}
                  <div className="col-md-6">
                    <div className="hotel-info">
                      {/* Hotel Name */}
                      <h3 className="hotel-name mb-1">{hotelData.hotelName}</h3>

                      {/* Hotel Address */}
                      <div className="hotel-location mb-4">
                        <FaMapMarkerAlt className="location-icon" />
                        <div className="location-details">
                          <div>{hotelData.address}</div>
                          <div className="location-additional">
                            {/* Prefer the resolved names that
                                /api/hotels/{id} now returns. Fall back
                                to the master-list lookup so any caller
                                that still ships only the ids keeps
                                working. */}
                            {hotelData.stateName ||
                              getStateName(hotelData.stateId)}
                            ,{" "}
                            {hotelData.placeName ||
                              getPlaceName(hotelData.placeId)}
                          </div>
                        </div>
                      </div>

                      {/* Overview */}
                      <div className="hotel-overview mb-4">
                        <h5>Overview</h5>
                        <p className="overview-text">
                          {hotelData.hotelDescription ||
                            "No description available"}
                        </p>
                      </div>

                      {/* Amenities */}
                      <div className="amenities-section">
                        <h5 className="mb-3">Amenities</h5>
                        <div className="amenities-grid">
                          {hotelData.amenities &&
                            hotelData.amenities.map((amenity) => {
                              const IconComponent = getAmenityIcon(
                                amenity.amenityId,
                              );
                              return (
                                <div
                                  key={amenity.amenityId}
                                  className="amenity-item"
                                >
                                  <IconComponent className="amenity-icon" />
                                  <span className="amenitiesname">
                                    {" "}
                                    {amenity.amenityName}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      // case "gallery":
      //   return (
      //     <div>
      //       <h4 className="mb-3">Gallery</h4>
      //       <div className="no-image-placeholder">
      //         <FaImages className="placeholder-icon" />
      //         <p>NO IMAGE AVAILABLE</p>
      //       </div>
      //     </div>
      //   );
      // case "360-view":
      //   return (
      //     <div>
      //       <h4 className="mb-3">360 Degree View</h4>
      //       <div className="no-image-placeholder">
      //         <FaEye className="placeholder-icon" />
      //         <p>NO 360° VIEW AVAILABLE</p>
      //       </div>
      //     </div>
      //   );
      case "contact-details":
        return (
          <div>
            <h4 className="mb-3">Contact Details</h4>
            {hotelData.contactDetails && hotelData.contactDetails.length > 0 ? (
              hotelData.contactDetails.map((contact, index) => (
                <div key={index}>
                  <div className="contact-item">
                    <FaUser className="contact-icon" />
                    <span>{contact.contactPerson}</span>
                  </div>
                  <div className="contact-item">
                    <FaPhone className="contact-icon" />
                    <span>{contact.teleNumber}</span>
                  </div>
                  <div className="contact-item">
                    <FaEnvelope className="contact-icon" />
                    <span>{contact.personalEmail}</span>
                  </div>
                  <div className="contact-item">
                    <FaMobile className="contact-icon" />
                    <span>{contact.mobileNumber}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted">No contact details available</p>
            )}
          </div>
        );
      case "bank-details":
        return (
          <div>
            <h4 className="mb-3">Bank Details</h4>
            {hotelData.bankDetails && hotelData.bankDetails.length > 0 ? (
              hotelData.bankDetails.map((bank, index) => (
                <div key={index}>
                  <div className="content-item">
                    <strong>Account Number:</strong> {bank.accountNo}
                  </div>
                  <div className="content-item">
                    <strong>IBAN:</strong> {bank.iban}
                  </div>
                  <div className="content-item">
                    <strong>SWIFT Code:</strong> {bank.swiftCode}
                  </div>
                  <div className="content-item">
                    <strong>Bank Address:</strong> {bank.bankAddress}
                  </div>
                  <div className="content-item">
                    <strong>Telephone:</strong> {bank.telephone}
                  </div>
                  <div className="content-item">
                    <strong>Fax Number:</strong> {bank.faxNumber}
                  </div>
                  <div className="content-item">
                    <strong>Contact Person:</strong> {bank.contactPerson}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted">No bank details available</p>
            )}
          </div>
        );
      case "room-details":
        return (
          <div>
            <h4 className="mb-3">Room Details</h4>
            {hotelData.roomCategories && hotelData.roomCategories.length > 0 ? (
              hotelData.roomCategories.map((room, index) => (
                // console.log("room::##", room),
                <div key={index} className="room-item">
                  <div className="content-item">
                    <strong>Room Name:</strong> {room.name}
                  </div>
                  {/* <div className="content-item">
                    <strong>Room Category ID:</strong> {room.roomCategoryId}
                  </div>
                  <div className="content-item">
                    <strong>Room Type ID:</strong> {room.roomTypeId}
                  </div> */}
                  <div className="content-item">
                    <strong>Status:</strong>
                    <Badge
                      bg={room.isDeleted ? "danger" : "success"}
                      className="ms-2"
                    >
                      {room.isDeleted ? "Deleted" : "Active"}
                    </Badge>
                  </div>
                  <hr />
                </div>
              ))
            ) : (
              <p className="text-muted">No room details available</p>
            )}
          </div>
        );
      case "terms-conditions":
        return (
          <div>
            <h4 className="mb-3">Terms and Conditions</h4>
            {hotelData.termsAndConditions &&
            hotelData.termsAndConditions.length > 0 ? (
              hotelData.termsAndConditions.map((term, index) => (
                <div key={index} className="content-item">
                  <FaCheck className="check-icon" />
                  <span>{term.description}</span>
                </div>
              ))
            ) : (
              <p className="text-muted">No terms and conditions available</p>
            )}
          </div>
        );
      default:
        return <div>Select a tab to view details</div>;
    }
  };

  const getStatusIcon = (action) => {
    if (action.status === "success") {
      return <FaCheck className="status-icon success" />;
    } else if (action.status === "pending") {
      return <FaExclamationTriangle className="status-icon warning" />;
    } else if (action.status === "disabled") {
      return <FaUnlink className="status-icon disabled" />;
    } else if (action.status === "count") {
      // Mandatory + not configured → red badge + a small warning icon next to
      // it so the row reads "this is required and you haven't set it up yet."
      // Mandatory + configured → green badge (same as any other configured
      // module). Non-mandatory zeros stay subtle (light gray) so they don't
      // look like errors.
      const isMandatoryEmpty = action.mandatory && action.count === 0;
      const badgeBg = action.count > 0
        ? "success"
        : action.mandatory
          ? "danger"
          : "secondary";
      return (
        <span className="d-flex align-items-center gap-1">
          {isMandatoryEmpty && (
            <OverlayTrigger
              placement="left"
              overlay={
                <Tooltip id={`mandatory-warn-${action.label}`}>
                  Mandatory configuration missing
                </Tooltip>
              }
            >
              <FaExclamationTriangle className="status-icon warning" />
            </OverlayTrigger>
          )}
          <Badge bg={badgeBg} className="status-badge">
            {action.count}
          </Badge>
        </span>
      );
    }
    return null;
  };

  // Modal handlers
  const handleActionClick = (actionLabel) => {
    if (actionLabel === "Mail center") {
      fetchExistingMailCenterData(); // Fetch existing data when opening modal
      setShowMailCenterModal(true);
    } else if (actionLabel === "Login Details") {
      // Check if mail center has been saved first
      if (!isMailCenterSaved) {
        console.log("❌ Login Details clicked but mail center not saved");
        toast.error(
          "Please set up the Mail Center first — only then can you set login credentials.",
        );
        return;
      }
      console.log("✅ Mail center saved - opening login details modal");

      // console.log("=== LOGIN MODAL OPENING ===");
      // console.log("Hotel ID:", id);
      // console.log("Current form data before clearing:", loginFormData);
      // console.log("Current saved username:", savedUsername);
      // console.log("Current loginDetailsSaved:", loginDetailsSaved);

      // COMPLETELY reset all login-related state to ensure clean slate
      const emptyFormData = {
        username: "",
        password: "",
        repassword: "",
        userroles: [],
      };
      // console.log("🔧 Resetting form data to:", emptyFormData);
      setLoginFormData(emptyFormData);
      setLoginDetailsSaved(false);
      setSavedUsername("");
      setLoginFormKey((prev) => prev + 1); // Force form re-render
      setFormTimestamp(Date.now()); // Update timestamp for unique keys
      // console.log("✅ All login state reset - form should be completely empty");
      // console.log("About to call API: auth/checkRegisteredUserExist/" + id);

      // Show modal first, then fetch data
      setShowLoginDetailsModal(true);

      // Fetch existing login data after modal is shown with a longer delay
      setTimeout(() => {
        // console.log("🔄 About to fetch existing login data...");
        fetchExistingLoginData();
      }, 200);
    }

    // else if (actionLabel === "Image Upload") {
    //    handleImageUploadClick();
    // }
    else if (actionLabel === "Occupancy & Minimum length") {
      navigate(`${actionsBase}/${id}/occupancy-and-minimumlength`);
    } else if (actionLabel === "Hotel Edit") {
      navigate(
        isExtranet
          ? `/extranet/registration/hotel/create/${id}`
          : `/registration/hotel/create/${id}`,
      );
    } else if (actionLabel === "Compulsory Events") {
      navigate(`/registration/hotel/${id}/compulsory-events`);
    } else if (actionLabel === "Hotel Availability") {
      navigate(`${actionsBase}/${id}/hotel-availability`);
    } else if (actionLabel === "Contract Rate") {
      navigate(`${actionsBase}/${id}/contract-rate`);
    } else if (actionLabel === "Last Minute Contract Rate") {
      // Last Minute Booking module — separate page, separate APIs
      navigate(`/hotel-actions/${id}/last-minute-contract-rate`);
    } else if (actionLabel === "24 Hour Check-In") {
      // 24 Hour Check-In configuration page
      navigate(`/hotel-actions/${id}/24-hour-checkin`);
    } else if (actionLabel === "Day Stay") {
      // Day Stay contract page
      navigate(`/hotel-actions/${id}/day-stay-contract`);
    } else if (actionLabel === "Long Stay Contract") {
      navigate(`/hotel-actions/${id}/long-stay-contract`);
    } else if (actionLabel === "Meeting & Space") {
      // Meet & Space master CRUD (new feature) — separate page, separate APIs
      navigate(`/hotel-actions/${id}/meeting-space`);
    }  else if (actionLabel === "Govt Employee Discount") {
      // Government Employee Discount — per-hotel CRUD page that drives
      // the discount applied in the gov-employee search + booking flow.
      navigate(`/hotel-actions/${id}/gov-employee-promotion`);
    } else if (actionLabel === "Student Discount") {
      // Student Discount — per-hotel CRUD page that drives the discount
      // applied in the student search + booking flow.
      navigate(`/hotel-actions/${id}/student-discount`);
    } else if (actionLabel === "Senior Citizen") {
      // Senior Citizen — master CRUD for registering senior citizens +
      // per-hotel discount promotion. Drives the senior-citizen search
      // and booking flow.
      navigate(`/hotel-actions/${id}/senior-citizen`);
    }else if (actionLabel === "Promotion") {
      navigate(`${actionsBase}/${id}/promotions`);
    } else if (actionLabel === "Policy") {
      navigate(`${actionsBase}/${id}/hotel-policy`);
    } else if (actionLabel === "Validity Periods") {
      navigate(`/hotel-actions/${id}/validity-period-details`);
    } else if (actionLabel === "Book Hotel") {
      setShowRoomSearchModal(true);
      // Pre-populate search form with hotel data
      setRoomSearchForm((prev) => ({
        ...prev,
        checkIn: "",
        checkOut: "",
        nights: 1,
        rooms: [{ adults: 1, children: 0, childAges: [] }],
        nationality: null,
        agent: "",
      }));
    }
  };

  // Room search functions
  const formatDate = (date) => date.toISOString().split("T")[0];

  const getTomorrow = (date = new Date()) => {
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  };

  const today = formatDate(new Date());

  const handleRoomSearchFormChange = (field, value) => {
    setRoomSearchForm((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Clear error for this field
    if (roomSearchErrors[field]) {
      setRoomSearchErrors((prev) => {
        const { [field]: _omit, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleNightsChange = (value) => {
    const val = Math.max(1, Number(value) || 1);
    handleRoomSearchFormChange("nights", val);
    if (roomSearchForm.checkIn) {
      const start = new Date(roomSearchForm.checkIn);
      const out = new Date(start);
      out.setDate(start.getDate() + val);
      const iso = new Date(out.getTime() - out.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10);
      handleRoomSearchFormChange("checkOut", iso);
    }
  };

  const validateRoomSearchForm = () => {
    const newErrors = {};

    if (!roomSearchForm.nationality) {
      newErrors.nationality = "Nationality is required";
    }

    if (!roomSearchForm.checkIn) {
      newErrors.checkIn = "Check-in date is required";
    }

    if (!roomSearchForm.checkOut) {
      newErrors.checkOut = "Check-out date is required";
    }

    if (!roomSearchForm.agent) {
      newErrors.agent = "Agent is required";
    }

    return newErrors;
  };

  const handleRoomSearch = async (e) => {
    e.preventDefault();
    const formErrors = validateRoomSearchForm();
    if (Object.keys(formErrors).length > 0) {
      setRoomSearchErrors(formErrors);
      return;
    }

    setRoomSearchErrors({});
    setIsRoomSearchLoading(true);
    setHasRoomSearched(true);

    try {
      // Mock room search results for the specific hotel
      const mockRoomResults = [
        {
          id: "room1",
          roomType: "Standard Room",
          roomCategory: "Standard",
          maxOccupancy: 2,
          price: 150,
          currency: "AED",
          amenities: ["WiFi", "AC", "TV", "Minibar"],
          availability: 5,
          image: "https://via.placeholder.com/300x200",
        },
        {
          id: "room2",
          roomType: "Deluxe Room",
          roomCategory: "Deluxe",
          maxOccupancy: 3,
          price: 250,
          currency: "AED",
          amenities: ["WiFi", "AC", "TV", "Minibar", "Balcony"],
          availability: 3,
          image: "https://via.placeholder.com/300x200",
        },
        {
          id: "room3",
          roomType: "Suite",
          roomCategory: "Suite",
          maxOccupancy: 4,
          price: 450,
          currency: "AED",
          amenities: ["WiFi", "AC", "TV", "Minibar", "Balcony", "Kitchenette"],
          availability: 2,
          image: "https://via.placeholder.com/300x200",
        },
      ];

      // Simulate API call delay
      setTimeout(() => {
        setRoomSearchResults(mockRoomResults);
        setIsRoomSearchLoading(false);
        toast.success("Room search completed!");
      }, 1500);
    } catch (error) {
      console.error("Error searching rooms:", error);
      toast.error("Failed to search rooms");
      setIsRoomSearchLoading(false);
    }
  };

  const fetchExistingMailCenterData = async () => {
    setIsLoadingMailCenterData(true);
    try {
      const response = await axiosInstance.get(
        `/api/hotels/getMailCentre/${id}`,
      );
      console.log("📧 Mail center fetch response:", response.data);

      // Handle both single object and array responses
      let dataArray = [];
      if (Array.isArray(response.data)) {
        dataArray = response.data;
      } else if (response.data && typeof response.data === "object") {
        dataArray = [response.data]; // Convert single object to array
      }

      console.log("📊 Processed data array:", dataArray);

      if (dataArray.length > 0) {
        // If we have existing mail center data, populate the form
        const existingData = dataArray.map((item) => {
          console.log("🔍 Processing mail center item:", item);
          console.log("📋 mailTyIds from API:", item.mailTyIds);

          const mappedItem = {
            id: item.id,
            userType: "Hotel Contact",
            username: item.contactPerson || "",
            contactNumber: item.mobileNumber || item.teleNumber || "",
            mailId: item.personalEmail || "",
            mailType: item.mailTyIds
              ? item.mailTyIds.map((id) => {
                  console.log(
                    "🔄 Converting mailTyId:",
                    id,
                    "to string:",
                    id.toString(),
                  );
                  return id.toString();
                })
              : [],
          };

          console.log("🔍 Final mapped item for dropdown:", {
            id: mappedItem.id,
            mailType: mappedItem.mailType,
            mailTypeLength: mappedItem.mailType?.length,
            mailTypeIsArray: Array.isArray(mappedItem.mailType),
          });

          console.log("✅ Mapped mail center item:", mappedItem);
          console.log("📧 Final mailType array:", mappedItem.mailType);
          return mappedItem;
        });

        console.log("📊 All mapped existing data:", existingData);
        setMailCenterData(existingData);
        // Only treat as saved when at least one contact actually has a mail
        // type selected — contact rows alone don't count (see getMailCentre).
        const hasMailType = existingData.some(
          (it) => Array.isArray(it.mailType) && it.mailType.length > 0,
        );
        setIsMailCenterSaved(hasMailType);
      } else {
        // If no existing data, use the contact details from hotel data
        if (hotelData?.contactDetails) {
          const formattedData = hotelData.contactDetails.map((item) => ({
            id: item.id,
            userType: "Hotel Contact",
            username: item.contactPerson || "",
            contactNumber: item.mobileNumber || item.teleNumber || "",
            mailId: item.personalEmail || "",
            mailType: [],
          }));
          setMailCenterData(formattedData);
        }
        setIsMailCenterSaved(false);
      }
    } catch (error) {
      console.error("Error fetching mail center data:", error);
      // Fallback to contact details if API fails
      if (hotelData?.contactDetails) {
        const formattedData = hotelData.contactDetails.map((item) => ({
          id: item.id,
          userType: "Hotel Contact",
          username: item.contactPerson || "",
          contactNumber: item.mobileNumber || item.teleNumber || "",
          mailId: item.personalEmail || "",
          mailType: [],
        }));
        setMailCenterData(formattedData);
      }
      setIsMailCenterSaved(false);
    } finally {
      setIsLoadingMailCenterData(false);
    }
  };

  const fetchExistingLoginData = async () => {
    // console.log("=== FETCHING LOGIN DATA ===");
    // console.log("Hotel ID:", id);
    // console.log("Form data at start of fetch:", loginFormData);
    setIsLoadingLoginData(true);

    try {
      // Scope the existence check to the EXTRANET user type — the same type
      // the save flow (handleLoginSave) registers the hotel login under. The
      // backend keys user_accounts by (user_id + user_type_id), and a hotel
      // and an agent can share the same numeric id (e.g. both id 5). Without
      // the type the check would return the agent's account for the hotel.
      const extranetRole = rolesList.find(
        (r) => r.roleName?.toUpperCase() === "EXTRANET",
      );
      const checkUrl = extranetRole
        ? `/auth/checkRegisteredUserExist/${id}?userTypeId=${extranetRole.id}`
        : `/auth/checkRegisteredUserExist/${id}`;
      const response = await axiosInstance.post(checkUrl);
      // console.log("Login check response for hotel ID", id, ":", response.data);

      // Scenario 1: API returns successful response with userName (existing user)
      // Expected response: { "userId": 4, "userName": "kumar", "password": null, "userRoles": null }
      if (response.data && response.data.userName) {
        // console.log("✅ Existing user found for hotel ID", id, "- pre-filling username:", response.data.userName);
        // console.log("Full response data:", response.data);

        // Map role names from response to IDs from rolesList
        const roleIds = (response.data.userRoles || [])
          .map((roleName) => {
            const role = rolesList.find(
              (r) => r.roleName?.toUpperCase() === roleName.toUpperCase(),
            );
            return role ? role.id : null;
          })
          .filter((id) => id !== null);

        // Pre-fill username, keep password fields empty
        const newFormData = {
          username: response.data.userName,
          password: "",
          repassword: "",
          userroles: roleIds,
        };
        // console.log("🔧 Setting form data to:", newFormData);
        setLoginFormData(newFormData);
        setLoginDetailsSaved(true);
        setSavedUsername(response.data.userName);
        setLoginFormKey((prev) => prev + 1); // Force form re-render
        setFormTimestamp(Date.now()); // Update timestamp for unique keys
        // console.log("✅ Form populated with existing user data for hotel ID", id, "- username:", response.data.userName);
      } else {
        // API returned success but no userName - this shouldn't happen but handle it
        // console.log("⚠️ API success but no userName for hotel ID", id, "- keeping form empty");
        setLoginDetailsSaved(false);
        setSavedUsername("");
        setLoginFormKey((prev) => prev + 1); // Force form re-render
        // console.log("Form remains empty - no userName in response for hotel ID", id);
      }
    } catch (error) {
      console.error(
        "❌ Error fetching login data for hotel ID",
        id,
        ":",
        error,
      );

      // Scenario 2: API returns 400 error (new user)
      // Expected error response: { "status": 400, "error": "Bad Request", "message": "User is not Registered for id : 8", "timestamp": "..." }
      if (
        error.response &&
        error.response.status === 400 &&
        error.response.data &&
        error.response.data.message &&
        error.response.data.message.includes("User is not Registered")
      ) {
        // console.log("✅ User is not registered (400 error) for hotel ID", id, "- this is a new user");
        // console.log("Error response:", error.response.data);

        // Keep all fields empty for new user
        // console.log("🔧 Setting form data to empty for new user for hotel ID", id, "...");
        const emptyFormData = {
          username: "",
          password: "",
          repassword: "",
          userroles: [],
        };
        // console.log("🔧 Setting form data to:", emptyFormData);
        setLoginFormData(emptyFormData);
        setLoginDetailsSaved(false);
        setSavedUsername("");
        setLoginFormKey((prev) => prev + 1); // Force form re-render
        setFormTimestamp(Date.now()); // Update timestamp for unique keys
        // console.log("✅ Form data set to empty for hotel ID", id, "- username: '', password: '', repassword: ''");
        // console.log("✅ Form remains empty for new user registration for hotel ID", id);
      } else {
        // Other errors - also keep form empty
        // console.log("⚠️ Other error occurred for hotel ID", id, "- keeping form empty");
        // console.log("Error details:", error.response?.data || error.message);

        const errorFormData = {
          username: "",
          password: "",
          repassword: "",
          userroles: [],
        };
        // console.log("🔧 Setting form data to:", errorFormData);
        setLoginFormData(errorFormData);
        setLoginDetailsSaved(false);
        setSavedUsername("");
        setLoginFormKey((prev) => prev + 1); // Force form re-render
        setFormTimestamp(Date.now()); // Update timestamp for unique keys
        // console.log("Form remains empty due to other error for hotel ID", id);
      }
    } finally {
      setIsLoadingLoginData(false);
    }
  };

  const handleMailTypeChange = (id, selectedOptions) => {
    // Convert selected options to array of values
    const selectedValues = selectedOptions
      ? selectedOptions.map((option) => option.value)
      : [];

    setMailCenterData((prevData) => {
      const updatedData = prevData.map((item) =>
        item.id === id ? { ...item, mailType: selectedValues } : item,
      );
      return updatedData;
    });

    // Clear validation error when user selects mail types
    if (selectedValues.length > 0) {
      setMailCenterValidationError("");
    }
  };

  const handleMailCenterSave = async () => {
    // Validate that at least one mail type is selected
    const selectedMailTypes = mailCenterData.filter(
      (item) =>
        item.mailType &&
        Array.isArray(item.mailType) &&
        item.mailType.length > 0,
    );

    if (selectedMailTypes.length === 0) {
      setMailCenterValidationError("Please select at least one mail type");
      return;
    }

    // Clear any previous validation errors
    setMailCenterValidationError("");

    setIsMailCenterSaving(true);
    try {
      // Prepare the payload according to HotelMailCentreDTO structure
      // Get all contact details that have mail types selected
      const mailTypeData = selectedMailTypes.map((item) => ({
        hotelContactDetailsId: item.id,
        mailCentreIds: item.mailType.map((type) => parseInt(type)),
      }));

      // If we have multiple contacts with mail types, we might need to send multiple requests
      // For now, let's send the first one or combine them
      const mailCentrePayload = mailTypeData[0]; // Send the first contact's mail type

      // console.log("Mail Centre Payload:", mailCentrePayload);

      const response = await axiosInstance.post(
        `/api/hotels/addMailCentre/${id}`,
        mailCentrePayload,
      );

      if (response.data) {
        toast.success("Mail added successfully!");
        console.log("✅ Mail center saved - enabling login details");
        setIsMailCenterSaved(true); // Mark mail center as saved
        setShowMailCenterModal(false);
      } else {
        toast.error("Failed to save mail center data");
      }
    } catch (error) {
      console.error("Error saving mail center data:", error);
      toast.error(
        `Failed to save mail center data: ${
          error.response?.data?.message || error.message
        }`,
      );
    } finally {
      setIsMailCenterSaving(false);
    }
  };

  const handleLoginFormChange = (field, value) => {
    // console.log("Form change detected:", field, "=", value);
    setLoginFormData((prev) => {
      const newData = {
        ...prev,
        [field]: value,
      };
      // console.log("New form data:", newData);
      return newData;
    });
  };

  useEffect(() => {
    const userRolesList = async () => {
      try {
        const rolesRes = await axiosInstance.get("/api/userRoles");

        setUserRolesList(rolesRes.data);
      } catch (error) {
        // console.log("User roles  api call error::", error);
      }
    };

    userRolesList();
  }, []);

  const handleLoginSave = async () => {
    // console.log("its handleLoginSave click");
    // console.log("loginFormData::" ,loginFormData);

    let isValid = true;
    const errors = {
      username: "",
      password: "",
      repassword: "",
      userroles: "",
    };

    if (!loginFormData.username.trim()) {
      errors.username = "Username is required";
      isValid = false;
    } else if (loginFormData.username.length < 4) {
      errors.username = "Username must be at least 4 characters long";
      isValid = false;
    } else if (!/^[a-zA-Z0-9_]+$/.test(loginFormData.username)) {
      errors.username =
        "Username can only contain letters, numbers, and underscores";
      isValid = false;
    }

    // Password validation - only required for new saves or when password is provided
    if (loginFormData.password) {
      if (loginFormData.password.length < 8) {
        errors.password = "Password must be at least 8 characters long";
        isValid = false;
      } else if (!/(?=.*[A-Z])(?=.*[0-9])/.test(loginFormData.password)) {
        errors.password =
          "Password must contain at least one uppercase letter and one number";
        isValid = false;
      }

      if (!loginFormData.repassword) {
        errors.repassword = "Please confirm your password";
        isValid = false;
      } else if (loginFormData.password !== loginFormData.repassword) {
        errors.repassword = "Passwords do not match";
        isValid = false;
      }
    } else if (!loginDetailsSaved) {
      // Password is required only for first-time saves
      errors.password = "Password is required";
      isValid = false;
    }

    // User roles validation
    if (!loginFormData.userroles || loginFormData.userroles.length === 0) {
      errors.userroles = "At least one user role is required";
      isValid = false;
    }

    // User roles validation - set default if not provided
    // if (!loginFormData.userroles || loginFormData.userroles.length === 0) {
    //   // Set default user role for hotel extranet users
    //   loginFormData.userroles = [1]; // Assuming 1 is the default hotel role ID
    // }

    setLoginErrors(errors);

    if (isValid) {
      try {
        // setIsLoading(true);

        let activeUserRole = sessionStorage.getItem("currentActiveRole");
        console.log("currentActiveRole::", activeUserRole);
        // console.log("roleslist::", rolesList);

        let activeRoleObj = rolesList.find(
          (role) => role.roleName.toUpperCase() === "EXTRANET",
        );

        let loginPayload = null;

        if (activeRoleObj) {
          // console.log("Active role exists in rolesList:", activeUserRole);
          // console.log("activeRoleObj:", activeRoleObj);

          loginPayload = {
            userId: id, // Hotel ID
            userTypeId: activeRoleObj.id,
            userName: loginFormData.username,
            userRoleIds: loginFormData.userroles,
          };

          if (loginFormData.password) {
            loginPayload.password = loginFormData.password;
          }
        } else {
          toast.error(
            "Required role 'EXTRANET' not found. Please contact administrator.",
          );
          setIsLoading(false);
          return;
        }

        const response = await axiosInstance.post(
          "/auth/register",
          loginPayload,
        );
        // // console.log("login register success::", response);

        if (response.data) {
          toast.success("Login credentials saved successfully!");
          // Track that login details have been saved and store the username
          setLoginDetailsSaved(true);
          setSavedUsername(loginFormData.username);
          // setLoginErrors({});
          closeLoginModal();
          // await fetchAgentList(page, search);
        } else {
          toast.error(
            "Something went wrong!!Failed to save login credentials.",
          );
        }
      } catch (error) {
        console.error("Login submission failed:", error);
        toast.error(
          `Failed to save login credentials: ${
            error.response?.data?.message || error.message
          }`,
        );
      } finally {
        setIsLoading(false);
      }
    } else {
      toast.error("Please fix the errors in the form");
    }
  };

  const closeLoginModal = () => {
    setShowLoginDetailsModal(false);
  };

  const handleLoginCancel = () => {
    setShowLoginDetailsModal(false);
    setLoginFormData({
      username: "",
      password: "",
      repassword: "",
      userroles: [],
    });
    setLoginErrors({
      username: "",
      password: "",
      repassword: "",
      userroles: "",
    });
    setShowPassword(false);
    setShowRePassword(false);
  };

  // Image upload handlers
  const handleFileSelect = (event) => {
    const file = event.target.files[0]; // Get only the first file

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select only image files");
      return;
    }

    // Clear previous selection and set new single file
    setSelectedFiles([file]);
  };

  // const handleImageUpload = async () => {
  //   if (selectedFiles.length === 0) {
  //     toast.error("Please select an image to upload");
  //     return;
  //   }

  //   // Only allow single image upload based on DTO structure
  //   if (selectedFiles.length > 1) {
  //     toast.error("Please select only one image at a time");
  //     return;
  //   }

  //   setIsUploading(true);
  //   try {
  //     const formData = new FormData();
  //     const file = selectedFiles[0]; // Get the first (and only) file

  //     // Match backend DTO structure
  //     formData.append('image1', file);

  //     const response = await axiosInstance.post(`/api/hotelInventory/imageUpload/${id}/save`, formData, {
  //       headers: {
  //         'Content-Type': 'multipart/form-data',
  //       },
  //     });

  //     if (response.data) {
  //       toast.success("Image uploaded successfully!");
  //       // Add the uploaded image to the list
  //       setUploadedImages(prev => [...prev, {
  //         id: response.data.id,
  //         hotelId: response.data.hotelId,
  //         image1Path: response.data.image1Path,
  //         name: file.name
  //       }]);
  //       setSelectedFiles([]);
  //       // setShowImageUploadModal(false);
  //     }
  //   } catch (error) {
  //     console.error("Error uploading image:", error);
  //     toast.error("Failed to upload image");
  //   } finally {
  //     setIsUploading(false);
  //   }
  // };

  const removeSelectedFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // const handleImageUploadClick = () => {
  //   setShowImageUploadModal(true);
  //   fetchUploadedImages();
  // };

  // Fetch all uploaded images
  // const fetchUploadedImages = async () => {
  //   try {
  //     setIsLoadingImages(true);
  //     const response = await axiosInstance.get(`/api/hotelInventory/imageUpload/${id}/list`);
  //     setUploadedImages(response.data || []);
  //   } catch (error) {
  //     console.error("Error fetching images:", error);
  //     // toast.error("Failed to load images");
  //   } finally {
  //     setIsLoadingImages(false);
  //   }
  // };

  // Delete image
  // const handleDeleteImage = async (imageId) => {
  //   if (!window.confirm("Are you sure you want to delete this image?")) return;

  //   try {
  //     await axiosInstance.delete(`/api/hotelInventory/imageUpload/${id}/${imageId}`);
  //     toast.success("Image deleted successfully!");
  //     fetchUploadedImages(); // Refresh the list
  //   } catch (error) {
  //     console.error("Error deleting image:", error);
  //     toast.error("Failed to delete image");
  //   }
  // };

  // Update image
  // const handleUpdateImage = async () => {
  //   if (selectedFiles.length === 0) {
  //     toast.error("Please select a new image to replace the existing one");
  //     return;
  //   }

  //   setIsUploading(true);
  //   try {
  //     const formData = new FormData();
  //     const file = selectedFiles[0];

  //     formData.append('image1', file);

  //     const response = await axiosInstance.put(`/api/hotelInventory/imageUpload/${id}/${editingImage.id}`, formData, {
  //       headers: {
  //         'Content-Type': 'multipart/form-data',
  //       },
  //     });

  //     if (response.data) {
  //       toast.success("Image updated successfully!");
  //       setEditingImage(null);
  //       setSelectedFiles([]);
  //       fetchUploadedImages(); // Refresh the list
  //     }
  //   } catch (error) {
  //     console.error("Error updating image:", error);
  //     toast.error("Failed to update image");
  //   } finally {
  //     setIsUploading(false);
  //   }
  // };

  // Cancel edit
  const handleCancelEdit = () => {
    setEditingImage(null);
    setSelectedFiles([]);
  };

  if (isLoading) {
    return (
      <div
        className="min-vh-100 bg-gradient-light d-flex flex-column"
        style={{
          background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
        }}
      >
        <Topbar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="flex-grow-1 d-flex justify-content-center align-items-center">
            <div className="text-center">
              <Spinner animation="border" variant="primary" size="lg" />
              <p className="mt-3 text-muted">Loading hotel details...</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="min-vh-100 bg-gradient-light d-flex flex-column"
        style={{
          background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
        }}
      >
        <Topbar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="flex-grow-1 d-flex justify-content-center align-items-center">
            <Alert variant="danger" className="text-center">
              <FaHotel className="me-2" />
              {error}
              <Button
                variant="outline-danger"
                className="ms-3"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </Alert>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-vh-100 bg-gradient-light d-flex flex-column"
      style={{
        background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
      }}
    >
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Container fluid>
            {/* Header Section */}
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div className="d-flex align-items-center">
                <Button
                  variant="outline-primary"
                  className="back-button btn-sm d-flex align-items-center gap-2"
                  onClick={() => {
                    // Extranet (hotel) logins manage their OWN hotel via this
                    // page, so Back returns them to their dashboard. Admin
                    // behavior is unchanged — back to the hotel list.
                    const activeRole = (
                      sessionStorage.getItem("currentActiveRole") ||
                      sessionStorage.getItem("userRole") ||
                      ""
                    ).toLowerCase();
                    if (activeRole.includes("extranet")) {
                      navigate("/extranetDashboard");
                    } else {
                      navigate("/registration/hotel");
                    }
                  }}
                >
                  <FaArrowLeft /> Back
                </Button>
                <h1 className="page-title ms-3 mb-0">{hotelData.hotelName}</h1>
              </div>
            </div>

            {/* Horizontal Navigation Tabs */}
            <div className="horizontal-tabs mb-4">
              <div className="nav nav-tabs" role="tablist">
                {navigationTabs.map((tab) => (
                  <button
                    key={tab.id}
                    className={`nav-link ${
                      activeTab === tab.id ? "active" : ""
                    }`}
                    onClick={() => setActiveTab(tab.id)}
                    type="button"
                    role="tab"
                  >
                    <tab.icon className="me-2" />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Content Area with Actions */}
            <div className="main-content-area">
              <Card className="content-card">
                <Card.Body className="p-0 bg-white">
                  <Row className="h-100" style={{ minHeight: "600px" }}>
                    {/* Left Content Panel */}
                    <Col md={8} className="content-panel">
                      <div className="content-wrapper-hotel">
                        {renderContent()}
                      </div>
                    </Col>

                    {/* Right Actions Panel */}
                    <Col md={4} className="actions-panel">
                      <div className="actions-wrapper">
                        <div className="actions-header">
                          <h5 className="mb-0">Actions</h5>
                        </div>
                        <div className="actions-list">
                          {actions.map((action, index) => (
                            <div
                              key={index}
                              className="action-item"
                              onClick={() => handleActionClick(action.label)}
                              title={
                                action.label === "Login Details" &&
                                action.status === "disabled"
                                  ? "Set up the Mail Center first to enable login credentials"
                                  : action.label
                              }
                              style={{
                                cursor:
                                  action.label === "Mail center" ||
                                  (action.label === "Login Details" &&
                                    action.status !== "disabled") ||
                                  // action.label === "Image Upload" ||
                                  action.label === "Hotel Edit"
                                    ? "pointer"
                                    : "default",
                                opacity: action.status === "disabled" ? 0.4 : 1,
                                backgroundColor:
                                  action.status === "disabled"
                                    ? "#f8f9fa"
                                    : "transparent",
                                border:
                                  action.status === "disabled"
                                    ? "1px dashed #dee2e6"
                                    : "1px solid transparent",
                              }}
                            >
                              <div className="action-content">
                                <action.icon className="action-icon" />
                                <span className="action-label">
                                  {action.label}
                                  {action.mandatory && (
                                    <OverlayTrigger
                                      placement="top"
                                      overlay={
                                        <Tooltip id={`mandatory-${action.label}`}>
                                          Mandatory Configuration
                                        </Tooltip>
                                      }
                                    >
                                      <span
                                        className="text-danger ms-1 fw-bold"
                                        aria-label="Mandatory Configuration"
                                        style={{
                                          cursor: "help",
                                          fontSize: "1.3rem",
                                          lineHeight: 1,
                                          verticalAlign: "middle",
                                        }}
                                      >
                                        *
                                      </span>
                                    </OverlayTrigger>
                                  )}
                                </span>
                              </div>
                              {getStatusIcon(action)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
            </div>
          </Container>
        </main>
      </div>

      {/* Mail Center Modal */}
      <Modal
        show={showMailCenterModal}
        onHide={() => {
          setShowMailCenterModal(false);
          setMailCenterValidationError(""); // Clear validation error when closing
        }}
        size="xl"
        backdrop="static"
        keyboard={false}
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <FaAt className="me-2" />
            Mail Center
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {isLoadingMailCenterData ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
              <p className="mt-2 text-muted">Loading mail center data...</p>
            </div>
          ) : (
            <>
              <Table responsive striped hover>
                <thead>
                  <tr>
                    <th>User Type</th>
                    <th>Username</th>
                    <th>Contact Number</th>
                    <th>Mail ID</th>
                    <th>Mail Type</th>
                  </tr>
                </thead>
                <tbody>
                  {mailCenterData.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Form.Control
                          type="text"
                          value={item.userType}
                          readOnly
                          className="border-0 bg-transparent"
                        />
                      </td>
                      <td>
                        <Form.Control
                          type="text"
                          value={item.username}
                          readOnly
                          className="border-0 bg-transparent"
                        />
                      </td>
                      <td>
                        <Form.Control
                          type="text"
                          value={item.contactNumber}
                          readOnly
                          className="border-0 bg-transparent"
                        />
                      </td>
                      <td>
                        <Form.Control
                          type="text"
                          value={item.mailId}
                          readOnly
                          className="border-0 bg-transparent"
                        />
                      </td>
                      <td>
                        <Select
                          isMulti
                          options={[
                            { value: "1", label: "Login Credentials" },
                            { value: "2", label: "Voucher" },
                          ]}
                          value={
                            item.mailType
                              ? item.mailType.map((type) => ({
                                  value: String(type),
                                  label:
                                    type === "1" || type === 1
                                      ? "Login Credentials"
                                      : type === "2" || type === 2
                                        ? "Voucher"
                                        : `Unknown (${type})`,
                                }))
                              : []
                          }
                          onChange={(selectedOptions) => {
                            const selectedValues = selectedOptions
                              ? selectedOptions.map((option) => option.value)
                              : [];
                            handleMailTypeChange(item.id, selectedOptions);
                          }}
                          placeholder="Select mail types..."
                          isClearable
                          isSearchable={false}
                          className="modern-select"
                          menuPortalTarget={document.body}
                          styles={{
                            control: (base, state) => ({
                              ...base,
                              minHeight: "38px",
                              fontSize: "14px",
                              border: state.isFocused
                                ? "2px solid #007bff"
                                : "1px solid #dee2e6",
                              borderRadius: "6px",
                              boxShadow: state.isFocused
                                ? "0 0 0 0.2rem rgba(0, 123, 255, 0.25)"
                                : "none",
                              "&:hover": {
                                borderColor: state.isFocused
                                  ? "#007bff"
                                  : "#86b7fe",
                              },
                              backgroundColor: "#fff",
                            }),
                            menu: (base) => ({
                              ...base,
                              zIndex: 9999,
                            }),
                            menuPortal: (base) => ({
                              ...base,
                              zIndex: 9999,
                            }),
                            multiValue: (base) => ({
                              ...base,
                              backgroundColor: "#007bff",
                              borderRadius: "4px",
                              fontSize: "12px",
                              fontWeight: "500",
                            }),
                            multiValueLabel: (base) => ({
                              ...base,
                              color: "#fff",
                              fontSize: "12px",
                              fontWeight: "500",
                            }),
                            multiValueRemove: (base) => ({
                              ...base,
                              color: "#fff",
                              "&:hover": {
                                backgroundColor: "rgba(255, 255, 255, 0.2)",
                                color: "#fff",
                              },
                            }),
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {mailCenterValidationError && (
                <div className="alert alert-danger mt-3 mb-0" role="alert">
                  <small className="fw-bold">{mailCenterValidationError}</small>
                </div>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => {
              setShowMailCenterModal(false);
              setMailCenterValidationError(""); // Clear validation error when closing
            }}
          >
            Close
          </Button>
          <Button
            variant="primary"
            onClick={handleMailCenterSave}
            disabled={isMailCenterSaving}
          >
            {isMailCenterSaving ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Login Details Modal */}
      <Modal show={showLoginDetailsModal} onHide={handleLoginCancel} size="md">
        <Modal.Header closeButton>
          <Modal.Title>
            <FaArrowRight className="me-2" />
            Login Details
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {isLoadingLoginData ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
              <p className="mt-2 text-muted">Loading login details...</p>
            </div>
          ) : (
            <Form key={`login-form-${loginFormKey}-${formTimestamp}`}>
              {loginDetailsSaved && (
                <div className="alert alert-info mb-3" role="alert">
                  <div className="d-flex flex-column">
                    <small>
                      <strong>Existing User:</strong> {savedUsername}
                    </small>
                    <small>
                      <strong>User Role:</strong>{" "}
                      {loginFormData.userroles
                        .map((id) => {
                          const role = rolesList.find((r) => r.id === id);
                          return role ? role.roleName : id;
                        })
                        .join(", ") || "None"}
                    </small>
                  </div>
                </div>
              )}
              {!loginDetailsSaved && (
                <div className="alert alert-warning mb-3" role="alert">
                  <small>
                    <strong>New User:</strong> Please fill in all fields to
                    create new login credentials.
                  </small>
                </div>
              )}
              <Form.Group className="mb-3">
                <Form.Label>Username</Form.Label>
                <Form.Control
                  key={`username-${loginFormKey}-${id}-${formTimestamp}`}
                  name={`username-${id}-${formTimestamp}`}
                  type="text"
                  placeholder="Enter username"
                  value={loginFormData.username}
                  autoComplete="off"
                  isInvalid={!!loginErrors.username}
                  onChange={(e) => {
                    // console.log("Username field onChange triggered with value:", e.target.value);
                    handleLoginFormChange("username", e.target.value);
                  }}
                />
                {loginErrors.username && (
                  <Form.Control.Feedback type="invalid">
                    {loginErrors.username}
                  </Form.Control.Feedback>
                )}
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Password</Form.Label>
                <div className="position-relative">
                  <Form.Control
                    key={`password-${loginFormKey}-${id}-${formTimestamp}`}
                    name={`password-${id}-${formTimestamp}`}
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter password"
                    value={loginFormData.password}
                    autoComplete="new-password"
                    isInvalid={!!loginErrors.password}
                    onChange={(e) =>
                      handleLoginFormChange("password", e.target.value)
                    }
                  />
                  <Button
                    variant="link"
                    className="position-absolute end-0 top-50 translate-middle-y text-muted text-decoration-none"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ zIndex: 10 }}
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </Button>
                  {loginErrors.password && (
                    <Form.Control.Feedback type="invalid">
                      {loginErrors.password}
                    </Form.Control.Feedback>
                  )}
                </div>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Re-enter Password</Form.Label>
                <div className="position-relative">
                  <Form.Control
                    key={`repassword-${loginFormKey}-${id}-${formTimestamp}`}
                    name={`repassword-${id}-${formTimestamp}`}
                    type={showRePassword ? "text" : "password"}
                    placeholder="Re-enter password"
                    value={loginFormData.repassword}
                    autoComplete="new-password"
                    isInvalid={!!loginErrors.repassword}
                    onChange={(e) =>
                      handleLoginFormChange("repassword", e.target.value)
                    }
                  />
                  <Button
                    variant="link"
                    className="position-absolute end-0 top-50 translate-middle-y text-muted text-decoration-none"
                    onClick={() => setShowRePassword(!showRePassword)}
                    style={{ zIndex: 10 }}
                  >
                    {showRePassword ? <FaEyeSlash /> : <FaEye />}
                  </Button>
                  {loginErrors.repassword && (
                    <Form.Control.Feedback type="invalid">
                      {loginErrors.repassword}
                    </Form.Control.Feedback>
                  )}
                </div>
              </Form.Group>
              {console.log("rolesList:", rolesList)}
              <Form.Group className="mb-3">
                <Form.Label>User Roles</Form.Label>
                <Select
                  isMulti
                  // options={rolesList.map((role) => ({
                  //   value: role.id,
                  //   label: role.roleName,
                  // }))}
                  // // value={rolesList
                  // //   .filter(role => loginFormData.userroles.includes(role.id))
                  // //   .map(role => ({
                  // //     value: role.id,
                  // //     label: role.roleName
                  // //   }))
                  // // }
                  // value={rolesList
                  //   .filter((role) =>
                  //     loginFormData.userroles.includes(role.roleName),
                  //   )
                  //   .map((role) => ({
                  //     value: role.id,
                  //     label: role.roleName,
                  //   }))}
                  value={rolesList
                    .filter((role) =>
                      loginFormData.userroles.includes(role.id),
                    )
                    .map((role) => ({
                      value: role.id,
                      label: role.roleName,
                    }))}
                  options={rolesList
                    .filter(
                      (role) => role.roleName?.toUpperCase() === "EXTRANET",
                    )
                    .map((role) => ({
                      value: role.id,
                      label: role.roleName,
                    }))}
                  onChange={(selectedOptions) => {
                    const values = selectedOptions
                      ? selectedOptions.map((opt) => opt.value)
                      : [];
                    handleLoginFormChange("userroles", values);
                  }}
                  placeholder="Select user roles..."
                  className={loginErrors.userroles ? "is-invalid" : ""}
                  menuPortalTarget={document.body}
                  styles={{
                    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                    control: (base) => ({
                      ...base,
                      borderColor: loginErrors.userroles
                        ? "#dc3545"
                        : base.borderColor,
                      "&:hover": {
                        borderColor: loginErrors.userroles
                          ? "#dc3545"
                          : base.borderColor,
                      },
                    }),
                  }}
                />
                {loginErrors.userroles && (
                  <div className="text-danger small mt-1">
                    {loginErrors.userroles}
                  </div>
                )}
              </Form.Group>
            </Form>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleLoginCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleLoginSave}>
            Save
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Image Upload Modal - Currently Disabled */}

      {/* Room Search Modal */}
      <Modal
        show={showRoomSearchModal}
        onHide={() => setShowRoomSearchModal(false)}
        size="xl"
        scrollable
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <FaBed className="me-2" />
            Search Rooms - {hotelData?.hotelName || "Hotel"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* Search Form */}
          <Card className="mb-4">
            <Card.Body>
              <h5 className="mb-3">Search Criteria</h5>
              <Form onSubmit={handleRoomSearch}>
                <Row className="g-3">
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Nationality</Form.Label>
                      <Select
                        options={nationalityList}
                        value={roomSearchForm.nationality}
                        onChange={(option) =>
                          handleRoomSearchFormChange("nationality", option)
                        }
                        placeholder="Select nationality"
                        isSearchable
                        isClearable
                        className="modern-select"
                        menuPortalTarget={document.body}
                        styles={{
                          menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          control: (base) => ({
                            ...base,
                            minHeight: "38px",
                            border: "1px solid #dee2e6",
                            "&:hover": { borderColor: "#86b7fe" },
                          }),
                        }}
                      />
                      {roomSearchErrors.nationality && (
                        <div className="text-danger small mt-1">
                          {roomSearchErrors.nationality}
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Agent</Form.Label>
                      <Form.Select
                        value={roomSearchForm.agent}
                        onChange={(e) =>
                          handleRoomSearchFormChange("agent", e.target.value)
                        }
                      >
                        <option value="">Select Agent</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.companyName}
                          </option>
                        ))}
                      </Form.Select>
                      {roomSearchErrors.agent && (
                        <div className="text-danger small mt-1">
                          {roomSearchErrors.agent}
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>Check-in Date</Form.Label>
                      <Form.Control
                        type="date"
                        value={roomSearchForm.checkIn}
                        min={today}
                        onChange={(e) => {
                          const newCheckIn = e.target.value;
                          handleRoomSearchFormChange("checkIn", newCheckIn);
                          if (
                            !roomSearchForm.checkOut ||
                            new Date(newCheckIn) >=
                              new Date(roomSearchForm.checkOut)
                          ) {
                            handleRoomSearchFormChange(
                              "checkOut",
                              formatDate(getTomorrow(new Date(newCheckIn))),
                            );
                          }
                        }}
                      />
                      {roomSearchErrors.checkIn && (
                        <div className="text-danger small mt-1">
                          {roomSearchErrors.checkIn}
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>Check-out Date</Form.Label>
                      <Form.Control
                        type="date"
                        value={roomSearchForm.checkOut}
                        min={
                          roomSearchForm.checkIn
                            ? formatDate(
                                getTomorrow(new Date(roomSearchForm.checkIn)),
                              )
                            : formatDate(getTomorrow())
                        }
                        onChange={(e) =>
                          handleRoomSearchFormChange("checkOut", e.target.value)
                        }
                      />
                      {roomSearchErrors.checkOut && (
                        <div className="text-danger small mt-1">
                          {roomSearchErrors.checkOut}
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>Nights</Form.Label>
                      <Form.Control
                        type="number"
                        min={1}
                        max={60}
                        value={roomSearchForm.nights}
                        onChange={(e) => handleNightsChange(e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row className="mt-3">
                  <Col className="d-flex justify-content-center">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={isRoomSearchLoading}
                    >
                      {isRoomSearchLoading ? (
                        <>
                          <Spinner
                            animation="border"
                            size="sm"
                            className="me-2"
                          />
                          Searching Rooms...
                        </>
                      ) : (
                        <>
                          <FaSearch className="me-2" />
                          Search Rooms
                        </>
                      )}
                    </Button>
                  </Col>
                </Row>
              </Form>
            </Card.Body>
          </Card>

          {/* Search Results */}
          {hasRoomSearched && (
            <Card>
              <Card.Body>
                <h5 className="mb-3">Available Rooms</h5>
                {isRoomSearchLoading ? (
                  <div className="text-center py-4">
                    <Spinner animation="border" variant="primary" />
                    <p className="mt-2 text-muted">Searching for rooms...</p>
                  </div>
                ) : roomSearchResults.length > 0 ? (
                  <Row className="g-3">
                    {roomSearchResults.map((room) => (
                      <Col md={6} key={room.id}>
                        <Card className="h-100">
                          <Card.Img
                            variant="top"
                            src={room.image}
                            alt={room.roomType}
                            style={{ height: "200px", objectFit: "cover" }}
                          />
                          <Card.Body>
                            <Card.Title className="h6">
                              {room.roomType}
                            </Card.Title>
                            <Card.Text>
                              <small className="text-muted">
                                <FaUsers className="me-1" />
                                Max Occupancy: {room.maxOccupancy}
                              </small>
                              <br />
                              <small className="text-muted">
                                <FaBed className="me-1" />
                                Category: {room.roomCategory}
                              </small>
                              <br />
                              <small className="text-muted">
                                Available: {room.availability} rooms
                              </small>
                            </Card.Text>
                            <div className="d-flex justify-content-between align-items-center">
                              <div>
                                <strong className="text-primary">
                                  {room.currency} {room.price}
                                </strong>
                                <small className="text-muted d-block">
                                  per night
                                </small>
                              </div>
                              <Button variant="outline-primary" size="sm">
                                Book Now
                              </Button>
                            </div>
                            <div className="mt-2">
                              <small className="text-muted">
                                Amenities: {room.amenities.join(", ")}
                              </small>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                ) : (
                  <div className="text-center py-4">
                    <FaBed className="display-4 text-muted mb-3" />
                    <h5>No rooms available</h5>
                    <p className="text-muted">
                      No rooms found for the selected criteria. Try adjusting
                      your search parameters.
                    </p>
                  </div>
                )}
              </Card.Body>
            </Card>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowRoomSearchModal(false)}
          >
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default HotelRegistrationActions;
