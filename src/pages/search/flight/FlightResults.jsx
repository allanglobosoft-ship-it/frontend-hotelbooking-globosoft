import React, { useEffect, useMemo, useState } from "react";
import { Card, Row, Col, Button, Badge, Collapse, Spinner, Alert, Form, Pagination, Modal, Table } from "react-bootstrap";
import {
  FaPlaneDeparture,
  FaPlaneArrival,
  FaClock,
  FaExchangeAlt,
  FaSuitcase,
  FaChevronDown,
  FaChevronUp,
  FaInfoCircle,
  FaSearch,
} from "react-icons/fa";
import axiosInstance from "../../../components/AxiosInstance";

// Same rows-per-page choices as the Hotel Booking list so the two pages
// behave identically for the user; 10 is the initial page size to match
// the requirement ("Display 10–20 results per page — same behaviour as
// Hotel Booking").
const PER_PAGE_OPTIONS = [10, 20, 50];

/*
 * Flight search results panel.
 * Design mirrors /new-booking/hotel: a shell wrapping the count line +
 * per-item card, with left-side details (airline, route, duration, stops)
 * and a right-side price column with a primary CTA. Each card can expand
 * to show the per-segment breakdown and fare / baggage details.
 *
 * The panel is pure presentation — the parent owns the loading / error /
 * results state and passes them in as props. A left-hand filter sidebar
 * (currency, price sort, stops, refund type, airline) mirrors the
 * /new-booking/hotel filtersection styling, but — per requirement — filters
 * only take effect once the user clicks "Apply Filters"; adjusting a filter
 * control alone does not change the displayed results.
 */

const STOP_OPTIONS = [
  { value: "0", label: "Non-stop" },
  { value: "1", label: "1 Stop" },
  { value: "2", label: "2+ Stops" },
];

const REFUND_OPTIONS = [
  { value: "refundable", label: "Refundable" },
  { value: "nonrefundable", label: "Non-Refundable" },
];

const emptyFilters = () => ({
  currency: null, // { code, rate } | null = show each row's native currency
  priceSort: "", // "" | "lowToHigh" | "highToLow"
  stops: [], // subset of STOP_OPTIONS values
  refundType: [], // subset of REFUND_OPTIONS values
  airlines: [], // subset of carrier codes
});

const carrierOf = (rec) =>
  rec.validatingCarrier || rec.legs?.[0]?.segments?.[0]?.marketingCarrier || null;

const airlineNameOf = (rec) =>
  rec.legs?.[0]?.segments?.[0]?.airLineName || carrierOf(rec) || "Unknown";

const maxStopsOf = (rec) =>
  Math.max(0, ...(rec.legs || []).map((l) => Math.max(0, (l.segments?.length || 1) - 1)));

const priceOf = (rec) => Number(rec.pricing?.totalRateWithMarkup ?? rec.pricing?.total ?? 0);

const CABIN_LABELS = {
  M: "Economy",
  Y: "Economy",
  W: "Premium Economy",
  C: "Business",
  F: "First",
};

const cabinLabel = (code) => CABIN_LABELS[code] || code || "Economy";

// Fallback IATA airline-name dictionary — used when the backend's
// amadeus_airlines master table lookup returns null / empty for a
// carrier (typical for smaller / regional airlines the ops team hasn't
// added yet). Not exhaustive; the master table is authoritative when it
// has an entry — this only fires as a last resort so the header never
// shows just the bare 2-letter code.
const IATA_AIRLINE_FALLBACK = {
  A3: "Aegean Airlines",
  AA: "American Airlines",
  AC: "Air Canada",
  AF: "Air France",
  AH: "Air Algérie",
  AI: "Air India",
  AM: "Aeroméxico",
  AT: "Royal Air Maroc",
  AY: "Finnair",
  AZ: "ITA Airways",
  BA: "British Airways",
  BR: "EVA Air",
  CA: "Air China",
  CI: "China Airlines",
  CX: "Cathay Pacific",
  CZ: "China Southern",
  DE: "Condor Flugdienst",
  DL: "Delta Air Lines",
  EK: "Emirates",
  ET: "Ethiopian Airlines",
  EY: "Etihad Airways",
  FZ: "flydubai",
  G9: "Air Arabia",
  GF: "Gulf Air",
  HR: "Hahn Air",
  IB: "Iberia",
  IX: "Air India Express",
  JL: "Japan Airlines",
  KE: "Korean Air",
  KL: "KLM Royal Dutch Airlines",
  KQ: "Kenya Airways",
  KU: "Kuwait Airways",
  LH: "Lufthansa",
  LX: "SWISS",
  LY: "El Al Israel Airlines",
  ME: "Middle East Airlines",
  MH: "Malaysia Airlines",
  MS: "EgyptAir",
  MU: "China Eastern",
  NH: "All Nippon Airways",
  OS: "Austrian Airlines",
  OZ: "Asiana Airlines",
  PK: "Pakistan International",
  QF: "Qantas",
  QR: "Qatar Airways",
  RJ: "Royal Jordanian",
  SA: "South African Airways",
  SG: "SpiceJet",
  SN: "Brussels Airlines",
  SQ: "Singapore Airlines",
  SU: "Aeroflot",
  SV: "Saudia",
  TG: "Thai Airways",
  TK: "Turkish Airlines",
  UA: "United Airlines",
  UK: "Vistara",
  UL: "SriLankan Airlines",
  VN: "Vietnam Airlines",
  VS: "Virgin Atlantic",
  WY: "Oman Air",
  XY: "flynas",
  XQ: "SunExpress",
  "6E": "IndiGo",
  "9W": "Jet Airways",
};

