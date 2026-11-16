import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Form, Modal, Spinner, Table } from "react-bootstrap";
import toast from "react-hot-toast";
import axiosInstance from "../../../components/AxiosInstance";
import { ACM_API, REASONS, errorText, fmtDate, fmtNumber, providerLabel } from "./acmShared";

const REASON_TEXT = { ...Object.fromEntries(REASONS), NONE: "No reason yet (reopened, not checked again)" };

/** Reasons where the proposed supplier city is often a different place: flagged in the confirmation. */
const RISKY = {
  GEO_CONFLICT: "The hotel positions are far apart: usually a different place.",
  CODE_CONFLICT: "The state codes disagree.",
  AMBIGUOUS_SUPPLIER: "The engine picked one of several same-named supplier cities.",
  AMBIGUOUS_INHOUSE: "Several inhouse cities share the name.",
};

/** Why rows were skipped (CityAutoMappingReviewService.Outcome). */
const SKIP_TEXT = {
  SHARED_PROPOSAL: "Several listed cities propose one supplier city that can belong to one city only",
  NOT_WRITTEN: "Refused by the mapping checks (e.g. supplier city used by another city, no hotels, other country)",
  HAS_ROW: "The city already has a row for the supplier",
  REJECTED_EARLIER: "The pair was rejected earlier",
  PROPOSAL_CHANGED: "The proposed supplier city changed meanwhile",
  NOT_PENDING: "No longer waiting for verification",
  NO_PROPOSAL: "No proposed supplier city",
  GONE: "The row no longer exists",
  SAME_CITY_TWICE: "Same city and supplier twice",
  ANCHOR_CHANGED: "The supplier city no longer belongs to the city it was to be shared with (or its twin was not mapped)",
  NO_ANCHOR: "No city to share the supplier city with",
  NOT_PROCESSED: "Not processed",
};

const POLL_MS = 2000;

/**
 * "Approve all listed" on the Needs verification list. Confirms what the list's filters hold (by reason,
 * with reasons to leave out), starts the background job (POST /approve-all), follows its progress and
 * shows what was skipped and why. Closing the dialog does not stop the job; opening it again shows it.
 */
