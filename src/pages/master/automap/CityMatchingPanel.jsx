import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Form, Spinner, Table } from "react-bootstrap";
import Swal from "sweetalert2";
import toast from "react-hot-toast";
import axiosInstance from "../../../components/AxiosInstance";
import PagerBar from "./PagerBar";
import { escapeHtml, fmtDateTime, fmtNumber, fmtPercent } from "./automapFormat";

const BASE = "/api/cityMapping/review/matching";
const LONG_WRITE_MS = 300000;
/** While a run is going, how often to ask whether it has finished. */
const RUN_POLL_MS = 5000;

const SUPPLIERS = ["grn", "goglobal", "iwtx", "atharva", "x3"];

export const MATCH_GROUPS = {
  CONFIDENT: {
    label: "Confident",
    tone: "success",
    meaning: "At least two signals agree on the city and nothing argues against it. You can approve these as a group.",
  },
  SAME_NAME: {
    label: "Same name",
    tone: "success",
    meaning: "Exactly one of our cities has this name, its mapping is free and no evidence argues against it. You can approve these as a group.",
  },
  CONFLICT: {
    label: "Signals disagree",
    tone: "warning",
    meaning: "The signals point at different cities, or the state or distance argues against the best one. Please check each one.",
  },
  ONE_SIGNAL: { label: "One signal", tone: "info", meaning: "Only one signal points at a city. Please check each one." },
  NEAR_ONLY: {
    label: "Near a city",
    tone: "secondary",
    meaning: "No signal, but its hotels are within 25 km of one of our cities. Often a suburb or a nearby town.",
  },
  MISSING_PLACE: {
    label: "Not in our list",
    tone: "secondary",
    meaning: "Its hotels have coordinates and none of our cities is near them, so this may need a new city.",
  },
  NO_EVIDENCE: { label: "No evidence", tone: "light", meaning: "No coordinates and no matching name, so there is nothing to go on." },
  COUNTRY_UNRESOLVED: { label: "Country unknown", tone: "light", meaning: "The supplier's country could not be matched to one of ours." },
};

/** These groups name none of our cities, so there is nothing to approve in them as they stand. */
const NO_TARGET_GROUPS = ["MISSING_PLACE", "NO_EVIDENCE", "COUNTRY_UNRESOLVED"];

const NAME_LEVELS = {
  SAME_NAME: "same name",
  ALIAS: "alternative name",
  STATE_REMOVED: "same name without the state",
  BEFORE_BRACKET: "words before the bracket",
  BEFORE_COMMA: "words before the comma",
  FIRST_WORDS: "first words match",
  SPELLING: "similar spelling only",
  SEVERAL_SAME_NAME: "several of our cities have this name",
};

const errorText = (err, fallback) => err?.response?.data?.error || fallback;

const supplierLabel = (s) => String(s || "").toUpperCase();

/** One line of evidence, in plain words. */
const evidenceLines = (row) => {
  const lines = [];
  if (row.linkVotes != null) {
    lines.push(`Same hotels as ${row.linkCityName || "another city"}: ${fmtNumber(row.linkVotes)} of ${fmtNumber(row.linkTotal)}`);
  }
  if (row.nearbyVotes != null) {
    lines.push(`Next to hotels in ${row.nearbyCityName || "another city"}: ${fmtNumber(row.nearbyVotes)} of ${fmtNumber(row.nearbyTotal)}`);
  }
  if (row.nameLevel) {
    const level = NAME_LEVELS[row.nameLevel] || row.nameLevel;
    lines.push(row.nameCityName ? `Name: ${level} as ${row.nameCityName}` : `Name: ${level}`);
  }
  if (lines.length === 0 && row.nearestKm != null && row.group === "NEAR_ONLY") {
    lines.push(`${row.nearestKm.toFixed(0)} km from ${row.targetCityName || "our city"}`);
  }
  return lines;
};

