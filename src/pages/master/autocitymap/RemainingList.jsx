import React, { useEffect, useState } from "react";
import { Alert, Button, Spinner, Table } from "react-bootstrap";
import Swal from "sweetalert2";
import toast from "react-hot-toast";
import axiosInstance from "../../../components/AxiosInstance";
import { ACM_API, errorText, escapeHtml, fmtNumber, providerLabel, useDebounced, usePagedList } from "./acmShared";
import { FilterBar, Pager } from "./AcmParts";
import { GROUP_META } from "./RemainingPanel";

const PREVIEW = 8;
const REPORT = 15;

/** Sharing needs a city that holds the supplier city already (not one that is itself waiting). */
const canShare = (r) => r.anchorCityId !== null && r.anchorCityId !== undefined && !r.anchorPending;

/**
 * The rows of one "Sort out what is left" group (GET /remaining/rows), biggest supplier cities first, with the
 * city each would share its supplier city with. Rows are ticked and then shared (POST /results/bulk-share: the
 * supplier city must still belong to that city) or rejected (POST /results/bulk-reject), or opened in Review.
 */
export default function RemainingList({ group, reloadKey, providers, onOpen, onChanged, onBack }) {
  const meta = GROUP_META[group] || { label: group, text: "" };
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 350);
  const [provider, setProvider] = useState("");
  const [country, setCountry] = useState(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const [ticked, setTicked] = useState({});
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(null);

  useEffect(() => setPage(0), [group, dq, provider, country, size]);
  useEffect(() => setTicked({}), [group]);

  const { page: data, loading, error } = usePagedList(
    "/remaining/rows",
    { group, provider, countryId: country?.value, q: dq, page, size },
    true,
    reloadKey,
  );
  const rows = data?.content || [];

  // ticks belong to the rows on screen
  useEffect(() => {
    setTicked((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = {};
      (data?.content || []).forEach((r) => {
        if (prev[r.resultId]) next[r.resultId] = r;
      });
      return next;
    });
  }, [data]);

  const tickedList = Object.values(ticked);
  const allTicked = rows.length > 0 && rows.every((r) => ticked[r.resultId]);
  const someTicked = rows.some((r) => ticked[r.resultId]);
  // review-only groups (other state, needs a person) are settled one by one with Review, or rejected
  const shareGroup = meta.kind === "tick" || meta.kind === "map";
  const shareable = shareGroup && tickedList.length > 0 && tickedList.every(canShare);

  const toggle = (r) =>
    setTicked((prev) => {
      const next = { ...prev };
      if (next[r.resultId]) delete next[r.resultId];
      else next[r.resultId] = r;
      return next;
    });

  const toggleAll = () =>
    setTicked((prev) => {
      const next = { ...prev };
      rows.forEach((r) => {
        if (allTicked) delete next[r.resultId];
        else next[r.resultId] = r;
      });
      return next;
    });

  const open = async (r) => {
    setOpening(r.resultId);
    try {
      const res = await axiosInstance.get(`${ACM_API}/results/${r.resultId}`);
      onOpen(res.data);
    } catch (err) {
      toast.error(errorText(err, "The row could not be opened."));
    } finally {
      setOpening(null);
    }
  };

  const act = async (verb) => {
    const list = tickedList;
    if (list.length === 0 || saving) return;
    const share = verb === "share";
    const n = list.length;
    const preview = list
      .slice(0, PREVIEW)
      .map((r) => `<li><b>${escapeHtml(r.cityName)}</b> → ${escapeHtml(r.supplierCityName || "#" + r.supplierCityId)} <span class="acm-swal-muted">(${escapeHtml(providerLabel(r.provider))}${share ? `, like ${escapeHtml(r.anchorCityName)}` : ""})</span></li>`)
      .join("");
    const confirm = await Swal.fire({
      title: share ? `Map ${n} cit${n === 1 ? "y" : "ies"} like their twin?` : `Reject ${n} proposal${n === 1 ? "" : "s"}?`,
      icon: share ? "question" : "warning",
      html:
        `<p class="acm-swal-text">${share
          ? "Each city gets the supplier city of the city shown in brackets, which keeps it too. A city is only written while that city still holds the supplier city."
          : "The proposal and the listed candidates of each city are rejected; the engine never offers them again. Reopen undoes it."}</p>` +
        `<ul class="acm-swal-list">${preview}</ul>` +
        (n > PREVIEW ? `<p class="acm-swal-text acm-swal-muted">…and ${n - PREVIEW} more.</p>` : ""),
      input: "text",
      inputPlaceholder: "Note (optional, kept in the audit log)",
      inputAttributes: { maxlength: "500", "aria-label": "Note" },
      showCancelButton: true,
      confirmButtonText: share ? `Yes, map ${n}` : `Yes, reject ${n}`,
      customClass: { popup: "acm-swal" },
    });
    if (!confirm.isConfirmed) return;
    setSaving(true);
    try {
      const res = await axiosInstance.post(
        `${ACM_API}/results/${share ? "bulk-share" : "bulk-reject"}`,
        {
          items: list.map((r) => ({ resultId: r.resultId, supplierCityId: r.supplierCityId, anchorCityId: share ? r.anchorCityId : null })),
          note: typeof confirm.value === "string" && confirm.value.trim() ? confirm.value.trim() : null,
        },
        { timeout: 300000 },
      );
      const d = res.data || {};
      const failed = (d.results || []).filter((x) => !x.approved && x.code !== "REJECTED");
      setTicked({});
      if (onChanged) onChanged();
      if (failed.length === 0) {
        toast.success(d.message || "Done.");
      } else {
        Swal.fire({
          title: d.done > 0 ? `${d.done} done, ${failed.length} not` : "Nothing was changed",
          icon: d.done > 0 ? "info" : "warning",
          html:
            `<p class="acm-swal-text">${escapeHtml(d.message)}</p><ul class="acm-swal-list">` +
            failed.slice(0, REPORT).map((x) => `<li><b>${escapeHtml(x.cityName || "#" + x.resultId)}</b><br/>${escapeHtml(x.reason)}</li>`).join("") +
            "</ul>" +
            (failed.length > REPORT ? `<p class="acm-swal-text acm-swal-muted">…and ${failed.length - REPORT} more.</p>` : ""),
          customClass: { popup: "acm-swal" },
        });
      }
    } catch (err) {
      toast.error(errorText(err, "The cities could not be changed."));
      if (onChanged) onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="acm-remaining-listhead">
        <Button size="sm" variant="light" onClick={onBack}>
          <i className="fas fa-arrow-left me-1" aria-hidden="true"></i>All cities waiting
        </Button>
        <div>
          <div className="fw-semibold">{meta.label}</div>
          <div className="acm-muted small">{meta.text}</div>
        </div>
      </div>
      <FilterBar q={q} onQ={setQ} provider={provider} onProvider={setProvider} providers={providers}
        country={country} onCountry={setCountry} placeholder="Search city, supplier city or twin…">
        {loading && <Spinner animation="border" size="sm" className="ms-1" />}
      </FilterBar>
      {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
      {tickedList.length > 0 && (
        <div className="acm-bulk" role="region" aria-label="Act on ticked cities">
          <span><strong>{fmtNumber(tickedList.length)}</strong> {tickedList.length === 1 ? "city" : "cities"} ticked</span>
          {shareGroup && !shareable && <span className="acm-muted small">Sharing needs a twin that already holds the supplier city.</span>}
          {!shareGroup && <span className="acm-muted small">These need a decision each: use Review, or reject the wrong ones.</span>}
          <div className="acm-bulk-actions">
            <Button size="sm" variant="light" onClick={() => setTicked({})} disabled={saving}>Clear</Button>
            <Button size="sm" variant="outline-danger" onClick={() => act("reject")} disabled={saving}>
              <i className="fas fa-ban me-1" aria-hidden="true"></i>Reject {fmtNumber(tickedList.length)}
            </Button>
            {shareGroup && (
              <Button size="sm" variant="primary" onClick={() => act("share")} disabled={saving || !shareable}>
                {saving ? <Spinner animation="border" size="sm" /> : (
                  <><i className="fas fa-link me-1" aria-hidden="true"></i>Map {fmtNumber(tickedList.length)} like their twin</>
                )}
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="acm-table-wrap">
        <Table hover size="sm" className="acm-table mb-0">
          <thead>
            <tr>
              <th className="acm-check">
                <input type="checkbox" className="form-check-input" checked={allTicked}
                  ref={(el) => { if (el) el.indeterminate = someTicked && !allTicked; }}
                  disabled={rows.length === 0 || saving} onChange={toggleAll}
                  title="Tick every city on this page" aria-label="Tick every city on this page" />
              </th>
              <th>Inhouse city</th>
              <th>Supplier</th>
              <th>Supplier city</th>
              <th className="text-end">Hotels</th>
              <th>Twin (holds the supplier city)</th>
              <th>Why</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data && rows.length === 0 && (
              <tr><td colSpan={8} className="acm-empty">Nothing left in this group.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.resultId} className={ticked[r.resultId] ? "is-ticked" : undefined}>
                <td className="acm-check">
                  <input type="checkbox" className="form-check-input" checked={!!ticked[r.resultId]} disabled={saving}
                    onChange={() => toggle(r)} aria-label={`Tick ${r.cityName}`} />
                </td>
                <td>
                  <div className="fw-semibold">{r.cityName}</div>
                  <div className="acm-muted small">#{r.cityId} · {r.countryIso}</div>
                </td>
                <td><span className="acm-supplier">{providerLabel(r.provider)}</span></td>
                <td>
                  <div>{r.supplierCityName || "—"}</div>
                  <div className="acm-muted small">#{r.supplierCityId}</div>
                </td>
                <td className="text-end">{r.supplierHotels !== null && r.supplierHotels !== undefined ? fmtNumber(r.supplierHotels) : "—"}</td>
                <td>
                  {r.anchorCityId ? (
                    <>
                      <div>{r.anchorCityName}</div>
                      <div className="acm-muted small">#{r.anchorCityId}{r.anchorPending ? " · not mapped yet" : ""}</div>
                    </>
                  ) : (
                    <span className="acm-muted">—</span>
                  )}
                </td>
                <td className="small acm-why">{r.why}</td>
                <td className="text-end">
                  <Button size="sm" variant="outline-primary" onClick={() => open(r)} disabled={opening === r.resultId}>
                    {opening === r.resultId ? <Spinner animation="border" size="sm" /> : "Review"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      <Pager data={data} page={page} size={size} onPage={setPage} onSize={setSize} disabled={loading || saving} />
    </div>
  );
}
