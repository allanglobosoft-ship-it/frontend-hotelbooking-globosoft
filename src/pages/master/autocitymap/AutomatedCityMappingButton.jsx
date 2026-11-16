import React, { useEffect, useMemo, useState } from "react";
import axiosInstance from "../../../components/AxiosInstance";
import { getCurrentActiveRole, getUserRole } from "../../../utils/authSession";
import "../../../styles/AutomatedCityMapping.css";
import { ACM_API } from "./acmShared";

/** The Automated City Mapping screen; opened in a new tab like the hotel one. */
export const AUTOMATED_CITY_MAPPING_PATH = "/masters/city-mapping/automated";

/**
 * Header button of the manual City Mapping page. Shown to ADMIN / SUPER_ADMIN only
 * (the API is admin-only). It reads the status once to show how many cities wait
 * for verification. window.open without "noopener": the new tab inherits a copy
 * of this tab's sessionStorage login (utils/authSession.js).
 */
export default function AutomatedCityMappingButton({ className = "" }) {
  const isAdminUser = useMemo(() => {
    const active = (getCurrentActiveRole() || "").trim().toLowerCase();
    const roles = (getUserRole() || "").split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
    const role = active || roles[0] || "";
    return role === "admin" || role === "super_admin";
  }, []);
  const [pending, setPending] = useState(null);

  useEffect(() => {
    if (!isAdminUser) return undefined;
    let cancelled = false;
    axiosInstance
      .get(`${ACM_API}/status`, { timeout: 20000 })
      .then((res) => {
        if (!cancelled) setPending(res.data?.totals?.pendingReview ?? null);
      })
      .catch(() => {
        // the button works without the count
      });
    return () => {
      cancelled = true;
    };
  }, [isAdminUser]);

  if (!isAdminUser) return null;
  return (
    <button
      type="button"
      className={`btn btn-sm acm-launch ${className}`}
      onClick={() => window.open(AUTOMATED_CITY_MAPPING_PATH, "_blank")}
      title="Open Automated City Mapping in a new tab"
    >
      <i className="fas fa-project-diagram" aria-hidden="true"></i>
      <span>Automated City Mapping</span>
      {pending > 0 && (
        <span className="acm-launch-count" title="Cities waiting for verification">{Number(pending).toLocaleString()}</span>
      )}
      <i className="fas fa-external-link-alt acm-launch-ext" aria-hidden="true"></i>
    </button>
  );
}
