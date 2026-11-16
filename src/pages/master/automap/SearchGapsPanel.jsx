import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Form, Spinner, Table } from "react-bootstrap";
import Swal from "sweetalert2";
import axiosInstance from "../../../components/AxiosInstance";
import PagerBar from "./PagerBar";
import { escapeHtml, fmtDateTime, fmtNumber } from "./automapFormat";

const BASE = "/api/cityMapping/review/search-gaps";

const PERIODS = [7, 30, 90, 365];

const SUPPLIERS = ["grn", "goglobal", "iwtx", "x3", "atharva", "darina", "ratehawk", "inhouse", "all"];

/** Most urgent first. HOTELS_RETURNED has no entry: it only gives the total to compare against. */
export const GAP_OUTCOMES = {
  NO_HOTELS_AT_ALL: {
    label: "No hotels from anyone",
    tone: "danger",
    meaning: "Every supplier asked finished, and none of them sent a hotel.",
  },
  NO_MAPPING: {
    label: "No mapping",
    tone: "danger",
    meaning: "This city has no mapping for the supplier, so the supplier was never asked.",
  },
  NO_HOTEL_LIST: {
    label: "Empty hotel list",
    tone: "warning",
    meaning: "The mapping exists, but this supplier can only search from a stored hotel list and that list is empty.",
  },
  ZERO_WITH_CATALOG: {
    label: "Nothing, hotels known",
    tone: "warning",
    meaning:
      "The supplier sent nothing although we know of hotels there. Often just availability. Suspicious if it always happens, and some suppliers also report a failed call this way.",
  },
  ERROR: { label: "Call failed", tone: "secondary", meaning: "The call to the supplier failed." },
  TIMEOUT: { label: "No answer in time", tone: "secondary", meaning: "The supplier did not answer before the search's deadline." },
  ZERO_NO_CATALOG: {
    label: "Nothing, none known",
    tone: "light",
    meaning: "The supplier sent nothing and we know of no hotels there. Probably correct.",
  },
};

const errorText = (err, fallback) => err?.response?.data?.error || fallback;

const supplierLabel = (s) => (s === "all" ? "All suppliers" : String(s || "").toUpperCase());

/**
 * What hotel searches failed to find, most searched first. Which hotels come back
 * changes daily with availability, so the log is per city and supplier; the hotels
 * themselves are listed from the supplier's catalog when an admin asks.
 */
