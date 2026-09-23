import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Card,
  Form,
  Button,
  Row,
  Col,
  Badge,
  Spinner,
  Alert,
  Table,
  Modal,
  Accordion,
  Collapse,
  Tabs,
  Tab,
  ProgressBar,
  InputGroup,
} from "react-bootstrap";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import BackButton from "../../components/BackButton";
import axiosInstance from "../../components/AxiosInstance";
import "../../styles/BulkCityMapping.css";

/**
 * Bulk (Auto) City Mapping — Manage Masters ▸ Mapping Settings ▸ Bulk Auto Mapping.
 *
 * One-click driver for the automatic api_city_mapping filler behind
 * POST /api/cityMapping/bulk. Runs a dry-run (Preview) first, shows counts +
 * the leftovers per supplier, then Applies with a drift check — the BE
 * re-runs a fresh preview and refuses to write if row counts changed since
 * the operator's own Preview.
 *
 * The leftovers the engine cannot decide (unmatched / ambiguous / conflicts)
 * are resolved right here: every row has a "Map" button that opens
 * MapCityModal, which lists the supplier's cities for the same country
 * (GET /api/cityMapping/bulk/candidates, best name match first) and writes
 * the chosen pair through POST /api/cityMapping/bulk/pairs — the same
 * validated path the reviewed-pairs import uses, so existing rows are never
 * overwritten and a supplier city already used elsewhere is refused unless
 * the operator explicitly allows sharing.
 *
 * Restricted to super_admin at the route (see App.jsx) and Sidebar levels.
 * The BE endpoints accept ADMIN or SUPER_ADMIN so curl / JUnit runners work.
 */

/** Providers the BE bulk engine currently supports (lowercase keys the BE expects). */
const SUPPORTED_PROVIDERS = [
  "atharva",
  "grn",
  "iwtx",
  "x3",
  "darina",
  "ratehawk",
];

/** Providers the automatic engine does NOT map today, with the reason shown on hover. */
const UNSUPPORTED_PROVIDERS = [
  {
    key: "goglobal",
    reason:
      "GoGlobal's city list isn't stored in this project's database (no goglobal_destinations table), so there is nothing to match against.",
  },
  {
    key: "jumeirah",
    reason:
      "Jumeirah uses hotel-level mapping (jumeirah_hotel_list.mapper_id), not city-level rows in api_city_mapping.",
  },
  {
    key: "juniper",
    reason: "Juniper's bulk mapping isn't implemented yet.",
  },
];

const PROVIDER_LABEL = {
  atharva: "Atharva",
  grn: "GRN",
  goglobal: "GoGlobal",
  iwtx: "IWTX",
  x3: "X3",
  darina: "Darina",
  ratehawk: "RateHawk",
  jumeirah: "Jumeirah",
  juniper: "Juniper",
};

const labelOf = (key) => PROVIDER_LABEL[key] || key;
const num = (n) => Number(n || 0).toLocaleString();

/** What each count means — shown as tooltips on the tiles and header chips. */
const COUNT_HELP = {
  new: "Rows Apply will insert into api_city_mapping.",
  matched:
    "Inhouse cities the engine paired with exactly one supplier city (includes pairs that already exist).",
  already: "Pairs that are already in api_city_mapping — never touched.",
  ambiguous:
    "Several supplier cities share the name, so the engine did not guess. Pick the right one with Map.",
  unmatched:
    "No supplier city with this name. Search the supplier's list with Map — or the supplier simply does not cover the city.",
};

const SCORE_LABEL = {
  100: "Same name",
  80: "Similar",
  60: "Word match",
  50: "Same code",
};

/** Debounced value — the dialog's two search boxes hit the BE only after typing pauses. */
const useDebounced = (value, ms = 300) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
};

