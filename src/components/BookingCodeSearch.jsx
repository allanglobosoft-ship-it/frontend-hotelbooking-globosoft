import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Search, SearchX, X } from "lucide-react";
import toast from "react-hot-toast";
import axiosInstance from "./AxiosInstance";
import { formatDateOnly } from "../utils/dateUtils";
import "./BookingCodeSearch.css";

// Booking-code quick search pinned above the sidebar menu. Looks a code up
// across the booking types listed on Booking List → All Bookings via
// GET /api/unified-bookings/search (agent-scoped on the backend) and opens
// the booking's existing detail page. Suggestions appear while typing;
// Enter opens the highlighted suggestion, or — when Enter beats the
// suggestions — the booking whose code was typed in full.

const MIN_SUGGEST_CHARS = 2;
const DEBOUNCE_MS = 250;
const RESULT_LIMIT = 8;

// Booking codes never contain whitespace (the backend strips it too), so a
// code pasted from an email with stray spaces still matches.
const normalizeCode = (value) => String(value || "").replace(/\s+/g, "");

// Status label + tone, following the booking lists' Notification column:
// a "Confirmed / ReConfirmed" history collapses to its latest state, and an
// On Request room that hasn't been confirmed yet reads "On Request". Labels
// are normalised because stored casing varies ("Reconfirmed", "CONFIRMED").
// An empty label means the row carries no status.
function describeStatus(booking) {
  const segments = String(booking.confirmationStatus || "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const latest = segments[segments.length - 1] || "";
  const key = latest.replace(/\s+/g, "").toLowerCase();

  if (booking.cancelled || key.startsWith("cancel")) {
    return { label: "Cancelled", tone: "danger" };
  }
  const onRequestPending =
    /^on\s*request$/i.test(String(booking.roomStatus || "").trim()) &&
    !booking.onRequestConfirmed;
  if (key === "confirmed" && onRequestPending) {
    return { label: "On Request", tone: "pending" };
  }
  if (key === "confirmed") return { label: "Confirmed", tone: "ok" };
  if (key === "reconfirmed") return { label: "ReConfirmed", tone: "ok" };
  if (key === "notconfirmed") return { label: "Not Confirmed", tone: "danger" };
  if (key === "onrequest") return { label: "On Request", tone: "pending" };
  return { label: latest, tone: "muted" };
}

function HighlightedCode({ code, needle }) {
  const text = code || "-";
  const at = needle ? text.toUpperCase().indexOf(needle.toUpperCase()) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  );
}

/**
 * @param {object}   props
 * @param {object}   [props.inputRef]   ref to the <input>, so the sidebar's
 *                                      "/" and Ctrl+K shortcut can focus it
 * @param {boolean}  [props.inline]     render suggestions in the flow (mobile
 *                                      offcanvas) instead of as a dropdown
 * @param {boolean}  [props.showAgent]  add the agent name to each suggestion
 * @param {Function} [props.onActivate] called when the field gains focus
 * @param {Function} [props.onNavigate] called just before opening a booking
 */
