import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Form, Modal, Spinner, Table } from "react-bootstrap";
import Swal from "sweetalert2";
import toast from "react-hot-toast";
import axiosInstance from "../../../components/AxiosInstance";
import { ACM_API, errorText, fmtNumber, providerLabel, useDebounced } from "./acmShared";
import { StatusTag } from "./AcmParts";

const APPROVABLE = ["PENDING_REVIEW", "DUPLICATE", "REMOVED", "REJECTED", "FAILED"];

const norm = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Manual verification of one city / supplier pair. Approving writes the row through
 * the server's validated pair import (same country, nothing overwritten, no
 * supplier city used twice); rejecting tells the engine never to map the pair.
 */
export default function ReviewDialog({ row, onHide, onDone }) {
  const [picked, setPicked] = useState(null);
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 350);
  const [lookup, setLookup] = useState(null);
  const [lookupError, setLookupError] = useState(null);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveAlias, setSaveAlias] = useState(false);
  const [note, setNote] = useState("");
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    setPicked(null);
    setQ("");
    setLookup(null);
    setLookupError(null);
    setSaveAlias(false);
    setNote("");
    setSaveError(null);
    setLooking(false);
  }, [row?.id]);

  useEffect(() => {
    // dq !== q: the debounced text still belongs to the previous typing (or the previous row)
    if (!row || dq.trim().length < 2 || dq !== q) {
      if (!row || q.trim().length < 2) setLookup(null);
      setLooking(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLooking(true);
      try {
        const res = await axiosInstance.get(`${ACM_API}/results/${row.id}/candidates`, {
          params: { q: dq.trim(), limit: 50 },
          timeout: 60000,
        });
        if (!cancelled) {
          setLookup(res.data);
          setLookupError(null);
        }
      } catch (err) {
        if (!cancelled) setLookupError(errorText(err, "The supplier cities could not be searched."));
      } finally {
        if (!cancelled) setLooking(false);
      }
    })();
    return () => {
      cancelled = true;
      setLooking(false);
    };
  }, [row, dq, q]);

  const suggestions = useMemo(() => {
    if (!row) return [];
    const list = [...(row.candidates || [])];
    if (row.supplierCityId && !list.some((c) => String(c.supplierCityId) === String(row.supplierCityId))) {
      list.unshift({
        supplierCityId: row.supplierCityId,
        name: row.supplierCityName,
        code: row.supplierCityCode,
        hotelCount: row.supplierHotels ?? -1,
        score: row.score,
        why: "Proposed match",
        distanceKm: row.geoDistanceKm,
      });
    }
    return list;
  }, [row]);

  if (!row) return null;
  const canApprove = APPROVABLE.includes(row.status);
  const supplier = providerLabel(row.provider);
  const aliasPossible = picked && picked.name && norm(picked.name) !== norm(row.cityName);

  const pick = (c, usedBy) => {
    if (usedBy) return;
    setPicked({ id: String(c.supplierCityId), name: c.name });
    setSaveError(null);
  };

  const approve = async () => {
    if (!picked) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await axiosInstance.post(`${ACM_API}/results/${row.id}/approve`, {
        supplierCityId: picked.id,
        supplierCityName: picked.name,
        addAlternativeName: aliasPossible && saveAlias,
        note: note || null,
      }, { timeout: 120000 });
      toast.success(res.data?.message || "Mapped.");
      if (res.data?.alternativeNameAdded === false && res.data?.alternativeNameMessage) {
        toast(res.data.alternativeNameMessage);
      }
      onDone();
    } catch (err) {
      setSaveError(errorText(err, "The mapping could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const reject = async ({ removeMapping = false } = {}) => {
    const ids = picked ? [picked.id] : [];
    const what = picked
      ? `${picked.name || "#" + picked.id}`
      : suggestions.length > 0
        ? `all ${suggestions.length} listed candidate(s)`
        : "this suggestion";
    const confirm = await Swal.fire({
      title: removeMapping ? "Undo the automatic mapping?" : "Reject this match?",
      html: removeMapping
        ? `The ${supplier} row the engine wrote for <b>${row.cityName}</b> is deleted, and the engine will not map this pair again.`
        : `The engine will never map <b>${row.cityName}</b> to ${what} for ${supplier}. You can reopen it later.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: removeMapping ? "Yes, undo it" : "Yes, reject",
    });
    if (!confirm.isConfirmed) return;
    setSaving(true);
    try {
      const res = await axiosInstance.post(`${ACM_API}/results/${row.id}/reject`, {
        supplierCityIds: ids,
        removeMapping,
        note: note || null,
      });
      toast.success(res.data?.message || "Rejected.");
      onDone();
    } catch (err) {
      setSaveError(errorText(err, "The rejection could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const reopen = async () => {
    setSaving(true);
    try {
      const res = await axiosInstance.post(`${ACM_API}/results/${row.id}/reopen`);
      toast.success(res.data?.message || "Reopened.");
      onDone();
    } catch (err) {
      setSaveError(errorText(err, "The row could not be reopened."));
    } finally {
      setSaving(false);
    }
  };

  const candidateRows = (list, live) =>
    list.map((c) => {
      const id = String(c.supplierCityId);
      const usedBy = live && c.mappedToMasterCityId ? c.mappedToMasterCity || `#${c.mappedToMasterCityId}` : null;
      const isPicked = picked?.id === id;
      return (
        <tr key={`${live ? "l" : "s"}-${id}`} className={`${isPicked ? "is-picked" : ""} ${usedBy ? "is-used" : ""}`}
          onClick={() => canApprove && pick(c, usedBy)}>
          <td style={{ width: 32 }}>
            <Form.Check type="radio" name="acm-candidate" checked={isPicked} disabled={!canApprove || !!usedBy}
              onChange={() => pick(c, usedBy)} aria-label={`Choose ${c.name}`} />
          </td>
          <td>
            <div className="fw-semibold">{c.name}</div>
            <div className="acm-muted small">#{id}{c.code ? ` · code ${c.code}` : ""}</div>
          </td>
          <td className="text-end">{c.hotelCount >= 0 ? fmtNumber(c.hotelCount) : "—"}</td>
          <td>
            {live ? (
              <span className="acm-muted small">{c.score > 0 ? `Score ${c.score}` : "Search hit"}</span>
            ) : (
              <>
                <span className={`acm-score s${Math.floor((c.score || 0) / 10) * 10}`}>{c.score ?? "—"}</span>{" "}
                <span className="small">{c.why}</span>
              </>
            )}
          </td>
          <td className="small">
            {c.distanceKm !== null && c.distanceKm !== undefined ? `${c.distanceKm} km` : ""}
            {usedBy && <span className="text-danger">Already used by {usedBy}</span>}
          </td>
        </tr>
      );
    });

  return (
    <Modal show={!!row} onHide={saving ? undefined : onHide} size="lg" centered backdrop="static" className="acm-modal">
      <Modal.Header closeButton={!saving}>
        <Modal.Title as="h5">
          Verify {row.cityName} <span className="acm-muted fw-normal">→ {supplier}</span>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="acm-dialog-head">
          <div>
            <div className="acm-label">Inhouse city</div>
            <div className="fw-semibold">{row.cityName} <span className="acm-muted">#{row.cityId}</span></div>
            <div className="acm-muted small">{row.countryIso}</div>
          </div>
          <div>
            <div className="acm-label">Status</div>
            <StatusTag status={row.status} />
          </div>
          <div className="flex-grow-1">
            <div className="acm-label">Why</div>
            <div>{row.reasonText || "—"}</div>
            {row.detail && <div className="acm-muted small mt-1">{row.detail}</div>}
          </div>
        </div>

        {row.status === "CONFLICT" && (
          <Alert variant="warning" className="small py-2">
            {row.cityName} already has a {supplier} row (api_city_id {row.existingApiCityIds}). Existing rows are never changed here;
            open the <a href="/masters/city-mapping" target="_blank" rel="opener">City Mapping screen</a> to change it, or reject the
            proposed match below.
          </Alert>
        )}
        {row.status === "DUPLICATE" && row.conflictingCityId && (
          <Alert variant="warning" className="small py-2">
            The proposed supplier city already belongs to {row.conflictingCityName || "inhouse city"} #{row.conflictingCityId}. A supplier
            city is never mapped to two cities here; choose a different one or reject.
          </Alert>
        )}
        {row.status === "AUTO_MAPPED" && (
          <Alert variant="success" className="small py-2">
            Mapped automatically to <b>{row.supplierCityName}</b> #{row.supplierCityId} (mapping #{row.apiCityMappingId}). If this is wrong,
            undo it below; the engine will not map the pair again.
          </Alert>
        )}

        <div className="acm-label mt-3">Suggested supplier cities</div>
        {suggestions.length === 0 ? (
          <div className="acm-empty-sm">No suggestion. Search the supplier's cities below.</div>
        ) : (
          <Table size="sm" hover className="acm-cand mb-2">
            <thead>
              <tr><th></th><th>Supplier city</th><th className="text-end">Hotels</th><th>Match</th><th>Distance</th></tr>
            </thead>
            <tbody>{candidateRows(suggestions, false)}</tbody>
          </Table>
        )}

        {canApprove && (
          <>
            <div className="acm-label mt-3">Search all {supplier} cities in this country</div>
            <div className="acm-search mb-2">
              <i className="fas fa-search" aria-hidden="true"></i>
              <Form.Control size="sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type at least 2 letters (name or code)…" />
              {looking && <Spinner animation="border" size="sm" className="ms-2" />}
            </div>
            {lookupError && <Alert variant="danger" className="small py-2">{lookupError}</Alert>}
            {lookup && lookup.countryResolved === false && (
              <Alert variant="secondary" className="small py-2">{supplier} has no cities in this country.</Alert>
            )}
            {lookup && lookup.existing && lookup.existing.length > 0 && (
              <Alert variant="warning" className="small py-2">
                This city already has a {supplier} row ({lookup.existing.map((e) => e.apiCityId + (e.deleted ? " (deleted)" : "")).join(", ")}),
                so approving will be refused.
              </Alert>
            )}
            {lookup && lookup.candidates && lookup.candidates.length > 0 && (
              <Table size="sm" hover className="acm-cand">
                <thead>
                  <tr><th></th><th>Supplier city</th><th className="text-end">Hotels</th><th>Match</th><th></th></tr>
                </thead>
                <tbody>{candidateRows(lookup.candidates, true)}</tbody>
              </Table>
            )}
            {lookup && lookup.candidates && lookup.candidates.length === 0 && (
              <div className="acm-empty-sm">No {supplier} city in this country matches "{dq}".</div>
            )}
          </>
        )}

        {canApprove && aliasPossible && (
          <Form.Check className="mt-2" id="acm-save-alias" checked={saveAlias} onChange={(e) => setSaveAlias(e.target.checked)}
            label={`Also remember "${picked.name}" as an alternative name of ${row.cityName}, so other suppliers using that spelling are mapped automatically`} />
        )}
        <Form.Group className="mt-3">
          <Form.Label className="acm-label">Note (optional, kept in the audit log)</Form.Label>
          <Form.Control size="sm" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Form.Group>
        {saveError && <Alert variant="danger" className="small py-2 mt-3 mb-0">{saveError}</Alert>}
      </Modal.Body>
      <Modal.Footer className="justify-content-between">
        <div className="d-flex gap-2">
          {(row.status === "REJECTED" || row.status === "REMOVED") && (
            <Button variant="outline-secondary" size="sm" onClick={reopen} disabled={saving}>Reopen</Button>
          )}
          {row.status === "AUTO_MAPPED" ? (
            <Button variant="outline-danger" size="sm" onClick={() => reject({ removeMapping: true })} disabled={saving}>
              Undo automatic mapping
            </Button>
          ) : (
            row.status !== "APPROVED" && row.status !== "REJECTED" && (
              <Button variant="outline-danger" size="sm" onClick={() => reject()} disabled={saving}
                title={picked ? "Reject the chosen supplier city" : "Reject every listed candidate"}>
                {picked ? "Reject this candidate" : "Reject"}
              </Button>
            )
          )}
        </div>
        <div className="d-flex gap-2">
          <Button variant="light" size="sm" onClick={onHide} disabled={saving}>Close</Button>
          {canApprove && (
            <Button variant="primary" size="sm" onClick={approve} disabled={saving || !picked}
              title={picked ? "" : "Choose a supplier city first"}>
              {saving ? <Spinner animation="border" size="sm" /> : "Approve mapping"}
            </Button>
          )}
        </div>
      </Modal.Footer>
    </Modal>
  );
}
