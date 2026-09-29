import React from "react";
import { formatDateDisplay } from "../../utils/dateUtils";

// What a public "Find your booking" search shows in its results tab: one
// booking's details (BookingResult), or a date's bookings to open one from
// (DateResults). Shapes come from PublicBookingLookupResponse.

// status codes come from PublicBookingLookupResponse.PublicBooking
const STATUS_STYLE = {
  CONFIRMED: { tone: "ok", icon: "fa-circle-check" },
  PENDING: { tone: "pending", icon: "fa-hourglass-half" },
  CANCELLED: { tone: "danger", icon: "fa-circle-xmark" },
  UNAVAILABLE: { tone: "danger", icon: "fa-ban" },
  IN_PROGRESS: { tone: "muted", icon: "fa-circle-info" },
};

function stayLength(nights) {
  if (nights === 0) return "Day use";
  if (!nights) return "";
  return `${nights} night${nights === 1 ? "" : "s"}`;
}

// "Thursday" for a "2026-07-16T00:00:00" date, "" when missing.
function dayName(value) {
  if (!value) return "";
  const date = new Date(String(value).includes("T") ? value : `${value}T00:00:00`);
  return isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { weekday: "long" });
}

// "14 Jul 2026 → 16 Jul 2026", or the one day for a service that ends the day it starts.
function stayRange(booking) {
  if (!booking.checkInDate) return "";
  const start = formatDateDisplay(booking.checkInDate);
  const end = booking.checkOutDate ? formatDateDisplay(booking.checkOutDate) : "";
  return end && end !== start ? `${start} → ${end}` : start;
}

// The main fact's icon, by the kind of service (serviceLabel; none = a hotel).
const SERVICE_ICON = {
  Hotel: "fa-hotel",
  Flight: "fa-plane",
  Package: "fa-suitcase-rolling",
  Activity: "fa-person-hiking",
  Transfer: "fa-van-shuttle",
  Vehicle: "fa-car-side",
  Restaurant: "fa-utensils",
  Venue: "fa-people-roof",
  Treatment: "fa-spa",
  Services: "fa-briefcase",
};

function guestCount(adults, children) {
  const parts = [];
  if (adults > 0) parts.push(`${adults} adult${adults === 1 ? "" : "s"}`);
  if (children > 0) parts.push(`${children} ${children === 1 ? "child" : "children"}`);
  return parts.join(", ");
}

// "14 Jul 2026, 18:00" for a "2026-07-14T18:00:00" date-time; midnight means
// no time was set, so the date alone.
function dateTime(value) {
  if (!value) return "";
  const time = String(value).slice(11, 16);
  const date = formatDateDisplay(value);
  return time && time !== "00:00" ? `${date}, ${time}` : date;
}

const asList = (value) => (Array.isArray(value) ? value : []);

function StatusPill({ booking, small = false }) {
  const status = STATUS_STYLE[booking.status] || STATUS_STYLE.IN_PROGRESS;
  return (
    <span className={`fbk-status${small ? " fbk-status--sm" : ""} is-${status.tone}`}>
      <i className={`fas ${status.icon}`} aria-hidden="true"></i>
      {booking.statusLabel}
    </span>
  );
}

