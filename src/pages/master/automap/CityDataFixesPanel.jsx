import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Form, Spinner, Table } from "react-bootstrap";
import Swal from "sweetalert2";
import toast from "react-hot-toast";
import axiosInstance from "../../../components/AxiosInstance";
import PagerBar from "./PagerBar";
import { fmtDateTime, fmtNumber } from "./automapFormat";

const BASE = "/api/cityMapping/review/matching";
const PREVIEW_MS = 180000;
const APPLY_MS = 600000;

const LINK_OUTCOMES = {
  SAME_CODE: "Same city code",
  ONLY_CITY_WITH_NAME: "Only city with that name",
  NEAREST_WITH_NAME: "Several share the name, its position fits one",
  SEVERAL_CITIES: "Not linked: several share the name",
  TOO_FAR: "Not linked: the only city with that name is too far",
  NO_CITY: "Not linked: no city with that name",
};

const errorText = (err, fallback) => err?.response?.data?.error || fallback;

const writeError = (err, fallback) =>
  err?.response?.status === 403 ? "Only a super admin can do this." : errorText(err, fallback);

const supplierLabel = (s) => String(s || "").toUpperCase();

/** Cities whose suppliers place them far apart, so one of those mappings may be wrong. */
function LocationFlags({ active, onChanged }) {
  const [status, setStatus] = useState("OPEN");
  const [page, setPage] = useState(null);
  const [pageNo, setPageNo] = useState(0);
  const [size, setSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get(`${BASE}/location-flags`, { params: { status, page: pageNo, size }, timeout: 60000 });
      setPage(res.data);
      setError(null);
    } catch (err) {
      setError(errorText(err, "The list could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [status, pageNo, size]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  const mark = async (row, action) => {
    try {
      await axiosInstance.post(`${BASE}/location-flags/${row.cityId}/${action}`, {}, { timeout: 30000 });
      await load();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(errorText(err, "This could not be saved."));
    }
  };

  const rows = page?.content || [];
  return (
    <div className="ahm-panel">
      <div className="ahm-panel-head">
        <span>
          Cities that may hold a wrong mapping
          {page ? <span className="text-muted fw-normal"> ({fmtNumber(page.totalElements)})</span> : null}
        </span>
        {loading && <Spinner animation="border" size="sm" role="status" aria-label="Loading" />}
      </div>
      <p className="small text-muted px-3 pt-2 mb-2">
        Two suppliers place these cities far apart, so hotels from the wrong place may be showing, or some coordinates are wrong. Until
        checked, these cities count as evidence for nothing. To remove a wrong mapping, use the City Mapping page.
      </p>
      {error && (
        <Alert variant="danger" className="mx-3">
          {error}
        </Alert>
      )}
      <div className="px-3">
        <Form.Select
          size="sm"
          style={{ width: "auto" }}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPageNo(0);
          }}
          aria-label="Filter cities by whether they have been checked"
        >
          <option value="OPEN">To check</option>
          <option value="FINE">Marked fine</option>
        </Form.Select>
      </div>
      <Table responsive className="ahm-table mb-0 mt-2">
        <thead>
          <tr>
            <th>Our city</th>
            <th className="text-end">Apart</th>
            <th>Suppliers (hotels)</th>
            <th>What our data shows</th>
            <th className="text-end">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.cityId}>
              <td>
                <div className="fw-semibold">{row.cityName || `City #${row.cityId}`}</div>
                <div className="ahm-hotel-id">{row.countryIso || "—"}</div>
              </td>
              <td className="text-end text-nowrap">{fmtNumber(Math.round(row.worstKm))} km</td>
              <td className="text-nowrap">
                {supplierLabel(row.supplierA)} ({fmtNumber(row.hotelsA)}), {supplierLabel(row.supplierB)} ({fmtNumber(row.hotelsB)})
              </td>
              <td className="small">
                {row.note}
                {row.status === "FINE" && row.decidedBy && (
                  <div className="text-muted">
                    Marked fine by {row.decidedBy}, {fmtDateTime(row.decidedAt)}
                  </div>
                )}
              </td>
              <td className="text-end text-nowrap">
                {row.status === "OPEN" ? (
                  <Button size="sm" variant="outline-success" onClick={() => mark(row, "fine")}>
                    Looks fine
                  </Button>
                ) : (
                  <Button size="sm" variant="outline-secondary" onClick={() => mark(row, "reopen")}>
                    Check again
                  </Button>
                )}
              </td>
            </tr>
          ))}
          {!loading && page && rows.length === 0 && (
            <tr>
              <td colSpan={5} className="ahm-empty">
                Nothing here.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
      {page && (
        <div className="px-3 pb-3">
          <PagerBar
            page={pageNo}
            size={size}
            totalElements={page.totalElements || 0}
            totalPages={page.totalPages || 1}
            onPageChange={setPageNo}
            onSizeChange={(n) => {
              setSize(n);
              setPageNo(0);
            }}
            disabled={loading}
          />
        </div>
      )}
    </div>
  );
}

