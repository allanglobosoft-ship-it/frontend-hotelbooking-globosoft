import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../../components/AxiosInstance";
import FooterLegalLinks from "../../components/FooterLegalLinks";
import { Row, Col, Spinner } from "react-bootstrap";
import {
  FaUserCog,
  FaCalendarAlt,
  FaImages,
  FaClipboardList,
  FaCheckCircle,
  FaUserSlash,
  FaHourglassHalf,
  FaCalendarDay,
} from "react-icons/fa";
import RestaurantExtranetLayout from "./RestaurantExtranetLayout";

/**
 * Restaurant Extranet landing page.
 *
 * Mirrors the layout / feel of ExtranetHotelDashboard:
 *   • 4 action cards (My Profile / Reservations / Calendar / Gallery)
 *   • Stat cards from /api/restaurant-extranet/stats (Total Bookings /
 *     Cancellations / Today's Reservations / Pending Approval).
 *
 * All booking-management has moved to its own page at
 * /restaurant-extranet/reservations — keeping the landing page lean.
 */
const DEFAULT_STATS = {
  totalBookings: 0,
  cancellations: 0,
  pendingApproval: 0,
  confirmed: 0,
  checkedIn: 0,
  completed: 0,
  noShow: 0,
  todayReservations: 0,
  upcomingReservations: 0,
};

const RestaurantExtranetDashboard = () => {
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get("/api/restaurant-extranet/stats");
      const data = res?.data || {};
      if (data.status === "SUCCESS") {
        setStats({
          totalBookings: Number(data.totalBookings) || 0,
          cancellations: Number(data.cancellations) || 0,
          pendingApproval: Number(data.pendingApproval) || 0,
          confirmed: Number(data.confirmed) || 0,
          checkedIn: Number(data.checkedIn) || 0,
          completed: Number(data.completed) || 0,
          noShow: Number(data.noShow) || 0,
          todayReservations: Number(data.todayReservations) || 0,
          upcomingReservations: Number(data.upcomingReservations) || 0,
        });
      }
    } catch (err) {
      // Non-fatal — keep zeros; the layout already handles 401.
      console.error("extranet stats fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Action card config — link targets match the routes registered in
  // App.jsx. "My Profile" routes to the existing restaurant edit page
  // since it already handles all restaurant fields + image uploads.
  const buildActionCards = (restaurantId) => [
    {
      // Lands on the extranet-owned profile page (read-only view); the
      // "Edit Profile" button there routes to the dedicated extranet
      // edit form. Deliberately never targets the admin
      // /restaurant/edit/:id page (which redirects to the full
      // restaurant list on Back and wipes images/menus on save).
      to: "/restaurant-extranet/profile",
      icon: <FaUserCog size={22} />,
      label: "My Profile",
      description: "View & edit restaurant details, contact info & timings",
      iconBg: "#EFF6FF",
      iconColor: "#2563EB",
      disabled: !restaurantId,
    },
    {
      to: "/restaurant-extranet/reservations",
      icon: <FaClipboardList size={22} />,
      label: "Reservations",
      description: "Confirm, reject, check-in & manage bookings",
      iconBg: "#FFFBEB",
      iconColor: "#D97706",
    },
    {
      to: "/restaurant-extranet/calendar",
      icon: <FaCalendarAlt size={22} />,
      label: "Calendar",
      description: "Monthly view of all reservations",
      iconBg: "#F5F3FF",
      iconColor: "#7C3AED",
    },
    {
      to: "/restaurant-extranet/gallery",
      icon: <FaImages size={22} />,
      label: "Gallery",
      description: "Browse the restaurant's photos",
      iconBg: "#F0FDF4",
      iconColor: "#16A34A",
    },
  ];

  return (
    <RestaurantExtranetLayout
      title="Dashboard"
      subtitle="Welcome back. Here's what's happening today."
    >
      {({ me }) => {
        const actionCards = buildActionCards(me?.restaurantId);
        return (
          <>
            {/* Action cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
                marginBottom: 28,
              }}
            >
              {actionCards.map((card) => (
                <Link
                  key={card.label}
                  to={card.to}
                  className="text-decoration-none"
                  onClick={(e) => card.disabled && e.preventDefault()}
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid #E5E7EB",
                    borderRadius: 12,
                    padding: 20,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    cursor: card.disabled ? "not-allowed" : "pointer",
                    opacity: card.disabled ? 0.55 : 1,
                    transition: "transform 0.12s ease, box-shadow 0.12s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (card.disabled) return;
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(15,23,42,0.08)";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: card.iconBg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: card.iconColor,
                    }}
                  >
                    {card.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                      {card.label}
                    </div>
                    <div style={{ fontSize: 12.5, color: "#6B7280" }}>
                      {card.description}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Headline stat cards (primary row) */}
            <Row className="g-3 mb-3">
              <Col xs={6} md={3}>
                <StatCard
                  label="Total Bookings"
                  value={stats.totalBookings}
                  Icon={FaClipboardList}
                  color="#2563EB"
                  loading={loading}
                />
              </Col>
              <Col xs={6} md={3}>
                <StatCard
                  label="Cancellations"
                  value={stats.cancellations}
                  Icon={FaUserSlash}
                  color="#DC2626"
                  loading={loading}
                />
              </Col>
              <Col xs={6} md={3}>
                <StatCard
                  label="Today's Reservations"
                  value={stats.todayReservations}
                  Icon={FaCalendarDay}
                  color="#7C3AED"
                  loading={loading}
                />
              </Col>
              <Col xs={6} md={3}>
                <StatCard
                  label="Pending Approval"
                  value={stats.pendingApproval}
                  Icon={FaHourglassHalf}
                  color="#D97706"
                  loading={loading}
                />
              </Col>
            </Row>

            {/* Secondary breakdown */}
            <Row className="g-3">
              <Col xs={6} md={3}>
                <StatCard label="Confirmed" value={stats.confirmed} loading={loading} />
              </Col>
              <Col xs={6} md={3}>
                <StatCard label="Checked In" value={stats.checkedIn} loading={loading} />
              </Col>
              <Col xs={6} md={3}>
                <StatCard
                  label="Completed"
                  value={stats.completed}
                  Icon={FaCheckCircle}
                  color="#16A34A"
                  loading={loading}
                />
              </Col>
              <Col xs={6} md={3}>
                <StatCard label="No Show" value={stats.noShow} loading={loading} />
              </Col>
            </Row>

            {/* This portal has its own shell with no footer band, so the legal
                links get a slim rule of their own at the end of the page. */}
            <footer className="rx-dash-foot">
              <FooterLegalLinks />
            </footer>
          </>
        );
      }}
    </RestaurantExtranetLayout>
  );
};

function StatCard({ label, value, Icon, color, loading }) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        padding: 18,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        className="d-flex justify-content-between align-items-center"
        style={{ fontSize: 12, color: "#6B7280" }}
      >
        <span>{label}</span>
        {Icon && <Icon size={14} style={{ color: color || "#9CA3AF" }} />}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || "#111827" }}>
        {loading ? <Spinner animation="border" size="sm" /> : value}
      </div>
    </div>
  );
}

export default RestaurantExtranetDashboard;
