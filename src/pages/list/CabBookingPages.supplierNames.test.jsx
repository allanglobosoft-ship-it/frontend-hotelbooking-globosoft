/* global globalThis */
/* eslint-disable testing-library/no-unnecessary-act -- act() wraps state flushes on purpose in these tests */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import CabBookingDetailView from "./CabBookingDetailView";
import CabBookingList from "./CabBookingList";

jest.mock("../../components/AxiosInstance", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("../../components/Sidebar", () => ({ __esModule: true, default: () => null }));
jest.mock("../../components/TopBar", () => ({ __esModule: true, default: () => null }));
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

const ADMIN_LOGINS = [
  ["an admin", "ADMIN", "ADMIN"],
  ["a super admin", "SUPER_ADMIN", "SUPER_ADMIN"],
];

/** A booked outside transfer as the backend gives it to an agent-side login. */
const agentBooking = (over = {}) => ({
  custombookingId: 1,
  packageBookCode: "PKG-1",
  agentId: 5,
  bookingDate: "2026-11-07T10:00:00",
  pickupDate: "01-12-2026",
  dropOffDate: "01-12-2026",
  cabName: "Van",
  pickupName: "Marina Walk",
  dropoffName: "Palm Gate",
  pickupType: "EXTERNAL",
  dropoffType: "EXTERNAL",
  totalPrice: "120",
  sellingPrice: "120",
  confirmationNumber: "C-0020288",
  cancelStatus: false,
  external: true,
  tripStatus: 0,
  statusRefreshedAt: "2026-11-07T10:30:00",
  ...over,
});

/** The same booking as an admin gets it: the neutral fields plus everything else. */
const adminBooking = (over = {}) =>
  agentBooking({
    apiType: "IWAY",
    iwayOrderId: "ORDER-1",
    iwayTransaction: "TRANS-1",
    iwayTripStatus: 0,
    iwayStatusRefreshedAt: "2026-11-07T10:30:00",
    transporter: "City Cars (IWay)",
    pickupType: "IWAY",
    dropoffType: "IWAY",
    ...over,
  });

const inHouseBooking = () =>
  agentBooking({
    external: false,
    tripStatus: null,
    statusRefreshedAt: null,
    transporter: "Desert Cabs",
    pickupType: "AIRPORT",
    dropoffType: "HOTEL",
    confirmationStatus: "ReConfirmed",
  });

describe("Cab booking pages and supplier names", () => {
  let host;
  let root;

  /** Stores the login as the login pages do. The list won't load an agent's rows without userId. */
  const login = (roles, active = "") => {
    sessionStorage.clear();
    sessionStorage.setItem("userRole", roles);
    sessionStorage.setItem("userId", "5");
    if (active) sessionStorage.setItem("currentActiveRole", active);
  };

  const render = async (element, entry) => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path={entry.pathname} element={element} />
            <Route path="*" element={null} />
          </Routes>
        </MemoryRouter>,
      );
    });
    await act(async () => {});
  };

  const openDetail = (booking) =>
    render(<CabBookingDetailView />, {
      pathname: "/booking-details/cab-booking/1",
      state: { booking },
    });

  const openList = async (rows) => {
    axiosInstance.get.mockImplementation((url) =>
      url === "/api/cab/grouped-list"
        ? Promise.resolve({
            data: {
              success: true,
              upcomingBookings: { content: rows },
              completedBookings: { content: [] },
              cancelledBookings: { content: [] },
            },
          })
        : Promise.resolve({ data: [] }),
    );
    await render(<CabBookingList />, { pathname: "/booking-details/cab-booking-list" });
  };

  const screenText = () => document.body.textContent;

  const titles = () =>
    [...document.querySelectorAll("[title]")].map((node) => node.getAttribute("title"));

  const buttonCalled = (name) => {
    const found = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === name,
    );
    if (!found) throw new Error(`no button "${name}"`);
    return found;
  };

  const queryButton = (name) =>
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === name);

  const click = (button) =>
    act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest.fn(() => Promise.reject(new Error("no network in tests")));
    axiosInstance.get.mockImplementation(() => Promise.resolve({ data: [] }));
    axiosInstance.post.mockResolvedValue({ status: 200, data: {} });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    sessionStorage.clear();
    jest.restoreAllMocks();
  });

  describe("detail page", () => {
    it.each(AGENT_LOGINS)("names no supplier to %s", async (_who, roles, active) => {
      login(roles, active);

      await openDetail(agentBooking());

      expect(screenText()).not.toMatch(ANY_SUPPLIER);
      expect(screenText()).not.toContain("Transporter");
      expect(titles().join(" ")).not.toMatch(ANY_SUPPLIER);
      expect(titles()).toEqual(
        expect.arrayContaining(["Last status check", "Check the latest trip status"]),
      );
    });

    it("hides the provider from an admin working as an agent, whose response still has it", async () => {
      login("ADMIN,AGENT", "AGENT");

      await openDetail(adminBooking());

      expect(screenText()).not.toMatch(ANY_SUPPLIER);
      expect(screenText()).not.toContain("City Cars");
      expect(titles().join(" ")).not.toMatch(ANY_SUPPLIER);
    });

    it.each(ADMIN_LOGINS)("shows %s what it shows today", async (_who, roles, active) => {
      login(roles, active);

      await openDetail(adminBooking());

      expect(screenText()).toContain("Transporter");
      expect(screenText()).toContain("City Cars (IWay)");
      expect(titles()).toEqual(
        expect.arrayContaining([
          "Last i'way status check",
          "Check i'way for the latest trip status",
        ]),
      );
    });

    it.each(AGENT_LOGINS)("keeps the in-house transporter for %s", async (_who, roles, active) => {
      login(roles, active);

      await openDetail(inHouseBooking());

      expect(screenText()).toContain("Transporter");
      expect(screenText()).toContain("Desert Cabs");
      expect(queryButton("CONFIRM")).toBeUndefined();
      expect(queryButton("RECONFIRM")).toBeUndefined();
    });

    it.each([
      ["agent", "AGENT", agentBooking],
      ["admin", "ADMIN", adminBooking],
    ])("drives the badge and buttons from the neutral fields for an %s", async (_who, roles, make) => {
      login(roles);
      axiosInstance.patch.mockResolvedValue({
        data: { tripStatus: 1, tripStatusLabel: "Confirmed", refreshedAt: "2026-11-07 11:00:00" },
      });

      await openDetail(make({ tripStatus: 0 }));
      expect(screenText()).toContain("On Request");

      await click(buttonCalled("CONFIRM"));

      expect(axiosInstance.patch).toHaveBeenCalledWith("/api/cab/1/refresh-status");
      expect(screenText()).toContain("Confirmed");
      expect(buttonCalled("RECONFIRM")).toBeTruthy();
      expect(queryButton("CONFIRM")).toBeUndefined();
    });

    it("hides both buttons once the trip is reconfirmed", async () => {
      login("AGENT");

      await openDetail(agentBooking({ tripStatus: 2 }));

      expect(screenText()).toContain("Reconfirmed");
      expect(queryButton("CONFIRM")).toBeUndefined();
      expect(queryButton("RECONFIRM")).toBeUndefined();
    });

    it("gives an agent neutral toasts", async () => {
      login("SUB_USER,AGENT", "SUB_USER");
      await openDetail(agentBooking());

      axiosInstance.patch.mockResolvedValueOnce({
        data: { tripStatus: 0, tripStatusLabel: "On Request" },
      });
      await click(buttonCalled("CONFIRM"));
      expect(toast.success).toHaveBeenLastCalledWith("Trip status: On Request");

      axiosInstance.patch.mockResolvedValueOnce({ data: null });
      await click(buttonCalled("CONFIRM"));
      expect(toast.error).toHaveBeenLastCalledWith("Empty response from the trip status check");

      axiosInstance.patch.mockRejectedValueOnce({
        response: { data: { message: "IWay order status failed" } },
      });
      await click(buttonCalled("CONFIRM"));
      expect(toast.error).toHaveBeenLastCalledWith("Supplier order status failed");

      axiosInstance.patch.mockRejectedValueOnce({});
      await click(buttonCalled("CONFIRM"));
      expect(toast.error).toHaveBeenLastCalledWith("Failed to update the trip status");
    });

    it("gives an admin the toasts of today", async () => {
      login("ADMIN");
      await openDetail(adminBooking());

      axiosInstance.patch.mockResolvedValueOnce({
        data: { tripStatus: 0, tripStatusLabel: "On Request" },
      });
      await click(buttonCalled("CONFIRM"));
      expect(toast.success).toHaveBeenLastCalledWith("iWay status: On Request");

      axiosInstance.patch.mockResolvedValueOnce({ data: null });
      await click(buttonCalled("CONFIRM"));
      expect(toast.error).toHaveBeenLastCalledWith("Empty response from iWay status check");

      axiosInstance.patch.mockRejectedValueOnce({
        response: { data: { message: "IWay order status failed" } },
      });
      await click(buttonCalled("CONFIRM"));
      expect(toast.error).toHaveBeenLastCalledWith("IWay order status failed");

      axiosInstance.patch.mockRejectedValueOnce({});
      await click(buttonCalled("CONFIRM"));
      expect(toast.error).toHaveBeenLastCalledWith("Failed to update iWay status");
    });
  });

  describe("cancel modal on the detail page", () => {
    const openCancelModal = async (preview) => {
      axiosInstance.get.mockImplementation((url) =>
        url.endsWith("/cancel-preview")
          ? Promise.resolve({ data: preview })
          : Promise.resolve({ data: [] }),
      );
      const cancel = [...document.querySelectorAll("button")].find((b) =>
        /^cancel/i.test(b.textContent.trim()),
      );
      if (!cancel) throw new Error("no cancel button");
      await click(cancel);
      await act(async () => {});
    };

    const penalty = {
      allowed: true,
      hasPenalty: true,
      totalAmount: 120,
      penaltyAmount: 120,
      refundAmount: 0,
    };

    it("words the penalty without a name for an agent", async () => {
      login("AGENT");
      await openDetail(agentBooking());

      await openCancelModal(penalty);

      expect(screenText()).toContain("The full trip cost is charged as a penalty.");
      expect(screenText()).not.toMatch(ANY_SUPPLIER);
    });

    it("keeps the penalty wording for an admin", async () => {
      login("ADMIN");
      await openDetail(adminBooking());

      await openCancelModal(penalty);

      expect(screenText()).toContain("i'way will charge the full trip cost as a penalty.");
    });

    it("removes the name from a blocked message for an admin working as an agent", async () => {
      login("ADMIN,AGENT", "AGENT");
      await openDetail(adminBooking());

      await openCancelModal({ allowed: false, message: "Could not reach i'way to verify cancellation" });

      expect(screenText()).toContain("Could not reach Supplier to verify cancellation");
    });

    it("keeps a blocked message for an admin", async () => {
      login("ADMIN");
      await openDetail(adminBooking());

      await openCancelModal({ allowed: false, message: "Could not reach i'way to verify cancellation" });

      expect(screenText()).toContain("Could not reach i'way to verify cancellation");
    });
  });

  describe("list page", () => {
    it.each(AGENT_LOGINS)("names no supplier to %s", async (_who, roles, active) => {
      login(roles, active);

      await openList([agentBooking({ tripStatus: 1 })]);

      expect(screenText()).toContain("PKG-1");
      expect(screenText()).toContain("Van");
      expect(screenText()).not.toMatch(ANY_SUPPLIER);
    });

    it("hides the provider from an admin working as an agent", async () => {
      login("ADMIN,AGENT", "AGENT");

      await openList([adminBooking()]);

      expect(screenText()).toContain("PKG-1");
      expect(screenText()).not.toContain("City Cars");
    });

    it.each(ADMIN_LOGINS)("shows %s the provider as it does today", async (_who, roles, active) => {
      login(roles, active);

      await openList([adminBooking()]);

      expect(screenText()).toContain("(City Cars (IWay))");
    });

    it("keeps the in-house transporter for an agent", async () => {
      login("AGENT");

      await openList([inHouseBooking()]);

      expect(screenText()).toContain("(Desert Cabs)");
    });

    it.each([
      [0, "On Request"],
      [1, "Confirmed"],
      [2, "Reconfirmed"],
      [3, "Completed"],
      [4, "Cancelled"],
    ])("takes the status from tripStatus %i for an agent", async (tripStatus, label) => {
      login("AGENT");

      await openList([agentBooking({ tripStatus })]);

      const row = [...document.querySelectorAll("tbody tr")].find((tr) =>
        tr.textContent.includes("PKG-1"),
      );
      expect(row.textContent).toContain(label);
    });
  });
});
