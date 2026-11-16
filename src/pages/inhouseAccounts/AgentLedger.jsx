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
  Modal,
  ButtonGroup,
} from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import {
  FaFileDownload,
  FaSyncAlt,
  FaFilter,
  FaUndo,
  FaWallet,
  FaPlus,
  FaMinus,
} from "react-icons/fa";
import { escapeHtml } from "../../utils/safeHtml";
import { csvCellQuoted } from "../../utils/csvSafe";

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

// Export pulls the WHOLE filtered statement in chunks of this size — the
// largest page AgentLedgerQueryService allows (MAX_PAGE_SIZE).
const EXPORT_PAGE_SIZE = 500;

// Query params for the current filters (page/size are added by the caller).
const filterParams = (filters) => {
  const params = {};
  if (filters.agentId) params.agentId = filters.agentId;
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.entryType) params.entryType = filters.entryType;
  if (filters.sourceModule) params.sourceModule = filters.sourceModule;
  if (filters.search?.trim()) params.search = filters.search.trim();
  return params;
};

// Labels here must match AgentLedgerEntryType.label() on the backend — same
// plain wording, no debit/credit vocabulary.
const ENTRY_TYPES = [
  { value: "", label: "Everything" },
  { value: "BOOKING_DEBIT", label: "Booking made" },
  { value: "CANCELLATION_CREDIT", label: "Booking cancelled" },
  { value: "CANCELLATION_NOT_REFUNDED", label: "Cancelled, not refunded" },
  { value: "RECEIPT_CREDIT", label: "Money paid in" },
  { value: "ADDITIONAL_CREDIT", label: "Credit added" },
  { value: "CREDIT_LIMIT_INCREASE", label: "Limit raised" },
  { value: "CREDIT_LIMIT_DECREASE", label: "Limit lowered" },
  { value: "ADJUSTMENT_DEBIT", label: "Money taken out" },
  { value: "ADJUSTMENT_CREDIT", label: "Money added" },
];

// A non-refundable booking that was cancelled: a zero line, because nothing
// goes back to the agent's credit online. Only the Finance team can refund it.
const NOT_REFUNDED = "CANCELLATION_NOT_REFUNDED";

// Badge colours for "What happened": green money in, red money out, amber for
// a cancellation that gave nothing back.
const badgeColours = (e) => {
  if (e.entryType === NOT_REFUNDED) {
    return { bg: "warning-subtle", text: "warning-emphasis" };
  }
  return e.direction === "CREDIT"
    ? { bg: "success-subtle", text: "success" }
    : { bg: "danger-subtle", text: "danger" };
};

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
  { value: "ACTIVITY", label: "Activity" },
  { value: "TRIP", label: "Trip" },
  { value: "ACCOUNTS", label: "Accounts" },
  { value: "OTHER", label: "Other" },
];

// ── Add / Deduct credit (admins) ─────────────────────────────────────
// Same limits as AgentCreditAdjustmentRequestDTO on the backend.
const MAX_ADJUST_AMOUNT = 999999999999.99;
const MAX_ADJUST_REASON = 300;
const BLANK_ADJUST = { agentId: "", action: "ADD", amount: "", remarks: "" };

// A change an admin made with Add / Deduct credit (the only ADJUSTMENT_*
// lines the Accounts module writes).
const isManualAdjustment = (e) =>
  e.sourceModule === "ACCOUNTS" &&
  (e.entryType === "ADJUSTMENT_CREDIT" || e.entryType === "ADJUSTMENT_DEBIT");

