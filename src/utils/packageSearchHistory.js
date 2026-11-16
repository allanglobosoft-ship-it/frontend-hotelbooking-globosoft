// Frontend hooks for the "abandoned package search → similar-packages
// suggestion email" backend feature. Mirrors the pattern
// HotelBookingPage.jsx already uses for /api/search-history/{save,confirm}
// against the hotel table, but keeps the two features fully isolated —
// nothing here touches the hotel search-history endpoints, and vice versa.
//
// Contract with the backend:
//  • POST /api/package-search-history/save on the "user landed on a
//    package booking page" event, so an accidentally-closed tab still
//    leaves a row behind for the scheduler to email.
//  • POST /api/package-search-history/confirm/{contextKey} on booking
//    success, so a completed booking never gets a follow-up email.
//
// Fire-and-forget on purpose: history bookkeeping must never block a
// real booking. Both helpers swallow all errors and log a warning.
//
// AGENT sessions only — an admin (or staff) abandoning a booking must
// not appear on the suggestion queue. The backend /save endpoint enforces
// the same rule from the JWT roles; this client-side check just avoids
// the wasted round-trip.

import axiosInstance from "../components/AxiosInstance";

const CONTEXT_DRAFT_KEY = (packageId) =>
  `packageBookingContext:${packageId}`;

const uuid = () =>
  (window.crypto?.randomUUID && window.crypto.randomUUID()) ||
  `psh-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const isAgentSession = () => {
  const stored = (sessionStorage.getItem("userRole") || "")
    .split(",")
    .map((r) => r.trim().toLowerCase());
  const role =
    sessionStorage.getItem("currentActiveRole")?.toLowerCase() ||
    stored[0] ||
    "";
  return role === "agent";
};

/**
 * Read (or lazily create) the contextKey for this package selection.
 * Persisted inside the existing packageBookingContext:{id} draft so an F5
 * on PackageBooking reuses the same row instead of adding a new one.
 * Returns null for non-agent sessions.
 */
export const getOrCreatePackageHistoryKey = (packageId) => {
  if (!packageId || !isAgentSession()) return null;
  try {
    const raw = localStorage.getItem(CONTEXT_DRAFT_KEY(packageId)) || "{}";
    const ctx = JSON.parse(raw) || {};
    if (ctx.historyContextKey) return ctx.historyContextKey;
    const key = uuid();
    localStorage.setItem(
      CONTEXT_DRAFT_KEY(packageId),
      JSON.stringify({ ...ctx, historyContextKey: key }),
    );
    return key;
  } catch {
    return null;
  }
};

/**
 * Fire-and-forget upsert to /api/package-search-history/save. Called from
 * PackageBooking on mount as soon as we have enough context to describe
 * the selection. Safe to call multiple times — the backend dedupes on
 * contextKey.
 *
 * `snapshot` should carry the fields the suggestion email needs: package
 * identity, destination, travel window, pax mix, rate the agent saw. All
 * fields are optional — missing ones simply won't appear in the email.
 */
export const savePackageSearchHistorySnapshot = (packageId, snapshot) => {
  if (!isAgentSession()) return;
  const contextKey = getOrCreatePackageHistoryKey(packageId);
  if (!contextKey) return;
  try {
    axiosInstance
      .post("/api/package-search-history/save", {
        contextKey,
        agentId: snapshot?.agentId ?? null,
        agentName: snapshot?.agentName ?? null,
        packageId: Number(packageId) || null,
        packageName: snapshot?.packageName ?? null,
        packageType: snapshot?.packageType ?? null,
        countryId: snapshot?.countryId ?? null,
        countryName: snapshot?.countryName ?? null,
        cityId: snapshot?.cityId ?? null,
        cityName: snapshot?.cityName ?? null,
        nationalityId: snapshot?.nationalityId ?? null,
        nationality: snapshot?.nationality ?? null,
        arrivalDateTime: snapshot?.arrivalDateTime ?? null,
        departureDateTime: snapshot?.departureDateTime ?? null,
        noOfNights: snapshot?.noOfNights ?? null,
        adultCount: snapshot?.adultCount ?? null,
        childCount: snapshot?.childCount ?? null,
        sellingPrice: snapshot?.sellingPrice ?? null,
        currency: snapshot?.currency ?? null,
        bookingDataJson: snapshot?.bookingDataJson ?? null,
      })
      .catch((err) =>
        console.warn(
          "package-search-history save failed (non-fatal):",
          err?.message || err,
        ),
      );
  } catch (err) {
    console.warn(
      "package-search-history snapshot skipped:",
      err?.message || err,
    );
  }
};

/**
 * Fire-and-forget POST to /api/package-search-history/confirm/{key} so
 * a booked selection drops off the pending-suggestion queue and the
 * scheduler never emails the agent about a booking they completed.
 * Called from the booking-success paths in PaxInformation.jsx (standard
 * flow) and PackageCheckout.jsx (CCAvenue paid flow).
 */
export const markPackageSearchHistoryConfirmed = (packageId) => {
  if (!packageId) return;
  try {
    const raw = localStorage.getItem(CONTEXT_DRAFT_KEY(packageId)) || "{}";
    const ctx = JSON.parse(raw) || {};
    const key = ctx.historyContextKey;
    if (!key) return;
    axiosInstance
      .post(`/api/package-search-history/confirm/${key}`)
      .catch((err) =>
        console.warn(
          "package-search-history confirm failed (non-fatal):",
          err?.message || err,
        ),
      );
  } catch (err) {
    console.warn(
      "package-search-history confirm skipped:",
      err?.message || err,
    );
  }
};
