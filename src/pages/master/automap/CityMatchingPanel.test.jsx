/* global globalThis */
/* eslint-disable testing-library/no-unnecessary-act -- act() wraps state flushes on purpose in these tests */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import Swal from "sweetalert2";

import axiosInstance from "../../../components/AxiosInstance";
import CityMatchingPanel from "./CityMatchingPanel";

jest.mock("../../../components/AxiosInstance", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn() },
}));
jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const BASE = "/api/cityMapping/review/matching";

const row = {
  id: 7,
  supplier: "grn",
  supplierCityId: "700",
  supplierCityName: "Jebel Ali",
  countryIso: "AE",
  hotels: 12,
  group: "CONFIDENT",
  targetCityId: 3,
  targetCityName: "Dubai",
  targetHasRow: false,
  nameLevel: null,
  nameCityName: null,
  linkCityId: 3,
  linkCityName: "Dubai",
  linkVotes: 9,
  linkTotal: 10,
  linkSuppliers: 2,
  nearbyCityId: 3,
  nearbyCityName: "Dubai",
  nearbyVotes: 11,
  nearbyTotal: 12,
  nearbySuppliers: 2,
  nearestKm: 4,
  targetKm: 4.2,
  caution: null,
  status: "OPEN",
  decidedBy: null,
  decidedAt: null,
  lastError: null,
  searches: 40,
};

const summary = {
  running: false,
  lastRun: {
    id: 1,
    startedAt: "2026-11-07T03:15:00",
    finishedAt: "2026-11-07T03:17:00",
    status: "DONE",
    holdOutAnswered: 100,
    holdOutAgreed: 97,
    reach: JSON.stringify([{ supplier: "x3", hotels: 100, reachable: 62, unmappedCities: 5, unlinkedHotels: 0 }]),
  },
  groups: [{ group: "CONFIDENT", status: "OPEN", cities: 25, hotels: 500, approvableCities: 21, approvableHotels: 400 }],
  decisions: [],
  openLocationFlags: 3,
};

const pageOf = (rows, total = rows.length) => ({ content: rows, totalElements: total, page: 0, size: 20, totalPages: 1 });

