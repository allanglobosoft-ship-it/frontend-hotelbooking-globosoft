import React from 'react'

const DashboardRedirections = (role, navigate) => {


  const dashboards = {
    "ADMIN": "/adminDashboard",
    "AGENT": "/agentDashboard",
    "STAFF": "/staffDashboard",
    "EXTRANET":"/extranetDashboard",
    // Super admin — same landing as admin (reuses AdminDashboard) but with
    // the SUPER_ADMIN-only menus (Credential Vault, API Access) unlocked
    // and admin-only tools still visible. See PrivateRoute + Sidebar.
    "SUPER_ADMIN": "/superAdminDashboard",
    // Restaurant manager portal — same /auth/login flow as the others,
    // role distinguishes destination. Created via /auth/register with
    // userType = RESTAURANT_EXTRANET (UserAccountService.createRestaurantUser).
    "RESTAURANT_EXTRANET": "/restaurant-extranet/dashboard",
    // Supplier / DMC portal — provisioned by the partner approval flow
    // (PartnerExternalRegistrationService); one shared PartnerDashboard
    // component, two paths so the sidebar can derive the role from the URL.
    "SUPPLIER": "/supplierDashboard",
    "DMC": "/dmcDashboard",
    // Add more roles as needed
  };

  const dashboardPath = dashboards[role] || "/landingPage";
  navigate(dashboardPath);
  return (
    <div></div>
  )
}

export default DashboardRedirections;