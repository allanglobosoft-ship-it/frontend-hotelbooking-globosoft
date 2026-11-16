import React, { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Col, Form, Pagination, Row, Spinner, Table } from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import BackButton from "../../components/BackButton";
import UserAccount from "../../components/filters/UserAccount";

// SUPER_ADMIN → User Management → Activity Logs.
// What a user did (login / logout, searches, bookings, cancellations,
// payments, admin changes, denied access), when, from which IP address and
// where. Rows come from GET /api/super-admin/user-activity
// (UserActivityLogController.java), newest first, paged on the server.

const CATEGORY_OPTIONS = [
  { value: "", label: "All activities" },
  { value: "AUTH", label: "Login / Logout" },
  { value: "SEARCH", label: "Searches" },
  { value: "BOOKING", label: "Bookings" },
  { value: "CANCELLATION", label: "Cancellations" },
  { value: "PAYMENT", label: "Payments" },
  { value: "ADMIN", label: "Admin changes" },
  { value: "SECURITY", label: "Access denied" },
];

const ACTION_LABELS = {
  LOGIN: "Login",
  LOGOUT: "Logout",
  LOGIN_OTP_VERIFY: "Login OTP verified",
  LOGIN_TOTP_VERIFY: "Login authenticator code verified",
  LOGIN_OTP_RESEND: "Login OTP resent",
  PASSWORD_CHANGE: "Password changed",
  PASSWORD_FORGOT: "Forgot password",
  SEARCH: "Search",
  ROOM_AVAILABILITY: "Room availability check",
  RATE_RECHECK: "Rate recheck",
  BOOKING_CREATE: "Booking created",
  BOOKING_CANCEL: "Booking cancelled",
  BOOKING_AMEND: "Booking amended",
  BOOKING_RECONFIRM: "Booking reconfirmed",
  ADMIN_CREATE: "Created",
  ADMIN_UPDATE: "Updated",
  ADMIN_DELETE: "Deleted",
  ADMIN_VIEW: "Viewed",
  // Admin → API Access; the row's description names the API and the change.
  API_ACCESS_TOGGLE: "API enabled / disabled",
  API_ENVIRONMENT_CHANGE: "API environment switched",
  API_CREDENTIALS_SAVE: "API credentials saved",
  API_CREDENTIALS_REVEAL: "API credentials revealed",
  ACCESS_DENIED: "Access denied",
  UNAUTHENTICATED: "Not signed in",
  ACTIVITY_LOG_EXPORT: "Activity logs downloaded",
};

const PAGE_SIZES = [10, 20, 50, 100];

// Download PDF / Download Excel: the server builds the file from every user's
// activity of the last 3 months (UserActivityExportServiceImpl.java); page
// filters do not apply. Large periods take a while, hence the long timeout.
const EXPORT_TIMEOUT_MS = 5 * 60 * 1000;
const EXPORT_LABELS = { pdf: "PDF", excel: "Excel" };

// "attachment; filename=\"activity-logs_2026-07-18_to_2026-10-15.pdf\"" → the
// file name. The header is only readable on the same origin (production);
// the local dev server falls back to a name built here.
const fileNameFrom = (disposition, fallback) => {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition || "");
  return match ? decodeURIComponent(match[1]) : fallback;
};

const pad = (n) => String(n).padStart(2, "0");
// yyyy-MM-dd in the browser's own time zone (toISOString would give UTC).
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDate(d);
};

// Last 7 days for every user by default.
const initialFilters = () => ({
  username: "",
  fromDate: daysAgo(6),
  toDate: localDate(new Date()),
  category: "",
});

// Same "2026-Jul-29 - 09:55:21 AM" format as User Management → Login Logs.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const formatDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  let hh = d.getHours();
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12 || 12;
  return `${d.getFullYear()}-${MONTHS[d.getMonth()]}-${pad(d.getDate())} - ${pad(hh)}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${ampm}`;
};

