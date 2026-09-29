import Swal from "sweetalert2";

const AUTH_KEYS = [
  "authToken",
  "userRole",
  "UserName",
  "currentActiveRole",
  "makeYourOwnPackageAgentId",
  // Supplier / DMC approved-feature snapshot (hooks/usePartnerAccess.js).
  "partnerAccess",
  // RegionalClock country cache (components/RegionalClock.jsx). Cleared so
  // the next login re-fetches its own countryCode instead of inheriting
  // the previous user's timezone.
  "regionalClockProfile",
];

export const clearAuthStorage = () => {
  AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
};

export const showSessionExpiredAlert = () => {
  Swal.fire({
    title: "Session Expired",
    text: "Please log in again.",
    icon: "warning",
    confirmButtonText: "OK",
  }).then(() => {
    clearAuthStorage();
    window.location.href = "/login";
  });
};
