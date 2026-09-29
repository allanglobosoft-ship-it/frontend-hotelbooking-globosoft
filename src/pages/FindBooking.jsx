import React, { useState } from "react";
import FindBookingLayout from "../components/findBooking/FindBookingLayout";
import { openResultsTab } from "../components/findBooking/searchHandoff";

// Public "Find your booking" page — outside the system. The login screen's
// "Find a booking" entry opens it in a new tab, and the company website can
// link to it directly. Two ways to find a booking, each opening its results
// in a new tab (FindBookingResults):
//   - booking code + the lead guest's last name → that booking
//     (POST /api/public/booking-lookup);
//   - OR a date alone (booked on / travel date: check-in, tour, pickup,
//     reservation...) → every booking on that date, pick one to open
//     (POST /api/public/booking-lookup/by-date).
//     HIDDEN FOR NOW: the "Search by date" form, its state, handler and
//     "How it works" step are commented out below. Un-comment them together
//     to bring it back; the results tab and the API still support it.
// Both search every booking list: hotels, flights, packages, activities,
// transfers, chauffeur, offline, restaurants, honeymoon, Meet & Space,
// Ayurveda and the rest — except that the date list leaves out flights (a
// PNR with a surname opens the airline's own booking) and doctor
// consultations; those are found by code only.
// Own layout; same font and colours as the login screen.

const TAB_BLOCKED_MESSAGE =
  "Your browser blocked the results tab. Allow pop-ups for this site and try again.";

const STEPS = [
  {
    title: "Search by booking code",
    text: "Enter the code from your confirmation or voucher, with the lead guest's last name.",
  },
  // Search by date — hidden for now.
  // {
  //   title: "Or search by date",
  //   text: "Choose the booking date or travel date to list every booking on that day.",
  // },
  {
    title: "Open your booking",
    // With the search by date back, the text was:
    // "Results open in a new tab — select a booking there to see its status and full details."
    text: "Your booking opens in a new tab with its status and full details.",
  },
];