/**
 * Resolve a human airline name. Priority:
 *   1) explicit name from the Amadeus master-table lookup (backend enrichment)
 *   2) fallback dictionary above
 *   3) null — so the caller knows there's no meaningful name and can
 *      skip rendering a redundant "RJ RJ" span
 */
const resolveAirlineName = (name, code) => {
  const trimmed = (name || "").trim();
  if (trimmed && trimmed.toUpperCase() !== (code || "").toUpperCase()) {
    return trimmed;
  }
  const fallback = code ? IATA_AIRLINE_FALLBACK[code.toUpperCase()] : null;
  return fallback || null;
};

// Module-level cache of logo URLs known to 404. Populated by the first
// AirlineLogo card that tries a URL and fails; every subsequent card with
// the same URL skips the <img> entirely and renders the next fallback
// straight away. Without this, a 49-row DXB→BOM result would produce
// dozens of duplicate 404s in the network tab.
const brokenLogoSrcs = new Set();

// Public IATA-keyed airline logo CDN used as a second-chance fallback
// when the backend didn't supply a logo_url (or that URL 404s). This is
// the same CDN Kayak / Aviasales serve their airline logos from — it
// stocks logos for virtually every IATA carrier code we'd see in
// Amadeus results, so almost every carrier ends up with a real logo
// even when our amadeus_airlines seed row has a blank logo_url.
// 120×40 gives a clean fit inside our 56×56 tile with a bit of padding.
const cdnLogoUrl = (code) =>
  code ? `https://pics.avs.io/120/40/${encodeURIComponent(code.toUpperCase())}.png` : null;

// Airline logo tile. Tries three sources in order:
//   1. The backend-provided src (DB amadeus_airlines.logo_url)
//   2. The public IATA CDN fallback (pics.avs.io) keyed on the carrier code
//   3. A monogram circle with the carrier code — final layout-safe fallback
// Each source that 404s is remembered in brokenLogoSrcs so a subsequent
// row for the same carrier skips directly to the next fallback.
const AirlineLogo = ({ src, code }) => {
  const cdn = cdnLogoUrl(code);
  // Choose the first candidate that isn't known-broken.
  const initial =
    src && !brokenLogoSrcs.has(src) ? src :
    cdn && !brokenLogoSrcs.has(cdn) ? cdn :
    null;
  const [current, setCurrent] = useState(initial);

  const handleError = () => {
    if (current) brokenLogoSrcs.add(current);
    // Cascade to the next fallback that isn't itself known-broken.
    if (current === src && cdn && !brokenLogoSrcs.has(cdn)) {
      setCurrent(cdn);
    } else {
      setCurrent(null); // monogram
    }
  };

  if (current) {
    return (
      <img
        src={current}
        alt={code || "airline"}
        onError={handleError}
        style={{
          width: 56, height: 56, objectFit: "contain", background: "#fff",
          borderRadius: 8, padding: 4, border: "1px solid #eef1f5",
        }}
      />
    );
  }
  return (
    <div style={{
      width: 56, height: 56, borderRadius: 8, background: "#e7f1ff",
      color: "#0d6efd", display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: 14, border: "1px solid #cfe2ff",
    }}>
      {code || "??"}
    </div>
  );
};

const parseDt = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fmtTime = (iso) => {
  const d = parseDt(iso);
  if (!d) return "--:--";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
};

const fmtDate = (iso) => {
  const d = parseDt(iso);
  if (!d) return "";
  return d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
};

