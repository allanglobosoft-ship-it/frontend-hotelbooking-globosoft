import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

import axiosInstance from "../components/AxiosInstance";
import { filterHotelResults } from "../utils/hotelResultFilters";
import useTwentyFourHourEligibility, {
  PROBE_BATCH,
  twentyFourHourProbeIds,
} from "./useTwentyFourHourEligibility";

jest.mock("../components/AxiosInstance", () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

const PROBE_URL = "/api/24-hour-checkin/probe-bulk";

/** A results-page row as mapHotelRow leaves it, for in-house hotel `id`. */
const hotel = (id, price = 100) => ({
  id: `search-IN${id}`,
  hotelCode: `IN${id}`,
  name: `Hotel ${id}`,
  price,
  displayPrice: price,
  displayFactor: 1,
});

/** The probe's reply for these eligible ids, all at `percentage`. */
const eligible = (ids, percentage = 10) => ({
  data: Object.fromEntries(
    ids.map((id) => [String(id), { eligible: true, percentage, configId: id }]),
  ),
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const probedIds = () => axiosInstance.post.mock.calls.map(([, body]) => body.hotelIds);

let latest;
const Probe = (props) => {
  latest = useTwentyFourHourEligibility(props);
  return null;
};

let root;
const draw = (props) => root.render(<Probe {...props} />);
const show = async (props) => {
  await act(async () => {
    draw(props);
  });
};

const SEARCH = { enabled: true, searchId: "s1", date: "2026-12-10", time: "14:00" };

beforeEach(() => {
  axiosInstance.post.mockReset();
  latest = undefined;
  root = createRoot(document.createElement("div"));
});

afterEach(() => {
  act(() => root.unmount());
});

describe("twentyFourHourProbeIds", () => {
  it("takes the digits at the end of hotelCode, once each, in order", () => {
    expect(
      twentyFourHourProbeIds([
        hotel(12),
        hotel(5),
        hotel(12),
        { hotelCode: "GRN" },
        { hotelCode: "IN0" },
        {},
        null,
      ]),
    ).toEqual([5, 12]);
    expect(twentyFourHourProbeIds(undefined)).toEqual([]);
  });
});

describe("useTwentyFourHourEligibility", () => {
  it("probes the hotels on screen for the search's date and time", async () => {
    axiosInstance.post.mockResolvedValueOnce(eligible([1]));
    await show({ ...SEARCH, hotels: [hotel(1), hotel(2)] });

    expect(axiosInstance.post).toHaveBeenCalledTimes(1);
    expect(axiosInstance.post).toHaveBeenCalledWith(PROBE_URL, {
      hotelIds: [1, 2],
      date: "2026-12-10",
      time: "14:00",
    });
    expect(latest).toEqual({
      1: { eligible: true, percentage: 10, configId: 1 },
    });
  });

  it("keeps page 2's eligible hotels: probes the new page and merges it in", async () => {
    const page1 = [hotel(1, 100), hotel(2, 100)];
    const page2 = [hotel(3, 200), hotel(4, 200)];
    axiosInstance.post
      .mockResolvedValueOnce(eligible([1]))
      .mockResolvedValueOnce(eligible([3], 25));

    await show({ ...SEARCH, hotels: page1 });
    await show({ ...SEARCH, hotels: page2 });

    // Only page 2's hotels were asked about the second time.
    expect(probedIds()).toEqual([[1, 2], [3, 4]]);
    // Page 1's answer is still there.
    expect(Object.keys(latest).sort()).toEqual(["1", "3"]);

    // What the list shows on page 2: the eligible hotel, at the uplifted price.
    const onScreen = filterHotelResults(
      page2,
      { twentyFourHour: true },
      { twentyFourHourMap: latest },
    );
    expect(onScreen.map((h) => h.hotelCode)).toEqual(["IN3"]);
    expect(onScreen[0].price).toBe(250);
    expect(onScreen[0].displayPrice).toBe(250);
    expect(onScreen[0]._twentyFourHourPercentage).toBe(25);

    // Back to page 1: already known, nothing asked.
    await show({ ...SEARCH, hotels: page1 });
    expect(axiosInstance.post).toHaveBeenCalledTimes(2);
    expect(
      filterHotelResults(page1, { twentyFourHour: true }, { twentyFourHourMap: latest })
        .map((h) => h.hotelCode),
    ).toEqual(["IN1"]);
  });

  it("asks only about hotels it has not asked about yet", async () => {
    axiosInstance.post
      .mockResolvedValueOnce(eligible([]))
      .mockResolvedValueOnce(eligible([3]));
    await show({ ...SEARCH, hotels: [hotel(1), hotel(2)] });
    // A sort or a supplier's reply brings hotel 3 in and moves the rest round.
    await show({ ...SEARCH, hotels: [hotel(3), hotel(2), hotel(1)] });

    expect(probedIds()).toEqual([[1, 2], [3]]);
    expect(Object.keys(latest)).toEqual(["3"]);
  });

  it("does not ask again while a probe for the same hotels is still on its way", async () => {
    const pending = deferred();
    axiosInstance.post.mockReturnValueOnce(pending.promise);
    await show({ ...SEARCH, hotels: [hotel(1)] });
    await show({ ...SEARCH, hotels: [hotel(1)].map((h) => ({ ...h })) });

    expect(axiosInstance.post).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(eligible([1])));
    expect(Object.keys(latest)).toEqual(["1"]);
  });

  it("starts empty for a new search and drops a late reply for the old one", async () => {
    const oldReply = deferred();
    axiosInstance.post
      .mockReturnValueOnce(oldReply.promise)
      .mockResolvedValueOnce(eligible([2]));

    await show({ ...SEARCH, hotels: [hotel(1)] });
    await show({ ...SEARCH, searchId: "s2", hotels: [hotel(1), hotel(2)] });

    // The new search asks about hotel 1 again: its answer may differ.
    expect(probedIds()).toEqual([[1], [1, 2]]);
    expect(Object.keys(latest)).toEqual(["2"]);

    await act(async () => oldReply.resolve(eligible([1])));
    expect(Object.keys(latest)).toEqual(["2"]);
  });

  it("asks again when the date or time changes", async () => {
    axiosInstance.post
      .mockResolvedValueOnce(eligible([1]))
      .mockResolvedValueOnce(eligible([]));
    await show({ ...SEARCH, hotels: [hotel(1)] });
    await show({ ...SEARCH, time: "22:00", hotels: [hotel(1)] });

    expect(axiosInstance.post).toHaveBeenLastCalledWith(PROBE_URL, {
      hotelIds: [1],
      date: "2026-12-10",
      time: "22:00",
    });
    expect(latest).toEqual({});
  });

  it("leaves a failed probe out and asks about those hotels the next time", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    axiosInstance.post
      .mockResolvedValueOnce(eligible([1]))
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockResolvedValueOnce(eligible([3]));

    await show({ ...SEARCH, hotels: [hotel(1)] });
    await show({ ...SEARCH, hotels: [hotel(3)] });
    expect(Object.keys(latest)).toEqual(["1"]);
    expect(warn).toHaveBeenCalled();

    await show({ ...SEARCH, hotels: [hotel(3), hotel(4)] });
    expect(probedIds()).toEqual([[1], [3], [3, 4]]);
    expect(Object.keys(latest).sort()).toEqual(["1", "3"]);
    warn.mockRestore();
  });

  it(`sends at most ${PROBE_BATCH} ids a request`, async () => {
    axiosInstance.post.mockResolvedValue(eligible([]));
    const many = Array.from({ length: 250 }, (_, i) => hotel(i + 1));
    await show({ ...SEARCH, hotels: many });

    expect(probedIds().map((ids) => ids.length)).toEqual([100, 100, 50]);
    expect(probedIds().flat()).toEqual(many.map((_, i) => i + 1));
  });

  it("asks nothing off the 24-hour search, before a search id, or without hotels", async () => {
    await show({ ...SEARCH, enabled: false, hotels: [hotel(1)] });
    await show({ ...SEARCH, searchId: null, hotels: [hotel(1)] });
    await show({ ...SEARCH, date: "", hotels: [hotel(1)] });
    await show({ ...SEARCH, hotels: [] });

    expect(axiosInstance.post).not.toHaveBeenCalled();
    expect(latest).toEqual({});
  });
});
