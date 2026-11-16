import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  Row,
  Col,
  Spinner,
  Button,
  Badge,
  Alert,
} from "react-bootstrap";
import {
  FaUser,
  FaUserShield,
  FaEnvelope,
  FaPhone,
  FaMapMarkerAlt,
  FaGlobe,
  FaBuilding,
  FaIdBadge,
  FaKey,
  FaSignOutAlt,
  FaArrowLeft,
} from "react-icons/fa";
import axiosInstance from "../../components/AxiosInstance";
import { clearAuthSession, getUserName, getUserRole, getCurrentActiveRole } from "../../utils/authSession";
import TopBar from "../../components/TopBar";
import Sidebar from "../../components/Sidebar";

const ROLE_DASHBOARD = {
  admin: "/adminDashboard",
  agent: "/agentDashboard",
  staff: "/staffDashboard",
  extranet: "/extranetDashboard",
  super_admin: "/superAdminDashboard",
  supplier: "/supplierDashboard",
  dmc: "/dmcDashboard",
};

const ROLE_LABEL = {
  admin: "Administrator",
  agent: "Agent",
  staff: "Staff",
  extranet: "Extranet Partner",
  super_admin: "Super Administrator",
  supplier: "Supplier",
  dmc: "DMC",
};

const hasProfileContent = (p) => {
  if (!p || typeof p !== "object") return false;
  return Boolean(
    p.name ||
      p.authorizedPerson ||
      p.address ||
      p.website ||
      p.mainOffice ||
      p.mailId ||
      p.telephone ||
      p.faxNumber ||
      p.mobile ||
      p.postOffice ||
      p.markup
  );
};

const initialsOf = (str) => {
  if (!str) return "?";
  const cleaned = String(str).trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  const first = parts[0]?.[0] || "";
  const second = parts[1]?.[0] || "";
  return (first + second).toUpperCase() || cleaned.slice(0, 2).toUpperCase();
};

