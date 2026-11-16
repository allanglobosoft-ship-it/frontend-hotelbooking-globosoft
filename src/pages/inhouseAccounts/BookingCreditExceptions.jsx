import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Form,
  Modal,
  Spinner,
  Table,
} from "react-bootstrap";
import { Link } from "react-router-dom";
import { FaSyncAlt } from "react-icons/fa";
import { toast } from "react-hot-toast";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { formatDateTime } from "../../utils/dateUtils";

/**
 * Inhouse Accounts → Credit Exceptions. Admin only. The one write here marks a
 * row whose local booking was lost as handled. That records who, when and a
 * note on the row, so this page still cannot move credit or change a booking.
 *
 * Amounts are what the agent should be charged (always AED on the backend).
 * The supplier's cost is deliberately not part of either list.
 */

const BOOKING_PATH = "/booking-details/hotel-booking";

// findUnchargedBookings on the backend stops at this many rows, newest first.
const UNCHARGED_LIMIT = 500;

// BookingCreditException.HANDLED_NOTE_LENGTH on the backend.
const NOTE_LIMIT = 1000;

const money = (v) => {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return "-";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const orDash = (v) => (v === null || v === undefined || v === "" ? "-" : v);

/**
 * Loads one list. A failed load stays apart from an empty result: here an
 * empty list means "nothing to chase", so a failure must never read like that.
 */
const useList = (url, reloadKey) => {
  const [list, setList] = useState({ status: "loading", rows: [] });

  useEffect(() => {
    let stale = false;
    setList({ status: "loading", rows: [] });
    axiosInstance
      .get(url)
      .then((res) => {
        if (stale) return;
        setList(
          Array.isArray(res.data)
            ? { status: "ready", rows: res.data }
            : { status: "failed", rows: [] }
        );
      })
      .catch((err) => {
        if (stale) return;
        setList({
          status: err.response?.status === 403 ? "forbidden" : "failed",
          rows: [],
        });
      });
    return () => {
      stale = true;
    };
  }, [url, reloadKey]);

  return list;
};

const ListBody = ({ list, emptyText, onRetry, children }) => {
  if (list.status === "loading") {
    return (
      <div className="text-center text-muted py-4">
        <Spinner animation="border" size="sm" className="me-2" />
        Loading…
      </div>
    );
  }
  if (list.status === "forbidden") {
    return (
      <Alert variant="warning" className="m-3">
        Only admins can see this list.
      </Alert>
    );
  }
  if (list.status === "failed") {
    return (
      <Alert
        variant="danger"
        className="m-3 d-flex justify-content-between align-items-center flex-wrap gap-2"
      >
        <span>This list could not be loaded, so it may not be empty.</span>
        <Button size="sm" variant="outline-danger" onClick={onRetry}>
          Try again
        </Button>
      </Alert>
    );
  }
  if (list.rows.length === 0) {
    return <p className="text-center text-muted py-4 mb-0">{emptyText}</p>;
  }
  return children;
};

const RowCount = ({ list }) =>
  list.status === "ready" ? (
    <Badge bg="secondary" className="ms-2">
      {list.rows.length}
    </Badge>
  ) : null;

// The booking is linked while it exists. Once it is lost the supplier
// reference is the only way left to find it, so the row says so.
const ExceptionBooking = ({ row }) => {
  if (row.bookingFound) {
    return (
      <Link to={`${BOOKING_PATH}/${row.bookingId}`}>
        {row.bookingCode || `#${row.bookingId}`}
      </Link>
    );
  }
  const formerly = row.bookingCode || (row.bookingId ? `#${row.bookingId}` : "");
  return (
    <>
      <Badge bg="danger">Local booking lost</Badge>
      <div className="small text-muted mt-1">
        {formerly && `Was ${formerly}. `}
        {row.supplierReference
          ? "Find it at the supplier with the reference."
          : "No supplier reference was recorded."}
      </div>
    </>
  );
};

const ExceptionState = ({ row, onMarkHandled }) => {
  let badge = <Badge bg="success">Cleared</Badge>;
  if (row.outstanding) {
    badge = (
      <Badge bg="warning" text="dark">
        Outstanding
      </Badge>
    );
  } else if (!row.bookingFound) {
    badge = <Badge bg="secondary">Handled</Badge>;
  }
  return (
    <div style={{ minWidth: "11rem" }}>
      {badge}
      {row.outstanding && !row.bookingFound && (
        <div className="mt-2">
          <Button
            size="sm"
            variant="outline-primary"
            className="text-nowrap"
            onClick={() => onMarkHandled(row)}
          >
            Mark as handled
          </Button>
        </div>
      )}
      {row.handledAt && (
        <div className="small text-muted mt-1">
          <div>
            Handled by {orDash(row.handledBy)} on{" "}
            {formatDateTime(row.handledAt)}
          </div>
          <div style={{ whiteSpace: "pre-line" }}>{row.handledNote}</div>
        </div>
      )}
    </div>
  );
};

const MarkHandledModal = ({ row, onClose, onChanged }) => {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const trimmedNote = note.trim();

  const submit = async (event) => {
    event.preventDefault();
    if (!trimmedNote || saving) return;
    setSaving(true);
    setError("");
    try {
      await axiosInstance.post(
        `/api/booking-credit-exceptions/${row.id}/mark-handled`,
        { note: trimmedNote }
      );
      toast.success("Marked as handled.");
      onChanged();
      onClose();
    } catch (err) {
      // A 409 (handled by someone else, or its booking reappeared) or a 404
      // (row gone) means the list behind this dialog is out of date.
      if (err.response?.status === 409 || err.response?.status === 404) {
        onChanged();
      }
      setError(
        err.response?.status === 403
          ? "Only admins can do this."
          : err.response?.data?.message ||
              "This could not be saved. Please try again."
      );
      setSaving(false);
    }
  };

  return (
    <Modal show centered onHide={() => !saving && onClose()}>
      <Form onSubmit={submit}>
        <Modal.Header closeButton>
          <Modal.Title as="h5">Mark as handled</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <dl className="row small mb-3">
            <dt className="col-5">Was booking</dt>
            <dd className="col-7 mb-1">
              {row.bookingCode || (row.bookingId ? `#${row.bookingId}` : "-")}
            </dd>
            <dt className="col-5">Supplier</dt>
            <dd className="col-7 mb-1">{orDash(row.supplier)}</dd>
            <dt className="col-5">Supplier reference</dt>
            <dd className="col-7 mb-1">
              {row.supplierReference || "Not recorded"}
            </dd>
            <dt className="col-5">Amount (AED)</dt>
            <dd className="col-7 mb-0">{money(row.amount)}</dd>
          </dl>
          <p className="small">
            Do this once finance has dealt with the booking at the supplier. It
            saves your name, the time and your note, and takes the row off the
            outstanding list. It does not cancel anything at the supplier,
            charge the agent or change any credit, and it cannot be undone.
          </p>
          <Form.Group controlId="credit-exception-handled-note">
            <Form.Label className="fw-semibold">
              How was this dealt with?
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              maxLength={NOTE_LIMIT}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={saving}
              autoFocus
            />
          </Form.Group>
          {error && (
            <Alert variant="danger" className="mt-3 mb-0">
              {error}
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={!trimmedNote || saving}>
            {saving ? "Saving…" : "Mark as handled"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default function BookingCreditExceptions() {
  const [showHistory, setShowHistory] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [markingRow, setMarkingRow] = useState(null);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const exceptions = useList(
    `/api/booking-credit-exceptions?outstandingOnly=${!showHistory}`,
    reloadKey
  );
  const uncharged = useList(
    "/api/booking-credit-exceptions/uncharged-bookings",
    reloadKey
  );

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4" style={{ minWidth: 0 }}>
          <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
            <div>
              <h2 className="fw-bold mb-1">Credit Exceptions</h2>
              <p className="text-muted mb-0">
                Nothing on this page moves credit or changes a booking.
              </p>
            </div>
            <Button size="sm" variant="outline-secondary" onClick={reload}>
              <FaSyncAlt className="me-1" /> Refresh
            </Button>
          </div>

          {/* ── Supplier-confirmed, agent not charged ─────────────── */}
          <Card className="shadow-sm rounded-xl mb-4">
            <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <span className="fw-semibold">
                  Confirmed at the supplier, agent not charged
                </span>
                <RowCount list={exceptions} />
              </div>
              <Form.Check
                type="switch"
                id="credit-exceptions-show-history"
                label="Show full history"
                checked={showHistory}
                onChange={(e) => setShowHistory(e.target.checked)}
              />
            </Card.Header>
            <Card.Body className="p-0">
              <p className="text-muted small px-3 pt-3 mb-3">
                The supplier has these bookings, but the agent's credit could
                not be charged. A row clears by itself once its booking is
                charged, paid online or cancelled. A row whose local booking was
                lost has no booking left to clear it, so it stays here until an
                admin marks it as handled.
              </p>
              <ListBody
                list={exceptions}
                onRetry={reload}
                emptyText={
                  showHistory
                    ? "No credit exceptions have been recorded."
                    : "No outstanding credit exceptions."
                }
              >
                <Table responsive hover striped className="mb-0 align-middle">
                  <thead>
                    <tr>
                      <th>Recorded</th>
                      <th>Booking</th>
                      <th>Agent ID</th>
                      <th>Supplier</th>
                      <th>Supplier reference</th>
                      <th className="text-end">Amount (AED)</th>
                      <th>Reason</th>
                      <th>Booking status</th>
                      <th className="text-end">Credit charged (AED)</th>
                      <th>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exceptions.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="text-nowrap">
                          {formatDateTime(row.createdAt)}
                        </td>
                        <td>
                          <ExceptionBooking row={row} />
                        </td>
                        <td>{orDash(row.agentId)}</td>
                        <td>{orDash(row.supplier)}</td>
                        <td className={row.bookingFound ? "" : "fw-bold"}>
                          {row.supplierReference ||
                            (row.bookingFound ? "-" : "Not recorded")}
                        </td>
                        <td className="text-end">{money(row.amount)}</td>
                        <td>{orDash(row.reason)}</td>
                        <td>{orDash(row.bookingStatus)}</td>
                        <td className="text-end">{money(row.creditCharged)}</td>
                        <td>
                          <ExceptionState
                            row={row}
                            onMarkHandled={setMarkingRow}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </ListBody>
            </Card.Body>
          </Card>

          {/* ── Final bookings with no sign of a charge ───────────── */}
          <Card className="shadow-sm rounded-xl">
            <Card.Header>
              <span className="fw-semibold">Bookings to check</span>
              <RowCount list={uncharged} />
            </Card.Header>
            <Card.Body className="p-0">
              <p className="text-muted small px-3 pt-3 mb-3">
                These bookings look final (reconfirmed or voucher issued), but
                nothing is charged on the booking and the agent's ledger has no
                line for it. Each one is something to check, not a proven loss.
                Bookings paid by card and bookings inside a package are left
                out.
              </p>
              <ListBody
                list={uncharged}
                onRetry={reload}
                emptyText="No bookings to check."
              >
                <Table responsive hover striped className="mb-0 align-middle">
                  <thead>
                    <tr>
                      <th>Created</th>
                      <th>Booking</th>
                      <th>Agent ID</th>
                      <th>API</th>
                      <th className="text-end">Total rate (AED)</th>
                      <th>Payment mode</th>
                      <th>Booking status</th>
                      <th>Voucher</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uncharged.rows.map((row) => (
                      <tr key={row.bookingId}>
                        <td className="text-nowrap">
                          {formatDateTime(row.createdAt)}
                        </td>
                        <td>
                          <Link to={`${BOOKING_PATH}/${row.bookingId}`}>
                            {row.bookingCode || `#${row.bookingId}`}
                          </Link>
                        </td>
                        <td>{orDash(row.agentId)}</td>
                        <td>{orDash(row.apiId)}</td>
                        <td className="text-end">{money(row.totalRate)}</td>
                        <td>{orDash(row.paymentMode)}</td>
                        <td>{orDash(row.bookingStatus)}</td>
                        <td>{orDash(row.voucherGenerated)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {uncharged.rows.length >= UNCHARGED_LIMIT && (
                  <p className="small text-muted p-3 mb-0 border-top">
                    Showing the newest {UNCHARGED_LIMIT} only. There may be more.
                  </p>
                )}
              </ListBody>
            </Card.Body>
          </Card>
        </main>
      </div>
      {markingRow && (
        <MarkHandledModal
          row={markingRow}
          onClose={() => setMarkingRow(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}
