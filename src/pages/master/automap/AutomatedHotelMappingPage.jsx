import React, { useMemo, useState } from "react";
import { Alert, Badge, Button, Spinner, Tab, Tabs } from "react-bootstrap";
import Swal from "sweetalert2";
import toast from "react-hot-toast";
import axiosInstance from "../../../components/AxiosInstance";
import Sidebar from "../../../components/Sidebar";
import Topbar from "../../../components/TopBar";
import BackButton from "../../../components/BackButton";
import { getCurrentActiveRole, getUserRole } from "../../../utils/authSession";
import "../../../styles/AutomatedHotelMapping.css";
import StatusPanel from "./StatusPanel";
import MappedHotelsTab from "./MappedHotelsTab";
import ManualReviewTab from "./ManualReviewTab";
import NotMappedTab from "./NotMappedTab";
import CitiesReviewTab from "./CitiesReviewTab";
import MappingRulesTab from "./MappingRulesTab";
import useAutoMappingStatus from "./useAutoMappingStatus";
import { fmtNumber, statusMeta } from "./automapFormat";

/**
 * /masters/hotel-mapping/automated — the Automated Hotel Mapping screen.
 *
 * Opened in a NEW TAB from the "Automated Mapping" pill on
 * /masters/hotel-mapping (window.open without "noopener", so the new tab
 * inherits a clone of the opener's per-tab session and is already logged
 * in — see utils/authSession.js). It replaces the earlier modal popup.
 *
 * Not Mapped, Cities and Rules & Settings are the admin review
 * tabs (see each component). The first three tabs are backed by /api/hotel-mapping/auto/*:
 *   Status        — live engine state (running / paused + reason / completed /
 *                   error), system load, progress figures, supplier health,
 *                   supplier catalog pull, supplier ↔ supplier matching.
 *   Mapped Hotels — per-hotel supplier matrix with green tick / red cross,
 *                   server-side search + filters + paging; "Supplier-only
 *                   hotels" lists masters without an in-house hotel.
 *   Manual Review — alphabetical list of hotels below the 100% rule with
 *                   their candidates and Map / Reject actions; "Supplier ↔
 *                   supplier" lists the pairs of the supplier pass.
 *
 * `status` is polled every 5 s by useAutoMappingStatus, so the header pill,
 * the Status tab and the tab counters update without a page reload. The
 * backend restricts /api/hotel-mapping/auto/** to ADMIN / SUPER_ADMIN and
 * the route is wrapped in <PrivateRoute roles={["admin"]}> in App.jsx.
 */
