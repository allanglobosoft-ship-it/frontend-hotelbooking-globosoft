import React, { useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import LineChart from '../components/LineChart';
import BarChart from '../components/BarChart';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import axiosInstance from '../components/AxiosInstance';
import {
  dashboardCss,
  DashboardHeader,
  DashboardFooter,
  QuickActions,
  KpiCard,
  ChartCard,
  formatNumber,
} from './dashboardSkin';

const kpiData = {
  totalBookings: 1245,
  todaysBookings: 85,
  totalRevenue: 58300,
  activeAgents: 112,
  hotelsListed: 342,
  apiBookings: 413,
};

const bookingsLabels = ['Aug 1', 'Aug 2', 'Aug 3', 'Aug 4', 'Aug 5'];
const bookingsData = [20, 35, 50, 40, 65];
const revenueData = [3000, 4800, 5500, 4000, 6800];

export default function StaffDashboard() {
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const userName = sessionStorage.getItem("UserName");
        if (userName) {
          const response = await axiosInstance.get(`/api/personalProfile/${userName}`);
          console.log("Profile Data:", response.data);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      }
    };

    fetchProfile();
  }, []);

  const actions = [
    { label: 'Accommodation',      icon: 'booking',  onClick: () => navigate('/new-booking/hotel') },
    { label: 'Transfer',           icon: 'transfer' },
    { label: 'Tours & Activities', icon: 'tour' },
  ];

  return (
    <>
      <style>{dashboardCss}</style>
      <div className="dash-shell rw-dashboard">
        <TopBar />
        <div className="dash-body">
          <Sidebar />
          <main className="dash-main">

            {/* Regional date+time chip — United Arab Emirates time from
                the server (/api/dashboard/regional-time). */}
            <DashboardHeader title="Staff Dashboard" />

            {/* ── Quick Actions ── */}
            <QuickActions actions={actions} />

            {/* ── KPI Grid — 3×2 ── */}
            <section>
              <p className="qa-label">Overview</p>
              <div className="kpi-grid">
                <KpiCard title="Total Bookings"   icon="booking" color="#6366f1" value={formatNumber(kpiData.totalBookings)} />
                <KpiCard title="Today's Bookings" icon="booking" color="#0ea5e9" value={formatNumber(kpiData.todaysBookings)} />
                <KpiCard title="Total Revenue"    icon="account" color="#EC0B43" value={`AED ${formatNumber(kpiData.totalRevenue)}`} />
                <KpiCard title="Active Agents"    icon="agent"   color="#f59e0b" value={formatNumber(kpiData.activeAgents)} />
                <KpiCard title="Hotels Listed"    icon="hotel"   color="#8b5cf6" value={formatNumber(kpiData.hotelsListed)} />
                <KpiCard title="API Bookings"     icon="tour"    color="#10b981" value={formatNumber(kpiData.apiBookings)} />
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
