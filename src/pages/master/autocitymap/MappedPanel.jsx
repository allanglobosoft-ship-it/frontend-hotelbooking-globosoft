import React, { useEffect, useState } from "react";
import { Alert, Button, Form, Spinner, Table } from "react-bootstrap";
import { fmtDate, providerLabel, useDebounced, usePagedList } from "./acmShared";
import { FilterBar, Pager, SortTh } from "./AcmParts";

const SOURCE_LABEL = { AUTOMATED: "Automatic", APPROVED: "Approved here", MANUAL: "Manual / bulk" };

/** Every active api_city_mapping row, whoever wrote it, with where it came from. */
export default function MappedPanel({ active, reloadKey, providers, onUndo, initialSource = "AUTOMATED" }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 350);
  const [provider, setProvider] = useState("");
  const [country, setCountry] = useState(null);
  const [source, setSource] = useState(initialSource);
  const [sort, setSort] = useState("created");
  const [dir, setDir] = useState("desc");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);

  useEffect(() => setPage(0), [dq, provider, country, source, size]);

  const { page: data, loading, error } = usePagedList(
    "/mapped",
    { provider, countryId: country?.value, source, q: dq, sort, dir, page, size },
    active,
    reloadKey,
  );
  const onSort = (field, d) => {
    setSort(field);
    setDir(d);
  };

  return (
    <div>
      <p className="acm-hint">
        Cities the hotel search can reach per supplier. "Automatic" rows were written by the engine on a verified match;
        "Manual / bulk" rows come from the City Mapping and Bulk Mapping screens and are never changed here.
      </p>
      <FilterBar q={q} onQ={setQ} placeholder="Search city, supplier city id or code…" provider={provider} onProvider={setProvider}
        providers={providers} country={country} onCountry={setCountry}>
        <Form.Select size="sm" className="acm-select" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source">
          <option value="AUTOMATED">Automatic</option>
          <option value="APPROVED">Approved here</option>
          <option value="MANUAL">Manual / bulk</option>
          <option value="">Every source</option>
        </Form.Select>
        {loading && <Spinner animation="border" size="sm" className="ms-1" />}
      </FilterBar>
      {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
      <div className="acm-table-wrap">
        <Table hover size="sm" className="acm-table mb-0">
          <thead>
            <tr>
              <SortTh label="Inhouse city" field="city" sort={sort} dir={dir} onSort={onSort} />
              <SortTh label="Country" field="country" sort={sort} dir={dir} onSort={onSort} />
              <SortTh label="Supplier" field="provider" sort={sort} dir={dir} onSort={onSort} />
              <SortTh label="Supplier city" field="supplierCity" sort={sort} dir={dir} onSort={onSort} />
              <th>Matched by</th>
              <th>Source</th>
              <SortTh label="Created" field="created" sort={sort} dir={dir} onSort={onSort} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data && data.content.length === 0 && (
              <tr><td colSpan={8} className="acm-empty">No mapped city matches these filters.</td></tr>
            )}
            {(data?.content || []).map((m) => (
              <tr key={m.mappingId}>
                <td>
                  <div className="fw-semibold">{m.cityName}</div>
                  <div className="acm-muted small">#{m.cityId}</div>
                </td>
                <td>{m.countryIso}</td>
                <td><span className="acm-supplier">{providerLabel(m.provider)}</span></td>
                <td>
                  <div>{m.supplierCityName || m.apiCityCode || "—"}</div>
                  <div className="acm-muted small">api_city_id {m.apiCityId}{m.apiCityCode ? ` · ${m.apiCityCode}` : ""}</div>
                </td>
                <td className="small">{m.matchLevel ? m.matchLevel.replace(/_/g, " ").toLowerCase() : "—"}</td>
                <td>
                  <span className={`acm-source src-${(m.source || "").toLowerCase()}`}>{SOURCE_LABEL[m.source] || m.source}</span>
                  <div className="acm-muted small">{m.createdBy}</div>
                </td>
                <td className="small acm-muted">{fmtDate(m.createdDate)}</td>
                <td className="text-end">
                  {m.source === "AUTOMATED" && m.resultId && (
                    <Button size="sm" variant="outline-danger" onClick={() => onUndo(m)} title="Undo this automatic mapping">
                      Undo
                    </Button>
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