/** A stored hotel list refresh and IWTX city links, each previewed before anything changes. */
function HotelDataFixes({ onChanged }) {
  const [lists, setLists] = useState(null);
  const [links, setLinks] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const previewLists = async () => {
    setBusy("lists");
    try {
      const res = await axiosInstance.get(`${BASE}/list-refresh`, { timeout: PREVIEW_MS });
      setLists(res.data);
      setError(null);
    } catch (err) {
      setError(errorText(err, "The preview could not be worked out."));
    } finally {
      setBusy(null);
    }
  };

  const applyLists = async () => {
    const total = lists.reduce((sum, s) => sum + s.hotelsToAdd, 0);
    const longest = Math.max(...lists.map((s) => s.longestListAfter));
    const confirm = await Swal.fire({
      title: `Add ${fmtNumber(total)} hotels to the stored lists?`,
      html: `<div class="small text-start">New searches will ask the supplier about these hotels. The longest list will hold ${fmtNumber(longest)} hotels, and a long list means more supplier calls per search. Nothing is removed from any list.</div>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, add them",
    });
    if (!confirm.isConfirmed) return;
    setBusy("lists");
    try {
      const expected = Object.fromEntries(lists.map((s) => [s.supplier, s.hotelsToAdd]));
      const res = await axiosInstance.post(`${BASE}/list-refresh`, { expected }, { timeout: APPLY_MS });
      toast.success(res.data.map((r) => `${supplierLabel(r.supplier)}: ${fmtNumber(r.hotelsAdded)} added`).join(", "));
      setLists(null);
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(writeError(err, "The lists could not be refreshed."));
    } finally {
      setBusy(null);
    }
  };

  const previewLinks = async () => {
    setBusy("links");
    try {
      const res = await axiosInstance.get(`${BASE}/iwtx-links`, { timeout: PREVIEW_MS });
      setLinks(res.data);
      setError(null);
    } catch (err) {
      setError(errorText(err, "The preview could not be worked out."));
    } finally {
      setBusy(null);
    }
  };

  const applyLinks = async () => {
    const confirm = await Swal.fire({
      title: `Link ${fmtNumber(links.toLink)} IWTX hotels to their cities?`,
      html: `<div class="small text-start">${fmtNumber(links.reachableAtOnce)} of them are in cities already mapped, so searches will find them straight away. Only empty city ids are filled.</div>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, link them",
    });
    if (!confirm.isConfirmed) return;
    setBusy("links");
    try {
      const res = await axiosInstance.post(`${BASE}/iwtx-links`, { expected: links.toLink }, { timeout: APPLY_MS });
      toast.success(`${fmtNumber(res.data.linked)} hotels linked.`);
      setLinks(null);
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(writeError(err, "The hotels could not be linked."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ahm-panel">
      <div className="ahm-panel-head">
        <span>Hotel data fixes</span>
        {busy && <Spinner animation="border" size="sm" role="status" aria-label="Working" />}
      </div>
      {error && (
        <Alert variant="danger" className="mx-3 mt-2">
          {error}
        </Alert>
      )}
      <div className="p-3 border-bottom">
        <div className="fw-semibold">Refresh stored hotel lists</div>
        <p className="small text-muted mb-2">
          X3 searches only from a list stored when the city was mapped, so hotels it added later are never asked about. This adds them, and
          IWTX lists likewise. Nothing is changed until you apply.
        </p>
        <Button size="sm" variant="outline-primary" className="me-2" disabled={!!busy} onClick={previewLists}>
          Preview
        </Button>
        {lists && lists.some((s) => s.hotelsToAdd > 0) && (
          <Button size="sm" variant="success" disabled={!!busy} onClick={applyLists}>
            Apply
          </Button>
        )}
        {lists && (
          <Table responsive size="sm" className="mt-2 mb-0 small">
            <thead>
              <tr>
                <th>Supplier</th>
                <th className="text-end">Hotels to add</th>
                <th className="text-end">Lists changed</th>
                <th className="text-end">Too far, left out</th>
                <th className="text-end">Cities left out, unclear</th>
                <th className="text-end">Longest list after</th>
                <th>Most added</th>
              </tr>
            </thead>
            <tbody>
              {lists.map((s) => (
                <tr key={s.supplier}>
                  <td>{supplierLabel(s.supplier)}</td>
                  <td className="text-end">{fmtNumber(s.hotelsToAdd)}</td>
                  <td className="text-end">
                    {fmtNumber(s.rowsToChange)} of {fmtNumber(s.rowsWithList)}
                  </td>
                  <td className="text-end">{fmtNumber(s.hotelsTooFar)}</td>
                  <td className="text-end">{fmtNumber(s.unclearCities)}</td>
                  <td className="text-end">
                    {fmtNumber(s.longestListAfter)}
                    {s.longListsAfter > 0 && (
                      <Badge bg="warning" text="dark" className="ms-1" title="Lists of 1,000 hotels or more mean 20 or more supplier calls per search">
                        {fmtNumber(s.longListsAfter)} long
                      </Badge>
                    )}
                  </td>
                  <td>
                    {(s.biggest || [])
                      .slice(0, 3)
                      .map((r) => `${r.cityName || `#${r.cityId}`} +${fmtNumber(r.toAdd)}`)
                      .join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      <div className="p-3">
        <div className="fw-semibold">Link IWTX hotels to cities</div>
        <p className="small text-muted mb-2">
          Many IWTX hotels arrived with no city id, and a search by city cannot find them. IWTX lists several cities under one name, so each
          hotel is linked only when its code or position shows which. The rest stay as they are.
        </p>
        <Button size="sm" variant="outline-primary" className="me-2" disabled={!!busy} onClick={previewLinks}>
          Preview
        </Button>
        {links && links.toLink > 0 && (
          <Button size="sm" variant="success" disabled={!!busy} onClick={applyLinks}>
            Apply
          </Button>
        )}
        {links && (
          <div className="small mt-2">
            <div>
              {fmtNumber(links.unlinkedHotels)} hotels have no city id. {fmtNumber(links.toLink)} can be linked, and{" "}
              {fmtNumber(links.reachableAtOnce)} of those are in cities already mapped.
            </div>
            <ul className="mb-1">
              {Object.entries(LINK_OUTCOMES).map(([code, label]) => (
                <li key={code}>
                  {label}: {fmtNumber(links.outcomes?.[code] || 0)}
                </li>
              ))}
            </ul>
            {(links.biggestNotLinked || []).length > 0 && (
              <div className="text-muted">
                Most hotels not linked:{" "}
                {links.biggestNotLinked
                  .slice(0, 8)
                  .map((n) => `${n.cityName}, ${n.countryIso} (${fmtNumber(n.hotels)})`)
                  .join("; ")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CityDataFixesPanel({ active, onChanged }) {
  return (
    <>
      <LocationFlags active={active} onChanged={onChanged} />
      <HotelDataFixes onChanged={onChanged} />
    </>
  );
}