const validateAdjust = (form, agent) => {
  const errors = {};
  if (!form.agentId) errors.agentId = "Choose an agent.";
  const raw = String(form.amount ?? "").trim();
  const n = Number(raw);
  if (!raw) {
    errors.amount = "Enter an amount.";
  } else if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    errors.amount = "Enter a number with at most 2 decimal places.";
  } else if (n <= 0) {
    errors.amount = "Enter an amount greater than zero.";
  } else if (n > MAX_ADJUST_AMOUNT) {
    errors.amount = "That amount is too large.";
  } else if (
    form.action === "DEDUCT" &&
    agent &&
    n > Number(agent.availableCreditLimit ?? 0)
  ) {
    errors.amount = `This agent has only ${money(
      agent.availableCreditLimit ?? 0
    )} available.`;
  }
  const reason = form.remarks.trim();
  if (!reason) {
    errors.remarks = "Enter a reason for this change.";
  } else if (reason.length > MAX_ADJUST_REASON) {
    errors.remarks = `Keep the reason under ${MAX_ADJUST_REASON} characters.`;
  }
  return errors;
};

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
    sessionStorage.getItem("currentActiveRole") || ""
  ).toLowerCase();
  // The backend lets ADMIN and SUPER_ADMIN rebuild history; the button used to
  // check "admin" only, so a super admin never saw it.
  const isAdmin = currentRole === "admin" || currentRole === "super_admin";

  const [data, setData] = useState(null);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(0);

  // Add / Deduct credit modal. creditAgents = every agent with a credit
  // account (the ledger picker only lists agents that already have lines).
  const [showAdjust, setShowAdjust] = useState(false);
  const [creditAgents, setCreditAgents] = useState([]);
  const [loadingCreditAgents, setLoadingCreditAgents] = useState(false);
  const [adjust, setAdjust] = useState(BLANK_ADJUST);
  const [adjustErrors, setAdjustErrors] = useState({});
  const [adjusting, setAdjusting] = useState(false);

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
        const params = { ...filterParams(filters), page: pageNo, size: PAGE_SIZE };

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
          `Starting credit limits: <b>${escapeHtml(s.openingBalanceLines ?? 0)}</b><br/>` +
          `Bookings made: <b>${escapeHtml(s.bookingDebitLines ?? 0)}</b><br/>` +
          `Bookings cancelled: <b>${escapeHtml(s.cancellationCreditLines ?? 0)}</b><br/>` +
          `Cancelled, not refunded: <b>${escapeHtml(s.cancelledNotRefundedLines ?? 0)}</b><br/>` +
          (s.removedNonRefundableRefundLines > 0
            ? `Wrong refund lines removed (non-refundable): <b>${escapeHtml(s.removedNonRefundableRefundLines)}</b><br/>`
            : "") +
          `Payments in: <b>${escapeHtml(s.receiptCreditLines ?? 0)}</b><br/><br/>` +
          `<b>${escapeHtml(s.totalWritten ?? 0)}</b> new lines added` +
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

  // Fresh balances every time the modal opens, so the "Available now" figure
  // and the Deduct check use what the agent has at that moment.
  const fetchCreditAgents = async () => {
    setLoadingCreditAgents(true);
    try {
      const res = await axiosInstance.get("/api/agent-credit-limit/agents");
      setCreditAgents(Array.isArray(res.data) ? res.data : []);
    } catch {
      // The endpoint answers with an error when no agent has a credit account.
      setCreditAgents([]);
    } finally {
      setLoadingCreditAgents(false);
    }
  };

  const openAdjust = () => {
    // Start on the agent already chosen in the filter, if any.
    setAdjust({ ...BLANK_ADJUST, agentId: draft.agentId || applied.agentId || "" });
    setAdjustErrors({});
    setShowAdjust(true);
    fetchCreditAgents();
  };

  const closeAdjust = () => {
    if (adjusting) return;
    setShowAdjust(false);
  };

  const setAdjustField = (field, value) => {
    setAdjust((prev) => ({ ...prev, [field]: value }));
    setAdjustErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const adjustAgent = creditAgents.find(
    (a) => String(a.agentId) === String(adjust.agentId)
  );

  // What the agent's available credit will be after this change, for the
  // line under the form. Only shown for a valid amount.
  const adjustPreview = (() => {
    if (!adjustAgent) return null;
    const raw = String(adjust.amount ?? "").trim();
    if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) return null;
    const available = Number(adjustAgent.availableCreditLimit ?? 0);
    const total = Number(adjustAgent.totalCreditLimit ?? 0);
    const after =
      adjust.action === "ADD" ? available + Number(raw) : available - Number(raw);
    if (after < 0) return null;
    return { after, raisesLimit: adjust.action === "ADD" && after > total };
  })();

  const submitAdjust = async () => {
    const errors = validateAdjust(adjust, adjustAgent);
    setAdjustErrors(errors);
    if (Object.keys(errors).length) return;

    const amount = Number(String(adjust.amount).trim());
    const agentName = adjustAgent?.agentName || "the agent";
    setAdjusting(true);
    try {
      await axiosInstance.post("/api/inhouse-accounts/ledger/adjust-credit", {
        agentId: Number(adjust.agentId),
        amount,
        action: adjust.action,
        remarks: adjust.remarks.trim(),
      });
      toast.success(
        adjust.action === "ADD"
          ? `${money(amount)} added to ${agentName}'s available credit.`
          : `${money(amount)} deducted from ${agentName}'s available credit.`
      );
      setShowAdjust(false);
      // Show that agent's statement so the new line is on screen. A new
      // object, so the ledger reloads even when the agent was already chosen.
      const next = { ...applied, agentId: String(adjust.agentId) };
      setDraft((prev) => ({ ...prev, agentId: String(adjust.agentId) }));
      setPage(0);
      setApplied(next);
      fetchAgents();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Could not save the change. Please try again."
      );
    } finally {
      setAdjusting(false);
    }
  };

  const exportCsv = async () => {
    if (!data?.totalElements) {
      toast.error("Nothing to export.");
      return;
    }
    // Export the whole statement for the applied filters, not just the 10
    // rows on screen — it used to download only the current page.
    setExporting(true);
    const rows = [];
    try {
      for (let p = 0; ; p++) {
        const res = await axiosInstance.get("/api/inhouse-accounts/ledger", {
          params: { ...filterParams(applied), page: p, size: EXPORT_PAGE_SIZE },
        });
        const chunk = res.data?.entries || [];
        rows.push(...chunk);
        if (!chunk.length || p + 1 >= (res.data?.totalPages || 0)) break;
      }
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Could not export the ledger."
      );
      return;
    } finally {
      setExporting(false);
    }
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
    const esc = (v) => csvCellQuoted(v); // neutralises formula-leading text
    const lines = rows.map((r, idx) =>
      [
        // Same continuous numbering as the table (newest = 1), so a row in
        // the file has the same number it has on screen.
        idx + 1,
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
                  disabled={loading || exporting || !entries.length}
                >
                  <FaFileDownload className="me-1" />{" "}
                  {exporting ? "Exporting…" : "Export CSV"}
                </Button>
                {isAdmin && (
                  <Button size="sm" variant="primary" onClick={openAdjust}>
                    <FaWallet className="me-1" /> Add / Deduct credit
                  </Button>
                )}
                {isAdmin && (
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
                they had left to spend right after it. A cancelled
                non-refundable booking shows as <b>Cancelled, not refunded</b>:
                nothing goes back to the agent's credit, and only the Finance
                team can refund it.
                {isAdmin && (
                  <>
                    {" "}
                    Use <b>Add / Deduct credit</b> to add an amount to, or take
                    it off, an agent's available credit; it shows here as{" "}
                    <b>Money added</b> or <b>Money taken out</b>, with your
                    reason.
                  </>
                )}
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
                          {isAdmin && (
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
                              bg={badgeColours(e).bg}
                              text={badgeColours(e).text}
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
                            {isManualAdjustment(e) &&
                              e.createdBy &&
                              e.createdBy !== "system" && (
                                <div className="small text-muted">
                                  By {e.createdBy}
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

      {/* ── Add / Deduct credit (admins) ─────────────────────── */}
      <Modal
        show={showAdjust}
        onHide={closeAdjust}
        centered
        backdrop={adjusting ? "static" : true}
      >
        <Modal.Header closeButton={!adjusting}>
          <Modal.Title as="h6" className="mb-0">
            Add or deduct credit
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small">
            The amount is added to, or taken off, the agent's available credit,
            and one line with your reason is added to the ledger.
          </p>

          <Form.Group className="mb-3">
            <Form.Label className="small text-muted mb-1">Agent</Form.Label>
            <Form.Select
              size="sm"
              value={adjust.agentId}
              isInvalid={!!adjustErrors.agentId}
              disabled={adjusting || loadingCreditAgents}
              onChange={(e) => setAdjustField("agentId", e.target.value)}
            >
              <option value="">
                {loadingCreditAgents
                  ? "Loading agents…"
                  : creditAgents.length
                  ? "Choose an agent"
                  : "No agent has a credit account yet"}
              </option>
              {creditAgents.map((a) => (
                <option key={a.agentId} value={a.agentId}>
                  {a.agentName}
                </option>
              ))}
            </Form.Select>
            <Form.Control.Feedback type="invalid">
              {adjustErrors.agentId}
            </Form.Control.Feedback>
            {adjustAgent && (
              <div className="small text-muted mt-1">
                Available now:{" "}
                <b>{money(adjustAgent.availableCreditLimit ?? 0)}</b> of a{" "}
                {money(adjustAgent.totalCreditLimit ?? 0)} credit limit
              </div>
            )}
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="small text-muted mb-1 d-block">
              What to do
            </Form.Label>
            <ButtonGroup size="sm">
              <Button
                variant={adjust.action === "ADD" ? "success" : "outline-success"}
                disabled={adjusting}
                onClick={() => setAdjustField("action", "ADD")}
              >
                <FaPlus className="me-1" /> Add
              </Button>
              <Button
                variant={adjust.action === "DEDUCT" ? "danger" : "outline-danger"}
                disabled={adjusting}
                onClick={() => setAdjustField("action", "DEDUCT")}
              >
                <FaMinus className="me-1" /> Deduct
              </Button>
            </ButtonGroup>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="small text-muted mb-1">Amount</Form.Label>
            <Form.Control
              size="sm"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={adjust.amount}
              isInvalid={!!adjustErrors.amount}
              disabled={adjusting}
              onChange={(e) => setAdjustField("amount", e.target.value)}
            />
            <Form.Control.Feedback type="invalid">
              {adjustErrors.amount}
            </Form.Control.Feedback>
          </Form.Group>

          <Form.Group className="mb-2">
            <Form.Label className="small text-muted mb-1">Reason</Form.Label>
            <Form.Control
              size="sm"
              as="textarea"
              rows={2}
              maxLength={MAX_ADJUST_REASON}
              placeholder="Why is this credit being added or deducted?"
              value={adjust.remarks}
              isInvalid={!!adjustErrors.remarks}
              disabled={adjusting}
              onChange={(e) => setAdjustField("remarks", e.target.value)}
            />
            <Form.Control.Feedback type="invalid">
              {adjustErrors.remarks}
            </Form.Control.Feedback>
          </Form.Group>

          {adjustPreview && (
            <div className="small">
              Available after this: <b>{money(adjustPreview.after)}</b>
              {adjustPreview.raisesLimit && (
                <span className="text-muted">
                  {" "}
                  (the credit limit goes up to match)
                </span>
              )}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={closeAdjust}
            disabled={adjusting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant={adjust.action === "ADD" ? "success" : "danger"}
            onClick={submitAdjust}
            disabled={adjusting || loadingCreditAgents}
          >
            {adjusting ? (
              <>
                <Spinner animation="border" size="sm" className="me-1" />
                Saving…
              </>
            ) : adjust.action === "ADD" ? (
              "Add credit"
            ) : (
              "Deduct credit"
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
