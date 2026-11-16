import React from 'react';
import RegionalClock from '../components/RegionalClock';
import FooterLegalLinks from '../components/FooterLegalLinks';
import GloboFooterMarks from '../components/GloboFooterMarks';

/* ══════════════════════════════════════════════════════════════
   SHARED DASHBOARD SKIN
   Single source of truth for the red+white "rw-dashboard" look.
   Used by Admin / Agent / Staff / Extranet dashboards so they all
   share the exact same shell, KPI cards, quick-action row, charts
   and footer. Keep dashboard-specific markup in each page; keep the
   reusable primitives and styles here.
══════════════════════════════════════════════════════════════ */

/* ─── number helper ─── */
export const formatNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString() : '0';
};

/* ─── icons ─── */
export const ICONS = {
  hotel:    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
  agent:    <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  booking:  <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
  transfer: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
  tour:     <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
  account:  <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  chevron:  <polyline points="6 9 12 15 18 9"/>,
  mappin:   <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>,
  /* extra icons used by agent / staff / extranet dashboards */
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></>,
  wallet:   <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></>,
  image:    <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
  user:     <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  list:     <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
  check:    <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
  cancel:   <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
  /* airplane silhouette — used by the AdminDashboard Flight quick action */
  flight:   <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>,
};

export const Icon = React.memo(({ name, size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {ICONS[name]}
  </svg>
));

/* ══ HEADER — title + subtitle on the left, regional clock on the right ══ */
export function DashboardHeader({ title, subtitle = "Welcome back. Here's what's happening today." }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '28px',
        gap: '16px',
        flexWrap: 'wrap',
      }}
    >
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
          {title}
        </h1>
        <p style={{ fontSize: '13.5px', color: 'var(--color-text-muted)', marginTop: '4px', marginBottom: 0 }}>
          {subtitle}
        </p>
      </div>
      <RegionalClock />
    </div>
  );
}

