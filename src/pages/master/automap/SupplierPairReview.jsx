import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Form, InputGroup, OverlayTrigger, Spinner, Table, Tooltip } from "react-bootstrap";
import Swal from "sweetalert2";
import toast from "react-hot-toast";
import axiosInstance from "../../../components/AxiosInstance";
import PagerBar from "./PagerBar";
import { confidenceTone, escapeHtml, fmtDistance, fmtNumber, fmtPercent, reasonLabel } from "./automapFormat";

/**
 * "Supplier ↔ supplier" half of the Manual Review tab: pairs of hotels from
 * two different suppliers that the supplier-to-supplier pass thinks may be
 * the same property but did not map automatically (similar but not
 * identical names, too far apart, a tie, or a master that already holds that
 * supplier). "Map" puts both into one master hotel after the server re-checks
 * them; "Reject" closes the pair for good. Best matches first.
 */
export default function SupplierPairReview({ suppliers, active, canAct, onChanged, refreshKey }) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [supplier, setSupplier] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [acting, setActing] = useState(null);
  const [minConfidence, setMinConfidence] = useState("");
  const [maxDistance, setMaxDistance] = useState("");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim());
      setPage(0);
    }, 400);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(
    async (silent = false) => {
      const seq = ++requestSeq.current;
      if (!silent) setLoading(true);
      try {
        const res = await axiosInstance.get("/api/hotel-mapping/auto/supplier-pairs", {
          params: {
            search: debounced || undefined,
            supplier: supplier || undefined,
            minConfidence: minConfidence || undefined,
            maxDistance: maxDistance || undefined,
            reason: reason || undefined,
            page,
            size,
          },
          timeout: 30000,
        });
        if (seq !== requestSeq.current) return;
        setData(res.data);
        setError(null);
        // A selection only ever covers rows the admin can see on this page.
        setSelected((prev) => {
          const visible = new Set((res.data?.content || []).map((p) => p.id));
          return new Set([...prev].filter((id) => visible.has(id)));
        });
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(err?.response?.data?.error || err?.response?.data?.message || "The supplier pair list could not be loaded.");
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [debounced, supplier, minConfidence, maxDistance, reason, page, size],
  );

  useEffect(() => {
    if (active) load(false);
  }, [active, load]);

  const lastKey = useRef(refreshKey);
  useEffect(() => {
    if (active && refreshKey !== lastKey.current) {
      lastKey.current = refreshKey;
      load(true);
    }
  }, [active, refreshKey, load]);

  const sideLine = (s) =>
    `<div><strong>${escapeHtml(s.supplierName || s.supplier)}:</strong> ${escapeHtml(s.name || "")} (ID ${escapeHtml(s.supplierHotelId)})` +
    `${s.masterHotelId ? ` · master #${s.masterHotelId}` : ""}</div>`;

  const approve = async (p) => {
    const confirm = await Swal.fire({
      title: "Map these two hotels as one?",
      html:
        `<div class="text-start small">` +
        sideLine(p.a) +
        sideLine(p.b) +
        `<div><strong>Accuracy:</strong> ${fmtPercent(p.confidence, 1)} · ${escapeHtml(reasonLabel(p.reason))}</div>` +
        `<div class="text-muted mt-2">The server re-checks both supplier hotels before saving. If either already belongs to a ` +
        `master hotel, the other joins it (or the two are merged). This decision is recorded under your login.</div>` +
        `</div>`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, map them",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#198754",
    });
    if (!confirm.isConfirmed) return;
    setActing(p.id);
    try {
      const res = await axiosInstance.post(`/api/hotel-mapping/auto/supplier-pairs/${p.id}/approve`, null, { timeout: 30000 });
      toast.success(res.data?.message || "Hotels mapped.");
      await load(true);
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || "The mapping could not be saved.");
    } finally {
      setActing(null);
    }
  };

  const reject = async (p) => {
    const confirm = await Swal.fire({
      title: "Reject this pair?",
      text: `"${p.a.name || p.a.supplierHotelId}" and "${p.b.name || p.b.supplierHotelId}" will not be proposed as the same hotel again.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Reject",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc3545",
    });
    if (!confirm.isConfirmed) return;
    setActing(p.id);
    try {
      const res = await axiosInstance.post(`/api/hotel-mapping/auto/supplier-pairs/${p.id}/reject`, null, { timeout: 30000 });
      toast.success(res.data?.message || "Pair rejected.");
      await load(true);
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || "The pair could not be rejected.");
    } finally {
      setActing(null);
    }
  };

  const content = data?.content || [];
  const allOnPageSelected = content.length > 0 && content.every((p) => selected.has(p.id));

  const togglePage = () => {
    setSelected(allOnPageSelected ? new Set() : new Set(content.map((p) => p.id)));
  };

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulk = async (action) => {
    const approving = action === "APPROVE";
    const rows = content.filter((p) => selected.has(p.id));
    const sample = rows
      .slice(0, 5)
      .map((p) => `<li>${escapeHtml(p.a.name || p.a.supplierHotelId)} = ${escapeHtml(p.b.name || p.b.supplierHotelId)}</li>`)
      .join("");
    const confirm = await Swal.fire({
      title: approving ? `Map ${rows.length} selected pairs?` : `Reject ${rows.length} selected pairs?`,
      html:
        `<div class="text-start small"><ul class="ps-3 mb-2">${sample}</ul>` +
        (rows.length > 5 ? `<div class="mb-2">and ${rows.length - 5} more.</div>` : "") +
        `<div class="text-muted">${
          approving
            ? "The server re-checks each pair before saving, and any that fails is left as it is."
            : "These pairs will not be proposed again."
        } Your login is recorded.</div></div>`,
      icon: approving ? "question" : "warning",
      showCancelButton: true,
      confirmButtonText: approving ? "Yes, map them" : "Reject",
      cancelButtonText: "Cancel",
      confirmButtonColor: approving ? "#198754" : "#dc3545",
    });
    if (!confirm.isConfirmed) return;
    setBulkBusy(true);
    try {
      const res = await axiosInstance.post(
        "/api/hotel-mapping/auto/supplier-pairs/bulk",
        { ids: rows.map((p) => p.id), action },
        { timeout: 300000 },
      );
      const { done, failed, errors } = res.data;
      if (failed > 0) {
        toast.error(`${done} done, ${failed} failed. ${errors?.[0] || ""}`, { duration: 8000 });
      } else {
        toast.success(`${done} pair(s) ${approving ? "mapped" : "rejected"}.`);
      }
      setSelected(new Set());
      await load(true);
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err?.response?.data?.error || "The selected pairs could not be saved.");
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div className="ahm-panel p-3 ahm-filters">
        <div className="row g-2 align-items-end mb-2">
          <div className="col-md-4">
            <Form.Label className="small fw-semibold text-muted mb-1">Match score</Form.Label>
            <Form.Select
              value={minConfidence}
              onChange={(e) => { setMinConfidence(e.target.value); setPage(0); }}
              aria-label="Minimum match score"
            >
              <option value="">Any score</option>
              <option value="99">99% or more</option>
              <option value="95">95% or more</option>
              <option value="90">90% or more</option>
            </Form.Select>
          </div>
          <div className="col-md-4">
            <Form.Label className="small fw-semibold text-muted mb-1">Distance apart</Form.Label>
            <Form.Select
              value={maxDistance}
              onChange={(e) => { setMaxDistance(e.target.value); setPage(0); }}
              aria-label="Maximum distance apart"
            >
              <option value="">Any distance</option>
              <option value="50">Within 50 m</option>
              <option value="100">Within 100 m</option>
              <option value="300">Within 300 m</option>
              <option value="1000">Within 1 km</option>
            </Form.Select>
          </div>
          <div className="col-md-4">
            <Form.Label className="small fw-semibold text-muted mb-1">Reason</Form.Label>
            <Form.Select
              value={reason}
              onChange={(e) => { setReason(e.target.value); setPage(0); }}
              aria-label="Why the pair is waiting"
            >
              <option value="">Any reason</option>
              {["SAME_CONTACT_EXACT", "SAME_CONTACT", "NAME_DIFFERS", "TOO_FAR", "CONFLICT"].map((r) => (
                <option key={r} value={r}>
                  {reasonLabel(r)}
                </option>
              ))}
            </Form.Select>
          </div>
        </div>
        <div className="row g-2 align-items-end">
          <div className="col-lg-6 col-md-8">
            <Form.Label className="small fw-semibold text-muted mb-1">Search</Form.Label>
            <InputGroup>
              <InputGroup.Text>
                <i className="fas fa-search text-muted" aria-hidden="true"></i>
              </InputGroup.Text>
              <Form.Control
                placeholder="Hotel name, city, country code or supplier hotel ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search supplier pairs"
              />
            </InputGroup>
          </div>
          <div className="col-lg-3 col-md-4">
            <Form.Label className="small fw-semibold text-muted mb-1">Supplier</Form.Label>
            <Form.Select value={supplier} onChange={(e) => { setSupplier(e.target.value); setPage(0); }} aria-label="Filter pairs by supplier">
              <option value="">All suppliers</option>
              {(suppliers || []).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.displayName || s.code}
                </option>
              ))}
            </Form.Select>
          </div>
          <div className="col-lg-3 col-md-12 small text-muted">
            Best matches first. Nothing here is ever mapped without your approval.
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="danger" className="mb-0 d-flex justify-content-between align-items-center">
          <span>
            <i className="fas fa-exclamation-circle me-2" aria-hidden="true"></i>
            {error}
          </span>
          <Button size="sm" variant="outline-danger" onClick={() => load(false)}>
            Retry
          </Button>
        </Alert>
      )}

      <div className="ahm-panel">
        <div className="ahm-panel-head">
          <span>
            Supplier hotel pairs to review{" "}
            {data ? <span className="text-muted fw-normal">({fmtNumber(data.totalElements)})</span> : null}
          </span>
          {loading && <Spinner animation="border" size="sm" role="status" aria-label="Loading" />}
        </div>
        {canAct && selected.size > 0 && (
          <div className="d-flex flex-wrap align-items-center gap-2 px-3 py-2 border-bottom">
            <span className="small fw-semibold">{selected.size} selected</span>
            <Button size="sm" variant="success" disabled={bulkBusy} onClick={() => bulk("APPROVE")}>
              {bulkBusy ? <Spinner animation="border" size="sm" /> : "Map selected"}
            </Button>
            <Button size="sm" variant="outline-danger" disabled={bulkBusy} onClick={() => bulk("REJECT")}>
              Reject selected
            </Button>
            <Button size="sm" variant="link" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}
        <Table responsive hover className="ahm-table">
          <thead>
            <tr>
              {canAct && (
                <th style={{ width: 36 }}>
                  <Form.Check
                    aria-label="Select all pairs on this page"
                    checked={allOnPageSelected}
                    disabled={bulkBusy || content.length === 0}
                    onChange={togglePage}
                  />
                </th>
              )}
              <th style={{ width: 44 }}>#</th>
              <th>Hotel A</th>
              <th>Hotel B</th>
              <th className="text-end">Match</th>
              <th>Why not automatic</th>
              {canAct && <th className="text-end">Action</th>}
            </tr>
          </thead>
          <tbody>
            {content.map((p, idx) => (
              <tr key={p.id}>
                {canAct && (
                  <td>
                    <Form.Check
                      aria-label={`Select pair ${p.id}`}
                      checked={selected.has(p.id)}
                      disabled={bulkBusy}
                      onChange={() => toggleRow(p.id)}
                    />
                  </td>
                )}
                <td className="text-muted">{page * size + idx + 1}</td>
                <td>
                  <PairSide side={p.a} />
                </td>
                <td>
                  <PairSide side={p.b} />
                </td>
                <td className="text-end">
                  <Badge bg={confidenceTone(p.confidence)} pill>
                    {fmtPercent(p.confidence, 1)}
                  </Badge>
                </td>
                <td className="small">
                  <OverlayTrigger
                    placement="top"
                    overlay={
                      <Tooltip id={`ahm-pair-reason-${p.id}`}>
                        <div className="text-start">
                          <div>{p.detail || reasonLabel(p.reason)}</div>
                          <div>Name similarity: {fmtPercent(p.nameScore, 1)}</div>
                          <div>Distance: {fmtDistance(p.distanceMeters)}</div>
                        </div>
                      </Tooltip>
                    }
                  >
                    <span style={{ cursor: "help" }}>
                      {reasonLabel(p.reason)}
                      <i className="fas fa-info-circle ms-1 text-muted" aria-hidden="true"></i>
                    </span>
                  </OverlayTrigger>
                </td>
                {canAct && (
                  <td className="text-end text-nowrap">
                    <Button
                      size="sm"
                      variant="success"
                      className="rounded-pill px-3 me-1"
                      disabled={acting !== null}
                      onClick={() => approve(p)}
                      aria-label={`Map ${p.a.supplier} hotel ${p.a.supplierHotelId} and ${p.b.supplier} hotel ${p.b.supplierHotelId} as one`}
                    >
                      {acting === p.id ? <Spinner animation="border" size="sm" /> : "Map"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      className="rounded-pill px-3"
                      disabled={acting !== null}
                      onClick={() => reject(p)}
                      aria-label={`Reject pair ${p.id}`}
                    >
                      Reject
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {!loading && data && content.length === 0 && (
              <tr>
                <td colSpan={canAct ? 7 : 5} className="ahm-empty">
                  <div className="ahm-empty-icon">
                    <i className="fas fa-clipboard-check" aria-hidden="true"></i>
                  </div>
                  {debounced || supplier || minConfidence || maxDistance || reason
                    ? "No pair matches these filters."
                    : "Nothing is waiting for review. Pairs appear here when two suppliers' hotels look alike but are not a 100% match."}
                </td>
              </tr>
            )}
            {loading && !data && (
              <tr>
                <td colSpan={canAct ? 7 : 5} className="text-center py-4">
                  <Spinner animation="border" size="sm" className="me-2" /> Loading pairs…
                </td>
              </tr>
            )}
          </tbody>
        </Table>
        {data && (
          <div className="px-3 pb-3">
            <PagerBar
              page={page}
              size={size}
              totalElements={data.totalElements || 0}
              totalPages={data.totalPages || 1}
              onPageChange={setPage}
              onSizeChange={(n) => { setSize(n); setPage(0); }}
              disabled={loading}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PairSide({ side }) {
  if (!side) return <span className="text-muted">—</span>;
  return (
    <div>
      <div className="d-flex align-items-center gap-1 flex-wrap">
        <span className="ahm-chip">{side.supplier}</span>
        <span className="ahm-hotel-name">{side.name || <span className="text-muted">(unnamed)</span>}</span>
      </div>
      <div className="ahm-hotel-id">
        ID {side.supplierHotelId}
        {[side.city, side.country].filter(Boolean).length ? ` · ${[side.city, side.country].filter(Boolean).join(", ")}` : ""}
        {side.masterHotelId ? ` · master #${side.masterHotelId}` : ""}
      </div>
    </div>
  );
}
