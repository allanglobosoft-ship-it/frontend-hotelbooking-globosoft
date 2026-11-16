import {
  boundsOf,
  clusterPoints,
  escapeHtml,
  fitBoundsFor,
  formatHotelPrice,
  hotelPosition,
  toMapPoints,
  usableImageUrl,
} from "./hotelMapData";
import { filterHotelResults } from "../../utils/hotelResultFilters";

const card = (over) => ({
  id: "s1-IN5",
  hotelCode: "IN5",
  name: "Smart Hyde Park Inn",
  price: 250,
  displayPrice: 250,
  displayCurrencyCode: "AED",
  rating: 4,
  image: "https://img.example.com/5.jpg",
  latitude: "25.2048",
  longitude: "55.2708",
  channelType: "grn",
  apiId: 20,
  supplierCount: 1,
  ...over,
});

describe("hotelPosition", () => {
  test("reads numbers and numeric strings", () => {
    expect(hotelPosition(card())).toEqual([25.2048, 55.2708]);
    expect(hotelPosition(card({ latitude: -33.9, longitude: 151.2 }))).toEqual([-33.9, 151.2]);
  });

  test.each([
    ["missing", undefined, undefined],
    ["null", null, null],
    ["blank", "", " "],
    ["not a number", "abc", "55"],
    ["0,0", "0", "0"],
    ["latitude out of range", "91", "55"],
    ["longitude out of range", "25", "-181"],
  ])("%s cannot be placed", (_, latitude, longitude) => {
    expect(hotelPosition(card({ latitude, longitude }))).toBeNull();
  });

  test("0 on one axis alone is a real place", () => {
    expect(hotelPosition(card({ latitude: "0", longitude: "32.5" }))).toEqual([0, 32.5]);
  });
});

