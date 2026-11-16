import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Pagination, Spinner } from "react-bootstrap";
import {
  FaCheckCircle,
  FaChevronDown,
  FaHotel,
  FaMapMarkerAlt,
  FaStar,
} from "react-icons/fa";
import axiosInstance from "../../../../components/AxiosInstance";
import { stripSupplierSuffix } from "../../../../utils/supplierDisplay";
import { formatPackageAmount } from "../packageTotal";
import {
  canSeeSupplierNames,
  supplierHotelKey,
  supplierLabel,
} from "../supplierHotels";

// The backend waits up to 230s for a supplier; the shared axios timeout is 30s.
const SUPPLIER_SEARCH_TIMEOUT_MS = 250000;

const HOTELS_PER_PAGE = 10;

// First page, last page and the current page's neighbours: 1 … 4 5 6 … 11
const visiblePageNumbers = (current, total) => {
  const pages = [];
  for (let page = 1; page <= total; page += 1) {
    if (page === 1 || page === total || Math.abs(page - current) <= 1) {
      pages.push(page);
    }
  }
  return pages;
};

/**
 * Live supplier hotels, listed under the package's own hotels on the Hotels
 * step. HotelsTab only renders this for a package registered with "Allow
 * supplier hotels", so no other package makes these calls.
 *
 * Each supplier is searched separately so one slow supplier doesn't hold back
 * the rest. A failed search stays in this section; the package's own hotels
 * are not affected.
 */
