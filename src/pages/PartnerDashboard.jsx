import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
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
  FaHandshake,
  FaMapMarkerAlt,
  FaPhone,
  FaEnvelope,
  FaUser,
  FaClipboardList,
} from "react-icons/fa";
import { MdWifiOff } from "react-icons/md";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import usePartnerAccess from "../hooks/usePartnerAccess";
import {
  PARTNER_TYPE_LABEL,
  registrationTargetFor,
  resolveApprovedFeatures,
} from "../config/partnerFeatures";
import {
  dashboardCss,
  DashboardHeader,
  DashboardFooter,
  KpiCard,
} from "./dashboardSkin";

// Feature icon key (config/partnerFeatures.js) → glyph. Same icon set the
// AgentDashboard quick-action tiles use for the matching flows.
const FEATURE_ICONS = {
  hotel: <FaHotel />,
  clock: <FaClock />,
  fire: <FaFire />,
  briefcase: <FaBriefcase />,
  sun: <FaSun />,
  box: <FaBoxOpen />,
  gift: <FaGift />,
  car: <FaCar />,
  taxi: <FaTaxi />,
  globe: <FaGlobeAmericas />,
  offline: <MdWifiOff />,
  utensils: <FaUtensils />,
  heart: <FaHeart />,
  users: <FaUserFriends />,
  plane: <FaPlane />,
  leaf: <FaLeaf />,
  graduation: <FaGraduationCap />,
  user: <FaUserAlt />,
  praying: <FaPrayingHands />,
};

/**
 * Landing page for Supplier / DMC logins (served at /supplierDashboard and
 * /dmcDashboard). Everything on it is derived from the account's live
 * approved features (GET /api/partner/me, re-fetched on every mount so an
 * admin's change shows up immediately): one tile per approved feature in
 * each of the three surfaces a feature unlocks — New Booking, Registration,
 * Booking List — and nothing for features that were not approved.
 */
