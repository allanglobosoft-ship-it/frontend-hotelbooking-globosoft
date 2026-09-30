import React, {useEffect, useState,useMemo} from "react";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import BackButton from "../../components/BackButton";
import { Row, Col, Card, Form,Button,Table,Modal, Pagination } from "react-bootstrap";
import { toast } from "react-hot-toast";
import axiosInstance from "../../components/AxiosInstance";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import HotelFilter from "../../components/filters/Hotelfilters";
import HotelTypefilters from "../../components/filters/HotelTypefilters";
import HotelCategory from "../../components/filters/HotelCategory";
import MonthFilter from "../../components/filters/MonthFilter";
import Supplier from "../../components/filters/Supplier";
import DestinationCity from "../../components/filters/DestinationCity";

function MonthlyWise() {

  const [inhouseBookings,setInhouseBookings]=useState([]);

const [inhousecurrentPage,setInhouseCurrentPage]=useState(1);
const [inhouseitemsPerPage,setInhouseItemsPerPage]=useState(10);
const [apicurrentPage,setApiCurrentPage]=useState(1);
const [apiitemsPerPage,setApiItemsPerPage]=useState(10);  
const [searchInhouseQuery,setSearchInhouseQuery]=useState("");
const [searchApiQuery,setSearchApiQuery]=useState("");
const [showMailModal, setShowMailModal] = useState(false);
const [emailAddress, setEmailAddress] = useState("");
const [isSending, setIsSending] = useState(false);
const [reportType,setReportType] = useState(null);

 // Temporary filter states (what user sees/edits)
     const [tempmonth,setTempmonth]= useState("");
     const [tempSelectedhotelfilter,setTempSelectedHotelfilter]= useState("");
     const [temphoteltype,setTemphoteltype]=useState("");
     const [temphotelCategories,settempHotelCategories]=useState("");

    // Applied filter states (used for actual filtering)
     const [selectedmonth,setSelectedmonth]= useState("");
     const [selectedhotelfilter,setSelectedHotelfilter]= useState("");
     const [hoteltype,setHotelType]=useState("");
     const [hotelcategories,setHotelCategories]=useState("");

    // Booking-level search filters (sent to the API on Search). The check-in
    // period is covered by the existing Month filter and the hotel by the
    // existing Hotel filter, so Service Date / Service Name are not repeated.
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
      branch: "",
      status: "",
      supplierId: "",
      bookingType: "",
     };
     const [tempBookingFilters, setTempBookingFilters] = useState(initialBookingFilters);
     const [bookingFilters, setBookingFilters] = useState(initialBookingFilters);

     // Branch dropdown options (distinct booking locations)
     const [branchOptions, setBranchOptions] = useState([]);

     const updateBookingFilter = (field, value) =>
      setTempBookingFilters((prev) => ({ ...prev, [field]: value }));

     // Store filter options to map IDs to names
    //  const [monthOptions,setMonthOptions] = useState([]);
     const [hotelfilterOption,setHotelfilterOption]=useState([]);
     const [hotelTypeOptions,setHotelTypeOptions]=useState([]);
     const [hotelCategoriesOptions,setHotelCategoriesOptions]=useState([]);


useEffect(()=>{
setInhouseCurrentPage(1);
},[searchInhouseQuery]);

useEffect(()=>{
setApiCurrentPage(1);
},[searchApiQuery]);

// Helper function to convert month name to number (1-12)
const getMonthNumber = (monthName) => {
  const months = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12
  };
  return months[monthName] || null;
};

