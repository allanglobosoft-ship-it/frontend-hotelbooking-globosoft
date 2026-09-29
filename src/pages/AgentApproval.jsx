import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Card,
  Table,
  Spinner,
  Form,
  InputGroup,
  Row,
  Col,
  Pagination,
} from "react-bootstrap";
import {
  FaSearch,
  FaInbox,
  FaUserTie,
  FaEye,
  FaSync,
} from "react-icons/fa";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import axiosInstance from "../components/AxiosInstance";
import toast from "react-hot-toast";

// Rows-per-page choices — matches HotelApproval.jsx.
const PER_PAGE_OPTIONS = [10, 25, 50, 100];

const STATUS_META = {
  PENDING: { label: "Pending", bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  APPROVED: { label: "Approved", bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  REJECTED: { label: "Rejected", bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
  CANCELLED: { label: "Cancelled", bg: "#f2f4f7", color: "#475467", dot: "#98a2b3" },
};

// Approval list shows PENDING + REJECTED + CANCELLED requests — a reviewed
// request stays visible here under its own status instead of disappearing.
// Only APPROVED rows leave the list; their details live on AgentView.
const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

const StatusPill = ({ status }) => {
  const meta = STATUS_META[status];
  if (!meta) return <span className="text-muted">{status || "-"}</span>;
  return (
    <span
      className="d-inline-flex align-items-center gap-1 px-2 py-1 rounded-pill"
      style={{
        backgroundColor: meta.bg,
        color: meta.color,
        fontSize: "0.7rem",
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: meta.dot,
          display: "inline-block",
        }}
      />
      {meta.label}
    </span>
  );
};

/**
 * AgentApproval — admin review of agent self-registration requests.
 * Mirrors HotelApproval.jsx. Approving a PENDING request provisions an
 * AGENT login so the agent can sign in via the standard /auth/login flow.
 */
export default function AgentApproval() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_OPTIONS[0]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      // PENDING + REJECTED + CANCELLED requests appear here — once an admin
      // approves an agent the row moves off this list (approved details live
      // on AgentView). A rejected request stays visible (as Rejected) so the
      // admin can Re-Approve or Cancel it from the detail page; cancelling
      // leaves it here as Cancelled rather than deleting it.
      const res = await axiosInstance.get("/api/agent-external-register/pending-or-rejected");
      setRequests(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load agent registration requests");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const filtered = requests.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (r.companyName || "").toLowerCase().includes(q) ||
      (r.contactPerson || "").toLowerCase().includes(q) ||
      (r.email || "").toLowerCase().includes(q) ||
      (r.phone || "").toLowerCase().includes(q) ||
      (r.username || "").toLowerCase().includes(q) ||
      (r.city || "").toLowerCase().includes(q) ||
      (r.country || "").toLowerCase().includes(q)
    );
  });

  const totalEntries = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / perPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * perPage;
  const pageItems = filtered.slice(startIdx, startIdx + perPage);
  const displayStart = totalEntries === 0 ? 0 : startIdx + 1;
  const displayEnd = Math.min(startIdx + perPage, totalEntries);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, perPage]);

  const goToPage = (p) => {
    if (p < 1 || p > totalPages) return;
    setCurrentPage(p);
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-3" style={{ width: "100%", overflow: "hidden" }}>
          <Container
            fluid
            style={{ maxWidth: "100%", paddingLeft: "0.5rem", paddingRight: "0.5rem" }}
          >
            {/* Header */}
            <div className="d-flex justify-content-between align-items-end mb-3">
              <div>
                <h3 className="fw-bold text-dark mb-2">Agent Registration Approvals</h3>
                <InputGroup style={{ height: "40px", width: "320px" }}>
                  <InputGroup.Text
                    style={{
                      backgroundColor: "#f8f9fa",
                      borderRight: "none",
                      borderColor: "#dee2e6",
                    }}
                  >
                    <FaSearch style={{ color: "#6c757d" }} />
                  </InputGroup.Text>
                  <Form.Control
                    type="text"
                    placeholder="Search by company / contact / email / city"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                      borderLeft: "none",
                      fontSize: "0.85rem",
                      borderColor: "#dee2e6",
                      height: "40px",
                    }}
                  />
                </InputGroup>
              </div>
              <button
                type="button"
                className="btn d-inline-flex align-items-center gap-2"
                onClick={fetchRequests}
                style={{
                  border: "1.5px solid #c0392b",
                  color: "#c0392b",
                  background: "#fff",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  borderRadius: "8px",
                  height: "40px",
                }}
              >
                <FaSync /> Refresh
              </button>
            </div>

            {/* Status filter */}
            <Row className="mb-2 g-1">
              <Col xs={12}>
                <Card className="shadow-sm border-0 w-100" style={{ borderRadius: "8px" }}>
                  <Card.Body className="p-3">
                    <h6
                      className="mb-2 fw-bold text-dark"
                      style={{ fontSize: "0.85rem", letterSpacing: "0.4px" }}
                    >
                      Status
                    </h6>
                    <Row className="g-2">
                      <Col xs={12} md={6} lg={4} xl={3}>
                        <Form.Select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                          size="sm"
                          aria-label="Status filter"
                          style={{ fontSize: "0.85rem", height: "46px" }}
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </Form.Select>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            <Card className="border mb-3 shadow-sm" style={{ borderRadius: "6px" }}>
              <Card.Header
                className="d-flex justify-content-between align-items-center text-dark border-bottom py-2"
                style={{
                  borderRadius: "6px 6px 0 0",
                  backgroundColor: "#f8f9fa",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                }}
              >
                <span>List of Registration Requests</span>
              </Card.Header>
              <Card.Body style={{ padding: "1.5rem 1rem 1rem" }}>
                {loading ? (
                  <div className="text-center py-5">
                    <Spinner animation="border" variant="primary" />
                    <p className="mt-3 text-muted">Loading requests...</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-5 text-muted">
                    <FaInbox className="display-4 mb-3" style={{ opacity: 0.4 }} />
                    <h6 className="fw-semibold">No registration requests found</h6>
                    <p className="mb-0 small">
                      Agent requests submitted from the public registration page appear here.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="table-responsive saas-table-wrap">
                      <Table hover className="mb-0 align-middle saas-table">
                        <thead>
                          <tr>
                            <th style={{ width: "48px" }}>#</th>
                            <th>Company Name</th>
                            <th>Contact Person</th>
                            <th>Email</th>
                            <th>Status</th>
                            <th className="text-center" style={{ width: "70px" }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pageItems.map((r, idx) => (
                            <tr key={r.id}>
                              <td className="text-muted">{startIdx + idx + 1}</td>
                              <td>
                                <span className="d-inline-flex align-items-center" style={{ gap: "0.4rem" }}>
                                  <FaUserTie style={{ color: "#98a2b3", fontSize: "0.72rem", flexShrink: 0 }} />
                                  <span className="fw-semibold text-dark">{r.companyName || "-"}</span>
                                </span>
                              </td>
                              <td>{r.contactPerson || "-"}</td>
                              <td>{r.email || "-"}</td>
                              <td>
                                <StatusPill status={r.status} />
                              </td>
                              <td className="text-center">
                                <button
                                  type="button"
                                  className="btn btn-sm border-0 p-1"
                                  style={{
                                    backgroundColor: "#eff6ff",
                                    color: "#1d4ed8",
                                    borderRadius: "6px",
                                  }}
                                  onClick={() => navigate(`/admin/approval/agents/${r.id}`)}
                                  title="View details"
                                >
                                  <FaEye style={{ fontSize: "12px" }} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>

                    <style>{`
                      .saas-table-wrap { border: 1px solid #eaecf0; border-radius: 8px; overflow-x: auto; }
                      .saas-table { font-size: 0.8rem; margin-bottom: 0; }
                      .saas-table thead th {
                        background-color: #f9fafb;
                        color: #667085;
                        font-size: 0.68rem;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.04em;
                        border-bottom: 1px solid #eaecf0;
                        border-top: none;
                        padding: 0.65rem 0.75rem;
                        white-space: nowrap;
                      }
                      .saas-table tbody td {
                        padding: 0.65rem 0.75rem;
                        border-top: 1px solid #f2f4f7;
                        vertical-align: middle;
                        color: #344054;
                      }
                      .saas-table tbody tr:first-child td { border-top: none; }
                      .saas-table tbody tr:hover { background-color: #fafbfc; }
                    `}</style>

                    {/* Pagination footer */}
                    <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mt-3">
                      <div className="text-muted" style={{ fontSize: "0.875rem" }}>
                        Showing <span className="fw-semibold text-dark">{displayStart}</span> to{" "}
                        <span className="fw-semibold text-dark">{displayEnd}</span> of{" "}
                        <span className="fw-semibold text-dark">{totalEntries}</span> entries
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <span className="text-muted" style={{ fontSize: "0.8rem" }}>
                          Rows per page
                        </span>
                        <Form.Select
                          size="sm"
                          value={perPage}
                          onChange={(e) => setPerPage(Number(e.target.value))}
                          style={{ width: "auto", fontSize: "0.8rem" }}
                        >
                          {PER_PAGE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Form.Select>
                      </div>
                      <Pagination className="mb-0">
                        <Pagination.Prev
                          disabled={safePage === 1}
                          onClick={() => goToPage(safePage - 1)}
                          style={{
                            cursor: safePage === 1 ? "not-allowed" : "pointer",
                            opacity: safePage === 1 ? 0.5 : 1,
                          }}
                        />
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNumber) => (
                          <Pagination.Item
                            key={pageNumber}
                            active={safePage === pageNumber}
                            onClick={() => goToPage(pageNumber)}
                            style={{ cursor: "pointer", minWidth: "38px", textAlign: "center" }}
                          >
                            {pageNumber}
                          </Pagination.Item>
                        ))}
                        <Pagination.Next
                          disabled={safePage === totalPages}
                          onClick={() => goToPage(safePage + 1)}
                          style={{
                            cursor: safePage === totalPages ? "not-allowed" : "pointer",
                            opacity: safePage === totalPages ? 0.5 : 1,
                          }}
                        />
                      </Pagination>
                    </div>
                  </>
                )}
              </Card.Body>
            </Card>
          </Container>
        </main>
      </div>
    </div>
  );
}
