import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Form, Spinner, Table } from "react-bootstrap";
import Swal from "sweetalert2";
import toast from "react-hot-toast";
import axiosInstance from "../../../components/AxiosInstance";
import { escapeHtml, fmtNumber } from "./automapFormat";
import CityDataFixesPanel from "./CityDataFixesPanel";
import CityMatchingPanel from "./CityMatchingPanel";
import SearchGapsPanel from "./SearchGapsPanel";

const PROVIDERS = ["", "grn", "goglobal", "iwtx"];

const errorText = (err, fallback) => err?.response?.data?.error || fallback;

/**
 * City mapping review: automated matching, what searches failed to find, data fixes, one
 * real city stored under two names, alternative names, and supplier cities that hold
 * hotels but have no mapping.
 */
export default function CitiesReviewTab({ active }) {
  const [suggestions, setSuggestions] = useState(null);
  const [aliases, setAliases] = useState([]);
  const [gaps, setGaps] = useState(null);
  const [provider, setProvider] = useState("");
  const [loadingGaps, setLoadingGaps] = useState(false);
  const [error, setError] = useState(null);
  const [acting, setActing] = useState(false);

  const loadNames = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([
        axiosInstance.get("/api/cityMapping/review/suggestions", { timeout: 60000 }),
        axiosInstance.get("/api/cityMapping/review/aliases", { timeout: 30000 }),
      ]);
      setSuggestions(s.data);
      setAliases(a.data);
    } catch (err) {
      setError(errorText(err, "The city suggestions could not be loaded."));
    }
  }, []);

  const loadGaps = useCallback(async () => {
    setLoadingGaps(true);
    try {
      const res = await axiosInstance.get("/api/cityMapping/review/gaps", {
        params: { provider: provider || undefined, limit: 100 },
        timeout: 120000,
      });
      setGaps(res.data);
      setError(null);
    } catch (err) {
      setError(errorText(err, "The unmapped city list could not be loaded."));
    } finally {
      setLoadingGaps(false);
    }
  }, [provider]);

  useEffect(() => {
    if (active) loadNames();
  }, [active, loadNames]);

  useEffect(() => {
    if (active) loadGaps();
  }, [active, loadGaps]);

  const connect = async (s) => {
    const confirm = await Swal.fire({
      title: `Connect ${s.nameA} and ${s.nameB}?`,
      text: `Both names stay, and each gets any supplier link the other has, so a search for either reaches every supplier (${s.rowsToCopy} link(s) to add).`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, connect them",
    });
    if (!confirm.isConfirmed) return;
    setActing(true);
    try {
      const res = await axiosInstance.post("/api/cityMapping/review/share", { cityIdA: s.cityIdA, cityIdB: s.cityIdB });
      toast.success(`Connected: ${res.data.rowsCopied} supplier link(s) added.`);
      await loadNames();
      await loadGaps();
    } catch (err) {
      toast.error(errorText(err, "The cities could not be connected."));
    } finally {
      setActing(false);
    }
  };

  const addName = async (cityId, alias) => {
    setActing(true);
    try {
      await axiosInstance.post("/api/cityMapping/review/aliases", { cityId, alias });
      toast.success(`"${alias}" added. The next bulk city mapping run will use it.`);
      await loadNames();
      await loadGaps();
    } catch (err) {
      toast.error(errorText(err, "The name could not be added."));
    } finally {
      setActing(false);
    }
  };

  const removeName = async (a) => {
    const confirm = await Swal.fire({
      title: `Remove "${a.aliasName}"?`,
      text: `Mappings already made stay. It just will not be used to match ${a.cityName} any more.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Remove",
    });
    if (!confirm.isConfirmed) return;
    try {
      await axiosInstance.delete(`/api/cityMapping/review/aliases/${a.id}`);
      await loadNames();
    } catch (err) {
      toast.error(errorText(err, "The name could not be removed."));
    }
  };

  const savePair = async (g, masterCityId, cityName) => {
    setActing(true);
    try {
      const res = await axiosInstance.post(
        "/api/cityMapping/bulk/pairs",
        { pairs: [{ provider: g.provider, masterCityId, supplierCityId: g.supplierCityId }], dryRun: false },
        { timeout: 120000 },
      );
      const stats = res.data?.providers?.[0];
      if (stats?.inserted > 0) {
        toast.success(`${g.name} is now mapped to ${cityName}.`);
        await loadGaps();
        return true;
      }
      const why = stats?.unmatchedSamples?.[0]?.detail || stats?.conflictSamples?.[0]?.detail || stats?.error;
      toast.error(why || "The mapping was not saved.");
      return false;
    } catch (err) {
      toast.error(
        err?.response?.status === 403
          ? "Only a super admin can save a city mapping."
          : errorText(err, "The mapping could not be saved."),
      );
      return false;
    } finally {
      setActing(false);
    }
  };

  const mapToSuggested = async (g) => {
    const confirm = await Swal.fire({
      title: `Map ${g.provider} "${escapeHtml(g.name)}" to our ${escapeHtml(g.suggestedCityName)}?`,
      text: `${g.suggestionNeedsCheck ? "Only the words before the bracket match, so please check this is the same city. " : ""}${fmtNumber(g.hotels)} hotels will become reachable in searches for ${g.suggestedCityName}.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, map it",
    });
    if (confirm.isConfirmed) await savePair(g, g.suggestedCityId, g.suggestedCityName);
  };

  const mapToChosen = async (g) => {
    const first = await Swal.fire({
      title: `Map ${g.provider} "${escapeHtml(g.name)}"`,
      html: `<div class="small text-muted">${escapeHtml(g.countryName || "")} · ${fmtNumber(g.hotels)} hotels. Type the name of our city.</div>`,
      input: "text",
      inputValue: g.name,
      showCancelButton: true,
      confirmButtonText: "Find",
      inputValidator: (v) => (v && v.trim() ? undefined : "Enter a city name"),
    });
    if (!first.isConfirmed) return;
    try {
      const res = await axiosInstance.get("/api/cityMapping/bulk/master-cities", { params: { q: first.value, limit: 30 } });
      const same = (res.data || []).filter((c) => !g.countryIso || c.countryIso === g.countryIso);
      if (same.length === 0) {
        toast.error(`No city of ours in ${g.countryName || "that country"} matches "${first.value}".`);
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
      if (pick.isConfirmed && pick.value) await savePair(g, Number(pick.value), options[pick.value]);
    } catch (err) {
      toast.error(errorText(err, "Our cities could not be searched."));
    }
  };

  return (
    <div className="d-flex flex-column gap-3">
      {error && (
        <Alert variant="danger" className="mb-0">
          {error}
        </Alert>
      )}

      <CityMatchingPanel active={active} onChanged={loadGaps} />

      <SearchGapsPanel active={active} onMap={savePair} acting={acting} />

      <CityDataFixesPanel active={active} onChanged={loadGaps} />

      <div className="ahm-panel">
        <div className="ahm-panel-head">
          <span>One city, two names</span>
        </div>
        <p className="small text-muted px-3 pt-2 mb-2">
          A starting list of well known names. When both names exist as cities, connecting them lets a search for either reach
          every supplier. Atharva and X3 links are not copied, because each keeps its own city data.
        </p>
        <Table responsive className="ahm-table mb-0">
          <thead>
            <tr>
              <th>Country</th>
              <th>Our city</th>
              <th>Other name</th>
              <th className="text-end">Action</th>
            </tr>
          </thead>
          <tbody>
            {(suggestions || []).map((s) => (
              <tr key={`${s.cityIdA}-${s.nameB}`}>
                <td>{s.countryIso}</td>
                <td>
                  <div className="fw-semibold">{s.nameA}</div>
                  <div className="ahm-hotel-id">{s.suppliersA.join(", ") || "No suppliers"}</div>
                </td>
                <td>
                  <div className="fw-semibold">{s.nameB}</div>
                  <div className="ahm-hotel-id">
                    {s.cityIdB ? s.suppliersB.join(", ") || "No suppliers" : "Not a separate city here"}
                  </div>
                </td>
                <td className="text-end">
                  {s.cityIdB ? (
                    <Button size="sm" variant="primary" disabled={acting} onClick={() => connect(s)}>
                      Connect
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline-primary" disabled={acting} onClick={() => addName(s.cityIdA, s.nameB)}>
                      Add name
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {suggestions && suggestions.length === 0 && (
              <tr>
                <td colSpan={4} className="ahm-empty">
                  Nothing is waiting here.
                </td>
              </tr>
            )}
            {!suggestions && (
              <tr>
                <td colSpan={4} className="text-center py-3">
                  <Spinner animation="border" size="sm" />
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>

      {aliases.length > 0 && (
        <div className="ahm-panel">
          <div className="ahm-panel-head">
            <span>Alternative names in use</span>
          </div>
          <Table responsive className="ahm-table mb-0">
            <thead>
              <tr>
                <th>Our city</th>
                <th>Also known as</th>
                <th>Added by</th>
                <th className="text-end">Action</th>
              </tr>
            </thead>
            <tbody>
              {aliases.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.cityName}, {a.countryIso}
                  </td>
                  <td>{a.aliasName}</td>
                  <td className="small text-muted">{a.createdBy}</td>
                  <td className="text-end">
                    <Button size="sm" variant="outline-danger" onClick={() => removeName(a)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <div className="ahm-panel">
        <div className="ahm-panel-head">
          <span>
            Supplier cities with hotels but no mapping
            {gaps ? (
              <span className="text-muted fw-normal">
                {" "}
                ({fmtNumber(gaps.cities)} cities, {fmtNumber(gaps.hotels)} hotels)
              </span>
            ) : null}
          </span>
          {loadingGaps && <Spinner animation="border" size="sm" role="status" aria-label="Loading" />}
        </div>
        <div className="px-3 pt-2 d-flex flex-wrap align-items-center gap-2">
          <Form.Select
            size="sm"
            style={{ width: "auto" }}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            aria-label="Filter by supplier"
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p ? p.toUpperCase() : "All suppliers"}
              </option>
            ))}
          </Form.Select>
          <span className="small text-muted">
            Biggest first. Only suppliers with a local hotel list can show this. Search probably misses these hotels until the
            city is mapped.
          </span>
        </div>
        <Table responsive hover className="ahm-table mb-0 mt-2">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Supplier city</th>
              <th>Country</th>
              <th className="text-end">Hotels</th>
              <th>Our matching city</th>
              <th className="text-end">Action</th>
            </tr>
          </thead>
          <tbody>
            {(gaps?.rows || []).map((g) => (
              <tr key={`${g.provider}-${g.supplierCityId}`}>
                <td>
                  <span className="ahm-chip">{g.provider.toUpperCase()}</span>
                </td>
                <td>{g.name}</td>
                <td>{g.countryIso || g.countryName || "—"}</td>
                <td className="text-end">{fmtNumber(g.hotels)}</td>
                <td>
                  {g.suggestedCityName || <span className="text-muted">None found</span>}
                  {g.suggestionNeedsCheck && (
                    <Badge bg="info" text="dark" className="ms-1" title="Only the words before the bracket match">
                      Check
                    </Badge>
                  )}
                  {g.suggestedCityHasRow && (
                    <Badge bg="warning" text="dark" className="ms-1" title="Only one row is allowed per city and supplier">
                      Already mapped to another {g.provider.toUpperCase()} city
                    </Badge>
                  )}
                </td>
                <td className="text-end text-nowrap">
                  {g.suggestedCityId && !g.suggestedCityHasRow ? (
                    <Button size="sm" variant="success" disabled={acting} onClick={() => mapToSuggested(g)}>
                      Map
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline-primary" disabled={acting} onClick={() => mapToChosen(g)}>
                      Choose city
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!loadingGaps && gaps && gaps.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="ahm-empty">
                  No supplier city with hotels is missing a mapping.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