const serve = (rows, total) => {
  axiosInstance.get.mockImplementation((url) => {
    if (url === `${BASE}/summary`) return Promise.resolve({ data: summary });
    if (url === BASE) return Promise.resolve({ data: pageOf(rows, total) });
    if (url === "/api/cityMapping/review/search-gaps/hotels") return Promise.resolve({ data: [{ code: "1", name: "Lake <b>View</b>" }] });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
};

const lastListParams = () => {
  const calls = axiosInstance.get.mock.calls.filter(([url]) => url === BASE);
  return calls[calls.length - 1][1].params;
};

describe("CityMatchingPanel", () => {
  let host;
  let root;

  beforeEach(() => {
    axiosInstance.get.mockReset();
    axiosInstance.post.mockReset();
    Swal.fire.mockReset();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 420));
    });

  const show = async (props) => {
    act(() => root.render(<CityMatchingPanel active {...props} />));
    await settle();
  };

  const buttonIn = (scope, name) => [...scope.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(name));
  const rowWith = (text) => [...host.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes(text));
  const click = async (button) => {
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
  };
  const choose = async (label, value) => {
    const select = host.querySelector(`select[aria-label="${label}"]`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, value);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
  };

  test("loads nothing until the tab is open", async () => {
    serve([]);
    await show({ active: false });
    expect(axiosInstance.get).not.toHaveBeenCalled();
  });

  test("shows a match with its evidence in plain words, and the tested accuracy", async () => {
    serve([row]);
    await show();

    const line = rowWith("Jebel Ali");
    expect(line.textContent).toContain("GRN");
    expect(line.textContent).toContain("Dubai");
    expect(line.textContent).toContain("Same hotels as Dubai: 9 of 10");
    expect(line.textContent).toContain("Next to hotels in Dubai: 11 of 12");
    expect(line.textContent).toContain("40");
    expect(host.textContent).toContain("97.0%");
    expect(host.textContent).toContain("X3 62.0%");
    expect(buttonIn(host, "Confident").textContent).toContain("25");
  });

  test("opens on confident matches that can be mapped now, and the filters reach the server", async () => {
    serve([row]);
    await show();

    expect(lastListParams()).toMatchObject({ group: "CONFIDENT", status: "OPEN", approvable: true });

    await click(buttonIn(host, "One signal"));
    expect(lastListParams().group).toBe("ONE_SIGNAL");

    await choose("Filter matches by supplier", "x3");
    expect(lastListParams().supplier).toBe("x3");

    await choose("Filter matches by decision", "REJECTED");
    expect(lastListParams().status).toBe("REJECTED");
  });

  test("the can-be-mapped filter does not hide groups with no city, or decided rows", async () => {
    serve([row]);
    await show();

    await click(buttonIn(host, "Not in our list"));
    expect(lastListParams().approvable).toBe(false);
    expect(host.querySelector("#city-match-approvable")).toBeNull();

    await click(buttonIn(host, "Confident"));
    expect(lastListParams().approvable).toBe(true);

    await choose("Filter matches by decision", "APPROVED");
    expect(lastListParams().approvable).toBe(false);
  });

  test("says how many can be mapped now and why the rest wait", async () => {
    serve([row]);
    await show();

    expect(host.textContent).toContain("21 of 25 can be mapped now");
    expect(host.textContent).toContain("only one is allowed");
  });

  test("mapping asks first, and sends nothing when declined", async () => {
    serve([row]);
    await show();

    Swal.fire.mockResolvedValueOnce({ isConfirmed: false });
    await click(buttonIn(rowWith("Jebel Ali"), "Map"));
    expect(Swal.fire).toHaveBeenCalledTimes(1);
    expect(axiosInstance.post).not.toHaveBeenCalled();

    Swal.fire.mockResolvedValueOnce({ isConfirmed: true });
    axiosInstance.post.mockResolvedValueOnce({ data: { requested: 1, mapped: 1, failed: 0, failures: [] } });
    await click(buttonIn(rowWith("Jebel Ali"), "Map"));
    expect(axiosInstance.post.mock.calls[0][0]).toBe(`${BASE}/approve`);
    expect(axiosInstance.post.mock.calls[0][1]).toEqual({ ids: [7] });
  });

  test("a whole group is mapped only with the count the admin read", async () => {
    serve([row], 21);
    await show();

    const button = buttonIn(host, "Map all");
    expect(button.textContent).toContain("21");

    Swal.fire.mockResolvedValueOnce({ isConfirmed: true });
    axiosInstance.post.mockResolvedValueOnce({ data: { requested: 21, mapped: 21, failed: 0, failures: [] } });
    await click(button);

    expect(axiosInstance.post.mock.calls[0][0]).toBe(`${BASE}/approve-group`);
    expect(axiosInstance.post.mock.calls[0][1]).toMatchObject({ group: "CONFIDENT", expected: 21 });
  });

  test("a group that needs checking one by one offers no map-all", async () => {
    serve([{ ...row, group: "CONFLICT" }], 9);
    await show();

    await click(buttonIn(host, "Signals disagree"));

    expect(buttonIn(host, "Map all")).toBeUndefined();
  });

  test("a city with a mapping already offers no Map button and says why", async () => {
    serve([{ ...row, targetHasRow: true }]);
    await show();

    const line = rowWith("Jebel Ali");
    expect(line.textContent).toContain("Already has a GRN mapping");
    expect(buttonIn(line, "Map")).toBeUndefined();
    expect(buttonIn(line, "Choose city")).toBeDefined();
  });

  test("turning down asks first and posts the row", async () => {
    serve([row]);
    await show();

    Swal.fire.mockResolvedValueOnce({ isConfirmed: true });
    axiosInstance.post.mockResolvedValueOnce({ data: { rejected: 1 } });
    await click(buttonIn(rowWith("Jebel Ali"), "Turn down"));

    expect(axiosInstance.post.mock.calls[0][0]).toBe(`${BASE}/reject`);
    expect(axiosInstance.post.mock.calls[0][1]).toEqual({ ids: [7] });
  });

  test("a turned-down row can be reopened and offers nothing else", async () => {
    serve([{ ...row, status: "REJECTED", decidedBy: "admin@x", decidedAt: "2026-11-07T03:17:00" }]);
    await show();

    const line = rowWith("Jebel Ali");
    expect(line.textContent).toContain("Turned down by admin@x");
    expect(buttonIn(line, "Map")).toBeUndefined();

    axiosInstance.post.mockResolvedValueOnce({ data: { reopened: 1 } });
    await click(buttonIn(line, "Reopen"));
    expect(axiosInstance.post.mock.calls[0][0]).toBe(`${BASE}/reopen`);
  });

  test("hotel names are escaped when listed", async () => {
    serve([row]);
    Swal.fire.mockResolvedValue({});
    await show();

    await click(buttonIn(rowWith("Jebel Ali"), "View hotels"));

    const html = Swal.fire.mock.calls[0][0].html;
    expect(html).toContain("Lake &lt;b&gt;View&lt;/b&gt;");
    expect(html).not.toContain("<b>");
  });

  test("a supplier city's name is escaped in the group dialog", async () => {
    serve([{ ...row, supplierCityName: "<img src=x>" }], 1);
    Swal.fire.mockResolvedValue({ isConfirmed: false });
    await show();

    await click(buttonIn(host, "Map all"));

    expect(Swal.fire.mock.calls[0][0].html).not.toContain("<img");
  });

  test("a failed load says so instead of looking like an empty list", async () => {
    axiosInstance.get.mockRejectedValue({ response: { data: { error: "Boom from server" } } });
    await show();

    expect(host.textContent).toContain("Boom from server");
    expect(host.textContent).not.toContain("Nothing matches these filters.");
  });

  test("before the first run it says what to do", async () => {
    axiosInstance.get.mockImplementation((url) =>
      url === `${BASE}/summary`
        ? Promise.resolve({ data: { running: false, lastRun: null, groups: [], decisions: [], openLocationFlags: 0 } })
        : Promise.resolve({ data: pageOf([]) }),
    );
    await show();

    expect(host.textContent).toContain("Press Run now");
  });

  test("run now starts a run", async () => {
    serve([]);
    await show();

    axiosInstance.post.mockResolvedValueOnce({ data: { started: true } });
    await click(buttonIn(host, "Run now"));

    expect(axiosInstance.post.mock.calls[0][0]).toBe(`${BASE}/run`);
  });
});
