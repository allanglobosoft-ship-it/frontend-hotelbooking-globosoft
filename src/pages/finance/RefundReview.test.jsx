/* global globalThis */
/* eslint-disable testing-library/no-unnecessary-act -- act() wraps state flushes on purpose in these tests */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

import axiosInstance from "../../components/AxiosInstance";
import RefundReview from "./RefundReview";

jest.mock("../../components/AxiosInstance", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../../components/Sidebar", () => () => null);
jest.mock("../../components/TopBar", () => () => null);
jest.mock("react-hot-toast", () => ({ toast: { success: jest.fn() } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** A card-paid hotel cancellation, as the backend lists it. */
const cardItem = {
  id: 12,
  module: "HOTEL",
  moduleLabel: "Hotel",
  bookingId: 5,
  bookingCode: "GLB123",
  agentId: 10,
  agentName: "Desert Travels",
  serviceName: "Test Hotel",
  charged: 1000,
  reason: "Card refund 800.00 via CC Avenue (order ORD-77) of the 1000.00 paid by card.",
  flaggedAt: "2026-10-22T11:00:00",
  dueBy: "2026-10-26",
  workingDaysOpen: 3,
  overdue: true,
  status: "PENDING",
  kind: "CARD_REFUND",
  refundAmount: 800,
  paymentOrderId: "ORD-77",
  paymentChannel: "CC Avenue",
};

let container;
let root;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const render = async () => {
  await act(async () => {
    root.render(<RefundReview />);
  });
  await flush();
};

const button = (text, scope = document.body) =>
  Array.from(scope.querySelectorAll("button")).find((b) => b.textContent.trim() === text);

test("lists pending items with the card refund, CC Avenue order and overdue flag", async () => {
  axiosInstance.get.mockResolvedValue({
    data: { items: [cardItem], pendingCount: 1, overdueCount: 1 },
  });

  await render();

  expect(axiosInstance.get).toHaveBeenCalledWith("/api/refund-review", {
    params: { status: "PENDING" },
  });
  const text = container.textContent;
  expect(text).toContain("1 pending");
  expect(text).toContain("1 overdue");
  expect(text).toContain("GLB123");
  expect(text).toContain("Card refund");
  expect(text).toContain("refund 800.00");
  expect(text).toContain("order ORD-77");
  expect(text).toContain("Desert Travels");
  expect(text).toContain("Overdue");
  expect(text).toContain("3 working days");
});

test("resolving a card refund posts the decided amount and reloads the list", async () => {
  axiosInstance.get.mockResolvedValue({
    data: { items: [cardItem], pendingCount: 1, overdueCount: 1 },
  });
  axiosInstance.post.mockResolvedValue({
    data: { success: true, message: "Recorded: 800.00 refunded to the card via CC Avenue (order ORD-77)." },
  });

  await render();
  await act(async () => {
    button("Resolve", container).click();
  });

  expect(document.body.textContent).toContain("Mark refunded via CC Avenue");
  await act(async () => {
    button("Mark refunded").click();
  });
  await flush();

  expect(axiosInstance.post).toHaveBeenCalledWith("/api/refund-review/12/resolve", {
    action: "REFUND",
    amount: 800,
    note: null,
  });
  expect(axiosInstance.get).toHaveBeenCalledTimes(2);
});

test("a refund above what was charged is stopped before it is sent", async () => {
  axiosInstance.get.mockResolvedValue({
    data: { items: [cardItem], pendingCount: 1, overdueCount: 1 },
  });

  await render();
  await act(async () => {
    button("Resolve", container).click();
  });
  const input = document.body.querySelector('input[type="number"]');
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setValue.call(input, "1200");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    button("Mark refunded").click();
  });

  expect(document.body.textContent).toContain("cannot be more than what was charged");
  expect(axiosInstance.post).not.toHaveBeenCalled();
});

test("an API refusal is shown instead of the list", async () => {
  axiosInstance.get.mockRejectedValue({
    response: { data: { message: "Only Globosoft staff can review refunds." } },
  });

  await render();

  expect(container.textContent).toContain("Only Globosoft staff can review refunds.");
});
