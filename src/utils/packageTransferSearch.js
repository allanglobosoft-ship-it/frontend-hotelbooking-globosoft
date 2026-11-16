import axiosInstance from "../components/AxiosInstance";

/**
 * Supplier (iWay) transfers for the Build Your Own Package v2 Transfer step.
 *
 * The step's own list comes from /api/makeYourOwnPackageV2/getTransferInhouse
 * (the in-house cab rates of each city) and stays as it is. This adds the
 * transfer suppliers through the same search /new-booking/cab runs:
 * POST /api/cab-search/search, then GET /api/cab-search/results/{searchId}.
 * That search prices a ROUTE, so it needs a pickup and a drop-off it can
 * place: i'way can only price locations from its own feed (the "IWAY
 * LOCATIONS" group, from /api/cab-search/lookup) or in-house places mapped
 * to one in Transfer Location Mapping. Which suppliers are asked is decided by
 * the backend (agent exclusions, company allow-list, admin toggle), and each
 * supplier row already carries the agent's markup.
 *
 * Only the supplier rows (external = true) are kept: the search's in-house
 * leg prices cab-provider zones, a different inventory from this step's list.
 */

/** Channel rows of the Transfer step's Channel filter — same rows as /new-booking/cab. */
export const TRANSFER_CHANNELS = [
  { value: "inhouse", label: "Inhouse" },
  { value: "iway", label: "IWay" },
];

/** Channel a transfer row on this page comes from. */
export const transferChannelOf = (cab) =>
  String(cab?.channel || cab?.channelType || "inhouse").toLowerCase();

const placeholderImage = "https://via.placeholder.com/400x225?text=Transfer";

function ensureTransferImage(imageUrl) {
  if (!imageUrl) return placeholderImage;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (typeof imageUrl === "string") {
    const fileName = imageUrl.split(/[/\\]/).pop();
    if (fileName) return `https://b2b.choosenfly.com/assets/details/profilepic/hotel/${fileName}`;
  }
  return placeholderImage;
}

/** A supplier location from /api/cab-search/lookup as a pickup / drop-off option. */
export function toSupplierLocationOption(item) {
  return {
    value: `${item.source}:${item.externalId}`,
    label: item.name,
    subtitle: item.subtitle || "",
    raw: item,
  };
}

/**
 * Supplier locations matching what the operator typed (the `external` group of
 * /api/cab-search/lookup, the same feed the /new-booking/cab dropdown shows).
 * Fewer than two characters, or any error, gives an empty list.
 */
export async function fetchSupplierLocations(term, agentId) {
  if (!term || term.trim().length < 2) return [];
  try {
    const params = new URLSearchParams({ search: term.trim(), limit: "20" });
    if (agentId) params.set("agentId", String(agentId));
    params.set("applyLocationMapping", "true");
    const res = await axiosInstance.get(`/api/cab-search/lookup?${params.toString()}`);
    const external = Array.isArray(res?.data?.external) ? res.data.external : [];
    return external.filter((r) => !!r?.externalId).map(toSupplierLocationOption);
  } catch (err) {
    console.warn("Package transfers: supplier location lookup failed.", err?.message || err);
    return [];
  }
}

/** A picked pickup / drop-off (its `raw` lookup row) in the search's location shape. */
function toTransferLocation(raw) {
  if (!raw) return null;
  return {
    source: raw.source || null,
    id: raw.id ?? null,
    externalId: raw.externalId ?? null,
    name: raw.name || raw.label || null,
    subtitle: raw.subtitle || null,
    code: raw.code || null,
    lat: raw.lat ?? null,
    lng: raw.lng ?? null,
  };
}

/**
 * A supplier row from /api/cab-search/results as a row of this step's list,
 * in the shape its cards and "Add to cart" already read.
 */
