// Shared helper for logging agent search contexts to the admin
// "Unbooked Opportunities → Searches" tab. Fire-and-forget — never
// blocks the search itself.
//
// Every /new-booking flow that fires POST /api/hotel-search/search
// (regular Hotel search, Last Minute Booking, 24-Hour Check-in,
// Religious, Student, Senior Citizen — anything that reaches the
// search-fan-out endpoint) calls this so admins see what the agent
// is looking at even before they pick a specific hotel.
//
// Agent sessions only. The backend also enforces this from the JWT,
// so an admin/staff caller here is silently a no-op.

import axiosInstance from "../components/AxiosInstance";

function isAgentSession() {
  try {
    const stored = (localStorage.getItem("userRole") || "")
      .split(",")
      .map((r) => r.trim().toLowerCase());
    const role =
      (localStorage.getItem("currentActiveRole") || "").toLowerCase() ||
      stored[0] ||
      "";
    return role === "agent";
  } catch {
    return false;
  }
}

function buildRoomsGuestsLabel(rooms) {
  if (!Array.isArray(rooms) || rooms.length === 0) return null;
  const adults = rooms.reduce((acc, r) => acc + (Number(r?.adults) || 0), 0);
  const children = rooms.reduce((acc, r) => acc + (Number(r?.children) || 0), 0);
  return (
    `${rooms.length} Room${rooms.length > 1 ? "s" : ""} · ` +
    `${adults} Adult${adults !== 1 ? "s" : ""}` +
    (children ? ` · ${children} Child${children > 1 ? "ren" : ""}` : "")
  );
}

function computeNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  return Math.max(1, Math.round((b - a) / 86400000));
}

/**
 * Post a search-context snapshot. All fields optional except agentId
 * and destinationLabel (backend validates). Errors are swallowed so
 * the search never breaks.
 *
 * @param {object} ctx
 * @param {number|string} ctx.agentId
 * @param {string} [ctx.agentName]
 * @param {number} [ctx.destinationId]
 * @param {string} ctx.destinationLabel
 * @param {string} [ctx.nationalityLabel]
 * @param {string} [ctx.checkIn]  "YYYY-MM-DD"
 * @param {string} [ctx.checkOut] "YYYY-MM-DD"
 * @param {Array}  [ctx.rooms]    used to derive nights + rooms/guests label
 * @param {string} [ctx.source]   defaults to 'search-page'
 * @param {boolean} [ctx.force]   bypass the agent-role check (rarely needed)
 */
export function logAgentSearch(ctx) {
  try {
    if (!ctx) return;
    if (!ctx.force && !isAgentSession()) return;
    if (!ctx.agentId || !ctx.destinationLabel) return;

    axiosInstance
      .post("/api/search-history/search/save", {
        agentId: Number(ctx.agentId) || null,
        agentName: ctx.agentName || null,
        destinationId: Number(ctx.destinationId) || null,
        destinationLabel: ctx.destinationLabel,
        nationalityLabel: ctx.nationalityLabel || null,
        checkIn: ctx.checkIn || null,
        checkOut: ctx.checkOut || null,
        nights: computeNights(ctx.checkIn, ctx.checkOut),
        roomsGuests: buildRoomsGuestsLabel(ctx.rooms),
        source: ctx.source || "search-page",
      })
      .catch((err) =>
        console.warn("agent search log save failed (non-fatal):", err),
      );
  } catch (err) {
    console.warn("agent search log skipped:", err);
  }
}
