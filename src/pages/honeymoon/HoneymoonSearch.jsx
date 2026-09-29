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
} from "react-bootstrap";
import {
  FaSearch,
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaUserFriends,
  FaUserTie,
  FaPlaneDeparture,
  FaBed,
  FaChild,
  FaWallet,
  FaSuitcaseRolling,
} from "react-icons/fa";
import Select from "react-select";
import AgentSelect from "../../components/AgentSelect";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { logAgentSearch } from "../../utils/agentSearchLog";
import HoneymoonCard from "./HoneymoonCard";
import AdvertisementCarousel from "../../components/AdvertisementCarousel";
import AgentCreditBalance from "../../components/AgentCreditBalance";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Debounced shared lookup for /api/province — used by both Starting From
 * and Going To inputs.
 */
const useProvinceLookup = () => {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const search = (input) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!input || input.length < 2) {
      setOptions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await axiosInstance.get(`/api/province?search=${encodeURIComponent(input)}`);
        const rows = Array.isArray(r.data) ? r.data : [];
        setOptions(
          rows.slice(0, 50).map((p) => ({
            value: p.id,
            label: `${p.stateName}${p.country ? ", " + p.country : ""}`,
            stateName: p.stateName,
            country: p.country,
            countryId: p.countryId,
          }))
        );
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };
  return { options, loading, search };
};

