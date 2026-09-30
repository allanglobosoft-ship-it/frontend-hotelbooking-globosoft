import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  Button,
  Table,
  Form,
  Row,
  Col,
  Badge,
  Pagination,
  Spinner,
} from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaFileDownload, FaSyncAlt, FaFilter, FaUndo } from "react-icons/fa";

/**
 * Inhouse Accounts → Ledger.
 *
 * A statement of every movement of an agent's credit: bookings debit it,
 * cancellations and payments credit it, admin grants top it up. Admins can
 * pick any agent; an agent login is locked to its own account by the backend
 * (AgentLedgerQueryService overwrites the agentId), so nothing here needs to
 * enforce that — the agent picker is simply hidden.
 */

const PAGE_SIZE = 10;

// Labels here must match AgentLedgerEntryType.label() on the backend — same
// plain wording, no debit/credit vocabulary.
const ENTRY_TYPES = [
  { value: "", label: "Everything" },
  { value: "BOOKING_DEBIT", label: "Booking made" },
  { value: "CANCELLATION_CREDIT", label: "Booking cancelled" },
  { value: "RECEIPT_CREDIT", label: "Money paid in" },
  { value: "ADDITIONAL_CREDIT", label: "Credit added" },
  { value: "CREDIT_LIMIT_INCREASE", label: "Limit raised" },
  { value: "CREDIT_LIMIT_DECREASE", label: "Limit lowered" },
  { value: "ADJUSTMENT_DEBIT", label: "Money taken out" },
  { value: "ADJUSTMENT_CREDIT", label: "Money added" },
];

const MODULES = [
  { value: "", label: "All types" },
  { value: "HOTEL", label: "Hotel" },
  { value: "LAST_MINUTE", label: "Last Minute" },
  { value: "PACKAGE", label: "Package" },
  { value: "CAB", label: "Cab" },
  { value: "DAYSTAY", label: "Day Stay" },
  { value: "HONEYMOON", label: "Honeymoon" },
  { value: "MEETING_SPACE", label: "Meeting Space" },
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "LONG_STAY", label: "Long Stay" },
  { value: "GOV_EMPLOYEE", label: "Gov Employee" },
  { value: "SENIOR_CITIZEN", label: "Senior Citizen" },
  { value: "STUDENT", label: "Student" },
  { value: "TRIP", label: "Trip" },
  { value: "ACCOUNTS", label: "Accounts" },
  { value: "OTHER", label: "Other" },
];

