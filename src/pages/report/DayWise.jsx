import React, {useEffect, useState, useMemo} from "react";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import BackButton from "../../components/BackButton";
import { Row, Col, Card, Form,Button,Table,Modal, Pagination } from "react-bootstrap";
import { toast } from "react-hot-toast";
import axiosInstance from "../../components/AxiosInstance";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import HotelTypefilters from "../../components/filters/HotelTypefilters";
import RoomCategory from "../../components/filters/RoomCategory";
import HotelFilter from "../../components/filters/Hotelfilters";
import Supplier from "../../components/filters/Supplier";
import DestinationCity from "../../components/filters/DestinationCity";


function DayWise() {
 
   
   const [inhouseBookings, setInhouseBookings]=useState([]);

   const [inhousecurrentPage,setInhouseCurrentPage]= useState(1);
   const [inhouseitemsPerPage,setInhouseItemsPerPage]= useState(10);
   const [apicurrentPage,setApiCurrentPage]= useState(1);
   const [apiitemsPerPage,setApiItemsPerPage]= useState(10);

   const [inHouseSearchQuery,setInHouseSearchQuery]= useState(""); 
   const[apiSearchQuery,setApiSearchQuery]=useState("");

   const [showMailModal, setShowMailModal] = useState(false);
   const [emailAddress, setEmailAddress] = useState("");
   const [isSending, setIsSending] = useState(false);
   const [reportType,setReportType] = useState(null);

    // Temporary filter states (what user sees/edits)
     const [tempSelectedhotel,setTempSelectedHotel]= useState("");
     const [tempSelectedhoteltype,setTempSelectedHoteltype]= useState("");
     const [tempRoomCategory,setTempRoomCategory]=useState("");

    // Applied filter states (used for actual filtering)
     const [selectedhotel,setSelectedHotel]= useState("");
     const [selectedhoteltype,setSelectedHoteltype]= useState("");
     const [roomCategory,setRoomCategory]=useState("");

     // Store filter options to map IDs to names
     const [hotelOptions, setHotelOptions] = useState([]);
     const [hotelTypeOptions, setHotelTypeOptions] = useState([]);
     const [roomCategoryOptions, setRoomCategoryOptions] = useState([]);

   const[tempFromDate,setTempFromDate]=useState("");
   const[tempToDate,setTempToDate] = useState("");

   const[fromDate,setFromDate]=useState("");
   const[toDate,setToDate]=useState("");

   // Booking-level search filters (sent to /api/report/daywise on Search).
   // Service Date and Service Name are covered by the existing From/To Date
   // and Hotel filters, so they are not repeated here.
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

   // Branch dropdown options (distinct booking locations)
   const [branchOptions, setBranchOptions] = useState([]);

   const updateBookingFilter = (field, value) =>
    setTempBookingFilters((prev) => ({ ...prev, [field]: value }));

   const fetchInhouse = async (filters = {}) => {
    try {
      // Only send filters that actually carry a value
      const params = {};
      Object.entries(filters).forEach(([key, value]) => {
        const trimmed = typeof value === "string" ? value.trim() : value;
        if (trimmed !== "" && trimmed !== null && trimmed !== undefined) {
          params[key] = trimmed;
        }
      });
      const response = await axiosInstance.get("/api/report/daywise", { params });
      setInhouseBookings(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error Fetching Data", error);
      toast.error("Fetching Data Failed");
    }
   };

   useEffect(()=>{
    setApiCurrentPage(1);
   },[apiSearchQuery])

   useEffect(()=>{
    setInhouseCurrentPage(1);
   },[inHouseSearchQuery])

   useEffect(()=>{
    fetchInhouse();

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
    const fetchFilteroptions = async ()=>{
      try{
        const [hotelRes,hotelTypeRes,roomCategoriesRes]= await Promise.all([
          axiosInstance.get("/api/hotels").catch(()=>({data:[]})),
          axiosInstance.get("/api/hotelType").catch(()=>({data:[]})),
          axiosInstance.get("/api/roomCategory").catch(()=>({data:[]}))
        ]);
        setHotelOptions(Array.isArray(hotelRes.data) ? hotelRes.data.map(h=>({ id:h.id, name:h.hotelName})):[]);
        setHotelTypeOptions(Array.isArray(hotelTypeRes.data) ? hotelTypeRes.data.map(ht=>({id:ht.hotelTypeId,name:ht.name})):[]);
        setRoomCategoryOptions(Array.isArray(roomCategoriesRes.data) ? roomCategoriesRes.data.map(rc=>({id:rc.roomCategoryId,name:rc.roomCategory})):[]);
      }catch(error){
        console.error("error fetching filter option",error);
      }
    };fetchFilteroptions();
   },[])
   

const handleSendEmail = async () => {
  // Validate email
  if (!emailAddress || !emailAddress.includes('@')) {
    toast.error("Please enter a valid email address");
    return;
  }

  setIsSending(true);
  try {
    // Get the filtered bookings count to include in the email
    const filteredCount = reportType === 'inhouse' 
      ? filteredinhouseBookings.length 
      : filteredapiBookings.length;
    
    // API call to send email
    const response = await axiosInstance.post('/api/reports/send-email', {
      email: emailAddress,
      reportType: 'daywise',
      subType: reportType, // 'inhouse' or 'api'
      filters: {
        searchQuery: reportType === 'inhouse' ? inHouseSearchQuery : apiSearchQuery,
      },
      recordCount: filteredCount
    });

    if (response.data) {
      toast.success(`Report with ${filteredCount} record(s) sent successfully!`);
      setShowMailModal(false);
      setEmailAddress("");
    }
  } catch (error) {
    console.error("Email send error:", error);
    toast.error(error.response?.data?.message || "Failed to send email");
  } finally {
    setIsSending(false);
  }
};

const handlePrint = () => {
  const printWindow = window.open('', '_blank');
  
  // Get current data based on report type
  const currentData = reportType === 'inhouse' ? filteredinhouseBookings : filteredapiBookings;
  const columns = reportType === 'inhouse' 
    ? ['Sl.No', 'Hotel Name', 'Check In', 'Check Out', 'Hotel Type', 'Room Category', 'No of Rooms', 'Customer Name']
    : ['Sl.No', 'Hotel Name', 'Platform', 'Check In', 'Check Out', 'Hotel Type', 'No of Rooms', 'Customer Name'];
  
  printWindow.document.write(`
    <html>
      <head>
        <title>Day Wise Report - ${reportType === 'inhouse' ? 'Inhouse' : 'API'}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; font-weight: bold; }
          h1 { text-align: center; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <h1>Day Wise Report - ${reportType === 'inhouse' ? 'Inhouse' : 'API'}</h1>
        <table>
          <thead>
            <tr>
              ${columns.map(col => `<th>${col}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${currentData.map((booking,index) => {
              if (reportType === 'inhouse') {
                return `
                  <tr>
                    <td>${index+1}</td>
                    <td>${booking.hotelName}</td>
                    <td>${booking.checkIn}</td>
                    <td>${booking.checkOut}</td>
                    <td>${booking.hotelType}</td>
                    <td>${booking.roomCategory}</td>
                    <td>${booking.roomNo}</td>
                    <td>${booking.customerName}</td>
                  </tr>
                `;
              } else {
                return `
                  <tr>
                    <td>${index+1}</td>
                    <td>${booking.hotelName}</td>
                    <td>${booking.platform}</td>
                    <td>${booking.checkIn}</td>
                    <td>${booking.checkOut}</td>
                    <td>${booking.hotelType}</td>
                    <td>${booking.roomNo}</td>
                    <td>${booking.customerName}</td>
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
  
  // Get current data
  const currentData = reportType === 'inhouse' ? filteredinhouseBookings : filteredapiBookings;
  
  doc.text(`Day Wise Report - ${reportType === 'inhouse' ? 'Inhouse' : 'API'}`, 20, 20);
  
  if (reportType === 'inhouse') {
    autoTable(doc, {
      head: [['Sl.No', 'Hotel Name', 'Check In', 'Check Out', 'Hotel Type', 'Room Category', 'No of Rooms', 'Customer Name']],
      body: currentData.map((booking,index) => [
        index + 1,
        booking.hotelName,
        booking.checkIn,
        booking.checkOut,
        booking.hotelType,
        booking.roomCategory,
        booking.roomNo,
        booking.customerName
      ]),
      startY: 30,
    });
  } else {
    autoTable(doc, {
      head: [['Sl.No', 'Hotel Name', 'Platform', 'Check In', 'Check Out', 'Hotel Type', 'No of Rooms', 'Customer Name']],
      body: currentData.map((booking,index) => [
        index + 1,
        booking.hotelName,
        booking.platform,
        booking.checkIn,
        booking.checkOut,
        booking.hotelType,
        booking.roomNo,
        booking.customerName
      ]),
      startY: 30,
    });
  }
  
  doc.save(`day-wise-${reportType}-report.pdf`);
};

const handleExcel = () => {
  // Get current data
  const currentData = reportType === 'inhouse' ? filteredinhouseBookings : filteredapiBookings;
  const headers = reportType === 'inhouse'
    ? ['Sl.No', 'Hotel Name', 'Check In', 'Check Out', 'Hotel Type', 'Room Category', 'No of Rooms', 'Customer Name']
    : ['Sl.No', 'Hotel Name', 'Platform', 'Check In', 'Check Out', 'Hotel Type', 'No of Rooms', 'Customer Name'];
  
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
    ...currentData.map((booking,index) => {
      if (reportType === 'inhouse') {
        return [
         index + 1,
          booking.hotelName,
          booking.checkIn,
          booking.checkOut,
          booking.hotelType,
          booking.roomCategory,
          booking.roomNo,
          booking.customerName
        ].map(escapeCSV).join(',');
      } else {
        return [
          index + 1,
          booking.hotelName,
          booking.platform,
          booking.checkIn,
          booking.checkOut,
          booking.hotelType,
          booking.roomNo,
          booking.customerName
        ].map(escapeCSV).join(',');
      }
    })
  ].join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `day-wise-${reportType}-report.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
};

const handleSearch = async () => {
  // Apply temporary filter values to actual filter values
  setSelectedHotel(tempSelectedhotel);
  setSelectedHoteltype(tempSelectedhoteltype);
  setRoomCategory(tempRoomCategory);
  setFromDate(tempFromDate);
  setToDate(tempToDate);
  setInhouseCurrentPage(1);
  setApiCurrentPage(1);
  // Booking-level filters are applied server-side
  await fetchInhouse(tempBookingFilters);
 };

const handleReset = async () => {
  setTempBookingFilters(initialBookingFilters);
  setTempSelectedHotel("");
  setTempSelectedHoteltype("");
  setTempRoomCategory("");
  setTempFromDate("");
  setTempToDate("");
  setSelectedHotel("");
  setSelectedHoteltype("");
  setRoomCategory("");
  setFromDate("");
  setToDate("");
  setInHouseSearchQuery("");
  setInhouseCurrentPage(1);
  await fetchInhouse();
 };


const apiBookings = [
  {
    slNo: 1,
    hotelName: "Jumeirah Beach Hotel",
    platform: "jumeirah",
    checkIn: "15/09/2023",
    checkOut: "16/09/2023",
    hotelType: "HOTEL",
    noOfRooms: 1,
    customerName: "Mr. tester jum tester"
  },
  {
    slNo: 2,
    hotelName: "test Hotel",
    platform: "direct",
    checkIn: "15/09/2023",
    checkOut: "16/09/2023",
    hotelType: "HOTEL",
    noOfRooms: 1,
    customerName: "Mr. tester jum tester"
  },
  {
    slNo: 3,
    hotelName: "Jumeirah Beach Hotel",
    platform: "jumeirah",
    checkIn: "12/09/2023",
    checkOut: "13/09/2023",
    hotelType: "villa",
    noOfRooms: 1,
    customerName: "Mr. Dhyan testcase1"
  },
  {
    slNo: 4,
    hotelName: "Jumeirah Beach Hotel",
    platform: "jumeirah",
    checkIn: "20/09/2023",
    checkOut: "21/09/2023",
    hotelType: "HOTEL",
    noOfRooms: 1,
    customerName: "Mr. Amala tset case one"
  }
];

   // Move filter logic inside component using useMemo to make it reactive
   const filteredapiBookings = useMemo(() => {
     if (!apiSearchQuery || !apiSearchQuery.trim()) {
       return apiBookings;
     }
     const search = apiSearchQuery.toLowerCase().trim();
     return apiBookings.filter(a => {
       if (!a) return false;
       return (
         (a.hotelName && String(a.hotelName).toLowerCase().includes(search)) ||
         (a.platform && String(a.platform).toLowerCase().includes(search)) ||
         (a.checkIn && String(a.checkIn).toLowerCase().includes(search)) ||
         (a.checkOut && String(a.checkOut).toLowerCase().includes(search)) ||
         (a.hotelType && String(a.hotelType).toLowerCase().includes(search)) ||
         (a.noOfRooms && String(a.noOfRooms).toLowerCase().includes(search)) ||
         (a.customerName && String(a.customerName).toLowerCase().includes(search))
       );
     });
   }, [apiSearchQuery]);



const filteredinhouseBookings = useMemo(() => {
  return inhouseBookings.filter(a => {
    if (!a) return false;

    // Filter 1: Date Range (From Date to To Date)
    if (fromDate || toDate) {
      // Get the booking date - adjust field name if different (checkIn, bookingDate, etc.)
      const bookingDateStr = a.checkIn ? a.checkIn.split('T')[0] : '';
      
      // Check if booking date is before fromDate
      if (fromDate && bookingDateStr < fromDate) {
        return false;
      }
      
      // Check if booking date is after toDate
      if (toDate && bookingDateStr > toDate) {
        return false;
      }
    }

    // Filter 2: Hotel Filter
    if (selectedhotel) {
      let matches = false;
      
      // First try to match by ID (most reliable)
      if (a.hotelId && String(a.hotelId) === String(selectedhotel)) {
        matches = true;
      } else {
        // If ID doesn't match, try matching by name
        const selectedHotelName = hotelOptions.find(opt => String(opt.id) === String(selectedhotel))?.name;
        if (selectedHotelName) {
          const hotelNameStr = String(a.hotelName || '').trim().toLowerCase();
          const selectedHotelNameStr = String(selectedHotelName || '').trim().toLowerCase();
          matches = hotelNameStr === selectedHotelNameStr;
        }
      }
      
      if (!matches) return false;
    }

    // Filter 3: Hotel Type Filter
    if (selectedhoteltype) {
      let matches = false;
      
      // First try to match by ID
      if (a.hotelTypeId && String(a.hotelTypeId) === String(selectedhoteltype)) {
        matches = true;
      } else {
        // If ID doesn't match, try matching by name
        const selectedTypeName = hotelTypeOptions.find(opt => String(opt.id) === String(selectedhoteltype))?.name;
        if (selectedTypeName) {
          const hotelTypeStr = String(a.hotelType || '').trim().toLowerCase();
          const selectedTypeStr = String(selectedTypeName || '').trim().toLowerCase();
          matches = hotelTypeStr === selectedTypeStr;
        }
      }
      
      if (!matches) return false;
    }

    // Filter 4: Room Category Filter
    if (roomCategory) {
      let matches = false;
      
      // First try to match by ID
      if (a.roomCategoryId && String(a.roomCategoryId) === String(roomCategory)) {
        matches = true;
      } else {
        // If ID doesn't match, try matching by name
        const selectedRoomCatName = roomCategoryOptions.find(opt => String(opt.id) === String(roomCategory))?.name;
        if (selectedRoomCatName) {
          const hotelRoomCatStr = String(a.roomCategory || '').trim().toLowerCase();
          const selectedRoomCatStr = String(selectedRoomCatName || '').trim().toLowerCase();
          
          // Check exact match first
          if (hotelRoomCatStr === selectedRoomCatStr) {
            matches = true;
          } else {
            // Handle multiple room categories (comma-separated)
            const hotelCategories = hotelRoomCatStr.split(',').map(cat => cat.trim());
            matches = hotelCategories.some(cat => cat === selectedRoomCatStr);
            
            // Also check if hotel's room category string contains the selected category
            if (!matches) {
              matches = hotelRoomCatStr.includes(selectedRoomCatStr);
            }
          }
        }
      }
      
      if (!matches) return false;
    }

    // Filter 5: Text Search (live, from the "search here" input)
    if (inHouseSearchQuery && inHouseSearchQuery.trim()) {
      const search = inHouseSearchQuery.trim().toLowerCase();
      const matchesSearch =
        (a.hotelName && String(a.hotelName).toLowerCase().includes(search)) ||
        (a.checkIn && String(a.checkIn).toLowerCase().includes(search)) ||
        (a.checkOut && String(a.checkOut).toLowerCase().includes(search)) ||
        (a.hotelType && String(a.hotelType).toLowerCase().includes(search)) ||
        (a.roomCategory && String(a.roomCategory).toLowerCase().includes(search)) ||
        (a.roomNo && String(a.roomNo).toLowerCase().includes(search)) ||
        (a.customerName && String(a.customerName).toLowerCase().includes(search));

      if (!matchesSearch) return false;
    }

    return true; // If all filters pass, include this booking
  });
}, [inhouseBookings, fromDate, toDate, selectedhotel, selectedhoteltype, roomCategory, inHouseSearchQuery, hotelOptions, hotelTypeOptions, roomCategoryOptions]);



   const Inhousetotalpages = useMemo(() => Math.ceil(filteredinhouseBookings.length / inhouseitemsPerPage), [filteredinhouseBookings.length, inhouseitemsPerPage]);
   const inhouseStartIndex = useMemo(() => (inhousecurrentPage -1)* inhouseitemsPerPage, [inhousecurrentPage, inhouseitemsPerPage]);
   const inhouseEndIndex = useMemo(() => inhouseStartIndex + inhouseitemsPerPage, [inhouseStartIndex, inhouseitemsPerPage]);
   const currentInhousebooking = useMemo(() => filteredinhouseBookings.slice(inhouseStartIndex,inhouseEndIndex), [filteredinhouseBookings, inhouseStartIndex, inhouseEndIndex]);

   const Apitotalpages = useMemo(() => Math.ceil(filteredapiBookings.length / apiitemsPerPage), [filteredapiBookings.length, apiitemsPerPage]);
   const apiStartIndex = useMemo(() => (apicurrentPage -1) * apiitemsPerPage, [apicurrentPage, apiitemsPerPage]);
   const apiEndIndex = useMemo(() => apiStartIndex + apiitemsPerPage, [apiStartIndex, apiitemsPerPage]);
   const currentApibooking = useMemo(() => filteredapiBookings.slice(apiStartIndex,apiEndIndex), [filteredapiBookings, apiStartIndex, apiEndIndex]);

  return (
    <div className="bg-light d-flex flex-column" style={{ minHeight: "100vh" }}>
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />

        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex align-items-center gap-2">
              <BackButton forceFallback fallback="/adminDashboard" />
              <span className="fw-semibold">Day Wise Report</span>
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
      {/* From Date */}
      <Col md={3}>
        <Form.Group className="mb-0">
          <Form.Label className="small mb-2">From Date</Form.Label>
          <Form.Control type="date" size="sm"
           value={tempFromDate}
                    onChange={(e)=>setTempFromDate(e.target.value)} />
        </Form.Group>
      </Col>

      {/* To Date */}
      <Col md={3}>
        <Form.Group className="mb-0">
          <Form.Label className="small mb-2">To Date</Form.Label>
          <Form.Control type="date" size="sm" 
           value={tempToDate}
                    onChange={(e)=>setTempToDate(e.target.value)}/>
        </Form.Group>
      </Col>

      {/* Hotel - Dropdown */}
      <Col md={2}>
        <HotelFilter
         value={tempSelectedhotel}
                  onChange={setTempSelectedHotel}/>
        
      </Col>

      {/* Room Category */}
      <Col md={2}>
        <RoomCategory
         value={tempRoomCategory}
                  onChange={setTempRoomCategory}
        />
      </Col>

      {/* Hotel Type */}
      <Col md={2}>
        <HotelTypefilters
          value={tempSelectedhoteltype}
                  onChange={setTempSelectedHoteltype}
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
          value={inHouseSearchQuery}
          onChange={(e)=>setInHouseSearchQuery(e.target.value)}
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
      {/* From Date */}
      <Col md={4}>
        <Form.Group className="mb-0">
          <Form.Label className="small mb-2">From Date</Form.Label>
          <Form.Control type="date" size="sm" />
        </Form.Group>
      </Col>

      {/* To Date */}
      <Col md={4}>
        <Form.Group className="mb-0">
          <Form.Label className="small mb-2">To Date</Form.Label>
          <Form.Control type="date" size="sm" />
        </Form.Group>
      </Col>

      {/* Search Button */}
      <Col md={4}>
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
          value={apiSearchQuery}
          onChange={(e)=>setApiSearchQuery(e.target.value)}
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
                        <th>Check In</th>
                        <th>Check Out</th>
                        <th>Hotel Type</th>
                        <th>Room Category</th>
                        <th>No of Rooms</th>
                        <th>Customer Name</th>
                      </tr>
                    </thead>
      <tbody>
        {currentInhousebooking.map((booking,index) => (
          <tr key={index}>
            <td>{inhouseStartIndex + index + 1}</td>
            <td>{booking.hotelName}</td>
            <td>{booking.checkIn}</td>
            <td>{booking.checkOut}</td>
            <td>{booking.hotelType}</td>
            <td>{booking.roomCategory}</td>
            <td>{booking.roomNo}</td>
            <td>{booking.customerName}</td>
          </tr>
        ))}
      </tbody>
                  </Table>
                  
                  {/* Pagination */}
                  <div className="d-flex justify-content-between align-items-center p-3 border-top">
                    <div>
                      <small className="text-muted">
                        Showing {filteredinhouseBookings.length > 0 ? inhouseStartIndex + 1 : 0} to {Math.min(inhouseEndIndex, filteredinhouseBookings.length)} of {filteredinhouseBookings.length} entries
                      </small>
                    </div>
                    <div>
                      <Pagination className="mb-0">
                        <Pagination.Prev onClick={()=>setInhouseCurrentPage(prev=> Math.max(1,prev-1))} 
                          disabled={inhousecurrentPage===1}/>

                        {Array.from({length:Inhousetotalpages},(_,i) => i+1).map((pageNum)=>{
                          if(
                            pageNum === 1||
                            pageNum === Inhousetotalpages ||
                            (pageNum >= inhousecurrentPage -1&&pageNum<=inhousecurrentPage+1)
                          ){
                            return(
                              <Pagination.Item
                              key={pageNum}
                              active={pageNum===inhousecurrentPage}
                              onClick={()=>setInhouseCurrentPage(pageNum)}>
                                {pageNum}
                              </Pagination.Item>
                            )
                          }else if(
                            pageNum === inhousecurrentPage -2||
                            pageNum === inhousecurrentPage +2
                          ){
                            return <Pagination.Ellipsis key={pageNum}/>
                          }return null;
                        })}
                        
                        <Pagination.Next onClick={()=> setInhouseCurrentPage(prev=>Math.min(Inhousetotalpages,prev+1))}
                          disabled={inhousecurrentPage === Inhousetotalpages || Inhousetotalpages === 0}  />
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
                        <th>Check In</th>
                        <th>Check Out</th>
                        <th>Hotel Type</th>
                        <th>No of Rooms</th>
                        <th>Customer Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentApibooking.map((booking,index) => (
                        <tr key={index}>
                          <td>{apiStartIndex + index + 1}</td>
                          <td>{booking.hotelName}</td>
                          <td>{booking.platform}</td>
                          <td>{booking.checkIn}</td>
                          <td>{booking.checkOut}</td>
                          <td>{booking.hotelType}</td>
                          <td>{booking.noOfRooms}</td>
                          <td>{booking.customerName}</td>
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
                        <Pagination.Prev onClick={()=> setApiCurrentPage(prev =>Math.max(1,prev -1))}
                          disabled={apicurrentPage === 1}/>

                        {Array.from({length:Apitotalpages},(_,i)=>i+1).map((pageNum)=>{
                          if(
                            pageNum ===1||
                            pageNum ===Apitotalpages||
                            (pageNum >= apicurrentPage -1 && pageNum<=apicurrentPage+1)
                          ){
                            return(
                              <Pagination.Item
                              key={pageNum}
                              active={pageNum===apicurrentPage}
                              onClick={()=>setApiCurrentPage(pageNum)}>
                                {pageNum}
                              </Pagination.Item>
                            )}
                          else if(
                            pageNum === apicurrentPage -2||
                            pageNum === apicurrentPage +2
                          ){
                            return <Pagination.Ellipsis key={pageNum}/>
                          }
                          return null;
                        })}

                        <Pagination.Next onClick={()=> setApiCurrentPage(prev =>Math.min(Apitotalpages,prev +1))}
                          disabled={apicurrentPage === Apitotalpages || Apitotalpages ===0}/>

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
                                <Form.Label>Email Address<span className="text-danger">*</span></Form.Label>
                                 <Form.Control
                                 type="email"
                                 placeholder="enter recepient email address"
                                 value={emailAddress}
                                 onChange={(e)=>setEmailAddress(e.target.value)}
                                 disabled={isSending} 
                                  />
                                  </Form.Group>
                                  </Form>
                                  </Modal.Body>
                                  <Modal.Footer>
                                    <Button variant="secondary" type="button" onClick={()=>setShowMailModal(false)} disabled={isSending}>
                                    Cancel
                                    </Button>
                                    <Button variant="success" type="button" onClick={handleSendEmail} disabled={isSending || !emailAddress}>
                                      {isSending ?(
                                        <>
                                        <span className="spinner-border spinner-border-sm me-2"></span>
                                          Sending...
                                         </>
                                      ):
                                      (
                                         <>
                    <i className="fas fa-paper-plane me-1"></i>Send Email
                  </>
                                      )
          
          
                                      }
                                    </Button>
          
                                  </Modal.Footer>
                    </Modal>
        </main>
      </div>
    </div>
  );
}

export default DayWise;