function GuestList({ guests, label }) {
  return (
    <ul className="fbk-room-guests" aria-label={label}>
      {guests.map((guest, index) => (
        <li key={index}>
          <i className={`fas ${guest.child ? "fa-child" : "fa-user"}`} aria-hidden="true"></i>
          {guest.name || "Guest"}
          {guest.child && (
            <span className="fbk-room-meta">
              {guest.childAge != null ? `child, ${guest.childAge} yrs` : "child"}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// A room — or, for other bookings, one of their parts: a flight, a package
// item, a menu dish (itemLabel names it).
function RoomCard({ room, index, numbered, itemLabel }) {
  const details = [room.mealPlan, guestCount(room.adults, room.children)]
    .filter(Boolean)
    .join(" · ");
  const guests = asList(room.guests);
  return (
    <li className="fbk-room">
      <div className="fbk-room-head">
        <span className="fbk-room-name">
          {numbered && (
            <span className="fbk-room-no">
              {itemLabel} {room.roomNo || index + 1}
            </span>
          )}
          {room.quantity > 1 ? `${room.quantity} × ` : ""}
          {room.roomType || `${itemLabel} ${room.roomNo || index + 1}`}
        </span>
        {details && <span className="fbk-room-meta">{details}</span>}
        {room.nonRefundable === true && <span className="fbk-chip">Non-refundable</span>}
      </div>
      {guests.length > 0 && <GuestList guests={guests} label="Guests" />}
      {room.cancellationPolicy && <p className="fbk-room-policy">{room.cancellationPolicy}</p>}
    </li>
  );
}

export function BookingResult({ booking, onBack, onSearchAgain }) {
  const hotelDetails = [
    booking.starRating > 0 ? `${booking.starRating}-star` : "",
    booking.hotelAddress,
  ]
    .filter(Boolean)
    .join(" · ");
  const rooms = asList(booking.rooms);
  const requests = asList(booking.specialRequests);
  const policies = asList(booking.cancellationPolicies);
  const travellers = asList(booking.travellers);
  // Hotels leave these empty; flights, packages, restaurants... name their parts.
  const serviceLabel = booking.serviceLabel || "Hotel";
  const isHotel = !booking.serviceLabel;
  const itemLabel = booking.itemLabel || "Room";
  const hasEnd = Boolean(booking.checkOutDate);
  // Restaurants, venues and treatments count heads, not adults and children.
  const party = [
    isHotel && booking.roomCount > 0
      ? `${booking.roomCount} room${booking.roomCount === 1 ? "" : "s"}`
      : "",
    guestCount(booking.adults, booking.children) ||
      (booking.partySize > 0 ? `${booking.partySize} guest${booking.partySize === 1 ? "" : "s"}` : ""),
  ]
    .filter(Boolean)
    .join(" · ");
  // The last fact: how long for a stay or a timed service, else who's going.
  const length = stayLength(booking.nights) || booking.duration || "";
  const lastFact = length
    ? { label: booking.nights != null ? "Stay" : "Duration", icon: booking.nights != null ? "fa-moon" : "fa-clock", value: length, sub: party }
    : { label: "Guests", icon: "fa-users", value: party || "-", sub: "" };
  const extras = asList(booking.extraDetails)
    .filter((detail) => detail && detail.value)
    .map((detail) => [detail.label, detail.value]);
  // Everything else the voucher shows, and the booking's status history —
  // only what this booking has.
  const details = [
    [isHotel ? "Hotel confirmation no." : "Confirmation no.", booking.confirmationNumber],
    ["Booking reference", booking.referenceNumber],
    ["Supplier reference", booking.supplierReference],
    ["Agent reference", booking.agentReference],
    ["Booked through", booking.bookedBy],
    ["Nationality", booking.nationality],
    ["Room status", booking.roomStatus],
    ["Rate", booking.rateType],
    ["Cancellation deadline", dateTime(booking.cancellationDeadline)],
    ["Voucher", booking.voucherStatus],
    ["Confirmed on", dateTime(booking.confirmedOn)],
    ["Reconfirmed on", dateTime(booking.reconfirmedOn)],
    ["Cancelled on", dateTime(booking.cancelledOn)],
    ["Cancellation reason", booking.cancellationReason],
    ["Payable at hotel", booking.payableAtHotel],
    ["Original booking", booking.originalBooking],
    ...extras,
  ].filter(([, value]) => value);

  return (
    <section className="fbk-result" aria-label="Booking details">
      <div className="fbk-result-head">
        <div>
          <div className="fbk-label">Booking code</div>
          <div className="fbk-result-code">{booking.bookingCode}</div>
          <div className="fbk-result-meta">
            {booking.bookingType && <span>{booking.bookingType} booking</span>}
            {booking.bookedOn && <span>Booked on {formatDateDisplay(booking.bookedOn)}</span>}
          </div>
        </div>
        <StatusPill booking={booking} />
      </div>

      <div className={`fbk-facts${hasEnd ? "" : " fbk-facts--no-end"}`}>
        <div className="fbk-fact fbk-fact--wide">
          <div className="fbk-label">
            <i className={`fas ${SERVICE_ICON[serviceLabel] || "fa-circle-info"}`} aria-hidden="true"></i>{" "}
            {serviceLabel}
          </div>
          <div className="fbk-value">{booking.serviceName || booking.hotelName || "-"}</div>
          {booking.serviceDetails && <div className="fbk-sub">{booking.serviceDetails}</div>}
          {hotelDetails && <div className="fbk-sub">{hotelDetails}</div>}
          {booking.hotelLocation && (
            <div className="fbk-sub fbk-sub--icon">
              <i className="fas fa-location-dot" aria-hidden="true"></i>
              {booking.hotelLocation}
            </div>
          )}
          {booking.hotelPhone && (
            <div className="fbk-sub fbk-sub--icon">
              <i className="fas fa-phone" aria-hidden="true"></i>
              <a href={`tel:${booking.hotelPhone.replace(/[^\d+]/g, "")}`}>{booking.hotelPhone}</a>
            </div>
          )}
        </div>
        <div className="fbk-fact">
          <div className="fbk-label">
            <i className="fas fa-right-to-bracket" aria-hidden="true"></i>{" "}
            {booking.startLabel || "Check-in"}
          </div>
          <div className="fbk-value">{formatDateDisplay(booking.checkInDate)}</div>
          <div className="fbk-sub">
            {[dayName(booking.checkInDate), booking.checkInTime].filter(Boolean).join(" · ")}
          </div>
        </div>
        {hasEnd && (
          <div className="fbk-fact">
            <div className="fbk-label">
              <i className="fas fa-right-from-bracket" aria-hidden="true"></i>{" "}
              {booking.endLabel || "Check-out"}
            </div>
            <div className="fbk-value">{formatDateDisplay(booking.checkOutDate)}</div>
            <div className="fbk-sub">
              {[dayName(booking.checkOutDate), booking.checkOutTime].filter(Boolean).join(" · ")}
            </div>
          </div>
        )}
        <div className="fbk-fact">
          <div className="fbk-label">
            <i className={`fas ${lastFact.icon}`} aria-hidden="true"></i> {lastFact.label}
          </div>
          <div className="fbk-value">{lastFact.value}</div>
          {lastFact.sub && <div className="fbk-sub">{lastFact.sub}</div>}
        </div>
      </div>

      {details.length > 0 && (
        <div className="fbk-section">
          <div className="fbk-label">
            <i className="fas fa-file-lines" aria-hidden="true"></i> Booking details
          </div>
          <dl className="fbk-kv">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {rooms.length > 0 && (
        <div className="fbk-section">
          <div className="fbk-label">
            <i className={`fas ${booking.itemsLabel ? "fa-list-ul" : "fa-bed"}`} aria-hidden="true"></i>{" "}
            {booking.itemsLabel || "Rooms"}
          </div>
          <ul className="fbk-room-list">
            {rooms.map((room, index) => (
              <RoomCard
                key={index}
                room={room}
                index={index}
                numbered={rooms.length > 1}
                itemLabel={itemLabel}
              />
            ))}
          </ul>
        </div>
      )}

      {travellers.length > 0 && (
        <div className="fbk-section">
          <div className="fbk-label">
            <i className="fas fa-users" aria-hidden="true"></i> Travellers
          </div>
          <GuestList guests={travellers} label="Travellers" />
        </div>
      )}

      {(requests.length > 0 || booking.remarks) && (
        <div className="fbk-section">
          <div className="fbk-label">
            <i className="fas fa-comment-dots" aria-hidden="true"></i> Requests &amp; remarks
          </div>
          {requests.length > 0 && (
            <ul className="fbk-bullets">
              {requests.map((request, index) => (
                <li key={index}>{request}</li>
              ))}
            </ul>
          )}
          {booking.remarks && <p className="fbk-text">{booking.remarks}</p>}
        </div>
      )}

      {policies.length > 0 && (
        <div className="fbk-section">
          <div className="fbk-label">
            <i className="fas fa-calendar-xmark" aria-hidden="true"></i> Cancellation policy
          </div>
          <ul className="fbk-bullets">
            {policies.map((policy, index) => (
              <li key={index}>{policy}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="fbk-result-foot">
        <div className="fbk-guest">
          <i className="fas fa-user" aria-hidden="true"></i>
          Lead guest <strong>{booking.leadGuestName || "-"}</strong>
        </div>
        <div className="fbk-result-actions">
          {onBack && (
            <button type="button" className="fbk-btn-outline" onClick={onBack}>
              <i className="fas fa-arrow-left" aria-hidden="true"></i> Back to the list
            </button>
          )}
          <button type="button" className="fbk-btn-outline" onClick={onSearchAgain}>
            <i className="fas fa-magnifying-glass" aria-hidden="true"></i> Search another booking
          </button>
        </div>
      </div>
    </section>
  );
}

// A list row's key — the same code can exist in two booking types.
export const listKey = (item) => `${item.bookingType}-${item.bookingCode}`;

export function DateResults({ results, onSelect }) {
  const count = results.bookings.length;
  const when = results.dateType === "CHECK_IN" ? "Starting on" : "Booked on";
  return (
    <section className="fbk-list" aria-label="Bookings on this date">
      <div className="fbk-list-head">
        <div className="fbk-list-title">
          {results.truncated
            ? `Latest ${count} bookings`
            : `${count} booking${count === 1 ? "" : "s"} found`}
        </div>
        <div className="fbk-list-sub">
          {when} {formatDateDisplay(results.date)}. Select one to see its details.
        </div>
        {results.truncated && (
          <div className="fbk-list-sub">
            This date has more bookings than the list can show — search by booking code to
            find one that isn't listed.
          </div>
        )}
      </div>
      <ul className="fbk-list-items">
        {results.bookings.map((item) => (
          <li key={listKey(item)}>
            <button
              type="button"
              className="fbk-list-item"
              data-key={listKey(item)}
              onClick={() => onSelect(item)}
            >
              <span className="fbk-list-main">
                <span className="fbk-list-code">
                  {item.bookingCode}
                  {item.bookingType && <span className="fbk-chip">{item.bookingType}</span>}
                </span>
                <span className="fbk-list-meta">
                  {[item.serviceName || item.hotelName, stayRange(item)].filter(Boolean).join(" · ")}
                </span>
              </span>
              <StatusPill booking={item} small />
              <i className="fas fa-chevron-right fbk-list-arrow" aria-hidden="true"></i>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
