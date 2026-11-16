import {
  HOLD_CAPABLE_API_IDS,
  isHoldEligible,
  offersHoldOption,
  showsBookingModePicker,
} from "./ApiBookingPageForHotels";
import { REFUND_FLEXIBLE } from "../../utils/refundLabel";

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

const iso = (daysFromToday) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
};

// The backend decides the refund label and its last free day (refundTerms);
// the page reads that before anything else.
const refundableRate = (cutoffDaysFromToday) => ({
  rate: 500,
  nonRefundable: false,
  refundTerms: { label: REFUND_FLEXIBLE, cutoff: iso(cutoffDaysFromToday) },
});

const booking = (apiId, rates) => ({ payload: { apiId }, selectedRate: rates });

const SUPPLIERS = [
  ["GRN", 20],
  ["IWTX", 12],
  ["GoGlobal", 21],
  ["X3", 15],
  ["Darina", 16],
];

describe("Hold Room and Pay Later on the supplier booking page", () => {
  test.each(SUPPLIERS)("%s is offered the hold on a refundable rate inside its free window", (_name, apiId) => {
    expect(HOLD_CAPABLE_API_IDS.has(apiId)).toBe(true);
    expect(isHoldEligible(booking(apiId, [refundableRate(10)]))).toBe(true);
  });

  test("a supplier id sent as text still counts", () => {
    expect(isHoldEligible(booking("15", [refundableRate(10)]))).toBe(true);
    expect(isHoldEligible(booking("16", [refundableRate(10)]))).toBe(true);
  });

  test.each([
    ["RateHawk", 14],
    ["Jumeirah", 10],
    ["Juniper", 17],
    ["Atharva, which has its own picker", 3],
  ])("%s is not offered this hold", (_name, apiId) => {
    expect(isHoldEligible(booking(apiId, [refundableRate(10)]))).toBe(false);
  });

  test.each(SUPPLIERS)("%s is not offered the hold once the free window has passed", (_name, apiId) => {
    expect(isHoldEligible(booking(apiId, [refundableRate(-2)]))).toBe(false);
  });

  test.each(SUPPLIERS)("%s is not offered the hold when any room is non-refundable", (_name, apiId) => {
    const nonRefundable = { rate: 500, nonRefundable: true };
    expect(isHoldEligible(booking(apiId, [refundableRate(10), nonRefundable]))).toBe(false);
  });

  test("a rate with no free-cancellation date is not offered the hold", () => {
    expect(isHoldEligible(booking(15, [{ rate: 500, nonRefundable: false }]))).toBe(false);
  });
});

describe("Book and Pay Now picker on the supplier booking page", () => {
  const withStatus = (rate, roomStatus) => ({ ...rate, roomStatus });

  test.each([
    ["RateHawk", 14],
    ["Jumeirah", 10],
    ["Juniper", 17],
  ])("%s shows Book and Pay Now only, for an Available room", (_name, apiId) => {
    const data = booking(apiId, [withStatus(refundableRate(10), "Available")]);
    expect(showsBookingModePicker(data)).toBe(true);
    expect(offersHoldOption(data)).toBe(false);
  });

  test("a non-refundable Available room still shows Book and Pay Now", () => {
    const data = booking(14, [{ rate: 500, nonRefundable: true, roomStatus: "Available" }]);
    expect(showsBookingModePicker(data)).toBe(true);
    expect(offersHoldOption(data)).toBe(false);
  });

  test("a rate with no room status counts as Available", () => {
    expect(showsBookingModePicker(booking(14, [refundableRate(10)]))).toBe(true);
  });

  test("an On Request room shows no picker for a supplier without a hold", () => {
    const data = booking(14, [withStatus(refundableRate(10), "On Request")]);
    expect(showsBookingModePicker(data)).toBe(false);
  });

  test("one On Request room among several hides the picker", () => {
    const data = booking(14, [
      withStatus(refundableRate(10), "Available"),
      withStatus(refundableRate(10), "On Request"),
    ]);
    expect(showsBookingModePicker(data)).toBe(false);
  });

  test.each(SUPPLIERS)("%s still offers both options inside its free window", (_name, apiId) => {
    const data = booking(apiId, [refundableRate(10)]);
    expect(showsBookingModePicker(data)).toBe(true);
    expect(offersHoldOption(data)).toBe(true);
  });

  test("Atharva keeps its picker, without the hold on a non-refundable rate", () => {
    expect(offersHoldOption(booking(3, [refundableRate(10)]))).toBe(true);
    const nonRefundable = booking(3, [{ rate: 500, nonRefundable: true, roomStatus: "On Request" }]);
    expect(showsBookingModePicker(nonRefundable)).toBe(true);
    expect(offersHoldOption(nonRefundable)).toBe(false);
  });
});
