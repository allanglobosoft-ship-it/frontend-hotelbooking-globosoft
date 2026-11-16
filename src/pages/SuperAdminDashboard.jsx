import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import RegionalClock from '../components/RegionalClock';
import LineChart from '../components/LineChart';
import BarChart from '../components/BarChart';
import axiosInstance from '../components/AxiosInstance';
import { Icon, formatNumber, DashboardFooter } from './dashboardSkin';
import { Collapse } from 'react-bootstrap';
import { FaChartLine, FaChevronDown } from 'react-icons/fa';
import '../styles/AdminDashboardModern.css';

const bookingsLabels = ['Aug 1', 'Aug 2', 'Aug 3', 'Aug 4', 'Aug 5'];
const bookingsData   = [20, 35, 50, 40, 65];
const revenueData    = [3000, 4800, 5500, 4000, 6800];

const DEFAULT_DASHBOARD = {
  totalBookings: {}, todayBookings: 0, totalRevenue: 0,
  totalActiveAgents: 0, totalHotels: 0, apiHotelBookings: 0,
  inhouseHotelBookings: 0, agentList: [], hotelList: [],
};

const sumValues = (obj) => (!obj || typeof obj !== 'object')
  ? 0 : Object.values(obj).reduce((a, v) => a + (Number(v) || 0), 0);

