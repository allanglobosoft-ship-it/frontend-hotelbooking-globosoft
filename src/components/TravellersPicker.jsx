import React, { useRef, useState } from "react";
import { Overlay, Popover, Button, Form } from "react-bootstrap";
import { FaUsers, FaMinus, FaPlus, FaChevronDown } from "react-icons/fa";
import "../styles/TravellersPicker.css";

/**
 * One "Passengers" field in place of separate Adults / Children selects.
 * Clicking it opens a popover with − / + steppers for each count; a child's
 * age dropdown appears inside as soon as that child is added, so the ages
 * sit next to the count they belong to.
 *
 * Controlled — counts and ages stay in the parent's state and every change
 * goes straight out through the callbacks, so the parent's existing payload
 * building is untouched.
 *
 *   onChildAgeChange(index, value) — value is the <select>'s string value,
 *   same shape the old free-text age inputs produced.
 */

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function Counter({ label, hint, value, min, max, onChange }) {
  return (
    <div className="tp-row">
      <div>
        <div className="tp-row-label">{label}</div>
        {hint && <div className="tp-row-hint">{hint}</div>}
      </div>
      <div className="tp-stepper">
        <button
          type="button"
          className="tp-step-btn"
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          aria-label={`Remove one ${label.toLowerCase()}`}
        >
          <FaMinus />
        </button>
        <span className="tp-count" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          className="tp-step-btn"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          aria-label={`Add one ${label.toLowerCase()}`}
        >
          <FaPlus />
        </button>
      </div>
    </div>
  );
}

export default function TravellersPicker({
  adults,
  children,
  childAges = [],
  onAdultsChange,
  onChildrenChange,
  onChildAgeChange,
  minAdults = 1,
  maxAdults = 9,
  maxChildren = 5,
  maxChildAge = 17,
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  const summary =
    children > 0
      ? `${plural(adults, "Adult", "Adults")} · ${plural(children, "Child", "Children")}`
      : plural(adults, "Adult", "Adults");

  const ageOptions = Array.from({ length: maxChildAge + 1 }, (_, a) => a);

  // rootClose fires for any click outside the popover — including the
  // trigger itself, whose own onClick would then immediately re-open it.
  const handleHide = (e) => {
    if (e && triggerRef.current && triggerRef.current.contains(e.target)) return;
    setOpen(false);
  };

  return ( 
    <>
      <button
        type="button"
        ref={triggerRef}
        className="form-control tp-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <FaUsers className="tp-trigger-icon" />
        <span className="tp-trigger-text">{summary}</span>
        <FaChevronDown className="tp-trigger-caret" />
      </button>

      <Overlay
        target={triggerRef}
        show={open}
        placement="bottom-start"
        rootClose
        onHide={handleHide}
      >
        <Popover className="tp-popover">
          <Popover.Body>
            <Counter
              label="Adults"
              hint={`Ages ${maxChildAge + 1}+`}
              value={adults}
              min={minAdults}
              max={maxAdults}
              onChange={onAdultsChange}
            />
            <Counter
              label="Children"
              hint={`Ages 0–${maxChildAge}`}
              value={children}
              min={0}
              max={maxChildren}
              onChange={onChildrenChange}
            />

            {childAges.length > 0 && (
              <div className="tp-ages">
                {childAges.map((age, i) => (
                  <div className="tp-age-row" key={i}>
                    <label htmlFor={`tp-child-age-${i}`}>Child {i + 1} age</label>
                    <Form.Select
                      id={`tp-child-age-${i}`}
                      size="sm"
                      value={age}
                      onChange={(e) => onChildAgeChange(i, e.target.value)}
                    >
                      {ageOptions.map((a) => (
                        <option key={a} value={a}>
                          {a === 0 ? "Under 1" : plural(a, "yr", "yrs")}
                        </option>
                      ))}
                    </Form.Select>
                  </div>
                ))}
              </div>
            )}

            <div className="tp-footer">
              <Button size="sm" className="tp-done" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </Popover.Body>
        </Popover>
      </Overlay>
    </>
  );
}
