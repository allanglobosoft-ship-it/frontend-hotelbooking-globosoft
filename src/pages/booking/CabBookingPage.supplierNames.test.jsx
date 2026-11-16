/* global globalThis */
/* eslint-disable testing-library/no-unnecessary-act -- act() wraps state flushes on purpose in these tests */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
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

const ANY_SUPPLIER = /i'?way/i;

const AGENT_LOGINS = [
  ["a main agent", "AGENT", ""],
  ["a sub-agent", "SUB_AGENT,AGENT", "SUB_AGENT"],
  ["a sub-user", "SUB_USER,AGENT", "SUB_USER"],
];

const selectedOption = {
  types: "Private",
  privateRate: 100,
  totalRate: 120,
  totalRateWithoutMarkup: 100,
  totalRateWithoutMrk: 100,
};

const searchCriteria = (sourceTag) => ({
  agentId: "5",
  pickupType: sourceTag,
  pickupName: "Marina Walk",
  pickupTime: "10:00",
  dropoffType: sourceTag,
  dropoffName: "Palm Gate",
  pickupDate: "2026-12-01",
  adults: 1,
  children: 0,
  childAges: [],
  external: true,
  offerId: 77,
  offerUid: "U77",
  searchId: "S1",
  originLocation: { source: sourceTag, externalId: "E1", name: "Marina Walk" },
  destinationLocation: { source: sourceTag, externalId: "E2", name: "Palm Gate" },
});

/** The row and hand-off an agent-side login gets from the search page. */
const agentState = () => ({
  cab: {
    cabid: "ext-77",
    cabname: "Van",
    cabpic: "https://via.placeholder.com/400x225?text=Transfer",
    cabProviderName: "",
    external: true,
    offerId: 77,
    offerUid: "U77",
    capacityMax: 6,
  },
  selectedOption,
  searchCriteria: searchCriteria("EXTERNAL"),
});

/** The same offer as an admin gets it. */
const adminState = () => ({
  cab: {
    ...agentState().cab,
    cabid: "iway-77",
    cabpic: "https://sandbox.iway.io/images/cars/van.png",
    cabProviderName: "City Cars (IWay)",
    apiType: "IWAY",
    channelType: "iway",
    source: "IWAY",
  },
  selectedOption,
  searchCriteria: searchCriteria("IWAY"),
});

