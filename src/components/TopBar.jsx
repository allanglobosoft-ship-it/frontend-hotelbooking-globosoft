import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  Navbar,
  Container,
  Nav,
  Dropdown,
  Image,
  Button,
  Modal,
  Badge,
  Card,
  Row,
  Col,
  Spinner,
  Form,
} from "react-bootstrap";
import {
  FaBars,
  FaKey,
  FaUser,
  FaSignOutAlt,
  FaShoppingCart,
  FaTrash,
  FaCalendarAlt,
  FaUsers,
  FaBed,
  FaMapMarkerAlt,
  FaTicketAlt,
  FaChild,
  FaInfoCircle,
  FaArrowLeft,
  FaHotel,
  FaClock,
  FaFire,
  FaBriefcase,
  FaSun,
  FaBoxOpen,
  FaGift,
  FaCar,
  FaTaxi,
  FaGlobeAmericas,
  FaUtensils,
  FaHeart,
  FaUserFriends,
  FaPlane,
  FaLeaf,
  FaGraduationCap,
  FaUserAlt,
  FaPrayingHands,
  FaShieldAlt,
} from "react-icons/fa";
import axiosInstance from "./AxiosInstance";
import { toast } from "react-hot-toast";

export default function TopBar() {
  const location = useLocation();
  // "Back to Dashboard" shortcut shown on every page except the dashboards
  // themselves, so a click on any Quick Actions tile (or any other nav) can
  // always get back to whichever dashboard matches the current login role —
  // mirrors the same role → dashboard mapping used by PrivateRoute.jsx and
  // DashboardRedirections.jsx.
  const DASHBOARD_BY_ROLE = {
    admin: "/adminDashboard",
    agent: "/agentDashboard",
    staff: "/staffDashboard",
    extranet: "/extranetDashboard",
    super_admin: "/superAdminDashboard",
    supplier: "/supplierDashboard",
    dmc: "/dmcDashboard",
  };
  const storedRoles = (localStorage.getItem("userRole") || "")
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  const currentRole =
    localStorage.getItem("currentActiveRole")?.trim().toLowerCase() ||
    storedRoles[0] ||
    "";
  const backToDashboardPath = DASHBOARD_BY_ROLE[currentRole];
  const showBackToDashboard =
    !!backToDashboardPath && location.pathname !== backToDashboardPath;

  // Clicking the Globosoft brand mark opens this accordion for agent logins
  // only — same Quick Actions tile set as AgentDashboard.jsx's bookingActions,
  // so an agent can jump to a New Booking page from anywhere, not just the
  // dashboard. Rendered as a fixed glass overlay above the sidebar + page
  // content (not inline), so it never pushes the layout down. navHeight is
  // measured off the sticky navbar so the overlay starts right below it
  // regardless of the navbar's actual rendered height.
  const [showQuickActions, setShowQuickActions] = useState(false);
  const navRef = useRef(null);
  const [navHeight, setNavHeight] = useState(64);
  useEffect(() => {
    const measure = () => {
      if (navRef.current) setNavHeight(navRef.current.offsetHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  // Left offset so the overlay starts AFTER the sidebar instead of covering
  // it — the sidebar (and its collapse toggle) stays visible/usable while
  // the panel is open. Measured straight off the DOM (Sidebar.jsx renders
  // <aside className="sidebar"> only when expanded and only on desktop),
  // so it's naturally 0 when the sidebar is collapsed or hidden on mobile.
  const [sidebarOffset, setSidebarOffset] = useState(0);
  const measureSidebarOffset = () =>
    typeof document !== "undefined"
      ? document.querySelector(".sidebar")?.offsetWidth || 0
      : 0;
  useEffect(() => {
    if (!showQuickActions) return undefined;
    const measure = () => setSidebarOffset(measureSidebarOffset());
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [showQuickActions]);
  const quickActions = [
    { label: "Hotel",              tone: "pink",   icon: <FaHotel />,          to: "/new-booking/hotel" },
    { label: "24 Hour",            tone: "pink",   icon: <FaClock />,          to: "/new-booking/hotel-24hr" },
    { label: "Last Minute",        tone: "orange", icon: <FaFire />,           to: "/new-booking/last-minute-booking" },
    { label: "Long Stay",          tone: "purple", icon: <FaBriefcase />,      to: "/new-booking/long-stay" },
    { label: "Day Stay",           tone: "blue",   icon: <FaSun />,            to: "/new-booking/day-stay" },
    { label: "Build Your Own Pkg", tone: "green",  icon: <FaBoxOpen />,        to: "/new-booking/make-your-own-package-v2" },
    { label: "Package",            tone: "orange", icon: <FaGift />,           to: "/new-booking/package-search" },
    { label: "Transfers",          tone: "teal",   icon: <FaCar />,            to: "/new-booking/cab" },
    { label: "Chauffeur & Limo",   tone: "purple", icon: <FaTaxi />,           to: "/new-booking/scheffer-driver" },
    { label: "Tours & Activity",   tone: "green",  icon: <FaGlobeAmericas />,  to: "/new-booking/tours-and-activities" },
    { label: "Restaurant",         tone: "orange", icon: <FaUtensils />,       to: "/new-booking/restaurant" },
    { label: "Honeymoon Package",  tone: "pink",   icon: <FaHeart />,          to: "/new-booking/honeymoon" },
    { label: "Meeting Space",      tone: "purple", icon: <FaUserFriends />,    to: "/new-booking/meet-and-space" },
    { label: "Govt/Airline/Hoteliers", tone: "blue", icon: <FaPlane />,        to: "/new-booking/gov-employee" },
    { label: "Ayurveda",           tone: "green",  icon: <FaLeaf />,           to: "/new-booking/ayurveda" },
    { label: "Student",            tone: "purple", icon: <FaGraduationCap />,  to: "/new-booking/student" },
    { label: "Senior Citizen",     tone: "orange", icon: <FaUserAlt />,        to: "/new-booking/senior-citizen" },
    { label: "Religious",          tone: "orange", icon: <FaPrayingHands />,   to: "/new-booking/religious" },
  ];

  const [showCartModal, setShowCartModal] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [cartLoading, setCartLoading] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [markups, setMarkups] = useState({});

  const getCartAgentId = () =>
    sessionStorage.getItem("makeYourOwnPackageAgentId") ||
    localStorage.getItem("makeYourOwnPackageAgentId") ||
    "";

  // v2 flow detection — when set by MakeUrOwnPackageV2 on entry, every
  // mypkg cart API call below targets /api/makeYourOwnPackageV2/cart/*
  // instead of the legacy /api/makeYourOwnPackage* endpoints. The legacy
  // flow keeps working unchanged.
  const _isV2Flow = () =>
    typeof window !== "undefined" &&
    sessionStorage.getItem("makePkgFlow") === "v2";

  // URL builders so the rest of the file stays readable.
  const _fetchUrl = (uid) =>
    _isV2Flow()
      ? `/api/makeYourOwnPackageV2/cart/fetch?userId=${encodeURIComponent(uid)}`
      : `/api/makeYourOwnPackage/fetchDataFromRedis?userId=${encodeURIComponent(uid)}`;
  const _deleteUrl = () =>
    _isV2Flow()
      ? "/api/makeYourOwnPackageV2/cart/remove"
      : "/api/makeYourOwnPackage/deleteFromCart";
  const _clearUrl = () =>
    _isV2Flow()
      ? "/api/makeYourOwnPackageV2/cart/clear"
      : "/api/makeYourOwnPackage/clearFromCart";

  const getCartKey = (item) => {
    if (!item) return "";
    return (
      item.cartKey ||
      item.id ||
      item.key ||
      item.activity?.cartKey ||
      item.activity?.id ||
      item.activity?.activityId ||
      item.hotel?.cartKey ||
      item.cab?.cartKey ||
      ""
    );
  };

  const renderActivityItem = (item, key) => {
    const activity = item.activity;
    if (!activity) return null;

    return (
      <Card key={key} className="border-0 shadow-sm mb-3 overflow-hidden" style={{ borderRadius: "12px", borderLeft: "4px solid #0dcaf0" }}>
        <Card.Body className="p-3">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div className="d-flex align-items-center gap-2">
              <div className="bg-light p-2 rounded-3 text-info">
                <FaTicketAlt size={18} />
              </div>
              <div>
                <span className="text-muted x-small text-uppercase fw-bold ls-1" style={{ fontSize: "10px" }}>Activity</span>
                <h6 className="fw-bold mb-0 text-dark">
                  {activity.activityName || "Activity"}
                </h6>
              </div>
            </div>
            <Button
              variant="link"
              className="text-danger p-0 text-decoration-none small d-flex align-items-center"
              onClick={() => handleRemoveFromCart(item)}
            >
              <FaTrash size={12} className="me-1" /> <span style={{ fontSize: "13px" }}>Remove</span>
            </Button>
          </div>

          <Row className="g-3 align-items-end">
            <Col md={8}>
              <Row className="g-2 text-muted" style={{ fontSize: "13px" }}>
                <Col xs={6} className="d-flex align-items-center">
                  <FaCalendarAlt className="me-2 opacity-50" />
                  <span>{activity.activityDate || "-"}</span>
                </Col>
                <Col xs={6} className="d-flex align-items-center">
                  <FaUsers className="me-2 opacity-50" />
                  <span>{activity.adult || 0} Adults, {activity.child || 0} Children</span>
                </Col>
                <Col xs={12} className="d-flex align-items-center">
                  <FaMapMarkerAlt className="me-2 opacity-50" />
                  <span className="text-truncate">Rate: <span className="text-dark fw-bold">AED {activity.totalRate || "-"}</span></span>
                </Col>
              </Row>
            </Col>
            <Col md={4}>
              <div className="bg-light p-2 rounded-3 border">
                <Form.Label className="mb-1 x-small fw-bold text-muted" style={{ fontSize: "10px" }}>ADDITIONAL MARKUP %</Form.Label>
                <div className="input-group input-group-sm">
                  <Form.Control
                    type="number"
                    placeholder="0"
                    className="fw-bold text-primary shadow-none border-0 bg-transparent"
                    style={{ fontSize: "15px" }}
                    value={markups[getCartKey(item)] || ""}
                    onChange={(e) =>
                      setMarkups((prev) => ({
                        ...prev,
                        [getCartKey(item)]: e.target.value,
                      }))
                    }
                  />
                  <span className="input-group-text bg-transparent border-0 text-muted fw-bold">%</span>
                </div>
              </div>
            </Col>
          </Row>
        </Card.Body>
      </Card>
    );
  };

  const renderHotelItem = (item, key) => {
    const hotel = item.hotel || {};
    const details = hotel.details || {};

    const hotelName = hotel.hotelName || "Hotel";
    const checkIn = hotel.checkIn || details.checkInDate || details.checkIn || "";
    const checkOut = hotel.checkOut || details.checkOutDate || details.checkOut || "";
    const roomCategory = hotel.roomCategory || details.roomCategory || "";
    const roomType = hotel.roomType || details.mealPlan || "";
    const totalRate = hotel.totalRate || "";
    
    const searchRoomDTOs = hotel.searchRoomDTOs || details.searchRoomDTOs || [];
    let totalAdults = 0;
    let totalChildren = 0;
    
    if (searchRoomDTOs.length > 0) {
      searchRoomDTOs.forEach((room) => {
        totalAdults += parseInt(room.adult || room.adults || 0);
        totalChildren += parseInt(room.child || room.children || 0);
      });
    } else {
      totalAdults = parseInt(hotel.adult || details.adult || 0);
      totalChildren = parseInt(hotel.child || details.child || 0);
    }

    return (
      <Card key={key} className="border-0 shadow-sm mb-3 overflow-hidden" style={{ borderRadius: "12px", borderLeft: "4px solid #0d6efd" }}>
        <Card.Body className="p-3">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div className="d-flex align-items-center gap-2">
              <div className="bg-light p-2 rounded-3 text-primary">
                <FaBed size={18} />
              </div>
              <div>
                <span className="text-muted x-small text-uppercase fw-bold ls-1" style={{ fontSize: "10px" }}>Hotel</span>
                <h6 className="fw-bold mb-0 text-dark">{hotelName}</h6>
              </div>
            </div>
            <Button
              variant="link"
              className="text-danger p-0 text-decoration-none small d-flex align-items-center"
              onClick={() => handleRemoveFromCart(item)}
            >
              <FaTrash size={12} className="me-1" /> <span style={{ fontSize: "13px" }}>Remove</span>
            </Button>
          </div>

          <Row className="g-3 align-items-end">
            <Col md={8}>
              <div className="mb-2 border-bottom pb-2">
                <span className="text-muted small d-block">Room & Plan</span>
                <span className="fw-bold small text-dark">{roomCategory} • {roomType}</span>
              </div>
              <Row className="g-2 text-muted" style={{ fontSize: "13px" }}>
                <Col xs={6} className="d-flex align-items-center">
                  <FaCalendarAlt className="me-2 opacity-50" />
                  <span>{checkIn} → {checkOut}</span>
                </Col>
                <Col xs={6} className="d-flex align-items-center">
                  <FaUsers className="me-2 opacity-50" />
                  <span>{totalAdults} Adults {totalChildren > 0 ? `, ${totalChildren} Child` : ""}</span>
                </Col>
                <Col xs={12} className="d-flex align-items-center mt-2">
                  <span className="text-muted">Total Rate: <span className="text-dark fw-bold">AED {totalRate}</span></span>
                </Col>
              </Row>
            </Col>
            <Col md={4}>
              <div className="bg-light p-2 rounded-3 border">
                <Form.Label className="mb-1 x-small fw-bold text-muted" style={{ fontSize: "10px" }}>ADDITIONAL MARKUP %</Form.Label>
                <div className="input-group input-group-sm">
                  <Form.Control
                    type="number"
                    placeholder="0"
                    className="fw-bold text-primary shadow-none border-0 bg-transparent"
                    style={{ fontSize: "15px" }}
                    value={markups[getCartKey(item)] || ""}
                    onChange={(e) =>
                      setMarkups((prev) => ({
                        ...prev,
                        [getCartKey(item)]: e.target.value,
                      }))
                    }
                  />
                  <span className="input-group-text bg-transparent border-0 text-muted fw-bold">%</span>
                </div>
              </div>
            </Col>
          </Row>
        </Card.Body>
      </Card>
    );
  };

  const renderCabItem = (item, key) => {
    const cab = item.cab || {};
    const cabName = cab.cabName || cab.vehicleName || "Transfer";
    const pickupDate = cab.pickupDate || "";
    const adult = cab.adult || "";
    const child = cab.child || "";
    
    return (
      <Card key={key} className="border-0 shadow-sm mb-3 overflow-hidden" style={{ borderRadius: "12px", borderLeft: "4px solid #6c757d" }}>
        <Card.Body className="p-3">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div className="d-flex align-items-center gap-2">
              <div className="bg-light p-2 rounded-3 text-secondary">
                <FaMapMarkerAlt size={18} />
              </div>
              <div>
                <span className="text-muted x-small text-uppercase fw-bold ls-1" style={{ fontSize: "10px" }}>Transfer</span>
                <h6 className="fw-bold mb-0 text-dark">{cabName}</h6>
              </div>
            </div>
            <Button
              variant="link"
              className="text-danger p-0 text-decoration-none small d-flex align-items-center"
              onClick={() => handleRemoveFromCart(item)}
            >
              <FaTrash size={12} className="me-1" /> <span style={{ fontSize: "13px" }}>Remove</span>
            </Button>
          </div>

          <Row className="g-3 align-items-end">
            <Col md={8}>
              <div className="mb-2 border-bottom pb-2">
                <span className="text-muted small d-block">Route</span>
                <span className="fw-bold small text-dark text-truncate d-block">{cab.pickupLocation} → {cab.dropoffLocation}</span>
              </div>
              <Row className="g-2 text-muted" style={{ fontSize: "13px" }}>
                <Col xs={6} className="d-flex align-items-center">
                  <FaCalendarAlt className="me-2 opacity-50" />
                  <span>{pickupDate}</span>
                </Col>
                <Col xs={6} className="d-flex align-items-center">
                  <FaUsers className="me-2 opacity-50" />
                  <span>{adult} Adults {child > 0 ? `, ${child} Child` : ""}</span>
                </Col>
                <Col xs={12} className="d-flex align-items-center mt-2">
                  <span className="text-muted">Total Rate: <span className="text-dark fw-bold">AED {cab.totalRate}</span></span>
                </Col>
              </Row>
            </Col>
            <Col md={4}>
              <div className="bg-light p-2 rounded-3 border">
                <Form.Label className="mb-1 x-small fw-bold text-muted" style={{ fontSize: "10px" }}>ADDITIONAL MARKUP %</Form.Label>
                <div className="input-group input-group-sm">
                  <Form.Control
                    type="number"
                    placeholder="0"
                    className="fw-bold text-primary shadow-none border-0 bg-transparent"
                    style={{ fontSize: "15px" }}
                    value={markups[getCartKey(item)] || ""}
                    onChange={(e) =>
                      setMarkups((prev) => ({
                        ...prev,
                        [getCartKey(item)]: e.target.value,
                      }))
                    }
                  />
                  <span className="input-group-text bg-transparent border-0 text-muted fw-bold">%</span>
                </div>
              </div>
            </Col>
          </Row>
        </Card.Body>
      </Card>
    );
  };

  const renderCartItem = (item, index) => {
    const key =
      getCartKey(item) ||
      item.activity?.activityId ||
      item.hotel?.hotelId ||
      item.cab?.cabId ||
      `cart-item-${index}`;

    if (item.activity) return renderActivityItem(item, key);
    if (item.hotel) return renderHotelItem(item, key);
    if (item.cab) return renderCabItem(item, key);
    return null;
  };

  const handleLogout = async () => {
    // Close the open admin_user_master_log row (logout_date_time) on the
    // server BEFORE wiping storage: the axios request interceptor reads
    // authToken from localStorage on every call, and /auth/logout resolves
    // the username from that Bearer header (refresh cookie as fallback).
    // Clearing first is why Login Logs showed "0000:00:00" for every logout.
    try {
      await axiosInstance.post("/auth/logout", {}, { withCredentials: true });
    } catch {
      // Best-effort: still finish the client-side logout if the call fails.
    }
    // Remove specific items
    localStorage.removeItem("authToken");
    localStorage.removeItem("userRole");
    localStorage.removeItem("UserName");
    localStorage.removeItem("currentActiveRole");
    // End the ad-view session so the next login counts ad views fresh.
    localStorage.removeItem("adSessionId");
    // Supplier / DMC approved-feature snapshot (hooks/usePartnerAccess.js).
    localStorage.removeItem("partnerAccess");
    // RegionalClock country cache (components/RegionalClock.jsx), so the next
    // login does not inherit the previous user's timezone.
    localStorage.removeItem("regionalClockProfile");

    // Optionally redirect to login page
    window.location.href = "/";
  };

  // Fetch cart data from redis
  const fetchCartData = async () => {
    try {
      setCartLoading(true);
      const agentId = getCartAgentId();

      if (!agentId) {
        setCartItems([]);
        setCartCount(0);
        return;
      }

      const response = await axiosInstance.post(_fetchUrl(agentId));

      if (Array.isArray(response.data)) {
        setCartItems(response.data || []);
        setCartCount(response.data.length);
      } else {
        setCartItems([]);
        setCartCount(0);
      }
    } catch (err) {
      console.error("Error fetching cart:", err);
      setCartItems([]);
      setCartCount(0);
      toast.error("Failed to load cart items. Please try again.");
    } finally {
      setCartLoading(false);
    }
  };

  // Remove item from cart
  const handleRemoveFromCart = async (item) => {
    try {
      const agentId = getCartAgentId();

      if (!agentId) {
        toast.error("Select an agent before modifying the cart.");
        return;
      }

      const cartKey = getCartKey(item);

      if (!cartKey) {
        toast.error("Unable to identify the selected cart item.");
        return;
      }

      const response = await axiosInstance.post(_deleteUrl(), null, {
        params: _isV2Flow()
          ? { userId: agentId, cartItemId: cartKey }
          : { agentId: agentId, cartKey: cartKey },
      });
      console.log("Response:", response.data);
      // Accept both the legacy "1" sentinel and the v2 endpoint's
      // { status: "SUCCESS" } / { status: "NOT_FOUND" } shape. A
      // NOT_FOUND from v2 still means the row isn't on the server, so
      // refreshing the cart matches the user's intent.
      const v2Status = response.data?.status;
      const ok =
        response.data === 1 ||
        response.data === "1" ||
        v2Status === "SUCCESS" ||
        v2Status === "NOT_FOUND";
      if (ok) {
        toast.success("Item removed from cart.");
        fetchCartData();
        // let nextCart = [];
        // setCartItems((prev) => {
        //   nextCart = prev.filter(
        //     (cartItem) => getCartKey(cartItem) !== cartKey
        //   );
        //   return nextCart;
        // });
        // setCartCount(nextCart.length);

        // Ensure UI stays in sync with backend state
        // await fetchCartData();
      } else {
        toast.error("Failed to remove item from cart.");
      }
    } catch (err) {
      console.error("Error removing from cart:", err);
      toast.error("Failed to remove item from cart. Please try again.");
    }
  };

  // Clear all items from cart
  const handleClearCart = async () => {
    try {
      const agentId = getCartAgentId();

      if (!agentId) {
        toast.error("Select an agent before modifying the cart.");
        return;
      }

      if (cartItems.length === 0) {
        toast.info("Cart is already empty.");
        return;
      }

      const response = await axiosInstance.post(_clearUrl(), null, {
        params: _isV2Flow() ? { userId: agentId } : { agentId: agentId },
      });
      
      console.log("Clear cart response:", response.data);
      
      // Accept the legacy "1"/true response shape AND the v2 endpoint's
      // { status: "CLEARED" } / { status: "EMPTY" } shape — both mean the
      // cart is empty server-side, which is what the operator wanted.
      const v2Status = response.data?.status;
      const ok =
        response.data === 1 ||
        response.data === true ||
        response.data?.success === true ||
        v2Status === "CLEARED" ||
        v2Status === "EMPTY";
      if (ok) {
        toast.success("Cart cleared successfully.");
        fetchCartData();
      } else {
        toast.error("Failed to clear cart.");
      }
    } catch (err) {
      console.error("Error clearing cart:", err);
      toast.error("Failed to clear cart. Please try again.");
    }
  };

  // Handle cart modal open
  const handleCartClick = () => {
    fetchCartData();
    setShowCartModal(true);
  };

  const handleQuotationBooking = async () => {
    try {
      const agentId = getCartAgentId();
      if (!agentId) {
        toast.error("Select an agent before proceeding to checkout.");
        return;
      }

      // Check for hotel
      const hotelExists = cartItems.some(item => !!item.hotel);
      if (!hotelExists && cartItems.length > 0) {
        toast.error("Please add a hotel to your package before proceeding.");
        return;
      }

      // Fetch latest cart data before navigating
      const response = await axiosInstance.post(_fetchUrl(agentId));

      if (Array.isArray(response.data) && response.data.length > 0) {
        // Apply markups to cart data
        const cartWithMarkups = response.data.map((item) => {
          const key = getCartKey(item);
          const markupPercent = parseFloat(markups[key]) || 0;
          
          const newItem = JSON.parse(JSON.stringify(item));
          
          if (markupPercent > 0) {
            if (newItem.hotel) {
              const originalRate = parseFloat(newItem.hotel.totalRate || 0);
              newItem.hotel.totalRateWithoutmrk = originalRate;
              newItem.hotel.totalRate = originalRate * (1 + markupPercent / 100);
              newItem.hotel.markupPercent = markupPercent;
            } else if (newItem.activity) {
              const originalRate = parseFloat(newItem.activity.totalRate || 0);
              newItem.activity.totalRateWithoutmrk = originalRate;
              newItem.activity.totalRate = originalRate * (1 + markupPercent / 100);
              newItem.activity.markupPercent = markupPercent;
            } else if (newItem.cab) {
              const originalRate = parseFloat(newItem.cab.totalRate || 0);
              newItem.cab.totalRateWithoutmrk = originalRate;
              newItem.cab.totalRate = originalRate * (1 + markupPercent / 100);
              newItem.cab.markupPercent = markupPercent;
            }
          }
          return newItem;
        });

        // Store cart data in sessionStorage for the booking page
        sessionStorage.setItem("makePkgCartData", JSON.stringify(cartWithMarkups));
        sessionStorage.setItem("makePkgAgentId", agentId);
        window.open("/make-your-own-package/generate-quotation-booking");
      } else {
        toast.error("Your cart is empty. Please add items to cart first.");
      }
    } catch (err) {
      console.error("Error fetching cart data:", err);
      toast.error("Failed to load cart data. Please try again.");
    }
  };

  const handleContinueBooking = async () => {
    try {
      const agentId = getCartAgentId();
      if (!agentId) {
        toast.error("Select an agent before proceeding to checkout.");
        return;
      }

      // Check for hotel
      const hotelExists = cartItems.some(item => !!item.hotel);
      if (!hotelExists && cartItems.length > 0) {
        toast.error("Please add a hotel to your package before proceeding.");
        return;
      }

      // Fetch latest cart data before navigating
      const response = await axiosInstance.post(_fetchUrl(agentId));

      if (Array.isArray(response.data) && response.data.length > 0) {
        // Apply markups to cart data
        const cartWithMarkups = response.data.map((item) => {
          const key = getCartKey(item);
          const markupPercent = parseFloat(markups[key]) || 0;
          
          const newItem = JSON.parse(JSON.stringify(item));
          
          if (markupPercent > 0) {
            if (newItem.hotel) {
              const originalRate = parseFloat(newItem.hotel.totalRate || 0);
              newItem.hotel.totalRateWithoutmrk = originalRate;
              newItem.hotel.totalRate = originalRate * (1 + markupPercent / 100);
              newItem.hotel.markupPercent = markupPercent;
            } else if (newItem.activity) {
              const originalRate = parseFloat(newItem.activity.totalRate || 0);
              newItem.activity.totalRateWithoutmrk = originalRate;
              newItem.activity.totalRate = originalRate * (1 + markupPercent / 100);
              newItem.activity.markupPercent = markupPercent;
            } else if (newItem.cab) {
              const originalRate = parseFloat(newItem.cab.totalRate || 0);
              newItem.cab.totalRateWithoutmrk = originalRate;
              newItem.cab.totalRate = originalRate * (1 + markupPercent / 100);
              newItem.cab.markupPercent = markupPercent;
            }
          }
          return newItem;
        });

        // Store cart data in sessionStorage for the booking page
        sessionStorage.setItem("makePkgCartData", JSON.stringify(cartWithMarkups));
        sessionStorage.setItem("makePkgAgentId", agentId);
        // Flow-aware: when the operator entered via the v2 menu we route
        // the cart's Proceed button to the v2 booking-page instead.
        // makePkgFlow flag is set by MakeUrOwnPackageV2 on entry.
        const _v2 =
          typeof window !== "undefined" &&
          sessionStorage.getItem("makePkgFlow") === "v2"
            ? "-v2"
            : "";
        window.open(`/new-booking/make-your-own-package${_v2}/booking-page`);
      } else {
        toast.error("Your cart is empty. Please add items to cart first.");
      }
    } catch (err) {
      console.error("Error fetching cart data:", err);
      toast.error("Failed to load cart data. Please try again.");
    }
  };

  // Listen for cart updates
  useEffect(() => {
    const handleCartUpdate = () => {
      fetchCartData();
    };

    window.addEventListener("cartUpdated", handleCartUpdate);

    // Initial fetch
    // fetchCartData();

    return () => {
      window.removeEventListener("cartUpdated", handleCartUpdate);
    };
  }, []);

  // AgentDashboard.jsx already shows Quick Actions inline on the page
  // itself, so the Globosoft-icon overlay would just be a redundant
  // duplicate there — only wire it up on every OTHER page.
  const showQuickActionsOnThisPage =
    currentRole === "agent" && location.pathname !== "/agentDashboard";

  // Sidebar lives in a separate component (Sidebar.jsx) rendered as a
  // sibling on every page, not a child of TopBar — there's no shared
  // parent/props to wire this through. Broadcast instead; Sidebar listens
  // for this event and opens the mobile offcanvas or flips the desktop
  // collapsed flag depending on the current breakpoint.
  const handleSidebarToggle = () => {
    window.dispatchEvent(new Event("sidebarToggleRequest"));
  };

  // This logo-side toggle only shows the "open" affordance: on desktop it
  // appears only while the sidebar is collapsed (when the sidebar is open,
  // its own « button — the previous UI — handles collapsing). On mobile
  // there is no persistent sidebar, so it stays visible to open the
  // offcanvas. Sidebar broadcasts sidebarCollapsedChange so we can track
  // the collapsed flag it owns.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem("sidebarCollapsed") === "true",
  );
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window === "undefined" || window.innerWidth > 991,
  );
  useEffect(() => {
    const onCollapsedChange = (e) =>
      setSidebarCollapsed(!!e.detail?.collapsed);
    const onResize = () => setIsDesktop(window.innerWidth > 991);
    window.addEventListener("sidebarCollapsedChange", onCollapsedChange);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("sidebarCollapsedChange", onCollapsedChange);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  const showSidebarToggle = !isDesktop || sidebarCollapsed;

  return (
    <>
    <Navbar ref={navRef} className="topbar shadow-sm" expand="lg" sticky="top">
      <Container fluid className="px-3">
       <div className="d-flex align-items-center gap-2">
         <Navbar.Brand
  href="#"
  onClick={(e) => {
    if (showQuickActionsOnThisPage) {
      e.preventDefault();
      setShowQuickActions((o) => !o);
    }
  }}
  aria-expanded={showQuickActionsOnThisPage ? showQuickActions : undefined}
  className="d-flex align-items-center gap-2 mb-0"
  style={{
    cursor: showQuickActionsOnThisPage ? "pointer" : undefined,
  }}
>
  <div
    className="logo-placeholder"
    style={{ background: "#fff", padding: 3, overflow: "hidden" }}
  >
    <img
      src={`${process.env.PUBLIC_URL}/images/logo-1.jpg`}
      alt="Globosoft"
      style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 6 }}
    />
  </div>
  <span className="fw-semibold">Globosoft</span>

  </Navbar.Brand>
         {showSidebarToggle && (
           <button
             type="button"
             className="sidebar-toggle-btn"
             onClick={handleSidebarToggle}
             aria-label="Open sidebar"
             title="Open sidebar"
           >
             <FaBars size={14} />
           </button>
         )}
       </div>

        <Nav className="ms-auto d-flex flex-row align-items-center gap-2 gap-md-3 flex-nowrap">
  {/* Cart Button — hidden in the v3 flow (no Redis cart there;
       selection is held in component state on /results) */}
  {sessionStorage.getItem("makePkgFlow") !== "v3" && (
    <Button
      variant="link"
      className="position-relative text-dark text-decoration-none p-0 d-flex align-items-center"
      onClick={handleCartClick}
      style={{ border: "none", background: "none", minWidth: "auto" }}
    >
      <FaShoppingCart size={20} />
      {cartCount > 0 && (
        <Badge
          bg="danger"
          className="position-absolute top-0 start-100 translate-middle rounded-pill"
          style={{ fontSize: "0.65rem", padding: "2px 6px" }}
        >
          {cartCount}
        </Badge>
      )}
    </Button>
  )}

  {/* Profile Dropdown */}
  <Dropdown align="end">
    <Dropdown.Toggle
      as={ProfileToggle}
      id="profile-dropdown"
      className="p-0"
      style={{ minWidth: "auto" }}
    />
    <Dropdown.Menu className="shadow-sm">
      <Dropdown.Item href="change-password">
        <FaKey className="me-2" />
        Change Password
      </Dropdown.Item>
      {/* Agent-only: only agent logins are challenged for a second factor, so
          showing this to an admin/staff/extranet user would offer them a
          setting that never takes effect. The route and the backend endpoints
          enforce the same restriction. */}
      {currentRole === "agent" && (
        <>
          <Dropdown.Divider />
          <Dropdown.Item href="two-factor-authentication">
            <FaShieldAlt className="me-2" />
            Two-Factor Authentication
          </Dropdown.Item>
        </>
      )}
      <Dropdown.Divider />
      <Dropdown.Item href="view-profile">
        <FaUser className="me-2" />
        View Profile
      </Dropdown.Item>
      <Dropdown.Divider />
      <Dropdown.Item onClick={handleLogout}>
        <FaSignOutAlt className="me-2" />
        Logout
      </Dropdown.Item>
    </Dropdown.Menu>
  </Dropdown>
</Nav>
      </Container>

      {/* Cart Modal */}
      <Modal
        show={showCartModal}
        onHide={() => setShowCartModal(false)}
        size="lg"
        centered
        backdrop="static"
        keyboard={false}
      >
        <Modal.Header closeButton className="border-bottom pb-3" style={{ background: "white", color: "#333" }}>
          <Modal.Title className="fw-bold d-flex align-items-center gap-2" style={{ fontSize: "1.25rem" }}>
            <FaShoppingCart className="text-primary" size={24} />
            <span className="text-dark">Shopping Cart</span>
            <Badge bg="primary" pill style={{ fontSize: "0.8rem", padding: "0.4em 0.8em" }}>{cartCount}</Badge>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {cartLoading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" />
              <p className="mt-3 text-muted">Loading cart items...</p>
            </div>
          ) : cartItems.length === 0 ? (
            <div className="text-center py-5">
              <FaShoppingCart size={48} className="text-muted mb-3" />
              <h5 className="text-muted">Your cart is empty</h5>
              <p className="text-muted">
                Add rooms or cabs or activities to your cart to see them here.
              </p>
            </div>
          ) : (
            <div className="d-flex flex-column gap-3">
              {cartItems.length > 0 && !cartItems.some(item => !!item.hotel) && (
                <div className="alert alert-warning py-2 mb-0 d-flex align-items-center gap-2" style={{ border: "none", borderRadius: "10px", fontSize: "13px" }}>
                  <FaInfoCircle />
                  <span>Please add a hotel to your package before proceeding to checkout.</span>
                </div>
              )}
              {cartItems.map((item, index) => renderCartItem(item, index))}
              {/* v2 add-ons summary — surfaces what the operator picked
                  on /addons so they see it without leaving the cart. */}
              {_isV2Flow() && (() => {
                let svcMap = {};
                try {
                  svcMap = JSON.parse(
                    sessionStorage.getItem("mypkg_addon_services") || "{}"
                  );
                } catch {
                  svcMap = {};
                }
                const enabled = Object.entries(svcMap)
                  .filter(([, v]) => v && v.enabled === true)
                  .map(([k]) => k);
                const visa = sessionStorage.getItem("makePkgV2VisaRequired") || "NO";
                if (enabled.length === 0 && visa === "NO") return null;
                return (
                  <div
                    className="mt-3 p-2 rounded border bg-light"
                    style={{ fontSize: "0.85rem" }}
                  >
                    <div className="fw-semibold text-secondary mb-1">
                      Add-ons selected on the /addons step
                    </div>
                    <div className="d-flex flex-wrap gap-1">
                      <span
                        className={`badge ${visa === "YES" ? "bg-danger" : "bg-secondary"}`}
                      >
                        Visa: {visa}
                      </span>
                      {enabled.map((k) => (
                        <span key={k} className="badge bg-success-subtle text-success">
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="border-top-0 pt-3">
          <div className="d-flex justify-content-between w-100 align-items-center">
            <div>
              {cartItems.length > 0 && (
                <Button
                  variant="link"
                  onClick={handleClearCart}
                  className="text-danger p-0 text-decoration-none small fw-bold"
                >
                  Clear All
                </Button>
              )}
            </div>
            <div className="d-flex gap-2">
              <Button
                variant="light"
                onClick={() => setShowCartModal(false)}
                className="px-4 fw-bold text-muted rounded-pill border-0"
              >
                Close
              </Button>
              {cartItems.length > 0 && (
                <Button
                  variant="primary"
                  onClick={handleContinueBooking}
                  className="px-4 fw-bold rounded-pill"
                  disabled={!cartItems.some(item => !!item.hotel)}
                  title={!cartItems.some(item => !!item.hotel) ? "Please add a hotel first" : ""}
                >
                  Checkout
                </Button>
              )}
              {cartItems.length > 0 && (
                <Button
                  variant="outline-primary"
                  onClick={handleQuotationBooking}
                  className="px-4 fw-bold rounded-pill"
                  disabled={!cartItems.some(item => !!item.hotel)}
                  title={!cartItems.some(item => !!item.hotel) ? "Please add a hotel first" : ""}
                >
                  Get Quote
                </Button>
              )}
            </div>
          </div>
        </Modal.Footer>
      </Modal>
    </Navbar>
    {showQuickActionsOnThisPage && showQuickActions && (
      <>
        <style>{topbarQuickActionsCss}</style>
        {/* Glass backdrop — fixed over the page content only (not the
            sidebar, which stays visible/usable via sidebarOffset). Click
            anywhere outside a tile to dismiss, same as a dropdown/modal. */}
        <div
          className="topbar-qa-backdrop"
          style={{ top: navHeight, left: sidebarOffset }}
          onClick={() => setShowQuickActions(false)}
        >
          <Container fluid className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
            <div className="topbar-qa-grid">
              {quickActions.map((a, i) => (
                <button
                  key={`${a.label}-${i}`}
                  type="button"
                  className={`topbar-qa-tile tone-${a.tone}`}
                  onClick={() => {
                    setShowQuickActions(false);
                    window.open(a.to, "_blank", "noopener,noreferrer");
                  }}
                >
                  <span className={`topbar-qa-icon tone-${a.tone}`}>{a.icon}</span>
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
          </Container>
        </div>
      </>
    )}
    </>
  );
}

const topbarQuickActionsCss = `
  /* Fixed over the page content (left offset by sidebarOffset so the
     sidebar itself stays visible) — a frosted "glass" sheet sized to fit
     the tile grid only (not stretched down the full page), not an inline
     panel, so it never pushes the layout down. */
  .topbar-qa-backdrop {
    position: fixed;
    left: 0;
    right: 0;
    max-height: calc(100vh - 200px);
    z-index: 1040;
    /* The dashboard behind is mostly plain white, so blurring alone barely
       reads as "glass" — a visible frosted edge (border + inner highlight +
       soft shadow) is what actually sells the effect, on top of a more
       transparent, slightly tinted fill. */
    background: linear-gradient(135deg, rgba(255,255,255,.45) 0%, rgba(236, 11, 67,.06) 50%, rgba(20,184,166,.08) 100%);
    backdrop-filter: blur(18px) saturate(1.6);
    -webkit-backdrop-filter: blur(18px) saturate(1.6);
    border: 1px solid rgba(255,255,255,.6);
    border-top: none;
    box-shadow: 0 16px 32px rgba(31,38,135,.14), inset 0 1px 0 rgba(255,255,255,.7);
    border-bottom-left-radius: 16px;
    border-bottom-right-radius: 16px;
    overflow-y: auto;
    animation: topbarQaFadeIn .18s ease-out;
  }
  @keyframes topbarQaFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .topbar-qa-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
    gap: 6px;
  }
  .topbar-qa-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 6px;
    min-height: 80px;
    background: #fff;
    border: 1px solid rgba(0,0,0,.08);
    border-radius: 10px;
    font-size: 13px;
    font-weight: 700;
    color: #1a1d23;
    text-align: center;
    line-height: 1.2;
    cursor: pointer;
    transition: border-color .15s, box-shadow .15s, transform .15s, background-color .15s;
  }
  .topbar-qa-tile > span:last-child {
    max-width: 100%;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .topbar-qa-tile:hover {
    box-shadow: 0 10px 20px rgba(0,0,0,.10);
    transform: translateY(-2px);
  }
  .topbar-qa-icon {
    width: 36px; height: 36px;
    border-radius: 50%;
    display: grid; place-items: center;
    font-size: 15px;
    flex-shrink: 0;
  }
  .topbar-qa-icon.tone-pink   { background: #FDE7ED; color: #EC0B43; }
  .topbar-qa-icon.tone-orange { background: #FFF1E0; color: #F59E0B; }
  .topbar-qa-icon.tone-purple { background: #F1EAFB; color: #8B5CF6; }
  .topbar-qa-icon.tone-blue   { background: #E7F3FE; color: #0EA5E9; }
  .topbar-qa-icon.tone-green  { background: #E8F8EE; color: #10B981; }
  .topbar-qa-icon.tone-teal   { background: #E3F7F5; color: #14B8A6; }
`;

const ProfileToggle = React.forwardRef(({ onClick }, ref) => {
  const [userName, setUserName] = React.useState("");

  React.useEffect(() => {
    const updateUserName = () => {
      const name =
        localStorage.getItem("UserName") ||
        sessionStorage.getItem("UserName") ||
        "";
      setUserName(name);
    };

    // Initial load
    updateUserName();

    // Listen for storage changes (in case username is updated in another tab)
    window.addEventListener("storage", updateUserName);

    return () => {
      window.removeEventListener("storage", updateUserName);
    };
  }, []);

  return (
    <a
      href="#profile"
      ref={ref}
      onClick={(e) => {
        e.preventDefault();
        onClick(e);
      }}
      className="d-flex align-items-center gap-2 text-decoration-none profile-toggle"
    >
      <Image
        roundedCircle
        width={34}
        height={34}
        src={avatarUrl}
        alt="profile"
      />
      <span className="d-none d-sm-inline text-dark">
        {userName ? `Hi ${userName}` : "Profile"}
      </span>
    </a>
  );
});

// Placeholder avatar for the logged-in agent
const avatarUrl = "https://i.pravatar.cc/100?img=12";
