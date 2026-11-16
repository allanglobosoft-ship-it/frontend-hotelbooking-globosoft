import { getAuthToken } from "./authSession";
import { CLIENT_LOCATION_HEADER, getClientLocationHeader } from "./geoLocation";

/**
 * Room search that shows rooms while the suppliers are still answering.
 *
 * POST /api/hotel-rooms/search/stream answers with newline-delimited JSON:
 *   {"type":"start",   "masterHotelId", "masterHotelName", "roomMappingEnabled", "suppliers":[{apiType,apiId,supplierHotelCode}]}
 *   {"type":"supplier","status":{apiType,apiId,status,elapsedMs,roomCount,…}, "hotels":[…that supplier's blocks…]}
 *   {"type":"done",    "success", "message", "masterHotelId", "masterHotelName", "roomMappingEnabled", "supplierStatus":[…]}
 * One "supplier" line per supplier, sent as soon as that supplier answers, so
 * the first rooms show in a second or two instead of after the slowest one.
 *
 * Uses fetch (axios cannot read a response while it is still arriving), with
 * the same login and location headers axiosInstance sends. Throws an error
 * with `beforeData: true` when nothing arrived (expired login, older backend,
 * network) so the caller can fall back to the plain POST /search, which also
 * runs the silent token refresh.
 */
export async function streamRoomSearch(body, { onStart, onSupplier, signal } = {}) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/x-ndjson",
  };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const clientLocation = getClientLocationHeader();
  if (clientLocation) headers[CLIENT_LOCATION_HEADER] = clientLocation;

  let res;
  try {
    res = await fetch(`${process.env.REACT_APP_API_BASE_URL || ""}/api/hotel-rooms/search/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    e.beforeData = true;
    throw e;
  }
  if (!res.ok || !res.body) {
    const err = new Error(`Room search stream failed (${res.status})`);
    err.status = res.status;
    err.beforeData = true;
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawEvent = false;
  let done = null;

  const handle = (line) => {
    if (!line) return;
    const event = JSON.parse(line);
    sawEvent = true;
    if (event.type === "start") onStart?.(event);
    else if (event.type === "supplier") onSupplier?.(event);
    else if (event.type === "done") done = event;
  };

  try {
    for (;;) {
      const { value, done: ended } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        handle(buffer.slice(0, newline).trim());
        buffer = buffer.slice(newline + 1);
      }
      if (ended) break;
    }
    handle(buffer.trim());
  } catch (e) {
    e.beforeData = !sawEvent;
    throw e;
  }

  if (!done) {
    const err = new Error("Room search stream ended early");
    err.beforeData = !sawEvent;
    throw err;
  }
  return done;
}
