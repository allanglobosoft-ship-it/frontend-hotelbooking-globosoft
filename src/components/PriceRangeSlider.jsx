import React from "react";
import "../styles/PriceRangeSlider.css";

/**
 * Two-handle range slider — two native <input type="range"> stacked on one
 * track, so each handle keeps native keyboard / touch / screen-reader
 * behaviour with no slider library. Optionally draws a bar chart above the
 * track (e.g. hotels per price band), with bars inside the selected range
 * shaded darker.
 *
 *   value     [lo, hi] within [min, max]
 *   onChange  fires on every move with the new [lo, hi]; the handles can
 *             meet but never cross.
 *   histogram counts for equal-width bands spanning [min, max], left to right.
 *   format    turns a raw value into the label shown above the chart.
 */

// Half the thumb width (see PriceRangeSlider.css). A native thumb's centre
// travels from THUMB_HALF to (width − THUMB_HALF), so the track, the
// highlighted range and the chart are inset by it to line up with the thumbs.
const THUMB_HALF = 9;

const insetPct = (pct) => `calc(${THUMB_HALF}px + (100% - ${THUMB_HALF * 2}px) * ${pct / 100})`;

export default function PriceRangeSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  histogram = [],
  format = (n) => String(n),
  ariaLabel = "Price",
}) {
  const [lo, hi] = value;
  const span = max - min || 1;
  const loPct = ((lo - min) / span) * 100;
  const hiPct = ((hi - min) / span) * 100;
  const peak = Math.max(1, ...histogram);

  return (
    <div className="prs">
      <div className="prs-values">
        <span>{format(lo)}</span>
        <span>{format(hi)}</span>
      </div>

      {histogram.length > 0 && (
        // Decorative for screen readers — the handles' labels carry the
        // values; the per-bar title still shows a count on hover.
        <div className="prs-chart" aria-hidden="true">
          {histogram.map((count, i) => {
            const centre = min + ((i + 0.5) * span) / histogram.length;
            const inRange = centre >= lo && centre <= hi;
            return (
              <div
                key={i}
                className={`prs-bar${inRange ? " prs-bar-in" : ""}`}
                style={{
                  height: count > 0 ? `${Math.max(4, (count / peak) * 100)}%` : 0,
                }}
                title={`${count} hotel${count === 1 ? "" : "s"}`}
              />
            );
          })}
        </div>
      )}

      <div className="prs-track-wrap">
        <div className="prs-track" />
        <div
          className="prs-range"
          style={{ left: insetPct(loPct), width: `calc((100% - ${THUMB_HALF * 2}px) * ${(hiPct - loPct) / 100})` }}
        />
        <input
          type="range"
          className="prs-input"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
          aria-label={`Minimum ${ariaLabel.toLowerCase()}`}
          aria-valuetext={format(lo)}
          // When both handles sit at the max end, the lower one must be on
          // top or it could never be dragged back down.
          style={{ zIndex: lo >= max - step ? 4 : 3 }}
        />
        <input
          type="range"
          className="prs-input"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
          aria-label={`Maximum ${ariaLabel.toLowerCase()}`}
          aria-valuetext={format(hi)}
        />
      </div>
    </div>
  );
}
