// Package checkout: what to say when the booking request times out.
//
// axiosInstance gives up after 30 s. When /book (or the CC Avenue
// finalize-package call) runs longer than that, the server is usually still
// finishing the booking, so a "Failed" message is wrong and leads the operator
// to book again, creating a duplicate that is charged twice. On a timeout the
// checkout shows BOOKING_STILL_PROCESSING_MESSAGE instead. Any reply the server
// did send (low credit, refused price check, server error, …) is still shown
// exactly as before; this only covers "no reply in time".

export const BOOKING_STILL_PROCESSING_MESSAGE =
  "This is taking longer than usual and your booking may still be going through. " +
  "Please check the Package Booking List before trying again.";

/** True when an axios request gave up waiting (no response from the server). */
export const isRequestTimeout = (error) => {
  if (!error || error.response) return false;
  const code = String(error.code || "");
  if (code === "ECONNABORTED" || code === "ETIMEDOUT") return true;
  return /timeout/i.test(String(error.message || ""));
};
