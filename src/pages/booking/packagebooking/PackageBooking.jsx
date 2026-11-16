import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Row, Col, Spinner, Form, Modal, Button, Card, Badge } from "react-bootstrap";
import Sidebar from "../../../components/Sidebar";
import TopBar from "../../../components/TopBar";
import AgentBalanceDisplay from "../../../components/AgentBalanceDisplay";
import axiosInstance from "../../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import {
  FaCreditCard,
  FaCheckCircle,
  FaShieldAlt,
  FaRegClock,
  FaTimesCircle,
  FaFileContract,
  FaSuitcase,
  FaCalendarAlt,
  FaUsers,
  FaBed,
  FaGlobe,
  FaClock,
  FaMapMarkerAlt,
} from "react-icons/fa";

// Total Price maths — shared with PackageCheckout.jsx so step 1 and step 2
// can never disagree on the number again. See the header comment in
// packageTotal.js for why the hotel rate REPLACES the base package rate
// instead of stacking on top of it.
import {
  computePackageTotal,
  formatPackageAmount,
  resolvePackageBaseRate,
} from "./packageTotal";
import {
  savedPackageRate,
  savedSupplierFields,
  toIsoDate,
} from "./supplierHotels";

import HotelsTab from "./tabs/HotelsTab";
import CabsTab from "./tabs/CabsTab";
import ActivitiesTab from "./tabs/ActivitiesTab";
import PaxInformation from "./tabs/PaxInformation";

// Abandoned-package-search suggestion email — mirrors the hotel booking
// flow's /api/search-history/{save,confirm} calls but talks to the
// package-scoped endpoints. See src/utils/packageSearchHistory.js for the
// helper; the /confirm side lives in PaxInformation.jsx (standard flow)
// and PackageCheckout.jsx (CCAvenue paid flow).
import { savePackageSearchHistorySnapshot } from "../../../utils/packageSearchHistory";
// Basic Details step removed — package category is now resolved from the
// occupancy chosen on the Package Search page, and Pax passport moved to the
// Pax Info step. BasicDetails.jsx is intentionally no longer imported.

import "../../../styles/PackageBooking_Stepper.css";
// Reused from the Hotel booking flow (/room-list) so this page inherits the
// same visual language — --rl-* palette, .hs-page-heading-title header, the
// .back-to-search-btn pill, and the .hotel-header-card / .booking-summary
// card patterns applied to the package hero below.
import "../../../styles/RoomList.css";

const STEPS = ["Package Details", "Pax Info"];

// Mode of payment options — rendered in the right sidebar on the Pax Info
// step (moved from the Hotels step). Stored on bookingData.programme.modeOfPayment.
const PAYMENT_MODES = [
  { value: "CREDIT", label: "Credit Limit" },
  { value: "CARD", label: "Card" },
];

