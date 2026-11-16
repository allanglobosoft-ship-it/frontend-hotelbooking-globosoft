import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  Button,
  Table,
  Form,
  Row,
  Col,
  Modal,
  Pagination,
  OverlayTrigger,
  Popover,
} from "react-bootstrap";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/TopBar";
import axiosInstance from "../components/AxiosInstance";
import { toast } from "react-hot-toast";
import {
  FaPrint,
  FaFileExcel,
  FaHotel,
  FaUser,
  FaBuilding,
  FaTag,
  FaMoneyBillWave,
  FaSearch,
  FaPlus,
  FaFileInvoice,
  FaReceipt,
  FaInbox,
} from "react-icons/fa";
import "../styles/Invoice.css";

// Shared invoice-table cell styling. Identical to the per-cell inline
// styles used previously — only the repetition has been removed.
const headerCellStyle = {
  padding: "0.3rem 0.6rem",
  fontWeight: "600",
  textTransform: "uppercase",
  color: "#495057",
  border: "1px solid #dee2e6",
  whiteSpace: "normal",
  lineHeight: 1.2,
};

// Single-line cells. The table is `table-layout: fixed`, so a value that is
// too wide is trimmed with an ellipsis (full text stays in the cell tooltip)
// instead of forcing a horizontal scrollbar. Keeping every cell to one line
// also makes the row height constant, which the fit calculation relies on.
const baseCellStyle = {
  padding: "0.3rem 0.6rem",
  fontSize: "0.82rem",
  border: "1px solid #dee2e6",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  lineHeight: 1.35,
};

// Row geometry used to work out how many rows fit in the viewport. Both
// values are deliberate over-estimates: erring high costs one row, erring
// low would let the last row be clipped.
const ROW_HEIGHT_PX = 30; // 0.3rem padding x2 + 0.82rem/1.35 line + borders
const TABLE_CHROME_PX = 88; // column header row + pagination bar
const MIN_ROWS_PER_PAGE = 3;
const MAX_ROWS_PER_PAGE = 10; // the list shows at most 10 invoices per page

// Proportional column widths — they add up to 100% so the grid always spans
// exactly the available width, whatever the window size.
const COLUMN_WIDTHS = {
  serial: "3.5%",
  customer: "12%",
  details: "3.5%",
  agent: "7%",
  bookingCode: "10%",
  bookingDate: "13.5%", // full "29 Jul 2026 11:17 AM" without trimming
  hotel: "10.5%",
  checkIn: "8.5%",
  checkOut: "8.5%",
  amount: "9%",
  action: "14%", // holds the two labelled action buttons
};

