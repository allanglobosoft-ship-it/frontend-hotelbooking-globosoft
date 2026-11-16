import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  Button,
  Spinner,
  Badge,
  Row,
  Col,
  Alert,
  Accordion,
  Form,
  Modal,
} from "react-bootstrap";
import { useAccordionButton } from "react-bootstrap/AccordionButton";
import {
  FaHotel,
  FaMapMarkerAlt,
  FaPhone,
  FaCalendarAlt,
  FaBed,
  FaUsers,
  FaStar,
  FaInfoCircle,
  FaCheckCircle,
  FaShieldAlt,
  FaMoneyBillWave,
  FaUtensils,
  FaChevronDown,
  FaChevronUp,
  FaTimesCircle,
  FaGlobe,
} from "react-icons/fa";
import axiosInstance from "../components/AxiosInstance";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import AgentBalanceDisplay from "../components/AgentBalanceDisplay";
import RoomFilters from "../components/roomlist/RoomFilters";
import useRoomFilters from "../hooks/useRoomFilters";
import RefundBadge from "../components/RefundBadge";
import {
  REFUND_FLEXIBLE,
  REFUND_NON_REFUNDABLE,
  REFUND_PARTIAL,
} from "../utils/refundLabel";
import { toast } from "react-hot-toast";
import "../styles/RoomList.css";

// Display currency carried over from the search page. Rates are AED; this
// converts them for display only. The page sets `_lsCurrency` from the
// sessionStorage handoff before rendering, so all formatPrice calls (incl.
// the sub-components RoomCardGrid/RoomCardList and buildBreakdown) convert.
// AED → factor 1.
let _lsCurrency = { code: "AED", factor: 1 };
const formatPrice = (price) =>
  `${_lsCurrency.code} ${((Number(price) || 0) * _lsCurrency.factor).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// ── Cancellation-policy formatters — copied verbatim from
//    LongStayBookingPage so the policy text shown inside each room card's
//    "Cancellation Policies & Terms" modal reads identically to the
//    booking-page pre-confirm modal. The contract's cancellationPolicy
//    entries have the shape { chargeType, value, condition }.
const formatChargeValue = (p) => {
  if (p == null || p.value == null) return "—";
  const t = (p.chargeType || "").toUpperCase();
  if (t === "PERCENT") return `${p.value}%`;
  if (t === "AMOUNT") return `AED ${p.value}`;
  if (t === "NIGHTS") return `${p.value} night${p.value === 1 ? "" : "s"}`;
  return String(p.value);
};

const formatCancellationPolicyLine = (p) => {
  if (!p) return "";
  const value = formatChargeValue(p);
  const cond = (p.condition || "").trim();
  return cond ? `${value} ${cond}` : value;
};

// Short "how it adds up" line for the room card. Shows the exact pieces
// the backend used (months × monthly + remainder per cost type + extra
// adult + child charges) so the operator can sanity-check the total.
const buildBreakdown = (contract, room, totalNights, extraAdults = 0, children = 0) => {
  if (!contract || !room || !totalNights) return null;
  const monthly = Number(room.monthlyRate) || 0;
  const weekly = Number(room.weeklyRate) || 0;
  const daily = Number(room.dayRate) || 0;
  const adultRate = Number(room.adultRate) || 0;
  const childRate = Number(room.childRate) || 0;
  const months = Math.floor(totalNights / 30);
  const extra = totalNights % 30;
  const parts = [];
  if (months > 0) {
    parts.push(`${months} × ${formatPrice(monthly)}`);
  }
  const ct = (contract.additionalCostType || "").toUpperCase();
  if (extra > 0) {
    if (ct === "WEEKLY") {
      const weeks = Math.floor(extra / 7);
      const sub = extra % 7;
      if (weeks > 0) parts.push(`${weeks} wk × ${formatPrice(weekly)}`);
      if (sub > 0) parts.push(`${sub} d × ${formatPrice(daily)}`);
    } else if (ct === "PRO_RATE" || ct === "PRORATE") {
      const perDay = monthly / 30;
      parts.push(`${extra} d × ${formatPrice(perDay)}`);
    } else {
      parts.push(`${extra} d × ${formatPrice(daily)}`);
    }
  }
  // Extras are PER MONTH — show "× N month" where N = totalNights/30.
  // Stringify to 2 decimals only when there's a remainder so the
  // common 1-month / 2-month / 3-month cases stay clean.
  const monthsFactor = totalNights / 30;
  const monthsLabel = Number.isInteger(monthsFactor)
    ? `${monthsFactor} month${monthsFactor === 1 ? "" : "s"}`
    : `${monthsFactor.toFixed(2)} months`;
  if (extraAdults > 0 && adultRate > 0) {
    parts.push(`${extraAdults} extra adult × ${formatPrice(adultRate)} × ${monthsLabel}`);
  }
  if (children > 0 && childRate > 0) {
    parts.push(`${children} child × ${formatPrice(childRate)} × ${monthsLabel}`);
  }
  return parts.join("  +  ");
};

const renderStars = (rating) => {
  const n = Number(rating) || 0;
  if (n <= 0) return <span className="text-muted small">No rating</span>;
  return Array.from({ length: n }, (_, i) => (
    <FaStar key={i} className="text-warning" />
  ));
};

// Long stay policies are free text, so their dates can't be read. A refundable
// room whose contract has any charge row above 0 shows Flexible - Partial at all
// times; with no such row it shows Flexible.
const longStayLabel = (refundable, contract) => {
  if (!refundable) return REFUND_NON_REFUNDABLE;
  const charged = (contract?.cancellationPolicy || []).some(
    (row) => Number(row?.value) > 0,
  );
  return charged ? REFUND_PARTIAL : REFUND_FLEXIBLE;
};

// Availability badge — mirrors /room-list's per-room status. "Available"
// (green) when the hotel has an active availability header configured for the
// room's category, "On Request" (amber) otherwise. Driven by room.roomStatus
// from the backend (LongStayContractService#toDTO).
const availabilityBadge = (roomStatus) =>
  roomStatus === "On Request" ? (
    <Badge bg="warning" text="dark">On Request</Badge>
  ) : (
    <Badge bg="success">Available</Badge>
  );

const costTypeBadge = (type) => {
  const t = (type || "").toUpperCase();
  if (t === "WEEKLY") {
    return <Badge bg="info">Weekly billing</Badge>;
  }
  if (t === "PRO_RATE" || t === "PRORATE") {
    return <Badge bg="warning" text="dark">Pro-rate billing</Badge>;
  }
  return <Badge bg="secondary">Day-wise billing</Badge>;
};

function AccordionToggleButton({ eventKey, isActive }) {
  const decoratedOnClick = useAccordionButton(eventKey);
  return (
    <Button
      variant="outline-primary"
      size="sm"
      onClick={decoratedOnClick}
      className="d-flex align-items-center gap-1"
    >
      {isActive ? "Hide Details/Book" : "View Details/Book"}
      {isActive ? <FaChevronUp /> : <FaChevronDown />}
    </Button>
  );
}

// ── View Toggle Bar ──────────────────────────────────────────────────────────
// Grid / List toggle mirrors RoomList.jsx exactly: a bootstrap btn-group of
// primary/outline-primary Buttons with the ⊞ / ☰ glyphs (no icons/labels).
function ViewToggleBar({ view, onViewChange, count }) {
  return (
    <div className="d-flex justify-content-between align-items-center mb-4">
      <h4 className="mb-0">
        Available Long Stay Contracts ({count})
      </h4>
      <div className="btn-group shadow-sm gap-1" role="group">
        <Button
          variant={view === "grid" ? "primary" : "outline-primary"}
          onClick={() => onViewChange("grid")}
          className="d-flex align-items-center gap-2"
          size="sm"
          title="Grid view"
        >
          <span className="fs-5" style={{ lineHeight: 1 }}>⊞</span>
        </Button>
        <Button
          variant={view === "list" ? "primary" : "outline-primary"}
          onClick={() => onViewChange("list")}
          className="d-flex align-items-center gap-2"
          size="sm"
          title="List view"
        >
          <span className="fs-5" style={{ lineHeight: 1 }}>☰</span>
        </Button>
      </div>
    </div>
  );
}

// ── Grid Room Card ────────────────────────────────────────────────────────────
// Multi-room props (`isMultiRoom`, `roomSlotIndex`, `isSelected`, `onSelect`)
// are optional. Single-room callers omit them and the existing Book button
// renders unchanged. Multi-room callers pass them and the button is
// swapped for a radio bound to the room slot. See LongStayRoomList main
// component for the selectedRooms wiring.
function RoomCardGrid({
  contract,
  room,
  totalNights,
  estPrice,
  exceedsCap,
  onBook,
  onViewPolicies,
  extraAdults = 0,
  extraChildren = 0,
  isMultiRoom = false,
  roomSlotIndex = 0,
  isSelected = false,
  onSelect,
}) {
  // Highlight only the card chosen for THIS room slot. Other slots' picks
  // must not tint this list. Matches RoomList.jsx multi-room UX.
  const isSelectedForThisSlot = isMultiRoom && isSelected;
  return (
    <Col lg={6} xl={4} className="mb-3">
      <Card
        className={`rate-card h-100 shadow-sm${isSelectedForThisSlot ? " rate-card-selected" : ""}`}
        style={
          isSelectedForThisSlot
            ? {
                borderColor: "#198754",
                borderWidth: "2px",
                backgroundColor: "#e8f5ec",
                position: "relative",
              }
            : undefined
        }
      >
        {isSelectedForThisSlot && (
          <span
            style={{
              position: "absolute",
              top: "6px",
              right: "6px",
              backgroundColor: "#198754",
              color: "#fff",
              fontSize: "0.7rem",
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: "4px",
              zIndex: 1,
            }}
          >
            ✓ Selected
          </span>
        )}
        <Card.Body className="p-2 pb-0 d-flex flex-column gap-2">
          {/* Header — mirrors RoomList: only two top-level children in
              the d-flex row so long category names don't get squeezed. */}
          <div className="rate-header d-flex justify-content-between align-items-start">
            <div>
              <h6 className="mb-1">
                {room.roomCategoryName || `Category #${room.hotelRoomCategoryId}`}
              </h6>
              <div className="small text-muted">
                {room.roomTypeName || `Type #${room.hotelRoomTypeId}`}
              </div>
            </div>
            <div className="d-flex flex-column align-items-end gap-1">
              {room.roomStatus && availabilityBadge(room.roomStatus)}
              <RefundBadge label={longStayLabel(room.refundable, contract)} />
            </div>
          </div>

          {/* Attributes */}
          <div className="small text-muted d-flex flex-wrap gap-3">
            <span>
              <FaUsers className="me-1" />
              {room.occupancyTypeName || `Occ-${room.occupancyTypeId}`}
            </span>
            {room.meal && (
              <span>
                <FaUtensils className="me-1 text-success" />
                Meal included
              </span>
            )}
            {room.extraBed && (
              <span>
                <FaBed className="me-1 text-info" />
                Extra bed
              </span>
            )}
          </div>

          {/* Estimated total + how it's calculated — one compact block
              so the operator sees the headline figure AND the pieces
              that make it up (e.g. "3 × AED 1,000  +  17 d × AED 100")
              without the full rate sheet on screen. */}
          <div className="rate-pricing text-center py-2 border-top border-bottom">
            <div className="small text-muted">
              Estimated total for {totalNights} night{totalNights !== 1 ? "s" : ""}
            </div>
            <div className="current-price fw-bold text-primary" style={{ fontSize: "1.4rem" }}>
              {formatPrice(estPrice)}
            </div>
            {/* {(() => {
              const line = buildBreakdown(contract, room, totalNights, extraAdults, extraChildren);
              return line ? (
                <div className="small text-muted mt-1">{line}</div>
              ) : null;
            })()} */}
            <div className="price-per-night small text-muted mt-1">
              Final amount confirmed at booking
            </div>
          </div>

          {/* Cancellation Policies & Terms — opens the same policy content
              the booking page shows pre-confirm, surfaced here on the room
              card (mirrors /room-list). */}
          {onViewPolicies && (
            <Button
              variant="link"
              size="sm"
              className="p-0 text-decoration-underline align-self-start"
              onClick={(e) => {
                e.stopPropagation();
                onViewPolicies(contract);
              }}
            >
              <FaShieldAlt className="me-2" />
              Cancellation Policies &amp; Terms &amp; Conditions
            </Button>
          )}

          {/* Book button (single-room) / per-room radio (multi-room) */}
          {isMultiRoom ? (
            <Form.Check
              type="radio"
              id={`ls-rate-radio-grid-${roomSlotIndex}-${contract?.id || "c"}-${room.longStayRoomId}`}
              name={`ls-rate-radio-grid-room-${roomSlotIndex}`}
              className="w-100 mt-1 mb-1"
              disabled={exceedsCap}
              label={
                exceedsCap
                  ? "Stay too long"
                  : isSelected
                    ? `Selected for Room ${roomSlotIndex + 1}`
                    : `Select for Room ${roomSlotIndex + 1}`
              }
              checked={isSelected}
              onChange={() => onSelect && onSelect(contract, room)}
            />
          ) : (
            <Button
              variant={exceedsCap ? "outline-secondary" : "primary"}
              className="w-100 book-now-btn"
              disabled={exceedsCap}
              onClick={() => onBook(contract, room)}
            >
              <FaMoneyBillWave className="me-2" />
              {exceedsCap ? "Stay too long" : "Book this room"}
            </Button>
          )}

          {/* <div className="small text-muted text-center">
            <FaShieldAlt className="me-1" />
            Room ID #{room.longStayRoomId}
          </div> */}
        </Card.Body>
      </Card>
    </Col>
  );
}

