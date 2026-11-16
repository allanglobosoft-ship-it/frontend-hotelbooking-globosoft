import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Form, InputGroup, OverlayTrigger, Spinner, Table, Tooltip } from "react-bootstrap";
import Swal from "sweetalert2";
import toast from "react-hot-toast";
import axiosInstance from "../../../components/AxiosInstance";
import PagerBar from "./PagerBar";
import SupplierPairReview from "./SupplierPairReview";
import { confidenceTone, fmtDistance, fmtNumber, fmtPercent, reasonLabel } from "./automapFormat";

/**
 * "Manual Review" tab: every in-house hotel that did NOT satisfy the 100%
 * rule, alphabetically, with the supplier hotels the engine considered and
 * their accuracy. "Map" asks the backend to approve one candidate; the
 * backend re-validates against live data before writing anything.
 * "Reject" closes a candidate for good. Both are admin-only server-side.
 *
 * The "Supplier ↔ supplier" switch shows the pairs of the
 * supplier-to-supplier pass instead (SupplierPairReview).
 */
export default function ManualReviewTab({ suppliers, active, canAct, onChanged, refreshKey, hotelCount, pairCount }) {
  const [mode, setMode] = useState("INHOUSE");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [supplier, setSupplier] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [acting, setActing] = useState(null);
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
        const res = await axiosInstance.get("/api/hotel-mapping/auto/manual-review", {
          params: { search: debounced || undefined, supplier: supplier || undefined, page, size },
          timeout: 30000,
        });
        if (seq !== requestSeq.current) return;
        setData(res.data);
        setError(null);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(err?.response?.data?.error || err?.response?.data?.message || "The manual-review list could not be loaded.");
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [debounced, supplier, page, size],
  );

  const inhouseActive = active && mode === "INHOUSE";

  useEffect(() => {
    if (inhouseActive) load(false);
  }, [inhouseActive, load]);

  const lastKey = useRef(refreshKey);
  useEffect(() => {
    if (inhouseActive && refreshKey !== lastKey.current) {
      lastKey.current = refreshKey;
      load(true);
    }
  }, [inhouseActive, refreshKey, load]);

  const displayName = (code) => (suppliers || []).find((s) => s.code === code)?.displayName || code;

  const approve = async (group, c) => {
    const confirm = await Swal.fire({
      title: "Map this hotel?",
      html:
        `<div class="text-start small">` +
        `<div><strong>Our hotel:</strong> ${escapeHtml(group.hotelName)} (ID ${group.hotelId})</div>` +
        `<div><strong>${escapeHtml(displayName(c.supplier))}:</strong> ${escapeHtml(c.supplierHotelName || "")} (ID ${escapeHtml(c.supplierHotelId)})</div>` +
        `<div><strong>Accuracy:</strong> ${fmtPercent(c.confidence, 1)} · ${escapeHtml(reasonLabel(c.reason))}</div>` +
        `<div class="text-muted mt-2">The server re-checks the supplier hotel before saving. This decision is recorded under your login.</div>` +
        `</div>`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, map it",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#198754",
    });
    if (!confirm.isConfirmed) return;
    setActing(c.id);
    try {
      const res = await axiosInstance.post(`/api/hotel-mapping/auto/candidates/${c.id}/approve`, null, { timeout: 30000 });
      toast.success(res.data?.message || "Hotel mapped.");
      await load(true);
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || "The mapping could not be saved.");
    } finally {
      setActing(null);
    }
  };

  const reject = async (group, c) => {
    const confirm = await Swal.fire({
      title: "Reject this candidate?",
      text: `${displayName(c.supplier)} hotel "${c.supplierHotelName || c.supplierHotelId}" will not be proposed again for ${group.hotelName}.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Reject",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc3545",
    });
    if (!confirm.isConfirmed) return;
    setActing(c.id);
    try {
      const res = await axiosInstance.post(`/api/hotel-mapping/auto/candidates/${c.id}/reject`, null, { timeout: 30000 });
      toast.success(res.data?.message || "Candidate rejected.");
      await load(true);
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || "The candidate could not be rejected.");
    } finally {
      setActing(null);
    }
  };

  const content = data?.content || [];

  const modeSwitch = (
    <div className="d-flex flex-wrap align-items-center gap-2" role="group" aria-label="Review list">
      {[
        { value: "INHOUSE", label: "Our hotels ↔ suppliers", count: hotelCount },
        { value: "SUPPLIER", label: "Supplier ↔ supplier", count: pairCount },
      ].map((m) => (
        <Button
          key={m.value}
          size="sm"
          variant={mode === m.value ? "primary" : "outline-secondary"}
          onClick={() => setMode(m.value)}
          aria-pressed={mode === m.value}
        >
          {m.label}
          {m.count !== null && m.count !== undefined && (
            <Badge bg={mode === m.value ? "light" : "secondary"} text={mode === m.value ? "dark" : undefined} pill className="ms-2">
              {fmtNumber(m.count)}
            </Badge>
          )}
        </Button>
      ))}
    </div>
  );

  if (mode === "SUPPLIER") {
    return (
      <div className="d-flex flex-column gap-3">
        {modeSwitch}
        <SupplierPairReview suppliers={suppliers} active={active} canAct={canAct} onChanged={onChanged} refreshKey={refreshKey} />
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-3">
      {modeSwitch}
      <div className="ahm-panel p-3 ahm-filters">
        <div className="row g-2 align-items-end">
          <div className="col-lg-6 col-md-8">
            <Form.Label className="small fw-semibold text-muted mb-1">Search</Form.Label>
            <InputGroup>
              <InputGroup.Text>
                <i className="fas fa-search text-muted" aria-hidden="true"></i>
              </InputGroup.Text>
              <Form.Control
                placeholder="Hotel name, hotel ID, city, country, supplier or supplier hotel ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search hotels requiring manual mapping"
              />
            </InputGroup>
          </div>
          <div className="col-lg-3 col-md-4">
            <Form.Label className="small fw-semibold text-muted mb-1">Supplier</Form.Label>
            <Form.Select value={supplier} onChange={(e) => { setSupplier(e.target.value); setPage(0); }} aria-label="Filter candidates by supplier">
              <option value="">All suppliers</option>
              {(suppliers || []).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.displayName || s.code}
                </option>
              ))}
            </Form.Select>
          </div>
          <div className="col-lg-3 col-md-12 small text-muted">
            Hotels are listed alphabetically. Nothing here is ever mapped without your approval.
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

      <div className="d-flex justify-content-between align-items-center">
        <div className="fw-bold">
          Hotels requiring manual mapping{" "}
          {data ? <span className="text-muted fw-normal">({fmtNumber(data.totalElements)})</span> : null}
        </div>
        {loading && <Spinner animation="border" size="sm" role="status" aria-label="Loading" />}
      </div>

      {loading && !data && (
        <div className="ahm-panel text-center py-4">
          <Spinner animation="border" size="sm" className="me-2" /> Loading candidates…
        </div>
      )}

      {!loading && data && content.length === 0 && (
        <div className="ahm-panel ahm-empty">
          <div className="ahm-empty-icon">
            <i className="fas fa-clipboard-check" aria-hidden="true"></i>
          </div>
          {debounced || supplier ? "No hotel matches these filters." : "Nothing is waiting for review. Candidates appear here when a match is below 100%, ambiguous, or found with a single supplier only."}
        </div>
      )}

      {content.map((group, gIdx) => (
        <div className="ahm-review-card" key={group.hotelId}>
          <div className="ahm-review-head">
            <span className="ahm-review-no">{page * size + gIdx + 1}</span>
            <div className="flex-grow-1">
              <div className="ahm-hotel-name">{group.hotelName}</div>
              <div className="ahm-hotel-id">
                ID {group.hotelId} · {[group.city, group.country].filter(Boolean).join(", ") || "—"}
                {group.masterHotelId ? ` · master #${group.masterHotelId}` : ""}
              </div>
            </div>
            <div className="d-flex flex-wrap gap-1 align-items-center">
              {(group.mappedSuppliers || []).map((code) => (
                <span className="ahm-chip is-mapped" key={code} title={`${displayName(code)} already mapped`}>
                  <i className="fas fa-check" aria-hidden="true"></i> {code}
                </span>
              ))}
              {group.bestConfidence !== null && group.bestConfidence !== undefined && (
                <Badge bg={confidenceTone(group.bestConfidence)} pill>
                  best {fmtPercent(group.bestConfidence, 1)}
                </Badge>
              )}
            </div>
          </div>
          <Table responsive hover className="ahm-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Supplier hotel</th>
                <th>City / Country</th>
                <th className="text-end">Match</th>
                <th>Why not automatic</th>
                {canAct && <th className="text-end">Action</th>}
              </tr>
            </thead>
            <tbody>
              {(group.candidates || []).map((c) => (
                <tr key={c.id}>
                  <td className="fw-semibold">{c.supplierDisplayName || displayName(c.supplier)}</td>
                  <td>
                    <div>{c.supplierHotelName || <span className="text-muted">(unnamed)</span>}</div>
                    <div className="ahm-hotel-id">ID {c.supplierHotelId}</div>
                  </td>
                  <td className="small">{[c.city, c.country].filter(Boolean).join(", ") || "—"}</td>
                  <td className="text-end">
                    <Badge bg={confidenceTone(c.confidence)} pill>
                      {fmtPercent(c.confidence, 1)}
                    </Badge>
                  </td>
                  <td className="small">
                    <OverlayTrigger
                      placement="top"
                      overlay={
                        <Tooltip id={`ahm-reason-${c.id}`}>
                          <div className="text-start">
                            <div>{c.detail || reasonLabel(c.reason)}</div>
                            <div>Name similarity: {fmtPercent(c.nameScore, 1)}</div>
                            <div>Distance: {fmtDistance(c.distanceMeters)}</div>
                          </div>
                        </Tooltip>
                      }
                    >
                      <span className="text-decoration-underline-dotted" style={{ cursor: "help" }}>
                        {reasonLabel(c.reason)}
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
                        onClick={() => approve(group, c)}
                        aria-label={`Map ${group.hotelName} to ${c.supplier} hotel ${c.supplierHotelId}`}
                      >
                        {acting === c.id ? <Spinner animation="border" size="sm" /> : "Map"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        className="rounded-pill px-3"
                        disabled={acting !== null}
                        onClick={() => reject(group, c)}
                        aria-label={`Reject ${c.supplier} hotel ${c.supplierHotelId}`}
                      >
                        Reject
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {(group.candidates || []).length === 0 && (
                <tr>
                  <td colSpan={canAct ? 6 : 5} className="text-muted small text-center py-3">
                    {supplier ? `No pending ${displayName(supplier)} candidates for this hotel.` : "No pending candidates."}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      ))}

      {data && (
        <PagerBar
          page={page}
          size={size}
          totalElements={data.totalElements || 0}
          totalPages={data.totalPages || 1}
          onPageChange={setPage}
          onSizeChange={(n) => { setSize(n); setPage(0); }}
          disabled={loading}
        />
      )}
    </div>
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