const PackageBooking = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // The URL now carries only /{id} (no query params — per spec). Search-page
  // context (agent, destination, pax, rate, nationality, employee, category…)
  // is handed off via a localStorage draft keyed by packageId, written by
  // PackageSearch just before window.open. The draft is intentionally NOT
  // deleted on read — it must survive a page reload so downstream fetches
  // like /api/v1/package-booking/hotel-details, which require agentId +
  // packageCategoryid + destinationCountryId, keep working after F5. Each
  // "Book Now" on the search page overwrites the draft for that packageId,
  // so a fresh search always beats stale context; the only edge is a
  // direct-URL visit long after the last search, which then re-seeds from
  // the last-known context instead of raw defaults. location.state still
  // wins when set (in-tab navigate from PackageBookingDetailView amend/edit).
  const [searchContext] = useState(() => {
    if (!id) return {};
    try {
      const raw = localStorage.getItem(`packageBookingContext:${id}`);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  });
  const stateData = location.state || {};
  const agentId =
    stateData.agentId || searchContext.agentId || "";
  const destinationCountryId =
    stateData.destinationCountryId ||
    searchContext.destinationCountryId ||
    "";
  const searchRate =
    stateData.searchRate != null
      ? stateData.searchRate
      : searchContext.searchRate;
  // Nationality picked on the Package Search page. Seeds the booking's
  // native country / "Pax passport" so the operator doesn't re-enter it —
  // the Hotels, Cabs and Activities steps all send nativeCountry with
  // their rate lookups.
  const searchNationalityId =
    stateData.nationalityId ?? searchContext.nationalityId;
  const searchNationalityName =
    stateData.nationalityName ?? searchContext.nationalityName;
  // "Booking Done By Employee" picked on the Package Search page. Carried
  // through to the submit payload so it is persisted on the booking.
  const searchEmployeeId =
    stateData.employeeId ?? searchContext.employeeId;
  // Rooms & Guests selection carried over from the Package Search page.
  // Seeds the initial pax counts so the booking defaults to what was chosen
  // on the search screen; the user can still adjust them, and picking a
  // package category still overrides them (see BasicDetails.jsx).
  const searchAdultCount =
    stateData.adultCount ?? searchContext.adultCount;
  const searchChildCount =
    stateData.childCount ?? searchContext.childCount;
  const searchChildAges =
    stateData.childAges ?? searchContext.childAges;
  // Category resolved by the search page for the chosen occupancy — replaces
  // the removed Basic Details category picker. Drives the Hotels fetch and the
  // Total Price sharing multiplier.
  const searchPackageCategory =
    stateData.packageCategory ?? searchContext.packageCategory;
  const searchPackageCategoryName =
    stateData.packageCategoryName ?? searchContext.packageCategoryName;
  const { mode, bookingId } = stateData;
  const isEditMode = mode === "edit" && bookingId;

  // Amend → child-booking flow (mirrors Hotel "ADD NEW ITEM").
  // PackageBookingDetailView's Amend navigates to the search page with
  // ?parentBookingCode=GPKG-... which PackageSearch then stores in the
  // one-shot draft above so the backend can stamp "{parent}/{n}" for the
  // new booking on submit. Threaded through to PaxInformation.
  const parentBookingCode = searchContext.parentBookingCode || null;

  const [currentStep, setCurrentStep] = useState(1);
  const [packageData, setPackageData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  // Set when the page is opened in amendment mode so the submit step
  // chooses PUT over POST.
  const [editingBookingId, setEditingBookingId] = useState(
    isEditMode ? bookingId : null
  );

  // The trip's date is the arrival picked on the search page. Today is only the
  // fallback: no searched date, or a stored search whose date has passed. An
  // amend loads its saved date over this.
  const todayIso = new Date().toISOString().split("T")[0];
  const searchedArrival = toIsoDate(searchContext.arrivalDateTime);
  const initialTravelDate =
    searchedArrival && searchedArrival >= todayIso ? searchedArrival : todayIso;

  // stateData.bookingData is only set when coming back from Package Checkout,
  // so the selected hotel and meal plan are still there.
  const [bookingData, setBookingData] = useState(stateData.bookingData || {
    searchParams: {
      packageId: id,
      travelDate: initialTravelDate,
      adultCount: Number(searchAdultCount) > 0 ? Number(searchAdultCount) : 1,
      childCount: Number(searchChildCount) >= 0 ? Number(searchChildCount) : 0,
      infantCount: 0,
      childAge: searchChildAges || "",
      infantAge: "",
      packageCategory: searchPackageCategory || "",
      packageCategoryName: searchPackageCategoryName || "",
      // Seeded from the search page's Nationality filter when present; the
      // Pax Information step can still change it.
      paxPassport: searchNationalityId
        ? {
            value: Number(searchNationalityId),
            label: searchNationalityName || "",
          }
        : null,
      nativeCountry: searchNationalityId || "",
      agentId: agentId || "",
      employeeId: searchEmployeeId || "",
      destinationCountryId: destinationCountryId || "",
    },
    selections: {
      selectedHotels: [],
      selectedCab: null,
      selectedActivity: null,
      hotelPrice: 0,
      cabPrice: 0,
      activityPrice: 0,
      // Meal plan picked on the Hotels tab (BB/HB/FB/AI), sourced from the
      // selected hotel's mealPlans list — same category+occupancy rates
      // configured in PackageRates.jsx's Meal Plan Rates block. mealPlanPrice
      // is the pax-scaled, markup-applied total for the chosen plan; it's
      // added on top of hotelPrice in the Total Price sidebar below.
      selectedMealPlan: null,
      mealPlanPrice: 0,
    },
    // Contact card was removed — the first traveller is the primary contact
    // and their email + mobile are captured directly on the traveller row.
    paxInfo: {
      travellers: [],
    },
    // Programme inputs captured on the Hotels tab (per the static
    // mock-up). Lifted to the parent so they survive tab navigation and
    // flow into the submit payload via PaxInformation.
    programme: {
      checkInDate: "",
      // Legacy combined flight text — only ever populated when amending a
      // booking made before the arrival / departure split. New bookings fill
      // the two legs below and the backend derives this one.
      flightDetails: "",
      // Both mandatory on the Package Checkout page's "Travel details"
      // section (see PaxInformation.validatePaxData).
      arrivalFlightDetails: "",
      departureFlightDetails: "",
      // Optional free-text notes captured under the Pax Info step's "Others"
      // heading. Sent on the /book POST as `initialNote`; backend persists it
      // as a package_booking_related_notes row so it lands in the detail
      // view's Notes panel. Only used on create — amend/PUT skips the field.
      notes: "",
      modeOfPayment: "",
      // "Book & Voucher" (Book and Pay Now) | "Book Now & Voucher later"
      // (Hold Room and Pay Later). Empty = no choice yet (required on confirm).
      bookingConfirmation: "",
      termsAccepted: false,
    },
  });

  // The package's real price for the searched occupancy
  // (perAdultRate * adults + perChildRate * children + agent markup), reported
  // by HotelsTab as soon as /hotel-details returns. Held here rather than
  // inside the tab because the Total Price sidebar needs it before the
  // operator has picked anything.
  const [resolvedPackageRate, setResolvedPackageRate] = useState(0);
  // Amending a booking that holds a supplier hotel: the package amount already
  // charged on it, so the amend doesn't reprice it at today's rate. Stays 0 for
  // every other booking, which keep using resolvedPackageRate.
  const [chargedPackageRate, setChargedPackageRate] = useState(0);
  const packageRateForTotal =
    chargedPackageRate > 0 ? chargedPackageRate : resolvedPackageRate;

  // Total Price — derived, not state, so there is exactly one place the
  // number comes from. computePackageTotal() owns the maths: the picked
  // hotel's pax-scaled rate REPLACES the package's "from" rate (both are the
  // same PackageRates money — see packageTotal.js), then meal plan, cab and
  // activity stack on top. The same helper runs on PackageCheckout, so the
  // sidebar here, the sidebar there and the /book payload always agree.
  const priceBreakdown = computePackageTotal(
    bookingData.selections,
    // resolvedPackageRate is the pax-scaled package price reported by the
    // Hotels step the moment /hotel-details returns; searchRate (the card's
    // per-adult "from" figure) only stands in for the split second before
    // that. See resolvePackageBaseRate for why the order matters.
    resolvePackageBaseRate(searchRate, packageData, packageRateForTotal),
  );
  const totalPrice = priceBreakdown.total;

  useEffect(() => {
    const fetchPackageDetails = async () => {
      try {
        setIsLoading(true);
        const response = await axiosInstance.get(`/api/packageRates/${id}`);
        setPackageData(response.data);
      } catch (error) {
        console.error("Error fetching package details:", error);
      } finally {
        setIsLoading(false);
      }
    };
    if (id) fetchPackageDetails();
  }, [id]);

  // Abandoned-package-search snapshot. Posts once as soon as the page has
  // an id and a searchContext (agent, dates, pax, rate, destination) so
  // an accidentally-closed tab still leaves a row behind for the
  // AbandonedPackageSuggestionScheduler to email. Same fire-and-forget
  // contract HotelBookingPage.jsx uses; helper handles agent-only gating
  // and dedupes on the packageBookingContext:{id} historyContextKey.
  // Skipped in edit mode so amending an existing booking never
  // resurrects it in the "abandoned" queue.
  useEffect(() => {
    if (!id || isEditMode) return;
    savePackageSearchHistorySnapshot(id, {
      agentId: Number(agentId) || null,
      agentName: null,
      packageName: searchContext.packageName || null,
      packageType: searchContext.packageType || null,
      countryId: Number(destinationCountryId) || null,
      countryName: searchContext.destinationCountryName || null,
      cityId: Number(searchContext.destinationCityId) || null,
      cityName:
        searchContext.destinationCityName ||
        searchContext.destinationLabel ||
        null,
      nationalityId: Number(searchNationalityId) || null,
      nationality: searchNationalityName || null,
      arrivalDateTime: searchContext.arrivalDateTime || null,
      departureDateTime: searchContext.departureDateTime || null,
      noOfNights: searchContext.noOfNights || null,
      adultCount: Number(searchAdultCount) || null,
      childCount: Number(searchChildCount) || null,
      sellingPrice:
        searchRate != null && !Number.isNaN(Number(searchRate))
          ? Number(searchRate)
          : null,
      currency: searchContext.searchCurrency || "AED",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Full package view — supplies the cancellation policy + Terms & Conditions
  // shown in the "Cancellation Policies & Terms & Conditions" popup opened from
  // the Total Price card. Same endpoint the Package Details step uses.
  const [packageView, setPackageView] = useState(null);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  // Package Preview modal + its Send-to-Customer follow-on. Preview is
  // read-only and builds its content from data already on the page
  // (bookingData, priceBreakdown, packageData/packageView) so it never
  // mutates booking state, pricing, validation or the submit payload. Send
  // POSTs the rich-HTML overview to /api/v1/package-booking/send-overview
  // (a new, isolated controller — no existing email service is touched).
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendForm, setSendForm] = useState({ email: "" });
  // Prevents a second click while the send POST is in flight — the button
  // stays disabled and the label switches to "Sending…" until the backend
  // responds.
  const [isSending, setIsSending] = useState(false);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    axiosInstance
      .get(`/api/TravelPackage/view/${id}`)
      .then((res) => {
        if (!cancelled) setPackageView(res.data || null);
      })
      .catch(() => {
        if (!cancelled) setPackageView(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Default the Mode of payment based on the agent's available credit:
  //  • has credit limit available → "Agent credit limit" (CREDIT)
  //  • no credit available (0 / unavailable) → "Card payment" (CARD)
  // Only seeds the default when nothing is chosen yet, so it never overrides a
  // user's manual pick. Skipped in edit mode (the saved value is loaded).
  useEffect(() => {
    if (isEditMode || !agentId) return;
    let cancelled = false;
    const applyDefault = (mode) => {
      if (cancelled) return;
      setBookingData((prev) =>
        prev.programme.modeOfPayment
          ? prev
          : { ...prev, programme: { ...prev.programme, modeOfPayment: mode } },
      );
    };
    axiosInstance
      .get(`/api/agent-credit-limit/agent/${agentId}`)
      .then((res) => {
        const avail =
          res?.data?.effectiveAvailableCreditLimit ??
          res?.data?.availableCreditLimit ??
          null;
        const hasCredit = avail != null && Number(avail) > 0;
        applyDefault(hasCredit ? "CREDIT" : "CARD");
      })
      .catch(() => {
        // Credit info unavailable → treat as no credit limit → card payment.
        applyDefault("CARD");
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, isEditMode]);

  // Edit mode — fetch the existing booking and hydrate state so the user
  // can amend any tab and submit via PUT. Runs once on mount.
  useEffect(() => {
    if (!isEditMode || !bookingId) return;
    const loadExistingBooking = async () => {
      try {
        const res = await axiosInstance.get(
          `/api/v1/package-booking/booking/${bookingId}`
        );
        const b = res.data;
        if (!b) return;
        setChargedPackageRate(savedPackageRate(b));

        // Map back into the shape the tabs expect. Names / shapes mirror
        // what is sent in handleSubmitBooking() so a round-trip works.
        setBookingData((prev) => ({
          ...prev,
          // Preserve the saved Tourism Dirham so the amend flow doesn't
          // silently drop it (or, if the FE were to resend the stored total
          // that already includes it, get it double-added on save).
          tourismDirham: b.tourismDirham != null ? b.tourismDirham : null,
          searchParams: {
            ...prev.searchParams,
            packageId: b.packageId || prev.searchParams.packageId,
            travelDate: b.travelDate || prev.searchParams.travelDate,
            packageCategory: b.packageCategory || "",
            nativeCountry: b.nativeCountry || "",
            agentId: b.agentId || prev.searchParams.agentId,
            destinationCountryId:
              b.destinationCountryId || prev.searchParams.destinationCountryId,
            destinationCityId: b.destinationCityId || "",
            adultCount: b.counts?.adultCount ?? 1,
            childCount: b.counts?.childCount ?? 0,
            infantCount: b.counts?.infantCount ?? 0,
            childAge: b.counts?.childAge || "",
            infantAge: b.counts?.infantAge || "",
          },
          selections: {
            ...prev.selections,
            selectedHotels: (b.selections?.hotels || []).map((h) => ({
              hotelId: h.hotelId,
              hotelName: h.hotelName,
              totalRateWithMarkup: h.selectedRate,
              currencyCode: h.currency,
              ...savedSupplierFields(h),
            })),
            hotelPrice: (b.selections?.hotels || []).reduce(
              (sum, h) => sum + Number(h.selectedRate || 0),
              0
            ),
            cabPrice: Number(b.selections?.cab?.selectedRate || 0),
            activityPrice: Number(b.selections?.activity?.selectedRate || 0),
          },
          paxInfo: {
            travellers: (() => {
              const rows = b.travellers || [];
              // Which row was flagged Lead when the booking was saved. Rows
              // from before the Lead radio existed carry no flag — fall back
              // to the first traveller, which is what that flow always used
              // as the contact.
              const savedLead = rows.findIndex((t) => t.isLead);
              const leadIdx = savedLead > -1 ? savedLead : 0;
              return rows.map((t, i) => ({
                type: t.type || (i === 0 ? "Adult" : "Adult"),
                id: `${(t.type || "adult").toLowerCase()}-${i}-${Date.now()}`,
                title: t.title || "Mr",
                firstName: t.firstName || "",
                middleName: t.middleName || "",
                lastName: t.lastName || "",
                isLead: i === leadIdx,
                // Email + mobile aren't on the per-traveller payload — pull
                // them from the booking-level contactInfo onto the Lead row,
                // since that traveller is the booking's contact.
                email: i === leadIdx ? b.contactInfo?.email || "" : "",
                mobile: i === leadIdx ? b.contactInfo?.mobile || "" : "",
              }));
            })(),
          },
          programme: {
            checkInDate: b.checkInDate || "",
            flightDetails: b.flightDetails || "",
            // Bookings created before the split return null for both legs;
            // the operator has to fill them in to save the amendment, which
            // is the intended migration path for old bookings.
            arrivalFlightDetails: b.arrivalFlightDetails || "",
            departureFlightDetails: b.departureFlightDetails || "",
            modeOfPayment: b.modeOfPayment || "",
            bookingConfirmation: b.bookingConfirmation || "",
            termsAccepted: !!b.termsAccepted,
          },
        }));
      } catch (err) {
        console.error("Edit-mode load failed:", err);
        toast.error("Failed to load booking for amendment");
      }
    };
    loadExistingBooking();
  }, [isEditMode, bookingId]);

  const updateSelections = (selections) =>
    setBookingData((prev) => ({ ...prev, selections: { ...prev.selections, ...selections } }));

  const updateProgramme = (programme) =>
    setBookingData((prev) => ({ ...prev, programme: { ...prev.programme, ...programme } }));

  const handleFinish = async () => {
    try {
      toast.loading("Processing booking...");
      setTimeout(() => {
        toast.dismiss();
        toast.success("Booking confirmed successfully!");
        navigate("/booking-details/package-booking-list");
      }, 1500);
    } catch {
      toast.error("Failed to confirm booking");
    }
  };

  // ── Hero card derivations ─────────────────────────────────────────────
  // Feeds the Room-List-style Booking Summary card at the top of the page.
  // Every field falls back to a dash so the summary always renders even when
  // the search page didn't forward a value.
  const packageNights = (() => {
    const raw =
      packageView?.noOfNights ??
      packageData?.noOfNights ??
      packageData?.duration ??
      packageView?.duration;
    const n = parseInt(String(raw || "").trim(), 10);
    return Number.isNaN(n) ? 0 : n;
  })();
  // Human-readable dd MMM yyyy so the summary matches how /room-list formats
  // its Check-in / Check-out rows (a plain string, not the ISO used on the
  // payload).
  const formatDateForDisplay = (isoOrEmpty) => {
    if (!isoOrEmpty) return "";
    const d = new Date(isoOrEmpty);
    if (Number.isNaN(d.getTime())) return String(isoOrEmpty);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };
  const heroCheckIn = bookingData?.searchParams?.travelDate || "";
  const heroCheckOut = (() => {
    if (!heroCheckIn || !packageNights) return "";
    const d = new Date(heroCheckIn);
    if (Number.isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + packageNights);
    return d.toISOString().split("T")[0];
  })();
  const heroAdults = Number(bookingData?.searchParams?.adultCount) || 0;
  const heroChildren = Number(bookingData?.searchParams?.childCount) || 0;
  const heroGuestSummary = [
    heroAdults ? `${heroAdults} adult${heroAdults === 1 ? "" : "s"}` : "",
    heroChildren
      ? `${heroChildren} child${heroChildren === 1 ? "" : "ren"}`
      : "",
  ]
    .filter(Boolean)
    .join(", ") || "—";
  // heroRoomCount was consumed only by the Rooms row in the Booking Summary,
  // which was removed per product spec — derivation dropped along with it.
  const heroNationality =
    searchContext.nationalityName ||
    bookingData?.searchParams?.nationalityName ||
    "—";
  const heroPackageType =
    packageView?.packageTypeName || packageData?.packageType || "";
  const heroPackageCategory =
    bookingData?.searchParams?.packageCategoryName ||
    searchContext.packageCategoryName ||
    "";
  const heroDestination =
    packageView?.arriveCountryName ||
    (Array.isArray(packageView?.arrivePlaces) && packageView.arrivePlaces.length
      ? packageView.arrivePlaces.map((p) => p.name).filter(Boolean).join(", ")
      : "");

  // Cancellation policy + Includes + Excludes + Terms & Conditions for the
  // popup. Includes / Excludes moved here from HotelsTab per product spec;
  // the underlying packageView.inclusions / packageView.exclusions arrays
  // are unchanged — only the display location moved.
  const termsList = Array.isArray(packageView?.termsAndConditions)
    ? packageView.termsAndConditions
    : [];
  const inclusions = Array.isArray(packageView?.inclusions)
    ? packageView.inclusions
    : [];
  const exclusions = Array.isArray(packageView?.exclusions)
    ? packageView.exclusions
    : [];
  const cancellationParts = (() => {
    // Preferred source — the per-tier ladder captured by the admin
    // package form (PackageReg.jsx writes packageCancellationPolicyDTOList,
    // now exposed on the view DTO as packageView.cancellationPolicies).
    // Each tier renders as "Within N night(s) of travel: X% / AED Y".
    const tiers = Array.isArray(packageView?.cancellationPolicies)
      ? packageView.cancellationPolicies.filter(Boolean)
      : [];
    if (tiers.length > 0) {
      return tiers.map((t) => {
        const n = Number(t.noOfNights);
        const feeRaw = t.cancellationFee;
        const isPercent =
          (t.cancellationFeeType || "").toLowerCase() === "percent";
        const feeText =
          feeRaw != null && String(feeRaw).trim() !== ""
            ? isPercent
              ? `${feeRaw}%`
              : `AED ${feeRaw}`
            : "";
        const nightsText = Number.isFinite(n)
          ? `Within ${n} night${n === 1 ? "" : "s"} of travel`
          : "Cancellation charge";
        return {
          tone: "warn",
          text: feeText
            ? `${nightsText}: ${feeText} cancellation charge applies.`
            : `${nightsText}: cancellation charge applies.`,
        };
      });
    }
    // Legacy fallback — older packages that still populated the four
    // scalar fields on TravelPackage (cancellationDaysFree /
    // cancellationDaysWithCharge / cancellationChargeType /
    // cancellationChargeValue). Kept so those bookings continue to show
    // their real policy instead of the supplier-confirmation placeholder.
    const free = packageView?.cancellationDaysFree;
    const withCharge = packageView?.cancellationDaysWithCharge;
    const type = packageView?.cancellationChargeType;
    const value = packageView?.cancellationChargeValue;
    if (free == null && withCharge == null && !value) {
      return [
        {
          tone: "muted",
          text: "Cancellation policy will be confirmed by the supplier.",
        },
      ];
    }
    const parts = [];
    if (free != null) {
      parts.push({
        tone: "ok",
        text: `Free cancellation up to ${free} day${free === 1 ? "" : "s"} before travel.`,
      });
    }
    if (withCharge != null) {
      let chargeText = "";
      if (value) {
        chargeText =
          type && type.toLowerCase() === "percent" ? `${value}%` : value;
      }
      parts.push({
        tone: "warn",
        text: `Within ${withCharge} day${withCharge === 1 ? "" : "s"} of travel${
          chargeText
            ? `, ${chargeText} cancellation charge applies`
            : ", cancellation charge applies"
        }.`,
      });
    }
    return parts;
  })();

  // ── Package Overview (Preview + Send to Customer) ────────────────────
  // Purely derived from data already rendered on the page so this block
  // never introduces its own source of truth. `overviewSections` /
  // `overviewItinerary` / `overviewIncludes` / `overviewExcludes` feed the
  // Preview modal; `overviewHtml` is what the Send-to-Customer POST ships
  // to /api/v1/package-booking/send-overview as the email body. A hotel
  // selection is the gate that enables the sidebar action — matches "after
  // selecting the Hotel and optional Meals".
  const hasHotelSelected =
    Array.isArray(bookingData.selections?.selectedHotels) &&
    bookingData.selections.selectedHotels.length > 0;
  const overviewPackageName =
    packageData?.packageName || packageView?.packageName || "Package";
  // Same URL-resolution HotelsTab and PackageSearch use — turns saved
  // relative / Windows paths into absolute /api/files/{name} URLs so images
  // render both inside the modal and inside the customer's mail client.
  const resolveImageUrl = (imagePath) => {
    if (!imagePath) return "";
    if (imagePath.startsWith("http")) return imagePath;
    const base = process.env.REACT_APP_API_BASE_URL || "";
    const filename = imagePath.includes("\\")
      ? imagePath.split("\\").pop()
      : imagePath.split("/").pop();
    return filename
      ? `${base}/api/files/${filename}`
      : `${base}/api/files/${imagePath}`;
  };
  // Hero image for the package — packageView / packageData may expose the
  // banner under a few different keys; falls back to the first itinerary day
  // that has an image so a package without a dedicated banner still opens
  // with a photograph. Empty string when nothing is uploaded.
  const overviewBannerUrl = (() => {
    const raw =
      packageView?.packageImage ||
      packageData?.packageImage ||
      packageView?.image ||
      packageData?.image ||
      (Array.isArray(packageView?.itineraries)
        ? packageView.itineraries.find((it) => it?.packageItinearyImage)
            ?.packageItinearyImage
        : "");
    return resolveImageUrl(raw);
  })();
  const overviewHotelLines = (bookingData.selections?.selectedHotels || [])
    .map((h) => {
      const name = h.hotelName || `Hotel #${h.hotelId || ""}`;
      const rate = Number(h.totalRateWithMarkup || 0);
      return rate > 0
        ? `${name} — AED ${formatPackageAmount(rate)}`
        : name;
    });
  const overviewMealPlanLabel =
    bookingData.selections?.selectedMealPlan?.label || "";
  const overviewItinerary = Array.isArray(packageView?.itineraries)
    ? packageView.itineraries.map((it) => ({
        day: it.day,
        heading: it.heading || "",
        placeName: it.placeName || "",
        dayActivities: it.dayActivities || "",
        imageUrl: resolveImageUrl(it.packageItinearyImage),
      }))
    : [];
  const overviewIncludes = inclusions.map((x) => x.description).filter(Boolean);
  const overviewExcludes = exclusions.map((x) => x.description).filter(Boolean);
  const overviewCancellation = cancellationParts.map((p) => p.text);
  const overviewSections = [
    {
      title: "Package",
      rows: [
        ["Name", overviewPackageName],
        ["Type", heroPackageType || "—"],
        ["Category", heroPackageCategory || "—"],
        [
          "Duration",
          packageNights > 0
            ? `${packageNights} Night${packageNights === 1 ? "" : "s"} / ${
                packageNights + 1
              } Days`
            : "—",
        ],
        ["Destination", heroDestination || "—"],
      ],
    },
    {
      title: "Travel",
      rows: [
        ["Arrival date", formatDateForDisplay(heroCheckIn) || "—"],
        ["Departure date", formatDateForDisplay(heroCheckOut) || "—"],
        ["Guests", heroGuestSummary],
        ["Nationality", heroNationality],
      ],
    },
    {
      title: "Selected Hotel",
      rows:
        overviewHotelLines.length > 0
          ? overviewHotelLines.map((line) => ["•", line])
          : [["", "No hotel selected yet"]],
    },
    {
      title: "Meal Plan",
      rows: [
        [
          "Plan",
          overviewMealPlanLabel
            ? `${overviewMealPlanLabel} — AED ${formatPackageAmount(
                priceBreakdown.mealPlan,
              )}`
            : "Not selected",
        ],
      ],
    },
    {
      title: "Pricing (AED)",
      rows: [
        ...(priceBreakdown.supplierHotelSelected
          ? [
              ["Package rate", formatPackageAmount(priceBreakdown.packageRate)],
              ["Hotel", formatPackageAmount(priceBreakdown.supplierHotel)],
            ]
          : [["Accommodation", formatPackageAmount(priceBreakdown.accommodation)]]),
        ...(priceBreakdown.mealPlan > 0
          ? [["Meal plan", formatPackageAmount(priceBreakdown.mealPlan)]]
          : []),
        ...(priceBreakdown.cab > 0
          ? [["Cab", formatPackageAmount(priceBreakdown.cab)]]
          : []),
        ...(priceBreakdown.activity > 0
          ? [["Activity", formatPackageAmount(priceBreakdown.activity)]]
          : []),
        ["Total", formatPackageAmount(totalPrice)],
      ],
    },
  ];
  // Rich-HTML email body — POSTed to /api/v1/package-booking/send-overview,
  // which relays it via JavaMailSender to the customer's inbox. Kept
  // self-contained with inline styles so it renders correctly in every
  // mail client without a linked stylesheet.
  const escapeHtml = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const overviewHtml = (() => {
    const parts = [];
    parts.push(
      `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:640px">`,
    );
    parts.push(
      `<h2 style="margin:0 0 8px;font-size:20px;color:#EC0B43">${escapeHtml(
        overviewPackageName,
      )}</h2>`,
    );
    if (heroDestination) {
      parts.push(
        `<div style="color:#475569;font-size:13px;margin-bottom:12px">${escapeHtml(
          heroDestination,
        )}</div>`,
      );
    }
    if (overviewBannerUrl) {
      parts.push(
        `<img src="${escapeHtml(
          overviewBannerUrl,
        )}" alt="${escapeHtml(overviewPackageName)}" style="width:100%;max-width:640px;border-radius:8px;margin-bottom:14px" />`,
      );
    }
    overviewSections.forEach((s) => {
      parts.push(
        `<h3 style="margin:14px 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#64748b">${escapeHtml(
          s.title,
        )}</h3>`,
      );
      parts.push(
        `<table style="width:100%;border-collapse:collapse;font-size:14px">`,
      );
      s.rows.forEach(([k, v]) => {
        parts.push(
          `<tr><td style="padding:3px 0;color:#64748b;width:40%">${escapeHtml(
            k,
          )}</td><td style="padding:3px 0;color:#0f172a;font-weight:600">${escapeHtml(
            v,
          )}</td></tr>`,
        );
      });
      parts.push(`</table>`);
    });
    if (overviewItinerary.length) {
      parts.push(
        `<h3 style="margin:16px 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#64748b">Day-wise Itinerary</h3>`,
      );
      overviewItinerary.forEach((d) => {
        parts.push(
          `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:10px">`,
        );
        parts.push(
          `<div style="font-weight:700;color:#0f172a;margin-bottom:4px">Day ${escapeHtml(
            String(d.day).padStart(2, "0"),
          )}${d.heading ? ` – ${escapeHtml(d.heading)}` : ""}</div>`,
        );
        if (d.placeName) {
          parts.push(
            `<div style="color:#EC0B43;font-size:12px;margin-bottom:6px">${escapeHtml(
              d.placeName,
            )}</div>`,
          );
        }
        if (d.imageUrl) {
          parts.push(
            `<img src="${escapeHtml(
              d.imageUrl,
            )}" alt="Day ${escapeHtml(String(d.day))}" style="width:100%;max-width:600px;border-radius:6px;margin:4px 0 8px" />`,
          );
        }
        if (d.dayActivities) {
          parts.push(
            `<div style="white-space:pre-line;color:#334155;font-size:13px">${escapeHtml(
              d.dayActivities,
            )}</div>`,
          );
        }
        parts.push(`</div>`);
      });
    }
    if (overviewIncludes.length) {
      parts.push(
        `<h3 style="margin:16px 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#64748b">Includes</h3>`,
      );
      parts.push(`<ul style="margin:0;padding-left:18px;color:#334155">`);
      overviewIncludes.forEach((x) =>
        parts.push(`<li style="margin-bottom:3px">${escapeHtml(x)}</li>`),
      );
      parts.push(`</ul>`);
    }
    if (overviewExcludes.length) {
      parts.push(
        `<h3 style="margin:16px 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#64748b">Excludes</h3>`,
      );
      parts.push(`<ul style="margin:0;padding-left:18px;color:#334155">`);
      overviewExcludes.forEach((x) =>
        parts.push(`<li style="margin-bottom:3px">${escapeHtml(x)}</li>`),
      );
      parts.push(`</ul>`);
    }
    if (overviewCancellation.length) {
      parts.push(
        `<h3 style="margin:16px 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#64748b">Cancellation Policy</h3>`,
      );
      parts.push(
        `<div style="border-left:3px solid #EC0B43;background:#fff5f7;padding:8px 12px;border-radius:0 6px 6px 0;color:#7f1d2e;font-size:13px">`,
      );
      overviewCancellation.forEach((x) =>
        parts.push(`<div style="margin-bottom:3px">${escapeHtml(x)}</div>`),
      );
      parts.push(`</div>`);
    }
    parts.push(
      `<p style="margin:16px 0 0;color:#94a3b8;font-size:12px;font-style:italic">This is a preview only. Booking is not yet confirmed — please review and reply to confirm.</p>`,
    );
    parts.push(`</div>`);
    return parts.join("");
  })();
  // POSTs the selected package + pricing snapshot to
  // /api/v1/package-booking/send-overview. The backend builds a transient
  // (in-memory, unsaved) PackageBooking from these fields and hands it to
  // the existing PackageBookingPdfService — the same PDF template used by
  // the checkout / booking-voucher flow — then emails the PDF as an
  // attachment. Purely additive on the backend: no existing controller,
  // service, PDF template or booking table is touched, and no booking row
  // is persisted for the preview send.
  const handleSendToCustomer = async () => {
    const email = sendForm.email.trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Please enter a valid customer email address.");
      return;
    }
    if (isSending) return;
    setIsSending(true);
    try {
      // Selected-hotel snapshot for the PDF's Accommodation table. Rate
      // reads from `totalRateWithMarkup` (what the Total Price sidebar
      // shows) so the PDF number matches what the operator was seeing.
      const pdfHotels = (bookingData.selections?.selectedHotels || [])
        .map((h) => ({
          hotelId: h?.hotelId ?? null,
          hotelName: h?.hotelName || null,
          hotelRate: Number(h?.totalRateWithMarkup) || 0,
          // Lets the PDF list the package rate as its own row. Not printed.
          ...(h?.supplier ? { supplier: h.supplier } : {}),
        }));
      const payload = {
        recipientEmail: email,
        subject: `Package Overview — ${overviewPackageName}`,
        packageId: Number(id) || null,
        packageName: overviewPackageName,
        agentId: Number(agentId) || null,
        travelDate: bookingData.searchParams?.travelDate || null,
        adultCount: Number(bookingData.searchParams?.adultCount) || 0,
        childCount: Number(bookingData.searchParams?.childCount) || 0,
        infantCount: Number(bookingData.searchParams?.infantCount) || 0,
        currency: "AED",
        totalPrice: Number(totalPrice) || 0,
        hotels: pdfHotels,
        cabName:
          bookingData.selections?.selectedCab?.cabName ||
          bookingData.selections?.selectedCab?.name ||
          null,
        cabRate: Number(bookingData.selections?.cabPrice) || 0,
        activityName:
          bookingData.selections?.selectedActivity?.activityName ||
          bookingData.selections?.selectedActivity?.name ||
          null,
        activityRate: Number(bookingData.selections?.activityPrice) || 0,
      };
      const res = await axiosInstance.post(
        "/api/v1/package-booking/send-overview",
        payload,
      );
      if (res?.data?.success) {
        toast.success("Package overview emailed to the customer.");
        setShowSendModal(false);
      } else {
        toast.error(
          res?.data?.message || "Could not send the email. Please try again.",
        );
      }
    } catch (err) {
      console.error("Send package overview failed:", err);
      const msg =
        err?.response?.data?.message ||
        "Could not send the email. Please try again.";
      toast.error(msg);
    } finally {
      setIsSending(false);
    }
  };

  // Package Checkout (step-2) opens in a NEW BROWSER TAB per product spec —
  // /new-booking/package-checkout/{id}. Payload travels through localStorage
  // (NOT sessionStorage) because a new tab spawned by window.open does not
  // reliably inherit the opener's sessionStorage but DOES share localStorage
  // on the same origin. The draft is cleared by PackageCheckout on
  // successful booking / going back. If the popup is blocked (window.open
  // returns null), fall back to same-tab navigation so the flow still works.
  const goToCheckout = () => {
    const payload = {
      bookingData,
      packageData,
      packageView,
      editingBookingId,
      parentBookingCode,
      searchRate,
      // Carried so the checkout page resolves the same base rate this page
      // did. A hotel is always selected by the time we get here (HotelsTab
      // enforces it), so the base is not normally used there — but sending it
      // keeps the two pages on identical inputs rather than relying on that.
      // With a supplier hotel the base IS used: it is added to the hotel price.
      resolvedPackageRate: packageRateForTotal,
    };
    try {
      localStorage.setItem(
        `packageCheckoutDraft:${id}`,
        JSON.stringify(payload),
      );
    } catch {
      /* quota exceeded — see fallback below */
    }
    const url = `${window.location.origin}/new-booking/package-checkout/${id}`;
    const newTab = window.open(url, "_blank");
    if (!newTab) {
      // Popup blocked → same-tab navigation as a fallback so the user
      // isn't stranded. Same URL, same localStorage payload.
      navigate(`/new-booking/package-checkout/${id}`, { state: payload });
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <HotelsTab
                        searchParams={bookingData.searchParams}
                        searchCityId={searchContext.destinationCityId}
                        // Bookings don't save a room count, and the stored search
                        // may be for another booking, so an amend searches 1 room.
                        searchRoomCount={isEditMode ? null : searchContext.noOfRooms}
                        packageRateFixed={chargedPackageRate > 0}
                        bookingData={bookingData.selections}
                        programme={bookingData.programme}
                        updateData={updateSelections}
                        updateProgramme={updateProgramme}
                        packageRate={priceBreakdown.accommodation}
                        onPackageRateResolved={setResolvedPackageRate}
                        onPrev={() => navigate("/new-booking/package-search")}
                        onNext={goToCheckout} />;
      // case 2 was PaxInformation — moved to a dedicated route
      // (/new-booking/package-checkout/{id}, see PackageCheckout.jsx). Kept
      // as a defensive fallback here so a stale link that still points at
      // currentStep === 2 doesn't render nothing; the useEffect below
      // never sets currentStep to 2 anymore.
      case 2: return <PaxInformation
                        searchParams={bookingData.searchParams}
                        bookingData={bookingData}
                        updateData={setBookingData}
                        onFinish={handleFinish}
                        packageData={packageData}
                        totalPrice={totalPrice}
                        priceBreakdown={priceBreakdown}
                        editingBookingId={editingBookingId}
                        parentBookingCode={parentBookingCode}
                      />;
      default: return null;
    }
  };

  if (isLoading) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <TopBar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="flex-grow-1 d-flex justify-content-center align-items-center">
            <Spinner animation="border" variant="primary" />
          </main>
        </div>
      </div>
    );
  }

  return (
    // Outer shell aligned to /hotel-booking-page: both `hotel-booking-container`
    // AND `room-list-container` classes are applied to the same element so
    // both stylesheets' page-shell variables resolve — HotelBookingPage.css
    // takes precedence for the ones both define, while the sticky-sidebar
    // behaviour that depended on the room-list wrapper still works. The
    // `--rl-*` CSS variables in RoomList.css still power the sidebar cards.
    <div className="min-vh-100 bg-light d-flex flex-column hotel-booking-container room-list-container">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main
          className="content-wrapper flex-grow-1 booking-stepper-container"
          /* overflowX must be `clip`, not `hidden`. `hidden` promotes the
             other axis to `auto` and makes <main> a scroll container, which
             breaks `position: sticky` on the Total Price sidebar (the sticky
             element ends up anchored to <main> instead of the real page
             scroll). `clip` prevents horizontal overflow the same way without
             establishing a scroll container. */
          style={{ minWidth: 0, overflowX: "clip" }}
        >
          <div className="container-fluid" style={{ paddingTop: "10px" }}>
            {/* Page heading — mirrors /room-list's "Accommodation" heading. */}
            <div className="hs-page-heading">
              <h3 className="hs-page-heading-title">
                {editingBookingId ? "Amend Package Booking" : "Package Booking"}
              </h3>
            </div>

            {/* Top toolbar: Back to Search pill + Available Balance,
                matching /room-list's toolbar row. */}
            <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
              <Button
                variant="outline-primary"
                size="sm"
                onClick={() => navigate("/new-booking/package-search")}
                className="back-to-search-btn"
              >
                ← Back to Search
              </Button>
              <AgentBalanceDisplay agentId={agentId} />
            </div>

            {/* ── Package Hero card ──
                Two-column layout — package identification on the left
                (md=8), Booking Summary on the right (md=4). Per operator
                feedback the Booking Summary belongs INSIDE this card, not
                as a standalone tile in the sidebar (which is why the
                sidebar Booking Summary block below was removed). */}
            <Card className="hotel-header-card mb-4">
              <Card.Body className="p-4">
                <Row>
                  <Col md={8}>
                    <div className="d-flex align-items-start gap-3">
                      <div className="hotel-icon">
                        <FaSuitcase size={40} className="text-primary" />
                      </div>
                      <div className="hotel-info">
                        <h2 className="hotel-name mb-2">
                          {packageData?.packageName ||
                            packageView?.packageName ||
                            "Package"}
                        </h2>
                        <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
                          {heroPackageType && (
                            <Badge bg="primary">{heroPackageType}</Badge>
                          )}
                          {heroPackageCategory && (
                            <Badge bg="info">{heroPackageCategory}</Badge>
                          )}
                          {packageNights > 0 && (
                            <span
                              className="d-inline-flex align-items-center gap-1 fw-semibold"
                              style={{ color: "#475569", fontSize: "0.9rem" }}
                            >
                              <FaClock className="text-primary" />
                              {packageNights} Night
                              {packageNights === 1 ? "" : "s"} /{" "}
                              {packageNights + 1} Days
                            </span>
                          )}
                        </div>
                        <div className="hotel-details">
                          {heroDestination && (
                            <p className="mb-1">
                              <FaMapMarkerAlt className="text-muted me-2" />
                              {heroDestination}
                            </p>
                          )}
                          <div className="mt-2">
                            <small className="text-muted">
                              <strong>Please note:</strong>{" "}
                              <span className="someproperties">
                                Review the full itinerary, inclusions and
                                cancellation policy below before completing
                                the booking. Rates are per person and exclude
                                flights, visas and personal expenses unless
                                explicitly listed under Inclusions.
                              </span>
                            </small>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Col>
                  <Col md={4}>
                    {/* Booking Summary — nested inside the hero per operator
                        feedback. Same rows / data / labels the standalone
                        sidebar card had (now removed to avoid duplication). */}
                    <Card className="booking-summary">
                      <Card.Body className="p-4">
                        <h6 className="mb-3">Booking Summary</h6>
                        <div className="booking-details">
                          <div className="d-flex justify-content-between mb-2">
                            <span>
                              <FaCalendarAlt className="text-muted me-2" />
                              Arrival date:
                            </span>
                            <span className="fw-semibold">
                              {formatDateForDisplay(heroCheckIn) || "—"}
                            </span>
                          </div>
                          <div className="d-flex justify-content-between mb-2">
                            <span>
                              <FaCalendarAlt className="text-muted me-2" />
                              Departure date:
                            </span>
                            <span className="fw-semibold">
                              {formatDateForDisplay(heroCheckOut) || "—"}
                            </span>
                          </div>
                          <div className="d-flex justify-content-between mb-2">
                            <span>
                              <FaUsers className="text-muted me-2" />
                              Guests:
                            </span>
                            <span className="fw-semibold">
                              {heroGuestSummary}
                            </span>
                          </div>
                          <div className="d-flex justify-content-between">
                            <span>
                              <FaGlobe className="text-muted me-2" />
                              Nationality:
                            </span>
                            <span className="fw-semibold">
                              {heroNationality}
                            </span>
                          </div>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              </Card.Body>
            </Card>

          {/* Grid ratio mirrors /hotel-booking-page (Col lg=8 left, lg=4
              right) so the two booking flows read as one system. The
              hbp-left-col / hbp-right-col class hooks let HotelBookingPage.css
              rules (sticky sidebar, gutter tuning, responsive stacking) apply
              here too. Kept the .main-booking-card / .tab-content-area
              wrapping so step-2 (PaxInformation) — which the user asked me
              NOT to change — continues to render inside the same shell. */}
          <Row className="g-3">
            {/* ── Main card ── */}
            <Col lg={8} className="hbp-left-col">
              <div className="main-booking-card">
                {/* Tab content */}
                <div className="tab-content-area">
                  {renderStep()}
                </div>
              </div>
            </Col>

            {/* ── Price sidebar ── */}
            <Col lg={4} className="hbp-right-col">
              {/* The sidebar block is sticky-pinned near the top of the
                  viewport (see .sidebar-stack in PackageBooking_Stepper.css)
                  so the Total Price stays visible while the operator scrolls
                  through the main content. It unpins naturally when its
                  column ends. */}
              {/* ── Displayed total == submitted total ──
                  The number rendered here is `totalPrice`, the exact figure
                  carried into /new-booking/package-checkout/{id} and posted on
                  the /book payload. It used to be a second, hand-rolled "add
                  everything up" sum that also added the package's base rate on
                  top of the selected hotel — but both come from the same
                  PackageRates rows (base = lowest per-adult rate, hotel = that
                  same rate pax-scaled), so that double-charged the package.
                  See packageTotal.js. */}
              <div className="sidebar-stack">
              {/* Booking Summary card was moved INTO the hero card at the top
                  of the page (right-side column, md=4) per operator feedback,
                  so the sidebar no longer duplicates it. The Total Price card
                  below is now the first sidebar item. */}

              {/* Total Price — the headline number, with the meal-plan add-on
                  called out underneath once one is picked so the operator can
                  see what stacked on top of the accommodation rate. */}
              <div className="price-sidebar-card">
                <div className="price-sidebar-label">Total Price</div>
                <div className="price-sidebar-amount">
                  {formatPackageAmount(totalPrice)}
                </div>
                <div className="price-sidebar-sub">AED</div>
                {priceBreakdown.supplierHotelSelected && (
                  <div className="price-sidebar-mealplan">
                    Package rate AED {formatPackageAmount(priceBreakdown.packageRate)}
                    {" "}+ Hotel AED {formatPackageAmount(priceBreakdown.supplierHotel)}
                  </div>
                )}
                {/* Meal plan line — only shown once one is picked on the
                    Hotels tab, so the operator can see what's stacked on
                    top of the hotel rate at a glance. */}
                {bookingData.selections.selectedMealPlan && (
                  <div className="price-sidebar-mealplan">
                    + {bookingData.selections.selectedMealPlan.label} meal plan · AED{" "}
                    {formatPackageAmount(priceBreakdown.mealPlan)}
                  </div>
                )}
              </div>

              {/* Cancellation Policies & Terms — moved out of the Total
                  Price card per product spec. Its own compact sidebar
                  card so operators can still open the policy popup from
                  the sticky sidebar without visually cluttering the
                  price/breakdown block. */}
              <div className="sidebar-policy-card">
                <button
                  type="button"
                  className="price-policy-link"
                  onClick={() => setShowPolicyModal(true)}
                >
                  <FaShieldAlt className="policy-link-icon" />
                  <span className="policy-link-text">
                    Cancellation Policies &amp; Terms &amp; Conditions
                  </span>
                </button>
              </div>

              {/* Package Overview action — shown on step 1 once a hotel is
                  picked (matches "after selecting the Hotel and optional
                  Meals"). Opens a read-only Preview modal built from data
                  already on this page; the modal's own footer offers the
                  "Send to Customer" follow-on. Doesn't touch booking state,
                  pricing, validation or the submit payload. */}
              {currentStep === 1 && hasHotelSelected && (
                <div className="sidebar-actions-card">
                  <div className="sidebar-actions-title">
                    <FaSuitcase className="me-2" />
                    Package Actions
                  </div>
                  <div className="d-grid gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline-primary"
                      onClick={() => setShowPreviewModal(true)}
                    >
                      Package Preview
                    </Button>
                  </div>
                </div>
              )}

              {/* Mode of payment card was moved OUT of the right sidebar
                  per product spec — it now lives inside the Pax Info step,
                  directly under the "Others" section (see PaxInformation.jsx).
                  bookingData.programme.modeOfPayment is still the source of
                  truth; PaxInformation reads / writes via the same
                  updateData(prev => …) channel. */}

              {/* Mandatory booking-continuation choice — mirrors the hotel
                  booking page's "Book and Pay Now / Hold Room and Pay Later"
                  option. Gated by the Confirm booking button in PaxInformation. */}
              {currentStep === 2 && (
                <div className="sidebar-pay-card">
                  <div className="sidebar-pay-title">
                    <FaCheckCircle className="me-2" />
                    Are you sure you want to continue with the booking?
                    <span className="sidebar-pay-required">required</span>
                  </div>
                  <div className="d-flex flex-column gap-2 mt-1">
                    <Form.Check
                      type="radio"
                      id="pkg-book-pay-now"
                      name="pkgBookingConfirmation"
                      label="Book Package and Pay Now"
                      value="Book & Voucher"
                      checked={
                        bookingData.programme.bookingConfirmation ===
                        "Book & Voucher"
                      }
                      onChange={(e) =>
                        updateProgramme({ bookingConfirmation: e.target.value })
                      }
                    />
                    <Form.Check
                      type="radio"
                      id="pkg-hold-pay-later"
                      name="pkgBookingConfirmation"
                      label="Hold Package and Pay Later"
                      value="Book Now & Voucher later"
                      checked={
                        bookingData.programme.bookingConfirmation ===
                        "Book Now & Voucher later"
                      }
                      onChange={(e) =>
                        updateProgramme({ bookingConfirmation: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}
              </div>

              <style>{`
                /* Matches the .booking-summary card in the hero above and the
                   .price-sidebar-card block — same --rl-* palette, same
                   border, same rhythm. */
                .sidebar-pay-card {
                  border: 1px solid var(--rl-border, #e2e8f0);
                  border-radius: 14px;
                  padding: 14px 16px;
                  background: var(--rl-card, #ffffff);
                  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
                  margin-top: 16px;
                }
                /* Cancellation Policies & Terms card — same shell as
                   .sidebar-pay-card so the sidebar cards read as one
                   consistent stack. Sits below the Total Price card,
                   above the (step 2) Mode of Payment card. */
                .sidebar-policy-card {
                  border: 1px solid var(--rl-border, #e2e8f0);
                  border-radius: 14px;
                  padding: 12px 16px;
                  background: var(--rl-card, #ffffff);
                  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
                  margin-top: 16px;
                }
                /* Package Actions card — same shell as the pay / policy
                   cards so it stacks visually with them. Only rendered on
                   step 1 after a hotel is picked. */
                .sidebar-actions-card {
                  border: 1px solid var(--rl-border, #e2e8f0);
                  border-radius: 14px;
                  padding: 14px 16px;
                  background: var(--rl-card, #ffffff);
                  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
                  margin-top: 16px;
                }
                .sidebar-actions-title {
                  display: flex;
                  align-items: center;
                  font-weight: 600;
                  font-size: 0.85rem;
                  color: #1e293b;
                  margin-bottom: 4px;
                }
                /* Overview modal — plain two-column key/value list, matches
                   the Booking Summary card typography so the reader sees a
                   familiar layout. */
                .pkg-overview-section { padding: 12px 0; border-top: 1px solid #f1f3f5; }
                .pkg-overview-section:first-child { border-top: 0; }
                .pkg-overview-label {
                  font-size: 0.72rem;
                  font-weight: 700;
                  letter-spacing: 0.07em;
                  text-transform: uppercase;
                  color: #64748b;
                  margin-bottom: 6px;
                }
                .pkg-overview-row {
                  display: flex;
                  justify-content: space-between;
                  gap: 12px;
                  font-size: 0.87rem;
                  color: #334155;
                  padding: 3px 0;
                }
                .pkg-overview-row .k { color: #64748b; }
                .pkg-overview-row .v { color: #0f172a; font-weight: 600; text-align: right; }
                .pkg-overview-row.total {
                  border-top: 1px dashed #e2e8f0;
                  margin-top: 6px;
                  padding-top: 8px;
                  font-size: 0.95rem;
                }
                .pkg-overview-row.total .v { color: #EC0B43; }
                /* Hero banner + itinerary day cards inside the Preview
                   modal. Same rounded-card language as the price sidebar
                   and the day accordion on the Hotels tab. */
                .pkg-overview-banner {
                  width: 100%;
                  max-height: 240px;
                  object-fit: cover;
                  border-radius: 10px;
                  margin: 4px 0 10px;
                  display: block;
                }
                .pkg-overview-days {
                  display: flex;
                  flex-direction: column;
                  gap: 10px;
                }
                .pkg-overview-day {
                  border: 1px solid #e2e8f0;
                  border-radius: 10px;
                  padding: 10px 12px;
                  background: #fff;
                }
                .pkg-overview-day-head {
                  display: flex;
                  align-items: center;
                  gap: 8px;
                  margin-bottom: 6px;
                }
                .pkg-overview-day-num {
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  min-width: 28px;
                  height: 24px;
                  padding: 0 8px;
                  border-radius: 999px;
                  background: #fff5f7;
                  color: #EC0B43;
                  font-weight: 700;
                  font-size: 0.75rem;
                }
                .pkg-overview-day-title {
                  font-weight: 600;
                  font-size: 0.9rem;
                  color: #0f172a;
                }
                .pkg-overview-day-image {
                  width: 100%;
                  max-height: 180px;
                  object-fit: cover;
                  border-radius: 8px;
                  margin: 4px 0 8px;
                  display: block;
                }
                .pkg-overview-day-place {
                  color: #EC0B43;
                  font-size: 0.78rem;
                  font-weight: 600;
                  margin-bottom: 4px;
                }
                .pkg-overview-cancel {
                  border-left: 3px solid #EC0B43;
                  background: #fff5f7;
                  border-radius: 0 6px 6px 0;
                  padding: 8px 12px;
                  font-size: 0.85rem;
                  color: #7f1d2e;
                }
                .sidebar-pay-title {
                  display: flex;
                  align-items: center;
                  font-weight: 600;
                  font-size: 0.85rem;
                  color: #1e293b;
                  margin-bottom: 10px;
                }
                .sidebar-pay-required {
                  margin-left: auto;
                  font-size: 0.6rem;
                  letter-spacing: 0.08em;
                  text-transform: uppercase;
                  color: #b91c1c;
                  background: #fee2e2;
                  padding: 2px 8px;
                  border-radius: 999px;
                  font-weight: 700;
                }
                .sidebar-pay-select {
                  border: 1.5px solid #e5e7eb !important;
                  border-radius: 10px !important;
                  font-size: 0.85rem !important;
                  padding: 0.55rem 0.75rem !important;
                  color: #1e293b !important;
                  background-color: #ffffff !important;
                }
                .sidebar-pay-select:focus {
                  border-color: #2563eb !important;
                  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12) !important;
                }
                /* Pure-red "Cancellation Policies & Terms" link under Total
                   Price. The outer button just centers a compact inline group
                   so the shield sits IMMEDIATELY next to the text — even when
                   the label wraps to two lines. */
                .price-policy-link {
                  display: flex;
                  align-items: flex-start;
                  justify-content: center;
                  width: 100%;
                  border: none;
                  background: transparent;
                  color: #EC0B43;
                  font-weight: 700;
                  font-size: 0.82rem;
                  line-height: 1.35;
                  cursor: pointer;
                  padding: 2px 0;
                  transition: color 0.15s ease;
                }
                .price-policy-link:hover { color: #b8092f; }
                .policy-link-icon {
                  flex-shrink: 0;
                  margin-right: 6px;
                  margin-top: 3px; /* aligns with the first line of text */
                  font-size: 0.9em;
                }
                .policy-link-text {
                  text-decoration: underline;
                  text-underline-offset: 2px;
                  text-align: center;
                }
              `}</style>
            </Col>
          </Row>
          </div>
        </main>
      </div>

      {/* ── Cancellation Policies & Terms & Conditions popup ──
          Opened from the red link under the Total Price card. Shows the same
          cancellation policy that appears at the bottom of the Package Details
          step, plus the package's Terms & Conditions. */}
      <Modal
        show={showPolicyModal}
        onHide={() => setShowPolicyModal(false)}
        centered
        size="lg"
        scrollable
      >
        {/* One accent colour (the brand red) carried by the header icon and
            the non-refundable note only. Section headings used to be four
            different colours — red / green / red / dark-with-red-icon — which
            made four peer sections read as four unrelated warnings. They are
            now identical muted labels, so the eye goes to the CONTENT. */}
        <Modal.Header closeButton className="pkg-policy-head">
          <Modal.Title className="pkg-policy-title">
            <FaShieldAlt className="pkg-policy-title-icon" />
            Cancellation Policies &amp; Terms &amp; Conditions
          </Modal.Title>
        </Modal.Header>

        <Modal.Body className="pkg-policy-body">
          <section className="pkg-policy-section">
            <div className="pkg-policy-label">
              <FaTimesCircle /> Cancellation Policy
            </div>
            <ul className="pkg-policy-list">
              {cancellationParts.map((p, i) => (
                <li key={i} style={{ whiteSpace: "pre-line" }}>
                  {p.text}
                </li>
              ))}
            </ul>
            {/* The one place emphasis is genuinely warranted — kept as a
                restrained left-rule note instead of the old red list item. */}
            <p className="pkg-policy-note">
              This is a <strong>NON-REFUNDABLE</strong> package within the
              charge window.
            </p>
          </section>

          {/* Includes / Excludes — moved here from the removed Package
              Information card on the Package Details step. Same "empty state"
              fallback so operators still see the "will be uploaded by
              supplier" hint when nothing is attached yet. */}
          <section className="pkg-policy-section">
            <div className="pkg-policy-label">
              <FaCheckCircle /> Includes
            </div>
            {inclusions.length > 0 ? (
              <ul className="pkg-policy-list">
                {inclusions.map((x) => (
                  <li key={`inc-${x.otherId}`}>{x.description}</li>
                ))}
              </ul>
            ) : (
              <p className="pkg-policy-empty">
                Includes will be uploaded by supplier.
              </p>
            )}
          </section>

          <section className="pkg-policy-section">
            <div className="pkg-policy-label">
              <FaTimesCircle /> Excludes
            </div>
            {exclusions.length > 0 ? (
              <ul className="pkg-policy-list">
                {exclusions.map((x) => (
                  <li key={`exc-${x.otherId}`}>{x.description}</li>
                ))}
              </ul>
            ) : (
              <p className="pkg-policy-empty">
                Excludes will be uploaded by supplier.
              </p>
            )}
          </section>

          <section className="pkg-policy-section">
            <div className="pkg-policy-label">
              <FaFileContract /> Terms &amp; Conditions
            </div>
            {termsList.length > 0 ? (
              <ul className="pkg-policy-list">
                {termsList.map((t) => (
                  <li key={t.otherId}>{t.description}</li>
                ))}
              </ul>
            ) : (
              <p className="pkg-policy-empty">
                No specific terms were attached to this package. By proceeding
                you confirm you have read the cancellation window and accept
                the standard package conditions.
              </p>
            )}
          </section>
        </Modal.Body>

        <Modal.Footer className="pkg-policy-foot">
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => setShowPolicyModal(false)}
          >
            Close
          </Button>
        </Modal.Footer>

        <style>{`
          /* Flat white chrome — the grey header / footer bars added two more
             tones for no information gain. A hairline rule does the same job. */
          .pkg-policy-head {
            background: #fff;
            border-bottom: 1px solid #eceef1;
            padding: 14px 20px;
          }
          .pkg-policy-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.98rem;
            font-weight: 700;
            color: #0f172a;
          }
          .pkg-policy-title-icon { color: #EC0B43; font-size: 0.95rem; }

          .pkg-policy-body { padding: 4px 20px 16px; }

          /* Sections are separated by a rule rather than a 1.5rem margin, so
             the panel reads as one document instead of four floating blocks. */
          .pkg-policy-section { padding: 14px 0; border-top: 1px solid #f1f3f5; }
          .pkg-policy-section:first-child { border-top: 0; }

          .pkg-policy-label {
            display: flex;
            align-items: center;
            gap: 7px;
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 0.07em;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 8px;
          }
          .pkg-policy-label svg { font-size: 0.8rem; color: #94a3b8; }

          .pkg-policy-list {
            margin: 0;
            padding-left: 18px;
            font-size: 0.85rem;
            line-height: 1.5;
            color: #334155;
          }
          .pkg-policy-list li { margin-bottom: 5px; }
          .pkg-policy-list li:last-child { margin-bottom: 0; }
          .pkg-policy-list li::marker { color: #cbd5e1; }

          .pkg-policy-empty {
            margin: 0;
            font-size: 0.82rem;
            font-style: italic;
            color: #94a3b8;
          }

          .pkg-policy-note {
            margin: 10px 0 0;
            padding: 7px 12px;
            border-left: 3px solid #EC0B43;
            background: #fff5f7;
            border-radius: 0 6px 6px 0;
            font-size: 0.82rem;
            color: #7f1d2e;
          }

          .pkg-policy-foot {
            background: #fff;
            border-top: 1px solid #eceef1;
            padding: 10px 20px;
          }
        `}</style>
      </Modal>

      {/* ── Package Preview modal ──
          Read-only summary of the package the operator is about to book:
          the same package/hotel/meal/date/guest/price data already shown
          around the page, gathered into one card so the operator can review
          before hitting Continue. Nothing here mutates booking state. */}
      <Modal
        show={showPreviewModal}
        onHide={() => setShowPreviewModal(false)}
        centered
        size="lg"
        scrollable
      >
        <Modal.Header closeButton className="pkg-policy-head">
          <Modal.Title className="pkg-policy-title">
            <FaSuitcase className="pkg-policy-title-icon" />
            Package Overview
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="pkg-policy-body">
          {/* Hero image — draws the eye first so the customer sees the
              destination before the details. Falls back to the first
              itinerary photo when the package has no dedicated banner. */}
          {overviewBannerUrl && (
            <img
              src={overviewBannerUrl}
              alt={overviewPackageName}
              className="pkg-overview-banner"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          )}
          {overviewSections.map((section) => (
            <section key={section.title} className="pkg-overview-section">
              <div className="pkg-overview-label">{section.title}</div>
              {section.rows.map(([k, v], i) => {
                const isTotal =
                  section.title === "Pricing (AED)" && k === "Total";
                return (
                  <div
                    key={`${section.title}-${i}`}
                    className={`pkg-overview-row${isTotal ? " total" : ""}`}
                  >
                    <span className="k">{k}</span>
                    <span className="v">{v}</span>
                  </div>
                );
              })}
            </section>
          ))}

          {/* Day-wise itinerary — each day is its own mini-card with the
              day photo, heading, place and activities. Same data the
              Hotels-tab itinerary accordion uses (packageView.itineraries),
              rendered here in a flat, print-ready layout. */}
          {overviewItinerary.length > 0 && (
            <section className="pkg-overview-section">
              <div className="pkg-overview-label">Day-wise Itinerary</div>
              <div className="pkg-overview-days">
                {overviewItinerary.map((d, i) => (
                  <div key={`ov-day-${i}`} className="pkg-overview-day">
                    <div className="pkg-overview-day-head">
                      <span className="pkg-overview-day-num">
                        {String(d.day).padStart(2, "0")}
                      </span>
                      <span className="pkg-overview-day-title">
                        Day {String(d.day).padStart(2, "0")}
                        {d.heading ? ` – ${d.heading}` : ""}
                      </span>
                    </div>
                    {d.imageUrl && (
                      <img
                        src={d.imageUrl}
                        alt={`Day ${d.day}`}
                        className="pkg-overview-day-image"
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                    )}
                    {d.placeName && (
                      <div className="pkg-overview-day-place">
                        <FaMapMarkerAlt size={11} className="me-1" />
                        {d.placeName}
                      </div>
                    )}
                    {d.dayActivities && (
                      <p
                        style={{
                          whiteSpace: "pre-line",
                          margin: 0,
                          fontSize: "0.85rem",
                          color: "#334155",
                        }}
                      >
                        {d.dayActivities}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Includes / Excludes / Cancellation — same lists the
              Cancellation & Terms popup shows, replayed here so a customer
              sees the full picture without hunting. */}
          {overviewIncludes.length > 0 && (
            <section className="pkg-overview-section">
              <div className="pkg-overview-label">
                <FaCheckCircle className="me-1 text-success" />
                Includes
              </div>
              <ul className="pkg-policy-list">
                {overviewIncludes.map((x, i) => (
                  <li key={`ov-inc-${i}`}>{x}</li>
                ))}
              </ul>
            </section>
          )}
          {overviewExcludes.length > 0 && (
            <section className="pkg-overview-section">
              <div className="pkg-overview-label">
                <FaTimesCircle className="me-1" style={{ color: "#EC0B43" }} />
                Excludes
              </div>
              <ul className="pkg-policy-list">
                {overviewExcludes.map((x, i) => (
                  <li key={`ov-exc-${i}`}>{x}</li>
                ))}
              </ul>
            </section>
          )}
          {overviewCancellation.length > 0 && (
            <section className="pkg-overview-section">
              <div className="pkg-overview-label">
                <FaShieldAlt className="me-1" />
                Cancellation Policy
              </div>
              <div className="pkg-overview-cancel">
                {overviewCancellation.map((t, i) => (
                  <div key={`ov-can-${i}`} style={{ marginBottom: 4 }}>
                    • {t}
                  </div>
                ))}
              </div>
            </section>
          )}
        </Modal.Body>
        <Modal.Footer className="pkg-policy-foot">
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => setShowPreviewModal(false)}
          >
            Close
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setShowPreviewModal(false);
              setSendForm({ email: "" });
              setShowSendModal(true);
            }}
          >
            Send to Customer
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Send to Customer modal ──
          Single input — the customer's email — because the operator has
          just reviewed the preview in the modal above. Clicking Send Email
          POSTs the rich-HTML overview to /api/v1/package-booking/
          send-overview (see PackageOverviewEmailController.java), which
          relays it through the shared JavaMailSender. Purely additive on
          the backend — no existing controller / service was modified, so
          voucher / abandoned-search / booking-confirmation flows are
          unaffected. */}
      <Modal
        show={showSendModal}
        onHide={() => setShowSendModal(false)}
        centered
        size="lg"
        scrollable
      >
        <Modal.Header closeButton className="pkg-policy-head">
          <Modal.Title className="pkg-policy-title">
            <FaSuitcase className="pkg-policy-title-icon" />
            Send Package Overview to Customer
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="pkg-policy-body">
          <Form.Group>
            <Form.Label className="booking-field-label">
              Customer email <span className="required-dot">*</span>
            </Form.Label>
            <Form.Control
              type="email"
              placeholder="e.g. customer@example.com"
              value={sendForm.email}
              disabled={isSending}
              onChange={(e) =>
                setSendForm((prev) => ({ ...prev, email: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSendToCustomer();
                }
              }}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="pkg-policy-foot">
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => setShowSendModal(false)}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={handleSendToCustomer}
            disabled={isSending}
          >
            {isSending ? "Sending…" : "Send Email"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default PackageBooking;