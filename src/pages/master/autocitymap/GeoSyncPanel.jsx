import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Form, Modal, Spinner, Table } from "react-bootstrap";
import toast from "react-hot-toast";
import axiosInstance from "../../../components/AxiosInstance";
import { ACM_API, errorText, fmtDate, fmtNumber, providerLabel, useDebounced, usePagedList } from "./acmShared";
import { FilterBar, Pager, SortTh } from "./AcmParts";
import GeoSyncDecisionDialog from "./GeoSyncDecisionDialog";

const G = `${ACM_API}/geo`;

const STATUS_TONE = { SCANNING: "run", SCANNED: "ok", SCAN_FAILED: "bad", APPLYING: "run", APPLIED: "ok", APPLIED_WITH_ERRORS: "warn",
  ROLLING_BACK: "run", ROLLED_BACK: "idle", ROLLBACK_FAILED: "bad" };

/** Lists under the dashboard. `params` filter /items; the others have their own endpoint. */
const LISTS = [
  { key: "countries", label: "Countries", params: { type: "COUNTRY" },
    hint: "Every country of the source, matched to ours by ISO code. Present countries are only linked (codes recorded); names are never changed." },
  { key: "toAdd", label: "Cities to add", params: { type: "CITY", classification: "VERIFIED", reason: "CITY_MISSING,SUPPLIER_CONFIRMED" },
    hint: "Proven missing: no city, alternative name, location or deactivated record of that name in the country, nothing similar nearby, no supplier city at that spot mapped elsewhere." },
  { key: "review", label: "Manual review", params: { classification: "REVIEW" },
    hint: "Held back because something speaks against adding or linking them automatically. Nothing here changes until you decide." },
  { key: "skipped", label: "Held back", params: { classification: "SKIPPED" },
    hint: "Deliberately not added: deactivated on purpose, already a location (area) of a city, withdrawn code, or ignored by an administrator." },
  { key: "linked", label: "Linked cities", params: { type: "CITY", reason: "LINK_NEW,LINK_REFRESH,LINK_UP_TO_DATE,LINK_KEPT_OTHER,LINK_AMBIGUOUS,MULTIPLE_MATCHES,LINK_FAR,ALREADY_LINKED" },
    hint: "Cities that already exist. A one-to-one match is linked (source id and position recorded); cities matching several places are left unlinked." },
  { key: "suppliers", label: "Supplier countries", params: { type: "SUPPLIER_COUNTRY" },
    hint: "Each supplier's countries and the country of ours they resolve to. Darina and Atharva keep their own link, which is filled when empty and proven by ISO code." },
  { key: "byCountry", label: "Country-wise", hint: "Cities per country: present, to add, added, in review, held back, linked." },
  { key: "bySupplier", label: "Supplier-wise", hint: "Supplier country mapping per supplier, and what the automated mapping did with the added cities." },
  { key: "errors", label: "Errors & skips", hint: "Items that failed (rolled back, retried on the next apply) or were skipped because the data changed after the scan." },
  { key: "log", label: "Execution log", hint: "Every job step and every record this run added or linked." },
  { key: "sources", label: "Sources", hint: "The files used, their versions and checksums, and their licences." },
];

const BEFORE_AFTER = [
  ["countriesActive", "Active countries"],
  ["countriesWithIsoActive", "Distinct ISO codes (active countries)"],
  ["citiesActive", "Active cities"],
  ["uniqueCityNamesPerCountry", "Unique city names per country"],
  ["citiesLinkedToSource", "Cities linked to the source"],
  ["citiesWithSourcePosition", "Cities with a source position"],
  ["countriesLinkedToSource", "Countries linked to the source"],
  ["citiesAddedBySync", "Cities added by synchronization (all runs)"],
  ["countriesAddedBySync", "Countries added by synchronization (all runs)"],
];

const PART_INFO = {
  COUNTRIES: { label: "Countries", help: "Add verified missing countries (with the region worked out from their neighbours) and record source codes for existing ones." },
  SUPPLIER_COUNTRIES: { label: "Supplier country links", help: "Fill empty Darina / Atharva country links where the ISO code proves the country." },
  CITIES: { label: "Cities", help: "Add verified missing cities and link existing cities to the source (positions recorded)." },
};

