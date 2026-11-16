import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Collapse, Form, Modal, Spinner, Table } from "react-bootstrap";
import toast from "react-hot-toast";
import axiosInstance from "../../../components/AxiosInstance";
import { ACM_API, errorText, fmtDate, fmtNumber, providerLabel, useDebounced, usePagedList } from "./acmShared";
import { FilterBar, Pager, SortTh } from "./AcmParts";
import DedupDecisionDialog from "./DedupDecisionDialog";

const D = `${ACM_API}/dedup`;

const LISTS = [
  { key: "VERIFIED", label: "Verified duplicates", hint: "Proven by ids or by independent evidence. These are what Remove Verified Duplicates acts on." },
  { key: "REVIEW", label: "Manual review", hint: "Possibly duplicates, not proven. Nothing here is removed automatically; decide each one." },
  { key: "NOT_DUPLICATE", label: "Same name, different places", hint: "Cities that share a name but are different places (other states, or hotels far apart). Never touched." },
  { key: "INFO", label: "Information", hint: "Worth knowing, nothing to clean up (deliberately shared mappings, rows of deactivated cities)." },
  { key: "LOG", label: "Execution log", hint: "Every job step and every applied change of this run." },
];

const CATEGORY = {
  REMOVE_DUPLICATE_ROWS: { label: "Remove duplicate mapping rows", help: "The same supplier city stored twice for one city: one row is kept (hotel lists merged into it)." },
  FIX_ROW_COUNTRY: { label: "Correct rows filed under the wrong country", help: "Only when the supplier's own list confirms the city's country." },
  MERGE_DUPLICATE_CITY: { label: "Merge verified duplicate city records", help: "Supplier mappings move to the kept record; the duplicate record is deactivated (soft delete). Only records nothing refers to." },
  CONSOLIDATE_MAPPINGS_ONLY: { label: "Consolidate mappings of referenced duplicates", help: "The duplicate is referenced (hotels, bookings, ...), so it stays; the kept record gains its supplier mappings." },
};

const STATUS_TONE = { SCANNING: "run", SCANNED: "ok", SCAN_FAILED: "bad", EXECUTING: "run", EXECUTED: "ok", EXECUTED_WITH_ERRORS: "warn",
  RESTORING: "run", RESTORED: "idle", RESTORE_FAILED: "bad" };

const BEFORE_AFTER = [
  ["mappingRows", "Active mapping rows"],
  ["uniqueValidMappings", "Unique valid city mappings"],
  ["duplicateRowGroups", "Duplicate row groups"],
  ["redundantRows", "Redundant duplicate rows"],
  ["activeCities", "Active inhouse cities"],
  ["citiesDeactivatedByCleanup", "Cities deactivated by clean-up"],
];

