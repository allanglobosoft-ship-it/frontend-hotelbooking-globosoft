import React, { useEffect, useMemo, useState } from "react";
import { Badge, Button, Spinner } from "react-bootstrap";
import {
  FaBed,
  FaCalendarAlt,
  FaExclamationTriangle,
  FaExternalLinkAlt,
  FaMapMarkerAlt,
  FaSuitcase,
  FaUtensils,
  FaHotel,
  FaCar,
  FaTicketAlt,
} from "react-icons/fa";
import axiosInstance from "../AxiosInstance";
import {
  PACKAGE_FALLBACK_IMAGE,
  buildPackageBookingContext,
  openPackageBooking,
  resolvePackageImageUrl,
} from "../../utils/packageBookingHandoff";

/**
 * "Recommended Existing Packages" — read-only suggestion strip rendered
 * under the Make Your Own Package V2 wizard results.
 *
 * How it works
 *  • Once the wizard's own search has completed (`enabled`), the same
 *    criteria the operator entered (destination(s), travel window, pax,
 *    nationality, agent) are sent to POST /api/v1/package-booking/suggestions
 *    — the Package Search page's matching rules, plus a few display fields.
 *  • One request per distinct destination in the itinerary (a single-city
 *    trip is one call). Results are merged by packageId.
 *  • Results are cached in sessionStorage under the exact request payload,
 *    so step changes, re-mounts and Back/Forward never re-query while the
 *    criteria are unchanged. A refresh of the wizard clears the cache along
 *    with the rest of the v2 search state.
 *  • Failures are silent: the section simply does not render, and the
 *    wizard is never blocked or affected.
 *  • "View Package" replays the Package Search page's own booking hand-off
 *    (localStorage draft + new tab), so the existing booking flow runs
 *    unchanged.
 *
 * Nothing here writes to the cart, the wizard state or the search results.
 */
export const PACKAGE_SUGGESTIONS_STORAGE_KEY = "makePkgV2PkgSuggestions";
const SUGGESTIONS_ENDPOINT = "/api/v1/package-booking/suggestions";
const INITIAL_VISIBLE = 6;

const isTruthyFlag = (v) => v === 1 || v === true || v === "1";

const rateOf = (pkg) => {
  const n = parseFloat(String(pkg?.rate || "").replace(/,/g, ""));
  return Number.isNaN(n) ? 0 : n;
};

const nightsOf = (pkg) => {
  const n = parseInt(String(pkg?.duration || "").trim(), 10);
  return Number.isNaN(n) ? null : n;
};

// The search rate is "0" when a package has no priced rate row and no
// legacy basic rate — show that honestly instead of "AED 0".
const hasPrice = (pkg) => rateOf(pkg) > 0;

