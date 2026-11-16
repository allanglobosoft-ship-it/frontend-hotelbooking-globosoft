/* global globalThis */
/* eslint-disable testing-library/no-unnecessary-act -- act() wraps state flushes on purpose in these tests */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";

import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import ApiBookingPageForHotels from "./ApiBookingPageForHotels";

jest.mock("../../components/AxiosInstance", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../../components/Sidebar", () => ({ __esModule: true, default: () => null }));
jest.mock("../../components/TopBar", () => ({ __esModule: true, default: () => null }));
jest.mock("../../components/AgentBalanceDisplay", () => ({ __esModule: true, default: () => null }));
jest.mock("react-hot-toast", () => {
  const toast = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: toast, toast };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ANY_SUPPLIER = /atharva|\bgrn\b|darina|rate\s?hawk|go\s?global|iwtx|i'?way|jumeirah|juniper/i;

const AGENT_LOGINS = [
  ["a main agent", "AGENT", ""],
  ["a sub-agent", "SUB_AGENT,AGENT", "SUB_AGENT"],
  ["a sub-user", "SUB_USER,AGENT", "SUB_USER"],
];

const rate = (extra) => ({
  roomCategory: "Deluxe",
  mealPlan: "Room Only",
  rate: 500,
  nonRefundable: false,
  ...extra,
});

const bookingData = (apiId, rateExtra) => ({
  payload: {
    apiId,
    agentId: 5,
    nationality: "IN",
    checkIn: "2026-12-10",
    checkOut: "2026-12-12",
    rooms: [{ adults: 1, children: 0, childAges: [] }],
  },
  hotelStaticData: { hotelName: "Palm Hotel (GRN)", address: "Marina" },
  selectedRate: [rate(rateExtra)],
});

describe("ApiBookingPageForHotels supplier names", () => {
  let host;
  let root;

  const login = (roles, active = "") => {
    sessionStorage.clear();
    sessionStorage.setItem("userRole", roles);
    if (active) sessionStorage.setItem("currentActiveRole", active);
  };

  const open = async (data) => {
    sessionStorage.setItem("bookingData", JSON.stringify(data));
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/api-booking"]}>
          <ApiBookingPageForHotels />
        </MemoryRouter>,
      );
    });
    await act(async () => {});
  };

  const screen = () => document.body.textContent;

  const setValue = (element, proto, value, event) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
      element.dispatchEvent(new Event(event, { bubbles: true }));
    });

  const type = (placeholder, value) =>
    setValue(
      [...host.querySelectorAll("input")].find((i) => i.placeholder === placeholder),
      window.HTMLInputElement.prototype,
      value,
      "input",
    );

  const choose = (select, value) =>
    setValue(select, window.HTMLSelectElement.prototype, value, "change");

  const click = (element) =>
    act(async () => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

  const confirmBooking = () =>
    click([...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Confirm Booking"));

  /** Everything an Indian guest's booking asks for before the prebook runs. */
  const fillIndianGuest = async () => {
    const [salutation, gender, panType] = host.querySelectorAll("select");
    await choose(salutation, salutation.options[1].value);
    await type("First Name *", "Test");
    await type("Last Name *", "Guest");
    await choose(gender, gender.options[1].value);
    await type("Enter 10-character PAN", "ABCDE1234F");
    await choose(panType, panType.options[1].value);
    await click(host.querySelector("#booking-mode-voucher"));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ["log", "warn", "error", "groupCollapsed", "groupEnd"].forEach((method) =>
      jest.spyOn(console, method).mockImplementation(() => {}),
    );
    // The PAN gate for one supplier reads the agent's registered country.
    axiosInstance.get.mockImplementation((url) =>
      Promise.resolve({
        data: url.startsWith("/api/agent/") ? { countryName: "India" } : {},
      }),
    );
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

  describe.each(AGENT_LOGINS)("for %s", (_who, roles, active) => {
    beforeEach(() => login(roles, active));

    it("explains the PAN without naming the supplier on an Indian guest's rate", async () => {
      await open(bookingData(3));

      expect(screen()).toContain("PAN is required for Indian nationals on this booking.");
      expect(screen()).not.toMatch(ANY_SUPPLIER);
    });

    it("explains the PAN without naming the supplier when the rate requires it", async () => {
      await open(bookingData(20, { panRequired: true }));

      expect(screen()).toContain("This rate mandates PAN on the holder.");
      expect(screen()).not.toMatch(ANY_SUPPLIER);
    });

    it("gives a neutral message when the PAN is missing", async () => {
      await open(bookingData(3));

      await confirmBooking();

      expect(toast.error).toHaveBeenCalledWith("PAN Card No is required (Indian primary guest).");
      expect(screen()).not.toMatch(ANY_SUPPLIER);
    });

    it("gives a neutral message when the prebook fails", async () => {
      axiosInstance.post.mockResolvedValue({ data: { success: false } });
      await open(bookingData(3));
      await fillIndianGuest();

      await confirmBooking();

      expect(axiosInstance.post.mock.calls[0][0]).toBe("/api/hotel-booking/rate-check/3");
      expect(toast.error).toHaveBeenCalledWith(
        "Prebook failed — rate may no longer be available. Please repeat the search.",
      );
    });

    it("takes the name out of a supplier's own prebook error", async () => {
      axiosInstance.post.mockRejectedValue({
        response: { data: { message: "ATHARVA prebook: search response is missing tokenId" } },
      });
      await open(bookingData(3));
      await fillIndianGuest();

      await confirmBooking();

      expect(toast.error).toHaveBeenCalledWith(
        "Supplier prebook: search response is missing tokenId",
      );
    });

    it("carries no supplier name in the booking mode controls", async () => {
      await open(bookingData(3));

      expect(host.innerHTML).not.toMatch(/atharva/i);
    });
  });

  describe("for an admin", () => {
    beforeEach(() => login("ADMIN"));

    it("keeps the Atharva PAN wording", async () => {
      await open(bookingData(3));

      expect(screen()).toContain("PAN is required for Indian nationals booking with Atharva.");
    });

    it("keeps the Atharva messages", async () => {
      axiosInstance.post.mockResolvedValue({ data: { success: false } });
      await open(bookingData(3));

      await confirmBooking();
      expect(toast.error).toHaveBeenCalledWith(
        "PAN Card No is required (Indian primary guest booking with Atharva).",
      );

      await fillIndianGuest();
      await confirmBooking();
      expect(toast.error).toHaveBeenCalledWith(
        "Atharva prebook failed — rate may no longer be available. Please repeat the search.",
      );
    });

    it("keeps the GRN PAN wording", async () => {
      await open(bookingData(20, { panRequired: true }));

      expect(screen()).toContain("This GRN rate mandates PAN on the holder.");
    });
  });
});