export default function Invoice() {
  const [invoiceList, setInvoiceList] = useState([]);
  // Starts true: the first fetch waits on the viewport measurement, and the
  // spinner avoids a frame of "no data" before it runs.
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [agent, setAgent] = useState("");
  const [agents, setAgents] = useState([]);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [hasAppliedFilters, setHasAppliedFilters] = useState(false);

  // The page size is derived from the viewport rather than fixed, so the grid
  // always shows as many rows as fit and never needs a scrollbar. 0 means
  // "not measured yet" — the first fetch waits for the measurement.
  const [itemsPerPage, setItemsPerPage] = useState(0);
  const tableAreaRef = useRef(null);
  const measuredRowsRef = useRef(0);

  const activeRole = (sessionStorage.getItem("currentActiveRole") || "")
    .trim()
    .toUpperCase();
  const storedRoles = (sessionStorage.getItem("userRole") || "").toUpperCase();
  const isAgentRole = activeRole
    ? activeRole === "AGENT"
    : storedRoles.includes("AGENT") && !storedRoles.includes("ADMIN");

  const agentList = async () => {
    try {
      const response = await axiosInstance.get("/api/agent");
      setAgents(response.data || []);
    } catch (error) {
      console.log("error for agent axios list:", error);
      setAgents([]);
    }
  };

  const firstNonEmpty = (...values) =>
    values.find((value) => String(value ?? "").trim() !== "");

  const joinName = (...parts) =>
    parts
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join(" ");

  const getInvoiceCustomerName = (invoice) => {
    const customer = invoice?.customer || invoice?.customerDTO || {};
    const primaryGuest =
      invoice?.primaryGuest ||
      invoice?.leadGuest ||
      invoice?.leadPassenger ||
      invoice?.guest ||
      {};
    const firstGuest = Array.isArray(invoice?.guests)
      ? invoice.guests[0]
      : Array.isArray(invoice?.passengers)
        ? invoice.passengers[0]
        : Array.isArray(invoice?.paxDetails)
          ? invoice.paxDetails[0]
          : {};

    return firstNonEmpty(
      invoice?.customerName,
      invoice?.guestName,
      invoice?.leadGuestName,
      invoice?.leadPassengerName,
      invoice?.passengerName,
      invoice?.primaryGuestName,
      invoice?.customerFullName,
      customer?.name,
      customer?.customerName,
      joinName(customer?.firstName, customer?.lastName),
      joinName(primaryGuest?.firstName, primaryGuest?.lastName),
      joinName(firstGuest?.firstName, firstGuest?.lastName),
      joinName(invoice?.customerFirstName, invoice?.customerLastName),
      joinName(invoice?.firstName, invoice?.lastName),
    );
  };

  const normalizeInvoiceRow = (invoice) => ({
    ...invoice,
    customerName: getInvoiceCustomerName(invoice) || invoice?.customerName || "",
  });

  const applyInvoiceResponse = (data) => {
    const pageData = data?.bookings || data?.data || data;
    const content = Array.isArray(pageData)
      ? pageData
      : (pageData?.content || pageData?.bookings || []);

    setInvoiceList(Array.isArray(content) ? content.map(normalizeInvoiceRow) : []);
    setTotalElements(
      pageData?.totalElements ?? data?.totalElements ?? content?.length ?? 0,
    );
    setTotalPages(
      pageData?.totalPages ??
        data?.totalPages ??
        Math.ceil((content?.length || 0) / itemsPerPage),
    );
  };

  const fetchInitialInvoiceData = async (pageNumber = 0) => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axiosInstance.get(
        `/api/unified-bookings/list?page=${pageNumber}&size=${itemsPerPage}`,
      );

      applyInvoiceResponse(response.data);
    } catch (err) {
      console.error("Error fetching bookings:", err);
      setError(
        err.response?.data?.message ||
          "An error occurred while fetching bookings",
      );
      setInvoiceList([]);
      setTotalElements(0);
      setTotalPages(0);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFilteredInvoiceData = async (pageNumber = 0) => {
    setIsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (agent) params.append("agent", agent);
      if (fromDate) params.append("fromDate", fromDate);
      if (toDate) params.append("toDate", toDate);
      params.append("page", String(pageNumber));
      params.append("limit", String(itemsPerPage));

      const response = await axiosInstance.get(
        `/api/bookings/full-list?${params.toString()}`,
      );

      if (response.data && response.data.success === false) {
        setError(response.data?.message || "Failed to fetch bookings");
        setInvoiceList([]);
        setTotalElements(0);
        setTotalPages(0);
        return;
      }

      applyInvoiceResponse(response.data);
      const pageData = response.data?.bookings || response.data?.data || response.data;
      const content = Array.isArray(pageData)
        ? pageData
        : (pageData?.content || pageData?.bookings || []);
      if (Array.isArray(content) && content.length === 0) {
        toast.success("No bookings found for the selected criteria");
      }
    } catch (err) {
      console.error("Error fetching bookings:", err);
      setError(
        err.response?.data?.message ||
          "An error occurred while fetching bookings",
      );
      setInvoiceList([]);
      setTotalElements(0);
      setTotalPages(0);
    } finally {
      setIsLoading(false);
    }
  };

  // Measure the space left for rows and ask the API for exactly that many.
  // Re-measured (debounced) on resize so the grid stays scrollbar-free.
  useEffect(() => {
    let resizeTimer;

    const measure = () => {
      const element = tableAreaRef.current;
      // Falls back to a viewport estimate so a missing node can never leave
      // the page size at 0, which would stop the list from loading at all.
      const usableHeight = element
        ? element.clientHeight - TABLE_CHROME_PX
        : window.innerHeight - 420;

      const nextRows = Math.min(
        MAX_ROWS_PER_PAGE,
        Math.max(
          MIN_ROWS_PER_PAGE,
          Math.floor(usableHeight / ROW_HEIGHT_PX),
        ),
      );

      if (nextRows === measuredRowsRef.current) return;

      const isFirstMeasurement = measuredRowsRef.current === 0;
      measuredRowsRef.current = nextRows;
      setItemsPerPage(nextRows);
      // A different page size invalidates the current offset.
      if (!isFirstMeasurement) setCurrentPage(1);
    };

    measure();

    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measure, 150);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Load all invoice records by default, then keep pagination on the current
  // data source: initial list until filters are applied, filtered list after.
  useEffect(() => {
    if (!itemsPerPage) return; // wait for the viewport measurement

    if (hasAppliedFilters) {
      fetchFilteredInvoiceData(currentPage - 1);
    } else {
      fetchInitialInvoiceData(currentPage - 1);
    }
  }, [currentPage, hasAppliedFilters, itemsPerPage]);

  const handleSearch = (e) => {
    e.preventDefault();
    const hasSearchCriteria = Boolean(agent || fromDate || toDate);
    if (currentPage !== 1) {
      setHasAppliedFilters(hasSearchCriteria);
      setCurrentPage(1);
    } else if (hasSearchCriteria === hasAppliedFilters) {
      if (hasSearchCriteria) {
        fetchFilteredInvoiceData(0);
      } else {
        fetchInitialInvoiceData(0);
      }
    } else {
      setHasAppliedFilters(hasSearchCriteria);
    }
  };

  // Clears the criteria and returns to the unfiltered first page. Mirrors the
  // branching in handleSearch so the effect below never fires twice.
  const handleReset = () => {
    setFromDate("");
    setToDate("");
    setAgent("");

    if (currentPage !== 1) {
      setHasAppliedFilters(false);
      setCurrentPage(1);
    } else if (hasAppliedFilters) {
      setHasAppliedFilters(false);
    } else {
      fetchInitialInvoiceData(0);
    }
  };

  // Normalize LocalDateTime strings — treats plain "YYYY-MM-DD" as local midnight
  const parseLocal = (str) => {
    if (!str) return null;
    const normalized = String(str).includes("T") ? str : `${str}T00:00:00`;
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? null : d;
  };

  const formatDate = (dateString) => {
    const d = parseLocal(dateString);
    if (!d) return "-";
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatDateTime = (dateTimeString) => {
    const d = parseLocal(dateTimeString);
    if (!d) return "-";
    return (
      d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }) +
      " " +
      d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    );
  };

  const formatDateShort = (dateString) => {
    const d = parseLocal(dateString);
    if (!d) return "-";
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return "-";
    return `AED ${parseFloat(amount).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Shows the booking amount in the currency it was confirmed in: when the
  // row carries a non-AED display currency + converted amount, render that;
  // otherwise fall back to the AED total.
  //
  // billed = true shows what is still invoiced: the backend's invoiceAmount
  // (invoiceDisplayAmount in the display currency) is 0 — or only the
  // non-refundable rooms' share — for a booking cancelled on or before its
  // deadline, in-house or supplier. Rows without it (other booking types,
  // older API) show the booking total.
  const formatBookingAmount = (invoice, billed = true) => {
    if (!invoice) return "-";
    const hasInvoiceAmount =
      billed &&
      invoice.invoiceAmount !== null &&
      invoice.invoiceAmount !== undefined;
    const code = invoice.displayCurrencyCode;
    const amt = Number(invoice.displayAmount);
    if (code && code !== "AED" && Number.isFinite(amt) && amt > 0) {
      const shown =
        hasInvoiceAmount &&
        invoice.invoiceDisplayAmount !== null &&
        invoice.invoiceDisplayAmount !== undefined
          ? Number(invoice.invoiceDisplayAmount)
          : amt;
      return `${code} ${shown.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
    // existing AED formatter
    return formatCurrency(
      hasInvoiceAmount ? invoice.invoiceAmount : invoice.totalRate,
    );
  };

  // Tooltip on the amount cell, so a 0.00 (or reduced) amount explains itself.
  const amountTitle = (invoice) =>
    invoice?.cancelledBeforeDeadline
      ? `Cancelled before the deadline. Booking value: ${formatBookingAmount(
          invoice,
          false,
        )}`
      : formatBookingAmount(invoice);

  const handlePrint = () => {
    window.print();
  };

  const handleExcel = () => {
    // TODO: Implement Excel export functionality
    toast("Excel export functionality coming soon", {
      icon: "ℹ️",
    });
  };

  // Booking extras live in a popover rather than an expanding row: an inline
  // detail row would add height the fixed viewport has no room for.
  const renderDetailPopover = (invoice) => (
    <Popover>
      <Popover.Header as="h6">Booking details</Popover.Header>
      <Popover.Body style={{ fontSize: "0.82rem" }}>
        <div className="mb-2">
          <strong>Hotel name:</strong> <span>{invoice.hotelName || "-"}</span>
        </div>
        <div className="mb-2">
          <strong>Date:</strong>{" "}
          <span>
            {formatDateShort(invoice.checkInDate)} to{" "}
            {formatDateShort(invoice.checkOutDate)}
          </span>
        </div>
        <div>
          <strong>Confirmation code:</strong>{" "}
          <code
            className="bg-white px-2 py-1 rounded"
            style={{ fontSize: "0.75rem", color: "#495057" }}
          >
            {invoice.confirmationCode || "-"}
          </code>
        </div>
      </Popover.Body>
    </Popover>
  );

  const handleInvoiceVoucherClick = async (invoice) => {
    try {
      const invoiceId =
        invoice.bookingId ||
        invoice.hotelId ||
        invoice.id ||
        invoice.bookingCode;

      if (!invoiceId) {
        toast.error("Invoice ID not found");
        return;
      }

      setPdfLoading(true);
      const response = await axiosInstance.post(
        `/api/invoice-generation/generate/${invoiceId}?invoiceType=PROFORMA`,
      );

      if (response.data && response.data.status === "SUCCESS") {
        setPdfUrl(response.data.pdfUrl);
        setShowPdfModal(true);
        toast.success(
          response.data.message || "Invoice generated successfully",
        );
      } else {
        toast.error(response.data?.message || "Failed to generate invoice");
      }
    } catch (err) {
      console.error("Error generating invoice:", err);
      toast.error(err.response?.data?.message || "Failed to generate invoice");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleTaxVoucherClick = async (invoice) => {
    try {
      const invoiceId =
        invoice.bookingId ||
        invoice.hotelId ||
        invoice.id ||
        invoice.bookingCode;

      if (!invoiceId) {
        toast.error("Invoice ID not found");
        return;
      }

      setPdfLoading(true);
      const response = await axiosInstance.post(
        `/api/invoice-generation/generate/${invoiceId}?invoiceType=TAX`,
      );

      if (response.data && response.data.status === "SUCCESS") {
        setPdfUrl(response.data.pdfUrl);
        setShowPdfModal(true);
        toast.success(
          response.data.message || "Tax invoice generated successfully",
        );
      } else {
        toast.error(response.data?.message || "Failed to generate tax invoice");
      }
    } catch (err) {
      console.error("Error generating tax invoice:", err);
      toast.error(
        err.response?.data?.message || "Failed to generate tax invoice",
      );
    } finally {
      setPdfLoading(false);
    }
  };

  const handleClosePdfModal = () => {
    setShowPdfModal(false);
    setPdfUrl("");
  };

  return (
    <div className="invoice-page min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="invoice-main flex-grow-1 p-2 d-flex flex-column">
          <Card className="shadow-sm rounded-xl invoice-flex-fill d-flex flex-column flex-grow-1 overflow-hidden">
            <Card.Header className="d-flex flex-wrap gap-2 justify-content-between align-items-center flex-shrink-0">
              <div className="d-flex align-items-center">
                <Button
                  variant="link"
                  className="p-0 me-3 invoice-no-print"
                  onClick={() => window.history.back()}
                >
                  &lt;&lt; Back
                </Button>
                <h4 className="fw-bold mb-0" style={{ color: "#EC0B43" }}>TAX INVOICE LIST</h4>
                {totalElements > 0 && (
                  <span className="ms-3 text-muted">
                    ({totalElements}{" "}
                    {totalElements === 1 ? "invoice" : "invoices"})
                  </span>
                )}
              </div>
              <div className="d-flex gap-2 invoice-no-print">
                <Button variant="secondary" onClick={handlePrint}>
                  <FaPrint className="me-2" />
                  Print
                </Button>
                <Button variant="secondary" onClick={handleExcel}>
                  <FaFileExcel className="me-2" />
                  Excel
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="p-2 d-flex flex-column flex-grow-1 invoice-flex-fill">
              <Card className="mb-2 border-0 bg-light flex-shrink-0 invoice-no-print">
                <Card.Body className="p-2">
                  <h6 className="fw-semibold mb-2">Search Criteria</h6>
                  <Form onSubmit={handleSearch}>
                    <Row className="g-2 align-items-end">
                      <Col md={3}>
                        <Form.Group controlId="invoiceFromDate">
                          <Form.Label className="mb-1">From Date</Form.Label>
                          <Form.Control
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            max={toDate || undefined}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={3}>
                        <Form.Group controlId="invoiceToDate">
                          <Form.Label className="mb-1">To Date</Form.Label>
                          <Form.Control
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            min={fromDate || undefined}
                          />
                        </Form.Group>
                      </Col>
                      {!isAgentRole && (
                        <Col md={3}>
                          <Form.Group controlId="invoiceAgent">
                            <Form.Label className="mb-1">Agent</Form.Label>
                            <Form.Select
                              value={agent}
                              onChange={(e) => setAgent(e.target.value)}
                              onFocus={agentList}
                            >
                              <option value="">Select Agent</option>
                              {agents.map((agentItem) => (
                                <option key={agentItem.id} value={agentItem.id}>
                                  {agentItem.companyName}
                                </option>
                              ))}
                            </Form.Select>
                          </Form.Group>
                        </Col>
                      )}
                      <Col md={3}>
                        <div className="d-flex gap-2">
                          <Button
                            type="submit"
                            variant="primary"
                            className="flex-grow-1"
                            disabled={isLoading}
                          >
                            <FaSearch className="me-2" />
                            {isLoading ? "Searching..." : "Search"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline-secondary"
                            className="text-nowrap"
                            onClick={handleReset}
                            disabled={isLoading}
                            title="Clear the criteria and show all invoices"
                          >
                            Reset
                          </Button>
                        </div>
                      </Col>
                    </Row>
                  </Form>
                </Card.Body>
              </Card>

              {/* Always rendered so its height can be measured even while the
                  first page is still loading — that height decides the page size. */}
              <div
                ref={tableAreaRef}
                className="invoice-table-area d-flex flex-column flex-grow-1 invoice-flex-fill"
              >
                {isLoading ? (
                <div className="text-center d-flex flex-column align-items-center justify-content-center flex-grow-1">
                  <div
                    className="spinner-border text-primary"
                    role="status"
                    style={{ width: "3rem", height: "3rem" }}
                  >
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <p className="mt-3 text-muted">Loading invoice data...</p>
                </div>
              ) : error ? (
                <div className="alert alert-danger flex-shrink-0" role="alert">
                  {error}
                </div>
              ) : invoiceList.length > 0 ? (
                <Card
                  className="shadow-sm border-0 d-flex flex-column flex-grow-1 invoice-flex-fill"
                  style={{ borderRadius: "8px", overflow: "hidden" }}
                >
                  <Card.Body className="p-0 d-flex flex-column flex-grow-1 invoice-flex-fill">
                    <div className="invoice-table-viewport">
                      <Table
                        hover
                        size="sm"
                        className="mb-0 align-middle table-bordered invoice-table"
                        style={{
                          tableLayout: "fixed",
                          width: "100%",
                          fontSize: "0.82rem",
                          borderCollapse: "separate",
                          borderSpacing: 0,
                        }}
                      >
                        <thead
                          style={{
                            backgroundColor: "#f8f9fa",
                            borderBottom: "2px solid #dee2e6",
                            boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
                            fontSize: "0.68rem",
                            letterSpacing: "0.04em",
                          }}
                        >
                          <tr>
                            <th
                              style={{
                                ...headerCellStyle,
                                textAlign: "center",
                                width: COLUMN_WIDTHS.serial,
                              }}
                            >
                              S.N
                            </th>
                            <th
                              style={{
                                ...headerCellStyle,
                                width: COLUMN_WIDTHS.customer,
                              }}
                            >
                              Customer
                            </th>
                            <th
                              style={{
                                ...headerCellStyle,
                                textAlign: "center",
                                width: COLUMN_WIDTHS.details,
                              }}
                            >
                              <span className="visually-hidden">Details</span>
                            </th>
                            <th
                              style={{
                                ...headerCellStyle,
                                width: COLUMN_WIDTHS.agent,
                              }}
                            >
                              Agent
                            </th>
                            <th
                              style={{
                                ...headerCellStyle,
                                width: COLUMN_WIDTHS.bookingCode,
                              }}
                            >
                              Booking Code
                            </th>
                            <th
                              style={{
                                ...headerCellStyle,
                                width: COLUMN_WIDTHS.bookingDate,
                              }}
                            >
                              Booking Date
                            </th>
                            <th
                              style={{
                                ...headerCellStyle,
                                width: COLUMN_WIDTHS.hotel,
                              }}
                            >
                              Hotel Name
                            </th>
                            <th
                              style={{
                                ...headerCellStyle,
                                width: COLUMN_WIDTHS.checkIn,
                              }}
                            >
                              Check-In
                            </th>
                            <th
                              style={{
                                ...headerCellStyle,
                                width: COLUMN_WIDTHS.checkOut,
                              }}
                            >
                              Check-Out
                            </th>
                            <th
                              style={{
                                ...headerCellStyle,
                                textAlign: "right",
                                width: COLUMN_WIDTHS.amount,
                              }}
                            >
                              Total Amount
                            </th>
                            <th
                              style={{
                                ...headerCellStyle,
                                textAlign: "center",
                                width: COLUMN_WIDTHS.action,
                              }}
                            >
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoiceList.map((invoice, index) => {
                            const serialNumber =
                              (currentPage - 1) * itemsPerPage + index + 1;
                            const bookingDate = formatDateTime(
                              invoice.bookingDate,
                            );

                            return (
                              <React.Fragment key={index}>
                                <tr
                                  style={{
                                    backgroundColor:
                                      index % 2 === 0 ? "#ffffff" : "#f8f9fa",
                                    transition: "background-color 0.2s ease",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor =
                                      "#e7f3ff";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor =
                                      index % 2 === 0 ? "#ffffff" : "#f8f9fa";
                                  }}
                                >
                                  <td
                                    className="text-muted fw-semibold"
                                    style={{
                                      ...baseCellStyle,
                                      textAlign: "center",
                                      color: "#6c757d",
                                    }}
                                  >
                                    {serialNumber}
                                  </td>
                                  <td
                                    style={baseCellStyle}
                                    title={invoice.customerName || "-"}
                                  >
                                    <span className="fw-medium text-dark">
                                      {invoice.customerName || "-"}
                                    </span>
                                  </td>
                                  <td
                                    style={{
                                      ...baseCellStyle,
                                      textAlign: "center",
                                    }}
                                  >
                                    <OverlayTrigger
                                      trigger="click"
                                      rootClose
                                      placement="right"
                                      container={document.body}
                                      overlay={renderDetailPopover(invoice)}
                                    >
                                      <Button
                                        variant="link"
                                        className="p-0 border-0 lh-1 align-middle"
                                        style={{ textDecoration: "none" }}
                                        title="Show booking details"
                                      >
                                        <FaPlus
                                          style={{
                                            color: "#28a745",
                                            fontSize: "0.9rem",
                                          }}
                                        />
                                      </Button>
                                    </OverlayTrigger>
                                  </td>
                                  <td
                                    style={baseCellStyle}
                                    title={invoice.agentName || "-"}
                                  >
                                    <span className="fw-medium text-dark">
                                      {invoice.agentName || "-"}
                                    </span>
                                  </td>
                                  <td
                                    style={baseCellStyle}
                                    title={invoice.bookingCode || "-"}
                                  >
                                    <span className="fw-bold text-primary">
                                      {invoice.bookingCode || "-"}
                                    </span>
                                  </td>
                                  <td style={baseCellStyle} title={bookingDate}>
                                    <span className="text-dark">
                                      {bookingDate}
                                    </span>
                                  </td>
                                  <td
                                    style={baseCellStyle}
                                    title={invoice.hotelName || "-"}
                                  >
                                    <span className="fw-medium text-dark">
                                      {invoice.hotelName || "-"}
                                    </span>
                                  </td>
                                  <td style={baseCellStyle}>
                                    <span className="text-dark">
                                      {formatDateShort(invoice.checkInDate)}
                                    </span>
                                  </td>
                                  <td style={baseCellStyle}>
                                    <span className="text-dark">
                                      {formatDateShort(invoice.checkOutDate)}
                                    </span>
                                  </td>
                                  <td
                                    style={{
                                      ...baseCellStyle,
                                      textAlign: "right",
                                    }}
                                    title={amountTitle(invoice)}
                                  >
                                    <span className="fw-bold text-dark">
                                      {formatBookingAmount(invoice)}
                                    </span>
                                  </td>
                                  <td
                                    style={{
                                      ...baseCellStyle,
                                      textAlign: "center",
                                      // Tighter than the other cells so the
                                      // buttons keep the row height, and so
                                      // their labels get the full column.
                                      padding: "0.1rem 0.3rem",
                                      // Nothing to truncate here, and visible
                                      // overflow lets the hover shadow show.
                                      overflow: "visible",
                                    }}
                                  >
                                    <div className="d-flex gap-1 justify-content-center align-items-center">
                                      <button
                                        type="button"
                                        className="invoice-action-btn invoice-action-proforma"
                                        onClick={() =>
                                          handleInvoiceVoucherClick(invoice)
                                        }
                                        title="Generate proforma invoice"
                                        aria-label={`Proforma invoice for booking ${
                                          invoice.bookingCode || ""
                                        }`}
                                      >
                                        <FaFileInvoice />
                                        <span className="invoice-action-label">
                                          Proforma
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        className="invoice-action-btn invoice-action-tax"
                                        onClick={() =>
                                          handleTaxVoucherClick(invoice)
                                        }
                                        title="Generate tax invoice"
                                        aria-label={`Tax invoice for booking ${
                                          invoice.bookingCode || ""
                                        }`}
                                      >
                                        <FaReceipt />
                                        <span className="invoice-action-label">
                                          Tax
                                        </span>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </Table>
                    </div>
                    {/* Pagination - Following BookingReport logic pattern.
                        flex-shrink-0 keeps it pinned below the rows. */}
                    <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center p-1 border-top bg-light flex-shrink-0 invoice-no-print">
                      <div>
                        <small className="text-muted">
                          Showing{" "}
                          {totalElements > 0
                            ? (currentPage - 1) * itemsPerPage + 1
                            : 0}{" "}
                          to{" "}
                          {Math.min(currentPage * itemsPerPage, totalElements)}{" "}
                          of {totalElements} entries
                        </small>
                      </div>
                      <div>
                        <Pagination className="mb-0">
                          <Pagination.Prev
                            onClick={() =>
                              setCurrentPage((prev) => Math.max(1, prev - 1))
                            }
                            disabled={currentPage === 1 || isLoading}
                          />
                          {Array.from(
                            { length: totalPages },
                            (_, i) => i + 1,
                          ).map((pageNum) => {
                            if (
                              pageNum === 1 ||
                              pageNum === totalPages ||
                              (pageNum >= currentPage - 1 &&
                                pageNum <= currentPage + 1)
                            ) {
                              return (
                                <Pagination.Item
                                  key={pageNum}
                                  active={pageNum === currentPage}
                                  onClick={() => setCurrentPage(pageNum)}
                                  disabled={isLoading}
                                >
                                  {pageNum}
                                </Pagination.Item>
                              );
                            } else if (
                              pageNum === currentPage - 2 ||
                              pageNum === currentPage + 2
                            ) {
                              return <Pagination.Ellipsis key={pageNum} />;
                            }
                            return null;
                          })}
                          <Pagination.Next
                            onClick={() =>
                              setCurrentPage((prev) =>
                                Math.min(totalPages, prev + 1),
                              )
                            }
                            disabled={
                              currentPage === totalPages ||
                              totalPages === 0 ||
                              isLoading
                            }
                          />
                        </Pagination>
                      </div>
                    </div>
                  </Card.Body>
                </Card>
              ) : (
                <Card
                  className="shadow-sm border-0 flex-grow-1"
                  style={{ borderRadius: "8px" }}
                >
                  <Card.Body className="d-flex align-items-center justify-content-center h-100">
                    <div className="text-center text-muted">
                      <FaInbox
                        style={{
                          fontSize: "2.5rem",
                          marginBottom: "10px",
                          color: "#adb5bd",
                        }}
                      />
                      {/* The list loads unfiltered on mount, so an empty result
                          only ever means "nothing matched" or "nothing exists". */}
                      <p className="mt-2 mb-0 fs-5">
                        {hasAppliedFilters
                          ? "No invoices match the selected criteria"
                          : "No invoice data available"}
                      </p>
                      {hasAppliedFilters && (
                        <Button
                          variant="outline-secondary"
                          className="mt-3"
                          onClick={handleReset}
                          disabled={isLoading}
                        >
                          Clear filters
                        </Button>
                      )}
                    </div>
                  </Card.Body>
                </Card>
                )}
              </div>
            </Card.Body>
          </Card>

          <Modal
            show={showPdfModal}
            onHide={handleClosePdfModal}
            size="xl"
            centered
            fullscreen="lg-down"
          >
            <Modal.Header closeButton>
              <Modal.Title>Invoice PDF</Modal.Title>
            </Modal.Header>
            <Modal.Body style={{ padding: 0, height: "80vh" }}>
              {pdfLoading ? (
                <div
                  className="d-flex justify-content-center align-items-center"
                  style={{ height: "80vh" }}
                >
                  <div className="text-center">
                    <div
                      className="spinner-border text-primary"
                      role="status"
                      style={{ width: "3rem", height: "3rem" }}
                    >
                      <span className="visually-hidden">Loading...</span>
                    </div>
                    <p className="mt-3 text-muted">Loading PDF...</p>
                  </div>
                </div>
              ) : pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  style={{
                    width: "100%",
                    height: "100%",
                    border: "none",
                    minHeight: "80vh",
                  }}
                  title="Invoice PDF"
                />
              ) : (
                <div
                  className="d-flex justify-content-center align-items-center"
                  style={{ height: "80vh" }}
                >
                  <p className="text-muted">No PDF available</p>
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={handleClosePdfModal}>
                Close
              </Button>
              {pdfUrl && (
                <Button
                  variant="primary"
                  onClick={() => window.open(pdfUrl, "_blank")}
                >
                  Open in New Tab
                </Button>
              )}
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
}