const Profile = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Mirrors handleLogout in components/TopBar.jsx so the sign-out path
  // stays identical to the TopBar's Logout item.
  const performLogout = async () => {
    try {
      await axiosInstance.post("/auth/logout", {}, { withCredentials: true });
    } catch {
      // Best-effort: still finish the client-side logout if the call fails.
    }
    clearAuthSession();
    // Full navigation so any in-memory app state is dropped, matching the
    // TopBar Logout behaviour exactly.
    window.location.href = "/login";
  };

  const userName = useMemo(() => getUserName(), []);

  const roles = useMemo(
    () =>
      getUserRole()
        .split(",")
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean),
    []
  );

  const currentRole = useMemo(
    () => getCurrentActiveRole().trim().toLowerCase() || roles[0] || "",
    [roles]
  );

  const roleLabel = ROLE_LABEL[currentRole] || (currentRole ? currentRole : "User");
  const backPath = ROLE_DASHBOARD[currentRole] || "/";

  useEffect(() => {
    let cancelled = false;
    const fetchViewProfile = async () => {
      if (!userName) {
        setLoading(false);
        return;
      }
      try {
        const response = await axiosInstance.get(
          `/api/personalProfile/${userName}`
        );
        if (!cancelled) {
          setProfile(response?.data || null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Error fetching profile:", err);
          setError("We couldn't load your profile details right now.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchViewProfile();
    return () => {
      cancelled = true;
    };
  }, [userName]);

  const showFullProfile = hasProfileContent(profile);

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />

      <div className="d-flex flex-grow-1">
        <Sidebar />

        <main
          className="flex-grow-1 p-3"
          style={{ minWidth: 0, overflowX: "hidden" }}
        >
          <div className="container-fluid mt-4">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
              <h3 className="fw-bold mb-0">
                <FaUser className="me-2 text-primary" />
                Profile
              </h3>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => navigate(backPath)}
              >
                <FaArrowLeft className="me-2" />
                Back to Dashboard
              </Button>
            </div>

            {loading ? (
              <Card className="shadow-sm border-0 rounded-3">
                <Card.Body className="text-center py-5">
                  <Spinner animation="border" variant="primary" />
                  <div className="mt-3 text-muted">Loading profile…</div>
                </Card.Body>
              </Card>
            ) : (
              <>
                {error && (
                  <Alert variant="warning" className="mb-3">
                    {error}
                  </Alert>
                )}

                {/* Identity header — always shown so admins/staff without a
                    companyProfile record still see meaningful content. */}
                <Card className="shadow-sm border-0 rounded-3 mb-3">
                  <Card.Body className="d-flex align-items-center flex-wrap gap-3">
                    <div
                      className="d-flex align-items-center justify-content-center rounded-circle text-white fw-bold"
                      style={{
                        width: 64,
                        height: 64,
                        background:
                          "linear-gradient(135deg, #EC0B43 0%, #ff8a3d 100%)",
                        fontSize: "1.4rem",
                        flexShrink: 0,
                      }}
                    >
                      {initialsOf(profile?.name || userName)}
              </div>
                    <div className="flex-grow-1">
                      <h4 className="fw-bold mb-1">
                        {profile?.name || userName || "Signed-in User"}
                      </h4>
                      <div className="text-muted small d-flex flex-wrap gap-3 align-items-center">
                        <span>
                          <FaIdBadge className="me-1" />
                          {userName || "—"}
                        </span>
                        <Badge bg="light" text="dark" className="border">
                          <FaUserShield className="me-1" />
                          {roleLabel}
                        </Badge>
                        {roles.length > 1 && (
                          <span className="small text-muted">
                            (Roles: {roles.join(", ")})
                          </span>
                        )}
              </div>
            </div>
                    <div className="d-flex gap-2 flex-wrap">
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => navigate("/change-password")}
                      >
                        <FaKey className="me-2" />
                        Change Password
                      </Button>
                    </div>
                  </Card.Body>
                </Card>

                {showFullProfile ? (
                  /* Existing detailed view — unchanged fields, agents/partners
                     with a companyProfile record continue to see this. */
                  <Card className="shadow-sm border-0 rounded-3">
                    <Card.Body className="p-4">
                      <h5 className="fw-bold mb-4">Company Details</h5>
                      <Row className="g-3">
                        <Col md={6}>
                          <label className="form-label fw-semibold">Name</label>
                          <input
                            type="text"
                            value={profile.name || ""}
                            readOnly
                            className="form-control"
                          />
                        </Col>
                        <Col md={6}>
                          <label className="form-label fw-semibold">
                            Authorized Person
                          </label>
                          <input
                            type="text"
                            value={profile.authorizedPerson || ""}
                            readOnly
                            className="form-control"
                          />
                        </Col>
                        <Col md={6}>
                          <label className="form-label fw-semibold">
                            Address
                          </label>
                          <input
                            type="text"
                            value={profile.address || ""}
                            readOnly
                            className="form-control"
                          />
                        </Col>
                        <Col md={6}>
                          <label className="form-label fw-semibold">
                            Website
                          </label>
                          <input
                            type="text"
                            value={profile.website || ""}
                            readOnly
                            className="form-control"
                          />
                        </Col>
                        <Col md={6}>
                          <label className="form-label fw-semibold">
                            Main Office
                          </label>
                          <input
                            type="text"
                            value={profile.mainOffice || ""}
                            readOnly
                            className="form-control"
                          />
                        </Col>
                        <Col md={6}>
                          <label className="form-label fw-semibold">
                            Mail ID
                          </label>
                          <input
                            type="text"
                            value={profile.mailId || ""}
                            readOnly
                            className="form-control"
                          />
                        </Col>
                        <Col md={6}>
                          <label className="form-label fw-semibold">
                            Telephone
                          </label>
                          <input
                            type="text"
                            value={profile.telephone || ""}
                            readOnly
                            className="form-control"
                          />
                        </Col>
                        <Col md={6}>
                          <label className="form-label fw-semibold">
                            Fax Number
                          </label>
                          <input
                            type="text"
                            value={profile.faxNumber || ""}
                            readOnly
                            className="form-control"
                          />
                        </Col>
                        <Col md={6}>
                          <label className="form-label fw-semibold">
                            Mobile
                          </label>
                          <input
                            type="text"
                            value={profile.mobile || ""}
                            readOnly
                            className="form-control"
                          />
                        </Col>
                        <Col md={6}>
                          <label className="form-label fw-semibold">
                            Post Office
                          </label>
                          <input
                            type="text"
                            value={profile.postOffice || ""}
                            readOnly
                            className="form-control"
                          />
                        </Col>
                        <Col md={6}>
                          <label className="form-label fw-semibold">
                            Markup
                          </label>
                          <input
                            type="text"
                            value={profile.markup || ""}
                            readOnly
                            className="form-control"
                          />
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                ) : (
                  /* Fallback view — admin/staff/super_admin users normally
                     land here because /api/personalProfile returns no
                     companyProfile row for them. Show account summary +
                     quick actions so the page is useful instead of blank. */
                  <>
                    <Row className="g-3 mb-3">
                      <Col md={6}>
                        <Card className="shadow-sm border-0 rounded-3 h-100">
                          <Card.Body>
                            <h6 className="fw-bold mb-3">Account Summary</h6>
                            <KV
                              icon={<FaUser className="text-primary" />}
                              label="Username"
                              value={userName || "—"}
                            />
                            <KV
                              icon={<FaUserShield className="text-warning" />}
                              label="Role"
                              value={roleLabel}
                            />
                            <KV
                              icon={<FaBuilding className="text-secondary" />}
                              label="Access"
                              value={
                                roles.length > 0
                                  ? roles
                                      .map((r) => ROLE_LABEL[r] || r)
                                      .join(", ")
                                  : "—"
                              }
                            />
                          </Card.Body>
                        </Card>
                      </Col>
                      <Col md={6}>
                        <Card className="shadow-sm border-0 rounded-3 h-100">
                          <Card.Body>
                            <h6 className="fw-bold mb-3">Contact</h6>
                            <KV
                              icon={<FaEnvelope className="text-info" />}
                              label="Email"
                              value="—"
                            />
                            <KV
                              icon={<FaPhone className="text-success" />}
                              label="Phone"
                              value="—"
                            />
                            <KV
                              icon={<FaMapMarkerAlt className="text-danger" />}
                              label="Address"
                              value="—"
                            />
                            <KV
                              icon={<FaGlobe className="text-primary" />}
                              label="Website"
                              value="—"
                            />
                            <div className="text-muted small mt-2">
                              Personal contact details are not stored for this
                              account type.
              </div>
                          </Card.Body>
                        </Card>
                      </Col>
                    </Row>

                    <Card className="shadow-sm border-0 rounded-3">
                      <Card.Body>
                        <h6 className="fw-bold mb-3">Quick Actions</h6>
                        <div className="d-flex flex-wrap gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => navigate(backPath)}
                          >
                            <FaArrowLeft className="me-2" />
                            Go to Dashboard
                          </Button>
                          <Button
                            variant="outline-primary"
                            size="sm"
                            onClick={() => navigate("/change-password")}
                          >
                            <FaKey className="me-2" />
                            Change Password
                          </Button>
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={performLogout}
                          >
                            <FaSignOutAlt className="me-2" />
                            Logout
                          </Button>
              </div>
                      </Card.Body>
                    </Card>
                  </>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

function KV({ icon, label, value }) {
  return (
    <div className="d-flex justify-content-between align-items-start mb-2">
      <div className="text-muted small">
        {icon && <span className="me-2">{icon}</span>}
        {label}
      </div>
      <div
        className="text-end fw-semibold"
        style={{ maxWidth: "60%", wordBreak: "break-word" }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

export default Profile;