const formatRate = (pkg) => {
  const n = rateOf(pkg);
  if (n <= 0) return "Price on request";
  const currency = pkg?.currencyName && pkg.currencyName !== "N/A" ? pkg.currencyName : "AED";
  return `${currency} ${n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

// Same role detection PackageSearch / MakeUrOwnPackageV2 use, so an agent
// login carries its own agent id (markup) exactly as on the search page.
const detectAgentRole = () => {
  try {
    const activeRole = (localStorage.getItem("currentActiveRole") || "").trim().toUpperCase();
    const storedRoles = (localStorage.getItem("userRole") || "").toUpperCase();
    return activeRole
      ? activeRole === "AGENT"
      : storedRoles.includes("AGENT") && !storedRoles.includes("ADMIN");
  } catch {
    return false;
  }
};

const readCache = () => {
  try {
    const raw = sessionStorage.getItem(PACKAGE_SUGGESTIONS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const writeCache = (key, items) => {
  try {
    sessionStorage.setItem(
      PACKAGE_SUGGESTIONS_STORAGE_KEY,
      JSON.stringify({ key, items }),
    );
  } catch {
    /* private mode / quota — non-fatal */
  }
};

export default function MyopV2PackageSuggestions({
  enabled,
  criteria,
  checkIn,
  checkOut,
  nightsCount,
  adultCount,
  childCount,
  childAges,
  agentId,
}) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [showAll, setShowAll] = useState(false);

  const isAgentRole = useMemo(detectAgentRole, []);
  // Admin/staff: the agent picked on the criteria form. Agent logins: the
  // agent's own id, resolved exactly as the Package Search page does —
  // localStorage.userId (primed at login) or one /api/personalProfile lookup
  // — so the "starting from" rate carries their markup. Requests wait until
  // that resolution has settled so the query runs once, with the right agent.
  const [selfAgentId, setSelfAgentId] = useState(() => {
    try {
      return localStorage.getItem("userId") || "";
    } catch {
      return "";
    }
  });
  const [selfAgentSettled, setSelfAgentSettled] = useState(
    () => !isAgentRole || !!selfAgentId,
  );
  useEffect(() => {
    if (!isAgentRole || selfAgentId) return undefined;
    const userName =
      localStorage.getItem("UserName") || sessionStorage.getItem("UserName");
    if (!userName) {
      setSelfAgentSettled(true);
      return undefined;
    }
    let cancelled = false;
    axiosInstance
      .get(`/api/personalProfile/${userName}`)
      .then((res) => {
        if (cancelled) return;
        // Settle in the same callback as the id update so both land in one
        // render, independent of how React schedules the flush.
        const idv = res?.data?.id != null ? String(res.data.id) : "";
        if (idv) {
          try {
            localStorage.setItem("userId", idv);
          } catch {
            /* ignore */
          }
          setSelfAgentId(idv);
        }
        setSelfAgentSettled(true);
      })
      .catch(() => {
        if (!cancelled) setSelfAgentSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isAgentRole, selfAgentId]);
  // Same rule as PackageSearch: agent logins always run (and hand off) under
  // their own id; the picked / stored agent only applies to admin & staff.
  const effectiveAgentId = isAgentRole ? selfAgentId : agentId || "";

  const nationalityValue = criteria?.nationality?.value ?? "";
  const totalNights = parseInt(nightsCount, 10) || 0;
  const adults = parseInt(adultCount, 10) || 1;
  const children = parseInt(childCount, 10) || 0;

  // Distinct destinations of the itinerary (first leg wins duplicates);
  // falls back to the single `destination` the criteria form also stores.
  const destinations = useMemo(() => {
    const legs = Array.isArray(criteria?.itinerary) ? criteria.itinerary : [];
    const seen = new Set();
    const out = [];
    legs.forEach((leg) => {
      const d = leg?.selectedDestination;
      if (!d || d.value == null || d.value === "") return;
      const key = String(d.value);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(d);
    });
    if (out.length === 0 && criteria?.destination?.value != null) {
      out.push(criteria.destination);
    }
    return out;
    // criteria is re-created on every parent render; keying on the fields
    // that matter keeps this stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(criteria?.itinerary || null), criteria?.destination?.value]);

  // One Package-Search request per destination — same payload shape and
  // coercions as PackageSearch.handleSearchSubmit. The travel window is the
  // whole trip (check-in → check-out), formatted as the datetime-local
  // strings the backend expects for its travel-window comparison.
  const requests = useMemo(() => {
    if (!checkIn || !checkOut || !selfAgentSettled) return [];
    return destinations.map((d) => ({
      payload: {
        countryId: d.countryId || "",
        cityId: d.value || "",
        agentId: effectiveAgentId || "",
        nationalityId: nationalityValue === null ? "" : nationalityValue,
        arrivalDateTime: `${checkIn}T00:00`,
        departureDateTime: `${checkOut}T23:59`,
        adultCount: adults || 1,
        childCount: children,
      },
      destinationValue: String(d.value),
    }));
  }, [destinations, checkIn, checkOut, effectiveAgentId, nationalityValue, adults, children, selfAgentSettled]);

  // The exact request set is the cache key: unchanged criteria → no re-query.
  const requestKey = useMemo(() => JSON.stringify(requests.map((r) => r.payload)), [requests]);

  useEffect(() => {
    if (!enabled || requests.length === 0) return undefined;

    const cached = readCache();
    if (cached && cached.key === requestKey && Array.isArray(cached.items)) {
      setItems(cached.items);
      setStatus("done");
      return undefined;
    }

    let cancelled = false;
    setStatus("loading");
    setShowAll(false);

    Promise.all(
      requests.map((r) =>
        axiosInstance
          .post(SUGGESTIONS_ENDPOINT, r.payload)
          .then((res) =>
            (Array.isArray(res.data) ? res.data : []).map((pkg) => ({
              ...pkg,
              suggestionDestinationValue: r.destinationValue,
            })),
          )
          .catch((err) => {
            // Recommendation only — never surface an error to the operator
            // or interrupt the wizard.
            console.warn("Package suggestions unavailable:", err?.message || err);
            return null;
          }),
      ),
    ).then((results) => {
      if (cancelled) return;
      const anySucceeded = results.some((r) => r !== null);
      const merged = [];
      const seen = new Set();
      results
        .filter(Boolean)
        .flat()
        .forEach((pkg) => {
          if (!pkg || pkg.packageId == null) return;
          const key = String(pkg.packageId);
          if (seen.has(key)) return;
          seen.add(key);
          merged.push(pkg);
        });
      setItems(merged);
      setStatus(anySucceeded ? "done" : "error");
      // Cache only a complete answer — a leg that failed transiently must be
      // retried the next time the section mounts for the same criteria.
      if (results.every((r) => r !== null)) writeCache(requestKey, merged);
    });

    return () => {
      cancelled = true;
    };
    // `requests` is fully represented by requestKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, requestKey]);

  // Best fits first: packages whose itinerary matches the trip length, then
  // shorter ones, then those the backend flagged as longer than the window;
  // cheapest first within each group (same rate sort the search page uses).
  const sorted = useMemo(() => {
    const group = (pkg) => {
      if (pkg.exceedsTravelWindow) return 2;
      const n = nightsOf(pkg);
      return n != null && totalNights > 0 && n === totalNights ? 0 : 1;
    };
    // Unpriced ("on request") packages go after priced ones in each group.
    const sortRate = (pkg) => (hasPrice(pkg) ? rateOf(pkg) : Number.POSITIVE_INFINITY);
    return [...items].sort(
      (a, b) => group(a) - group(b) || sortRate(a) - sortRate(b),
    );
  }, [items, totalNights]);

  const visible = showAll ? sorted : sorted.slice(0, INITIAL_VISIBLE);

  const handleViewPackage = (pkg) => {
    const destination =
      destinations.find((d) => String(d.value) === String(pkg.suggestionDestinationValue)) ||
      destinations[0] ||
      null;
    const context = buildPackageBookingContext({
      pkg,
      agentId: effectiveAgentId,
      destination,
      nationality: criteria?.nationality || null,
      adultCount: adults,
      childCount: children,
      childAges: Array.isArray(childAges) ? childAges : [],
      noOfRooms: 1,
      arrivalDateTime: checkIn ? `${checkIn}T00:00` : null,
      departureDateTime: checkOut ? `${checkOut}T23:59` : null,
    });
    openPackageBooking(pkg, context);
  };

  if (!enabled || requests.length === 0) return null;

  if (status === "loading") {
    return (
      <div className="myop-v2-suggest-loading small text-muted" role="status">
        <Spinner animation="border" size="sm" className="me-2" />
        Checking for ready-made packages that match your search…
      </div>
    );
  }

  if (sorted.length === 0) return null;

  const tripSummary = [
    destinations.map((d) => String(d.label || "").split(",")[0]).filter(Boolean).join(", "),
    totalNights > 0 ? `${totalNights} night${totalNights === 1 ? "" : "s"}` : "",
    `${adults} adult${adults === 1 ? "" : "s"}${children > 0 ? `, ${children} child${children === 1 ? "" : "ren"}` : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="myop-v2-suggest" aria-labelledby="myop-v2-suggest-title">
      <div className="myop-v2-suggest__header">
        <div className="myop-v2-suggest__title">
          <span className="myop-v2-step-intro__icon">
            <FaSuitcase />
          </span>
          <div>
            <h5 id="myop-v2-suggest-title" className="fw-bold mb-1 d-flex align-items-center flex-wrap gap-2">
              Recommended Existing Packages
              <Badge bg="primary" pill>
                {sorted.length}
              </Badge>
            </h5>
            <div className="text-muted small">
              We found ready-made packages matching your search. You can book one of
              these instantly instead of creating a custom package.
            </div>
          </div>
        </div>
        <div className="myop-v2-suggest__criteria small text-muted">
          <FaCalendarAlt className="text-primary me-1" />
          Matched on {tripSummary}
        </div>
      </div>

      <div className="myop-v2-suggest__grid">
        {visible.map((pkg) => {
          const nights = nightsOf(pkg);
          const fitsExactly = nights != null && totalNights > 0 && nights === totalNights;
          const hotelLabel = pkg.hotelCategory || pkg.hotelName || "";
          const includes = [
            isTruthyFlag(pkg.containHotel) ? { Icon: FaHotel, label: "Hotel" } : null,
            isTruthyFlag(pkg.containCab) ? { Icon: FaCar, label: "Transfers" } : null,
            isTruthyFlag(pkg.containActivity) ? { Icon: FaTicketAlt, label: "Tours" } : null,
          ].filter(Boolean);
          return (
            <article
              key={pkg.packageId}
              className={`myop-v2-result-card myop-v2-suggest-card ${fitsExactly ? "myop-v2-suggest-card--fit" : ""}`.trim()}
            >
              <div className="myop-v2-ratio-16x9 myop-v2-suggest-card__media">
                <img
                  src={resolvePackageImageUrl(pkg.packageImage) || PACKAGE_FALLBACK_IMAGE}
                  alt={pkg.packageName || "Package"}
                  loading="lazy"
                  onError={(e) => {
                    // Guard so an unreachable fallback can't re-trigger itself.
                    if (e.currentTarget.src === PACKAGE_FALLBACK_IMAGE) return;
                    e.currentTarget.src = PACKAGE_FALLBACK_IMAGE;
                  }}
                />
                {pkg.packageType && pkg.packageType !== "N/A" && (
                  <span className="myop-v2-media-badge myop-v2-suggest-card__type" style={{ fontSize: "12px" }}>
                    {pkg.packageType}
                  </span>
                )}
              </div>

              <div className="myop-v2-suggest-card__body">
                <h6 className="myop-v2-suggest-card__name" title={pkg.packageName}>
                  {pkg.packageName || "Package"}
                </h6>

                <div className="myop-v2-suggest-card__line text-muted small">
                  <FaMapMarkerAlt className="text-primary" />
                  <span className="text-truncate">
                    {[pkg.arrivePlace, pkg.arriveCountryName]
                      .filter((v) => v && v !== "N/A")
                      .join(", ") || "Destination on request"}
                  </span>
                </div>

                <div className="myop-v2-suggest-card__chips">
                  {nights != null && (
                    <span className="myop-v2-trip-chip small">
                      <FaCalendarAlt className="text-primary" />
                      {nights} night{nights === 1 ? "" : "s"} / {nights + 1} day{nights + 1 === 1 ? "" : "s"}
                    </span>
                  )}
                  {fitsExactly && (
                    <span className="myop-v2-trip-chip myop-v2-suggest-card__fit small">
                      Fits your {totalNights}-night trip
                    </span>
                  )}
                  {hotelLabel && (
                    <span className="myop-v2-trip-chip small" title={pkg.hotelName || undefined}>
                      <FaBed className="text-primary" />
                      {hotelLabel}
                    </span>
                  )}
                  {pkg.mealPlan && (
                    <span className="myop-v2-trip-chip small">
                      <FaUtensils className="text-primary" />
                      {pkg.mealPlan}
                    </span>
                  )}
                </div>

                {includes.length > 0 && (
                  <div className="myop-v2-suggest-card__includes text-muted" style={{ fontSize: "0.75rem" }}>
                    Includes:{" "}
                    {includes.map(({ Icon, label }) => (
                      <span key={label} className="me-2">
                        <Icon className="me-1" />
                        {label}
                      </span>
                    ))}
                  </div>
                )}

                {pkg.overview && (
                  <p className="myop-v2-suggest-card__desc text-muted small" title={pkg.overview}>
                    {pkg.overview}
                  </p>
                )}

                {pkg.exceedsTravelWindow && (
                  <div
                    className="myop-v2-suggest-card__warning small"
                    title={pkg.travelWindowWarning || undefined}
                  >
                    <FaExclamationTriangle className="text-warning me-1" />
                    Longer than your {totalNights}-night trip
                  </div>
                )}

                <div className="myop-v2-card-footer">
                  <div>
                    {hasPrice(pkg) && (
                      <div className="text-muted" style={{ fontSize: "0.72rem" }}>
                        Starting from
                      </div>
                    )}
                    <div className="fw-bold text-dark" style={{ fontSize: "1.1rem" }}>
                      {formatRate(pkg)}
                    </div>
                    {hasPrice(pkg) && (
                      <div className="text-muted" style={{ fontSize: "0.72rem" }}>
                        {pkg.rateType || "Per Adult"}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    className="myop-v2-suggest-card__cta"
                    onClick={() => handleViewPackage(pkg)}
                    title="Opens the package booking page in a new tab"
                  >
                    View Package
                    <FaExternalLinkAlt className="ms-2" size={11} />
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {sorted.length > INITIAL_VISIBLE && (
        <div className="text-center mt-3">
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Show fewer" : `Show all ${sorted.length} packages`}
          </Button>
        </div>
      )}
    </section>
  );
}
