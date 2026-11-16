import React, { useCallback, useEffect, useState } from "react";
import {
  Card,
  Button,
  Table,
  Form,
  Badge,
  Spinner,
  Modal,
  Alert,
  ButtonGroup,
} from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import { FaSyncAlt } from "react-icons/fa";

/**
 * Finance → Refund Review (owner decision 9, CX-17), ported from the October
 * release branch.
 *
 * A cancelled booking whose refund the system does not pay out by itself
 * lands on this daily list. Finance resolves each one within 2 working days
 * (UAE weekend: Saturday–Sunday); after that the row shows a red "Overdue"
 * pill. Example: flagged Thursday → due Monday (Fri + Mon are the 2 working
 * days) → overdue from Tuesday.
 *
 * On this branch the list is fed by hotel cancellations paid by card
 * through CC Avenue (kind "CARD_REFUND"). They never touched the agent's
 * credit, so the refund is made in the CC Avenue dashboard. The cancel
 * works out the amount with the usual refund rule (paid − kept) and lists
 * it here with the CC Avenue order id. Example: a hotel paid 1,000 by card,
 * cancelled while its charge bands keep 200 → a "Card refund" row of 800
 * for order 1730000123. Finance refunds 800 in CC Avenue, then presses
 * "Mark refunded via CC Avenue" here: the row is closed as refunded and NO
 * credit moves. Pressing Resolve again changes nothing.
 *
 * A credit item (kind "CREDIT"), if one is ever added, is refunded to the
 * agent's credit when resolved: one "booking cancelled" line on the agent's
 * statement. "Keep (no refund)" closes either kind without moving money.
 *
 * Backend (staff only):
 *   GET  /api/refund-review?status=PENDING|RESOLVED|ALL
 *   POST /api/refund-review/{id}/resolve  { action: "REFUND"|"KEEP", amount, note }
 */

const isCardRefund = (item) => item?.kind === "CARD_REFUND";

const hasValue = (v) => v !== null && v !== undefined && v !== "";

const STATUS_TABS = [
  { value: "PENDING", label: "Pending" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "ALL", label: "All" },
];

