import {
  featureLabelsOf,
  filterHotelResults,
  filtersKey,
  hotelNumericId,
  idBatches,
  needsWholeResultSet,
  resultsQueryParams,
} from "./hotelResultFilters";

// Cards as mapHotelRow makes them: an in-house hotel, two supplier hotels and
// one mapped hotel sold by three suppliers (one card at the best price).
const hotel = (over) => ({
  id: "s1-x",
  hotelCode: "IN1",
  name: "Hotel",
  price: 100,
  displayPrice: 100,
  displayFactor: 1,
  rating: 3,
  hotelType: "hotel",
  channelType: "inhouse",
  hasRefundable: null,
  hasPartial: null,
  hasNonRefundable: null,
  hasDestinationSales: false,
  ...over,
});

const inhouse = hotel({
  id: "s1-IN5",
  hotelCode: "IN5",
  name: "Smart Hyde Park Inn",
  price: 250,
  displayPrice: 250,
  rating: 4,
  hasRefundable: true,
});
const grn = hotel({
  id: "s1-GRN77",
  hotelCode: "77",
  name: "Marina Bay Suites",
  price: 410,
  displayPrice: 410,
  rating: 5,
  channelType: "grn",
  hasNonRefundable: true,
});
const goglobal = hotel({
  id: "s1-GG9",
  hotelCode: "GG9",
  name: "Desert Rose Hotel",
  price: 180,
  displayPrice: 180,
  rating: 3,
  channelType: "goglobal",
  hasPartial: true,
  hasDestinationSales: true,
});
const mapped = hotel({
  id: "s1-M12",
  hotelCode: "IN12",
  name: "Palm View Resort",
  price: 320,
  displayPrice: 320,
  rating: 4,
  supplierCount: 3,
  hasRefundable: true,
  hasNonRefundable: true,
});
const noPrice = hotel({
  id: "s1-IN30",
  hotelCode: "IN30",
  name: "Old Town Guest House",
  price: null,
  displayPrice: null,
  rating: 2,
});

const all = [inhouse, grn, goglobal, mapped, noPrice];
const ids = (list) => list.map((h) => h.id);

