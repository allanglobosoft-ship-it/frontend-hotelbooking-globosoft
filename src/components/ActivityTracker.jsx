import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { installActivityTracking, logActivity } from "../utils/activityLogger";

// Mounted once in App.jsx (inside the router). Attaches the document-level
// click / submit / select listeners and records a PAGE_VIEW on every route
// change. Everything ends up in the backend's user-activity.log; see
// utils/activityLogger.js. Renders nothing.
export default function ActivityTracker() {
  const location = useLocation();

  useEffect(() => {
    installActivityTracking();
  }, []);

  useEffect(() => {
    logActivity("PAGE_VIEW");
  }, [location.pathname]);

  return null;
}
