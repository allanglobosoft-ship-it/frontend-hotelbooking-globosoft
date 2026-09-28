import React, { useRef, useState } from "react";
import { Button, Modal, Spinner } from "react-bootstrap";
import { toast } from "react-hot-toast";
import { FaDownload, FaFileInvoice, FaFilePdf } from "react-icons/fa";
import axiosInstance from "../AxiosInstance";
import "../../styles/QuotationPdf.css";

// Shared quotation endpoint for the New Booking flows. The pre-defined
// Package flow keeps its own package-master-aware endpoint
// (/api/v1/package-booking/quotation-pdf on PackageCheckout).
const QUOTATION_ENDPOINT = "/api/v1/booking-quotation/pdf";

// Coerces a page's payload into exactly the shape the backend DTO accepts
// (strings, numbers or null; lists of strings / {label, value} /
// {description, details, amount}), dropping empty rows. Keeps a stray
// object or non-numeric amount on any booking page from failing the
// request.
const toText = (v) =>
  typeof v === "string"
    ? v
    : typeof v === "number" || typeof v === "boolean"
      ? String(v)
      : "";
const toAmount = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const textList = (list) =>
  (Array.isArray(list) ? list : [])
    .map(toText)
    .filter((t) => t.trim());
const normalizePayload = (p) => ({
  bookingType: toText(p.bookingType),
  agentId: toAmount(p.agentId),
  currency: toText(p.currency),
  serviceName: toText(p.serviceName),
  serviceSubtitle: toText(p.serviceSubtitle),
  customerName: toText(p.customerName),
  customerEmail: toText(p.customerEmail),
  customerMobile: toText(p.customerMobile),
  details: (Array.isArray(p.details) ? p.details : [])
    .map((d) => ({ label: toText(d?.label), value: toText(d?.value) }))
    .filter((d) => d.label.trim() && d.value.trim()),
  priceItems: (Array.isArray(p.priceItems) ? p.priceItems : [])
    .map((item) => ({
      description: toText(item?.description),
      details: toText(item?.details),
      amount: toAmount(item?.amount),
    }))
    .filter((item) => item.description.trim()),
  totalAmount: toAmount(p.totalAmount),
  itineraryTitle: toText(p.itineraryTitle),
  itineraryDayLabel: toText(p.itineraryDayLabel),
  itinerary: (Array.isArray(p.itinerary) ? p.itinerary : [])
    .map((it) => ({
      day: toAmount(it?.day),
      heading: toText(it?.heading),
      place: toText(it?.place),
      activities: toText(it?.activities),
    }))
    .filter((it) => it.heading.trim() || it.place.trim() || it.activities.trim()),
  inclusions: textList(p.inclusions),
  exclusions: textList(p.exclusions),
  cancellationPolicy: textList(p.cancellationPolicy),
  notes: textList(p.notes),
});

/**
 * "Quotation PDF" action for the booking pages: a pre-booking price quote
 * the operator can share with the customer before confirming. Nothing is
 * booked, held or charged.
 *
 * The page supplies `buildPayload()`, which returns (or resolves to) the
 * POST body for /api/v1/booking-quotation/pdf from the page's own state
 * (bookingType, agentId, serviceName, details, priceItems, totalAmount, ...)
 * or null when the selection isn't complete. It may be async when the page
 * loads policy text on demand. This component does the rest: generates the
 * PDF, previews it in a modal (same iframe + Download layout as the voucher /
 * invoice modals) and downloads it.
 *
 * variant="card"   — sidebar card (title + note + button), placed under the
 *                    page's price summary like the Package Checkout card.
 * variant="button" — the button alone, for pages whose price summary and
 *                    Confirm button live in a form row or modal footer.
 */
