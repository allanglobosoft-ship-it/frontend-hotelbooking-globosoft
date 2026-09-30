import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Container, Card, Spinner, Row, Col, Button, Modal, Form } from "react-bootstrap";
import {
  FaHandshake,
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
  FaLink,
  FaIdCard,
  FaSave,
  FaPowerOff,
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
      style={{ backgroundColor: meta.bg, color: meta.color, fontSize: "0.8rem", fontWeight: 600, lineHeight: 1 }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: meta.dot }} />
      {meta.label}
    </span>
  );
};

const DetailItem = ({ icon, label, value }) => (
  <Col md={6} className="mb-3">
    <div
      className="text-muted d-flex align-items-center gap-2"
      style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}
    >
      {icon} {label}
    </div>
    <div className="fw-semibold text-dark mt-1" style={{ fontSize: "0.9rem", wordBreak: "break-word" }}>
      {value || "-"}
    </div>
  </Col>
);

const SectionTitle = ({ children, hint }) => (
  <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
    <h6 className="fw-bold text-dark mb-0" style={{ fontSize: "0.85rem", letterSpacing: "0.4px" }}>
      {children}
    </h6>
    {hint && <span className="text-muted" style={{ fontSize: "0.75rem" }}>{hint}</span>}
  </div>
);

/**
 * PartnerApprovalDetail — one Supplier / DMC registration request.
 *
 * The important part is the two feature lists side by side:
 *   • REQUESTED — what the partner ticked when registering. Read-only, it is
 *     their request and is never modified.
 *   • APPROVED  — the admin's decision. Editable checkboxes pre-filled from
 *     the request; Approve sends exactly this set, so the admin can drop a
 *     requested module or add one that was not requested. After approval the
 *     same list edits the account's LIVE approved features (takes effect on
 *     the partner's next request) while the registration keeps the snapshot
 *     of what was approved at the time.
 */
