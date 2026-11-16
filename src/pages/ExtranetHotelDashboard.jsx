import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaHotel, FaMapMarkerAlt, FaPhone, FaEnvelope, FaUser } from "react-icons/fa";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import axiosInstance from "../components/AxiosInstance";
import {
  dashboardCss,
  DashboardHeader,
  DashboardFooter,
  QuickActions,
  KpiCard,
  formatNumber,
} from "./dashboardSkin";

const defaultStats = {
  totalBookings: 0,
  cancellations: 0,
  checkInToday: 0,
  checkOutToday: 0,
};

const ExtranetHotelDashboard = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState(null);
  const [stats, setStats] = useState(defaultStats);
  const [loadingStats, setLoadingStats] = useState(true);
  const [hotelInfo, setHotelInfo] = useState(null);

  // ✅ Fetch profile (for navigation links only)
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const userName =
          sessionStorage.getItem("UserName");

        if (userName) {
          const response = await axiosInstance.get(
            `/api/personalProfile/${userName}`
          );
          setUserId(response.data.id);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      }
    };

    fetchProfile();
  }, []);

  // ✅ Fetch this hotel's profile details (name / address / contact) once the
  // logged-in hotel's id is resolved, so the dashboard identifies the hotel.
  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    axiosInstance
      .get(`/api/hotels/${userId}`)
      .then((res) => {
        if (alive) setHotelInfo(res.data);
      })
      .catch((error) => {
        console.error("Error fetching hotel info:", error);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  // ✅ Fetch dashboard stats
  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        setLoadingStats(true);

        const response = await axiosInstance.get("/api/dashboard/hotel/stats");

        if (response.data && typeof response.data === "object") {
          setStats({
            totalBookings: response.data.totalBookings || 0,
            cancellations: response.data.cancellations || 0,
            checkInToday: response.data.checkInToday || 0,
            checkOutToday: response.data.checkOutToday || 0,
          });
        } else {
          setStats(defaultStats);
        }
      } catch (error) {
        console.error("Error fetching hotel dashboard stats:", error);
        setStats(defaultStats);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchDashboardStats();
  }, []);

  // Quick Actions — "My Profile" stays disabled until the profile id loads.
  // A self-registered hotel starts with a PARTIAL record (no currency/
  // category/type/markup). Once it completes registration those are set, so
  // we use them to decide which primary action to show:
  //   • incomplete → "Complete Registration" (opens HotelReg edit mode)
  //   • complete   → "View Actions" (opens the hotel-actions hub)
  const isProfileComplete = Boolean(
    hotelInfo &&
      hotelInfo.hotelCurrencyId &&
      hotelInfo.hotelCategoryId &&
      hotelInfo.hotelTypeId &&
      hotelInfo.markupTypeId
  );

  const actions = [
    isProfileComplete
      ? {
          label: "View Actions",
          icon: "list",
          onClick: userId
            ? () => navigate(`/extranet/hotel-details/${userId}`)
            : undefined,
        }
      : {
          // Opens the full HotelReg form in edit mode for this hotel. The
          // partial data saved at approval (name, address, region/country/
          // state/place, contact) auto-loads, and the hotel fills in the
          // rest (currency, category, rooms, bank, amenities…) and saves.
          label: "Complete Registration",
          icon: "check",
          onClick: userId
            ? () => navigate(`/extranet/registration/hotel/create/${userId}`)
            : undefined,
        },
    {
      label: "My Profile",
      icon: "user",
      onClick: userId
        ? () => navigate(`/extranet/registration/hotel/create/${userId}`)
        : undefined,
    },
    {
      label: "Gallery",
      icon: "image",
      onClick: userId ? () => navigate(`/extranet/${userId}/gallery`) : undefined,
    },
    { label: "My Bookings",  icon: "list",  onClick: () => navigate("/extranet/calendar") },
   
  ];

  return (
    <>
      <style>{dashboardCss}</style>
      <div className="dash-shell rw-dashboard">
        <TopBar />
        <div className="dash-body">
          <Sidebar />
          <main className="dash-main">

            {/* Header — hotels carry a country relation, so the regional
                clock displays the hotel's local time. */}
            <DashboardHeader title="Hotel Dashboard" />

            {/* ── Hotel identity card — name / address / contact ── */}
            {hotelInfo && (() => {
              const contact =
                Array.isArray(hotelInfo.contactDetails) &&
                hotelInfo.contactDetails.length > 0
                  ? hotelInfo.contactDetails[0]
                  : null;
              const locationBits = [
                hotelInfo.address,
                hotelInfo.stateName,
                hotelInfo.placeName,
              ]
                .filter(Boolean)
                .join(", ");
              const phone = contact
                ? contact.mobileNumber || contact.teleNumber
                : null;
              return (
                <section>
                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #ECECE8",
                      borderRadius: 16,
                      padding: "18px 20px",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 18,
                      alignItems: "center",
                      boxShadow:
                        "0 1px 3px rgba(17,19,24,.04), 0 8px 20px rgba(17,19,24,.045)",
                    }}
                  >
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 13,
                        background: "#FDE7ED",
                        color: "#EC0B43",
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <FaHotel size={22} />
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          letterSpacing: ".06em",
                          textTransform: "uppercase",
                          color: "#EC0B43",
                          marginBottom: 2,
                        }}
                      >
                        Welcome
                      </div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          letterSpacing: "-.02em",
                          color: "#15171C",
                        }}
                      >
                        {hotelInfo.hotelName || "Hotel"}
                      </div>
                      {locationBits && (
                        <div
                          style={{
                            fontSize: 13.5,
                            color: "#6B7280",
                            marginTop: 4,
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                          }}
                        >
                          <FaMapMarkerAlt color="#EC0B43" /> {locationBits}
                        </div>
                      )}
                    </div>
                    {contact && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          fontSize: 13,
                          color: "#3E3E3B",
                        }}
                      >
                        {contact.contactPerson && (
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <FaUser color="#9A9A95" /> {contact.contactPerson}
                          </span>
                        )}
                        {phone && (
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <FaPhone color="#9A9A95" /> {phone}
                          </span>
                        )}
                        {contact.personalEmail && (
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <FaEnvelope color="#9A9A95" /> {contact.personalEmail}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              );
            })()}

            {/* ── Quick Actions ── */}
            <QuickActions actions={actions} />

            {/* ── Stats Grid ── */}
            <section>
              <p className="qa-label">Overview</p>
              {loadingStats ? (
                <div className="kpi-grid">
                  {[...Array(4)].map((_, i) => <div key={i} className="kpi-skeleton" />)}
                </div>
              ) : (
                <div className="kpi-grid">
                  <KpiCard title="Total Bookings"  icon="booking"  color="#6366f1" value={formatNumber(stats.totalBookings)} />
                  <KpiCard title="Cancellations"   icon="cancel"   color="#EC0B43" value={formatNumber(stats.cancellations)} />
                  <KpiCard title="Check-In Today"  icon="calendar" color="#10b981" value={formatNumber(stats.checkInToday)} />
                  <KpiCard title="Check-Out Today" icon="check"    color="#f59e0b" value={formatNumber(stats.checkOutToday)} />
                </div>
              )}
            </section>

          </main>
        </div>

        <DashboardFooter />
      </div>
    </>
  );
};

export default ExtranetHotelDashboard;
