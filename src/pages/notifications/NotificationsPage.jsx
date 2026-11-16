import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, Form, Spinner } from "react-bootstrap";
import { toast } from "react-hot-toast";
import axiosInstance from "../../components/AxiosInstance";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import { SEVERITY_COLOR } from "../../components/NotificationBell";
import { formatDateTime } from "../../utils/dateUtils";

const PAGE_SIZE = 20;

const SEVERITY_BADGE = { CRITICAL: "danger", WARNING: "warning", INFO: "info" };
const SEVERITY_LABEL = { CRITICAL: "Critical", WARNING: "Warning", INFO: "Info" };

const announceChange = () => window.dispatchEvent(new Event("notificationsChanged"));

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [page, setPage] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [severity, setSeverity] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [settings, setSettings] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const params = new URLSearchParams({ page, size: PAGE_SIZE, unreadOnly });
      if (severity) params.set("severity", severity);
      const { data } = await axiosInstance.get(`/api/notifications?${params}`);
      setItems(data?.items || []);
      setTotal(data?.total || 0);
      setUnread(data?.unread?.unread || 0);
    } catch {
      setItems([]);
      setTotal(0);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [page, unreadOnly, severity]);

  useEffect(() => {
    load();
  }, [load]);

  const handleOpen = async (item) => {
    if (!item.read) {
      try {
        await axiosInstance.post(`/api/notifications/${item.id}/read`);
        setItems((prev) =>
          prev.map((row) => (row.id === item.id ? { ...row, read: true } : row)),
        );
        setUnread((count) => Math.max(0, count - 1));
        announceChange();
      } catch {
        toast.error("Could not mark this alert as read.");
      }
    }
    if (item.link) navigate(item.link);
  };

  const handleMarkAllRead = async () => {
    try {
      await axiosInstance.post("/api/notifications/read-all");
      announceChange();
      setPage(0);
      await load();
    } catch {
      toast.error("Could not mark the alerts as read.");
    }
  };

  const openSettings = async () => {
    if (showSettings) {
      setShowSettings(false);
      return;
    }
    try {
      const { data } = await axiosInstance.get("/api/notifications/settings");
      setSettings(data);
      setShowSettings(true);
    } catch {
      toast.error("Could not load your alert settings.");
    }
  };

  const saveSettings = async (next) => {
    const previous = settings;
    setSettings(next);
    try {
      const { data } = await axiosInstance.put("/api/notifications/settings", {
        emailEnabled: next.emailEnabled,
        mutedTypes: next.mutedTypes,
      });
      setSettings(data);
      announceChange();
      setPage(0);
      await load();
    } catch {
      setSettings(previous);
      toast.error("Could not save your alert settings.");
    }
  };

  const toggleType = (type, enabled) => {
    const muted = new Set(settings.mutedTypes || []);
    if (enabled) muted.delete(type);
    else muted.add(type);
    saveSettings({ ...settings, mutedTypes: [...muted] });
  };

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-3" style={{ minWidth: 0, overflowX: "hidden" }}>
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <h4 className="m-0">
              Alerts
              {unread > 0 && (
                <span className="text-muted fs-6 fw-normal ms-2">{unread} unread</span>
              )}
            </h4>
            <div className="d-flex gap-2">
              <Button variant="outline-secondary" size="sm" onClick={openSettings}>
                {showSettings ? "Hide settings" : "Settings"}
              </Button>
              <Button
                variant="outline-primary"
                size="sm"
                onClick={handleMarkAllRead}
                disabled={unread === 0}
              >
                Mark all read
              </Button>
            </div>
          </div>

          {showSettings && settings && (
            <Card className="p-3 mb-3">
              <h6>Which alerts do you want?</h6>
              {settings.types.map((option) => (
                <Form.Check
                  key={option.type}
                  type="switch"
                  id={`alert-type-${option.type}`}
                  label={
                    option.muteable
                      ? option.label
                      : `${option.label} (always on, this protects company money)`
                  }
                  checked={!(settings.mutedTypes || []).includes(option.type)}
                  disabled={!option.muteable}
                  onChange={(e) => toggleType(option.type, e.target.checked)}
                />
              ))}
              {settings.emailAvailable && (
                <>
                  <hr />
                  <Form.Check
                    type="switch"
                    id="alert-email"
                    label="Also email me these alerts"
                    checked={settings.emailEnabled}
                    onChange={(e) =>
                      saveSettings({ ...settings, emailEnabled: e.target.checked })
                    }
                  />
                </>
              )}
            </Card>
          )}

          <Card className="p-3 mb-3">
            <div className="d-flex flex-wrap align-items-center gap-3">
              <Form.Check
                type="switch"
                id="alerts-unread-only"
                label="Unread only"
                checked={unreadOnly}
                onChange={(e) => {
                  setUnreadOnly(e.target.checked);
                  setPage(0);
                }}
              />
              <Form.Select
                size="sm"
                aria-label="Filter by severity"
                style={{ width: "auto" }}
                value={severity}
                onChange={(e) => {
                  setSeverity(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">All severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="WARNING">Warning</option>
                <option value="INFO">Info</option>
              </Form.Select>
            </div>
          </Card>

          <Card>
            {loading && (
              <div className="text-center py-5">
                <Spinner animation="border" />
              </div>
            )}
            {!loading && loadFailed && (
              <div className="text-center py-5">
                <p className="text-muted">Alerts could not be loaded.</p>
                <Button variant="outline-primary" size="sm" onClick={load}>
                  Try again
                </Button>
              </div>
            )}
            {!loading && !loadFailed && items.length === 0 && (
              <div className="text-center text-muted py-5">
                {unreadOnly || severity
                  ? "No alerts match these filters."
                  : "No alerts yet. New ones will appear here."}
              </div>
            )}
            {!loading &&
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleOpen(item)}
                  className="d-flex gap-3 w-100 text-start border-0 border-bottom p-3"
                  style={{ background: item.read ? "#fff" : "#fff7f0" }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      flex: "0 0 10px",
                      height: 10,
                      marginTop: 6,
                      borderRadius: "50%",
                      background: SEVERITY_COLOR[item.severity] || SEVERITY_COLOR.INFO,
                    }}
                  />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="d-flex flex-wrap align-items-center gap-2 mb-1">
                      <span className={item.read ? "" : "fw-bold"}>{item.title}</span>
                      <Badge
                        bg={SEVERITY_BADGE[item.severity] || "secondary"}
                        text={item.severity === "CRITICAL" ? undefined : "dark"}
                      >
                        {SEVERITY_LABEL[item.severity] || item.severity}
                      </Badge>
                    </span>
                    <span
                      className="d-block small text-muted"
                      style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}
                    >
                      {item.message}
                    </span>
                    <span className="d-block text-muted mt-1" style={{ fontSize: "0.75rem" }}>
                      {formatDateTime(item.createdAt)}
                    </span>
                  </span>
                </button>
              ))}
          </Card>

          {total > PAGE_SIZE && (
            <div className="d-flex justify-content-between align-items-center mt-3">
              <Button
                variant="outline-secondary"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="small text-muted">
                Page {page + 1} of {lastPage + 1}
              </span>
              <Button
                variant="outline-secondary"
                size="sm"
                disabled={page >= lastPage}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
