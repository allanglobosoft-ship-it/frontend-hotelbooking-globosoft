import React, { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import LineChart from "../components/LineChart";
import BarChart from "../components/BarChart";
import { useNavigate } from "react-router-dom";
import { Collapse } from "react-bootstrap";
import {
  FaUserTie,
  FaMapMarkerAlt,
  FaPhone,
  FaEnvelope,
  FaUser,
  FaChartLine,
  FaChevronDown,
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
  FaCreditCard,
  FaCalendarAlt,
  FaArrowRight,
  FaPen,
  FaCalendarCheck,
  FaSyncAlt,
  FaPrayingHands,
} from "react-icons/fa";
import { MdWifiOff } from "react-icons/md";
import TopBar from "../components/TopBar";
import axiosInstance from "../components/AxiosInstance";
import { isAgentComingSoon, COMING_SOON_TITLE } from "../config/agentComingSoon";
import {
  dashboardCss,
  DashboardHeader,
  DashboardFooter,
  ChartCard,
  formatNumber,
} from "./dashboardSkin";

const bookingsLabels = ["Aug 1", "Aug 2", "Aug 3", "Aug 4", "Aug 5"];
const bookingsData = [20, 35, 50, 40, 65];
const revenueData = [3000, 4800, 5500, 4000, 6800];

export default function AgentDashboard() {
  const navigate = useNavigate();
  const [creditSummary, setCreditSummary] = useState(null);
  const [loadingCredit, setLoadingCredit] = useState(true);
  // Logged-in agent's id (resolved via /api/personalProfile — for AGENT
  // users the DTO id IS the agent id) and their full registration record
  // (GET /api/agent/{id}, same source AgentView reads) for the identity
  // card: company / location / contact + Finance Manager & GM.
  const [agentId, setAgentId] = useState(null);
  const [agentInfo, setAgentInfo] = useState(null);
  // Analytics charts are collapsed by default to save vertical space,
  // matching the AdminDashboard accordion pattern.
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const defaultDashboardStatus = {
    totalBookings: 0,
    todayBookings: 0,
    totalRevenue: 0,
    totalActiveAgents: 0,
    totalHotels: 0,
    totalApiBookings: 0,
  };
  const [dashboardStatus, setDashboardStatus] = useState(
    defaultDashboardStatus,
  );

  // ✅ Fetch dashboard data
  const fetchAgentDashboardStatus = async () => {
    try {
      const response = await axiosInstance.get(`/api/dashboard/agent/stats`);

      if (response.data && typeof response.data === "object") {
        setDashboardStatus((prev) => ({
          ...prev,
          ...response.data,
        }));
      } else {
        setDashboardStatus(defaultDashboardStatus);
      }
    } catch (error) {
      console.error("Error fetching dashboard status:", error);
      setDashboardStatus(defaultDashboardStatus);
    }
  };

  useEffect(() => {
    fetchAgentDashboardStatus();
  }, []);

  useEffect(() => {
    const fetchCreditLimit = async () => {
      try {
        setLoadingCredit(true);
        const response = await axiosInstance.get(
          "/api/agent-credit-limit/single-agent",
        );
        const data = response.data;

        const creditData = {
          creditLimit: data.totalCreditLimit || 0,
          used: data.usedCreditLimit || 0,
          available: data.availableCreditLimit || 0,
          usedPercent: Math.min(
            100,
            Math.round(
              (data.usedCreditLimit / (data.totalCreditLimit || 1)) * 100,
            ),
          ),
        };

        setCreditSummary(creditData);
      } catch (error) {
        console.error("Error fetching credit limit:", error);
        setCreditSummary({
          creditLimit: 0,
          used: 0,
          available: 0,
          usedPercent: 0,
        });
      } finally {
        setLoadingCredit(false);
      }
    };

    fetchCreditLimit();
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const userName =
          sessionStorage.getItem("UserName");
        if (userName) {
          const response = await axiosInstance.get(
            `/api/personalProfile/${userName}`,
          );
          console.log("Profile Data:", response.data);
          if (response.data?.id) setAgentId(response.data.id);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      }
    };

    fetchProfile();
  }, []);

  // ✅ Fetch this agent's registration details once the id is resolved, so
  // the dashboard can identify the agent (mirrors ExtranetHotelDashboard's
  // hotel identity card).
  useEffect(() => {
    if (!agentId) return undefined;
    let alive = true;
    axiosInstance
      .get(`/api/agent/${agentId}`)
      .then((res) => {
        if (alive) setAgentInfo(res.data);
      })
      .catch((error) => {
        console.error("Error fetching agent info:", error);
      });
    return () => {
      alive = false;
    };
  }, [agentId]);

  // Every "New Booking" feature (mirrors the Sidebar's New Booking submenu),
  // surfaced directly as Quick Actions so an agent can jump straight to the
  // corresponding search/booking page without opening the sidebar. Each tile
  // carries its own accent "tone" (styled in the scoped <style> block below)
  // so the grid reads as a set of distinct shortcuts, not a uniform button row.
  //
  // Which flows are "Coming soon" is NOT decided here: the tiles read the
  // shared AGENT_COMING_SOON_ROUTES set (config/agentComingSoon.js) that the
  // Sidebar → New Booking submenu uses too, so the two never disagree.
  const bookingActions = [
    { label: "Hotels",              tone: "pink",   icon: <FaHotel />,          to: "/new-booking/hotel" },
    { label: "24 Hours",            tone: "pink",   icon: <FaClock />,          to: "/new-booking/hotel-24hr" },
    { label: "Last Minutes",        tone: "orange", icon: <FaFire />,           to: "/new-booking/last-minute-booking" },
    { label: "Long Stays",          tone: "purple", icon: <FaBriefcase />,      to: "/new-booking/long-stay" },
    { label: "Day Stays",           tone: "blue",   icon: <FaSun />,            to: "/new-booking/day-stay" },
    { label: "Build Your Own Pkg", tone: "green",  icon: <FaBoxOpen />,        to: "/new-booking/make-your-own-package-v2" },
    { label: "Packages",            tone: "orange", icon: <FaGift />,           to: "/new-booking/package-search" },
    { label: "Transfers",          tone: "teal",   icon: <FaCar />,            to: "/new-booking/cab" },
    { label: "Chauffeur & Limousins",   tone: "purple", icon: <FaTaxi />,           to: "/new-booking/scheffer-driver" },
    { label: "Tours & Activitys",   tone: "green",  icon: <FaGlobeAmericas />,  to: "/new-booking/tours-and-activities" },
    { label: "Restaurants",         tone: "orange", icon: <FaUtensils />,       to: "/new-booking/restaurant" },
    { label: "Honeymoon Packages",  tone: "pink",   icon: <FaHeart />,          to: "/new-booking/honeymoon" },
    { label: "Meeting Spaces",      tone: "purple", icon: <FaUserFriends />,    to: "/new-booking/meet-and-space" },
    { label: "Govt/Airline/Hoteliers",               tone: "blue",   icon: <FaPlane />,          to: "/new-booking/gov-employee" },
    { label: "Ayurveda",           tone: "green",  icon: <FaLeaf />,           to: "/new-booking/ayurveda" },
    { label: "Students",            tone: "purple", icon: <FaGraduationCap />,  to: "/new-booking/student" },
    { label: "Senior Citizens",     tone: "orange", icon: <FaUserAlt />,        to: "/new-booking/senior-citizen" },
    { label: "Religious",     tone: "orange", icon: <FaPrayingHands/>,        to: "/new-booking/religious" },
  ]
    .map((a) => ({ ...a, comingSoon: isAgentComingSoon(a.to) }))
    // Active tiles first, "Coming soon" tiles last. Stable sort so the
    // declaration order above is preserved WITHIN each group — the source
    // array still defines the reading order agents remember (Hotels →
    // 24 Hours → Last Minutes → …), we're only pulling the disabled ones to
    // the tail so the grid reads as "everything I can actually use" before
    // "everything that's not live yet". Nothing else consumes this array's
    // index, so re-ordering it here has no side effect on comingSoon
    // gating, click handlers or the shared AGENT_COMING_SOON_ROUTES set.
    .sort((a, b) => Number(a.comingSoon) - Number(b.comingSoon));

  const manageActions = [
    {
      label: "Accounts and Ledgers",
      desc: "Manage your accounts and finances",
      tone: "pink",
      icon: <FaCreditCard />,
      onClick: () => navigate("/inhouse-accounts/agent"),
    },
    {
      label: "Calendar",
      desc: "View & manage calendar events",
      tone: "gray",
      icon: <FaCalendarAlt />,
      onClick: () => navigate("/calendar"),
    },
  ];

  const todayBookings =
    dashboardStatus.todayBookings ?? dashboardStatus.todaysBookings ?? 0;

  return (
    <>
      <style>{dashboardCss}</style>
      {/* Above-the-fold compaction, scoped to the agent dashboard only:
          tighter section gap / header margin / credit-stats spacing so
          the identity card, Quick Actions and Credit panel are all
          visible without scrolling on a 768px-tall screen. The header
          margin needs !important to beat DashboardHeader's inline
          marginBottom. */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        /* Agent dashboard uses Inter instead of the shared skin's Lexend. */
        .dash-shell.agent-compact,
        .dash-shell.agent-compact * { font-family: 'Inter', sans-serif; }

        .agent-compact .dash-main { gap: 14px; padding-top: 14px; }
        .agent-compact .dash-main > div:first-child { margin-bottom: 0 !important; }

        /* ── Overview — icon-badged stat cards ── */
        .agent-overview-strip {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 10px;
        }
        .agent-overview-card {
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: #fff;
          border: 1px solid rgba(0,0,0,.06);
          border-radius: 12px;
          padding: 12px 14px;
          box-shadow: 0 1px 3px rgba(0,0,0,.04);
        }
        .agent-overview-icon {
          width: 28px; height: 28px;
          border-radius: 8px;
          display: grid; place-items: center;
          font-size: 13px;
          flex-shrink: 0;
        }
        .agent-overview-icon.tone-pink   { background: #FDE7ED; color: #EC0B43; }
        .agent-overview-icon.tone-green  { background: #E8F8EE; color: #10B981; }
        .agent-overview-icon.tone-orange { background: #FFF1E0; color: #F59E0B; }
        .agent-overview-icon.tone-blue   { background: #E7F3FE; color: #0EA5E9; }
        .agent-overview-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .07em;
          text-transform: uppercase;
          color: #9198a8;
        }
        .agent-overview-value {
          font-size: 18px;
          font-weight: 700;
          color: #1a1d23;
        }

        /* ── Quick Actions — New Booking feature tile grid, each tile
            carrying its own pastel accent tone ── */
        .agent-qa-headrow {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 10px;
        }
        .agent-qa-edit-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px;
          background: #fff;
          border: 1px solid rgba(0,0,0,.08);
          border-radius: 99px;
          font-size: 12px; font-weight: 600; color: #3E3E3B;
          cursor: pointer;
          transition: border-color .15s, box-shadow .15s;
        }
        .agent-qa-edit-btn:hover { border-color: var(--color-primary-tint); box-shadow: 0 2px 8px rgba(0,0,0,.06); }

        .agent-qa-panel {
          background: #fff;
          border: 1px solid rgba(0,0,0,.06);
          border-radius: 14px;
          padding: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,.05);
        }
        .agent-qa-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
          gap: 6px;
        }
        .agent-qa-tile {
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
        .agent-qa-tile > span:last-child {
          max-width: 100%;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .agent-qa-tile:hover {
          box-shadow: 0 10px 20px rgba(0,0,0,.10);
          transform: translateY(-2px);
        }
        .agent-qa-tile:active { transform: translateY(0); }
        .agent-qa-tile .agent-qa-icon { transition: transform .15s; }
        .agent-qa-tile:hover .agent-qa-icon { transform: scale(1.1); }
        .agent-qa-tile.tone-pink:hover   { background: #FFF3F5; border-color: #F7BCC8; box-shadow: 0 10px 20px rgba(236, 11, 67,.18); }
        .agent-qa-tile.tone-orange:hover { background: #FFF9EF; border-color: #FBD9A0; box-shadow: 0 10px 20px rgba(245,158,11,.18); }
        .agent-qa-tile.tone-purple:hover { background: #FAF6FE; border-color: #D9C7FA; box-shadow: 0 10px 20px rgba(139,92,246,.18); }
        .agent-qa-tile.tone-blue:hover   { background: #F2F9FE; border-color: #B9E0FB; box-shadow: 0 10px 20px rgba(14,165,233,.18); }
        .agent-qa-tile.tone-green:hover  { background: #F2FBF6; border-color: #B7EAC9; box-shadow: 0 10px 20px rgba(16,185,129,.18); }
        .agent-qa-tile.tone-teal:hover   { background: #EFFBFA; border-color: #A9E7E1; box-shadow: 0 10px 20px rgba(20,184,166,.18); }
        .agent-qa-tile.tone-gray:hover   { background: #F6F7F8; border-color: #D9DCE1; box-shadow: 0 10px 20px rgba(107,114,128,.18); }
        .agent-qa-icon {
          width: 36px; height: 36px;
          border-radius: 50%;
          display: grid; place-items: center;
          font-size: 15px;
          flex-shrink: 0;
        }
        .agent-qa-icon.tone-pink   { background: #FDE7ED; color: #EC0B43; }
        .agent-qa-icon.tone-orange { background: #FFF1E0; color: #F59E0B; }
        .agent-qa-icon.tone-purple { background: #F1EAFB; color: #8B5CF6; }
        .agent-qa-icon.tone-blue   { background: #E7F3FE; color: #0EA5E9; }
        .agent-qa-icon.tone-green  { background: #E8F8EE; color: #10B981; }
        .agent-qa-icon.tone-teal   { background: #E3F7F5; color: #14B8A6; }
        .agent-qa-icon.tone-gray   { background: #F0F1F3; color: #9098A8; }

        /* ── Coming-soon tiles — visible but non-actionable. Suppresses
              the accent-tone hover so the disabled tile can't look
              clickable, and reveals a small "Coming soon" ribbon on
              hover/focus in addition to the native title tooltip. ── */
        .agent-qa-tile.is-coming-soon {
          cursor: not-allowed;
          opacity: 0.55;
          filter: grayscale(0.35);
          position: relative;
          overflow: hidden;
        }
        .agent-qa-tile.is-coming-soon:hover,
        .agent-qa-tile.is-coming-soon:focus {
          background: #fff;
          border-color: rgba(0,0,0,.08);
          box-shadow: none;
          transform: none;
        }
        .agent-qa-tile.is-coming-soon:hover .agent-qa-icon {
          transform: none;
        }
        .agent-qa-coming-badge {
          position: absolute;
          left: 50%;
          top: 6px;
          transform: translate(-50%, -140%);
          background: #FF6B00;
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: .3px;
          padding: 2px 8px;
          border-radius: 999px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          box-shadow: 0 2px 8px rgba(255,107,0,.5);
          transition: transform .15s ease, opacity .15s ease;
        }
        .agent-qa-tile.is-coming-soon:hover .agent-qa-coming-badge,
        .agent-qa-tile.is-coming-soon:focus-visible .agent-qa-coming-badge {
          transform: translate(-50%, 0);
          opacity: 1;
        }

        /* ── Manage — compact gradient shortcut cards ── */
        .agent-manage-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 10px;
        }
        .agent-manage-card {
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border: none;
          border-radius: 12px;
          text-align: left;
          cursor: pointer;
          transition: transform .15s, box-shadow .15s;
        }
        .agent-manage-card:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(0,0,0,.14); }
        .agent-manage-card.tone-pink   { background: linear-gradient(135deg, #EC0B43 0%, #C90939 100%); }
        .agent-manage-card.tone-purple { background: linear-gradient(135deg, #8B6CF7 0%, #6D4CE0 100%); }
        .agent-manage-card.tone-teal   { background: linear-gradient(135deg, #2DD4BF 0%, #0D9488 100%); }
        .agent-manage-card.tone-gray   { background: linear-gradient(135deg, #8A93A3 0%, #5B6472 100%); }
        .agent-manage-dots {
          position: absolute; top: 8px; right: 10px; width: 40px; height: 40px;
          background-image: radial-gradient(currentColor 1.2px, transparent 1.2px);
          background-size: 8px 8px;
          opacity: .35;
          color: #fff;
        }
        .agent-manage-icon {
          width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
          display: grid; place-items: center; font-size: 14px; color: #fff;
          background: rgba(255,255,255,.2);
        }
        .agent-manage-body { flex: 1; min-width: 0; }
        .agent-manage-title { display: block; font-size: 13.5px; font-weight: 700; color: #fff; margin-bottom: 1px; }
        .agent-manage-desc { display: block; font-size: 10.5px; color: rgba(255,255,255,.85); line-height: 1.3; }
        .agent-manage-arrow {
          width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
          display: grid; place-items: center;
          background: #fff;
          box-shadow: 0 2px 6px rgba(0,0,0,.10);
        }
        .agent-manage-card.tone-pink .agent-manage-arrow   { color: #EC0B43; }
        .agent-manage-card.tone-purple .agent-manage-arrow { color: #6D4CE0; }
        .agent-manage-card.tone-teal .agent-manage-arrow   { color: #0D9488; }
        .agent-manage-card.tone-gray .agent-manage-arrow   { color: #5B6472; }

        /* ── Credit Overview — highlighted brand-tinted card so the
            limit / used / available figures stand out from the rest of
            the welcome card. Single line, wraps on narrow screens ── */
        .agent-credit-compact {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px 22px;
          margin-top: 14px;
          padding: 13px 16px;
          border: 1px solid rgba(236, 11, 67, .20);
          border-left: 4px solid var(--color-primary);
          background: linear-gradient(135deg, #FFF1F5 0%, #FFFFFF 65%);
          border-radius: 12px;
          box-shadow: 0 2px 10px rgba(236, 11, 67, .07);
          font-size: 15px;
        }
        .agent-credit-compact .acc-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--color-primary); flex-shrink: 0;
        }
        .agent-credit-compact .acc-label {
          font-size: 15.5px; font-weight: 800; letter-spacing: .04em;
          text-transform: uppercase; color: var(--color-primary);
        }
        .agent-credit-compact .acc-stat {
          color: #15171C; font-weight: 600;
        }
        .agent-credit-compact .acc-stat b {
          color: #15171C; font-weight: 800;
        }
        .agent-credit-compact .acc-badge {
          margin-left: auto;
          background: var(--color-primary-tint);
          color: var(--color-primary);
          font-weight: 700;
          font-size: 14px;
          padding: 4px 11px;
          border-radius: 999px;
        }
        .agent-credit-compact .acc-loading { color: var(--color-text-muted); }

        /* ── Analytics — collapsible accordion header (mirrors AdminDashboard) ── */
        .agent-analytics-toggle {
          width: 100%; display: flex; align-items: center; gap: 12px;
          background: #fff; border: 1px solid rgba(0,0,0,.06); border-radius: 14px;
          padding: 13px 16px; cursor: pointer; text-align: left;
          box-shadow: 0 1px 3px rgba(0,0,0,.05);
          transition: border-color .15s ease, box-shadow .15s ease;
        }
        .agent-analytics-toggle:hover { border-color: var(--color-primary-tint); box-shadow: 0 6px 16px rgba(236, 11, 67,.10); }
        .agent-analytics-toggle[aria-expanded="true"] { border-color: var(--color-primary-tint); }
        .agent-acc-icon {
          width: 34px; height: 34px; border-radius: 10px;
          display: grid; place-items: center;
          background: var(--color-primary-tint); color: var(--color-primary);
          flex-shrink: 0; font-size: 15px;
        }
        .agent-acc-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .agent-acc-title { font-size: 14px; font-weight: 600; color: var(--color-text); }
        .agent-acc-sub { font-size: 11.5px; color: var(--color-text-muted); }
        .agent-acc-chev {
          width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
          background: #F6F6F4; color: #6B7280; flex-shrink: 0; font-size: 12px;
          transition: transform .25s cubic-bezier(.16,1,.3,1), background .15s ease, color .15s ease;
        }
        .agent-analytics-toggle[aria-expanded="true"] .agent-acc-chev {
          background: var(--color-primary); color: #fff; transform: rotate(180deg);
        }
        .agent-analytics-panel { padding-top: 14px; }
      `}</style>
      <div className="dash-shell rw-dashboard agent-compact">
        <TopBar />
        <div className="dash-body">
          <Sidebar />
          <main className="dash-main">

            {/* Regional date+time chip — United Arab Emirates time from
                the server (/api/dashboard/regional-time). */}
            <DashboardHeader title="Agent Dashboard" />

            {/* ── Agent identity card — company / location / contact +
                Finance Manager & GM. Mirrors the hotel identity card on
                /extranetDashboard; data comes from /api/agent/{id} (the
                same record /registration/agent/view/{id} displays). ── */}
            {agentInfo && (() => {
              // Same robust logo handling as AgentView: accept a data:URL
              // or raw base64, sniff the MIME from the magic bytes, fall
              // back to an icon badge when there's no logo.
              const raw =
                typeof agentInfo.agentLogo === "string"
                  ? agentInfo.agentLogo.trim()
                  : "";
              let logoSrc = "";
              if (raw) {
                if (raw.startsWith("data:")) {
                  logoSrc = raw;
                } else {
                  let mime = "image/png";
                  if (raw.startsWith("/9j/")) mime = "image/jpeg";
                  else if (raw.startsWith("iVBORw")) mime = "image/png";
                  else if (raw.startsWith("R0lGOD")) mime = "image/gif";
                  else if (raw.startsWith("UklGR")) mime = "image/webp";
                  logoSrc = `data:${mime};base64,${raw}`;
                }
              }
              const locationBits = [
                agentInfo.address,
                agentInfo.placeName,
                agentInfo.provinceName,
                agentInfo.countryName,
              ]
                .filter(Boolean)
                .join(", ");
              const contactPerson =
                agentInfo.contactPerson ||
                [agentInfo.firstName, agentInfo.lastName]
                  .filter(Boolean)
                  .join(" ");
              const phone =
                agentInfo.mobileNumber || agentInfo.telephoneNumber;
              const managerBlock = (label, name, contactNo, email) =>
                name || contactNo || email ? (
                  <div style={{ minWidth: 170 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: ".06em",
                        textTransform: "uppercase",
                        color: "#EC0B43",
                        marginBottom: 6,
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 5,
                        fontSize: 13,
                        color: "#3E3E3B",
                      }}
                    >
                      {name && (
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <FaUser color="#9A9A95" /> {name}
                        </span>
                      )}
                      {contactNo && (
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <FaPhone color="#9A9A95" /> {contactNo}
                        </span>
                      )}
                      {email && (
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <FaEnvelope color="#9A9A95" /> {email}
                        </span>
                      )}
                    </div>
                  </div>
                ) : null;
              const fmBlock = managerBlock(
                "Finance Manager",
                agentInfo.financeManagerName,
                agentInfo.financeManagerContactNo,
                agentInfo.financeManagerEmail,
              );
              const gmBlock = managerBlock(
                "General Manager",
                agentInfo.gmName,
                agentInfo.gmContactNo,
                agentInfo.gmEmail,
              );
              return (
                <section>
                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #ECECE8",
                      borderRadius: 16,
                      padding: "14px 18px",
                      boxShadow:
                        "0 1px 3px rgba(17,19,24,.04), 0 8px 20px rgba(17,19,24,.045)",
                    }}
                  >
                    {/* Single wrapping row — logo, welcome, FM, GM, contact —
                        keeps the card short enough that Quick Actions and the
                        Credit panel stay above the fold. */}
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 16,
                        alignItems: "center",
                      }}
                    >
                      {logoSrc ? (
                        <img
                          src={logoSrc}
                          alt={`${agentInfo.companyName || "Agent"} logo`}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                          style={{
                            width: 52,
                            height: 52,
                            objectFit: "contain",
                            borderRadius: 13,
                            border: "1px solid #ECECE8",
                            background: "#FAFAF8",
                            flexShrink: 0,
                          }}
                        />
                      ) : (
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
                          <FaUserTie size={22} />
                        </div>
                      )}
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
                          {agentInfo.companyName || "Agent"}
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
                      {fmBlock}
                      {gmBlock}
                      {(contactPerson || phone || agentInfo.personalEmail) && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            fontSize: 13,
                            color: "#3E3E3B",
                          }}
                        >
                          {contactPerson && (
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <FaUser color="#9A9A95" /> {contactPerson}
                            </span>
                          )}
                          {phone && (
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <FaPhone color="#9A9A95" /> {phone}
                            </span>
                          )}
                          {agentInfo.personalEmail && (
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <FaEnvelope color="#9A9A95" /> {agentInfo.personalEmail}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── Credit Overview — kept inside the welcome card,
                        small single-line strip right under the identity
                        row instead of a separate full panel. ── */}
                    <div className="agent-credit-compact">
                      {loadingCredit ? (
                        <span className="acc-loading">Loading credit information…</span>
                      ) : creditSummary ? (
                        <>
                          <span className="acc-dot" />
                          <span className="acc-label">Credit Overview</span>
                          <span className="acc-stat">
                            Limit <b>{formatNumber(creditSummary.creditLimit)}</b>
                          </span>
                          <span className="acc-stat">
                            Used <b>{formatNumber(creditSummary.used)}</b>
                          </span>
                          <span className="acc-stat">
                            Available <b style={{ color: "var(--color-primary)" }}>{formatNumber(creditSummary.available)}</b>
                          </span>
                          <span className="acc-badge">{creditSummary.usedPercent}% used</span>
                        </>
                      ) : (
                        <span className="acc-loading">No credit information available</span>
                      )}
                    </div>
                  </div>
                </section>
              );
            })()}

            {/* ── Quick Actions — every New Booking feature as a neat tile
                grid, each navigating straight to its own page ── */}
            <section>
              <div className="agent-qa-headrow">
                <p className="qa-label" style={{ marginBottom: 0 }}>Quick Actions</p>
                {/* <button type="button" className="agent-qa-edit-btn">
                  <FaPen size={11} /> Edit Actions
                </button> */}
              </div>
              <div className="agent-qa-panel">
                <div className="agent-qa-grid">
                  {bookingActions.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      className={`agent-qa-tile tone-${a.tone}${
                        a.comingSoon ? " is-coming-soon" : ""
                      }`}
                      onClick={a.comingSoon ? undefined : () => navigate(a.to)}
                      disabled={a.comingSoon}
                      aria-disabled={a.comingSoon ? "true" : undefined}
                      title={a.comingSoon ? COMING_SOON_TITLE : undefined}
                    >
                      <span className={`agent-qa-icon tone-${a.tone}`}>{a.icon}</span>
                      <span>{a.label}</span>
                      {a.comingSoon && (
                        <span className="agent-qa-coming-badge" aria-hidden="true">
                          Coming soon
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* ── Manage — compact gradient shortcut cards ── */}
            <section>
              <p className="qa-label">Manage</p>
              <div className="agent-manage-grid">
                {manageActions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    className={`agent-manage-card tone-${a.tone}`}
                    onClick={a.onClick}
                  >
                    <span className="agent-manage-dots" aria-hidden="true" />
                    <span className="agent-manage-icon">{a.icon}</span>
                    <span className="agent-manage-body">
                      <span className="agent-manage-title">{a.label}</span>
                      <span className="agent-manage-desc">{a.desc}</span>
                    </span>
                    <span className="agent-manage-arrow">
                      <FaArrowRight size={10} />
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* ── Overview — icon-badged stat cards ── */}
            <section>
              <p className="qa-label">Overview</p>
              <div className="agent-overview-strip">
                <div className="agent-overview-card">
                  <span className="agent-overview-icon tone-pink"><FaCalendarCheck /></span>
                  <span className="agent-overview-label">Total Bookings</span>
                  <span className="agent-overview-value">
                    {formatNumber(dashboardStatus.totalBookings)}
                  </span>
                </div>
                <div className="agent-overview-card">
                  <span className="agent-overview-icon tone-green"><FaSyncAlt /></span>
                  <span className="agent-overview-label">Today's Bookings</span>
                  <span className="agent-overview-value">
                    {formatNumber(todayBookings)}
                  </span>
                </div>
                {/* "Total Revenue" removed (audit FA-17): the figure was the
                    platform's markup on this agent's bookings (selling price
                    minus supplier cost), which agents must not see. The
                    backend no longer sends it for agent logins. */}
                <div className="agent-overview-card">
                  <span className="agent-overview-icon tone-orange"><FaHotel /></span>
                  <span className="agent-overview-label">Hotels Bookings</span>
                  <span className="agent-overview-value">
                    {formatNumber(dashboardStatus.hotelsListed)}
                  </span>
                </div>
                {/* API Bookings — hidden for now, kept for a quick re-enable.
                <div className="agent-overview-card">
                  <span className="agent-overview-icon tone-blue"><FaGlobeAmericas /></span>
                  <span className="agent-overview-label">API Bookings</span>
                  <span className="agent-overview-value">
                    {formatNumber(dashboardStatus.totalApiBookings)}
                  </span>
                </div>
                */}
              </div>
            </section>

            {/* Analytics section hidden by request. Code retained via git
                history — restore this block to bring it back. */}

          </main>
        </div>

        <DashboardFooter />
      </div>
    </>
  );
}