export default function ApproveAllDialog({ show, filters, onHide, onChanged, watchOnly = false }) {
  const [phase, setPhase] = useState("loading"); // loading | confirm | running | done
  const [preview, setPreview] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [note, setNote] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState(null);
  const notified = useRef(null); // job id whose completion was already passed to onChanged

  const filterKey = JSON.stringify(filters || {});

  // open: read what the filters hold, and whether a job is already running
  useEffect(() => {
    if (!show) return undefined;
    let cancelled = false;
    setPhase("loading");
    setPreview(null);
    setError(null);
    setAck(false);
    setNote("");
    (async () => {
      try {
        const f = JSON.parse(filterKey);
        const params = {};
        ["provider", "countryId", "reason", "q"].forEach((k) => {
          if (f[k] !== "" && f[k] !== null && f[k] !== undefined) params[k] = f[k];
        });
        const res = await axiosInstance.get(`${ACM_API}/approve-all/preview`, { params, timeout: 60000 });
        if (cancelled) return;
        const d = res.data || {};
        setPreview(d);
        setChosen((d.byReason || []).map((r) => r.reason));
        setJob(d.job || null);
        if (d.job?.running) {
          notified.current = null;
          setPhase("running");
        } else if (watchOnly) {
          // follow a job only: its result when it finished before the dialog opened, never the approve form
          setPhase(d.job && d.job.state !== "IDLE" ? "done" : "none");
        } else {
          setPhase("confirm");
        }
      } catch (err) {
        if (!cancelled) {
          setError(errorText(err, "The listed cities could not be counted."));
          setPhase("confirm");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [show, filterKey, watchOnly]);

  // follow a running job
  useEffect(() => {
    if (!show || phase !== "running") return undefined;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await axiosInstance.get(`${ACM_API}/approve-all/status`, { timeout: 20000 });
        if (stopped) return;
        const s = res.data || null;
        setJob(s);
        if (s && !s.running) setPhase("done");
      } catch {
        // a missed poll is retried on the next tick
      }
    };
    const id = setInterval(tick, POLL_MS);
    tick();
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [show, phase]);

  // a finished job changed the list: reload it once
  useEffect(() => {
    if (phase === "done" && job?.jobId && notified.current !== job.jobId) {
      notified.current = job.jobId;
      if (onChanged) onChanged();
    }
  }, [phase, job, onChanged]);

  const byReason = useMemo(() => preview?.byReason || [], [preview]);
  const selectedTotal = useMemo(
    () => byReason.filter((r) => chosen.includes(r.reason)).reduce((n, r) => n + Number(r.count || 0), 0),
    [byReason, chosen],
  );

  const toggleReason = (reason) => {
    setAck(false);
    setChosen((prev) => (prev.includes(reason) ? prev.filter((x) => x !== reason) : [...prev, reason]));
  };

  const start = async () => {
    if (!ack || selectedTotal < 1 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const f = filters || {};
      const res = await axiosInstance.post(`${ACM_API}/approve-all`, {
        provider: f.provider || null,
        countryId: f.countryId ?? null,
        reason: f.reason || null,
        q: f.q || null,
        reasons: chosen,
        note: note.trim() || null,
        expectedTotal: selectedTotal,
      }, { timeout: 60000 });
      notified.current = null;
      setJob(res.data || null);
      setPhase("running");
      toast.success("Approving in the background. You can close this window.");
    } catch (err) {
      setError(errorText(err, "The job could not be started."));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      const res = await axiosInstance.post(`${ACM_API}/approve-all/stop`);
      setJob(res.data || job);
      toast("Stopping after the current batch…");
    } catch (err) {
      toast.error(errorText(err, "The job could not be stopped."));
    } finally {
      setBusy(false);
    }
  };

  const f = filters || {};
  const filterText = [
    f.provider && `supplier ${providerLabel(f.provider)}`,
    f.countryLabel && `country ${f.countryLabel}`,
    f.reason && `reason "${REASON_TEXT[f.reason] || f.reason}"`,
    f.q && `search "${f.q}"`,
  ].filter(Boolean);

  const pct = job && job.total > 0 ? Math.min(100, Math.round((job.processed / job.total) * 100)) : 0;
  const lastJob = preview?.job && preview.job.state !== "IDLE" && !preview.job.running ? preview.job : null;

  return (
    <Modal show={show} onHide={busy ? undefined : onHide} size="lg" centered backdrop="static" className="acm-modal">
      <Modal.Header closeButton={!busy}>
        <Modal.Title as="h5">
          {(phase === "running" || phase === "done") && job?.title ? job.title : "Approve every listed city"}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="small py-2">{error}</Alert>}

        {phase === "loading" && (
          <div className="acm-muted"><Spinner animation="border" size="sm" className="me-2" />Counting the listed cities…</div>
        )}

        {phase === "none" && (
          <div className="acm-muted">No job is running, and none has run since the server started.</div>
        )}

        {phase === "confirm" && preview && (
          <>
            <div className="acm-dialog-head">
              <div>
                <div className="acm-label">Listed now</div>
                <div className="fw-semibold">{fmtNumber(preview.total)} cities</div>
              </div>
              <div className="flex-grow-1">
                <div className="acm-label">Filters of the list</div>
                <div>{filterText.length ? filterText.join(" · ") : "None: every city waiting for verification"}</div>
              </div>
            </div>

            {Number(preview.total) === 0 ? (
              <div className="acm-empty-sm">No listed city matches these filters.</div>
            ) : (
              <>
                <p className="small mb-2">
                  Each city is mapped to the supplier city shown in its row, with the same checks as <b>Approve mapping</b>. A city
                  that fails a check is not written and stays on the list. When several listed cities propose the same supplier city
                  of a supplier that gives a city to one inhouse city only, none of them is written. X3 rows may share one city.
                </p>
                <div className="acm-label mt-3">Include these reasons</div>
                <Table size="sm" className="acm-cand mb-2">
                  <thead>
                    <tr><th></th><th>Reason</th><th className="text-end">Cities</th></tr>
                  </thead>
                  <tbody>
                    {byReason.map((r) => (
                      <tr key={r.reason} onClick={() => !busy && toggleReason(r.reason)}>
                        <td style={{ width: 32 }}>
                          <Form.Check checked={chosen.includes(r.reason)} disabled={busy} onChange={() => toggleReason(r.reason)}
                            onClick={(e) => e.stopPropagation()} aria-label={REASON_TEXT[r.reason] || r.reason} />
                        </td>
                        <td>
                          <div>{REASON_TEXT[r.reason] || r.reason}</div>
                          {RISKY[r.reason] && <div className="acm-risk small">{RISKY[r.reason]}</div>}
                        </td>
                        <td className="text-end">{fmtNumber(r.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <div className="acm-muted small mb-3">
                  By supplier (all listed): {(preview.byProvider || []).map((p) => `${providerLabel(p.provider)} ${fmtNumber(p.count)}`).join(" · ")}
                </div>
                <Form.Group className="mb-3">
                  <Form.Label className="acm-label">Note (optional, kept in the audit log)</Form.Label>
                  <Form.Control size="sm" value={note} maxLength={500} disabled={busy} onChange={(e) => setNote(e.target.value)} />
                </Form.Group>
                <Form.Check id="acm-approve-all-ack" checked={ack} disabled={busy || selectedTotal < 1}
                  onChange={(e) => setAck(e.target.checked)}
                  label={`I understand that up to ${fmtNumber(selectedTotal)} mappings are written without reviewing them one by one.`} />
              </>
            )}
            {lastJob && (
              <div className="acm-muted small mt-3">
                Last run ({fmtDate(lastJob.finishedAt)}, {lastJob.startedBy}): {lastJob.state.toLowerCase()}, {fmtNumber(lastJob.approved)} approved,{" "}
                {fmtNumber(lastJob.skipped)} skipped, {fmtNumber(lastJob.notReached)} not reached.
              </div>
            )}
          </>
        )}

        {(phase === "running" || phase === "done") && job && (
          <>
            <div className="acm-dialog-head">
              <div>
                <div className="acm-label">Status</div>
                <div className="fw-semibold">
                  {job.running ? (job.stopRequested ? "Stopping…" : "Running") : { COMPLETED: "Completed", STOPPED: "Stopped", FAILED: "Failed" }[job.state] || job.state}
                </div>
              </div>
              <div>
                <div className="acm-label">Started</div>
                <div>{fmtDate(job.startedAt)} · {job.startedBy}</div>
              </div>
              <div className="flex-grow-1">
                <div className="acm-label">Selection</div>
                <div className="small">{job.filter}</div>
              </div>
            </div>
            <div className="acm-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${pct}%` }}></span>
            </div>
            <div className="d-flex flex-wrap justify-content-between small mb-3">
              <span>
                {fmtNumber(job.processed)} of {fmtNumber(job.total)} checked · <b>{fmtNumber(job.approved)}</b> mapped ·{" "}
                {job.rejected > 0 && <>{fmtNumber(job.rejected)} rejected · </>}
                {fmtNumber(job.skipped)} skipped
                {!job.running && job.notReached > 0 && <> · {fmtNumber(job.notReached)} not reached</>}
              </span>
              {job.running && job.currentProvider && <span className="acm-muted">now: {providerLabel(job.currentProvider)}</span>}
            </div>
            {job.message && (
              <Alert variant={job.state === "FAILED" ? "danger" : job.state === "STOPPED" ? "warning" : "secondary"} className="small py-2">
                {job.message}
              </Alert>
            )}
            {Object.keys(job.approvedByProvider || {}).length > 0 && (
              <div className="acm-muted small mb-2">
                Approved by supplier: {Object.entries(job.approvedByProvider).map(([p, n]) => `${providerLabel(p)} ${fmtNumber(n)}`).join(" · ")}
              </div>
            )}
            {Object.keys(job.skippedByCode || {}).length > 0 && (
              <>
                <div className="acm-label mt-3">Skipped (still on the list)</div>
                <Table size="sm" className="acm-cand mb-2">
                  <tbody>
                    {Object.entries(job.skippedByCode).sort((a, b) => b[1] - a[1]).map(([code, n]) => (
                      <tr key={code}>
                        <td>
                          <details>
                            <summary>{SKIP_TEXT[code] || code}</summary>
                            <ul className="acm-skip-list">
                              {(job.skippedSamples || []).filter((s) => s.code === code).map((s) => (
                                <li key={s.resultId}>
                                  <b>{s.cityName || `#${s.resultId}`}</b> → {s.supplierCityName || s.supplierCityId || "—"}{" "}
                                  <span className="acm-muted">({providerLabel(s.provider)})</span>
                                  <div className="acm-muted">{s.reason}</div>
                                </li>
                              ))}
                            </ul>
                          </details>
                        </td>
                        <td className="text-end" style={{ width: 90 }}>{fmtNumber(n)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <div className="acm-muted small">Examples show up to 25 cities per reason.</div>
              </>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer className="justify-content-between">
        <div>
          {phase === "running" && job?.running && (
            <Button variant="outline-danger" size="sm" onClick={stop} disabled={busy || job.stopRequested}>
              {job.stopRequested ? "Stopping…" : "Stop after this batch"}
            </Button>
          )}
        </div>
        <div className="d-flex gap-2">
          <Button variant="light" size="sm" onClick={onHide} disabled={busy}>
            {phase === "running" ? "Close (keeps running)" : "Close"}
          </Button>
          {phase === "confirm" && preview && Number(preview.total) > 0 && (
            <Button variant="primary" size="sm" onClick={start} disabled={busy || !ack || selectedTotal < 1}>
              {busy ? <Spinner animation="border" size="sm" /> : `Approve ${fmtNumber(selectedTotal)} cities`}
            </Button>
          )}
        </div>
      </Modal.Footer>
    </Modal>
  );
}
