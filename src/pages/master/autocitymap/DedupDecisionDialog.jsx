import React, { useEffect, useState } from "react";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import toast from "react-hot-toast";
import axiosInstance from "../../../components/AxiosInstance";
import { ACM_API, errorText, providerLabel } from "./acmShared";

/**
 * Manual review of one duplicate finding:
 *  - two inhouse city records: "different cities" (remembered for later scans) or
 *    "the same city, keep #X" (merged now: mappings consolidated, the other record
 *    deactivated only if nothing refers to it);
 *  - one city mapped to several supplier cities: keep one row, remove the others.
 * Every change is backed up and can be restored with the run.
 */
export default function DedupDecisionDialog({ finding, onHide, onDone }) {
  const [choice, setChoice] = useState("");
  const [confirm, setConfirm] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setChoice("");
    setConfirm("");
    setNote("");
    setError(null);
  }, [finding?.id]);

  if (!finding) return null;
  const isPair = finding.kind === "DUPLICATE_CITY_RECORDS" && (finding.recordIds || []).length === 2;
  const isRows = finding.kind === "CONFLICTING_MAPPING_ROWS";
  const names = String(finding.evidence?.names || "").split(" | ");
  const needsConfirm = choice !== "" && choice !== "NOT_DUPLICATE";
  const ev = finding.evidence || {};

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      let res;
      if (isPair) {
        res = await axiosInstance.post(`${ACM_API}/dedup/findings/${finding.id}/decide`, {
          verdict: choice === "NOT_DUPLICATE" ? "NOT_DUPLICATE" : "DUPLICATE",
          keepCityId: choice === "NOT_DUPLICATE" ? null : Number(choice),
          confirm,
          note: note || null,
        }, { timeout: 120000 });
      } else {
        res = await axiosInstance.post(`${ACM_API}/dedup/findings/${finding.id}/keep-row`, { keepRowId: Number(choice), confirm },
          { timeout: 120000 });
      }
      toast.success(res.data?.message || "Saved.");
      onDone();
    } catch (err) {
      setError(errorText(err, "The decision could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={!!finding} onHide={saving ? undefined : onHide} size="lg" centered backdrop="static" className="acm-modal">
      <Modal.Header closeButton={!saving}>
        <Modal.Title as="h5">Review finding #{finding.id}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="acm-dialog-head">
          <div>
            <div className="acm-label">Kind</div>
            <div className="fw-semibold">{finding.kindLabel}</div>
          </div>
          <div>
            <div className="acm-label">Country</div>
            <div>{finding.countryName} ({finding.countryIso})</div>
          </div>
          {finding.provider && (
            <div>
              <div className="acm-label">Supplier</div>
              <div>{providerLabel(finding.provider)}</div>
            </div>
          )}
        </div>
        <p className="mb-2">{finding.reason}</p>
        <dl className="acm-evidence">
          {Object.entries(ev).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)).map(([k, v]) => (
            <React.Fragment key={k}>
              <dt>{k.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
              <dd>{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
            </React.Fragment>
          ))}
        </dl>

        {isPair && (
          <Form.Group className="mt-2">
            <Form.Label className="acm-label">Your decision</Form.Label>
            <Form.Check type="radio" id="dd-not" name="dd" checked={choice === "NOT_DUPLICATE"} onChange={() => setChoice("NOT_DUPLICATE")}
              label="These are different cities (remembered; later scans will not ask again)" />
            {finding.recordIds.map((id, i) => (
              <Form.Check key={id} type="radio" id={`dd-${id}`} name="dd" checked={choice === String(id)} onChange={() => setChoice(String(id))}
                label={`The same city: keep ${names[i] || "#" + id} (#${id}); move the other record's supplier mappings to it`} />
            ))}
            {needsConfirm && (
              <Alert variant="warning" className="small py-2 mt-2 mb-0">
                The other record is deactivated (soft delete) only if nothing such as a hotel, booking, package or agent refers to it;
                otherwise it stays and only its mappings are copied. Everything is backed up and can be restored.
              </Alert>
            )}
          </Form.Group>
        )}

        {isRows && (
          <Form.Group className="mt-2">
            <Form.Label className="acm-label">Keep which row?</Form.Label>
            {(finding.recordIds || []).map((id) => (
              <Form.Check key={id} type="radio" id={`dr-${id}`} name="dr" checked={choice === String(id)} onChange={() => setChoice(String(id))}
                label={`Keep mapping row #${id}; remove the city's other ${providerLabel(finding.provider)} rows`} />
            ))}
          </Form.Group>
        )}

        {!isPair && !isRows && <Alert variant="secondary" className="small py-2">Nothing to decide here; this finding is for information.</Alert>}

        {needsConfirm && (
          <Form.Group className="mt-3">
            <Form.Label className="acm-label">Type REMOVE to confirm</Form.Label>
            <Form.Control size="sm" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="REMOVE" autoComplete="off" />
          </Form.Group>
        )}
        {isPair && (
          <Form.Group className="mt-3">
            <Form.Label className="acm-label">Note (optional)</Form.Label>
            <Form.Control size="sm" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </Form.Group>
        )}
        {error && <Alert variant="danger" className="small py-2 mt-3 mb-0">{error}</Alert>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" size="sm" onClick={onHide} disabled={saving}>Close</Button>
        {(isPair || isRows) && (
          <Button size="sm" variant={needsConfirm ? "danger" : "primary"} onClick={save}
            disabled={saving || choice === "" || (needsConfirm && confirm.trim() !== "REMOVE")}>
            {saving ? <Spinner animation="border" size="sm" /> : needsConfirm ? "Apply" : "Save decision"}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