/** Duplicate City Detection & Removal: a section of the Automated City Mapping page. */
export default function DedupPanel({ active, providers, onChanged }) {
  const [status, setStatus] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState("VERIFIED");
  const [reloadKey, setReloadKey] = useState(0);
  const [showRemove, setShowRemove] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [restoreRun, setRestoreRun] = useState(null);
  const [showGroups, setShowGroups] = useState(false);
  const [deciding, setDeciding] = useState(null);
  const wasRunning = useRef(false);

  const latest = status?.latest || null;
  const running = !!latest?.running;

  const loadStatus = useCallback(async () => {
    try {
      const res = await axiosInstance.get(`${D}/status`, { timeout: 20000 });
      setStatus(res.data);
      setError(null);
    } catch (err) {
      setError(errorText(err, "The duplicate scan status could not be loaded."));
    }
  }, []);

  const loadSummary = useCallback(async (runId) => {
    if (!runId) return;
    try {
      const res = await axiosInstance.get(`${D}/runs/${runId}/summary`, { timeout: 60000 });
      setSummary(res.data);
    } catch (err) {
      setError(errorText(err, "The scan summary could not be loaded."));
    }
  }, []);

  useEffect(() => {
    if (active) loadStatus();
  }, [active, loadStatus]);

  useEffect(() => {
    if (!active || !running) return undefined;
    const id = setInterval(loadStatus, 3000);
    return () => clearInterval(id);
  }, [active, running, loadStatus]);

  useEffect(() => {
    if (!latest) return;
    if (latest.status !== "SCANNING") loadSummary(latest.id);
    if (wasRunning.current && !running) {
      setReloadKey((k) => k + 1);
      onChanged();
    }
    wasRunning.current = running;
  }, [latest?.id, latest?.status, running, loadSummary, onChanged]); // eslint-disable-line react-hooks/exhaustive-deps

  const scan = async () => {
    setBusy(true);
    try {
      const res = await axiosInstance.post(`${D}/scan`);
      toast.success(res.data?.message || "Scan started.");
      setSummary(null);
      await loadStatus();
    } catch (err) {
      toast.error(errorText(err, "The scan could not be started."));
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!latest) return;
    setBusy(true);
    try {
      const res = await axiosInstance.get(`${D}/runs/${latest.id}/report.xlsx`, { responseType: "blob", timeout: 180000 });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `city-duplicates-run-${latest.id}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("The Excel report could not be downloaded.");
    } finally {
      setBusy(false);
    }
  };

  const s = latest?.summary || {};
  const before = latest?.before || {};
  const after = latest?.after || {};
  const pendingBackups = latest ? (latest.unrestoredBackups ?? latest.backups ?? 0) : 0;
  // removals, review decisions (also on a scanned run) and an interrupted restore can all be restored
  const executed = latest && !running && pendingBackups > 0
    && (["EXECUTED", "EXECUTED_WITH_ERRORS", "RESTORE_FAILED", "SCANNED", "RESTORED"].includes(latest.status)
      || (latest.status === "RESTORING" && latest.interrupted));
  const earlier = (status?.runs || []).find((r) => latest && r.id !== latest.id && !r.running && (r.unrestoredBackups || 0) > 0
    && ["EXECUTED", "EXECUTED_WITH_ERRORS", "RESTORE_FAILED", "SCANNED", "RESTORED", "RESTORING"].includes(r.status));
  const removable = latest && !running && (latest.status === "SCANNED" || latest.status === "EXECUTED_WITH_ERRORS"
    || (latest.status === "EXECUTING" && latest.interrupted));
  const openVerified = (summary?.preview || []).reduce((n, p) => n + (p.findings || 0), 0);

  const tiles = latest ? [
    ["Records scanned", s.recordsScanned, "Mapping rows plus inhouse cities", "idle"],
    ["Duplicate groups", s.duplicateGroups, "Verified plus manual-review groups", "warn"],
    ["Verified duplicate records", s.verifiedDuplicateRecords, "Redundant rows and duplicate city records proven by evidence", "warn"],
    ["Removed", s.recordsRemoved, "Rows deleted and city records deactivated by the removal", "ok"],
    ["Mappings consolidated", s.mappingsConsolidated, "Supplier mappings moved or merged into kept records", "ok"],
    ["Retained (referenced)", s.duplicatesRetainedReferenced ?? s.referencedDuplicatesRetained, "Duplicates kept because something refers to them", "idle"],
    ["Manual review", s.manualReview, "Uncertain: never removed automatically", "warn"],
    ["Failed operations", s.failedOperations ?? s.findingsFailed, "Rolled back; retried when you remove again", "bad"],
    ["Unique valid mappings", (after.uniqueValidMappings ?? before.uniqueValidMappings), "Distinct (supplier, active city) mappings in the right country", "ok"],
    ["Names in several countries", s.namesSharedAcrossCountries, "Never compared: different countries are different cities", "idle"],
  ] : [];

  return (
    <div className="acm-dedup">
      <div className="acm-dedup-head">
        <div>
          <h6 className="mb-1">Duplicate City Detection &amp; Removal</h6>
          <p className="acm-hint mb-0">
            A scan only reads. It never treats a shared name as proof: cities in different countries are never compared, and two
            records count as one city only when ids, supplier mappings, hotel positions, city codes or an approved alternative name
            agree. Removal acts on verified findings only, after you confirm, with a full backup.
          </p>
        </div>
        <div className="acm-dedup-actions">
          <Button size="sm" variant="primary" onClick={scan} disabled={busy || running}>
            <i className="fas fa-search me-1" aria-hidden="true"></i>Scan for Duplicates
          </Button>
          <Button size="sm" variant="danger" onClick={() => setShowRemove(true)} disabled={busy || !removable || openVerified === 0}
            title={!removable ? "Run a scan first" : openVerified === 0 ? "No verified duplicates left to remove" : ""}>
            <i className="fas fa-broom me-1" aria-hidden="true"></i>Remove Verified Duplicates
          </Button>
          {executed && (
            <Button size="sm" variant="outline-secondary" onClick={() => { setRestoreRun(latest); setShowRestore(true); }} disabled={busy || running}>
              <i className="fas fa-undo me-1" aria-hidden="true"></i>Restore this run
            </Button>
          )}
          {latest && latest.status !== "SCANNING" && (
            <Button size="sm" variant="outline-secondary" onClick={download} disabled={busy}>
              <i className="fas fa-file-excel me-1" aria-hidden="true"></i>Excel report
            </Button>
          )}
        </div>
      </div>

      {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
      {!latest && status && <div className="acm-empty">No scan yet. Press Scan for Duplicates; it does not change anything.</div>}

      {latest && (
        <div className="acm-dedup-run">
          <span className={`acm-tag tone-${STATUS_TONE[latest.status] || "idle"}`}>{latest.status.replace(/_/g, " ").toLowerCase()}</span>
          <span className="small">
            Run #{latest.id} · scanned {fmtDate(latest.scanFinishedAt || latest.scanStartedAt)} by {latest.scannedBy}
            {latest.execStartedAt && <> · removal {fmtDate(latest.execFinishedAt || latest.execStartedAt)} by {latest.executedBy}</>}
            {latest.restoredAt && <> · restored {fmtDate(latest.restoredAt)} by {latest.restoredBy}</>}
            {latest.backups > 0 && <> · {fmtNumber(latest.backups)} row backup(s) kept</>}
          </span>
          {latest.interrupted && (
            <Badge bg="warning" text="dark">
              interrupted: {latest.status === "RESTORING" ? "press Restore this run to finish the restore"
                : latest.status === "SCANNING" ? "scan again" : "press Remove Verified Duplicates to resume"}
            </Badge>
          )}
        </div>
      )}
      {earlier && !running && (
        <div className="acm-dedup-run">
          <span className="small">Run #{earlier.id} still has {fmtNumber(earlier.unrestoredBackups)} change(s) that can be restored.</span>
          <Button size="sm" variant="link" className="p-0 acm-link" onClick={() => { setRestoreRun(earlier); setShowRestore(true); }} disabled={busy}>
            Restore run #{earlier.id}
          </Button>
        </div>
      )}
      {running && (
        <div className="acm-dedup-progress">
          <Spinner animation="border" size="sm" className="me-2" />
          {latest.phase}
          {latest.progressTotal > 0 && <> · {fmtNumber(latest.progressDone)} of {fmtNumber(latest.progressTotal)}</>}
          {latest.progressTotal > 0 && (
            <div className="acm-progress mt-2"><span style={{ width: `${Math.min(100, (100 * latest.progressDone) / latest.progressTotal)}%` }}></span></div>
          )}
        </div>
      )}
      {latest?.error && <Alert variant="warning" className="small py-2">{latest.error}</Alert>}

      {latest && latest.status !== "SCANNING" && (
        <>
          <div className="acm-kpis acm-kpis-sm">
            {tiles.map(([label, value, hint, tone]) => (
              <div key={label} className={`acm-kpi tone-${tone}`} title={hint}>
                <span className="acm-kpi-value">{value === undefined || value === null ? "—" : fmtNumber(value)}</span>
                <span className="acm-kpi-label">{label}</span>
              </div>
            ))}
          </div>

          <div className="acm-table-wrap mb-3">
            <Table size="sm" className="acm-table mb-0">
              <thead>
                <tr><th>Before and after</th><th className="text-end">At scan</th><th className="text-end">After removal / restore</th><th className="text-end">Change</th></tr>
              </thead>
              <tbody>
                {BEFORE_AFTER.map(([k, label]) => {
                  const b = before[k];
                  const a = after[k];
                  const has = a !== undefined && a !== null;
                  return (
                    <tr key={k}>
                      <td>{label}</td>
                      <td className="text-end">{fmtNumber(b)}</td>
                      <td className="text-end">{has ? fmtNumber(a) : "—"}</td>
                      <td className="text-end">{has && b !== undefined ? (a - b > 0 ? "+" : "") + fmtNumber(a - b) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>

          {summary && (
            <>
              <Button variant="link" size="sm" className="p-0 mb-2 acm-link" onClick={() => setShowGroups((v) => !v)}>
                {showGroups ? "Hide" : "Show"} supplier-wise and country-wise summaries
              </Button>
              <Collapse in={showGroups}>
                <div>
                  <div className="acm-dedup-groups">
                    <GroupTable title="By supplier" rows={summary.bySupplier} label={(k) => (k === "inhouse" ? "Inhouse city records" : providerLabel(k))} />
                    <GroupTable title="By country" rows={summary.byCountry} label={(k) => k} />
                  </div>
                </div>
              </Collapse>
            </>
          )}

          <nav className="acm-views acm-views-sub" aria-label="Duplicate lists">
            {LISTS.map((l) => {
              const n = l.key === "LOG" ? null : summary?.byClassification?.[l.key];
              return (
                <button type="button" key={l.key} className={`acm-view ${list === l.key ? "is-active" : ""}`} onClick={() => setList(l.key)}>
                  {l.label}
                  {n > 0 && <span className="acm-count">{fmtNumber(n)}</span>}
                </button>
              );
            })}
          </nav>
          <p className="acm-hint">{LISTS.find((l) => l.key === list)?.hint}</p>
          {list === "LOG" ? (
            <RunLog runId={latest.id} active={active} reloadKey={reloadKey} />
          ) : (
            <FindingsTable runId={latest.id} classification={list} active={active} reloadKey={reloadKey} providers={providers}
              kinds={status?.kinds || []} onDecide={setDeciding} />
          )}
        </>
      )}

      {showRemove && latest && (
        <RemoveDialog run={latest} preview={summary?.preview || []} onHide={() => setShowRemove(false)}
          onStarted={async () => {
            setShowRemove(false);
            await loadStatus();
          }} />
      )}
      {showRestore && (restoreRun || latest) && (
        <RestoreDialog run={restoreRun || latest} onHide={() => setShowRestore(false)}
          onStarted={async () => {
            setShowRestore(false);
            await loadStatus();
          }} />
      )}
      <DedupDecisionDialog finding={deciding} onHide={() => setDeciding(null)} onDone={() => {
        setDeciding(null);
        setReloadKey((k) => k + 1);
        loadSummary(latest?.id);
        onChanged();
      }} />
    </div>
  );
}

function GroupTable({ title, rows, label }) {
  return (
    <div className="acm-table-wrap">
      <Table size="sm" className="acm-table mb-0">
        <thead>
          <tr>
            <th>{title}</th><th className="text-end">Verified</th><th className="text-end">Review</th><th className="text-end">Different places</th>
            <th className="text-end">Applied</th><th className="text-end">Removed</th><th className="text-end">Consolidated</th><th className="text-end">Failed</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).length === 0 && <tr><td colSpan={8} className="acm-empty">Nothing found.</td></tr>}
          {(rows || []).map((r) => (
            <tr key={r.key}>
              <td>{label(r.key)}</td>
              <td className="text-end">{fmtNumber(r.verified)}</td>
              <td className="text-end">{fmtNumber(r.review)}</td>
              <td className="text-end">{fmtNumber(r.notDuplicate)}</td>
              <td className="text-end">{fmtNumber(r.applied)}</td>
              <td className="text-end">{fmtNumber(r.removed)}</td>
              <td className="text-end">{fmtNumber(r.consolidated)}</td>
              <td className="text-end">{fmtNumber(r.failed)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function FindingsTable({ runId, classification, active, reloadKey, providers, kinds, onDecide }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 350);
  const [provider, setProvider] = useState("");
  const [country, setCountry] = useState(null);
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("id");
  const [dir, setDir] = useState("asc");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);

  useEffect(() => setPage(0), [dq, provider, country, kind, status, size, classification]);
  const { page: data, loading, error } = usePagedList(`/dedup/runs/${runId}/findings`,
    { classification, kind, status, provider, countryId: country?.value, q: dq, sort, dir, page, size }, active, reloadKey);
  const onSort = (field, d) => {
    setSort(field);
    setDir(d);
  };
  const supplierOptions = useMemo(() => ["inhouse", ...(providers || [])], [providers]);

  return (
    <div>
      <FilterBar q={q} onQ={setQ} placeholder="Search city, reason, record id…" provider={provider} onProvider={setProvider}
        providers={supplierOptions} country={country} onCountry={setCountry}
        status={status} onStatus={setStatus} statusOptions={[["", "Every status"], ["PLANNED", "To remove"], ["DONE", "Done"],
          ["SKIPPED", "Skipped (data changed)"], ["FAILED", "Failed"], ["RESTORED", "Restored"], ["NONE", "No action"]]}>
        <Form.Select size="sm" className="acm-select acm-select-wide" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">
          <option value="">Every kind</option>
          {kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </Form.Select>
        {loading && <Spinner animation="border" size="sm" className="ms-1" />}
      </FilterBar>
      {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
      <div className="acm-table-wrap">
        <Table hover size="sm" className="acm-table mb-0">
          <thead>
            <tr>
              <SortTh label="#" field="id" sort={sort} dir={dir} onSort={onSort} />
              <SortTh label="Kind" field="kind" sort={sort} dir={dir} onSort={onSort} />
              <SortTh label="Inhouse city" field="city" sort={sort} dir={dir} onSort={onSort} />
              <SortTh label="Country" field="country" sort={sort} dir={dir} onSort={onSort} />
              <SortTh label="Supplier" field="supplier" sort={sort} dir={dir} onSort={onSort} />
              <th>Supplier city id</th>
              <th>Duplicate record ids</th>
              <SortTh label="Status" field="status" sort={sort} dir={dir} onSort={onSort} />
              <th>Reason</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data && data.content.length === 0 && <tr><td colSpan={10} className="acm-empty">Nothing in this list.</td></tr>}
            {(data?.content || []).map((f) => (
              <tr key={f.id}>
                <td className="small acm-muted">{f.id}</td>
                <td className="small">{f.kindLabel}</td>
                <td>
                  <div className="fw-semibold">{f.cityName}</div>
                  <div className="acm-muted small">#{f.cityId}</div>
                </td>
                <td>{f.countryIso}<div className="acm-muted small">{f.countryName}</div></td>
                <td>{f.provider ? <span className="acm-supplier">{providerLabel(f.provider)}</span> : <span className="acm-muted small">inhouse</span>}</td>
                <td className="small">{f.supplierCityId || "—"}</td>
                <td className="small">
                  {(f.recordIds || []).join(", ")}
                  {f.canonicalId && (
                    <div className="acm-muted">{f.action === "FIX_ROW_COUNTRY" ? `country \u2192 #${f.canonicalId}` : `keep #${f.canonicalId}`}</div>
                  )}
                </td>
                <td>
                  <span className={`acm-tag tone-${f.status === "DONE" ? "ok" : f.status === "FAILED" ? "bad" : f.status === "PLANNED" ? "warn" : "idle"}`}>
                    {f.status === "PLANNED" ? (f.action || "").replace(/_/g, " ").toLowerCase() : f.status.toLowerCase()}
                  </span>
                </td>
                <td className="small acm-detail">
                  {f.reason}
                  {f.resultDetail && <div className="text-success mt-1">{f.resultDetail}</div>}
                  {f.error && <div className="text-danger mt-1">{f.error}</div>}
                </td>
                <td className="text-end">
                  {f.classification === "REVIEW" && (f.kind === "DUPLICATE_CITY_RECORDS" || f.kind === "CONFLICTING_MAPPING_ROWS")
                    && f.status !== "DONE" && (
                    <Button size="sm" variant="outline-primary" onClick={() => onDecide(f)}>Decide</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      <Pager data={data} page={page} size={size} onPage={setPage} onSize={setSize} disabled={loading} />
    </div>
  );
}

function RunLog({ runId, active, reloadKey }) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const { page: data, loading, error } = usePagedList(`/dedup/runs/${runId}/log`, { page, size }, active, reloadKey);
  return (
    <div>
      {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
      <div className="acm-table-wrap">
        <Table size="sm" className="acm-table mb-0">
          <thead><tr><th>When</th><th>Event</th><th>Supplier</th><th>City</th><th>By</th><th>Detail</th></tr></thead>
          <tbody>
            {data && data.content.length === 0 && <tr><td colSpan={6} className="acm-empty">No log entries yet.</td></tr>}
            {(data?.content || []).map((a) => (
              <tr key={a.id}>
                <td className="small acm-muted text-nowrap">{fmtDate(a.createdAt)}</td>
                <td><span className="acm-event">{a.eventType.replace(/^DEDUP_/, "").replace(/_/g, " ").toLowerCase()}</span></td>
                <td>{a.provider ? providerLabel(a.provider) : "—"}</td>
                <td>{a.cityName ? <>{a.cityName} <span className="acm-muted small">#{a.cityId}</span></> : "—"}</td>
                <td className="small">{a.actor}</td>
                <td className="small acm-detail">{a.detail}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      <Pager data={data} page={page} size={size} onPage={setPage} onSize={setSize} disabled={loading} />
    </div>
  );
}

function RemoveDialog({ run, preview, onHide, onStarted }) {
  const [chosen, setChosen] = useState(() => preview.filter((p) => p.findings > 0).map((p) => p.action));
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const pick = (a) => setChosen((c) => (c.includes(a) ? c.filter((x) => x !== a) : [...c, a]));
  const totals = preview.filter((p) => chosen.includes(p.action)).reduce((t, p) => ({
    remove: t.remove + (p.recordsToRemove || 0), retain: t.retain + (p.recordsRetained || 0),
    consolidate: t.consolidate + (p.mappingsToConsolidate || 0), correct: t.correct + (p.rowsToCorrect || 0),
    refs: t.refs + (p.referencesAffected || 0), findings: t.findings + (p.findings || 0),
  }), { remove: 0, retain: 0, consolidate: 0, correct: 0, refs: 0, findings: 0 });

  const start = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await axiosInstance.post(`${D}/runs/${run.id}/remove`, { categories: chosen, confirm });
      toast.success(res.data?.message || "Removal started.");
      onStarted();
    } catch (err) {
      setError(errorText(err, "The removal could not be started."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show onHide={saving ? undefined : onHide} size="lg" centered backdrop="static" className="acm-modal">
      <Modal.Header closeButton={!saving}><Modal.Title as="h5">Remove verified duplicates of scan #{run.id}</Modal.Title></Modal.Header>
      <Modal.Body>
        <p className="small">
          Only verified findings are touched, one at a time. Each one is checked again against the data as it is now (anything that
          changed since the scan is skipped), backed up row by row, and applied in its own transaction. Inhouse cities are only
          deactivated, never deleted, and never when a hotel, booking, package, agent or other record refers to them. The automated
          mapping pauses while this runs.
        </p>
        <Table size="sm" className="acm-cand">
          <thead>
            <tr><th></th><th>Clean-up</th><th className="text-end">Findings</th><th className="text-end">To remove</th><th className="text-end">To consolidate</th>
              <th className="text-end">Retained</th><th className="text-end">To correct</th><th className="text-end">References affected</th></tr>
          </thead>
          <tbody>
            {preview.map((p) => (
              <tr key={p.action} className={chosen.includes(p.action) ? "is-picked" : ""}>
                <td><Form.Check checked={chosen.includes(p.action)} disabled={p.findings === 0} onChange={() => pick(p.action)}
                  aria-label={CATEGORY[p.action]?.label} /></td>
                <td>
                  <div className="fw-semibold small">{CATEGORY[p.action]?.label || p.action}</div>
                  <div className="acm-muted small">{CATEGORY[p.action]?.help}</div>
                </td>
                <td className="text-end">{fmtNumber(p.findings)}</td>
                <td className="text-end">{fmtNumber(p.recordsToRemove)}</td>
                <td className="text-end">{fmtNumber(p.mappingsToConsolidate)}</td>
                <td className="text-end">{fmtNumber(p.recordsRetained)}</td>
                <td className="text-end">{fmtNumber(p.rowsToCorrect)}</td>
                <td className="text-end">{fmtNumber(p.referencesAffected)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Alert variant="warning" className="small py-2">
          Selected: {fmtNumber(totals.findings)} finding(s): {fmtNumber(totals.remove)} record(s) removed, {fmtNumber(totals.consolidate)} mapping(s)
          consolidated, {fmtNumber(totals.retain)} record(s) retained, {fmtNumber(totals.correct)} row(s) corrected. "References affected" counts
          search-log rows that keep pointing at a deactivated record, and references that keep a duplicate in place.
          You can restore the whole run afterwards.
        </Alert>
        <Form.Group>
          <Form.Label className="acm-label">Type REMOVE to confirm</Form.Label>
          <Form.Control size="sm" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="REMOVE" autoComplete="off" />
        </Form.Group>
        {error && <Alert variant="danger" className="small py-2 mt-3 mb-0">{error}</Alert>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" size="sm" onClick={onHide} disabled={saving}>Cancel</Button>
        <Button variant="danger" size="sm" onClick={start} disabled={saving || chosen.length === 0 || confirm.trim() !== "REMOVE"}>
          {saving ? <Spinner animation="border" size="sm" /> : "Remove verified duplicates"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function RestoreDialog({ run, onHide, onStarted }) {
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const start = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await axiosInstance.post(`${D}/runs/${run.id}/restore`, { confirm });
      toast.success(res.data?.message || "Restore started.");
      onStarted();
    } catch (err) {
      setError(errorText(err, "The restore could not be started."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal show onHide={saving ? undefined : onHide} centered backdrop="static" className="acm-modal">
      <Modal.Header closeButton={!saving}><Modal.Title as="h5">Restore run #{run.id}</Modal.Title></Modal.Header>
      <Modal.Body>
        <p className="small">
          Every change this run made is undone from its backups ({fmtNumber(run.unrestoredBackups ?? run.backups)} row copies, removals and
          review decisions alike), newest first: deleted rows come back, deactivated
          cities are active again, moved alternative names and consolidated mappings are reverted. Edits made to the same rows since then
          are overwritten by the backed-up values.
        </p>
        <Form.Group>
          <Form.Label className="acm-label">Type RESTORE to confirm</Form.Label>
          <Form.Control size="sm" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="RESTORE" autoComplete="off" />
        </Form.Group>
        {error && <Alert variant="danger" className="small py-2 mt-3 mb-0">{error}</Alert>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" size="sm" onClick={onHide} disabled={saving}>Cancel</Button>
        <Button variant="warning" size="sm" onClick={start} disabled={saving || confirm.trim() !== "RESTORE"}>
          {saving ? <Spinner animation="border" size="sm" /> : "Restore"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
