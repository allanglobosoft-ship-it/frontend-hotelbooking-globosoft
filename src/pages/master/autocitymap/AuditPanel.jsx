import React, { useEffect, useState } from "react";
import { Alert, Form, Spinner, Table } from "react-bootstrap";
import { AUDIT_EVENTS, fmtDate, providerLabel, useDebounced, usePagedList } from "./acmShared";
import { FilterBar, Pager } from "./AcmParts";

/** Append-only trail: every automatic mapping, every decision, every run. */
export default function AuditPanel({ active, reloadKey, providers }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 350);
  const [event, setEvent] = useState("");
  const [provider, setProvider] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);

  useEffect(() => setPage(0), [dq, event, provider, size]);
  const { page: data, loading, error } = usePagedList("/audit", { event, provider, q: dq, page, size }, active, reloadKey);

  return (
    <div>
      <FilterBar q={q} onQ={setQ} placeholder="Search city, user or detail…" provider={provider} onProvider={setProvider} providers={providers}>
        <Form.Select size="sm" className="acm-select acm-select-wide" value={event} onChange={(e) => setEvent(e.target.value)} aria-label="Event">
          <option value="">Every event</option>
          {AUDIT_EVENTS.map((e) => (
            <option key={e} value={e}>{e.replace(/_/g, " ").toLowerCase()}</option>
          ))}
        </Form.Select>
        {loading && <Spinner animation="border" size="sm" className="ms-1" />}
      </FilterBar>
      {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
      <div className="acm-table-wrap">
        <Table hover size="sm" className="acm-table mb-0">
          <thead>
            <tr>
              <th>When</th>
              <th>Event</th>
              <th>Supplier</th>
              <th>Inhouse city</th>
              <th>Supplier city</th>
              <th>By</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {data && data.content.length === 0 && (
              <tr><td colSpan={7} className="acm-empty">No audit entries match these filters.</td></tr>
            )}
            {(data?.content || []).map((a) => (
              <tr key={a.id}>
                <td className="small acm-muted text-nowrap">{fmtDate(a.createdAt)}</td>
                <td><span className="acm-event">{a.eventType.replace(/_/g, " ").toLowerCase()}</span></td>
                <td>{a.provider ? providerLabel(a.provider) : "—"}</td>
                <td>{a.cityName ? <>{a.cityName} <span className="acm-muted small">#{a.cityId}</span></> : "—"}</td>
                <td>{a.supplierCityName || a.supplierCityId || "—"}{a.apiCityMappingId ? <div className="acm-muted small">mapping #{a.apiCityMappingId}</div> : null}</td>
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