const money = (v) => {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return "";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDateTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function AgentLedger() {
  const currentRole = (
    localStorage.getItem("currentActiveRole") || ""
  ).toLowerCase();
  // Backend allows both admin roles to rebuild the history.
  const canRebuild = currentRole === "admin" || currentRole === "super_admin";

  const [data, setData] = useState(null);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [page, setPage] = useState(0);

  // Draft filter state — only applied on "Apply", so typing a date doesn't
  // fire a request per keystroke.
  const [draft, setDraft] = useState({
    agentId: "",
    from: "",
    to: "",
    entryType: "",
    sourceModule: "",
    search: "",
  });
  const [applied, setApplied] = useState(draft);

  const isAgentView = data?.scopedToSelf === true;

  const fetchAgents = useCallback(async () => {
    try {
      const res = await axiosInstance.get("/api/inhouse-accounts/ledger/agents");
      setAgents(Array.isArray(res.data) ? res.data : []);
    } catch {
      // Non-fatal: the picker just stays empty and the ledger still loads.
      setAgents([]);
    }
  }, []);

  const fetchLedger = useCallback(
    async (filters, pageNo) => {
      setLoading(true);
      try {
        const params = { page: pageNo, size: PAGE_SIZE };
        if (filters.agentId) params.agentId = filters.agentId;
        if (filters.from) params.from = filters.from;
        if (filters.to) params.to = filters.to;
        if (filters.entryType) params.entryType = filters.entryType;
        if (filters.sourceModule) params.sourceModule = filters.sourceModule;
        if (filters.search?.trim()) params.search = filters.search.trim();

        const res = await axiosInstance.get("/api/inhouse-accounts/ledger", {
          params,
        });
        setData(res.data || null);
      } catch (err) {
        toast.error(
          err?.response?.data?.message || "Could not load the ledger."
        );
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    fetchLedger(applied, page);
  }, [applied, page, fetchLedger]);

  const applyFilters = () => {
    setPage(0);
    setApplied(draft);
  };

  const resetFilters = () => {
    const blank = {
      agentId: "",
      from: "",
      to: "",
      entryType: "",
      sourceModule: "",
      search: "",
    };
    setDraft(blank);
    setPage(0);
    setApplied(blank);
  };

  const rebuildHistory = async () => {
    const confirm = await Swal.fire({
      title: "Add past entries?",
      html:
        "This looks at older bookings, cancellations and payments and adds " +
        "them to the ledger.<br/><br/>Safe to click more than once — anything " +
        "already listed is skipped, so nothing gets counted twice.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Add them",
    });
    if (!confirm.isConfirmed) return;

    setRebuilding(true);
    try {
      const res = await axiosInstance.post(
        "/api/inhouse-accounts/ledger/backfill"
      );
      const s = res.data || {};
      await Swal.fire({
        title: "Done",
        html:
          `<div style="text-align:left">` +
          `Starting credit limits: <b>${s.openingBalanceLines ?? 0}</b><br/>` +
          `Bookings made: <b>${s.bookingDebitLines ?? 0}</b><br/>` +
          `Bookings cancelled: <b>${s.cancellationCreditLines ?? 0}</b><br/>` +
          `Payments in: <b>${s.receiptCreditLines ?? 0}</b><br/><br/>` +
          `<b>${s.totalWritten ?? 0}</b> new lines added` +
          (s.totalWritten === 0
            ? `<br/><span style="color:#666">Everything was already listed.</span>`
            : "") +
          `</div>`,
        icon: "success",
      });
      fetchAgents();
      fetchLedger(applied, 0);
      setPage(0);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Could not rebuild the ledger history."
      );
    } finally {
      setRebuilding(false);
    }
  };

  const exportCsv = () => {
    const rows = data?.entries || [];
    if (!rows.length) {
      toast.error("Nothing to export.");
      return;
    }
    const header = [
      "SNo",
      "Date",
      "Agent",
      "What happened",
      "Details",
      "Booking Code",
      "Hotel",
      "Source",
      "Money out",
      "Money in",
      "Balance left",
      "Paid by",
      "Note",
    ];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map((r, idx) =>
      [
        // Same continuous numbering as the table, so an exported page lines up
        // with what the operator was looking at on screen.
        (data?.page ?? 0) * (data?.size ?? PAGE_SIZE) + idx + 1,
        formatDateTime(r.entryDate),
        r.agentName,
        r.entryTypeLabel,
        r.description,
        r.bookingCode,
        r.hotelName,
        r.sourceModule,
        r.debit,
        r.credit,
        r.runningBalance,
        r.paymentMode,
        r.remarks,
      ]
        .map(esc)
        .join(",")
    );
    const csv = [header.map(esc).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-${data?.agentName || "all-agents"}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const entries = data?.entries || [];
  const totalPages = data?.totalPages || 0;

  /**
   * Serial number for a row, continuous across pages: page 2 starts at 51, so
   * the number on the last row equals the total number of entries.
   *
   * Uses the page/size the SERVER echoed back, not the local state, because
   * the server clamps size (MAX_PAGE_SIZE) and normalises the page — trusting
   * local state would drift from what was actually returned.
   */
  const serialOf = (idx) =>
    (data?.page ?? 0) * (data?.size ?? PAGE_SIZE) + idx + 1;

  const pageNumbers = useMemo(() => {
    if (!totalPages) return [];
    const around = 2;
    const start = Math.max(0, page - around);
    const end = Math.min(totalPages - 1, page + around);
    const out = [];
    for (let i = start; i <= end; i++) out.push(i);
    return out;
  }, [page, totalPages]);

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          {/* ── Header ─────────────────────────────────────────── */}
          <Card className="shadow-sm rounded-xl mb-3">
            <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <span className="fw-semibold">Ledger</span>
                {data?.agentName && (
                  <span className="text-muted ms-2">— {data.agentName}</span>
                )}
              </div>
              <div className="d-flex gap-2">
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={exportCsv}
                  disabled={loading || !entries.length}
                >
                  <FaFileDownload className="me-1" /> Export CSV
                </Button>
                {canRebuild && (
                  <Button
                    size="sm"
                    variant="outline-primary"
                    onClick={rebuildHistory}
                    disabled={rebuilding}
                  >
                    <FaSyncAlt className={rebuilding ? "me-1 fa-spin" : "me-1"} />
                    {rebuilding ? "Adding…" : "Add past entries"}
                  </Button>
                )}
              </div>
            </Card.Header>

            {/* ── Summary ──────────────────────────────────────── */}
            <Card.Body className="pb-2">
              <p className="text-muted small mb-3">
                Every time an agent books something, cancels a booking, or pays
                money in, one line is added here — and the balance shows what
                they had left to spend right after it.
              </p>
              <Row className="g-3">
                <Col xs={6} md={3}>
                  <div className="text-muted small">Money out</div>
                  <div className="fs-5 fw-semibold text-danger">
                    {money(data?.totalDebit ?? 0)}
                  </div>
                  <div className="text-muted" style={{ fontSize: ".75rem" }}>
                    spent on bookings
                  </div>
                </Col>
                <Col xs={6} md={3}>
                  <div className="text-muted small">Money in</div>
                  <div className="fs-5 fw-semibold text-success">
                    {money(data?.totalCredit ?? 0)}
                  </div>
                  <div className="text-muted" style={{ fontSize: ".75rem" }}>
                    paid in or refunded
                  </div>
                </Col>
                <Col xs={6} md={3}>
                  <div className="text-muted small">Balance left now</div>
                  <div className="fs-5 fw-semibold">
                    {data?.creditLimitAvailable != null
                      ? money(data.creditLimitAvailable)
                      : "—"}
                  </div>
                  <div className="text-muted" style={{ fontSize: ".75rem" }}>
                    {data?.creditLimitAvailable != null
                      ? "still available to spend"
                      : "pick one agent to see this"}
                  </div>
                </Col>
                <Col xs={6} md={3}>
                  <div className="text-muted small">Total credit limit</div>
                  <div className="fs-5 fw-semibold">
                    {data?.creditLimitTotal != null
                      ? money(data.creditLimitTotal)
                      : "—"}
                  </div>
                  <div className="text-muted" style={{ fontSize: ".75rem" }}>
                    {data?.creditLimitUsed != null
                      ? `${money(data.creditLimitUsed)} used so far`
                      : " "}
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>

          {/* ── Filters ────────────────────────────────────────── */}
          <Card className="shadow-sm rounded-xl mb-3">
            <Card.Body>
              <Row className="g-2 align-items-end">
                {!isAgentView && (
                  <Col xs={12} md={3}>
                    <Form.Label className="small text-muted mb-1">
                      Agent
                    </Form.Label>
                    <Form.Select
                      size="sm"
                      value={draft.agentId}
                      onChange={(e) =>
                        setDraft({ ...draft, agentId: e.target.value })
                      }
                    >
                      <option value="">All agents</option>
                      {agents.map((a) => (
                        <option key={a.agentId} value={a.agentId}>
                          {a.agentName}
                        </option>
                      ))}
                    </Form.Select>
                  </Col>
                )}
                <Col xs={6} md={2}>
                  <Form.Label className="small text-muted mb-1">From</Form.Label>
                  <Form.Control
                    size="sm"
                    type="date"
                    value={draft.from}
                    onChange={(e) =>
                      setDraft({ ...draft, from: e.target.value })
                    }
                  />
                </Col>
                <Col xs={6} md={2}>
                  <Form.Label className="small text-muted mb-1">To</Form.Label>
                  <Form.Control
                    size="sm"
                    type="date"
                    value={draft.to}
                    onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                  />
                </Col>
                <Col xs={6} md={2}>
                  <Form.Label className="small text-muted mb-1">
                    Show only
                  </Form.Label>
                  <Form.Select
                    size="sm"
                    value={draft.entryType}
                    onChange={(e) =>
                      setDraft({ ...draft, entryType: e.target.value })
                    }
                  >
                    {ENTRY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Form.Select>
                </Col>
                <Col xs={6} md={2}>
                  <Form.Label className="small text-muted mb-1">
                    Booking type
                  </Form.Label>
                  <Form.Select
                    size="sm"
                    value={draft.sourceModule}
                    onChange={(e) =>
                      setDraft({ ...draft, sourceModule: e.target.value })
                    }
                  >
                    {MODULES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </Form.Select>
                </Col>
                <Col xs={12} md={isAgentView ? 4 : 3}>
                  <Form.Label className="small text-muted mb-1">
                    Search
                  </Form.Label>
                  <Form.Control
                    size="sm"
                    type="text"
                    placeholder="Type a booking code or hotel name"
                    value={draft.search}
                    onChange={(e) =>
                      setDraft({ ...draft, search: e.target.value })
                    }
                    onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                  />
                </Col>
                <Col xs={12} md="auto" className="d-flex gap-2">
                  <Button size="sm" onClick={applyFilters} disabled={loading}>
                    <FaFilter className="me-1" /> Apply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={resetFilters}
                    disabled={loading}
                  >
                    <FaUndo className="me-1" /> Reset
                  </Button>
                </Col>
              </Row>
            </Card.Body>
          </Card>

          {/* ── Statement ──────────────────────────────────────── */}
          <Card className="shadow-sm rounded-xl">
            <Card.Body className="p-0">
              <div className="table-responsive">
                <Table hover className="mb-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: "1%", whiteSpace: "nowrap" }}>SNo</th>
                      <th style={{ whiteSpace: "nowrap" }}>Date</th>
                      {!isAgentView && <th>Agent</th>}
                      <th>What happened</th>
                      <th>Details</th>
                      <th>Booking</th>
                      <th className="text-end text-danger">Money out</th>
                      <th className="text-end text-success">Money in</th>
                      <th className="text-end">Balance left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr>
                        <td
                          colSpan={isAgentView ? 8 : 9}
                          className="text-center py-5"
                        >
                          <Spinner animation="border" size="sm" />{" "}
                          <span className="ms-2">Loading ledger…</span>
                        </td>
                      </tr>
                    )}

                    {!loading && entries.length === 0 && (
                      <tr>
                        <td
                          colSpan={isAgentView ? 8 : 9}
                          className="text-center text-muted py-5"
                        >
                          Nothing to show for these filters.
                          {canRebuild && (
                            <div className="small mt-2">
                              If this agent has older bookings, click{" "}
                              <b>Add past entries</b> at the top to bring them in.
                            </div>
                          )}
                        </td>
                      </tr>
                    )}

                    {!loading &&
                      entries.map((e, idx) => (
                        <tr key={e.id}>
                          {/* Numbering runs CONTINUOUSLY across pages, so the
                              last row's number is the total count. Restarting
                              at 1 on every page would make "which number am I
                              on?" unanswerable, which is the whole point. */}
                          <td className="text-muted" style={{ whiteSpace: "nowrap" }}>
                            {serialOf(idx)}
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {formatDateTime(e.entryDate)}
                          </td>
                          {!isAgentView && <td>{e.agentName}</td>}
                          <td>
                            <Badge
                              bg={
                                e.direction === "CREDIT"
                                  ? "success-subtle"
                                  : "danger-subtle"
                              }
                              text={
                                e.direction === "CREDIT" ? "success" : "danger"
                              }
                            >
                              {e.entryTypeLabel}
                            </Badge>
                            {e.backfilled && (
                              <Badge
                                bg="secondary-subtle"
                                text="secondary"
                                className="ms-1"
                                title="This happened before the ledger existed, so it was added from past records"
                              >
                                old entry
                              </Badge>
                            )}
                          </td>
                          <td>
                            <div>{e.description}</div>
                            {/* Payment mode belongs here, not under the Booking
                                column — a payment has no booking, so it used to
                                render alone under a "Booking" heading. */}
                            {e.paymentMode && (
                              <div className="small text-muted">
                                Paid by {String(e.paymentMode).toLowerCase().replace(/_/g, " ")}
                              </div>
                            )}
                            {e.remarks && (
                              <div className="small text-muted fst-italic">
                                {e.remarks}
                              </div>
                            )}
                          </td>
                          <td>
                            {e.bookingCode ? (
                              <>
                                <div className="small fw-semibold">
                                  {e.bookingCode}
                                </div>
                                {e.hotelName && (
                                  <div className="small text-muted">
                                    {e.hotelName}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="text-muted small">—</span>
                            )}
                          </td>
                          <td className="text-end text-danger">
                            {Number(e.debit) > 0 ? money(e.debit) : ""}
                          </td>
                          <td className="text-end text-success">
                            {Number(e.credit) > 0 ? money(e.credit) : ""}
                          </td>
                          <td className="text-end fw-semibold">
                            {e.runningBalance != null
                              ? money(e.runningBalance)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </Table>
              </div>
            </Card.Body>

            {totalPages > 1 && (
              <Card.Footer className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <span className="small text-muted">
                  {data?.totalElements} entries · page {page + 1} of {totalPages}
                </span>
                <Pagination size="sm" className="mb-0">
                  <Pagination.Prev
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  />
                  {pageNumbers[0] > 0 && <Pagination.Ellipsis disabled />}
                  {pageNumbers.map((n) => (
                    <Pagination.Item
                      key={n}
                      active={n === page}
                      onClick={() => setPage(n)}
                    >
                      {n + 1}
                    </Pagination.Item>
                  ))}
                  {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && (
                    <Pagination.Ellipsis disabled />
                  )}
                  <Pagination.Next
                    disabled={page >= totalPages - 1}
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                  />
                </Pagination>
              </Card.Footer>
            )}
          </Card>
        </main>
      </div>
    </div>
  );
}
