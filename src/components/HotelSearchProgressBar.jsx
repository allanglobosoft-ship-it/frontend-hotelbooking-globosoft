import React, { useEffect, useState } from "react";

import {
  progressMessage,
  progressPercent,
} from "../utils/hotelSearchResults";

/**
 * How long the full bar stays up once the search has finished, so the last
 * movement is seen before it goes away.
 */
export const FINISHED_LINGER_MS = 900;

/**
 * "Searching hotels" bar on the results page. Shows real progress: how many
 * suppliers have answered and how many hotels have been found so far. It goes
 * away once the search has finished.
 *
 * It only ever prints what `progressMessage` builds from counts, so an agent can
 * never see a supplier name here. Names of suppliers that failed are shown
 * separately, and only an admin's reply carries them.
 */
export default function HotelSearchProgressBar({ pollStatus, progress, hotelsSoFar, isLoading }) {
  const [lingering, setLingering] = useState(false);
  const searching = pollStatus === "IN_PROGRESS" || (!!isLoading && pollStatus === "IDLE");

  useEffect(() => {
    if (searching) {
      setLingering(true);
      return undefined;
    }
    if (pollStatus !== "COMPLETED") {
      setLingering(false);
      return undefined;
    }
    const timer = setTimeout(() => setLingering(false), FINISHED_LINGER_MS);
    return () => clearTimeout(timer);
  }, [searching, pollStatus]);

  if (!searching && !lingering) return null;

  const percent = searching ? progressPercent(progress) : 100;

  return (
    <div
      className="search-progress-bar-wrap"
      role="status"
      aria-live="polite"
      data-testid="hotel-search-progress"
    >
      {/* The pulsing dot and animated "…" give a live "actively searching" cue. */}
      <div className="d-flex justify-content-between align-items-center mb-2">
        <span className="search-progress-label">
          <span className="search-progress-dot" aria-hidden="true" />
          Searching hotels
          <span className="search-progress-ellipsis" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </span>
        <span className="search-progress-percent">{percent}%</span>
      </div>

      <div className="search-progress-track">
        {/* A sliver while nothing has answered yet, so the bar visibly exists. */}
        <div
          className="search-progress-fill"
          style={{ width: `${Math.max(percent, 4)}%` }}
        />
      </div>

      <div className="small text-muted mt-2" data-testid="hotel-search-progress-text">
        {progressMessage(progress, hotelsSoFar)}
      </div>
    </div>
  );
}
