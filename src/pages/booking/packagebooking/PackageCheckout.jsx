import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Row, Col, Card, Modal, Button, Form, Spinner } from "react-bootstrap";
import axiosInstance from "../../../components/AxiosInstance";
import Sidebar from "../../../components/Sidebar";
import TopBar from "../../../components/TopBar";
import AgentBalanceDisplay from "../../../components/AgentBalanceDisplay";
import { toast } from "react-hot-toast";
import {
  FaCalendarAlt,
  FaUsers,
  FaGlobe,
  FaShieldAlt,
  FaTimesCircle,
  FaFileContract,
  FaCheckCircle,
  FaHotel,
  FaMapMarkerAlt,
  FaMoon,
  FaUtensils,
  FaFileInvoice,
  FaFilePdf,
  FaDownload,
} from "react-icons/fa";
import PaxInformation from "./tabs/PaxInformation";
// Abandoned-package-search follow-up email — flags the history row as
// booked when the CCAvenue-paid booking finalises so the scheduler
// stops considering it a follow-up candidate. Standard (non-paid) flow
// fires the same call from inside PaxInformation.handleSubmitBooking.
import { markPackageSearchHistoryConfirmed } from "../../../utils/packageSearchHistory";
// Total Price maths — shared with PackageBooking.jsx (step 1) so the number
// the operator agreed to there is the number shown and billed here.
import {
  computePackageTotal,
  formatPackageAmount,
  resolvePackageBaseRate,
} from "./packageTotal";
import "../../../styles/PackageBooking_Stepper.css";
import "../../../styles/RoomList.css";
// HotelBookingPage's Booking-Summary card + Price-Details card classes
// (booking-summary-card, hbp-summary-row, hbp-price-card, hbp-sticky-summary)
// live in this stylesheet — imported so the sidebar picks up the HBP treatment.
import "../../../styles/HotelBookingPage.css";

// The stash channel that survives a hard refresh on this page. PackageBooking
// writes it just before navigating here (see setCurrentStep-turned-navigate
// handler), and this page reads it if location.state was dropped by a refresh.
const SESSION_KEY = (id) => `packageCheckoutDraft:${id}`;

// Full-viewport blocking overlay shown while the backend is creating the
// paid-for booking after a successful CC Avenue redirect. Structurally
// mirrors the HotelBookingPage / LongStayBookingPage post-payment overlays
// so the "please don't close this tab" wording stays consistent. Combined
// with the beforeunload listener above, this makes it hard for the operator
// to nuke the finalize call mid-flight.
const CCAvenueFinalizingOverlay = () => (
  <div
    role="alertdialog"
    aria-modal="true"
    aria-live="assertive"
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 20000,
      background: "rgba(15, 23, 42, 0.75)",
      backdropFilter: "blur(2px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem",
    }}
  >
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "2rem 1.75rem",
        maxWidth: 440,
        width: "100%",
        textAlign: "center",
        boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
      }}
    >
      <Spinner
        animation="border"
        variant="success"
        role="status"
        style={{ width: 48, height: 48, marginBottom: 16 }}
      />
      <h5 className="fw-bold mb-2" style={{ color: "#0f172a" }}>
        Payment successful — creating your booking
      </h5>
      <p className="text-muted mb-3" style={{ fontSize: 14 }}>
        Please{" "}
        <strong>
          do not close this window, refresh the page, or press the back
          button
        </strong>{" "}
        until you see the confirmation.
      </p>
      <div
        className="small"
        style={{
          color: "#b45309",
          background: "#fef3c7",
          border: "1px solid #fde68a",
          borderRadius: 8,
          padding: "8px 12px",
        }}
      >
        This usually takes just a few seconds.
      </div>
    </div>
  </div>
);