/* ══ QUICK ACTIONS — single scrollable row of branded buttons ══ */
export function QuickActions({ actions = [], label = 'Quick Actions' }) {
  return (
    <section className="qa-section">
      <p className="qa-label">{label}</p>
      <div className="qa-row">
        {actions.map((a) => {
          const disabled = !a.onClick && !a.to;
          return (
            <button
              key={a.label}
              className={`qa-btn ${a.cls || ''}`}
              disabled={disabled}
              onClick={() => { if (a.onClick) a.onClick(); else if (a.to) a.to(); }}
            >
              <span className="qa-icon"><Icon name={a.icon} size={13} /></span>
              {a.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ══ KPI CARD — accent-coloured surface, circular icon badge ══ */
export function KpiCard({ title, value, icon = 'booking', color = '#6366f1', breakdown }) {
  return (
    <div className="kpi-card" style={{ '--kpi-color': color }}>
      <div className="kpi-top">
        <div className="kpi-icon-wrap" style={{ background: '#ffffff' }}>
          <Icon name={icon} size={16} color={color} />
        </div>
      </div>
      <div className="kpi-value" style={{ color }}>{value}</div>
      <div className="kpi-title">{title}</div>
      {breakdown && <div className="kpi-breakdown">{breakdown}</div>}
    </div>
  );
}

/* ══ CHART CARD — white panel with coloured dot header + badge ══ */
export function ChartCard({ title, badge = 'Last 5 days', dotColor = 'var(--color-primary)', children }) {
  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <span className="chart-dot" style={{ background: dotColor }} />
        <h3>{title}</h3>
        {badge && <span className="chart-badge">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

/* ══ FOOTER — branded band, dashboard only ══ */
/**
 * The one dashboard footer. Every dashboard in the system renders this, so the
 * five of them cannot drift apart again.
 *
 * `className` only picks which band it sits in — `adm-foot` for the admin /
 * super-admin shell, the default `dash-footer` for the rw-dashboard skin. Both
 * are the same orange band with slightly different padding and type size,
 * which is why the class stays a parameter instead of being unified away.
 *
 * tone="brand" on both marks: the band is the orange primary, so they use
 * their white cuts — the red wordmark would barely read on it.
 */
export function DashboardFooter({ className = "dash-footer" }) {
  return (
    <footer className={className}>
      {/* Left-hand mark deliberately hidden for now — only the "Powered by"
          attribution on the right remains. */}
      <span className="dash-footer-copy">
        © {new Date().getFullYear()} <strong>Globosoft</strong>. All rights
        reserved.
      </span>
      {/* Middle child of a space-between row, so it centres itself. */}
      <FooterLegalLinks />
      <GloboFooterMarks side="right" tone="brand" label="Powered by" />
    </footer>
  );
}

/* ══════════════════════════════════════════
   STYLES — shared across all dashboards
══════════════════════════════════════════ */
export const dashboardCss = `
@import url('https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.dash-shell {
  font-family: 'Lexend', sans-serif;
  background: #f0f2f8;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  color: #1a1d23;
}
.dash-body { display: flex; flex-grow: 1; }
.dash-main {
  flex-grow: 1;
  padding: 20px 24px 32px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── Section label ── */
.qa-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .09em;
  text-transform: uppercase;
  color: #9198a8;
  margin-bottom: 10px;
}

/* ── Quick Actions — single row, scrollable ── */
.qa-section { display: flex; flex-direction: column; }
.qa-row {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.qa-row::-webkit-scrollbar { height: 3px; }
.qa-row::-webkit-scrollbar-thumb { background: #dde0ea; border-radius: 99px; }

.qa-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 10px;
  font-size: 12.5px;
  font-weight: 500;
  font-family: 'Lexend', sans-serif;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0,0,0,.1);
  transition: transform .15s, box-shadow .15s;
}
.qa-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(0,0,0,.14);
}
.qa-btn:disabled { opacity: .45; cursor: not-allowed; }
.qa-icon { display: flex; align-items: center; }
.btn-indigo { background: #6366f1; color: #fff; }
.btn-green  { background: #10b981; color: #fff; }
.btn-yellow { background: #f59e0b; color: #fff; }
.btn-blue   { background: #0ea5e9; color: #fff; }
.btn-pink   { background: #ec4899; color: #fff; }
.btn-purple { background: #8b5cf6; color: #fff; }

/* On small screens, wrap the quick-action buttons onto multiple rows so every
   button stays fully visible instead of being cut off in the scroll row. */
@media (max-width: 640px) {
  .qa-row { flex-wrap: wrap; overflow-x: visible; padding-bottom: 0; }
  .qa-btn { flex: 1 1 auto; justify-content: center; }
}

/* ── KPI Grid — 3 columns × 2 rows ── */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
@media (max-width: 1050px) { .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px)  { .kpi-grid { grid-template-columns: minmax(0, 1fr); } }

/* Skeleton loader */
.kpi-skeleton {
  border-radius: 14px;
  height: 130px;
  background: linear-gradient(90deg, #e4e7f0 25%, #eef0f7 50%, #e4e7f0 75%);
  background-size: 200% 100%;
  animation: shim 1.4s infinite;
}
@keyframes shim { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }

/* ── KPI Card ── */
.kpi-card {
  background: #fff;
  border-radius: 14px;
  padding: 14px 14px 12px;
  position: relative;
  overflow: visible;
  box-shadow: 0 1px 3px rgba(0,0,0,.06), 0 4px 14px rgba(0,0,0,.05);
  border: 1px solid rgba(0,0,0,.05);
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: box-shadow .2s, transform .2s;
  min-width: 0;   /* allow the card to shrink within its grid track */
}
.kpi-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,.09), 0 12px 28px rgba(0,0,0,.07);
  transform: translateY(-2px);
}
.kpi-bar-top {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  border-radius: 14px 14px 0 0;
  opacity: .85;
}

/* icon row — space-between pushes dropdown to the right */
.kpi-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
  gap: 8px;
  min-height: 36px;   /* keeps cards without dropdown same height as cards with one */
}
.kpi-icon-wrap {
  width: 36px; height: 36px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.kpi-dropdowns {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: flex-end;
}

.kpi-value { font-size: 22px; font-weight: 700; letter-spacing: -.4px; line-height: 1; }
.kpi-title { font-size: 11.5px; color: #8692a6; font-weight: 500; margin-top: 3px; }

/* ── Breakdown ── */
.kpi-breakdown { margin-top: 12px; padding-top: 12px; border-top: 1px solid #f0f1f5; }
.bp-wrap { display: flex; flex-direction: column; }
.bp-title {
  font-size: 9.5px; font-weight: 700;
  letter-spacing: .07em; text-transform: uppercase;
  color: #b0b8c8; margin-bottom: 7px;
}
.bp-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 4px 0;
  border-bottom: 1px dashed #f0f2f6;
}
.bp-row:last-child { border-bottom: none; }
.bp-label { font-size: 12px; color: #8692a6; }
.bp-value { font-size: 12px; font-weight: 600; color: #1a1d23; }

/* ── Dropdown ── */
.pdd-wrap { position: relative; }
.pdd-toggle {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 8px;
  background: #fff;
  border: 1px solid #e2e6f0;
  border-radius: 8px;
  font-size: 10px; font-weight: 500; font-family: 'Lexend', sans-serif;
  color: #4a5568; cursor: pointer; white-space: nowrap;
  box-shadow: 0 1px 3px rgba(0,0,0,.05);
  transition: border-color .15s, box-shadow .15s;
}
.pdd-toggle:hover,
.pdd-toggle.pdd-open {
  border-color: var(--dd-accent, #6366f1);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dd-accent, #6366f1) 12%, transparent);
}
.pdd-chevron { display: flex; align-items: center; transition: transform .2s; }
.pdd-chevron-up { transform: rotate(180deg); }

.pdd-menu {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 9999;
  background: #fff;
  border: 1px solid #eaecf5;
  border-radius: 14px;
  min-width: 220px; max-height: 280px; overflow-y: auto;
  box-shadow: 0 4px 6px rgba(0,0,0,.04), 0 12px 32px rgba(0,0,0,.11);
  animation: ddIn .14s ease;
}
@keyframes ddIn {
  from { opacity: 0; transform: translateY(-5px) scale(.98); }
  to   { opacity: 1; transform: none; }
}
.pdd-menu-header {
  display: flex; align-items: center; gap: 7px;
  padding: 10px 14px 8px;
  border-bottom: 1px solid #f0f2f8;
  font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
}
.pdd-empty { padding: 14px; font-size: 12px; color: #b0b8c8; text-align: center; }
.pdd-country-label {
  padding: 7px 14px 2px;
  font-size: 9px; font-weight: 700; letter-spacing: .09em;
  text-transform: uppercase; color: #c0c8d8;
}
.pdd-city-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 14px;
  border-bottom: 1px solid #f5f7fc;
  transition: background .1s; cursor: default;
}
.pdd-city-row:hover { background: #f9fafd; }
.pdd-city-row:last-child { border-bottom: none; }
.pdd-city { font-size: 12px; color: #5a6072; }
.pdd-val  { font-size: 12px; font-weight: 600; }

/* ── Charts ── */
.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
@media (max-width: 860px) { .chart-grid { grid-template-columns: minmax(0, 1fr); } }

.chart-card {
  background: #fff;
  border-radius: 14px;
  padding: 18px 18px 14px;
  border: 1px solid rgba(0,0,0,.05);
  box-shadow: 0 1px 3px rgba(0,0,0,.06), 0 4px 14px rgba(0,0,0,.05);
  transition: box-shadow .2s, transform .2s;
  /* Grid/flex items default to min-width:auto, so a responsive chart canvas
     would force this card wider than its column and overflow on narrow
     screens. Allow it to shrink to the available track width instead. */
  min-width: 0;
}
.chart-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,.09), 0 12px 28px rgba(0,0,0,.07);
  transform: translateY(-2px);
}
.chart-card-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 14px;
}
.chart-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.chart-card-header h3 { font-size: 13px; font-weight: 600; color: #1a1d23; margin: 0; flex: 1; }
.chart-badge {
  font-size: 10px; font-weight: 500;
  background: #f0f2f8; color: #8692a6;
  padding: 3px 9px; border-radius: 99px;
}

/* ── Credit panel (Agent dashboard) ── */
.credit-panel-stats { display: flex; flex-wrap: wrap; gap: 22px; margin-top: 14px; }
.credit-stat { display: flex; flex-direction: column; gap: 2px; }
.credit-stat-label {
  font-size: 9.5px; font-weight: 700; letter-spacing: .07em;
  text-transform: uppercase; color: #b0b8c8;
}
.credit-stat-value { font-size: 16px; font-weight: 700; color: #1a1d23; }
.credit-bar {
  height: 10px; border-radius: 99px;
  background: #eef0f7; overflow: hidden; margin-top: 4px;
}
.credit-bar-fill { height: 100%; border-radius: 99px; transition: width .4s ease; }

/* ══════════════════════════════════════════
   RED + WHITE DASHBOARD SKIN  (ibyta-inspired)
   Every rule is scoped under .rw-dashboard so nothing
   bleeds outside the dashboard. No global Bootstrap/Sass
   variables are changed — only local component vars.
══════════════════════════════════════════ */
.rw-dashboard {
  /* Bootstrap component vars — local override only */
  --bs-primary: #EC0B43;
  --bs-primary-rgb: 247, 94, 0;
  --bs-link-color: #EC0B43;
  --bs-link-hover-color: #C90939;
  /* brand tokens */
  --color-primary: #EC0B43;
  --color-primary-hover: #C90939;
  --color-primary-tint: #FDE7ED;
  --color-secondary: #2F3E53;
  --color-bg: #FFFFFF;
  --color-bg-muted: #F5F6F7;
  --color-panel: #ECEEEF;
  --color-border: #D7D8DA;
  --color-text: #1E2530;
  --color-text-muted: #6B7280;
  --color-success: #1E9E6A;
  --color-warning: #E6A100;
}
.dash-shell.rw-dashboard { background: var(--color-bg-muted); color: var(--color-text); }

/* ── Section eyebrow labels ── */
.rw-dashboard .qa-label { color: var(--color-text-muted); }

/* ── Quick Actions — unify multi-color buttons to solid red ── */
.rw-dashboard .qa-btn {
  background: var(--color-primary);
  color: #fff;
  border-radius: 4px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  box-shadow: 0 1px 3px rgba(236, 11, 67,.28);
}
.rw-dashboard .qa-btn:hover:not(:disabled) { background: var(--color-primary-hover); }
.rw-dashboard .btn-indigo,
.rw-dashboard .btn-green,
.rw-dashboard .btn-yellow,
.rw-dashboard .btn-blue,
.rw-dashboard .btn-pink,
.rw-dashboard .btn-purple { background: var(--color-primary); color: #fff; }

/* ── KPI cards — Select-Role card treatment: gradient surface, a
   per-card coloured top accent bar, circular icon, lift on hover. ── */
.rw-dashboard .kpi-card {
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  border: 2px solid var(--color-border);
  border-radius: 16px;
  transition: transform .3s cubic-bezier(0.4,0,0.2,1), box-shadow .3s ease, border-color .3s ease;
}
.rw-dashboard .kpi-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 4px;
  background: var(--kpi-color, var(--color-secondary));
  border-radius: 16px 16px 0 0;
  transition: height .3s ease;
}
.rw-dashboard .kpi-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 20px 40px rgba(0,0,0,.15);
  border-color: var(--kpi-color, var(--color-secondary));
}
.rw-dashboard .kpi-card:hover::before { height: 6px; }
/* circular white icon badge with soft shadow, like the role-card icon */
.rw-dashboard .kpi-icon-wrap {
  border-radius: 50%;
  box-shadow: 0 6px 16px rgba(0,0,0,.10);
}
.rw-dashboard .kpi-title { color: var(--color-text-muted); }

/* ── TopBar — red brand band, white logo / text / icons ── */
.rw-dashboard .topbar {
  background: var(--color-primary) !important;
  box-shadow: 0 1px 6px rgba(0,0,0,.14) !important;
}
.rw-dashboard .topbar .navbar-brand,
.rw-dashboard .topbar .navbar-brand span,
.rw-dashboard .topbar .profile-toggle,
.rw-dashboard .topbar .profile-toggle span,
.rw-dashboard .topbar .nav a,
.rw-dashboard .topbar .nav button,
.rw-dashboard .topbar .nav .text-dark { color: #fff !important; }
.rw-dashboard .topbar .logo-placeholder { background: #fff; color: var(--color-primary); }
.rw-dashboard .topbar .badge.bg-danger {
  background: #fff !important;
  color: var(--color-primary) !important;
}

/* ── Sidebar — white bg, slate text/icons, red active, muted hover ── */
.rw-dashboard .sidebar { background: var(--color-bg) !important; }
.rw-dashboard .sidebar .nav-item-custom .nav-link { color: var(--color-secondary); }
.rw-dashboard .sidebar .sidebar-icon { color: var(--color-secondary); }
.rw-dashboard .sidebar .caret,
.rw-dashboard .sidebar .caret-small { color: var(--color-secondary); }
.rw-dashboard .sidebar .nav-item-custom .nav-link:hover,
.rw-dashboard .sidebar .nav-item-custom.nav-item-has-children:hover .nav-link {
  background: var(--color-primary);
  color: #fff;
}
.rw-dashboard .sidebar .nav-item-custom .nav-link:hover .sidebar-icon,
.rw-dashboard .sidebar .nav-item-custom.nav-item-has-children:hover .nav-link .sidebar-icon,
.rw-dashboard .sidebar .nav-item-custom .nav-link:hover .caret,
.rw-dashboard .sidebar .nav-item-custom.nav-item-has-children:hover .nav-link .caret {
  color: #fff;
}
/* Active / expanded item → red text + red icon + 3px red left border + tint row */
.rw-dashboard .sidebar .nav-item-custom .nav-link.rw-active,
.rw-dashboard .sidebar .submenu .submenu-accordion-header.open {
  color: var(--color-primary) !important;
  background: var(--color-primary-tint) !important;
  border-left: 3px solid var(--color-primary) !important;
}
.rw-dashboard .sidebar .nav-link.rw-active .sidebar-icon { color: var(--color-primary); }
/* Submenu links → slate, red on hover */
.rw-dashboard .sidebar .submenu .submenu-link { color: var(--color-secondary) !important; }
.rw-dashboard .sidebar .submenu .submenu-link:hover {
  background: var(--color-primary) !important;
  color: #fff !important;
}

/* ── Inputs / focus rings inside the dashboard → red ── */
.rw-dashboard .form-control:focus,
.rw-dashboard .pdd-toggle:focus {
  border-color: var(--color-primary) !important;
  box-shadow: 0 0 0 .2rem rgba(236, 11, 67,.25) !important;
}

/* ── Footer — red brand band, dashboard only ── */
.rw-dashboard .dash-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px 24px;
  background: var(--color-primary);
  border-top: 1px solid var(--color-primary-hover);
  color: rgba(255, 255, 255, .82);
  font-size: 12.5px;
  /* The Globosoft marks size themselves to match every other footer — see
     GloboFooterMarks.css. */
}
.rw-dashboard .dash-footer-copy { font-weight: 600; color: #fff; }
@media (max-width: 640px) {
  .rw-dashboard .dash-footer { justify-content: center; text-align: center; }
}
`;
