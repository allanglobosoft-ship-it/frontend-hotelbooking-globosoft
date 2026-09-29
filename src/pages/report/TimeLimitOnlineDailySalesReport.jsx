import React, { useState, useMemo, useEffect } from "react";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import { Row, Col, Card, Form, Button, Table, Pagination } from "react-bootstrap";
import Agent from "../../components/filters/Agent";
import Staff from "../../components/filters/Staff";
import axiosInstance from "../../components/AxiosInstance";
import Supplier from "../../components/filters/Supplier";
import DestinationCity from "../../components/filters/DestinationCity";
import { toast } from "react-hot-toast";
import BackButton from "../../components/BackButton";

export default function TimeLimitOnlineDailySalesReport() {

  const [timeList, setTimeList] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");

  // Server-side search filters (sent to /api/reports/timeLimitSales on Search).
  // From/To Date filters the booking (sales) date, so the standard Booking
  // Date range is not repeated; the Supplier dropdown already exists.
  const initialFilters = {
    // Sales Details
    fromDate: "",
    toDate: "",
    agentId: "",
    employeeId: "",
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
      const response = await axiosInstance.get("/api/reports/timeLimitSales", { params });
      const data = Array.isArray(response.data) ? response.data : [];
      setTimeList(data);
      return data;
    } catch (error) {
      console.error("error while fetching data", error);
      toast.error("Failed to fetch data");
      setTimeList([]);
      return [];
    }
  };

  useEffect(() => {
    // Initial load — backend defaults to the last month when no dates given
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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleSearch = async () => {
    setCurrentPage(1);
    const data = await fetchSales(tempFilters);
    toast.success(`Found ${data.length} record(s)`);
  };

  const handleReset = async () => {
    setTempFilters(initialFilters);
    setSearchQuery("");
    setCurrentPage(1);
    await fetchSales();
  };

  const formatDetails = (r) => {
    if (r.bookingDetails) {
      const d = r.bookingDetails;
      const hotel = d.hotelName || d.hotelname || 'N/A';
      const from = d.checkInDate || d.checkIndate || '';
      const to = d.checkOutDate || d.checktodate || '';
      return `${hotel}\n${from} - ${to}`;
    }
    return r.details || 'N/A';
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
      <head>
      <title>Time Limit Online Sales Report</title>
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
            <h1>Time Limit Online Sales Report</h1>
            <table>
            <thead>
            <tr>
            <th>SI:No</th>
            <th>Agent</th>
            <th>Supplier</th>
            <th>Customer</th>
            <th>Booking Code</th>
            <th>Reference</th>
            <th>Booking By</th>
            <th>Book Date</th>
            <th>Details</th>
            <th>DeadLine</th>
            </tr>
            </thead>
            <tbody>
            ${currentreports.map((r, index) =>
              `<tr>
              <td>${index + 1}</td>
               <td>${r.agentName || ''}</td>
               <td>${r.supplierName || ''}</td>
               <td>${r.customerName || ''}</td>
               <td>${r.bookingCode || ''}</td>
               <td>${r.referenceCode || ''}</td>
               <td>${r.bookingDoneBy || ''}</td>
               <td>${r.bookingDate ? r.bookingDate.split('T')[0] : '_'}</td>
               <td class="details">${formatDetails(r)}</td>
               <td>${r.deadlineDate ? r.deadlineDate.split('T')[0] : '_'}</td>
              </tr>
              `
            ).join('')}
            </tbody>
            </table>
            </body>
      </html>
      `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleExcel = () => {
    const headers = [
      'SI.No', 'Agent', 'Supplier', 'Customer', 'Booking Code',
      'Reference', 'BookingBy', 'BookDate', 'Details', 'Deadline Date'
    ];

    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    const csvContent = [
      headers.map(escapeCSV).join(','),
      ...currentreports.map((r, index) => [
        index + 1,
        r.agentName || '',
        r.supplierName || '',
        r.customerName || '',
        r.bookingCode || '',
        r.referenceCode || '',
        r.bookingDoneBy || '',
        r.bookingDate ? r.bookingDate.split('T')[0] : '_',
        formatDetails(r),
        r.deadlineDate ? r.deadlineDate.split('T')[0] : '_'
      ].map(escapeCSV).join(','))
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Time Limit Online Daily Sales Report .csv';
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Structured filters are applied server-side; only the quick text search
  // filters client-side.
  const filteredreports = useMemo(() => {
    return timeList.filter(a => {
      if (!searchQuery || !searchQuery.trim()) return true;
      const search = searchQuery.trim().toLowerCase();
      return (
        String(a.agentName || '').toLowerCase().includes(search) ||
        String(a.supplierName || '').toLowerCase().includes(search) ||
        String(a.customerName || '').toLowerCase().includes(search) ||
        String(a.bookingCode || '').toLowerCase().includes(search) ||
        String(a.referenceCode || '').toLowerCase().includes(search) ||
        String(a.bookingDoneBy || '').toLowerCase().includes(search) ||
        String(a.bookingDate || '').toLowerCase().includes(search) ||
        String(a.details || '').toLowerCase().includes(search) ||
        String(a.deadlineDate || '').toLowerCase().includes(search)
      );
    });
  }, [timeList, searchQuery]);


  const totalPages = useMemo(() => Math.ceil(filteredreports.length / itemsPerPage), [filteredreports.length, itemsPerPage]);
  const startIndex = useMemo(() => (currentPage - 1) * itemsPerPage, [currentPage, itemsPerPage]);
  const endIndex = useMemo(() => startIndex + itemsPerPage, [startIndex, itemsPerPage]);
  const currentreports = useMemo(() => filteredreports.slice(startIndex, endIndex), [filteredreports, startIndex, endIndex]);


  return (
    <div className="bg-light d-flex flex-column" style={{ minHeight: "100vh" }}>
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />

        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex align-items-center gap-2">
              <BackButton forceFallback fallback={isAgentRole ? "/agentDashboard" : "/adminDashboard"} />
              <span className="fw-semibold">TimeLimit Online Sales Report</span>
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
                <Col md={2}>
                  <Supplier
                    value={tempFilters.supplierId}
                    onChange={(id) => updateFilter("supplierId", String(id))} />
                </Col>
                {!isAgentRole && (
                <Col md={3}>
                  <Agent
                  value={tempFilters.agentId}
                  onChange={(id) => updateFilter("agentId", String(id))} />
                </Col>
                )}
                <Col md={3}>
                 <Staff
                 value={tempFilters.employeeId}
                 onChange={(id) => updateFilter("employeeId", String(id))} />
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

              {/* Search Input */}
              <Row className="mt-3">
                <Col className="d-flex">
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

            {/* Table Section */}
            <Card.Body className="p-0 mt-1">
              {/* Display Dropdown */}
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
                </Row>
              </div>

              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>S/N</th>
                    <th>Agent Name</th>
                    <th>Supplier Name</th>
                    <th>Customer Name</th>
                    <th>Booking Code</th>
                    <th>Reference Code</th>
                    <th>Booking Done By</th>
                    <th>Book Date</th>
                    <th>Booking Details</th>
                    <th>Deadline Date</th>
                  </tr>
                </thead>
                <tbody>
                  {currentreports.length > 0 ? (
                    currentreports.map((r, index) => (
                      <tr key={index}>
                        <td>{startIndex + index + 1}</td>
                        <td>{r.agentName}</td>
                        <td>{r.supplierName}</td>
                        <td>{r.customerName}</td>
                        <td>{r.bookingCode}</td>
                        <td>{r.referenceCode}</td>
                        <td>{r.bookingDoneBy}</td>
                        <td>{r.bookingDate?.split('T')[0]}</td>
                        <td style={{ whiteSpace: "pre-line" }}>
                          {r.bookingDetails ? (
                            <>
                              {r.bookingDetails.hotelName || r.bookingDetails.hotelname || 'N/A'}<br/>
                              {r.bookingDetails.checkInDate || r.bookingDetails.checkIndate || ''} - {r.bookingDetails.checkOutDate || r.bookingDetails.checktodate || ''}
                            </>
                          ) : r.details ? (
                            r.details
                          ) : (
                            'N/A'
                          )}
                        </td>
                        <td>{r.deadlineDate?.split('T')[0]}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="10" className="text-center text-muted py-4">
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
                    Showing {filteredreports.length > 0 ? startIndex + 1 : 0} to {Math.min(endIndex, filteredreports.length)} of {filteredreports.length} entries
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

                    <Pagination.Next onClick={()=>setCurrentPage(prev=>Math.min(totalPages,prev+1))}
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