// ── List Room Card ────────────────────────────────────────────────────────────
// See note on RoomCardGrid — same multi-room prop pattern.
function RoomCardList({
  contract,
  room,
  totalNights,
  estPrice,
  exceedsCap,
  onBook,
  onViewPolicies,
  extraAdults = 0,
  extraChildren = 0,
  isMultiRoom = false,
  roomSlotIndex = 0,
  isSelected = false,
  onSelect,
}) {
  // Highlight only the row chosen for THIS room slot — same pattern as
  // the grid card so both view modes share the multi-room UX.
  const isSelectedForThisSlot = isMultiRoom && isSelected;
  return (
    <div
      className="d-flex align-items-center gap-3 p-3 mb-2 border rounded"
      style={{
        flexWrap: "wrap",
        backgroundColor: isSelectedForThisSlot ? "#e8f5ec" : "#fff",
        borderColor: isSelectedForThisSlot ? "#198754" : undefined,
        borderWidth: isSelectedForThisSlot ? 2 : 1,
        position: "relative",
      }}
    >
      {isSelectedForThisSlot && (
        <span
          style={{
            position: "absolute",
            top: "6px",
            right: "6px",
            backgroundColor: "#198754",
            color: "#fff",
            fontSize: "0.7rem",
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: "4px",
            zIndex: 1,
          }}
        >
          ✓ Selected
        </span>
      )}
      {/* Left: name & attributes */}
      <div style={{ minWidth: 160, flex: "1 1 160px" }}>
        <div className="fw-semibold small">
          {room.roomCategoryName || `Category #${room.hotelRoomCategoryId}`}
        </div>
        <div className="text-muted" style={{ fontSize: 12 }}>
          {room.roomTypeName || `Type #${room.hotelRoomTypeId}`}
        </div>
        <div className="d-flex flex-wrap gap-2 mt-1">
          {room.roomStatus && availabilityBadge(room.roomStatus)}
          <RefundBadge label={longStayLabel(room.refundable, contract)} />
          {room.meal && (
            <Badge bg="success" className="small">
              <FaUtensils className="me-1" />
              Meal
            </Badge>
          )}
          {room.extraBed && (
            <Badge bg="info" className="small">
              <FaBed className="me-1" />
              Extra bed
            </Badge>
          )}
        </div>
        {onViewPolicies && (
          <Button
            variant="link"
            size="sm"
            className="p-0 mt-1 text-decoration-underline"
            style={{ fontSize: 12 }}
            onClick={(e) => {
              e.stopPropagation();
              onViewPolicies(contract);
            }}
          >
            <FaShieldAlt className="me-1" />
            Cancellation Policies &amp; Terms
          </Button>
        )}
      </div>

      {/* Middle: how the total is computed (compact) */}
      <div
        className="small text-muted"
        style={{ flex: "1 1 220px" }}
      >
        <div style={{ fontSize: 11 }}>How it adds up</div>
        <div className="text-dark" style={{ fontSize: 12 }}>
          {buildBreakdown(contract, room, totalNights, extraAdults, extraChildren) || "—"}
        </div>
      </div>

      {/* Right: estimated total (headline) + button */}
      <div className="d-flex align-items-center gap-3 ms-auto" style={{ flexShrink: 0 }}>
        <div className="text-end">
          <div className="text-muted" style={{ fontSize: 11 }}>
            Estimated total · {totalNights} night{totalNights !== 1 ? "s" : ""}
          </div>
          <div className="fw-bold text-primary" style={{ fontSize: 18 }}>
            {formatPrice(estPrice)}
          </div>
        </div>
        {isMultiRoom ? (
          <Form.Check
            type="radio"
            id={`ls-rate-radio-list-${roomSlotIndex}-${contract?.id || "c"}-${room.longStayRoomId}`}
            name={`ls-rate-radio-list-room-${roomSlotIndex}`}
            disabled={exceedsCap}
            label={
              exceedsCap
                ? "Stay too long"
                : isSelected
                  ? `Selected for Room ${roomSlotIndex + 1}`
                  : `Select for Room ${roomSlotIndex + 1}`
            }
            checked={isSelected}
            onChange={() => onSelect && onSelect(contract, room)}
            style={{ whiteSpace: "nowrap" }}
          />
        ) : (
          <Button
            variant={exceedsCap ? "outline-secondary" : "primary"}
            size="sm"
            disabled={exceedsCap}
            onClick={() => onBook(contract, room)}
            className="d-flex align-items-center gap-1"
          >
            <FaMoneyBillWave size={12} />
            {exceedsCap ? "Stay too long" : "Book"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LongStayRoomList() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(null);
  // Sync the module-level display currency from the search handoff so every
  // formatPrice (incl. sub-components) renders in the chosen currency. Runs
  // during render, before children render. AED / missing → factor 1.
  _lsCurrency =
    draft?.currency && Number(draft.currency.factor) > 0
      ? { code: draft.currency.code || "AED", factor: Number(draft.currency.factor) }
      : { code: "AED", factor: 1 };
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Which contract accordion is open, tracked PER ROOM SLOT so opening
  // a contract in Room 1 doesn't also open the same contract in Room 2
  // (they used to share a single string; multi-room searches now keep
  // each room's expanded contract independent). Default seed "0" is
  // read per-slot on first render so single-room mode is unchanged.
  const [activeAccordions, setActiveAccordions] = useState({});
  const [viewMode, setViewMode] = useState("list"); // "grid" | "list"

  // Cancellation Policies & Terms modal — opened from a per-room-card link.
  // Read-only viewer; sources directly from the contract already loaded
  // (cancellationPolicy / cancellationPolicyNotes / termsAndConditions), so
  // no extra API call and the booking flow is untouched.
  const [showPoliciesModal, setShowPoliciesModal] = useState(false);
  const [policiesModalContract, setPoliciesModalContract] = useState(null);
  const openPoliciesModal = (contract) => {
    setPoliciesModalContract(contract || null);
    setShowPoliciesModal(true);
  };

  // ──────────────────────────────────────────────────────────────────────
  // Multi-room selection — mirrors RoomList.jsx.
  //
  // Single-room searches (numRooms === 1) keep using `handleBook` —
  // each room card renders the legacy "Book this room" button and the
  // flow is unchanged.
  //
  // Multi-room searches (numRooms > 1) render a per-room outer
  // Accordion. Each room card's button is swapped for a radio bound
  // to the active slot. Important caveat: the long-stay-booking
  // endpoint accepts ONE (contract, room) per booking today, so when
  // the user picks different rooms per slot the combined handler uses
  // Room 1's pick. The other slots' picks ride along as
  // `roomBreakdown` for future backend work; the user is told this on
  // the bottom CTA.
  // ──────────────────────────────────────────────────────────────────────
  const [selectedRooms, setSelectedRooms] = useState([]);

  // Shared Room-Type + Refund-Policy filters (same UX as /room-list).
  // Long-stay rooms carry `refundable` (boolean); they have no meal-plan
  // string, so the closest "type" label (roomTypeName) is matched against
  // the Room-Type options. The Refund-Policy filter uses the same label as
  // the card's badge, which needs the room's contract.
  const filters = useRoomFilters();
  const roomVisible = (r, contract) =>
    filters.rateMatches({
      label: longStayLabel(r.refundable, contract),
      mealPlan: r.roomTypeName,
    });
  // Agent markup config — fetched once for the agent the search was
  // initiated with. Used by estimateStayPrice to surface the
  // agent-marked-up total (same shape the hotel flow shows: the
  // displayed "from" price is what the agent actually pays).
  // markup = { markupType: "PERCENT" | "AMOUNT", markupValue: Number }
  const [agentMarkup, setAgentMarkup] = useState(null);

  // ── Payment-path gate — mirrors RoomList / LastMinuteRoomList. When
  //    the agent has NO available credit AND per-agent Card payment is
  //    disabled, block Book here instead of sending them into a booking
  //    form they can't submit.
  const [agentBalance, setAgentBalance] = useState(null);
  const [agentCardPaymentEnabled, setAgentCardPaymentEnabled] = useState(false);
  const [showNoPaymentPathModal, setShowNoPaymentPathModal] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("longStayRoomListPayload");
    if (!raw) {
      toast.error("No search context — please search again");
      window.close();
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      setError("Search context is corrupted. Please search again.");
      setLoading(false);
      return;
    }
    setDraft(parsed);

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await axiosInstance.get(
          `/api/longStayContract?hotelId=${parsed.payload.hotelId}&page=0&size=50`
        );
        const cIn = new Date(parsed.payload.checkInDate);
        const cOut = new Date(parsed.payload.checkOutDate);
        const valid = (res.data.content || []).filter(
          (c) =>
            c.isLive &&
            new Date(c.validityFrom) <= cIn &&
            new Date(c.validityTo) >= cOut
        );
        setContracts(valid);
      } catch (e) {
        console.error("Long stay load failed:", e);
        setError("Failed to load long stay contracts");
        toast.error("Failed to load long stay contracts");
      } finally {
        setLoading(false);
      }
    };
    load();

    // Fire-and-forget: fetch the agent's markup so estimateStayPrice
    // can apply it to each room card's "Estimated total". Silent on
    // failure (404 = agent has no markup → no surcharge to apply).
    const agentId = parsed?.payload?.agentId;
    if (agentId) {
      axiosInstance
        .get(`/api/agents/${agentId}/markup`)
        .then((res) => {
          const d = res.data;
          if (d && d.markupType && d.markupValue != null) {
            setAgentMarkup({
              markupType: d.markupType,
              markupValue: Number(d.markupValue),
            });
          }
        })
        .catch(() => {
          // Agent without configured markup — leave agentMarkup null
          // so the room list shows pre-markup rates.
        });

      // Available credit + Card gate — both drive the "no viable
      // payment path" block modal. Fail-safe defaults keep the flow
      // unblocked on a hiccup so a network error never spuriously
      // gates a booking.
      axiosInstance
        .get(`/api/agent-credit-limit/agent/${agentId}`)
        .then((res) => {
          setAgentBalance(res?.data?.availableCreditLimit ?? 0);
        })
        .catch(() => setAgentBalance(0));
      axiosInstance
        .get(`/api/agent/${agentId}`)
        .then((res) => {
          setAgentCardPaymentEnabled(!!res?.data?.cardPaymentEnabled);
        })
        .catch(() => setAgentCardPaymentEnabled(false));
    }
  }, []);

  // Blanket "no viable payment path" check for the room-list gate:
  // available credit 0 (or no credit-limit row) AND Card disabled.
  // Partial-credit shortfalls are still caught by the booking page's
  // own scenario-3 gate.
  const hasNoPaymentPath =
    Number(agentBalance) <= 0 && !agentCardPaymentEnabled;

  const totalNights = useMemo(() => {
    if (!draft) return 0;
    const ci = new Date(draft.payload.checkInDate);
    const co = new Date(draft.payload.checkOutDate);
    return Math.max(0, Math.round((co - ci) / 86400000));
  }, [draft]);

  const guestSummary = useMemo(() => {
    if (!draft?.payload?.rooms) return null;
    const rooms = draft.payload.rooms;
    const adults = rooms.reduce((s, r) => s + (r.adults || 0), 0);
    const children = rooms.reduce((s, r) => s + (r.children || 0), 0);
    return { rooms: rooms.length, adults, children };
  }, [draft]);

  // Sum the party across all requested rooms once.
  // Long-stay convention (matches backend LongStayBookingService and
  // LongStaySearchService): monthly rate covers ONE adult, every
  // additional adult is "extra" billed at adultRate × nights. All
  // children incur childRate × nights.
  const partyExtras = useMemo(() => {
    const list = draft?.payload?.rooms || [];
    let extraAdults = 0;
    let children = 0;
    for (const r of list) {
      const a = Number(r.adults || 0);
      const c = Number(r.children || 0);
      if (a > 1) extraAdults += a - 1;
      children += c;
    }
    return { extraAdults, children };
  }, [draft]);

  // Mirror of the backend LongStayPricingService formula so the UI
  // estimate matches the booking quote. 30-day month for all cost
  // types; the remainder (< 30 days) is billed per the contract's
  // additionalCostType:
  //   • WEEKLY   → 7-day blocks × weeklyRate + sub-week × dayRate
  //   • PRO_RATE → remainder × (monthlyRate / 30)
  //   • else     → remainder × dayRate (day-wise)
  // Then extras: (extraAdults × adultRate + children × childRate) × nights.
  const estimateStayPrice = (contract, room) => {
    if (!contract || !room || !totalNights) return 0;
    const monthly = Number(room.monthlyRate) || 0;
    const weekly = Number(room.weeklyRate) || 0;
    const daily = Number(room.dayRate) || 0;
    const adultRate = Number(room.adultRate) || 0;
    const childRate = Number(room.childRate) || 0;
    const months = Math.floor(totalNights / 30);
    const extraDays = totalNights % 30;
    const monthsAmount = months * monthly;

    let base;
    const ct = (contract.additionalCostType || "").toUpperCase();
    if (ct === "WEEKLY") {
      const weeks = Math.floor(extraDays / 7);
      const subWeekDays = extraDays % 7;
      base = monthsAmount + weeks * weekly + subWeekDays * daily;
    } else if (ct === "PRO_RATE" || ct === "PRORATE") {
      base = monthsAmount + extraDays * (monthly / 30);
    } else {
      base = monthsAmount + extraDays * daily;
    }
    // adultRate / childRate are PER MONTH (mirrors monthlyRate cadence).
    // Pro-rate by months stayed: 30 nights = 1×, 60 nights = 2×, etc.
    const monthsFactor = totalNights / 30;
    const extras =
      (partyExtras.extraAdults * adultRate + partyExtras.children * childRate) *
      monthsFactor;
    const subtotal = base + extras;

    // Apply agent markup last — same shape the backend uses
    // (LongStayBookingService#applyAgentMarkup → calculateMarkupDirect).
    // PERCENT: subtotal + subtotal × value / 100. AMOUNT: subtotal + value.
    if (agentMarkup && agentMarkup.markupValue > 0) {
      if (agentMarkup.markupType === "PERCENT") {
        return subtotal + (subtotal * agentMarkup.markupValue) / 100;
      }
      if (agentMarkup.markupType === "AMOUNT") {
        return subtotal + agentMarkup.markupValue;
      }
    }
    return subtotal;
  };

  const handleBook = (contract, room) => {
    // Scenario-3 short-circuit — block here when the agent has zero
    // credit AND no Card option (no viable payment path anywhere).
    if (hasNoPaymentPath) {
      setShowNoPaymentPathModal(true);
      return;
    }
    if (contract.maxBookingDays && totalNights > contract.maxBookingDays) {
      toast.error(
        `Selected contract caps stays at ${contract.maxBookingDays} nights — your dates are ${totalNights}.`
      );
      return;
    }
    sessionStorage.setItem(
      "longStayBookingDraft",
      JSON.stringify({
        hotelId: draft.payload.hotelId,
        hotelName: draft.meta.hotelName,
        // Pass the hotel address through so the booking page's
        // confirmation summary can render it under the hotel name
        // (the long-stay search payload puts it on meta.address).
        address: draft.meta?.address || "",
        checkIn: draft.payload.checkInDate,
        checkOut: draft.payload.checkOutDate,
        agentId: draft.payload.agentId || null,
        // Optional "Booking Done By Employee" carried from LongStaySearch.
        employeeId: draft.payload.employeeId || null,
        nationality: draft.payload.nationality || null,
        // "Add New Item" amendment flow — parent hotel booking code.
        parentBookingCode: draft.payload.parentBookingCode || null,
        rooms: draft.payload.rooms || [],
        contract,
        room,
        // Display currency forwarded to the booking page / create payload.
        currency: draft.currency || { code: "AED", factor: 1 },
      })
    );
    navigate("/long-stay-booking-page");
  };

  // ──────────────────────────────────────────────────────────────────────
  // Multi-room helpers (see comment near `selectedRooms`).
  // ──────────────────────────────────────────────────────────────────────
  const numRooms = (draft?.payload?.rooms || []).length || 1;
  const isMultiRoom = numRooms > 1;
  const allRoomsSelected =
    selectedRooms.length > 0 &&
    selectedRooms.every((s) => s.contract !== null && s.room !== null);

  useEffect(() => {
    setSelectedRooms((prev) => {
      if (prev.length === numRooms) return prev;
      return Array.from({ length: numRooms }, (_, i) => ({
        roomNo: i + 1,
        contract: null,
        room: null,
      }));
    });
  }, [numRooms]);

  const handleSlotSelect = (roomIndex, contract, room) => {
    setSelectedRooms((prev) =>
      prev.map((s, i) => {
        if (i !== roomIndex) return s;
        // Clicking already-selected (contract, room) clears the slot.
        if (s.contract === contract && s.room === room) {
          return { ...s, contract: null, room: null };
        }
        return { ...s, contract, room };
      }),
    );
  };

  /** Multi-room navigation. The long-stay-booking endpoint accepts ONE
   *  (contract, room) per booking, so Room 1's pick is sent as the
   *  legacy single-room shape. All slots' picks ride along as
   *  `roomBreakdown` for future backend work. */
  const handleProceedBooking = () => {
    if (!allRoomsSelected || !draft) return;
    // Same room-list gate as the single-room path — block scenario 3
    // before we navigate into the booking form.
    if (hasNoPaymentPath) {
      setShowNoPaymentPathModal(true);
      return;
    }
    try {
      const primary = selectedRooms[0];
      // Pre-flight: same cap check as handleBook.
      if (
        primary.contract.maxBookingDays &&
        totalNights > primary.contract.maxBookingDays
      ) {
        toast.error(
          `Selected contract caps stays at ${primary.contract.maxBookingDays} nights — your dates are ${totalNights}.`,
        );
        return;
      }
      sessionStorage.setItem(
        "longStayBookingDraft",
        JSON.stringify({
          hotelId: draft.payload.hotelId,
          hotelName: draft.meta.hotelName,
          address: draft.meta?.address || "",
          checkIn: draft.payload.checkInDate,
          checkOut: draft.payload.checkOutDate,
          agentId: draft.payload.agentId || null,
          // Optional "Booking Done By Employee" carried from LongStaySearch.
          employeeId: draft.payload.employeeId || null,
          nationality: draft.payload.nationality || null,
          // "Add New Item" amendment flow — parent hotel booking code.
          parentBookingCode: draft.payload.parentBookingCode || null,
          rooms: draft.payload.rooms || [],
          // Backend takes ONE (contract, room) — primary slot wins.
          contract: primary.contract,
          room: primary.room,
          // Additive — every slot's pick rides along for any future
          // backend that wants real per-room (contract, room) lists.
          // LongStayBookingPage currently ignores this field.
          roomBreakdown: selectedRooms.map((s, i) => ({
            roomNo: i + 1,
            contract: s.contract,
            room: s.room,
          })),
          // Display currency forwarded to the booking page / create payload.
          currency: draft.currency || { code: "AED", factor: 1 },
        }),
      );
      navigate("/long-stay-booking-page");
    } catch (err) {
      console.error("Error preparing multi-room long-stay draft:", err);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <TopBar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="flex-grow-1 d-flex justify-content-center align-items-center">
            <div className="text-center">
              <Spinner animation="border" variant="primary" />
              <h5 className="text-primary fw-bold mt-3 mb-1">
                Fetching Long Stay Contracts…
              </h5>
              <p className="text-muted small mb-0">
                Comparing rates and validity windows
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <TopBar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="flex-grow-1 d-flex justify-content-center align-items-center p-3">
            <div style={{ maxWidth: 480 }}>
              <Alert variant="danger">
                <Alert.Heading>Error</Alert.Heading>
                <p className="mb-0">{error}</p>
              </Alert>
              <Button variant="primary" onClick={() => window.close()}>
                Close
              </Button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!draft) return null;

  return (
    <div className="min-vh-100 bg-light d-flex flex-column room-list-container">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="content-wrapper flex-grow-1" style={{ minWidth: 0, overflowX: "hidden" }}>
          <div className="container-fluid" style={{ paddingTop: "10px" }}>
            {/* Long Stay route heading — UI only, mirrors the heading
                shown on /new-booking/long-stay once results arrive. */}
            <div className="hs-page-heading">
              <h3 className="hs-page-heading-title">Long Stay</h3>
            </div>
            {/* Top toolbar: Back to Search + agent balance — mirrors
                RoomList.jsx so the flow shares the same header polish. */}
            <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
              <Button
                variant="outline-primary"
                size="sm"
                onClick={() => navigate("/new-booking/long-stay")}
                className="back-to-search-btn"
              >
                ← Back to Search
              </Button>
              <AgentBalanceDisplay agentId={draft?.payload?.agentId} />
            </div>

            {/* ── Hotel Header ─────────────────────────────────────────────── */}
            <Card className="hotel-header-card mb-4">
              <Card.Body className="p-4">
                <Row>
                  <Col md={8}>
                    <div className="d-flex align-items-start gap-3">
                      {draft?.meta?.hotelImage ? (
                        <img
                          src={draft.meta.hotelImage}
                          alt={draft.meta.hotelName}
                          style={{
                            width: 80,
                            height: 80,
                            objectFit: "cover",
                            borderRadius: 8,
                          }}
                          onError={(e) => {
                            e.target.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="hotel-icon">
                          <FaHotel size={40} className="text-primary" />
                        </div>
                      )}
                      <div className="hotel-info flex-grow-1">
                        <h2 className="hotel-name mb-2">
                          {draft.meta?.hotelName || "—"}
                        </h2>
                        <div className="d-flex align-items-center gap-3 mb-2">
                          <div className="star-rating">
                            {renderStars(draft.meta?.starRating)}
                          </div>
                          <Badge bg="primary">Long Stay</Badge>
                        </div>
                        <div className="hotel-details">
                          <p className="mb-1">
                            <FaMapMarkerAlt className="text-muted me-2" />
                            {draft.meta?.address || "Address not available"}
                          </p>
                          {draft.meta?.phone && (
                            <p className="mb-0">
                              <FaPhone className="text-muted me-2" />
                              {draft.meta.phone}
                            </p>
                          )}
                          <div className="mt-2">
                            <small className="text-muted">
                              <strong>Please note:</strong>{" "}
                              <span className="someproperties">
                                Long-stay contracts may require minimum stays.
                                Additional charges (deposit, cleaning, utilities)
                                may apply at check-in. Policies such as deposit,
                                early checkout, and minimum-stay rules vary by
                                contract.
                              </span>
                            </small>
                          </div>
                        </div>
                        {/* Back-to-Search button now lives in the top
                            toolbar above this card — matches RoomList. */}
                      </div>
                    </div>
                  </Col>

                  <Col md={4}>
                    <Card className="booking-summary">
                      <Card.Body className="p-3">
                        <h6 className="mb-3">Stay Summary</h6>
                        <div className="booking-details">
                          <div className="d-flex justify-content-between mb-2">
                            <span>
                              <FaCalendarAlt className="text-muted me-2" />
                              Check-in:
                            </span>
                            <span className="fw-semibold">
                              {draft.payload.checkInDate}
                            </span>
                          </div>
                          <div className="d-flex justify-content-between mb-2">
                            <span>
                              <FaCalendarAlt className="text-muted me-2" />
                              Check-out:
                            </span>
                            <span className="fw-semibold">
                              {draft.payload.checkOutDate}
                            </span>
                          </div>
                          <div className="d-flex justify-content-between mb-2">
                            <span>
                              <FaBed className="text-muted me-2" />
                              Total nights:
                            </span>
                            <span className="fw-semibold">{totalNights}</span>
                          </div>
                          {guestSummary && (
                            <>
                              <div className="d-flex justify-content-between mb-2">
                                <span>
                                  <FaUsers className="text-muted me-2" />
                                  Guests:
                                </span>
                                <span className="fw-semibold">
                                  {guestSummary.adults} adult
                                  {guestSummary.adults !== 1 ? "s" : ""}
                                  {guestSummary.children > 0
                                    ? `, ${guestSummary.children} child${guestSummary.children !== 1 ? "ren" : ""}`
                                    : ""}
                                </span>
                              </div>
                              <div className="d-flex justify-content-between mb-2">
                                <span>
                                  <FaBed className="text-muted me-2" />
                                  Rooms:
                                </span>
                                <span className="fw-semibold">
                                  {guestSummary.rooms}
                                </span>
                              </div>
                            </>
                          )}
                          {draft.payload.nationality && (
                            <div className="d-flex justify-content-between">
                              <span>
                                <FaGlobe className="text-muted me-2" />
                                Nationality:
                              </span>
                              <span className="fw-semibold">
                                {draft.payload.nationality}
                              </span>
                            </div>
                          )}
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            {/* ── Contracts Section ─────────────────────────────────────────── */}
            <div className="room-categories-section">

              {/* View Toggle Bar */}
              <ViewToggleBar
                view={viewMode}
                onViewChange={setViewMode}
                count={contracts.length}
              />

              <Row className="g-3">
                <Col lg={3} md={4}>
                  <RoomFilters filters={filters} />
                </Col>
                <Col lg={9} md={8}>
              {contracts.length === 0 ? (
                <Card className="p-5 text-center text-muted">
                  <FaInfoCircle size={32} className="text-muted mx-auto mb-2" />
                  <h5>No active Long Stay contracts cover these dates</h5>
                  <p className="mb-0 small">
                    Try adjusting your check-in / check-out range, or contact
                    the hotel directly.
                  </p>
                </Card>
              ) : (
                <>
                {/* Per-room wrapper. Single-room renders the contracts
                    Accordion once unwrapped (legacy). Multi-room
                    renders it once per slot inside a "Room N"
                    Accordion. */}
                {(isMultiRoom ? selectedRooms : [null]).map((_slot, roomSlotIndex) => {
                  // Per-slot expanded-contract key. Read from the map so
                  // Room 1 and Room 2 keep independent expansion state.
                  // Falls back to "0" until the slot toggles anything so
                  // the first contract stays open on first render — same
                  // legacy behavior the single-string state used to give.
                  const slotActiveKey =
                    activeAccordions[roomSlotIndex] !== undefined
                      ? activeAccordions[roomSlotIndex]
                      : "0";
                  const setSlotActiveKey = (key) =>
                    setActiveAccordions((prev) => ({
                      ...prev,
                      [roomSlotIndex]: key,
                    }));
                  const inner = (
                <Accordion
                  activeKey={slotActiveKey}
                  onSelect={(key) => setSlotActiveKey(key)}
                >
                  {contracts.map((c, index) => {
                    const eventKey = index.toString();
                    const isActive = slotActiveKey === eventKey;
                    const exceedsCap =
                      c.maxBookingDays && totalNights > c.maxBookingDays;
                    // Apply Room-Type / Refund-Policy filters per room. Only
                    // skip the whole contract when filters are active AND
                    // nothing matches, so an unfiltered empty contract still
                    // renders its "no rooms configured" note exactly as before.
                    const visibleRooms = (c.rooms || []).filter((r) => roomVisible(r, c));
                    if (filters.hasActiveFilters && visibleRooms.length === 0)
                      return null;
                    const minPrice =
                      visibleRooms.reduce((acc, r) => {
                        const p = estimateStayPrice(c, r);
                        return acc === null || p < acc ? p : acc;
                      }, null) ?? 0;
                    // Room-name title for the accordion header — mirrors
                    // RoomList.jsx's h5 ({category.roomCategory}). LongStay
                    // groups by contract, so pull the unique room-category
                    // names from the visible rooms and join them. Falls back
                    // to a generic label if the data isn't there.
                    const roomNameTitle =
                      Array.from(
                        new Set(
                          (visibleRooms.length ? visibleRooms : c.rooms || [])
                            .map(
                              (r) =>
                                r.roomCategoryName ||
                                (r.hotelRoomCategoryId
                                  ? `Category #${r.hotelRoomCategoryId}`
                                  : ""),
                            )
                            .filter(Boolean),
                        ),
                      ).join(", ") || "Long-stay rooms";

                    return (
                      <Accordion.Item
                        key={eventKey}
                        eventKey={eventKey}
                        className="room-category-item mb-2"
                      >
                        {/* Header — mirrors RoomList.jsx exactly: a clean h5
                            room-name title with a short description line, and
                            the price / toggle stack on the right. The
                            contract-level billing badge + validity + stay cap
                            now live in the accordion BODY (see below), not the
                            header. */}
                        <Accordion.Header
                          as="div"
                          className="room-category-header"
                        >
                          <div className="d-flex justify-content-between align-items-center w-100">
                            <div className="room-category-info">
                              <h5 className="mb-1">{roomNameTitle}</h5>
                              <p className="mb-0 text-muted small">
                                Long Stay Contract
                              </p>
                            </div>

                            <div className="d-flex align-items-center gap-3">
                              <div className="room-category-price text-end">
                                <div className="price-range">
                                  From {formatPrice(minPrice)}
                                </div>
                                <div className="rates-count small text-muted">
                                  {visibleRooms.length} room
                                  {visibleRooms.length !== 1 ? "s" : ""}{" "}
                                  available
                                </div>
                              </div>
                              <div className="d-flex flex-column align-items-end gap-1">
                                <AccordionToggleButton
                                  eventKey={eventKey}
                                  isActive={isActive}
                                />
                                <a
                                  href="#hotel-information-section"
                                  className="small"
                                  onClick={(e) => {
                                    // Stop propagation — this link sits
                                    // inside the Accordion.Header, which
                                    // react-bootstrap always wraps in a
                                    // toggle <button>; without this the
                                    // click also expands/collapses the
                                    // accordion body. Mirrors RoomList.jsx.
                                    e.preventDefault();
                                    e.stopPropagation();
                                    // Each accordion item IS one contract
                                    // (c), so its own cancellationPolicy /
                                    // cancellationPolicyNotes /
                                    // termsAndConditions are exactly what
                                    // the "Cancellation Policies & Terms &
                                    // Conditions" modal reads — reuse the
                                    // same state (without opening the
                                    // modal) so Hotel Information shows
                                    // that same data.
                                    setPoliciesModalContract(c);
                                    document
                                      .getElementById(
                                        "hotel-information-section",
                                      )
                                      ?.scrollIntoView({
                                        behavior: "smooth",
                                        block: "start",
                                      });
                                  }}
                                >
                                  Cancellation Policy
                                </a>
                              </div>
                            </div>
                          </div>
                        </Accordion.Header>

                        <Accordion.Body className="room-rates-section">
                          {/* Contract-level details — moved out of the header
                              per the RoomList-style layout: day-wise billing
                              badge + validity window + stay cap sit at the top
                              of the body, above the room cards. */}
                          <div className="mb-3 pb-2 border-bottom d-flex align-items-center flex-wrap gap-2 text-muted small">
                            {costTypeBadge(c.additionalCostType)}
                            <span>
                              <FaCalendarAlt className="me-1" />
                              Validity: <strong>{c.validityFrom}</strong> →{" "}
                              <strong>{c.validityTo}</strong>
                              {c.maxBookingDays ? (
                                <>
                                  {" "}
                                  · Max stay:{" "}
                                  <strong>{c.maxBookingDays}</strong> nights
                                </>
                              ) : (
                                " · No stay cap"
                              )}
                            </span>
                          </div>

                          {exceedsCap && (
                            <Alert variant="warning" className="py-2 small mb-3">
                              <FaInfoCircle className="me-2" />
                              Your selected stay is{" "}
                              <strong>{totalNights}</strong> nights but this
                              contract allows max{" "}
                              <strong>{c.maxBookingDays}</strong> nights. Booking
                              will be blocked for all rooms in this contract.
                            </Alert>
                          )}

                          {/* ── Grid View ──────────────────────────────────── */}
                          {viewMode === "grid" && (
                            <Row>
                              {visibleRooms.map((r) => (
                                <RoomCardGrid
                                  key={r.longStayRoomId}
                                  contract={c}
                                  room={r}
                                  totalNights={totalNights}
                                  estPrice={estimateStayPrice(c, r)}
                                  exceedsCap={exceedsCap}
                                  onBook={handleBook}
                                  onViewPolicies={openPoliciesModal}
                                  extraAdults={partyExtras.extraAdults}
                                  extraChildren={partyExtras.children}
                                  isMultiRoom={isMultiRoom}
                                  roomSlotIndex={roomSlotIndex}
                                  isSelected={
                                    selectedRooms[roomSlotIndex]?.contract === c &&
                                    selectedRooms[roomSlotIndex]?.room === r
                                  }
                                  onSelect={(ct, rm) =>
                                    handleSlotSelect(roomSlotIndex, ct, rm)
                                  }
                                />
                              ))}
                              {(!c.rooms || c.rooms.length === 0) && (
                                <Col xs={12}>
                                  <Alert variant="info" className="mb-0 small">
                                    This contract has no rooms configured.
                                  </Alert>
                                </Col>
                              )}
                            </Row>
                          )}

                          {/* ── List View ──────────────────────────────────── */}
                          {viewMode === "list" && (
                            <div>
                              {visibleRooms.map((r) => (
                                <RoomCardList
                                  key={r.longStayRoomId}
                                  contract={c}
                                  room={r}
                                  totalNights={totalNights}
                                  estPrice={estimateStayPrice(c, r)}
                                  exceedsCap={exceedsCap}
                                  onBook={handleBook}
                                  onViewPolicies={openPoliciesModal}
                                  extraAdults={partyExtras.extraAdults}
                                  extraChildren={partyExtras.children}
                                  isMultiRoom={isMultiRoom}
                                  roomSlotIndex={roomSlotIndex}
                                  isSelected={
                                    selectedRooms[roomSlotIndex]?.contract === c &&
                                    selectedRooms[roomSlotIndex]?.room === r
                                  }
                                  onSelect={(ct, rm) =>
                                    handleSlotSelect(roomSlotIndex, ct, rm)
                                  }
                                />
                              ))}
                              {(!c.rooms || c.rooms.length === 0) && (
                                <Alert variant="info" className="mb-0 small">
                                  This contract has no rooms configured.
                                </Alert>
                              )}
                            </div>
                          )}
                        </Accordion.Body>
                      </Accordion.Item>
                    );
                  })}
                  {filters.hasActiveFilters &&
                    contracts.length > 0 &&
                    contracts.every(
                      (c) => (c.rooms || []).filter((r) => roomVisible(r, c)).length === 0,
                    ) && (
                      <Alert variant="info" className="mb-0">
                        No rooms match the selected filters.
                      </Alert>
                    )}
                </Accordion>
                  );
                  if (!isMultiRoom) {
                    return (
                      <React.Fragment key="ls-single-room">{inner}</React.Fragment>
                    );
                  }
                  const slot = selectedRooms[roomSlotIndex];
                  return (
                    <Accordion
                      key={`ls-room-slot-${roomSlotIndex}`}
                      // No defaultActiveKey — all room accordions start
                      // collapsed. Each room slot is rendered in its OWN
                      // <Accordion>, so opening / closing one has no
                      // effect on any other; the operator toggles each
                      // room's header independently.
                      className="mb-3 room-slot-accordion"
                    >
                      <Accordion.Item eventKey={`ls-room-slot-${roomSlotIndex}`}>
                        <Accordion.Header>
                          <div className="d-flex w-100 justify-content-between align-items-center pe-3">
                            <span className="fw-semibold">
                              <FaBed className="me-2 text-primary" />
                              Room {roomSlotIndex + 1}
                            </span>
                            {slot?.contract && slot?.room ? (
                              <Badge bg="success" className="ms-2">
                                {slot.room.roomCategoryName
                                  || `Category #${slot.room.hotelRoomCategoryId}`}
                                {" — "}
                                {formatPrice(
                                  estimateStayPrice(slot.contract, slot.room),
                                )}
                              </Badge>
                            ) : (
                              <Badge bg="warning" text="dark" className="ms-2">
                                Not selected
                              </Badge>
                            )}
                          </div>
                        </Accordion.Header>
                        <Accordion.Body>{inner}</Accordion.Body>
                      </Accordion.Item>
                    </Accordion>
                  );
                })}

                {/* Multi-room "Continue with Booking" CTA. The
                    long-stay-booking endpoint accepts one (contract,
                    room) per booking, so Room 1's pick is applied to
                    all rooms. The notice below makes that explicit. */}
                {isMultiRoom && (() => {
                  // Highlighted status banner for multi-room progress.
                  // Colour + icon flip from amber (in progress) to green
                  // (all rooms picked). Logic unchanged — same disable rule
                  // and handleProceedBooking handler as before.
                  const selectedCount = selectedRooms.filter(
                    (s) => s.contract && s.room,
                  ).length;
                  const pct =
                    numRooms > 0
                      ? Math.round((selectedCount / numRooms) * 100)
                      : 0;
                  const done = allRoomsSelected;
                  const accent = done ? "#198754" : "#fd7e14";
                  return (
                    <div
                      className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mt-3 p-3 rounded-3 shadow-sm"
                      style={{
                        borderLeft: `6px solid ${accent}`,
                        border: `1px solid ${done ? "#a7d7b8" : "#fed7aa"}`,
                        backgroundColor: done ? "#e8f5ec" : "#fff7ed",
                      }}
                    >
                      <div className="d-flex align-items-center gap-3">
                        <div
                          className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                          style={{
                            width: 46,
                            height: 46,
                            backgroundColor: accent,
                            color: "#fff",
                            fontSize: "1.3rem",
                          }}
                        >
                          {done ? <FaCheckCircle /> : <FaInfoCircle />}
                        </div>
                        <div>
                          <div
                            className="fw-bold"
                            style={{
                              fontSize: "1.05rem",
                              color: done ? "#14653a" : "#9a3412",
                            }}
                          >
                            {done
                              ? `All ${numRooms} rooms selected`
                              : `Select rooms for your ${numRooms} slots`}
                          </div>
                          <div className="small text-muted mb-2">
                            {done
                              ? "Note: every room in this booking will be charged at Room 1's selected (contract, room)."
                              : `Pick a room for each slot to continue — ${selectedCount} of ${numRooms} selected.`}
                          </div>
                          <div
                            className="progress"
                            style={{
                              height: 6,
                              width: 240,
                              maxWidth: "100%",
                              backgroundColor: "#e9ecef",
                            }}
                          >
                            <div
                              className="progress-bar"
                              role="progressbar"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: accent,
                                transition: "width .3s ease",
                              }}
                              aria-valuenow={selectedCount}
                              aria-valuemin={0}
                              aria-valuemax={numRooms}
                            />
                          </div>
                        </div>
                      </div>
                      <Button
                        variant={done ? "success" : "primary"}
                        size="lg"
                        disabled={!allRoomsSelected}
                        onClick={handleProceedBooking}
                        className="flex-shrink-0"
                      >
                        <FaMoneyBillWave className="me-2" />
                        Continue with Booking
                      </Button>
                    </div>
                  );
                })()}
                </>
              )}
                </Col>
              </Row>
            </div>

            {/* ── Hotel Information ───────────────────────────────────
                Per spec (mirrors /room-list): the cancellation policy +
                terms now live exclusively in the per-room-card
                "Cancellation Policies & Terms" modal, so the section under
                the room list shows ONLY general Hotel Information here.
                This is the scroll target of the "Cancellation Policy" link
                under each room category's View Details/Book button above. */}
            <div className="mt-4" id="hotel-information-section">
              <Card
                className="mb-4 shadow-sm"
                style={{ overflow: "hidden", border: "1px solid #e5e9f0" }}
              >
                <Card.Header
                  className="d-flex align-items-center gap-3 py-3"
                  style={{
                    background: "#f4f7fc",
                    color: "#2b3648",
                    border: "none",
                    borderBottom: "1px solid #e5e9f0",
                  }}
                >
                  <div
                    className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                    style={{
                      width: 40,
                      height: 40,
                      backgroundColor: "#e3ecfb",
                      color: "#3b6fd6",
                      fontSize: "1.15rem",
                    }}
                  >
                    <FaHotel />
                  </div>
                  <div>
                    <div
                      className="fw-bold"
                      style={{ fontSize: "1.1rem", lineHeight: 1.2 }}
                    >
                      Hotel Information
                    </div>
                    <div className="small text-muted">
                      General check-in &amp; stay details
                    </div>
                  </div>
                </Card.Header>
                <Card.Body className="p-4">
                  {policiesModalContract ? (
                    <div className="mb-3">
                      {policiesModalContract?.rateCode && (
                        <div className="text-muted small mb-2">
                          Contract: {policiesModalContract.rateCode}
                        </div>
                      )}

                      <h6 className="text-danger mb-2">
                        <FaTimesCircle className="me-2" />
                        Cancellation Policy
                      </h6>
                      {(policiesModalContract?.cancellationPolicy || [])
                        .length > 0 ? (
                        <ul className="mb-3 ps-3">
                          {policiesModalContract.cancellationPolicy.map(
                            (p, idx) => (
                              <li
                                key={idx}
                                className="mb-2"
                                style={{ whiteSpace: "pre-line" }}
                              >
                                {formatCancellationPolicyLine(p)}
                              </li>
                            ),
                          )}
                        </ul>
                      ) : !policiesModalContract?.cancellationPolicyNotes ? (
                        <p className="text-muted mb-3">
                          No cancellation policy configured.
                        </p>
                      ) : null}
                      {policiesModalContract?.cancellationPolicyNotes && (
                        <p className="mb-3" style={{ whiteSpace: "pre-line" }}>
                          {policiesModalContract.cancellationPolicyNotes}
                        </p>
                      )}

                      <h6 className="text-secondary mb-2 pt-2 border-top">
                        <FaInfoCircle className="me-2" />
                        Terms &amp; Conditions
                      </h6>
                      {(policiesModalContract?.termsAndConditions || [])
                        .length > 0 ? (
                        <ul className="mb-0 ps-3">
                          {policiesModalContract.termsAndConditions.map(
                            (t, idx) => (
                              <li
                                key={idx}
                                className="mb-2"
                                style={{ whiteSpace: "pre-line" }}
                              >
                                {t}
                              </li>
                            ),
                          )}
                        </ul>
                      ) : (
                        <p className="text-muted mb-0">
                          No terms &amp; conditions configured.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mb-3 text-muted small">
                      Click "Cancellation Policy" on a room category above to
                      view its cancellation policy &amp; terms here.
                    </div>
                  )}

                  <Row className="g-3 mt-1 pt-3 border-top">
                    <Col md={6}>
                      <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                        <span className="text-muted">Check-in</span>
                        <span className="fw-semibold">After 14:00</span>
                      </div>
                      <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                        <span className="text-muted">Check-out</span>
                        <span className="fw-semibold">Before 12:00</span>
                      </div>
                      <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                        <span className="text-muted">Minimum stay</span>
                        <span className="fw-semibold">
                          Per contract (see card)
                        </span>
                      </div>
                    </Col>
                    <Col md={6}>
                      <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                        <span className="text-muted">Deposit</span>
                        <span className="fw-semibold">May be required</span>
                      </div>
                      <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                        <span className="text-muted">Additional Bed</span>
                        <span className="fw-semibold">
                          Subject to availability
                        </span>
                      </div>
                      <div className="d-flex justify-content-between">
                        <span className="text-muted">
                          <FaTimesCircle className="text-danger me-1" />
                          Cancellation
                        </span>
                        <span className="fw-semibold">See room card terms</span>
                      </div>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
            </div>

          </div>
        </main>
      </div>

      {/* ── Cancellation Policies & Terms Modal ─────────────────────────
          Read-only viewer for the selected room card's contract. Shows the
          same cancellation policy + terms the booking page surfaces in its
          pre-confirm gate, sourced straight from the loaded contract. */}
      <Modal
        show={showPoliciesModal}
        onHide={() => setShowPoliciesModal(false)}
        size="lg"
        centered
        scrollable
        aria-labelledby="ls-policies-terms-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title id="ls-policies-terms-modal">
            Cancellation Policies &amp; Terms &amp; Conditions
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {policiesModalContract?.rateCode && (
            <div className="text-muted small mb-3">
              Contract: {policiesModalContract.rateCode}
            </div>
          )}

          <h6 className="text-danger mb-2">
            <FaTimesCircle className="me-2" />
            Cancellation Policy
          </h6>
          {(policiesModalContract?.cancellationPolicy || []).length > 0 ? (
            <ul className="mb-3 ps-3">
              {policiesModalContract.cancellationPolicy.map((p, idx) => (
                <li key={idx} className="mb-2" style={{ whiteSpace: "pre-line" }}>
                  {formatCancellationPolicyLine(p)}
                </li>
              ))}
            </ul>
          ) : !policiesModalContract?.cancellationPolicyNotes ? (
            <p className="text-muted mb-3">No cancellation policy configured.</p>
          ) : null}
          {policiesModalContract?.cancellationPolicyNotes && (
            <p className="mb-3" style={{ whiteSpace: "pre-line" }}>
              {policiesModalContract.cancellationPolicyNotes}
            </p>
          )}

          <h6 className="text-secondary mb-2 pt-2 border-top">
            <FaInfoCircle className="me-2" />
            Terms &amp; Conditions
          </h6>
          {(policiesModalContract?.termsAndConditions || []).length > 0 ? (
            <ul className="mb-0 ps-3">
              {policiesModalContract.termsAndConditions.map((t, idx) => (
                <li key={idx} className="mb-2" style={{ whiteSpace: "pre-line" }}>
                  {t}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted mb-0">No terms &amp; conditions configured.</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowPoliciesModal(false)}
          >
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* No Payment Path Modal — scenario 3 hard block. Shown right
          here on the room list so the agent doesn't get pushed into a
          booking form they can't submit. */}
      <Modal
        show={showNoPaymentPathModal}
        onHide={() => setShowNoPaymentPathModal(false)}
        centered
        backdrop="static"
        keyboard={false}
      >
        <Modal.Header closeButton>
          <Modal.Title>Booking Cannot Be Completed</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-0">
            You do not have sufficient credit limit, and online card
            payment is not enabled for your account. Therefore, this
            booking cannot be completed. Please contact your account
            manager or administrator to enable a payment method.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowNoPaymentPathModal(false)}
          >
            OK
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}