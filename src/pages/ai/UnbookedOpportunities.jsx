import React, { useEffect, useMemo, useState } from "react";
import {
  Row,
  Col,
  Card,
  Form,
  Button,
  Table,
  Pagination,
  Spinner,
} from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import RegionalClock from "../../components/RegionalClock";
import Agent from "../../components/filters/Agent";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";

// Read-only admin report of hotel selections captured in
// hotel_search_history that never became a confirmed booking. All data
// comes from the existing search-history table via the new admin-only
// /api/ai/unbooked-opportunities endpoint — no writes, no coupling to
// the agent-facing suggestion pipeline.
const INITIAL_FILTERS = {
  from: "",
  to: "",
  agentId: "",
  hotelQuery: "",
  type: "HOTEL",
  status: "UNBOOKED",
  // Stage of the funnel to show:
  //   "SELECTION" — hotels the agent picked from the search (legacy behaviour)
  //   "SEARCH"    — raw search contexts the agent submitted, no hotel picked yet
  //   "ALL"       — both, interleaved by recency
  // Default "ALL" so a new agent search shows up immediately in this
  // report without the admin having to switch views. Backwards-compatible:
  // older backends without stage support ignore the param and return
  // SELECTION rows only.
  stage: "ALL",
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayOnly(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function UnbookedOpportunities() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(INITIAL_FILTERS);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({
    totalCount: 0,
    potentialValue: 0,
    currency: "AED",
  });
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const updateFilter = (field, value) =>
    setFilters((prev) => ({ ...prev, [field]: value }));

  // Only pass filters that carry an actual value — a blank string on
  // the server side would still take the LIKE branch and return 0 rows.
  const buildParams = (f, pageIdx, pageSize) => {
    const params = {};
    if (f.from) params.from = f.from;
    if (f.to) params.to = f.to;
    if (f.agentId) params.agentId = f.agentId;
    if (f.hotelQuery && f.hotelQuery.trim()) {
      params.hotelQuery = f.hotelQuery.trim();
    }
    if (f.type && f.type !== "") params.type = f.type;
    if (f.stage && f.stage !== "") params.stage = f.stage;
    if (pageIdx !== undefined) params.page = pageIdx;
    if (pageSize !== undefined) params.size = pageSize;
    return params;
  };

  const fetchList = async (f, pageIdx, pageSize) => {
    setLoading(true);
    try {
      const res = await axiosInstance.get("/api/ai/unbooked-opportunities", {
        params: buildParams(f, pageIdx, pageSize),
      });
      const body = res.data || {};
      setRows(Array.isArray(body.content) ? body.content : []);
      setTotalPages(Number(body.totalPages) || 0);
      setTotalElements(Number(body.totalElements) || 0);
    } catch (err) {
      console.error("unbooked-opportunities list failed:", err);
      toast.error(
        err?.response?.data?.message ||
          "Could not load unbooked opportunities.",
      );
      setRows([]);
      setTotalPages(0);
      setTotalElements(0);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async (f) => {
    setSummaryLoading(true);
    try {
      const res = await axiosInstance.get(
        "/api/ai/unbooked-opportunities/summary",
        { params: buildParams(f) },
      );
      const body = res.data || {};
      setSummary({
        totalCount: Number(body.totalCount) || 0,
        potentialValue: Number(body.potentialValue) || 0,
        currency: body.currency || "AED",
      });
    } catch (err) {
      console.error("unbooked-opportunities summary failed:", err);
      setSummary({ totalCount: 0, potentialValue: 0, currency: "AED" });
    } finally {
      setSummaryLoading(false);
    }
  };

  // Initial load.
  useEffect(() => {
    fetchList(appliedFilters, page, size);
    fetchSummary(appliedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch list when page / pageSize changes (filters change resets both).
  useEffect(() => {
    fetchList(appliedFilters, page, size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, size]);

  const handleApply = () => {
    setAppliedFilters(filters);
    setPage(0);
    fetchList(filters, 0, size);
    fetchSummary(filters);
  };

  const handleReset = () => {
    setFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setPage(0);
    fetchList(INITIAL_FILTERS, 0, size);
    fetchSummary(INITIAL_FILTERS);
  };

  const paginationItems = useMemo(() => {
    if (totalPages <= 1) return null;
    const items = [];
    const first = 0;
    const last = totalPages - 1;
    const start = Math.max(first, page - 2);
    const end = Math.min(last, page + 2);
    items.push(
      <Pagination.First
        key="first"
        disabled={page === first}
        onClick={() => setPage(first)}
      />,
    );
    items.push(
      <Pagination.Prev
        key="prev"
        disabled={page === first}
        onClick={() => setPage(page - 1)}
      />,
    );
    if (start > first) {
      items.push(<Pagination.Ellipsis key="e-left" disabled />);
    }
    for (let i = start; i <= end; i++) {
      items.push(
        <Pagination.Item
          key={i}
          active={i === page}
          onClick={() => setPage(i)}
        >
          {i + 1}
        </Pagination.Item>,
      );
    }
    if (end < last) {
      items.push(<Pagination.Ellipsis key="e-right" disabled />);
    }
    items.push(
      <Pagination.Next
        key="next"
        disabled={page === last}
        onClick={() => setPage(page + 1)}
      />,
    );
    items.push(
      <Pagination.Last
        key="last"
        disabled={page === last}
        onClick={() => setPage(last)}
      />,
    );
    return items;
  }, [page, totalPages]);

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main
          className="flex-grow-1 p-3"
          style={{ minWidth: 0, overflowX: "hidden" }}
        >
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <div>
              <h4 className="mb-1">Unbooked Opportunities</h4>
              <p className="text-muted mb-0" style={{ fontSize: 13 }}>
                Hotel selections agents saved but never booked — the
                admin view over the abandoned-search queue.
              </p>
            </div>
            <RegionalClock />
          </div>

          {/* Stage toggle — SELECTION (hotel-booking-page landings) is the
              legacy view; SEARCH shows raw search contexts; ALL is both. */}
          <div className="mb-3 d-flex align-items-center gap-2 flex-wrap">
            <span className="text-muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
              View
            </span>
            <div className="btn-group btn-group-sm" role="group" aria-label="Stage">
              {[
                { value: "ALL", label: "All" },
                { value: "SELECTION", label: "Hotel selections" },
                { value: "SEARCH", label: "Searches" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={
                    "btn " +
                    (filters.stage === opt.value
                      ? "btn-primary"
                      : "btn-outline-primary")
                  }
                  onClick={() => {
                    const next = { ...filters, stage: opt.value };
                    setFilters(next);
                    setAppliedFilters(next);
                    setPage(0);
                    fetchList(next, 0, size);
                    fetchSummary(next);
                  }}
                  disabled={loading}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <Card className="mb-3 shadow-sm">
            <Card.Body>
              <Row className="g-2">
                <Col md={2}>
                  <Form.Group>
                    <Form.Label>From</Form.Label>
                    <Form.Control
                      type="date"
                      size="sm"
                      value={filters.from}
                      onChange={(e) => updateFilter("from", e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={2}>
                  <Form.Group>
                    <Form.Label>To</Form.Label>
                    <Form.Control
                      type="date"
                      size="sm"
                      value={filters.to}
                      onChange={(e) => updateFilter("to", e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Agent
                    value={filters.agentId}
                    onChange={(v) => updateFilter("agentId", v || "")}
                  />
                </Col>
                <Col md={2}>
                  <Form.Group>
                    <Form.Label>Hotel</Form.Label>
                    <Form.Control
                      type="text"
                      size="sm"
                      placeholder="Name or ref"
                      value={filters.hotelQuery}
                      onChange={(e) =>
                        updateFilter("hotelQuery", e.target.value)
                      }
                    />
                  </Form.Group>
                </Col>
                <Col md={1}>
                  <Form.Group>
                    <Form.Label>Type</Form.Label>
                    <Form.Select
                      size="sm"
                      value={filters.type}
                      onChange={(e) => updateFilter("type", e.target.value)}
                    >
                      <option value="HOTEL">Hotel</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={2}>
                  <Form.Group>
                    <Form.Label>Status</Form.Label>
                    <Form.Select
                      size="sm"
                      value={filters.status}
                      onChange={(e) => updateFilter("status", e.target.value)}
                    >
                      <option value="UNBOOKED">Unbooked</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>
              <div className="d-flex gap-2 mt-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleApply}
                  disabled={loading}
                >
                  Apply
                </Button>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={handleReset}
                  disabled={loading}
                >
                  Reset
                </Button>
              </div>
            </Card.Body>
          </Card>

          {/* Summary strip */}
          <Card className="mb-3 shadow-sm">
            <Card.Body className="d-flex flex-wrap gap-4 align-items-center">
              <div>
                <div
                  className="text-muted"
                  style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}
                >
                  Active opportunities
                </div>
                <div style={{ fontSize: 22, fontWeight: 600 }}>
                  {summaryLoading ? <Spinner size="sm" /> : summary.totalCount}
                </div>
              </div>
              <div>
                <div
                  className="text-muted"
                  style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}
                >
                  Potential value
                </div>
                <div style={{ fontSize: 22, fontWeight: 600 }}>
                  {summaryLoading ? (
                    <Spinner size="sm" />
                  ) : (
                    `${formatMoney(summary.potentialValue)} ${summary.currency}`
                  )}
                </div>
              </div>
            </Card.Body>
          </Card>

          {/* Table */}
          <Card className="shadow-sm">
            <Card.Body>
              <div className="table-responsive">
                <Table hover size="sm" className="mb-0">
                  <thead>
                    <tr>
                      <th>Agent name</th>
                      <th>Hotel / Destination</th>
                      <th>Ref</th>
                      <th className="text-end">Selected price</th>
                      <th>Selected date</th>
                      <th className="text-end">Views</th>
                      <th>Last activity</th>
                      <th>Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="text-center py-4">
                          <Spinner size="sm" /> Loading…
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="text-center text-muted py-4"
                        >
                          No unbooked opportunities for the selected filters.
                        </td>
                      </tr>
                    ) : (
                      rows.map((r) => {
                        // Backwards compatibility: rows from older backends
                        // don't carry `stage` — treat them as SELECTION so
                        // the existing UI keeps rendering exactly as before.
                        const stage = r.stage || "SELECTION";
                        const isSearch = stage === "SEARCH";
                        const hotelCol = isSearch
                          ? (r.destinationLabel || r.destination || "—")
                          : (r.hotelName || "—");
                        const refCol = isSearch
                          ? (r.nationalityLabel
                              ? `Nat: ${r.nationalityLabel}`
                              : "SEARCH")
                          : (r.hotelCode || "—");
                        const badgeClass = isSearch
                          ? "bg-info text-dark"
                          : "bg-warning text-dark";
                        return (
                          <tr
                            key={`${stage}-${r.agentId}-${r.hotelCode || r.destinationLabel || ""}-${r.id}`}
                          >
                            <td>{r.agentName || `Agent #${r.agentId ?? "?"}`}</td>
                            <td>{hotelCol}</td>
                            <td>
                              <code style={{ fontSize: 12 }}>{refCol}</code>
                            </td>
                            <td className="text-end">
                              {r.sellingPrice != null
                                ? `${formatMoney(r.sellingPrice)} ${r.currency || ""}`.trim()
                                : "—"}
                            </td>
                            <td>{formatDayOnly(r.checkIn)}</td>
                            <td className="text-end">{r.viewCount ?? 0}</td>
                            <td>{formatDate(r.lastSelectedAt)}</td>
                            <td>
                              <span
                                className={`badge ${badgeClass}`}
                                style={{ fontSize: 11 }}
                              >
                                {stage}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </Table>
              </div>

              <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
                <div className="d-flex align-items-center gap-2">
                  <span className="text-muted" style={{ fontSize: 13 }}>
                    Showing {rows.length} of {totalElements}
                  </span>
                  <Form.Select
                    size="sm"
                    style={{ width: 90 }}
                    value={size}
                    onChange={(e) => {
                      setSize(Number(e.target.value));
                      setPage(0);
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} / page
                      </option>
                    ))}
                  </Form.Select>
                </div>
                {paginationItems && (
                  <Pagination size="sm" className="mb-0">
                    {paginationItems}
                  </Pagination>
                )}
              </div>
            </Card.Body>
          </Card>
        </main>
      </div>
    </div>
  );
}
