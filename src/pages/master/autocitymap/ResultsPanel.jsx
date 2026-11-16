import React, { useEffect, useState } from "react";
import { Alert, Button, Spinner, Table } from "react-bootstrap";
import Swal from "sweetalert2";
import toast from "react-hot-toast";
import axiosInstance from "../../../components/AxiosInstance";
import { ACM_API, errorText, fmtDate, fmtNumber, providerLabel, useDebounced, usePagedList } from "./acmShared";
import { FilterBar, Pager, SortTh, StatusTag } from "./AcmParts";

/** A row can be ticked for bulk approval: it waits for verification and proposes a supplier city. */
const canTick = (r) =>
  r.status === "PENDING_REVIEW" && r.supplierCityId !== null && r.supplierCityId !== undefined && String(r.supplierCityId).trim() !== "";

/** What a tick remembers: the row as the list showed it (the server re-checks the proposal). */
const tickOf = (r) => ({
  id: r.id,
  cityName: r.cityName,
  provider: r.provider,
  supplierCityId: String(r.supplierCityId).trim(),
  supplierCityName: r.supplierCityName,
});

/** Text for the SweetAlert html strings (city names come from supplier data). */
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const PREVIEW = 8;
const REPORT = 15;

/**
 * Suppliers whose row is keyed by the inhouse city, so one supplier city may serve several inhouse
 * cities (mirrors SHARABLE_SUPPLIER_CITY in CityAutoMappingReviewService; the server decides).
 */
const SHARABLE_PROVIDERS = ["x3"];

/**
 * Paged list of city_auto_mapping_result rows (review queue, duplicates and
 * conflicts, rejected / removed, automatic mappings). Filtering, sorting and
 * paging happen on the server.
 *
 * With `bulkApprove` (the "Needs verification" list) rows can be ticked and approved in one click,
 * each to the supplier city shown in its row: POST /results/bulk-approve, which applies the single
 * approval's checks to every row and reports the rows it skipped.
 */