const PackageCheckout = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // ── State hydration ─────────────────────────────────────────────────
  // Prefer location.state (fresh from PackageBooking's Next click). Fall
  // back to localStorage on refresh. If neither is present, redirect
  // back to Package Details — the user must complete step 1 first.
  const [checkoutState] = useState(() => {
    if (location.state?.bookingData) {
      try {
        localStorage.setItem(
          SESSION_KEY(id),
          JSON.stringify(location.state),
        );
      } catch {
        /* session storage unavailable → won't survive refresh, but the
           current tab still works from location.state */
      }
      return location.state;
    }
    try {
      const raw = localStorage.getItem(SESSION_KEY(id));
      if (raw) return JSON.parse(raw);
    } catch {
      /* corrupt draft → treated as missing */
    }
    return null;
  });

  // Whether the browser landed here from a real CC Avenue redirect. The
  // resume useEffect below picks up ?ccavenueOrderId=&ccavenueStatus= and
  // finalises the booking server-side; while that's in flight the "please
  // complete Package Details first" guard MUST NOT redirect the operator
  // away — the draft may have been lost across the cross-domain hop but the
  // backend still owns the payload (it was persisted at /initiate).
  const hasCCAvenueResume = (() => {
    try {
      return !!new URLSearchParams(location.search).get("ccavenueOrderId");
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    if (!checkoutState && id && !hasCCAvenueResume) {
      toast.error("Please complete Package Details first.");
      navigate(`/new-booking/package-booking/${id}`, { replace: true });
    }
  }, [checkoutState, id, navigate, hasCCAvenueResume]);

  // ── CC Avenue post-payment resume ──
  // CC Avenue's redirect is a real cross-domain browser navigation, so
  // React Router `state` doesn't survive it. The backend appends
  // ?ccavenueOrderId=&ccavenueStatus= to this page's URL when it 302s the
  // browser back — we verify the payment status server-side (so a tampered
  // URL can't force a booking through), then call finalize-package which
  // replays the payload persisted at /initiate through the same
  // PackageBookingService.bookPackage the plain /book endpoint uses. On
  // success we land on the package booking list, matching every other
  // successful package-create outcome.
  const [isFinalizingPayment, setIsFinalizingPayment] = useState(false);
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const ccavenueOrderId = searchParams.get("ccavenueOrderId");
    const ccavenueStatus = searchParams.get("ccavenueStatus");
    if (!ccavenueOrderId) return;

    // Strip the resume query from history right away so a remount / reload
    // can't re-trigger this effect (and re-POST /finalize-package).
    navigate(location.pathname, { replace: true, state: {} });

    (async () => {
      if (ccavenueStatus !== "success") {
        toast.error("Payment was not completed. Please try again.");
        return;
      }
      try {
        setIsFinalizingPayment(true);
        const statusResponse = await axiosInstance.get(
          `/api/payment/ccavenue/status/${ccavenueOrderId}`,
        );
        if (statusResponse.data?.status !== "SUCCESS") {
          toast.error(
            statusResponse.data?.statusMessage ||
              "Payment was not successful. Please try again.",
          );
          return;
        }
        const res = await axiosInstance.post(
          `/api/payment/ccavenue/finalize-package/${ccavenueOrderId}`,
        );
        const body = res?.data || {};
        if (body.bookingId) {
          toast.success(body.message || "Booking confirmed successfully!");
          // Flag the abandoned-search history row as booked so the
          // scheduler stops considering it a follow-up candidate.
          markPackageSearchHistoryConfirmed(id);
          try {
            localStorage.removeItem(SESSION_KEY(id));
          } catch {
            /* ignore */
          }
          navigate("/booking-details/package-booking-list");
        } else {
          toast.error(
            body.message ||
              "Payment succeeded but booking could not be created. Please contact support with your payment reference.",
          );
        }
      } catch (err) {
        const beMsg =
          err?.response?.data?.message || err?.message || null;
        console.error("Post-payment package finalize failed:", err);
        toast.error(
          beMsg ||
            "Payment succeeded but booking could not be created. Please contact support with your payment reference.",
        );
      } finally {
        setIsFinalizingPayment(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Warn on close / navigate-away while the paid-for booking is still being
  // created server-side. Only attached during that window so it never fires
  // on the normal flow. Mirrors HotelBookingPage's beforeunload guard.
  useEffect(() => {
    if (!isFinalizingPayment) return;
    const beforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isFinalizingPayment]);

  const [bookingData, setBookingData] = useState(
    checkoutState?.bookingData || null,
  );
  const packageData = checkoutState?.packageData || null;
  const packageView = checkoutState?.packageView || null;
  const editingBookingId = checkoutState?.editingBookingId || null;
  const parentBookingCode = checkoutState?.parentBookingCode || null;
  const searchRate = checkoutState?.searchRate ?? null;
  // Pax-scaled package rate resolved on the Package Details page (step 1) and
  // carried in the draft, so both pages feed resolvePackageBaseRate the same
  // inputs and can never disagree on the total.
  const resolvedPackageRate = checkoutState?.resolvedPackageRate ?? null;

  // Ref into PaxInformation so the sidebar Confirm booking button (rendered
  // directly below the "Are you sure you want to continue with the booking?"
  // card) can invoke the same triggerConfirmClick() flow the old sticky-nav
  // Confirm used to run — validate pax → require modeOfPayment → require
  // bookingConfirmation → open the Terms & Conditions modal that ultimately
  // fires handleSubmitBooking.
  const paxInfoRef = useRef(null);

  // Keep localStorage in sync with bookingData mutations so a refresh
  // preserves whatever the operator has typed / selected on this page.
  useEffect(() => {
    if (!id || !bookingData) return;
    try {
      localStorage.setItem(
        SESSION_KEY(id),
        JSON.stringify({
          bookingData,
          packageData,
          packageView,
          editingBookingId,
          parentBookingCode,
          searchRate,
          resolvedPackageRate,
        }),
      );
    } catch {
      /* ignore quota errors */
    }
  }, [
    bookingData,
    id,
    packageData,
    packageView,
    editingBookingId,
    parentBookingCode,
    searchRate,
    resolvedPackageRate,
  ]);

  // ── Total price ─────────────────────────────────────────────────────
  // Same helper PackageBooking.jsx (step 1) uses, fed the same selections and
  // the same searchRate that travelled here in the draft — so the number the
  // operator agreed to on step 1, the number in the sidebar card below, the
  // "Payable" line in Order Summary and the totalPrice posted to /book all
  // match to the cent.
  //
  // Two bugs were fixed by routing through it: this page used to ADD the
  // package base rate on top of the selected hotel (both are the same
  // PackageRates money — the base is just the lowest per-adult rate, so the
  // package got charged twice), and it dropped `mealPlanPrice` entirely, so a
  // meal plan picked on step 1 was shown on step 1 and then silently lost
  // here. See packageTotal.js for the full reasoning.
  const priceBreakdown = computePackageTotal(
    bookingData?.selections,
    resolvePackageBaseRate(searchRate, packageData, resolvedPackageRate),
  );
  const totalPrice = priceBreakdown.total;

  const [showPolicyModal, setShowPolicyModal] = useState(false);

  // ── Quotation PDF ───────────────────────────────────────────────────
  // Pre-booking quotation the operator can share with the customer from the
  // sidebar's Quotation card. Rendered server-side by
  // POST /api/v1/package-booking/quotation-pdf from this page's selections
  // and Total Price; nothing is booked, held or charged. The last result is
  // kept so re-opening the preview with unchanged selections shows the same
  // quotation instead of issuing a new number.
  const [showQuotationModal, setShowQuotationModal] = useState(false);
  const [isGeneratingQuotation, setIsGeneratingQuotation] = useState(false);
  const [quotation, setQuotation] = useState(null);
  const lastQuotationRef = useRef(null);

  const handlePrev = () => {
    navigate(`/new-booking/package-booking/${id}`, {
      state: {
        bookingData,
        packageData,
        packageView,
        editingBookingId,
        parentBookingCode,
        searchRate,
        resolvedPackageRate,
      },
    });
  };

  const handleFinish = async () => {
    try {
      toast.loading("Processing booking...");
      setTimeout(() => {
        toast.dismiss();
        toast.success("Booking confirmed successfully!");
        try {
          localStorage.removeItem(SESSION_KEY(id));
        } catch {
          /* ignore */
        }
        navigate("/booking-details/package-booking-list");
      }, 1500);
    } catch {
      toast.error("Failed to confirm booking");
    }
  };

  // ── Sidebar Booking Summary derivations ─────────────────────────────
  // Same shape / labels as PackageBooking so the operator sees the same
  // trip snapshot they had on the Package Details page.
  const formatDateForDisplay = (isoOrEmpty) => {
    if (!isoOrEmpty) return "";
    try {
      const [y, m, d] = isoOrEmpty.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      if (isNaN(dt.getTime())) return isoOrEmpty;
      return dt.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return isoOrEmpty;
    }
  };

  // While a CC Avenue payment is being finalised, or while we're about to
  // start (URL still carries ?ccavenueOrderId=), show a blocking overlay
  // instead of the "no data" bail — the draft is legitimately empty here
  // (cross-domain redirect ate it) but the backend still owns the payload.
  if (!bookingData) {
    if (isFinalizingPayment || hasCCAvenueResume) {
      return <CCAvenueFinalizingOverlay />;
    }
    return null;
  }

  // Selected hotel (packages allow a single hotel pick — HotelsTab enforces
  // it). Pulled out here so the Booking Summary sidebar can render the same
  // hotel snapshot the Order Summary modal shows.
  const selectedHotel =
    Array.isArray(bookingData.selections?.selectedHotels) &&
    bookingData.selections.selectedHotels.length > 0
      ? bookingData.selections.selectedHotels[0]
      : null;
  const selectedHotelImage = (() => {
    if (!selectedHotel?.image) return "";
    if (selectedHotel.image.startsWith("http")) return selectedHotel.image;
    const base = process.env.REACT_APP_API_BASE_URL || "";
    const filename = selectedHotel.image.includes("\\")
      ? selectedHotel.image.split("\\").pop()
      : selectedHotel.image.split("/").pop();
    return filename
      ? `${base}/api/files/${filename}`
      : `${base}/api/files/${selectedHotel.image}`;
  })();

  const packageNights = (() => {
    const raw =
      packageView?.noOfNights != null
        ? parseInt(packageView.noOfNights, 10)
        : NaN;
    return Number.isFinite(raw) ? raw : 0;
  })();
  const heroCheckIn = bookingData.searchParams?.travelDate || "";
  const heroCheckOut = (() => {
    if (!heroCheckIn || !packageNights) return "";
    const d = new Date(heroCheckIn);
    if (isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + packageNights);
    return d.toISOString().split("T")[0];
  })();
  const heroGuestSummary =
    [
      bookingData.searchParams?.adultCount
        ? `${bookingData.searchParams.adultCount} adult${
            bookingData.searchParams.adultCount > 1 ? "s" : ""
          }`
        : "",
      bookingData.searchParams?.childCount
        ? `${bookingData.searchParams.childCount} child${
            bookingData.searchParams.childCount > 1 ? "ren" : ""
          }`
        : "",
    ]
      .filter(Boolean)
      .join(", ") || "—";
  const heroNationality =
    bookingData.searchParams?.paxPassport?.label ||
    bookingData.searchParams?.nationalityName ||
    "—";

  // ── Cancellation Policies popup content ────────────────────────────
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

  // ── Quotation PDF handlers ──────────────────────────────────────────
  // Everything the quotation prints about the trip comes from this page's
  // own state: the selected hotel / room / meal plan, the Booking Summary's
  // dates, guests and nationality, and the Total Price card's breakdown
  // (computePackageTotal). The backend adds the package's itinerary,
  // inclusions, exclusions, cancellation policy and terms from the master.
  const buildQuotationPayload = () => {
    const lead = paxInfoRef.current?.getLeadTraveller?.() || null;
    const leadNames = lead
      ? [lead.firstName, lead.middleName, lead.lastName]
          .map((p) => (p ? String(p).trim() : ""))
          .filter(Boolean)
      : [];
    // The quote is addressed to the Lead traveller only once a name has been
    // typed in; until then the PDF prints "To be advised".
    const leadName = leadNames.length
      ? [lead.title ? String(lead.title).trim() : "", ...leadNames]
          .filter(Boolean)
          .join(" ")
      : "";
    const hotelNights = parseInt(selectedHotel?.noOfnight, 10);
    return {
      packageId: Number(id) || null,
      agentId: Number(bookingData.searchParams?.agentId) || null,
      packageName: packageData?.packageName || packageView?.packageName || null,
      packageCategoryName: bookingData.searchParams?.packageCategoryName || null,
      travelDate: bookingData.searchParams?.travelDate || null,
      adultCount: Number(bookingData.searchParams?.adultCount) || 0,
      childCount: Number(bookingData.searchParams?.childCount) || 0,
      infantCount: Number(bookingData.searchParams?.infantCount) || 0,
      childAge: bookingData.searchParams?.childAge || "",
      nationality: heroNationality !== "—" ? heroNationality : null,
      customerName: leadName || null,
      customerEmail: leadName ? lead?.email?.trim() || null : null,
      customerMobile: leadName ? lead?.mobile?.trim() || null : null,
      currency: "AED",
      hotelId: selectedHotel?.hotelId ?? null,
      hotelName: selectedHotel?.hotelName || null,
      hotelCity: selectedHotel?.stateName || null,
      roomType: selectedHotel?.roomTypeName || null,
      hotelNights: Number.isFinite(hotelNights) ? hotelNights : null,
      mealPlan: bookingData.selections?.selectedMealPlan?.label || null,
      cabName:
        bookingData.selections?.selectedCab?.cabName ||
        bookingData.selections?.selectedCab?.name ||
        null,
      activityName:
        bookingData.selections?.selectedActivity?.activityName ||
        bookingData.selections?.selectedActivity?.name ||
        null,
      accommodationAmount: priceBreakdown.accommodation,
      mealPlanAmount: priceBreakdown.mealPlan,
      cabAmount: priceBreakdown.cab,
      activityAmount: priceBreakdown.activity,
      totalAmount: totalPrice,
    };
  };

  const openQuotation = async () => {
    if (!selectedHotel) {
      toast.error("Please select a hotel before generating a quotation.");
      return;
    }
    const payload = buildQuotationPayload();
    // Same selections on the same day → same quotation. Any change (meal
    // plan, lead traveller, price, date) generates a fresh one.
    const cacheKey = JSON.stringify({
      payload,
      day: new Date().toDateString(),
    });
    setShowQuotationModal(true);
    if (lastQuotationRef.current?.key === cacheKey) {
      setQuotation(lastQuotationRef.current.data);
      return;
    }
    setQuotation(null);
    setIsGeneratingQuotation(true);
    try {
      const res = await axiosInstance.post(
        "/api/v1/package-booking/quotation-pdf",
        payload,
      );
      const body = res?.data || {};
      if (body.status === "SUCCESS" && body.pdfUrl) {
        const data = {
          pdfUrl: body.pdfUrl,
          quotationNumber: body.quotationNumber || "",
          quotationDate: body.quotationDate || "",
          validUntil: body.validUntil || "",
        };
        lastQuotationRef.current = { key: cacheKey, data };
        setQuotation(data);
      } else {
        toast.error(body.message || "Failed to generate quotation PDF");
      }
    } catch (err) {
      console.error("Quotation generation failed:", err);
      toast.error(
        err?.response?.data?.message || "Failed to generate quotation PDF",
      );
    } finally {
      setIsGeneratingQuotation(false);
    }
  };

  const closeQuotation = () => setShowQuotationModal(false);

  // Downloads through a blob so the file keeps its Quotation_<number>.pdf
  // name: browsers ignore `download` on the cross-origin /files URL and would
  // navigate this tab away from checkout. If the fetch is blocked, the PDF
  // opens in a new tab instead so the operator can still save it.
  const handleDownloadQuotation = async () => {
    if (!quotation?.pdfUrl) return;
    const fileName = `Quotation_${quotation.quotationNumber || id}.pdf`;
    try {
      const res = await fetch(quotation.pdfUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Quotation download failed:", err);
      window.open(quotation.pdfUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column hotel-booking-container room-list-container">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main
          className="content-wrapper flex-grow-1 booking-stepper-container"
          style={{ minWidth: 0, overflowX: "clip" }}
        >
          <div className="container-fluid" style={{ paddingTop: "10px" }}>
            <div className="hs-page-heading d-flex justify-content-between align-items-center flex-wrap gap-2">
              <h3 className="hs-page-heading-title mb-0">Package Checkout</h3>
              {bookingData.searchParams?.agentId && (
                <div className="pkg-checkout-heading-balance">
                  <AgentBalanceDisplay
                    agentId={bookingData.searchParams.agentId}
                  />
                </div>
              )}
            </div>

            <Row className="g-3">
              <Col lg={8} className="hbp-left-col">
                <div className="main-booking-card">
                  <div className="tab-content-area">
                    <PaxInformation
                      ref={paxInfoRef}
                      searchParams={bookingData.searchParams}
                      bookingData={bookingData}
                      updateData={setBookingData}
                      onPrev={handlePrev}
                      onFinish={handleFinish}
                      packageData={packageData}
                      totalPrice={totalPrice}
                      priceBreakdown={priceBreakdown}
                      editingBookingId={editingBookingId}
                      parentBookingCode={parentBookingCode}
                    />
                  </div>
                </div>
              </Col>

              <Col lg={4} className="hbp-right-col">
                <div className="sidebar-stack">
                  {/* Booking Summary — ported from HotelBookingPage.jsx's
                      right-sidebar booking-summary-card so the two flows
                      read as one system: blue Card.Header with icon + title,
                      package name (fw-bold text-primary) + destination
                      (text-muted small), then .hbp-summary-row rows for the
                      trip details. Data comes from the same derived vars
                      that fed the plain card before — nothing else changed. */}
                  <Card className="shadow-sm rounded-3 mb-3 booking-summary-card border-0 overflow-hidden">
                    <Card.Header className="bg-primary text-white py-2 rounded-top">
                      <h6 className="mb-0 d-flex align-items-center">
                        <FaHotel className="me-2" /> Booking Summary
                      </h6>
                    </Card.Header>
                    <Card.Body className="p-3">
                      {(packageData?.packageName || packageView?.packageName) && (
                        <div className="mb-3">
                          <div className="fw-bold text-primary mb-1">
                            {packageData?.packageName || packageView?.packageName}
                          </div>
                          {packageView?.arriveCountryName && (
                            <div className="text-muted small mb-2">
                              {packageView.arriveCountryName}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Selected Hotel block — surfaces the hotel picked on
                          the Hotels step so the operator can confirm it while
                          filling in pax details. Falls back to a muted
                          "no hotel selected" note when the user proceeded
                          without one (allowed by the HotelsTab no-hotel
                          acknowledgement flow). */}
                      {selectedHotel ? (
                        <div className="pkg-checkout-selected-hotel mb-3">
                          <div className="pkg-checkout-selected-hotel-label">
                            <FaHotel className="me-2" />
                            Selected Hotel
                          </div>
                          <div className="pkg-checkout-selected-hotel-body">
                            {selectedHotelImage && (
                              <img
                                src={selectedHotelImage}
                                alt={selectedHotel.hotelName}
                                className="pkg-checkout-selected-hotel-thumb"
                                onError={(e) => {
                                  e.target.style.display = "none";
                                }}
                              />
                            )}
                            <div className="pkg-checkout-selected-hotel-info">
                              <div className="pkg-checkout-selected-hotel-name">
                                {selectedHotel.hotelName || "Selected hotel"}
                              </div>
                              {selectedHotel.stateName && (
                                <div className="pkg-checkout-selected-hotel-meta">
                                  <FaMapMarkerAlt className="me-1" />
                                  {selectedHotel.stateName}
                                </div>
                              )}
                              {selectedHotel.noOfnight != null && (
                                <div className="pkg-checkout-selected-hotel-meta">
                                  <FaMoon className="me-1" />
                                  {selectedHotel.noOfnight} Night
                                  {selectedHotel.noOfnight === 1 ? "" : "s"}
                                </div>
                              )}
                              {/* {Number(selectedHotel.totalRateWithMarkup) > 0 && (
                                <div className="pkg-checkout-selected-hotel-price">
                                  AED{" "}
                                  {Number(
                                    selectedHotel.totalRateWithMarkup,
                                  ).toLocaleString("en-US", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </div>
                              )} */}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="pkg-checkout-selected-hotel pkg-checkout-selected-hotel--empty mb-3">
                          <div className="pkg-checkout-selected-hotel-label">
                            <FaHotel className="me-2" />
                            Selected Hotel
                          </div>
                          <div className="pkg-checkout-selected-hotel-empty-note">
                            No hotel selected for this package.
                          </div>
                        </div>
                      )}

                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaCalendarAlt className="me-2 text-primary" />
                          Arrival date
                        </div>
                        <div className="hbp-summary-value">
                          {formatDateForDisplay(heroCheckIn) || "—"}
                        </div>
                      </div>
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaCalendarAlt className="me-2 text-primary" />
                          Departure date
                        </div>
                        <div className="hbp-summary-value">
                          {formatDateForDisplay(heroCheckOut) || "—"}
                        </div>
                      </div>
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaUsers className="me-2 text-primary" />
                          Guests
                        </div>
                        <div className="hbp-summary-value">
                          {heroGuestSummary}
                        </div>
                      </div>
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaGlobe className="me-2 text-primary" />
                          Nationality
                        </div>
                        <div className="hbp-summary-value">
                          {heroNationality}
                        </div>
                      </div>
                      {/* Meal plan row — shows the board type picked on the
                          Hotels step (BB / Half Board / Full Board / All
                          Inclusive). Reads bookingData.selections.selectedMealPlan
                          — the same source the Total Price sidebar below
                          already uses — so no new source of truth and no
                          impact on pricing, payload or validation. Renders
                          "Not selected" when the operator skipped it, matching
                          how the Package Preview modal treats the same field. */}
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaUtensils className="me-2 text-primary" />
                          Meal Plan
                        </div>
                        <div className="hbp-summary-value">
                          {bookingData.selections?.selectedMealPlan?.label ||
                            "Not selected"}
                        </div>
                      </div>
                    </Card.Body>
                  </Card>

                  {/* Total Price — renders `totalPrice`, i.e. the identical
                      figure PackageBooking's sidebar showed on step 1 and the
                      one posted on /book. Meal plan is called out underneath
                      exactly as it is there. */}
                  <div className="price-sidebar-card">
                    <div className="price-sidebar-label">Total Price</div>
                    <div className="price-sidebar-amount">
                      {formatPackageAmount(totalPrice)}
                    </div>
                    <div className="price-sidebar-sub">AED</div>
                    {bookingData.selections?.selectedMealPlan && (
                      <div className="price-sidebar-mealplan">
                        +{" "}
                        {bookingData.selections.selectedMealPlan.label} meal
                        plan · AED {formatPackageAmount(priceBreakdown.mealPlan)}
                      </div>
                    )}
                  </div>

                  {/* Quotation — pre-booking price quote for the customer,
                      placed under the Total Price it quotes and above the
                      booking decision. Same card shell as the Package
                      Actions card on the Package Details page. Only offered
                      once a hotel is selected, and not while amending an
                      existing booking (a quotation precedes a booking). */}
                  {selectedHotel && !editingBookingId && (
                    <div className="sidebar-actions-card">
                      <div className="sidebar-actions-title">
                        <FaFileInvoice className="me-2" />
                        Quotation
                      </div>
                      <div className="sidebar-actions-note">
                        Share this package and price with your customer before
                        confirming. No booking is made.
                      </div>
                      <div className="d-grid gap-2 mt-2">
                        <Button
                          size="sm"
                          variant="outline-primary"
                          onClick={openQuotation}
                          disabled={isGeneratingQuotation}
                        >
                          {isGeneratingQuotation ? (
                            <>
                              <Spinner
                                animation="border"
                                size="sm"
                                className="me-2"
                              />
                              Generating…
                            </>
                          ) : (
                            <>
                              <FaFilePdf className="me-2" />
                              Quotation PDF
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Cancellation Policies link — same button + class as the
                      Package Details page's sidebar so the popup styling is
                      inherited. */}
                  {/* <div className="sidebar-policy-card">
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
                  </div> */}

                  {/* Booking Confirmation radios — required before Confirm
                      Booking (gated inside PaxInformation). */}
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
                          bookingData.programme?.bookingConfirmation ===
                          "Book & Voucher"
                        }
                        onChange={(e) =>
                          setBookingData((prev) => ({
                            ...prev,
                            programme: {
                              ...prev.programme,
                              bookingConfirmation: e.target.value,
                            },
                          }))
                        }
                      />
                      <Form.Check
                        type="radio"
                        id="pkg-hold-pay-later"
                        name="pkgBookingConfirmation"
                        label="Hold Package and Pay Later"
                        value="Book Now & Voucher later"
                        checked={
                          bookingData.programme?.bookingConfirmation ===
                          "Book Now & Voucher later"
                        }
                        onChange={(e) =>
                          setBookingData((prev) => ({
                            ...prev,
                            programme: {
                              ...prev.programme,
                              bookingConfirmation: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>

                  {/* Confirm booking — moved out of the sticky-nav row inside
                      PaxInformation so it sits directly below the "Are you
                      sure…" card. Triggers PaxInformation.triggerConfirmClick()
                      through the ref, which runs the same validate → mode of
                      payment → bookingConfirmation → Terms modal gate the
                      old button did. */}
                  <button
                    type="button"
                    className="btn-nav-next sidebar-confirm-btn"
                    onClick={() => paxInfoRef.current?.triggerConfirmClick()}
                  >
                    {editingBookingId ? "Save amendment →" : "Confirm booking →"}
                  </button>
                </div>

                <style>{`
                  .sidebar-pay-card {
                    border: 1px solid var(--rl-border, #e2e8f0);
                    border-radius: 14px;
                    padding: 14px 16px;
                    background: var(--rl-card, #ffffff);
                    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
                    margin-top: 16px;
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
                  /* Sidebar Confirm booking button — sits directly below the
                     "Are you sure…" card. Reuses .btn-nav-next's styling from
                     PackageBooking_Stepper.css but forces full width + adds
                     the same margin-top spacing the sidebar cards use. */
                  .sidebar-confirm-btn {
                    display: block;
                    width: 100%;
                    margin-top: 16px;
                  }
                  /* Quotation card — same shell as the Package Actions card
                     on the Package Details page (PackageBooking.jsx) so the
                     two steps' sidebars match. */
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
                  .sidebar-actions-note {
                    font-size: 0.78rem;
                    line-height: 1.35;
                    color: #64748b;
                  }
                  /* Quotation preview frame — same neutral backdrop and
                     height as the voucher / invoice previews on the booking
                     detail page. */
                  .pkg-quote-preview {
                    background: #f8fafc;
                    min-height: 520px;
                  }
                  .pkg-quote-preview iframe {
                    display: block;
                    width: 100%;
                    height: 520px;
                    border: none;
                  }
                  .sidebar-policy-card {
                    border: 1px solid var(--rl-border, #e2e8f0);
                    border-radius: 14px;
                    padding: 12px 16px;
                    background: var(--rl-card, #ffffff);
                    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
                    margin-top: 16px;
                  }
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
                    margin-top: 3px;
                    font-size: 0.9em;
                  }
                  .policy-link-text {
                    text-decoration: underline;
                    text-underline-offset: 2px;
                    text-align: center;
                  }
                  /* Selected-hotel mini card inside the Booking Summary. Uses
                     the same soft-blue border / muted background palette as
                     the existing summary rows so it reads as part of the card
                     rather than a callout. */
                  .pkg-checkout-selected-hotel {
                    border: 1px solid #dbeafe;
                    border-radius: 10px;
                    padding: 10px 12px;
                    background: #f8fafc;
                  }
                  .pkg-checkout-selected-hotel-label {
                    display: flex;
                    align-items: center;
                    font-size: 0.72rem;
                    letter-spacing: 0.06em;
                    text-transform: uppercase;
                    font-weight: 700;
                    color: #1d4ed8;
                    margin-bottom: 8px;
                  }
                  .pkg-checkout-selected-hotel-body {
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                  }
                  .pkg-checkout-selected-hotel-thumb {
                    width: 60px;
                    height: 60px;
                    object-fit: cover;
                    border-radius: 8px;
                    flex-shrink: 0;
                    border: 1px solid #e2e8f0;
                  }
                  .pkg-checkout-selected-hotel-info {
                    min-width: 0;
                    flex: 1;
                  }
                  .pkg-checkout-selected-hotel-name {
                    font-weight: 700;
                    color: #0f172a;
                    font-size: 0.9rem;
                    line-height: 1.25;
                    margin-bottom: 4px;
                  }
                  .pkg-checkout-selected-hotel-meta {
                    display: flex;
                    align-items: center;
                    font-size: 0.78rem;
                    color: #475569;
                    margin-top: 2px;
                  }
                  .pkg-checkout-selected-hotel-price {
                    margin-top: 6px;
                    font-weight: 700;
                    color: #16a34a;
                    font-size: 0.85rem;
                  }
                  .pkg-checkout-selected-hotel--empty {
                    background: #fff7ed;
                    border-color: #fed7aa;
                  }
                  .pkg-checkout-selected-hotel--empty
                    .pkg-checkout-selected-hotel-label {
                    color: #b45309;
                  }
                  .pkg-checkout-selected-hotel-empty-note {
                    font-size: 0.8rem;
                    color: #7c2d12;
                  }
                  /* Agent Available Balance inline with the "Package Checkout"
                     page heading — sits at the right end of the heading row,
                     wraps under the title on narrow viewports (flex-wrap on
                     .hs-page-heading). Strips AgentBalanceDisplay's default
                     .mt-1 and bumps the font up so the balance reads as a
                     header stat rather than a small helper line. */
                  .pkg-checkout-heading-balance > div {
                    margin-top: 0 !important;
                    font-size: 1rem;
                  }
                  .pkg-checkout-heading-balance .fw-semibold {
                    font-size: 1rem;
                  }
                `}</style>
              </Col>
            </Row>
          </div>
        </main>
      </div>

      {/* Cancellation Policies popup — same content as PackageBooking's
          modal (Cancellation → Includes → Excludes → Terms). */}
      <Modal
        show={showPolicyModal}
        onHide={() => setShowPolicyModal(false)}
        centered
        size="lg"
        scrollable
      >
        <Modal.Header closeButton style={{ background: "#f8fafc" }}>
          <Modal.Title
            className="d-flex align-items-center"
            style={{ fontSize: "1.05rem" }}
          >
            <FaShieldAlt className="me-2" style={{ color: "#EC0B43" }} />
            Cancellation Policies &amp; Terms &amp; Conditions
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4">
          <h6 className="text-danger mb-3">
            <FaTimesCircle className="me-2" />
            Cancellation Policy
          </h6>
          <ul className="mb-0 ps-3">
            {cancellationParts.map((p, i) => (
              <li key={i} className="mb-2">
                <div style={{ whiteSpace: "pre-line" }}>{p.text}</div>
              </li>
            ))}
            <li className="mb-0 text-danger">
              <FaShieldAlt className="me-2" />
              This is a <strong>NON-REFUNDABLE</strong> package within the
              charge window.
            </li>
          </ul>

          <h6 className="text-success mb-3 mt-4">
            <FaCheckCircle className="me-2" />
            Includes
          </h6>
          {inclusions.length > 0 ? (
            <ul className="mb-0 ps-3">
              {inclusions.map((x) => (
                <li key={`inc-${x.otherId}`} className="mb-2">
                  {x.description}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small text-muted fst-italic mb-0">
              Includes will be uploaded by supplier.
            </p>
          )}

          <h6 className="text-danger mb-3 mt-4">
            <FaTimesCircle className="me-2" />
            Excludes
          </h6>
          {exclusions.length > 0 ? (
            <ul className="mb-0 ps-3">
              {exclusions.map((x) => (
                <li key={`exc-${x.otherId}`} className="mb-2">
                  {x.description}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small text-muted fst-italic mb-0">
              Excludes will be uploaded by supplier.
            </p>
          )}

          <h6
            className="fw-bold d-flex align-items-center mb-2 mt-4"
            style={{ color: "#1e293b" }}
          >
            <FaFileContract className="me-2 text-danger" /> Terms &amp;
            Conditions
          </h6>
          {termsList.length > 0 ? (
            <ul className="small mb-0 ps-3">
              {termsList.map((t) => (
                <li key={t.otherId} className="mb-2">
                  {t.description}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small text-muted fst-italic mb-0">
              No specific terms were attached to this package.
            </p>
          )}
        </Modal.Body>
        <Modal.Footer style={{ background: "#f1f5f9" }}>
          <Button
            variant="outline-secondary"
            onClick={() => setShowPolicyModal(false)}
          >
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Quotation PDF preview — same iframe + Download layout as the
          Voucher / Tax Invoice modals on the package booking detail page. */}
      <Modal
        show={showQuotationModal}
        onHide={closeQuotation}
        centered
        size="xl"
        backdrop="static"
      >
        <Modal.Header closeButton>
          <Modal.Title className="d-flex align-items-center gap-2">
            <FaFileInvoice />
            <span className="fw-bold">Package Quotation</span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-3 d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div className="text-muted small">
              <div className="fw-bold text-dark">
                {quotation?.quotationNumber ||
                  (isGeneratingQuotation ? "Generating quotation…" : "Quotation")}
              </div>
              <div>
                {packageData?.packageName || packageView?.packageName || ""}
                {quotation?.validUntil
                  ? ` · Valid until ${quotation.validUntil}`
                  : ""}
              </div>
            </div>
            <Button
              variant="outline-primary"
              size="sm"
              onClick={handleDownloadQuotation}
              disabled={isGeneratingQuotation || !quotation?.pdfUrl}
            >
              <FaDownload className="me-2" /> Download PDF
            </Button>
          </div>

          <div className="border rounded mb-2 pkg-quote-preview">
            {isGeneratingQuotation && (
              <div className="text-center text-muted py-5">
                <Spinner animation="border" size="sm" className="me-2" />
                Generating quotation PDF...
              </div>
            )}
            {!isGeneratingQuotation && quotation?.pdfUrl && (
              <iframe src={quotation.pdfUrl} title="Package Quotation" />
            )}
            {!isGeneratingQuotation && !quotation?.pdfUrl && (
              <div className="text-center text-muted py-5">
                Quotation preview unavailable. Close this window and try
                again.
              </div>
            )}
          </div>
          <div className="small text-muted">
            A quotation does not create a booking or hold the package. Prices
            and availability are confirmed only when the booking is made.
          </div>
        </Modal.Body>
        <Modal.Footer className="border-0">
          <Button variant="secondary" onClick={closeQuotation}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Post-payment finalize overlay — shown while
          /api/payment/ccavenue/finalize-package/{orderId} is running. Same
          look as HotelBookingPage's overlay so operators see a consistent
          "do not close this window" popup across booking flows. */}
      {isFinalizingPayment && <CCAvenueFinalizingOverlay />}
    </div>
  );
};

export default PackageCheckout;