export function toPackageTransferRow(r, city, index) {
  const details = Array.isArray(r?.searchCabDetailsDTO) ? r.searchCabDetailsDTO : [];
  return {
    cabid: r.cabid || `supplier-cab-${index}`,
    cabname: r.cabname || "Transfer Vehicle",
    cabdetails: r.cabdetails || "",
    cabpic: ensureTransferImage(r.cabpic),
    noOfCabs: r.noOfCabs || 1,
    cityId: city?.id ?? "",
    cityName: city?.label || "",
    // Supplier routing, carried onto the cart line. Logins that may not see
    // suppliers get no channelType, so their rows read "external".
    channel: String(r.channelType || "external").toLowerCase(),
    external: true,
    offerId: r.offerId ?? null,
    offerUid: r.offerUid ?? null,
    flexibleTariff: r.flexibleTariff != null ? Boolean(r.flexibleTariff) : null,
    allowableTime: r.allowableTime != null ? Number(r.allowableTime) : null,
    capacityMax: r.capacityMax ?? null,
    searchCabDetailsDTO: details.map((d) => ({
      types: d.types || "Private",
      location: d.location || r.originLocationName || "",
      dropOff: d.dropOff || r.destinationLocationName || "",
      sicRate: d.sicRate ?? null,
      privateRate: d.privateRate ?? d.totalRateWithoutMarkup ?? null,
      // With the agent's markup (applied by the supplier's search caller)…
      totalRate: d.totalRate != null ? Number(d.totalRate) : null,
      // …and without it, under the key this page's cards and cart read.
      totalRateWithoutMrk:
        d.totalRateWithoutMrk != null
          ? Number(d.totalRateWithoutMrk)
          : d.totalRateWithoutMarkup != null
            ? Number(d.totalRateWithoutMarkup)
            : null,
      travelType: "1",
      dropDetails: "1",
      paxDetails: String(r.capacityMax || 1),
      hourDetails: "0",
      locationId: "",
      luggage: "true",
    })),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Search the transfer suppliers for one route and city.
 *
 * @returns {Promise<{rows: Array, suppliers: string[]}>} supplier rows in this
 *   page's row shape, and the supplier codes the backend dispatched (only for
 *   logins that may see suppliers). Never throws; a failure gives no rows.
 */
export async function searchSupplierTransfers({
  pickup,
  dropoff,
  date,
  adults,
  children,
  childAges,
  agentId,
  city,
  isCancelled = () => false,
  timeoutMs = 210000,
}) {
  const origin = toTransferLocation(pickup?.raw);
  const destination = toTransferLocation(dropoff?.raw);
  if (!origin || !destination) return { rows: [], suppliers: [] };
  try {
    const init = await axiosInstance.post("/api/cab-search/search", {
      origin,
      destination,
      currency: null,
      originSource: origin.source,
      originLocationId: origin.id,
      originLocationName: origin.name,
      destinationSource: destination.source,
      destinationLocationId: destination.id,
      destinationLocationName: destination.name,
      tripType: "ONE_WAY",
      timeType: "FLIGHT_TIME",
      departureDate: date || null,
      departureTime: null,
      dropoffTime: null,
      returnDate: null,
      returnTime: null,
      adults: adults || 1,
      children: children || 0,
      childAges: Array.isArray(childAges) ? childAges.map((a) => parseInt(a, 10) || 0) : [],
      agentId: agentId ? Number(agentId) : null,
    });
    const searchId = init?.data?.searchId;
    const suppliers = Array.isArray(init?.data?.suppliers)
      ? init.data.suppliers.map((s) => String(s).toLowerCase())
      : [];
    if (!searchId) return { rows: [], suppliers };

    const startedAt = Date.now();
    let rows = [];
    await sleep(800);
    while (!isCancelled()) {
      try {
        const res = await axiosInstance.get(
          `/api/cab-search/results/${encodeURIComponent(searchId)}`,
          { params: { page: 0, size: 100 } },
        );
        const list = Array.isArray(res?.data?.result) ? res.data.result : [];
        rows = list
          .filter((r) => r && r.external === true)
          .map((r, i) => toPackageTransferRow(r, city, i));
        if (res?.data?.finalStatus === "COMPLETED") break;
      } catch (err) {
        console.warn("Package transfers: results poll failed; will retry.", err?.message || err);
      }
      if (Date.now() - startedAt >= timeoutMs) break;
      await sleep(2000);
    }
    return { rows, suppliers };
  } catch (err) {
    console.warn("Package transfers: supplier search failed.", err?.message || err);
    return { rows: [], suppliers: [] };
  }
}
