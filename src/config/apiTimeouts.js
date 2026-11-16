// How long a page waits for a backend call that itself waits on supplier
// APIs. The backend gives every supplier up to 220 seconds (room search:
// app.room-search.supplier-timeout-ms), so the page must wait longer than
// that, or it gives up before the answer arrives. The extra 30 seconds
// covers building the reply.
export const SUPPLIER_SEARCH_TIMEOUT_MS = 250000;

// How long a page waits for a booking that goes to a supplier. One booking
// makes several supplier calls in a row, each allowed 210 seconds (RateHawk:
// prebook, form, finish, then up to 300 seconds of status checks; i'way:
// check time, create, approve, documents). The page waits 10 minutes, as long
// as the backend holds the agent's credit for a booking, so it never reports
// a failure for a booking that may still go through.
export const SUPPLIER_BOOKING_TIMEOUT_MS = 600000;