export default function BookingCodeSearch({
  inputRef,
  inline = false,
  showAgent = false,
  onActivate,
  onNavigate,
}) {
  const navigate = useNavigate();
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [resultsFor, setResultsFor] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [errorMessage, setErrorMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const ownInputRef = useRef(null);
  const fieldRef = inputRef || ownInputRef;
  const debounceRef = useRef(null);
  const requestSeq = useRef(0);

  const code = normalizeCode(query);
  const resultsAreCurrent = resultsFor === code;

  useEffect(() => {
    const debounce = debounceRef;
    return () => clearTimeout(debounce.current);
  }, []);

  // Close the suggestions on any click outside the box.
  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  // Resolves with the rows, or null when the search failed or a newer one
  // replaced it.
  const runSearch = useCallback(async (searchCode) => {
    const seq = ++requestSeq.current;
    setStatus("loading");
    try {
      const { data } = await axiosInstance.get("/api/unified-bookings/search", {
        params: { code: searchCode, limit: RESULT_LIMIT },
      });
      if (seq !== requestSeq.current) return null;
      const rows = Array.isArray(data?.bookings) ? data.bookings : [];
      setResults(rows);
      setResultsFor(searchCode);
      setActiveIndex(rows.length > 0 ? 0 : -1);
      setStatus("done");
      return rows;
    } catch (err) {
      if (seq !== requestSeq.current) return null;
      setResults([]);
      setResultsFor(searchCode);
      setActiveIndex(-1);
      setErrorMessage(
        err?.response?.data?.message || "Could not search bookings. Please try again.",
      );
      setStatus("error");
      return null;
    }
  }, []);

  const resetResults = () => {
    requestSeq.current += 1; // drop any response still in flight
    clearTimeout(debounceRef.current);
    setResults([]);
    setResultsFor("");
    setActiveIndex(-1);
    setStatus("idle");
  };

  const handleChange = (event) => {
    const value = event.target.value;
    setQuery(value);
    setOpen(true);
    const nextCode = normalizeCode(value);
    if (nextCode.length < MIN_SUGGEST_CHARS) {
      resetResults();
      return;
    }
    // Keep the previous suggestions on screen until the new ones arrive,
    // but never let an older response overwrite them.
    requestSeq.current += 1;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(nextCode), DEBOUNCE_MS);
  };

  const openBooking = (booking) => {
    if (!booking?.detailRoute || booking.bookingId == null) {
      toast.error("This booking's detail page could not be resolved.");
      return;
    }
    resetResults();
    setQuery("");
    setOpen(false);
    fieldRef.current?.blur();
    onNavigate?.();
    navigate(`${booking.detailRoute}${booking.bookingId}`);
  };

  // Used when Enter is pressed without a visible suggestion to act on: open
  // the booking only if the typed code identifies it, else show the list.
  const openBestMatch = (rows, searchCode) => {
    const wanted = searchCode.toUpperCase();
    const exact = rows.find(
      (row) => normalizeCode(row.bookingCode).toUpperCase() === wanted,
    );
    if (exact || rows.length === 1) {
      openBooking(exact || rows[0]);
    } else {
      setOpen(true);
    }
  };

  const handleEnter = async () => {
    // Read the field itself: a scanner or paste can fire Enter before React
    // has re-rendered with the new text.
    const enteredCode = normalizeCode(fieldRef.current ? fieldRef.current.value : query);
    if (!enteredCode) return;
    const fresh = status === "done" && resultsFor === enteredCode;
    if (fresh && open && results[activeIndex]) {
      openBooking(results[activeIndex]);
      return;
    }
    if (fresh) {
      openBestMatch(results, enteredCode);
      return;
    }
    clearTimeout(debounceRef.current);
    setOpen(true);
    const rows = await runSearch(enteredCode);
    if (rows) openBestMatch(rows, enteredCode);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (results.length === 0) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      let next = (activeIndex + step + results.length) % results.length;
      if (activeIndex < 0) next = step > 0 ? 0 : results.length - 1;
      setOpen(true);
      setActiveIndex(next);
      // The list scrolls past ~5 rows; keep the highlighted one visible.
      document.getElementById(`${listboxId}-${next}`)?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      handleEnter();
    } else if (event.key === "Escape") {
      // First Escape closes the suggestions, the next clears the field;
      // only an empty field lets Escape through (e.g. to close the mobile
      // offcanvas).
      if (open && code) {
        event.stopPropagation();
        setOpen(false);
      } else if (query) {
        event.stopPropagation();
        resetResults();
        setQuery("");
      } else {
        fieldRef.current?.blur();
      }
    }
  };

  const handleFocus = () => {
    onActivate?.();
    if (code) setOpen(true);
  };

  const clearQuery = () => {
    resetResults();
    setQuery("");
    setOpen(false);
    fieldRef.current?.focus();
  };

  const showPanel = open && code.length > 0;
  const activeOptionId =
    showPanel && results[activeIndex] ? `${listboxId}-${activeIndex}` : undefined;

  let panelBody;
  if (results.length > 0) {
    panelBody = (
      <>
        <ul
          className={`bcs-list${resultsAreCurrent ? "" : " is-stale"}`}
          role="listbox"
          id={listboxId}
          aria-label="Matching bookings"
        >
          {results.map((booking, index) => {
            const badge = describeStatus(booking);
            const stay =
              booking.checkInDate && booking.checkOutDate
                ? `${formatDateOnly(booking.checkInDate)} → ${formatDateOnly(booking.checkOutDate)}`
                : "";
            const guestAndHotel = [booking.primaryGuestName, booking.hotelName]
              .filter(Boolean)
              .join(" · ");
            const stayAndAgent = [stay, showAgent ? booking.agentName : ""]
              .filter(Boolean)
              .join(" · ");
            const isActive = index === activeIndex;
            return (
              <li
                key={`${booking.bookingType}-${booking.bookingId}`}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={isActive}
                className={`bcs-option${isActive ? " is-active" : ""}`}
                // Keep focus in the input so Enter / arrows keep working.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => openBooking(booking)}
              >
                <div className="bcs-row">
                  <span className="bcs-code">
                    <HighlightedCode code={booking.bookingCode} needle={code} />
                  </span>
                  {booking.bookingType && (
                    <span className="bcs-type">{booking.bookingType}</span>
                  )}
                  {badge.label && (
                    <span className={`bcs-status is-${badge.tone}`}>{badge.label}</span>
                  )}
                </div>
                {guestAndHotel && <div className="bcs-meta">{guestAndHotel}</div>}
                {stayAndAgent && <div className="bcs-meta">{stayAndAgent}</div>}
              </li>
            );
          })}
        </ul>
        {!inline && (
          <div className="bcs-footer" aria-hidden="true">
            <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
            <span><kbd>Enter</kbd> open</span>
            <span><kbd>Esc</kbd> close</span>
          </div>
        )}
      </>
    );
  } else if (code.length < MIN_SUGGEST_CHARS && status === "idle") {
    panelBody = (
      <div className="bcs-state">
        Keep typing, or press <kbd>Enter</kbd> to search.
      </div>
    );
  } else if (status === "error" && resultsAreCurrent) {
    panelBody = (
      <div className="bcs-state is-error" role="alert">
        {errorMessage}
      </div>
    );
  } else if (status === "done" && resultsAreCurrent) {
    panelBody = (
      <div className="bcs-state" role="status">
        <SearchX size={18} strokeWidth={1.75} className="bcs-state-icon" aria-hidden="true" />
        <div>
          <div className="bcs-state-title">No booking found</div>
          Nothing matches “{code}”. Check the code and try again.
        </div>
      </div>
    );
  } else {
    panelBody = (
      <div className="bcs-state" role="status">
        <Loader2 size={16} className="bcs-spin" aria-hidden="true" />
        Searching…
      </div>
    );
  }

  return (
    <div className={`bcs${inline ? " bcs--inline" : ""}`} ref={wrapperRef}>
      <div className="bcs-field" title="Search any booking by its code (shortcut: / or Ctrl+K)">
        <Search size={15} strokeWidth={2} className="bcs-icon" aria-hidden="true" />
        <input
          ref={fieldRef}
          type="text"
          className="bcs-input"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder="Booking code"
          aria-label="Search bookings by booking code"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={showPanel ? listboxId : undefined}
          aria-activedescendant={activeOptionId}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={100}
          enterKeyHint="search"
        />
        {status === "loading" ? (
          <Loader2 size={14} className="bcs-trailing bcs-spin" aria-hidden="true" />
        ) : query ? (
          <button
            type="button"
            className="bcs-clear"
            onClick={clearQuery}
            aria-label="Clear booking search"
          >
            <X size={14} strokeWidth={2} />
          </button>
        ) : (
          !inline && <kbd className="bcs-kbd">/</kbd>
        )}
      </div>
      {showPanel && <div className="bcs-panel">{panelBody}</div>}
    </div>
  );
}