// Fetch data on initial load and when the applied month / booking filters change
useEffect(()=>{
  const fetchInhouse = async ()=>{
    try{
      // Build query parameters
      const params = {};

      // Only add month parameter if a month is actually selected by user
      if (selectedmonth && selectedmonth !== "Select" && selectedmonth !== "") {
        const monthNum = getMonthNumber(selectedmonth);
        if (monthNum) {
          params.month = monthNum;
        }
      }
      // If no month is selected, don't add month param - backend will return all data

      // Booking-level filters — only send the ones that carry a value
      Object.entries(bookingFilters).forEach(([key, value]) => {
        const trimmed = typeof value === "string" ? value.trim() : value;
        if (trimmed !== "" && trimmed !== null && trimmed !== undefined) {
          params[key] = trimmed;
        }
      });

      // Build URL with query parameters
      const queryString = new URLSearchParams(params).toString();
      const url = `/api/reports/monthly-wise-bookings${queryString ? `?${queryString}` : ''}`;

      const response = await axiosInstance.get(url);
      setInhouseBookings(response.data || []);
    }catch(error){
      console.error("Error Loading data",error);
      toast.error("Failed to load booking data");
    }
  };

  // Fetch data immediately on mount and when applied filters change
  fetchInhouse();
},[selectedmonth, bookingFilters])

// Branch dropdown options come from the distinct booking locations
useEffect(()=>{
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
      const [hotelRes,hotelFilterRes,hotelCategoriesRes] = await Promise.all([
        axiosInstance.get("/api/hotels").catch(()=>({data:[]})),
       axiosInstance.get("/api/hotelType").catch(()=>({data:[]})),
        axiosInstance.get("/api/hotelcategory").catch(()=>({data:[]}))
      ]);
      setHotelfilterOption(Array.isArray(hotelRes.data) ? hotelRes.data.map(h=>({id:h.id,name:h.hotelName})):[]);
      setHotelTypeOptions(Array.isArray(hotelFilterRes.data) ? hotelFilterRes.data.map(ht=>({id:ht.hotelTypeId,name:ht.name})):[]);
      setHotelCategoriesOptions(Array.isArray(hotelCategoriesRes.data) ? hotelCategoriesRes.data.map(hc=>({id:hc.hotelCategoryId,name:hc})):[]);
    }catch(error){
      console.error("failed to fetch",error);
    }
  };fetchFilterOptions();
},[])


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
      reportType: 'Monthlywise',
      subType: reportType, // 'inhouse' or 'api'
      filters: {
        month: selectedmonth,
        hotelId: selectedhotelfilter,
        hotelTypeId: hoteltype,
        hotelCategoryId: hotelcategories,
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
  const printWindow = window.open('', '_blank');
  
  // Get current filtered data based on report type
  const currentData = reportType === 'inhouse' ? filteredinhousebookings : filteredapiBookings;
  const columns = reportType === 'inhouse' 
    ? ['Sl.No', 'Hotel Name', 'Hotel Type', 'Hotel Category', 'No of Bookings', 'No Of Cancelling']
    : ['Sl.No', 'Hotel Name', 'Platform', 'No Of Booking',"No Of Cancelled Booking"];
  
  printWindow.document.write(`
    <html>
      <head>
        <title>Monthly Wise Report - ${reportType === 'inhouse' ? 'Inhouse' : 'API'}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; font-weight: bold; }
          h1 { text-align: center; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <h1>Monthly Wise Report - ${reportType === 'inhouse' ? 'Inhouse' : 'API'}</h1>
        <table>
          <thead>
            <tr>
              ${columns.map(col => `<th>${col}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${currentData.map((booking, index) => {
              if (reportType === 'inhouse') {
                return `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${booking.hotelName || ''}</td>
                    <td>${booking.hotelType || ''}</td>
                    <td>${booking.hotelCategory || ''}</td>
                    <td>${booking.noOfBooking || booking.noofbooking || 0}</td>
                    <td>${booking.noOfBookingCancelled || booking.noofCancelledbooking || 0}</td>
                  </tr>
                `;
              } else {
                return `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${booking.hotelName || ''}</td>
                    <td>${booking.platform || ''}</td>
                    <td>${booking.noofbooking || 0}</td>
                    <td>${booking.noofCancelledbooking || 0}</td>
                  </tr>
                `;
              }
            }).join('')}
          </tbody>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
};

const handlePDF = () => {
  const doc = new jsPDF();
  
  // Get current filtered data
  const currentData = reportType === 'inhouse' ? filteredinhousebookings : filteredapiBookings;
  
  doc.text(`Monthly Wise Report - ${reportType === 'inhouse' ? 'Inhouse' : 'API'}`, 20, 20);
  
  if (reportType === 'inhouse') {
    autoTable(doc, {
      head: [['Sl.No', 'Hotel Name', 'Hotel Type', 'Hotel Category', 'No of Bookings', 'No Of Cancelling']],
      body: currentData.map((booking, index) => [
        index + 1,
        booking.hotelName || '',
        booking.hotelType || '',
        booking.hotelCategory || '',
        booking.noOfBooking || booking.noofbooking || 0,
        booking.noOfBookingCancelled || booking.noofCancelledbooking || 0,
      ]),
      startY: 30,
    });
  } else {
    autoTable(doc, {
      head: [['Sl.No', 'Hotel Name', 'Platform', 'No Of Booking',"No Of Cancelled Booking"]],
      body: currentData.map((booking, index) => [
        index + 1,
        booking.hotelName || '',
        booking.platform || '',
        booking.noofbooking || 0,
        booking.noofCancelledbooking || 0,
      ]),
      startY: 30,
    });
  }
  
  doc.save(`Monthly-wise-${reportType}-report.pdf`);
};

const handleExcel = () => {
  // Get current filtered data
  const currentData = reportType === 'inhouse' ? filteredinhousebookings : filteredapiBookings;
  const headers = reportType === 'inhouse'
    ? ['Sl.No', 'Hotel Name', 'Hotel Type', 'Hotel Category', 'No of Bookings', 'No Of Cancelling']
    : ['Sl.No', 'Hotel Name', 'Platform', 'No Of Booking',"No Of Cancelled Booking"];
  
  // Create CSV content with proper escaping
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
    ...currentData.map((booking, index) => {
      if (reportType === 'inhouse') {
        return [
          index + 1,
          booking.hotelName || '',
          booking.hotelType || '',
          booking.hotelCategory || '',
          booking.noOfBooking || booking.noofbooking || 0,
          booking.noOfBookingCancelled || booking.noofCancelledbooking || 0,
        ].map(escapeCSV).join(',');
      } else {
        return [
          index + 1,
          booking.hotelName || '',
          booking.platform || '',
          booking.noofbooking || 0,
          booking.noofCancelledbooking || 0,
        ].map(escapeCSV).join(',');
      }
    })
  ].join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Monthly-wise-${reportType}-report.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
};

