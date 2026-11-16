import React, { useEffect, useState } from "react";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import AsyncSelect from "react-select/async";
import toast from "react-hot-toast";
import axiosInstance from "../../../components/AxiosInstance";
import { ACM_API, errorText, fmtNumber, providerLabel } from "./acmShared";
import { CountryPicker } from "./AcmParts";

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 34,
    borderRadius: 8,
    fontSize: "0.85rem",
    borderColor: state.isFocused ? "var(--mt-red, #EC0B43)" : "#d7dce2",
    boxShadow: state.isFocused ? "0 0 0 2px rgba(236, 11, 67, .14)" : "none",
  }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
};

/**
 * Manual review of one held-back synchronization item. The answer is remembered, so
 * later scans do not ask again:
 *  - city: add it (name editable), it is an existing inhouse city (link), or ignore;
 *  - country: add it (choose the business region when it was unclear), or ignore;
 *  - supplier country: link it to one of our countries, or leave it unlinked.
 */
export default function GeoSyncDecisionDialog({ item, onHide, onDone }) {
  const [choice, setChoice] = useState("");
  const [name, setName] = useState("");
  const [regionId, setRegionId] = useState("");
  const [regions, setRegions] = useState([]);
  const [city, setCity] = useState(null);
  const [country, setCountry] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setChoice("");
    setName(item?.displayName || item?.name || "");
    setRegionId(item?.evidence?.regionId ? String(item.evidence.regionId) : "");
    setCity(null);
    setCountry(item?.masterId && item?.type === "SUPPLIER_COUNTRY" ? { value: item.masterId, label: item.displayName || `#${item.masterId}` } : null);
    setNote("");
    setError(null);
    if (item?.type === "COUNTRY") {
      axiosInstance.get(`${ACM_API}/geo/regions`).then((res) => setRegions(res.data || [])).catch(() => setRegions([]));
    }
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return null;
  const ev = item.evidence || {};

  const loadCities = async (input) => {
    if (!item.countryId) return [];
    try {
      const res = await axiosInstance.get(`/api/province/getByCountryId/${item.countryId}`, { params: { search: input } });
      return (res.data || []).slice(0, 50).map((c) => ({ value: c.id, label: `${c.stateName || c.name} #${c.id}` }));
    } catch {
      return [];
    }
  };

  const options = item.type === "CITY"
    ? [["ADD", "Add it as a new city"], ["EXISTING", "It already exists: link it to an inhouse city"], ["IGNORE", "Do not add it (remembered)"]]
    : item.type === "COUNTRY"
      ? [["ADD", "Add the country"], ["IGNORE", "Do not add it (remembered)"]]
      : [["LINK", "Link it to one of our countries"], ["IGNORE", "Leave it unlinked (remembered)"]];

  const ready = choice === "IGNORE"
    || (choice === "ADD" && item.type === "CITY" && name.trim().length > 1)
    || (choice === "ADD" && item.type === "COUNTRY" && regionId !== "" && name.trim().length > 1)
    || (choice === "EXISTING" && city)
    || (choice === "LINK" && country);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await axiosInstance.post(`${ACM_API}/geo/items/${item.id}/decide`, {
        verdict: choice,
        name: choice === "ADD" ? name.trim() : null,
        regionId: choice === "ADD" && item.type === "COUNTRY" ? Number(regionId) : null,
        masterId: choice === "EXISTING" ? city?.value : choice === "LINK" ? country?.value : null,
        note: note.trim() || null,
      }, { timeout: 60000 });
      if (res.data?.status && res.data.status !== "DONE" && choice !== "IGNORE") {
        toast.error(res.data?.message || "Nothing was changed.");
      } else {
        toast.success(res.data?.message || "Saved.");
      }
      onDone();
    } catch (err) {
      setError(errorText(err, "The decision could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show onHide={saving ? undefined : onHide} centered backdrop="static" className="acm-modal">
      <Modal.Header closeButton={!saving}>
        <Modal.Title as="h5">
          {item.type === "SUPPLIER_COUNTRY" ? `${providerLabel(item.provider)} country` : item.type === "COUNTRY" ? "Country" : "City"}: {item.name}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="small mb-2">
          {item.countryIso && <>{item.countryIso}{item.countryName ? ` · ${item.countryName}` : ""} · </>}
          source {item.sourceId}
          {item.admin1 && <> · {item.admin1}</>}
          {item.population ? <> · {fmtNumber(item.population)} people</> : null}
          {item.lat !== null && item.lat !== undefined && <> · {Number(item.lat).toFixed(4)}, {Number(item.lon).toFixed(4)}</>}
        </div>
        <Alert variant="warning" className="small py-2">{item.reason}</Alert>
        {(ev.supplierCities || []).length > 0 && (
          <div className="small mb-2"><span className="acm-label">Supplier cities at this spot</span><div>{ev.supplierCities.join("; ")}</div></div>
        )}
        {ev.similarCityName && <div className="small mb-2">Similar inhouse city: {ev.similarCityName} #{ev.similarCityId}</div>}

        <Form.Group className="mb-3">
          {options.map(([v, label]) => (
            <Form.Check key={v} type="radio" id={`geo-choice-${v}`} name="geo-choice" label={label} checked={choice === v}
              onChange={() => setChoice(v)} />
          ))}
        </Form.Group>

        {choice === "ADD" && (
          <Form.Group className="mb-3">
            <Form.Label className="acm-label">Name of the new {item.type === "COUNTRY" ? "country" : "city"}</Form.Label>
            <Form.Control size="sm" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            <Form.Text className="acm-muted">Refused if a {item.type === "COUNTRY" ? "country" : "city of this country"} with that name exists now.</Form.Text>
          </Form.Group>
        )}
        {choice === "ADD" && item.type === "COUNTRY" && (
          <Form.Group className="mb-3">
            <Form.Label className="acm-label">Business region</Form.Label>
            <Form.Select size="sm" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
              <option value="">Choose…</option>
              {regions.map((r) => <option key={r.id} value={r.id}>{r.name} ({fmtNumber(r.countries)} countries)</option>)}
            </Form.Select>
          </Form.Group>
        )}
        {choice === "EXISTING" && (
          <Form.Group className="mb-3">
            <Form.Label className="acm-label">Inhouse city of {item.countryIso}</Form.Label>
            <AsyncSelect cacheOptions defaultOptions loadOptions={loadCities} value={city} onChange={setCity} isClearable
              placeholder="Search a city…" menuPortalTarget={document.body} styles={selectStyles} aria-label="Inhouse city" />
          </Form.Group>
        )}
        {choice === "LINK" && (
          <Form.Group className="mb-3">
            <Form.Label className="acm-label">Our country</Form.Label>
            <CountryPicker value={country} onChange={setCountry} />
          </Form.Group>
        )}
        {choice !== "" && (
          <Form.Group>
            <Form.Label className="acm-label">Note (optional)</Form.Label>
            <Form.Control size="sm" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Form.Group>
        )}
        {error && <Alert variant="danger" className="small py-2 mt-3 mb-0">{error}</Alert>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" size="sm" onClick={onHide} disabled={saving}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={save} disabled={saving || !ready}>
          {saving ? <Spinner animation="border" size="sm" /> : "Save decision"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