const durationBetween = (fromIso, toIso) => {
  const a = parseDt(fromIso);
  const b = parseDt(toIso);
  if (!a || !b) return null;
  const mins = Math.max(0, Math.round((b - a) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
};

const legDuration = (leg) => {
  if (!leg?.segments?.length) return null;
  const first = leg.segments[0];
  const last = leg.segments[leg.segments.length - 1];
  return durationBetween(first.departureDateTime, last.arrivalDateTime);
};

const stopsLabel = (leg) => {
  const n = Math.max(0, (leg?.segments?.length || 0) - 1);
  if (n === 0) return "Non-stop";
  if (n === 1) return "1 stop";
  return `${n} stops`;
};

const stopCities = (leg) =>
  (leg?.segments || []).slice(0, -1).map((s) => s.arrivalAirportCode).filter(Boolean);

const fmtAmount = (v, cur) => {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${cur || ""} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`.trim();
};

/* ─── Single result card (matches /new-booking/hotel card shape) ─── */
const FlightCard = ({ rec, onSelect, convert }) => {
  const [open, setOpen] = useState(false);
  // Per-segment "Flight Info" modal state — key is `${legIndex}.${segIndex}`
  // so multiple segments on the same card can each open independently.
  const [infoTarget, setInfoTarget] = useState(null); // { segment, key }
  const [infoData, setInfoData] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState(null);

  const openFlightInfo = (segment, key) => {
    setInfoTarget({ segment, key });
    setInfoData(null);
    setInfoError(null);
    setInfoLoading(true);
    axiosInstance
      .post("/api/amadeus/flightInfo", {
        origin: segment.departureAirportCode || segment.from,
        destination: segment.arrivalAirportCode || segment.to,
        marketingCarrier: segment.marketingCarrier,
        flightNumber: segment.flightNumber,
        departureDateTime: segment.departureDateTime,
      })
      .then((res) => {
        const data = res?.data || {};
        if (data.success === false) {
          setInfoError(data.errorMessage || "Could not load flight info.");
        } else {
          setInfoData(data);
        }
      })
      .catch((err) => {
        setInfoError(
          err?.response?.data?.message ||
            err?.message ||
            "Could not load flight info.",
        );
      })
      .finally(() => setInfoLoading(false));
  };
  const legs = rec.legs || [];
  const firstLeg = legs[0];
  const firstSeg = firstLeg?.segments?.[0];
  const carrier = firstSeg?.marketingCarrier || rec.validatingCarrier;
  // Resolved airline name — prefers backend enrichment, then falls
  // back to the IATA_AIRLINE_FALLBACK dictionary. Returns null when we
  // have no meaningful name so the header doesn't render "RJ RJ".
  const airlineName = resolveAirlineName(firstSeg?.airLineName, carrier);
  const cabin = firstSeg?.cabin;
  const pax0 = rec.passengers?.[0];
  const fd = pax0?.fareDetails;
  const conv = convert || ((amount, code) => ({ amount, code }));
  const totalConv = conv(rec.pricing?.totalRateWithMarkup ?? rec.pricing?.total, rec.pricing?.currency);
  const taxConv = conv(rec.pricing?.totalTax, rec.pricing?.currency);

  return (
    <Card className="mb-3 shadow-sm" style={{ border: "1px solid #eef1f5" }}>
      <Card.Body>
        <Row className="g-3">
          {/* Left column — airline + route summary */}
          <Col lg={8} md={7}>
            {/* Airline header row: [logo] [code chip] full airline name.
                Matches the old project's compact single-line header. */}
            <div
              className="d-flex align-items-center"
              style={{
                gap: 10,
                paddingBottom: 10,
                borderBottom: "1px solid #f1f3f5",
                marginBottom: 12,
              }}
            >
              <AirlineLogo src={firstSeg?.airlineLogo} code={carrier} />
              {carrier && (
                <span
                  style={{
                    background: "#f1f3f5",
                    color: "#212529",
                    padding: "2px 10px",
                    borderRadius: 4,
                    fontWeight: 700,
                    fontSize: 13,
                    letterSpacing: 0.5,
                  }}
                >
                  {carrier}
                </span>
              )}
              {/* Only render the name when we actually resolved one —
                  prevents the "RJ RJ" repetition when neither the DB
                  nor the fallback dictionary knows the carrier. */}
              {airlineName && (
                <span style={{ fontWeight: 600, fontSize: 15 }}>
                  {airlineName}
                </span>
              )}
            </div>

            {/* Per-leg summary row with "Depart {date}" heading above the times. */}
            {legs.map((leg, i) => {
              const first = leg.segments?.[0];
              const last = leg.segments?.[leg.segments.length - 1];
              const departLabel = fmtDate(first?.departureDateTime);
              return (
                <div
                  key={i}
                  style={{
                    marginTop: i > 0 ? 14 : 0,
                    borderTop: i > 0 ? "1px dashed #e9ecef" : "none",
                    paddingTop: i > 0 ? 10 : 0,
                  }}
                >
                  {departLabel && (
                    <div
                      className="text-muted"
                      style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}
                    >
                      Depart {new Date(first?.departureDateTime).toLocaleDateString(
                        undefined,
                        { weekday: "short", day: "2-digit", month: "short" },
                      )}
                    </div>
                  )}
                  <Row className="g-2 align-items-center">
                    <Col xs={4}>
                      <div style={{ fontWeight: 700, fontSize: 22 }}>{fmtTime(first?.departureDateTime)}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        {first?.departureCityName
                          ? `${first.departureCityName} (${first?.departureAirportCode || leg.from})`
                          : (first?.departureAirportCode || leg.from)}
                      </div>
                    </Col>
                    <Col xs={4} className="text-center">
                      <div className="text-muted" style={{ fontSize: 12, fontWeight: 500 }}>
                        <FaClock style={{ marginRight: 4 }} />
                        {legDuration(leg) || "—"}
                      </div>
                      <div style={{
                        height: 2, background: "#dee2e6", position: "relative", margin: "6px 4px",
                      }}>
                        <FaPlaneDeparture style={{
                          position: "absolute", right: -6, top: -8, color: "#111827",
                        }} />
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: leg.segments?.length > 1 ? "#b45309" : "#15803d",
                        }}
                      >
                        {stopsLabel(leg)}
                        {stopCities(leg).length > 0 ? ` · via ${stopCities(leg).join(", ")}` : ""}
                      </div>
                    </Col>
                    <Col xs={4} className="text-end">
                      <div style={{ fontWeight: 700, fontSize: 22 }}>{fmtTime(last?.arrivalDateTime)}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        {last?.arrivalCityName
                          ? `${last.arrivalCityName} (${last?.arrivalAirportCode || leg.to})`
                          : (last?.arrivalAirportCode || leg.to)}
                      </div>
                    </Col>
                  </Row>
                </div>
              );
            })}

            <div className="mt-3">
              <span className="text-muted" style={{ fontSize: 12 }}>
                <FaSuitcase style={{ marginRight: 4 }} />
                Baggage: {fd?.baggageDetails?.checkInBaggage ||
                  (fd?.baggage ? `${fd.baggage.allowance ?? ""} ${fd.baggage.unit ?? ""}`.trim() : "As per airline")}
              </span>
            </div>
          </Col>

          {/* Right column — price + CTA + expander chevron */}
          <Col lg={4} md={5} className="d-flex flex-column align-items-end justify-content-between">
            <div className="d-flex align-items-start" style={{ gap: 10, width: "100%", justifyContent: "flex-end" }}>
              <div className="text-end">
                <div className="text-muted" style={{ fontSize: 12 }}>
                  Total ({totalConv.code || "AED"})
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>
                  {fmtAmount(totalConv.amount, totalConv.code)}
                </div>
                <div className="text-muted" style={{ fontSize: 11 }}>
                  tax {fmtAmount(taxConv.amount, taxConv.code)}
                </div>
                <div
                  className="mt-1"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: rec.pricing?.refundable ? "#15803d" : "#6b7280",
                  }}
                >
                  {rec.pricing?.fareType || (rec.pricing?.refundable ? "Refundable" : "Non-refundable")}
                </div>
              </div>
              {/* Circular chevron toggle — uses the storefront brand red
                  so it lines up with the primary CTA below. Rotates 180°
                  when expanded so the arrow points up. */}
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-label={open ? "Hide flight details" : "Show flight details"}
                title={open ? "Hide flight details" : "Show flight details"}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "#e11d48",
                  color: "#fff",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow: "0 2px 6px rgba(225, 29, 72, 0.35)",
                  transition: "transform 0.2s ease",
                  transform: open ? "rotate(180deg)" : "rotate(0deg)",
                  flexShrink: 0,
                }}
              >
                <FaChevronDown style={{ fontSize: 14 }} />
              </button>
            </div>
            <Button
              variant="primary"
              className="mt-3"
              style={{ minWidth: 140 }}
              onClick={() => onSelect?.(rec)}
            >
              View Fares
            </Button>
          </Col>
        </Row>

        {/* Expandable segment breakdown */}
        <Collapse in={open}>
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid #f1f3f5" }}>
            {legs.map((leg, i) => (
              <div key={i} className="mb-3">
                {leg.segments?.map((s, j) => (
                  <div
                    key={j}
                    style={{
                      padding: "16px 18px",
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      marginBottom: 10,
                    }}
                  >
                    <Row className="g-2 align-items-center">
                      {/* Airline logo + flight number */}
                      <Col md={2} className="d-flex align-items-center" style={{ gap: 10 }}>
                        <AirlineLogo src={s.airlineLogo} code={s.marketingCarrier} />
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          [{s.marketingCarrier}] - {s.flightNumber}
                        </div>
                      </Col>

                      {/* Departure — big time + airport code pill + date + terminal */}
                      <Col md={3}>
                        <div className="d-flex align-items-center" style={{ gap: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 22 }}>
                            {fmtTime(s.departureDateTime)}
                          </div>
                          <span
                            style={{
                              background: "#dbeafe",
                              color: "#1e40af",
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontWeight: 700,
                              fontSize: 12,
                            }}
                          >
                            {s.departureAirportCode}
                          </span>
                        </div>
                        <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                          {fmtDate(s.departureDateTime)}
                        </div>
                        {s.departureTerminal && (
                          <span
                            style={{
                              display: "inline-block",
                              marginTop: 4,
                              background: "#f1f3f5",
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: 11,
                            }}
                          >
                            Terminal {s.departureTerminal}
                          </span>
                        )}
                      </Col>

                      {/* Middle — duration / NON STOP / aircraft / class stacked */}
                      <Col md={2} className="text-center">
                        <div
                          style={{
                            background: "#dbeafe",
                            color: "#1e40af",
                            padding: "6px 10px",
                            borderRadius: 8,
                            display: "inline-block",
                            minWidth: 90,
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700 }}>
                            {durationBetween(s.departureDateTime, s.arrivalDateTime)}
                          </div>
                          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.5 }}>
                            NON STOP
                          </div>
                        </div>
                        {s.aircraft && (
                          <div className="text-muted mt-1" style={{ fontSize: 11 }}>
                            {s.aircraft}
                          </div>
                        )}
                        {s.bookingClass && (
                          <div
                            className="mt-1"
                            style={{
                              display: "inline-block",
                              background: "#f1f3f5",
                              padding: "1px 8px",
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {s.bookingClass}
                          </div>
                        )}
                      </Col>

                      {/* Arrival — big time + airport code pill + date + terminal */}
                      <Col md={3}>
                        <div className="d-flex align-items-center justify-content-end" style={{ gap: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 22 }}>
                            {fmtTime(s.arrivalDateTime)}
                          </div>
                          <span
                            style={{
                              background: "#dcfce7",
                              color: "#15803d",
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontWeight: 700,
                              fontSize: 12,
                            }}
                          >
                            {s.arrivalAirportCode}
                          </span>
                        </div>
                        <div className="text-muted text-end" style={{ fontSize: 11, marginTop: 2 }}>
                          {fmtDate(s.arrivalDateTime)}
                        </div>
                        {s.arrivalTerminal && (
                          <div className="text-end">
                            <span
                              style={{
                                display: "inline-block",
                                marginTop: 4,
                                background: "#f1f3f5",
                                padding: "2px 8px",
                                borderRadius: 4,
                                fontSize: 11,
                              }}
                            >
                              Terminal {s.arrivalTerminal}
                            </span>
                          </div>
                        )}
                      </Col>

                      {/* Flight Info link on the right */}
                      <Col md={2} className="text-end">
                        <Button
                          variant="outline-primary"
                          size="sm"
                          style={{ fontSize: 11, padding: "4px 10px" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openFlightInfo(s, `${leg.legIndex || i + 1}.${j}`);
                          }}
                        >
                          <FaInfoCircle style={{ marginRight: 4 }} />
                          Flight info
                        </Button>
                      </Col>
                    </Row>
                  </div>
                ))}
              </div>
            ))}

            {/* Cancellation policy strip — matches old project's summary bar
                below the flight card. Shows stops badge + refund policy. */}
            <div
              className="d-flex align-items-center flex-wrap"
              style={{
                gap: 16,
                padding: "12px 16px",
                background: "#fefce8",
                border: "1px solid #fde68a",
                borderRadius: 10,
                marginBottom: 8,
              }}
            >
              <Badge
                bg={legs[0]?.segments?.length > 1 ? "warning" : "primary"}
                style={{ fontSize: 12, padding: "8px 14px", letterSpacing: 0.5 }}
              >
                {stopsLabel(legs[0] || {}).toUpperCase()}
              </Badge>
              <div style={{ fontSize: 13 }}>
                <strong>Cancellation Policy:</strong>{" "}
                <span
                  style={{
                    color: rec.pricing?.refundable ? "#15803d" : "#b91c1c",
                    fontWeight: 600,
                  }}
                >
                  {rec.pricing?.refundable
                    ? "Refundable"
                    : "Non-Refundable After Departure"}
                </span>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                  {rec.pricing?.refundable
                    ? "Ticket refund allowed per airline rules"
                    : "Tickets are non-refundable after departure"}
                </div>
              </div>
            </div>

            {/* Fare details */}
            <div className="pt-2" style={{ borderTop: "1px solid #f1f3f5" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                <FaInfoCircle style={{ marginRight: 6 }} /> Fare & baggage
              </div>
              {rec.passengers?.map((p, i) => {
                const baseConv = conv(p.fareDetails?.totalFare, p.fareDetails?.currency);
                const paxTaxConv = conv(p.fareDetails?.totalTax, p.fareDetails?.currency);
                return (
                  <Row key={i} className="g-2" style={{ fontSize: 13 }}>
                    <Col md={3}>
                      <strong>{p.type}</strong> × {p.count}
                    </Col>
                    <Col md={3}>
                      Base: {fmtAmount(baseConv.amount, baseConv.code)}
                    </Col>
                    <Col md={3}>
                      Tax: {fmtAmount(paxTaxConv.amount, paxTaxConv.code)}
                    </Col>
                    <Col md={3}>
                      {p.fareDetails?.baggage
                        ? `${p.fareDetails.baggage.allowance ?? ""} ${p.fareDetails.baggage.unit ?? ""}`.trim()
                        : "As per airline"}
                    </Col>
                  </Row>
                );
              })}
            </div>
          </div>
        </Collapse>
      </Card.Body>

      {/* Flight Info modal — per-segment operational detail from
          Air_FlightInfo (equipment, terminals, gates, mileage, cabin
          capacity). Fetches on open. */}
      <FlightInfoModal
        target={infoTarget}
        loading={infoLoading}
        error={infoError}
        data={infoData}
        onClose={() => setInfoTarget(null)}
      />
    </Card>
  );
};

/* ─── FlightInfoModal — modal rendering Air_FlightInfo response ─── */
const FlightInfoModal = ({ target, loading, error, data, onClose }) => {
  const show = !!target;
  const s = target?.segment || {};
  const formatDuration = (mins) => {
    if (mins == null) return "—";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${String(m).padStart(2, "0")}m`;
  };
  const cabinName = (c) =>
    ({ F: "First", C: "Business", W: "Premium Economy", M: "Economy", Y: "Economy" }[c] || c);

  return (
    <Modal show={show} onHide={onClose} size="lg" centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 18 }}>
          <FaInfoCircle style={{ marginRight: 8, color: "#0d6efd" }} />
          Flight Info
          {s.marketingCarrier && s.flightNumber && (
            <span className="text-muted ms-2" style={{ fontSize: 14, fontWeight: 400 }}>
              · {s.marketingCarrier}
              {s.flightNumber} · {s.departureAirportCode || s.from} →{" "}
              {s.arrivalAirportCode || s.to}
            </span>
          )}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading && (
          <div className="text-center py-4">
            <Spinner animation="border" variant="primary" />
            <div className="text-muted mt-3">Fetching flight details from Amadeus…</div>
          </div>
        )}
        {!loading && error && (
          <Alert variant="danger" className="mb-0" style={{ fontSize: 13 }}>
            {error}
          </Alert>
        )}
        {!loading && !error && data && (
          <>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <div className="text-muted small">Aircraft</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {data.aircraftType || "—"}
                  {data.aircraftDescription && (
                    <span
                      className="text-muted ms-2"
                      style={{ fontSize: 12, fontWeight: 400 }}
                    >
                      {data.aircraftDescription}
                    </span>
                  )}
                </div>
              </Col>
              <Col md={3}>
                <div className="text-muted small">Duration</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {formatDuration(data.durationMinutes)}
                </div>
              </Col>
              <Col md={3}>
                <div className="text-muted small">Stops</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {data.numberOfStops != null ? data.numberOfStops : "—"}
                </div>
              </Col>
            </Row>

            <Row className="g-3 mb-3">
              <Col md={6}>
                <div className="text-muted small">Departure</div>
                <div style={{ fontSize: 13 }}>
                  <strong>{data.origin}</strong>
                  {data.departureTerminal && ` · Terminal ${data.departureTerminal}`}
                  {data.departureGate && ` · Gate ${data.departureGate}`}
                </div>
              </Col>
              <Col md={6}>
                <div className="text-muted small">Arrival</div>
                <div style={{ fontSize: 13 }}>
                  <strong>{data.destination}</strong>
                  {data.arrivalTerminal && ` · Terminal ${data.arrivalTerminal}`}
                  {data.arrivalGate && ` · Gate ${data.arrivalGate}`}
                </div>
              </Col>
            </Row>

            {(data.flightMileage != null ||
              (data.intermediateStops && data.intermediateStops.length > 0)) && (
              <Row className="g-3 mb-3">
                {data.flightMileage != null && (
                  <Col md={6}>
                    <div className="text-muted small">Mileage</div>
                    <div style={{ fontSize: 13 }}>
                      {data.flightMileage} {data.mileageUnit || ""}
                    </div>
                  </Col>
                )}
                {data.intermediateStops && data.intermediateStops.length > 0 && (
                  <Col md={6}>
                    <div className="text-muted small">Intermediate stops</div>
                    <div style={{ fontSize: 13 }}>
                      {data.intermediateStops.join(" → ")}
                    </div>
                  </Col>
                )}
              </Row>
            )}

            {data.cabinCapacities && data.cabinCapacities.length > 0 && (
              <div className="mb-3">
                <div className="text-muted small mb-1">Cabin capacity</div>
                <Table size="sm" bordered className="mb-0" style={{ fontSize: 13 }}>
                  <thead style={{ background: "#f8f9fa" }}>
                    <tr>
                      <th>Cabin</th>
                      <th className="text-end">Seats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cabinCapacities.map((c, i) => (
                      <tr key={i}>
                        <td>{cabinName(c.classDesignator)}</td>
                        <td className="text-end">{c.seats}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}

            {data.bookingClasses && data.bookingClasses.length > 0 && (
              <div className="mb-3">
                <div className="text-muted small mb-1">
                  Booking class availability
                </div>
                <div className="d-flex flex-wrap" style={{ gap: 6 }}>
                  {data.bookingClasses.map((bc, i) => (
                    <Badge
                      key={i}
                      bg={bc.status === "0" || bc.status === "C" ? "secondary" : "primary"}
                      style={{ fontSize: 12, padding: "6px 10px" }}
                    >
                      {bc.designator}
                      {bc.status ? ` (${bc.status})` : ""}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {data.notes && data.notes.length > 0 && (
              <Alert variant="info" className="mb-0" style={{ fontSize: 12 }}>
                <strong>Notes</strong>
                <ul className="mb-0 mt-1" style={{ paddingLeft: 18 }}>
                  {data.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

/* ─── Panel wrapper: handles loading / error / empty / results states ─── */
const FlightResults = ({ loading, error, searched, results, onSelect }) => {
  const rows = useMemo(() => (Array.isArray(results) ? results : []), [results]);

  // draftFilters = what the sidebar controls currently show; appliedFilters =
  // what actually filters/sorts `rows` below. They only sync when the user
  // clicks "Apply Filters" (or "Reset") — adjusting a control alone must not
  // change the displayed results, per requirement.
  const [draftFilters, setDraftFilters] = useState(emptyFilters());
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters());
  const [currencyOptions, setCurrencyOptions] = useState([]);
  // Client-side pagination — same shape as the Hotel Booking list. Amadeus
  // already returns the full recommendation list in one call, so paging
  // here means slicing the filtered/sorted rows for the current page.
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPerPage, setCurrentPerPage] = useState(PER_PAGE_OPTIONS[0]);

  // Currency list mirrors /new-booking/hotel's master_currency lookup
  // (currencyCode + value = multiplier). Loaded once; independent of search.
  useEffect(() => {
    let cancelled = false;
    axiosInstance
      .get("/api/currency?page=0")
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setCurrencyOptions(
          list
            .filter((c) => c && c.currencyCode)
            .map((c) => ({ code: c.currencyCode, rate: Number(c.value) })),
        );
      })
      .catch(() => {
        if (!cancelled) setCurrencyOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A fresh search should not carry over the previous search's filter
  // selections — and must reset back to the first page.
  useEffect(() => {
    setDraftFilters(emptyFilters());
    setAppliedFilters(emptyFilters());
    setCurrentPage(1);
  }, [results]);

  // Any filter/sort change (applied via the Apply Filters button) or a
  // page-size change should snap the user back to page 1 so they don't
  // end up on a page that no longer has any rows for the new set.
  useEffect(() => {
    setCurrentPage(1);
  }, [appliedFilters, currentPerPage]);

  // Airline checklist is derived from the full (unfiltered) result set so
  // unchecking an airline doesn't make its own checkbox disappear.
  const airlineOptions = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const code = carrierOf(r);
      if (code && !map.has(code)) map.set(code, airlineNameOf(r));
    });
    return Array.from(map.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  // Display-only currency conversion — mirrors HotelSearch's convertFromAed,
  // generalised to whichever currency a row's pricing actually came back in
  // (rather than hardcoding AED), since it never alters the search payload.
  const convert = (amount, nativeCode) => {
    if (amount == null || !appliedFilters.currency) return { amount, code: nativeCode };
    const nativeOpt = currencyOptions.find((o) => o.code === nativeCode);
    // master_currency.value is "AED per 1 unit", so native → target through AED
    // is `amount * nativeRate / targetRate`, not `amount * targetRate / nativeRate`.
    const nativeRate = nativeOpt && Number.isFinite(nativeOpt.rate) && nativeOpt.rate > 0 ? nativeOpt.rate : 1;
    const targetRate =
      Number.isFinite(appliedFilters.currency.rate) && appliedFilters.currency.rate > 0
        ? appliedFilters.currency.rate
        : nativeRate;
    return { amount: Number(amount) * (nativeRate / targetRate), code: appliedFilters.currency.code };
  };

  const visibleRows = useMemo(() => {
    let list = rows.slice();

    if (appliedFilters.stops.length) {
      list = list.filter((r) => {
        const s = maxStopsOf(r);
        const bucket = s === 0 ? "0" : s === 1 ? "1" : "2";
        return appliedFilters.stops.includes(bucket);
      });
    }

    if (appliedFilters.refundType.length) {
      list = list.filter((r) => {
        const key = r.pricing?.refundable ? "refundable" : "nonrefundable";
        return appliedFilters.refundType.includes(key);
      });
    }

    if (appliedFilters.airlines.length) {
      list = list.filter((r) => appliedFilters.airlines.includes(carrierOf(r)));
    }

    if (appliedFilters.priceSort === "lowToHigh") {
      list.sort((a, b) => priceOf(a) - priceOf(b));
    } else if (appliedFilters.priceSort === "highToLow") {
      list.sort((a, b) => priceOf(b) - priceOf(a));
    }

    return list;
  }, [rows, appliedFilters]);

  // Total pages after filters — always at least 1 so the pager still
  // renders (disabled) even when there are no visible rows.
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / currentPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * currentPerPage;
  const pageEnd = Math.min(pageStart + currentPerPage, visibleRows.length);
  const paginatedRows = visibleRows.slice(pageStart, pageEnd);

  const handlePageChange = (n) => {
    if (n < 1 || n > totalPages) return;
    setCurrentPage(n);
    // Keep the user oriented — scroll the results panel to the top
    // when they page. Matches the Hotel list's feel.
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const toggleDraft = (key, value) => {
    setDraftFilters((f) => {
      const set = f[key].includes(value)
        ? f[key].filter((v) => v !== value)
        : [...f[key], value];
      return { ...f, [key]: set };
    });
  };

  const resetFilters = () => {
    setDraftFilters(emptyFilters());
    setAppliedFilters(emptyFilters());
  };

  if (loading) {
    return (
      <div className="text-center p-5">
        <Spinner animation="border" variant="primary" />
        <div className="text-muted mt-3">Searching Flights for the best fares…</div>
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="danger" className="mt-3">
        <strong>Search failed.</strong> {error}
      </Alert>
    );
  }
  if (!searched) return null;
  if (rows.length === 0) {
    return (
      <Card className="mt-3">
        <Card.Body className="text-center py-5">
          <FaSearch style={{ fontSize: 34, opacity: 0.35 }} />
          <div className="mt-3" style={{ fontWeight: 600 }}>No flights found</div>
          <div className="text-muted" style={{ fontSize: 13 }}>
            Try a different date, cabin class, or route.
          </div>
        </Card.Body>
      </Card>
    );
  }

  return (
    <div className="mt-3">
      <Row className="g-4">
        {/* Left filter sidebar — mirrors /new-booking/hotel's filtersection
            Card styling. Hidden below lg, matching the hotel page's own
            sidebar behaviour on small screens. */}
        <Col lg={3} className="d-none d-lg-block">
          <Card className="shadow-sm rounded-xl filtersection">
            <Card.Body className="p-2">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="fw-semibold">Filters</span>
                <span
                  role="button"
                  className="text-primary small"
                  style={{ cursor: "pointer", fontWeight: 500 }}
                  onClick={resetFilters}
                >
                  Reset
                </span>
              </div>

              <Form.Group className="mb-2">
                <Form.Label className="fw-semibold small">Change Currency</Form.Label>
                <Form.Select
                  size="sm"
                  value={draftFilters.currency?.code || ""}
                  onChange={(e) => {
                    const opt = currencyOptions.find((o) => o.code === e.target.value) || null;
                    setDraftFilters((f) => ({ ...f, currency: opt }));
                  }}
                >
                  <option value="">Native (as returned)</option>
                  {currencyOptions.map((o) => (
                    <option key={o.code} value={o.code}>{o.code}</option>
                  ))}
                </Form.Select>
              </Form.Group>

              <hr />

              <Form.Group className="mb-2">
                <Form.Label className="fw-semibold small">Price Sort</Form.Label>
                <div className="d-flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    className={`sort-pill ${draftFilters.priceSort === "lowToHigh" ? "active" : ""}`}
                    onClick={() =>
                      setDraftFilters((f) => ({
                        ...f,
                        priceSort: f.priceSort === "lowToHigh" ? "" : "lowToHigh",
                      }))
                    }
                  >
                    Lowest Price
                  </Button>
                  <Button
                    size="sm"
                    className={`sort-pill ${draftFilters.priceSort === "highToLow" ? "active" : ""}`}
                    onClick={() =>
                      setDraftFilters((f) => ({
                        ...f,
                        priceSort: f.priceSort === "highToLow" ? "" : "highToLow",
                      }))
                    }
                  >
                    Highest Price
                  </Button>
                </div>
              </Form.Group>

              <hr />

              <Form.Group className="mb-2">
                <Form.Label className="fw-semibold small">Preferred Flights</Form.Label>
                <div className="filter-checkbox-list">
                  {STOP_OPTIONS.map((item) => (
                    <Form.Check
                      key={item.value}
                      type="checkbox"
                      id={`stops-${item.value}`}
                      label={item.label}
                      checked={draftFilters.stops.includes(item.value)}
                      onChange={() => toggleDraft("stops", item.value)}
                    />
                  ))}
                </div>
              </Form.Group>

              <hr />

              <Form.Group className="mb-2">
                <Form.Label className="fw-semibold small">Refund Type</Form.Label>
                <div className="filter-checkbox-list">
                  {REFUND_OPTIONS.map((item) => (
                    <Form.Check
                      key={item.value}
                      type="checkbox"
                      id={`refund-${item.value}`}
                      label={item.label}
                      checked={draftFilters.refundType.includes(item.value)}
                      onChange={() => toggleDraft("refundType", item.value)}
                    />
                  ))}
                </div>
              </Form.Group>

              {airlineOptions.length > 0 && (
                <>
                  <hr />
                  <Form.Group className="mb-2">
                    <Form.Label className="fw-semibold small">Airline</Form.Label>
                    <div className="filter-checkbox-list">
                      {airlineOptions.map((item) => (
                        <Form.Check
                          key={item.code}
                          type="checkbox"
                          id={`airline-${item.code}`}
                          label={item.name !== item.code ? `${item.name} (${item.code})` : item.code}
                          checked={draftFilters.airlines.includes(item.code)}
                          onChange={() => toggleDraft("airlines", item.code)}
                        />
                      ))}
                    </div>
                  </Form.Group>
                </>
              )}

              <Button
                variant="primary"
                className="w-100 mt-2"
                onClick={() => setAppliedFilters(draftFilters)}
              >
                Apply Filters
              </Button>
            </Card.Body>
          </Card>
        </Col>

        {/* Results */}
        <Col lg={9}>
          <div className="mb-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div>
              <strong>{visibleRows.length}</strong> flight{visibleRows.length !== 1 ? "s" : ""} found
              {visibleRows.length !== rows.length && (
                <span className="text-muted small ms-1">(filtered from {rows.length})</span>
              )}
              {visibleRows.length > 0 && (
                <span className="text-muted small ms-2">
                  Showing {pageStart + 1}-{pageEnd} of {visibleRows.length}
                </span>
              )}
            </div>
            <div className="text-muted" style={{ fontSize: 12 }}>
              Prices shown include markup and taxes
            </div>
          </div>
          {visibleRows.length === 0 ? (
            <Card>
              <Card.Body className="text-center py-5">
                <FaSearch style={{ fontSize: 34, opacity: 0.35 }} />
                <div className="mt-3" style={{ fontWeight: 600 }}>No flights match these filters</div>
                <div className="text-muted" style={{ fontSize: 13 }}>
                  Try adjusting or resetting the filters.
                </div>
              </Card.Body>
            </Card>
          ) : (
            <>
              {paginatedRows.map((r) => (
                <FlightCard key={r.id ?? r.recommendationIndex} rec={r} onSelect={onSelect} convert={convert} />
              ))}

              {/* Pagination bar — same shape / behaviour as Hotel Booking
                  list (sliding 5-page window, Prev/Next, rows-per-page
                  select). Kept purely client-side because Amadeus returns
                  the full recommendation set in the single search call. */}
              <Card className="mt-3 shadow-sm">
                <Card.Body className="p-2 d-flex flex-wrap align-items-center justify-content-between gap-2">
                  <div className="text-muted" style={{ fontSize: "0.85rem" }}>
                    Showing{" "}
                    <span className="fw-semibold text-dark">{pageStart + 1}</span>
                    {" "}to{" "}
                    <span className="fw-semibold text-dark">{pageEnd}</span>
                    {" "}of{" "}
                    <span className="fw-semibold text-dark">{visibleRows.length}</span>
                    {" "}flights
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <span className="text-muted" style={{ fontSize: "0.8rem" }}>
                      Rows per page
                    </span>
                    <Form.Select
                      size="sm"
                      value={currentPerPage}
                      onChange={(e) => setCurrentPerPage(Number(e.target.value))}
                      style={{ width: "auto", fontSize: "0.8rem" }}
                    >
                      {PER_PAGE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </Form.Select>
                  </div>
                  <Pagination className="mb-0">
                    <Pagination.Prev
                      disabled={safePage === 1}
                      onClick={() => handlePageChange(safePage - 1)}
                      style={{
                        cursor: safePage === 1 ? "not-allowed" : "pointer",
                        opacity: safePage === 1 ? 0.5 : 1,
                      }}
                    />
                    {(() => {
                      // Sliding 5-page window centred on the current page.
                      // Matches HotelBookingList's paginator so the two
                      // pages feel identical to the user.
                      const windowSize = 5;
                      const startPage = Math.max(
                        1,
                        Math.min(
                          safePage - Math.floor(windowSize / 2),
                          totalPages - windowSize + 1,
                        ),
                      );
                      const endPage = Math.min(totalPages, startPage + windowSize - 1);
                      return Array.from(
                        { length: endPage - startPage + 1 },
                        (_, i) => startPage + i,
                      ).map((n) => (
                        <Pagination.Item
                          key={n}
                          active={safePage === n}
                          onClick={() => handlePageChange(n)}
                          style={{ cursor: "pointer", minWidth: 38, textAlign: "center" }}
                        >
                          {n}
                        </Pagination.Item>
                      ));
                    })()}
                    <Pagination.Next
                      disabled={safePage === totalPages}
                      onClick={() => handlePageChange(safePage + 1)}
                      style={{
                        cursor: safePage === totalPages ? "not-allowed" : "pointer",
                        opacity: safePage === totalPages ? 0.5 : 1,
                      }}
                    />
                  </Pagination>
                </Card.Body>
              </Card>
            </>
          )}
        </Col>
      </Row>
    </div>
  );
};

export default FlightResults;
