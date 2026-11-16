import React from "react";
import "../styles/GloboFooterMarks.css";

/**
 * A Globosoft lockup for one end of a footer.
 *
 * Two colourways exist because neither asset works on both grounds, and
 * getting this wrong makes a logo silently invisible rather than merely ugly:
 *
 *   tone="light"  light band. `g-white-logo.png` is white ink on transparent,
 *                 so it rides a dark chip; the right-hand wordmark uses the
 *                 red cut, which reads well on white.
 *   tone="brand"  the orange brand band. Both marks use their white cuts and
 *                 need no chip — the red wordmark on orange is nearly
 *                 unreadable, and a dark chip would fight the band.
 *
 * `label` puts a word or two in front of the mark ("Powered by"). It inherits
 * the footer's colour so it stays legible on either ground; size comes from
 * `--gfm-label-size`, defaulting to the surrounding text.
 *
 * The mark's own size comes from `--gfm-h`, set by whichever footer is hosting
 * it, so each bar can scale the pair to its own height without this component
 * knowing anything about the layout around it.
 */
export default function GloboFooterMarks({ side, tone = "light", label }) {
  const left = side === "left";

  // The left slot is always the "G." lockup; only the right slot swaps artwork.
  const src = left
    ? "g-white-logo.png"
    : tone === "brand"
    ? "globo-white-logo.png"
    : "globo-red-logo-with-text.png";

  // The chip is only ever needed for white artwork on a light band.
  const chip = left && tone !== "brand";

  const mark = (
    <img
      src={`${process.env.PUBLIC_URL}/images/${src}`}
      alt={left ? "Globosoft — delivering with heart since 2010" : "Globosoft"}
    />
  );

  return (
    <span className="gfm">
      {label && <span className="gfm-label">{label}</span>}
      {chip ? <span className="gfm-chip">{mark}</span> : mark}
    </span>
  );
}