describe("formatHotelPrice", () => {
  test("is the list's text: display price and currency, two decimals", () => {
    expect(
      formatHotelPrice(card({ price: 1234.5, displayPrice: 336.15, displayCurrencyCode: "USD" })),
    ).toBe(`USD ${(336.15).toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
    expect(formatHotelPrice(card({ displayPrice: null, price: 99 }))).toBe(
      `AED ${(99).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    );
  });

  test("falls back to the page currency, and to 'Price on request' with no rate", () => {
    expect(formatHotelPrice(card({ displayCurrencyCode: "" }), "EUR")).toMatch(/^EUR /);
    expect(formatHotelPrice(card({ price: null }))).toBe("Price on request");
    expect(formatHotelPrice(card({ price: 0 }))).toBe("Price on request");
  });
});

describe("usableImageUrl", () => {
  test("keeps real photo URLs, drops ones that can never load", () => {
    expect(usableImageUrl("https://img.example.com/a.jpg")).toBe("https://img.example.com/a.jpg");
    expect(usableImageUrl("https://details/assets/details/profilepic/hotel/hoteldefault.jpg")).toBeNull();
    expect(usableImageUrl("data:image/svg+xml,<svg/>")).toBeNull();
    expect(usableImageUrl("ftp://img.example.com/a.jpg")).toBeNull();
    expect(usableImageUrl("")).toBeNull();
    expect(usableImageUrl(null)).toBeNull();
  });
});

describe("toMapPoints", () => {
  test("keeps only what the map shows: no supplier name, code or route", () => {
    const { points, missing } = toMapPoints([card()]);
    expect(missing).toBe(0);
    expect(Object.keys(points[0]).sort()).toEqual(
      ["id", "image", "lat", "lng", "name", "price", "priceText", "rating"].sort(),
    );
    expect(JSON.stringify(points)).not.toMatch(/grn/i);
  });

  test("counts the hotels it cannot place", () => {
    const { points, missing } = toMapPoints([
      card({ id: "a" }),
      card({ id: "b", latitude: null }),
      card({ id: "c", latitude: "0", longitude: "0" }),
    ]);
    expect(points.map((p) => p.id)).toEqual(["a"]);
    expect(missing).toBe(2);
  });

  test("a card id seen twice shows once, at the cheaper price", () => {
    const { points } = toMapPoints([
      card({ id: "m", price: 320, displayPrice: 320 }),
      card({ id: "m", price: 290, displayPrice: 290 }),
      card({ id: "m", price: null }),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0].price).toBe(290);
  });

  test("strips a supplier suffix from names when asked (agent logins)", () => {
    const named = card({ name: "Palm View Resort (GRN)" });
    expect(toMapPoints([named], { hideSupplierSuffix: true }).points[0].name).toBe(
      "Palm View Resort",
    );
    expect(toMapPoints([named]).points[0].name).toBe("Palm View Resort (GRN)");
  });

  test("stars are whole numbers 0–5, and a dead photo URL becomes null", () => {
    const { points } = toMapPoints([
      card({ id: "a", rating: 4.6, image: "https://details/x.jpg" }),
      card({ id: "b", rating: 0 }),
      card({ id: "c", rating: 9 }),
    ]);
    expect(points.map((p) => p.rating)).toEqual([5, 0, 5]);
    expect(points[0].image).toBeNull();
  });

  test("the map shows exactly the hotels the list's filters let through", () => {
    const hotels = [
      card({ id: "in", channelType: "inhouse", hasRefundable: true, price: 200, displayPrice: 200 }),
      card({ id: "sup", channelType: "grn", hasRefundable: false, price: 150, displayPrice: 150 }),
      card({
        id: "mapped",
        channelType: "goglobal",
        supplierCount: 3,
        hasRefundable: true,
        price: 410,
        displayPrice: 410,
      }),
      card({ id: "far", hasRefundable: true, latitude: "", price: 90, displayPrice: 90 }),
    ];
    const filters = { refundPolicy: "refundable", sortBy: "priceAsc" };
    const listed = filterHotelResults(hotels, filters);
    expect(listed.map((h) => h.id)).toEqual(["far", "in", "mapped"]);
    const { points, missing } = toMapPoints(listed);
    expect(points.map((p) => p.id)).toEqual(["in", "mapped"]);
    expect(missing).toBe(1);
    expect(points[1].priceText).toBe(formatHotelPrice(listed[2]));
  });
});

describe("clusterPoints", () => {
  // Pixel position = degrees × 1000, so 0.05° apart is 50 px.
  const project = (p) => ({ x: p.lng * 1000, y: -p.lat * 1000 });
  const pt = (id, lat, lng, price) => ({ id, lat, lng, price });

  test("markers that would overlap form one group; distant ones stay alone", () => {
    const groups = clusterPoints(
      [pt("a", 25, 55, 300), pt("b", 25.01, 55.05, 200), pt("c", 25, 56, 100)],
      project,
      { cellW: 96, cellH: 40 },
    );
    expect(groups).toHaveLength(2);
    const pair = groups.find((g) => g.points.length === 2);
    expect(pair.points.map((p) => p.id).sort()).toEqual(["a", "b"]);
    expect(pair.minPrice).toBe(200);
    // Drawn where its cheapest hotel is.
    expect([pair.lat, pair.lng]).toEqual([25.01, 55.05]);
    expect(groups.find((g) => g.points.length === 1).key).toBe("h:c");
  });

  test("the cheapest hotel seeds its group", () => {
    const groups = clusterPoints([pt("dear", 25, 55, 900), pt("cheap", 25, 55.01, 100)], project);
    expect(groups[0].points[0].id).toBe("cheap");
  });

  test("every point lands in exactly one group, fast, for a few hundred hotels", () => {
    const points = Array.from({ length: 600 }, (_, i) =>
      pt(`h${i}`, 25 + ((i * 37) % 100) / 1000, 55 + ((i * 53) % 100) / 1000, i % 7 ? i : null),
    );
    const started = Date.now();
    const groups = clusterPoints(points, project);
    expect(Date.now() - started).toBeLessThan(250);
    const seen = groups.flatMap((g) => g.points.map((p) => p.id));
    expect(seen).toHaveLength(600);
    expect(new Set(seen).size).toBe(600);
    expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
  });

  test("no two markers are drawn within one cell of each other", () => {
    const points = Array.from({ length: 400 }, (_, i) =>
      pt(`h${i}`, 25 + ((i * 37) % 400) / 1000, 55 + ((i * 53) % 400) / 1000, i),
    );
    const groups = clusterPoints(points, project, { cellW: 96, cellH: 44 });
    const xy = groups.map((g) => project(g));
    for (let a = 0; a < xy.length; a += 1) {
      for (let b = a + 1; b < xy.length; b += 1) {
        const apart =
          Math.abs(xy[a].x - xy[b].x) >= 96 || Math.abs(xy[a].y - xy[b].y) >= 44;
        expect(apart).toBe(true);
      }
    }
  });
});

describe("boundsOf and fitBoundsFor", () => {
  const city = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    lat: 25.1 + (i % 6) * 0.02,
    lng: 55.1 + Math.floor(i / 6) * 0.03,
  }));

  test("bounds wrap every point; none for no points", () => {
    expect(boundsOf([{ lat: 1, lng: 2 }, { lat: -3, lng: 4 }])).toEqual([
      [-3, 2],
      [1, 4],
    ]);
    expect(boundsOf([])).toBeNull();
  });

  test("one hotel with wrong coordinates does not zoom a city out to a continent", () => {
    const withStray = [...city, { id: "stray", lat: 51.5, lng: -0.12 }];
    const [[south, west], [north, east]] = fitBoundsFor(withStray);
    expect(south).toBeGreaterThan(25);
    expect(north).toBeLessThan(25.3);
    expect(west).toBeGreaterThan(55);
    expect(east).toBeLessThan(55.3);
  });

  test("a spread-out result set keeps all of its hotels", () => {
    expect(fitBoundsFor(city)).toEqual(boundsOf(city));
  });

  test("few hotels always fit them all", () => {
    const few = [{ lat: 25, lng: 55 }, { lat: 51.5, lng: -0.12 }];
    expect(fitBoundsFor(few)).toEqual(boundsOf(few));
  });
});

describe("escapeHtml", () => {
  test("supplier text cannot become markup in a marker", () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;",
    );
    expect(escapeHtml(null)).toBe("");
  });
});