const handleSearch = () => {
  // Apply temporary filter values to actual filter values — the fetch
  // effect reruns automatically when the applied values change.
  setSelectedmonth(tempmonth);
  setSelectedHotelfilter(tempSelectedhotelfilter);
  setHotelType(temphoteltype);
  setHotelCategories(temphotelCategories);
  setBookingFilters({ ...tempBookingFilters });
  setInhouseCurrentPage(1);
  setApiCurrentPage(1);
};

const handleReset = () => {
  setTempBookingFilters(initialBookingFilters);
  setTempmonth("");
  setTempSelectedHotelfilter("");
  setTemphoteltype("");
  settempHotelCategories("");
  setBookingFilters(initialBookingFilters);
  setSelectedmonth("");
  setSelectedHotelfilter("");
  setHotelType("");
  setHotelCategories("");
  setSearchInhouseQuery("");
  setInhouseCurrentPage(1);
};


const apiBookings = [
  {
    slNo: 1,
    hotelName: "Jumeirah Beach Hotel",
    platform: "jumeirah",
    noofbooking: "20",
    noofCancelledbooking: 12,
  },
  {
    slNo: 2,
    hotelName: "Jumeirah Beach Hotel",
    platform: "Direct Client",
    noofbooking: "24",
    noofCancelledbooking: 1,
  },
  {
   slNo: 3,
    hotelName: "Jumeirah Beach Hotel",
    platform: "Globo",
    noofbooking: "24",
    noofCancelledbooking: 8,
  },
  {
    slNo: 4,
    hotelName: "Jumeirah Beach Hotel",
    platform: "jumeirah",
    noofbooking: "14",
    noofCancelledbooking: 5,
  }
];

