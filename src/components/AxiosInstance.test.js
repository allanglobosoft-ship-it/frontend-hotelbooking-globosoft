// S:SEC-08 (30-minute access tokens): an expired access token must cost one
// silent refresh and a retry, never a logout, as long as the refresh cookie
// is still good. EV-AC-02: logout must reach the server with this tab's id.
import axios from "axios";
import axiosInstance from "./AxiosInstance";
import { clearAuthStorage, showSessionExpiredAlert } from "./SessionExpired";
import { getAuthToken, getTabSessionId, setAuthToken, TAB_SESSION_HEADER } from "../utils/authSession";

// axios 1.x's package entry is an ES module, which this Jest (27) cannot load;
// its CommonJS browser build is the same library.
jest.mock("axios", () => jest.requireActual("axios/dist/browser/axios.cjs"));
jest.mock("./SessionExpired", () => ({
  clearAuthStorage: jest.fn(),
  showSessionExpiredAlert: jest.fn(),
  // The interceptor also signs out an Inactive account with its own message;
  // these tests use no such account.
  isAccountInactiveError: jest.fn(() => false),
  showAccountInactiveAlert: jest.fn(),
}));

const OLD = "expired-access-token"; // synthetic
const NEW = "fresh-access-token"; // synthetic

const header = (config, name) =>
  typeof config.headers?.get === "function" ? config.headers.get(name) : config.headers?.[name];

const reply = (config, status, data = {}) => {
  const response = { status, statusText: String(status), data, headers: {}, config };
  if (status < 400) return Promise.resolve(response);
  const error = new Error(`Request failed with status code ${status}`);
  error.config = config;
  error.response = response;
  return Promise.reject(error);
};

const later = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

// The API: 200 for the fresh token, 401 for anything else.
const api = (config) =>
  header(config, "Authorization") === `Bearer ${NEW}`
    ? reply(config, 200, { url: config.url })
    : reply(config, 401, { message: "Authentication required" });

describe("S:SEC-08 silent refresh on an expired access token", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setAuthToken(OLD);
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("parallel requests share one refresh and are all retried with the new token", async () => {
    const refresh = jest.spyOn(axios, "post").mockImplementation(async (url, body, config) => {
      await later();
      return { data: { accessToken: NEW } };
    });
    axiosInstance.defaults.adapter = api;

    const results = await Promise.all(
      ["/api/bookings", "/api/cart", "/api/notifications"].map((u) => axiosInstance.get(u)),
    );

    expect(results.map((r) => r.data.url)).toEqual(["/api/bookings", "/api/cart", "/api/notifications"]);
    expect(refresh).toHaveBeenCalledTimes(1);
    const [url, , config] = refresh.mock.calls[0];
    expect(url).toMatch(/\/auth\/refresh-token$/);
    expect(config.withCredentials).toBe(true);
    expect(config.headers[TAB_SESSION_HEADER]).toBe(getTabSessionId());
    expect(getAuthToken()).toBe(NEW);
    expect(clearAuthStorage).not.toHaveBeenCalled();
    expect(showSessionExpiredAlert).not.toHaveBeenCalled();
  });

  test("a 401 that arrives after the refresh finished is re-sent, not refreshed again", async () => {
    let refreshFinished;
    const finished = new Promise((resolve) => {
      refreshFinished = resolve;
    });
    const refresh = jest.spyOn(axios, "post").mockImplementation(async () => {
      await later();
      refreshFinished();
      return { data: { accessToken: NEW } };
    });
    axiosInstance.defaults.adapter = async (config) => {
      // The slow request was sent with the old token; its 401 only comes
      // back once the other request's refresh is over.
      if (config.url === "/api/slow-search" && header(config, "Authorization") === `Bearer ${OLD}`) {
        await finished;
        await later();
      }
      return api(config);
    };

    const [fast, slow] = await Promise.all([
      axiosInstance.get("/api/cart"),
      axiosInstance.get("/api/slow-search"),
    ]);

    expect(fast.data.url).toBe("/api/cart");
    expect(slow.data.url).toBe("/api/slow-search");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(showSessionExpiredAlert).not.toHaveBeenCalled();
  });

  test("only a failed refresh logs the tab out, once", async () => {
    const refreshError = Object.assign(new Error("Invalid or expired refresh token"), {
      response: { status: 401 },
    });
    const refresh = jest.spyOn(axios, "post").mockImplementation(async () => {
      await later();
      throw refreshError;
    });
    axiosInstance.defaults.adapter = api;

    const outcomes = await Promise.allSettled([
      axiosInstance.get("/api/bookings"),
      axiosInstance.get("/api/cart"),
    ]);

    expect(outcomes.map((o) => o.status)).toEqual(["rejected", "rejected"]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(clearAuthStorage).toHaveBeenCalledTimes(1);
    expect(showSessionExpiredAlert).toHaveBeenCalledTimes(1);
  });

  test("a wrong password on /auth/login does not try a refresh", async () => {
    const refresh = jest.spyOn(axios, "post");
    axiosInstance.defaults.adapter = (config) => reply(config, 401, { message: "Invalid" });

    await expect(axiosInstance.post("/auth/login", { username: "agent8" })).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(showSessionExpiredAlert).not.toHaveBeenCalled();
  });
});

describe("EV-AC-02 logout reaches the server with this tab's refresh cookie scope", () => {
  test("POST /auth/logout carries the tab id, the access token and cookies", async () => {
    sessionStorage.clear();
    setAuthToken(OLD);
    let sent;
    axiosInstance.defaults.adapter = (config) => {
      sent = config;
      return reply(config, 200, { message: "Logged out successfully" });
    };

    await axiosInstance.post("/auth/logout", {}, { withCredentials: true });

    expect(header(sent, TAB_SESSION_HEADER)).toBe(getTabSessionId());
    expect(header(sent, "Authorization")).toBe(`Bearer ${OLD}`);
    expect(sent.withCredentials).toBe(true);
  });
});