export default function FindBooking() {
  // Search by booking code
  const [bookingCode, setBookingCode] = useState("");
  const [codeLastName, setCodeLastName] = useState("");
  const [codeError, setCodeError] = useState("");
  // OR search by date — hidden for now.
  // const [dateType, setDateType] = useState("BOOKED");
  // const [date, setDate] = useState("");
  // const [dateError, setDateError] = useState("");

  const handleCodeSubmit = (event) => {
    event.preventDefault();
    // Codes never contain whitespace; one copied from an email often does.
    const code = bookingCode.replace(/\s+/g, "");
    const name = codeLastName.trim();
    if (!code || !name) {
      setCodeError("Enter the booking code and the lead guest's last name.");
      return;
    }
    const opened = openResultsTab({ type: "code", bookingCode: code, lastName: name });
    setCodeError(opened ? "" : TAB_BLOCKED_MESSAGE);
  };

  // Search by date — hidden for now.
  // const handleDateSubmit = (event) => {
  //   event.preventDefault();
  //   if (!date) {
  //     setDateError("Choose a date.");
  //     return;
  //   }
  //   const opened = openResultsTab({ type: "date", date, dateType });
  //   setDateError(opened ? "" : TAB_BLOCKED_MESSAGE);
  // };
  //
  // const isCheckIn = dateType === "CHECK_IN";

  return (
    <FindBookingLayout title="Find your booking · Globosoft">
      <section className="fbk-intro">
        <span className="fbk-eyebrow">
          <i className="fas fa-magnifying-glass" aria-hidden="true"></i> Booking lookup
        </span>
        <h1>Find your booking</h1>
        <p>Check the status of any booking — hotel, flight, package, transfer, tour and more — no sign-in needed.</p>
      </section>

      {/* ── Search by booking code ── */}
      <form className="fbk-search" onSubmit={handleCodeSubmit} noValidate>
        <div className="fbk-search-head">
          <div className="fbk-search-title">
            <i className="fas fa-receipt" aria-hidden="true"></i> Search by booking code
          </div>
        </div>
        <div className="fbk-search-fields">
          <div className="fbk-field">
            <label htmlFor="fbk-code">
              <i className="fas fa-hashtag" aria-hidden="true"></i> Booking code
            </label>
            <input
              id="fbk-code"
              type="text"
              placeholder="As shown on your voucher"
              value={bookingCode}
              onChange={(e) => setBookingCode(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={100}
              autoFocus
            />
          </div>
          <div className="fbk-field">
            <label htmlFor="fbk-last-name">
              <i className="fas fa-user" aria-hidden="true"></i> Lead guest's last name
            </label>
            <input
              id="fbk-last-name"
              type="text"
              placeholder="As entered on the booking"
              value={codeLastName}
              onChange={(e) => setCodeLastName(e.target.value)}
              autoComplete="family-name"
              maxLength={100}
            />
          </div>
          <button type="submit" className="fbk-btn" title="Opens the result in a new tab">
            <i className="fas fa-magnifying-glass" aria-hidden="true"></i> Find Booking
          </button>
        </div>

        {codeError && (
          <div className="fbk-error" role="alert">
            <i className="fas fa-circle-exclamation" aria-hidden="true"></i>
            <span>{codeError}</span>
          </div>
        )}

        <div className="fbk-note">
          <i className="fas fa-shield-halved" aria-hidden="true"></i>
          Details are shown only when the lead guest's last name matches the booking.
        </div>
      </form>

      {/* ── OR search by date — HIDDEN FOR NOW (commented out with its state,
          handler and "How it works" step above; un-comment them together) ──

      <div className="fbk-or" role="separator">
        <span>or</span>
      </div>

      <form className="fbk-search" onSubmit={handleDateSubmit} noValidate>
        <div className="fbk-search-head">
          <div className="fbk-search-title">
            <i className="fas fa-calendar-check" aria-hidden="true"></i> Search by date
          </div>
        </div>
        <div className="fbk-search-fields">
          <div className="fbk-field">
            <span className="fbk-field-label" id="fbk-date-type-label">
              <i className="fas fa-sliders" aria-hidden="true"></i> Search by
            </span>
            <div
              className="fbk-toggle fbk-toggle--field"
              role="group"
              aria-labelledby="fbk-date-type-label"
            >
              <button
                type="button"
                className={isCheckIn ? "" : "is-active"}
                aria-pressed={!isCheckIn}
                onClick={() => setDateType("BOOKED")}
              >
                Booking date
              </button>
              <button
                type="button"
                className={isCheckIn ? "is-active" : ""}
                aria-pressed={isCheckIn}
                onClick={() => setDateType("CHECK_IN")}
                title="The day the stay or service starts: check-in, flight, tour, pickup, reservation"
              >
                Travel date
              </button>
            </div>
          </div>
          <div className="fbk-field">
            <label htmlFor="fbk-date">
              <i className="fas fa-calendar-days" aria-hidden="true"></i>{" "}
              {isCheckIn ? "Travel date" : "Booking date"}
            </label>
            <input
              id="fbk-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min="2000-01-01"
              max="2100-12-31"
            />
          </div>
          <button type="submit" className="fbk-btn" title="Opens the results in a new tab">
            <i className="fas fa-magnifying-glass" aria-hidden="true"></i> Find Bookings
          </button>
        </div>

        {dateError && (
          <div className="fbk-error" role="alert">
            <i className="fas fa-circle-exclamation" aria-hidden="true"></i>
            <span>{dateError}</span>
          </div>
        )}

        <div className="fbk-note fbk-note--info">
          <i className="fas fa-circle-info" aria-hidden="true"></i>
          {isCheckIn
            ? "Lists the bookings starting on the chosen date — check-ins, tours, transfers, pickups, reservations — select one to see its details. Flights are found by booking code only."
            : "Lists the bookings made on the chosen date, of every kind — select one to see its details. Flights are found by booking code only."}
        </div>
      </form>
      */}

      <section className="fbk-steps" aria-label="How it works">
        {STEPS.map((step, index) => (
          <div className="fbk-step" key={step.title}>
            <span className="fbk-step-num">{index + 1}</span>
            <div>
              <div className="fbk-step-title">{step.title}</div>
              <p>{step.text}</p>
            </div>
          </div>
        ))}
      </section>
    </FindBookingLayout>
  );
}