const QuotationPdfCard = ({
  buildPayload,
  disabled = false,
  variant = "card",
  className = "",
  title = "Quotation",
  note = "Share this price with your customer before confirming. No booking is made.",
  buttonLabel = "Quotation PDF",
}) => {
  const [showModal, setShowModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [quotation, setQuotation] = useState(null);
  // Last generated quotation, keyed by payload + day, so re-opening the
  // preview with unchanged selections shows the same quotation instead of
  // issuing a new number.
  const lastQuotationRef = useRef(null);

  const openQuotation = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    let payload = null;
    try {
      const built =
        typeof buildPayload === "function" ? await buildPayload() : null;
      payload = built ? normalizePayload(built) : null;
    } catch (err) {
      console.error("Quotation details could not be prepared:", err);
      payload = null;
    }
    if (!payload) {
      setIsGenerating(false);
      toast.error("Please complete the selection before generating a quotation.");
      return;
    }
    const cacheKey = JSON.stringify({
      payload,
      day: new Date().toDateString(),
    });
    setShowModal(true);
    if (lastQuotationRef.current?.key === cacheKey) {
      setQuotation(lastQuotationRef.current.data);
      setIsGenerating(false);
      return;
    }
    setQuotation(null);
    try {
      const res = await axiosInstance.post(QUOTATION_ENDPOINT, payload);
      const body = res?.data || {};
      if (body.status === "SUCCESS" && body.pdfUrl) {
        const data = {
          pdfUrl: body.pdfUrl,
          quotationNumber: body.quotationNumber || "",
          validUntil: body.validUntil || "",
          serviceName: payload.serviceName || "",
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
      setIsGenerating(false);
    }
  };

  const closeModal = () => setShowModal(false);

  // Downloads through a blob so the file keeps its Quotation_<number>.pdf
  // name: browsers ignore `download` on the cross-origin /files URL and would
  // navigate the booking page away. If the fetch is blocked, the PDF opens in
  // a new tab instead so the operator can still save it.
  const handleDownload = async () => {
    if (!quotation?.pdfUrl) return;
    const fileName = `Quotation_${quotation.quotationNumber || "PDF"}.pdf`;
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

  const renderTrigger = (extraClassName) => (
    <Button
      type="button"
      size="sm"
      variant="outline-primary"
      className={extraClassName || undefined}
      onClick={openQuotation}
      disabled={disabled || isGenerating}
    >
      {isGenerating ? (
        <>
          <Spinner animation="border" size="sm" className="me-2" />
          Generating…
        </>
      ) : (
        <>
          <FaFilePdf className="me-2" />
          {buttonLabel}
        </>
      )}
    </Button>
  );

  return (
    <>
      {variant === "button" ? (
        renderTrigger(className)
      ) : (
        <div className={`qpdf-card ${className}`.trim()}>
          <div className="qpdf-title">
            <FaFileInvoice className="me-2" />
            {title}
          </div>
          {note ? <div className="qpdf-note">{note}</div> : null}
          <div className="d-grid mt-2">{renderTrigger("")}</div>
        </div>
      )}

      <Modal
        show={showModal}
        onHide={closeModal}
        centered
        size="xl"
        backdrop="static"
        className="qpdf-modal"
        backdropClassName="qpdf-modal-backdrop"
      >
        <Modal.Header closeButton>
          <Modal.Title className="d-flex align-items-center gap-2">
            <FaFileInvoice />
            <span className="fw-bold">Quotation</span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-3 d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div className="text-muted small">
              <div className="fw-bold text-dark">
                {quotation?.quotationNumber ||
                  (isGenerating ? "Generating quotation…" : "Quotation")}
              </div>
              <div>
                {quotation?.serviceName || ""}
                {quotation?.validUntil
                  ? `${quotation?.serviceName ? " · " : ""}Valid until ${quotation.validUntil}`
                  : ""}
              </div>
            </div>
            <Button
              type="button"
              variant="outline-primary"
              size="sm"
              onClick={handleDownload}
              disabled={isGenerating || !quotation?.pdfUrl}
            >
              <FaDownload className="me-2" /> Download PDF
            </Button>
          </div>

          <div className="border rounded mb-2 qpdf-preview">
            {isGenerating && (
              <div className="text-center text-muted py-5">
                <Spinner animation="border" size="sm" className="me-2" />
                Generating quotation PDF...
              </div>
            )}
            {!isGenerating && quotation?.pdfUrl && (
              <iframe src={quotation.pdfUrl} title="Quotation" />
            )}
            {!isGenerating && !quotation?.pdfUrl && (
              <div className="text-center text-muted py-5">
                Quotation preview unavailable. Close this window and try
                again.
              </div>
            )}
          </div>
          <div className="small text-muted">
            A quotation does not create a booking or hold any service. Prices
            and availability are confirmed only when the booking is made.
          </div>
        </Modal.Body>
        <Modal.Footer className="border-0">
          <Button type="button" variant="secondary" onClick={closeModal}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default QuotationPdfCard;