const BulkCityMapping = () => {
  // Providers list from the BE (fallback to SUPPORTED_PROVIDERS on error).
  const [providers, setProviders] = useState(SUPPORTED_PROVIDERS);
  const [selectedProviders, setSelectedProviders] = useState(
    new Set(SUPPORTED_PROVIDERS),
  );
  const [suffixStripping, setSuffixStripping] = useState(true);
  const [sampleLimit, setSampleLimit] = useState(100);
  const [showOptions, setShowOptions] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [loading, setLoading] = useState(null); // "preview" | "apply" | null
  const [previewResult, setPreviewResult] = useState(null);
  const [applyResult, setApplyResult] = useState(null);
  const [driftResult, setDriftResult] = useState(null); // preview from BE when drift was detected
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // In-page mapping: which leftover rows were mapped this session (so the
  // lists and counts reflect it without re-running Preview), and the dialog.
  const [resolved, setResolved] = useState(new Map()); // "provider:masterCityId" -> list name
  const [mapTarget, setMapTarget] = useState(null); // { provider, city|null, list|null }

  // Fetch the BE's actual provider list — if a supplier is disabled server-side
  // or a new one is added, we show that instead of the hardcoded fallback.
  useEffect(() => {
    axiosInstance
      .get("/api/cityMapping/bulk/providers")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : SUPPORTED_PROVIDERS;
        setProviders(list);
        setSelectedProviders(new Set(list));
      })
      .catch(() => {
        setProviders(SUPPORTED_PROVIDERS);
        setSelectedProviders(new Set(SUPPORTED_PROVIDERS));
      });
  }, []);

  const toggleProvider = (key) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = (check) => {
    setSelectedProviders(check ? new Set(providers) : new Set());
  };

  // The result we display: apply wins over preview so a successful write
  // replaces the previous preview panel without the operator re-clicking Preview.
  const displayResult = applyResult || previewResult;

  const totalNewRows = (result) =>
    (result?.providers || []).reduce((s, p) => s + (p.newMappings || 0), 0);

  // Apply needs: a preview this session, ≥1 supplier ticked, ≥1 new row, no run in flight.
  const canApply = useMemo(() => {
    if (!previewResult || loading || selectedProviders.size === 0) return false;
    return (previewResult.providers || []).some((p) => (p.newMappings || 0) > 0);
  }, [previewResult, loading, selectedProviders]);

  const buildRequest = (dryRun, expectedNewRows = null) => ({
    providers: Array.from(selectedProviders),
    dryRun,
    sampleLimit: Number(sampleLimit) || 100,
    suffixStripping,
    ...(expectedNewRows ? { expectedNewRows } : {}),
  });

  const runPreview = async () => {
    if (selectedProviders.size === 0) {
      toast.error("Pick at least one supplier first.");
      return;
    }
    setLoading("preview");
    setPreviewResult(null);
    setApplyResult(null);
    setDriftResult(null);
    setResolved(new Map());
    try {
      const res = await axiosInstance.post(
        "/api/cityMapping/bulk",
        buildRequest(true),
      );
      setPreviewResult(res.data || null);
      toast.success("Preview complete.");
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.message || "Preview failed.");
    } finally {
      setLoading(null);
    }
  };

  const doApply = async () => {
    if (!previewResult) return;
    setShowConfirmModal(false);
    // Expected counts from the last preview, restricted to the suppliers still
    // ticked — an un-ticked supplier must not count against the drift check.
    const expected = {};
    (previewResult.providers || []).forEach((p) => {
      if (selectedProviders.has(p.provider)) expected[p.provider] = p.newMappings || 0;
    });

    setLoading("apply");
    setApplyResult(null);
    setDriftResult(null);
    try {
      const res = await axiosInstance.post(
        "/api/cityMapping/bulk",
        buildRequest(false, expected),
      );
      const data = res.data;
      if (data && data.driftDetected) {
        // The BE ran a fresh preview and found the counts moved — it did NOT write.
        setDriftResult(data);
        toast.error("Row counts changed since your preview — nothing written.");
      } else {
        setApplyResult(data || null);
        setResolved(new Map());
        toast.success("Mappings written.");
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.message || "Apply failed.");
    } finally {
      setLoading(null);
    }
  };

  const downloadReport = () => {
    const data = displayResult;
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `bulk-city-mapping-${data.dryRun ? "preview" : "applied"}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** Open the mapping dialog for one leftover row (or, with city=null, for any inhouse city). */
  const openMap = (provider, city = null, list = null) =>
    setMapTarget({ provider, city, list });

  const handleMapped = useCallback((provider, masterCityId) => {
    setResolved((prev) => {
      const next = new Map(prev);
      const key = `${provider}:${masterCityId}`;
      if (!next.has(key)) next.set(key, mapTarget?.list || "other");
      return next;
    });
  }, [mapTarget]);

  /** Counts per supplier after this session's in-page mappings. */
  const resolvedCounts = useMemo(() => {
    const out = {};
    resolved.forEach((list, key) => {
      const provider = key.split(":")[0];
      const c = (out[provider] = out[provider] || { total: 0, unmatched: 0, ambiguous: 0, conflict: 0 });
      c.total += 1;
      if (c[list] !== undefined) c[list] += 1;
    });
    return out;
  }, [resolved]);

  const totals = useMemo(() => {
    const ps = displayResult?.providers || [];
    const sum = (f) => ps.reduce((s, p) => s + (p[f] || 0), 0);
    const mappedHere = Object.values(resolvedCounts).reduce((s, c) => s + c.total, 0);
    return {
      newRows: sum("newMappings"),
      matched: sum("matched"),
      already: sum("alreadyMapped") + mappedHere,
      ambiguous: sum("ambiguous") - Object.values(resolvedCounts).reduce((s, c) => s + c.ambiguous, 0),
      unmatched: sum("unmatched") - Object.values(resolvedCounts).reduce((s, c) => s + c.unmatched, 0),
      inserted: sum("inserted"),
      mappedHere,
    };
  }, [displayResult, resolvedCounts]);

  const formatStamp = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column bcm-page">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          {/* ── Heading ─────────────────────────────────────────── */}
          <div className="d-flex align-items-center flex-wrap gap-2 mb-1">
            <BackButton />
            <h4 className="mb-0">Bulk (Auto) City Mapping</h4>
            <Badge bg="dark">Super Admin</Badge>
            <Button
              variant="link"
              size="sm"
              className="ms-auto p-0"
              onClick={() => setShowHelp((v) => !v)}
            >
              {showHelp ? "Hide help" : "How it works"}
            </Button>
          </div>
          <p className="text-muted small mb-3">
            Fills the gaps in <code>api_city_mapping</code> from each supplier's own
            city list, then lets you map whatever it could not decide — all on this page.
          </p>

          <Collapse in={showHelp}>
            <div>
              <Alert variant="light" className="border small">
                <ol className="mb-2 ps-3">
                  <li>
                    <strong>Preview</strong> compares every inhouse city with the
                    supplier's cities of the same country (exact → case → accents /
                    punctuation → state suffix). Nothing is written.
                  </li>
                  <li>
                    <strong>Apply</strong> inserts only the rows Preview showed as{" "}
                    <em>new</em>. Existing rows (even soft-deleted) are never modified,
                    and the write is refused if the counts changed in between.
                  </li>
                  <li>
                    <strong>Leftovers</strong> — <em>ambiguous</em> (several supplier
                    cities share the name) and <em>unmatched</em> (no supplier city with
                    that name) — cannot be decided by a machine. Click <strong>Map</strong>{" "}
                    on a row: you get the supplier's cities for that country, best match
                    first, and can search the whole list for a different spelling
                    (e.g. inhouse "New Delhi" ↔ supplier "Delhi").
                  </li>
                  <li>
                    A supplier that has no cities in a country cannot map that
                    country's inhouse cities at all — those stay unmatched, and that is
                    the normal case for suppliers with a small footprint (Darina,
                    RateHawk).
                  </li>
                </ol>
                <span className="text-muted">
                  Hotel-code lists on a mapping are edited on the{" "}
                  <Link to="/masters/city-mapping">manual City Mapping screen</Link>.
                </span>
              </Alert>
            </div>
          </Collapse>

          {/* ── Step 1 · Suppliers ────────────────────────────────── */}
          <Card className="mb-3 shadow-sm bcm-step">
            <Card.Header className="d-flex align-items-center justify-content-between flex-wrap gap-2">
              <span>
                <span className="bcm-step-no">1</span>Suppliers
                <small className="text-muted fw-normal ms-2">
                  {selectedProviders.size} of {providers.length} selected
                </small>
              </span>
              <div className="d-flex gap-2">
                <Button variant="outline-secondary" size="sm" onClick={() => toggleAll(true)}>
                  Select all
                </Button>
                <Button variant="outline-secondary" size="sm" onClick={() => toggleAll(false)}>
                  Clear
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="d-flex flex-wrap gap-2">
              {providers.map((key) => {
                const on = selectedProviders.has(key);
                return (
                  <label key={key} className={`bcm-chip ${on ? "is-on" : ""}`}>
                    <input type="checkbox" checked={on} onChange={() => toggleProvider(key)} />
                    {labelOf(key)}
                  </label>
                );
              })}
              {UNSUPPORTED_PROVIDERS.map((up) => (
                <label key={up.key} className="bcm-chip is-off-limits" title={up.reason}>
                  <input type="checkbox" disabled />
                  {labelOf(up.key)} <small>· not supported</small>
                </label>
              ))}
            </Card.Body>
          </Card>

          {/* ── Step 2 · Options (collapsed by default) ───────────── */}
          <Card className="mb-3 shadow-sm bcm-step">
            <Card.Header
              className="d-flex align-items-center justify-content-between"
              role="button"
              onClick={() => setShowOptions((v) => !v)}
            >
              <span>
                <span className="bcm-step-no">2</span>Options
                <small className="text-muted fw-normal ms-2">
                  suffix stripping {suffixStripping ? "on" : "off"} · {Number(sampleLimit) || 100}{" "}
                  rows listed per category
                </small>
              </span>
              <Button variant="link" size="sm" className="p-0">
                {showOptions ? "Hide" : "Change"}
              </Button>
            </Card.Header>
            <Collapse in={showOptions}>
              <div>
                <Card.Body>
                  <Row className="g-3">
                    <Col md={6}>
                      <Form.Check
                        type="switch"
                        id="bulk-suffix-stripping"
                        checked={suffixStripping}
                        onChange={(e) => setSuffixStripping(e.target.checked)}
                        label="Suffix stripping"
                      />
                      <Form.Text className="text-muted">
                        Drops trailing US / CA / AU state tokens ("Abilene, TX" ↔ "Abilene")
                        only when the finer levels found nothing, only for 1:1 groups, and
                        never when the two sides carry different city codes.
                      </Form.Text>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label className="small mb-1">Rows listed per category</Form.Label>
                        <Form.Control
                          type="number"
                          min={0}
                          max={2000}
                          value={sampleLimit}
                          onChange={(e) => setSampleLimit(e.target.value)}
                          size="sm"
                          style={{ maxWidth: 140 }}
                        />
                        <Form.Text className="text-muted">
                          How many unmatched / ambiguous / conflict rows each supplier
                          returns for review (max 2000). Raise it to reach more leftovers;
                          the counts are always complete.
                        </Form.Text>
                      </Form.Group>
                    </Col>
                  </Row>
                </Card.Body>
              </div>
            </Collapse>
          </Card>

          {/* ── Step 3 · Run ──────────────────────────────────────── */}
          <div className="bcm-actions">
            <div className="d-flex align-items-center flex-wrap gap-2">
              <span className="me-1">
                <span className="bcm-step-no">3</span>
                <strong>Run</strong>
              </span>
              <Button
                variant="outline-primary"
                onClick={runPreview}
                disabled={loading !== null || selectedProviders.size === 0}
              >
                {loading === "preview" ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-1" />
                    Previewing…
                  </>
                ) : (
                  "Preview (Dry Run)"
                )}
              </Button>
              <Button
                variant="primary"
                onClick={() => setShowConfirmModal(true)}
                disabled={!canApply || loading !== null}
                title={
                  !previewResult
                    ? "Run a Preview first."
                    : !canApply
                      ? "Preview found no new rows to write."
                      : "Write the new rows to api_city_mapping."
                }
              >
                {loading === "apply" ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-1" />
                    Applying…
                  </>
                ) : previewResult && !applyResult ? (
                  `Apply ${num(totalNewRows(previewResult))} new rows`
                ) : (
                  "Apply"
                )}
              </Button>
              <Button
                variant="outline-secondary"
                onClick={() => openMap(providers[0] || SUPPORTED_PROVIDERS[0])}
                disabled={loading !== null}
                title="Map any inhouse city to a supplier city without running Preview."
              >
                Map a city…
              </Button>
              {displayResult && (
                <Button variant="outline-secondary" onClick={downloadReport}>
                  Download JSON report
                </Button>
              )}
              {displayResult && (
                <small className="text-muted ms-auto">
                  {displayResult.dryRun ? "Previewed" : "Applied"}{" "}
                  {formatStamp(displayResult.startedAt)} · {num(displayResult.durationMs)} ms ·{" "}
                  {displayResult.actor}
                </small>
              )}
            </div>
          </div>

          {/* ── Drift banner ──────────────────────────────────────── */}
          {driftResult && (
            <Alert variant="warning" className="mb-3">
              <strong>Row counts changed since your preview.</strong> Nothing was
              written. Re-run Preview to see the current numbers and decide.
              <div className="small mt-2">
                {Object.entries(driftResult.driftBySupplier || {}).map(([prov, drift]) => (
                  <div key={prov}>
                    <strong>{labelOf(prov)}</strong>: preview showed {num(drift.expected)} new
                    rows, current is {num(drift.actual)}.
                  </div>
                ))}
              </div>
            </Alert>
          )}

          {/* ── Empty state ───────────────────────────────────────── */}
          {!displayResult && loading !== "preview" && (
            <Card className="shadow-sm">
              <Card.Body className="bcm-empty py-5">
                Run <strong>Preview (Dry Run)</strong> to see what can be mapped
                automatically for the selected suppliers — or use <strong>Map a city…</strong>{" "}
                to map one inhouse city right away.
              </Card.Body>
            </Card>
          )}
          {loading === "preview" && !displayResult && (
            <Card className="shadow-sm">
              <Card.Body className="bcm-empty py-5">
                <Spinner animation="border" size="sm" className="me-2" />
                Comparing inhouse cities with {selectedProviders.size} supplier
                {selectedProviders.size === 1 ? "" : "s"}… this usually takes a few seconds.
              </Card.Body>
            </Card>
          )}

          {/* ── Results ───────────────────────────────────────────── */}
          {displayResult && (
            <>
              <Row xs={2} md={5} className="g-2 mb-3">
                <Col>
                  <div className="bcm-tile is-new" title={COUNT_HELP.new}>
                    <div className="bcm-tile-label">
                      {displayResult.dryRun ? "New rows" : "Inserted"}
                    </div>
                    <div className="bcm-tile-value">
                      {num(displayResult.dryRun ? totals.newRows : totals.inserted)}
                    </div>
                    <div className="bcm-tile-hint">
                      {displayResult.dryRun ? "written on Apply" : "rows written"}
                    </div>
                  </div>
                </Col>
                <Col>
                  <div className="bcm-tile is-ok" title={COUNT_HELP.matched}>
                    <div className="bcm-tile-label">Matched</div>
                    <div className="bcm-tile-value">{num(totals.matched)}</div>
                    <div className="bcm-tile-hint">paired by name</div>
                  </div>
                </Col>
                <Col>
                  <div className="bcm-tile" title={COUNT_HELP.already}>
                    <div className="bcm-tile-label">Already mapped</div>
                    <div className="bcm-tile-value">{num(totals.already)}</div>
                    <div className="bcm-tile-hint">
                      {totals.mappedHere > 0 ? `incl. ${num(totals.mappedHere)} mapped here` : "untouched"}
                    </div>
                  </div>
                </Col>
                <Col>
                  <div className="bcm-tile is-warn" title={COUNT_HELP.ambiguous}>
                    <div className="bcm-tile-label">Ambiguous</div>
                    <div className="bcm-tile-value">{num(totals.ambiguous)}</div>
                    <div className="bcm-tile-hint">pick manually</div>
                  </div>
                </Col>
                <Col>
                  <div className="bcm-tile is-bad" title={COUNT_HELP.unmatched}>
                    <div className="bcm-tile-label">Unmatched</div>
                    <div className="bcm-tile-value">{num(totals.unmatched)}</div>
                    <div className="bcm-tile-hint">search or not covered</div>
                  </div>
                </Col>
              </Row>

              <Card className="shadow-sm">
                <Card.Header className="d-flex justify-content-between align-items-center">
                  <strong>Per supplier</strong>
                  <small className="text-muted">
                    Expand a supplier to review and map its leftovers.
                  </small>
                </Card.Header>
                <Card.Body>
                  <Accordion alwaysOpen>
                    {(displayResult.providers || []).map((p, idx) => (
                      <SupplierPanel
                        key={p.provider}
                        eventKey={String(idx)}
                        stats={p}
                        dryRun={displayResult.dryRun}
                        resolved={resolved}
                        resolvedCounts={resolvedCounts[p.provider]}
                        onMap={openMap}
                      />
                    ))}
                  </Accordion>
                </Card.Body>
              </Card>
            </>
          )}
        </main>
      </div>

      {/* ── Map dialog ───────────────────────────────────────────── */}
      <MapCityModal
        target={mapTarget}
        providers={providers}
        onHide={() => setMapTarget(null)}
        onMapped={handleMapped}
      />

      {/* ── Confirm Apply modal ─────────────────────────────────────── */}
      <Modal show={showConfirmModal} onHide={() => setShowConfirmModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Confirm write</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">
            Write <strong>{num(totalNewRows(previewResult))}</strong> new rows to{" "}
            <code>api_city_mapping</code>?
          </p>
          <Table size="sm" borderless>
            <tbody>
              {(previewResult?.providers || [])
                .filter((p) => selectedProviders.has(p.provider) && (p.newMappings || 0) > 0)
                .map((p) => (
                  <tr key={p.provider}>
                    <td className="py-0">{labelOf(p.provider)}</td>
                    <td className="py-0 text-end">
                      <strong>{num(p.newMappings)}</strong> new
                    </td>
                  </tr>
                ))}
            </tbody>
          </Table>
          <div className="small text-muted mt-2">
            The server re-verifies these counts before writing. If another operator
            edits the mapping table in between, the request is refused and nothing is
            inserted.
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowConfirmModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={doApply}>
            Yes, write to database
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────── */

/** One supplier's accordion item: coverage + counts in the header, details and leftovers inside. */
const SupplierPanel = ({ eventKey, stats: p, dryRun, resolved, resolvedCounts, onMap }) => {
  const rc = resolvedCounts || { total: 0, unmatched: 0, ambiguous: 0, conflict: 0 };
  const checked = p.inhouseCitiesChecked || 0;
  const matched = p.matched || 0;
  const pct = checked > 0 ? Math.min(100, Math.round((matched / checked) * 100)) : 0;
  const unmatched = Math.max(0, (p.unmatched || 0) - rc.unmatched);
  const ambiguous = Math.max(0, (p.ambiguous || 0) - rc.ambiguous);

  return (
    <Accordion.Item eventKey={eventKey}>
      <Accordion.Header>
        <div className="bcm-sup-head">
          <span className="bcm-sup-name">{labelOf(p.provider)}</span>
          <div className="bcm-coverage">
            <ProgressBar now={pct} />
            <small>
              {num(matched)} of {num(checked)} inhouse cities matched ({pct}%)
            </small>
          </div>
          <div className="bcm-counts">
            {p.error ? (
              <span className="bcm-count is-err">error</span>
            ) : (
              <span className="bcm-count is-new" title={COUNT_HELP.new}>
                {num(dryRun ? p.newMappings : p.inserted)} {dryRun ? "new" : "inserted"}
              </span>
            )}
            <span className="bcm-count is-done" title={COUNT_HELP.already}>
              {num((p.alreadyMapped || 0) + rc.total)} already
            </span>
            <span className="bcm-count is-warn" title={COUNT_HELP.ambiguous}>
              {num(ambiguous)} ambiguous
            </span>
            <span className="bcm-count is-bad" title={COUNT_HELP.unmatched}>
              {num(unmatched)} unmatched
            </span>
          </div>
        </div>
      </Accordion.Header>
      <Accordion.Body>
        {p.error && (
          <Alert variant="danger" className="py-2 small">
            {p.error}
          </Alert>
        )}

        <Row className="g-3 mb-3">
          <Col md={6}>
            <dl className="bcm-kv mb-0">
              <dt>Countries resolved</dt>
              <dd>
                {num(p.countriesResolved)} / {num(p.supplierCountries)}
                {p.countriesUnresolved > 0 && (
                  <span className="text-muted"> · {num(p.countriesUnresolved)} unresolved</span>
                )}
              </dd>
              <dt>Supplier cities</dt>
              <dd>{num(p.supplierCities)}</dd>
              <dt>Inhouse cities checked</dt>
              <dd>
                {num(p.inhouseCitiesChecked)}
                {p.inhouseCitiesInUnresolvedCountries > 0 && (
                  <span className="text-muted">
                    {" "}· {num(p.inhouseCitiesInUnresolvedCountries)} in countries this supplier
                    does not cover
                  </span>
                )}
              </dd>
              <dt>No-hotel skips</dt>
              <dd>{num(p.skippedNoHotels)}</dd>
              {!dryRun && (
                <>
                  <dt>Inserted</dt>
                  <dd>
                    <strong>{num(p.inserted)}</strong>
                    {p.insertErrors > 0 && (
                      <span className="text-danger"> · {num(p.insertErrors)} insert errors</span>
                    )}
                  </dd>
                </>
              )}
            </dl>
          </Col>
          <Col md={6}>
            <dl className="bcm-kv mb-0">
              {Object.entries(p.matchedByLevel || {}).map(([lvl, n]) => (
                <React.Fragment key={lvl}>
                  <dt>{lvl.toLowerCase().replace(/_/g, " ")}</dt>
                  <dd>{num(n)}</dd>
                </React.Fragment>
              ))}
              {p.matchedViaCodeTieBreak > 0 && (
                <>
                  <dt>via code tie-break</dt>
                  <dd>{num(p.matchedViaCodeTieBreak)}</dd>
                </>
              )}
              {p.rejectedCodeConflict > 0 && (
                <>
                  <dt>suffix rejected (code conflict)</dt>
                  <dd>{num(p.rejectedCodeConflict)}</dd>
                </>
              )}
              {p.supplierCityAlreadyUsed > 0 && (
                <>
                  <dt>supplier city already used</dt>
                  <dd>{num(p.supplierCityAlreadyUsed)}</dd>
                </>
              )}
            </dl>
          </Col>
        </Row>

        <LeftoverTabs stats={p} resolved={resolved} onMap={onMap} />
      </Accordion.Body>
    </Accordion.Item>
  );
};

/** Unmatched / Ambiguous / Conflicts / Unresolved countries with a search box and Map buttons. */
const LeftoverTabs = ({ stats: p, resolved, onMap }) => {
  const [q, setQ] = useState("");
  const lists = [
    { key: "unmatched", title: "Unmatched", rows: p.unmatchedSamples || [], total: p.unmatched || 0 },
    { key: "ambiguous", title: "Ambiguous", rows: p.ambiguousSamples || [], total: p.ambiguous || 0 },
    { key: "conflict", title: "Conflicts", rows: p.conflictSamples || [], total: (p.conflictSamples || []).length },
  ];
  const countries = p.unresolvedCountrySamples || [];
  const firstWithRows = lists.find((l) => l.rows.length > 0)?.key || (countries.length ? "countries" : "unmatched");
  const [tab, setTab] = useState(firstWithRows);

  if (lists.every((l) => l.rows.length === 0) && countries.length === 0) {
    return <div className="bcm-empty">Nothing left to review for this supplier.</div>;
  }

  const needle = q.trim().toLowerCase();
  const filterRows = (rows) =>
    needle
      ? rows.filter((s) =>
          [s.masterCity, s.countryIso, s.detail].some((v) =>
            String(v || "").toLowerCase().includes(needle),
          ),
        )
      : rows;

  return (
    <div className="bcm-leftovers">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
        <strong className="small">Leftovers to review</strong>
        <Form.Control
          size="sm"
          placeholder="Filter by city, country or detail…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 280 }}
        />
      </div>
      <Tabs activeKey={tab} onSelect={(k) => setTab(k)} className="mb-2">
        {lists.map((l) => (
          <Tab
            key={l.key}
            eventKey={l.key}
            title={`${l.title} (${num(l.total)}${l.rows.length < l.total ? `, ${num(l.rows.length)} listed` : ""})`}
            disabled={l.rows.length === 0}
          >
            <LeftoverTable
              rows={filterRows(l.rows)}
              list={l.key}
              provider={p.provider}
              resolved={resolved}
              onMap={onMap}
              hint={
                l.key === "ambiguous"
                  ? "The detail column lists the supplier cities that share the name — open Map to pick one."
                  : l.key === "conflict"
                    ? "These pairs were not written; the detail column says why."
                    : "No supplier city carries this name. Map lets you search the supplier's list for another spelling."
              }
            />
          </Tab>
        ))}
        <Tab
          eventKey="countries"
          title={`Unresolved countries (${num(countries.length)})`}
          disabled={countries.length === 0}
        >
          <div className="small text-muted mb-2">
            Supplier countries that could not be matched to a master country (by link, ISO
            code or name). Their cities were not compared at all.
          </div>
          <div className="small">{countries.join(", ")}</div>
        </Tab>
      </Tabs>
    </div>
  );
};

const LeftoverTable = ({ rows, list, provider, resolved, onMap, hint }) => {
  const [expanded, setExpanded] = useState(false);
  const PAGE = 25;
  if (rows.length === 0) return <div className="bcm-empty">No rows match.</div>;
  const shown = expanded ? rows : rows.slice(0, PAGE);
  return (
    <>
      <div className="small text-muted mb-2">{hint}</div>
      <Table size="sm" hover responsive className="mb-1">
        <thead>
          <tr className="text-muted">
            <th>Inhouse city</th>
            <th style={{ width: 80 }}>Country</th>
            <th>Detail</th>
            <th style={{ width: 110 }} />
          </tr>
        </thead>
        <tbody>
          {shown.map((s, i) => {
            const done = s.masterCityId && resolved.has(`${provider}:${s.masterCityId}`);
            return (
              <tr key={`${s.masterCityId}-${i}`}>
                <td>{s.masterCity || (s.masterCityId ? `#${s.masterCityId}` : "—")}</td>
                <td>{s.countryIso || "—"}</td>
                <td className="bcm-detail">{s.detail || "—"}</td>
                <td className="text-end">
                  {done ? (
                    <Badge bg="success">Mapped</Badge>
                  ) : s.masterCityId ? (
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() =>
                        onMap(
                          provider,
                          { masterCityId: s.masterCityId, masterCity: s.masterCity, countryIso: s.countryIso },
                          list,
                        )
                      }
                    >
                      Map
                    </Button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {rows.length > PAGE && (
        <Button variant="link" size="sm" className="p-0" onClick={() => setExpanded((e) => !e)}>
          {expanded ? `Show first ${PAGE}` : `Show all ${num(rows.length)}`}
        </Button>
      )}
    </>
  );
};

