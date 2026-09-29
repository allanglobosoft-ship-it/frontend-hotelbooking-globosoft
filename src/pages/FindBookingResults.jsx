import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../components/AxiosInstance";
import { formatDateDisplay } from "../utils/dateUtils";
import FindBookingLayout from "../components/findBooking/FindBookingLayout";
import { BookingResult, DateResults, listKey } from "../components/findBooking/BookingViews";
import { takeHandedOffSearch } from "../components/findBooking/searchHandoff";

// Results tab of the public "Find your booking" page (/find-booking/results).
// The search page opens it in a new tab and hands the search over
// (searchHandoff.js); this page runs it and shows the booking for a code, or
// a date's bookings to open one from.

const NOT_FOUND_MESSAGE =
  "We couldn't find a booking with those details. Check the booking code and the lead guest's last name.";
const NO_BOOKINGS_ON_DATE_MESSAGE = "We couldn't find any bookings on that date.";
const UNAVAILABLE_MESSAGE =
  "We couldn't search right now. Please try again in a moment.";
const EXPIRED_MESSAGE =
  "This search is no longer available. Start a new search on the Find your booking page.";

export default function FindBookingResults() {
  const navigate = useNavigate();
  const [search] = useState(takeHandedOffSearch);
  const [loading, setLoading] = useState(Boolean(search));
  const [error, setError] = useState(search ? "" : EXPIRED_MESSAGE);
  // One booking, or a date's list to pick from.
  const [booking, setBooking] = useState(null);
  const [dateResults, setDateResults] = useState(null);
  // The list row the open booking came from, to return to it.
  const [openedFrom, setOpenedFrom] = useState(null);
  const resultsRef = useRef(null);

  const byDate = search?.type === "date";

  useEffect(() => {
    if (!search) return undefined;
    let current = true;
    const request = byDate
      ? axiosInstance.post("/api/public/booking-lookup/by-date", {
          date: search.date,
          dateType: search.dateType,
        })
      : axiosInstance.post("/api/public/booking-lookup", {
          bookingCode: search.bookingCode,
          lastName: search.lastName,
        });
    request
      .then(({ data }) => {
        if (!current) return;
        const bookings = Array.isArray(data?.bookings) ? data.bookings : [];
        if (byDate && data?.found && bookings.length > 0) {
          setDateResults({
            bookings,
            date: search.date,
            dateType: search.dateType,
            truncated: Boolean(data.truncated),
          });
        } else if (!byDate && data?.found && data.booking) {
          setBooking(data.booking);
        } else {
          setError(data?.message || (byDate ? NO_BOOKINGS_ON_DATE_MESSAGE : NOT_FOUND_MESSAGE));
        }
      })
      .catch((err) => {
        if (current) setError(err?.response?.data?.message || UNAVAILABLE_MESSAGE);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [search, byDate]);

  // A booking opened from the list shows from its top; back from it, return
  // to its row — a day's list can be long.
  useEffect(() => {
    if (!dateResults || !openedFrom) return;
    if (booking) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const row = resultsRef.current?.querySelector(`[data-key="${CSS.escape(openedFrom)}"]`);
    if (row) {
      row.scrollIntoView({ block: "center" });
      row.focus({ preventScroll: true });
    }
  }, [booking, dateResults, openedFrom]);

  const openFromList = (item) => {
    setOpenedFrom(listKey(item));
    setBooking(item);
  };

  // Back to the search page: close this tab when the search page opened it
  // (its fields are still filled in), otherwise open the search page here.
  const newSearch = () => {
    if (window.opener && !window.opener.closed) {
      window.close();
    }
    if (!window.closed) {
      navigate("/find-booking");
    }
  };

  let summary = "";
  let tabTitle = "Search results";
  if (byDate) {
    const day = formatDateDisplay(search.date);
    summary = `Bookings ${search.dateType === "CHECK_IN" ? "starting" : "made"} on ${day}`;
    tabTitle = `Bookings on ${day}`;
  } else if (search) {
    summary = `Booking code ${search.bookingCode}`;
    tabTitle = `Booking ${search.bookingCode}`;
  }

  return (
    <FindBookingLayout title={`${tabTitle} · Globosoft`}>
      <section className="fbk-intro fbk-intro--results">
        <span className="fbk-eyebrow">
          <i className="fas fa-magnifying-glass" aria-hidden="true"></i> Booking lookup
        </span>
        <h1>Search results</h1>
        {summary && <p>{summary}</p>}
        <div className="fbk-intro-actions">
          <button type="button" className="fbk-btn-outline" onClick={newSearch}>
            <i className="fas fa-arrow-left" aria-hidden="true"></i> New search
          </button>
        </div>
      </section>

      <div ref={resultsRef} className="fbk-results">
        {loading ? (
          <div className="fbk-state" role="status">
            <span className="spinner-border spinner-border-sm" aria-hidden="true"></span>
            Searching…
          </div>
        ) : error ? (
          <div className="fbk-state">
            <div className="fbk-error" role="alert">
              <i className="fas fa-circle-exclamation" aria-hidden="true"></i>
              <span>{error}</span>
            </div>
          </div>
        ) : booking ? (
          <BookingResult
            booking={booking}
            onBack={dateResults ? () => setBooking(null) : undefined}
            onSearchAgain={newSearch}
          />
        ) : dateResults ? (
          <DateResults results={dateResults} onSelect={openFromList} />
        ) : null}
      </div>
    </FindBookingLayout>
  );
}