export default function SearchGapsPanel({ active, onMap, acting }) {
  const [days, setDays] = useState(30);
  const [outcome, setOutcome] = useState("");
  const [supplier, setSupplier] = useState("");
  const [city, setCity] = useState("");
  const [debouncedCity, setDebouncedCity] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [report, setReport] = useState(null);
  const [terms, setTerms] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedCity(city.trim());
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [city]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const [gaps, typed] = await Promise.all([
        axiosInstance.get(BASE, {
          params: { days, outcome: outcome || undefined, supplier: supplier || undefined, city: debouncedCity || undefined, page, size },
          timeout: 120000,
        }),
        axiosInstance.get(`${BASE}/destinations`, { params: { days, size: 20 }, timeout: 30000 }),
      ]);
      if (mine !== seq.current) return;
      setReport(gaps.data);
      setTerms(typed.data);
      setError(null);
    } catch (err) {
      if (mine !== seq.current) return;
      setError(errorText(err, "The search gaps could not be loaded."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [days, outcome, supplier, debouncedCity, page, size]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  const chooseOutcome = (code) => {
    setOutcome((current) => (current === code ? "" : code));
    setPage(0);
  };

  const viewHotels = async (row) => {
    try {
      const res = await axiosInstance.get(`${BASE}/hotels`, {
        params: { supplier: row.supplier, supplierCityId: row.suggestion.supplierCityId },
        timeout: 60000,
      });
      const hotels = res.data || [];
      const list = hotels.map((h) => `<li>${escapeHtml(h.name || h.code)}</li>`).join("");
      await Swal.fire({
        title: `${supplierLabel(row.supplier)} hotels in ${escapeHtml(row.suggestion.name)}`,
        html:
          hotels.length === 0
            ? "<div>We keep no local hotel list to show for this supplier city.</div>"
            : `<div class="small text-muted mb-2">Showing ${fmtNumber(hotels.length)}. Not reached by a search for ${escapeHtml(row.cityName || "")} until this city is mapped.</div><ul class="text-start small" style="max-height:340px;overflow:auto">${list}</ul>`,
        confirmButtonText: "Close",
      });
    } catch (err) {
      setError(errorText(err, "The hotels could not be loaded."));
    }
  };

  const map = async (row) => {
    const confirm = await Swal.fire({
      title: `Map ${supplierLabel(row.supplier)} "${escapeHtml(row.suggestion.name)}" to our ${escapeHtml(row.cityName)}?`,
      text: "This is only a name match, so please check it is the same place. New searches for this city will then reach this supplier.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, map it",
    });
    if (!confirm.isConfirmed) return;
    const saved = await onMap(
      { provider: row.supplier, supplierCityId: row.suggestion.supplierCityId, name: row.suggestion.name },
      row.cityId,
      row.cityName,
    );
    if (saved) load();
  };

  const rows = report?.rows?.content || [];
  const totals = report?.totals || [];
  const answered = totals.find((t) => t.outcome === "HOTELS_RETURNED");

  return (
    <>
      <div className="ahm-panel">
        <div className="ahm-panel-head">
          <span>Search gaps: what hotel searches failed to find</span>
          {loading && <Spinner animation="border" size="sm" role="status" aria-label="Loading" />}
        </div>
        <p className="small text-muted px-3 pt-2 mb-2">
          Counted per day, city and supplier, with no agent or guest details. Most searched first, so the gaps that matter most are at
          the top.
          {answered ? ` In this period suppliers answered with hotels ${fmtNumber(answered.searches)} times.` : ""}
        </p>
        {error && (
          <Alert variant="danger" className="mx-3">
            {error}
          </Alert>
        )}
        <div className="px-3 d-flex flex-wrap gap-2 mb-2">
          {Object.entries(GAP_OUTCOMES).map(([code, meta]) => {
            const total = totals.find((t) => t.outcome === code);
            return (
              <Button
                key={code}
                size="sm"
                variant={outcome === code ? "primary" : "outline-secondary"}
                title={meta.meaning}
                onClick={() => chooseOutcome(code)}
                aria-pressed={outcome === code}
              >
                {meta.label} <span className="fw-semibold">{fmtNumber(total?.searches || 0)}</span>
              </Button>
            );
          })}
        </div>
        <div className="px-3 d-flex flex-wrap align-items-center gap-2">
          <Form.Select
            size="sm"
            style={{ width: "auto" }}
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
              setPage(0);
            }}
            aria-label="Period"
          >
            {PERIODS.map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </Form.Select>
          <Form.Select
            size="sm"
            style={{ width: "auto" }}
            value={supplier}
            onChange={(e) => {
              setSupplier(e.target.value);
              setPage(0);
            }}
            aria-label="Filter search gaps by supplier"
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
            style={{ width: "14rem" }}
            placeholder="Find our city"
            aria-label="Find our city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <Table responsive hover className="ahm-table mb-0 mt-2">
          <thead>
            <tr>
              <th>Our city</th>
              <th>Supplier</th>
              <th>What happened</th>
              <th className="text-end">Searches</th>
              <th>Last searched</th>
              <th>Possible supplier city</th>
              <th className="text-end">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const meta = GAP_OUTCOMES[row.outcome] || { label: row.outcome, tone: "secondary", meaning: "" };
              return (
                <tr key={`${row.cityId}-${row.supplier}-${row.outcome}`}>
                  <td>
                    <div className="fw-semibold">{row.cityName || `City #${row.cityId}`}</div>
                    <div className="ahm-hotel-id">{row.countryIso || "—"}</div>
                  </td>
                  <td>
                    <span className="ahm-chip">{supplierLabel(row.supplier)}</span>
                  </td>
                  <td>
                    <Badge bg={meta.tone} text={meta.tone === "warning" || meta.tone === "light" ? "dark" : undefined} title={meta.meaning}>
                      {meta.label}
                    </Badge>
                    {row.mappedNow && row.outcome === "NO_MAPPING" && (
                      <Badge bg="success" className="ms-1" title="A mapping has been added since these searches">
                        Mapped since
                      </Badge>
                    )}
                  </td>
                  <td className="text-end text-nowrap">
                    {fmtNumber(row.searches)}
                    {row.supplier !== "all" && <span className="text-muted"> of {fmtNumber(row.allSearches)}</span>}
                  </td>
                  <td className="small text-nowrap">
                    {fmtDateTime(row.lastSeenAt)}
                    {row.lastCheckIn && <div className="ahm-hotel-id">Check-in {row.lastCheckIn}</div>}
                  </td>
                  <td>
                    {row.suggestion ? (
                      <>
                        {row.suggestion.name}
                        <div className="ahm-hotel-id">
                          {row.suggestion.hotels >= 0 ? `${fmtNumber(row.suggestion.hotels)} hotels` : "Hotel count not known"}
                          {" · name match only"}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="text-end text-nowrap">
                    {row.suggestion && (
                      <>
                        <Button size="sm" variant="outline-secondary" className="me-1" onClick={() => viewHotels(row)}>
                          View hotels
                        </Button>
                        <Button size="sm" variant="success" disabled={acting} onClick={() => map(row)}>
                          Map
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && report && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="ahm-empty">
                  No search gaps match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
        {report && (
          <div className="px-3 pb-3">
            <PagerBar
              page={page}
              size={size}
              totalElements={report.rows?.totalElements || 0}
              totalPages={report.rows?.totalPages || 1}
              onPageChange={setPage}
              onSizeChange={(n) => {
                setSize(n);
                setPage(0);
              }}
              disabled={loading}
            />
          </div>
        )}
      </div>

      <div className="ahm-panel">
        <div className="ahm-panel-head">
          <span>
            Destinations typed with no match
            {terms ? <span className="text-muted fw-normal"> ({fmtNumber(terms.totalElements || 0)})</span> : null}
          </span>
        </div>
        <p className="small text-muted px-3 pt-2 mb-2">
          Typed on the hotel search page and matching none of our cities, so no search could start. Some will be typing mistakes or
          half-typed words. The rest may need an alternative name or a new city.
        </p>
        <Table responsive className="ahm-table mb-0">
          <thead>
            <tr>
              <th>Typed</th>
              <th className="text-end">Times</th>
              <th>Last typed</th>
            </tr>
          </thead>
          <tbody>
            {(terms?.content || []).map((t) => (
              <tr key={t.term}>
                <td>{t.term}</td>
                <td className="text-end">{fmtNumber(t.searches)}</td>
                <td className="small">{fmtDateTime(t.lastSeenAt)}</td>
              </tr>
            ))}
            {terms && (terms.content || []).length === 0 && (
              <tr>
                <td colSpan={3} className="ahm-empty">
                  None in this period.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </>
  );
}