/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Map one inhouse city to a supplier city.
 *
 * target = { provider, city: {masterCityId, masterCity, countryIso} | null, list }.
 * With city=null the dialog first asks for an inhouse city (search by name).
 */
const MapCityModal = ({ target, providers, onHide, onMapped }) => {
  const show = !!target;
  const [provider, setProvider] = useState("");
  const [city, setCity] = useState(null); // { id, name, countryIso, stateCode? }
  const [cityQuery, setCityQuery] = useState("");
  const [cityHits, setCityHits] = useState([]);
  const [cityLoading, setCityLoading] = useState(false);

  const [q, setQ] = useState("");
  const [lookup, setLookup] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [picked, setPicked] = useState(null); // supplierCityId
  const [allowShared, setAllowShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const debouncedCityQuery = useDebounced(cityQuery);
  const debouncedQ = useDebounced(q);

  // Reset everything whenever the dialog is (re)opened for a target.
  useEffect(() => {
    if (!target) return;
    setProvider(target.provider || providers[0] || "");
    setCity(
      target.city
        ? { id: target.city.masterCityId, name: target.city.masterCity, countryIso: target.city.countryIso }
        : null,
    );
    setCityQuery("");
    setCityHits([]);
    setQ("");
    setLookup(null);
    setLookupError("");
    setPicked(null);
    setAllowShared(false);
    setSaveError("");
  }, [target, providers]);

  // Inhouse city search (only in the "pick a city" stage).
  useEffect(() => {
    if (!show || city || debouncedCityQuery.trim().length < 2) {
      setCityHits([]);
      return;
    }
    let cancelled = false;
    setCityLoading(true);
    axiosInstance
      .get("/api/cityMapping/bulk/master-cities", { params: { q: debouncedCityQuery.trim(), limit: 30 } })
      .then((res) => {
        if (!cancelled) setCityHits(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setCityHits([]);
      })
      .finally(() => {
        if (!cancelled) setCityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [show, city, debouncedCityQuery]);

  // Supplier candidates for (provider, city), re-queried when the search box changes.
  useEffect(() => {
    if (!show || !city || !provider) return;
    let cancelled = false;
    setLookupLoading(true);
    setLookupError("");
    axiosInstance
      .get("/api/cityMapping/bulk/candidates", {
        params: { provider, masterCityId: city.id, q: debouncedQ.trim() || undefined, limit: 50 },
      })
      .then((res) => {
        if (cancelled) return;
        setLookup(res.data || null);
        setPicked((prev) =>
          prev && (res.data?.candidates || []).some((c) => c.supplierCityId === prev) ? prev : null,
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setLookup(null);
        setLookupError(err?.response?.data?.error || err?.message || "Lookup failed.");
      })
      .finally(() => {
        if (!cancelled) setLookupLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [show, city, provider, debouncedQ]);

  const pickedCandidate = (lookup?.candidates || []).find((c) => c.supplierCityId === picked) || null;
  const alreadyMapped = (lookup?.existing || []).length > 0;
  const needsShare = !!pickedCandidate?.mappedToMasterCityId;

  const save = async () => {
    if (!city || !pickedCandidate) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await axiosInstance.post("/api/cityMapping/bulk/pairs", {
        dryRun: false,
        allowSharedSupplierCity: needsShare && allowShared,
        pairs: [{ provider, masterCityId: city.id, supplierCityId: pickedCandidate.supplierCityId }],
      });
      const stats = (res.data?.providers || [])[0];
      if (!stats) throw new Error("Unexpected response from the server.");
      if (stats.error) throw new Error(stats.error);
      if ((stats.inserted || 0) >= 1) {
        toast.success(`${city.name} → ${pickedCandidate.name} (${labelOf(provider)}) mapped.`);
        onMapped(provider, city.id);
        onHide();
        return;
      }
      const why =
        (stats.conflictSamples || [])[0]?.detail ||
        (stats.unmatchedSamples || [])[0]?.detail ||
        (stats.insertErrors > 0 ? "Insert failed on the server — see the backend log." : "The server did not write this pair.");
      setSaveError(why);
    } catch (err) {
      setSaveError(err?.response?.data?.error || err?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered size="lg" backdrop={saving ? "static" : true}>
      <Modal.Header closeButton={!saving}>
        <Modal.Title className="fs-5">
          Map inhouse city → {labelOf(provider) || "supplier"}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Supplier (changeable only when the dialog was opened from "Map a city…") */}
        {!target?.list && (
          <Form.Group className="mb-3">
            <Form.Label className="small mb-1">Supplier</Form.Label>
            <Form.Select
              size="sm"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setPicked(null);
              }}
              style={{ maxWidth: 240 }}
            >
              {providers.map((k) => (
                <option key={k} value={k}>
                  {labelOf(k)}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        )}

        {/* Stage 1 · pick the inhouse city */}
        {!city && (
          <>
            <Form.Label className="small mb-1">Inhouse city</Form.Label>
            <InputGroup size="sm" className="mb-2">
              <Form.Control
                autoFocus
                placeholder="Type at least 2 letters of the city name…"
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
              />
              {cityLoading && (
                <InputGroup.Text>
                  <Spinner animation="border" size="sm" />
                </InputGroup.Text>
              )}
            </InputGroup>
            {cityHits.length > 0 && (
              <Table size="sm" hover className="bcm-cand mb-0">
                <thead>
                  <tr className="text-muted">
                    <th>City</th>
                    <th style={{ width: 90 }}>Code</th>
                    <th>Country</th>
                  </tr>
                </thead>
                <tbody>
                  {cityHits.map((h) => (
                    <tr
                      key={h.id}
                      onClick={() => setCity({ id: h.id, name: h.name, countryIso: h.countryIso, stateCode: h.stateCode })}
                    >
                      <td>{h.name}</td>
                      <td>{h.stateCode || "—"}</td>
                      <td>
                        {h.countryName} <span className="text-muted">({h.countryIso})</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {!cityLoading && debouncedCityQuery.trim().length >= 2 && cityHits.length === 0 && (
              <div className="bcm-empty">No active inhouse city matches "{debouncedCityQuery.trim()}".</div>
            )}
          </>
        )}

        {/* Stage 2 · pick the supplier city */}
        {city && (
          <>
            <div className="bcm-city-card d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
              <div>
                <div className="small text-muted">Inhouse city</div>
                <strong>{lookup?.masterCity?.name || city.name}</strong>{" "}
                <span className="text-muted">
                  {lookup?.masterCity?.countryName
                    ? `${lookup.masterCity.countryName} (${lookup.masterCity.countryIso})`
                    : city.countryIso}
                  {(lookup?.masterCity?.stateCode || city.stateCode) &&
                    ` · code ${lookup?.masterCity?.stateCode || city.stateCode}`}
                  {" · #"}
                  {city.id}
                </span>
              </div>
              {!target?.city && (
                <Button variant="link" size="sm" className="p-0" onClick={() => setCity(null)}>
                  change city
                </Button>
              )}
            </div>

            {lookupError && (
              <Alert variant="danger" className="py-2 small">
                {lookupError}
              </Alert>
            )}
            {alreadyMapped && (
              <Alert variant="warning" className="py-2 small">
                This city already has a {labelOf(provider)} mapping (api_city_id{" "}
                {lookup.existing.map((e) => `${e.apiCityId}${e.deleted ? " (deleted)" : ""}`).join(", ")}).
                Existing rows are never overwritten here — edit it on the manual City Mapping screen.
              </Alert>
            )}
            {lookup && !lookup.countryResolved && (
              <Alert variant="secondary" className="py-2 small">
                {labelOf(provider)} has no cities in {lookup.masterCity?.countryName || city.countryIso} —
                there is nothing to map this city to.
              </Alert>
            )}

            {lookup?.countryResolved && (
              <>
                <InputGroup size="sm" className="mb-2">
                  <Form.Control
                    placeholder={`Search all ${num(lookup.totalInCountry)} ${labelOf(provider)} cities in ${
                      lookup.masterCity?.countryName || city.countryIso
                    }… (name or code)`}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  {lookupLoading && (
                    <InputGroup.Text>
                      <Spinner animation="border" size="sm" />
                    </InputGroup.Text>
                  )}
                </InputGroup>

                {(lookup.candidates || []).length > 0 ? (
                  <Table size="sm" hover responsive className="bcm-cand mb-2">
                    <thead>
                      <tr className="text-muted">
                        <th style={{ width: 32 }} />
                        <th>Supplier city</th>
                        <th style={{ width: 90 }}>Code</th>
                        <th style={{ width: 80 }} className="text-end">
                          Hotels
                        </th>
                        <th style={{ width: 110 }}>Match</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lookup.candidates.map((c) => (
                        <tr
                          key={c.supplierCityId}
                          className={picked === c.supplierCityId ? "is-picked" : ""}
                          onClick={() => setPicked(c.supplierCityId)}
                        >
                          <td>
                            <Form.Check
                              type="radio"
                              name="bcm-candidate"
                              checked={picked === c.supplierCityId}
                              onChange={() => setPicked(c.supplierCityId)}
                            />
                          </td>
                          <td>
                            {c.name} <span className="text-muted">#{c.supplierCityId}</span>
                          </td>
                          <td>{c.code || "—"}</td>
                          <td className="text-end">{c.hotelCount >= 0 ? num(c.hotelCount) : "—"}</td>
                          <td>
                            <span className={`bcm-score s${c.score}`}>
                              {SCORE_LABEL[c.score] || (q.trim() ? "Search hit" : "—")}
                            </span>
                          </td>
                          <td className="small text-muted">
                            {c.mappedToMasterCityId
                              ? `already used by "${c.mappedToMasterCity}"`
                              : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : (
                  !lookupLoading && (
                    <div className="bcm-empty">
                      {q.trim()
                        ? `No ${labelOf(provider)} city in this country matches "${q.trim()}".`
                        : `No ${labelOf(provider)} city name resembles "${city.name}". Type another spelling above to search all ${num(
                            lookup.totalInCountry,
                          )} cities in this country.`}
                    </div>
                  )
                )}

                {needsShare && (
                  <Form.Check
                    type="checkbox"
                    id="bcm-allow-shared"
                    className="small"
                    checked={allowShared}
                    onChange={(e) => setAllowShared(e.target.checked)}
                    label={`"${pickedCandidate.name}" is already mapped to inhouse "${pickedCandidate.mappedToMasterCity}". Allow it to serve both inhouse cities (e.g. duplicate spellings of the same place).`}
                  />
                )}
              </>
            )}

            {saveError && (
              <Alert variant="danger" className="py-2 small mt-2 mb-0">
                Not written: {saveError}
              </Alert>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={saving}>
          Close
        </Button>
        <Button
          variant="primary"
          onClick={save}
          disabled={!city || !pickedCandidate || alreadyMapped || saving || (needsShare && !allowShared)}
          title={
            !city
              ? "Pick an inhouse city first."
              : alreadyMapped
                ? "This city is already mapped for this supplier."
                : !pickedCandidate
                  ? "Pick a supplier city."
                  : needsShare && !allowShared
                    ? "Tick the sharing box to reuse that supplier city."
                    : "Write this pair to api_city_mapping."
          }
        >
          {saving ? (
            <>
              <Spinner animation="border" size="sm" className="me-1" />
              Saving…
            </>
          ) : (
            "Save mapping"
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default BulkCityMapping;
