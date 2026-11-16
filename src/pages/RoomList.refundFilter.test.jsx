import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import axiosInstance from "../components/AxiosInstance";
import RoomList from "./RoomList";

jest.mock("../components/AxiosInstance", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../components/Sidebar", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/TopBar", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/AdminSupplierStrip", () => ({ __esModule: true, default: () => null }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const LABELS = ["Flexible", "Flexible - Partial", "Non Refundable"];

const rate = (label, price) => ({
  mealPlan: "Room Only",
  rate: price,
  totalRate: price,
  roomRateBasedOnRoomCount: price,
  refundTerms: { label },
});

/** One in-house hotel with one rate of each label. */
const roomSearchReply = (blocks) => ({
  data: {
    success: true,
    hotels: blocks || [
      {
        hotelId: 5,
        roomCategories: [
          {
            roomCategory: "Deluxe",
            availableRates: [
              rate("FLEXIBLE", 300),
              rate("PARTIAL", 200),
              rate("NON_REFUNDABLE", 100),
            ],
          },
        ],
      },
    ],
  },
});

const searchPayload = {
  checkInDate: "2026-12-10",
  checkOutDate: "2026-12-12",
  hotelCode: "IN5",
  apiId: 1,
  rooms: [{ adults: 2, children: 0, childAges: [] }],
};

/** What HotelSearch's View Rooms stores, with or without a refund box. */
const storeHandoff = (refundPolicy) => {
  sessionStorage.setItem(
    "roomListPayload",
    JSON.stringify({
      payload: searchPayload,
      meta: { hotelName: "Palm Hotel" },
      currency: { code: "AED", factor: 1 },
      ...(refundPolicy ? { refundPolicy } : {}),
    }),
  );
};

/** Stands in for /api-room-list and shows what RoomList handed it. */
const HandedOn = () => {
  const location = useLocation();
  return <div id="handed-on">{String(location.state?.refundPolicy)}</div>;
};

describe("RoomList opens with the search page's Refund Policy box", () => {
  let host;
  let root;

  beforeEach(() => {
    // The page logs every render; keep the test output readable.
    jest.spyOn(console, "log").mockImplementation(() => {});
    sessionStorage.clear();
    sessionStorage.setItem("userRole", "ADMIN");
    axiosInstance.get.mockReset();
    axiosInstance.post.mockReset();
    axiosInstance.get.mockResolvedValue({ data: [] });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    console.log.mockRestore();
  });

  const mount = () =>
    root.render(
      <MemoryRouter initialEntries={["/room-list"]}>
        <Routes>
          <Route path="/room-list" element={<RoomList />} />
          <Route path="/api-room-list" element={<HandedOn />} />
        </Routes>
      </MemoryRouter>,
    );

  const open = async () => {
    await act(async () => {
      mount();
    });
    // Let the room search reply and its re-render land.
    await act(async () => {
      await settle();
    });
  };

  const box = (id) => document.getElementById(id);
  const shownLabels = () =>
    [...document.querySelectorAll(".rate-card .badge")]
      .map((b) => b.textContent)
      .filter((t) => LABELS.includes(t))
      .sort();

  it.each([
    ["refundable", "filter-refundable", "Flexible"],
    ["partial", "filter-partial", "Flexible - Partial"],
    ["nonRefundable", "filter-nonrefundable", "Non Refundable"],
  ])("ticks %s and shows only those rates", async (policy, boxId, label) => {
    storeHandoff(policy);
    axiosInstance.post.mockResolvedValue(roomSearchReply());
    await open();

    expect(box(boxId).checked).toBe(true);
    const others = ["filter-refundable", "filter-partial", "filter-nonrefundable"].filter(
      (id) => id !== boxId,
    );
    others.forEach((id) => expect(box(id).checked).toBe(false));
    expect(shownLabels()).toEqual([label]);
  });

  it("can still be unticked to show every rate", async () => {
    storeHandoff("partial");
    axiosInstance.post.mockResolvedValue(roomSearchReply());
    await open();
    expect(shownLabels()).toEqual(["Flexible - Partial"]);

    await act(async () => box("filter-partial").click());

    expect(box("filter-partial").checked).toBe(false);
    expect(shownLabels()).toEqual([...LABELS].sort());
  });

  it("can be changed to another box", async () => {
    storeHandoff("partial");
    axiosInstance.post.mockResolvedValue(roomSearchReply());
    await open();

    await act(async () => box("filter-nonrefundable").click());

    expect(box("filter-partial").checked).toBe(false);
    expect(shownLabels()).toEqual(["Non Refundable"]);
  });

  it("opens as before when no box was ticked on the search page", async () => {
    storeHandoff(undefined);
    axiosInstance.post.mockResolvedValue(roomSearchReply());
    await open();

    ["filter-refundable", "filter-partial", "filter-nonrefundable"].forEach((id) =>
      expect(box(id).checked).toBe(false),
    );
    expect(shownLabels()).toEqual([...LABELS].sort());
    expect(document.body.textContent).not.toMatch(/Clear filters/);
  });

  it("hands the box on to the supplier room list for a mapped hotel", async () => {
    storeHandoff("nonRefundable");
    axiosInstance.post.mockResolvedValue(
      roomSearchReply([
        { apiId: 1, hotelId: 5, roomCategories: [] },
        { apiId: 20, hotelId: 5, roomCategories: [] },
      ]),
    );
    await open();

    expect(document.getElementById("handed-on").textContent).toBe("nonRefundable");
  });
});
