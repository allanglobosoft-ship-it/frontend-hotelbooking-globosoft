/* global globalThis */
/* eslint-disable testing-library/no-unnecessary-act -- act() wraps state flushes on purpose in these tests */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

import HotelSearchProgressBar, { FINISHED_LINGER_MS } from "./HotelSearchProgressBar";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SUPPLIER_NAMES = /grn|iwtx|x3|atharva|ratehawk|jumeirah|darina|goglobal|juniper/i;

describe("HotelSearchProgressBar", () => {
  let host;
  let root;

  beforeEach(() => {
    jest.useFakeTimers();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    jest.useRealTimers();
  });

  const show = (props) => act(() => root.render(<HotelSearchProgressBar {...props} />));
  const bar = () => host.querySelector('[data-testid="hotel-search-progress"]');
  const text = () => host.querySelector('[data-testid="hotel-search-progress-text"]').textContent;
  const percent = () => host.querySelector(".search-progress-percent").textContent;

  it("shows nothing before a search", () => {
    show({ pollStatus: "IDLE", progress: null, hotelsSoFar: 0, isLoading: false });

    expect(bar()).toBeNull();
  });

  it("shows while the search request is on its way, before any reply", () => {
    show({ pollStatus: "IDLE", progress: null, hotelsSoFar: 0, isLoading: true });

    expect(bar()).not.toBeNull();
    expect(text()).toBe("Asking suppliers");
    expect(percent()).toBe("0%");
  });

  it("shows how many suppliers have answered and the hotels found so far", () => {
    show({
      pollStatus: "IN_PROGRESS",
      progress: { total: 7, answered: 3, failed: 0, complete: false, suppliers: [] },
      hotelsSoFar: 124,
    });

    expect(text()).toBe("3 of 7 suppliers answered · 124 hotels so far");
    expect(percent()).toBe("43%");
  });

  it("moves as more suppliers answer", () => {
    show({
      pollStatus: "IN_PROGRESS",
      progress: { total: 4, answered: 1, failed: 0, complete: false, suppliers: [] },
      hotelsSoFar: 10,
    });
    expect(percent()).toBe("25%");

    show({
      pollStatus: "IN_PROGRESS",
      progress: { total: 4, answered: 2, failed: 1, complete: false, suppliers: [] },
      hotelsSoFar: 30,
    });
    expect(percent()).toBe("75%");
    expect(text()).toBe("2 of 4 suppliers answered · 30 hotels so far");
  });

  it("fills up and goes away once the search has finished", () => {
    show({
      pollStatus: "IN_PROGRESS",
      progress: { total: 2, answered: 1, failed: 0, complete: false, suppliers: [] },
      hotelsSoFar: 5,
    });

    show({
      pollStatus: "COMPLETED",
      progress: { total: 2, answered: 2, failed: 0, complete: true, suppliers: [] },
      hotelsSoFar: 9,
    });
    expect(percent()).toBe("100%");

    act(() => jest.advanceTimersByTime(FINISHED_LINGER_MS));
    expect(bar()).toBeNull();
  });

  it("goes away when the page gave up on the server", () => {
    show({
      pollStatus: "IN_PROGRESS",
      progress: { total: 2, answered: 1, failed: 0, complete: false, suppliers: [] },
      hotelsSoFar: 5,
    });

    show({
      pollStatus: "TIMEOUT",
      progress: { total: 2, answered: 1, failed: 0, complete: false, suppliers: [] },
      hotelsSoFar: 5,
    });

    expect(bar()).toBeNull();
  });

  it("never prints a supplier name, even if one is in the data", () => {
    show({
      pollStatus: "IN_PROGRESS",
      progress: {
        total: 3,
        answered: 1,
        failed: 1,
        complete: false,
        suppliers: [
          { name: "grn", status: "TIMEOUT" },
          { name: "iwtx", status: "COMPLETED" },
        ],
      },
      hotelsSoFar: 5,
    });

    expect(host.textContent).not.toMatch(SUPPLIER_NAMES);
  });
});
