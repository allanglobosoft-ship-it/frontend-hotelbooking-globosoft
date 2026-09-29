import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Spinner } from "react-bootstrap";
import {
  FaBed,
  FaCalendarAlt,
  FaCheck,
  FaCheckCircle,
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaExclamationTriangle,
  FaExternalLinkAlt,
  FaMapMarkerAlt,
  FaSuitcase,
  FaUtensils,
} from "react-icons/fa";
import axiosInstance from "../AxiosInstance";
import {
  PACKAGE_FALLBACK_IMAGE,
  buildPackageBookingContext,
  openPackageBooking,
  resolvePackageImageUrl,
} from "../../utils/packageBookingHandoff";

/**
 * "Recommended Existing Packages" — read-only suggestion strip rendered on
 * the Make Your Own Package V2 criteria form
 * (/new-booking/make-your-own-package-v2), above "Continue to build your
 * package".
 *
 * How it works
 *  • Once every mandatory field on the form is filled (`enabled`), the
 *    criteria the operator entered (destination(s), travel window, pax,
 *    nationality, agent) are sent to POST /api/v1/package-booking/suggestions
 *    — the Package Search page's matching rules, plus a few display fields.
 *  • The criteria are live form values: queries are debounced while the
 *    operator is still typing, and the previous matches stay on screen
 *    (dimmed) until the new ones arrive, so the form does not jump.
 *    Clearing a mandatory field hides the section again.
 *  • One request per distinct destination in the itinerary (a single-city
 *    trip is one call). Results are merged by packageId.
 *  • Results are cached in sessionStorage under the exact request payload,
 *    so re-mounts and Back/Forward never re-query while the criteria are
 *    unchanged. A refresh of the v2 search page clears the cache along with
 *    the rest of the v2 search state.
 *  • Failures are silent: the section simply does not render, and the
 *    form is never blocked or affected.
 *  • "View" replays the Package Search page's own booking hand-off
 *    (localStorage draft + new tab), so the existing booking flow runs
 *    unchanged.
 *  • Layout: a slim header (title, match count, ‹ › paging, Hide / Show)
 *    over ONE horizontally scrollable row of compact cards, so the box
 *    stays a single short row however many packages match. Hide / Show is
 *    a view preference, kept for the tab session.
 *
 * Nothing here writes to the cart, the criteria form or the build flow.
 */
export const PACKAGE_SUGGESTIONS_STORAGE_KEY = "makePkgV2PkgSuggestions";
// Hide / Show choice. A view preference rather than search state, so it is
// deliberately not part of the wizard's refresh reset.
const COLLAPSED_STORAGE_KEY = "makePkgV2PkgSuggestionsCollapsed";
const SUGGESTIONS_ENDPOINT = "/api/v1/package-booking/suggestions";
// Quiet period after the last criteria edit before querying — long enough to
// cover a date typed digit by digit or a two-digit nights value.
const FETCH_DEBOUNCE_MS = 400;

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

