import React, { useEffect, useState } from "react";
import { Card, Button, Table, Modal, Form, Spinner, Row, Col, Badge } from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";

const emptyBank = {
  bankAccountHolderName: "",
  bankName: "",
  bankAccountNumber: "",
  bankIfscCode: "",
  bankBranchName: "",
};

export default function IncentiveClaims() {
  const role = (sessionStorage.getItem("currentActiveRole") || "").toLowerCase();
  const isAdmin = role === "admin";
  const storedId = sessionStorage.getItem("userId");
  const myAgentId = storedId && /^\d+$/.test(storedId) ? Number(storedId) : null;

  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewClaim, setReviewClaim] = useState(null);
  const [reviewAction, setReviewAction] = useState("approve");
  const [adminRemarks, setAdminRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const reviewer = sessionStorage.getItem("UserName") || "admin";

  // Reclaim modal state (agent side)
  const [reclaimOpen, setReclaimOpen] = useState(false);
  const [reclaimClaim, setReclaimClaim] = useState(null);
  const [reclaimMethod, setReclaimMethod] = useState("CREDIT_LIMIT");
  const [reclaimBank, setReclaimBank] = useState(emptyBank);
  const [reclaimRemarks, setReclaimRemarks] = useState("");

  // Detail modal — shows full claim history including bank snapshot, reclaim chain
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailClaim, setDetailClaim] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const url = isAdmin
        ? "/api/incentive/claim/all"
        : myAgentId
        ? `/api/incentive/claim/agent/${myAgentId}`
        : null;
      if (!url) {
        setClaims([]);
        return;
      }
      const res = await axiosInstance.get(url);
      setClaims(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error("Failed to load claims");
      setClaims([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const openReview = (claim, action) => {
    setReviewClaim(claim);
    setReviewAction(action);
    setAdminRemarks(claim.adminRemarks || "");
    setReviewOpen(true);
  };

  const closeReview = () => {
    setReviewOpen(false);
    setReviewClaim(null);
    setAdminRemarks("");
  };

  const submitReview = async () => {
    if (!reviewClaim) return;
    setSubmitting(true);
    try {
      const body = { adminRemarks: adminRemarks || null, reviewedBy: reviewer };
      await axiosInstance.post(
        `/api/incentive/claim/${reviewClaim.id}/${reviewAction}`,
        body
      );
      toast.success(`Claim ${reviewAction}d`);
      closeReview();
      await fetchAll();
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to update claim";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const openReclaim = (claim) => {
    setReclaimClaim(claim);
    setReclaimMethod(claim.claimMethod || "CREDIT_LIMIT");
    setReclaimBank({
      bankAccountHolderName: claim.bankAccountHolderName || "",
      bankName: claim.bankName || "",
      bankAccountNumber: claim.bankAccountNumber || "",
      bankIfscCode: claim.bankIfscCode || "",
      bankBranchName: claim.bankBranchName || "",
    });
    setReclaimRemarks("");
    setReclaimOpen(true);
  };

  const closeReclaim = () => {
    setReclaimOpen(false);
    setReclaimClaim(null);
    setReclaimBank(emptyBank);
    setReclaimRemarks("");
  };

  const submitReclaim = async () => {
    if (!reclaimClaim) return;
    if (!reclaimMethod) {
      toast.error("Please select a claim method");
      return;
    }
    if (reclaimMethod === "BANK_TRANSFER") {
      const missing = Object.keys(reclaimBank).find(
        (k) => !String(reclaimBank[k] || "").trim()
      );
      if (missing) {
        toast.error("All bank details are required for bank transfer");
        return;
      }
    }
    setSubmitting(true);
    try {
      const body = {
        claimMethod: reclaimMethod,
        reclaimRemarks: reclaimRemarks || null,
        ...(reclaimMethod === "BANK_TRANSFER" ? reclaimBank : {}),
      };
      await axiosInstance.post(`/api/incentive/claim/${reclaimClaim.id}/reclaim`, body);
      toast.success("Claim resubmitted");
      closeReclaim();
      await fetchAll();
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to resubmit claim";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = (claim) => {
    setDetailClaim(claim);
    setDetailOpen(true);
  };

  const statusBadge = (s) => {
    if (s === "PENDING") return <span className="badge bg-warning text-dark">Pending</span>;
    if (s === "APPROVED") return <span className="badge bg-info text-dark">Approved</span>;
    if (s === "PAID") return <span className="badge bg-success">Paid</span>;
    if (s === "REJECTED") return <span className="badge bg-danger">Rejected</span>;
    if (s === "RECLAIMED") return <span className="badge bg-secondary">Reclaimed</span>;
    return <span className="badge bg-secondary">{s}</span>;
  };

  const methodLabel = (m) => {
    if (m === "CREDIT_LIMIT") return <Badge bg="primary">Credit Limit</Badge>;
    if (m === "BANK_TRANSFER") return <Badge bg="dark">Bank Transfer</Badge>;
    return <span className="text-muted">-</span>;
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <span className="fw-semibold">
                {isAdmin ? "All Incentive Claims" : "My Incentive Claims"}
              </span>
              <Button variant="outline-secondary" size="sm" onClick={fetchAll}>
                Refresh
              </Button>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive striped hover className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th>#</th>
                    {isAdmin && <th>Agent</th>}
                    <th>Points</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Claim Date</th>
                    <th>Status</th>
                    <th>Reclaims</th>
                    <th>Reviewed By</th>
                    <th style={{ width: 260 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={isAdmin ? 10 : 10} className="text-center text-muted py-4">
                        <Spinner animation="border" size="sm" className="me-2" /> Loading...
                      </td>
                    </tr>
                  )}
                  {!loading && claims.length === 0 && (
                    <tr>
                      <td colSpan={10} className="text-center text-muted py-4">
                        No claims found.
                      </td>
                    </tr>
                  )}
                  {claims.map((c) => (
                    <tr key={c.id}>
                      <td>{c.id}</td>
                      {isAdmin && <td>{c.agentId}</td>}
                      <td className="fw-semibold">{c.pointsClaimed}</td>
                      <td>
                        ₹{c.rewardAmount ?? 0}
                        {c.ratePerPoint != null && (
                          <div className="text-muted small">
                            @ ₹{c.ratePerPoint}/pt
                          </div>
                        )}
                      </td>
                      <td>{methodLabel(c.claimMethod)}</td>
                      <td>{c.claimDate ? new Date(c.claimDate).toLocaleString() : "-"}</td>
                      <td>{statusBadge(c.status)}</td>
                      <td>
                        {c.reclaimCount && c.reclaimCount > 0 ? (
                          <Badge bg="warning" text="dark">{c.reclaimCount}x</Badge>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td>{c.reviewedBy || "-"}</td>
                      <td>
                        <div className="d-flex gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline-secondary"
                            onClick={() => openDetail(c)}
                          >
                            View
                          </Button>
                          {isAdmin && c.status === "PENDING" && (
                            <>
                              <Button
                                size="sm"
                                variant="success"
                                onClick={() => openReview(c, "approve")}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline-danger"
                                onClick={() => openReview(c, "reject")}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {isAdmin && c.status === "APPROVED" && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => openReview(c, "paid")}
                            >
                              Mark Paid
                            </Button>
                          )}
                          {!isAdmin && c.status === "REJECTED" && (
                            <Button
                              size="sm"
                              variant="warning"
                              onClick={() => openReclaim(c)}
                            >
                              Reclaim
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>

          {/* Admin review modal */}
          <Modal show={reviewOpen} onHide={closeReview} centered>
            <Modal.Header closeButton={!submitting}>
              <Modal.Title>
                {reviewAction === "approve" && "Approve Claim"}
                {reviewAction === "reject" && "Reject Claim"}
                {reviewAction === "paid" && "Mark Claim Paid"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {reviewClaim && (
                <>
                  <div className="mb-2">
                    <strong>Claim #{reviewClaim.id}</strong> — Agent {reviewClaim.agentId} — Points{" "}
                    {reviewClaim.pointsClaimed} — Amount ₹{reviewClaim.rewardAmount ?? 0}
                  </div>
                  <div className="mb-2 small">
                    Method: {methodLabel(reviewClaim.claimMethod)}
                  </div>
                  {reviewAction === "approve" &&
                    reviewClaim.claimMethod === "CREDIT_LIMIT" && (
                      <div className="alert alert-info small">
                        Approving will <strong>immediately add ₹{reviewClaim.rewardAmount ?? 0}</strong>{" "}
                        to the agent's credit limit and mark this claim as paid.
                      </div>
                    )}
                  {reviewClaim.claimMethod === "BANK_TRANSFER" && (
                    <div className="alert alert-light small">
                      <div><strong>Holder:</strong> {reviewClaim.bankAccountHolderName || "-"}</div>
                      <div><strong>Bank:</strong> {reviewClaim.bankName || "-"}</div>
                      <div><strong>Account:</strong> {reviewClaim.bankAccountNumber || "-"}</div>
                      <div><strong>IFSC:</strong> {reviewClaim.bankIfscCode || "-"}</div>
                      <div><strong>Branch:</strong> {reviewClaim.bankBranchName || "-"}</div>
                    </div>
                  )}
                  <Form.Group>
                    <Form.Label>Admin Remarks</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      value={adminRemarks}
                      onChange={(e) => setAdminRemarks(e.target.value)}
                      placeholder="Reason / notes (optional)"
                    />
                  </Form.Group>
                </>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={closeReview} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant={
                  reviewAction === "reject"
                    ? "danger"
                    : reviewAction === "paid"
                    ? "primary"
                    : "success"
                }
                onClick={submitReview}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" /> Submitting...
                  </>
                ) : reviewAction === "approve" ? (
                  "Approve"
                ) : reviewAction === "reject" ? (
                  "Reject"
                ) : (
                  "Mark Paid"
                )}
              </Button>
            </Modal.Footer>
          </Modal>

          {/* Agent reclaim modal */}
          <Modal show={reclaimOpen} onHide={closeReclaim} centered size="lg">
            <Modal.Header closeButton={!submitting}>
              <Modal.Title>Reclaim — Resubmit Claim</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {reclaimClaim && (
                <>
                  <div className="alert alert-warning">
                    <div>
                      <strong>Original Claim #{reclaimClaim.id}</strong> was rejected.
                    </div>
                    {reclaimClaim.adminRemarks && (
                      <div className="small mt-1">
                        <strong>Admin notes:</strong> {reclaimClaim.adminRemarks}
                      </div>
                    )}
                    <div className="small mt-1">
                      You can update the claim method or bank details below before
                      resubmitting.
                    </div>
                  </div>

                  <Form.Group className="mb-3">
                    <Form.Label>Claim Method</Form.Label>
                    <div className="d-flex gap-3">
                      <Form.Check
                        type="radio"
                        id="rc-method-credit"
                        name="reclaimMethod"
                        label="Add to Credit Limit"
                        value="CREDIT_LIMIT"
                        checked={reclaimMethod === "CREDIT_LIMIT"}
                        onChange={(e) => setReclaimMethod(e.target.value)}
                      />
                      <Form.Check
                        type="radio"
                        id="rc-method-bank"
                        name="reclaimMethod"
                        label="Transfer to Bank Account"
                        value="BANK_TRANSFER"
                        checked={reclaimMethod === "BANK_TRANSFER"}
                        onChange={(e) => setReclaimMethod(e.target.value)}
                      />
                    </div>
                  </Form.Group>

                  {reclaimMethod === "BANK_TRANSFER" && (
                    <Card className="mb-3">
                      <Card.Header className="py-2">
                        <span className="fw-semibold small">Bank Details</span>
                      </Card.Header>
                      <Card.Body>
                        <Row className="g-2">
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label>Account Holder Name <span className="text-danger">*</span></Form.Label>
                              <Form.Control
                                value={reclaimBank.bankAccountHolderName}
                                onChange={(e) =>
                                  setReclaimBank({
                                    ...reclaimBank,
                                    bankAccountHolderName: e.target.value,
                                  })
                                }
                              />
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label>Bank Name <span className="text-danger">*</span></Form.Label>
                              <Form.Control
                                value={reclaimBank.bankName}
                                onChange={(e) =>
                                  setReclaimBank({ ...reclaimBank, bankName: e.target.value })
                                }
                              />
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label>Account Number <span className="text-danger">*</span></Form.Label>
                              <Form.Control
                                value={reclaimBank.bankAccountNumber}
                                onChange={(e) =>
                                  setReclaimBank({
                                    ...reclaimBank,
                                    bankAccountNumber: e.target.value,
                                  })
                                }
                              />
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label>IFSC Code <span className="text-danger">*</span></Form.Label>
                              <Form.Control
                                value={reclaimBank.bankIfscCode}
                                onChange={(e) =>
                                  setReclaimBank({
                                    ...reclaimBank,
                                    bankIfscCode: e.target.value,
                                  })
                                }
                              />
                            </Form.Group>
                          </Col>
                          <Col md={12}>
                            <Form.Group>
                              <Form.Label>Branch Name <span className="text-danger">*</span></Form.Label>
                              <Form.Control
                                value={reclaimBank.bankBranchName}
                                onChange={(e) =>
                                  setReclaimBank({
                                    ...reclaimBank,
                                    bankBranchName: e.target.value,
                                  })
                                }
                              />
                            </Form.Group>
                          </Col>
                        </Row>
                      </Card.Body>
                    </Card>
                  )}

                  <Form.Group>
                    <Form.Label>Reclaim Remarks</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      value={reclaimRemarks}
                      onChange={(e) => setReclaimRemarks(e.target.value)}
                      placeholder="Explain what changed since the previous rejection"
                    />
                  </Form.Group>
                </>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={closeReclaim} disabled={submitting}>
                Cancel
              </Button>
              <Button variant="warning" onClick={submitReclaim} disabled={submitting}>
                {submitting ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" /> Submitting...
                  </>
                ) : (
                  "Resubmit Claim"
                )}
              </Button>
            </Modal.Footer>
          </Modal>

          {/* Detail view modal */}
          <Modal show={detailOpen} onHide={() => setDetailOpen(false)} centered size="lg">
            <Modal.Header closeButton>
              <Modal.Title>Claim Details</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {detailClaim && (
                <>
                  <Row className="g-2">
                    <Col md={4}><strong>Claim #</strong></Col>
                    <Col md={8}>{detailClaim.id}</Col>
                    <Col md={4}><strong>Agent</strong></Col>
                    <Col md={8}>{detailClaim.agentId}</Col>
                    <Col md={4}><strong>Points</strong></Col>
                    <Col md={8}>{detailClaim.pointsClaimed}</Col>
                    <Col md={4}><strong>Rate / Point</strong></Col>
                    <Col md={8}>₹{detailClaim.ratePerPoint ?? 0}</Col>
                    <Col md={4}><strong>Amount</strong></Col>
                    <Col md={8}>₹{detailClaim.rewardAmount ?? 0}</Col>
                    <Col md={4}><strong>Method</strong></Col>
                    <Col md={8}>{methodLabel(detailClaim.claimMethod)}</Col>
                    <Col md={4}><strong>Status</strong></Col>
                    <Col md={8}>{statusBadge(detailClaim.status)}</Col>
                    <Col md={4}><strong>Claim Date</strong></Col>
                    <Col md={8}>{detailClaim.claimDate ? new Date(detailClaim.claimDate).toLocaleString() : "-"}</Col>
                    <Col md={4}><strong>Reviewed By</strong></Col>
                    <Col md={8}>{detailClaim.reviewedBy || "-"}</Col>
                    <Col md={4}><strong>Reviewed Date</strong></Col>
                    <Col md={8}>{detailClaim.reviewedDate ? new Date(detailClaim.reviewedDate).toLocaleString() : "-"}</Col>
                    {detailClaim.parentClaimId && (
                      <>
                        <Col md={4}><strong>Reclaimed From</strong></Col>
                        <Col md={8}>Claim #{detailClaim.parentClaimId}</Col>
                      </>
                    )}
                    {detailClaim.reclaimCount > 0 && (
                      <>
                        <Col md={4}><strong>Reclaim Count</strong></Col>
                        <Col md={8}>{detailClaim.reclaimCount}</Col>
                        <Col md={4}><strong>Last Reclaim Date</strong></Col>
                        <Col md={8}>{detailClaim.lastReclaimDate ? new Date(detailClaim.lastReclaimDate).toLocaleString() : "-"}</Col>
                      </>
                    )}
                    <Col md={4}><strong>Agent Remarks</strong></Col>
                    <Col md={8} className="text-muted small">{detailClaim.agentRemarks || "-"}</Col>
                    <Col md={4}><strong>Admin Remarks</strong></Col>
                    <Col md={8} className="text-muted small">{detailClaim.adminRemarks || "-"}</Col>
                    {detailClaim.reclaimRemarks && (
                      <>
                        <Col md={4}><strong>Reclaim Remarks</strong></Col>
                        <Col md={8} className="text-muted small">{detailClaim.reclaimRemarks}</Col>
                      </>
                    )}
                  </Row>
                  {detailClaim.claimMethod === "BANK_TRANSFER" && (
                    <>
                      <hr />
                      <h6 className="mb-2">Bank Details (snapshot)</h6>
                      <Row className="g-2">
                        <Col md={4}><strong>Holder</strong></Col>
                        <Col md={8}>{detailClaim.bankAccountHolderName || "-"}</Col>
                        <Col md={4}><strong>Bank</strong></Col>
                        <Col md={8}>{detailClaim.bankName || "-"}</Col>
                        <Col md={4}><strong>Account</strong></Col>
                        <Col md={8}>{detailClaim.bankAccountNumber || "-"}</Col>
                        <Col md={4}><strong>IFSC</strong></Col>
                        <Col md={8}>{detailClaim.bankIfscCode || "-"}</Col>
                        <Col md={4}><strong>Branch</strong></Col>
                        <Col md={8}>{detailClaim.bankBranchName || "-"}</Col>
                      </Row>
                    </>
                  )}
                </>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setDetailOpen(false)}>
                Close
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
}
