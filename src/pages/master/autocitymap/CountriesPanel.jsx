import React, { useEffect, useState } from "react";
import { Alert, Button, Spinner, Table } from "react-bootstrap";
import toast from "react-hot-toast";
import axiosInstance from "../../../components/AxiosInstance";
import { ACM_API, errorText, fmtDate, fmtNumber, useDebounced, usePagedList } from "./acmShared";
import { FilterBar, Pager, SortTh } from "./AcmParts";

const STATUS_OPTIONS = [
  ["", "Every status"],
  ["FAILED", "Failed"],
  ["PROCESSING", "In progress"],
  ["PENDING", "Waiting"],
  ["DONE", "Done"],
];

const UNIT_TONE = { DONE: "ok", PROCESSING: "run", PENDING: "idle", FAILED: "bad" };

/** The work queue: one row per inhouse country, with its last pass and any error. */
export default function CountriesPanel({ active, reloadKey, initialStatus = "", onChanged }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 350);
  const [status, setStatus] = useState(initialStatus);
  const [sort, setSort] = useState("country");
  const [dir, setDir] = useState("asc");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [busy, setBusy] = useState(null);

  useEffect(() => setStatus(initialStatus), [initialStatus]);
  useEffect(() => setPage(0), [dq, status, size]);

  const { page: data, loading, error, reload } = usePagedList("/units", { status, q: dq, sort, dir, page, size }, active, reloadKey);
  const onSort = (field, d) => {
    setSort(field);
    setDir(d);
  };

  const requeue = async (u) => {
    setBusy(u.countryId);
    try {
      const res = await axiosInstance.post(`${ACM_API}/units/${u.countryId}/requeue`);
      toast.success(res.data?.message || "Queued.");
      reload();
      onChanged();
    } catch (err) {
      toast.error(errorText(err, "The country could not be queued."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <p className="acm-hint">
        Each country is matched against every supplier in one go and written in one transaction, so a failure never leaves
        half a country mapped. Failed countries are retried automatically with a growing delay.
      </p>
      <FilterBar q={q} onQ={setQ} placeholder="Search country or ISO code…" status={status} onStatus={setStatus} statusOptions={STATUS_OPTIONS}>
        {loading && <Spinner animation="border" size="sm" className="ms-1" />}
      </FilterBar>
      {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
      <div className="acm-table-wrap">
        <Table hover size="sm" className="acm-table mb-0">
          <thead>
            <tr>
              <SortTh label="Country" field="country" sort={sort} dir={dir} onSort={onSort} />
              <SortTh label="Status" field="status" sort={sort} dir={dir} onSort={onSort} />
              <th className="text-end">Cities</th>
              <th className="text-end">Mapped now</th>
              <th className="text-end">To verify</th>
              <th className="text-end">Dup. / conflicts</th>
              <th className="text-end">No supplier city</th>
              <SortTh label="Finished" field="finished" sort={sort} dir={dir} onSort={onSort} />
              <SortTh label="Took" field="duration" sort={sort} dir={dir} onSort={onSort} className="text-end" />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data && data.content.length === 0 && (
              <tr><td colSpan={10} className="acm-empty">No country matches these filters.</td></tr>
            )}
            {(data?.content || []).map((u) => {
              const t = u.totals || {};
              return (
                <tr key={u.countryId}>
                  <td>
                    <div className="fw-semibold">{u.countryName}</div>
                    <div className="acm-muted small">{u.countryIso}</div>
                  </td>
                  <td>
                    <span className={`acm-tag tone-${UNIT_TONE[u.status] || "idle"}`}>{u.status}</span>
                    {u.attempts > 0 && <div className="acm-muted small">attempt {u.attempts}</div>}
                    {u.lastError && <div className="text-danger small acm-error" title={u.lastError}>{u.lastError}</div>}
                    {u.status === "PENDING" && u.nextAttemptAt && <div className="acm-muted small">retry {fmtDate(u.nextAttemptAt)}</div>}
                  </td>
                  <td className="text-end">{fmtNumber(u.cities)}</td>
                  <td className="text-end">{fmtNumber(t.autoMapped || 0)}</td>
                  <td className="text-end">{fmtNumber(t.review || 0)}</td>
                  <td className="text-end">{fmtNumber((t.duplicates || 0) + (t.conflicts || 0))}</td>
                  <td className="text-end">{fmtNumber(t.noMatch || 0)}</td>
                  <td className="small acm-muted">{fmtDate(u.finishedAt)}</td>
                  <td className="text-end small">{u.durationMs !== null && u.durationMs !== undefined ? `${(u.durationMs / 1000).toFixed(1)} s` : "—"}</td>
                  <td className="text-end">
                    <Button size="sm" variant="outline-secondary" disabled={busy === u.countryId || u.status === "PROCESSING"}
                      onClick={() => requeue(u)} title="Check this country again now">
                      Check again
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
      <Pager data={data} page={page} size={size} onPage={setPage} onSize={setSize} disabled={loading} />
    </div>
  );
}