export default function ResultsPanel({
  active, reloadKey, statuses, statusOptions, providers, onOpen, hint, emptyText,
  defaultSort = "hotels", actionLabel = "Review", showReason = true,
  bulkApprove = false, onBulkDone,
}) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 350);
  const [provider, setProvider] = useState("");
  const [country, setCountry] = useState(null);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState(statusOptions ? statusOptions[0][0] : statuses);
  const [sort, setSort] = useState(defaultSort);
  const [dir, setDir] = useState("desc");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [ticked, setTicked] = useState({}); // result id -> tickOf(row)
  const [bulkSaving, setBulkSaving] = useState(false);

  useEffect(() => setPage(0), [dq, provider, country, reason, status, size]);

  const { page: data, loading, error } = usePagedList(
    "/results",
    { status, provider, countryId: country?.value, reason, q: dq, sort, dir, page, size },
    active,
    reloadKey,
  );

  // Ticks belong to the rows on screen: a new page, filter or reload keeps only the rows that are
  // still listed with the same proposed supplier city.
  useEffect(() => {
    if (!bulkApprove) return;
    setTicked((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = {};
      (data?.content || []).forEach((r) => {
        const t = prev[r.id];
        if (t && canTick(r) && String(r.supplierCityId).trim() === t.supplierCityId) next[r.id] = tickOf(r);
      });
      return next;
    });
  }, [data, bulkApprove]);

  const onSort = (field, d) => {
    setSort(field);
    setDir(d);
  };

  const rows = data?.content || [];
  const tickable = bulkApprove ? rows.filter(canTick) : [];
  const tickedList = Object.values(ticked);
  const allTicked = tickable.length > 0 && tickable.every((r) => ticked[r.id]);
  const someTicked = tickable.some((r) => ticked[r.id]);

  const toggle = (r) =>
    setTicked((prev) => {
      const next = { ...prev };
      if (next[r.id]) delete next[r.id];
      else next[r.id] = tickOf(r);
      return next;
    });

  const toggleAll = () =>
    setTicked((prev) => {
      const next = { ...prev };
      tickable.forEach((r) => {
        if (allTicked) delete next[r.id];
        else next[r.id] = tickOf(r);
      });
      return next;
    });

  const approveTicked = async () => {
    const list = tickedList;
    if (list.length === 0 || bulkSaving) return;
    const n = list.length;
    const claims = {};
    list.forEach((t) => {
      const k = `${t.provider}|${t.supplierCityId}`;
      claims[k] = (claims[k] || 0) + 1;
    });
    const shared = list.filter((t) => claims[`${t.provider}|${t.supplierCityId}`] > 1);
    const sharable = (t) => SHARABLE_PROVIDERS.includes((t.provider || "").toLowerCase());
    const clashing = shared.filter((t) => !sharable(t)).length;
    const sharing = shared.filter(sharable);
    const preview = list
      .slice(0, PREVIEW)
      .map((t) => `<li><b>${esc(t.cityName)}</b> → ${esc(t.supplierCityName || `#${t.supplierCityId}`)} <span class="acm-swal-muted">(${esc(providerLabel(t.provider))})</span></li>`)
      .join("");
    const confirm = await Swal.fire({
      title: `Approve ${n} mapping${n === 1 ? "" : "s"}?`,
      icon: "question",
      html:
        `<p class="acm-swal-text">Each ticked city is mapped to the supplier city shown in its row, with the same checks as <b>Approve mapping</b>.</p>` +
        `<ul class="acm-swal-list">${preview}</ul>` +
        (n > PREVIEW ? `<p class="acm-swal-text acm-swal-muted">…and ${n - PREVIEW} more.</p>` : "") +
        (clashing > 0
          ? `<p class="acm-swal-text"><b>${clashing}</b> of them propose the same supplier city as another ticked city, and that supplier gives a city to one inhouse city only, so none of those is written. Approve the right one with Review.</p>`
          : "") +
        (sharing.length > 0
          ? `<p class="acm-swal-text acm-swal-muted">${sharing.length} ticked cities share a supplier city with another ticked city (${esc(
              [...new Set(sharing.map((t) => providerLabel(t.provider)))].join(", "),
            )} lets one supplier city serve several inhouse cities), so they will all point to it.</p>`
          : "") +
        `<p class="acm-swal-text acm-swal-muted">A city that fails a check is not written and stays on this list with the reason. Alternative names are not saved; use Review for that.</p>`,
      input: "text",
      inputPlaceholder: "Note (optional, kept in the audit log)",
      inputAttributes: { maxlength: "500", "aria-label": "Note" },
      showCancelButton: true,
      confirmButtonText: `Yes, approve ${n}`,
      customClass: { popup: "acm-swal" },
    });
    if (!confirm.isConfirmed) return;

    setBulkSaving(true);
    try {
      const res = await axiosInstance.post(
        `${ACM_API}/results/bulk-approve`,
        {
          items: list.map((t) => ({ resultId: t.id, supplierCityId: t.supplierCityId })),
          note: typeof confirm.value === "string" && confirm.value.trim() ? confirm.value.trim() : null,
        },
        { timeout: 300000 },
      );
      const d = res.data || {};
      const failed = (d.results || []).filter((x) => !x.approved);
      setTicked({});
      if (onBulkDone) onBulkDone();
      if (failed.length === 0) {
        toast.success(d.message || "Mapped.");
      } else {
        const report = failed
          .slice(0, REPORT)
          .map((x) => `<li><b>${esc(x.cityName || `#${x.resultId}`)}</b> → ${esc(x.supplierCityName || x.supplierCityId || "—")} <span class="acm-swal-muted">(${esc(providerLabel(x.provider))})</span><br/>${esc(x.reason)}</li>`)
          .join("");
        Swal.fire({
          title: d.approved > 0 ? `${d.approved} mapped, ${failed.length} not` : "Nothing was mapped",
          icon: d.approved > 0 ? "info" : "warning",
          html:
            `<p class="acm-swal-text">${esc(d.message)}</p><ul class="acm-swal-list">${report}</ul>` +
            (failed.length > REPORT ? `<p class="acm-swal-text acm-swal-muted">…and ${failed.length - REPORT} more.</p>` : ""),
          customClass: { popup: "acm-swal" },
        });
      }
    } catch (err) {
      toast.error(errorText(err, "The cities could not be approved."));
      // a timeout may still finish on the server: show what is there now
      if (onBulkDone) onBulkDone();
    } finally {
      setBulkSaving(false);
    }
  };

  const columns = bulkApprove ? 10 : 9;

  return (
    <div>
      {hint && <p className="acm-hint">{hint}</p>}
      <FilterBar q={q} onQ={setQ} provider={provider} onProvider={setProvider} providers={providers}
        country={country} onCountry={setCountry}
        reason={showReason ? reason : undefined} onReason={showReason ? setReason : undefined}
        status={status} onStatus={statusOptions ? setStatus : undefined} statusOptions={statusOptions}>
        {loading && <Spinner animation="border" size="sm" className="ms-1" />}
      </FilterBar>
      {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
      {bulkApprove && tickedList.length > 0 && (
        <div className="acm-bulk" role="region" aria-label="Approve ticked cities">
          <span>
            <strong>{fmtNumber(tickedList.length)}</strong> {tickedList.length === 1 ? "city" : "cities"} ticked
          </span>
          <span className="acm-muted small">Each is mapped to the supplier city shown in its row.</span>
          <div className="acm-bulk-actions">
            <Button size="sm" variant="light" onClick={() => setTicked({})} disabled={bulkSaving}>Clear</Button>
            <Button size="sm" variant="primary" onClick={approveTicked} disabled={bulkSaving}>
              {bulkSaving ? (
                <><Spinner animation="border" size="sm" className="me-1" />Approving…</>
              ) : (
                <><i className="fas fa-check-double me-1" aria-hidden="true"></i>Approve {fmtNumber(tickedList.length)} mapping{tickedList.length === 1 ? "" : "s"}</>
              )}
            </Button>
          </div>
        </div>
      )}
      <div className="acm-table-wrap">
        <Table hover size="sm" className="acm-table mb-0">
          <thead>
            <tr>
              {bulkApprove && (
                <th className="acm-check">
                  <input type="checkbox" className="form-check-input" checked={allTicked}
                    ref={(el) => { if (el) el.indeterminate = someTicked && !allTicked; }}
                    disabled={tickable.length === 0 || bulkSaving} onChange={toggleAll}
                    title="Tick every city on this page" aria-label="Tick every city on this page" />
                </th>
              )}
              <SortTh label="Inhouse city" field="city" sort={sort} dir={dir} onSort={onSort} />
              <SortTh label="Country" field="country" sort={sort} dir={dir} onSort={onSort} />
              <SortTh label="Supplier" field="provider" sort={sort} dir={dir} onSort={onSort} />
              <SortTh label="Status / reason" field="reason" sort={sort} dir={dir} onSort={onSort} />
              <th>Supplier city</th>
              <SortTh label="Hotels" field="hotels" sort={sort} dir={dir} onSort={onSort} className="text-end" />
              <SortTh label="Score" field="score" sort={sort} dir={dir} onSort={onSort} className="text-end" />
              <SortTh label="Updated" field="updated" sort={sort} dir={dir} onSort={onSort} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data && rows.length === 0 && (
              <tr><td colSpan={columns} className="acm-empty">{emptyText || "Nothing here."}</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={ticked[r.id] ? "is-ticked" : undefined}>
                {bulkApprove && (
                  <td className="acm-check">
                    <input type="checkbox" className="form-check-input" checked={!!ticked[r.id]}
                      disabled={!canTick(r) || bulkSaving} onChange={() => toggle(r)}
                      title={canTick(r) ? `Tick ${r.cityName}` : "No proposed supplier city: use Review"}
                      aria-label={`Tick ${r.cityName}`} />
                  </td>
                )}
                <td>
                  <div className="fw-semibold">{r.cityName}</div>
                  <div className="acm-muted small">#{r.cityId}</div>
                </td>
                <td>{r.countryIso}</td>
                <td><span className="acm-supplier">{providerLabel(r.provider)}</span></td>
                <td className="acm-reason">
                  <StatusTag status={r.status} />
                  <div className="small mt-1">{r.reasonText}</div>
                </td>
                <td>
                  {r.supplierCityName ? (
                    <>
                      <div>{r.supplierCityName}</div>
                      <div className="acm-muted small">
                        #{r.supplierCityId}
                        {r.supplierCityCode ? ` · ${r.supplierCityCode}` : ""}
                        {r.candidates && r.candidates.length > 1 ? ` · +${r.candidates.length - 1} more` : ""}
                      </div>
                    </>
                  ) : (
                    <span className="acm-muted">—</span>
                  )}
                </td>
                <td className="text-end">{r.supplierHotels !== null && r.supplierHotels !== undefined ? fmtNumber(r.supplierHotels) : "—"}</td>
                <td className="text-end">{r.score ?? "—"}</td>
                <td className="small acm-muted">{fmtDate(r.updatedAt)}</td>
                <td className="text-end">
                  <Button size="sm" variant="outline-primary" onClick={() => onOpen(r)}>{actionLabel}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      <Pager data={data} page={page} size={size} onPage={setPage} onSize={setSize} disabled={loading || bulkSaving} />
    </div>
  );
}
