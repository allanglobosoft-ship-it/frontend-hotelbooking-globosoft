import React from "react";
import { FaCheck } from "react-icons/fa";

/**
 * Three-phase journey indicator shared by every page of the
 * Make Your Own Package V2 flow:
 *
 *   1. Trip details   → /new-booking/make-your-own-package-v2
 *   2. Build package  → /new-booking/make-your-own-package-v2/search
 *   3. Review & book  → /new-booking/make-your-own-package-v2/booking-page
 *
 * Purely presentational — it never navigates. Each page passes the
 * phase it represents so the operator always sees where they are,
 * what is already done and what comes next. Styles live in
 * src/styles/MakeYourOwnPackageV2.css under `.myop-v2-journey`.
 */
const JOURNEY_STEPS = [
  { key: "criteria", label: "Trip details" },
  { key: "build", label: "Build package" },
  { key: "review", label: "Review & book" },
];

export default function MyopV2JourneyStepper({ current = 1, className = "" }) {
  return (
    <nav
      className={`myop-v2-journey ${className}`.trim()}
      aria-label="Package booking progress"
    >
      {JOURNEY_STEPS.map((step, idx) => {
        const number = idx + 1;
        const done = number < current;
        const active = number === current;
        const stateClass = done ? "is-done" : active ? "is-active" : "";
        return (
          <React.Fragment key={step.key}>
            <div
              className={`myop-v2-journey__step ${stateClass}`.trim()}
              aria-current={active ? "step" : undefined}
            >
              <span className="myop-v2-journey__dot small">
                {done ? <FaCheck size={11} /> : number}
              </span>
              <span className="myop-v2-journey__label small">
                {step.label}
              </span>
            </div>
            {idx < JOURNEY_STEPS.length - 1 && (
              <span
                className={`myop-v2-journey__line ${done ? "is-done" : ""}`.trim()}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
