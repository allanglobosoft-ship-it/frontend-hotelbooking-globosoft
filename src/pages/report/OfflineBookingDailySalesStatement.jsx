import React, { useEffect, useState, useMemo } from "react";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import {
  Row,
  Col,
  Card,
  Form,
  Button,
  Table,
  Pagination,
} from "react-bootstrap";
import Agent from "../../components/filters/Agent";
import Staff from "../../components/filters/Staff";
import axiosInstance from "../../components/AxiosInstance";
import Supplier from "../../components/filters/Supplier";
import DestinationCity from "../../components/filters/DestinationCity";
import { toast } from "react-hot-toast";
import BackButton from "../../components/BackButton";

export default function OfflineBookingDailySalesStatement() {

  const [sales, setSales] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Server-side search filters (sent to /api/report/offline-daily-sales on
  // Search). From/To Date filters the booking (sales) date, so the standard
  // Booking Date range is not repeated; the Supplier dropdown already exists.
  const initialFilters = {
    // Sales Details
    fromDate: "",
    toDate: "",
    agentId: "",
    staffId: "",
    supplierId: "",
    // Booking Details
    serviceDateFrom: "",
    serviceDateTo: "",
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
    bookingType: "",
  };
  const [tempFilters, setTempFilters] = useState(initialFilters);

  // Branch dropdown options (distinct booking locations)
  const [branchOptions, setBranchOptions] = useState([]);

  const updateFilter = (field, value) =>
    setTempFilters((prev) => ({ ...prev, [field]: value }));

  const activeRole = (localStorage.getItem("currentActiveRole") || "").trim().toUpperCase();
  const storedRoles = (localStorage.getItem("userRole") || "").toUpperCase();
  const isAgentRole = activeRole ? activeRole === "AGENT" : (storedRoles.includes("AGENT") && !storedRoles.includes("ADMIN"));

  const fetchSales = async (filters = {}) => {
    try {
      // Only send filters that actually carry a value
      const params = {};
      Object.entries(filters).forEach(([key, value]) => {
        const trimmed = typeof value === "string" ? value.trim() : value;
        if (trimmed !== "" && trimmed !== null && trimmed !== undefined) {
          params[key] = trimmed;
        }
      });
      const response = await axiosInstance.get("/api/report/offline-daily-sales", { params });
      setSales(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Offline daily sales fetch error", error);
      toast.error("Failed to load sales data");
      setSales([]);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    fetchSales();

    // Branch dropdown options come from the distinct booking locations
    const fetchBranches = async () => {
      try {
        const response = await axiosInstance.get("/api/report/bookings/branches");
        setBranchOptions(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error("Branch options fetch error", error);
      }
    };
    fetchBranches();
  }, []);

  const handleSearch = async () => {
    setCurrentPage(1);
    await fetchSales(tempFilters);
  };

  const handleReset = async () => {
    setTempFilters(initialFilters);
    setSearchQuery("");
    setCurrentPage(1);
    await fetchSales();
  };

  const formatDate = (value) => (value ? String(value).split("T")[0] : "_");

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Offline Booking Daily Sales Statement</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            h1 { text-align: center; margin-bottom: 20px; }
            td.details { white-space: pre-line; }
          </style>
        </head>
        <body>
          <h1>Offline Booking Daily Sales Statement</h1>
          <table>
            <thead>
              <tr>
                <th>Sl.No</th>
                <th>Date</th>
                <th>Invoice No</th>
                <th>Supplier</th>
                <th>Agent</th>
                <th>Booking By</th>
                <th>Reference</th>
                <th>Details</th>
                 <th>Selling Price</th>
                 <th>Net Price</th>
                  <th>Profit</th>
              </tr>
            </thead>
            <tbody>
              ${filteredsales.map((s, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${formatDate(s.date)}</td>
                  <td>${s.invoiceNumber || ''}</td>
                  <td>${s.supplier || ''}</td>
                  <td>${s.agent || ''}</td>
                  <td>${s.bookingBy || ''}</td>
                  <td>${s.reference || ''}</td>
                  <td class="details">${s.details || ''}</td>
                   <td>${s.sellingPrice}</td>
                   <td>${s.netPrice}</td>
                   <td>${s.profit}</td>
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

  const handleExcel = () => {
    const headers = ['Sl.No', 'Date', 'Invoice No', 'Supplier', 'Agent', 'Booking By', 'Reference', 'Details', 'Selling Price', 'Net Price', 'Profit'];

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
      headers.map(escapeCSV).join(','),
      ...filteredsales.map((s, index) => [
        index + 1,
        formatDate(s.date),
        s.invoiceNumber,
        s.supplier,
        s.agent,
        s.bookingBy,
        s.reference,
        s.details,
        s.sellingPrice,
        s.netPrice,
        s.profit
      ].map(escapeCSV).join(','))
    ].join('\n');

    // Add BOM for UTF-8 to ensure proper Excel encoding
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Offline Booking Daily Sales Statement.csv';
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Structured filters are applied server-side; only the quick text search
  // filters client-side.
  const filteredsales = useMemo(() => {
    return sales.filter(s => {
      if (!searchQuery || !searchQuery.trim()) return true;
      const search = searchQuery.trim().toLowerCase();
      return (
        String(s.date || '').toLowerCase().includes(search) ||
        String(s.invoiceNumber || '').toLowerCase().includes(search) ||
        String(s.supplier || '').toLowerCase().includes(search) ||
        String(s.agent || '').toLowerCase().includes(search) ||
        String(s.bookingBy || '').toLowerCase().includes(search) ||
        String(s.reference || '').toLowerCase().includes(search) ||
        String(s.details || '').toLowerCase().includes(search) ||
        String(s.sellingPrice || '').toLowerCase().includes(search) ||
        String(s.netPrice || '').toLowerCase().includes(search) ||
        String(s.profit || '').toLowerCase().includes(search)
      );
    });
  }, [sales, searchQuery]);

  const totalPages = useMemo(() => Math.ceil(filteredsales.length / itemsPerPage), [filteredsales.length, itemsPerPage]);
  const startIndex = useMemo(() => (currentPage - 1) * itemsPerPage, [currentPage, itemsPerPage]);
  const endIndex = useMemo(() => startIndex + itemsPerPage, [startIndex, itemsPerPage]);
  const currentSales = useMemo(() => filteredsales.slice(startIndex, endIndex), [filteredsales, startIndex, endIndex]);

  return (
    <div className="bg-light d-flex flex-column" style={{ minHeight: "100vh" }}>
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />

        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex align-items-center gap-2">
              <BackButton forceFallback fallback={isAgentRole ? "/agentDashboard" : "/adminDashboard"} />
              <span className="fw-semibold">Offline Daily Sales Statement Report</span>
            </Card.Header>

            {/* Filters Section */}
            <div className="p-4 bg-light border-bottom">
              <h6 className="fw-bold text-primary mb-3">Booking Details</h6>
              <Row className="align-items-end g-4 mb-4">

                {/* Row 1 — Service / Cancellation Deadline / Reconfirm dates */}
                <Col md={4}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">Service Date</Form.Label>
                    <div className="d-flex gap-2">
                      <Form.Control type="date" size="sm" title="From"
                        value={tempFilters.serviceDateFrom}
                        onChange={(e) => updateFilter("serviceDateFrom", e.target.value)} />
                      <Form.Control type="date" size="sm" title="To"
                        value={tempFilters.serviceDateTo}
                        onChange={(e) => updateFilter("serviceDateTo", e.target.value)} />
                    </div>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">Cancellation Deadline Date</Form.Label>
                    <div className="d-flex gap-2">
                      <Form.Control type="date" size="sm" title="From"
                        value={tempFilters.deadlineDateFrom}
                        onChange={(e) => updateFilter("deadlineDateFrom", e.target.value)} />
                      <Form.Control type="date" size="sm" title="To"
                        value={tempFilters.deadlineDateTo}
                        onChange={(e) => updateFilter("deadlineDateTo", e.target.value)} />
                    </div>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">Reconfirm Date</Form.Label>
                    <div className="d-flex gap-2">
                      <Form.Control type="date" size="sm" title="From"
                        value={tempFilters.reconfirmDateFrom}
                        onChange={(e) => updateFilter("reconfirmDateFrom", e.target.value)} />
                      <Form.Control type="date" size="sm" title="To"
                        value={tempFilters.reconfirmDateTo}
                        onChange={(e) => updateFilter("reconfirmDateTo", e.target.value)} />
                    </div>
                  </Form.Group>
                </Col>

                {/* Row 2 — Cancel date */}
                <Col md={4}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">Cancel Date</Form.Label>
                    <div className="d-flex gap-2">
                      <Form.Control type="date" size="sm" title="From"
                        value={tempFilters.cancelDateFrom}
                        onChange={(e) => updateFilter("cancelDateFrom", e.target.value)} />
                      <Form.Control type="date" size="sm" title="To"
                        value={tempFilters.cancelDateTo}
                        onChange={(e) => updateFilter("cancelDateTo", e.target.value)} />
                    </div>
                  </Form.Group>
                </Col>
                <Col md={8} />

                {/* Row 3 — reference / guest text filters */}
                <Col md={4}>
                  <Form.Control size="sm" placeholder="Booking Reference"
                    value={tempFilters.bookingReference}
                    onChange={(e) => updateFilter("bookingReference", e.target.value)} />
                </Col>
                <Col md={4}>
                  <Form.Control size="sm" placeholder="Supplier Reference No."
                    value={tempFilters.supplierReference}
                    onChange={(e) => updateFilter("supplierReference", e.target.value)} />
                </Col>
                <Col md={4}>
                  <Form.Control size="sm" placeholder="Guest Name"
                    value={tempFilters.guestName}
                    onChange={(e) => updateFilter("guestName", e.target.value)} />
                </Col>

                {/* Row 4 — service / city / branch */}
                <Col md={4}>
                  <Form.Control size="sm" placeholder="Service Name"
                    value={tempFilters.serviceName}
                    onChange={(e) => updateFilter("serviceName", e.target.value)} />
                </Col>
                <Col md={4}>
                  <DestinationCity
                    value={tempFilters.city}
                    onChange={(cityName) => updateFilter("city", cityName)}
                  />
                </Col>
                <Col md={4}>
                  <Form.Select size="sm"
                    value={tempFilters.branch}
                    onChange={(e) => updateFilter("branch", e.target.value)}>
                    <option value="">Select Branch</option>
                    {branchOptions.map((branch) => (
                      <option key={branch} value={branch}>{branch}</option>
                    ))}
                  </Form.Select>
                </Col>

                {/* Row 5 — status / service type */}
                <Col md={4}>
                  <Form.Select size="sm"
                    value={tempFilters.status}
                    onChange={(e) => updateFilter("status", e.target.value)}>
                    <option value="">ALL</option>
                    <option value="REQUESTED">Requested</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="RECONFIRMED">ReConfirmed</option>
                    <option value="SOLD_OUT">Sold Out</option>
                    <option value="CANCELLED">Cancelled</option>
                  </Form.Select>
                </Col>
                <Col md={4}>
                  <Form.Select size="sm"
                    value={tempFilters.bookingType}
                    onChange={(e) => updateFilter("bookingType", e.target.value)}>
                    <option value="">All Services</option>
                    <option value="NORMAL">Normal</option>
                    <option value="LAST_MINUTE">Last Minute</option>
                  </Form.Select>
                </Col>
                <Col md={4} />
              </Row>

              <h6 className="fw-bold text-primary mb-3">Sales Details</h6>
              <Row className="align-items-end g-4">
                <Col md={2}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">From Date</Form.Label>
                    <Form.Control type="date" size="sm"
                    value={tempFilters.fromDate}
                    onChange={(e) => updateFilter("fromDate", e.target.value)} />
                  </Form.Group>
                </Col>
                <Col md={2}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">To Date</Form.Label>
                    <Form.Control type="date" size="sm"
                    value={tempFilters.toDate}
                    onChange={(e) => updateFilter("toDate", e.target.value)} />
                  </Form.Group>
                </Col>
                {!isAgentRole && (
                <Col md={3}>
                 <Agent
                 value={tempFilters.agentId}
                 onChange={(id) => updateFilter("agentId", String(id))}/>
                </Col>
                )}
                <Col md={3}>
                 <Staff
                 value={tempFilters.staffId}
                 onChange={(id) => updateFilter("staffId", String(id))}/>
                </Col>
                <Col md={2}>
                  <Supplier
                    value={tempFilters.supplierId}
                    onChange={(id) => updateFilter("supplierId", String(id))}
                  />
                </Col>
                <Col md={12} className="d-flex justify-content-end gap-2 mt-3">
                  <Button variant="success" size="sm" style={{ backgroundColor: "#676767", borderColor: "#676767" }} onClick={handleSearch}>
                    <i className="fas fa-search me-1"></i>Search
                  </Button>
                  <Button variant="outline-secondary" size="sm" onClick={handleReset}>
                    <i className="fas fa-undo me-1"></i>Reset
                  </Button>
                </Col>
              </Row>

              {/* Action Buttons */}
              <Row className="mt-4">
                <Col md={12} className="d-flex gap-2 justify-content-end">
                  <Button variant="outline-secondary" size="sm" onClick={handlePrint}>
                    <i className="fas fa-print me-1"></i>Print
                  </Button>
                  <Button variant="outline-success" size="sm" onClick={handleExcel}>
                    <i className="fas fa-file-excel me-1"></i>Excel
                  </Button>
                </Col>
              </Row>
            </div>

            {/* Table Section */}
            <Card.Body className="p-0 mt-1">
              {/* Display and Search Row */}
              <div className="p-2 border-bottom">
                <Row className="d-flex justify-content-between align-items-center">
                  <Col md="auto">
                    <span className="text-muted">Display</span>
                    <Form.Select size="sm" className="d-inline-block ms-2" style={{width: '80px'}}
                      value={itemsPerPage}
                      onChange={(e)=>{setItemsPerPage(Number(e.target.value))
                        setCurrentPage(1);
                      }}>
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </Form.Select>
                    <span className="text-muted ms-2">records</span>
                  </Col>
                  <Col md="auto">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e)=>setSearchQuery(e.target.value)}
                      placeholder="search here"
                      className="form-control form-control-sm w-auto"
                    />
                  </Col>
                </Row>
              </div>

              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>S/N</th>
                    <th>Date</th>
                    <th>Invoice Number</th>
                    <th>Supplier Name</th>
                    <th>Agent Name</th>
                    <th>Booking Done By</th>
                    <th>Reference Number</th>
                    <th>Booking Details</th>
                    <th>Selling Price</th>
                    <th>Net Price</th>
                    <th>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {currentSales.length > 0 ? (
                    currentSales.map((s, index) => (
                      <tr key={s.bookingId}>
                        <td>{startIndex + index + 1}</td>
                        <td>{formatDate(s.date)}</td>
                        <td>{s.invoiceNumber}</td>
                        <td>{s.supplier}</td>
                        <td>{s.agent}</td>
                        <td>{s.bookingBy}</td>
                        <td>{s.reference}</td>
                        <td style={{ whiteSpace: "pre-line" }}>{s.details}</td>
                        <td>{s.sellingPrice}</td>
                        <td>{s.netPrice}</td>
                        <td>{s.profit}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="11" className="text-center text-muted py-4">
                        No data available in table
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>

              {/* Pagination */}
              <div className="d-flex justify-content-between align-items-center p-3 border-top">
                <div>
                  <small className="text-muted">
                    Showing {filteredsales.length > 0 ? startIndex + 1 : 0} to {Math.min(endIndex, filteredsales.length)} of {filteredsales.length} entries
                  </small>
                </div>
                <div>
                  <Pagination className="mb-0">
                    <Pagination.Prev onClick={()=>setCurrentPage(prev=>Math.max(1,prev-1))}
                      disabled={currentPage === 1}/>

                    {Array.from({length:totalPages},(_,i)=>i+1).map((pageNum)=>{
                      if(
                        pageNum === 1||
                        pageNum === totalPages||
                        (pageNum >= currentPage -1 && pageNum <= currentPage+1)
                      ){
                        return(
                          <Pagination.Item
                          key={pageNum}
                          active={pageNum === currentPage}
                          onClick={()=>setCurrentPage(pageNum)}>
                            {pageNum}
                          </Pagination.Item>
                        )
                      }else if(
                        pageNum === currentPage +2||
                        pageNum === currentPage -2
                      ){
                        return <Pagination.Ellipsis key={pageNum}/>
                      }
                      return null;
                    })}

                    <Pagination.Next onClick={() => setCurrentPage(prev=>Math.min(totalPages,prev+1))}
                      disabled={currentPage === totalPages || totalPages === 0}/>

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
