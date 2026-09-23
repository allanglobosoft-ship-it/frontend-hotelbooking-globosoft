/**
 * Package booking hand-off helpers.
 *
 * The Package Search page (src/pages/search/package/PackageSearch.jsx,
 * handleBookNow) opens the package booking flow by writing a one-shot draft
 * to localStorage under `packageBookingContext:{packageId}` and opening
 * /new-booking/package-booking/{packageId} in a new tab. PackageBooking.jsx
 * reads that draft on mount (it never clears it) and seeds agent, pax,
 * nationality, matched category and search-history fields from it.
 *
 * The "Recommended Existing Packages" section on the Make Your Own Package V2
 * wizard reuses that exact flow, so the helpers below reproduce the draft
 * shape key-for-key (same key names, same string coercions, same fallbacks)
 * rather than inventing a second contract. PackageSearch.jsx itself is left
 * untouched on purpose — it stays the reference implementation.
 */

/** Same fallback image the Package Search cards use. */
export const PACKAGE_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=800&q=80";

/**
 * Resolve a stored package image path to a browser URL — mirrors
 * PackageSearch.getImageUrl: http(s) passes through, saved absolute Windows
 * paths are reduced to their file name, everything else is served from
 * /api/files/.
 */
export const resolvePackageImageUrl = (imagePath) => {
  if (!imagePath) return "";
  if (imagePath.startsWith("http")) return imagePath;
  if (imagePath.includes("\\") || imagePath.includes(":")) {
    const filename = imagePath.split("\\").pop();
    return `${process.env.REACT_APP_API_BASE_URL}/api/files/${filename}`;
  }
  return `${process.env.REACT_APP_API_BASE_URL}/api/files/${imagePath}`;
};

/**
 * Build the `packageBookingContext:{packageId}` draft for one search-result
 * row (`pkg` is a row from POST /api/v1/package-booking/search or
 * /suggestions — both carry the same keys).
 *
 * Every key PackageSearch.handleBookNow writes is written here with the same
 * coercion, so PackageBooking.jsx behaves identically whichever page opened
 * it. Callers that have no employee / parent booking simply leave those null,
 * exactly as the search page does for agent logins.
 */
export const buildPackageBookingContext = ({
  pkg,
  agentId,
  destination, // { value, label, countryId } option from /api/province
  nationality, // { value, label, code } option from /api/country
  adultCount,
  childCount,
  childAges,
  noOfRooms,
  arrivalDateTime,
  departureDateTime,
  employeeId = null,
  employeeName = null,
  parentBookingCode = null,
}) => {
  const totalAdults = parseInt(adultCount, 10) || 0;
  const totalChildren = parseInt(childCount, 10) || 0;
  const allChildAges = Array.isArray(childAges) ? childAges : [];
  // The /api/province option label is "State, Country" — split it so the
  // search-history snapshot gets a city and a country name (PackageSearch
  // reads optional cityName / countryName keys that its options never set,
  // so it always stores null there; filling them here is purely additive).
  const labelParts = String(destination?.label || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    agentId: agentId || null,
    destinationCountryId:
      destination?.countryId != null ? String(destination.countryId) : null,
    searchRate: pkg?.rate != null ? String(pkg.rate) : null,
    searchRateType: pkg?.rateType || null,
    searchCurrency: pkg?.currencyCode || "AED",
    nationalityId:
      nationality?.value != null ? String(nationality.value) : null,
    nationalityName: nationality?.label || null,
    employeeId: employeeId != null ? String(employeeId) : null,
    employeeName: employeeName || null,
    adultCount: String(totalAdults || 1),
    childCount: String(totalChildren),
    childAges: allChildAges.length ? allChildAges.join(",") : "",
    noOfRooms: String(noOfRooms || 1),
    packageCategory:
      pkg?.matchedCategoryId != null ? String(pkg.matchedCategoryId) : null,
    packageCategoryName: pkg?.matchedCategoryName || null,
    parentBookingCode: parentBookingCode || null,
    destinationCityId:
      destination?.value != null ? String(destination.value) : null,
    destinationLabel: destination?.label || null,
    destinationCityName: labelParts[0] || null,
    destinationCountryName: labelParts.length > 1 ? labelParts.slice(1).join(", ") : null,
    packageName: pkg?.packageName || null,
    packageType: pkg?.packageType || null,
    packageImage: pkg?.packageImage || null,
    noOfNights: pkg?.duration != null ? String(pkg.duration) : null,
    arrivalDateTime: arrivalDateTime || null,
    departureDateTime: departureDateTime || null,
  };
};

/**
 * Open the existing package booking flow for `pkg` — same steps as
 * PackageSearch.handleBookNow: optional travel-window confirmation, write the
 * draft (overwriting any stale one for the same package), open a new tab.
 *
 * Returns true when the tab was opened, false when the operator declined the
 * travel-window warning.
 */
export const openPackageBooking = (pkg, bookingContext) => {
  if (!pkg || pkg.packageId == null) return false;

  if (pkg.exceedsTravelWindow) {
    const proceed = window.confirm(
      `${
        pkg.travelWindowWarning ||
        "This package's itinerary is longer than your selected flight window."
      }\n\nDo you want to continue booking this package?`,
    );
    if (!proceed) return false;
  }

  try {
    localStorage.setItem(
      `packageBookingContext:${pkg.packageId}`,
      JSON.stringify(bookingContext),
    );
  } catch {
    // localStorage unavailable / quota exceeded — the booking page falls
    // back to defaults; the operator can re-enter agent/pax there.
  }

  const url = `/new-booking/package-booking/${pkg.packageId}`;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
};
