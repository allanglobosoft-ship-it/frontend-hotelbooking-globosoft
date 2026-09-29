import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Container, Card, Spinner, Row, Col, Button, Modal, Form } from "react-bootstrap";
import {
  FaUserTie,
  FaArrowLeft,
  FaCheck,
  FaTimes,
  FaUser,
  FaEnvelope,
  FaPhone,
  FaMapMarkerAlt,
  FaGlobe,
  FaUserCircle,
  FaClock,
} from "react-icons/fa";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import axiosInstance from "../components/AxiosInstance";
import toast from "react-hot-toast";
import { formatDateTimeDisplay } from "../utils/dateUtils";

const STATUS_META = {
  PENDING: { label: "Pending", bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  APPROVED: { label: "Approved", bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  REJECTED: { label: "Rejected", bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
  CANCELLED: { label: "Cancelled", bg: "#f2f4f7", color: "#475467", dot: "#98a2b3" },
};

// reviewedDate/reviewedBy carry the approve, reject AND cancel stamp, so the
// label has to follow the status. Anything not listed keeps the original
// "Approved" wording (PENDING shows it with an em-dash value, as before).
const REVIEWED_DATE_LABEL = {
  REJECTED: "Rejected Date & Time",
  CANCELLED: "Cancelled Date & Time",
};

const StatusPill = ({ status }) => {
  const meta = STATUS_META[status];
  if (!meta) return <span className="text-muted">{status || "-"}</span>;
  return (
    <span
      className="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill"
      style={{
        backgroundColor: meta.bg,
        color: meta.color,
        fontSize: "0.8rem",
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: meta.dot }} />
      {meta.label}
    </span>
  );
};

const DetailItem = ({ icon, label, value }) => (
  <Col md={6} className="mb-3">
    <div className="text-muted d-flex align-items-center gap-2" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {icon} {label}
    </div>
    <div className="fw-semibold text-dark mt-1" style={{ fontSize: "0.9rem", wordBreak: "break-word" }}>
      {value || "-"}
    </div>
  </Col>
);

export default function AgentApprovalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [reg, setReg] = useState(null);
  /**
   * The linked Agent record — hydrated in a second call so extended fields
   * added on the /register form (salutation, trade license, timezone, …)
   * show up here for the admin reviewer.
   */
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  // Trade-license preview modal. Opens on the "Open" click below the
  // license section and renders the file inline (iframe for PDFs, img
  // for anything else) instead of forcing a new-tab navigation.
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  // Reject confirmation modal — remarks are mandatory before the rejection
  // is actually submitted.
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectRemarks, setRejectRemarks] = useState("");

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(`/api/agent-external-register/${id}`);
      setReg(res.data || null);
      const agentId = res.data?.agentId;
      if (agentId) {
        try {
          const agentRes = await axiosInstance.get(`/api/agent/${agentId}`);
          setAgent(agentRes.data || null);
        } catch (_) {
          setAgent(null);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load registration details");
      setReg(null);
      setAgent(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleApprove = async () => {
    try {
      setActionLoading("approve");
      await axiosInstance.put(`/api/agent-external-register/${id}/approve`);
      // The backend emails the official approval notice to the agent as part
      // of this call (async, best-effort) — surfaced here so the admin knows.
      toast.success("Agent approved. They can now log in — approval email sent.");
      // Hand off to the full agent record so the admin can immediately
      // manage credit limit / sub-agents / etc. Re-fetch the registration
      // row first to pick up the agentId (approve is what creates the
      // Agent row when the request came from /register, so the value may
      // not have existed on the pre-approve reg loaded into state).
      let agentId = null;
      try {
        const res = await axiosInstance.get(`/api/agent-external-register/${id}`);
        agentId = res.data?.agentId ?? null;
      } catch (_) {
        // Swallow — fall back to in-place refresh below.
      }
      if (agentId) {
        navigate(`/registration/agent/view/${agentId}`);
        return;
      }
      // Fallback: agent id wasn't resolvable (older reg without a linked
      // agent, or the GET failed). Keep the original behaviour so the
      // admin at least sees the status flip on this page.
      fetchDetail();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Approval failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const openRejectModal = () => {
    setRejectRemarks("");
    setShowRejectModal(true);
  };

  const handleRejectConfirm = async () => {
    const trimmed = rejectRemarks.trim();
    if (!trimmed) {
      toast.error("Remarks are required to reject this request.");
      return;
    }
    try {
      setActionLoading("reject");
      await axiosInstance.put(`/api/agent-external-register/${id}/reject`, {
        remarks: trimmed,
      });
      // Remarks entered here are quoted back to the agent as the stated
      // reason in the rejection email the backend sends.
      toast.success("Registration request rejected — rejection email sent.");
      setShowRejectModal(false);
      fetchDetail();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Rejection failed.");
    } finally {
      setActionLoading(null);
    }
  };

  // "Cancel" — closes off a Rejected request without approving the agent. The
  // row is kept and marked Cancelled, so it stays on the approval list under
  // that status instead of disappearing.
  const handleCancelRejected = async () => {
    try {
      setActionLoading("cancel");
      await axiosInstance.put(`/api/agent-external-register/${id}/cancel`);
      toast.success("Registration request cancelled.");
      navigate("/admin/approval/agents");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to cancel request.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-3" style={{ width: "100%", overflow: "hidden" }}>
          <Container fluid style={{ maxWidth: "1000px" }}>
            {/* Header */}
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h3 className="fw-bold text-dark mb-0">Agent Registration Details</h3>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => navigate("/admin/approval/agents")}
                className="d-inline-flex align-items-center gap-2"
              >
                <FaArrowLeft /> Back to List
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-5">
                <Spinner animation="border" variant="primary" />
                <p className="mt-3 text-muted">Loading details...</p>
              </div>
            ) : !reg ? (
              <Card className="border shadow-sm" style={{ borderRadius: "8px" }}>
                <Card.Body className="text-center py-5 text-muted">
                  Registration request not found.
                </Card.Body>
              </Card>
            ) : (
              <Card className="border shadow-sm" style={{ borderRadius: "10px" }}>
                <Card.Header
                  className="d-flex justify-content-between align-items-center py-3"
                  style={{ backgroundColor: "#f8f9fa", borderRadius: "10px 10px 0 0" }}
                >
                  <span className="d-inline-flex align-items-center gap-2 fw-bold text-dark" style={{ fontSize: "1.05rem" }}>
                    <FaUserTie style={{ color: "#c0392b" }} /> {reg.companyName}
                  </span>
                  <StatusPill status={reg.status} />
                </Card.Header>

                <Card.Body style={{ padding: "1.5rem" }}>
                  <h6 className="fw-bold text-dark mb-3" style={{ fontSize: "0.85rem", letterSpacing: "0.4px" }}>
                    Company & Contact Information
                  </h6>
                  <Row>
                    <DetailItem icon={<FaUserTie />} label="Company Name" value={reg.companyName} />
                    <DetailItem
                      icon={<FaUser />}
                      label="Contact Person"
                      value={
                        agent?.salutation && reg.contactPerson
                          ? `${agent.salutation} ${reg.contactPerson}`
                          : reg.contactPerson
                      }
                    />
                    <DetailItem icon={<FaEnvelope />} label="Email" value={reg.email} />
                    <DetailItem icon={<FaPhone />} label="Phone" value={reg.phone} />
                    <DetailItem icon={<FaGlobe />} label="Country" value={reg.country} />
                    <DetailItem icon={<FaMapMarkerAlt />} label="City" value={reg.city} />
                    <DetailItem icon={<FaUserCircle />} label="Username" value={reg.username} />
                    {agent?.timezone && (
                      <DetailItem icon={<FaGlobe />} label="Timezone" value={agent.timezone} />
                    )}
                  </Row>

                  {(agent?.tradeLicenseNo ||
                    agent?.tradeLicenseExpiry ||
                    agent?.tradeLicenseFile) && (
                    <>
                      <hr className="my-3" />
                      <h6
                        className="fw-bold text-dark mb-3"
                        style={{ fontSize: "0.85rem", letterSpacing: "0.4px" }}
                      >
                        Trade License
                      </h6>
                      <Row>
                        <DetailItem
                          icon={<FaUserTie />}
                          label="Trade License No"
                          value={agent.tradeLicenseNo}
                        />
                        <DetailItem
                          icon={<FaClock />}
                          label="Expiry Date"
                          value={agent.tradeLicenseExpiry}
                        />
                      </Row>
                      {agent.tradeLicenseFile && (
                        <div className="mt-2">
                          <Button
                            variant="outline-primary"
                            size="sm"
                            onClick={() => setShowLicenseModal(true)}
                          >
                            Open Trade License File
                          </Button>
                        </div>
                      )}
                    </>
                  )}

                  <hr className="my-3" />

                  <h6 className="fw-bold text-dark mb-3" style={{ fontSize: "0.85rem", letterSpacing: "0.4px" }}>
                    Request Timeline
                  </h6>
                  <Row>
                    <DetailItem
                      icon={<FaClock />}
                      label="Requested Date & Time"
                      value={formatDateTimeDisplay(reg.createdDate)}
                    />
                    <DetailItem
                      icon={<FaClock />}
                      label={
                        REVIEWED_DATE_LABEL[reg.status] || "Approved Date & Time"
                      }
                      value={reg.reviewedDate ? formatDateTimeDisplay(reg.reviewedDate) : "—"}
                    />
                  </Row>

                  {reg.remarks && (
                    <Row>
                      <Col md={12} className="mb-3">
                        <div
                          className="text-muted d-flex align-items-center gap-2"
                          style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}
                        >
                          Rejection Remarks
                        </div>
                        <div
                          className="mt-1"
                          style={{ fontSize: "0.9rem", color: "#b42318", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                        >
                          {reg.remarks}
                        </div>
                      </Col>
                    </Row>
                  )}

                  {reg.status === "PENDING" && (
                    <>
                      <hr className="my-3" />
                      <div className="d-flex justify-content-end gap-3">
                        <Button
                          variant="success"
                          className="d-inline-flex align-items-center gap-2 px-4"
                          disabled={!!actionLoading}
                          onClick={handleApprove}
                        >
                          {actionLoading === "approve" ? (
                            <Spinner animation="border" size="sm" />
                          ) : (
                            <><FaCheck /> Approve</>
                          )}
                        </Button>
                        <Button
                          variant="danger"
                          className="d-inline-flex align-items-center gap-2 px-4"
                          disabled={!!actionLoading}
                          onClick={openRejectModal}
                        >
                          <FaTimes /> Reject
                        </Button>
                      </div>
                    </>
                  )}

                  {reg.status === "REJECTED" && (
                    <>
                      <hr className="my-3" />
                      <div className="d-flex justify-content-end gap-3">
                        <Button
                          variant="success"
                          className="d-inline-flex align-items-center gap-2 px-4"
                          disabled={!!actionLoading}
                          onClick={handleApprove}
                        >
                          {actionLoading === "approve" ? (
                            <Spinner animation="border" size="sm" />
                          ) : (
                            <><FaCheck /> Re-Approve</>
                          )}
                        </Button>
                        <Button
                          variant="outline-secondary"
                          className="d-inline-flex align-items-center gap-2 px-4"
                          disabled={!!actionLoading}
                          onClick={handleCancelRejected}
                        >
                          {actionLoading === "cancel" ? (
                            <Spinner animation="border" size="sm" />
                          ) : (
                            <><FaTimes /> Cancel</>
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </Card.Body>
              </Card>
            )}
          </Container>

          {/* Trade-license preview modal — iframe handles PDFs directly;
              anything else (jpg/png/webp) renders as an <img>. Uses the URL
              stored on the agent row exactly as saved by FileStorageService. */}
          <Modal
            show={showLicenseModal}
            onHide={() => setShowLicenseModal(false)}
            size="xl"
            centered
            backdrop="static"
          >
            <Modal.Header closeButton>
              <Modal.Title style={{ fontSize: "1rem", fontWeight: 700 }}>
                Trade License — {reg?.companyName || "Agent"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body style={{ padding: 0, height: "80vh", background: "#f8f9fa" }}>
              {agent?.tradeLicenseFile ? (
                /\.pdf($|\?)/i.test(agent.tradeLicenseFile) ? (
                  <iframe
                    key={agent.tradeLicenseFile}
                    src={agent.tradeLicenseFile}
                    title="Trade License"
                    style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                  />
                ) : (
                  <div className="d-flex align-items-center justify-content-center h-100 p-3">
                    <img
                      src={agent.tradeLicenseFile}
                      alt="Trade License"
                      style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                    />
                  </div>
                )
              ) : (
                <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                  No file uploaded.
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" size="sm" onClick={() => setShowLicenseModal(false)}>
                Close
              </Button>
            </Modal.Footer>
          </Modal>

          {/* Reject confirmation modal — remarks are mandatory; the
              rejection is only submitted once Confirm is clicked. */}
          <Modal
            show={showRejectModal}
            onHide={() => !actionLoading && setShowRejectModal(false)}
            centered
            backdrop="static"
          >
            <Modal.Header closeButton={!actionLoading}>
              <Modal.Title style={{ fontSize: "1rem", fontWeight: 700 }}>
                Reject Registration Request
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <p className="text-muted mb-3" style={{ fontSize: "0.85rem" }}>
                Please provide a reason for rejecting{" "}
                <strong>{reg?.companyName || "this agent"}</strong>'s registration
                request. The remarks will be visible in the request details and
                are included as the stated reason in the rejection email sent to
                the agent.
              </p>
              <Form.Group>
                <Form.Label className="fw-semibold" style={{ fontSize: "0.85rem" }}>
                  Remarks <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  as="textarea"
                  rows={4}
                  value={rejectRemarks}
                  onChange={(e) => setRejectRemarks(e.target.value)}
                  placeholder="Enter the reason for rejection..."
                  disabled={!!actionLoading}
                />
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => setShowRejectModal(false)}
                disabled={!!actionLoading}
              >
                Close
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="d-inline-flex align-items-center gap-2"
                onClick={handleRejectConfirm}
                disabled={!!actionLoading || !rejectRemarks.trim()}
              >
                {actionLoading === "reject" ? (
                  <Spinner animation="border" size="sm" />
                ) : (
                  "Confirm Rejection"
                )}
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
}