describe("filterHotelResults", () => {
  test("no filters keeps every hotel, cheapest first, unpriced last", () => {
    expect(ids(filterHotelResults(all, { sortBy: "priceAsc" }))).toEqual([
      "s1-GG9",
      "s1-IN5",
      "s1-M12",
      "s1-GRN77",
      "s1-IN30",
    ]);
  });

  test("High to Low reverses the prices and still puts unpriced last", () => {
    expect(ids(filterHotelResults(all, { sortBy: "priceDesc" }))).toEqual([
      "s1-GRN77",
      "s1-M12",
      "s1-IN5",
      "s1-GG9",
      "s1-IN30",
    ]);
  });

  test("other sort keys keep the server's order", () => {
    expect(ids(filterHotelResults(all, { sortBy: "ratingDesc" }))).toEqual(ids(all));
  });

  test("does not change the array it was given", () => {
    const input = [...all];
    filterHotelResults(input, { sortBy: "priceDesc" });
    expect(ids(input)).toEqual(ids(all));
  });

  test("hotel name matches every word, any case, in any order", () => {
    expect(ids(filterHotelResults(all, { nameQuery: "  smart   HYDE " }))).toEqual([
      "s1-IN5",
    ]);
    expect(ids(filterHotelResults(all, { nameQuery: "hotel rose" }))).toEqual([
      "s1-GG9",
    ]);
    expect(filterHotelResults(all, { nameQuery: "smart marina" })).toEqual([]);
    expect(filterHotelResults(all, { nameQuery: "   " })).toHaveLength(all.length);
  });

  test("star rating keeps that rating only", () => {
    expect(ids(filterHotelResults(all, { starRating: 4 }))).toEqual([
      "s1-IN5",
      "s1-M12",
    ]);
    expect(filterHotelResults(all, { starRating: null })).toHaveLength(all.length);
  });

  test("hotel type and channel keep the ticked values", () => {
    const villa = hotel({ id: "s1-V1", hotelType: "villa" });
    expect(ids(filterHotelResults([...all, villa], { hotelTypes: ["villa"] }))).toEqual([
      "s1-V1",
    ]);
    expect(
      ids(filterHotelResults(all, { channelTypes: ["grn", "goglobal"] })),
    ).toEqual(["s1-GRN77", "s1-GG9"]);
  });

  test("refund policy is strict: unknown (null) is hidden", () => {
    expect(ids(filterHotelResults(all, { refundPolicy: "refundable" }))).toEqual([
      "s1-IN5",
      "s1-M12",
    ]);
    expect(ids(filterHotelResults(all, { refundPolicy: "partial" }))).toEqual([
      "s1-GG9",
    ]);
    expect(ids(filterHotelResults(all, { refundPolicy: "nonRefundable" }))).toEqual([
      "s1-GRN77",
      "s1-M12",
    ]);
    expect(filterHotelResults(all, { refundPolicy: undefined })).toHaveLength(all.length);
  });

  test("budget is inclusive in AED, an open end has no limit, unpriced drop out", () => {
    expect(
      ids(filterHotelResults(all, { minPrice: 250, maxPrice: 320 })),
    ).toEqual(["s1-IN5", "s1-M12"]);
    expect(ids(filterHotelResults(all, { minPrice: 400 }))).toEqual(["s1-GRN77"]);
    expect(ids(filterHotelResults(all, { maxPrice: 180 }))).toEqual(["s1-GG9"]);
  });

  test("budget reads the AED price, not the display price", () => {
    const usd = hotel({ id: "s1-U", price: 367, displayPrice: 100, displayFactor: 0.2723 });
    expect(ids(filterHotelResults([usd], { maxPrice: 300 }))).toEqual([]);
    expect(ids(filterHotelResults([usd], { maxPrice: 400 }))).toEqual(["s1-U"]);
  });

  test("deals match any ticked deal from the feature flags", () => {
    const featureFlagsMap = {
      5: { features: ["Long Stay", "last minute"] },
      12: { features: ["Govt Employee"] },
    };
    const lookups = { featureFlagsMap };
    expect(ids(filterHotelResults(all, { deals: ["lastMinute"] }, lookups))).toEqual([
      "s1-IN5",
    ]);
    expect(ids(filterHotelResults(all, { deals: ["govEmployee"] }, lookups))).toEqual([
      "s1-M12",
    ]);
    expect(ids(filterHotelResults(all, { deals: ["flashSale"] }, lookups))).toEqual([
      "s1-IN5",
      "s1-M12",
    ]);
    expect(
      ids(filterHotelResults(all, { deals: ["destinationSales", "longStay"] }, lookups)),
    ).toEqual(["s1-IN5", "s1-GG9"]);
    expect(filterHotelResults(all, { deals: ["dayStay"] }, lookups)).toEqual([]);
  });

  test("24-hour search keeps eligible hotels at the uplifted price", () => {
    const usd = hotel({
      id: "s1-IN5",
      hotelCode: "IN5",
      price: 200,
      displayPrice: 54.46,
      displayFactor: 0.2723,
    });
    const flat = hotel({ id: "s1-IN6", hotelCode: "IN6", price: 90, displayPrice: 90 });
    const out = filterHotelResults(
      [usd, flat, hotel({ id: "s1-IN7", hotelCode: "IN7" })],
      { twentyFourHour: true },
      {
        twentyFourHourMap: {
          5: { eligible: true, percentage: 10 },
          6: { eligible: true, percentage: 0 },
          7: { eligible: false, percentage: 10 },
        },
      },
    );
    expect(ids(out)).toEqual(["s1-IN5", "s1-IN6"]);
    expect(out[0].price).toBe(220);
    expect(out[0].displayPrice).toBe(59.91);
    expect(out[0]._twentyFourHourPercentage).toBe(10);
    expect(out[1].price).toBe(90);
    expect(out[1].displayPrice).toBe(90);
  });

  test("24-hour search with no probe reply yet shows nothing", () => {
    expect(filterHotelResults(all, { twentyFourHour: true })).toEqual([]);
  });

  test("filters combine", () => {
    expect(
      ids(
        filterHotelResults(all, {
          refundPolicy: "refundable",
          starRating: 4,
          maxPrice: 300,
          sortBy: "priceAsc",
        }),
      ),
    ).toEqual(["s1-IN5"]);
  });
});

describe("hotelNumericId and featureLabelsOf", () => {
  test("hotelId wins, then the digits ending hotelCode, then id", () => {
    expect(hotelNumericId({ hotelId: 9, hotelCode: "IN5" })).toBe("9");
    expect(hotelNumericId({ hotelCode: "IN5" })).toBe("5");
    expect(hotelNumericId({ id: "s1-IN44" })).toBe("44");
    expect(hotelNumericId({ hotelCode: "ABC" })).toBeNull();
  });

  test("labels come from the flag map, [] when unknown", () => {
    expect(featureLabelsOf(inhouse, { 5: { features: ["Day Stay"] } })).toEqual([
      "Day Stay",
    ]);
    expect(featureLabelsOf(inhouse, {})).toEqual([]);
    expect(featureLabelsOf(inhouse, { 5: { features: "x" } })).toEqual([]);
  });
});

