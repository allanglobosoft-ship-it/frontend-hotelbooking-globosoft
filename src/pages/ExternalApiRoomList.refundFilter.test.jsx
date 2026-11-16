import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import axiosInstance from "../components/AxiosInstance";
import { streamRoomSearch } from "../utils/roomSearchStream";
import ExternalApiRoomList from "./ExternalApiRoomList";

jest.mock("../components/AxiosInstance", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../utils/roomSearchStream", () => ({
  __esModule: true,
  streamRoomSearch: jest.fn(),
}));
jest.mock("../components/Sidebar", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/TopBar", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/AdminSupplierStrip", () => ({ __esModule: true, default: () => null }));
jest.mock("react-hot-toast", () => {
  const toast = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: toast, toast };
});

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

/** A supplier block (no GRN: GRN rates carry their own badge). */
const block = (apiId, apiType, rates) => ({
  apiId,
  apiType,
  hotelCode: `S${apiId}`,
  roomCategories: [{ roomCategory: `Deluxe ${apiType}`, availableRates: rates }],
});

const ONE_SUPPLIER = [
  block(14, "RATEHAWK", [
    rate("FLEXIBLE", 300),
    rate("PARTIAL", 200),
    rate("NON_REFUNDABLE", 100),
  ]),
];

/** A mapped hotel: two suppliers, the labels split between them. */
const MAPPED = [
  block(14, "RATEHAWK", [rate("FLEXIBLE", 300), rate("NON_REFUNDABLE", 120)]),
  block(12, "IWTX", [rate("PARTIAL", 210), rate("NON_REFUNDABLE", 110)]),
];

const searchPayload = {
  checkInDate: "2026-12-10",
  checkOutDate: "2026-12-12",
  hotelCode: "S14",
  apiId: 14,
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

/** Each block arrives as its own supplier line, as the stream sends them. */
const answerWith = (blocks) =>
  streamRoomSearch.mockImplementation(async (_body, { onStart, onSupplier }) => {
    onStart?.({ suppliers: blocks.map((b) => ({ apiId: b.apiId })) });
    blocks.forEach((b) => onSupplier?.({ status: { apiId: b.apiId }, hotels: [b] }));
    return { success: true, supplierStatus: [] };
  });

describe("ExternalApiRoomList opens with the search page's Refund Policy box", () => {
  let host;
  let root;

  beforeEach(() => {
    // The page logs every render; keep the test output readable.
    jest.spyOn(console, "log").mockImplementation(() => {});
    sessionStorage.clear();
    sessionStorage.setItem("userRole", "ADMIN");
    axiosInstance.get.mockReset();
    axiosInstance.post.mockReset();
    streamRoomSearch.mockReset();
    axiosInstance.get.mockResolvedValue({ data: [] });
    axiosInstance.post.mockResolvedValue({ data: {} });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    console.log.mockRestore();
  });

  const mount = (state) =>
    root.render(
      <MemoryRouter initialEntries={[{ pathname: "/api-room-list", state }]}>
        <Routes>
          <Route path="/api-room-list" element={<ExternalApiRoomList />} />
        </Routes>
      </MemoryRouter>,
    );

  const open = async (state) => {
    await act(async () => {
      mount(state);
    });
    // Let the supplier answers and their re-renders land.
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
  ])("ticks %s for a supplier hotel and shows only those rates", async (policy, boxId, label) => {
    storeHandoff(policy);
    answerWith(ONE_SUPPLIER);
    await open();

    expect(box(boxId).checked).toBe(true);
    ["filter-refundable", "filter-partial", "filter-nonrefundable"]
      .filter((id) => id !== boxId)
      .forEach((id) => expect(box(id).checked).toBe(false));
    expect(shownLabels()).toEqual([label]);
  });

  it("filters every supplier's rates of a mapped hotel", async () => {
    storeHandoff("nonRefundable");
    answerWith(MAPPED);
    await open();

    expect(box("filter-nonrefundable").checked).toBe(true);
    expect(shownLabels()).toEqual(["Non Refundable", "Non Refundable"]);
  });

  it("takes the box RoomList hands on for a mapped in-house hotel", async () => {
    answerWith(MAPPED);
    await open({
      payload: { ...searchPayload, apiId: 1, hotelCode: "IN5" },
      meta: { hotelName: "Palm Hotel" },
      currency: { code: "AED", factor: 1 },
      refundPolicy: "partial",
    });

    expect(box("filter-partial").checked).toBe(true);
    expect(shownLabels()).toEqual(["Flexible - Partial"]);
  });

  it("can still be changed or cleared", async () => {
    storeHandoff("partial");
    answerWith(ONE_SUPPLIER);
    await open();
    expect(shownLabels()).toEqual(["Flexible - Partial"]);

    await act(async () => box("filter-refundable").click());
    expect(shownLabels()).toEqual(["Flexible", "Flexible - Partial"]);

    const clear = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Clear filters",
    );
    await act(async () => clear.click());

    ["filter-refundable", "filter-partial", "filter-nonrefundable"].forEach((id) =>
      expect(box(id).checked).toBe(false),
    );
    expect(shownLabels()).toEqual([...LABELS].sort());
  });

  it("opens as before when no box was ticked on the search page", async () => {
    storeHandoff(undefined);
    answerWith(ONE_SUPPLIER);
    await open();

    ["filter-refundable", "filter-partial", "filter-nonrefundable"].forEach((id) =>
      expect(box(id).checked).toBe(false),
    );
    expect(shownLabels()).toEqual([...LABELS].sort());
    expect(document.body.textContent).not.toMatch(/Clear filters/);
  });
});
