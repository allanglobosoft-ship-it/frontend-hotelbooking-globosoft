import React, {useEffect, useState, useMemo} from "react";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import BackButton from "../../components/BackButton";
import { Row, Col, Card, Form,Button,Table,Modal,Pagination } from "react-bootstrap";
import { toast } from "react-hot-toast";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import HotelFilter from "../../components/filters/Hotelfilters";
import axiosInstance from "../../components/AxiosInstance";
import Supplier from "../../components/filters/Supplier";
import DestinationCity from "../../components/filters/DestinationCity";

export default function ContractExpiryReport() {

const [contractList,setContractList]=useState([]);
const [currentPage,setCurrentPage]=useState(1);
const [itemsPerPage,setItemsPerPage]=useState(10);
const [tableSearch,setTableSearch]=useState("");
const [showMailModal, setShowMailModal] = useState(false);
const [emailAddress, setEmailAddress] = useState("");
const [isSending, setIsSending] = useState(false);

// Temporary filter states (what user sees/edits)
const [tempFromDate,setTempFromDate]=useState("");
const [tempToDate,setTempToDate]=useState("");
const [tempSelectedHotel,setTempSelectedHotel]=useState("");

// Applied filter states (used for actual filtering)
const [fromDate,setFromDate]=useState("");
const [toDate,setToDate]=useState("");
const [selectedHotel,setSelectedHotel]=useState("");

// Booking-level search filters (sent to /api/report/contractrates on
// Search) — a contract is listed when its hotel has at least one matching
// booking. Service Name is covered by the existing Hotel filter, so it is
// not repeated. The existing From/To Date filters the contract expiration
// date, which is a different dimension than the Service (check-in) Date.
const initialBookingFilters = {
  serviceDateFrom: "",
  serviceDateTo: "",
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
  branch: "",
  status: "",
  supplierId: "",
  bookingType: "",
};
const [tempBookingFilters, setTempBookingFilters] = useState(initialBookingFilters);

// Branch dropdown options (distinct booking locations)
const [branchOptions, setBranchOptions] = useState([]);

const updateBookingFilter = (field, value) =>
  setTempBookingFilters((prev) => ({ ...prev, [field]: value }));

// Store filter options to map IDs to names
const [hotelOptions,setHotelOptions]=useState([]);

const fetchContracts = async (filters = {}) => {
  try {
    // Only send filters that actually carry a value
    const params = {};
    Object.entries(filters).forEach(([key, value]) => {
      const trimmed = typeof value === "string" ? value.trim() : value;
      if (trimmed !== "" && trimmed !== null && trimmed !== undefined) {
        params[key] = trimmed;
      }
    });
    const response = await axiosInstance.get("/api/report/contractrates", { params });
    setContractList(Array.isArray(response.data) ? response.data : []);
  } catch (error) {
    console.error("error fetching data", error);
    toast.error("Failed to load contract data");
  }
};

useEffect(()=>{
  setCurrentPage(1);
},[tableSearch]);

useEffect(()=>{
  fetchContracts();

  // Branch dropdown options come from the distinct booking locations
  const fetchBranches = async ()=>{
    try{
      const response = await axiosInstance.get("/api/report/bookings/branches");
      setBranchOptions(Array.isArray(response.data) ? response.data : []);
    }catch(error){
      console.error("Branch options fetch error", error);
    }
  };
  fetchBranches();
},[])

useEffect(()=>{
  const fetchFilterOptions = async ()=>{
    try{
      const hotelRes = await axiosInstance.get("/api/hotels").catch(()=>({data:[]}));
      setHotelOptions(Array.isArray(hotelRes.data) ? hotelRes.data.map(h=>({id:h.id,name:h.hotelName})):[]);
    }catch(error){
      console.error("failed to fetch filter options",error);
    }
  };
  fetchFilterOptions();
},[])

// Parse an expiration date that may arrive as ISO "YYYY-MM-DD" (what the
// API sends) or legacy "DD/MM/YYYY". Returns a Date at start of day, or
// null when unparseable.
const parseExpirationDate = (value) => {
  if (!value) return null;
  const str = String(value);
  let date;
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    date = new Date(year, month - 1, day);
  } else {
    date = new Date(str);
  }
  if (isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

// Function to calculate status based on expiration date
const getContractStatus = (expirationDate) => {
  const expiryDate = parseExpirationDate(expirationDate);
  if (!expiryDate) return "Inactive";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return expiryDate >= today ? "Live" : "Inactive";
};



const filteredContracts = useMemo(() => {
  return contractList.filter(item => {
    if (!item) return false;

    // Filter 1: Hotel Filter
    if (selectedHotel && selectedHotel.toString().trim()) {
      let matches = false;
      
      // First try to match by ID
      if (item.hotelId && String(item.hotelId) === String(selectedHotel)) {
        matches = true;
      } else {
        // If ID doesn't match, try matching by name
        const selectedHotelName = hotelOptions.find(opt => String(opt.id) === String(selectedHotel))?.name;
        if (selectedHotelName) {
          const hotelNameStr = String(item.hotelName || item.hotel || '').trim();
          const selectedHotelNameStr = String(selectedHotelName || '').trim();
          matches = hotelNameStr === selectedHotelNameStr;
        }
      }
      
      if (!matches) return false;
    }

    // Filter 2: Date Range Filter (on the contract expiration date)
    if ((fromDate && fromDate.trim()) || (toDate && toDate.trim())) {
      const itemDate = parseExpirationDate(item.expirationDate);
      if (!itemDate) {
        return false;
      }

      // Filter by fromDate if provided
      if (fromDate && fromDate.trim()) {
        const fromDateObj = new Date(fromDate);
        if (isNaN(fromDateObj.getTime())) {
          return false; // Invalid date
        }
        fromDateObj.setHours(0, 0, 0, 0);
        if (itemDate < fromDateObj) {
          return false;
        }
      }

      // Filter by toDate if provided
      if (toDate && toDate.trim()) {
        const toDateObj = new Date(toDate);
        if (isNaN(toDateObj.getTime())) {
          return false; // Invalid date
        }
        toDateObj.setHours(23, 59, 59, 999);
        if (itemDate > toDateObj) {
          return false;
        }
      }
    }

    return true; // If all filters pass, include this contract
  });
}, [contractList, selectedHotel, fromDate, toDate, hotelOptions]);

// Filter by search query
const finalFilteredData = useMemo(() => {
  if (!tableSearch || !tableSearch.trim()) {
    return filteredContracts;
  }
  
  const searchLower = tableSearch.trim().toLowerCase();
  return filteredContracts.filter(item => {
    return (
      String(item.rateCode || '').toLowerCase().includes(searchLower) ||
      String(item.hotelType || '').toLowerCase().includes(searchLower) ||
      String(item.hotelName || '').toLowerCase().includes(searchLower) ||
      String(item.expirationDate || '').toLowerCase().includes(searchLower)
    );
  });
}, [filteredContracts, tableSearch]);

// Pagination calculations
const totalPages = useMemo(() => Math.ceil(finalFilteredData.length / itemsPerPage), [finalFilteredData.length, itemsPerPage]);
const startIndex = useMemo(() => (currentPage - 1) * itemsPerPage, [currentPage, itemsPerPage]);
const endIndex = useMemo(() => startIndex + itemsPerPage, [startIndex, itemsPerPage]);
const currentContracts = useMemo(() => finalFilteredData.slice(startIndex, endIndex), [finalFilteredData, startIndex, endIndex]);

// Handle search button click
const handleSearch = async () => {
  // Apply temporary filter values to actual filter values
  setFromDate(tempFromDate || "");
  setToDate(tempToDate || "");
  setSelectedHotel(tempSelectedHotel || "");
  setTableSearch("");
  setCurrentPage(1);
  // Booking-level filters are applied server-side
  await fetchContracts(tempBookingFilters);
};

// Handle reset/clear filters
const handleReset = async () => {
  setTempBookingFilters(initialBookingFilters);
  setTempFromDate("");
  setTempToDate("");
  setTempSelectedHotel("");
  setFromDate("");
  setToDate("");
  setSelectedHotel("");
  setTableSearch("");
  setCurrentPage(1);
  await fetchContracts();
};

const handleSendEmail = async () => {
  // Validate email
  if (!emailAddress || !emailAddress.includes('@')) {
    toast.error("Please enter a valid email address");
    return;
  }

  setIsSending(true);
  try {
    // API call to send email
    const response = await axiosInstance.post('/api/reports/send-email', {
      email: emailAddress,
      reportType: 'contractexpiry',
      filters: {
        fromDate: fromDate,
        toDate: toDate,
        hotelId: selectedHotel
      }
    });

    if (response.data) {
      toast.success("Report sent successfully!");
      setShowMailModal(false);
      setEmailAddress("");
    }
  } catch (error) {
    toast.error("Failed to send email");
  } finally {
    setIsSending(false);
  }
};

 const handlePrint = () => {
    const currentData = finalFilteredData;
    
    if (currentData.length === 0) {
      toast.error("No data to print.");
      return;
    }
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Contract Expiry Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            h1 { text-align: center; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <h1>Contract Expiry Report</h1>
          <table>
            <thead>
              <tr>
                <th>Sl.No</th>
                <th>Rate Code</th>
                <th>Day</th>
                <th>Hotel</th>
                <th>Status</th>
                <th>Expiration Date</th>
              </tr>
            </thead>
            <tbody>
              ${currentData.map((c, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${c.rateCode}</td>
                  <td>${c.day}</td>
                  <td>${c.hotelName}</td>
                  <td>${getContractStatus(c.expirationDate)}</td>
                  <td>${c.expirationDate}</td>
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
    const currentData = finalFilteredData;
    
    if (currentData.length === 0) {
      toast.error("No data to export.");
      return;
    }
    
    const doc = new jsPDF();
    
    // Add title
    doc.text('Contract Expiry Report', 20, 20);
    
    // Add table
    autoTable(doc, {
      head: [['Sl.No', 'Rate Code', 'Day', 'Hotel', 'Status', 'Expiration Date']],
      body: currentData.map((c, index) => [
        index + 1,
        c.rateCode,
        c.day,
        c.hotelName,
        getContractStatus(c.expirationDate),
        c.expirationDate
      ]),
      startY: 30,
    });
    
    // Download PDF
    doc.save('contract-expiry-report.pdf');
  };

  const handleExcel = () => {
    const currentData = finalFilteredData;
    
    if (currentData.length === 0) {
      toast.error("No data to export.");
      return;
    }
    
    const headers = ['Sl.No', 'Rate Code', 'Day', 'Hotel', 'Status', 'Expiration Date'];
    
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
      ...currentData.map((c, index) => [
        index + 1,
        c.rateCode,
        c.day,
        c.hotelName,
        getContractStatus(c.expirationDate),
        c.expirationDate
      ].map(escapeCSV).join(','))
    ].join('\n');

    // Add BOM for UTF-8 to ensure proper Excel encoding
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'contract-expiry-report.csv';
    link.click();
    window.URL.revokeObjectURL(url);
  };


  return (
    <div className="bg-light d-flex flex-column" style={{ minHeight: "100vh" }}>
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />

        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex align-items-center gap-2">
              <BackButton forceFallback fallback="/adminDashboard" />
              <span className="fw-semibold">Contract Expiry Report</span>
            </Card.Header>

            {/* Filters Section */}
            <div className="p-4 bg-light border-bottom">
              <h6 className="fw-bold text-primary mb-3">Booking Details</h6>
              <Row className="align-items-end g-4 mb-4">

                {/* Row 1 — Service / Booking / Cancellation Deadline dates */}
                <Col md={4}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">Service Date</Form.Label>
                    <div className="d-flex gap-2">
                      <Form.Control type="date" size="sm" title="From"
                        value={tempBookingFilters.serviceDateFrom}
                        onChange={(e) => updateBookingFilter("serviceDateFrom", e.target.value)} />
                      <Form.Control type="date" size="sm" title="To"
                        value={tempBookingFilters.serviceDateTo}
                        onChange={(e) => updateBookingFilter("serviceDateTo", e.target.value)} />
                    </div>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">Booking Date</Form.Label>
                    <div className="d-flex gap-2">
                      <Form.Control type="date" size="sm" title="From"
                        value={tempBookingFilters.bookingDateFrom}
                        onChange={(e) => updateBookingFilter("bookingDateFrom", e.target.value)} />
                      <Form.Control type="date" size="sm" title="To"
                        value={tempBookingFilters.bookingDateTo}
                        onChange={(e) => updateBookingFilter("bookingDateTo", e.target.value)} />
                    </div>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">Cancellation Deadline Date</Form.Label>
                    <div className="d-flex gap-2">
                      <Form.Control type="date" size="sm" title="From"
                        value={tempBookingFilters.deadlineDateFrom}
                        onChange={(e) => updateBookingFilter("deadlineDateFrom", e.target.value)} />
                      <Form.Control type="date" size="sm" title="To"
                        value={tempBookingFilters.deadlineDateTo}
                        onChange={(e) => updateBookingFilter("deadlineDateTo", e.target.value)} />
                    </div>
                  </Form.Group>
                </Col>

                {/* Row 2 — Reconfirm / Cancel dates */}
                <Col md={4}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">Reconfirm Date</Form.Label>
                    <div className="d-flex gap-2">
                      <Form.Control type="date" size="sm" title="From"
                        value={tempBookingFilters.reconfirmDateFrom}
                        onChange={(e) => updateBookingFilter("reconfirmDateFrom", e.target.value)} />
                      <Form.Control type="date" size="sm" title="To"
                        value={tempBookingFilters.reconfirmDateTo}
                        onChange={(e) => updateBookingFilter("reconfirmDateTo", e.target.value)} />
                    </div>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">Cancel Date</Form.Label>
                    <div className="d-flex gap-2">
                      <Form.Control type="date" size="sm" title="From"
                        value={tempBookingFilters.cancelDateFrom}
                        onChange={(e) => updateBookingFilter("cancelDateFrom", e.target.value)} />
                      <Form.Control type="date" size="sm" title="To"
                        value={tempBookingFilters.cancelDateTo}
                        onChange={(e) => updateBookingFilter("cancelDateTo", e.target.value)} />
                    </div>
                  </Form.Group>
                </Col>
                <Col md={4} />

                {/* Row 3 — reference / guest text filters */}
                <Col md={4}>
                  <Form.Control size="sm" placeholder="Booking Reference"
                    value={tempBookingFilters.bookingReference}
                    onChange={(e) => updateBookingFilter("bookingReference", e.target.value)} />
                </Col>
                <Col md={4}>
                  <Form.Control size="sm" placeholder="Supplier Reference No."
                    value={tempBookingFilters.supplierReference}
                    onChange={(e) => updateBookingFilter("supplierReference", e.target.value)} />
                </Col>
                <Col md={4}>
                  <Form.Control size="sm" placeholder="Guest Name"
                    value={tempBookingFilters.guestName}
                    onChange={(e) => updateBookingFilter("guestName", e.target.value)} />
                </Col>

                {/* Row 4 — city / branch / status */}
                <Col md={4}>
                  <DestinationCity
                    value={tempBookingFilters.city}
                    onChange={(cityName) => updateBookingFilter("city", cityName)}
                  />
                </Col>
                <Col md={4}>
                  <Form.Select size="sm"
                    value={tempBookingFilters.branch}
                    onChange={(e) => updateBookingFilter("branch", e.target.value)}>
                    <option value="">Select Branch</option>
                    {branchOptions.map((branch) => (
                      <option key={branch} value={branch}>{branch}</option>
                    ))}
                  </Form.Select>
                </Col>
                <Col md={4}>
                  <Form.Select size="sm"
                    value={tempBookingFilters.status}
                    onChange={(e) => updateBookingFilter("status", e.target.value)}>
                    <option value="">ALL</option>
                    <option value="REQUESTED">Requested</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="RECONFIRMED">ReConfirmed</option>
                    <option value="SOLD_OUT">Sold Out</option>
                    <option value="CANCELLED">Cancelled</option>
                  </Form.Select>
                </Col>

                {/* Row 5 — supplier / service type */}
                <Col md={4}>
                  <Supplier
                    value={tempBookingFilters.supplierId}
                    onChange={(id) => updateBookingFilter("supplierId", String(id))}
                  />
                </Col>
                <Col md={4}>
                  <Form.Select size="sm"
                    value={tempBookingFilters.bookingType}
                    onChange={(e) => updateBookingFilter("bookingType", e.target.value)}>
                    <option value="">All Services</option>
                    <option value="NORMAL">Normal</option>
                    <option value="LAST_MINUTE">Last Minute</option>
                  </Form.Select>
                </Col>
                <Col md={4} />
              </Row>

              <h6 className="fw-bold text-primary mb-3">Contract Details</h6>
              <Row className="align-items-end g-4">
                <Col md={2}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">From Date</Form.Label>
                    <Form.Control
                      type="date"
                      size="sm"
                      value={tempFromDate}
                      onChange={(e) => setTempFromDate(e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={2}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">To Date</Form.Label>
                    <Form.Control 
                      type="date" 
                      size="sm" 
                      value={tempToDate}
                      onChange={(e) => setTempToDate(e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={2}>
                  <HotelFilter
                    value={tempSelectedHotel}
                    onChange={setTempSelectedHotel}
                  />
                </Col>
                <Col md={2}>
                  <Button 
                    variant="success" 
                    size="sm" 
                    className="w-100"
                    style={{ backgroundColor: "#676767", borderColor: "#676767" }} onClick={handleSearch}
                  >
                    <i className="fas fa-search me-1"></i>Search
                  </Button>
                </Col>
                <Col md={2}>
                  <Button 
                    variant="outline-secondary" 
                    size="sm" 
                    className="w-100"
                    onClick={handleReset}
                  >
                    <i className="fas fa-redo me-1"></i>Reset
                  </Button>
                </Col>
              </Row>

              {/* Action Buttons */}
              <Row className="mt-4">
                <Col md={12} className="d-flex gap-2 justify-content-end">
                  <Button variant="outline-primary" size="sm" onClick={() => setShowMailModal(true)}>
                    <i className="fas fa-envelope me-1"></i>Mail
                  </Button>
                  <Button variant="outline-secondary" size="sm" onClick={handlePrint}>
                    <i className="fas fa-print me-1"></i>Print
                  </Button>
                  <Button variant="outline-danger" size="sm" onClick={handlePDF}>
                    <i className="fas fa-file-pdf me-1"></i>PDF
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
                    <Form.Select 
                      size="sm" 
                      className="d-inline-block ms-2" 
                      style={{width: '80px'}}
                      value={itemsPerPage}
                      onChange={(e)=>{
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                    >
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
                      value={tableSearch}
                      onChange={(e)=>setTableSearch(e.target.value)}
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
                    <th>Rate Code</th>
                    <th>Day</th>
                    <th>Hotel</th>
                    <th>Status</th>
                    <th>Expiration Date</th>
                  </tr>
                </thead>
                <tbody>
                  {currentContracts.length > 0 ? (
                    currentContracts.map((c, index) => (
                      <tr key={c.id || index}>
                        <td>{startIndex + index + 1}</td>
                        <td>{c.rateCode}</td>
                        <td>{c.day}</td>
                        <td>{c.hotelName}</td>
                        <td>{getContractStatus(c.expirationDate)}</td>
                        <td>{c.expirationDate}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="text-center text-muted py-4">
                        No data found matching your criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>

              {/* Pagination */}
              <div className="d-flex justify-content-between align-items-center p-3 border-top">
                <div>
                  <small className="text-muted">
                    Showing {finalFilteredData.length > 0 ? startIndex + 1 : 0} to {Math.min(endIndex, finalFilteredData.length)} of {finalFilteredData.length} entries
                  </small>
                </div>
                <div>
                  <Pagination className="mb-0">
                    <Pagination.Prev 
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    />
                    
                    {Array.from({length: totalPages}, (_, i) => i + 1).map((pageNum) => {
                      if (
                        pageNum === 1 ||
                        pageNum === totalPages ||
                        (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                      ) {
                        return (
                          <Pagination.Item
                            key={pageNum}
                            active={pageNum === currentPage}
                            onClick={() => setCurrentPage(pageNum)}
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
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages || totalPages === 0}
                    />
                  </Pagination>
                </div>
              </div>
            </Card.Body>
          </Card>
          <Modal show={showMailModal} onHide={() => setShowMailModal(false)} centered>
            <Modal.Header closeButton={!isSending}>
              <Modal.Title>Send Report via Email</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Email Address <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="email"
                    placeholder="Enter recipient email address"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    disabled={isSending}
                  />
                </Form.Group>
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowMailModal(false)} disabled={isSending}>
                Cancel
              </Button>
              <Button variant="success" onClick={handleSendEmail} disabled={isSending || !emailAddress}>
                {isSending ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2"></span>
                    Sending...
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane me-1"></i>Send Email
                  </>
                )}
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
}
