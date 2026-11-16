import React, { useMemo, useState } from "react";
import { Alert, Badge, Button, Collapse, Spinner, Table } from "react-bootstrap";
import { useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import toast from "react-hot-toast";
import axiosInstance from "../../../components/AxiosInstance";
import Sidebar from "../../../components/Sidebar";
import Topbar from "../../../components/TopBar";
import BackButton from "../../../components/BackButton";
import { getCurrentActiveRole, getUserRole } from "../../../utils/authSession";
import "../../../styles/AutomatedCityMapping.css";
import {
  ACM_API,
  engineMeta,
  errorText,
  fmtDate,
  fmtDuration,
  fmtNumber,
  providerLabel,
  useCityAutoMappingStatus,
} from "./acmShared";
import ResultsPanel from "./ResultsPanel";
import MappedPanel from "./MappedPanel";
import CountriesPanel from "./CountriesPanel";
import AuditPanel from "./AuditPanel";
import ReviewDialog from "./ReviewDialog";
import DedupPanel from "./DedupPanel";
import GeoSyncPanel from "./GeoSyncPanel";
import RemainingPanel from "./RemainingPanel";
import RemainingList from "./RemainingList";

const VIEWS = [
  { key: "verify", label: "Needs verification", icon: "fa-user-check" },
  { key: "mapped", label: "Mapped cities", icon: "fa-check-double" },
  { key: "issues", label: "Duplicates & conflicts", icon: "fa-clone" },
  { key: "decided", label: "Rejected & removed", icon: "fa-ban" },
  { key: "countries", label: "Countries", icon: "fa-globe" },
  { key: "duplicates", label: "Duplicates", icon: "fa-layer-group" },
  { key: "geosync", label: "Global Country & City Synchronization", icon: "fa-sync-alt" },
  { key: "audit", label: "Audit log", icon: "fa-history" },
];

const TRIGGER_LABEL = {
  FIRST_RUN: "first run",
  REQUESTED: "requested",
  RESCAN_DUE: "scheduled",
  CATALOG_CHANGED: "city lists changed",
};

/**
 * /masters/city-mapping/automated — Automated City Mapping.
 *
 * Opened in a new tab from the button on /masters/city-mapping (window.open
 * without "noopener", so the tab inherits this tab's sessionStorage login). The
 * background engine (backend masters/service/cityMapping/auto) maps a city to a
 * supplier city only on a verified one-to-one match in the same country; every
 * other case lands on the "Needs verification" list here. Backend:
 * /api/city-mapping/auto/** (ADMIN / SUPER_ADMIN); route guarded with roles={["admin"]}.
 */
export default function AutomatedCityMappingPage() {
  const isAdminUser = useMemo(() => {
    const active = (getCurrentActiveRole() || "").trim().toLowerCase();
    const roles = (getUserRole() || "").split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
    const role = active || roles[0] || "";
    return role === "admin" || role === "super_admin";
  }, []);

  const [params, setParams] = useSearchParams();
  const view = VIEWS.some((v) => v.key === params.get("view")) ? params.get("view") : "verify";
  const setView = (key) => {
    const next = new URLSearchParams(params);
    next.set("view", key);
    setParams(next, { replace: true });
  };

  const { status, error, forbidden, refresh } = useCityAutoMappingStatus(isAdminUser);
  const [reloadKey, setReloadKey] = useState(0);
  const [openRow, setOpenRow] = useState(null);
  const [acting, setActing] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [countryFilter, setCountryFilter] = useState("");
  const [mappedSource, setMappedSource] = useState("AUTOMATED");
  const [remainingGroup, setRemainingGroup] = useState(null);

  const reloadAll = () => {
    setReloadKey((k) => k + 1);
    refresh();
  };

  const engine = status?.engine;
  const run = status?.run;
  const totals = status?.totals;
  const providers = useMemo(() => (status?.config?.providers || []).slice(), [status]);
  const meta = engineMeta(engine?.status);

  const control = async (action, confirmText) => {
    if (confirmText) {
      const c = await Swal.fire({ title: confirmText.title, html: confirmText.html, icon: "question", showCancelButton: true,
        confirmButtonText: confirmText.ok });
      if (!c.isConfirmed) return;
    }
    setActing(true);
    try {
      const res = await axiosInstance.post(`${ACM_API}/control/${action}`);
      toast.success(res.data?.message || "Done.");
      reloadAll();
    } catch (err) {
      toast.error(errorText(err, "The request failed."));
    } finally {
      setActing(false);
    }
  };

  const undo = async (m) => {
    const c = await Swal.fire({
      title: "Undo this automatic mapping?",
      html: `The ${providerLabel(m.provider)} row for <b>${m.cityName}</b> (api_city_id ${m.apiCityId}) is deleted and the engine will not map this pair again.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, undo it",
    });
    if (!c.isConfirmed) return;
    try {
      const res = await axiosInstance.post(`${ACM_API}/results/${m.resultId}/reject`, { removeMapping: true, supplierCityIds: [] });
      toast.success(res.data?.message || "Undone.");
      reloadAll();
    } catch (err) {
      toast.error(errorText(err, "The mapping could not be undone."));
    }
  };

  const kpis = totals
    ? [
        { key: "mapped", label: "Mapped automatically", value: totals.autoMapped, tone: "ok", hint: "Rows the engine wrote that still exist", source: "AUTOMATED" },
        { key: "mapped", label: "Approved by admins", value: totals.approved, tone: "ok", hint: "Approved on this page", source: "APPROVED" },
        { key: "verify", label: "Needs verification", value: totals.pendingReview, tone: "warn", hint: "No verified match: an administrator decides" },
        { key: "issues", label: "Duplicates", value: totals.duplicates, tone: "bad", hint: "Supplier city already used by another city" },
        { key: "issues", label: "Conflicts", value: totals.conflicts, tone: "bad", hint: "City already mapped to a different supplier city" },
        { key: "countries", label: "Failed countries", value: totals.failedCountries, tone: totals.failedCountries > 0 ? "bad" : "idle",
          hint: "Countries whose processing failed after every retry", filter: "FAILED" },
        { key: "mapped", label: "Mapped rows (all sources)", value: totals.mappedRows, tone: "idle", hint: "Every active api_city_mapping row", source: "" },
      ]
    : [];

  return (
    <div className="min-vh-100 bg-light d-flex flex-column acm-page">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4 acm-main">
          <section className="acm-hero">
            <div className="acm-hero-title">
              <BackButton fallback="/masters/city-mapping" />
              <div>
                <h3 className="mb-1">Automated City Mapping</h3>
                <p className="acm-muted mb-0">
                  Maps inhouse cities to every supplier's cities in the background, only where the match is verified. Anything
                  uncertain waits for you below.
                </p>
              </div>
            </div>
            {engine && (
              <div className="acm-hero-controls">
                <span className={`acm-state tone-${meta.tone}`} title={engine.reason}>
                  <span className={`acm-dot ${engine.status === "RUNNING" ? "pulse" : ""}`}></span>
                  {meta.label}
                </span>
                {engine.enabled && !engine.waitingForFirstStart && (engine.paused ? (
                  <Button size="sm" variant="primary" disabled={acting} onClick={() => control("start")}>
                    <i className="fas fa-play me-1" aria-hidden="true"></i>Resume
                  </Button>
                ) : (
                  <Button size="sm" variant="outline-secondary" disabled={acting} onClick={() => control("pause")}>
                    <i className="fas fa-pause me-1" aria-hidden="true"></i>Pause
                  </Button>
                ))}
                {engine.enabled && !engine.waitingForFirstStart && (
                  <Button size="sm" variant="outline-secondary" disabled={acting}
                    onClick={() => control("rescan", { title: "Check every country again?", ok: "Yes, check all",
                      html: "Every country is matched again against every supplier. Existing rows are never changed; only new verified matches are added." })}>
                    <i className="fas fa-redo me-1" aria-hidden="true"></i>Run full check
                  </Button>
                )}
                {totals?.failedCountries > 0 && (
                  <Button size="sm" variant="outline-danger" disabled={acting} onClick={() => control("retry-failed")}>
                    Retry {totals.failedCountries} failed
                  </Button>
                )}
                <Button size="sm" variant="light" onClick={reloadAll} title="Refresh" aria-label="Refresh">
                  <i className="fas fa-sync-alt" aria-hidden="true"></i>
                </Button>
              </div>
            )}
          </section>

          {!isAdminUser && <Alert variant="warning">Automated City Mapping is available to administrators only.</Alert>}
          {forbidden && <Alert variant="warning">Your login has no access to the automated city mapping.</Alert>}
          {error && !forbidden && <Alert variant="danger" className="py-2 small">{error}</Alert>}
          {isAdminUser && !status && !error && (
            <div className="acm-loading"><Spinner animation="border" size="sm" className="me-2" />Loading the engine status…</div>
          )}

          {engine && engine.waitingForFirstStart && engine.enabled && (
            <section className="acm-start">
              <div>
                <h5 className="mb-1">Ready for the first automated run</h5>
                <p className="mb-0 acm-muted">
                  The engine checks every country against every supplier and writes a mapping only when it is verified: same
                  country, same name (or an approved alternative name), and no other city of that name on either side. Existing
                  mappings are never changed. You can pause it at any time.
                </p>
              </div>
              <Button variant="primary" disabled={acting}
                onClick={() => control("start", { title: "Start automated city mapping?", ok: "Yes, start",
                  html: "From now on the engine adds verified city mappings in the background and keeps them current when city lists change." })}>
                <i className="fas fa-play me-1" aria-hidden="true"></i>Start automated mapping
              </Button>
            </section>
          )}

          {engine && (
            <section className="acm-run">
              <div className="acm-run-line">
                <div>
                  <strong>{run?.number > 0 ? `Run #${run.number}` : "No run yet"}</strong>
                  {run?.trigger && <span className="acm-muted"> · {TRIGGER_LABEL[run.trigger] || run.trigger}</span>}
                  {run?.startedAt && <span className="acm-muted"> · started {fmtDate(run.startedAt)}</span>}
                  {run?.completedAt && <span className="acm-muted"> · completed {fmtDate(run.completedAt)}</span>}
                </div>
                <div className="acm-muted small">
                  {engine.systemLoadPercent !== null && engine.systemLoadPercent !== undefined && <>system load {engine.systemLoadPercent}% · </>}
                  {engine.activeWorkers > 0 && <>{engine.activeWorkers} worker(s) busy · </>}
                  updated {fmtDate(engine.lastUpdatedAt)}
                </div>
              </div>
              <div className="acm-progress" role="progressbar" aria-valuenow={run?.percent || 0} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${Math.min(100, run?.percent || 0)}%` }}></span>
              </div>
              <div className="acm-run-line small">
                <span>
                  {fmtNumber(run?.countriesDone)} of {fmtNumber(run?.countriesTotal)} countries checked
                  {run?.countriesProcessing > 0 && <> · {run.countriesProcessing} in progress</>}
                  {run?.countriesFailed > 0 && <span className="text-danger"> · {run.countriesFailed} failed</span>}
                  {run?.currentCountry && engine.status === "RUNNING" && <> · now: <strong>{run.currentCountry}</strong></>}
                  {run?.etaSeconds ? <> · about {fmtDuration(run.etaSeconds)} left</> : null}
                </span>
                <span className="acm-muted">{engine.reason}</span>
              </div>
              {engine.lastError && (
                <div className="acm-last-error small">Last error {fmtDate(engine.lastErrorAt)}: {engine.lastError}</div>
              )}
            </section>
          )}

          {totals && (
            <section className="acm-kpis">
              {kpis.map((k) => (
                <button type="button" key={k.label} className={`acm-kpi tone-${k.tone}`} title={k.hint}
                  onClick={() => {
                    setCountryFilter(k.filter || "");
                    if (k.source !== undefined) setMappedSource(k.source);
                    setView(k.key);
                  }}>
                  <span className="acm-kpi-value">{fmtNumber(k.value)}</span>
                  <span className="acm-kpi-label">{k.label}</span>
                </button>
              ))}
            </section>
          )}

          {status && (
            <section className="acm-card">
              <div className="acm-card-head">
                <h6 className="mb-0">Suppliers</h6>
                <Button variant="link" size="sm" className="p-0" onClick={() => setShowRules((v) => !v)}>
                  {showRules ? "Hide the matching rules" : "How a match is verified"}
                </Button>
              </div>
              <Collapse in={showRules}>
                <div>
                  <ol className="acm-rules">
                    <li>The supplier country must resolve to the same inhouse country: its explicit link, its ISO code, or an unambiguous country name. Never a city name.</li>
                    <li>The names must be the same once capitals, spacing, punctuation and accents are ignored, or the supplier name must be an approved alternative name of the city.</li>
                    <li>No other city with that name may exist on either side. Several same-named cities are only resolved when exactly one pair also shares the city code.</li>
                    <li>Names that differ only by a state suffix ("Abilene, TX") need the same city code or hotel positions that agree.</li>
                    <li>Hotel positions (median of each city's hotels) that are more than {status.config?.geoMaxDistanceKm} km apart stop the match.</li>
                    <li>An existing row is never changed, a supplier city is never given to two cities, a rejected pair is never written, and a mapping a user removed is not re-created.</li>
                  </ol>
                </div>
              </Collapse>
              <div className="acm-table-wrap">
                <Table size="sm" className="acm-table acm-suppliers mb-0">
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th className="text-end">Mapped rows</th>
                      <th className="text-end">Automatic</th>
                      <th className="text-end">To verify</th>
                      <th className="text-end">Dup. / conflicts</th>
                      <th className="text-end">This run: new</th>
                      <th className="text-end">Already mapped</th>
                      <th className="text-end">No supplier city</th>
                      <th>Supplier catalogue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.suppliers.map((s) => {
                      const r = s.thisRun || {};
                      const c = s.catalogue || {};
                      return (
                        <tr key={s.provider}>
                          <td><span className="acm-supplier">{providerLabel(s.provider)}</span></td>
                          <td className="text-end">{fmtNumber(s.mappedRows)}</td>
                          <td className="text-end">{fmtNumber(s.autoMapped)}</td>
                          <td className="text-end">{s.pendingReview > 0 ? <Badge bg="warning" text="dark">{fmtNumber(s.pendingReview)}</Badge> : "0"}</td>
                          <td className="text-end">{fmtNumber(s.duplicates + s.conflicts)}</td>
                          <td className="text-end">{fmtNumber(r.autoMapped || 0)}</td>
                          <td className="text-end">{fmtNumber(r.alreadyMapped || 0)}</td>
                          <td className="text-end">{fmtNumber(r.noMatch || 0)}</td>
                          <td className="small">
                            {c.error ? (
                              <span className="text-danger" title={c.error}>Not loaded: {c.error}</span>
                            ) : c.supplierCities !== undefined ? (
                              <span title={(c.unresolvedSamples || []).join("\n")}>
                                {fmtNumber(c.supplierCities)} cities · countries {fmtNumber(c.countriesResolved)}/{fmtNumber(c.supplierCountries)}
                                {c.countriesUnresolved > 0 && <span className="text-warning-emphasis"> · {c.countriesUnresolved} unresolved</span>}
                                {c.citiesWithHotelPositions > 0 && <> · {fmtNumber(c.citiesWithHotelPositions)} with hotel positions</>}
                              </span>
                            ) : (
                              <span className="acm-muted">Loads with the next run</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
              {status.notApplicable?.length > 0 && (
                <div className="acm-na">
                  {status.notApplicable.map((n) => (
                    <span key={n.provider} className="acm-na-chip" title={n.reason}>
                      {providerLabel(n.provider)}: not mapped by city
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {status && (
            <section className="acm-card">
              <nav className="acm-views" aria-label="Sections">
                {VIEWS.map((v) => (
                  <button type="button" key={v.key} className={`acm-view ${view === v.key ? "is-active" : ""}`} onClick={() => {
                    setCountryFilter("");
                    setMappedSource("AUTOMATED");
                    setRemainingGroup(null);
                    setView(v.key);
                  }}>
                    <i className={`fas ${v.icon} me-1`} aria-hidden="true"></i>
                    {v.label}
                    {v.key === "verify" && totals?.pendingReview > 0 && <span className="acm-count">{fmtNumber(totals.pendingReview)}</span>}
                    {v.key === "issues" && totals && totals.duplicates + totals.conflicts > 0 && (
                      <span className="acm-count">{fmtNumber(totals.duplicates + totals.conflicts)}</span>
                    )}
                  </button>
                ))}
              </nav>
              <div className="acm-view-body">
                {view === "verify" && (
                  <>
                    <RemainingPanel reloadKey={reloadKey} selected={remainingGroup} onSelect={setRemainingGroup} />
                    {remainingGroup ? (
                      <RemainingList group={remainingGroup} reloadKey={reloadKey} providers={providers} onOpen={setOpenRow}
                        onChanged={reloadAll} onBack={() => setRemainingGroup(null)} />
                    ) : (
                      <ResultsPanel active reloadKey={reloadKey} statuses="PENDING_REVIEW" providers={providers} onOpen={setOpenRow}
                        bulkApprove onBulkDone={reloadAll}
                        hint="No verified match was found for these cities. Pick the right supplier city and approve it, or reject the suggestions. To approve several at once, tick them: each is mapped to the supplier city shown in its row. Sorted by the supplier's hotels, so the cities that matter most come first."
                        emptyText="Nothing waits for verification." />
                    )}
                  </>
                )}
                {view === "mapped" && <MappedPanel key={mappedSource || "all"} active reloadKey={reloadKey} providers={providers} onUndo={undo}
                  initialSource={mappedSource} />}
                {view === "issues" && (
                  <ResultsPanel active reloadKey={reloadKey} providers={providers} onOpen={setOpenRow} showReason={false}
                    statusOptions={[["DUPLICATE,CONFLICT", "Duplicates and conflicts"], ["DUPLICATE", "Duplicates"], ["CONFLICT", "Conflicts"]]}
                    hint="Duplicates: the supplier city already belongs to another inhouse city. Conflicts: the city already has a different row for the supplier. Nothing was written for either; existing rows are kept."
                    emptyText="No duplicates or conflicts." actionLabel="Open" />
                )}
                {view === "decided" && (
                  <ResultsPanel active reloadKey={reloadKey} providers={providers} onOpen={setOpenRow} showReason={false} defaultSort="updated"
                    statusOptions={[["REJECTED,REMOVED", "Rejected and removed"], ["REJECTED", "Rejected"], ["REMOVED", "Removed by a user"], ["AUTO_MAPPED,APPROVED", "Mapped here (history)"]]}
                    hint="Rejected pairs are never mapped by the engine; mappings a user deleted are not re-created. Reopen a row to have it checked again."
                    emptyText="Nothing rejected or removed." actionLabel="Open" />
                )}
                {view === "countries" && (
                  <CountriesPanel active reloadKey={reloadKey} initialStatus={countryFilter} onChanged={refresh} />
                )}
                {view === "duplicates" && <DedupPanel active providers={providers} onChanged={reloadAll} />}
                {view === "geosync" && <GeoSyncPanel active onChanged={reloadAll} />}
                {view === "audit" && <AuditPanel active reloadKey={reloadKey} providers={providers} />}
              </div>
            </section>
          )}

          <ReviewDialog row={openRow} onHide={() => setOpenRow(null)} onDone={() => {
            setOpenRow(null);
            reloadAll();
          }} />
        </main>
      </div>
    </div>
  );
}
