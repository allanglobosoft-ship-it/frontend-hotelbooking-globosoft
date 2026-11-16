/* global globalThis */
/* eslint-disable testing-library/no-unnecessary-act -- act() wraps state flushes on purpose in these tests */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import axiosInstance from "../../components/AxiosInstance";
import CabBookingPage from "./CabBookingPage";

jest.mock("../../components/AxiosInstance", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../../components/Sidebar", () => ({ __esModule: true, default: () => null }));
jest.mock("../../components/TopBar", () => ({ __esModule: true, default: () => null }));
jest.mock("../../components/AgentBalanceDisplay", () => ({ __esModule: true, default: () => null }));
jest.mock("react-hot-toast", () => ({
  toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SIGN = "Leave empty to use lead passenger's name";
const FLIGHT = "Please enter pickup flight number";

const AIRPORT = { source: "EXTERNAL", externalId: "E1", name: "Dubai Airport", code: "DXB" };
const STREET = { source: "EXTERNAL", externalId: "E3", name: "Marina Walk" };

/** A stub outside offer, in the shape the search page hands to the booking page. */
const offer = ({ flexibleTariff, allowableTime, pickup = AIRPORT }) => ({
  cab: {
    cabid: "ext-77",
    cabname: "Van",
    cabpic: "https://via.placeholder.com/400x225?text=Transfer",
    cabProviderName: "",
    external: true,
    offerId: 77,
    offerUid: "U77",
    capacityMax: 6,
    flexibleTariff,
    allowableTime,
  },
  selectedOption: {
    types: "Private",
    privateRate: 100,
    totalRate: 120,
    totalRateWithoutMarkup: 100,
    totalRateWithoutMrk: 100,
  },
  searchCriteria: {
    agentId: "5",
    pickupType: "EXTERNAL",
    pickupName: pickup.name,
    pickupTime: "10:00",
    dropoffType: "EXTERNAL",
    dropoffName: "Palm Gate",
    pickupDate: "2026-12-01",
    adults: 1,
    children: 0,
    childAges: [],
    external: true,
    offerId: 77,
    offerUid: "U77",
    searchId: "S1",
    allowableTime,
    originLocation: pickup,
    destinationLocation: { source: "EXTERNAL", externalId: "E2", name: "Palm Gate" },
  },
});

describe.each([
  ["an agent", "AGENT"],
  ["an admin", "ADMIN"],
])("CabBookingPage offer fields for %s", (_who, role) => {
  let host;
  let root;

  const flush = () => act(async () => {});

  const open = async (state) => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[{ pathname: "/cab-booking-page", state }]}>
          <Routes>
            <Route path="/cab-booking-page" element={<CabBookingPage />} />
            <Route path="*" element={null} />
          </Routes>
        </MemoryRouter>,
      );
    });
    await flush();
  };

  const inputOrNull = (placeholder) =>
    [...host.querySelectorAll("input")].find((i) => i.placeholder === placeholder) || null;

  const type = async (placeholder, value) => {
    const element = inputOrNull(placeholder);
    if (!element) throw new Error(`no input "${placeholder}"`);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    await act(async () => {
      setter.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  const clickConfirm = async (scope) => {
    const buttons = [...scope.querySelectorAll("button")].filter(
      (b) => b.textContent.trim() === "Confirm",
    );
    if (buttons.length === 0) throw new Error('no button "Confirm"');
    await act(async () => {
      buttons[buttons.length - 1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
  };

  /** Fills what a booking needs, confirms twice, and returns what /api/cab/book got. */
  const book = async () => {
    await type("First Name", "Test");
    await type("Last Name", "Guest");
    await type("e.g. +971501234567 (include country code)", "+971501234567");
    await type("Please enter email address", "guest@example.com");
    if (inputOrNull(FLIGHT)) await type(FLIGHT, "EK1");
    await clickConfirm(host);
    await clickConfirm(document.body);
    expect(axiosInstance.post).toHaveBeenCalledTimes(1);
    const [url, payload] = axiosInstance.post.mock.calls[0];
    expect(url).toBe("/api/cab/book");
    return payload;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest.fn(() => Promise.reject(new Error("no network in tests")));
    sessionStorage.clear();
    sessionStorage.setItem("userRole", role);
    axiosInstance.get.mockImplementation(() => Promise.resolve({ data: {} }));
    axiosInstance.post.mockResolvedValue({ status: 200, data: { success: true } });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    sessionStorage.clear();
    jest.restoreAllMocks();
  });

  it("asks for a sign when Meet & Greet is in the price, and sends the offer's values", async () => {
    await open(offer({ flexibleTariff: false, allowableTime: 3600 }));

    expect(inputOrNull(SIGN)).not.toBeNull();
    await type(SIGN, "Mr Test");
    const payload = await book();

    expect(payload).toMatchObject({
      flexibleTariff: false,
      allowableTime: 3600,
      meetGreetSign: "Mr Test",
    });
  });

  it("asks for no sign on a flexible-tariff offer, and sends none", async () => {
    await open(offer({ flexibleTariff: true, allowableTime: 7200 }));

    expect(inputOrNull(SIGN)).toBeNull();
    const payload = await book();

    expect(payload).toMatchObject({
      flexibleTariff: true,
      allowableTime: 7200,
      meetGreetSign: null,
    });
  });

  it("still asks for a sign when the offer did not say", async () => {
    await open(offer({ flexibleTariff: null, allowableTime: null }));

    expect(inputOrNull(SIGN)).not.toBeNull();
    const payload = await book();

    expect(payload).toMatchObject({ flexibleTariff: null, allowableTime: null });
  });

  it("asks for no sign when the pickup is not an airport", async () => {
    await open(offer({ flexibleTariff: false, allowableTime: 3600, pickup: STREET }));

    expect(inputOrNull(SIGN)).toBeNull();
    const payload = await book();

    expect(payload).toMatchObject({
      flexibleTariff: false,
      allowableTime: 3600,
      meetGreetSign: null,
    });
  });
});
