import axios from "axios";
import {
  showSessionExpiredAlert,
  clearAuthStorage,
  isAccountInactiveError,
  showAccountInactiveAlert,
} from "./SessionExpired";
import { getAuthToken, setAuthToken, TAB_SESSION_HEADER, getTabSessionId } from "../utils/authSession";
import { CLIENT_LOCATION_HEADER, getClientLocationHeader } from "../utils/geoLocation";

const axiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL,
  timeout: 30000,
});

let isRefreshing = false;
let failedQueue = [];

// Pre-login auth endpoints answer 401/403 for bad input (wrong password, bad
// code), not for an expired session. Running the refresh + "Session Expired"
// flow on them pops that modal on a simple typo, so their errors go straight
// back to the caller (Login.jsx shows "Invalid username or password" inline).
const PUBLIC_AUTH_PATHS = [
  "/auth/login",
  "/auth/refresh-token",
  "/auth/verify-login-otp",
  "/auth/resend-login-otp",
  "/auth/verify-totp",
  "/auth/totp-fallback-email",
  "/auth/forgot-password",
];

const isPublicAuthRequest = (config) => {
  const path = (config?.url || "").split("?")[0];
  return PUBLIC_AUTH_PATHS.some((authPath) => path.endsWith(authPath));
};

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

axiosInstance.interceptors.request.use(
  (config) => {
    // authToken lives in THIS tab's sessionStorage (see utils/authSession.js) —
    // never localStorage, which is shared by every tab of the origin and was
    // the root cause of one tab's requests going out with another tab's
    // identity after either tab logged in/out or refreshed.
    const token = getAuthToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Scopes the backend's refresh-token cookie to this tab (see
    // AuthController.java) so a 401-triggered silent refresh below can only
    // ever rotate/consume THIS tab's own refresh token, never one that a
    // different tab's login most recently installed for the origin. Only
    // /auth/* reads this header — scoped to that prefix rather than sent on
    // every request so the hundreds of /api/* calls don't pick up an extra
    // CORS-preflight header they have no use for.
    if (config.url && config.url.includes("/auth/")) {
      config.headers = config.headers || {};
      config.headers[TAB_SESSION_HEADER] = getTabSessionId();
    }
    // Latest browser position (utils/geoLocation.js) so the backend can
    // record where each business action was done (Super Admin → Activity
    // Logs). Only sent when the user allowed location and the fix is fresh;
    // otherwise the backend uses the IP address's city. Signed-in calls
    // already carry Authorization (a preflighted header), so this adds no
    // extra CORS preflight to them.
    const clientLocation = getClientLocationHeader();
    if (clientLocation) {
      config.headers = config.headers || {};
      config.headers[CLIENT_LOCATION_HEADER] = clientLocation;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // A 401 from the login call itself means wrong credentials, not an expired
    // session — there is no session yet to refresh. Let the login page show its
    // own inline "Invalid username or password" instead of the refresh attempt
    // + "Session Expired" popup.
    const isLoginRequest =
      typeof originalRequest?.url === "string" &&
      originalRequest.url.split("?")[0].endsWith("/auth/login");

    // The account was set Inactive (agent / sub agent) while signed in. A
    // token refresh cannot fix that, so sign out with the real reason instead
    // of "Session Expired".
    if (!isLoginRequest && error.response?.status === 403 && isAccountInactiveError(error)) {
      clearAuthStorage();
      showAccountInactiveAlert();
      return Promise.reject(error);
    }

    if (
      !isLoginRequest &&
      error.response &&
      (error.response.status === 401 || error.response.status === 403) &&
      !originalRequest._retry &&
      !isPublicAuthRequest(originalRequest)
    ) {
      // S:SEC-08: the request left with an older access token than the one
      // this tab holds now (it was in flight while another request's refresh
      // finished). Re-send it with the current token; refreshing again would
      // rotate the refresh cookie a second time for nothing. If the current
      // token is refused too, that retry comes back here and refreshes.
      const currentToken = getAuthToken();
      const sentAuthorization = originalRequest.headers?.Authorization;
      if (currentToken && sentAuthorization && sentAuthorization !== `Bearer ${currentToken}`) {
        return axiosInstance(originalRequest);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return axiosInstance(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await axios.post(
          `${process.env.REACT_APP_API_BASE_URL}/auth/refresh-token`,
          {},
          {
            withCredentials: true,
            // Raw axios (not axiosInstance), so the request interceptor
            // above never runs for this call — the tab-session header has
            // to be set explicitly here too, or the backend falls back to
            // the unscoped legacy cookie and this tab's refresh could pick
            // up whichever tab logged in most recently instead of its own.
            headers: { [TAB_SESSION_HEADER]: getTabSessionId() },
          }
        );

        const newAccessToken = response.data.accessToken;
        setAuthToken(newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        processQueue(null, newAccessToken);
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAuthStorage();
        if (isAccountInactiveError(refreshError)) {
          showAccountInactiveAlert();
        } else {
        showSessionExpiredAlert();
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