const filteredapiBookings = apiBookings.filter(a=>{
  const search=searchApiQuery.toLowerCase();
  return(
    a.hotelName.toLowerCase().includes(search)||
    a.platform.toLowerCase().includes(search)||
    String(a.noofbooking).toLowerCase().includes(search)||
    String(a.noofCancelledbooking).toLowerCase().includes(search)
  )

})

// const filteredinhousebookings=inhouseBookings.filter(a=>{
//   const search=searchInhouseQuery.toLowerCase();
//   return(
//     a.hotelName.toLowerCase().includes(search)||
//     a.hotelType.toLowerCase().includes(search)||
//     String(a.hotelCategory).toLowerCase().includes(search)||
//     String(a.noofbooking).toLowerCase().includes(search)||
//     String(a.noofcancelledbooking).toLowerCase().includes(search)
//   )
// })

const filteredinhousebookings = useMemo(() => {
  return inhouseBookings.filter(a => {
    if (!a) return false;

    // Filter 1: Month Filter - Note: Month filtering is primarily done on backend via API
    // This check ensures data consistency (backend should handle the actual filtering)
    // If backend doesn't filter properly, we can add client-side date filtering here
    // For now, we rely on backend filtering via API parameters

    // Filter 2: Hotel Filter
    if (selectedhotelfilter) {
      let matches = false;
      
      // First try to match by ID (most reliable)
      if (a.hotelId && String(a.hotelId) === String(selectedhotelfilter)) {
        matches = true;
      } else {
        // If ID doesn't match, try matching by name
        const selectedHotelName = hotelfilterOption.find(opt => String(opt.id) === String(selectedhotelfilter))?.name;
        if (selectedHotelName) {
          const hotelNameStr = String(a.hotelName || '').trim().toLowerCase();
          const selectedHotelNameStr = String(selectedHotelName || '').trim().toLowerCase();
          matches = hotelNameStr === selectedHotelNameStr;
        }
      }
      
      if (!matches) return false;
    }

    // Filter 3: Hotel Type Filter
    if (hoteltype) {
      let matches = false;
      
      // First try to match by ID
      if (a.hotelTypeId && String(a.hotelTypeId) === String(hoteltype)) {
        matches = true;
      } else {
        // If ID doesn't match, try matching by name
        const selectedTypeName = hotelTypeOptions.find(opt => String(opt.id) === String(hoteltype))?.name;
        if (selectedTypeName) {
          const hotelTypeStr = String(a.hotelType || '').trim().toLowerCase();
          const selectedTypeStr = String(selectedTypeName || '').trim().toLowerCase();
          matches = hotelTypeStr === selectedTypeStr;
        }
      }
      
      if (!matches) return false;
    }

    // Filter 4: Hotel Category Filter
    if (hotelcategories) {
      let matches = false;
      
      // First try to match by ID
      if (a.hotelCategoryId && String(a.hotelCategoryId) === String(hotelcategories)) {
        matches = true;
      } else {
        // If ID doesn't match, try matching by category name/value
        const selectedCategory = hotelCategoriesOptions.find(opt => String(opt.id) === String(hotelcategories));
        if (selectedCategory) {
          const categoryValue = selectedCategory.name?.hotelCategory || selectedCategory.name;
          const bookingCategoryStr = String(a.hotelCategory || '').trim();
          const selectedCategoryStr = String(categoryValue || '').trim();
          matches = bookingCategoryStr === selectedCategoryStr || 
                   bookingCategoryStr.includes(selectedCategoryStr) ||
                   selectedCategoryStr.includes(bookingCategoryStr);
        }
      }
      
      if (!matches) return false;
    }

    // Filter 5: Text Search (using searchInhouseQuery - the applied one)
    if (searchInhouseQuery && searchInhouseQuery.trim()) {
      const search = searchInhouseQuery.trim().toLowerCase();
      const matchesSearch =
        (a.hotelName && String(a.hotelName).toLowerCase().includes(search)) ||
        (a.hotelType && String(a.hotelType).toLowerCase().includes(search)) ||
        (a.hotelCategory && String(a.hotelCategory).toLowerCase().includes(search)) ||
        (a.noOfBooking && String(a.noOfBooking).toLowerCase().includes(search)) ||
        (a.noOfBookingCancelled && String(a.noOfBookingCancelled).toLowerCase().includes(search));
      
      if (!matchesSearch) return false;
    }

    return true; // If all filters pass, include this booking
  });
}, [inhouseBookings, selectedmonth, selectedhotelfilter, hoteltype, hotelcategories, searchInhouseQuery, hotelfilterOption, hotelTypeOptions, hotelCategoriesOptions]);


 const Inhousetotalpages = useMemo(() => Math.ceil(filteredinhousebookings.length / inhouseitemsPerPage), [filteredinhousebookings.length, inhouseitemsPerPage]);
 const inhouseStartIndex = useMemo(() => (inhousecurrentPage -1)* inhouseitemsPerPage, [inhousecurrentPage, inhouseitemsPerPage]);
 const inhouseEndIndex = useMemo(() => inhouseStartIndex + inhouseitemsPerPage, [inhouseStartIndex, inhouseitemsPerPage]);
 const currentInhousebooking = useMemo(() => filteredinhousebookings.slice(inhouseStartIndex,inhouseEndIndex), [filteredinhousebookings, inhouseStartIndex, inhouseEndIndex]);