/**
 * The results of the nightly matching. Which of our cities each unmapped supplier city
 * probably is, judged from where its hotels are, most searched first. Nothing is mapped
 * until an admin approves it.
 */
export default function CityMatchingPanel({ active, onChanged }) {
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(null);
  const [group, setGroup] = useState("CONFIDENT");
  const [status, setStatus] = useState("OPEN");
  const [supplier, setSupplier] = useState("");
  const [country, setCountry] = useState("");
  const [text, setText] = useState("");
  const [debouncedText, setDebouncedText] = useState("");
  const [approvable, setApprovable] = useState(true);
  const [pageNo, setPageNo] = useState(0);
  const [size, setSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedText(text.trim());
      setPageNo(0);
    }, 350);
    return () => clearTimeout(t);
  }, [text]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await axiosInstance.get(`${BASE}/summary`, { timeout: 60000 });
      setSummary(res.data);
      return res.data;
    } catch (err) {
      setError(errorText(err, "The matching summary could not be loaded."));
      return null;
    }
  }, []);

  const loadRows = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const res = await axiosInstance.get(BASE, {
        params: {
          group: group || undefined,
          status,
          supplier: supplier || undefined,
          country: country.trim() || undefined,
          q: debouncedText || undefined,
          // Only rows waiting for a decision can be mapped, and some groups name no city at all.
          approvable: approvable && status === "OPEN" && !NO_TARGET_GROUPS.includes(group),
          page: pageNo,
          size,
        },
        timeout: 120000,
      });
      if (mine !== seq.current) return;
      setPage(res.data);
      setError(null);
    } catch (err) {
      if (mine !== seq.current) return;
      setError(errorText(err, "The matches could not be loaded."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [group, status, supplier, country, debouncedText, approvable, pageNo, size]);

  useEffect(() => {
    if (active) loadSummary();
  }, [active, loadSummary]);

  useEffect(() => {
    if (active) loadRows();
  }, [active, loadRows]);

  // A run takes a minute or two, so keep asking until it ends, then show the new list.
  const running = summary?.running === true;
  useEffect(() => {
    if (!active || !running) return undefined;
    const t = setInterval(async () => {
      const fresh = await loadSummary();
      if (fresh && !fresh.running) loadRows();
    }, RUN_POLL_MS);
    return () => clearInterval(t);
  }, [active, running, loadSummary, loadRows]);

  const refresh = async () => {
    await Promise.all([loadSummary(), loadRows()]);
    if (onChanged) onChanged();
  };

  const startRun = async () => {
    try {
      const res = await axiosInstance.post(`${BASE}/run`, {}, { timeout: 30000 });
      toast[res.data.started ? "success" : "error"](res.data.started ? "Matching has started." : "A matching run is already going.");
      await loadSummary();
    } catch (err) {
      toast.error(errorText(err, "The matching could not be started."));
    }
  };

  const reportApproval = (result) => {
    if (result.mapped > 0 && result.failed === 0 && !result.sameCity) {
      toast.success(`${fmtNumber(result.mapped)} mapped.`);
      return;
    }
    const sameCity = result.sameCity
      ? `<p class="small text-start">${fmtNumber(result.sameCity)} left waiting: a bigger supplier city took the same city of ours, and only one mapping is allowed per city and supplier.</p>`
      : "";
    const failures = (result.failures || []).map((f) => `<li>${escapeHtml(f)}</li>`).join("");
    Swal.fire({
      title: `${fmtNumber(result.mapped)} mapped`,
      html: `${sameCity}${failures ? `<div class="small text-start">${fmtNumber(result.failed)} could not be mapped:</div><ul class="text-start small">${failures}</ul>` : ""}`,
      icon: result.failed > 0 || result.mapped === 0 ? "warning" : "info",
    });
  };

  const writeError = (err, fallback) =>
    err?.response?.status === 403 ? "Only a super admin can do this." : errorText(err, fallback);

  const approveOne = async (row) => {
    const confirm = await Swal.fire({
      title: `Map ${supplierLabel(row.supplier)} "${escapeHtml(row.supplierCityName)}" to our ${escapeHtml(row.targetCityName)}?`,
      text: `${fmtNumber(row.hotels)} hotels will be reached in searches for ${row.targetCityName}.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, map it",
    });
    if (!confirm.isConfirmed) return;
    setActing(true);
    try {
      const res = await axiosInstance.post(`${BASE}/approve`, { ids: [row.id] }, { timeout: LONG_WRITE_MS });
      reportApproval(res.data);
      await refresh();
    } catch (err) {
      toast.error(writeError(err, "The mapping could not be saved."));
    } finally {
      setActing(false);
    }
  };

  const chooseCity = async (row) => {
    const first = await Swal.fire({
      title: `Map ${supplierLabel(row.supplier)} "${escapeHtml(row.supplierCityName)}"`,
      html: `<div class="small text-muted">${escapeHtml(row.countryIso || "")} · ${fmtNumber(row.hotels)} hotels. Type the name of our city.</div>`,
      input: "text",
      inputValue: row.targetCityName || row.supplierCityName,
      showCancelButton: true,
      confirmButtonText: "Find",
      inputValidator: (v) => (v && v.trim() ? undefined : "Enter a city name"),
    });
    if (!first.isConfirmed) return;
    setActing(true);
    try {
      const found = await axiosInstance.get("/api/cityMapping/bulk/master-cities", { params: { q: first.value, limit: 30 } });
      const same = (found.data || []).filter((c) => !row.countryIso || c.countryIso === row.countryIso);
      if (same.length === 0) {
        toast.error(`No city of ours in ${row.countryIso || "that country"} matches "${first.value}".`);
        return;
      }
      const options = Object.fromEntries(same.map((c) => [String(c.id), `${c.name}, ${c.countryIso}`]));
      const pick = await Swal.fire({
        title: "Choose our city",
        input: "select",
        inputOptions: options,
        showCancelButton: true,
        confirmButtonText: "Map it",
      });
      if (!pick.isConfirmed || !pick.value) return;
      const res = await axiosInstance.post(`${BASE}/approve`, { ids: [row.id], targetCityId: Number(pick.value) }, { timeout: LONG_WRITE_MS });
      reportApproval(res.data);
      await refresh();
    } catch (err) {
      toast.error(writeError(err, "The mapping could not be saved."));
    } finally {
      setActing(false);
    }
  };

  const approveAll = async () => {
    const total = page?.totalElements || 0;
    const hotels = (page?.content || []).reduce((sum, r) => sum + r.hotels, 0);
    const meta = MATCH_GROUPS[group];
    const sample = (page?.content || [])
      .slice(0, 5)
      .map((r) => `<li>${escapeHtml(r.supplierCityName)} → ${escapeHtml(r.targetCityName || "")}</li>`)
      .join("");
    const confirm = await Swal.fire({
      title: `Map all ${fmtNumber(total)} in "${meta.label}"?`,
      html:
        `<div class="small text-start">Every row under these filters will be mapped, on all pages, not only the ${fmtNumber(page?.content?.length || 0)} shown ` +
        `(${fmtNumber(hotels)} hotels on this page). New searches will reach these hotels straight away. ` +
        `To remove one later, use the City Mapping page.</div><ul class="text-start small mt-2">${sample}</ul>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: `Yes, map ${fmtNumber(total)}`,
    });
    if (!confirm.isConfirmed) return;
    setActing(true);
    try {
      const res = await axiosInstance.post(
        `${BASE}/approve-group`,
        { group, supplier: supplier || undefined, country: country.trim() || undefined, q: debouncedText || undefined, expected: total },
        { timeout: LONG_WRITE_MS },
      );
      reportApproval(res.data);
      await refresh();
    } catch (err) {
      toast.error(writeError(err, "The group could not be mapped."));
      await loadRows();
    } finally {
      setActing(false);
    }
  };

  const reject = async (row) => {
    const confirm = await Swal.fire({
      title: "Not the same place?",
      text: `"${row.supplierCityName}" will not be offered for ${row.targetCityName} again. You can undo this under Turned down.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, turn it down",
    });
    if (!confirm.isConfirmed) return;
    setActing(true);
    try {
      await axiosInstance.post(`${BASE}/reject`, { ids: [row.id] }, { timeout: 30000 });
      await refresh();
    } catch (err) {
      toast.error(errorText(err, "This could not be turned down."));
    } finally {
      setActing(false);
    }
  };

  const reopen = async (row) => {
    setActing(true);
    try {
      await axiosInstance.post(`${BASE}/reopen`, { ids: [row.id] }, { timeout: 30000 });
      await refresh();
    } catch (err) {
      toast.error(errorText(err, "This could not be reopened."));
    } finally {
      setActing(false);
    }
  };

  const viewHotels = async (row) => {
    try {
      const res = await axiosInstance.get("/api/cityMapping/review/search-gaps/hotels", {
        params: { supplier: row.supplier, supplierCityId: row.supplierCityId },
        timeout: 60000,
      });
      const hotels = res.data || [];
      const list = hotels.map((h) => `<li>${escapeHtml(h.name || h.code)}</li>`).join("");
      await Swal.fire({
        title: `${supplierLabel(row.supplier)} hotels in ${escapeHtml(row.supplierCityName)}`,
        html:
          hotels.length === 0
            ? "<div>We keep no local hotel list to show for this supplier city.</div>"
            : `<div class="small text-muted mb-2">Showing ${fmtNumber(hotels.length)} of ${fmtNumber(row.hotels)}.</div><ul class="text-start small" style="max-height:340px;overflow:auto">${list}</ul>`,
        confirmButtonText: "Close",
      });
    } catch (err) {
      setError(errorText(err, "The hotels could not be loaded."));
    }
  };

  const chooseGroup = (code) => {
    setGroup(code);
    setPageNo(0);
  };

  const countsFor = (code) => {
    const all = (summary?.groups || []).filter((g) => g.group === code && g.status === "OPEN");
    return all.length ? all[0] : { cities: 0, hotels: 0, approvableCities: 0, approvableHotels: 0 };
  };

  const rows = page?.content || [];
  const run = summary?.lastRun;
  const holdOutShare = run?.holdOutAnswered ? (100 * run.holdOutAgreed) / run.holdOutAnswered : null;
  const reach = (() => {
    try {
      return run?.reach ? JSON.parse(run.reach) : [];
    } catch {
      return [];
    }
  })();
  const canApproveAll = status === "OPEN" && approvable && MATCH_GROUPS[group] && (group === "CONFIDENT" || group === "SAME_NAME") && (page?.totalElements || 0) > 0;
  const decisions = (summary?.decisions || []).find((d) => d.group === group);
  const selected = countsFor(group);

  return (
    <div className="ahm-panel">
      <div className="ahm-panel-head">
        <span>Automated city matching</span>
        <span className="d-flex align-items-center gap-2">
          {(loading || running) && <Spinner animation="border" size="sm" role="status" aria-label="Loading" />}
          <Button size="sm" variant="outline-primary" disabled={running} onClick={startRun}>
            {running ? "Matching…" : "Run now"}
          </Button>
        </span>
      </div>
      <p className="small text-muted px-3 pt-2 mb-2">
        Each night, works out which of our cities each unmapped supplier city probably is, from where its hotels are. It covers GRN,
        GoGlobal, IWTX, Atharva and X3, whose hotels we hold with coordinates. Nothing is mapped until you approve it, and a run changes no
        search.
        {run && (
          <>
            {" "}
            Last run: {fmtDateTime(run.finishedAt || run.startedAt)}
            {run.status === "FAILED" ? ` (failed: ${run.message || "see the server log"})` : ""}.
          </>
        )}
        {holdOutShare != null && (
          <>
            {" "}
            Tested on {fmtNumber(run.holdOutAnswered)} cities already mapped, the main signals named the same city {fmtPercent(holdOutShare, 1)} of the time.
          </>
        )}
        {!run && " It has not run yet. Press Run now for the first list."}
      </p>
      {error && (
        <Alert variant="danger" className="mx-3">
          {error}
        </Alert>
      )}
      {reach.length > 0 && (
        <div className="px-3 small text-muted mb-2">
          Hotels a search can reach today:{" "}
          {reach.map((r, i) => (
            <span key={r.supplier}>
              {i > 0 ? " · " : ""}
              {supplierLabel(r.supplier)} {r.hotels ? fmtPercent((100 * r.reachable) / r.hotels, 1) : "—"}
            </span>
          ))}
        </div>
      )}
      <div className="px-3 d-flex flex-wrap gap-2 mb-2">
        {Object.entries(MATCH_GROUPS).map(([code, meta]) => {
          const counts = countsFor(code);
          return (
            <Button
              key={code}
              size="sm"
              variant={group === code ? "primary" : "outline-secondary"}
              title={meta.meaning}
              aria-pressed={group === code}
              onClick={() => chooseGroup(code)}
            >
              {meta.label} <span className="fw-semibold">{fmtNumber(counts.cities)}</span>
            </Button>
          );
        })}
      </div>
      <div className="px-3 d-flex flex-wrap align-items-center gap-2">
        <Form.Select
          size="sm"
          style={{ width: "auto" }}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPageNo(0);
          }}
          aria-label="Filter matches by decision"
        >
          <option value="OPEN">Waiting</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Turned down</option>
        </Form.Select>
        <Form.Select
          size="sm"
          style={{ width: "auto" }}
          value={supplier}
          onChange={(e) => {
            setSupplier(e.target.value);
            setPageNo(0);
          }}
          aria-label="Filter matches by supplier"
        >
          <option value="">Any supplier</option>
          {SUPPLIERS.map((s) => (
            <option key={s} value={s}>
              {supplierLabel(s)}
            </option>
          ))}
        </Form.Select>
        <Form.Control
          size="sm"
          style={{ width: "5.5rem" }}
          placeholder="Country"
          aria-label="Filter matches by country code"
          maxLength={2}
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            setPageNo(0);
          }}
        />
        <Form.Control
          size="sm"
          style={{ width: "14rem" }}
          placeholder="Find a city"
          aria-label="Find a city in the matches"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {status === "OPEN" && !NO_TARGET_GROUPS.includes(group) && (
          <Form.Check
            type="checkbox"
            id="city-match-approvable"
            label="Only those that can be mapped now"
            className="small"
            checked={approvable}
            onChange={(e) => {
              setApprovable(e.target.checked);
              setPageNo(0);
            }}
          />
        )}
        {canApproveAll && (
          <Button size="sm" variant="success" className="ms-auto" disabled={acting || running} onClick={approveAll}>
            Map all {fmtNumber(page.totalElements)}
          </Button>
        )}
      </div>
      {MATCH_GROUPS[group] && <div className="small text-muted px-3 pt-2">{MATCH_GROUPS[group].meaning}</div>}
      {status === "OPEN" && !NO_TARGET_GROUPS.includes(group) && selected.cities > selected.approvableCities && (
        <div className="small text-muted px-3">
          {fmtNumber(selected.approvableCities)} of {fmtNumber(selected.cities)} can be mapped now ({fmtNumber(selected.approvableHotels)} of{" "}
          {fmtNumber(selected.hotels)} hotels). The rest wait because our city already has a mapping for that supplier, and only one is allowed.
        </div>
      )}
      {decisions && decisions.approved + decisions.rejected > 0 && (
        <div className="small text-muted px-3">
          Decided so far in this group: {fmtNumber(decisions.approved)} approved, {fmtNumber(decisions.rejected)} turned down (
          {fmtPercent((100 * decisions.approved) / (decisions.approved + decisions.rejected), 1)} accepted).
        </div>
      )}
      <Table responsive hover className="ahm-table mb-0 mt-2">
        <thead>
          <tr>
            <th>Supplier city</th>
            <th>Supplier</th>
            <th className="text-end">Hotels</th>
            <th>Our city</th>
            <th>Evidence</th>
            <th className="text-end">Searches</th>
            <th className="text-end">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <div className="fw-semibold">{row.supplierCityName || "No name"}</div>
                <div className="ahm-hotel-id">{row.countryIso || "—"}</div>
                {row.caution && (
                  <Badge bg="info" text="dark" title={row.caution}>
                    Check
                  </Badge>
                )}
              </td>
              <td>
                <span className="ahm-chip">{supplierLabel(row.supplier)}</span>
              </td>
              <td className="text-end">{fmtNumber(row.hotels)}</td>
              <td>
                {row.targetCityName || <span className="text-muted">None</span>}
                {row.targetKm != null && <div className="ahm-hotel-id">{row.targetKm.toFixed(0)} km away</div>}
                {row.targetHasRow && row.status === "OPEN" && (
                  <div>
                    <Badge bg="warning" text="dark" title="Only one mapping is allowed per city and supplier, so this one cannot be added yet">
                      Already has a {supplierLabel(row.supplier)} mapping
                    </Badge>
                  </div>
                )}
                {row.lastError && <div className="small text-danger">{row.lastError}</div>}
              </td>
              <td className="small">
                {evidenceLines(row).map((line) => (
                  <div key={line}>{line}</div>
                ))}
                {row.caution && <div className="text-muted">{row.caution}</div>}
                {row.status !== "OPEN" && row.decidedBy && (
                  <div className="text-muted">
                    {row.status === "APPROVED" ? "Approved" : "Turned down"} by {row.decidedBy}, {fmtDateTime(row.decidedAt)}
                  </div>
                )}
              </td>
              <td className="text-end">{fmtNumber(row.searches)}</td>
              <td className="text-end text-nowrap">
                <Button size="sm" variant="outline-secondary" className="me-1" onClick={() => viewHotels(row)}>
                  View hotels
                </Button>
                {row.status === "OPEN" && (
                  <>
                    {row.targetCityId && !row.targetHasRow && (
                      <Button size="sm" variant="success" className="me-1" disabled={acting} onClick={() => approveOne(row)}>
                        Map
                      </Button>
                    )}
                    <Button size="sm" variant="outline-primary" className="me-1" disabled={acting} onClick={() => chooseCity(row)}>
                      Choose city
                    </Button>
                    {row.targetCityId && (
                      <Button size="sm" variant="outline-danger" disabled={acting} onClick={() => reject(row)}>
                        Turn down
                      </Button>
                    )}
                  </>
                )}
                {row.status === "REJECTED" && (
                  <Button size="sm" variant="outline-primary" disabled={acting} onClick={() => reopen(row)}>
                    Reopen
                  </Button>
                )}
              </td>
            </tr>
          ))}
          {!loading && page && rows.length === 0 && (
            <tr>
              <td colSpan={7} className="ahm-empty">
                {run ? "Nothing matches these filters." : "Nothing yet. Press Run now for the first list."}
              </td>
            </tr>
          )}
        </tbody>
      </Table>
      {page && (
        <div className="px-3 pb-3">
          <PagerBar
            page={pageNo}
            size={size}
            totalElements={page.totalElements || 0}
            totalPages={page.totalPages || 1}
            onPageChange={setPageNo}
            onSizeChange={(n) => {
              setSize(n);
              setPageNo(0);
            }}
            disabled={loading}
          />
        </div>
      )}
    </div>
  );
}