function Kpi({ icon, label, value, slate, breakdown }) {
  return (
    <div className="adm-kpi">
      <div className="adm-kpi-top">
        <div className={`adm-kpi-icon ${slate ? 'slate' : ''}`}><Icon name={icon} size={19} /></div>
      </div>
      <div>
        <div className="adm-kpi-value">{value}</div>
        <div className="adm-kpi-label">{label}</div>
      </div>
      {breakdown && (
        <div className="adm-kpi-breakdown">
          {breakdown.map((b) => (
            <div className="adm-bd-row" key={b.label}>
              <span className="adm-bd-label">{b.label}</span>
              <span className="adm-bd-val">{formatNumber(b.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GovernanceCard({ icon, title, desc, to, onNavigate }) {
  return (
    <div
      className="adm-kpi"
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(to)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onNavigate(to);
        }
      }}
      style={{ cursor: 'pointer' }}
      aria-label={`Open ${title}`}
    >
      <div className="adm-kpi-top">
        <div className="adm-kpi-icon slate"><Icon name={icon} size={19} /></div>
      </div>
      <div>
        <div className="adm-kpi-value" style={{ fontSize: 18 }}>{title}</div>
        <div className="adm-kpi-label">{desc}</div>
      </div>
    </div>
  );
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [stat, setStat] = useState(DEFAULT_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const userName = sessionStorage.getItem('UserName');
        if (userName) axiosInstance.get(`/api/personalProfile/${userName}`).catch(() => {});
        const res = await axiosInstance.get('/api/dashboard/stats');
        if (res.data && typeof res.data === 'object') setStat((p) => ({ ...p, ...res.data }));
      } catch {
        setStat(DEFAULT_DASHBOARD);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const totalBookingsObj = typeof stat.totalBookings === 'object' ? stat.totalBookings : {};
  const totalBookings = sumValues(totalBookingsObj);
  const apiBookingsCount = Number(stat.apiHotelBookings) || 0;

  const channelBreakdown = [
    { label: 'Hotel', value: totalBookingsObj.hotel || 0 },
    { label: 'Custom Package', value: totalBookingsObj.customPackage || 0 },
    { label: 'Package', value: totalBookingsObj.package || 0 },
    { label: 'Cab', value: totalBookingsObj.cab || 0 },
    { label: 'Offline', value: totalBookingsObj.offline || 0 },
  ];
  const integrationBreakdown = [
    { label: 'External API', value: stat.apiHotelBookings || 0 },
    { label: 'In-house Inventory', value: stat.inhouseHotelBookings || 0 },
  ];

  const agents = useMemo(() => {
    const list = Array.isArray(stat.agentList) ? [...stat.agentList] : [];
    return list.sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0)).slice(0, 8);
  }, [stat.agentList]);

  const actions = [
    { label: 'Credential Vault',   icon: 'account',  to: '/super-admin/credential-vault',       primary: true },
    { label: 'API Endpoints',      icon: 'list',     to: '/super-admin/api-access/endpoints',   primary: true },
    { label: 'API Clients',        icon: 'user',     to: '/super-admin/api-access/clients',     primary: true },
    { label: 'Admin Management',   icon: 'agent',    to: '/super-admin/admins',                 primary: true },
    { label: 'User Roles',         icon: 'check',    to: '/masters/user-roles',                 primary: true },
    { label: 'Assign Menu',        icon: 'list',     to: '/masters/assign-menu',                primary: true },
    { label: 'Login Logs',         icon: 'calendar', to: '/user-management/login-logs',         primary: true },
    { label: 'Activity Logs',      icon: 'list',     to: '/user-management/activity-logs',      primary: true },
  ];

  const governance = [
    { icon: 'account',  title: 'Credential Vault',  desc: 'Rotate and audit shared service credentials.', to: '/super-admin/credential-vault' },
    { icon: 'list',     title: 'API Endpoints',      desc: 'Catalog of exposed endpoints and their scopes.', to: '/super-admin/api-access/endpoints' },
    { icon: 'user',     title: 'API Clients',        desc: 'Grant, revoke and inspect client permissions.',  to: '/super-admin/api-access/clients' },
    { icon: 'agent',    title: 'Admin Users',        desc: 'Provision or retire admin accounts.',            to: '/super-admin/admins' },
    { icon: 'check',    title: 'User Roles',         desc: 'Define role definitions used across the app.',   to: '/masters/user-roles' },
    { icon: 'calendar', title: 'Login Audit',        desc: 'Recent authentications across every user.',      to: '/user-management/login-logs' },
    { icon: 'list',     title: 'Activity Logs',      desc: 'What each user did, when, from which IP and place.', to: '/user-management/activity-logs' },
  ];

  return (
    <div className="adm-shell">
      <TopBar />
      <div className="adm-body">
        <Sidebar />
        <main className="adm-main">

          <header className="adm-head">
            <div>
              <p className="adm-eyebrow">Platform Control</p>
              <h1 className="adm-title">Super Admin Dashboard</h1>
              <p className="adm-sub">Governance, credentials, access control and a platform-wide view of every tenant.</p>
            </div>
            <RegionalClock />
          </header>

          <section>
            <p className="adm-section-label">Super Admin Shortcuts</p>
            <div className="adm-actions">
              {actions.map((a) => (
                <button
                  key={a.label}
                  className={`adm-action ${a.primary ? 'primary' : ''}`}
                  disabled={!a.to}
                  onClick={() => a.to && navigate(a.to)}
                >
                  <span className="adm-action-ic"><Icon name={a.icon} size={15} /></span>
                  {a.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="adm-section-label">Platform Metrics</p>
            {loading ? (
              <>
                <div className="adm-kpis">{[...Array(4)].map((_, i) => <div key={i} className="adm-skel" />)}</div>
                <div className="adm-kpis-wide">{[...Array(2)].map((_, i) => <div key={i} className="adm-skel" />)}</div>
              </>
            ) : (
              <>
                <div className="adm-kpis">
                  <Kpi icon="account" label="Platform Revenue"      value={`AED ${formatNumber(stat.totalRevenue)}`} />
                  <Kpi icon="agent"   label="Agents on Platform"    value={formatNumber(stat.totalActiveAgents)} slate />
                  <Kpi icon="booking" label="Bookings Today"        value={formatNumber(stat.todayBookings)} slate />
                  <Kpi icon="hotel"   label="Hotels Onboarded"      value={formatNumber(stat.totalHotels)} />
                </div>
                <div className="adm-kpis-wide">
                  <Kpi icon="booking" label="All-time Bookings by Channel"   value={formatNumber(totalBookings)} breakdown={channelBreakdown} />
                  <Kpi icon="tour"    label="API Integrations Volume"        value={formatNumber(apiBookingsCount)} breakdown={integrationBreakdown} />
                </div>
              </>
            )}
          </section>

          <section>
            <p className="adm-section-label">Governance &amp; Access</p>
            <div className="adm-kpis">
              {governance.slice(0, 4).map((g) => (
                <GovernanceCard key={g.title} {...g} onNavigate={navigate} />
              ))}
            </div>
            <div className="adm-kpis">
              {governance.slice(4).map((g) => (
                <GovernanceCard key={g.title} {...g} onNavigate={navigate} />
              ))}
            </div>
          </section>

          {/* Analytics ("Platform Trends") section hidden by request. Code
              retained via git history — restore this block to bring it back. */}

          <section>
            <p className="adm-section-label">Tenant Leaderboard</p>
            <div className="adm-card">
              <div className="adm-card-head">
                <span className="adm-dot" style={{ background: '#EC0B43' }} />
                <h3 className="adm-card-title">Top revenue-generating agents (platform-wide)</h3>
                <button className="adm-badge" style={{ cursor: 'pointer' }} onClick={() => navigate('/registration/agent')}>
                  View all
                </button>
              </div>
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th style={{ width: 56 }}>#</th>
                      <th>Agent</th>
                      <th>Location</th>
                      <th className="num">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={4} className="adm-empty">Loading…</td></tr>
                    ) : agents.length === 0 ? (
                      <tr><td colSpan={4} className="adm-empty">No agents to display yet.</td></tr>
                    ) : agents.map((a, i) => (
                      <tr key={a.id ?? i}>
                        <td><span className="adm-rank">{i + 1}</span></td>
                        <td className="adm-strong">{a.companyName || a.name || 'Unknown agent'}</td>
                        <td className="adm-muted">{[a.city, a.country].filter(Boolean).join(', ') || '—'}</td>
                        <td className="num adm-amount">AED {formatNumber(a.revenue || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

        </main>
      </div>

      {/* Shared with every other dashboard — see DashboardFooter. className
          keeps this shell's own orange band. */}
      <DashboardFooter className="adm-foot" />
    </div>
  );
}
