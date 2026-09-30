import React, { useEffect, useMemo, useState } from "react";
import { Card, Button, Table, ProgressBar, Spinner, Form, Modal, Row, Col, Pagination } from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import RegionalClock from "../../components/RegionalClock";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";

const SERVICE_LABEL = {
  HOTEL: "Hotel",
  CAB: "Cab / Transfer",
  ACTIVITY: "Activity",
  PACKAGE: "Package",
  RESTAURANT: "Restaurant",
};

const emptyBank = {
  bankAccountHolderName: "",
  bankName: "",
  bankAccountNumber: "",
  bankIfscCode: "",
  bankBranchName: "",
};

export default function AgentIncentiveDashboard() {
  const role = (localStorage.getItem("currentActiveRole") || "").toLowerCase();
  const storedId = localStorage.getItem("userId");
  const defaultAgentId = storedId && /^\d+$/.test(storedId) ? storedId : "";

  const [agentId, setAgentId] = useState(defaultAgentId);
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [agentProfile, setAgentProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimRemarks, setClaimRemarks] = useState("");
  const [claimMethod, setClaimMethod] = useState("CREDIT_LIMIT");
  const [bank, setBank] = useState(emptyBank);
  const [submitting, setSubmitting] = useState(false);
  const [syncingSelf, setSyncingSelf] = useState(false);
  // Admin-only agent picker. Same /api/agent endpoint the
  // /new-booking/hotel search uses — see HotelSearch#agentList — so the
  // response shape is identical: each row has `id` + `companyName`.
  const [agents, setAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [entriesPage, setEntriesPage] = useState(1);

  const fetchAll = async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const [s, h] = await Promise.all([
        axiosInstance.get(`/api/incentive/agent/${id}/summary`),
        axiosInstance.get(`/api/incentive/agent/${id}`),
      ]);
      setSummary(s.data);
      setRows(Array.isArray(h.data) ? h.data : []);
    } catch (err) {
      toast.error("Failed to load incentive details");
      setSummary(null);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // Load the agent profile so we can pre-fill the claim modal with
  // their preferred method + saved bank details.
  const fetchAgentProfile = async (id) => {
    if (!id) return;
    try {
      const res = await axiosInstance.get(`/api/agent/${id}`);
      if (res.data) {
        setAgentProfile(res.data);
        if (res.data.preferredClaimMethod) {
          setClaimMethod(res.data.preferredClaimMethod);
        }
        setBank({
          bankAccountHolderName: res.data.bankAccountHolderName || "",
          bankName: res.data.bankName || "",
          bankAccountNumber: res.data.bankAccountNumber || "",
          bankIfscCode: res.data.bankIfscCode || "",
          bankBranchName: res.data.bankBranchName || "",
        });
      }
    } catch (err) {
      // non-fatal
    }
  };

  // Admin-only: load the agent list once so the dropdown can render
  // company names. Same endpoint + shape as /new-booking/hotel uses.
  useEffect(() => {
    if (role !== "admin") return;
    let cancelled = false;
    setAgentsLoading(true);
    axiosInstance
      .get("/api/agent")
      .then((res) => {
        if (cancelled) return;
        setAgents(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setAgents([]);
      })
      .finally(() => {
        if (!cancelled) setAgentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  useEffect(() => {
    const resolveAndLoad = async () => {
      if (defaultAgentId) {
        fetchAll(defaultAgentId);
        fetchAgentProfile(defaultAgentId);
        return;
      }
      if (role === "admin") return;

      const userName =
        localStorage.getItem("UserName") || sessionStorage.getItem("UserName");
      if (!userName) return;

      setResolvingId(true);
      try {
        const res = await axiosInstance.get(`/api/personalProfile/${userName}`);
        if (res.data && res.data.id) {
          const id = String(res.data.id);
          localStorage.setItem("userId", id);
          setAgentId(id);
          fetchAll(id);
          fetchAgentProfile(id);
        }
      } catch (err) {
        // silent
      } finally {
        setResolvingId(false);
      }
    };
    resolveAndLoad();
  }, []);

  const refreshFromBookings = async () => {
    if (!agentId) return;
    setSyncingSelf(true);
    try {
      try {
        await axiosInstance.post("/api/incentive/sync");
      } catch (e) {
        // sync may be admin-only
      }
      await fetchAll(agentId);
      toast.success("Refreshed");
    } finally {
      setSyncingSelf(false);
    }
  };

  const progressPct = useMemo(() => {
    if (!summary || !summary.targetPoints) return 0;
    const p = (Number(summary.totalPointsEarned || 0) / Number(summary.targetPoints)) * 100;
    return Math.min(100, Math.max(0, Math.round(p)));
  }, [summary]);

  // With amount-based accrual the reward is a fixed amount configured by
  // admin; the backend puts it in summary.rewardAmount (0 until eligible).
  const calculatedAmount = useMemo(() => {
    if (!summary) return 0;
    return Number(summary.rewardAmount || 0);
  }, [summary]);

  const ENTRIES_PER_PAGE = 10;
  const entriesTotalPages = Math.max(1, Math.ceil(rows.length / ENTRIES_PER_PAGE));
  const entriesCurrentPage = Math.min(entriesPage, entriesTotalPages);
  const entriesStart = (entriesCurrentPage - 1) * ENTRIES_PER_PAGE;
  const displayedRows = rows.slice(entriesStart, entriesStart + ENTRIES_PER_PAGE);
  const entriesDisplayStart = rows.length > 0 ? entriesStart + 1 : 0;
  const entriesDisplayEnd = Math.min(entriesStart + displayedRows.length, rows.length);

  const openClaimModal = () => {
    if (agentProfile?.preferredClaimMethod) {
      setClaimMethod(agentProfile.preferredClaimMethod);
    }
    setClaimOpen(true);
  };

  const submitClaim = async () => {
    if (!summary || !summary.agentId) return;
    if (!summary.eligibleToClaim) {
      toast.error("Not eligible yet — target not reached");
      return;
    }
    if (!claimMethod) {
      toast.error("Please select a claim method");
      return;
    }
    if (claimMethod === "BANK_TRANSFER") {
      const missing = Object.keys(bank).find((k) => !String(bank[k] || "").trim());
      if (missing) {
        toast.error("All bank details are required for bank transfer");
        return;
      }
    }
    setSubmitting(true);
    try {
      await axiosInstance.post("/api/incentive/claim", {
        agentId: summary.agentId,
        agentRemarks: claimRemarks || null,
        claimMethod,
        bankAccountHolderName:
          claimMethod === "BANK_TRANSFER" ? bank.bankAccountHolderName : null,
        bankName: claimMethod === "BANK_TRANSFER" ? bank.bankName : null,
        bankAccountNumber:
          claimMethod === "BANK_TRANSFER" ? bank.bankAccountNumber : null,
        bankIfscCode: claimMethod === "BANK_TRANSFER" ? bank.bankIfscCode : null,
        bankBranchName: claimMethod === "BANK_TRANSFER" ? bank.bankBranchName : null,
      });
      toast.success("Claim submitted for review");
      setClaimOpen(false);
      setClaimRemarks("");
      await fetchAll(summary.agentId);
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to submit claim";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <div className="d-flex justify-content-end mb-3">
            <RegionalClock />
          </div>
          <Card className="shadow-sm rounded-xl mb-3">
            <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <span className="fw-semibold">My Incentives</span>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                {role === "admin" && (
                  <Form className="d-flex align-items-center gap-2">
                    <Form.Label className="mb-0">Agent</Form.Label>
                    {/*
                      Dropdown sourced from /api/agent (same endpoint the
                      hotel booking search uses). On selection we auto-load
                      the agent's incentive summary + profile so the admin
                      doesn't need a separate "Load" click.
                    */}
                    <Form.Select
                      style={{ width: 260 }}
                      value={agentId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setAgentId(id);
                        if (id) {
                          fetchAll(id);
                          fetchAgentProfile(id);
                        } else {
                          setSummary(null);
                          setRows([]);
                          setAgentProfile(null);
                        }
                      }}
                      disabled={agentsLoading}
                    >
                      <option value="">
                        {agentsLoading ? "Loading agents..." : "Select Agent"}
                      </option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.companyName || `Agent #${a.id}`}
                        </option>
                      ))}
                    </Form.Select>
                  </Form>
                )}
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={refreshFromBookings}
                  disabled={!agentId || syncingSelf}
                  title="Re-scan recent bookings and reload"
                >
                  {syncingSelf ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" /> Refreshing...
                    </>
                  ) : (
                    "Refresh & Sync"
                  )}
                </Button>
              </div>
            </Card.Header>
            <Card.Body>
              {(loading || resolvingId) && (
                <div className="text-center text-muted py-4">
                  <Spinner animation="border" size="sm" className="me-2" />
                  {resolvingId ? "Resolving agent profile..." : "Loading..."}
                </div>
              )}
              {!loading && !resolvingId && !agentId && (
                <div className="alert alert-warning mb-0">
                  Could not determine your agent ID automatically. Please log out and back in,
                  or contact an administrator if the problem persists.
                </div>
              )}
              {!loading && !resolvingId && agentId && !summary && (
                <div className="text-muted">No incentive summary available.</div>
              )}
              {!loading && summary && (
                <>
                  <div className="row g-3 mb-3">
                    <div className="col-6 col-md">
                      <Card className="h-100 border-0 shadow-sm">
                        <Card.Body>
                          <div className="text-muted small">Target Points</div>
                          <div className="display-6 fw-semibold">
                            {summary.targetPoints || 0}
                          </div>
                          {Number(summary.targetPoints) > 0 && (
                            <div className="text-muted mt-1" style={{ fontSize: "0.7rem" }}>
                              Every {summary.targetPoints} points is AED{" "}
                              {Number(summary.claimAmount ?? 0)}
                            </div>
                          )}
                        </Card.Body>
                      </Card>
                    </div>
                    <div className="col-6 col-md">
                      <Card className="h-100 border-0 shadow-sm">
                        <Card.Body>
                          <div className="text-muted small">Current Points</div>
                          <div className="display-6 fw-semibold">
                            {summary.totalPointsEarned || 0}
                          </div>
                        </Card.Body>
                      </Card>
                    </div>
                    <div className="col-6 col-md">
                      <Card className="h-100 border-0 shadow-sm">
                        <Card.Body>
                          <div className="text-muted small">Claimed Points</div>
                          <div className="display-6 fw-semibold">
                            {summary.totalPointsClaimed || 0}
                          </div>
                        </Card.Body>
                      </Card>
                    </div>
                    <div className="col-6 col-md">
                      <Card className="h-100 border-0 shadow-sm">
                        <Card.Body>
                          <div className="text-muted small">Lifetime Points</div>
                          <div className="display-6 fw-semibold">
                            {summary.totalLifetimePoints || 0}
                          </div>
                        </Card.Body>
                      </Card>
                    </div>
                    <div className="col-6 col-md">
                      <Card className="h-100 border-0 shadow-sm bg-success-subtle">
                        <Card.Body>
                          <div className="text-muted small">Claimable Amount</div>
                          <div className="display-6 fw-semibold text-success">
                            AED {summary.rewardAmount ?? 0}
                          </div>
                        </Card.Body>
                      </Card>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="d-flex justify-content-between small mb-1">
                      <span className="text-muted">
                        Progress to next reward ({summary.totalPointsEarned || 0} / {summary.targetPoints || 0})
                      </span>
                      <span className="fw-semibold">{progressPct}%</span>
                    </div>
                    <ProgressBar now={progressPct} variant={summary.eligibleToClaim ? "success" : "info"} />
                  </div>

                  <div className="d-flex justify-content-end mb-3">
                    <Button
                      className="btn-green"
                      disabled={!summary.eligibleToClaim}
                      onClick={openClaimModal}
                    >
                      {summary.eligibleToClaim ? "Claim Reward" : "Claim — target not reached"}
                    </Button>
                  </div>

                  <h6 className="mb-2">Breakdown by Service</h6>
                  <Table responsive bordered hover size="sm" className="mb-4 align-middle">
                    <thead>
                      <tr>
                        <th>Service</th>
                        <th className="text-end">Bookings</th>
                        <th className="text-end">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!summary.breakdown || summary.breakdown.length === 0) && (
                        <tr>
                          <td colSpan={3} className="text-center text-muted py-3">
                            No bookings counted yet.
                          </td>
                        </tr>
                      )}
                      {summary.breakdown?.map((b) => (
                        <tr key={b.serviceType}>
                          <td>{SERVICE_LABEL[b.serviceType] || b.serviceType}</td>
                          <td className="text-end">{b.bookingCount}</td>
                          <td className="text-end">{b.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>

                  <h6 className="mb-2">Recent Entries</h6>
                  <Table responsive striped hover size="sm" className="mb-0 align-middle">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Service</th>
                        <th>Booking Ref</th>
                        <th className="text-end">Amount</th>
                        <th className="text-end">Points</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center text-muted py-3">
                            No incentive entries.
                          </td>
                        </tr>
                      )}
                      {displayedRows.map((r) => (
                        <tr key={r.id}>
                          <td>{r.earnedDate ? new Date(r.earnedDate).toLocaleString() : "-"}</td>
                          <td>{SERVICE_LABEL[r.serviceType] || r.serviceType}</td>
                          <td className="text-muted small">{r.bookingRef}</td>
                          <td className="text-end">{r.bookingAmount ?? "-"}</td>
                          <td className="text-end fw-semibold">{r.pointsEarned}</td>
                          <td>
                            {r.status === "EARNED" && (
                              <span className="badge bg-info text-dark">Earned</span>
                            )}
                            {r.status === "CLAIMED" && (
                              <span className="badge bg-success">Claimed</span>
                            )}
                            {r.status === "VOID" && (
                              <span className="badge bg-secondary">Void</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>

                  {rows.length > 0 && (
                    <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mt-3">
                      <div className="text-muted" style={{ fontSize: "0.875rem" }}>
                        Showing{" "}
                        <span className="fw-semibold text-dark">{entriesDisplayStart}</span> to{" "}
                        <span className="fw-semibold text-dark">{entriesDisplayEnd}</span> of{" "}
                        <span className="fw-semibold text-dark">{rows.length}</span> entries
                      </div>
                      <Pagination className="mb-0">
                        <Pagination.Prev
                          disabled={entriesCurrentPage === 1}
                          onClick={() =>
                            entriesCurrentPage > 1 && setEntriesPage(entriesCurrentPage - 1)
                          }
                        />
                        {(() => {
                          const windowSize = 5;
                          const startPage = Math.max(
                            1,
                            Math.min(
                              entriesCurrentPage - Math.floor(windowSize / 2),
                              entriesTotalPages - windowSize + 1,
                            ),
                          );
                          const endPage = Math.min(entriesTotalPages, startPage + windowSize - 1);
                          return Array.from(
                            { length: endPage - startPage + 1 },
                            (_, i) => startPage + i,
                          ).map((pageNumber) => (
                            <Pagination.Item
                              key={pageNumber}
                              active={entriesCurrentPage === pageNumber}
                              onClick={() => setEntriesPage(pageNumber)}
                            >
                              {pageNumber}
                            </Pagination.Item>
                          ));
                        })()}
                        <Pagination.Next
                          disabled={entriesCurrentPage === entriesTotalPages}
                          onClick={() =>
                            entriesCurrentPage < entriesTotalPages &&
                            setEntriesPage(entriesCurrentPage + 1)
                          }
                        />
                      </Pagination>
                    </div>
                  )}
                </>
              )}
            </Card.Body>
          </Card>

          <Modal show={claimOpen} onHide={() => setClaimOpen(false)} centered size="lg">
            <Modal.Header closeButton={!submitting}>
              <Modal.Title>Submit Claim</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <div className="alert alert-info">
                <div>
                  <strong>{summary?.totalPointsEarned || 0}</strong> earned points
                  {" "}—{" "}
                  <strong>
                    {summary?.targetPoints
                      ? Math.floor(
                          (summary?.totalPointsEarned || 0) /
                            summary.targetPoints,
                        )
                      : 0}
                  </strong>{" "}
                  complete cycle(s) of{" "}
                  <strong>{summary?.targetPoints || 0}</strong>.
                </div>
                <div className="display-6 fw-semibold text-success mt-1">
                  AED {calculatedAmount.toFixed(2)}
                </div>
                <div className="small text-muted">
                  This amount will be processed after admin approval.
                </div>
              </div>

              <Form.Group className="mb-3">
                <Form.Label>Claim Method</Form.Label>
                <div className="d-flex gap-3">
                  <Form.Check
                    type="radio"
                    id="method-credit"
                    name="claimMethod"
                    label="Add to Credit Limit"
                    value="CREDIT_LIMIT"
                    checked={claimMethod === "CREDIT_LIMIT"}
                    onChange={(e) => setClaimMethod(e.target.value)}
                  />
                  <Form.Check
                    type="radio"
                    id="method-bank"
                    name="claimMethod"
                    label="Transfer to Bank Account"
                    value="BANK_TRANSFER"
                    checked={claimMethod === "BANK_TRANSFER"}
                    onChange={(e) => setClaimMethod(e.target.value)}
                  />
                </div>
              </Form.Group>

              {claimMethod === "BANK_TRANSFER" && (
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
                            value={bank.bankAccountHolderName}
                            onChange={(e) =>
                              setBank({ ...bank, bankAccountHolderName: e.target.value })
                            }
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group>
                          <Form.Label>Bank Name <span className="text-danger">*</span></Form.Label>
                          <Form.Control
                            value={bank.bankName}
                            onChange={(e) => setBank({ ...bank, bankName: e.target.value })}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group>
                          <Form.Label>Account Number <span className="text-danger">*</span></Form.Label>
                          <Form.Control
                            value={bank.bankAccountNumber}
                            onChange={(e) =>
                              setBank({ ...bank, bankAccountNumber: e.target.value })
                            }
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group>
                          <Form.Label>IFSC Code <span className="text-danger">*</span></Form.Label>
                          <Form.Control
                            value={bank.bankIfscCode}
                            onChange={(e) => setBank({ ...bank, bankIfscCode: e.target.value })}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={12}>
                        <Form.Group>
                          <Form.Label>Branch Name <span className="text-danger">*</span></Form.Label>
                          <Form.Control
                            value={bank.bankBranchName}
                            onChange={(e) =>
                              setBank({ ...bank, bankBranchName: e.target.value })
                            }
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
              )}

              <Form.Group>
                <Form.Label>Remarks (optional)</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={claimRemarks}
                  onChange={(e) => setClaimRemarks(e.target.value)}
                  placeholder="Anything you'd like the admin to know"
                />
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setClaimOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button className="btn-indigo" onClick={submitClaim} disabled={submitting}>
                {submitting ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" /> Submitting...
                  </>
                ) : (
                  "Confirm & Submit"
                )}
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
}