export default function PartnerApprovalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [reg, setReg] = useState(null);
  const [account, setAccount] = useState(null);
  const [features, setFeatures] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectRemarks, setRejectRemarks] = useState("");

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const [regRes, featRes] = await Promise.all([
        axiosInstance.get(`/api/partner-external-register/${id}`),
        axiosInstance.get("/api/partner-features"),
      ]);
      const r = regRes.data || null;
      setReg(r);
      setFeatures(Array.isArray(featRes.data) ? featRes.data : []);

      let acc = null;
      if (r?.partnerAccountId) {
        try {
          const accRes = await axiosInstance.get(`/api/partner-accounts/${r.partnerAccountId}`);
          acc = accRes.data || null;
        } catch (_) {
          acc = null;
        }
      }
      setAccount(acc);

      // Approved list starts from the live account set once approved, else
      // from the partner's own request.
      const seed = acc?.approvedFeatureCodes?.length
        ? acc.approvedFeatureCodes
        : r?.requestedFeatureCodes || [];
      setSelected(new Set(seed));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load registration details");
      setReg(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const requested = useMemo(() => new Set(reg?.requestedFeatureCodes || []), [reg]);
  const liveApproved = useMemo(
    () => new Set(account?.approvedFeatureCodes || []),
    [account],
  );
  const isApproved = reg?.status === "APPROVED";
  const canDecide = reg?.status === "PENDING" || reg?.status === "REJECTED";

  const selectedCodes = features.map((f) => f.code).filter((c) => selected.has(c));
  const liveDirty =
    isApproved &&
    (selectedCodes.length !== liveApproved.size || selectedCodes.some((c) => !liveApproved.has(c)));

  const toggle = (code) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const handleApprove = async () => {
    if (selectedCodes.length === 0) {
      toast.error("Select at least one feature to approve.");
      return;
    }
    try {
      setActionLoading("approve");
      await axiosInstance.put(`/api/partner-external-register/${id}/approve`, {
        approvedFeatureCodes: selectedCodes,
      });
      toast.success(
        `${reg?.partnerType === "DMC" ? "DMC" : "Supplier"} approved with ${selectedCodes.length} feature${selectedCodes.length === 1 ? "" : "s"} — approval email sent.`,
      );
      fetchDetail();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Approval failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveLiveFeatures = async () => {
    if (!account?.id) return;
    if (selectedCodes.length === 0) {
      toast.error("Keep at least one feature enabled.");
      return;
    }
    try {
      setActionLoading("features");
      await axiosInstance.put(`/api/partner-accounts/${account.id}/features`, {
        approvedFeatureCodes: selectedCodes,
      });
      toast.success("Approved features updated — applies to the partner's next request.");
      fetchDetail();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update features.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleActive = async () => {
    if (!account?.id) return;
    const activate = account.status !== "ACTIVE";
    try {
      setActionLoading("status");
      await axiosInstance.put(`/api/partner-accounts/${account.id}/status`, { active: activate });
      toast.success(activate ? "Account activated." : "Account deactivated — the partner can no longer log in.");
      fetchDetail();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to change account status.");
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
      await axiosInstance.put(`/api/partner-external-register/${id}/reject`, { remarks: trimmed });
      toast.success("Registration request rejected — rejection email sent.");
      setShowRejectModal(false);
      fetchDetail();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Rejection failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelRejected = async () => {
    try {
      setActionLoading("cancel");
      await axiosInstance.put(`/api/partner-external-register/${id}/cancel`);
      toast.success("Registration request cancelled.");
      navigate("/admin/approval/partners");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to cancel request.");
    } finally {
      setActionLoading(null);
    }
  };

  const typeLabel = reg?.partnerType === "DMC" ? "DMC" : "Supplier";

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-3" style={{ width: "100%", overflow: "hidden" }}>
          <Container fluid style={{ maxWidth: "1100px" }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h3 className="fw-bold text-dark mb-0">Supplier / DMC Registration Details</h3>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => navigate("/admin/approval/partners")}
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
                <Card.Body className="text-center py-5 text-muted">Registration request not found.</Card.Body>
              </Card>
            ) : (
              <Card className="border shadow-sm" style={{ borderRadius: "10px" }}>
                <Card.Header
                  className="d-flex justify-content-between align-items-center py-3"
                  style={{ backgroundColor: "#f8f9fa", borderRadius: "10px 10px 0 0" }}
                >
                  <span className="d-inline-flex align-items-center gap-2 fw-bold text-dark" style={{ fontSize: "1.05rem" }}>
                    <FaHandshake style={{ color: "#c0392b" }} /> {reg.companyName}
                    <span
                      className="ms-2 px-2 py-1 rounded"
                      style={{
                        backgroundColor: reg.partnerType === "DMC" ? "#ede9fe" : "#e0f2fe",
                        color: reg.partnerType === "DMC" ? "#5b21b6" : "#075985",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                      }}
                    >
                      {typeLabel.toUpperCase()}
                    </span>
                  </span>
                  <StatusPill status={reg.status} />
                </Card.Header>

                <Card.Body style={{ padding: "1.5rem" }}>
                  <SectionTitle>Company & Contact Information</SectionTitle>
                  <Row>
                    <DetailItem icon={<FaHandshake />} label="Company Name" value={reg.companyName} />
                    <DetailItem icon={<FaUser />} label="Contact Person" value={reg.contactPerson} />
                    <DetailItem icon={<FaEnvelope />} label="Email" value={reg.email} />
                    <DetailItem icon={<FaPhone />} label="Phone" value={reg.phone} />
                    <DetailItem icon={<FaGlobe />} label="Country" value={reg.country} />
                    <DetailItem icon={<FaMapMarkerAlt />} label="City" value={reg.city} />
                    <DetailItem icon={<FaMapMarkerAlt />} label="Location" value={reg.location} />
                    <DetailItem icon={<FaMapMarkerAlt />} label="Address" value={reg.address} />
                    <DetailItem icon={<FaLink />} label="Website" value={reg.website} />
                    <DetailItem icon={<FaIdCard />} label="Trade Licence / Registration No." value={reg.registrationNumber} />
                    <DetailItem icon={<FaUserCircle />} label="Username" value={reg.username} />
                  </Row>

                  <hr className="my-3" />

                  {/* ── Requested vs Approved ── */}
                  <Row className="g-4">
                    <Col lg={5}>
                      <SectionTitle hint="As submitted by the partner">
                        Requested Features ({requested.size})
                      </SectionTitle>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {features.map((f) => {
                          const on = requested.has(f.code);
                          return (
                            <div
                              key={`req-${f.code}`}
                              className="d-flex align-items-center gap-2"
                              style={{
                                padding: "7px 10px",
                                borderRadius: 8,
                                background: on ? "#f0f9ff" : "#fafafa",
                                color: on ? "#075985" : "#98a2b3",
                                fontSize: "0.85rem",
                                fontWeight: on ? 600 : 400,
                                border: `1px solid ${on ? "#bae6fd" : "#f2f4f7"}`,
                              }}
                            >
                              <span style={{ width: 16, textAlign: "center" }}>{on ? "☑" : "☐"}</span>
                              <span>{f.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </Col>

                    <Col lg={7}>
                      <SectionTitle
                        hint={
                          isApproved
                            ? "Live set — changes apply immediately after Save"
                            : canDecide
                              ? "Tick / untick before approving — this becomes the approved set"
                              : "Decision snapshot"
                        }
                      >
                        {isApproved ? "Approved Features (live)" : "Approved Features"} ({selectedCodes.length})
                      </SectionTitle>
                      <Row className="g-2">
                        {features.map((f) => {
                          const checked = selected.has(f.code);
                          const wasRequested = requested.has(f.code);
                          const editable = canDecide || isApproved;
                          return (
                            <Col md={6} key={`app-${f.code}`}>
                              <label
                                htmlFor={`approve-${f.code}`}
                                title={f.description || ""}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                  gap: "6px 10px",
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  border: `1.5px solid ${checked ? "#22c55e" : "#e5e7eb"}`,
                                  background: checked ? "#f0fdf4" : "#fff",
                                  cursor: editable ? "pointer" : "default",
                                  opacity: editable ? 1 : 0.75,
                                  fontSize: "0.85rem",
                                }}
                              >
                                <input
                                  id={`approve-${f.code}`}
                                  type="checkbox"
                                  checked={checked}
                                  disabled={!editable || !!actionLoading}
                                  onChange={() => toggle(f.code)}
                                  style={{ accentColor: "#16a34a", width: 16, height: 16, flexShrink: 0 }}
                                />
                                <span style={{ fontWeight: checked ? 600 : 500, color: "#15171C", flex: "1 1 auto", minWidth: 0 }}>
                                  {f.label}
                                </span>
                                {checked && !wasRequested && (
                                  <span className="badge rounded-pill" style={{ background: "#fde68a", color: "#78350f", fontSize: "0.62rem", flexShrink: 0, whiteSpace: "nowrap" }}>
                                    added by admin
                                  </span>
                                )}
                                {!checked && wasRequested && (
                                  <span className="badge rounded-pill" style={{ background: "#fecaca", color: "#7f1d1d", fontSize: "0.62rem", flexShrink: 0, whiteSpace: "nowrap" }}>
                                    not approved
                                  </span>
                                )}
                              </label>
                            </Col>
                          );
                        })}
                      </Row>

                      {isApproved && (
                        <div className="d-flex justify-content-end gap-2 mt-3">
                          <Button
                            size="sm"
                            variant="success"
                            className="d-inline-flex align-items-center gap-2"
                            disabled={!liveDirty || !!actionLoading}
                            onClick={handleSaveLiveFeatures}
                          >
                            {actionLoading === "features" ? <Spinner animation="border" size="sm" /> : <><FaSave /> Save Approved Features</>}
                          </Button>
                        </div>
                      )}
                    </Col>
                  </Row>

                  <hr className="my-3" />

                  <SectionTitle>Request Timeline</SectionTitle>
                  <Row>
                    <DetailItem icon={<FaClock />} label="Requested Date & Time" value={formatDateTimeDisplay(reg.createdDate)} />
                    <DetailItem
                      icon={<FaClock />}
                      label={REVIEWED_DATE_LABEL[reg.status] || "Approved Date & Time"}
                      value={reg.reviewedDate ? formatDateTimeDisplay(reg.reviewedDate) : "—"}
                    />
                    {reg.reviewedBy && <DetailItem icon={<FaUserCircle />} label="Reviewed By" value={reg.reviewedBy} />}
                    {isApproved && (
                      <DetailItem
                        icon={<FaCheck />}
                        label="Approved at approval time"
                        value={
                          features
                            .filter((f) => (reg.approvedFeatureCodes || []).includes(f.code))
                            .map((f) => f.label)
                            .join(", ") || "—"
                        }
                      />
                    )}
                    {account && (
                      <DetailItem
                        icon={<FaPowerOff />}
                        label="Account Status"
                        value={account.status === "ACTIVE" ? "Active" : "Inactive"}
                      />
                    )}
                  </Row>

                  {reg.remarks && (
                    <Row>
                      <Col md={12} className="mb-3">
                        <div className="text-muted" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          Rejection Remarks
                        </div>
                        <div className="mt-1" style={{ fontSize: "0.9rem", color: "#b42318", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {reg.remarks}
                        </div>
                      </Col>
                    </Row>
                  )}

                  {reg.status === "PENDING" && (
                    <>
                      <hr className="my-3" />
                      <div className="d-flex justify-content-end gap-3">
                        <Button variant="success" className="d-inline-flex align-items-center gap-2 px-4" disabled={!!actionLoading} onClick={handleApprove}>
                          {actionLoading === "approve" ? <Spinner animation="border" size="sm" /> : <><FaCheck /> Approve with {selectedCodes.length} feature{selectedCodes.length === 1 ? "" : "s"}</>}
                        </Button>
                        <Button variant="danger" className="d-inline-flex align-items-center gap-2 px-4" disabled={!!actionLoading} onClick={openRejectModal}>
                          <FaTimes /> Reject
                        </Button>
                      </div>
                    </>
                  )}

                  {reg.status === "REJECTED" && (
                    <>
                      <hr className="my-3" />
                      <div className="d-flex justify-content-end gap-3">
                        <Button variant="success" className="d-inline-flex align-items-center gap-2 px-4" disabled={!!actionLoading} onClick={handleApprove}>
                          {actionLoading === "approve" ? <Spinner animation="border" size="sm" /> : <><FaCheck /> Re-Approve</>}
                        </Button>
                        <Button variant="outline-secondary" className="d-inline-flex align-items-center gap-2 px-4" disabled={!!actionLoading} onClick={handleCancelRejected}>
                          {actionLoading === "cancel" ? <Spinner animation="border" size="sm" /> : <><FaTimes /> Cancel</>}
                        </Button>
                      </div>
                    </>
                  )}

                  {isApproved && account && (
                    <>
                      <hr className="my-3" />
                      <div className="d-flex justify-content-end gap-3">
                        <Button
                          variant={account.status === "ACTIVE" ? "outline-danger" : "outline-success"}
                          className="d-inline-flex align-items-center gap-2 px-4"
                          disabled={!!actionLoading}
                          onClick={handleToggleActive}
                        >
                          {actionLoading === "status" ? <Spinner animation="border" size="sm" /> : <><FaPowerOff /> {account.status === "ACTIVE" ? "Deactivate Account" : "Activate Account"}</>}
                        </Button>
                      </div>
                    </>
                  )}
                </Card.Body>
              </Card>
            )}
          </Container>

          {/* Reject confirmation modal — remarks are mandatory. */}
          <Modal show={showRejectModal} onHide={() => !actionLoading && setShowRejectModal(false)} centered backdrop="static">
            <Modal.Header closeButton={!actionLoading}>
              <Modal.Title style={{ fontSize: "1rem", fontWeight: 700 }}>Reject Registration Request</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <p className="text-muted mb-3" style={{ fontSize: "0.85rem" }}>
                Please provide a reason for rejecting <strong>{reg?.companyName || "this request"}</strong>. The
                remarks stay on the request and are quoted as the reason in the rejection email.
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
              <Button variant="outline-secondary" size="sm" onClick={() => setShowRejectModal(false)} disabled={!!actionLoading}>
                Close
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="d-inline-flex align-items-center gap-2"
                onClick={handleRejectConfirm}
                disabled={!!actionLoading || !rejectRemarks.trim()}
              >
                {actionLoading === "reject" ? <Spinner animation="border" size="sm" /> : "Confirm Rejection"}
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
}