describe("CabBookingPage supplier names", () => {
  let host;
  let root;

  const login = (roles, active = "") => {
    sessionStorage.clear();
    sessionStorage.setItem("userRole", roles);
    if (active) sessionStorage.setItem("currentActiveRole", active);
  };

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

  const screen = () => document.body.textContent;

  const input = (placeholder) => {
    const found = [...host.querySelectorAll("input")].find((i) => i.placeholder === placeholder);
    if (!found) throw new Error(`no input "${placeholder}"`);
    return found;
  };

  const type = async (element, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    await act(async () => {
      setter.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  const buttonCalled = (name, scope = document.body) => {
    const found = [...scope.querySelectorAll("button")].filter(
      (b) => b.textContent.trim() === name,
    );
    if (found.length === 0) throw new Error(`no button "${name}"`);
    return found[found.length - 1];
  };

  const click = (button) =>
    act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest.fn(() => Promise.reject(new Error("no network in tests")));
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

  /** Fills the form far enough for the Order Summary, then confirms the booking. */
  const bookWith = async (phone = "+971501234567") => {
    await type(input("First Name"), "Test");
    await type(input("Last Name"), "Guest");
    await type(input("e.g. +971501234567 (include country code)"), phone);
    await type(input("Please enter email address"), "guest@example.com");
    await click(buttonCalled("Confirm", host));
    await flush();
    await click(buttonCalled("Confirm"));
    await flush();
  };

  describe.each(AGENT_LOGINS)("for %s", (_who, roles, active) => {
    beforeEach(() => login(roles, active));

    it("shows no supplier name when the page opens", async () => {
      await open(agentState());

      expect(screen()).not.toMatch(ANY_SUPPLIER);
      expect(screen()).toContain("Include Toll Road");
      expect(screen()).toContain("charged by the supplier");
    });

    it("gives neutral validation messages", async () => {
      await open(agentState());

      await type(input("e.g. +971501234567 (include country code)"), "0501234567");
      await click(buttonCalled("Confirm", host));

      expect(screen()).toContain("international format is required");
      expect(screen()).toContain("Email is required for this booking");
      expect(screen()).not.toMatch(ANY_SUPPLIER);
    });

    it("hides a provider name and a supplier's Type on the summary", async () => {
      const state = agentState();
      state.cab.cabProviderName = "City Cars (IWay)";
      state.searchCriteria.pickupType = "IWAY";
      await open(state);

      await type(input("First Name"), "Test");
      await type(input("Last Name"), "Guest");
      await type(input("e.g. +971501234567 (include country code)"), "+971501234567");
      await type(input("Please enter email address"), "guest@example.com");
      await click(buttonCalled("Confirm", host));
      await flush();

      expect(screen()).toContain("Order Summary");
      expect(screen()).toContain("LOCATION");
      expect(screen()).not.toMatch(ANY_SUPPLIER);
      expect(screen()).not.toContain("City Cars");
    });

    it("books an outside offer with neutral fields only", async () => {
      await open(agentState());

      await bookWith();

      expect(axiosInstance.post).toHaveBeenCalledTimes(1);
      const [url, payload] = axiosInstance.post.mock.calls[0];
      expect(url).toBe("/api/cab/book");
      expect(JSON.stringify(payload)).not.toMatch(ANY_SUPPLIER);
      expect(payload).toMatchObject({
        cabId: null,
        external: true,
        offerId: 77,
        offerUid: "U77",
        searchId: "S1",
        pickupType: "EXTERNAL",
        dropoffType: "EXTERNAL",
        originLocation: { source: "EXTERNAL", externalId: "E1" },
        destinationLocation: { source: "EXTERNAL", externalId: "E2" },
      });
      expect(toast.success).toHaveBeenCalledWith(
        "Booking received — pending confirmation.",
        expect.anything(),
      );
    });

    it("takes the name out of a booking failure", async () => {
      axiosInstance.post.mockRejectedValue({
        response: { data: { message: "IWay order creation failed: Check your phone number" } },
      });
      await open(agentState());

      await bookWith();

      expect(toast.error).toHaveBeenCalledWith(
        "Supplier order creation failed: Check your phone number",
      );
    });
  });

  describe("for an admin", () => {
    beforeEach(() => login("ADMIN"));

    it("keeps the wording and the provider", async () => {
      await open(adminState());

      expect(screen()).toContain("charged by i'way");
      expect(screen()).toContain("City Cars (IWay)");

      await type(input("e.g. +971501234567 (include country code)"), "0501234567");
      await click(buttonCalled("Confirm", host));

      expect(screen()).toContain("i'way requires international format");
      expect(screen()).toContain("Email is required for i'way bookings");
    });

    it("keeps the supplier on the summary and sends the same offer", async () => {
      await open(adminState());

      await type(input("First Name"), "Test");
      await type(input("Last Name"), "Guest");
      await type(input("e.g. +971501234567 (include country code)"), "+971501234567");
      await type(input("Please enter email address"), "guest@example.com");
      await click(buttonCalled("Confirm", host));
      await flush();

      expect(screen()).toContain("IWAY");
      expect(screen()).toContain("by City Cars (IWay)");

      await click(buttonCalled("Confirm"));
      await flush();

      const [, payload] = axiosInstance.post.mock.calls[0];
      expect(payload).toMatchObject({
        external: true,
        offerId: 77,
        providerName: "City Cars (IWay)",
        vehicleImage: "https://sandbox.iway.io/images/cars/van.png",
        originLocation: { source: "IWAY" },
      });
      expect(toast.success).toHaveBeenCalledWith(
        "Booking received — pending confirmation with i'way.",
        expect.anything(),
      );
    });

    it("leaves a booking failure as it is", async () => {
      axiosInstance.post.mockRejectedValue({
        response: { data: { message: "IWay order creation failed: Check your phone number" } },
      });
      await open(adminState());

      await bookWith();

      expect(toast.error).toHaveBeenCalledWith(
        "IWay order creation failed: Check your phone number",
      );
    });
  });

  it("treats an in-house row as in-house for every login", async () => {
    login("AGENT");
    const state = agentState();
    state.cab = { cabid: 101, cabname: "Sedan", cabpic: "", external: false, capacityMax: 3 };
    state.searchCriteria = {
      ...searchCriteria("AIRPORT"),
      external: false,
      offerId: null,
      offerUid: null,
      searchId: null,
      originLocation: null,
      destinationLocation: null,
      dropoffType: "HOTEL",
    };
    await open(state);

    expect(screen()).not.toContain("Include Toll Road");
    expect(screen()).not.toMatch(ANY_SUPPLIER);
  });
});
