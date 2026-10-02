import axios from "axios";
import { showSessionExpiredAlert, clearAuthStorage } from "./SessionExpired";

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
    const token = localStorage.getItem("authToken");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response &&
      (error.response.status === 401 || error.response.status === 403) &&
      !originalRequest._retry &&
      !isPublicAuthRequest(originalRequest)
    ) {
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
          { withCredentials: true }
        );

        const newAccessToken = response.data.accessToken;
        localStorage.setItem("authToken", newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        processQueue(null, newAccessToken);
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAuthStorage();
        showSessionExpiredAlert();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