describe("resultsQueryParams", () => {
  test("sends the server-side filters the list has always sent", () => {
    expect(
      resultsQueryParams(
        {
          sortBy: "priceDesc",
          starRating: 4,
          channelTypes: ["grn", "inhouse"],
          refundPolicy: "partial",
          minPrice: 100,
          maxPrice: undefined,
          nameQuery: "ignored by the server",
          deals: ["lastMinute"],
        },
        { agentId: 7, page: 2, pageSize: 10, displayCurrencyCode: "USD" },
      ),
    ).toEqual({
      agentId: 7,
      page: 2,
      pageSize: 10,
      size: undefined,
      sortBy: "baseRate",
      sortOrder: "desc",
      starRating: 4,
      apiType: "GRN,INHOUSE",
      refundPolicy: "partial",
      minPrice: 100,
      maxPrice: undefined,
      displayCurrencyCode: "USD",
    });
  });

  test("Low to High is baseRate ascending; no channel and no currency are left out", () => {
    const params = resultsQueryParams({ sortBy: "priceAsc" }, { agentId: 1, size: 1000 });
    expect(params.sortBy).toBe("baseRate");
    expect(params.sortOrder).toBe("asc");
    expect(params.apiType).toBeUndefined();
    expect(params.starRating).toBeUndefined();
    expect(params.size).toBe(1000);
    expect("displayCurrencyCode" in params).toBe(false);
  });

  test("other sort keys pass through with their direction", () => {
    expect(resultsQueryParams({ sortBy: "nameAsc" }).sortOrder).toBe("asc");
    expect(resultsQueryParams({ sortBy: "ratingDesc" })).toMatchObject({
      sortBy: "ratingDesc",
      sortOrder: "desc",
    });
  });
});

describe("needsWholeResultSet", () => {
  test("a hotel name or any deal needs every page; server-side filters don't", () => {
    expect(needsWholeResultSet({ nameQuery: "palm" })).toBe(true);
    expect(needsWholeResultSet({ deals: ["lastMinute"] })).toBe(true);
    expect(needsWholeResultSet({ nameQuery: "  ", deals: [] })).toBe(false);
    expect(needsWholeResultSet({})).toBe(false);
    expect(needsWholeResultSet()).toBe(false);
  });

  test("a deal found only on a later page is listed once the whole set is loaded", () => {
    // Ten hotels per page; the only Last Minute hotel sorts onto page 2.
    const hotels = Array.from({ length: 12 }, (_, i) =>
      hotel({ id: `s1-IN${i + 1}`, hotelCode: `IN${i + 1}`, price: 100 + i, displayPrice: 100 + i }),
    );
    const lookups = { featureFlagsMap: { 12: { features: ["Last Minute"] } } };
    const filters = { deals: ["lastMinute"], sortBy: "priceAsc" };
    expect(filterHotelResults(hotels.slice(0, 10), filters, lookups)).toEqual([]);
    expect(ids(filterHotelResults(hotels, filters, lookups))).toEqual(["s1-IN12"]);
  });
});

describe("idBatches", () => {
  test("splits ids into comma lists of at most the given size", () => {
    expect(idBatches("1,2,3,4,5", 2)).toEqual(["1,2", "3,4", "5"]);
    expect(idBatches(["7", 8, " 9 "], 150)).toEqual(["7,8,9"]);
    expect(idBatches("", 150)).toEqual([]);
    expect(idBatches(null)).toEqual([]);
  });

  test("400 ids at the default size make three requests", () => {
    const batches = idBatches(Array.from({ length: 400 }, (_, i) => i + 1));
    expect(batches.map((b) => b.split(",").length)).toEqual([150, 150, 100]);
  });
});

describe("filtersKey", () => {
  test("ignores tick order and name case, changes with any filter", () => {
    const a = filtersKey({ channelTypes: ["grn", "inhouse"], nameQuery: "Palm " });
    const b = filtersKey({ channelTypes: ["inhouse", "grn"], nameQuery: "palm" });
    expect(a).toBe(b);
    expect(filtersKey({ refundPolicy: "partial" })).not.toBe(filtersKey({}));
    expect(filtersKey({ maxPrice: 300 })).not.toBe(filtersKey({ maxPrice: 400 }));
  });

  test("sort order is not a filter: the map keeps its view when it changes", () => {
    expect(filtersKey({ sortBy: "priceAsc" })).toBe(filtersKey({ sortBy: "priceDesc" }));
  });
});
