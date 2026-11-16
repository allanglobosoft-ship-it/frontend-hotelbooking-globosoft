// Live supplier hotels on a package booking: the frontend half of the backend's
// PackageSupplierHotelService / PackageSupplierBookingService.
//
// A package registered with "Allow supplier hotels" offers live hotels from the
// suppliers it lists, next to its own hotels. A supplier hotel has no in-house
// hotelId, only a supplier code + that supplier's hotel code, so everything here
// keys off `supplier`. Own hotels never carry that field, which is what keeps
// their selection and /book payload exactly as they were.
//
// These selections are RECORD-ONLY: no supplierRooms are sent, so the backend
// stores the row as MANUAL and staff book the hotel by hand, even if
// package.supplier-booking.enabled is on. Real supplier booking needs a room
// picker and a price re-check on the booking page, which are not built yet.

import { stripSupplierSuffix } from "../../../utils/supplierDisplay";
import { getCurrentActiveRole, getUserRole } from "../../../utils/authSession";

/** Same codes, in the same order, as the backend's SupplierHotelProviders. */
export const SUPPLIER_LABELS = {
  IWTX: "IWTX",
  X3: "X3",
  GRN: "GRN",
  GOGLOBAL: "GoGlobal",
  RATEHAWK: "RateHawk",
  ATHARVA: "Atharva",
  DARINA: "Darina",
};

const normalizeCode = (code) => String(code || "").trim().toUpperCase();

export const supplierLabel = (code) =>
  SUPPLIER_LABELS[normalizeCode(code)] || code || "";

const SUPPLIER_NAME_ROLES = ["admin", "super_admin"];

/**
 * Only admin logins see which API supplier a hotel comes from. Everyone else is
 * hidden by default: agents and their sub-accounts (see
 * utils/supplierDisplay.js), Supplier / DMC partners, and any other role. The
 * role is worked out the same way PrivateRoute does it.
 */
export const canSeeSupplierNames = () => {
  const role = getCurrentActiveRole() || getUserRole().split(",")[0] || "";
  return SUPPLIER_NAME_ROLES.includes(role.trim().toLowerCase());
};

/** "IWTX, x3" -> ["IWTX", "X3"]. Blank entries and duplicates are dropped. */
export const parseSupplierProviders = (csv) => [
  ...new Set(String(csv || "").split(",").map(normalizeCode).filter(Boolean)),
];

/** The suppliers a package offers. Empty for every package that did not opt in. */
export const packageSupplierProviders = (packageView) =>
  Number(packageView?.supplierHotelsEnabled) === 1
    ? parseSupplierProviders(packageView?.supplierHotelProviders)
    : [];

export const supplierHotelKey = (supplier, hotelCode) =>
  `${normalizeCode(supplier)}:${hotelCode}`;

/** The supplier hotel currently picked on bookingData.selections, or null. */
export const selectedSupplierHotel = (selections) => {
  const first = Array.isArray(selections?.selectedHotels)
    ? selections.selectedHotels[0]
    : null;
  return first?.supplier ? first : null;
};

/** "2026-12-20T14:30" -> "2026-12-20"; null when the value doesn't start with a date. */
export const toIsoDate = (value) => {
  const match = /^\d{4}-\d{2}-\d{2}/.exec(String(value || "").trim());
  return match ? match[0] : null;
};

/**
 * Turns a /supplier-hotels row into the selectedHotels shape the rest of the
 * booking flow reads. stateName is what the checkout summaries print as the
 * hotel's location.
 */
export const toSupplierSelection = (hotel) => ({
  hotelId: null,
  hotelName: stripSupplierSuffix(hotel.hotelName),
  image: hotel.image || "",
  stateName: hotel.address || "",
  noOfnight: hotel.noOfnight,
  totalRateWithMarkup: hotel.totalRateWithMarkup,
  currencyCode: hotel.currencyCode || "AED",
  supplier: hotel.supplier,
  supplierHotelCode: hotel.hotelCode,
});

/** Extra /book and amend fields for a supplier hotel; nothing for an own hotel. */
export const supplierPayloadFields = (hotel) =>
  hotel?.supplier
    ? { supplier: hotel.supplier, supplierHotelCode: hotel.supplierHotelCode }
    : {};

/**
 * Supplier fields of a saved hotel row, kept when a booking is opened to amend.
 * Dropping them would turn the row into a hotel with neither an id nor a supplier.
 */
export const savedSupplierFields = (hotel) =>
  hotel?.supplier
    ? {
        supplier: hotel.supplier,
        supplierHotelCode: hotel.supplierHotelCode,
        supplierBookingStatus: hotel.supplierBookingStatus,
      }
    : {};

const savedHotels = (booking) =>
  Array.isArray(booking?.selections?.hotels) ? booking.selections.hotels : [];

/** What a saved booking's supplier hotel(s) cost. Zero for an own-hotel booking. */
export const savedSupplierHotelRate = (booking) =>
  savedHotels(booking)
    .filter((hotel) => hotel?.supplier)
    .reduce((sum, hotel) => sum + (Number(hotel.selectedRate) || 0), 0);

/**
 * The package-rate part of a saved booking that holds a supplier hotel: its
 * total without Tourism Dirham and the hotel (the backend stores the total with
 * Tourism Dirham included). Zero for an own-hotel booking, so anything keyed on
 * this leaves those bookings alone.
 */
export const savedPackageRate = (booking) => {
  const hotelRate = savedSupplierHotelRate(booking);
  if (hotelRate <= 0) return 0;
  const rate =
    (Number(booking?.totalPrice) || 0) -
    (Number(booking?.tourismDirham) || 0) -
    hotelRate;
  return rate > 0 ? Math.round(rate * 100) / 100 : 0;
};

const SUPPLIER_STATUS_LABELS = {
  MANUAL: "Not booked yet, staff to book by hand",
  BOOKED: "Booked with supplier",
  CANCELLED: "Cancelled with supplier",
};

export const supplierStatusLabel = (status) =>
  SUPPLIER_STATUS_LABELS[normalizeCode(status)] || status || "";
