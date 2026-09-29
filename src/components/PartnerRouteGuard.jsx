import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Spinner } from "react-bootstrap";
import usePartnerAccess from "../hooks/usePartnerAccess";
import {
  isPartnerCommonRoute,
  isPathAllowedForPartner,
  partnerDashboardPath,
} from "../config/partnerFeatures";

/**
 * Route-level half of the Supplier / DMC feature gate (the other half is
 * the backend PartnerFeatureAccessFilter, which 403s the API calls). Mounted
 * by PrivateRoute for partner logins only, so every existing route keeps
 * its behaviour for admin / agent / staff / extranet.
 *
 * Decision, from config/partnerFeatures.js:
 *   • partner-common route (dashboard, profile, …) → render;
 *   • route unlocked by one of the account's live approved features → render;
 *   • anything else (unapproved module, admin-only page) → back to the
 *     partner dashboard, which shows a "not enabled" notice.
 *
 * The approved set comes from GET /api/partner/me via usePartnerAccess
 * (cached per session); while the very first load is in flight a spinner is
 * shown rather than flashing a page the partner may not be allowed to see.
 */
export default function PartnerRouteGuard({ children, role }) {
  const location = useLocation();
  const { access, loading } = usePartnerAccess();
  const dashboard = partnerDashboardPath(role);

  if (!access) {
    if (loading) {
      return (
        <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "60vh" }}>
          <Spinner animation="border" variant="primary" role="status">
            <span className="visually-hidden">Checking access…</span>
          </Spinner>
        </div>
      );
    }
    // /api/partner/me failed (network, or the login is not linked to a
    // partner account). Fail closed for feature pages; the common routes
    // still render so the partner can at least reach the dashboard/logout.
    return isPartnerCommonRoute(location.pathname)
      ? children
      : <Navigate to={dashboard} replace />;
  }

  if (isPathAllowedForPartner(location.pathname, access.approvedCodes)) {
    return children;
  }
  return (
    <Navigate
      to={dashboard}
      replace
      state={{ partnerDenied: location.pathname }}
    />
  );
}