/** Global Country & City Synchronization: a section of the Automated City Mapping page. */
export default function GeoSyncPanel({ active, onChanged }) {
  const [status, setStatus] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState("toAdd");
  const [reloadKey, setReloadKey] = useState(0);
  const [applyParts, setApplyParts] = useState(null);
  const [showRollback, setShowRollback] = useState(false);
  const [rollbackRun, setRollbackRun] = useState(null);
  const [deciding, setDeciding] = useState(null);
  const wasRunning = useRef(false);
  // the page re-creates onChanged on every render; keep the latest without re-running the effects below
  const changed = useRef(onChanged);
  changed.current = onChanged;

  const latest = status?.latest || null;
  const running = !!latest?.running;

  const loadStatus = useCallback(async () => {
    try {
      const res = await axiosInstance.get(`${G}/status`, { timeout: 20000 });
      setStatus(res.data);
      setError(null);
    } catch (err) {
      setError(errorText(err, "The synchronization status could not be loaded."));
    }
  }, []);

  const loadSummary = useCallback(async (runId) => {
    if (!runId) return;
    try {
      const res = await axiosInstance.get(`${G}/runs/${runId}/summary`, { timeout: 60000 });
      setSummary(res.data);
    } catch (err) {
      setError(errorText(err, "The run summary could not be loaded."));
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
      changed.current();
    }
    wasRunning.current = running;
  }, [latest?.id, latest?.status, running, loadSummary]); // eslint-disable-line react-hooks/exhaustive-deps

  const post = async (url, body, okText, failText) => {
    setBusy(true);
    try {
      const res = await axiosInstance.post(url, body, { timeout: 60000 });
      toast.success(res.data?.message || okText);
      await loadStatus();
      return res.data;
    } catch (err) {
      toast.error(errorText(err, failText));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const scan = async () => {
    const r = await post(`${G}/scan`, {}, "Scan started.", "The scan could not be started.");
    if (r) setSummary(null);
  };

  const queueMapping = async () => {
    if (!latest) return;
    const r = await post(`${G}/runs/${latest.id}/supplier-mapping`, { all: false }, "Queued.", "The supplier mapping could not be started.");
    if (r) changed.current();
  };

  const setAutomation = (patch) => post(`${G}/automation`, patch, "Saved.", "The setting could not be saved.");

  const download = async () => {
    if (!latest) return;
    setBusy(true);
    try {
      const res = await axiosInstance.get(`${G}/runs/${latest.id}/report.xlsx`, { responseType: "blob", timeout: 300000 });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `country-city-sync-run-${latest.id}.xlsx`;
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

  if (status && !status.enabled) {
    return (
      <div className="acm-dedup">
        <h6 className="mb-1">Global Country &amp; City Synchronization</h6>
        <div className="acm-empty">Switched off on this server (city.global-sync.enabled=false).</div>
      </div>
    );
  }

  const s = latest?.summary || {};
  const co = s.countries || {};
  const ci = s.cities || {};
  const ap = s.applied || {};
  const before = latest?.before || {};
  const after = latest?.after || {};
  const supplierRows = summary?.bySupplier || [];
  const supplierMapped = supplierRows.reduce((n, r) => n + (r.mapped || 0) + (r.linked || 0), 0);
  const supplierTotal = supplierRows.reduce((n, r) => n + (r.countries || 0), 0);
  const applicable = latest && !running && ["SCANNED", "APPLIED", "APPLIED_WITH_ERRORS"].includes(latest.status)
    || (latest?.status === "APPLYING" && latest?.interrupted);
  const applied = ["APPLIED", "APPLIED_WITH_ERRORS", "ROLLBACK_FAILED"].includes(latest?.status);
  // an interrupted rollback is restarted with the same button
  const rollbackable = latest && !running && (applied || (latest.status === "ROLLING_BACK" && latest.interrupted));
  const earlierApplied = (status?.runs || []).find((r) => latest && r.id !== latest.id && !r.running
    && (["APPLIED", "APPLIED_WITH_ERRORS", "ROLLBACK_FAILED"].includes(r.status) || (r.status === "ROLLING_BACK" && r.interrupted)));
  const open = (type, action) => (summary?.byReason || [])
    .filter((r) => r.type === type && r.classification === "VERIFIED" && (!action || action(r.reasonCode)))
    .reduce((n, r) => n + (r.count - r.done), 0);
  const openCountries = open("COUNTRY");
  const openCities = open("CITY");
  const openSupplier = open("SUPPLIER_COUNTRY");
  const failedOrSkipped = (ap.failed || 0) + (ap.skippedBecauseDataChanged || 0);

  const countryTiles = [
    ["In source", co.inSource, "ISO 3166-1 countries and territories in GeoNames", "idle"],
    ["Present", co.present, "Matched to one of ours by ISO code", "ok"],
    ["Missing", co.missing, "Not in the masters (to add or to review)", co.missing > 0 ? "warn" : "idle"],
    ["Added", ap.countriesAdded, "Added by this run", "ok"],
    ["Renamed / other spelling", co.nameDiffers, "Present, but the source uses another name (reported, never changed)", "idle"],
  ];
  const cityTiles = [
    ["In source", ci.inSource, `Populated places with ${fmtNumber(s.settings?.cityMinPopulation)}+ people, capitals, and smaller places suppliers sell`, "idle"],
    ["Present", ci.present, "Already a city of ours (by name, alternative name or variant)", "ok"],
    ["Missing", ci.missing, "Not found among the cities of their country", "warn"],
    ["To add (verified)", ci.toAdd, "Proven missing; added by Add Verified Cities", "warn"],
    ["Added", ap.citiesAdded, "Added by this run", "ok"],
    ["Linked", (ap.citiesLinked ?? 0) || ci.toLink, ap.citiesLinked ? "Links recorded by this run" : "Links this run will record", "ok"],
  ];
  const otherTiles = [
    ["Supplier countries mapped", summary ? supplierMapped : undefined, `Of ${fmtNumber(supplierTotal)} supplier countries (linked or matched by ISO code)`, "ok"],
    ["Supplier links to fill", openSupplier, "Empty Darina / Atharva links proven by ISO code", "warn"],
    ["Duplicates prevented", s.duplicatesPrevented, "Records held back by a duplicate or wrong-country check", "ok"],
    ["Manual review", (co.review || 0) + (ci.review || 0) + supplierRows.reduce((n, r) => n + (r.review || 0), 0), "Decide each one", "warn"],
    ["Failed / skipped", latest?.applyStartedAt ? failedOrSkipped : undefined, "Failed items were rolled back; skipped ones changed after the scan", failedOrSkipped > 0 ? "bad" : "idle"],
    ["Final active cities", after.citiesActive ?? before.citiesActive, "Active cities in active countries", "idle"],
    ["Final active countries", after.countriesActive ?? before.countriesActive, "Active countries", "idle"],
  ];

  return (
    <div className="acm-dedup">
      <div className="acm-dedup-head">
        <div>
          <h6 className="mb-1">Global Country &amp; City Synchronization</h6>
          <p className="acm-hint mb-0">
            Compares our countries and cities with GeoNames. A scan only reads. Applying adds only records proven missing: countries by
            ISO code, cities by name, alternative names, state / province, position and supplier evidence. Nothing that exists is changed or
            deleted, a deactivated record is never added again, and anything uncertain waits for you. New cities are then mapped to supplier
            cities by the automated mapping, with its own 100% rules.
          </p>
        </div>
        <div className="acm-dedup-actions">
          <Button size="sm" variant="primary" onClick={scan} disabled={busy || running}>
            <i className="fas fa-search me-1" aria-hidden="true"></i>Scan countries &amp; cities
          </Button>
          <Button size="sm" variant="outline-primary" onClick={() => setApplyParts(["COUNTRIES"])} disabled={busy || !applicable || openCountries === 0}
            title={!applicable ? "Run a scan first" : openCountries === 0 ? "Nothing left to add or link" : ""}>
            <i className="fas fa-flag me-1" aria-hidden="true"></i>Add Verified Countries
          </Button>
          <Button size="sm" variant="outline-primary" onClick={() => setApplyParts(["CITIES"])} disabled={busy || !applicable || openCities === 0}
            title={!applicable ? "Run a scan first" : openCities === 0 ? "Nothing left to add or link" : ""}>
            <i className="fas fa-city me-1" aria-hidden="true"></i>Add Verified Cities
          </Button>
          <Button size="sm" variant="outline-primary" onClick={() => setApplyParts(["SUPPLIER_COUNTRIES"])}
            disabled={busy || !applicable || openSupplier === 0} title={openSupplier === 0 ? "No supplier link to fill" : ""}>
            <i className="fas fa-link me-1" aria-hidden="true"></i>Link Supplier Countries
          </Button>
          <Button size="sm" variant="outline-secondary" onClick={queueMapping} disabled={busy || running || !applied}
            title={!applied ? "Apply first: only what a run added is queued" : "Queue the changed countries for the automated supplier mapping"}>
            <i className="fas fa-random me-1" aria-hidden="true"></i>Start Supplier Mapping
          </Button>
          {rollbackable && (
            <Button size="sm" variant="outline-secondary" onClick={() => { setRollbackRun(latest); setShowRollback(true); }} disabled={busy || running}>
              <i className="fas fa-undo me-1" aria-hidden="true"></i>Roll back this run
            </Button>
          )}
          {latest && latest.status !== "SCANNING" && (
            <Button size="sm" variant="outline-secondary" onClick={download} disabled={busy}>
              <i className="fas fa-file-excel me-1" aria-hidden="true"></i>Excel report
            </Button>
          )}
        </div>
      </div>

      {status?.automation && (
        <div className="acm-geo-auto">
          <Form.Check type="switch" id="geo-auto-scan" label={`Scheduled background scan (${status.automation.schedule})`}
            checked={!!status.automation.autoScan} disabled={busy}
            onChange={(e) => setAutomation({ autoScan: e.target.checked, autoApply: e.target.checked ? status.automation.autoApply : false })} />
          <Form.Check type="switch" id="geo-auto-apply" label="Apply verified items of scheduled scans automatically"
            checked={!!status.automation.autoApply} disabled={busy || !status.automation.autoScan}
            onChange={(e) => setAutomation({ autoScan: status.automation.autoScan, autoApply: e.target.checked })} />
          {status.automation.lastScheduledAt && <span className="acm-muted small">Last scheduled scan {fmtDate(status.automation.lastScheduledAt)}</span>}
        </div>
      )}

      {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
      {!latest && status && <div className="acm-empty">No scan yet. Press Scan countries &amp; cities; it does not change anything.</div>}

      {latest && (
        <div className="acm-dedup-run">
          <span className={`acm-tag tone-${STATUS_TONE[latest.status] || "idle"}`}>{latest.status.replace(/_/g, " ").toLowerCase()}</span>
          <span className="small">
            Run #{latest.id} · {latest.trigger === "SCHEDULED" ? "scheduled scan" : "scanned"} {fmtDate(latest.scanFinishedAt || latest.scanStartedAt)} by {latest.scannedBy}
            {latest.applyStartedAt && <> · applied {fmtDate(latest.applyFinishedAt || latest.applyStartedAt)} by {latest.appliedBy} ({(latest.parts || []).map((p) => PART_INFO[p]?.label || p).join(", ")})</>}
            {latest.rolledBackAt && <> · rolled back {fmtDate(latest.rolledBackAt)} by {latest.rolledBackBy}</>}
          </span>
          {latest.interrupted && (
            <Badge bg="warning" text="dark">
              interrupted: {latest.status === "ROLLING_BACK" ? "press Roll back this run to finish the rollback"
                : latest.status === "SCANNING" ? "scan again" : "apply again to resume"}
            </Badge>
          )}
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
      {latest?.sources?.warning && <Alert variant="warning" className="small py-2">{latest.sources.warning}</Alert>}

      {latest && latest.status !== "SCANNING" && (
        <>
          <Tiles title="Countries" tiles={countryTiles} />
          <Tiles title="Cities" tiles={cityTiles} />
          <Tiles title="Mapping and checks" tiles={otherTiles} />

          <div className="acm-table-wrap mb-3">
            <Table size="sm" className="acm-table mb-0">
              <thead>
                <tr><th>Before and after</th><th className="text-end">At scan</th><th className="text-end">After apply / rollback</th><th className="text-end">Change</th></tr>
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

          <nav className="acm-views acm-views-sub" aria-label="Synchronization lists">
            {LISTS.map((l) => (
              <button type="button" key={l.key} className={`acm-view ${list === l.key ? "is-active" : ""}`} onClick={() => setList(l.key)}>
                {l.label}
              </button>
            ))}
          </nav>
          <p className="acm-hint">{LISTS.find((l) => l.key === list)?.hint}</p>
          {list === "byCountry" && <CountryTable rows={summary?.byCountry} />}
          {list === "bySupplier" && <SupplierTables rows={summary?.bySupplier} mapping={summary?.supplierCityMapping} />}
          {list === "sources" && <SourcesTable sources={latest.sources} />}
          {list === "log" && <RunLog runId={latest.id} active={active} reloadKey={reloadKey} />}
          {list === "errors" && <ItemsTable path={`/geo/runs/${latest.id}/errors`} params={{}} active={active} reloadKey={reloadKey} onDecide={setDeciding} />}
          {LISTS.find((l) => l.key === list)?.params && (
            <ItemsTable key={list} path={`/geo/runs/${latest.id}/items`} params={LISTS.find((l) => l.key === list).params} active={active}
              reloadKey={reloadKey} onDecide={setDeciding} filters />
          )}
        </>
      )}

      <p className="acm-geo-attrib">{status?.attribution}</p>

      {applyParts && latest && (
        <ApplyDialog run={latest} initial={applyParts} counts={{ COUNTRIES: openCountries, CITIES: openCities, SUPPLIER_COUNTRIES: openSupplier }}
          onHide={() => setApplyParts(null)}
          onStarted={async () => {
            setApplyParts(null);
            await loadStatus();
          }} />
      )}
      {earlierApplied && !running && (
        <div className="acm-dedup-run">
          <span className="small">Run #{earlierApplied.id} was applied ({earlierApplied.status.replace(/_/g, " ").toLowerCase()}).</span>
          <Button size="sm" variant="link" className="p-0 acm-link" onClick={() => { setRollbackRun(earlierApplied); setShowRollback(true); }}
            disabled={busy}>
            Roll back run #{earlierApplied.id}
          </Button>
        </div>
      )}
      {showRollback && (rollbackRun || latest) && (
        <RollbackDialog run={rollbackRun || latest} onHide={() => setShowRollback(false)}
          onStarted={async () => {
            setShowRollback(false);
            await loadStatus();
          }} />
      )}
      <GeoSyncDecisionDialog item={deciding} onHide={() => setDeciding(null)} onDone={() => {
        setDeciding(null);
        setReloadKey((k) => k + 1);
        loadSummary(latest?.id);
        changed.current();
      }} />
    </div>
  );
}

function Tiles({ title, tiles }) {
  return (
    <div className="acm-geo-tiles">
      <div className="acm-label">{title}</div>
      <div className="acm-kpis acm-kpis-sm">
        {tiles.map(([label, value, hint, tone]) => (
          <div key={label} className={`acm-kpi tone-${tone}`} title={hint}>
            <span className="acm-kpi-value">{value === undefined || value === null ? "—" : fmtNumber(value)}</span>
            <span className="acm-kpi-label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ITEM_STATUS = [["", "Every status"], ["PLANNED", "To apply"], ["DONE", "Done"], ["SKIPPED", "Skipped (data changed)"],
  ["FAILED", "Failed"], ["ROLLED_BACK", "Rolled back"], ["NONE", "No action"]];

const REASON_TEXT = {
  COUNTRY_PRESENT: "Present", COUNTRY_LINK: "Present, to link", NAME_DIFFERS: "Present, other name", COUNTRY_MISSING: "Missing",
  REGION_UNCLEAR: "Region unclear", NAME_EXISTS: "Name used by another code", WITHDRAWN: "Withdrawn code", DEACTIVATED: "Deactivated on purpose",
  NOT_IN_SOURCE: "Not in the source", DECIDED_IGNORE: "Ignored by an administrator", LINK_NEW: "To link", LINK_REFRESH: "Link to refresh",
  LINK_UP_TO_DATE: "Linked", LINK_KEPT_OTHER: "Earlier link kept", LINK_AMBIGUOUS: "Several places of that name", MULTIPLE_MATCHES: "Several cities match",
  CITY_MISSING: "Missing", SUPPLIER_CONFIRMED: "Missing, confirmed by supplier hotels", DEACTIVATED_MATCH: "Matches a deactivated city",
  LOCATION_EXISTS: "Exists as a location", SIMILAR_NAME: "Similar name exists", EXISTS_IN_OTHER_COUNTRY: "Exists in another country",
  SUPPLIER_CITY_MAPPED: "Supplier city mapped elsewhere", SAME_NAME_IN_REGION: "Name twice in one state", NAME_TAKEN: "Name already used",
  DECIDED_EXISTING: "Confirmed as existing", SUPPLIER_LINK: "Link to fill", SUPPLIER_LINKED: "Linked", SUPPLIER_RESOLVED: "Matched by ISO code",
  SUPPLIER_NAME_ONLY: "Matched by name only", SUPPLIER_UNRESOLVED: "Not resolved", SUPPLIER_CONFLICT: "Conflicting link",
  SUPPLIER_LINK_INVALID: "Links to a missing / deactivated country", SUPPLIER_COUNTRY_PENDING: "Country added by this run",
  CONTAINED_NAME: "Name contained in an existing city", NEAR_EXISTING_CITY: "Existing city at the same spot",
  LINK_FAR: "Same name, city's hotels elsewhere", ALREADY_LINKED: "Already linked (other name)",
  COUNTRY_DUPLICATED: "Country code used twice", NAME_TOO_LONG: "Name too long",
};

function ItemsTable({ path, params, active, reloadKey, onDecide, filters }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 350);
  const [iso, setIso] = useState("");
  const [itemStatus, setItemStatus] = useState("");
  const [sort, setSort] = useState("id");
  const [dir, setDir] = useState("asc");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  useEffect(() => setPage(0), [dq, iso, itemStatus, size]);
  const { page: data, loading, error } = usePagedList(path, { ...params, q: dq, iso: iso.trim(), status: itemStatus || params.status, sort, dir, page, size },
    active, reloadKey);
  const onSort = (field, d) => {
    setSort(field);
    setDir(d);
  };
  return (
    <div>
      {filters && (
        <FilterBar q={q} onQ={setQ} placeholder="Search name, reason, source id, record id…" status={itemStatus} onStatus={setItemStatus}
          statusOptions={ITEM_STATUS}>
          <Form.Control size="sm" className="acm-select acm-select-sm" value={iso} maxLength={3} placeholder="ISO"
            onChange={(e) => setIso(e.target.value.toUpperCase())} aria-label="Country ISO code" />
          {loading && <Spinner animation="border" size="sm" className="ms-1" />}
        </FilterBar>
      )}
      {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
      <div className="acm-table-wrap">
        <Table hover size="sm" className="acm-table mb-0">
          <thead>
            <tr>
              <SortTh label="#" field="id" sort={sort} dir={dir} onSort={onSort} />
              <SortTh label="Source record" field="name" sort={sort} dir={dir} onSort={onSort} />
              <SortTh label="Country" field="country" sort={sort} dir={dir} onSort={onSort} />
              <th>Ours</th>
              <SortTh label="Population" field="population" sort={sort} dir={dir} onSort={onSort} className="text-end" />
              <SortTh label="Result" field="reason" sort={sort} dir={dir} onSort={onSort} />
              <SortTh label="Status" field="status" sort={sort} dir={dir} onSort={onSort} />
              <th>Why</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data && data.content.length === 0 && <tr><td colSpan={9} className="acm-empty">Nothing in this list.</td></tr>}
            {(data?.content || []).map((it) => (
              <tr key={it.id}>
                <td className="small acm-muted">{it.id}</td>
                <td>
                  <div className="fw-semibold">{it.name}</div>
                  <div className="acm-muted small">
                    {it.type === "SUPPLIER_COUNTRY" ? <span className="acm-supplier">{providerLabel(it.provider)}</span> : it.type.toLowerCase()}
                    {" · "}{it.sourceId}{it.admin1 ? ` · ${it.admin1}` : ""}{it.featureCode ? ` · ${it.featureCode}` : ""}
                  </div>
                </td>
                <td>{it.countryIso}<div className="acm-muted small">{it.countryName}</div></td>
                <td className="small">
                  {it.createdId ? <>added #{it.createdId}<div className="acm-muted">{it.displayName}</div></>
                    : it.masterId ? <>#{it.masterId}<div className="acm-muted">{it.masterName || it.displayName}</div></>
                      : it.displayName && it.action !== "NONE" ? <span className="acm-muted">as “{it.displayName}”</span> : "—"}
                </td>
                <td className="text-end small">{it.population ? fmtNumber(it.population) : "—"}</td>
                <td>
                  <span className={`acm-tag tone-${it.classification === "VERIFIED" ? "ok" : it.classification === "REVIEW" ? "warn" : "idle"}`}>
                    {REASON_TEXT[it.reasonCode] || it.reasonCode}
                  </span>
                  {it.evidence?.sovereigntyLabel && <div className="acm-muted small mt-1">{it.evidence.sovereigntyLabel}{it.evidence.sovereign ? ` (${it.evidence.sovereign})` : ""}</div>}
                </td>
                <td>
                  <span className={`acm-tag tone-${it.status === "DONE" ? "ok" : it.status === "FAILED" ? "bad" : it.status === "PLANNED" ? "warn" : "idle"}`}>
                    {it.status === "PLANNED" ? (it.action || "").replace(/_/g, " ").toLowerCase() : it.status.replace(/_/g, " ").toLowerCase()}
                  </span>
                </td>
                <td className="small acm-detail">
                  {it.reason}
                  {it.resultDetail && <div className="text-success mt-1">{it.resultDetail}</div>}
                  {it.error && <div className="text-danger mt-1">{it.error}</div>}
                </td>
                <td className="text-end">
                  {it.classification === "REVIEW" && it.status !== "DONE" && (
                    <Button size="sm" variant="outline-primary" onClick={() => onDecide(it)}>Decide</Button>
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

function CountryTable({ rows }) {
  return (
    <div className="acm-table-wrap mb-3">
      <Table size="sm" className="acm-table mb-0">
        <thead>
          <tr>
            <th>Country</th><th className="text-end">Present</th><th className="text-end">To add</th><th className="text-end">Added</th>
            <th className="text-end">Review</th><th className="text-end">Held back</th><th className="text-end">Linked</th><th className="text-end">Failed</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).length === 0 && <tr><td colSpan={8} className="acm-empty">Nothing found.</td></tr>}
          {(rows || []).map((r) => (
            <tr key={r.iso}>
              <td>{r.iso} <span className="acm-muted small">{r.name}</span></td>
              <td className="text-end">{fmtNumber(r.present)}</td>
              <td className="text-end">{fmtNumber(r.toAdd)}</td>
              <td className="text-end">{fmtNumber(r.added)}</td>
              <td className="text-end">{fmtNumber(r.review)}</td>
              <td className="text-end">{fmtNumber(r.skipped)}</td>
              <td className="text-end">{fmtNumber(r.linked)}</td>
              <td className="text-end">{fmtNumber(r.failed)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function SupplierTables({ rows, mapping }) {
  return (
    <div className="acm-dedup-groups">
      <div className="acm-table-wrap">
        <Table size="sm" className="acm-table mb-0">
          <thead>
            <tr>
              <th>Supplier countries</th><th className="text-end">Countries</th><th className="text-end">Mapped</th><th className="text-end">Links to fill</th>
              <th className="text-end">Linked now</th><th className="text-end">Review</th><th className="text-end">Unresolved</th><th className="text-end">Conflicting</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).length === 0 && <tr><td colSpan={8} className="acm-empty">Nothing found.</td></tr>}
            {(rows || []).map((r) => (
              <tr key={r.provider}>
                <td>{providerLabel(r.provider)}</td>
                <td className="text-end">{fmtNumber(r.countries)}</td>
                <td className="text-end">{fmtNumber(r.mapped)}</td>
                <td className="text-end">{fmtNumber(r.toLink)}</td>
                <td className="text-end">{fmtNumber(r.linked)}</td>
                <td className="text-end">{fmtNumber(r.review)}</td>
                <td className="text-end">{fmtNumber(r.unresolved)}</td>
                <td className="text-end">{fmtNumber(r.conflicting)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      <div className="acm-table-wrap">
        <Table size="sm" className="acm-table mb-0">
          <thead>
            <tr><th>Supplier cities of added cities</th><th className="text-end">Results</th><th className="text-end">Mapped</th>
              <th className="text-end">Review</th><th className="text-end">No match</th></tr>
          </thead>
          <tbody>
            {(mapping || []).length === 0 && (
              <tr><td colSpan={5} className="acm-empty">No results yet. After applying, press Start Supplier Mapping; the automated mapping fills this in.</td></tr>
            )}
            {(mapping || []).map((r) => (
              <tr key={r.provider}>
                <td>{providerLabel(r.provider)}</td>
                <td className="text-end">{fmtNumber(r.results)}</td>
                <td className="text-end">{fmtNumber(r.mapped)}</td>
                <td className="text-end">{fmtNumber(r.review)}</td>
                <td className="text-end">{fmtNumber(r.noMatch)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}

function SourcesTable({ sources }) {
  const files = Object.entries(sources || {}).filter(([, v]) => v && typeof v === "object");
  return (
    <div className="acm-table-wrap mb-3">
      <Table size="sm" className="acm-table mb-0">
        <thead>
          <tr><th>File</th><th>Publisher / licence</th><th>Version</th><th>Fetched</th><th>Checksum (SHA-256)</th><th>Note</th></tr>
        </thead>
        <tbody>
          {files.length === 0 && <tr><td colSpan={6} className="acm-empty">No source information.</td></tr>}
          {files.map(([name, v]) => (
            <tr key={name}>
              <td className="small">{name}<div className="acm-muted">{v.url}</div></td>
              <td className="small">{v.publisher || "—"}<div className="acm-muted">{v.licence}</div></td>
              <td className="small">{v.lastModified || "—"}{v.changedSinceLastDownload ? <div className="text-success">changed</div> : null}</td>
              <td className="small">{v.fetchedAt || "—"}</td>
              <td className="small acm-muted">{v.sha256 ? `${v.sha256.slice(0, 16)}…` : "—"}</td>
              <td className="small">{v.warning || v.note || (v.used === false ? "not used" : "")}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="acm-muted small mt-2">
        {sources?.countriesRead !== undefined && <>Read {fmtNumber(sources.countriesRead)} countries and {fmtNumber(sources.placesRead)} populated places.</>}
      </div>
    </div>
  );
}

function RunLog({ runId, active, reloadKey }) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const { page: data, loading, error } = usePagedList(`/geo/runs/${runId}/log`, { page, size }, active, reloadKey);
  return (
    <div>
      {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
      <div className="acm-table-wrap">
        <Table size="sm" className="acm-table mb-0">
          <thead><tr><th>When</th><th>Event</th><th>Record</th><th>By</th><th>Detail</th></tr></thead>
          <tbody>
            {data && data.content.length === 0 && <tr><td colSpan={5} className="acm-empty">No log entries yet.</td></tr>}
            {(data?.content || []).map((a) => (
              <tr key={a.id}>
                <td className="small acm-muted text-nowrap">{fmtDate(a.createdAt)}</td>
                <td><span className="acm-event">{a.eventType.replace(/^GEO_/, "").replace(/_/g, " ").toLowerCase()}</span></td>
                <td>{a.cityName ? <>{a.cityName} {a.cityId && <span className="acm-muted small">#{a.cityId}</span>}</> : "—"}</td>
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

function ApplyDialog({ run, initial, counts, onHide, onStarted }) {
  const [chosen, setChosen] = useState(initial);
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const pick = (p) => setChosen((c) => (c.includes(p) ? c.filter((x) => x !== p) : [...c, p]));
  const start = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await axiosInstance.post(`${G}/runs/${run.id}/apply`, { parts: chosen, confirm });
      toast.success(res.data?.message || "Started.");
      onStarted();
    } catch (err) {
      setError(errorText(err, "Applying could not be started."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal show onHide={saving ? undefined : onHide} size="lg" centered backdrop="static" className="acm-modal">
      <Modal.Header closeButton={!saving}><Modal.Title as="h5">Apply verified items of scan #{run.id}</Modal.Title></Modal.Header>
      <Modal.Body>
        <p className="small">
          Only verified items are applied, in batches, countries first. Each one is checked again against the data as it is now (another
          administrator may have added it meanwhile: then it is skipped) and has its own savepoint, so one failure never undoes the others.
          New rows carry created_by {"“"}global-sync:geonames{"”"}. The automated mapping and the duplicate clean-up wait while this runs.
        </p>
        <Table size="sm" className="acm-cand">
          <thead><tr><th></th><th>Part</th><th className="text-end">Items to apply</th></tr></thead>
          <tbody>
            {Object.keys(PART_INFO).map((p) => (
              <tr key={p} className={chosen.includes(p) ? "is-picked" : ""}>
                <td><Form.Check checked={chosen.includes(p)} disabled={!counts[p]} onChange={() => pick(p)} aria-label={PART_INFO[p].label} /></td>
                <td>
                  <div className="fw-semibold small">{PART_INFO[p].label}</div>
                  <div className="acm-muted small">{PART_INFO[p].help}</div>
                </td>
                <td className="text-end">{fmtNumber(counts[p])}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Alert variant="info" className="small py-2">
          Nothing that exists is changed or deleted. You can roll the run back afterwards; records that something has started to use by then
          are kept.
        </Alert>
        <Form.Group>
          <Form.Label className="acm-label">Type APPLY to confirm</Form.Label>
          <Form.Control size="sm" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="APPLY" autoComplete="off" />
        </Form.Group>
        {error && <Alert variant="danger" className="small py-2 mt-3 mb-0">{error}</Alert>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" size="sm" onClick={onHide} disabled={saving}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={start} disabled={saving || chosen.length === 0 || confirm.trim() !== "APPLY"}>
          {saving ? <Spinner animation="border" size="sm" /> : "Apply"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function RollbackDialog({ run, onHide, onStarted }) {
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const start = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await axiosInstance.post(`${G}/runs/${run.id}/rollback`, { confirm });
      toast.success(res.data?.message || "Rollback started.");
      onStarted();
    } catch (err) {
      setError(errorText(err, "The rollback could not be started."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal show onHide={saving ? undefined : onHide} centered backdrop="static" className="acm-modal">
      <Modal.Header closeButton={!saving}><Modal.Title as="h5">Roll back run #{run.id}</Modal.Title></Modal.Header>
      <Modal.Body>
        <p className="small">
          Removes the countries and cities this run added, as long as nothing uses them yet (no hotel, booking, location, hand-made mapping
          or other reference; supplier mappings the automated mapping made for them are removed with them). Recorded links go back to what
          they were, and filled supplier links are emptied again. Records in use are kept and listed.
        </p>
        <Form.Group>
          <Form.Label className="acm-label">Type ROLLBACK to confirm</Form.Label>
          <Form.Control size="sm" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="ROLLBACK" autoComplete="off" />
        </Form.Group>
        {error && <Alert variant="danger" className="small py-2 mt-3 mb-0">{error}</Alert>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" size="sm" onClick={onHide} disabled={saving}>Cancel</Button>
        <Button variant="warning" size="sm" onClick={start} disabled={saving || confirm.trim() !== "ROLLBACK"}>
          {saving ? <Spinner animation="border" size="sm" /> : "Roll back"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
