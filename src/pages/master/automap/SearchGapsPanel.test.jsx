/* global globalThis */
/* eslint-disable testing-library/no-unnecessary-act -- act() wraps state flushes on purpose in these tests */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import Swal from "sweetalert2";

import axiosInstance from "../../../components/AxiosInstance";
import SearchGapsPanel from "./SearchGapsPanel";

jest.mock("../../../components/AxiosInstance", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn() },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const BASE = "/api/cityMapping/review/search-gaps";

const noMappingRow = {
  cityId: 9,
  cityName: "Detroit, MI",
  countryIso: "US",
  supplier: "grn",
  outcome: "NO_MAPPING",
  searches: 40,
  allSearches: 44,
  hotelsReturned: 0,
  lastSeenAt: "2026-11-06T09:00:00",
  lastCheckIn: "2026-12-01",
  mappedNow: false,
  suggestion: { supplierCityId: "555", name: "Detroit Michigan", hotels: 144 },
};

const report = (rows, totals = []) => ({
  days: 30,
  totals,
  rows: { content: rows, totalElements: rows.length, page: 0, size: 20, totalPages: 1 },
});

const serve = (rows, totals = [], terms = []) => {
  axiosInstance.get.mockImplementation((url) => {
    if (url === BASE) return Promise.resolve({ data: report(rows, totals) });
    if (url === `${BASE}/destinations`) {
      return Promise.resolve({ data: { content: terms, totalElements: terms.length, page: 0, size: 20, totalPages: 1 } });
    }
    if (url === `${BASE}/hotels`) {
      return Promise.resolve({ data: [{ code: "1", name: "Lake <b>View</b>" }] });
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  });
};

const lastGapParams = () => {
  const calls = axiosInstance.get.mock.calls.filter(([url]) => url === BASE);
  return calls[calls.length - 1][1].params;
};

describe("SearchGapsPanel", () => {
  let host;
  let root;

  beforeEach(() => {
    axiosInstance.get.mockReset();
    Swal.fire.mockReset();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  /** Long enough for the city box's delay and the loads that follow it. */
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 420));
    });

  const show = async (props) => {
    act(() => root.render(<SearchGapsPanel onMap={jest.fn()} active {...props} />));
    await settle();
  };

  const rowWith = (text) => [...host.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes(text));
  const buttonIn = (scope, name) => [...scope.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(name));
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

  test("shows a gap in plain words, with its share of searches and the possible supplier city", async () => {
    serve([noMappingRow], [
      { outcome: "NO_MAPPING", lines: 1, searches: 40 },
      { outcome: "HOTELS_RETURNED", lines: 3, searches: 900 },
    ]);
    await show();

    const row = rowWith("Detroit, MI");
    expect(row.textContent).toContain("GRN");
    expect(row.textContent).toContain("No mapping");
    expect(row.textContent).toContain("40 of 44");
    expect(row.textContent).toContain("Detroit Michigan");
    expect(row.textContent).toContain("144 hotels");
    expect(row.textContent).toContain("name match only");
    expect(host.textContent).toContain("answered with hotels 900 times");
  });

  test("the all-suppliers row has no 'of' total and no action", async () => {
    serve([{ ...noMappingRow, supplier: "all", outcome: "NO_HOTELS_AT_ALL", suggestion: null }]);
    await show();

    const row = rowWith("Detroit, MI");
    expect(row.textContent).toContain("All suppliers");
    expect(row.textContent).not.toContain("40 of");
    expect(row.querySelector("button")).toBeNull();
  });

  test("a city mapped since says so and offers no action", async () => {
    serve([{ ...noMappingRow, mappedNow: true, suggestion: null }]);
    await show();

    const row = rowWith("Detroit, MI");
    expect(row.textContent).toContain("Mapped since");
    expect(row.querySelector("button")).toBeNull();
  });

  test("an outcome, a period and a supplier filter the list, and choosing the outcome again clears it", async () => {
    serve([noMappingRow]);
    await show();

    await click(buttonIn(host, "No mapping"));
    expect(lastGapParams().outcome).toBe("NO_MAPPING");

    await choose("Period", "90");
    expect(lastGapParams().days).toBe(90);

    await choose("Filter search gaps by supplier", "x3");
    expect(lastGapParams().supplier).toBe("x3");

    await click(buttonIn(host, "No mapping"));
    expect(lastGapParams().outcome).toBeUndefined();
  });

  test("mapping asks first, and reloads only once it was saved", async () => {
    serve([noMappingRow]);
    const onMap = jest.fn().mockResolvedValue(true);
    await show({ onMap });
    const before = axiosInstance.get.mock.calls.length;

    Swal.fire.mockResolvedValueOnce({ isConfirmed: false });
    await click(buttonIn(rowWith("Detroit, MI"), "Map"));
    expect(Swal.fire).toHaveBeenCalledTimes(1);
    expect(onMap).not.toHaveBeenCalled();
    expect(axiosInstance.get.mock.calls.length).toBe(before);

    Swal.fire.mockResolvedValueOnce({ isConfirmed: true });
    await click(buttonIn(rowWith("Detroit, MI"), "Map"));
    expect(onMap).toHaveBeenCalledWith({ provider: "grn", supplierCityId: "555", name: "Detroit Michigan" }, 9, "Detroit, MI");
    expect(axiosInstance.get.mock.calls.length).toBeGreaterThan(before);
  });

  test("a mapping that was not saved does not reload", async () => {
    serve([noMappingRow]);
    await show({ onMap: jest.fn().mockResolvedValue(false) });
    const before = axiosInstance.get.mock.calls.length;

    Swal.fire.mockResolvedValueOnce({ isConfirmed: true });
    await click(buttonIn(rowWith("Detroit, MI"), "Map"));
    expect(axiosInstance.get.mock.calls.length).toBe(before);
  });

  test("hotel names are escaped when listed", async () => {
    serve([noMappingRow]);
    Swal.fire.mockResolvedValue({});
    await show();

    await click(buttonIn(rowWith("Detroit, MI"), "View hotels"));

    const html = Swal.fire.mock.calls[0][0].html;
    expect(html).toContain("Lake &lt;b&gt;View&lt;/b&gt;");
    expect(html).not.toContain("<b>");
    const hotelCall = axiosInstance.get.mock.calls.find(([url]) => url === `${BASE}/hotels`);
    expect(hotelCall[1].params).toEqual({ supplier: "grn", supplierCityId: "555" });
  });

  test("typed destinations are listed", async () => {
    serve([], [], [{ term: "swat valley", searches: 6, lastSeenAt: "2026-11-06T09:00:00" }]);
    await show();

    expect(rowWith("swat valley").textContent).toContain("6");
    expect(host.textContent).toContain("No search gaps match these filters.");
  });

  test("a failed load says so instead of looking like an empty list", async () => {
    axiosInstance.get.mockRejectedValue({ response: { data: { error: "Boom from server" } } });
    await show();

    expect(host.textContent).toContain("Boom from server");
    expect(host.textContent).not.toContain("No search gaps match these filters.");
  });
});