export default function AutomatedHotelMappingPage() {
  const isAdminUser = useMemo(() => {
    const active = (getCurrentActiveRole() || "").trim().toLowerCase();
    const roles = (getUserRole() || "")
      .split(",")
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean);
    const role = active || roles[0] || "";
    return role === "admin" || role === "super_admin";
  }, []);

  const { status, error, loading, lastFetchedAt, refresh } = useAutoMappingStatus({
    enabled: isAdminUser,
    intervalMs: 5000,
  });

  // ?tab= lets an alert link straight to the screen that deals with it.
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("tab") || "status");
  const [rescanning, setRescanning] = useState(false);

  const meta = statusMeta(status?.status || (error ? "ERROR" : "IDLE"));
  const isRunning = status?.status === "RUNNING";
  const suppliers = useMemo(() => status?.suppliers || [], [status]);
  // Changes whenever the engine or an operator writes links / candidates.
  const pairCount = status?.supplierMatch?.pendingReviewPairs;
  const refreshKey = `${status?.automatedMappingsTotal ?? ""}-${status?.manualMappingsTotal ?? ""}-${status?.manualReviewCount ?? ""}-${
    status?.supplierMatch?.supplierOnlyMasters ?? ""
  }-${pairCount ?? ""}`;

  const rescan = async () => {
    const confirm = await Swal.fire({
      title: "Re-run the full scan?",
      text: "Every in-house hotel is queued again. Existing mappings are kept; only missing supplier links are evaluated.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Queue all hotels",
      cancelButtonText: "Cancel",
    });
    if (!confirm.isConfirmed) return;
    setRescanning(true);
    try {
      const res = await axiosInstance.post("/api/hotel-mapping/auto/requeue", null, { timeout: 30000 });
      toast.success(res.data?.message || "Hotels queued.");
      refresh && refresh();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || "The rescan could not be queued.");
    } finally {
      setRescanning(false);
    }
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4 ahm-page">
          <div className="ahm-page-head">
            <BackButton fallback="/masters/hotel-mapping" />
            <h3 className="mb-0">Automated Hotel Mapping</h3>
            <span className="ahm-pill" style={{ cursor: "default" }} role="status" aria-live="polite">
              <span className={`ahm-dot tone-${meta.tone}${isRunning ? " pulse" : ""}`}></span>
              <span>{meta.label}</span>
              {isRunning && <Spinner animation="border" size="sm" role="presentation" />}
            </span>
            <span className="ms-auto small text-muted d-flex align-items-center gap-2">
              {loading && <Spinner animation="border" size="sm" role="status" aria-label="Refreshing status" />}
              {status?.enabled === false ? "Disabled in configuration" : "Auto-refresh every 5 s"}
              <Button size="sm" variant="outline-secondary" onClick={() => refresh && refresh()} disabled={loading} aria-label="Refresh now">
                <i className="fas fa-sync-alt" aria-hidden="true"></i>
              </Button>
            </span>
          </div>
          <p className="text-muted">
            Background engine status, the per-supplier mapped matrix (our hotels and supplier-only hotels) and everything
            waiting for manual review.
          </p>

          {!isAdminUser && (
            <Alert variant="warning">
              <i className="fas fa-lock me-2" aria-hidden="true"></i>
              Automated mapping is available to administrators only.
            </Alert>
          )}
          {isAdminUser && error && !status && (
            <Alert variant="danger" className="d-flex justify-content-between align-items-center">
              <span>
                <i className="fas fa-exclamation-triangle me-2" aria-hidden="true"></i>
                {error}
              </span>
              <Button size="sm" variant="outline-danger" onClick={() => refresh && refresh()}>
                Retry
              </Button>
            </Alert>
          )}
          {isAdminUser && !error && !status && (
            <div className="text-center py-5 text-muted">
              <Spinner animation="border" className="mb-2" />
              <div>Loading automated mapping status…</div>
            </div>
          )}
          {isAdminUser && status && (
            <div className="ahm-page-body">
              {error && (
                <Alert variant="warning" className="py-2 small">
                  <i className="fas fa-wifi me-2" aria-hidden="true"></i>
                  The last status refresh failed ({error}). Showing the previous values.
                </Alert>
              )}
              <Tabs activeKey={tab} onSelect={(k) => setTab(k || "status")} className="mb-3" mountOnEnter>
                <Tab
                  eventKey="status"
                  title={
                    <span>
                      <i className="fas fa-heartbeat me-1" aria-hidden="true"></i> Status
                    </span>
                  }
                >
                  <StatusPanel
                    status={status}
                    lastFetchedAt={lastFetchedAt}
                    onRescan={rescan}
                    rescanning={rescanning}
                    canAct={isAdminUser}
                    onRefresh={refresh}
                  />
                </Tab>
                <Tab
                  eventKey="mapped"
                  title={
                    <span>
                      <i className="fas fa-link me-1" aria-hidden="true"></i> Mapped Hotels{" "}
                      <Badge bg="light" text="dark" pill>
                        {fmtNumber(status.autoMappedCount)}
                      </Badge>
                    </span>
                  }
                >
                  <MappedHotelsTab suppliers={suppliers} active={tab === "mapped"} refreshKey={refreshKey} />
                </Tab>
                <Tab
                  eventKey="review"
                  title={
                    <span>
                      <i className="fas fa-user-check me-1" aria-hidden="true"></i> Manual Review{" "}
                      <Badge bg={status.manualReviewCount > 0 ? "warning" : "light"} text="dark" pill title="Our hotels with pending candidates">
                        {fmtNumber(status.manualReviewCount)}
                      </Badge>
                      {pairCount > 0 && (
                        <Badge bg="info" text="dark" pill className="ms-1" title="Supplier ↔ supplier pairs to review">
                          {fmtNumber(pairCount)}
                        </Badge>
                      )}
                    </span>
                  }
                >
                  <ManualReviewTab
                    suppliers={suppliers}
                    active={tab === "review"}
                    canAct={isAdminUser}
                    onChanged={refresh}
                    refreshKey={refreshKey}
                    hotelCount={status.manualReviewCount}
                    pairCount={pairCount}
                  />
                </Tab>
                <Tab
                  eventKey="unmapped"
                  title={
                    <span>
                      <i className="fas fa-unlink me-1" aria-hidden="true"></i> Not Mapped
                    </span>
                  }
                >
                  <NotMappedTab suppliers={suppliers} active={tab === "unmapped"} />
                </Tab>
                <Tab
                  eventKey="cities"
                  title={
                    <span>
                      <i className="fas fa-city me-1" aria-hidden="true"></i> Cities
                    </span>
                  }
                >
                  <CitiesReviewTab active={tab === "cities"} />
                </Tab>
                <Tab
                  eventKey="rules"
                  title={
                    <span>
                      <i className="fas fa-sliders-h me-1" aria-hidden="true"></i> Rules &amp; Settings
                    </span>
                  }
                >
                  <MappingRulesTab active={tab === "rules"} />
                </Tab>
              </Tabs>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