const SupplierHotelsSection = ({
  providers,
  searchParams,
  checkInDate,
  searchCityId,
  searchRoomCount,
  selected,
  onToggle,
  getImageUrl,
}) => {
  const [results, setResults] = useState({});
  const [page, setPage] = useState(1);
  // Starts closed, like the itinerary days above it.
  const [isOpen, setIsOpen] = useState(false);
  const listTopRef = useRef(null);
  const showSupplierNames = canSeeSupplierNames();

  const providersKey = providers.join(",");
  const {
    packageId,
    adultCount,
    childCount,
    childAge,
    nativeCountry,
    agentId,
    destinationCityId,
    destinationCountryId,
  } = searchParams;
  const cityId = destinationCityId || searchCityId || "";
  const roomCount = Number(searchRoomCount) > 0 ? Number(searchRoomCount) : 1;

  useEffect(() => {
    if (!providersKey) {
      setResults({});
      return undefined;
    }
    let cancelled = false;
    const suppliers = providersKey.split(",");
    setPage(1);
    setResults(
      Object.fromEntries(
        suppliers.map((supplier) => [supplier, { status: "loading", hotels: [] }])
      )
    );

    suppliers.forEach(async (supplier) => {
      let result;
      try {
        const res = await axiosInstance.post(
          "/api/v1/package-booking/supplier-hotels",
          {
            packageid: String(packageId || ""),
            supplier,
            checkInDate,
            adultCount: String(adultCount || 1),
            childCount: String(childCount || 0),
            childAge: childAge || "",
            noOfRooms: String(roomCount),
            nativeCountry: String(nativeCountry || ""),
            agentId: String(agentId || ""),
            destinationCityId: String(cityId),
            destinationCountryId: String(destinationCountryId || ""),
          },
          { timeout: SUPPLIER_SEARCH_TIMEOUT_MS }
        );
        result = {
          status: "done",
          hotels: Array.isArray(res.data) ? res.data : [],
        };
      } catch (err) {
        console.error("Failed to load supplier hotels:", err);
        result = { status: "failed", hotels: [] };
      }
      if (!cancelled) {
        setResults((prev) => ({ ...prev, [supplier]: result }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    providersKey,
    packageId,
    checkInDate,
    adultCount,
    childCount,
    childAge,
    roomCount,
    nativeCountry,
    agentId,
    cityId,
    destinationCountryId,
  ]);

  const selectedKey = selected
    ? supplierHotelKey(selected.supplier, selected.supplierHotelCode)
    : null;

  // An already-picked hotel (amending, or coming back to this step) mustn't
  // start hidden. Closing the section afterwards is still allowed.
  useEffect(() => {
    if (selectedKey) setIsOpen(true);
  }, [selectedKey]);

  // Cheapest first across all suppliers. A pick that is no longer in the live
  // results (no availability now, or a past date on an amend) stays listed so
  // the operator can still see it and keep it.
  const rows = useMemo(() => {
    const live = Object.values(results)
      .flatMap((result) => result.hotels)
      .sort(
        (a, b) =>
          Number(a.totalRateWithMarkup || 0) - Number(b.totalRateWithMarkup || 0)
      );
    const selectedIsListed = live.some(
      (hotel) => supplierHotelKey(hotel.supplier, hotel.hotelCode) === selectedKey
    );
    if (!selected || selectedIsListed) return live;
    return [
      {
        supplier: selected.supplier,
        hotelCode: selected.supplierHotelCode,
        hotelName: selected.hotelName,
        image: selected.image,
        address: selected.stateName,
        noOfnight: selected.noOfnight,
        totalRateWithMarkup: selected.totalRateWithMarkup,
        currencyCode: selected.currencyCode,
      },
      ...live,
    ];
  }, [results, selected, selectedKey]);

  const entries = Object.entries(results);
  const isSearching = entries.some(([, result]) => result.status === "loading");
  const failedSuppliers = entries
    .filter(([, result]) => result.status === "failed")
    .map(([supplier]) => supplier);

  // Paging is client-side: every hotel is already loaded, so changing page never
  // searches the suppliers again. A picked hotel on another page is pinned above
  // the current page, so it can always be seen and undone.
  const totalPages = Math.max(1, Math.ceil(rows.length / HOTELS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const firstIndex = (currentPage - 1) * HOTELS_PER_PAGE;
  const pageRows = rows.slice(firstIndex, firstIndex + HOTELS_PER_PAGE);
  const selectedRow = rows.find(
    (hotel) => supplierHotelKey(hotel.supplier, hotel.hotelCode) === selectedKey
  );
  const visibleRows =
    selectedRow && !pageRows.includes(selectedRow)
      ? [selectedRow, ...pageRows]
      : pageRows;

  const goToPage = (nextPage) => {
    setPage(nextPage);
    listTopRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  };

  const body = (
    <>
      <p className="small text-muted mb-3">
        Prices are live and cover the whole stay for all guests. A hotel picked
        here is added to the package rate in the total, and our team confirms it
        after booking.
      </p>

      {isSearching && (
        <div className="prg-loading mb-3">
          <Spinner animation="border" size="sm" />{" "}
          <span>Searching live hotels…</span>
        </div>
      )}

      {failedSuppliers.length > 0 && (
        <div className="small text-danger mb-3">
          {showSupplierNames
            ? `Could not load hotels from ${failedSuppliers
                .map(supplierLabel)
                .join(", ")} right now.`
            : "Some live hotels could not be loaded right now."}
        </div>
      )}

      {!isSearching && rows.length === 0 && failedSuppliers.length === 0 && (
        <div className="prg-empty">No live hotels available for these dates.</div>
      )}

      {rows.length > 0 && (
        <div
          ref={listTopRef}
          className="d-flex flex-column gap-3"
          style={{ scrollMarginTop: 90 }}
        >
          {visibleRows.map((hotel) => {
            const key = supplierHotelKey(hotel.supplier, hotel.hotelCode);
            const isSelected = key === selectedKey;
            return (
              <div
                key={key}
                className={`room-category-item ${
                  isSelected ? "pkg-hotel-selected" : ""
                }`}
              >
                <div
                  className="room-category-header"
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => onToggle(hotel)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggle(hotel);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <div className="d-flex justify-content-between align-items-center w-100 flex-wrap gap-3">
                    <div
                      className="d-flex align-items-center gap-3 flex-grow-1"
                      style={{ minWidth: 0 }}
                    >
                      <div className="pkg-hotel-thumb">
                        {hotel.image ? (
                          <img
                            src={getImageUrl(hotel.image)}
                            alt={stripSupplierSuffix(hotel.hotelName)}
                            onError={(e) => {
                              e.target.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="pkg-hotel-thumb-fallback">
                            <FaHotel />
                          </div>
                        )}
                      </div>
                      <div className="room-category-info" style={{ minWidth: 0 }}>
                        <h5 className="mb-1 d-flex align-items-center flex-wrap gap-2">
                          <span>{stripSupplierSuffix(hotel.hotelName)}</span>
                          {Number(hotel.starRating) > 0 && (
                            <span className="small text-warning text-nowrap">
                              {hotel.starRating} <FaStar size={10} />
                            </span>
                          )}
                          {isSelected && (
                            <span className="pkg-selected-badge">
                              <FaCheckCircle size={10} />
                              <span>SELECTED</span>
                            </span>
                          )}
                        </h5>
                        {hotel.address && (
                          <p className="mb-0 text-muted small">
                            <FaMapMarkerAlt size={10} className="me-1" />
                            {hotel.address}
                          </p>
                        )}
                        <p className="mb-0 text-muted small">
                          {hotel.hasRefundable
                            ? "Refundable rooms available"
                            : hotel.hasNonRefundable
                              ? "Non-refundable"
                              : ""}
                          {showSupplierNames && (
                            <span>
                              {hotel.hasRefundable || hotel.hasNonRefundable
                                ? " · "
                                : ""}
                              {supplierLabel(hotel.supplier)}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="d-flex align-items-center gap-3">
                      <div className="room-category-price text-end">
                        <div className="price-range">
                          + {hotel.currencyCode || "AED"}{" "}
                          {formatPackageAmount(hotel.totalRateWithMarkup)}
                        </div>
                        {hotel.noOfnight != null && (
                          <div className="rates-count small text-muted">
                            {hotel.noOfnight} Night
                            {hotel.noOfnight === 1 ? "" : "s"}
                          </div>
                        )}
                      </div>
                      <Button
                        variant={isSelected ? "primary" : "outline-primary"}
                        size="sm"
                        className="d-flex align-items-center gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggle(hotel);
                        }}
                      >
                        {isSelected ? (
                          <>
                            <FaCheckCircle size={12} />
                            Selected
                          </>
                        ) : (
                          "Select Hotel"
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3">
          <small className="text-muted">
            Showing {firstIndex + 1}–{firstIndex + pageRows.length} of {rows.length}{" "}
            hotels
          </small>
          <Pagination className="mb-0">
            <Pagination.Prev
              disabled={currentPage === 1}
              onClick={() => goToPage(currentPage - 1)}
            />
            {visiblePageNumbers(currentPage, totalPages).map((number, index, numbers) => (
              <React.Fragment key={number}>
                {index > 0 && number - numbers[index - 1] > 1 && <Pagination.Ellipsis disabled />}
                <Pagination.Item
                  active={number === currentPage}
                  onClick={() => goToPage(number)}
                >
                  {number}
                </Pagination.Item>
              </React.Fragment>
            ))}
            <Pagination.Next
              disabled={currentPage === totalPages}
              onClick={() => goToPage(currentPage + 1)}
            />
          </Pagination>
        </div>
      )}
    </>
  );

  // Same .prg-day styling and rotating arrow as the Day-wise Itinerary rows
  // (defined in HotelsTab). Closing only hides the list: results, the current
  // page and the selection are kept, and no new search runs.
  return (
    <div className="room-categories-section mt-3">
      <div className={`prg-day ${isOpen ? "open" : ""}`}>
        <button
          type="button"
          className="prg-day-head"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span className="prg-day-title">
            <span className="prg-day-title-main" style={{ fontSize: "1rem" }}>
              More hotels with live rates
            </span>
            {selected && !isOpen && (
              <span className="prg-day-place">
                <FaCheckCircle size={10} /> Selected:{" "}
                {stripSupplierSuffix(selected.hotelName)}
              </span>
            )}
          </span>
          {isSearching && !isOpen && <Spinner animation="border" size="sm" />}
          {rows.length > 0 && (
            <span className="prg-section-pill">
              {rows.length} hotel{rows.length === 1 ? "" : "s"}
            </span>
          )}
          <FaChevronDown className="prg-day-chev" />
        </button>
        {isOpen && <div className="p-3">{body}</div>}
      </div>
    </div>
  );
};

export default SupplierHotelsSection;