const Apitotalpages = Math.ceil(filteredapiBookings.length / apiitemsPerPage);
const apiStartIndex =(apicurrentPage -1) * apiitemsPerPage;
const apiEndIndex = apiStartIndex + apiitemsPerPage;
const currentApibooking = filteredapiBookings.slice(apiStartIndex,apiEndIndex);

  return (
    <div className="bg-light d-flex flex-column" style={{ minHeight: "100vh" }}>
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />

        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex align-items-center gap-2">
              <BackButton forceFallback fallback="/adminDashboard" />
              <span className="fw-semibold">Monthly Wise Report</span>
            </Card.Header>

            {/* Filters Section */}
            <div className="p-4 bg-light border-bottom">
              <Form>
                <Form.Group>
                  <Form.Label className="fw-semibold">* Please select:</Form.Label>
                  <div className="d-flex gap-3 mt-2">
                    <Form.Check
                      type="radio"
                      label="Inhouse"
                      name="reportType"
                      onChange={() => setReportType('inhouse')}
                    />
                    <Form.Check
                      type="radio"
                      label="API"
                      name="reportType"
                      style={{display:"none"}}
                      onChange={() => setReportType('api')}
                    />
                  </div>
                </Form.Group>
              </Form>

              {/* When reportType is null - show nothing (or a message) */}
              {reportType === null && (
                <div className="text-center text-muted mt-3">
                  Please select a report type above
                </div>
              )}

              {/* When reportType is 'inhouse' - show Inhouse filters */}
              {reportType === 'inhouse' && (
                <>
                  <h6 className="fw-bold text-primary mb-0 mt-4">Booking Details</h6>
                  <Row className="align-items-end g-4 mt-0 mb-2">

                    {/* Row 1 — Booking / Cancellation Deadline / Reconfirm dates */}
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

                    {/* Row 2 — Cancel date */}
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
                    <Col md={8} />

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

                  <h6 className="fw-bold text-primary mb-0 mt-2">Stay Details</h6>
                  <Row className="align-items-end g-4 mt-0">
                    {/* Month */}
                    <Col md={2}>
                      <MonthFilter
                        value={tempmonth}
                        onChange={setTempmonth}
                      />
                    </Col>

                  {/* Hotel */}
<Col md={2}>
  <HotelFilter
    value={tempSelectedhotelfilter}
    onChange={setTempSelectedHotelfilter}
  />
</Col>

{/* Hotel Type */}
<Col md={2}>
  <HotelTypefilters
    value={temphoteltype}
    onChange={setTemphoteltype}
  />
</Col>

{/* Hotel Category */}
<Col md={2}>
  <HotelCategory
    value={temphotelCategories}
    onChange={settempHotelCategories}
  />
</Col>
                    {/* Search / Reset Buttons */}
                    <Col md={3}>
                      <div className="d-flex gap-2">
                        <Button variant="success" className="w-50" size="sm" style={{ backgroundColor: "#676767", borderColor: "#676767" }} onClick={handleSearch}>
                          <i className="fas fa-search me-1"></i>Search
                        </Button>
                        <Button variant="outline-secondary" className="w-50" size="sm" onClick={handleReset}>
                          <i className="fas fa-undo me-1"></i>Reset
                        </Button>
                      </div>
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

                  {/* Search Input */}
                  <Row className="mt-3">
                    <Col className="d-flex justify-content-end">
                      <input
                        type="text"
                        value={searchInhouseQuery}
                        onChange={(e)=>setSearchInhouseQuery(e.target.value)}
                        placeholder="search here"
                        className="form-control form-control-sm w-auto"
                      />
                    </Col>
                  </Row>
                </>
              )}

              {/* When reportType is 'api' - show API filters */}
              {reportType === 'api' && (
                <>
                  <Row className="align-items-end g-4 mt-3">
                    {/* Month */}
                    <Col md={3}>
                      <MonthFilter
                        value={tempmonth}
                        onChange={setTempmonth}
                      />
                    </Col>

                    {/* Search Button */}
                    <Col md={3}>
                      <Button variant="success" className="w-100" size="sm" style={{ backgroundColor: "#676767", borderColor: "#676767" }} onClick={handleSearch}>
                        <i className="fas fa-search me-1"></i>Search
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

                  {/* Search Input */}
                  <Row className="mt-3">
                    <Col className="d-flex justify-content-end">
                      <input
                        type="text"
                        value={searchApiQuery}
                        onChange={(e)=>setSearchApiQuery(e.target.value)}
                        placeholder="search here"
                        className="form-control form-control-sm w-auto"
                      />
                    </Col>
                  </Row>
                </>
              )}
            </div>

            {/* Table Section */}
            <Card.Body className="p-0 mt-1">
              {/* Display Dropdown - Only for Inhouse */}
              {reportType === 'inhouse' && (
                <div className="p-2 border-bottom">
                  <Row className="d-flex justify-content-between align-items-center">
                    <Col md="auto">
                      <span className="text-muted">Display</span>
                      <Form.Select size="sm" className="d-inline-block ms-2" style={{width: '80px'}}
                        value={inhouseitemsPerPage}
                        onChange={(e)=>{setInhouseItemsPerPage(Number(e.target.value))
                          setInhouseCurrentPage(1);
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
              )}

              {/* Display Dropdown - Only for API */}
              {reportType === 'api' && (
                <div className="p-2 border-bottom">
                  <Row className="d-flex justify-content-between align-items-center">
                    <Col md="auto">
                      <span className="text-muted">Display</span>
                      <Form.Select size="sm" className="d-inline-block ms-2" style={{width: '80px'}}
                        value={apiitemsPerPage}
                        onChange={(e)=>{setApiItemsPerPage(Number(e.target.value))
                          setApiCurrentPage(1);
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
              )}

              {/* INHOUSE TABLE */}
              {reportType === 'inhouse' && (
                <>
                  <Table responsive hover striped className="mb-0 align-middle">
                    <thead>
                      <tr>
                        <th style={{ width: 100 }}>S/N</th>
                        <th>Hotel Name</th>
                        <th>Hotel Type</th>
                        <th>Hotel Category</th>
                        <th>No of Booking</th>
                        <th>No of Cancelling</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentInhousebooking.map((booking,index) => (
                        <tr key={index}>
                          <td>{inhouseStartIndex + index + 1}</td>
                          <td>{booking.hotelName}</td>
                          <td>{booking.hotelType}</td>
                          <td>{booking.hotelCategory} Star</td>
                          <td>{booking.noOfBooking}</td>
                          <td>{booking.noOfBookingCancelled}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  
                  {/* Pagination */}
                  <div className="d-flex justify-content-between align-items-center p-3 border-top">
                    <div>
                      <small className="text-muted">
                        Showing {filteredinhousebookings.length > 0 ? inhouseStartIndex + 1 : 0} to {Math.min(inhouseEndIndex, filteredinhousebookings.length)} of {filteredinhousebookings.length} entries
                      </small>
                    </div>
                    <div>
                      <Pagination className="mb-0">
                        <Pagination.Prev onClick={()=> setInhouseCurrentPage(prev=> Math.max(1,prev-1))}
                          disabled={inhousecurrentPage === 1}/>

                        {Array.from({length:Inhousetotalpages},(_,i)=>i+1).map((pageNum)=>{
                          if(
                            pageNum === 1||
                            pageNum === Inhousetotalpages ||
                            (pageNum >= inhousecurrentPage -1 && pageNum <=inhousecurrentPage+1)
                          ){
                            return(
                              <Pagination.Item
                              key={pageNum}
                              active={pageNum === inhousecurrentPage}
                              onClick={()=>setInhouseCurrentPage(pageNum)}>
                                {pageNum}
                              </Pagination.Item>
                            )
                          }else if(
                            pageNum === inhousecurrentPage -2||
                            pageNum === inhousecurrentPage +2
                          ){
                            return <Pagination.Ellipsis key={pageNum}/>
                          }
                          return null;
                        })}

                        <Pagination.Next onClick={()=> setInhouseCurrentPage(prev=>Math.min(Inhousetotalpages,prev+1))}
                          disabled={inhousecurrentPage === Inhousetotalpages || Inhousetotalpages === 0}/>

                      </Pagination>
                    </div>
                  </div>
                </>
              )}

              {/* API TABLE */}
              {reportType === 'api' && (
                <>
                  <Table responsive hover striped className="mb-0 align-middle">
                    <thead>
                      <tr>
                        <th style={{ width: 100 }}>S/N</th>
                        <th>Hotel Name</th>
                        <th>Platform</th>
                        <th>No Of Booking</th>
                        <th>No Of Cancelled Booking</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentApibooking.map((booking,index) => (
                        <tr key={index}>
                          <td>{apiStartIndex + index + 1}</td>
                          <td>{booking.hotelName}</td>
                          <td>{booking.platform}</td>
                          <td>{booking.noofbooking}</td>
                          <td>{booking.noofCancelledbooking}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>

                  {/* Pagination */}
                  <div className="d-flex justify-content-between align-items-center p-3 border-top">
                    <div>
                      <small className="text-muted">
                        Showing {filteredapiBookings.length > 0 ? apiStartIndex + 1 : 0} to {Math.min(apiEndIndex, filteredapiBookings.length)} of {filteredapiBookings.length} entries
                      </small>
                    </div>
                    <div>
                      <Pagination className="mb-0">
                        <Pagination.Prev onClick={()=>setApiCurrentPage(prev =>Math.max(1,prev-1))}
                          disabled={apicurrentPage === 1}/>

                        {Array.from({length:Apitotalpages},(_,i)=>i+1).map((pageNum)=>{
                          if(
                            pageNum === 1||
                            pageNum === Apitotalpages||
                            (pageNum >= apicurrentPage -1 && pageNum <=apicurrentPage+1)
                          ){
                            return(
                              <Pagination.Item
                              key={pageNum}
                              active={pageNum===apicurrentPage}
                              onClick={()=>setApiCurrentPage(pageNum)}>
                                {pageNum}
                              </Pagination.Item>
                            )
                          }else if(
                            pageNum === apicurrentPage -2||
                            pageNum === apicurrentPage +2
                          ){
                            return <Pagination.Ellipsis key={pageNum}/>
                          }
                          return null;
                        })}

                        <Pagination.Next onClick={()=>setApiCurrentPage(prev =>Math.min(Apitotalpages,prev+1))}
                          disabled={apicurrentPage === Apitotalpages || Apitotalpages === 0}/>

                      </Pagination>
                    </div>
                  </div>
                </>
              )}
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

export default MonthlyWise;
