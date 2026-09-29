import React, { useEffect, useRef, useState } from "react";
import {
  Card,
  Form,
  Row,
  Col,
  Button,
  ProgressBar,
  Spinner,
  Badge,
  Container,
  InputGroup,
} from "react-bootstrap";
import {
  FaSearch,
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaUserFriends,
  FaUtensils,
  FaUserTie,
  FaConciergeBell,
  FaClock,
} from "react-icons/fa";
import Select from "react-select";
import AgentSelect from "../../components/AgentSelect";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { logAgentSearch } from "../../utils/agentSearchLog";
import RestaurantCard from "./RestaurantCard";
import AdvertisementCarousel from "../../components/AdvertisementCarousel";
import AgentCreditBalance from "../../components/AgentCreditBalance";

const MEAL_TYPES = ["Any", "Breakfast", "Lunch", "Dinner", "High Tea"];
const today = () => new Date().toISOString().slice(0, 10);

/**
 * 30-minute time slot list (08:00 → 23:30). Backend filters against the
 * restaurant's open/close window, so any picked slot outside a venue's hours
 * simply drops it from the result.
 */
const TIME_SLOTS = (() => {
  const out = [];
  for (let h = 8; h <= 23; h++) {
    for (const m of [0, 30]) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
})();

/** "19:30" → "07:30 PM" */
const formatSlot = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = ((h + 11) % 12) + 1;
  return `${String(hr).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
};

/**
 * Restaurant Booking — search criteria + result list.
 *
 * Mirrors the HotelSearch.jsx pattern:
 *   - Destination: typeahead against /api/province (debounced).
 *   - Agent:       /api/agent dropdown of companies.
 *
 * Validation errors render inline beside each field. On valid submit, a
 * 3-second progress bar runs while the backend search is in flight.
 */
const RestaurantSearch = () => {
  const navigate = useNavigate();

  // Agent logins book under themselves — the backend forces the booking to
  // the logged-in agent, so the manual Agent picker is hidden and the
  // agent-required validation is skipped. currentActiveRole isn't set for
  // single-role logins, so fall back to userRole; admin/super-admin/staff
  // keep the picker exactly as before.
  const activeRole = (localStorage.getItem("currentActiveRole") || "")
    .trim()
    .toUpperCase();
  const storedRoles = (localStorage.getItem("userRole") || "").toUpperCase();
  const isAgentRole = activeRole
    ? activeRole === "AGENT"
    : storedRoles.includes("AGENT") && !storedRoles.includes("ADMIN");

  // Re-hydrate the form from sessionStorage when present — happens when
  // the user pressed "Back" on the booking page. Falls back to sensible
  // defaults on a fresh visit.
  const restoredCriteria = (() => {
    try {
      const raw = sessionStorage.getItem("restaurantSearchCriteria");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();
  const [form, setForm] = useState({
    bookingDate: restoredCriteria?.bookingDate || today(),
    bookingTime: restoredCriteria?.bookingTime || "19:00",
    // Combined destination/province typeahead pick (mirrors
    // RestaurantRegistration.jsx). Shape: { value, label, id, source }.
    destination: restoredCriteria?.destination || null,
    countryId: restoredCriteria?.countryId || "",
    countryName: restoredCriteria?.countryName || "",
    agentId: restoredCriteria?.agentId || "",
    agentName: restoredCriteria?.agentName || "",
    memberCount: restoredCriteria?.memberCount || 2,
    mealType: restoredCriteria?.mealType || "Any",
  });

  // Country dropdown — populated from /api/country. Country is now
  // INDEPENDENT of the City/Place typeahead (it just forwards countryId
  // in the search payload).
  const [countries, setCountries] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(false);

  const [agents, setAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  // Available credit limit for the picked agent — surfaced below the dropdown
  // (matches HotelSearch.jsx pattern) and forwarded to the booking page so
  // the credit-check popup can render the up-to-date number.
  const [agentBalance, setAgentBalance] = useState(null);
  const [agentBalanceLoading, setAgentBalanceLoading] = useState(false);
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [destinationLoading, setDestinationLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  // When results are on screen the big search form collapses into a sticky
  // summary strip. Clicking "Modify Search" flips this true to re-expand it.
  const [isEditingSearch, setIsEditingSearch] = useState(false);
  const [errors, setErrors] = useState({});
  const resultsRef = useRef(null);

  // After a fresh search, jump the viewport to the results so the operator
  // sees them without having to scroll past the search card. Fires once the
  // initial result set arrives (or the loading spinner appears, whichever
  // comes first), so the operator always lands on the right region.
  useEffect(() => {
    if (!hasSearched) return;
    const id = window.setTimeout(() => {
      if (resultsRef.current) {
        resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
    return () => window.clearTimeout(id);
  }, [hasSearched, loading, results.length]);
  /** Result layout — "grid" shows 3-up cards, "list" shows horizontal rows. */
  const [viewMode, setViewMode] = useState("grid");
  /** Cuisine-type filter selected from the left sidebar. Each entry is
   *  a cuisine string. Empty array = no filter applied. Toggling these
   *  re-calls /api/restaurant/search with `cuisineTypes` in the payload so
   *  the backend returns only matching restaurants. */
  const [cuisineFilter, setCuisineFilter] = useState([]);
  /** Cuisine options shown in the left sidebar. Captured from the very
   *  first search (no cuisine filter) so the list of options does NOT
   *  shrink as the user narrows the filter — otherwise selecting
   *  "Italian" would hide all the other cuisine checkboxes the moment
   *  the backend returned only Italian restaurants. */
  const [cuisineOptions, setCuisineOptions] = useState([]);
  /** Sidebar checkbox — when ON, post-filter the loaded result list to
   *  restaurants where isInsideHotel === true. In-memory only — does NOT
   *  re-call the search API. Replaces the old "Restaurant Type" radio
   *  group that used to live on the search form. */
  const [restaurantInHotelOnly, setRestaurantInHotelOnly] = useState(false);

  /** Load agents from /api/agent — same source HotelSearch uses. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAgentsLoading(true);
      try {
        const res = await axiosInstance.get("/api/agent?activeOnly=true");
        if (!cancelled) setAgents(Array.isArray(res.data) ? res.data : []);
      } catch (e) {
        if (!cancelled) setAgents([]);
      } finally {
        if (!cancelled) setAgentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Load an initial slice of countries from /api/country on mount so the
   *  dropdown isn't empty before the user types. Subsequent keystrokes
   *  refine the list via the debounced searchCountries() below. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCountriesLoading(true);
      try {
        const res = await axiosInstance.get("/api/country");
        if (!cancelled)
          setCountries(Array.isArray(res.data) ? res.data : res.data?.content || []);
      } catch (e) {
        if (!cancelled) setCountries([]);
      } finally {
        if (!cancelled) setCountriesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Debounced country lookup — refines the dropdown as the user types.
   *  Hits /api/country?search=<term>. Mirrors the pattern used for the
   *  destination/province search below. */
  const countryDebounceRef = useRef(null);
  const searchCountries = (input) => {
    if (countryDebounceRef.current) clearTimeout(countryDebounceRef.current);
    countryDebounceRef.current = setTimeout(async () => {
      setCountriesLoading(true);
      try {
        const q = input ? `?search=${encodeURIComponent(input)}` : "";
        const res = await axiosInstance.get(`/api/country${q}`);
        const list = Array.isArray(res.data) ? res.data : res.data?.content || [];
        setCountries(list);
      } catch (e) {
        setCountries([]);
      } finally {
        setCountriesLoading(false);
      }
    }, 300);
  };

  /** Load the City/Place options for ONE country. The picker is
   *  country-scoped — it never loads the full master list. Two sources,
   *  kept as separate groups:
   *    - Places  (POST /api/destination/getCitiesByCountryId/{id}) — each
   *      place carries its parent state in `state`, rendered as
   *      "Place / State" (e.g. "Kochi / Kerala").
   *    - States  (GET /api/province?countryId={id}) — rendered as the bare
   *      state name (e.g. "Kerala").
   *  Each option keeps its (destinationId, placeSource = DESTINATION|PROVINCE)
   *  so the search payload contract is unchanged. */
  const loadPlacesByCountry = async (countryId) => {
    if (!countryId) {
      setDestinationOptions([]);
      return;
    }
    setDestinationLoading(true);
    try {
      const [placeRes, stateRes] = await Promise.all([
        axiosInstance
          .post(`/api/destination/getCitiesByCountryId/${countryId}`)
          .catch(() => ({ data: [] })),
        axiosInstance
          .get(`/api/province?countryId=${countryId}&page=0&limit=50&search=`)
          .catch(() => ({ data: [] })),
      ]);
      const placeRows = Array.isArray(placeRes.data)
        ? placeRes.data
        : placeRes.data?.content || [];
      const stateRows = Array.isArray(stateRes.data)
        ? stateRes.data
        : stateRes.data?.content || [];
      const placeOpts = placeRows
        .filter((p) => !p.isDeleted)
        .map((p) => {
          const placeName = p.name || `Place #${p.id}`;
          const stateName = p.state || p.stateName || "";
          // "Place / State" — fall back to just the place when no parent
          // state is resolved.
          const label = stateName ? `${placeName} / ${stateName}` : placeName;
          return {
            value: `DESTINATION:${p.id}`,
            id: p.id,
            source: "DESTINATION",
            label,
            stateName: placeName,
          };
        });
      const stateOpts = stateRows
        .filter((s) => !s.isDeleted)
        .map((s) => {
          const name = s.stateName || s.name || `State #${s.id}`;
          return {
            value: `PROVINCE:${s.id}`,
            id: s.id,
            source: "PROVINCE",
            label: name,
            stateName: name,
          };
        });
      setDestinationOptions([
        { label: "Cities", options: stateOpts },
        { label: "Places", options: placeOpts },
      ]);
    } catch {
      setDestinationOptions([]);
    } finally {
      setDestinationLoading(false);
    }
  };

  /** On mount, if the form was re-hydrated from a previous search that
   *  already had a country, pre-load that country's City/Place options so
   *  the restored selection shows correctly. Fresh visits load nothing
   *  until a country is picked. */
  useEffect(() => {
    if (form.countryId) loadPlacesByCountry(form.countryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch the picked agent's available credit limit. Hits the same
  // /api/agent-credit-limit/agent/{id} endpoint HotelSearch uses so the
  // number is always consistent across booking flows.
  useEffect(() => {
    if (!form.agentId) {
      setAgentBalance(null);
      return;
    }
    let cancelled = false;
    setAgentBalanceLoading(true);
    axiosInstance
      .get(`/api/agent-credit-limit/agent/${form.agentId}`)
      .then((res) => {
        if (!cancelled)
          setAgentBalance(res?.data?.availableCreditLimit ?? null);
      })
      .catch(() => !cancelled && setAgentBalance(null))
      .finally(() => !cancelled && setAgentBalanceLoading(false));
    return () => {
      cancelled = true;
    };
  }, [form.agentId]);

  const setField = (name, value) => {
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  /** Country picker — OPTIONAL. Independent of the City/Place typeahead
   *  (no city fetch is triggered). countryId is forwarded on the search
   *  payload when present. */
  const onCountryChange = (e) => {
    const id = e.target.value;
    const country = countries.find((c) => String(c.id) === String(id));
    setForm((p) => ({
      ...p,
      countryId: id,
      countryName: country?.name || country?.countryName || "",
    }));
    if (errors.countryId)
      setErrors((prev) => ({ ...prev, countryId: "" }));
  };

  const onAgentChange = (e) => {
    const id = e.target.value;
    const agent = agents.find((a) => String(a.id) === String(id));
    setForm((p) => ({
      ...p,
      agentId: id,
      agentName: agent?.companyName || "",
    }));
    if (errors.agentId) setErrors((prev) => ({ ...prev, agentId: "" }));
  };

  const validate = () => {
    const err = {};
    if (!form.bookingDate) err.bookingDate = "Booking date is required";
    else if (form.bookingDate < today()) err.bookingDate = "Booking date cannot be in the past";
    // Country must be picked first — it scopes the City/Place list.
    if (!form.countryId) err.countryId = "Country is required";
    // City/Place is required and is loaded only for the chosen country.
    if (!form.destination)
      err.destination = "City / Place is required";
    if (!isAgentRole && !form.agentId) err.agentId = "Agent is required";
    if (!form.memberCount || Number(form.memberCount) < 1)
      err.memberCount = "At least 1 member";
    return err;
  };

  /**
   * Build the search payload from the current form. The optional
   * {@code cuisines} arg is sent as `cuisineTypes` on the request so the
   * backend can apply server-side cuisine filtering. Kept as a separate
   * helper so both the submit handler and the cuisine-toggle effect can
   * call the same /api/restaurant/search endpoint.
   */
  const buildPayload = (cuisines) => ({
    bookingDate: form.bookingDate,
    bookingTime: form.bookingTime,
    // Legacy free-text destination — kept so older rows that only
    // have the `place` column still match.
    destination: form.destination?.stateName || form.destination?.label,
    // Preferred filter — the picked option carries both the FK and
    // the source ("DESTINATION" | "PROVINCE") so the backend can
    // match against the right master table.
    destinationId: form.destination?.id || null,
    placeSource: form.destination?.source || null,
    // Country is an independent optional filter — forwarded when set.
    countryId: form.countryId ? Number(form.countryId) : null,
    agentId: Number(form.agentId) || null,
    memberCount: Number(form.memberCount),
    mealType: form.mealType === "Any" ? null : form.mealType,
    cuisineTypes:
      Array.isArray(cuisines) && cuisines.length ? cuisines : null,
  });

  /**
   * Call /api/restaurant/search.
   * @param {string[]} cuisines  cuisine filter to apply (empty = none)
   * @param {object}   opts
   * @param {boolean}  opts.withProgress  show the 3-second progress card
   * @param {boolean}  opts.captureOptions  refresh the sidebar cuisine list
   *   from this response (used on the initial search only — otherwise the
   *   sidebar would shrink as the filter narrows results).
   */
  const runSearch = async (cuisines, { withProgress = false, captureOptions = false } = {}) => {
    setLoading(true);
    setHasSearched(true);
    setIsEditingSearch(false);
    setResults([]);

    let interval = null;
    if (withProgress) {
      setProgress(0);
      const start = Date.now();
      interval = setInterval(() => {
        setProgress(
          Math.min(95, Math.round(((Date.now() - start) / 3000) * 100))
        );
      }, 100);
      // Hold the spinner visible for ~3s on the very first search so the
      // user sees the progress card before results appear.
     // await new Promise((r) => setTimeout(r, 3000));
    }

    try {
      // Agent search log (Unbooked Opportunities → Searches tab) — one
      // event per admin-visible search action. Cuisine-toggle re-fires
      // are OK: the backend upserts on a hash of the context, so a
      // repeat inside the dedupe window only bumps lastSeenAt.
      logAgentSearch({
        agentId: Number(form.agentId) || null,
        agentName: form.agentName,
        destinationId: form.destination?.id,
        destinationLabel:
          form.destination?.stateName || form.destination?.label,
        checkIn: form.bookingDate,
        checkOut: form.bookingDate,
        source: "restaurant",
      });

      const res = await axiosInstance.post(
        "/api/restaurant/search",
        buildPayload(cuisines)
      );
      const data = Array.isArray(res.data) ? res.data : res.data?.content || [];
      setResults(data);
      if (captureOptions) {
        // Snapshot the cuisine list off the unfiltered response so the
        // sidebar checkboxes don't disappear when the user narrows the
        // filter on subsequent calls.
        const seen = new Map();
        for (const r of data) {
          for (const c of r?.cuisineTypes || []) {
            if (!c) continue;
            const norm = String(c).trim().toLowerCase();
            if (!norm || seen.has(norm)) continue;
            seen.set(norm, String(c).trim());
          }
        }
        setCuisineOptions(
          Array.from(seen.values()).sort((a, b) => a.localeCompare(b))
        );
      }
    } catch (err) {
      console.error(err);
      toast.error("Search failed — please try again.");
      setResults([]);
    } finally {
      if (interval) {
        clearInterval(interval);
        setProgress(100);
        setTimeout(() => setLoading(false), 250);
      } else {
        setLoading(false);
      }
    }
  };

  const handleSearch = (e) => {
    e?.preventDefault();
    const err = validate();
    setErrors(err);
    if (Object.keys(err).length) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    // Persist the current criteria so the Back button on the booking page
    // can re-hydrate this screen with the same inputs.
    try {
      sessionStorage.setItem("restaurantSearchCriteria", JSON.stringify(form));
    } catch (_) {}
    // Reset any active cuisine filter — a brand-new search starts from
    // the full result set. Pass `captureOptions: true` so the sidebar
    // re-builds from this unfiltered response.
    setCuisineFilter([]);
    runSearch([], { withProgress: true, captureOptions: true });
  };

  // Re-run the search on the server whenever the cuisine filter changes
  // AFTER the initial search has fired. The cuisine list itself stays
  // snapshotted in `cuisineOptions` (set on the initial search) so the
  // sidebar doesn't shrink as the filter narrows the result set.
  useEffect(() => {
    if (!hasSearched) return;
    runSearch(cuisineFilter, { withProgress: false, captureOptions: false });
  }, [cuisineFilter]); // eslint-disable-line

  const toggleCuisineFilter = (c) =>
    setCuisineFilter((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );

  const goToBooking = (restaurant) => {
    navigate("/new-booking/restaurant/booking", {
      state: {
        restaurant,
        bookingDate: form.bookingDate,
        bookingTime: form.bookingTime,
        memberCount: form.memberCount,
        mealType: form.mealType,
        agentId: form.agentId,
        agentName: form.agentName,
        // Pass through the live balance so the booking page can render the
        // credit warning popup without re-fetching it.
        agentBalance,
      },
    });
  };

  const goToView = (restaurant) => {
    navigate(`/restaurant/view/${restaurant.id}`, { state: { restaurant } });
  };

  // react-select style override that renders invalid state inline.
  const rsStyles = (isInvalid) => ({
    control: (base, state) => ({
      ...base,
      minHeight: 42,
      borderColor: isInvalid ? "#dc3545" : state.isFocused ? "#86b7fe" : "#ced4da",
      boxShadow: state.isFocused
        ? isInvalid
          ? "0 0 0 .25rem rgba(220,53,69,.25)"
          : "0 0 0 .25rem rgba(13,110,253,.25)"
        : "none",
      "&:hover": { borderColor: isInvalid ? "#dc3545" : "#86b7fe" },
    }),
    menu: (base) => ({ ...base, zIndex: 9999 }),
    // When rendered through `menuPortalTarget`, this ensures the floating
    // list stays above the sibling Search button (which would otherwise
    // overlap it because it lives inside a Card with its own stacking
    // context).
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  });

  /** Post-filter the loaded result list with the in-memory sidebar
   *  filters (currently just the "Restaurant in Hotel" checkbox). Does
   *  NOT re-call the search API. Cuisine filtering still runs on the
   *  server because the option list is captured off the initial search. */
  const visibleResults = restaurantInHotelOnly
    ? results.filter((r) => r?.isInsideHotel === true)
    : results;

  const collapseSearch = hasSearched && !isEditingSearch;

  return (
    <div
      className="min-vh-100 bg-gradient-light d-flex flex-column"
      style={{ background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)" }}
    >
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4 hs-page">
          <Container fluid>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div>
                <h2 className="text-primary mb-1">
                  <FaConciergeBell className="me-2" />
                  Restaurant Booking
                </h2>
                <p className="text-muted mb-0">
                  Search restaurants by destination and book a table for your guests.
                </p>
              </div>
              {/* Agent logins see their available credit balance at the
                  right end of the heading row (renders nothing for other
                  roles). */}
              <AgentCreditBalance />
            </div>

            {/* ── Search Card + Ads ── */}
            {collapseSearch && (
              <div className="hs-summary-bar">
                <div className="hs-summary-chips">
                  {form.destination?.label && (
                    <span className="hs-summary-chip hs-summary-chip-main">
                      <FaMapMarkerAlt className="me-1" />
                      {form.destination.label}
                    </span>
                  )}
                  {form.bookingDate && (
                    <span className="hs-summary-chip">
                      <FaCalendarAlt className="me-1" />
                      {form.bookingDate}
                    </span>
                  )}
                  {form.memberCount && (
                    <span className="hs-summary-chip">
                      <FaUserFriends className="me-1" />
                      {form.memberCount} {Number(form.memberCount) === 1 ? "Member" : "Members"}
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  className="hs-summary-modify"
                  onClick={() => {
                    setIsEditingSearch(true);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <FaSearch className="me-2" />
                  Modify Search
                </Button>
              </div>
            )}

            {!collapseSearch && (
            <div className="d-flex gap-3 align-items-start mb-4 hs-search-ads-row">
             <div className="flex-grow-1" style={{ minWidth: 0 }}>
            {/* Search form card */}
            <Card className="shadow-lg border-0 rounded-4 h-100">
              <Card.Header className="bg-gradient-primary text-white border-0 rounded-top-4">
                <h5 className="mb-0 d-flex align-items-center">
                  <FaSearch className="me-2" />
                  Search Criteria
                </h5>
              </Card.Header>
              <Card.Body className="p-4">
                <Form onSubmit={handleSearch} noValidate>
                  <Row className="g-3">
                    {/* Agent — placed first per layout request. Hidden for
                        agent logins (they book under themselves). */}
                    {!isAgentRole && (
                    <Col lg={4} md={6}>
                      <Form.Label className="fw-semibold text-dark">
                        <FaUserTie className="me-1 text-info" /> Agent *
                      </Form.Label>
                      <AgentSelect
                        agents={agents}
                        value={form.agentId}
                        isInvalid={!!errors.agentId}
                        placeholder={agentsLoading ? "Loading agents..." : "Select Agent"}
                        onChange={(v) =>
                          onAgentChange({ target: { value: v } })
                        }
                      />
                      {errors.agentId && (
                        <div className="text-danger small mt-1">{errors.agentId}</div>
                      )}
                      {/* Available credit-limit indicator — appears as soon as
                          an agent is picked. Mirrors HotelSearch.jsx. */}
                      {form.agentId && (
                        <div className="mt-1 small">
                          {agentBalanceLoading ? (
                            <span className="text-muted">Loading available balance…</span>
                          ) : agentBalance != null ? (
                            <span className="fw-semibold" style={{ color: "#dc3545" }}>
                              Available Balance: {Number(agentBalance).toFixed(2)} AED
                            </span>
                          ) : (
                            <span className="text-muted">Available balance unavailable</span>
                          )}
                        </div>
                      )}
                    </Col>
                    )}

                    <Col lg={4} md={6}>
                      <Form.Label className="fw-semibold text-dark">
                        <FaCalendarAlt className="me-1 text-primary" /> Booking Date *
                      </Form.Label>
                      <Form.Control
                        type="date"
                        value={form.bookingDate}
                        onChange={(e) => setField("bookingDate", e.target.value)}
                        min={today()}
                        isInvalid={!!errors.bookingDate}
                        style={{ height: "42px" }}
                      />
                      <Form.Control.Feedback type="invalid">{errors.bookingDate}</Form.Control.Feedback>
                    </Col>

                    {/* Country — REQUIRED. Drives the City/Place list:
                        picking a country loads only that country's
                        cities/places and clears any prior City/Place pick.
                        Search-as-you-type hits /api/country?search=<term>
                        (debounced) so the dropdown stays responsive. */}
                    <Col lg={4} md={6}>
                      <Form.Label className="fw-semibold text-dark">
                        <FaMapMarkerAlt className="me-1 text-danger" /> Country *
                      </Form.Label>
                      <Select
                        placeholder={countriesLoading ? "Loading countries..." : "Select Country"}
                        isClearable
                        isSearchable
                        isLoading={countriesLoading}
                        options={countries.map((c) => ({
                          value: c.id,
                          label: c.name || c.countryName || `Country #${c.id}`,
                        }))}
                        value={
                          form.countryId
                            ? {
                                value: form.countryId,
                                label:
                                  form.countryName ||
                                  countries.find(
                                    (c) => String(c.id) === String(form.countryId)
                                  )?.name ||
                                  `Country #${form.countryId}`,
                              }
                            : null
                        }
                        onInputChange={(input, meta) => {
                          if (meta?.action === "input-change") {
                            searchCountries(input);
                          }
                        }}
                        onChange={(opt) => {
                          const nextId = opt?.value || "";
                          // Country drives the City/Place list — clear the
                          // prior City/Place pick whenever the country changes.
                          setForm((p) => ({
                            ...p,
                            countryId: nextId,
                            countryName: opt?.label || "",
                            destination: null,
                          }));
                          setErrors((prev) => ({
                            ...prev,
                            countryId: "",
                            destination: "",
                          }));
                          loadPlacesByCountry(nextId);
                        }}
                        menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                        styles={rsStyles(!!errors.countryId)}
                      />
                      {errors.countryId && (
                        <div className="text-danger small mt-1">{errors.countryId}</div>
                      )}
                    </Col>

                    {/* City / Place — country-scoped list (destinations +
                        provinces for the picked country only). Disabled until
                        a country is chosen. Picked option stores
                        destinationId + placeSource on the form so the backend
                        resolves the right master table — payload unchanged. */}
                    <Col lg={4} md={6}>
                      <Form.Label className="fw-semibold text-dark">
                        <FaMapMarkerAlt className="me-1 text-danger" /> City / Place *
                      </Form.Label>
                      <Select
                        placeholder={
                          !form.countryId
                            ? "Select a country first"
                            : destinationLoading
                            ? "Loading places..."
                            : "Search place or city..."
                        }
                        isClearable
                        isSearchable
                        isDisabled={!form.countryId}
                        options={destinationOptions}
                        isLoading={destinationLoading}
                        value={form.destination}
                        onChange={(opt) => {
                          setForm((p) => ({ ...p, destination: opt || null }));
                          if (errors.destination)
                            setErrors((prev) => ({ ...prev, destination: "" }));
                        }}
                        menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                        styles={rsStyles(!!errors.destination)}
                      />
                      {errors.destination && (
                        <div className="text-danger small mt-1">{errors.destination}</div>
                      )}
                    </Col>

                    <Col lg={4} md={6}>
                      <Form.Label className="fw-semibold text-dark">
                        <FaUserFriends className="me-1 text-success" /> Members *
                      </Form.Label>
                      <Form.Control
                        type="number"
                        min={1}
                        value={form.memberCount}
                        onChange={(e) => setField("memberCount", e.target.value)}
                        isInvalid={!!errors.memberCount}
                        style={{ height: "42px" }}
                      />
                      <Form.Control.Feedback type="invalid">{errors.memberCount}</Form.Control.Feedback>
                    </Col>

                    <Col lg={12} md={12} className="d-flex align-items-end">
                      <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        className="w-100 rounded-pill d-flex align-items-center justify-content-center"
                        disabled={loading}
                      >
                        {loading ? (
                          <>
                            <Spinner
                              as="span"
                              animation="border"
                              size="sm"
                              role="status"
                              aria-hidden="true"
                              className="me-2"
                            />
                            Searching…
                          </>
                        ) : (
                          <>
                            <FaSearch className="me-2" /> Search Restaurants
                          </>
                        )}
                      </Button>
                    </Col>
                  </Row>
                </Form>
              </Card.Body>
            </Card>
             </div>
             {/* Ads carousel — city matches first, then all active ads.
                 The option's `value` is a prefixed string ("DESTINATION:42"
                 / "PROVINCE:7") for the form payload; pass the raw numeric
                 `id` to the ad endpoint so the backend can match cityId
                 (and fall back to all active ads when there's no match). */}
             {!hasSearched && (
             <AdvertisementCarousel
               cityId={form.destination?.id}
               cityName={form.destination?.label}
             />
             )}
            </div>
            )}

            <div ref={resultsRef}>
            {/* Progress while searching */}
            {loading && (
              <Card className="shadow-sm border-0 rounded-4 mb-3">
                <Card.Body className="text-center py-4">
                  <Spinner animation="border" variant="primary" className="mb-2" />
                  <div className="mb-2 fw-semibold">Finding the best restaurants...</div>
                  <ProgressBar
                    animated
                    striped
                    variant="primary"
                    now={progress}
                    label={`${progress}%`}
                  />
                </Card.Body>
              </Card>
            )}

            {/* Empty state — only shown when the very first search
                returned nothing, i.e. there are no cuisine options to
                offer either. Once we have a sidebar populated, any
                "no matches" message renders inside the results column
                so the user can still toggle the cuisine filter off. */}
            {!loading && hasSearched && results.length === 0 && cuisineOptions.length === 0 && (
              <Card className="shadow-sm border-0 rounded-4">
                <Card.Body className="text-center text-muted py-5">
                  <FaUtensils size={48} className="mb-2 opacity-50" />
                  <h6 className="mb-1">No restaurants found</h6>
                  <small>Try changing the destination or member count.</small>
                </Card.Body>
              </Card>
            )}

            {/* Results — two-column layout: sidebar cuisine filter (left)
                + result cards (right). Mirrors HotelSearch.jsx pattern.
                Shown whenever the initial search produced at least one
                cuisine option, so the user can adjust the cuisine filter
                even when the current filtered result set is empty. */}
            {!loading && hasSearched && cuisineOptions.length > 0 && (
              <Row className="g-3">
                {/* LEFT — cuisine filter sidebar */}
                <Col lg={3} md={4} className="d-none d-md-block">
                  <div style={{ position: "sticky", top: 16 }}>
                    <Card className="shadow-sm rounded-4">
                      <Card.Header className="bg-white fw-semibold d-flex justify-content-between align-items-center">
                        <span>
                          <FaUtensils className="me-2 text-warning" />
                          Cuisine
                        </span>
                        {cuisineFilter.length > 0 && (
                          <Button
                            variant="link"
                            size="sm"
                            className="p-0 text-decoration-none"
                            onClick={() => setCuisineFilter([])}
                          >
                            Clear
                          </Button>
                        )}
                      </Card.Header>
                      <Card.Body className="p-2" style={{ maxHeight: 480, overflowY: "auto" }}>
                        {cuisineOptions.length === 0 ? (
                          <div className="text-muted small p-2">
                            No cuisine tags on these results.
                          </div>
                        ) : (
                          cuisineOptions.map((c) => (
                            <Form.Check
                              key={c}
                              type="checkbox"
                              id={`cuisine-${c}`}
                              label={c}
                              checked={cuisineFilter.includes(c)}
                              onChange={() => toggleCuisineFilter(c)}
                              className="mb-1"
                            />
                          ))
                        )}
                      </Card.Body>
                    </Card>

                    {/* Restaurant Type — in-memory post-filter applied
                        to the loaded result list. Checking the box keeps
                        only restaurants where isInsideHotel === true.
                        Does NOT re-call the search API. */}
                    <Card className="shadow-sm rounded-4 mt-3">
                      <Card.Header className="bg-white fw-semibold d-flex justify-content-between align-items-center">
                        <span>
                          <FaUtensils className="me-2 text-warning" />
                          Restaurant Type
                        </span>
                        {restaurantInHotelOnly && (
                          <Button
                            variant="link"
                            size="sm"
                            className="p-0 text-decoration-none"
                            onClick={() => setRestaurantInHotelOnly(false)}
                          >
                            Clear
                          </Button>
                        )}
                      </Card.Header>
                      <Card.Body className="p-2">
                        <Form.Check
                          type="checkbox"
                          id="restaurant-in-hotel-only"
                          label="Restaurant in Hotel"
                          checked={restaurantInHotelOnly}
                          onChange={(e) =>
                            setRestaurantInHotelOnly(e.target.checked)
                          }
                          className="mb-1"
                        />
                      </Card.Body>
                    </Card>
                  </div>
                </Col>

                {/* RIGHT — result list */}
                <Col lg={9} md={8}>
                  <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <h5 className="mb-0">
                      <Badge bg="primary" className="me-2">
                        {visibleResults.length}
                      </Badge>
                      {cuisineFilter.length
                        ? `restaurants · filtered by ${cuisineFilter.join(", ")}`
                        : `restaurants in ${
                            form.destination?.label ||
                            form.countryName ||
                            ""
                          }`}
                      {restaurantInHotelOnly && (
                        <span className="text-muted small ms-2">
                          · in-hotel only
                        </span>
                      )}
                    </h5>
                    {/* Grid / List view toggle — same pattern as RoomList.jsx */}
                    <div className="btn-group shadow-sm gap-1" role="group" aria-label="View mode">
                      <Button
                        variant={viewMode === "grid" ? "primary" : "outline-primary"}
                        onClick={() => setViewMode("grid")}
                        size="sm"
                        className="d-flex align-items-center gap-2"
                        aria-pressed={viewMode === "grid"}
                      >
                        <span className="fs-5" style={{ lineHeight: 1 }}>⊞</span>
                      </Button>
                      <Button
                        variant={viewMode === "list" ? "primary" : "outline-primary"}
                        onClick={() => setViewMode("list")}
                        size="sm"
                        className="d-flex align-items-center gap-2"
                        aria-pressed={viewMode === "list"}
                      >
                        <span className="fs-5" style={{ lineHeight: 1 }}>☰</span>
                      </Button>
                    </div>
                  </div>

                  {visibleResults.length === 0 ? (
                    <Card className="shadow-sm border-0 rounded-4">
                      <Card.Body className="text-center text-muted py-5">
                        <FaUtensils size={48} className="mb-2 opacity-50" />
                        <h6 className="mb-1">No restaurants match these filters</h6>
                        <small>
                          {restaurantInHotelOnly
                            ? "Uncheck \"Restaurant in Hotel\" or pick a different destination."
                            : cuisineFilter.length
                            ? "Clear the cuisine filter to see all results."
                            : "Try a different destination or date."}
                        </small>
                      </Card.Body>
                    </Card>
                  ) : (
                    <Row className="g-3">
                      {visibleResults.map((r) => (
                        <Col
                          key={r.id}
                          md={viewMode === "grid" ? 6 : 12}
                          lg={viewMode === "grid" ? 6 : 12}
                        >
                          <RestaurantCard
                            restaurant={r}
                            viewMode={viewMode}
                            onView={() => goToView(r)}
                            onBook={() => goToBooking(r)}
                          />
                        </Col>
                      ))}
                    </Row>
                  )}
                </Col>
              </Row>
            )}
            </div>
          </Container>
        </main>
      </div>
    </div>
  );
};

export default RestaurantSearch;