const HoneymoonSearch = () => {
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

  const [form, setForm] = useState({
    startingFrom: null,
    destination: null,
    startingDate: today(),
    rooms: 1,
    adults: 2,
    children: 0,
    // One age per child — kept in sync with `children` count via the
    // useEffect below. Used for pax-aware pricing (children > 3 are
    // charged, 0-3 ride free) and persisted on the booking + voucher.
    childAges: [],
    agentId: "",
    agentName: "",
    markupPercent: 0,
    markupType: "PERCENT",
  });
  const [agents, setAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  // Agent balance — same flow as HotelSearch.jsx (calls /api/agent-credit-limit/agent/{id}).
  const [agentBalance, setAgentBalance] = useState(null);
  const [agentBalanceLoading, setAgentBalanceLoading] = useState(false);

  // Two independent province lookups so each typeahead has its own option list.
  const fromLookup = useProvinceLookup();
  const toLookup = useProvinceLookup();

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
  // sees them (or the loading progress) without having to scroll past the
  // search card. Fires as soon as the search is submitted, then re-fires
  // when results arrive so the final position lands on the result list.
  useEffect(() => {
    if (!hasSearched) return;
    const id = window.setTimeout(() => {
      if (resultsRef.current) {
        resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
    return () => window.clearTimeout(id);
  }, [hasSearched, loading, results.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAgentsLoading(true);
      try {
        const res = await axiosInstance.get("/api/agent?activeOnly=true");
        if (!cancelled) setAgents(Array.isArray(res.data) ? res.data : []);
      } catch {
        if (!cancelled) setAgents([]);
      } finally {
        if (!cancelled) setAgentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch credit-limit balance whenever the selected agent changes.
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
        if (!cancelled) setAgentBalance(res?.data?.availableCreditLimit ?? null);
      })
      .catch(() => {
        if (!cancelled) setAgentBalance(null);
      })
      .finally(() => {
        if (!cancelled) setAgentBalanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.agentId]);

  const setField = (n, v) => {
    setForm((p) => ({ ...p, [n]: v }));
    if (errors[n]) setErrors((p) => ({ ...p, [n]: "" }));
  };

  const onAgentChange = (e) => {
    const id = e.target.value;
    const a = agents.find((x) => String(x.id) === String(id));
    // Seed markup from the agent record so the UI updates immediately,
    // then refine with the authoritative /api/agents/{id}/markup response
    // (same source that backend search + booking use). Without the second
    // fetch the Price Summary on the booking page can show a stale value
    // if the agent profile's `markupPercentage` lag behind the AgentMarkup
    // configuration.
    setForm((p) => ({
      ...p,
      agentId: id,
      agentName: a?.companyName || a?.name || "",
      markupPercent:
        a?.markupPercentage != null
          ? Number(a.markupPercentage)
          : a?.markup != null
          ? Number(a.markup)
          : 0,
      markupType: "PERCENT",
    }));
    if (errors.agentId) setErrors((p) => ({ ...p, agentId: "" }));
    if (id) {
      axiosInstance
        .get(`/api/agents/${id}/markup`)
        .then((res) => {
          const cfg = res?.data;
          if (!cfg) return;
          setForm((p) => ({
            ...p,
            markupPercent: cfg.markupValue != null ? Number(cfg.markupValue) : p.markupPercent,
            markupType: cfg.markupType || "PERCENT",
          }));
        })
        .catch(() => {
          /* keep agent-profile fallback */
        });
    }
  };

  // Keep `childAges` aligned with the `children` count.
  useEffect(() => {
    setForm((p) => {
      const n = Number(p.children) || 0;
      const cur = Array.isArray(p.childAges) ? p.childAges : [];
      if (cur.length === n) return p;
      const next = [...cur];
      while (next.length < n) next.push(0);
      next.length = n;
      return { ...p, childAges: next };
    });
  }, [form.children]);

  const validate = () => {
    const e = {};
    if (!form.startingFrom) e.startingFrom = "Starting From is required";
    if (!form.destination) e.destination = "Destination is required";
    if (!form.startingDate) e.startingDate = "Starting date is required";
    else if (form.startingDate < today()) e.startingDate = "Date cannot be in the past";
    if (!form.rooms || Number(form.rooms) < 1) e.rooms = "At least 1 room";
    if (!form.adults || Number(form.adults) < 1) e.adults = "At least 1 adult";
    if (!isAgentRole && !form.agentId) e.agentId = "Agent is required";
    return e;
  };

  const handleSearch = (e) => {
    e?.preventDefault();
    const err = validate();
    setErrors(err);
    if (Object.keys(err).length) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    setLoading(true);
    setHasSearched(true);
    setIsEditingSearch(false);
    setResults([]);
    setProgress(0);

    const start = Date.now();
    const interval = setInterval(() => {
      setProgress(Math.min(95, Math.round(((Date.now() - start) / 3000) * 100)));
    }, 100);

    setTimeout(async () => {
      try {
        const payload = {
          startingFrom: form.startingFrom?.stateName || form.startingFrom?.label,
          destination: form.destination?.stateName || form.destination?.label,
          startingDate: form.startingDate,
          rooms: Number(form.rooms),
          adults: Number(form.adults),
          children: Number(form.children),
          childAges: (form.childAges || []).map((a) => Number(a) || 0),
          agentId: Number(form.agentId) || null,
          markupPercent: Number(form.markupPercent) || 0,
        };
        // Agent search log (Unbooked Opportunities → Searches tab) —
        // honeymoon flow has origin+destination and no nationality.
        logAgentSearch({
          agentId: Number(form.agentId) || null,
          agentName: form.agentName,
          destinationId: form.destination?.id,
          destinationLabel:
            form.destination?.stateName || form.destination?.label,
          checkIn: form.startingDate,
          checkOut: form.startingDate,
          rooms: [
            {
              adults: Number(form.adults) || 0,
              children: Number(form.children) || 0,
            },
          ],
          source: "honeymoon",
        });

        const res = await axiosInstance.post("/api/honeymoon/search", payload);
        const data = Array.isArray(res.data) ? res.data : res.data?.content || [];

        // Enrich each package with its honeymoon-package-rate rows and a
        // derived per-pax rate based on the requested adults/children. The
        // legacy perPaxRate on the package row is now usually empty —
        // displayed rate must come from the rate rows.
        //
        // Pax math: adults are always charged; children > 3 are charged a
        // child rate, ages 0-3 ride free. Matches the operations rule
        // applied in the cab + restaurant flows and the HoneymoonBookingService.
        const adults = Number(form.adults) || 0;
        const childCount = Number(form.children) || 0;
        const ages = Array.isArray(form.childAges) ? form.childAges : [];
        const payingChildren = childCount
          ? Array.from({ length: childCount }, (_, i) => Number(ages[i] ?? 0))
              .filter((a) => a > 3).length
          : 0;
        const enriched = await Promise.all(
          data.map(async (pkg) => {
            try {
              const rr = await axiosInstance.get(
                `/api/honeymoon-package-rate?packageId=${pkg.id}`
              );
              const rates = Array.isArray(rr.data) ? rr.data : [];
              // Prefer a rate row whose noOfNights matches the package's
              // declared nights; otherwise fall back to the first row.
              const match =
                rates.find(
                  (r) =>
                    pkg.noOfNights &&
                    Number(r.noOfNights) === Number(pkg.noOfNights)
                ) || rates[0];
              if (!match) {
                return {
                  ...pkg,
                  packageRates: rates,
                  selectedRate: null,
                  baseRate: 0,
                  markedUpRate: 0,
                  derivedTotal: 0,
                };
              }
              const perAdult = Number(match.perAdultRate || 0);
              const perChild = Number(match.perChildWithBed || 0);
              // Only `payingChildren` (age > 3) contribute to the base
              // total; 0-3 ride free. Adults always pay perAdult.
              const total = perAdult * adults + perChild * payingChildren;
              const billedPax = Math.max(1, adults + payingChildren);
              const perPax = total / billedPax;
              const mp = Number(payload.markupPercent || 0);
              const marked = +(perPax * (1 + mp / 100)).toFixed(2);
              return {
                ...pkg,
                packageRates: rates,
                selectedRate: match,
                baseRate: perPax,
                markedUpRate: marked,
                derivedTotal: total,
                derivedTotalWithMarkup: +(total * (1 + mp / 100)).toFixed(2),
                perPaxRate: perPax,
                perAdultRate: perAdult,
                perChildRate: perChild,
                billedPax,
                payingChildren,
                markupPercent: mp,
                // Surface the agent markup config so the booking page can
                // re-render the Price Summary against the same source the
                // backend will charge against.
                agentMarkupPercent: mp,
                agentMarkupType: form.markupType || "PERCENT",
              };
            } catch {
              return { ...pkg, packageRates: [], selectedRate: null };
            }
          })
        );
        setResults(enriched);
      } catch (err) {
        console.error(err);
        toast.error("Search failed");
        setResults([]);
      } finally {
        clearInterval(interval);
        setProgress(100);
        setTimeout(() => setLoading(false), 250);
      }
    }, 3000);
  };

  const goToView = (pkg) =>
    navigate(`/honeymoon/view/${pkg.id}`, { state: { pkg, searchForm: form } });
  const goToBook = (pkg) =>
    navigate("/honeymoon/book", { state: { pkg, searchForm: form } });

  const rsStyles = (isInvalid) => ({
    control: (b, s) => ({
      ...b,
      minHeight: 42,
      borderColor: isInvalid ? "#dc3545" : s.isFocused ? "#86b7fe" : "#ced4da",
      boxShadow: s.isFocused
        ? isInvalid
          ? "0 0 0 .25rem rgba(220,53,69,.25)"
          : "0 0 0 .25rem rgba(13,110,253,.25)"
        : "none",
    }),
    menu: (b) => ({ ...b, zIndex: 9999 }),
    // Portal anchor — keeps the dropdown above sibling rows + cards and
    // outside the search card's own overflow context so the list scrolls
    // properly even when the parent has clipping.
    menuPortal: (b) => ({ ...b, zIndex: 9999 }),
  });

  // Shared prop set for portal-rendered selects (Starting From / Going To)
  // so the dropdown list isn't clipped by sibling rows or the search card's
  // overflow context.
  const portalProps = {
    menuPortalTarget: typeof document !== "undefined" ? document.body : null,
    menuPosition: "fixed",
  };

  const collapseSearch = hasSearched && !isEditingSearch;

  return (
    <div className="min-vh-100 d-flex flex-column" style={{ background: "#f5f7fb" }}>
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4 hs-page">
          <Container fluid>
            <div className="mb-4 d-flex justify-content-between align-items-start flex-wrap gap-2">
              <div>
                <h2 className="text-primary mb-1">
                  <FaSuitcaseRolling className="me-2" />
                  Honeymoon Package Booking
                </h2>
                <p className="text-muted mb-0">
                  Find the perfect romantic getaway for your couple.
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
                  {form.startingDate && (
                    <span className="hs-summary-chip">
                      <FaCalendarAlt className="me-1" />
                      {form.startingDate}
                    </span>
                  )}
                  <span className="hs-summary-chip">
                    <FaUserFriends className="me-1" />
                    {Number(form.adults) || 0} Adults
                    {Number(form.children) > 0 ? `, ${Number(form.children)} Children` : ""}
                  </span>
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
            <Card className="shadow-lg border-0 rounded-4 mb-4 h-100">
              <Card.Header className="bg-gradient-primary text-white border-0 rounded-top-4">
                <h5 className="mb-0">
                  <FaSearch className="me-2" /> Search Criteria
                </h5>
              </Card.Header>
              <Card.Body className="p-4">
                <Form onSubmit={handleSearch} noValidate>
                  <Row className="g-3">
                    <Col lg={4} md={6}>
                      <Form.Label className="fw-semibold">
                        <FaPlaneDeparture className="me-1 text-primary" /> Starting From *
                      </Form.Label>
                      <Select
                        options={fromLookup.options}
                        value={form.startingFrom}
                        onChange={(opt) => setField("startingFrom", opt)}
                        onInputChange={(input, meta) => {
                          if (meta.action === "input-change") fromLookup.search(input);
                        }}
                        isLoading={fromLookup.loading}
                        isClearable
                        placeholder="Search origin..."
                        noOptionsMessage={({ inputValue }) =>
                          inputValue && inputValue.length < 2
                            ? "Type at least 2 characters"
                            : fromLookup.loading
                            ? "Searching..."
                            : "No matches"
                        }
                        styles={rsStyles(!!errors.startingFrom)}
                        {...portalProps}
                      />
                      {errors.startingFrom && (
                        <div className="text-danger small mt-1">{errors.startingFrom}</div>
                      )}
                    </Col>

                    <Col lg={4} md={6}>
                      <Form.Label className="fw-semibold">
                        <FaMapMarkerAlt className="me-1 text-danger" /> Going To *
                      </Form.Label>
                      <Select
                        options={toLookup.options}
                        value={form.destination}
                        onChange={(opt) => setField("destination", opt)}
                        onInputChange={(input, meta) => {
                          if (meta.action === "input-change") toLookup.search(input);
                        }}
                        isLoading={toLookup.loading}
                        isClearable
                        placeholder="Search destination..."
                        noOptionsMessage={({ inputValue }) =>
                          inputValue && inputValue.length < 2
                            ? "Type at least 2 characters"
                            : toLookup.loading
                            ? "Searching..."
                            : "No matches"
                        }
                        styles={rsStyles(!!errors.destination)}
                        {...portalProps}
                      />
                      {errors.destination && (
                        <div className="text-danger small mt-1">{errors.destination}</div>
                      )}
                    </Col>

                    <Col lg={4} md={6}>
                      <Form.Label className="fw-semibold">
                        <FaCalendarAlt className="me-1 text-primary" /> Start Date *
                      </Form.Label>
                      <Form.Control
                        type="date"
                        value={form.startingDate}
                        onChange={(e) => setField("startingDate", e.target.value)}
                        min={today()}
                        isInvalid={!!errors.startingDate}
                        style={{ height: 42 }}
                      />
                      <Form.Control.Feedback type="invalid">{errors.startingDate}</Form.Control.Feedback>
                    </Col>

                    <Col lg={4} md={6}>
                      <Form.Label className="fw-semibold">
                        <FaBed className="me-1 text-success" /> Rooms *
                      </Form.Label>
                      <Form.Control
                        type="number"
                        min={1}
                        value={form.rooms}
                        onChange={(e) => setField("rooms", e.target.value)}
                        isInvalid={!!errors.rooms}
                        style={{ height: 42 }}
                      />
                      <Form.Control.Feedback type="invalid">{errors.rooms}</Form.Control.Feedback>
                    </Col>

                    <Col lg={4} md={6}>
                      <Form.Label className="fw-semibold">
                        <FaUserFriends className="me-1 text-success" /> Adults *
                      </Form.Label>
                      <Form.Control
                        type="number"
                        min={1}
                        value={form.adults}
                        onChange={(e) => setField("adults", e.target.value)}
                        isInvalid={!!errors.adults}
                        style={{ height: 42 }}
                      />
                      <Form.Control.Feedback type="invalid">{errors.adults}</Form.Control.Feedback>
                    </Col>

                    <Col lg={4} md={6}>
                      <Form.Label className="fw-semibold">
                        <FaChild className="me-1 text-warning" /> Children
                      </Form.Label>
                      <Form.Control
                        type="number"
                        min={0}
                        max={9}
                        value={form.children}
                        onChange={(e) => setField("children", e.target.value)}
                        style={{ height: 42 }}
                      />
                    </Col>

                    {/* Child ages — show once per child whenever children > 0.
                        Children > 3 are charged, 0-3 ride free. Values flow
                        through to the booking page + voucher. */}
                    {Number(form.children) > 0 && (
                      <Col xs={12} className="mt-2">
                        <Form.Label className="fw-semibold mb-1">
                          Child Ages
                        </Form.Label>
                        <div className="d-flex flex-wrap gap-2">
                          {Array.from({ length: Number(form.children) }, (_, i) => (
                            <div key={i} style={{ width: 110 }}>
                              <Form.Control
                                type="number"
                                min={0}
                                max={17}
                                placeholder={`Child ${i + 1}`}
                                value={form.childAges[i] ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value === "" ? 0 : Number(e.target.value);
                                  setForm((p) => {
                                    const next = [...(p.childAges || [])];
                                    next[i] = v;
                                    return { ...p, childAges: next };
                                  });
                                }}
                                style={{ height: 38 }}
                              />
                            </div>
                          ))}
                        </div>
                        <small className="text-muted">
                          Children aged 0–3 ride free; ages 4+ are charged the child rate.
                        </small>
                      </Col>
                    )}

                    {!isAgentRole && (
                    <Col lg={8} md={6}>
                      <Form.Label className="fw-semibold">
                        <FaUserTie className="me-1 text-info" /> Agent *
                      </Form.Label>
                      <AgentSelect
                        agents={agents}
                        value={form.agentId}
                        isInvalid={!!errors.agentId}
                        placeholder={agentsLoading ? "Loading..." : "Select Agent"}
                        onChange={(v) =>
                          onAgentChange({ target: { value: v } })
                        }
                      />
                      {errors.agentId && (
                        <div className="text-danger small mt-1">{errors.agentId}</div>
                      )}
                      {form.agentId && (
                        <div className="mt-1">
                          {agentBalanceLoading ? (
                            <Badge bg="light" text="dark" className="border">
                              <Spinner animation="border" size="sm" className="me-1" />
                              Checking balance...
                            </Badge>
                          ) : agentBalance != null ? (
                            <Badge bg="success" className="px-2 py-1">
                              <FaWallet className="me-1" />
                              Available Balance: {Number(agentBalance).toFixed(2)} AED
                            </Badge>
                          ) : (
                            <Badge bg="secondary" className="px-2 py-1">
                              <FaWallet className="me-1" /> Balance unavailable
                            </Badge>
                          )}
                        </div>
                      )}
                    </Col>
                    )}

                    <Col lg={4} md={6} className="d-flex align-items-end">
                      <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        className="w-100 rounded-pill"
                        disabled={loading}
                      >
                        <FaSearch className="me-2" /> Search Packages
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
               cityId={form.destination?.value}
               cityName={form.destination?.label}
             />
             )}
            </div>
            )}

            <div ref={resultsRef}>
            {loading && (
              <Card className="shadow-sm border-0 rounded-4 mb-3">
                <Card.Body className="text-center py-4">
                  <Spinner animation="border" variant="primary" className="mb-2" />
                  <div className="mb-2 fw-semibold">Finding the perfect getaway...</div>
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

            {!loading && hasSearched && results.length === 0 && (
              <Card className="shadow-sm border-0 rounded-4">
                <Card.Body className="text-center text-muted py-5">
                  <FaSuitcaseRolling size={48} className="mb-2 opacity-50" />
                  <h6 className="mb-1">No packages found</h6>
                  <small>Try changing the destination or date.</small>
                </Card.Body>
              </Card>
            )}

            {!loading && results.length > 0 && (
              <>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="mb-0">
                    <Badge bg="primary" className="me-2">
                      {results.length}
                    </Badge>
                    honeymoon packages for {form.destination?.label}
                  </h5>
                </div>
                <Row className="g-3">
                  {results.map((p) => (
                    <Col key={p.id} md={6} lg={4}>
                      <HoneymoonCard pkg={p} onView={() => goToView(p)} onBook={() => goToBook(p)} />
                    </Col>
                  ))}
                </Row>
              </>
            )}
            </div>
          </Container>
        </main>
      </div>
    </div>
  );
};

export default HoneymoonSearch;