const money = (v) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDateTime = (iso) => {
  if (!iso) return "—";
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

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(String(iso).includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const workingDaysLabel = (n) => {
  const v = Number(n);
  if (Number.isNaN(v)) return "—";
  return `${v} working day${v === 1 ? "" : "s"}`;
};

export default function RefundReview() {
  const [status, setStatus] = useState("PENDING");
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, overdue: 0 });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Resolve modal state
  const [target, setTarget] = useState(null);
  const [action, setAction] = useState("REFUND");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async (which) => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await axiosInstance.get("/api/refund-review", {
        params: { status: which },
      });
      const data = res?.data || {};
      setItems(Array.isArray(data.items) ? data.items : []);
      setCounts({
        pending: Number(data.pendingCount) || 0,
        overdue: Number(data.overdueCount) || 0,
      });
    } catch (e) {
      const msg =
        e?.response?.data?.message || "Could not load the refund review list.";
      setLoadError(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(status);
  }, [status, load]);

  const openResolve = (item) => {
    setTarget(item);
    setAction("REFUND");
    // A card refund opens on the amount the cancel decided (paid − kept);
    // when the cancel could not decide it, on what was paid.
    const preset =
      isCardRefund(item) && hasValue(item?.refundAmount)
        ? item.refundAmount
        : item?.charged;
    setAmount(hasValue(preset) ? String(preset) : "");
    setNote("");
    setFormError("");
  };

  const closeResolve = () => {
    if (saving) return;
    setTarget(null);
  };

  const submitResolve = async () => {
    if (!target) return;
    setFormError("");
    const charged = Number(target.charged) || 0;
    let amt = null;
    if (action === "REFUND") {
      amt = Number(amount);
      if (amount === "" || Number.isNaN(amt) || amt <= 0) {
        setFormError("Enter a refund amount greater than 0.");
        return;
      }
      if (amt > charged + 0.00001) {
        setFormError(
          `The refund cannot be more than what was charged (${money(charged)}).`,
        );
        return;
      }
    }
    setSaving(true);
    try {
      const res = await axiosInstance.post(
        `/api/refund-review/${target.id}/resolve`,
        {
          action,
          amount: action === "REFUND" ? amt : null,
          note: note.trim() || null,
        },
      );
      const data = res?.data || {};
      if (data.success === false) {
        setFormError(data.message || "The review could not be resolved.");
        return;
      }
      toast.success(
        data.message ||
          (data.alreadyResolved
            ? "This review was already resolved — nothing changed."
            : "Review resolved."),
      );
      setTarget(null);
      load(status);
    } catch (e) {
      setFormError(
        e?.response?.data?.message || "The review could not be resolved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (item) => {
    if (item.status === "RESOLVED") {
      if (item.resolution === "REFUNDED") {
        return (
          <Badge bg="success">
            Refunded {money(item.refundedAmount)}
            {isCardRefund(item) ? " via CC Avenue" : ""}
          </Badge>
        );
      }
      if (item.resolution === "KEPT") {
        return <Badge bg="secondary">Kept (no refund)</Badge>;
      }
      return <Badge bg="secondary">Resolved</Badge>;
    }
    return (
      <Badge bg="warning" text="dark">
        Pending
      </Badge>
    );
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-2 p-md-4" style={{ minWidth: 0 }}>
          <Card className="shadow-sm rounded-xl mb-3">
            <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <span className="fw-semibold">Refund Review</span>
                <span className="text-muted ms-2 small">
                  {counts.pending} pending
                  {counts.overdue > 0 && (
                    <>
                      {" · "}
                      <span className="text-danger fw-semibold">
                        {counts.overdue} overdue
                      </span>
                    </>
                  )}
                </span>
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <ButtonGroup size="sm">
                  {STATUS_TABS.map((t) => (
                    <Button
                      key={t.value}
                      variant={
                        status === t.value ? "primary" : "outline-primary"
                      }
                      onClick={() => setStatus(t.value)}
                      disabled={loading}
                    >
                      {t.label}
                    </Button>
                  ))}
                </ButtonGroup>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() => load(status)}
                  disabled={loading}
                >
                  <FaSyncAlt className="me-1" /> Refresh
                </Button>
              </div>
            </Card.Header>
            <Card.Body>
              <p className="text-muted small mb-3">
                Cancelled bookings whose refund Finance makes by hand, such
                as hotel bookings paid by card through CC Avenue. Finance
                resolves each within 2 working days (UAE weekend Sat–Sun).
              </p>

              {loadError && <Alert variant="danger">{loadError}</Alert>}

              {loading ? (
                <div className="text-center py-5">
                  <Spinner animation="border" size="sm" className="me-2" />
                  Loading…
                </div>
              ) : items.length === 0 ? (
                <div className="text-center text-muted py-5">
                  {status === "PENDING"
                    ? "Nothing waiting for review."
                    : "No reviews to show."}
                </div>
              ) : (
                <div className="table-responsive">
                  <Table hover size="sm" className="align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Booking</th>
                        <th>Module</th>
                        <th>Agent</th>
                        <th>Service</th>
                        <th className="text-end">Charged</th>
                        <th>Reason</th>
                        <th>Flagged</th>
                        <th>Age</th>
                        <th>Due by</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr
                          key={item.id}
                          className={
                            item.overdue && item.status !== "RESOLVED"
                              ? "table-danger"
                              : undefined
                          }
                        >
                          <td className="text-nowrap fw-semibold">
                            {item.bookingCode || item.bookingId || "—"}
                            {isCardRefund(item) && (
                              <div>
                                <Badge bg="info" text="dark" pill>
                                  Card refund
                                </Badge>
                              </div>
                            )}
                          </td>
                          <td className="text-nowrap">
                            {item.moduleLabel || item.module || "—"}
                          </td>
                          <td>
                            {item.agentName ||
                              (item.agentId ? `Agent ${item.agentId}` : "—")}
                          </td>
                          <td>{item.serviceName || "—"}</td>
                          <td className="text-end text-nowrap">
                            {money(item.charged)}
                            {isCardRefund(item) && (
                              <div className="small text-muted">
                                {hasValue(item.refundAmount)
                                  ? `refund ${money(item.refundAmount)}`
                                  : "refund: Finance decides"}
                              </div>
                            )}
                          </td>
                          <td style={{ minWidth: 220 }} className="small">
                            {isCardRefund(item) && (
                              <div className="mb-1">
                                Paid by card via{" "}
                                {item.paymentChannel || "CC Avenue"}
                                {item.paymentOrderId
                                  ? ` — order ${item.paymentOrderId}`
                                  : ""}
                              </div>
                            )}
                            {item.reason || "—"}
                            {item.status === "RESOLVED" &&
                              item.resolutionNote && (
                                <div className="text-muted mt-1">
                                  Note: {item.resolutionNote}
                                </div>
                              )}
                          </td>
                          <td className="text-nowrap small">
                            {formatDateTime(item.flaggedAt)}
                          </td>
                          <td className="text-nowrap small">
                            {workingDaysLabel(item.workingDaysOpen)}
                          </td>
                          <td className="text-nowrap small">
                            {formatDate(item.dueBy)}
                            {item.overdue && item.status !== "RESOLVED" && (
                              <Badge bg="danger" pill className="ms-1">
                                Overdue
                              </Badge>
                            )}
                          </td>
                          <td className="text-nowrap">
                            {statusBadge(item)}
                            {item.status === "RESOLVED" && item.resolvedBy && (
                              <div className="text-muted small">
                                by {item.resolvedBy}
                                {item.resolvedAt
                                  ? `, ${formatDateTime(item.resolvedAt)}`
                                  : ""}
                              </div>
                            )}
                          </td>
                          <td className="text-nowrap">
                            {item.status !== "RESOLVED" && (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => openResolve(item)}
                              >
                                Resolve
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </Card.Body>
          </Card>
        </main>
      </div>

      <Modal show={!!target} onHide={closeResolve} centered>
        <Modal.Header closeButton={!saving}>
          <Modal.Title className="fs-6">
            Resolve refund — {target?.bookingCode || target?.bookingId}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {target && (
            <>
              <div className="small text-muted mb-2">
                {target.moduleLabel || target.module}
                {target.serviceName ? ` · ${target.serviceName}` : ""}
                {" · "}charged {money(target.charged)}
              </div>
              {target.reason && (
                <div className="small mb-3">{target.reason}</div>
              )}
              {isCardRefund(target) && (
                <Alert variant="info" className="py-2 small">
                  Paid by card. Refund it in the{" "}
                  {target.paymentChannel || "CC Avenue"} dashboard
                  {target.paymentOrderId
                    ? ` (order ${target.paymentOrderId})`
                    : ""}{" "}
                  first — this only records it; no credit moves.
                  {hasValue(target.refundAmount) && (
                    <div className="mt-1">
                      Decided refund: <strong>{money(target.refundAmount)}</strong>
                    </div>
                  )}
                </Alert>
              )}
              <Form.Check
                type="radio"
                id="rr-refund"
                name="rr-action"
                label={
                  isCardRefund(target)
                    ? `Mark refunded via ${target.paymentChannel || "CC Avenue"}`
                    : "Refund to the agent's credit"
                }
                checked={action === "REFUND"}
                onChange={() => setAction("REFUND")}
                disabled={saving}
              />
              {action === "REFUND" && (
                <Form.Group className="ms-4 mt-2 mb-2">
                  <Form.Label className="small mb-1">
                    {isCardRefund(target) ? "Amount refunded" : "Amount"} (up
                    to {money(target.charged)})
                  </Form.Label>
                  <Form.Control
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={saving}
                  />
                </Form.Group>
              )}
              <Form.Check
                type="radio"
                id="rr-keep"
                name="rr-action"
                label="Keep (no refund)"
                checked={action === "KEEP"}
                onChange={() => setAction("KEEP")}
                disabled={saving}
                className="mt-2"
              />
              <Form.Group className="mt-3">
                <Form.Label className="small mb-1">Note (optional)</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Supplier invoice INV-55 charged 200"
                  disabled={saving}
                />
              </Form.Group>
              {formError && (
                <Alert variant="danger" className="mt-3 mb-0 py-2 small">
                  {formError}
                </Alert>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            onClick={closeResolve}
            disabled={saving}
          >
            Close
          </Button>
          <Button variant="primary" onClick={submitResolve} disabled={saving}>
            {saving && <Spinner animation="border" size="sm" className="me-1" />}
            {action === "REFUND"
              ? isCardRefund(target)
                ? "Mark refunded"
                : "Refund"
              : "Keep, no refund"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
