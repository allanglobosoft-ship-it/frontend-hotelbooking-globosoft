/**
 * MeetAndSpaceSearch.jsx
 *
 * Search page for the "Meet & Space" booking flow.
 *
 * UI styled after HotelSearch.jsx (search-card-modern card, form-control-modern
 * inputs at 42px height, react-select dropdowns with menuPortal, inline
 * field-level error display, centered btn-search-modern submit button).
 *
 * Collects:
 *   - Agent          : Form.Select bound to /api/agent — shows companyName
 *                      and surfaces available credit-limit balance.
 *   - Nationality    : react-select bound to /api/country — drives state/city
 *                      filtering on the downstream booking page.
 *   - Booking date / start / end / attendees / space type / layout /
 *     keyword / rate plan.
 *
 * Backend: POST /api/meet-and-space/search
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Row,
  Col,
  Card,
  Button,
  Form,
  Spinner,
  Badge,
} from "react-bootstrap";
import {
  FaSearch,
  FaUsers,
  FaMapMarkerAlt,
  FaArrowRight,
} from "react-icons/fa";
import Select from "react-select";
import AgentSelect from "../../../components/AgentSelect";
import axiosInstance from "../../../components/AxiosInstance";
import { logAgentSearch } from "../../../utils/agentSearchLog";
import Sidebar from "../../../components/Sidebar";
import TopBar from "../../../components/TopBar";
import AdvertisementCarousel from "../../../components/AdvertisementCarousel";
import AgentCreditBalance from "../../../components/AgentCreditBalance";
import DateInput from "../../../components/DateInput";

const SPACE_TYPES = [
  "",
  "Conference Hall",
  "Meeting Room",
  "Banquet Hall",
  "Board Room",
  "Training Room",
  "Auditorium",
  "Event Hall",
];

const LAYOUTS = [
  "",
  "Theatre",
  "U-Shape",
  "Classroom",
  "Boardroom",
  "Banquet",
  "Reception",
];

const RATE_PLANS = ["Standard", "Contract", "Special"];

const today = () => new Date().toISOString().slice(0, 10);

// Re-use the same control styling as HotelSearch.jsx so the dropdowns
// align pixel-perfectly with the rest of the form.
const selectStyles = {
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  control: (base) => ({
    ...base,
    minHeight: "42px",
    border: "1px solid #dee2e6",
    "&:hover": { borderColor: "#86b7fe" },
  }),
  menu: (base) => ({ ...base, zIndex: 9999, maxHeight: "200px" }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? "#f8f9fa" : "white",
    color: state.isSelected ? "white" : "#212529",
    "&:active": { backgroundColor: "#0d6efd" },
  }),
};

export default function MeetAndSpaceSearch() {
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

  // ── form state ───────────────────────────────────────────────────────
  const [bookingDate, setBookingDate] = useState(today());
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("14:00");
  const [attendees, setAttendees] = useState(20);
  const [spaceType, setSpaceType] = useState("");
  const [layout, setLayout] = useState("");
  const [keyword, setKeyword] = useState("");
  const [ratePlan, setRatePlan] = useState("Standard");

  const [agent, setAgent] = useState("");
  const [agentBalance, setAgentBalance] = useState(null);
  const [agentBalanceLoading, setAgentBalanceLoading] = useState(false);
  const [selectedNationality, setSelectedNationality] = useState(null);

  const [errors, setErrors] = useState({});
  const clearError = (key) =>
    setErrors((e) => (e[key] ? { ...e, [key]: null } : e));

  // ── dropdown data ────────────────────────────────────────────────────
  const [agents, setAgents] = useState([]);
  const [nationalities, setNationalities] = useState([]);
  const [isNationalityLoading, setIsNationalityLoading] = useState(false);

  // Destination — searchable dropdown sourced from /api/province. Same
  // pattern as DayStaySearch + HotelSearch.
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [isDestinationLoading, setIsDestinationLoading] = useState(false);
  const destDebounceRef = useRef(null);
  const debouncedDestinationSearch = (searchText = "") => {
    if (destDebounceRef.current) clearTimeout(destDebounceRef.current);
    destDebounceRef.current = setTimeout(async () => {
      if (!searchText || searchText.length < 2) {
        // Reset to popular list when the user clears their query.
        try {
          setIsDestinationLoading(true);
          const r = await axiosInstance.get("/api/province?limit=50");
          const rows = Array.isArray(r.data) ? r.data : [];
          setDestinationOptions(
            rows.map((c) => ({
              value: c.id,
              label: `${c.stateName}${c.country ? `, ${c.country}` : ""}`,
              countryId: c.countryId,
              code: c.countryCode,
            }))
          );
        } catch {
          setDestinationOptions([]);
        } finally {
          setIsDestinationLoading(false);
        }
        return;
      }
      setIsDestinationLoading(true);
      try {
        const r = await axiosInstance.get(
          `/api/province?search=${encodeURIComponent(searchText)}`
        );
        const rows = Array.isArray(r.data) ? r.data : [];
        setDestinationOptions(
          rows.slice(0, 50).map((c) => ({
            value: c.id,
            label: `${c.stateName}${c.country ? `, ${c.country}` : ""}`,
            countryId: c.countryId,
            code: c.countryCode,
          }))
        );
      } catch {
        setDestinationOptions([]);
      } finally {
        setIsDestinationLoading(false);
      }
    }, 300);
  };

  // ── results state ────────────────────────────────────────────────────
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  // When results are on screen the big search form collapses into a sticky
  // summary strip. Clicking "Modify Search" flips this true to re-expand it.
  const [isEditingSearch, setIsEditingSearch] = useState(false);
  const resultsRef = useRef(null);

  // After a fresh search, jump the viewport to the results so the operator
  // sees them without having to scroll past the search card. Fires once the
  // first batch of spaces actually arrives.
  useEffect(() => {
    if (!hasSearched || results.length === 0) return;
    const id = window.setTimeout(() => {
      if (resultsRef.current) {
        resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
    return () => window.clearTimeout(id);
  }, [hasSearched, results.length]);

  // ── load agent + nationality + popular-destinations lists once ──────
  useEffect(() => {
    axiosInstance
      .get("/api/agent?activeOnly=true")
      .then((res) => setAgents(Array.isArray(res.data) ? res.data : []))
      .catch(() => setAgents([]));

    setIsNationalityLoading(true);
    axiosInstance
      .get("/api/country")
      .then((res) =>
        setNationalities(
          (Array.isArray(res.data) ? res.data : []).map((c) => ({
            value: c.id,
            label: c.name,
            code: c.countryCode,
          }))
        )
      )
      .catch(() => setNationalities([]))
      .finally(() => setIsNationalityLoading(false));

    // Popular destinations — used until the user types something into the
    // destination dropdown.
    setIsDestinationLoading(true);
    axiosInstance
      .get("/api/province?limit=50")
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : [];
        setDestinationOptions(
          rows.map((c) => ({
            value: c.id,
            label: `${c.stateName}${c.country ? `, ${c.country}` : ""}`,
            countryId: c.countryId,
            code: c.countryCode,
          }))
        );
      })
      .catch(() => setDestinationOptions([]))
      .finally(() => setIsDestinationLoading(false));
  }, []);

  // ── fetch agent balance whenever the picked agent id changes ─────────
  useEffect(() => {
    if (!agent) {
      setAgentBalance(null);
      return;
    }
    let cancelled = false;
    setAgentBalanceLoading(true);
    axiosInstance
      .get(`/api/agent-credit-limit/agent/${agent}`)
      .then((res) => {
        if (!cancelled)
          setAgentBalance(res?.data?.availableCreditLimit ?? null);
      })
      .catch(() => !cancelled && setAgentBalance(null))
      .finally(() => !cancelled && setAgentBalanceLoading(false));
    return () => {
      cancelled = true;
    };
  }, [agent]);

  // ── derived duration label ───────────────────────────────────────────
  const hoursLabel = useMemo(() => {
    if (!startTime || !endTime) return "";
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const mins = eh * 60 + em - (sh * 60 + sm);
    if (mins <= 0) return "";
    return `${Math.ceil(mins / 60)}h`;
  }, [startTime, endTime]);

  // ── inline validation ────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!isAgentRole && !agent) e.agent = "Agent is required";
    if (!selectedNationality) e.nationality = "Nationality is required";
    if (!selectedDestination) e.destination = "Destination is required";
    if (!bookingDate) e.bookingDate = "Booking date is required";
    if (!startTime) e.startTime = "Start time is required";
    if (!endTime) e.endTime = "End time is required";
    else if (startTime && startTime >= endTime)
      e.endTime = "End time must be after start time";
    if (!attendees || Number(attendees) <= 0)
      e.attendees = "Attendees must be > 0";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSearchSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    setHasSearched(true);
    setIsEditingSearch(false);
    try {
      // Agent search log (Unbooked Opportunities → Searches tab) —
      // meeting space is a single-session booking. Fire-and-forget.
      logAgentSearch({
        agentId: Number(agent) || null,
        destinationId: selectedDestination?.value,
        destinationLabel: selectedDestination?.label,
        nationalityLabel: selectedNationality?.label,
        checkIn: bookingDate,
        checkOut: bookingDate,
        source: "meet-and-space",
      });

      const res = await axiosInstance.post("/api/meet-and-space/search", {
        bookingDate,
        startTime,
        endTime,
        attendees: attendees ? Number(attendees) : null,
        spaceType: spaceType || null,
        layout: layout || null,
        keyword: keyword || null,
        ratePlan,
        // New: scope results to the picked destination city.
        destinationCityId: selectedDestination?.value || null,
        destinationCountryId: selectedDestination?.countryId || null,
        destinationName: selectedDestination?.label || null,
      });
      setResults(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Search failed", err);
      setErrors((p) => ({
        ...p,
        _general: "Search failed — please try again",
      }));
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  // ── open the booking page in a new tab with criteria + ids ───────────
  // The criteria used to be threaded via URL query params (spaceId,
  // bookingDate, startTime, unitRate, agentId, nationalityId, …), which
  // leaked pricing internals into the address bar and made the URL long
  // and ugly. We now stash the payload in localStorage under a fixed
  // key and open the target with a bare URL. The booking page reads the
  // draft on mount (see MeetAndSpaceBookingPage.useQueryParams).
  //
  // Delete-on-read is intentionally NOT done in the booking page — a
  // fresh "Book" click always overwrites the key, and React StrictMode
  // in dev double-invokes useState initializers so a self-clearing
  // reader would race with itself. Staleness is bounded to "the last
  // criteria the same user clicked Book on" — acceptable.
  const handleBook = (space) => {
    const selectedAgent = agents.find(
      (a) => String(a.id) === String(agent)
    );
    const draft = {
      spaceId: String(space.id),
      bookingDate,
      startTime,
      endTime,
      attendees: attendees || "",
      layout: layout || "",
      ratePlan: space.applicableRatePlan || ratePlan,
      rateType: space.applicableRateType || "Hourly",
      unitRate: space.applicableRate != null ? String(space.applicableRate) : "",
      agentId: agent ? String(agent) : "",
      agentName: selectedAgent?.companyName || "",
      nationalityId: selectedNationality?.value != null
        ? String(selectedNationality.value)
        : "",
      nationalityName: selectedNationality?.label || "",
    };
    try {
      localStorage.setItem("msBookingDraft", JSON.stringify(draft));
    } catch (e) {
      // Storage disabled / quota exceeded — fall back to param form so
      // the flow at least still works. The booking page's URL-param
      // path is preserved for exactly this case.
      const params = new URLSearchParams(draft);
      window.open(
        `/new-booking/meet-and-space/book?${params.toString()}`,
        "_blank"
      );
      return;
    }
    window.open("/new-booking/meet-and-space/book", "_blank");
  };

  const collapseSearch = hasSearched && !isEditingSearch;

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />

        <main className="flex-grow-1 p-4 hs-page">
          {/* ── Search Card + Ads (HotelSearch.jsx pattern) ── */}
          {collapseSearch && (
            <div className="hs-summary-bar">
              <div className="hs-summary-chips">
                {selectedDestination?.label && (
                  <span className="hs-summary-chip hs-summary-chip-main">
                    <FaMapMarkerAlt className="me-2" />
                    {selectedDestination.label}
                  </span>
                )}
                {bookingDate && (
                  <span className="hs-summary-chip">{bookingDate}</span>
                )}
                {attendees && (
                  <span className="hs-summary-chip">
                    <FaUsers className="me-2" />
                    {attendees} pax
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
          <Card className="shadow-sm rounded-xl h-100 search-card-modern bg-white">
            <Card.Body className="p-4">
              <div className="mb-4 text-start d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div>
                  <h2 className="fw-semibold text-primary mb-1">
                    Meet &amp; Space — Find Your Venue
                  </h2>
                  <p className="text-muted">
                    Pick a date / time window and we'll show every meeting,
                    conference and event space with live availability and
                    applicable rate.
                  </p>
                </div>
                {/* Agent logins see their available credit balance at the
                    right end of the heading row (renders nothing for other
                    roles). */}
                <AgentCreditBalance />
              </div>

              <Form onSubmit={handleSearchSubmit}>
                <Row className="g-4">
                  {/* Agent */}
                  {!isAgentRole && (
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Agent
                      </Form.Label>
                      <AgentSelect
                        agents={agents}
                        value={agent}
                        isInvalid={!!errors.agent}
                        onChange={(v) => {
                          setAgent(v);
                          if (v) clearError("agent");
                        }}
                      />
                      {errors.agent && (
                        <div className="text-danger small mt-1">
                          {errors.agent}
                        </div>
                      )}
                      {agent && (
                        <div className="mt-1 small">
                          {agentBalanceLoading ? (
                            <span className="text-muted">
                              Loading available balance…
                            </span>
                          ) : agentBalance != null ? (
                            <span
                              className="fw-semibold"
                              style={{ color: "#dc3545" }}
                            >
                              Available Balance:{" "}
                              {Number(agentBalance).toFixed(2)} AED
                            </span>
                          ) : (
                            <span className="text-muted">
                              Available balance unavailable
                            </span>
                          )}
                        </div>
                      )}
                    </Form.Group>
                  </Col>
                  )}

                  {/* Nationality */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Nationality
                      </Form.Label>
                      <Select
                        options={nationalities}
                        value={selectedNationality}
                        onChange={(option) => {
                          setSelectedNationality(option);
                          if (option) clearError("nationality");
                        }}
                        isLoading={isNationalityLoading}
                        placeholder="Select nationality"
                        isSearchable
                        isClearable
                        className="modern-select"
                        menuPortalTarget={document.body}
                        styles={selectStyles}
                      />
                      {errors.nationality && (
                        <div className="text-danger small mt-1">
                          {errors.nationality}
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  {/* Destination — searchable dropdown wired to /api/province.
                      Scopes the meeting-space results to a city / province. */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        <FaMapMarkerAlt className="me-2 text-primary" />
                        Destination
                      </Form.Label>
                      <Select
                        options={destinationOptions}
                        value={selectedDestination}
                        onChange={(option) => {
                          setSelectedDestination(option);
                          if (option) clearError("destination");
                        }}
                        onInputChange={(value, action) => {
                          if (action?.action === "input-change") {
                            debouncedDestinationSearch(value);
                          }
                        }}
                        isLoading={isDestinationLoading}
                        placeholder="Where do you want to go?"
                        isSearchable
                        isClearable
                        className="modern-select"
                        menuPortalTarget={document.body}
                        styles={selectStyles}
                        noOptionsMessage={() =>
                          isDestinationLoading
                            ? "Searching destinations…"
                            : "Type at least 2 characters"
                        }
                      />
                      {errors.destination && (
                        <div className="text-danger small mt-1">
                          {errors.destination}
                        </div>
                      )}
                      {/* Surface UAE-resident status when the selected
                          destination city belongs to the UAE so the operator
                          can apply the resident rate. Matched on the city's
                          country code "AE" (from master_country) so a label
                          change can't break the rule. */}
                      {selectedDestination?.code === "AE" && (
                        <div
                          className="mt-1 small"
                          style={{ color: "#0f7a3a", lineHeight: 1.25 }}
                        >
                          For UAE resident holders, please mention the nationality as United Arab Emirates regardless of the actual nationality.
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  {/* Booking date — RateCalendar fetches per-day MS
                       rate hints for the selected city from
                       /api/meet-and-space-search/rate-calendar. Meet &
                       Space is a single-date booking (start/end are
                       hours-of-day, not separate days). */}
                  <Col lg={2} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Booking Date
                      </Form.Label>
                      <DateInput
                        value={bookingDate}
                        onChange={(v) => {
                          setBookingDate(v);
                          if (v) clearError("bookingDate");
                        }}
                        min={today()}
                        stateId={selectedDestination?.value}
                        endpoint="/api/meet-and-space-search/rate-calendar"
                        ariaLabel="Meet and Space booking date"
                        isInvalid={!!errors.bookingDate}
                      />
                      {errors.bookingDate && (
                        <div className="text-danger small mt-1">
                          {errors.bookingDate}
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  {/* Start time */}
                  <Col lg={2} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Start Time
                      </Form.Label>
                      <Form.Control
                        style={{ height: "42px" }}
                        className="form-control-modern"
                        type="time"
                        value={startTime}
                        onChange={(e) => {
                          setStartTime(e.target.value);
                          if (e.target.value) clearError("startTime");
                        }}
                      />
                      {errors.startTime && (
                        <div className="text-danger small mt-1">
                          {errors.startTime}
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  {/* End time */}
                  <Col lg={2} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        End Time
                      </Form.Label>
                      <Form.Control
                        style={{ height: "42px" }}
                        className="form-control-modern"
                        type="time"
                        value={endTime}
                        onChange={(e) => {
                          setEndTime(e.target.value);
                          if (e.target.value) clearError("endTime");
                        }}
                      />
                      {errors.endTime ? (
                        <div className="text-danger small mt-1">
                          {errors.endTime}
                        </div>
                      ) : (
                        hoursLabel && (
                          <div className="text-muted small mt-1">
                            Duration: {hoursLabel}
                          </div>
                        )
                      )}
                    </Form.Group>
                  </Col>

                  {/* Attendees */}
                  <Col lg={2} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Attendees
                      </Form.Label>
                      <Form.Control
                        style={{ height: "42px" }}
                        className="form-control-modern"
                        type="number"
                        min={1}
                        max={5000}
                        value={attendees}
                        onChange={(e) => {
                          setAttendees(e.target.value);
                          if (e.target.value) clearError("attendees");
                        }}
                      />
                      {errors.attendees && (
                        <div className="text-danger small mt-1">
                          {errors.attendees}
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  {/* Space type */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Space Type
                      </Form.Label>
                      <Form.Select
                        style={{ height: "42px" }}
                        className="form-control-modern"
                        value={spaceType}
                        onChange={(e) => setSpaceType(e.target.value)}
                      >
                        {SPACE_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t || "Any"}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>

                  {/* Layout */}
                  <Col lg={2} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Layout
                      </Form.Label>
                      <Form.Select
                        style={{ height: "42px" }}
                        className="form-control-modern"
                        value={layout}
                        onChange={(e) => setLayout(e.target.value)}
                      >
                        {LAYOUTS.map((l) => (
                          <option key={l} value={l}>
                            {l || "Any"}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>

                  {/* Rate plan */}
                  <Col lg={2} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Rate Plan
                      </Form.Label>
                      <Form.Select
                        style={{ height: "42px" }}
                        className="form-control-modern"
                        value={ratePlan}
                        onChange={(e) => setRatePlan(e.target.value)}
                      >
                        {RATE_PLANS.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>

                  {/* Keyword */}
                  <Col lg={5} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Keyword (Hotel / Space name)
                      </Form.Label>
                      <Form.Control
                        style={{ height: "42px" }}
                        className="form-control-modern"
                        placeholder="Search by hotel or space name"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                </Row>

                {errors._general && (
                  <Row className="mt-2">
                    <Col>
                      <div className="alert alert-danger py-2 mb-0">
                        {errors._general}
                      </div>
                    </Col>
                  </Row>
                )}

                <Row className="mt-3">
                  <Col className="d-flex justify-content-center gap-3">
                    <Button
                      type="submit"
                      className="btn-search-modern"
                      disabled={isLoading}
                      size="lg"
                    >
                      {isLoading ? (
                        <>
                          <Spinner
                            animation="border"
                            size="sm"
                            className="me-2"
                          />
                          Searching...
                        </>
                      ) : (
                        <>
                          <FaSearch className="me-2" />
                          SEARCH SPACES
                        </>
                      )}
                    </Button>
                  </Col>
                </Row>
              </Form>
            </Card.Body>
          </Card>
           </div>
            {/* Ads carousel — city matches first, then all active ads */}
            {!hasSearched && (
              <AdvertisementCarousel
                cityId={selectedDestination?.value}
                cityName={selectedDestination?.label}
              />
            )}
          </div>
          )}

          {/* ── Results ── */}
          <div ref={resultsRef}>
          {isLoading ? (
            <div className="text-center py-5">
              <Spinner animation="border" />
            </div>
          ) : !hasSearched ? (
            <Card body className="text-center text-muted py-5 shadow-sm rounded-xl">
              Set your criteria above and click "Search Spaces" to see
              available meeting &amp; event spaces.
            </Card>
          ) : results.length === 0 ? (
            <Card body className="text-center text-muted py-5 shadow-sm rounded-xl">
              No meeting spaces matched your criteria.
            </Card>
          ) : (
            <Row className="g-3">
              {results.map((r) => (
                <Col md={6} lg={4} key={r.id}>
                  <Card className="h-100 shadow-sm rounded-xl">
                    {r.primaryImageUrl ? (
                      <Card.Img
                        variant="top"
                        src={r.primaryImageUrl}
                        style={{ height: 200, objectFit: "cover" }}
                        alt={r.spaceName}
                        onError={(e) => (e.target.style.display = "none")}
                      />
                    ) : (
                      <div
                        className="bg-light d-flex align-items-center justify-content-center text-muted"
                        style={{ height: 200 }}
                      >
                        <FaUsers size={48} />
                      </div>
                    )}
                    <Card.Body className="d-flex flex-column">
                      <div className="d-flex justify-content-between align-items-start">
                        <h5 className="mb-1">{r.spaceName}</h5>
                        <Badge bg={r.available ? "success" : "danger"}>
                          {r.available ? "Available" : "Booked"}
                        </Badge>
                      </div>
                      <small className="text-muted">
                        <FaMapMarkerAlt className="me-1" />
                        {r.hotelName || `Hotel #${r.hotelId}`}
                      </small>
                      <div className="mt-2 small">
                        <Badge bg="info" className="me-2">
                          {r.spaceType}
                        </Badge>
                        {r.capacity && (
                          <span className="me-2">
                            <FaUsers /> Up to {r.capacity}
                          </span>
                        )}
                        {r.areaSqft && (
                          <span className="text-muted">
                            {r.areaSqft} sqft
                          </span>
                        )}
                      </div>
                      {r.amenities && (
                        <div className="small text-muted mt-1">
                          <strong>Amenities:</strong> {r.amenities}
                        </div>
                      )}
                      {r.layoutOptions && (
                        <div className="small text-muted">
                          <strong>Layouts:</strong> {r.layoutOptions}
                        </div>
                      )}

                      <div className="mt-3 p-2 bg-light rounded">
                        <div className="small text-muted">
                          {r.applicableRatePlan} — {r.applicableRateType} rate
                        </div>
                        <div className="h5 mb-0 text-primary">
                          {r.currency || "INR"}{" "}
                          {r.applicableRate != null
                            ? Number(r.applicableRate).toFixed(2)
                            : "—"}
                        </div>
                        {r.estimatedGrandTotal != null && (
                          <div className="small text-success">
                            Est. total (incl. tax): {r.currency || "INR"}{" "}
                            {Number(r.estimatedGrandTotal).toFixed(2)}
                          </div>
                        )}
                      </div>

                      <Button
                        variant="primary"
                        className="mt-3"
                        disabled={!r.available}
                        onClick={() => handleBook(r)}
                      >
                        Book <FaArrowRight className="ms-1" />
                      </Button>
                    </Card.Body>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
          </div>
        </main>
      </div>
    </div>
  );
}
