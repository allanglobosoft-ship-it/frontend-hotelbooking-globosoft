import { useCallback, useEffect, useRef, useState } from "react";
import axiosInstance from "../../../components/AxiosInstance";

/**
 * Polls GET /api/hotel-mapping/auto/status while `enabled` is true.
 *
 * Plain polling (no WebSocket / SSE): the backend already exposes one cheap
 * status row, the page is admin-only, and the existing app has no push
 * channel to reuse. `intervalMs` is 5 s while the popup is open and 15 s for
 * the small pill on the page, so an idle admin tab costs four requests a
 * minute. A request in flight is never overlapped by the next tick.
 */
export default function useAutoMappingStatus({ enabled = true, intervalMs = 5000 } = {}) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const res = await axiosInstance.get("/api/hotel-mapping/auto/status", { timeout: 15000 });
      if (!mounted.current) return;
      setStatus(res.data || null);
      setError(null);
      setForbidden(false);
      setLastFetchedAt(new Date());
    } catch (err) {
      if (!mounted.current) return;
      const code = err?.response?.status;
      if (code === 403) {
        setForbidden(true);
        setError("Automated mapping status is restricted to administrators.");
      } else {
        setError(
          err?.response?.data?.error ||
            err?.response?.data?.message ||
            (err?.code === "ECONNABORTED"
              ? "The status request timed out."
              : "The automated mapping status could not be loaded."),
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || forbidden) return undefined;
    refresh();
    const id = setInterval(refresh, Math.max(2000, intervalMs));
    return () => clearInterval(id);
  }, [enabled, intervalMs, refresh, forbidden]);

  return { status, error, forbidden, loading, lastFetchedAt, refresh };
}
