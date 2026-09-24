import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import RegionalClock from '../components/RegionalClock';
import LineChart from '../components/LineChart';
import BarChart from '../components/BarChart';
import axiosInstance from '../components/AxiosInstance';
import { Icon, formatNumber } from './dashboardSkin';
import { Collapse } from 'react-bootstrap';
import { FaChartLine, FaChevronDown } from 'react-icons/fa';
import '../styles/AdminDashboardModern.css';

/* ─── static demo data (charts) ─── */
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

const groupByCountryCity = (list = [], labelKey) => {
  const grouped = {};
  list.forEach((item) => {
    const country = item.country || 'Unknown Country';
    const city = item.city || 'Unknown City';
    if (!grouped[country]) grouped[country] = {};
    if (!grouped[country][city]) grouped[country][city] = [];
    grouped[country][city].push(item[labelKey] || '-');
  });
  return grouped;
};

/* ── Location dropdown (restored) ── */
function AdmDropdown({ label, grouped, fmt }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const countries = Object.keys(grouped || {});
  return (
    <div className="adm-dd" ref={ref}>
      <button type="button" className="adm-dd-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="mappin" size={10} /> {label}
      </button>
      {open && (
        <div className="adm-dd-menu" role="menu">
          {countries.length === 0 ? (
            <div className="adm-dd-empty">No records found</div>
          ) : countries.map((c) => (
            <div key={c}>
              <div className="adm-dd-country">{c}</div>
              {Object.keys(grouped[c]).map((city) => {
                const entry = grouped[c][city];
                const val = Array.isArray(entry) ? entry.length : (fmt ? fmt(entry) : entry);
                return (
                  <div className="adm-dd-row" key={city} role="menuitem">
                    <span className="adm-dd-city">{city}</span>
                    <span className="adm-dd-val">{val}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── KPI card — supports optional dropdown + breakdown ── */
function Kpi({ icon, label, value, slate, dropdown, breakdown }) {
  return (
    <div className="adm-kpi">
      <div className="adm-kpi-top">
        <div className={`adm-kpi-icon ${slate ? 'slate' : ''}`}><Icon name={icon} size={19} /></div>
        {dropdown}
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

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stat, setStat] = useState(DEFAULT_DASHBOARD);
  const [loading, setLoading] = useState(true);
  // Analytics charts are collapsed by default to save vertical space.
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  // Admin-only Unbooked Opportunities tile — reads the aggregate
  // summary from the new /api/ai/unbooked-opportunities/summary endpoint
  // in an isolated effect so the main dashboard fetch is untouched.
  const [unbookedSummary, setUnbookedSummary] = useState({
    totalCount: 0,
    potentialValue: 0,
    currency: 'AED',
  });

  useEffect(() => {
    const init = async () => {
      try {
        const userName = localStorage.getItem('UserName') ?? sessionStorage.getItem('UserName');
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

  useEffect(() => {
    // Fire-and-forget: the tile silently keeps its zero defaults on any
    // failure (403 for non-admins, network, backend down) so it never
    // breaks the rest of the dashboard.
    axiosInstance
      .get('/api/ai/unbooked-opportunities/summary')
      .then((res) => {
        const body = res?.data || {};
        setUnbookedSummary({
          totalCount: Number(body.totalCount) || 0,
          potentialValue: Number(body.potentialValue) || 0,
          currency: body.currency || 'AED',
        });
      })
      .catch(() => {});
  }, []);

  const totalBookingsObj = typeof stat.totalBookings === 'object' ? stat.totalBookings : {};
  const totalBookings = sumValues(totalBookingsObj);
  const apiBookingsCount = Number(stat.apiHotelBookings) || 0;

  const nonApiBreakdown = [
    { label: 'Hotel', value: totalBookingsObj.hotel || 0 },
    { label: 'Custom Package', value: totalBookingsObj.customPackage || 0 },
    { label: 'Package', value: totalBookingsObj.package || 0 },
    { label: 'Cab', value: totalBookingsObj.cab || 0 },
    { label: 'Offline', value: totalBookingsObj.offline || 0 },
  ];
  const apiBreakdown = [
    { label: 'API Hotel', value: stat.apiHotelBookings || 0 },
    { label: 'Inhouse Hotel', value: stat.inhouseHotelBookings || 0 },
  ];

  const agentsByLocation = useMemo(() => groupByCountryCity(stat.agentList || [], 'companyName'), [stat.agentList]);
  const hotelsByLocation = useMemo(() => groupByCountryCity(stat.hotelList || [], 'hotelName'), [stat.hotelList]);
  const revenueByLocation = useMemo(() => {
    const grouped = {};
    (stat.agentList || []).forEach((a) => {
      const c = a.country || 'Unknown', ct = a.city || 'Unknown';
      if (!grouped[c]) grouped[c] = {};
      grouped[c][ct] = (grouped[c][ct] || 0) + (a.revenue || 0);
    });
    return grouped;
  }, [stat.agentList]);

  const agents = useMemo(() => {
    const list = Array.isArray(stat.agentList) ? [...stat.agentList] : [];
    return list.sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0)).slice(0, 8);
  }, [stat.agentList]);

  /* Quick actions (restored — all six) */
  const actions = [
    { label: 'Add New Hotel',      icon: 'hotel',    to: '/registration/hotel/create',        primary: true },
    { label: 'Add New Agent',      icon: 'agent',    to: '/registration/agent',               primary: true },
    { label: 'Accommodation',      icon: 'booking',  to: '/new-booking/hotel',                primary: true },
    { label: 'Transfer',           icon: 'transfer', to: '/new-booking/cab',                  primary: true },
    { label: 'Tours & Activities', icon: 'tour',     to: '/new-booking/tours-and-activities', primary: true },
    { label: 'Agent Account',      icon: 'account',  to: '/incentive/config',                 primary: true },
    { label: 'Flight',             icon: 'flight',   to: '/new-booking/flight',               primary: true },
  ];

  return (
    <div className="adm-shell">
      <TopBar />
      <div className="adm-body">
        <Sidebar />
        <main className="adm-main">

          {/* ── Header ── */}
          <header className="adm-head">
            <div>
              <p className="adm-eyebrow">Overview</p>
              <h1 className="adm-title">Admin Dashboard</h1>
              <p className="adm-sub">A clear, real-time view of bookings, revenue and your partner network.</p>
            </div>
            <RegionalClock countryCode="AE" serverTimeUrl="/api/dashboard/uae-time" />
          </header>

          {/* ── Quick Actions (restored) ── */}
          <section>
            <p className="adm-section-label">Quick Actions</p>
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

          {/* ── Dashboard area · KPIs (all six, with breakdowns + dropdowns) ── */}
          <section>
            <p className="adm-section-label">Performance</p>
            {loading ? (
              <>
                <div className="adm-kpis">{[...Array(4)].map((_, i) => <div key={i} className="adm-skel" />)}</div>
                <div className="adm-kpis-wide">{[...Array(2)].map((_, i) => <div key={i} className="adm-skel" />)}</div>
              </>
            ) : (
              <>
                {/* four uniform KPI cards */}
                <div className="adm-kpis">
                  <Kpi icon="account" label="Total Revenue" value={`AED ${formatNumber(stat.totalRevenue)}`}
                       dropdown={<AdmDropdown label="By location" grouped={revenueByLocation} fmt={(v) => `AED ${formatNumber(v)}`} />} />
                  <Kpi icon="agent" label="Active Agents" value={formatNumber(stat.totalActiveAgents)} slate
                       dropdown={<AdmDropdown label="By location" grouped={agentsByLocation} />} />
                  <Kpi icon="booking" label="Today's Bookings" value={formatNumber(stat.todayBookings)} slate />
                  <Kpi icon="hotel" label="Hotels Listed" value={formatNumber(stat.totalHotels)}
                       dropdown={<AdmDropdown label="By location" grouped={hotelsByLocation} />} />
                </div>
                {/* two wide cards carrying the breakdowns */}
                <div className="adm-kpis-wide">
                  <Kpi icon="booking" label="Total Bookings" value={formatNumber(totalBookings)} breakdown={nonApiBreakdown} />
                  <Kpi icon="tour" label="API Bookings" value={formatNumber(apiBookingsCount)} breakdown={apiBreakdown} />
                </div>
                {/* Admin-only tile — clickable, jumps to the full report.
                    Wrapped in a div so the existing <Kpi/> component stays
                    presentation-only and untouched; keyboard support via
                    role="button" + Enter/Space. */}
                <div className="adm-kpis-wide">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate('/admin/unbooked-opportunities')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate('/admin/unbooked-opportunities');
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                    aria-label="Open Unbooked Opportunities report"
                  >
                    <Kpi
                      icon="list"
                      label="Unbooked Opportunities"
                      value={`${formatNumber(unbookedSummary.totalCount)} active`}
                      breakdown={[
                        {
                          // Currency lives on the label because the
                          // Kpi breakdown value is passed through
                          // formatNumber(), which would strip a
                          // suffixed currency code.
                          label: `Potential (${unbookedSummary.currency})`,
                          value: unbookedSummary.potentialValue,
                        },
                      ]}
                    />
                  </div>
                </div>
              </>
            )}
          </section>

          {/* ── Dashboard area · charts (collapsible "Analytics") ── */}
          <section>
            {/* Prominent, full-width clickable accordion header. The whole bar
                toggles the charts; the circular chevron flips on expand.
                Collapsed by default to save space. */}
            <button
              type="button"
              className="adm-analytics-toggle"
              onClick={() => setAnalyticsOpen((o) => !o)}
              aria-expanded={analyticsOpen}
              aria-controls="adm-analytics-panel"
            >
              <span className="adm-acc-icon" aria-hidden="true">
                <FaChartLine />
              </span>
              <span className="adm-acc-text">
                <span className="adm-acc-title">Analytics</span>
                <span className="adm-acc-sub">
                  Bookings over time &amp; revenue trend
                </span>
              </span>
              <span className="adm-acc-chev" aria-hidden="true">
                <FaChevronDown />
              </span>
            </button>
            <Collapse in={analyticsOpen}>
              <div id="adm-analytics-panel" className="adm-analytics-panel">
                <div className="adm-charts">
                  <div className="adm-card">
                    <div className="adm-card-head">
                      <span className="adm-dot" style={{ background: '#EC0B43' }} />
                      <h3 className="adm-card-title">Bookings over time</h3>
                      <span className="adm-badge">Last 5 days</span>
                    </div>
                    <LineChart labels={bookingsLabels} data={bookingsData} />
                  </div>
                  <div className="adm-card">
                    <div className="adm-card-head">
                      <span className="adm-dot" style={{ background: '#2F3E53' }} />
                      <h3 className="adm-card-title">Revenue trend</h3>
                      <span className="adm-badge">Last 5 days</span>
                    </div>
                    <BarChart labels={bookingsLabels} data={revenueData} />
                  </div>
                </div>
              </div>
            </Collapse>
          </section>

          {/* ── Listing section · agents table ── */}
          <section>
            <p className="adm-section-label">Listing</p>
            <div className="adm-card">
              <div className="adm-card-head">
                <span className="adm-dot" style={{ background: '#EC0B43' }} />
                <h3 className="adm-card-title">Top agents by revenue</h3>
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

      <footer className="adm-foot">
        <span>© {new Date().getFullYear()} <strong>Globosoft</strong>. All rights reserved.</span>
        <span>Admin Dashboard</span>
      </footer>
    </div>
  );
}