export default function PartnerDashboard({ partnerType }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { access, loading, error } = usePartnerAccess({ refresh: true });

  const role = String(partnerType || access?.partnerType || "").toLowerCase();
  const typeLabel = PARTNER_TYPE_LABEL[role] || "Partner";
  const profile = access?.profile;

  // The route guard bounces a partner here with the blocked path when they
  // open a module that is not enabled — say so once, then clear the state.
  useEffect(() => {
    const denied = location.state?.partnerDenied;
    if (denied) {
      toast.error("That module is not enabled for your account. Contact the administrator to request access.");
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  const features = useMemo(
    () => resolveApprovedFeatures(access?.approvedFeatures),
    [access],
  );

  const registrationLinks = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const f of features) {
      for (const r of f.registration) {
        if (seen.has(r.to)) continue;
        seen.add(r.to);
        out.push({
          key: `${f.code}-${r.to}`,
          label: r.to === "/registration/hotel" ? "Hotel" : r.label,
          to: registrationTargetFor(role, r.to),
          icon: f.icon,
          tone: f.tone,
        });
      }
    }
    return out;
  }, [features, role]);

  const locationBits = [profile?.address, profile?.city, profile?.country]
    .filter(Boolean)
    .join(", ");

  const renderTiles = (tiles) => (
    <div className="agent-qa-grid">
      {tiles.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`agent-qa-tile tone-${t.tone}`}
          onClick={() => navigate(t.to)}
        >
          <span className={`agent-qa-icon tone-${t.tone}`}>
            {FEATURE_ICONS[t.icon] || <FaClipboardList />}
          </span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <style>{dashboardCss}</style>
      <style>{partnerCss}</style>
      <div className="dash-shell rw-dashboard">
        <TopBar />
        <div className="dash-body">
          <Sidebar />
          <main className="dash-main">
            <DashboardHeader
              title={`${typeLabel} Dashboard`}
              subtitle="Your enabled modules are listed below. Anything missing must be enabled by the administrator."
            />

            {/* ── Identity card ── */}
            {profile && (
              <section>
                <div className="partner-id-card">
                  <div className="partner-id-badge">
                    <FaHandshake size={22} />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div className="partner-id-kicker">
                      {typeLabel} · {profile.status === "ACTIVE" ? "Active" : profile.status}
                    </div>
                    <div className="partner-id-name">{profile.companyName || typeLabel}</div>
                    {locationBits && (
                      <div className="partner-id-line">
                        <FaMapMarkerAlt color="#EC0B43" /> {locationBits}
                      </div>
                    )}
                  </div>
                  <div className="partner-id-contact">
                    {profile.contactPerson && (
                      <span><FaUser color="#9A9A95" /> {profile.contactPerson}</span>
                    )}
                    {profile.phone && (
                      <span><FaPhone color="#9A9A95" /> {profile.phone}</span>
                    )}
                    {profile.email && (
                      <span><FaEnvelope color="#9A9A95" /> {profile.email}</span>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* ── Overview ── */}
            <section>
              <p className="qa-label">Overview</p>
              {loading && !access ? (
                <div className="kpi-grid">
                  {[...Array(3)].map((_, i) => <div key={i} className="kpi-skeleton" />)}
                </div>
              ) : (
                <div className="kpi-grid">
                  <KpiCard title="Enabled Modules" icon="check" color="#10b981" value={String(features.length)} />
                  <KpiCard title="Account Type" icon="account" color="#6366f1" value={typeLabel} />
                  <KpiCard
                    title="Member Since"
                    icon="calendar"
                    color="#EC0B43"
                    value={profile?.memberSince || "—"}
                  />
                </div>
              )}
            </section>

            {error && !access && (
              <section>
                <div className="partner-empty">
                  We could not load your account details. Please refresh the page or contact the administrator.
                </div>
              </section>
            )}

            {access && features.length === 0 && (
              <section>
                <div className="partner-empty">
                  <strong>No modules enabled yet.</strong> Your registration was approved, but no
                  services have been switched on for this account. Please contact the administrator.
                </div>
              </section>
            )}           
          </main>
        </div>
        <DashboardFooter label={`${typeLabel} Dashboard`} />
      </div>
    </>
  );
}

// Tile styles copied from AgentDashboard so the two surfaces look the same;
// the identity card mirrors the ExtranetHotelDashboard one.
const partnerCss = `
  .agent-qa-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }
  .agent-qa-tile {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 6px; padding: 8px 6px; min-height: 80px;
    background: #fff; border: 1px solid rgba(0,0,0,.08); border-radius: 10px;
    font-size: 13px; font-weight: 700; color: #1a1d23; text-align: center; line-height: 1.2;
    cursor: pointer;
    transition: border-color .15s, box-shadow .15s, transform .15s, background-color .15s;
  }
  .agent-qa-tile > span:last-child { max-width: 100%; overflow-wrap: anywhere; word-break: break-word; }
  .agent-qa-tile:hover { box-shadow: 0 10px 20px rgba(0,0,0,.10); transform: translateY(-2px); }
  .agent-qa-tile:active { transform: translateY(0); }
  .agent-qa-tile.tone-pink:hover   { background: #FFF3F5; border-color: #F7BCC8; }
  .agent-qa-tile.tone-orange:hover { background: #FFF9EF; border-color: #FBD9A0; }
  .agent-qa-tile.tone-purple:hover { background: #FAF6FE; border-color: #D9C7FA; }
  .agent-qa-tile.tone-blue:hover   { background: #F2F9FE; border-color: #B9E0FB; }
  .agent-qa-tile.tone-green:hover  { background: #F2FBF6; border-color: #B7EAC9; }
  .agent-qa-tile.tone-teal:hover   { background: #EFFBFA; border-color: #A9E7E1; }
  .agent-qa-icon { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-size: 15px; flex-shrink: 0; }
  .agent-qa-icon.tone-pink   { background: #FDE7ED; color: #EC0B43; }
  .agent-qa-icon.tone-orange { background: #FFF1E0; color: #F59E0B; }
  .agent-qa-icon.tone-purple { background: #F1EAFB; color: #8B5CF6; }
  .agent-qa-icon.tone-blue   { background: #E7F3FE; color: #0EA5E9; }
  .agent-qa-icon.tone-green  { background: #E8F8EE; color: #10B981; }
  .agent-qa-icon.tone-teal   { background: #E3F7F5; color: #14B8A6; }

  .partner-id-card {
    background: #fff; border: 1px solid #ECECE8; border-radius: 16px; padding: 18px 20px;
    display: flex; flex-wrap: wrap; gap: 18px; align-items: center;
    box-shadow: 0 1px 3px rgba(17,19,24,.04), 0 8px 20px rgba(17,19,24,.045);
  }
  .partner-id-badge { width: 52px; height: 52px; border-radius: 13px; background: #FDE7ED; color: #EC0B43; display: grid; place-items: center; flex-shrink: 0; }
  .partner-id-kicker { font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #EC0B43; margin-bottom: 2px; }
  .partner-id-name { font-size: 20px; font-weight: 700; letter-spacing: -.02em; color: #15171C; }
  .partner-id-line { font-size: 13.5px; color: #6B7280; margin-top: 4px; display: flex; align-items: center; gap: 7px; }
  .partner-id-contact { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #3E3E3B; }
  .partner-id-contact span { display: flex; align-items: center; gap: 8px; }
  .partner-empty {
    background: #FFF7ED; border: 1px solid #FED7AA; color: #7C2D12; border-radius: 12px;
    padding: 14px 16px; font-size: 14px; line-height: 1.5;
  }
`;