const readCollapsed = () => {
  try {
    return sessionStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const writeCollapsed = (collapsed) => {
  try {
    if (collapsed) sessionStorage.setItem(COLLAPSED_STORAGE_KEY, "1");
    else sessionStorage.removeItem(COLLAPSED_STORAGE_KEY);
  } catch {
    /* private mode / quota — non-fatal */
  }
};

const prefersReducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
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
  const [collapsed, setCollapsed] = useState(readCollapsed);

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
    // Criteria incomplete (e.g. a mandatory field was cleared): drop the old
    // matches so they never reappear against different criteria.
    if (!enabled || requests.length === 0) {
      setItems((prev) => (prev.length === 0 ? prev : []));
      setStatus("idle");
      return undefined;
    }

    const cached = readCache();
    if (cached && cached.key === requestKey && Array.isArray(cached.items)) {
      setItems(cached.items);
      setStatus("done");
      return undefined;
    }

    let cancelled = false;
    setStatus("loading");

    const timer = window.setTimeout(() => {
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
              // or interrupt the form.
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
    }, FETCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
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

  // ── Card row paging ──────────────────────────────────────────────
  // All cards sit in one horizontally scrollable row. The ‹ › buttons page
  // it and only show while the row actually overflows.
  const scrollerRef = useRef(null);
  const detachScrollerRef = useRef(null);
  const [scrollEdges, setScrollEdges] = useState({ atStart: true, atEnd: true });

  const syncScrollEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const atStart = el.scrollLeft <= 1;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    setScrollEdges((prev) =>
      prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd },
    );
  }, []);

  // Callback ref: attaches the scroll / resize listeners when the row
  // mounts and removes them when it unmounts. Updates are batched to one
  // per animation frame, which also keeps ResizeObserver free of
  // "loop limit" warnings.
  const attachScroller = useCallback(
    (el) => {
      if (detachScrollerRef.current) {
        detachScrollerRef.current();
        detachScrollerRef.current = null;
      }
      scrollerRef.current = el;
      if (!el) return;
      let frame = 0;
      const schedule = () => {
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(syncScrollEdges);
      };
      const observer =
        typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
      el.addEventListener("scroll", schedule, { passive: true });
      if (observer) observer.observe(el);
      else window.addEventListener("resize", schedule);
      schedule();
      detachScrollerRef.current = () => {
        window.cancelAnimationFrame(frame);
        el.removeEventListener("scroll", schedule);
        if (observer) observer.disconnect();
        else window.removeEventListener("resize", schedule);
      };
    },
    [syncScrollEdges],
  );

  // A new result set, or Hide → Show, changes what overflows without
  // resizing the row itself.
  useEffect(() => {
    syncScrollEdges();
  }, [sorted, collapsed, syncScrollEdges]);

  const scrollByPage = (direction) => {
    const el = scrollerRef.current;
    if (!el) return;
    // Mandatory scroll-snap lands each page on a card edge. The 0.9 factor
    // brings the card cut off at the edge fully into view.
    el.scrollBy({
      left: direction * el.clientWidth * 0.9,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed(next);
  };

  const isUpdating = status === "loading";

  const handleViewPackage = (pkg) => {
    // While new criteria are being checked the cards on screen belong to
    // the previous criteria; don't hand one off with the new values.
    if (isUpdating) return;
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

  // First query for these criteria: a one-line placeholder. Later queries
  // keep the previous cards on screen (dimmed) instead, so the form below
  // doesn't jump while the operator edits.
  if (isUpdating && sorted.length === 0) {
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

  const hasOverflow = !(scrollEdges.atStart && scrollEdges.atEnd);

  return (
    <section
      className={`myop-v2-suggest${isUpdating ? " is-updating" : ""}`}
      aria-labelledby="myop-v2-suggest-title"
      aria-busy={isUpdating}
    >
      <div className="myop-v2-suggest__header">
        <div className="myop-v2-suggest__title">
          <span className="myop-v2-step-intro__icon myop-v2-suggest__icon" aria-hidden="true">
            <FaSuitcase size={13} />
          </span>
          <h6 id="myop-v2-suggest-title" className="fw-bold mb-0">
            Recommended Existing Packages
          </h6>
          <Badge bg="primary" pill>
            {sorted.length}
          </Badge>
          {isUpdating && (
            <span className="myop-v2-suggest__updating small text-muted" role="status">
              <Spinner animation="border" size="sm" aria-hidden="true" />
              Updating…
            </span>
          )}
        </div>

        <div className="myop-v2-suggest__controls">
          {!collapsed && hasOverflow && (
            <>
              {/* aria-disabled (not disabled) so keyboard focus stays on the
                  button when the row reaches its end. */}
              <button
                type="button"
                className="myop-v2-suggest__nav"
                onClick={() => !scrollEdges.atStart && scrollByPage(-1)}
                aria-disabled={scrollEdges.atStart}
                aria-label="Previous packages"
                title="Previous packages"
              >
                <FaChevronLeft size={12} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="myop-v2-suggest__nav"
                onClick={() => !scrollEdges.atEnd && scrollByPage(1)}
                aria-disabled={scrollEdges.atEnd}
                aria-label="Next packages"
                title="Next packages"
              >
                <FaChevronRight size={12} aria-hidden="true" />
              </button>
            </>
          )}
          <button
            type="button"
            className="myop-v2-suggest__toggle small"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="myop-v2-suggest-body"
          >
            {collapsed ? "Show" : "Hide"}
            <FaChevronDown
              size={11}
              className={`myop-v2-suggest__toggle-icon${collapsed ? "" : " is-open"}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {/* Hidden rather than unmounted, so the toggle's aria-controls always
          points at a real element. */}
      <div id="myop-v2-suggest-body" hidden={collapsed}>
        <p className="myop-v2-suggest__subtitle text-muted small">
          Ready-made packages matching{" "}
          <span className="fw-semibold text-dark">{tripSummary}</span>. Book one
          instantly instead of building a custom package.
        </p>

        <div
          ref={attachScroller}
          className="myop-v2-suggest__scroller thin-scrollbar"
          role="region"
          aria-label="Recommended existing packages"
          tabIndex={0}
        >
          <ul className="myop-v2-suggest__track">
            {sorted.map((pkg) => {
              const nights = nightsOf(pkg);
              const fitsExactly = nights != null && totalNights > 0 && nights === totalNights;
              const hotelLabel = pkg.hotelCategory || pkg.hotelName || "";
              const packageName = pkg.packageName || "Package";
              const nameId = `myop-v2-suggest-name-${pkg.packageId}`;
              const place = [pkg.arrivePlace, pkg.arriveCountryName]
                .filter((v) => v && v !== "N/A")
                .join(", ");
              const durationLabel =
                nights != null
                  ? `${nights} night${nights === 1 ? "" : "s"} / ${nights + 1} day${nights + 1 === 1 ? "" : "s"}`
                  : "";
              const includes = [
                isTruthyFlag(pkg.containHotel) ? "Hotel" : null,
                isTruthyFlag(pkg.containCab) ? "Transfers" : null,
                isTruthyFlag(pkg.containActivity) ? "Tours" : null,
              ].filter(Boolean);
              return (
                <li key={pkg.packageId} className="myop-v2-suggest__item">
                  <article
                    className={`myop-v2-suggest-card${fitsExactly ? " myop-v2-suggest-card--fit" : ""}`}
                    aria-labelledby={nameId}
                  >
                    <div className="myop-v2-suggest-card__media">
                      {/* Decorative: the package name sits right beside it. */}
                      <img
                        src={resolvePackageImageUrl(pkg.packageImage) || PACKAGE_FALLBACK_IMAGE}
                        alt=""
                        loading="lazy"
                        onError={(e) => {
                          // Guard so an unreachable fallback can't re-trigger itself.
                          if (e.currentTarget.src === PACKAGE_FALLBACK_IMAGE) return;
                          e.currentTarget.src = PACKAGE_FALLBACK_IMAGE;
                        }}
                      />
                      {pkg.packageType && pkg.packageType !== "N/A" && (
                        <span
                          className="myop-v2-media-badge myop-v2-suggest-card__type"
                          style={{ fontSize: "0.625rem" }}
                          title={pkg.packageType}
                        >
                          {pkg.packageType}
                        </span>
                      )}
                    </div>

                    <div className="myop-v2-suggest-card__body">
                      {fitsExactly && (
                        <span
                          className="myop-v2-suggest-card__flag myop-v2-suggest-card__flag--fit"
                          style={{ fontSize: "0.72rem" }}
                        >
                          <FaCheckCircle className="flex-shrink-0" aria-hidden="true" />
                          Fits your {totalNights}-night trip
                        </span>
                      )}
                      {pkg.exceedsTravelWindow && (
                        <span
                          className="myop-v2-suggest-card__flag myop-v2-suggest-card__flag--warning"
                          style={{ fontSize: "0.72rem" }}
                          title={pkg.travelWindowWarning || undefined}
                        >
                          <FaExclamationTriangle className="text-warning flex-shrink-0" aria-hidden="true" />
                          Longer than your {totalNights}-night trip
                        </span>
                      )}

                      {/* The overview no longer fits the compact card; it
                          stays available on hover. */}
                      <h6
                        id={nameId}
                        className="myop-v2-suggest-card__name small"
                        title={pkg.overview ? `${packageName}\n\n${pkg.overview}` : packageName}
                      >
                        {packageName}
                      </h6>

                      <div className="myop-v2-suggest-card__line text-muted" style={{ fontSize: "0.75rem" }}>
                        <FaMapMarkerAlt className="text-primary flex-shrink-0" aria-hidden="true" />
                        <span className="text-truncate" title={place || undefined}>
                          {place || "Destination on request"}
                        </span>
                      </div>

                      {(durationLabel || hotelLabel || pkg.mealPlan) && (
                        <div className="myop-v2-suggest-card__chips" style={{ fontSize: "0.72rem" }}>
                          {durationLabel && (
                            <span className="myop-v2-trip-chip" title={durationLabel}>
                              <FaCalendarAlt className="text-primary flex-shrink-0" aria-hidden="true" />
                              <span aria-hidden="true">
                                {nights}N / {nights + 1}D
                              </span>
                              <span className="visually-hidden">{durationLabel}</span>
                            </span>
                          )}
                          {hotelLabel && (
                            <span className="myop-v2-trip-chip" title={pkg.hotelName || hotelLabel}>
                              <FaBed className="text-primary flex-shrink-0" aria-hidden="true" />
                              <span className="text-truncate">{hotelLabel}</span>
                            </span>
                          )}
                          {pkg.mealPlan && (
                            <span className="myop-v2-trip-chip" title={pkg.mealPlan}>
                              <FaUtensils className="text-primary flex-shrink-0" aria-hidden="true" />
                              <span className="text-truncate">{pkg.mealPlan}</span>
                            </span>
                          )}
                        </div>
                      )}

                      {includes.length > 0 && (
                        <div className="myop-v2-suggest-card__includes text-muted" style={{ fontSize: "0.72rem" }}>
                          <span className="visually-hidden">Includes:</span>
                          {includes.map((label) => (
                            <span key={label}>
                              <FaCheck size={9} aria-hidden="true" />
                              {label}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="myop-v2-card-footer">
                        <div className="myop-v2-suggest-card__price">
                          {hasPrice(pkg) ? (
                            <>
                              <div className="text-dark text-nowrap">
                                <span className="text-muted me-1" style={{ fontSize: "0.72rem" }}>
                                  From
                                </span>
                                <span className="fw-bold" style={{ fontSize: "0.95rem" }}>
                                  {formatRate(pkg)}
                                </span>
                              </div>
                              <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                                {pkg.rateType || "Per Adult"}
                              </div>
                            </>
                          ) : (
                            <div className="fw-semibold text-muted" style={{ fontSize: "0.8rem" }}>
                              {formatRate(pkg)}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="primary"
                          size="sm"
                          className="myop-v2-suggest-card__cta"
                          onClick={() => handleViewPackage(pkg)}
                          title="Opens the package booking page in a new tab"
                          aria-label={`View ${packageName} (opens in a new tab)`}
                        >
                          View
                          <FaExternalLinkAlt className="ms-1" size={10} aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
