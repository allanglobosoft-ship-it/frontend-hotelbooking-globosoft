/**
 * Plain functions behind the results map (HotelResultsMap.jsx), kept apart from
 * Leaflet so each can be tested on its own: which hotels can be placed, the
 * price each marker shows, how close markers are grouped, and where the map
 * zooms to.
 *
 * A map point carries only what the map shows: id, name, position, price text,
 * stars and photo. No supplier name or code, so nothing an agent must not see
 * can reach a marker, a card or the page's markup.
 */
import { stripSupplierSuffix } from "../../utils/supplierDisplay";

/** A number from a coordinate field, or NaN. Blank and missing are NaN too. */
function coord(value) {
  if (value == null || (typeof value === "string" && value.trim() === "")) {
    return NaN;
  }
  return Number(value);
}

/**
 * The hotel's position as [lat, lng], or null when it can't be placed: missing,
 * not a number, out of range, or 0,0 (what several suppliers send for "unknown").
 */
export function hotelPosition(hotel) {
  const lat = coord(hotel?.latitude);
  const lng = coord(hotel?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return [lat, lng];
}

/**
 * The price text the results list shows for a hotel, e.g. "AED 1,234.50", or
 * "Price on request" when it has no rate. The list and the map both use this.
 */
export function formatHotelPrice(hotel, fallbackCurrency = "AED") {
  if (!hotel?.price) return "Price on request";
  const amount = Number(
    hotel.displayPrice != null ? hotel.displayPrice : hotel.price,
  );
  return `${hotel.displayCurrencyCode || fallbackCurrency} ${amount.toLocaleString(
    undefined,
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  )}`;
}

/**
 * The photo URL, or null when it can never load. Several supplier search legs
 * send "https://details/…" to mean "no photo"; a dotless host never resolves.
 */
export function usableImageUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const { protocol, hostname } = new URL(url, base);
    if (protocol !== "http:" && protocol !== "https:") return null;
    if (hostname !== "localhost" && !hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Map points for the filtered hotels, and how many of them have no usable
 * position. A hotel appears once: should the same card id come twice, the
 * cheaper one stays (mapped hotels are already one card at the best price).
 *
 * hideSupplierSuffix strips a " (GRN)"-style suffix from names, for logins that
 * may not see supplier names.
 */
export function toMapPoints(
  hotels,
  { fallbackCurrency = "AED", hideSupplierSuffix = false } = {},
) {
  const byId = new Map();
  let missing = 0;
  for (const hotel of Array.isArray(hotels) ? hotels : []) {
    if (!hotel || hotel.id == null) continue;
    const position = hotelPosition(hotel);
    if (!position) {
      missing += 1;
      continue;
    }
    const price = Number(hotel.price);
    const point = {
      id: hotel.id,
      name: hideSupplierSuffix
        ? stripSupplierSuffix(hotel.name || "")
        : hotel.name || "",
      lat: position[0],
      lng: position[1],
      price: hotel.price && Number.isFinite(price) ? price : null,
      priceText: formatHotelPrice(hotel, fallbackCurrency),
      rating: Number(hotel.rating) > 0 ? Math.min(5, Math.round(hotel.rating)) : 0,
      image: usableImageUrl(hotel.image),
    };
    const seen = byId.get(point.id);
    if (!seen || cheaper(point, seen)) byId.set(point.id, point);
  }
  return { points: Array.from(byId.values()), missing };
}

function cheaper(a, b) {
  if (a.price == null) return false;
  if (b.price == null) return true;
  return a.price < b.price;
}

/**
 * Groups points whose markers would overlap on screen at the current zoom.
 *
 * project(point) gives the point's pixel position ({x, y}) at that zoom. Points
 * within cellW × cellH pixels of a group's first point join that group. Cheapest
 * points go first, so the price a lone marker shows is never hidden behind a
 * dearer neighbour. Returns groups of { key, points, lat, lng, minPrice }, where
 * lat/lng is the first point's position: no two first points are within one
 * cell of each other, so markers drawn there never overlap. A grid index keeps
 * it fast for thousands.
 */
export function clusterPoints(points, project, { cellW = 96, cellH = 44 } = {}) {
  const list = [...(points || [])].sort((a, b) => {
    if (a.price == null && b.price == null) return 0;
    if (a.price == null) return 1;
    if (b.price == null) return -1;
    return a.price - b.price;
  });
  const projected = list.map((p) => ({ p, xy: project(p) }));
  const grid = new Map();
  const cellOf = (xy) => [Math.floor(xy.x / cellW), Math.floor(xy.y / cellH)];
  projected.forEach((item, index) => {
    const [cx, cy] = cellOf(item.xy);
    const k = `${cx}:${cy}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(index);
  });

  const taken = new Array(projected.length).fill(false);
  const groups = [];
  projected.forEach((seed, index) => {
    if (taken[index]) return;
    taken[index] = true;
    const members = [seed.p];
    const [cx, cy] = cellOf(seed.xy);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const other of grid.get(`${cx + dx}:${cy + dy}`) || []) {
          if (taken[other]) continue;
          const o = projected[other].xy;
          if (
            Math.abs(o.x - seed.xy.x) < cellW &&
            Math.abs(o.y - seed.xy.y) < cellH
          ) {
            taken[other] = true;
            members.push(projected[other].p);
          }
        }
      }
    }
    const prices = members.map((m) => m.price).filter((v) => v != null);
    groups.push({
      key: members.length === 1 ? `h:${seed.p.id}` : `c:${seed.p.id}:${members.length}`,
      points: members,
      lat: seed.p.lat,
      lng: seed.p.lng,
      minPrice: prices.length > 0 ? Math.min(...prices) : null,
    });
  });
  return groups;
}

/** [[south, west], [north, east]] around the points, or null for none. */
export function boundsOf(points) {
  if (!points || points.length === 0) return null;
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const p of points) {
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
  }
  return [
    [south, west],
    [north, east],
  ];
}

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Where to zoom so the results fill the map. One supplier's wrong coordinates
 * (a hotel placed in another country) would otherwise zoom the whole city out
 * to a continent, so with ten or more hotels, points far outside the middle
 * 90% are left out of the fit. They stay on the map; "Show all" reaches them.
 */
export function fitBoundsFor(points) {
  if (!points || points.length < 10) return boundsOf(points);
  const lats = points.map((p) => p.lat).sort((a, b) => a - b);
  const lngs = points.map((p) => p.lng).sort((a, b) => a - b);
  const lat5 = quantile(lats, 0.05);
  const lat95 = quantile(lats, 0.95);
  const lng5 = quantile(lngs, 0.05);
  const lng95 = quantile(lngs, 0.95);
  // A margin of the middle span itself, never under ~2 km, so a tight city
  // centre doesn't cut off its own suburbs.
  const latPad = Math.max((lat95 - lat5) * 0.5, 0.02);
  const lngPad = Math.max((lng95 - lng5) * 0.5, 0.02);
  const core = points.filter(
    (p) =>
      p.lat >= lat5 - latPad &&
      p.lat <= lat95 + latPad &&
      p.lng >= lng5 - lngPad &&
      p.lng <= lng95 + lngPad,
  );
  return boundsOf(core.length > 0 ? core : points);
}

/** Text safe to place inside Leaflet's divIcon HTML. */
export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
