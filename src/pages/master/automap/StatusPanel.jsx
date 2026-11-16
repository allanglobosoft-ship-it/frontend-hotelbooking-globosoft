import React, { useState } from "react";
import { Badge, Button, OverlayTrigger, ProgressBar, Spinner, Table, Tooltip } from "react-bootstrap";
import toast from "react-hot-toast";
import axiosInstance from "../../../components/AxiosInstance";
import { fmtDateTime, fmtNumber, fmtPercent, fmtTime, statusMeta } from "./automapFormat";

/**
 * "Status" tab of the Automated Mapping popup: live state banner, load
 * meter, progress tiles, per-supplier health and the engine's settings.
 * Everything shown comes from GET /api/hotel-mapping/auto/status.
 */
export default function StatusPanel({ status, lastFetchedAt, onRescan, rescanning, canAct, onRefresh }) {
  if (!status) return null;
  const meta = statusMeta(status.status);
  const threshold = status.loadThresholdPercent ?? 70;
  const load = status.systemLoadPercent;
  const loadKnown = load !== null && load !== undefined;
  const processedPct =
    status.totalCount > 0 ? Math.min(100, Math.round((status.processedCount / status.totalCount) * 100)) : 0;
  const isRunning = status.status === "RUNNING";
  const isPaused = status.status === "PAUSED_HIGH_SYSTEM_LOAD";

  return (
    <div className="d-flex flex-column gap-3">
      {/* ---- banner ---- */}
      <div className={`ahm-banner tone-${meta.tone}`} role="status" aria-live="polite">
        <span className="ahm-banner-icon">
          <i className={meta.icon} aria-hidden="true"></i>
        </span>
        <div className="flex-grow-1">
          <h6>
            Automated Mapping: {meta.label}
            {isRunning && (
              <span className="ms-2 fw-normal text-success small">
                <Spinner animation="border" size="sm" className="me-1" role="presentation" />
                Mapping hotels in background…
              </span>
            )}
          </h6>
          <p>{status.reason || meta.headline}</p>
          {isPaused && (
            <p className="mt-1 small">
              Current system load: <strong>{fmtPercent(load)}</strong> · Required: <strong>below {threshold}%</strong>.
              The mapping process will automatically resume when the load stays below {threshold}%.
            </p>
          )}
          {status.status === "ERROR" && status.lastError && (
            <p className="mt-1 small text-danger">
              <i className="fas fa-bug me-1" aria-hidden="true"></i>
              {status.lastError} {status.lastErrorAt ? `(${fmtDateTime(status.lastErrorAt)})` : ""}
            </p>
          )}
        </div>
        <div className="text-end small text-muted" style={{ minWidth: 150 }}>
          <div>Last updated</div>
          <div className="fw-semibold text-dark">{fmtTime(status.lastUpdatedAt || lastFetchedAt)}</div>
        </div>
      </div>

      {/* ---- load meter ---- */}
      <div className="ahm-panel p-3">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="fw-bold small text-uppercase text-muted">System load</div>
          <div className="small">
            CPU <strong>{loadKnown ? fmtPercent(load) : "n/a"}</strong>
            {status.memoryUsedPercent !== null && status.memoryUsedPercent !== undefined && (
              <span className="text-muted"> · JVM heap {fmtPercent(status.memoryUsedPercent)}</span>
            )}
          </div>
        </div>
        <div className="ahm-load mt-3">
          <ProgressBar
            now={loadKnown ? Math.max(0, Math.min(100, load)) : 0}
            variant={!loadKnown ? "secondary" : load >= threshold ? "danger" : load >= threshold - 10 ? "warning" : "success"}
            aria-label="System CPU load"
          />
          <span className="ahm-threshold" style={{ left: `${threshold}%` }} data-label={`pause ≥ ${threshold}%`}></span>
        </div>
        <div className="small text-muted mt-2">
          Whole-machine CPU utilisation (JDK OperatingSystemMXBean). The engine pauses at {threshold}% or above and
          resumes after {status.config?.resumeStableSamples ?? 3} consecutive readings below it.
        </div>
      </div>

      {/* ---- progress tiles ---- */}
      <div>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="fw-bold small text-uppercase text-muted">Progress</div>
          <div className="small text-muted">
            {fmtNumber(status.processedCount)} / {fmtNumber(status.totalCount)} hotels processed ({processedPct}%)
          </div>
        </div>
        <ProgressBar now={processedPct} variant="success" style={{ height: 8 }} className="mb-3" aria-label="Hotels processed" />
        <div className="ahm-tiles">
          <Tile label="Hotels processed" value={`${fmtNumber(status.processedCount)} / ${fmtNumber(status.totalCount)}`} />
          <Tile label="Automatically mapped" value={fmtNumber(status.autoMappedCount)} sub={`${fmtNumber(status.automatedMappingsTotal)} supplier links`} accent />
          <Tile label="Manual review required" value={fmtNumber(status.manualReviewCount)} sub="hotels with pending candidates" />
          <Tile label="No match" value={fmtNumber(status.noMatchCount)} />
          <Tile label="Failed" value={fmtNumber(status.failedCount)} sub="retried automatically" />
          <Tile label="Pending" value={fmtNumber(status.pendingCount)} sub={status.processingCount ? `${fmtNumber(status.processingCount)} in progress` : "queued"} />
          <Tile label="Manual links" value={fmtNumber(status.manualMappingsTotal)} sub="operator decisions" />
          <Tile label="Links this run" value={fmtNumber(status.mappingsCreatedCount)} sub={`run #${fmtNumber(status.runNumber)}`} />
        </div>
      </div>

      {/* ---- current activity + timestamps ---- */}
      <div className="row g-3">
        <div className="col-md-6">
          <div className="ahm-panel h-100">
            <div className="ahm-panel-head">Current activity</div>
            <div className="p-3 small">
              <Row2 label="Current supplier" value={status.currentSupplier || "—"} />
              <Row2 label="Current batch" value={status.currentBatch ? `#${status.currentBatch}` : "—"} />
              <Row2
                label="Current hotel"
                value={status.currentHotelId ? `${status.currentHotelName || ""} (ID ${status.currentHotelId})` : "—"}
              />
              <Row2 label="Driving instance" value={status.leaseOwner || "—"} hint={status.thisInstanceIsLeader ? "this server" : undefined} />
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="ahm-panel h-100">
            <div className="ahm-panel-head">Timeline</div>
            <div className="p-3 small">
              <Row2 label="Last started" value={fmtDateTime(status.lastStartedAt)} />
              <Row2 label="Last completed" value={fmtDateTime(status.lastCompletedAt)} />
              <Row2 label="Last rescan" value={fmtDateTime(status.lastRescanAt)} />
              <Row2 label="Last status update" value={fmtDateTime(status.lastUpdatedAt)} />
            </div>
          </div>
        </div>
      </div>

      {/* ---- suppliers ---- */}
      <div className="ahm-panel">
        <div className="ahm-panel-head">
          <span>Suppliers / APIs</span>
          <span className="text-muted fw-normal small">{(status.suppliers || []).length} configured</span>
        </div>
        <Table responsive hover className="ahm-table">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>State</th>
              <th className="text-end">Catalog hotels</th>
              <th className="text-end">Mapped hotels</th>
              <th className="text-end">Pending review</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {(status.suppliers || []).map((s) => (
              <tr key={s.code}>
                <td>
                  <span className="fw-semibold">{s.displayName || s.code}</span>
                  <span className="text-muted ms-1 small">({s.code})</span>
                </td>
                <td>
                  {!s.enabled ? (
                    <Badge bg="secondary">Not active</Badge>
                  ) : s.available ? (
                    <Badge bg="success">Available</Badge>
                  ) : (
                    <Badge bg="warning" text="dark">
                      Temporarily unavailable
                    </Badge>
                  )}
                </td>
                <td className="text-end">
                  {fmtNumber(s.catalogSize)}
                  {s.catalogCheckedAt && (
                    <div className="text-muted" style={{ fontSize: ".7rem" }}>
                      checked {fmtTime(s.catalogCheckedAt)}
                    </div>
                  )}
                  {s.catalogChangedAt && (
                    <div
                      className="text-success"
                      style={{ fontSize: ".7rem" }}
                      title="New or changed catalog rows were detected; hotels still lacking this supplier were re-queued"
                    >
                      new rows {fmtTime(s.catalogChangedAt)}
                      {s.lastChangeRequeued !== null && s.lastChangeRequeued !== undefined
                        ? ` · ${fmtNumber(s.lastChangeRequeued)} re-queued`
                        : ""}
                    </div>
                  )}
                </td>
                <td className="text-end">{fmtNumber(s.mappedHotels)}</td>
                <td className="text-end">{fmtNumber(s.pendingCandidates)}</td>
                <td className="small text-muted" style={{ maxWidth: 360 }}>
                  {s.reason || (s.lastError ? `Last error: ${s.lastError}` : "—")}
                  {s.unavailableUntil && !s.available && <div>Retry after {fmtTime(s.unavailableUntil)}</div>}
                </td>
              </tr>
            ))}
            {(status.suppliers || []).length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-3">
                  No supplier catalog sources are registered.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>

      {/* ---- supplier catalog pull ---- */}
      <CatalogSyncPanel sync={status.catalogSync} canAct={canAct} onStarted={onRefresh} />

      {/* ---- supplier-to-supplier matching ---- */}
      <SupplierMatchPanel match={status.supplierMatch} canAct={canAct} onStarted={onRefresh} />

      {/* ---- settings + actions ---- */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div className="small text-muted">
          Only <strong>100%</strong> matches are mapped automatically · minimum suppliers:{" "}
          <strong>{status.config?.minMatchedSuppliers ?? 2}</strong> · max distance:{" "}
          <strong>{status.config?.geoMaxDistanceMeters ?? 300} m</strong> · batch:{" "}
          <strong>{status.config?.batchSize ?? 100}</strong> · workers: <strong>{status.config?.maxWorkers ?? 2}</strong>{" "}
          · poll: <strong>{status.config?.pollIntervalSeconds ?? 30} s</strong>
          {status.config?.rescanIntervalHours ? (
            <>
              {" "}· rescan every <strong>{status.config.rescanIntervalHours} h</strong>
            </>
          ) : null}
        </div>
        {canAct && (
          <OverlayTrigger
            placement="top"
            overlay={<Tooltip id="ahm-rescan-tip">Queue every hotel for a fresh pass (picks up refreshed supplier catalogs).</Tooltip>}
          >
            <span>
              <Button size="sm" variant="outline-primary" onClick={onRescan} disabled={rescanning || !status.enabled}>
                {rescanning ? <Spinner animation="border" size="sm" className="me-1" /> : <i className="fas fa-redo me-1" aria-hidden="true"></i>}
                Re-run full scan
              </Button>
            </span>
          </OverlayTrigger>
        )}
      </div>
    </div>
  );
}

const SYNC_LABELS = {
  RUNNING: ["Running", "success"],
  PAUSED_HIGH_SYSTEM_LOAD: ["Paused — High System Load", "warning"],
  COMPLETED: ["Completed", "success"],
  ERROR: ["Error", "danger"],
  DISABLED: ["Disabled", "secondary"],
  IDLE: ["Idle", "secondary"],
};

/**
 * "Supplier catalog pull": the engine fetching hotels from the supplier APIs
 * into the local catalog tables (insert-only) and handing new rows to the
 * mapper. Backed by the `catalogSync` block of the status response.
 */
function CatalogSyncPanel({ sync, canAct, onStarted }) {
  const [starting, setStarting] = useState(false);
  if (!sync) return null;
  const [label, tone] = SYNC_LABELS[sync.state] || [sync.state || "Unknown", "secondary"];

  const start = async () => {
    setStarting(true);
    try {
      const res = await axiosInstance.post("/api/hotel-mapping/auto/sync", null, { timeout: 30000 });
      toast.success(res.data?.message || "Catalog pull started.");
      if (onStarted) onStarted();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || "The catalog pull could not be started.");
    } finally {
      setStarting(false);
    }
  };

  const supplierState = (s) => {
    if (!s.supported) return <Badge bg="secondary" title={s.reason || ""}>Unavailable</Badge>;
    if (!s.enabled) return <Badge bg="secondary" title={s.reason || ""}>Not active</Badge>;
    if (s.failed > 0 || s.failedRows > 0) return <Badge bg="warning" text="dark">Issues</Badge>;
    if (s.lastRunAt && s.fetched === 0) return <Badge bg="light" text="dark" title={s.lastNote || ""}>Nothing received</Badge>;
    if (s.lastRunAt) return <Badge bg="success">OK</Badge>;
    return <Badge bg="light" text="dark">Pending</Badge>;
  };

  const worldwide = sync.scope === "WORLDWIDE";

  return (
    <div className="ahm-panel">
      <div className="ahm-panel-head">
        <span className="d-flex align-items-center gap-2 flex-wrap">
          Supplier catalog pull
          <Badge bg={tone} text={tone === "warning" ? "dark" : undefined}>{label}</Badge>
          <Badge bg="light" text="dark" title={worldwide ? "Our cities every run, plus the suppliers' whole worldwide catalogs in slices" : "Only the countries / cities where we have in-house hotels"}>
            {worldwide ? "Worldwide" : "Our cities only"}
          </Badge>
          {sync.running && <Spinner animation="border" size="sm" role="status" aria-label="Catalog pull running" />}
        </span>
        {canAct && (
          <OverlayTrigger
            placement="top"
            overlay={
              <Tooltip id="ahm-sync-tip">
                {worldwide
                  ? "Fetch hotels from every supplier API — our cities first, then the next slice of the worldwide catalogs — add the ones missing locally, and match them."
                  : "Fetch hotels from every supplier API for the cities where we have hotels, add the ones missing locally, and match them straight away."}
              </Tooltip>
            }
          >
            <span>
              <Button size="sm" variant="outline-primary" onClick={start} disabled={starting || sync.running || !sync.enabled}>
                {starting ? <Spinner animation="border" size="sm" className="me-1" /> : <i className="fas fa-cloud-download-alt me-1" aria-hidden="true"></i>}
                Sync catalogs now
              </Button>
            </span>
          </OverlayTrigger>
        )}
      </div>
      <div className="p-3 small">
        <p className="mb-2">{sync.message || "No pull has run yet."}</p>
        {sync.lastError && sync.state === "ERROR" && (
          <p className="text-danger mb-2">
            <i className="fas fa-bug me-1" aria-hidden="true"></i>
            {sync.lastError}
          </p>
        )}
        <div className="row g-2 mb-2">
          <div className="col-md-3">
            <Row2 label="Last started" value={fmtDateTime(sync.startedAt)} />
          </div>
          <div className="col-md-3">
            <Row2 label="Finished" value={fmtDateTime(sync.finishedAt)} />
          </div>
          <div className="col-md-3">
            <Row2
              label="Next scheduled"
              value={sync.enabled ? fmtDateTime(sync.nextRunAt) : "disabled"}
              hint={sync.enabled ? (sync.backlogTotal > 0 ? "next worldwide slice" : `every ${Math.round((sync.intervalMinutes || 1440) / 60)} h`) : undefined}
            />
          </div>
          <div className="col-md-3">
            <Row2 label="Now pulling" value={sync.currentSupplier ? `${sync.currentSupplier} · ${sync.currentScope || ""}` : "—"} />
          </div>
        </div>
        <div className="d-flex flex-wrap gap-3 mb-2 text-muted">
          <span>Received <strong className="text-dark">{fmtNumber(sync.totalFetched)}</strong></span>
          <span>Added <strong className="text-success">{fmtNumber(sync.totalInserted)}</strong></span>
          <span>Already in DB <strong className="text-dark">{fmtNumber(sync.totalExisting)}</strong></span>
          <span>Refreshed <strong className="text-dark">{fmtNumber(sync.totalUpdated)}</strong></span>
          <span>Write errors <strong className={sync.totalFailedRows > 0 ? "text-danger" : "text-dark"}>{fmtNumber(sync.totalFailedRows)}</strong></span>
          <span>Failed scopes <strong className={sync.totalFailedScopes > 0 ? "text-danger" : "text-dark"}>{fmtNumber(sync.totalFailedScopes)}</strong></span>
          {worldwide && (
            <span title={`Worldwide countries / cities still due; each is pulled again after ${sync.scopeRefreshHours || 168} h`}>
              Worldwide backlog <strong className="text-dark">{fmtNumber(sync.backlogTotal)}</strong>
            </span>
          )}
        </div>
        <div className="text-muted" style={{ fontSize: ".75rem" }}>
          Every received hotel is counted once: Added (new row written), Already in DB (same supplier id was present and
          left untouched) or Write error (the database refused the row; the first error is shown in the Note column).
        </div>
      </div>
      <Table responsive hover className="ahm-table">
        <thead>
          <tr>
            <th>Supplier</th>
            <th>State</th>
            <th className="text-end">Scopes</th>
            <th className="text-end">Received</th>
            <th className="text-end">Added</th>
            <th className="text-end">Already in DB</th>
            <th className="text-end">Refreshed</th>
            <th className="text-end">Write errors</th>
            <th className="text-end">Failed scopes</th>
            <th>Last run</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {(sync.suppliers || []).map((s) => (
            <tr key={s.code}>
              <td>
                <span className="fw-semibold">{s.displayName || s.code}</span>
                <span className="text-muted ms-1 small">({s.code})</span>
              </td>
              <td>{supplierState(s)}</td>
              <td className="text-end">
                {s.supported && s.enabled ? `${fmtNumber(s.scopesDone)} / ${fmtNumber(s.scopesTotal)}` : "—"}
                {s.supported && s.enabled && s.backgroundTotal > 0 && (
                  <div
                    className="text-muted"
                    style={{ fontSize: ".7rem" }}
                    title={`${fmtNumber(s.backgroundTotal)} worldwide scopes in total · ${fmtNumber(s.skippedFresh)} pulled recently · ${fmtNumber(s.backlog)} left for the next slice`}
                  >
                    world {fmtNumber(s.backgroundTotal)} · due later {fmtNumber(s.backlog)}
                  </div>
                )}
              </td>
              <td className="text-end">{fmtNumber(s.fetched)}</td>
              <td className={`text-end${s.inserted > 0 ? " text-success fw-semibold" : ""}`}>{fmtNumber(s.inserted)}</td>
              <td className="text-end">{fmtNumber(s.existing)}</td>
              <td className="text-end">{fmtNumber(s.updated)}</td>
              <td className={`text-end${s.failedRows > 0 ? " text-danger fw-semibold" : ""}`}>{fmtNumber(s.failedRows)}</td>
              <td className={`text-end${s.failed > 0 ? " text-danger fw-semibold" : ""}`}>{fmtNumber(s.failed)}</td>
              <td className="small text-muted text-nowrap">{fmtDateTime(s.lastRunAt)}</td>
              <td className="small text-muted" style={{ maxWidth: 420 }}>
                {s.lastError ? <span className="text-danger">{s.lastError}</span> : s.lastNote || s.reason || "—"}
              </td>
            </tr>
          ))}
          {(sync.suppliers || []).length === 0 && (
            <tr>
              <td colSpan={11} className="text-center text-muted py-3">
                No supplier catalog pullers are registered.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}

const MATCH_LABELS = {
  INDEXING: ["Indexing catalogs", "info"],
  RUNNING: ["Running", "success"],
  PAUSED_HIGH_SYSTEM_LOAD: ["Paused — High System Load", "warning"],
  COMPLETED: ["Completed", "success"],
  ERROR: ["Error", "danger"],
  DISABLED: ["Disabled", "secondary"],
  IDLE: ["Idle", "secondary"],
};

/**
 * "Supplier ↔ supplier matching": every supplier catalog is copied into one
 * index and compared with every other supplier, so a hotel two suppliers sell
 * becomes one hotel in search even without an in-house hotel. Backed by the
 * `supplierMatch` block of the status response.
 */
function SupplierMatchPanel({ match, canAct, onStarted }) {
  const [checking, setChecking] = useState(false);
  if (!match) return null;
  const [label, tone] = MATCH_LABELS[match.state] || [match.state || "Unknown", "secondary"];
  const matchedPct =
    match.indexedRows > 0 ? Math.min(100, Math.round(((match.indexedRows - match.pendingRows) / match.indexedRows) * 100)) : 0;

  const recheck = async () => {
    setChecking(true);
    try {
      const res = await axiosInstance.post("/api/hotel-mapping/auto/supplier-match/index-check", null, { timeout: 30000 });
      toast.success(res.data?.message || "Catalogs are re-checked at the next tick.");
      if (onStarted) onStarted();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || "The re-check could not be requested.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="ahm-panel">
      <div className="ahm-panel-head">
        <span className="d-flex align-items-center gap-2 flex-wrap">
          Supplier ↔ supplier matching
          <Badge bg={tone} text={tone === "warning" ? "dark" : undefined}>{label}</Badge>
          {match.running && <Spinner animation="border" size="sm" role="status" aria-label="Supplier matching running" />}
        </span>
        {canAct && (
          <OverlayTrigger
            placement="top"
            overlay={
              <Tooltip id="ahm-match-tip">
                Compare every supplier catalog with the matching index now; changed catalogs are copied and their new hotels
                matched. Otherwise this runs every few minutes by itself.
              </Tooltip>
            }
          >
            <span>
              <Button size="sm" variant="outline-primary" onClick={recheck} disabled={checking || !match.enabled}>
                {checking ? <Spinner animation="border" size="sm" className="me-1" /> : <i className="fas fa-sync-alt me-1" aria-hidden="true"></i>}
                Re-check catalogs
              </Button>
            </span>
          </OverlayTrigger>
        )}
      </div>
      <div className="p-3 small">
        <p className="mb-2">{match.message || "Supplier hotels are matched with each other in the background."}</p>
        {match.lastError && (
          <p className="text-danger mb-2">
            <i className="fas fa-bug me-1" aria-hidden="true"></i>
            {match.lastError}
          </p>
        )}
        <div className="d-flex justify-content-between align-items-center mb-1 text-muted">
          <span>Matched</span>
          <span>
            {fmtNumber(match.indexedRows - match.pendingRows)} / {fmtNumber(match.indexedRows)} supplier hotels ({matchedPct}%)
          </span>
        </div>
        <ProgressBar now={matchedPct} variant="success" style={{ height: 6 }} className="mb-3" aria-label="Supplier hotels matched" />
        <div className="ahm-tiles mb-2">
          <Tile label="Supplier hotels indexed" value={fmtNumber(match.indexedRows)} sub={`${fmtNumber(match.pendingRows)} waiting to be matched`} />
          <Tile label="Supplier-only hotels" value={fmtNumber(match.supplierOnlyMasters)} sub="sold by 2+ suppliers, no in-house hotel" accent />
          <Tile label="Pairs to review" value={fmtNumber(match.pendingReviewPairs)} sub={match.nearMatchReview ? "similar names nearby" : "conflicts only"} />
          <Tile
            label="This run"
            value={fmtNumber(match.linksThisRun)}
            sub={`links · ${fmtNumber(match.mastersCreatedThisRun)} new hotels · ${fmtNumber(match.mergesThisRun)} merges`}
          />
        </div>
        <div className="text-muted" style={{ fontSize: ".75rem" }}>
          Only <strong>100%</strong> matches (identical names, same country, within the max distance) are mapped
          automatically. Figures refreshed {fmtTime(match.countsAt)}.
        </div>
      </div>
      <Table responsive hover className="ahm-table">
        <thead>
          <tr>
            <th>Supplier</th>
            <th className="text-end">Hotels indexed</th>
            <th className="text-end">Waiting</th>
            <th className="text-end">Pairs to review</th>
            <th>Last indexed</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {(match.suppliers || []).map((s) => (
            <tr key={s.code}>
              <td>
                <span className="fw-semibold">{s.displayName || s.code}</span>
                <span className="text-muted ms-1 small">({s.code})</span>
              </td>
              <td className="text-end">{fmtNumber(s.indexedRows)}</td>
              <td className="text-end">{fmtNumber(s.pendingRows)}</td>
              <td className="text-end">{fmtNumber(s.pendingReviewPairs)}</td>
              <td className="small text-muted text-nowrap">
                {fmtDateTime(s.lastIndexedAt)}
                {s.lastIndexedAt && (
                  <div style={{ fontSize: ".7rem" }}>
                    read {fmtNumber(s.lastIndexRead)} · changed {fmtNumber(s.lastIndexChanged)}
                  </div>
                )}
              </td>
              <td className="small" style={{ maxWidth: 360 }}>
                {s.lastError ? <span className="text-danger">{s.lastError}</span> : <span className="text-muted">—</span>}
              </td>
            </tr>
          ))}
          {(match.suppliers || []).length === 0 && (
            <tr>
              <td colSpan={6} className="text-center text-muted py-3">
                No supplier catalog has been indexed yet.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}

function Tile({ label, value, sub, accent }) {
  return (
    <div className={`ahm-tile${accent ? " accent" : ""}`}>
      <div className="ahm-tile-label">{label}</div>
      <div className="ahm-tile-value">{value}</div>
      {sub && <div className="ahm-tile-sub">{sub}</div>}
    </div>
  );
}

function Row2({ label, value, hint }) {
  return (
    <div className="d-flex justify-content-between gap-3 py-1 border-bottom border-light">
      <span className="text-muted">{label}</span>
      <span className="fw-semibold text-end text-break">
        {value}
        {hint && <span className="text-muted fw-normal ms-1">({hint})</span>}
      </span>
    </div>
  );
}
