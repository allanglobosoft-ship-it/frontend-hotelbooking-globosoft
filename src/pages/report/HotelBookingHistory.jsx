import React, { useEffect, useState } from "react";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import BackButton from "../../components/BackButton";
import { Row, Col, Card, Form, Button, Table, Pagination } from "react-bootstrap";
import { toast } from "react-hot-toast";
import axiosInstance from "../../components/AxiosInstance";
import AgentSelect from "../../components/AgentSelect";
import Supplier from "../../components/filters/Supplier";
import DestinationCity from "../../components/filters/DestinationCity";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Report → Hotel Booking History (admin only).
 *
 * Lists the search snapshots the booking page saves to
 * /api/search-history/save the moment an agent lands on it — i.e. hotels
 * that were selected from a New Booking search but whose booking tab was
 * closed before the booking was created. Confirmed bookings are flagged
 * server-side and drop off this list automatically.
 */
export default function HotelBookingHistory() {

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  // Agent filter — dropdown of active agents; "" means All Agents.
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState("");

  // Standard booking-level filters — this page's rows are abandoned search
  // snapshots, so only the ones that map to search-history fields have any
  // effect: bookingDateFrom/To (search creation time), city (destination),
  // serviceName (hotel name). The rest are shown for consistency with the
  // other report pages and are inert against this data source.
  const initialBookingFilters = {
    bookingDateFrom: "",
    bookingDateTo: "",
    deadlineDateFrom: "",
    deadlineDateTo: "",
    reconfirmDateFrom: "",
    reconfirmDateTo: "",
    cancelDateFrom: "",
    cancelDateTo: "",
    bookingReference: "",
    supplierReference: "",
    city: "",
    guestName: "",
    serviceName: "",
    branch: "",
    status: "",
    supplierId: "",
    bookingType: "",
  };
  const [bookingFilters, setBookingFilters] = useState(initialBookingFilters);

  // Branch dropdown options — pulled from the booking API's distinct locations
  const [branchOptions, setBranchOptions] = useState([]);

  const updateBookingFilter = (field, value) =>
    setBookingFilters((prev) => ({ ...prev, [field]: value }));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, fromDate, toDate, selectedAgent, bookingFilters]);

  useEffect(() => {
    (async () => {
      try {
        const response = await axiosInstance.get("/api/agent?activeOnly=true");
        setAgents(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error("Failed to load agents for filter:", error);
        setAgents([]);
      }
    })();

    // Branch dropdown options come from the distinct booking locations
    (async () => {
      try {
        const response = await axiosInstance.get("/api/report/bookings/branches");
        setBranchOptions(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error("Branch options fetch error", error);
      }
    })();
  }, []);

  const handleReset = () => {
    setBookingFilters(initialBookingFilters);
    setSelectedAgent("");
    setFromDate("");
    setToDate("");
    setSearchQuery("");
    setCurrentPage(1);
  };

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const response = await axiosInstance.get("/api/search-history");
      setHistory(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Failed to load hotel booking history:", error);
      toast.error("Failed to load hotel booking history");
      setHistory([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // "2026-07-15" / "2026-07-15T00:00" → "15/07/2026"; anything unparseable
  // is shown as-is so bad data is visible rather than hidden.
  const formatDate = (value) => {
    if (!value) return "—";
    const datePart = String(value).slice(0, 10);
    const parts = datePart.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return String(value);
  };

  // Whole-stay selling price of the rate picked on the room list,
  // e.g. "AED 107.00".
  const formatRate = (h) =>
    h.sellingPrice != null && !isNaN(Number(h.sellingPrice))
      ? `${h.currency || "AED"} ${Number(h.sellingPrice).toFixed(2)}`
      : "—";

  // ISO "2026-07-06T17:23:45" → "06/07/2026 05:23 PM" — the moment the
  // agent reached the booking page (when the snapshot row was recorded).
  const formatDateTime = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hours12 = String(d.getHours() % 12 || 12).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = d.getHours() >= 12 ? "PM" : "AM";
    return `${dd}/${mm}/${d.getFullYear()} ${hours12}:${minutes} ${ampm}`;
  };

  // Shared by Print / PDF / Excel so all three exports stay in sync with
  // the on-screen table.
  const exportHeaders = [
    'Sl.No',
    'Agent',
    'Hotel Name',
    'Destination / City',
    'Nationality',
    'Check-In',
    'Nights',
    'Check-Out',
    'Rooms & Guests',
    'Room Rate',
    'Booking Date and Time',
  ];

  const exportRow = (h, index) => [
    startIndex + index + 1,
    h.agentName || '—',
    h.hotelName || '—',
    h.destination || '—',
    h.nationality || '—',
    formatDate(h.checkIn),
    h.nights ?? '—',
    formatDate(h.checkOut),
    h.roomsGuests || '—',
    formatRate(h),
    formatDateTime(h.createdAt),
  ];

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Hotel Booking History Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            h1 { text-align: center; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <h1>Hotel Booking History Report</h1>
          <table>
            <thead>
              <tr>
                ${exportHeaders.map((h) => `<th>${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${currentRows.map((h, index) => `
                <tr>
                  ${exportRow(h, index).map((cell) => `<td>${cell}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handlePDF = () => {
    const doc = new jsPDF('landscape');

    // Add title
    doc.text('Hotel Booking History Report', 20, 20);

    // Add table
    autoTable(doc, {
      head: [exportHeaders],
      body: currentRows.map((h, index) => exportRow(h, index)),
      startY: 30,
    });
    // Download PDF
    doc.save('Hotel-Booking-History-report.pdf');
  };

  const handleExcel = () => {
    // Create CSV content with proper escaping
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      // If value contains comma, newline, or quote, wrap it in quotes and escape quotes
      if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    const csvContent = [
      exportHeaders.map(escapeCSV).join(','),
      ...currentRows.map((h, index) =>
        exportRow(h, index).map(escapeCSV).join(','))
    ].join('\n');

    // Add BOM for UTF-8 to ensure proper Excel encoding
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Hotel-Booking-History-report.csv';
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const filteredRows = history.filter((h) => {
    // Agent dropdown filter — each row belongs to exactly one agent id.
    if (selectedAgent && String(h.agentId ?? "") !== String(selectedAgent)) {
      return false;
    }

    // From/To date filter — applied to the check-in date shown in the row.
    const checkInDay = h.checkIn ? String(h.checkIn).slice(0, 10) : "";
    if (fromDate && (!checkInDay || checkInDay < fromDate)) return false;
    if (toDate && (!checkInDay || checkInDay > toDate)) return false;

    // Booking Details filters — those that map to search-history fields.
    // Booking Date range → the search snapshot's createdAt (when the agent
    // reached the booking page).
    const createdDay = h.createdAt ? String(h.createdAt).slice(0, 10) : "";
    if (bookingFilters.bookingDateFrom && (!createdDay || createdDay < bookingFilters.bookingDateFrom)) return false;
    if (bookingFilters.bookingDateTo && (!createdDay || createdDay > bookingFilters.bookingDateTo)) return false;

    // City → destination string
    if (bookingFilters.city) {
      const needle = bookingFilters.city.trim().toLowerCase();
      if (!String(h.destination || "").toLowerCase().includes(needle)) return false;
    }

    // Service Name → hotel name
    if (bookingFilters.serviceName) {
      const needle = bookingFilters.serviceName.trim().toLowerCase();
      if (!String(h.hotelName || "").toLowerCase().includes(needle)) return false;
    }

    // Guest Name → not captured at search time; treated as inert unless the
    // search snapshot ever adds a customer field.
    if (bookingFilters.guestName) {
      const needle = bookingFilters.guestName.trim().toLowerCase();
      const guestField = String(h.guestName || h.customerName || "").toLowerCase();
      if (guestField && !guestField.includes(needle)) return false;
      if (!guestField) return false;
    }

    const search = searchQuery.toLowerCase();
    if (!search) return true;
    return (
      String(h.agentName || "").toLowerCase().includes(search) ||
      String(h.destination || "").toLowerCase().includes(search) ||
      String(h.nationality || "").toLowerCase().includes(search) ||
      String(h.hotelName || "").toLowerCase().includes(search) ||
      String(h.roomsGuests || "").toLowerCase().includes(search)
    );
  });

  const totalPages = Math.ceil(filteredRows.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentRows = filteredRows.slice(startIndex, endIndex);

  return (
    <div className="bg-light d-flex flex-column" style={{ minHeight: "100vh" }}>
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />

        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2 py-3">
              <div className="d-flex align-items-center gap-2">
                <BackButton forceFallback fallback="/adminDashboard" />
                <div>
                  <span className="fw-semibold">
                    <i className="fas fa-history me-2"></i>
                    Hotel Booking History
                  </span>
                  <div className="text-muted small mt-1">
                    Hotel searches that reached the booking page but were not
                    completed — entries are kept for one month
                  </div>
                </div>
              </div>
              <span className="badge rounded-pill bg-light text-muted border fw-normal">
                {filteredRows.length}{" "}
                {filteredRows.length === 1 ? "entry" : "entries"}
              </span>
            </Card.Header>

            {/* Filters & export actions — one compact row so the table gets
                the vertical space, with the quick-search on its own line. */}
            <div className="p-4 bg-light border-bottom">
              <h6 className="fw-bold text-primary mb-3">Booking Details</h6>
              <Row className="align-items-end g-4 mb-4">

                {/* Row 1 — Booking / Cancellation Deadline / Reconfirm dates */}
                <Col md={4}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">Booking Date</Form.Label>
                    <div className="d-flex gap-2">
                      <Form.Control type="date" size="sm" title="From"
                        value={bookingFilters.bookingDateFrom}
                        onChange={(e) => updateBookingFilter("bookingDateFrom", e.target.value)} />
                      <Form.Control type="date" size="sm" title="To"
                        value={bookingFilters.bookingDateTo}
                        onChange={(e) => updateBookingFilter("bookingDateTo", e.target.value)} />
                    </div>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">Cancellation Deadline Date</Form.Label>
                    <div className="d-flex gap-2">
                      <Form.Control type="date" size="sm" title="From"
                        value={bookingFilters.deadlineDateFrom}
                        onChange={(e) => updateBookingFilter("deadlineDateFrom", e.target.value)} />
                      <Form.Control type="date" size="sm" title="To"
                        value={bookingFilters.deadlineDateTo}
                        onChange={(e) => updateBookingFilter("deadlineDateTo", e.target.value)} />
                    </div>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">Reconfirm Date</Form.Label>
                    <div className="d-flex gap-2">
                      <Form.Control type="date" size="sm" title="From"
                        value={bookingFilters.reconfirmDateFrom}
                        onChange={(e) => updateBookingFilter("reconfirmDateFrom", e.target.value)} />
                      <Form.Control type="date" size="sm" title="To"
                        value={bookingFilters.reconfirmDateTo}
                        onChange={(e) => updateBookingFilter("reconfirmDateTo", e.target.value)} />
                    </div>
                  </Form.Group>
                </Col>

                {/* Row 2 — Cancel date */}
                <Col md={4}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">Cancel Date</Form.Label>
                    <div className="d-flex gap-2">
                      <Form.Control type="date" size="sm" title="From"
                        value={bookingFilters.cancelDateFrom}
                        onChange={(e) => updateBookingFilter("cancelDateFrom", e.target.value)} />
                      <Form.Control type="date" size="sm" title="To"
                        value={bookingFilters.cancelDateTo}
                        onChange={(e) => updateBookingFilter("cancelDateTo", e.target.value)} />
                    </div>
                  </Form.Group>
                </Col>
                <Col md={8} />

                {/* Row 3 — reference / guest text filters */}
                <Col md={4}>
                  <Form.Control size="sm" placeholder="Booking Reference"
                    value={bookingFilters.bookingReference}
                    onChange={(e) => updateBookingFilter("bookingReference", e.target.value)} />
                </Col>
                <Col md={4}>
                  <Form.Control size="sm" placeholder="Supplier Reference No."
                    value={bookingFilters.supplierReference}
                    onChange={(e) => updateBookingFilter("supplierReference", e.target.value)} />
                </Col>
                <Col md={4}>
                  <Form.Control size="sm" placeholder="Guest Name"
                    value={bookingFilters.guestName}
                    onChange={(e) => updateBookingFilter("guestName", e.target.value)} />
                </Col>

                {/* Row 4 — service / city / branch */}
                <Col md={4}>
                  <Form.Control size="sm" placeholder="Service Name"
                    value={bookingFilters.serviceName}
                    onChange={(e) => updateBookingFilter("serviceName", e.target.value)} />
                </Col>
                <Col md={4}>
                  <DestinationCity
                    value={bookingFilters.city}
                    onChange={(cityName) => updateBookingFilter("city", cityName)}
                  />
                </Col>
                <Col md={4}>
                  <Form.Select size="sm"
                    value={bookingFilters.branch}
                    onChange={(e) => updateBookingFilter("branch", e.target.value)}>
                    <option value="">Select Branch</option>
                    {branchOptions.map((branch) => (
                      <option key={branch} value={branch}>{branch}</option>
                    ))}
                  </Form.Select>
                </Col>

                {/* Row 5 — status / supplier / service type */}
                <Col md={4}>
                  <Form.Select size="sm"
                    value={bookingFilters.status}
                    onChange={(e) => updateBookingFilter("status", e.target.value)}>
                    <option value="">ALL</option>
                    <option value="REQUESTED">Requested</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="RECONFIRMED">ReConfirmed</option>
                    <option value="SOLD_OUT">Sold Out</option>
                    <option value="CANCELLED">Cancelled</option>
                  </Form.Select>
                </Col>
                <Col md={4}>
                  <Supplier
                    value={bookingFilters.supplierId}
                    onChange={(id) => updateBookingFilter("supplierId", String(id))}
                  />
                </Col>
                <Col md={4}>
                  <Form.Select size="sm"
                    value={bookingFilters.bookingType}
                    onChange={(e) => updateBookingFilter("bookingType", e.target.value)}>
                    <option value="">All Services</option>
                    <option value="NORMAL">Normal</option>
                    <option value="LAST_MINUTE">Last Minute</option>
                  </Form.Select>
                </Col>
              </Row>

              <h6 className="fw-bold text-primary mb-3">Search Details</h6>
              <Row className="align-items-end g-3">
                <Col lg={3} md={6}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2 fw-semibold">
                      <i className="fas fa-user-tie me-1"></i>
                      Agent
                    </Form.Label>
                    <AgentSelect
                      agents={agents}
                      value={selectedAgent}
                      onChange={(v) => setSelectedAgent(v)}
                      placeholder="All Agents"
                    />
                  </Form.Group>
                </Col>
                <Col lg={2} md={6}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2 fw-semibold">
                      <i className="far fa-calendar-alt me-1"></i>
                      From Date (Check-In)
                    </Form.Label>
                    <Form.Control
                      type="date"
                      size="sm"
                      className="shadow-sm"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col lg={2} md={6}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2 fw-semibold">
                      <i className="far fa-calendar-alt me-1"></i>
                      To Date (Check-In)
                    </Form.Label>
                    <Form.Control
                      type="date"
                      size="sm"
                      className="shadow-sm"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col lg={2} md={6}>
                  <div className="d-flex gap-2">
                    <Button
                      variant="success"
                      size="sm"
                      onClick={fetchHistory}
                      disabled={isLoading}
                      className="w-50 shadow-sm"
                      style={{ backgroundColor: "#676767", borderColor: "#676767" }}
                    >
                      <i className="fas fa-search me-1"></i>
                      {isLoading ? "..." : "Search"}
                    </Button>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={handleReset}
                      disabled={isLoading}
                      className="w-50 shadow-sm"
                    >
                      <i className="fas fa-undo me-1"></i>Reset
                    </Button>
                  </div>
                </Col>
                <Col
                  lg={3}
                  md={12}
                  className="d-flex gap-2 justify-content-lg-end flex-wrap"
                >
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="shadow-sm"
                    onClick={handlePrint}
                  >
                    <i className="fas fa-print me-1"></i>Print
                  </Button>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    className="shadow-sm"
                    onClick={handlePDF}
                  >
                    <i className="fas fa-file-pdf me-1"></i>PDF
                  </Button>
                  <Button
                    variant="outline-success"
                    size="sm"
                    className="shadow-sm"
                    onClick={handleExcel}
                  >
                    <i className="fas fa-file-excel me-1"></i>Excel
                  </Button>
                </Col>
              </Row>

              {/* Search Input */}
              <Row className="mt-3">
                <Col className="d-flex justify-content-end">
                  <div className="position-relative" style={{ width: 260 }}>
                    <i
                      className="fas fa-search position-absolute text-muted"
                      style={{
                        left: 12,
                        top: "50%",
                        transform: "translateY(-50%)",
                        pointerEvents: "none",
                      }}
                    ></i>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="search here"
                      className="form-control form-control-sm shadow-sm"
                      style={{ paddingLeft: 34, borderRadius: 20 }}
                    />
                  </div>
                </Col>
              </Row>
            </div>

            {/* Table Section */}
            <Card.Body className="p-0 mt-1">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>S/N</th>
                    <th>Agent</th>
                    <th>Hotel Name</th>
                    <th>Destination / City</th>
                    <th>Nationality</th>
                    <th>Check-In</th>
                    <th>Nights</th>
                    <th>Check-Out</th>
                    <th>Rooms & Guests</th>
                    <th>Room Rate</th>
                    <th>Booking Date and Time</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan="11" className="text-center text-muted py-4">
                        <span className="spinner-border spinner-border-sm me-2"></span>
                        Loading...
                      </td>
                    </tr>
                  ) : currentRows.length > 0 ? (
                    currentRows.map((h, index) => (
                      <tr key={h.id || index}>
                        <td>{startIndex + index + 1}</td>
                        <td className="fw-semibold">{h.agentName || "—"}</td>
                        <td>{h.hotelName || "—"}</td>
                        <td>{h.destination || "—"}</td>
                        <td>{h.nationality || "—"}</td>
                        <td className="text-nowrap">{formatDate(h.checkIn)}</td>
                        <td>{h.nights ?? "—"}</td>
                        <td className="text-nowrap">{formatDate(h.checkOut)}</td>
                        <td>
                          {h.roomsGuests ? (
                            <span
                              className="badge rounded-pill bg-light text-dark border fw-normal"
                              style={{ fontSize: "inherit" }}
                            >
                              {h.roomsGuests}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="text-nowrap fw-semibold">
                          {formatRate(h)}
                        </td>
                        <td className="text-nowrap">
                          {formatDateTime(h.createdAt)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="11" className="text-center text-muted py-5">
                        <i
                          className="fas fa-inbox d-block mb-2"
                          style={{ fontSize: "1.5rem", opacity: 0.35 }}
                        ></i>
                        No data available in table
                        <div className="small mt-1">
                          Entries appear here when a hotel is selected from a
                          New Booking search but the booking page is closed
                          before the booking is confirmed.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>

              {/* Pagination */}
              <div className="d-flex justify-content-between align-items-center p-3 border-top">
                <div>
                  <small className="text-muted">
                    Showing {filteredRows.length > 0 ? startIndex + 1 : 0} to {Math.min(endIndex, filteredRows.length)} of {filteredRows.length} entries
                  </small>
                </div>
                <div>
                  <Pagination className="mb-0">
                    <Pagination.Prev onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1} />

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                      if (
                        pageNum === 1 ||
                        pageNum === totalPages ||
                        (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                      ) {
                        return (
                          <Pagination.Item
                            key={pageNum}
                            active={pageNum === currentPage}
                            onClick={() => setCurrentPage(pageNum)}>
                            {pageNum}
                          </Pagination.Item>
                        )
                      } else if (
                        pageNum === currentPage - 2 ||
                        pageNum === currentPage + 2
                      ) {
                        return <Pagination.Ellipsis key={pageNum} />;
                      }
                      return null;
                    })}

                    <Pagination.Next onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages || totalPages === 0} />
                  </Pagination>
                </div>
              </div>
            </Card.Body>
          </Card>

        </main>
      </div>
    </div>
  );
}
