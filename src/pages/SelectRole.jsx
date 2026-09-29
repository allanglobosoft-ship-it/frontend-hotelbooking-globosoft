import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../styles/SelectRole.css";
import DashboardRedirections from "../components/DashboardRedirections";

const SelectRole = () => {
  const { state } = useLocation();
  const navigate = useNavigate();

  const roles = state?.roles || [];
  console.log("roles inside select role::", roles);

  // Redirect to login if no state or roles
  if (!state || !state.roles || state.roles.length === 0) {
    console.log("No roles provided, redirecting to /login");
    navigate("/login");
    return null;
  }

  // Map roles to icons and descriptions
  const roleData = roles.map((role) => {
    let icon, description, color;
    switch (role.toLowerCase()) {
      case "admin":
        icon = "fas fa-user-shield";
        description = "Full system access with administrative privileges";
        color = "#e74c3c";
        break;
      case "agent":
        icon = "fas fa-user-tie";
        description = "Manage bookings and customer interactions";
        color = "#3498db";
        break;
      case "staff":
        icon = "fas fa-users";
        description = "Operational tasks and support functions";
        color = "#2ecc71";
        break;
      case "supplier":
        icon = "fas fa-truck";
        description = "Manage the services enabled for your supplier account";
        color = "#f39c12";
        break;
      case "dmc":
        icon = "fas fa-map-marked-alt";
        description = "Manage the services enabled for your DMC account";
        color = "#8e44ad";
        break;
      default:
        icon = "fas fa-user";
        description = "Custom role with specific permissions";
        color = "#9b59b6";
        break;
    }
    return { name: role, icon, description, color };
  });

  const handleRoleSelection = (role) => {
    DashboardRedirections(role, navigate);
   
    localStorage.setItem("currentActiveRole", role);
    console.log(`Role selected: ${role}`);
  };

  return (
    <div className="select-role-page">
      {/* Header */}
      <div className="role-header">
        <div className="header-content">
          <div className="company-info">
            <img
              src={`${process.env.PUBLIC_URL}/images/logo-1.jpg`}
              alt="Globosoft Logo"
              className="company-logo"
            />
            <div className="company-details">
              <h1 className="company-name">Globosoft</h1>
              <p className="company-tagline">Global Contracting Solutions</p>
            </div>
          </div>
          <div className="header-features">
            <div className="feature-item">
              <i className="fas fa-shield-alt"></i>
              <span>Secure Platform</span>
            </div>
            <div className="feature-item">
              <i className="fas fa-globe"></i>
              <span>Global Reach</span>
            </div>
            <div className="feature-item">
              <i className="fas fa-clock"></i>
              <span>24/7 Support</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="role-main-content">
        <div className="role-container">
          <div className="role-header-section">
            <h2 className="role-title-main">Select Your Role</h2>
            <p className="role-subtitle">Choose the role that best matches your responsibilities</p>
          </div>
          
          <div className="role-grid">
            {roleData.map((role, index) => (
              <div
                className="role-card"
                key={index}
                onClick={() => handleRoleSelection(role.name)}
                style={{ '--role-color': role.color }}
              >
                <div className="role-icon">
                  <i className={role.icon}></i>
                </div>
                <h3 className="role-name">{role.name}</h3>
                <p className="role-description">{role.description}</p>
                <div className="role-select-indicator">
                  <i className="fas fa-arrow-right"></i>
                </div>
              </div>
            ))}
          </div>

          <div className="role-footer">
            <div className="security-notice">
              <i className="fas fa-shield-alt"></i>
              <span>Your role selection is secure and encrypted</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectRole;