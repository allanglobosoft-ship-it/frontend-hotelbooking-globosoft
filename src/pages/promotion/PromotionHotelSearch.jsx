import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  Row,
  Col,
  Form,
  Button,
  Spinner,
  Table,
  Modal,
  Badge,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import Swal from "sweetalert2";
import Select from "react-select";
import {
  FaStar,
  FaTag,
  FaMapMarkerAlt,
  FaCalendarAlt,
  FaGift,
  FaPercent,
  FaBed,
  FaHotel,
  FaListUl,
  FaTimes,
  FaFire,
  FaCheckCircle,
  FaPlus,
  FaTrash,
  FaUserTie,
  FaUsers,
  FaGlobe,
  FaInfoCircle,
  FaMoon,
  FaSearch,
  FaWallet,
} from "react-icons/fa";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import AgentSelect from "../../components/AgentSelect";
import axiosInstance from "../../components/AxiosInstance";
import chevronStyle from "../../components/filters/dropdownChevron";
import "../../styles/HotelSearch.css";

/**
 * Simplified /promotion page — redesigned for a modern "deals showcase"
 * feel inspired by popular hotel-deals pages (Booking / Agoda / Hotels.com
 * promotions strips): a bold branded hero band with the month picker, a
 * quick-glance stats row, filter pills by promotion family, and a 3-up
 * card grid.
 *
 * The page is NOT part of the hotel-booking flow — all search inputs
 * (Agent, Destination, Nationality, Check-In/Out, Nights, Rooms &
 * Guests) were removed. Data comes from
 * GET /api/hotelPromotions/active-hotels, which returns every in-house
 * hotel that has at least one live promotion together with the compact
 * promotion detail rows shown inside the modal.
 */
const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

// Colour-coding used for the "type" pill on each promotion row. Kept
// aligned with the deal-pill palette on the standard /new-booking/hotel
// results strip so anyone who moves between the two pages recognises the
// same badge colours.
const PROMOTION_STYLES = {
  // Special Rates uses the Globosoft brand red so the dominant-family
  // ribbon on each hotel card matches the app header.
  "Special Rates": { bg: "#EC0B43", icon: FaGift, key: "special" },
  Discount: { bg: "#f0ad4e", icon: FaPercent, key: "discount" },
  StayPay: { bg: "#198754", icon: FaBed, key: "staypay" },
};

const styleForPromotion = (type) => {
  const key = (type || "").toLowerCase();
  if (key.includes("special")) return PROMOTION_STYLES["Special Rates"];
  if (key.includes("discount")) return PROMOTION_STYLES.Discount;
  if (key.includes("stay")) return PROMOTION_STYLES.StayPay;
  return { bg: "#6c757d", icon: FaTag, key: "other" };
};

// The four filter chips: All + one per promotion family. Wired up so
// clicking a chip narrows the visible cards to hotels with at least one
// promotion of that family.
const FAMILY_TABS = [
  { key: "all", label: "All Promotions", icon: FaFire },
  { key: "special", label: "Special Rates", icon: FaGift },
  { key: "discount", label: "Discount", icon: FaPercent },
  { key: "staypay", label: "Stay Pay", icon: FaBed },
];

const MAX_BOOKING_ROOMS = 5;
const MAX_BOOKING_NIGHTS = 15;

// Inhouse hotels use "IN{hotelId}" as their hotelCode across the search /
// room-list flow — see InhouseHotelSearchApiCaller.java. The room-list page
// expects the same code shape when it accepts the sessionStorage payload.
const buildInhouseHotelCode = (hotelId) =>
  hotelId != null ? `IN${hotelId}` : "";

const formatIsoDate = (d) => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};

const addDaysIso = (isoDate, days) => {
  if (!isoDate) return "";
  const base = new Date(isoDate);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + Number(days || 0));
  return formatIsoDate(base);
};

const diffNights = (fromIso, toIso) => {
  if (!fromIso || !toIso) return 0;
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.max(0, Math.ceil((to - from) / (1000 * 60 * 60 * 24)));
};

const EMPTY_ROOM = () => ({ adults: 1, children: 0, childAges: [] });

// ── Promotion rate display ──────────────────────────────────────────
// /api/hotelPromotions/active-hotels returns, per promotion, a
// `rateSummary` { offerLabel, baseRateFrom, promoRateFrom, savingAmount,
// savingPercent, note, rooms[] } — that promotion's STAND-ALONE effect on
// the contract rate (Special Rate replaces it, Discount = contract − % /
// flat, Stay-Pay = contract × pay / stay). The hotel-level headline
// `promoRateFrom` / `baseRateFrom` / `maxSavingPercent` is the FINAL rate
// once the hotel's own live promotions are combined the way the room
// search combines them (PromotionRateCalculator.forHotel): a Special Rate
// competes with the contract rate as an alternative base (lower wins), a
// Stay-Pay takes precedence over a Discount on the same room (they never
// stack), and Discount / Stay-Pay are worked out on the contract rate.
// `finalRate` explains that headline (applied / skipped promotions, room,
// per-room breakdown) and each promotion row carries `appliedInFinalRate`
// + `finalRateNote`. Every figure is per room, per night, before agent
// markup; the page does no rate arithmetic of its own.
const formatRate = (value) => {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

const formatPercent = (value) => {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
};

const savingPillStyle = {
  backgroundColor: "rgba(25,135,84,0.12)",
  color: "#198754",
  border: "1px solid rgba(25,135,84,0.35)",
  padding: "1px 7px",
  borderRadius: "999px",
  fontSize: "0.68rem",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

// How many promotion rate lines a card shows before deferring the rest to
// the View Details modal (which lists every promotion + room breakdown).
const MAX_CARD_RATE_ROWS = 4;

// rateSummary.status (backend PromotionRateCalculator) → what the operator
// sees when there is no rate to show. NO_ROOM_VALUES means the promotion
// was saved with an empty room grid (no special rate / % / nights typed
// in), which is fixable from the promotion's edit page; NO_ROOM_SETUP
// means the hotel itself has no room occupancy configured, so the
// promotion grid has no cells at all (fix under Hotel Actions →
// Occupancy first); NO_CONTRACT_RATE means the hotel has no live contract
// rate inside the promotion window, so there is nothing to discount from.
const RATE_STATUS_TEXT = {
  NO_ROOM_VALUES: "No rates set",
  NO_ROOM_SETUP: "Hotel room setup incomplete",
  NO_CONTRACT_RATE: "No contract rate in window",
};

// Where the operator fixes a NO_ROOM_SETUP hotel (route in App.jsx).
const hotelOccupancyPath = (hotelId) =>
  hotelId ? `/hotel-actions/${hotelId}/occupancy-and-minimumlength` : null;

const rateStatusText = (summary) =>
  Object.prototype.hasOwnProperty.call(RATE_STATUS_TEXT, summary?.status)
    ? RATE_STATUS_TEXT[summary.status]
    : "Rate not available";

// Deep link to the edit page of a promotion row from
// /api/hotelPromotions/active-hotels — mirrors the routes in App.jsx
// (`/hotel-actions/:id/promotion/<family>/edit/:editId`).
const promotionEditPath = (hotelId, promo) => {
  if (!hotelId || !promo?.id) return null;
  const family = styleForPromotion(promo.promotionType).key;
  const segment =
    family === "special"
      ? "special-rate"
      : family === "discount"
        ? "discount"
        : family === "staypay"
          ? "staypay"
          : null;
  return segment
    ? `/hotel-actions/${hotelId}/promotion/${segment}/edit/${promo.id}`
    : null;
};

// Headline copy for a card whose promotions produced no rate at all.
const headlineFallbackText = (promoRows, finalRate) => {
  const statuses = (promoRows || []).map((p) => p?.rateSummary?.status);
  if (statuses.length > 0 && statuses.every((s) => s === "NO_ROOM_SETUP")) {
    return "Hotel room setup incomplete";
  }
  if (
    statuses.length > 0 &&
    statuses.every((s) => s === "NO_ROOM_VALUES" || s === "NO_ROOM_SETUP")
  ) {
    return "No room rates configured yet";
  }
  // Promotions were priced but none beats the contract rate (dearer special
  // rate, extra-bed only Stay-Pay, no market type) — the backend note says
  // which; checked before the contract-rate hint so the two agree.
  if (finalRate?.status === "NO_RATE" && statuses.some((s) => s === "OK")) {
    return "No promotion lowers the room rate";
  }
  if (statuses.some((s) => s === "NO_CONTRACT_RATE")) {
    return "No contract rate in promotion window";
  }
  return "Rate not available yet";
};

// "DFGHDFG55 Stay 2 Pay 1 · 1 night free" for a finalRate applied/skipped entry.
const describePromotion = (p) =>
  [p?.promotionCode, p?.effect].filter(Boolean).join(" ");

const appliedPillStyle = {
  ...savingPillStyle,
  fontSize: "0.62rem",
  padding: "0 6px",
  fontWeight: 600,
};

const notAppliedPillStyle = {
  ...appliedPillStyle,
  backgroundColor: "#f1f3f5",
  color: "#6c757d",
  border: "1px solid #dee2e6",
  cursor: "help",
};

/**
 * One-line explanation under the card headline: which promotion(s) produce
 * the final rate and which live promotion(s) were skipped and why (Stay-Pay
 * over Discount, special rate vs promoted contract rate, …).
 */
function FinalRateCaption({ finalRate }) {
  if (!finalRate || finalRate.status !== "OK") return null;
  const applied = Array.isArray(finalRate.appliedPromotions)
    ? finalRate.appliedPromotions
    : [];
  const skipped = Array.isArray(finalRate.skippedPromotions)
    ? finalRate.skippedPromotions
    : [];
  if (applied.length === 0 && skipped.length === 0) return null;
  const room = [finalRate.roomCategory, finalRate.roomType, finalRate.occupancy]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      className="d-flex flex-column"
      style={{ fontSize: "0.7rem", lineHeight: 1.35, marginTop: 2 }}
    >
      {applied.length > 0 && (
        <span className="text-muted" title={finalRate.detail || undefined}>
          <span className="fw-semibold text-dark">Applied:</span>{" "}
          {applied.map(describePromotion).join(" + ")}
          {room && <> · {room}</>}
        </span>
      )}
      {skipped.length > 0 && (
        <span
          className="text-muted"
          title={skipped
            .map((s) => `${describePromotion(s)} — ${s.reason || "not applied"}`)
            .join("\n")}
          style={{ cursor: "help" }}
        >
          <span className="fw-semibold">Not applied:</span>{" "}
          {skipped.map(describePromotion).join(", ")}
          {skipped[0]?.reason && <> — {skipped[0].reason}</>}
        </span>
      )}
    </div>
  );
}

/**
 * One line of the card's rate strip: promotion code + what the offer is,
 * then the contract rate (struck through) → rate after the promotion and
 * the saving pill. When nothing could be calculated it shows the short
 * reason (see RATE_STATUS_TEXT) with the backend's full note as a
 * tooltip, plus a "Set rates" link to the promotion's edit page when the
 * fix is simply typing the values in.
 */
function PromotionRateLine({
  promo,
  currency,
  onSetRates,
  onConfigureRooms,
  showApplied,
}) {
  const { bg, icon: Icon } = styleForPromotion(promo.promotionType);
  const summary = promo.rateSummary || {};
  const promoRate = formatRate(summary.promoRateFrom);
  const baseRate = formatRate(summary.baseRateFrom);
  const hasSaving =
    summary.baseRateFrom != null &&
    summary.promoRateFrom != null &&
    Number(summary.baseRateFrom) > Number(summary.promoRateFrom);
  const savingPct = hasSaving ? formatPercent(summary.savingPercent) : null;
  // Whether this promotion actually feeds the hotel's final rate (backend
  // appliedInFinalRate): FALSE = priced but superseded, e.g. a Discount
  // while a Stay-Pay is live on the same room; null = not priced at all —
  // or, when finalRateNote is set, deliberately outside the room rate
  // (extra-bed Stay-Pay, no market type).
  const applied = promo.appliedInFinalRate;
  const outsideRoomRate = applied == null && !!promo.finalRateNote;
  return (
    <div
      className="d-flex align-items-center justify-content-between gap-2"
      style={{ fontSize: "0.8rem", lineHeight: 1.3 }}
    >
      <span
        className="d-inline-flex align-items-center gap-2"
        style={{ minWidth: 0 }}
      >
        <span
          style={{
            color: bg,
            display: "inline-flex",
            width: 16,
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon style={{ fontSize: "0.72rem" }} />
        </span>
        <span
          className="fw-semibold text-dark text-truncate"
          style={{ maxWidth: 110 }}
          title={promo.promotionCode || promo.promotionType}
        >
          {promo.promotionCode || promo.promotionType}
        </span>
        {summary.offerLabel && (
          <span
            className="text-muted text-truncate"
            style={{ maxWidth: 130 }}
            title={summary.offerLabel}
          >
            {summary.offerLabel}
          </span>
        )}
      </span>
      <span className="d-inline-flex align-items-center gap-2 flex-shrink-0">
        {promoRate ? (
          <>
            {hasSaving && (
              <span
                className="text-muted text-decoration-line-through"
                style={{ fontSize: "0.74rem" }}
              >
                {baseRate}
              </span>
            )}
            <span
              className="fw-bold"
              style={{
                color:
                  applied === false || outsideRoomRate ? "#6c757d" : "#EC0B43",
              }}
              title={
                applied === false || outsideRoomRate
                  ? promo.finalRateNote || "Not part of the final rate"
                  : undefined
              }
            >
              {currency} {promoRate}
            </span>
            {savingPct && applied !== false && !outsideRoomRate && (
              <span style={savingPillStyle}>−{savingPct}</span>
            )}
            {applied === false && (
              <span
                style={notAppliedPillStyle}
                title={promo.finalRateNote || "Not part of the final rate"}
              >
                Not applied
              </span>
            )}
            {outsideRoomRate && (
              <span style={notAppliedPillStyle} title={promo.finalRateNote}>
                Not in room rate
              </span>
            )}
            {applied === true && showApplied && (
              <span style={appliedPillStyle} title="Part of the final rate">
                Applied
              </span>
            )}
          </>
        ) : (
          <>
            <span
              className="text-muted d-inline-flex align-items-center gap-1"
              title={
                promo.finalRateNote ||
                summary.note ||
                "Rate could not be calculated"
              }
              style={{ cursor: "help", fontSize: "0.76rem" }}
            >
              <FaInfoCircle style={{ fontSize: "0.7rem" }} />
              {rateStatusText(summary)}
            </span>
            {summary.status === "NO_ROOM_VALUES" && onSetRates && (
              <button
                type="button"
                className="btn btn-link p-0 text-danger text-decoration-none fw-semibold"
                style={{ fontSize: "0.76rem", lineHeight: 1 }}
                onClick={onSetRates}
                title="Open this promotion and fill in the room rates"
              >
                Set rates
              </button>
            )}
            {summary.status === "NO_ROOM_SETUP" && onConfigureRooms && (
              <button
                type="button"
                className="btn btn-link p-0 text-danger text-decoration-none fw-semibold"
                style={{ fontSize: "0.76rem", lineHeight: 1 }}
                onClick={onConfigureRooms}
                title="This hotel has no room occupancy configured yet — set it up first"
              >
                Configure rooms
              </button>
            )}
          </>
        )}
      </span>
    </div>
  );
}

export default function PromotionHotelSearch() {
  const navigate = useNavigate();
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [month, setMonth] = useState("");
  // Modal state — the hotel whose promotion details are being shown.
  const [detailsHotel, setDetailsHotel] = useState(null);
  // Which promotion row in the details modal has its per-room rate
  // breakdown expanded (key = `${promotionType}-${id}`), or null.
  const [expandedPromoKey, setExpandedPromoKey] = useState(null);
  // Filter-pill state: "all" | "special" | "discount" | "staypay"
  const [familyFilter, setFamilyFilter] = useState("all");

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  // ── Book Now popup state ────────────────────────────────────────────
  // Mirrors the /new-booking/hotel search form (Agent, Employee,
  // Nationality, Check-In, Nights, Check-Out, Rooms & Guests) minus the
  // Destination / City field — the hotel is already picked. On submit we
  // build a roomListPayload compatible with pages/RoomList.jsx and open
  // it in a new tab, so the operator lands on the room-selection step
  // with everything pre-filled.
  const [bookingHotel, setBookingHotel] = useState(null);
  const [bookingAgents, setBookingAgents] = useState([]);
  const [bookingEmployees, setBookingEmployees] = useState([]);
  const [bookingNationalities, setBookingNationalities] = useState([]);
  const [pickedAgent, setPickedAgent] = useState("");
  const [pickedEmployee, setPickedEmployee] = useState(null);
  const [pickedNationality, setPickedNationality] = useState(null);
  // Selected agent's available credit balance — fetched from the same
  // /api/agent-credit-limit/agent/{id} endpoint HotelSearch.jsx uses.
  // Shown in the brand-red font below the Agent dropdown so admin/staff
  // operators can sanity-check credit before submitting the booking.
  const [pickedAgentBalance, setPickedAgentBalance] = useState(null);
  const [pickedAgentBalanceLoading, setPickedAgentBalanceLoading] = useState(
    false,
  );
  const [bookingCheckIn, setBookingCheckIn] = useState("");
  const [bookingCheckOut, setBookingCheckOut] = useState("");
  const [bookingNights, setBookingNights] = useState(1);
  const [bookingRooms, setBookingRooms] = useState([EMPTY_ROOM()]);
  const [bookingErrors, setBookingErrors] = useState({});
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  // Guards the checkIn/checkOut recompute effect from clobbering the nights
  // value on the same tick we just adjusted checkOut ourselves.
  const suppressNightsRecomputeRef = useRef(false);
  // Scrolls the newly appended room card into view after "Add Room". The
  // Modal.Body is the scroll container (bootstrap sets overflow-y:auto on
  // scrollable modals), so scrollIntoView keeps the new card in the visible
  // portion of the modal — otherwise the added row rendered below the fold
  // and looked like "nothing happened" to the user.
  const roomRefs = useRef([]);
  const scrollToLastRoomRef = useRef(false);

  // Same role logic HotelSearch.jsx uses so agent logins book under
  // themselves and the manual Agent picker is hidden.
  const activeRole = (localStorage.getItem("currentActiveRole") || "")
    .trim()
    .toUpperCase();
  const storedRoles = (localStorage.getItem("userRole") || "").toUpperCase();
  const isAgentRole = activeRole
    ? activeRole === "AGENT"
    : storedRoles.includes("AGENT") && !storedRoles.includes("ADMIN");
  const selfAgentId =
    (isAgentRole && localStorage.getItem("userId")) || "";

  // Fetch the option lists once — the Book Now modal on this page uses
  // the same three endpoints the /new-booking/hotel search form calls.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [agentsRes, employeesRes, countriesRes] = await Promise.all([
          axiosInstance.get("/api/agent?activeOnly=true"),
          axiosInstance.get("/api/employee?page=0&limit=1000"),
          axiosInstance.get("/api/country?limit=50"),
        ]);
        if (cancelled) return;
        setBookingAgents(Array.isArray(agentsRes.data) ? agentsRes.data : []);
        setBookingEmployees(
          Array.isArray(employeesRes.data) ? employeesRes.data : [],
        );
        setBookingNationalities(
          Array.isArray(countriesRes.data)
            ? countriesRes.data.map((c) => ({
                value: c.id,
                label: c.name,
                code: c.countryCode,
              }))
            : [],
        );
      } catch (err) {
        console.error("Failed to load booking-modal option lists", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep Nights ↔ Check-In/Out in sync. Same rule the search page uses:
  // both dates set → compute nights, cap at MAX_BOOKING_NIGHTS and pull
  // checkOut in if the diff would blow the cap.
  useEffect(() => {
    if (!bookingCheckIn || !bookingCheckOut) return;
    if (suppressNightsRecomputeRef.current) {
      suppressNightsRecomputeRef.current = false;
      return;
    }
    const diff = diffNights(bookingCheckIn, bookingCheckOut);
    if (diff <= 0) return;
    if (diff > MAX_BOOKING_NIGHTS) {
      suppressNightsRecomputeRef.current = true;
      setBookingNights(MAX_BOOKING_NIGHTS);
      setBookingCheckOut(addDaysIso(bookingCheckIn, MAX_BOOKING_NIGHTS));
      setBookingErrors((prev) => ({
        ...prev,
        nights: `Maximum stay allowed is ${MAX_BOOKING_NIGHTS} nights.`,
      }));
    } else {
      setBookingNights(diff);
      setBookingErrors((prev) => {
        const { nights: _drop, ...rest } = prev;
        return rest;
      });
    }
  }, [bookingCheckIn, bookingCheckOut]);

  // Refetch the picked agent's available credit whenever the selection
  // changes. Mirrors the same pattern in HotelSearch.jsx (useEffect keyed
  // on the agent id, cancellable via a captured flag, silent 404/empty
  // fallback to null). Only relevant for admin/staff — agent-role users
  // skip this whole section because their Booking Party section is
  // hidden entirely.
  useEffect(() => {
    if (isAgentRole) return undefined;
    if (!pickedAgent) {
      setPickedAgentBalance(null);
      setPickedAgentBalanceLoading(false);
      return undefined;
    }
    let cancelled = false;
    setPickedAgentBalanceLoading(true);
    axiosInstance
      .get(`/api/agent-credit-limit/agent/${pickedAgent}`)
      .then((res) => {
        if (cancelled) return;
        const raw =
          res?.data?.effectiveAvailableCreditLimit ??
          res?.data?.availableCreditLimit ??
          null;
        const value = raw == null ? null : Number(raw);
        setPickedAgentBalance(Number.isFinite(value) ? value : null);
      })
      .catch(() => {
        if (!cancelled) setPickedAgentBalance(null);
      })
      .finally(() => {
        if (!cancelled) setPickedAgentBalanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pickedAgent, isAgentRole]);

  const handleBookingNightsChange = (raw) => {
    const value = Math.max(1, Math.min(MAX_BOOKING_NIGHTS, Number(raw) || 1));
    setBookingNights(value);
    if (bookingCheckIn) {
      suppressNightsRecomputeRef.current = true;
      setBookingCheckOut(addDaysIso(bookingCheckIn, value));
    }
    setBookingErrors((prev) => {
      const { nights: _drop, ...rest } = prev;
      return rest;
    });
  };

  const closeBookingModal = () => {
    setBookingHotel(null);
    setBookingErrors({});
    setBookingSubmitting(false);
    setPickedAgentBalance(null);
    setPickedAgentBalanceLoading(false);
  };

  const openBookingModal = (hotel) => {
    if (!hotel || !hotel.hotelId) return;
    setBookingHotel(hotel);
    setBookingErrors({});
    // Reset the form on every open so the previous hotel's picks
    // don't leak into a fresh booking. Agent-role users default to
    // their own id and skip the Agent picker below.
    setPickedAgent(isAgentRole ? selfAgentId : "");
    setPickedEmployee(null);
    setPickedNationality(null);
    setBookingCheckIn("");
    setBookingCheckOut("");
    setBookingNights(1);
    setBookingRooms([EMPTY_ROOM()]);
    setPickedAgentBalance(null);
    setPickedAgentBalanceLoading(false);
  };

  const addBookingRoom = () => {
    setBookingRooms((prev) => {
      if (prev.length >= MAX_BOOKING_ROOMS) return prev;
      // Ask the effect below to scroll the new card into view after render.
      scrollToLastRoomRef.current = true;
      return [...prev, EMPTY_ROOM()];
    });
  };

  // After bookingRooms grows, scroll the last card into view inside the
  // modal so the operator can see the just-added room without hunting for
  // the scrollbar. Only fires when the add-room button flipped the ref.
  useEffect(() => {
    if (!scrollToLastRoomRef.current) return;
    scrollToLastRoomRef.current = false;
    const last = roomRefs.current[bookingRooms.length - 1];
    if (last && typeof last.scrollIntoView === "function") {
      last.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [bookingRooms.length]);
  const removeBookingRoom = (idx) => {
    setBookingRooms((prev) => prev.filter((_, i) => i !== idx));
  };
  const setRoomAdults = (idx, adults) => {
    setBookingRooms((prev) =>
      prev.map((r, i) =>
        i === idx
          ? { ...r, adults: Math.max(1, Math.min(6, Number(adults) || 1)) }
          : r,
      ),
    );
  };
  const setRoomChildren = (idx, children) => {
    const count = Math.max(0, Math.min(4, Number(children) || 0));
    setBookingRooms((prev) =>
      prev.map((r, i) =>
        i === idx
          ? {
              ...r,
              children: count,
              childAges: Array.from(
                { length: count },
                (_, j) => r.childAges[j] ?? 5,
              ),
            }
          : r,
      ),
    );
  };
  const setChildAge = (roomIdx, childIdx, age) => {
    setBookingRooms((prev) =>
      prev.map((r, i) => {
        if (i !== roomIdx) return r;
        const next = [...r.childAges];
        next[childIdx] = Number(age) || 0;
        return { ...r, childAges: next };
      }),
    );
  };

  const validateBooking = () => {
    const next = {};
    if (!isAgentRole && !pickedAgent) next.agent = "Agent is required";
    if (!pickedNationality) next.nationality = "Nationality is required";
    if (!bookingCheckIn) next.checkIn = "Check-in date is required";
    if (!bookingCheckOut) next.checkOut = "Check-out date is required";
    if (
      bookingCheckIn &&
      bookingCheckOut &&
      new Date(bookingCheckOut) <= new Date(bookingCheckIn)
    ) {
      next.checkOut = "Check-out must be after check-in";
    }
    if (bookingNights > MAX_BOOKING_NIGHTS) {
      next.nights = `Maximum stay allowed is ${MAX_BOOKING_NIGHTS} nights.`;
    }
    return next;
  };

  const handleBookNowSubmit = async (e) => {
    e.preventDefault();
    const errs = validateBooking();
    if (Object.keys(errs).length > 0) {
      setBookingErrors(errs);
      return;
    }
    setBookingErrors({});
    setBookingSubmitting(true);

    const hotel = bookingHotel;

    // ── Promotion-validity guard ──────────────────────────────────────
    // Every hotel on this page carries a `promotions[]` list (from
    // /api/hotelPromotions/active-hotels), and each promotion carries
    // one or more `validities[]` rows with { validityFrom, validityTo }
    // (yyyy-MM-dd). The backend room-search treats a promotion as
    // applicable only when BOTH check-in and check-out fall inside a
    // single validity window (see the SpecialRate query in
    // HotelSpecialRateRepository). If the operator picked dates that
    // fall outside every promotion's validity window, show a red
    // warning popup listing each promotion's window so they know
    // which dates are covered — and abort the submit before the
    // room-search call.
    const promoRows = Array.isArray(hotel?.promotions) ? hotel.promotions : [];
    const stayCoveredByPromotion = promoRows.some((promo) =>
      (Array.isArray(promo?.validities) ? promo.validities : []).some((v) => {
        if (!v?.validityFrom || !v?.validityTo) return false;
        const from = new Date(v.validityFrom);
        const to = new Date(v.validityTo);
        const inDate = new Date(bookingCheckIn);
        const outDate = new Date(bookingCheckOut);
        if (
          Number.isNaN(from.getTime()) ||
          Number.isNaN(to.getTime()) ||
          Number.isNaN(inDate.getTime()) ||
          Number.isNaN(outDate.getTime())
        ) {
          return false;
        }
        return inDate >= from && inDate <= to && outDate >= from && outDate <= to;
      }),
    );

    if (promoRows.length > 0 && !stayCoveredByPromotion) {
      const validityLines = promoRows
        .flatMap((promo) =>
          (Array.isArray(promo?.validities) ? promo.validities : [])
            .filter((v) => v?.validityFrom && v?.validityTo)
            .map(
              (v) =>
                `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 10px;border:1px solid #f1d4dc;border-radius:6px;margin-top:6px;background:#fff8fa;"><span style="font-weight:600;color:#EC0B43;">${
                  promo.promotionType || "Promotion"
                }${
                  promo.promotionCode ? ` (${promo.promotionCode})` : ""
                }</span><span style="color:#495057;">${v.validityFrom} &rarr; ${
                  v.validityTo
                }</span></div>`,
            ),
        )
        .join("");
      const bodyHtml = `
        <div style="text-align:left;">
          <div style="margin-bottom:8px;">
            This promotion is <b>not applicable</b> for your selected stay
            <span style="white-space:nowrap;font-weight:600;">${bookingCheckIn}</span>
            &rarr;
            <span style="white-space:nowrap;font-weight:600;">${bookingCheckOut}</span>.
          </div>
          <div style="margin-bottom:6px;color:#495057;">Please pick check-in and check-out dates within one of the promotion's validity windows below:</div>
          ${
            validityLines ||
            '<div style="color:#8a0a2c;">No validity information is configured for this promotion.</div>'
          }
        </div>`;
      setBookingSubmitting(false);
      Swal.fire({
        icon: "warning",
        title: "Promotion Not Applicable",
        html: bodyHtml,
        confirmButtonText: "OK",
        confirmButtonColor: "#EC0B43",
      });
      return;
    }

    const agentId = String(isAgentRole ? selfAgentId : pickedAgent) || "";
    const pickedAgentObj = (Array.isArray(bookingAgents) ? bookingAgents : [])
      .find((a) => String(a?.id) === agentId);
    const agentName = isAgentRole
      ? localStorage.getItem("UserName") ||
        sessionStorage.getItem("UserName") ||
        ""
      : pickedAgentObj
        ? pickedAgentObj.companyName ||
          pickedAgentObj.name ||
          `${pickedAgentObj.firstName || ""} ${
            pickedAgentObj.lastName || ""
          }`.trim()
        : "";

    const roomsPayload = bookingRooms.map((r) => ({
      adults: r.adults || 1,
      children: r.children || 0,
      childAges: r.childAges || [],
      adultAges: Array.from({ length: r.adults || 1 }, () => 30),
    }));

    const nationalityCode =
      pickedNationality && (pickedNationality.code || "").length === 2
        ? pickedNationality.code
        : " ";

    const payload = {
      checkInDate: bookingCheckIn,
      checkOutDate: bookingCheckOut,
      hotelCode: buildInhouseHotelCode(hotel.hotelId),
      nationality: nationalityCode,
      agentId,
      agentName,
      destinationLabel:
        [hotel.placeName, hotel.cityName, hotel.countryName]
          .filter(Boolean)
          .join(", ") || "",
      nationalityLabel: pickedNationality?.label || "",
      employeeName: isAgentRole
        ? agentName || null
        : pickedEmployee?.label || null,
      nightsCount: bookingNights,
      // Promotion hotels are always in-house — matches InhouseHotelSearch
      // fan-out (apiId = 1 in HotelSearch.jsx).
      apiId: 1,
      rooms: roomsPayload,
      parentBookingCode: null,
      employeeId: isAgentRole ? null : pickedEmployee?.value || null,
      is24HourCheckin: false,
      checkInTime: null,
      checkOutTime: null,
      twentyFourHourPercentage: null,
    };
    const meta = {
      hotelName: hotel.hotelName,
      address:
        hotel.hotelAddress ||
        [hotel.placeName, hotel.cityName, hotel.countryName]
          .filter(Boolean)
          .join(", "),
      starRating: hotel.starRating || 0,
      phone: "",
      hotelImage: "",
    };
    const currency = { code: "AED", factor: 1 };

    // Preflight — call the same /api/hotel-rooms/search endpoint that
    // RoomList.jsx would call, from inside the modal. If the backend
    // returns success=false or an empty hotels[] (which is what the
    // "No Rooms Available" banner on /room-list actually reflects — a
    // legitimate no-availability signal, not a payload bug), show the
    // reason inline on the modal so the operator can adjust dates or
    // guests without navigating away. Only when the response carries a
    // non-empty hotels[] do we stash the payload and open /room-list.
    try {
      const res = await axiosInstance.post(
        "/api/hotel-rooms/search",
        payload,
      );
      const data = res?.data;
      const hotels = Array.isArray(data?.hotels) ? data.hotels : [];
      const backendSaidFailed = data && data.success === false;
      if (backendSaidFailed || hotels.length === 0) {
        const backendMessage =
          data?.message && String(data.message).trim()
            ? String(data.message).trim()
            : "No Rooms Available";
        // Red-styled warning popup — same SweetAlert2 pattern used
        // elsewhere in the app for destructive-confirm / error dialogs.
        // The booking modal stays open behind it so the operator can
        // dismiss the alert and immediately tweak dates or guests.
        setBookingSubmitting(false);
        Swal.fire({
          icon: "error",
          title: "No rooms available",
          text: backendMessage,
          confirmButtonText: "OK",
          confirmButtonColor: "#EC0B43",
        });
        return;
      }

      // Rooms exist — hand off to /room-list exactly as before.
      sessionStorage.setItem(
        "roomListPayload",
        JSON.stringify({ payload, meta, currency }),
      );
      window.open("/room-list", "_blank");
      closeBookingModal();
    } catch (err) {
      console.error("Preflight room-search failed", err);
      const apiMessage =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        "We couldn't check room availability right now. Please try again in a moment.";
      setBookingSubmitting(false);
      Swal.fire({
        icon: "error",
        title: "No rooms available",
        text: apiMessage,
        confirmButtonText: "OK",
        confirmButtonColor: "#EC0B43",
      });
    }
  };

  const minCheckOutDate = bookingCheckIn
    ? addDaysIso(bookingCheckIn, 1)
    : undefined;
  const todayIso = formatIsoDate(new Date());

  useEffect(() => {
    const fetchHotels = async () => {
      setIsLoading(true);
      try {
        const params = {};
        if (month) {
          params.month = month;
          params.year = currentYear;
        }
        const res = await axiosInstance.get(
          "/api/hotelPromotions/active-hotels",
          { params },
        );
        setResults(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error("Failed to load hotels with active promotions", err);
        toast.error("Failed to load hotels with active promotions");
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHotels();
  }, [month, currentYear]);

  // Reset the family filter whenever the underlying result set changes
  // so a stale chip doesn't hide every card after switching months.
  useEffect(() => {
    setFamilyFilter("all");
  }, [results]);

  const openHotelPromotions = (h) => {
    if (!h || !h.hotelId) return;
    // Tag the navigation with `from: "/promotion"` so the Promotions
    // page's Back button knows to bring the operator back to this
    // deals showcase (see pages/HotelActions/Promotion/Promotion.jsx —
    // it reads location.state?.from and overrides its default backUrl
    // only when this marker is present).
    navigate(`/hotel-actions/${h.hotelId}/promotions`, {
      state: { from: "/promotion" },
    });
  };

  // Counts per family across all fetched hotels — powers both the stats
  // row and the badge counts on the family filter pills.
  const familyCounts = useMemo(() => {
    const counts = { special: 0, discount: 0, staypay: 0 };
    for (const h of results) {
      for (const p of h.promotions || []) {
        const key = styleForPromotion(p.promotionType).key;
        if (counts[key] != null) counts[key] += 1;
      }
    }
    return counts;
  }, [results]);

  const totalActivePromotions =
    familyCounts.special + familyCounts.discount + familyCounts.staypay;

  const selectedMonthLabel = useMemo(
    () => MONTHS.find((m) => String(m.value) === String(month))?.label,
    [month],
  );

  // Apply the family-tab filter to the fetched hotels. "all" passes
  // everything through; anything else keeps only hotels that have at
  // least one promotion of that family.
  const visibleResults = useMemo(() => {
    if (familyFilter === "all") return results;
    return results.filter((h) =>
      (h.promotions || []).some(
        (p) => styleForPromotion(p.promotionType).key === familyFilter,
      ),
    );
  }, [results, familyFilter]);

  const renderStars = (rating) => {
    const r = Number(rating) || 0;
    const total = 5;
    return (
      <span
        className="d-inline-flex align-items-center gap-1"
        title={`${r} star${r === 1 ? "" : "s"}`}
      >
        {Array.from({ length: total }).map((_, i) => (
          <FaStar
            key={i}
            style={{
              color: i < r ? "#f5b301" : "#e0e0e0",
              fontSize: "0.85rem",
            }}
          />
        ))}
      </span>
    );
  };

  const detailsPromoRows = Array.isArray(detailsHotel?.promotions)
    ? detailsHotel.promotions
    : [];
  const detailsCurrency = detailsHotel?.currencyCode || "AED";

  // Collapse any open breakdown whenever a different hotel's modal opens
  // (or it closes) so the next hotel starts clean.
  useEffect(() => {
    setExpandedPromoKey(null);
  }, [detailsHotel]);

  // ── Inline style helpers ──────────────────────────────────────────
  // The whole page keeps the brand red `#EC0B43` (already in use across
  // the app) and Bootstrap defaults for typography. The hero card is
  // plain white with a soft border so it sits cleanly on the light page
  // background; only the "Live Deals" chip carries the brand red.
  const heroStyle = {
    background: "#ffffff",
    borderRadius: "16px",
    color: "#212529",
    padding: "28px 32px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
    border: "1px solid #eef0f2",
    position: "relative",
    overflow: "hidden",
  };

  // Subtle decorative circles behind the hero title — now tinted with
  // the brand red at low opacity so they still add depth against the
  // white background without stealing attention from the headline.
  const heroDecorStyle = {
    position: "absolute",
    right: -60,
    top: -60,
    width: 220,
    height: 220,
    borderRadius: "50%",
    background: "rgba(236,11,67,0.06)",
    pointerEvents: "none",
  };
  const heroDecorSmallStyle = {
    position: "absolute",
    right: 90,
    bottom: -40,
    width: 120,
    height: 120,
    borderRadius: "50%",
    background: "rgba(236,11,67,0.04)",
    pointerEvents: "none",
  };

  const statCardStyle = (accent) => ({
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "16px 18px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    borderLeft: `4px solid ${accent}`,
    display: "flex",
    alignItems: "center",
    gap: 12,
    height: "100%",
  });

  const familyPillStyle = (isActive) => ({
    padding: "8px 16px",
    borderRadius: "999px",
    border: isActive ? "1px solid #EC0B43" : "1px solid #dee2e6",
    backgroundColor: isActive ? "#EC0B43" : "white",
    color: isActive ? "white" : "#495057",
    fontSize: "0.85rem",
    fontWeight: 500,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    transition: "all 0.15s ease-in-out",
    boxShadow: isActive ? "0 2px 6px rgba(236,11,67,0.25)" : "none",
  });

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          {/* ─── Hero band ───────────────────────────────────────── */}
          <div style={heroStyle} className="mb-4">
            <div style={heroDecorStyle} />
            <div style={heroDecorSmallStyle} />
            <div
              className="d-flex justify-content-between align-items-start flex-wrap gap-3"
              style={{ position: "relative" }}
            >
              <div>
                <div
                  className="d-inline-flex align-items-center gap-2 px-3 py-1 mb-2"
                  style={{
                    backgroundColor: "rgba(236,11,67,0.10)",
                    color: "#EC0B43",
                    borderRadius: "999px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                  }}
                >
                  <FaFire /> Live Deals
                </div>
                <h2
                  className="fw-bold mb-1 text-danger"
                  style={{ fontSize: "1.9rem", lineHeight: 1.15 }}
                >
                  Hotels with Active Promotions
                </h2>
                <p
                  className="mb-0 text-muted"
                  style={{ fontSize: "0.95rem", maxWidth: 640 }}
                >
                  Browse every in-house hotel currently running a Special
                  Rate, Discount or Stay-Pay promotion
                  {selectedMonthLabel
                    ? `, valid in ${selectedMonthLabel} ${currentYear}`
                    : ""}
                  .
                </p>
              </div>

              {/* Month picker — sits inside the hero for a compact filter */}
              <div
                className="d-flex align-items-center gap-2 px-3 py-2"
                style={{
                  backgroundColor: "#f8f9fa",
                  border: "1px solid #eef0f2",
                  borderRadius: "12px",
                  minWidth: 240,
                }}
              >
                <FaCalendarAlt className="text-danger" />
                <Form.Label
                  className="mb-0 small fw-semibold text-dark"
                >
                  Month
                </Form.Label>
                <Form.Select
                  size="sm"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  style={{
                    ...chevronStyle,
                    minWidth: 130,
                    backgroundColor: "white",
                    color: "#212529",
                    fontWeight: 500,
                  }}
                >
                  <option value="">All Months</option>
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Form.Select>
                {month && (
                  <button
                    type="button"
                    onClick={() => setMonth("")}
                    className="btn btn-link p-0 text-danger text-decoration-none small"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ─── Stats row ──────────────────────────────────────── */}
          {!isLoading && results.length > 0 && (
            <Row className="g-3 mb-4">
              <Col md={3} sm={6} xs={12}>
                <div style={statCardStyle("#EC0B43")}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      backgroundColor: "rgba(236,11,67,0.10)",
                      color: "#EC0B43",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.1rem",
                    }}
                  >
                    <FaHotel />
                  </div>
                  <div>
                    <div
                      className="text-muted small"
                      style={{ letterSpacing: "0.3px" }}
                    >
                      Hotels on offer
                    </div>
                    <div
                      className="fw-bold"
                      style={{ fontSize: "1.35rem", color: "#212529" }}
                    >
                      {results.length}
                    </div>
                  </div>
                </div>
              </Col>
              <Col md={3} sm={6} xs={12}>
                <div style={statCardStyle("#EC0B43")}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      backgroundColor: "rgba(236,11,67,0.10)",
                      color: "#EC0B43",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.1rem",
                    }}
                  >
                    <FaGift />
                  </div>
                  <div>
                    <div
                      className="text-muted small"
                      style={{ letterSpacing: "0.3px" }}
                    >
                      Special Rates
                    </div>
                    <div
                      className="fw-bold"
                      style={{ fontSize: "1.35rem", color: "#212529" }}
                    >
                      {familyCounts.special}
                    </div>
                  </div>
                </div>
              </Col>
              <Col md={3} sm={6} xs={12}>
                <div style={statCardStyle("#f0ad4e")}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      backgroundColor: "rgba(240,173,78,0.12)",
                      color: "#f0ad4e",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.1rem",
                    }}
                  >
                    <FaPercent />
                  </div>
                  <div>
                    <div
                      className="text-muted small"
                      style={{ letterSpacing: "0.3px" }}
                    >
                      Discount Offers
                    </div>
                    <div
                      className="fw-bold"
                      style={{ fontSize: "1.35rem", color: "#212529" }}
                    >
                      {familyCounts.discount}
                    </div>
                  </div>
                </div>
              </Col>
              <Col md={3} sm={6} xs={12}>
                <div style={statCardStyle("#198754")}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      backgroundColor: "rgba(25,135,84,0.12)",
                      color: "#198754",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.1rem",
                    }}
                  >
                    <FaBed />
                  </div>
                  <div>
                    <div
                      className="text-muted small"
                      style={{ letterSpacing: "0.3px" }}
                    >
                      Stay-Pay Deals
                    </div>
                    <div
                      className="fw-bold"
                      style={{ fontSize: "1.35rem", color: "#212529" }}
                    >
                      {familyCounts.staypay}
                    </div>
                  </div>
                </div>
              </Col>
            </Row>
          )}

          {/* ─── Family filter pills ────────────────────────────── */}
          {!isLoading && results.length > 0 && (
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
              <div className="d-flex align-items-center flex-wrap gap-2">
                {FAMILY_TABS.map((tab) => {
                  const isActive = familyFilter === tab.key;
                  const count =
                    tab.key === "all"
                      ? totalActivePromotions
                      : familyCounts[tab.key] || 0;
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      style={familyPillStyle(isActive)}
                      onClick={() => setFamilyFilter(tab.key)}
                    >
                      <Icon style={{ fontSize: "0.75rem" }} />
                      {tab.label}
                      <Badge
                        pill
                        bg={isActive ? "light" : "secondary"}
                        text={isActive ? "danger" : "light"}
                        style={{ fontSize: "0.7rem", fontWeight: 600 }}
                      >
                        {count}
                      </Badge>
                    </button>
                  );
                })}
              </div>
              <small className="text-muted">
                Showing <span className="fw-semibold">{visibleResults.length}</span>{" "}
                of {results.length} hotel{results.length === 1 ? "" : "s"}
              </small>
            </div>
          )}

          {/* ─── Content: loading / empty / grid ────────────────── */}
          {isLoading ? (
            <Card className="shadow-sm rounded-xl mb-4">
              <Card.Body className="text-center py-5">
                <Spinner animation="border" variant="danger" />
                <p className="text-muted mt-2 mb-0">
                  Loading hotels with active promotions…
                </p>
              </Card.Body>
            </Card>
          ) : visibleResults.length === 0 ? (
            <Card className="shadow-sm rounded-xl">
              <Card.Body className="text-center text-muted py-5">
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    backgroundColor: "rgba(236,11,67,0.08)",
                    color: "#EC0B43",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "2rem",
                    marginBottom: 16,
                  }}
                >
                  <FaTag />
                </div>
                <h5 className="text-dark">No hotels found</h5>
                <p className="mb-0">
                  {results.length === 0
                    ? month
                      ? `No hotels have active promotions valid in ${selectedMonthLabel} ${currentYear}.`
                      : "No hotels have any active promotions."
                    : "No hotels match the selected promotion type."}
                </p>
                {results.length > 0 && familyFilter !== "all" && (
                  <Button
                    variant="outline-danger"
                    size="sm"
                    className="mt-3"
                    onClick={() => setFamilyFilter("all")}
                  >
                    Show all promotions
                  </Button>
                )}
              </Card.Body>
            </Card>
          ) : (
            <Row className="g-4">
              {visibleResults.map((h) => {
                const promoRows = Array.isArray(h.promotions)
                  ? h.promotions
                  : [];
                // Pick the dominant promotion family for the top ribbon.
                // Order of preference matches business priority: Special
                // Rates, then Discount, then Stay-Pay.
                const familyOrder = ["Special Rates", "Discount", "StayPay"];
                const dominantFamily =
                  familyOrder.find((f) =>
                    (h.promotionTypes || []).includes(f),
                  ) || (h.promotionTypes || [])[0];
                const dominantStyle = styleForPromotion(dominantFamily);
                const DominantIcon = dominantStyle.icon;
                const cardCurrency = h.currencyCode || "AED";
                const headlineHasBase =
                  h.baseRateFrom != null &&
                  h.promoRateFrom != null &&
                  Number(h.baseRateFrom) > Number(h.promoRateFrom);
                const hiddenRateRows = Math.max(
                  0,
                  promoRows.length - MAX_CARD_RATE_ROWS,
                );
                // "Applied" markers only make sense once there is more than
                // one promotion to tell apart.
                const showApplied = promoRows.length > 1;
                return (
                  <Col xl={4} md={6} xs={12} key={h.hotelId}>
                    <div
                      style={{
                        backgroundColor: "white",
                        borderRadius: "14px",
                        border: "1px solid #eef0f2",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
                        overflow: "hidden",
                        transition:
                          "transform 0.15s ease-out, box-shadow 0.15s ease-out",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-3px)";
                        e.currentTarget.style.boxShadow =
                          "0 8px 22px rgba(0,0,0,0.10)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow =
                          "0 2px 10px rgba(0,0,0,0.05)";
                      }}
                    >
                      {/* Colored ribbon — dominant promotion family */}
                      <div
                        style={{
                          backgroundColor: dominantStyle.bg,
                          color: "white",
                          padding: "10px 16px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          letterSpacing: "0.3px",
                        }}
                      >
                        <span className="d-inline-flex align-items-center gap-2">
                          <DominantIcon />
                          {dominantFamily || "Promotion"}
                        </span>
                        <span
                          style={{
                            backgroundColor: "rgba(255,255,255,0.22)",
                            padding: "2px 8px",
                            borderRadius: "999px",
                            fontSize: "0.7rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <FaCheckCircle style={{ fontSize: "0.7rem" }} />
                          Live
                        </span>
                      </div>

                      {/* Body */}
                      <div
                        style={{
                          padding: "16px 18px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                          flexGrow: 1,
                        }}
                      >
                        {/* Top row — INHOUSE tag + Active count */}
                        <div className="d-flex align-items-center justify-content-between">
                          <span
                            style={{
                              backgroundColor: "#f1f3f5",
                              color: "#495057",
                              padding: "3px 10px",
                              borderRadius: "999px",
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              letterSpacing: "0.3px",
                            }}
                          >
                            INHOUSE
                          </span>
                          <div className="d-inline-flex align-items-center gap-1">
                            <span
                              className="fw-bold"
                              style={{
                                fontSize: "1.5rem",
                                color: "#EC0B43",
                                lineHeight: 1,
                              }}
                            >
                              {h.promotionCount || 0}
                            </span>
                            <span
                              className="text-muted small"
                              style={{ lineHeight: 1 }}
                            >
                              active
                              <br />
                              promotion
                              {h.promotionCount === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>

                        {/* Hotel name */}
                        <div>
                          <h5
                            style={{
                              fontSize: "1.05rem",
                              fontWeight: 600,
                              marginBottom: 4,
                              color: "#212529",
                              lineHeight: 1.3,
                            }}
                          >
                            {h.hotelName || "Hotel Name Not Available"}
                          </h5>
                          <div className="d-flex align-items-center gap-2">
                            {renderStars(h.starRating)}
                            {h.hotelType && (
                              <span
                                className="text-muted small"
                                style={{ fontSize: "0.75rem" }}
                              >
                                · {h.hotelType}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Address */}
                        <div
                          className="d-flex align-items-start gap-1 text-muted"
                          style={{ fontSize: "0.82rem" }}
                        >
                          <FaMapMarkerAlt
                            className="text-danger flex-shrink-0"
                            style={{ fontSize: "0.75rem", marginTop: 3 }}
                          />
                          <span
                            style={{
                              overflow: "hidden",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {h.hotelAddress ||
                              [h.placeName, h.cityName, h.countryName]
                                .filter(Boolean)
                                .join(", ") ||
                              "Address Not Available"}
                          </span>
                        </div>

                        {/* Location — place / city / country line under the
                            address so both the street text and the
                            administrative location are visible on the card. */}
                        {[h.placeName, h.cityName, h.countryName]
                          .filter(Boolean).length > 0 && (
                          <div
                            className="d-flex align-items-center gap-1"
                            style={{ fontSize: "0.78rem", color: "#495057" }}
                          >
                            <FaMapMarkerAlt
                              className="flex-shrink-0"
                              style={{
                                fontSize: "0.72rem",
                                color: "#6c757d",
                              }}
                            />
                            <span className="fw-semibold">
                              {[h.placeName, h.cityName, h.countryName]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                          </div>
                        )}

                        {/* Family badges */}
                        <div className="d-flex flex-wrap align-items-center gap-2">
                          {(h.promotionTypes || []).map((t) => {
                            const { bg, icon: Icon } = styleForPromotion(t);
                            return (
                              <span
                                key={t}
                                style={{
                                  backgroundColor: `${bg}18`,
                                  color: bg,
                                  border: `1px solid ${bg}55`,
                                  padding: "3px 10px",
                                  borderRadius: "999px",
                                  fontSize: "0.72rem",
                                  fontWeight: 600,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                }}
                              >
                                <Icon style={{ fontSize: "0.7rem" }} />
                                {t}
                              </span>
                            );
                          })}
                        </div>

                        {/* Rate strip — headline "from" price for the hotel,
                            then the rate after each promotion (contract
                            rate struck through → promotional rate → saving).
                            Figures come from rateSummary on each promotion;
                            see the note above formatRate(). */}
                        <div
                          style={{
                            backgroundColor: "#fff8fa",
                            border: "1px solid #f8d7df",
                            borderRadius: 10,
                            padding: "10px 12px",
                          }}
                        >
                          <div className="d-flex align-items-end justify-content-between gap-2">
                            <div style={{ minWidth: 0 }}>
                              <div
                                className="text-muted"
                                style={{
                                  fontSize: "0.68rem",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.4px",
                                  fontWeight: 600,
                                }}
                              >
                                From · per room / night
                              </div>
                              {h.promoRateFrom != null ? (
                                <div className="d-flex align-items-baseline gap-2 flex-wrap">
                                  {headlineHasBase && (
                                    <span
                                      className="text-muted text-decoration-line-through"
                                      style={{ fontSize: "0.85rem" }}
                                    >
                                      {cardCurrency} {formatRate(h.baseRateFrom)}
                                    </span>
                                  )}
                                  <span
                                    className="fw-bold"
                                    style={{
                                      fontSize: "1.3rem",
                                      color: "#EC0B43",
                                      lineHeight: 1.1,
                                    }}
                                  >
                                    {cardCurrency} {formatRate(h.promoRateFrom)}
                                  </span>
                                </div>
                              ) : (
                                <div
                                  className="text-muted"
                                  style={{
                                    fontSize: "0.85rem",
                                    cursor: h.finalRate?.note ? "help" : undefined,
                                  }}
                                  title={h.finalRate?.note || undefined}
                                >
                                  {headlineFallbackText(promoRows, h.finalRate)}
                                </div>
                              )}
                              <FinalRateCaption finalRate={h.finalRate} />
                            </div>
                            {h.maxSavingPercent > 0 && (
                              <span
                                style={{
                                  ...savingPillStyle,
                                  fontSize: "0.72rem",
                                  padding: "3px 10px",
                                }}
                              >
                                Save up to {formatPercent(h.maxSavingPercent)}
                              </span>
                            )}
                          </div>

                          {promoRows.length > 0 && (
                            <div
                              className="d-flex flex-column gap-1 mt-2 pt-2"
                              style={{ borderTop: "1px dashed #f1c7d2" }}
                            >
                              {promoRows
                                .slice(0, MAX_CARD_RATE_ROWS)
                                .map((p, i) => {
                                  // Fix-it links open Hotel Actions admin pages —
                                  // only offered to admin/staff logins.
                                  const editPath = isAgentRole
                                    ? null
                                    : promotionEditPath(h.hotelId, p);
                                  const occupancyPath = isAgentRole
                                    ? null
                                    : hotelOccupancyPath(h.hotelId);
                                  return (
                                    <PromotionRateLine
                                      key={`${p.promotionType}-${p.id}-${i}`}
                                      promo={p}
                                      currency={cardCurrency}
                                      showApplied={showApplied}
                                      onSetRates={
                                        editPath
                                          ? () =>
                                              navigate(editPath, {
                                                state: { from: "/promotion" },
                                              })
                                          : null
                                      }
                                      onConfigureRooms={
                                        occupancyPath
                                          ? () =>
                                              navigate(occupancyPath, {
                                                state: { from: "/promotion" },
                                              })
                                          : null
                                      }
                                    />
                                  );
                                })}
                              {hiddenRateRows > 0 && (
                                <button
                                  type="button"
                                  className="btn btn-link p-0 text-danger text-decoration-none align-self-start"
                                  style={{ fontSize: "0.78rem" }}
                                  onClick={() => setDetailsHotel(h)}
                                >
                                  +{hiddenRateRows} more promotion
                                  {hiddenRateRows === 1 ? "" : "s"} — view details
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Footer actions */}
                        <div
                          className="d-flex align-items-center gap-2 mt-auto pt-3"
                          style={{ borderTop: "1px solid #f1f3f5" }}
                        >
                          <Button
                            size="sm"
                            variant="outline-secondary"
                            onClick={() => setDetailsHotel(h)}
                            className="d-inline-flex align-items-center gap-2 flex-grow-1"
                            disabled={promoRows.length === 0}
                          >
                            <FaListUl style={{ fontSize: "0.75rem" }} />
                            View Details
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => openBookingModal(h)}
                            className="flex-grow-1"
                          >
                            Book Now
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Col>
                );
              })}
            </Row>
          )}

          {/* ─── Promotion details modal ────────────────────────── */}
          <Modal
            show={!!detailsHotel}
            onHide={() => setDetailsHotel(null)}
            size="lg"
            centered
            scrollable
          >
            <Modal.Header
              className="border-0"
              style={{ backgroundColor: "#ffffff" }}
            >
              <Modal.Title className="d-flex align-items-center gap-2 text-danger">
                <FaGift />
                Active Promotion Details
              </Modal.Title>
              <button
                type="button"
                className="btn btn-link text-secondary p-0 ms-auto"
                onClick={() => setDetailsHotel(null)}
                aria-label="Close"
                style={{ fontSize: "1.1rem", lineHeight: 1 }}
              >
                <FaTimes />
              </button>
            </Modal.Header>
            <Modal.Body style={{ backgroundColor: "#ffffff" }}>
              {detailsHotel && (
                <>
                  {/* Hotel header inside the modal */}
                  <Card
                    className="shadow-sm border-0 mb-3"
                    style={{ borderRadius: 10 }}
                  >
                    <Card.Body className="py-3 px-3">
                      <div className="d-flex align-items-start justify-content-between flex-wrap gap-2">
                        <div>
                          <h5
                            style={{
                              fontSize: "1.05rem",
                              fontWeight: 600,
                              marginBottom: 4,
                              color: "#212529",
                            }}
                          >
                            {detailsHotel.hotelName ||
                              "Hotel Name Not Available"}
                          </h5>
                          <div
                            className="d-flex align-items-center gap-1 text-muted"
                            style={{ fontSize: "0.85rem" }}
                          >
                            <FaMapMarkerAlt
                              className="text-danger"
                              style={{ fontSize: "0.75rem" }}
                            />
                            <span>
                              {detailsHotel.hotelAddress ||
                                [
                                  detailsHotel.placeName,
                                  detailsHotel.cityName,
                                  detailsHotel.countryName,
                                ]
                                  .filter(Boolean)
                                  .join(", ") ||
                                "Address Not Available"}
                            </span>
                          </div>
                        </div>
                        <div className="d-flex flex-column align-items-end gap-1">
                          {renderStars(detailsHotel.starRating)}
                          <span
                            style={{
                              backgroundColor: "#ffffff",
                              color: "#EC0B43",
                              border: "1px solid #EC0B43",
                              padding: "3px 10px",
                              borderRadius: "12px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <FaGift style={{ fontSize: "0.7rem" }} />
                            {detailsPromoRows.length} Active
                          </span>
                        </div>
                      </div>

                      {(detailsHotel.promotionTypes || []).length > 0 && (
                        <div className="d-flex flex-wrap align-items-center gap-2 mt-3">
                          {(detailsHotel.promotionTypes || []).map((t) => {
                            const { bg, icon: Icon } = styleForPromotion(t);
                            return (
                              <span
                                key={t}
                                style={{
                                  backgroundColor: "#ffffff",
                                  color: bg,
                                  border: `1px solid ${bg}`,
                                  padding: "4px 10px",
                                  borderRadius: "20px",
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                }}
                              >
                                <Icon style={{ fontSize: "0.7rem" }} />
                                {t}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </Card.Body>
                  </Card>

                  {/* Final rate: how the card headline is reached once every
                      live promotion of this hotel is combined (room-search
                      precedence). */}
                  {detailsHotel.finalRate && (
                    <Card
                      className="shadow-sm border-0 mb-3"
                      style={{
                        borderRadius: 10,
                        borderLeft: "4px solid #EC0B43",
                      }}
                    >
                      <Card.Body className="py-3">
                        <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
                          <div style={{ minWidth: 0 }}>
                            <div
                              className="text-muted"
                              style={{
                                fontSize: "0.68rem",
                                textTransform: "uppercase",
                                letterSpacing: "0.4px",
                                fontWeight: 600,
                              }}
                            >
                              Final rate · per room / night ({detailsCurrency})
                            </div>
                            {detailsHotel.finalRate.status === "OK" ? (
                              <>
                                <div className="d-flex align-items-baseline gap-2 flex-wrap">
                                  {detailsHotel.finalRate.baseRateFrom != null &&
                                    Number(detailsHotel.finalRate.baseRateFrom) >
                                      Number(detailsHotel.finalRate.rateFrom) && (
                                      <span
                                        className="text-muted text-decoration-line-through"
                                        style={{ fontSize: "0.9rem" }}
                                      >
                                        {detailsCurrency}{" "}
                                        {formatRate(detailsHotel.finalRate.baseRateFrom)}
                                      </span>
                                    )}
                                  <span
                                    className="fw-bold"
                                    style={{
                                      fontSize: "1.35rem",
                                      color: "#EC0B43",
                                      lineHeight: 1.1,
                                    }}
                                  >
                                    {detailsCurrency}{" "}
                                    {formatRate(detailsHotel.finalRate.rateFrom)}
                                  </span>
                                  {detailsHotel.finalRate.savingPercent > 0 && (
                                    <span style={savingPillStyle}>
                                      −{formatPercent(detailsHotel.finalRate.savingPercent)}
                                    </span>
                                  )}
                                </div>
                                <div
                                  className="text-muted"
                                  style={{ fontSize: "0.78rem" }}
                                >
                                  {[
                                    detailsHotel.finalRate.roomCategory,
                                    detailsHotel.finalRate.roomType,
                                    detailsHotel.finalRate.occupancy,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                  {detailsHotel.finalRate.detail && (
                                    <> — {detailsHotel.finalRate.detail}</>
                                  )}
                                </div>
                              </>
                            ) : (
                              <div
                                className="text-muted"
                                style={{ fontSize: "0.85rem" }}
                              >
                                {detailsHotel.finalRate.note ||
                                  "Rate not available yet"}
                              </div>
                            )}
                          </div>
                          {detailsHotel.finalRate.status === "OK" && (
                            <div
                              className="d-flex flex-column gap-1"
                              style={{ fontSize: "0.78rem", maxWidth: 420 }}
                            >
                              {(detailsHotel.finalRate.appliedPromotions || []).length >
                                0 && (
                                <div className="d-flex flex-wrap align-items-center gap-1">
                                  <span className="fw-semibold">Applied:</span>
                                  {(detailsHotel.finalRate.appliedPromotions || []).map(
                                    (a, i) => {
                                      const { bg, icon: Icon } = styleForPromotion(
                                        a.promotionType,
                                      );
                                      return (
                                        <span
                                          key={`${a.promotionType}-${a.id}-${i}`}
                                          style={{
                                            color: bg,
                                            border: `1px solid ${bg}`,
                                            padding: "1px 8px",
                                            borderRadius: 999,
                                            fontSize: "0.72rem",
                                            fontWeight: 600,
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 4,
                                          }}
                                        >
                                          <Icon style={{ fontSize: "0.65rem" }} />
                                          {describePromotion(a)}
                                        </span>
                                      );
                                    },
                                  )}
                                </div>
                              )}
                              {(detailsHotel.finalRate.skippedPromotions || []).map(
                                (s, i) => (
                                  <div
                                    key={`skip-${s.promotionType}-${s.id}-${i}`}
                                    className="text-muted"
                                  >
                                    <span className="fw-semibold">Not applied:</span>{" "}
                                    {describePromotion(s)}
                                    {s.reason && <> — {s.reason}</>}
                                  </div>
                                ),
                              )}
                            </div>
                          )}
                        </div>
                      </Card.Body>
                    </Card>
                  )}

                  <Card
                    className="shadow-sm border-0"
                    style={{ borderRadius: 10 }}
                  >
                    <Card.Body className="p-0">
                      {detailsPromoRows.length === 0 ? (
                        <div className="text-center text-muted py-4">
                          <FaTag className="display-6 text-muted mb-2" />
                          <p className="mb-0">
                            No active promotion details available.
                          </p>
                        </div>
                      ) : (
                        <div className="table-responsive">
                          <Table
                            hover
                            className="mb-0 align-middle"
                            style={{ fontSize: "0.9rem" }}
                          >
                            <thead
                              style={{
                                backgroundColor: "#f8f9fa",
                                borderBottom: "2px solid #dee2e6",
                              }}
                            >
                              <tr>
                                <th style={{ width: 50 }} className="text-center">
                                  #
                                </th>
                                <th style={{ width: "17%" }}>Type</th>
                                <th style={{ width: "14%" }}>Code</th>
                                <th style={{ width: "11%" }}>Day Type</th>
                                <th>Validity</th>
                                <th style={{ width: "26%" }}>
                                  Rate / night ({detailsCurrency})
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {detailsPromoRows.map((p, idx) => {
                                const { bg, icon: Icon } = styleForPromotion(
                                  p.promotionType,
                                );
                                const validities = Array.isArray(p.validities)
                                  ? p.validities
                                  : [];
                                const summary = p.rateSummary || {};
                                const roomRows = Array.isArray(summary.rooms)
                                  ? summary.rooms
                                  : [];
                                const rowKey = `${p.promotionType}-${p.id}`;
                                const isExpanded = expandedPromoKey === rowKey;
                                // Admin/staff only — agents cannot edit promotions.
                                const editPath = isAgentRole
                                  ? null
                                  : promotionEditPath(detailsHotel?.hotelId, p);
                                const occupancyPath = isAgentRole
                                  ? null
                                  : hotelOccupancyPath(detailsHotel?.hotelId);
                                const promoRate = formatRate(summary.promoRateFrom);
                                const baseRate = formatRate(summary.baseRateFrom);
                                const hasSaving =
                                  summary.baseRateFrom != null &&
                                  summary.promoRateFrom != null &&
                                  Number(summary.baseRateFrom) >
                                    Number(summary.promoRateFrom);
                                const savingPct = hasSaving
                                  ? formatPercent(summary.savingPercent)
                                  : null;
                                // Same three states as PromotionRateLine on the card.
                                const outsideRoomRate =
                                  p.appliedInFinalRate == null && !!p.finalRateNote;
                                return (
                                  <React.Fragment key={`${rowKey}-${idx}`}>
                                    <tr>
                                      <td className="text-center text-muted">
                                        {idx + 1}
                                      </td>
                                      <td>
                                        <span
                                          style={{
                                            backgroundColor: "#ffffff",
                                            color: bg,
                                            border: `1px solid ${bg}`,
                                            padding: "3px 10px",
                                            borderRadius: "12px",
                                            fontSize: "0.72rem",
                                            fontWeight: 600,
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "5px",
                                          }}
                                        >
                                          <Icon style={{ fontSize: "0.7rem" }} />
                                          {p.promotionType}
                                        </span>
                                      </td>
                                      <td>
                                        <code
                                          style={{
                                            color: "#212529",
                                            backgroundColor: "#f1f3f5",
                                            padding: "3px 8px",
                                            borderRadius: "4px",
                                            fontSize: "0.82rem",
                                          }}
                                        >
                                          {p.promotionCode || "—"}
                                        </code>
                                      </td>
                                      <td>
                                        <span className="fw-semibold text-dark">
                                          {p.dayType || "—"}
                                        </span>
                                      </td>
                                      <td>
                                        {validities.length === 0 ? (
                                          <span className="text-muted">—</span>
                                        ) : (
                                          <div className="d-flex flex-column gap-1">
                                            {validities.map((v, i) => (
                                              <span
                                                key={i}
                                                className="d-inline-flex align-items-center gap-2"
                                                style={{ fontSize: "0.85rem" }}
                                              >
                                                <FaCalendarAlt
                                                  className="text-danger"
                                                  style={{ fontSize: "0.75rem" }}
                                                />
                                                <span className="fw-semibold">
                                                  {v.validityFrom || "—"}
                                                </span>
                                                <span className="text-muted">
                                                  →
                                                </span>
                                                <span className="fw-semibold">
                                                  {v.validityTo || "—"}
                                                </span>
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </td>
                                      {/* Rate after the promotion — headline for
                                          the cheapest room; click to expand the
                                          per-room breakdown underneath. */}
                                      <td>
                                        <div className="d-flex flex-column gap-1">
                                          {summary.offerLabel && (
                                            <span
                                              className="text-muted"
                                              style={{ fontSize: "0.78rem" }}
                                            >
                                              {summary.offerLabel}
                                              {summary.appliesTo &&
                                                summary.appliesTo !== "Room" && (
                                                  <> · {summary.appliesTo}</>
                                                )}
                                            </span>
                                          )}
                                          {promoRate ? (
                                            <span className="d-inline-flex align-items-center gap-2 flex-wrap">
                                              {hasSaving && (
                                                <span
                                                  className="text-muted text-decoration-line-through"
                                                  style={{ fontSize: "0.8rem" }}
                                                >
                                                  {baseRate}
                                                </span>
                                              )}
                                              <span
                                                className="fw-bold"
                                                style={{
                                                  color:
                                                    p.appliedInFinalRate === false ||
                                                    outsideRoomRate
                                                      ? "#6c757d"
                                                      : "#EC0B43",
                                                }}
                                              >
                                                {promoRate}
                                              </span>
                                              {savingPct &&
                                                p.appliedInFinalRate !== false &&
                                                !outsideRoomRate && (
                                                  <span style={savingPillStyle}>
                                                    −{savingPct}
                                                  </span>
                                                )}
                                              {outsideRoomRate && (
                                                <span
                                                  style={notAppliedPillStyle}
                                                  title={p.finalRateNote}
                                                >
                                                  Not in room rate
                                                </span>
                                              )}
                                              {p.appliedInFinalRate === true &&
                                                detailsPromoRows.length > 1 && (
                                                  <span
                                                    style={appliedPillStyle}
                                                    title="Part of the final rate"
                                                  >
                                                    Applied
                                                  </span>
                                                )}
                                              {p.appliedInFinalRate === false && (
                                                <span
                                                  style={notAppliedPillStyle}
                                                  title={
                                                    p.finalRateNote ||
                                                    "Not part of the final rate"
                                                  }
                                                >
                                                  Not applied
                                                </span>
                                              )}
                                            </span>
                                          ) : (
                                            <>
                                              <span
                                                className="text-muted d-inline-flex align-items-center gap-1"
                                                style={{ fontSize: "0.82rem" }}
                                                title={summary.note || ""}
                                              >
                                                <FaInfoCircle style={{ fontSize: "0.7rem" }} />
                                                {rateStatusText(summary)}
                                              </span>
                                              {summary.note && (
                                                <span
                                                  className="text-muted"
                                                  style={{ fontSize: "0.74rem" }}
                                                >
                                                  {summary.note}
                                                </span>
                                              )}
                                              {p.finalRateNote && (
                                                <span
                                                  className="text-muted"
                                                  style={{ fontSize: "0.74rem" }}
                                                >
                                                  {p.finalRateNote}
                                                </span>
                                              )}
                                              {summary.status === "NO_ROOM_VALUES" &&
                                                editPath && (
                                                  <button
                                                    type="button"
                                                    className="btn btn-link p-0 text-danger text-decoration-none fw-semibold align-self-start"
                                                    style={{ fontSize: "0.76rem" }}
                                                    onClick={() => {
                                                      setDetailsHotel(null);
                                                      navigate(editPath, {
                                                        state: { from: "/promotion" },
                                                      });
                                                    }}
                                                  >
                                                    Set rates for this promotion
                                                  </button>
                                                )}
                                              {summary.status === "NO_ROOM_SETUP" &&
                                                occupancyPath && (
                                                  <button
                                                    type="button"
                                                    className="btn btn-link p-0 text-danger text-decoration-none fw-semibold align-self-start"
                                                    style={{ fontSize: "0.76rem" }}
                                                    onClick={() => {
                                                      setDetailsHotel(null);
                                                      navigate(occupancyPath, {
                                                        state: { from: "/promotion" },
                                                      });
                                                    }}
                                                  >
                                                    Configure room occupancy
                                                  </button>
                                                )}
                                            </>
                                          )}
                                          {roomRows.length > 0 && (
                                            <button
                                              type="button"
                                              className="btn btn-link p-0 text-danger text-decoration-none align-self-start"
                                              style={{ fontSize: "0.76rem" }}
                                              onClick={() =>
                                                setExpandedPromoKey(
                                                  isExpanded ? null : rowKey,
                                                )
                                              }
                                            >
                                              {isExpanded ? "Hide" : "Show"} room-wise
                                              rates ({roomRows.length})
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                    {isExpanded && (
                                      <tr>
                                        <td
                                          colSpan={6}
                                          style={{
                                            backgroundColor: "#fff8fa",
                                            padding: "12px 16px",
                                          }}
                                        >
                                          <div
                                            className="fw-semibold text-dark mb-2"
                                            style={{ fontSize: "0.82rem" }}
                                          >
                                            Rate after promotion — per room / night
                                            ({detailsCurrency})
                                          </div>
                                          <div className="table-responsive">
                                            <Table
                                              size="sm"
                                              bordered
                                              className="mb-0 align-middle"
                                              style={{
                                                fontSize: "0.82rem",
                                                backgroundColor: "#ffffff",
                                              }}
                                            >
                                              <thead className="table-light">
                                                <tr>
                                                  <th>Room Category</th>
                                                  <th>Room Type</th>
                                                  <th>Occupancy</th>
                                                  <th>Offer</th>
                                                  <th className="text-end">
                                                    Contract rate
                                                  </th>
                                                  <th className="text-end">
                                                    After promotion
                                                  </th>
                                                  <th className="text-end">Saving</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {roomRows.map((r, i) => (
                                                  <tr key={i}>
                                                    <td>{r.roomCategory || "—"}</td>
                                                    <td>{r.roomType || "—"}</td>
                                                    <td>{r.occupancy || "—"}</td>
                                                    <td className="text-muted">
                                                      {r.detail || "—"}
                                                    </td>
                                                    <td className="text-end">
                                                      {r.baseRate != null
                                                        ? formatRate(r.baseRate)
                                                        : "—"}
                                                    </td>
                                                    <td
                                                      className="text-end fw-semibold"
                                                      style={{ color: "#EC0B43" }}
                                                    >
                                                      {r.promoRate != null
                                                        ? formatRate(r.promoRate)
                                                        : "—"}
                                                    </td>
                                                    <td className="text-end">
                                                      {r.savingAmount != null &&
                                                      Number(r.savingAmount) > 0
                                                        ? `${formatRate(r.savingAmount)} (${formatPercent(r.savingPercent)})`
                                                        : "—"}
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </Table>
                                          </div>
                                          {summary.note && (
                                            <div
                                              className="text-muted d-flex align-items-center gap-1 mt-2"
                                              style={{ fontSize: "0.78rem" }}
                                            >
                                              <FaInfoCircle style={{ fontSize: "0.7rem" }} />
                                              {summary.note}
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </Table>
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                  <div
                    className="text-muted d-flex align-items-start gap-2 mt-2"
                    style={{ fontSize: "0.76rem" }}
                  >
                    <FaInfoCircle
                      className="flex-shrink-0"
                      style={{ fontSize: "0.7rem", marginTop: 3 }}
                    />
                    <span>
                      Rates are per room per night in {detailsCurrency}, before
                      agent markup. Each promotion row shows that promotion on
                      its own against the lowest live contract rate inside its
                      validity window; the final rate combines this hotel's
                      live promotions the way the room search does — a Special
                      Rate competes with the contract rate (the lower one is
                      used), a Stay-Pay takes precedence over a Discount on the
                      same room (they are never stacked), and Discount /
                      Stay-Pay are applied to the contract rate. Stay-Pay
                      figures are the effective nightly rate over one full
                      stay/pay cycle (e.g. Stay 2 Pay 1 halves the rate across
                      2 nights; shorter stays pay the full rate). The exact
                      price for a stay is confirmed on the room list after you
                      pick dates and guests.
                    </span>
                  </div>
                </>
              )}
            </Modal.Body>
            <Modal.Footer
              className="d-flex justify-content-between align-items-center"
              style={{ backgroundColor: "#ffffff" }}
            >
              <small className="text-muted">
                {detailsPromoRows.length} promotion
                {detailsPromoRows.length === 1 ? "" : "s"} shown
              </small>
              <div className="d-flex gap-2">
                <Button
                  variant="outline-secondary"
                  onClick={() => setDetailsHotel(null)}
                >
                  Close
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (detailsHotel) openHotelPromotions(detailsHotel);
                    setDetailsHotel(null);
                  }}
                >
                  Manage Promotions
                </Button>
              </div>
            </Modal.Footer>
          </Modal>

          {/* ─── Book Now popup — mirrors the /new-booking/hotel filters
                (minus Destination/City, since the hotel is already picked).
                On submit it opens /room-list in a new tab with a
                sessionStorage payload compatible with pages/RoomList.jsx. */}
          <Modal
            show={!!bookingHotel}
            onHide={closeBookingModal}
            size="lg"
            centered
            scrollable
            backdrop="static"
          >
            <Form onSubmit={handleBookNowSubmit} noValidate>
              {/* The app-wide styles/RoomList.css sets every .modal-header
                  to a red gradient background with white text (loaded
                  globally by many routes; see the note in
                  components/AdvertisementCarousel.jsx). We embrace the
                  gradient here — a plain white inline background can't
                  win over the CSS shorthand's background-image, and
                  text-danger on the gradient made the title invisible.
                  White text + white close icon read cleanly on the
                  gradient and match every other modal header on the
                  page. */}
              <Modal.Header className="border-0 py-3">
                <div className="d-flex align-items-center gap-3 flex-grow-1">
                  {/* Little icon disc for a friendlier feel — pure white
                      circle on the red gradient header, no new colours. */}
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: "50%",
                      backgroundColor: "rgba(255,255,255,0.18)",
                      color: "#ffffff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <FaBed />
                  </div>
                  <div className="d-flex flex-column">
                    <Modal.Title className="text-white mb-0 d-flex align-items-center gap-2">
                      Book Now
                    </Modal.Title>
                    {bookingHotel?.hotelName && (
                      <span
                        className="text-white fw-normal small d-inline-flex align-items-center gap-1"
                        style={{ opacity: 0.9 }}
                      >
                        <FaHotel style={{ opacity: 0.9 }} />
                        {bookingHotel.hotelName}
                      </span>
                    )}
                    {/* Location line — matches the hotel-card address
                        composition (placeName · cityName · countryName)
                        so the operator always sees the same location
                        text on both the card and inside the popup. */}
                    {(() => {
                      const location = [
                        bookingHotel?.placeName,
                        bookingHotel?.cityName,
                        bookingHotel?.countryName,
                      ]
                        .filter(Boolean)
                        .join(", ");
                      if (!location) return null;
                      return (
                        <span
                          className="text-white fw-normal d-inline-flex align-items-center gap-1"
                          style={{ opacity: 0.85, fontSize: "0.8rem" }}
                        >
                          <FaMapMarkerAlt style={{ opacity: 0.9 }} />
                          {location}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-link text-white p-0 ms-auto d-inline-flex align-items-center justify-content-center"
                  onClick={closeBookingModal}
                  aria-label="Close"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    backgroundColor: "rgba(255,255,255,0.15)",
                    lineHeight: 1,
                    opacity: 0.95,
                  }}
                >
                  <FaTimes />
                </button>
              </Modal.Header>
              {/* Explicit maxHeight + overflowY:auto guarantees the body
                  scrolls regardless of what the app's global modal CSS
                  overrides do — so newly added room cards can always be
                  reached and the auto-scroll effect above has somewhere
                  to scroll to. The maxHeight is deliberately conservative
                  (55vh) so that on typical laptop viewports the sticky
                  Modal.Header + Modal.Footer always stay within the
                  viewport — the previous 72vh was pushing the Cancel /
                  Search Rooms buttons below the fold when the footer
                  needed a second row. */}
              <Modal.Body
                style={{
                  backgroundColor: "#f8f9fa",
                  maxHeight: "55vh",
                  overflowY: "auto",
                  padding: "20px 22px",
                }}
              >
                {/* ── Section 1: Booking Party — Agent + Employee.
                       Only relevant for admin/staff logins; agent-role
                       users book under themselves so the section
                       disappears entirely. */}
                {!isAgentRole && (
                  <div
                    style={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #eef0f2",
                      borderRadius: 12,
                      padding: "16px 18px",
                      marginBottom: 14,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                    }}
                  >
                    <div
                      className="d-flex align-items-center gap-2 mb-3"
                      style={{
                        borderBottom: "1px solid #f1f3f5",
                        paddingBottom: 10,
                      }}
                    >
                      <FaUserTie className="text-danger" />
                      <span className="fw-semibold small text-uppercase text-muted">
                        Booking Party
                      </span>
                    </div>
                    <Row className="g-3">
                      <Col md={6}>
                        <Form.Label className="fw-semibold small text-uppercase text-muted d-flex align-items-center gap-2">
                          <FaUserTie className="text-danger" />
                          Agent
                          <span
                            className="text-danger"
                            aria-hidden="true"
                            title="Required"
                          >
                            *
                          </span>
                        </Form.Label>
                        <AgentSelect
                          agents={bookingAgents}
                          value={pickedAgent}
                          onChange={(id) => {
                            setPickedAgent(id || "");
                            setBookingErrors((prev) => {
                              const { agent: _drop, ...rest } = prev;
                              return rest;
                            });
                          }}
                          placeholder="Select Agent"
                          isInvalid={!!bookingErrors.agent}
                        />
                        {bookingErrors.agent && (
                          <div className="text-danger small mt-1">
                            {bookingErrors.agent}
                          </div>
                        )}
                        {/* Available Credit line — appears in the brand
                            red under the Agent picker once an agent is
                            selected. Uses the same /api/agent-credit-
                            limit/agent/{id} endpoint HotelSearch.jsx
                            queries, and falls back silently when the
                            endpoint returns no balance. */}
                        {pickedAgent && (
                          <div
                            className="d-flex align-items-center gap-2 mt-1 small fw-semibold text-danger"
                            aria-live="polite"
                          >
                            <FaWallet style={{ fontSize: "0.8rem" }} />
                            {pickedAgentBalanceLoading ? (
                              <span>Loading available credit…</span>
                            ) : pickedAgentBalance != null ? (
                              <span>
                                Available Credit:{" "}
                                {`AED ${pickedAgentBalance.toLocaleString(
                                  undefined,
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  },
                                )}`}
                              </span>
                            ) : (
                              <span>Available credit unavailable</span>
                            )}
                          </div>
                        )}
                      </Col>

                      <Col md={6}>
                        <Form.Label className="fw-semibold small text-uppercase text-muted d-flex align-items-center gap-2">
                          <FaUsers className="text-danger" />
                          Booking Done By Employee
                          <span className="text-muted fw-normal text-lowercase ms-1">
                            (optional)
                          </span>
                        </Form.Label>
                        <Select
                          isClearable
                          placeholder="Select employee"
                          options={(Array.isArray(bookingEmployees)
                            ? bookingEmployees
                            : []
                          ).map((emp) => ({
                            value: emp.id,
                            label:
                              emp.name ||
                              [emp.firstName, emp.lastName]
                                .filter(Boolean)
                                .join(" ") ||
                              emp.email ||
                              `Employee #${emp.id}`,
                          }))}
                          value={pickedEmployee}
                          onChange={(opt) => setPickedEmployee(opt || null)}
                          menuPortalTarget={
                            typeof document !== "undefined"
                              ? document.body
                              : undefined
                          }
                          menuPosition="fixed"
                          styles={{
                            menuPortal: (b) => ({ ...b, zIndex: 9999 }),
                            control: (b) => ({
                              ...b,
                              minHeight: 42,
                              borderRadius: 8,
                            }),
                          }}
                        />
                      </Col>
                    </Row>
                  </div>
                )}

                {/* ── Section 2: Stay Details — Nationality + Dates
                       stacked in the right column so Nights sits between
                       the two date pickers. */}
                <div
                  style={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #eef0f2",
                    borderRadius: 12,
                    padding: "16px 18px",
                    marginBottom: 14,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  }}
                >
                  <div
                    className="d-flex align-items-center gap-2 mb-3"
                    style={{
                      borderBottom: "1px solid #f1f3f5",
                      paddingBottom: 10,
                    }}
                  >
                    <FaCalendarAlt className="text-danger" />
                    <span className="fw-semibold small text-uppercase text-muted">
                      Stay Details
                    </span>
                  </div>
                  <Row className="g-3">
                    {/* Nationality spans the full row on its own — it's a
                        single wide dropdown, so pairing it with the tall
                        Check-In/Nights/Check-Out stack (as before) left
                        the section visually lopsided. */}
                    <Col xs={12}>
                      <Form.Label className="fw-semibold small text-uppercase text-muted d-flex align-items-center gap-2">
                        <FaGlobe className="text-danger" />
                        Nationality
                        <span
                          className="text-danger"
                          aria-hidden="true"
                          title="Required"
                        >
                          *
                        </span>
                      </Form.Label>
                      <Select
                        isClearable
                        placeholder="Select nationality"
                        options={bookingNationalities}
                        value={pickedNationality}
                        onChange={(opt) => {
                          setPickedNationality(opt || null);
                          setBookingErrors((prev) => {
                            const { nationality: _drop, ...rest } = prev;
                            return rest;
                          });
                        }}
                        menuPortalTarget={
                          typeof document !== "undefined"
                            ? document.body
                            : undefined
                        }
                        menuPosition="fixed"
                        styles={{
                          menuPortal: (b) => ({ ...b, zIndex: 9999 }),
                          control: (b) => ({
                            ...b,
                            minHeight: 42,
                            borderRadius: 8,
                            borderColor: bookingErrors.nationality
                              ? "#dc3545"
                              : b.borderColor,
                            boxShadow: bookingErrors.nationality
                              ? "0 0 0 0.15rem rgba(220,53,69,.15)"
                              : b.boxShadow,
                          }),
                        }}
                      />
                      {bookingErrors.nationality && (
                        <div className="text-danger small mt-1">
                          {bookingErrors.nationality}
                        </div>
                      )}
                    </Col>

                    {/* Check-In | Nights | Check-Out on a single row —
                        classic booking-form pattern; short + wide + short
                        keeps the section compact and each field within
                        easy scanning distance of the others. */}
                    <Col md={4} xs={12}>
                      <Form.Label className="fw-semibold small text-uppercase text-muted d-flex align-items-center gap-2">
                        <FaCalendarAlt className="text-danger" />
                        Check-In
                        <span
                          className="text-danger"
                          aria-hidden="true"
                          title="Required"
                        >
                          *
                        </span>
                      </Form.Label>
                      <Form.Control
                        type="date"
                        value={bookingCheckIn}
                        min={todayIso}
                        onChange={(e) => {
                          const next = e.target.value;
                          setBookingCheckIn(next);
                          if (
                            next &&
                            (!bookingCheckOut ||
                              new Date(bookingCheckOut) <= new Date(next))
                          ) {
                            suppressNightsRecomputeRef.current = true;
                            setBookingCheckOut(
                              addDaysIso(next, Math.max(1, bookingNights || 1)),
                            );
                          }
                          setBookingErrors((prev) => {
                            const { checkIn: _drop, ...rest } = prev;
                            return rest;
                          });
                        }}
                        isInvalid={!!bookingErrors.checkIn}
                      />
                      {bookingErrors.checkIn && (
                        <div className="text-danger small mt-1">
                          {bookingErrors.checkIn}
                        </div>
                      )}
                    </Col>
                    <Col md={4} xs={12}>
                      <Form.Label className="fw-semibold small text-uppercase text-muted">
                        Nights
                      </Form.Label>
                      <Form.Control
                        type="number"
                        min={1}
                        max={MAX_BOOKING_NIGHTS}
                        value={bookingNights}
                        onChange={(e) =>
                          handleBookingNightsChange(e.target.value)
                        }
                        isInvalid={!!bookingErrors.nights}
                      />
                      {bookingErrors.nights && (
                        <div className="text-danger small mt-1">
                          {bookingErrors.nights}
                        </div>
                      )}
                    </Col>
                    <Col md={4} xs={12}>
                      <Form.Label className="fw-semibold small text-uppercase text-muted d-flex align-items-center gap-2">
                        <FaCalendarAlt className="text-danger" />
                        Check-Out
                        <span
                          className="text-danger"
                          aria-hidden="true"
                          title="Required"
                        >
                          *
                        </span>
                      </Form.Label>
                      <Form.Control
                        type="date"
                        value={bookingCheckOut}
                        min={minCheckOutDate}
                        onChange={(e) => {
                          setBookingCheckOut(e.target.value);
                          setBookingErrors((prev) => {
                            const { checkOut: _drop, ...rest } = prev;
                            return rest;
                          });
                        }}
                        isInvalid={!!bookingErrors.checkOut}
                      />
                      {bookingErrors.checkOut && (
                        <div className="text-danger small mt-1">
                          {bookingErrors.checkOut}
                        </div>
                      )}
                    </Col>
                  </Row>
                </div>

                {/* ── Section 3: Rooms & Guests — numbered room cards
                       with a nudge showing the running room count so
                       the operator always sees what they're building. */}
                <div
                  style={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #eef0f2",
                    borderRadius: 12,
                    padding: "16px 18px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  }}
                >
                  <div
                    className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2"
                    style={{
                      borderBottom: "1px solid #f1f3f5",
                      paddingBottom: 10,
                    }}
                  >
                    <div className="d-flex align-items-center gap-2">
                      <FaBed className="text-danger" />
                      <span className="fw-semibold small text-uppercase text-muted">
                        Rooms &amp; Guests
                      </span>
                      <Badge
                        pill
                        bg="light"
                        text="danger"
                        className="fw-semibold"
                        style={{ border: "1px solid #f1d4dc" }}
                      >
                        {bookingRooms.length}
                        {bookingRooms.length === 1 ? " room" : " rooms"}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline-danger"
                      onClick={addBookingRoom}
                      disabled={bookingRooms.length >= MAX_BOOKING_ROOMS}
                      className="d-inline-flex align-items-center gap-1 fw-semibold"
                    >
                      <FaPlus /> Add Room
                    </Button>
                  </div>

                  <div className="d-flex flex-column gap-3">
                    {bookingRooms.map((room, idx) => (
                      <div
                        key={idx}
                        ref={(el) => {
                          roomRefs.current[idx] = el;
                        }}
                        style={{
                          border: "1px solid #eef0f2",
                          borderRadius: 12,
                          padding: "14px 16px",
                          backgroundColor: "#fbfbfc",
                          transition:
                            "box-shadow 0.15s ease-in-out, border-color 0.15s ease-in-out",
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.boxShadow =
                            "0 4px 12px rgba(236,11,67,0.08)";
                          e.currentTarget.style.borderColor = "#f1d4dc";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.boxShadow = "none";
                          e.currentTarget.style.borderColor = "#eef0f2";
                        }}
                      >
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <div className="d-flex align-items-center gap-2">
                            <span
                              className="fw-bold d-inline-flex align-items-center justify-content-center"
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: "50%",
                                backgroundColor: "rgba(236,11,67,0.10)",
                                color: "#EC0B43",
                                fontSize: "0.8rem",
                              }}
                            >
                              {idx + 1}
                            </span>
                            <span className="fw-semibold text-dark">
                              Room {idx + 1}
                            </span>
                            <span className="text-muted small ms-1">
                              · {room.adults}{" "}
                              {room.adults === 1 ? "adult" : "adults"}
                              {room.children > 0 &&
                                `, ${room.children} ${
                                  room.children === 1 ? "child" : "children"
                                }`}
                            </span>
                          </div>
                          {bookingRooms.length > 1 && (
                            <button
                              type="button"
                              className="btn btn-link text-danger p-0 small d-inline-flex align-items-center gap-1"
                              onClick={() => removeBookingRoom(idx)}
                            >
                              <FaTrash /> Remove
                            </button>
                          )}
                        </div>
                        <Row className="g-2 align-items-end">
                          <Col md={6} xs={6}>
                            <Form.Label className="small text-muted mb-1 d-flex align-items-center gap-1">
                              <FaUsers style={{ opacity: 0.7 }} />
                              Adults (18+)
                            </Form.Label>
                            <Form.Control
                              type="number"
                              min={1}
                              max={6}
                              value={room.adults}
                              onChange={(e) =>
                                setRoomAdults(idx, e.target.value)
                              }
                            />
                          </Col>
                          <Col md={6} xs={6}>
                            <Form.Label className="small text-muted mb-1 d-flex align-items-center gap-1">
                              <FaUsers style={{ opacity: 0.7 }} />
                              Children (0–17)
                            </Form.Label>
                            <Form.Control
                              type="number"
                              min={0}
                              max={4}
                              value={room.children}
                              onChange={(e) =>
                                setRoomChildren(idx, e.target.value)
                              }
                            />
                          </Col>
                        </Row>
                        {room.children > 0 && (
                          <div
                            className="mt-3 pt-3"
                            style={{ borderTop: "1px dashed #eef0f2" }}
                          >
                            <Form.Label className="small text-muted mb-2 d-flex align-items-center gap-1">
                              <FaUsers style={{ opacity: 0.7 }} />
                              Child ages
                            </Form.Label>
                            <div className="d-flex flex-wrap gap-2">
                              {Array.from({ length: room.children }).map(
                                (_, cIdx) => (
                                  <Form.Select
                                    key={cIdx}
                                    size="sm"
                                    value={room.childAges[cIdx] ?? 5}
                                    onChange={(e) =>
                                      setChildAge(idx, cIdx, e.target.value)
                                    }
                                    style={{ ...chevronStyle, width: 130 }}
                                  >
                                    {Array.from({ length: 18 }).map(
                                      (__, age) => (
                                        <option key={age} value={age}>
                                          {`Child ${cIdx + 1}: ${age} ${
                                            age === 1 ? "yr" : "yrs"
                                          }`}
                                        </option>
                                      ),
                                    )}
                                  </Form.Select>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {bookingRooms.length >= MAX_BOOKING_ROOMS && (
                      <small className="text-danger d-inline-flex align-items-center gap-1">
                        <FaInfoCircle />
                        A maximum of {MAX_BOOKING_ROOMS} rooms can be added per
                        booking.
                      </small>
                    )}
                  </div>
                </div>
              </Modal.Body>
              {/* Single-row footer — summary chips on the left, action
                  cluster pinned to the right via ms-auto so the primary
                  CTA always lands under the modal's right edge. `flex-
                  wrap` lets the chip group drop under the buttons on
                  narrow widths, but the row otherwise stays compact —
                  which keeps the whole modal short enough that the
                  Cancel / Search Rooms buttons remain visible on
                  laptop viewports (a 2-row footer plus 72vh body was
                  pushing them off-screen). */}
              <Modal.Footer
                className="d-flex align-items-center flex-wrap"
                style={{
                  backgroundColor: "#ffffff",
                  padding: "12px 22px",
                  borderTop: "1px solid #eef0f2",
                  rowGap: 10,
                  columnGap: 24,
                }}
              >
                <div
                  className="d-flex align-items-center flex-wrap"
                  style={{ gap: 8 }}
                >
                  <span
                    className="d-inline-flex align-items-center gap-1 small fw-semibold"
                    style={{
                      backgroundColor: "rgba(236,11,67,0.08)",
                      color: "#EC0B43",
                      borderRadius: 999,
                      padding: "4px 10px",
                    }}
                  >
                    <FaMoon />
                    {bookingNights}
                    {bookingNights === 1 ? " night" : " nights"}
                  </span>
                  <span
                    className="d-inline-flex align-items-center gap-1 small fw-semibold"
                    style={{
                      backgroundColor: "#f1f3f5",
                      color: "#495057",
                      borderRadius: 999,
                      padding: "4px 10px",
                    }}
                  >
                    <FaBed />
                    {bookingRooms.length}
                    {bookingRooms.length === 1 ? " room" : " rooms"}
                  </span>
                  <span
                    className="d-inline-flex align-items-center gap-1 small fw-semibold"
                    style={{
                      backgroundColor: "#f1f3f5",
                      color: "#495057",
                      borderRadius: 999,
                      padding: "4px 10px",
                    }}
                  >
                    <FaUsers />
                    {(() => {
                      const adults = bookingRooms.reduce(
                        (n, r) => n + (r.adults || 0),
                        0,
                      );
                      const children = bookingRooms.reduce(
                        (n, r) => n + (r.children || 0),
                        0,
                      );
                      const total = adults + children;
                      return `${total} ${total === 1 ? "guest" : "guests"}`;
                    })()}
                  </span>
                </div>
                {/* Primary CTA (Search Rooms) is prominent — larger
                    padding, subtle lift on hover, arrow-forward icon on
                    the trailing edge so the button reads as "proceed".
                    Cancel is a low-weight ghost link on the left of the
                    action cluster so it never competes with the primary
                    action for the operator's attention.

                    The cluster sits on its OWN row inside the stacked
                    footer, right-justified so the CTA lands under the
                    modal's right edge exactly where the operator's eye
                    already is — never crowding the summary chips above. */}
                <div
                  className="d-flex align-items-center ms-auto flex-wrap justify-content-end"
                  style={{ gap: 14 }}
                >
                  <button
                    type="button"
                    onClick={closeBookingModal}
                    disabled={bookingSubmitting}
                    className="btn btn-link text-secondary text-decoration-none fw-semibold p-0"
                    style={{ opacity: bookingSubmitting ? 0.6 : 1 }}
                  >
                    Cancel
                  </button>
                  <Button
                    type="submit"
                    variant="danger"
                    disabled={bookingSubmitting}
                    className="d-inline-flex align-items-center gap-2 fw-semibold"
                    style={{
                      padding: "10px 22px",
                      borderRadius: 999,
                      boxShadow: bookingSubmitting
                        ? "none"
                        : "0 4px 14px rgba(236,11,67,0.30)",
                      transition:
                        "transform 0.15s ease-out, box-shadow 0.15s ease-out",
                    }}
                    onMouseEnter={(e) => {
                      if (bookingSubmitting) return;
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow =
                        "0 8px 20px rgba(236,11,67,0.35)";
                    }}
                    onMouseLeave={(e) => {
                      if (bookingSubmitting) return;
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow =
                        "0 4px 14px rgba(236,11,67,0.30)";
                    }}
                  >
                    {bookingSubmitting ? (
                      <>
                        <Spinner
                          animation="border"
                          size="sm"
                          role="status"
                          aria-hidden="true"
                        />
                        Opening…
                      </>
                    ) : (
                      <>
                        <FaSearch />
                        Search Rooms
                        <span
                          aria-hidden="true"
                          style={{
                            display: "inline-block",
                            marginLeft: 2,
                            transform: "translateY(-1px)",
                          }}
                        >
                          →
                        </span>
                      </>
                    )}
                  </Button>
                </div>
              </Modal.Footer>
            </Form>
          </Modal>
        </main>
      </div>
    </div>
  );
}
