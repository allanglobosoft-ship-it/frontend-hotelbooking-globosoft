import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Dropdown, Spinner } from "react-bootstrap";
import { FaBell } from "react-icons/fa";
import axiosInstance from "./AxiosInstance";
import { formatDateTime } from "../utils/dateUtils";

const POLL_MS = 60000;
const DROPDOWN_ITEMS = 8;

export const SEVERITY_COLOR = {
  CRITICAL: "#dc3545",
  WARNING: "#f59e0b",
  INFO: "#0ea5e9",
};

// A background check must not extend the session or pop "Session Expired" on an
// unattended tab. The response interceptor skips its silent refresh for requests
// already marked _retry, so an expired token simply fails here until the user's
// next real action refreshes it.
const BACKGROUND_REQUEST = { _retry: true };

// Bootstrap makes a dropdown inside .navbar-nav position:static below the lg
// breakpoint, which would push the whole top bar around when this wide menu opens.
// So it is positioned here instead: under the bell, or across the screen on a phone.
const BELL_MENU_CSS = `
  .navbar-nav .notification-bell-menu {
    position: absolute;
    top: 100%;
    right: 0;
    left: auto;
    width: 380px;
    max-height: 70vh;
    overflow-y: auto;
  }
  @media (max-width: 575.98px) {
    .navbar-nav .notification-bell-menu {
      position: fixed;
      top: 60px;
      right: 8px;
      left: 8px;
      width: auto;
    }
  }
`;

const BellToggle = React.forwardRef(({ onClick, unread, critical }, ref) => (
  <Button
    ref={ref}
    variant="link"
    className="position-relative text-dark text-decoration-none p-0 d-flex align-items-center"
    onClick={onClick}
    style={{ border: "none", background: "none", minWidth: "auto" }}
    aria-label={unread > 0 ? `Alerts, ${unread} unread` : "Alerts"}
    title="Alerts"
  >
    <FaBell size={20} />
    {unread > 0 && (
      <Badge
        bg={critical > 0 ? "danger" : "warning"}
        text={critical > 0 ? undefined : "dark"}
        className="position-absolute top-0 start-100 translate-middle rounded-pill"
        style={{ fontSize: "0.65rem", padding: "2px 6px" }}
      >
        {unread > 99 ? "99+" : unread}
      </Badge>
    )}
  </Button>
));

export default function NotificationBell() {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [critical, setCritical] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [open, setOpen] = useState(false);

  const refreshCount = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const { data } = await axiosInstance.get(
        "/api/notifications/unread-count",
        BACKGROUND_REQUEST,
      );
      setUnread(data?.unread || 0);
      setCritical(data?.critical || 0);
    } catch {
      // Keep the last count. The alerts are still there on the next check.
    }
  }, []);

  useEffect(() => {
    refreshCount();
    const timer = setInterval(refreshCount, POLL_MS);
    document.addEventListener("visibilitychange", refreshCount);
    // The inbox page tells us when it changes what is read.
    window.addEventListener("notificationsChanged", refreshCount);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshCount);
      window.removeEventListener("notificationsChanged", refreshCount);
    };
  }, [refreshCount]);

  const loadLatest = async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const { data } = await axiosInstance.get(
        `/api/notifications?size=${DROPDOWN_ITEMS}`,
      );
      setItems(data?.items || []);
      setUnread(data?.unread?.unread || 0);
      setCritical(data?.unread?.critical || 0);
    } catch {
      setItems([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (next) => {
    setOpen(next);
    if (next) loadLatest();
  };

  const handleItemClick = async (item) => {
    setOpen(false);
    if (!item.read) {
      try {
        await axiosInstance.post(`/api/notifications/${item.id}/read`);
      } catch {
        // Opening the booking matters more than the read marker.
      }
      refreshCount();
    }
    navigate(item.link || "/notifications");
  };

  const handleMarkAllRead = async () => {
    try {
      await axiosInstance.post("/api/notifications/read-all");
      setItems((prev) => prev.map((item) => ({ ...item, read: true })));
      setUnread(0);
      setCritical(0);
    } catch {
      setLoadFailed(true);
    }
  };

  return (
    <Dropdown align="end" show={open} onToggle={handleToggle}>
      <Dropdown.Toggle
        as={BellToggle}
        id="notification-bell"
        unread={unread}
        critical={critical}
      />
      <style>{BELL_MENU_CSS}</style>
      <Dropdown.Menu className="notification-bell-menu shadow p-0">
        <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
          <span className="fw-bold">Alerts</span>
          {unread > 0 && (
            <Button
              variant="link"
              size="sm"
              className="p-0 text-decoration-none"
              onClick={handleMarkAllRead}
            >
              Mark all read
            </Button>
          )}
        </div>

        {loading && (
          <div className="text-center py-4">
            <Spinner animation="border" size="sm" />
          </div>
        )}
        {!loading && loadFailed && (
          <div className="text-center text-muted py-4 px-3 small">
            Alerts could not be loaded. Please try again.
          </div>
        )}
        {!loading && !loadFailed && items.length === 0 && (
          <div className="text-center text-muted py-4 small">No alerts yet.</div>
        )}

        {!loading &&
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleItemClick(item)}
              className="d-flex gap-2 w-100 text-start border-0 border-bottom px-3 py-2"
              style={{ background: item.read ? "#fff" : "#fff7f0" }}
            >
              <span
                aria-hidden="true"
                style={{
                  flex: "0 0 8px",
                  height: 8,
                  marginTop: 6,
                  borderRadius: "50%",
                  background: SEVERITY_COLOR[item.severity] || SEVERITY_COLOR.INFO,
                }}
              />
              <span style={{ minWidth: 0 }}>
                <span className={`d-block small ${item.read ? "" : "fw-bold"}`}>
                  {item.title}
                </span>
                <span
                  className="small text-muted"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {item.message}
                </span>
                <span className="d-block text-muted" style={{ fontSize: "0.7rem" }}>
                  {formatDateTime(item.createdAt)}
                </span>
              </span>
            </button>
          ))}

        <div className="text-center py-2">
          <Button
            variant="link"
            size="sm"
            className="p-0 text-decoration-none"
            onClick={() => {
              setOpen(false);
              navigate("/notifications");
            }}
          >
            View all alerts
          </Button>
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}
