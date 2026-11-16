import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Form, InputGroup, Spinner, Table } from "react-bootstrap";
import axiosInstance from "../../../components/AxiosInstance";
import PagerBar from "./PagerBar";
import { fmtNumber } from "./automapFormat";

const WHY = {
  IN_REVIEW: { label: "Possible match waiting for review", tone: "warning" },
  NO_MATCH_FOUND: { label: "No match found at another supplier", tone: "secondary" },
  NOT_CHECKED_YET: { label: "Not checked yet", tone: "info" },
};

/**
 * Hotels with no link to another supplier, kept apart from the mapped lists: our own
 * hotels first, then each supplier's hotels with the reason each one is not mapped.
 */
export default function NotMappedTab({ suppliers, active }) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [supplier, setSupplier] = useState("");
  const [country, setCountry] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [data, setData] = useState(null);
  const [own, setOwn] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim());
      setPage(0);
    }, 400);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const res = await axiosInstance.get("/api/hotel-mapping/auto/unmapped", {
        params: {
          search: debounced || undefined,
          supplier: supplier || undefined,
          country: country.trim() || undefined,
          page,
          size,
        },
        timeout: 60000,
      });
      if (mine !== seq.current) return;
      setData(res.data);
      setError(null);
    } catch (err) {
      if (mine !== seq.current) return;
      setError(err?.response?.data?.error || "The list could not be loaded.");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [debounced, supplier, country, page, size]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  useEffect(() => {
    if (!active) return;
    axiosInstance
      .get("/api/hotel-mapping/auto/mapped", { params: { status: "UNMAPPED", size: 50 }, timeout: 30000 })
      .then((res) => setOwn(res.data))
      .catch(() => setOwn(null));
  }, [active]);

  const content = data?.content || [];
  const ownHotels = own?.content || [];

  return (
    <div className="d-flex flex-column gap-3">
      {ownHotels.length > 0 && (
        <div className="ahm-panel">
          <div className="ahm-panel-head">
            <span>
              Our own hotels not mapped <span className="text-muted fw-normal">({fmtNumber(own.totalElements)})</span>
            </span>
          </div>
          <Table responsive hover className="ahm-table mb-0">
            <thead>
              <tr>
                <th>Hotel</th>
                <th>City</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ownHotels.map((h) => (
                <tr key={h.hotelId}>
                  <td className="ahm-hotel-name">{h.hotelName}</td>
                  <td className="small">{[h.city, h.countryCode || h.country].filter(Boolean).join(", ")}</td>
                  <td className="small">
                    {h.progressStatus === "MANUAL_REVIEW" ? WHY.IN_REVIEW.label : h.progressStatus === "NO_MATCH" ? WHY.NO_MATCH_FOUND.label : WHY.NOT_CHECKED_YET.label}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <div className="ahm-panel p-3 ahm-filters">
        <div className="row g-2 align-items-end">
          <div className="col-lg-6 col-md-12">
            <Form.Label className="small fw-semibold text-muted mb-1">Search</Form.Label>
            <InputGroup>
              <InputGroup.Text>
                <i className="fas fa-search text-muted" aria-hidden="true"></i>
              </InputGroup.Text>
              <Form.Control
                placeholder="Hotel name, city or supplier hotel ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search hotels that are not mapped"
              />
            </InputGroup>
          </div>
          <div className="col-lg-3 col-md-6">
            <Form.Label className="small fw-semibold text-muted mb-1">Supplier</Form.Label>
            <Form.Select
              value={supplier}
              onChange={(e) => {
                setSupplier(e.target.value);
                setPage(0);
              }}
              aria-label="Filter by supplier"
            >
              <option value="">All suppliers</option>
              {(suppliers || []).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.displayName || s.code}
                </option>
              ))}
            </Form.Select>
          </div>
          <div className="col-lg-3 col-md-6">
            <Form.Label className="small fw-semibold text-muted mb-1">Country</Form.Label>
            <Form.Control
              placeholder="Name or code, such as AE"
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setPage(0);
              }}
              aria-label="Filter by country"
            />
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="danger" className="mb-0 d-flex justify-content-between align-items-center">
          <span>{error}</span>
          <Button size="sm" variant="outline-danger" onClick={load}>
            Retry
          </Button>
        </Alert>
      )}

      <div className="ahm-panel">
        <div className="ahm-panel-head">
          <span>
            Supplier hotels not mapped {data ? <span className="text-muted fw-normal">({fmtNumber(data.totalElements)})</span> : null}
          </span>
          {loading && <Spinner animation="border" size="sm" role="status" aria-label="Loading" />}
        </div>
        <Table responsive hover className="ahm-table mb-0">
          <thead>
            <tr>
              <th>Hotel</th>
              <th>Supplier</th>
              <th>City</th>
              <th>Why it is not mapped</th>
            </tr>
          </thead>
          <tbody>
            {content.map((h) => {
              const why = WHY[h.whyNotMapped] || WHY.NOT_CHECKED_YET;
              return (
                <tr key={`${h.supplier}-${h.supplierHotelId}`}>
                  <td>
                    <div className="ahm-hotel-name">{h.name || <span className="text-muted">(unnamed)</span>}</div>
                    <div className="ahm-hotel-id">ID {h.supplierHotelId}</div>
                  </td>
                  <td>
                    <span className="ahm-chip">{h.supplier}</span>
                  </td>
                  <td className="small">{[h.city, h.country].filter(Boolean).join(", ")}</td>
                  <td>
                    <Badge bg={why.tone} text={why.tone === "warning" || why.tone === "info" ? "dark" : undefined}>
                      {why.label}
                    </Badge>
                    {h.pendingReviewPairs > 0 && <span className="small text-muted ms-1">({h.pendingReviewPairs})</span>}
                  </td>
                </tr>
              );
            })}
            {!loading && data && content.length === 0 && (
              <tr>
                <td colSpan={4} className="ahm-empty">
                  {debounced || supplier || country ? "No hotel matches these filters." : "Every hotel is mapped."}
                </td>
              </tr>
            )}
            {loading && !data && (
              <tr>
                <td colSpan={4} className="text-center py-4">
                  <Spinner animation="border" size="sm" className="me-2" /> Loading hotels…
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
              onSizeChange={(n) => {
                setSize(n);
                setPage(0);
              }}
              disabled={loading}
            />
          </div>
        )}
      </div>
    </div>
  );
}