// "BOOKING_STATUS_UPDATE" → "Booking status update"; "hotelContractRate" → "Hotel contract rate".
const humanize = (text) => {
  if (!text) return "";
  const s = String(text)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const actionLabel = (action) => ACTION_LABELS[action] || humanize(action) || "—";

// Hotel names have their own "Hotel:" line, so they are left out here.
const formatDetails = (details) => {
  if (!details || typeof details !== "object") return "";
  return Object.entries(details)
    .filter(([k]) => !/^(child)?hotelname$/i.test(k))
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
};

// What the action saved (built on the server from every row it created, updated
// or deleted): [{ op, entity, id, name, fields: [{ field, from, to }], moreFields }]
// or { op, entity, count } for rows that were only counted.
const CHANGE_VERBS = { CREATE: "Created", UPDATE: "Updated", DELETE: "Deleted" };

const changeHead = (c) => {
  const verb = CHANGE_VERBS[c.op] || "Updated";
  if (c.count != null) return `${verb} ${c.entity} ×${c.count}`;
  return `${verb} ${c.entity}${c.id != null ? ` #${c.id}` : ""}${c.name ? ` (${c.name})` : ""}`;
};

const ActivityChanges = ({ changes }) => {
  const [open, setOpen] = useState(false);
  if (!Array.isArray(changes) || changes.length === 0) return null;
  return (
    <div className="mt-1">
      <Button
        variant="link"
        size="sm"
        className="p-0 text-decoration-none"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide changes" : `View changes (${changes.length})`}
      </Button>
      {open &&
        changes.map((c, i) => (
          <div key={i} className="small mt-1">
            <div className="fw-semibold">{changeHead(c)}</div>
            {Array.isArray(c.fields) &&
              c.fields.map((f, j) => (
                <div key={j} className="text-muted ps-2">
                  {f.field}: {f.from != null ? `${f.from} → ${f.to}` : f.to}
                </div>
              ))}
            {c.moreFields > 0 && <div className="text-muted ps-2">+{c.moreFields} more fields</div>}
          </div>
        ))}
    </div>
  );
};

const describeDevice = (ua) => {
  if (!ua) return "—";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Other";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
};

const formatAccuracy = (m) => {
  if (m == null) return "";
  return m < 1000 ? `±${m} m` : `±${(m / 1000).toFixed(1)} km`;
};

const mapUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

// Windowed page list — first, last, current ± 1, with "…" gaps (as on Login Logs).
function getPageWindow(page, totalPages, siblingCount = 1) {
  const totalNumbers = siblingCount * 2 + 5;
  if (totalPages <= totalNumbers) {
    return [...Array(totalPages).keys()].map((n) => n + 1);
  }
  const left = Math.max(page - siblingCount, 2);
  const right = Math.min(page + siblingCount, totalPages - 1);
  const pages = [1];
  if (left > 2) pages.push("…");
  for (let p = left; p <= right; p++) pages.push(p);
  if (right < totalPages - 1) pages.push("…");
  pages.push(totalPages);
  return pages;
}

function LocationCell({ row }) {
  const hasGps = row.locationSource === "GPS" && row.latitude != null && row.longitude != null;
  if (hasGps) {
    const coords = `${Number(row.latitude).toFixed(5)}, ${Number(row.longitude).toFixed(5)}`;
    return (
      <>
        <div>{row.gpsAddress || coords}</div>
        <small className="text-muted">
          GPS{row.accuracyMeters != null ? ` ${formatAccuracy(row.accuracyMeters)}` : ""}
          {" · "}
          <a href={mapUrl(row.latitude, row.longitude)} target="_blank" rel="noopener noreferrer">
            Open in map
          </a>
        </small>
        {row.ipLocation && (
          <div>
            <small className="text-muted">IP: {row.ipLocation}</small>
          </div>
        )}
      </>
    );
  }
  if (row.ipLocation) {
    return (
      <>
        <div>{row.ipLocation}</div>
        <small className="text-muted">Approximate, from IP address</small>
      </>
    );
  }
  return <span className="text-muted">Unknown</span>;
}

export default function UserActivityLogs() {
  const [tempFilters, setTempFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [rows, setRows] = useState([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(""); // "pdf" | "excel" | ""

  const updateFilter = (key, value) => setTempFilters((prev) => ({ ...prev, [key]: value }));

  const handleDownload = async (format) => {
    const label = EXPORT_LABELS[format];
    setDownloading(format);
    try {
      const res = await axiosInstance.get("/api/super-admin/user-activity/export", {
        params: { format },
        responseType: "blob",
        timeout: EXPORT_TIMEOUT_MS,
      });
      const extension = format === "pdf" ? "pdf" : "xlsx";
      const name = fileNameFrom(
        res.headers?.["content-disposition"],
        `activity-logs_last-3-months_${localDate(new Date())}.${extension}`,
      );
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${label} downloaded`);
    } catch (e) {
      toast.error(`Could not download the ${label} file. Please try again.`);
    } finally {
      setDownloading("");
    }
  };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page: page - 1, limit: pageSize };
      Object.entries(appliedFilters).forEach(([k, v]) => {
        if (v !== "" && v !== null && v !== undefined) params[k] = v;
      });
      const res = await axiosInstance.get("/api/super-admin/user-activity", { params });
      const data = res.data || {};
      setRows(Array.isArray(data.content) ? data.content : []);
      setTotalElements(Number(data.totalElements) || 0);
      setTotalPages(Math.max(1, Number(data.totalPages) || 1));
    } catch (e) {
      setError(e.response?.data?.message || "Failed to load activity logs");
      toast.error("Failed to load activity logs");
      setRows([]);
      setTotalElements(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page, pageSize]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSearch = () => {
    if (tempFilters.fromDate && tempFilters.toDate && tempFilters.fromDate > tempFilters.toDate) {
      toast.error("From date must be on or before To date");
      return;
    }
    setPage(1);
    setAppliedFilters({ ...tempFilters });
  };

  const handleReset = () => {
    const fresh = initialFilters();
    setTempFilters(fresh);
    setPage(1);
    setAppliedFilters(fresh);
  };

  const firstRow = totalElements === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, totalElements);

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4" style={{ minWidth: 0 }}>
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex flex-column flex-sm-row gap-2 justify-content-between align-items-stretch align-items-sm-center">
              <span className="d-flex align-items-center gap-2">
                <BackButton fallback="/superAdminDashboard" />
                <span className="fw-semibold">Activity Logs</span>
              </span>
              <div className="d-flex flex-wrap gap-2">
                {["pdf", "excel"].map((format) => (
                  <Button
                    key={format}
                    variant={format === "pdf" ? "outline-primary" : "outline-success"}
                    onClick={() => handleDownload(format)}
                    disabled={!!downloading}
                    title="Every user and activity from the last 3 months"
                  >
                    {downloading === format ? (
                      <>
                        <Spinner animation="border" size="sm" className="me-2" />
                        Preparing {EXPORT_LABELS[format]}...
                      </>
                    ) : (
                      `⬇ Download ${EXPORT_LABELS[format]}`
                    )}
                  </Button>
                ))}
                <Button className="btn-green" onClick={fetchLogs} disabled={loading}>
                  {loading ? "Refreshing..." : "↻ Refresh"}
                </Button>
              </div>
            </Card.Header>

            <Card.Body className="p-0">
              <div className="p-3 border-bottom">
                <Row className="g-3 align-items-end">
                  <Col md={4} lg={3}>
                    <UserAccount
                      value={tempFilters.username}
                      onChange={(v) => updateFilter("username", v)}
                    />
                  </Col>
                  <Col md={4} lg={3}>
                    <Form.Group className="mb-0">
                      <Form.Label className="small mb-2">Date</Form.Label>
                      <div className="d-flex gap-2">
                        <Form.Control type="date" size="sm" title="From"
                          value={tempFilters.fromDate}
                          max={tempFilters.toDate || undefined}
                          onChange={(e) => updateFilter("fromDate", e.target.value)} />
                        <Form.Control type="date" size="sm" title="To"
                          value={tempFilters.toDate}
                          min={tempFilters.fromDate || undefined}
                          onChange={(e) => updateFilter("toDate", e.target.value)} />
                      </div>
                    </Form.Group>
                  </Col>
                  <Col md={4} lg={2}>
                    <Form.Group className="mb-0">
                      <Form.Label className="small mb-2">Activity</Form.Label>
                      <Form.Select size="sm"
                        value={tempFilters.category}
                        onChange={(e) => updateFilter("category", e.target.value)}>
                        {CATEGORY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md="auto" className="d-flex gap-2">
                    <Button size="sm" variant="primary" onClick={handleSearch} disabled={loading}>
                      Search
                    </Button>
                    <Button size="sm" variant="outline-secondary" onClick={handleReset} disabled={loading}>
                      Reset
                    </Button>
                  </Col>
                </Row>
              </div>

              {error && (
                <div className="alert alert-danger py-2 m-3 mb-0" role="alert">
                  {error}
                </div>
              )}

              <Table responsive hover striped className="mb-0 align-middle mt-2">
                <thead>
                  <tr>
                    <th style={{ width: 60 }} className="text-center">S/N</th>
                    <th>Date &amp; Time</th>
                    <th>User</th>
                    <th>Activity</th>
                    <th>Status</th>
                    <th>IP Address</th>
                    <th>Location</th>
                    <th>Device</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="text-center text-muted py-4">
                        <Spinner animation="border" size="sm" className="me-2" />
                        Loading activity...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center text-muted py-4">
                        No activity found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, idx) => {
                      const details = formatDetails(row.details);
                      const failed = row.outcome === "FAILURE";
                      return (
                        <tr key={row.id}>
                          <td className="text-center">{firstRow + idx}</td>
                          <td className="text-nowrap">{formatDateTime(row.activityTime)}</td>
                          <td>
                            <div>{row.username || "—"}</div>
                            {row.userType && <small className="text-muted">{row.userType}</small>}
                          </td>
                          <td title={`${row.httpMethod || ""} ${row.path || ""}`.trim()}>
                            <div className="fw-semibold">{actionLabel(row.action)}</div>
                            {/* What the user did, in plain words — e.g. "IWTX_API (IWTX): Enabled → Disabled" */}
                            {row.description && <div>{row.description}</div>}
                            <ActivityChanges changes={row.changes} />
                            {/* Hotel booked / cancelled / amended / searched */}
                            {row.hotelName && (
                              <div>
                                <span className="text-muted">Hotel: </span>
                                <span className="fw-semibold">{row.hotelName}</span>
                              </div>
                            )}
                            <small className="text-muted">
                              {humanize(row.category)}
                              {row.module ? ` · ${humanize(row.module)}` : ""}
                            </small>
                            {details && (
                              <div>
                                <small className="text-muted">{details}</small>
                              </div>
                            )}
                            {failed && row.errorMessage && (
                              <div>
                                <small className="text-danger">{row.errorMessage}</small>
                              </div>
                            )}
                          </td>
                          <td className="text-nowrap">
                            <Badge bg={failed ? "danger" : "success"}>{failed ? "Failed" : "Success"}</Badge>
                            {row.httpStatus != null && (
                              <div>
                                <small className="text-muted">HTTP {row.httpStatus}</small>
                              </div>
                            )}
                          </td>
                          <td className="text-nowrap">
                            <div>{row.ipAddress || "—"}</div>
                            {/* Local / office-network tests: the network's internet address */}
                            {row.publicIp && row.publicIp !== row.ipAddress && (
                              <small className="text-muted">Public: {row.publicIp}</small>
                            )}
                          </td>
                          <td style={{ minWidth: 220 }}>
                            <LocationCell row={row} />
                          </td>
                          <td className="text-nowrap" title={row.userAgent || ""}>
                            {describeDevice(row.userAgent)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </Table>

              <div className="d-flex justify-content-between align-items-center p-3 border-top flex-nowrap gap-3" style={{ overflowX: "auto" }}>
                <div className="d-flex align-items-center gap-2 text-nowrap">
                  <small className="text-muted">
                    Showing {firstRow}–{lastRow} of {totalElements} activities
                  </small>
                  <Form.Select size="sm" style={{ width: "auto" }} value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}>
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>{n} / page</option>
                    ))}
                  </Form.Select>
                </div>
                <Pagination className="mb-0 flex-nowrap">
                  <Pagination.Prev
                    disabled={page === 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  />
                  {getPageWindow(page, totalPages).map((p, idx) =>
                    p === "…" ? (
                      <Pagination.Ellipsis key={`ellipsis-${idx}`} disabled />
                    ) : (
                      <Pagination.Item
                        key={p}
                        active={p === page}
                        disabled={loading}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Pagination.Item>
                    ),
                  )}
                  <Pagination.Next
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  />
                </Pagination>
              </div>
            </Card.Body>
          </Card>
        </main>
      </div>
    </div>
  );
}
