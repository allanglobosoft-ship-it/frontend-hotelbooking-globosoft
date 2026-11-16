/**
 * useTwentyFourHourEligibility
 * --------------------------------------------------------------------------
 * 24 Hour Check-In eligibility for the hotels on the results page, in the
 * shape POST /api/24-hour-checkin/probe-bulk replies with:
 *
 *   { "5": { eligible: true, percentage: 10, configId: 3 }, ... }
 *
 * The backend leaves ineligible hotels out of its reply, so a hotel missing
 * from the map is not eligible. filterHotelResults (utils/hotelResultFilters)
 * keeps only the eligible hotels and adds the percentage to their price.
 *
 * Whenever `hotels` holds ids not yet asked about for this search, date and
 * time (a new page, sort or filter, or more hotels while suppliers answer),
 * only those ids are probed and the reply is merged in. Hotels of pages seen
 * before keep their entry. A new search, date or time starts empty, and a
 * reply for an older one is dropped. A failed probe is non-fatal: its hotels
 * stay hidden and are asked about again the next time `hotels` changes.
 *
 *   enabled — true on the 24 Hour Check-In search
 *   searchId — the search the hotels belong to
 *   date, time — the check-in date ("2026-12-10") and time ("14:00") that
 *                search was made for
 *   hotels — the hotels the page would show if they were eligible
 */
import { useEffect, useRef, useState } from "react";
import axiosInstance from "../components/AxiosInstance";

/** Ids per probe request: the backend looks each one up on its own. */
export const PROBE_BATCH = 100;

const NONE = Object.freeze({});

/**
 * The ids the probe takes for these hotels: the digits at the end of hotelCode
 * ("IN5" → 5), the key filterHotelResults looks up. Unique and sorted.
 */
export function twentyFourHourProbeIds(hotels) {
  const ids = new Set();
  (Array.isArray(hotels) ? hotels : []).forEach((hotel) => {
    const m = String(hotel?.hotelCode || "").match(/(\d+)$/);
    const id = m ? Number(m[1]) : NaN;
    if (Number.isFinite(id) && id > 0) ids.add(id);
  });
  return Array.from(ids).sort((a, b) => a - b);
}

export default function useTwentyFourHourEligibility({
  enabled,
  searchId,
  date,
  time,
  hotels,
}) {
  const context =
    enabled && searchId && date && time ? `${searchId}|${date}|${time}` : "";
  const [found, setFound] = useState({ context: "", map: NONE });
  // The ids asked about, or being asked about, for `asked.current.context`.
  const asked = useRef({ context: "", ids: new Set() });
  const idsCsv = context ? twentyFourHourProbeIds(hotels).join(",") : "";

  useEffect(() => {
    if (!context || !idsCsv) return;
    if (asked.current.context !== context) {
      asked.current = { context, ids: new Set() };
    }
    const askedIds = asked.current.ids;
    const fresh = idsCsv
      .split(",")
      .map(Number)
      .filter((id) => !askedIds.has(id));
    fresh.forEach((id) => askedIds.add(id));

    for (let i = 0; i < fresh.length; i += PROBE_BATCH) {
      const batch = fresh.slice(i, i + PROBE_BATCH);
      axiosInstance
        .post("/api/24-hour-checkin/probe-bulk", {
          hotelIds: batch,
          date,
          time,
        })
        .then((res) => {
          if (asked.current.context !== context) return;
          const reply =
            res?.data && typeof res.data === "object" && !Array.isArray(res.data)
              ? res.data
              : {};
          setFound((prev) => ({
            context,
            map: { ...(prev.context === context ? prev.map : {}), ...reply },
          }));
        })
        .catch((err) => {
          console.warn("24-hour probe failed (non-fatal):", err?.message || err);
          if (asked.current.context !== context) return;
          batch.forEach((id) => asked.current.ids.delete(id));
        });
    }
    // date and time are part of `context`.
  }, [context, idsCsv, date, time]);

  return found.context === context && context ? found.map : NONE;
}
