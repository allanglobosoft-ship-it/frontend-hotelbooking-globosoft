import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axiosInstance from "../../components/AxiosInstance";
import { Button, Container, Spinner } from "react-bootstrap";
import { toast } from "react-hot-toast";
import {
  FaUtensils,
  FaSignOutAlt,
  FaThLarge,
  FaCalendarAlt,
  FaImages,
  FaClipboardList,
  FaUserCog,
} from "react-icons/fa";

/**
 * Chrome wrapped around every Restaurant-Extranet page (dashboard,
 * reservations, calendar, gallery, profile). Renders:
 *   • A purple header with the restaurant name + username + logout button.
 *   • A left-rail tab list scoped to the extranet pages (no admin nav).
 *   • The current page's content slotted via `children`.
 *
 * Centralises the /api/restaurant-extranet/me lookup so every page
 * doesn't have to redo it — the resolved restaurantId is passed down
 * via the render-prop pattern (`children` can be either a node or a
 * function that receives `{ restaurantId, restaurantName, refresh }`).
 *
 * Auth posture matches the rest of the platform:
 *   • Standard `authToken` from localStorage is auto-attached by
 *     `axiosInstance`.
 *   • Missing token → redirect to /login.
 *   • 401/403 from any wrapped page → logout + redirect to /login.
 */
const NAV = [
  { to: "/restaurant-extranet/dashboard",    label: "Dashboard",    Icon: FaThLarge },
  { to: "/restaurant-extranet/reservations", label: "Reservations", Icon: FaClipboardList },
  { to: "/restaurant-extranet/calendar",     label: "Calendar",     Icon: FaCalendarAlt },
  { to: "/restaurant-extranet/gallery",      label: "Gallery",      Icon: FaImages },
  { to: "/restaurant-extranet/profile",      label: "My Profile",   Icon: FaUserCog },
];

const RestaurantExtranetLayout = ({ children, title, subtitle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  const username = localStorage.getItem("UserName") || "";

  const fetchMe = useCallback(async () => {
    if (!localStorage.getItem("authToken")) {
      navigate("/login", { replace: true });
      return;
    }
    setLoading(true);
    try {
      const res = await axiosInstance.get("/api/restaurant-extranet/me");
      const data = res?.data || {};
      if (data.restaurantId) {
        setMe(data);
      } else {
        toast.error(data.message || "Could not resolve restaurant for this account.");
      }
    } catch (err) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        localStorage.removeItem("authToken");
        localStorage.removeItem("userRole");
        localStorage.removeItem("UserName");
        toast.error("Session expired. Please log in again.");
        navigate("/login", { replace: true });
        return;
      }
      console.error("extranet /me failed", err);
      toast.error("Failed to load restaurant info.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const handleLogout = async () => {
    // Same as TopBar.handleLogout: record logout_date_time server-side while
    // the Bearer token is still in localStorage, then clear the client.
    try {
      await axiosInstance.post("/auth/logout", {}, { withCredentials: true });
    } catch {
      // Best-effort: still finish the client-side logout if the call fails.
    }
    localStorage.removeItem("authToken");
    localStorage.removeItem("userRole");
    localStorage.removeItem("UserName");
    localStorage.removeItem("currentActiveRole");
    navigate("/login", { replace: true });
  };

  return (
    <div
      className="min-vh-100 d-flex flex-column"
      style={{ background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)" }}
    >
      {/* Top header */}
      <div
        style={{
          background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
          color: "#fff",
          padding: "1rem 1.5rem",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        <Container fluid className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div className="d-flex align-items-center gap-3">
            <div
              className="d-flex align-items-center justify-content-center"
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.18)",
              }}
            >
              <FaUtensils size={20} />
            </div>
            <div>
              <div className="fw-bold" style={{ fontSize: "1.1rem" }}>
                {me?.restaurantName || "Restaurant"}
              </div>
              {username && (
                <div style={{ fontSize: "0.8rem", opacity: 0.85 }}>{username}</div>
              )}
            </div>
          </div>
          <Button
            variant="light"
            onClick={handleLogout}
            className="d-flex align-items-center gap-2"
          >
            <FaSignOutAlt /> Logout
          </Button>
        </Container>
      </div>

      <div className="d-flex flex-grow-1">
        {/* Left rail */}
        <aside
          style={{
            width: 220,
            background: "#ffffff",
            borderRight: "1px solid #e5e7eb",
            padding: "1rem 0.5rem",
          }}
          className="d-none d-md-block"
        >
          <nav className="d-flex flex-column gap-1">
            {NAV.map(({ to, label, Icon }) => {
              const active = location.pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className="text-decoration-none"
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    color: active ? "#fff" : "#374151",
                    background: active
                      ? "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"
                      : "transparent",
                    fontWeight: active ? 600 : 500,
                    fontSize: "0.9rem",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Icon />
                  {label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-grow-1 py-4">
          <Container fluid>
            {(title || subtitle) && (
              <div className="mb-3">
                {title && (
                  <h4 className="fw-bold mb-1" style={{ color: "#111827" }}>
                    {title}
                  </h4>
                )}
                {subtitle && (
                  <div className="text-muted small">{subtitle}</div>
                )}
              </div>
            )}
            {loading ? (
              <div className="text-center py-5">
                <Spinner animation="border" />
                <div className="text-muted small mt-2">Loading…</div>
              </div>
            ) : typeof children === "function" ? (
              children({ me, refresh: fetchMe })
            ) : (
              children
            )}
          </Container>
        </main>
      </div>
    </div>
  );
};

export default RestaurantExtranetLayout;
