import React, { useEffect, useState, useMemo } from "react";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import BackButton from "../../components/BackButton";
import {
  Row,
  Col,
  Card,
  Form,
  Button,
  Table,
  Pagination,
  Modal,
} from "react-bootstrap";
import { toast } from "react-hot-toast";
import axiosInstance from "../../components/AxiosInstance";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import HotelFilter from "../../components/filters/Hotelfilters";
import HotelTypefilters from "../../components/filters/HotelTypefilters";
import HotelCategory from "../../components/filters/HotelCategory";
import RoomCategory from "../../components/filters/RoomCategory";
import Region from "../../components/filters/Region";
import Country from "../../components/filters/Country";
import State from "../../components/filters/State";
import Place from "../../components/filters/place";
import Supplier from "../../components/filters/Supplier";

export default function HotelWise() {

  const [hotels,setHotels]= useState([]);

  // Booking-level search filters (sent to /api/hotelWiseReport/report on
  // Search) — a hotel is listed when it has at least one matching booking.
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

  const fetchHotels = async (filters = {}) => {
    try {
      // Only send filters that actually carry a value
      const params = {};
      Object.entries(filters).forEach(([key, value]) => {
        const trimmed = typeof value === "string" ? value.trim() : value;
        if (trimmed !== "" && trimmed !== null && trimmed !== undefined) {
          params[key] = trimmed;
        }
      });
      const response = await axiosInstance.get("/api/hotelWiseReport/report", { params });
      setHotels(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("HotelWise fetch error", error);
      toast.error("Failed to load data");
    }
  };

  // Temporary filter states (what user sees/edits)
  const [tempSelectedhotel,setTempSelectedHotel]= useState("");
  const [tempSelectedhoteltype,setTempSelectedHoteltype]= useState("");
  const [tempCategory,setTempCategory]=useState("");
  const [tempRoomCategory,setTempRoomCategory]=useState("");
  const [tempCountry,setTempCountry]=useState("");
  const [tempRegion,setTempRegion] =useState("");
  const [tempState,setTempState] =useState("");
  const [tempPlace,setTempPlace]= useState("");
  const [tempSearchQuery,setTempSearchQuery]=useState("");
  
  // Applied filter states (used for actual filtering)
  const [selectedhotel,setSelectedHotel]= useState("");
  const [selectedhoteltype,setSelectedHoteltype]= useState("");
  const [category,setCategory]=useState("");
  const [roomCategory,setRoomCategory]=useState("");
  const [country,setCountry]=useState("");
  const [region,setRegion] =useState("");
  const [state,setState] =useState("");
  const [place,setPlace]= useState("");
  const [searchQuery,setSearchQuery]=useState("");
  
  const [currentpage,setCurrentPage]=useState(1);
  const [itemsPerPage,setItemsPerPage]=useState(10);
  const [showMailModal, setShowMailModal] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Store filter options to map IDs to names
  const [hotelOptions, setHotelOptions] = useState([]);
  const [hotelTypeOptions, setHotelTypeOptions] = useState([]);
  const [hotelCategoryOptions, setHotelCategoryOptions] = useState([]);
  const [roomCategoryOptions, setRoomCategoryOptions] = useState([]);
  const [regionOptions, setRegionOptions] = useState([]);
  const [countryOptions, setCountryOptions] = useState([]);
  const [stateOptions, setStateOptions] = useState([]);
  const [placeOptions, setPlaceOptions] = useState([]);

  

  useEffect(()=>{
     fetchHotels();

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

  // Fetch filter options to map IDs to names
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        // Fetch all filter options
        const [hotelsRes, hotelTypesRes, hotelCategoriesRes, roomCategoriesRes, 
               regionsRes, countriesRes, statesRes, placesRes] = await Promise.all([
          axiosInstance.get("/api/hotels").catch(() => ({ data: [] })),
          axiosInstance.get("/api/hotelType").catch(() => ({ data: [] })),
          axiosInstance.get("/api/hotelcategory").catch(() => ({ data: [] })),
          axiosInstance.get("/api/roomCategory").catch(() => ({ data: [] })),
          axiosInstance.get("/api/region").catch(() => ({ data: [] })),
          axiosInstance.get("/api/country").catch(() => ({ data: [] })),
          axiosInstance.get("/api/province").catch(() => ({ data: [] })),
          axiosInstance.get("/api/destination?page=0&limit=1000").catch(() => ({ data: [] }))
        ]);

        setHotelOptions(Array.isArray(hotelsRes.data) ? hotelsRes.data.map(h => ({ id: h.id, name: h.hotelName })) : []);
        setHotelTypeOptions(Array.isArray(hotelTypesRes.data) ? hotelTypesRes.data.map(ht => ({ id: ht.hotelTypeId, name: ht.name })) : []);
        setHotelCategoryOptions(Array.isArray(hotelCategoriesRes.data) ? hotelCategoriesRes.data.map(hc => ({ id: hc.hotelCategoryId, name: hc.hotelCategory })) : []);
        setRoomCategoryOptions(Array.isArray(roomCategoriesRes.data) ? roomCategoriesRes.data.map(rc => ({ id: rc.roomCategoryId, name: rc.roomCategory })) : []);
        setRegionOptions(Array.isArray(regionsRes.data) ? regionsRes.data.map(r => ({ id: r.id || r.Id, name: r.name })) : []);
        setCountryOptions(Array.isArray(countriesRes.data) ? countriesRes.data.map(c => ({ id: c.id || c.Id, name: c.name })) : []);
        setStateOptions(Array.isArray(statesRes.data) ? statesRes.data.filter(s => !s.isDeleted).map(s => ({ id: s.id, name: s.stateName })) : []);
        setPlaceOptions(Array.isArray(placesRes.data) ? placesRes.data.filter(p => !p.isDeleted).map(p => ({ id: p.id, name: p.name })) : []);
      } catch (error) {
        console.error("Error fetching filter options:", error);
      }
    };

    fetchFilterOptions();
  }, []);



 const handleSendEmail = async () => {
    // Validate email
    if (!emailAddress || !emailAddress.includes('@')) {
      toast.error("Please enter a valid email address");
      return;
    }
    setIsSending(true);
    try {
      // Get the filtered hotels count to include in the email
      const filteredCount = filteredhotels.length;
      
      // API call to send email with current filtered data
      const response = await axiosInstance.post('/api/reports/send-email', {
        email: emailAddress,
        reportType: 'hotelwise',
        filters: {
          hotel: String(selectedhotel || ''),
          hotelType: String(selectedhoteltype || ''),
          hotelCategory: String(category || ''),
          roomCategory: String(roomCategory || ''),
          region: String(region || ''),
          country: String(country || ''),
          state: String(state || ''),
          place: String(place || ''),
          searchQuery: String(searchQuery || '')
        },
        recordCount: filteredCount // Include count of filtered records
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
    printWindow.document.write(`
      <html>
        <head>
          <title>Hotel Wise Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            h1 { text-align: center; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <h1>Hotel Wise Report</h1>
          <table>
            <thead>
              <tr>
                <th>Sl.No</th>
                <th>Hotel Name</th>
                <th>Hotel Type</th>
                <th>Hotel Category</th>
                <th>Room Category</th>
                <th>Region</th>
                <th>Country</th>
                <th>State</th>
                <th>Place</th>
              </tr>
            </thead>
            <tbody>
              ${currentHotels.map((h, index) => `
                <tr>
                  <td>${index +1}</td>
                  <td>${h.hotelName}</td>
                  <td>${h.hotelType}</td>
                  <td>${h.hotelCategory}</td>
                  <td>${h.roomCategory}</td>
                  <td>${h.region}</td>
                  <td>${h.country}</td>
                  <td>${h.state}</td>
                  <td>${h.place}</td>

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
    const doc = new jsPDF();
    
    // Add title
    doc.text('Hotel Wise Report', 20, 20);
    
    // Add table
    autoTable(doc, {
      head: [['Sl.No', 'Hotel Name', 'Hotel Type', 'Hotel Category', 'Room Category', 'Region', 'Country', 'State', 'Place']],
      body: currentHotels.map((h, index) => [
        index + 1,
       h.hotelName,
       h.hotelType,
       h.hotelCategory,
       h.roomCategory,
       h.region,
       h.country,
       h.state,
       h.place
      ]),
      startY: 30,
    });
    
    // Download PDF
    doc.save('hotel-wise-report.pdf');
  };

  const handleExcel = () => {
    const headers = ['Sl.No', 'Hotel Name', 'Hotel Type', 'Hotel Category', 'Room Category', 'Region', 'Country', 'State', 'Place'];
    
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
      ...currentHotels.map((h, index) => [
        index + 1,
       h.hotelName,
       h.hotelType,
       h.hotelCategory,
       h.roomCategory,
       h.region,
       h.country,
       h.state,
       h.place
      ].map(escapeCSV).join(','))
    ].join('\n');

    // Add BOM for UTF-8 to ensure proper Excel encoding
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hotel-wise-report.csv';
    link.click();
    window.URL.revokeObjectURL(url);
  };

const handleSearch = async () => {
  // Apply temporary filter values to actual filter values
  setSelectedHotel(tempSelectedhotel);
  setSelectedHoteltype(tempSelectedhoteltype);
  setCategory(tempCategory);
  setRoomCategory(tempRoomCategory);
  setCountry(tempCountry);
  setRegion(tempRegion);
  setState(tempState);
  setPlace(tempPlace);
  setSearchQuery(tempSearchQuery);
  setCurrentPage(1);
  // Booking-level filters are applied server-side
  await fetchHotels(tempBookingFilters);
 };

const handleReset = async () => {
  setTempBookingFilters(initialBookingFilters);
  setTempSelectedHotel("");
  setTempSelectedHoteltype("");
  setTempCategory("");
  setTempRoomCategory("");
  setTempCountry("");
  setTempRegion("");
  setTempState("");
  setTempPlace("");
  setTempSearchQuery("");
  setSelectedHotel("");
  setSelectedHoteltype("");
  setCategory("");
  setRoomCategory("");
  setCountry("");
  setRegion("");
  setState("");
  setPlace("");
  setSearchQuery("");
  setCurrentPage(1);
  await fetchHotels();
 };



const filteredhotels = useMemo(() => {
  return hotels.filter(h => {
    // Text search (if searchQuery is provided)
    if (searchQuery && searchQuery.trim()) {
      const search = searchQuery.trim().toLowerCase();
      const matchesSearch =
        String(h.hotelName || '').toLowerCase().includes(search) ||
        String(h.hotelType || '').toLowerCase().includes(search) ||
        String(h.hotelCategory || '').toLowerCase().includes(search) ||
        String(h.roomCategory || '').toLowerCase().includes(search) ||
        String(h.region || '').toLowerCase().includes(search) ||
        String(h.country || '').toLowerCase().includes(search) ||
        String(h.state || '').toLowerCase().includes(search) ||
        String(h.place || '').toLowerCase().includes(search);

      if (!matchesSearch) return false;
    }

    // Filter 1: Hotel - match by ID first, then by name
    if (selectedhotel) {
      let matches = false;
      
      // First try to match by ID (most reliable)
      if (h.hotelId && String(h.hotelId) === String(selectedhotel)) {
        matches = true;
      } else {
        // If ID doesn't match or doesn't exist, try matching by name
        const selectedHotelName = hotelOptions.find(opt => String(opt.id) === String(selectedhotel))?.name;
        if (selectedHotelName) {
          // Convert both to strings for comparison (handle type mismatches)
          const hotelNameStr = String(h.hotelName || '').trim();
          const selectedHotelNameStr = String(selectedHotelName || '').trim();
          
          // Check if they match exactly
          matches = hotelNameStr === selectedHotelNameStr;
        }
      }
      
      if (!matches) return false;
    }

    // Filter 2: Hotel Type - match by ID first, then by name
    if (selectedhoteltype) {
      let matches = false;
      
      // First try to match by ID (most reliable)
      if (h.hotelTypeId && String(h.hotelTypeId) === String(selectedhoteltype)) {
        matches = true;
      } else {
        // If ID doesn't match or doesn't exist, try matching by name
        const selectedTypeName = hotelTypeOptions.find(opt => String(opt.id) === String(selectedhoteltype))?.name;
        if (selectedTypeName) {
          // Convert both to strings for comparison (handle type mismatches)
          const hotelTypeStr = String(h.hotelType || '').trim();
          const selectedTypeStr = String(selectedTypeName || '').trim();
          
          // Check if they match exactly
          matches = hotelTypeStr === selectedTypeStr;
        }
      }
      
      if (!matches) return false;
    }

    // Filter 3: Hotel Category - match by ID first, then by name
    if (category) {
      let matches = false;
      
      // First try to match by ID (most reliable)
      if (h.hotelCategoryId && String(h.hotelCategoryId) === String(category)) {
        matches = true;
      } else {
        // If ID doesn't match or doesn't exist, try matching by name
        const selectedCategoryName = hotelCategoryOptions.find(opt => String(opt.id) === String(category))?.name;
        if (selectedCategoryName) {
          // Convert both to strings for comparison (handle number/string mismatch)
          const hotelCategoryStr = String(h.hotelCategory || '').trim();
          const selectedCategoryStr = String(selectedCategoryName || '').trim();
          
          // Check if they match exactly or if one contains the other (handles "3" vs "3 Star")
          matches = hotelCategoryStr === selectedCategoryStr || 
                   hotelCategoryStr.includes(selectedCategoryStr) || 
                   selectedCategoryStr.includes(hotelCategoryStr);
        }
      }
      
      if (!matches) return false;
    }

    // Filter 4: Room Category - match by ID first, then by name
    if (roomCategory) {
      let matches = false;
      
      // First try to match by ID (most reliable)
      if (h.roomCategoryId && String(h.roomCategoryId) === String(roomCategory)) {
        matches = true;
      } else {
        // If ID doesn't match or doesn't exist, try matching by name
        const selectedRoomCatName = roomCategoryOptions.find(opt => String(opt.id) === String(roomCategory))?.name;
        if (selectedRoomCatName) {
          // Convert both to strings for comparison (handle type mismatches)
          const hotelRoomCatStr = String(h.roomCategory || '').trim().toLowerCase();
          const selectedRoomCatStr = String(selectedRoomCatName || '').trim().toLowerCase();
          
          // Check exact match first
          if (hotelRoomCatStr === selectedRoomCatStr) {
            matches = true;
          } else {
            // Handle multiple room categories (comma-separated or array)
            // Split by comma and check if any part matches
            const hotelCategories = hotelRoomCatStr.split(',').map(cat => cat.trim());
            matches = hotelCategories.some(cat => cat === selectedRoomCatStr);
            
            // Also check if hotel's room category string contains the selected category
            // (for cases like "Junior Suite, Deluxe Suite" containing "Junior Suite")
            if (!matches) {
              matches = hotelRoomCatStr.includes(selectedRoomCatStr);
            }
          }
        }
      }
      
      if (!matches) return false;
    }

    // Filter 5: Region - match by ID first, then by name (case-insensitive)
    if (region) {
      let matches = false;
      
      // Get the selected region name from options
      const selectedRegionOption = regionOptions.find(opt => String(opt.id) === String(region));
      const selectedRegionName = selectedRegionOption?.name;
      
      if (!selectedRegionName) {
        // If we can't find the region option, exclude this hotel
        return false;
      }
      
      // First try to match by ID (most reliable) - check multiple possible field names
      const hotelRegionId = h.regionId || h.RegionId || h.region_id || h.Region_Id;
      if (hotelRegionId && String(hotelRegionId) === String(region)) {
        matches = true;
      }
      
      // If ID doesn't match or doesn't exist, try matching by name (case-insensitive)
      if (!matches) {
        const hotelRegionValue = h.region || h.Region || h.regionName || h.RegionName;
        if (hotelRegionValue) {
          // Convert both to strings, trim, and compare case-insensitively
          const hotelRegionStr = String(hotelRegionValue).trim().toLowerCase();
          const selectedRegionStr = String(selectedRegionName).trim().toLowerCase();
          
          // Check if they match exactly (case-insensitive)
          matches = hotelRegionStr === selectedRegionStr;
          
          // If exact match fails, try removing all spaces and comparing
          if (!matches) {
            const hotelRegionNoSpaces = hotelRegionStr.replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '');
            const selectedRegionNoSpaces = selectedRegionStr.replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '');
            matches = hotelRegionNoSpaces === selectedRegionNoSpaces;
          }
        }
      }
      
      // Debug logging (can be removed later)
      if (!matches && h.region) {
        console.log('Region filter mismatch:', {
          selectedRegionId: region,
          selectedRegionName: selectedRegionName,
          hotelRegion: h.region,
          hotelRegionId: hotelRegionId,
          hotelRegionLower: String(h.region).trim().toLowerCase(),
          selectedRegionLower: String(selectedRegionName).trim().toLowerCase()
        });
      }
      
      if (!matches) return false;
    }

    // Filter 6: Country - match by ID first, then by name
    if (country) {
      let matches = false;
      
      // First try to match by ID (most reliable)
      if (h.countryId && String(h.countryId) === String(country)) {
        matches = true;
      } else {
        // If ID doesn't match or doesn't exist, try matching by name
        const selectedCountryName = countryOptions.find(opt => String(opt.id) === String(country))?.name;
        if (selectedCountryName) {
          // Convert both to strings for comparison (handle type mismatches)
          const hotelCountryStr = String(h.country || '').trim();
          const selectedCountryStr = String(selectedCountryName || '').trim();
          
          // Check if they match exactly
          matches = hotelCountryStr === selectedCountryStr;
        }
      }
      
      if (!matches) return false;
    }

    // Filter 7: State - match by ID first, then by name
    if (state) {
      let matches = false;
      
      // First try to match by ID (most reliable)
      if (h.stateId && String(h.stateId) === String(state)) {
        matches = true;
      } else {
        // If ID doesn't match or doesn't exist, try matching by name
        const selectedStateName = stateOptions.find(opt => String(opt.id) === String(state))?.name;
        if (selectedStateName) {
          // Convert both to strings for comparison (handle type mismatches)
          const hotelStateStr = String(h.state || '').trim();
          const selectedStateStr = String(selectedStateName || '').trim();
          
          // Check if they match exactly
          matches = hotelStateStr === selectedStateStr;
        }
      }
      
      if (!matches) return false;
    }

    // Filter 8: Place - match by ID first, then by name
    if (place) {
      let matches = false;
      
      // First try to match by ID (most reliable)
      if (h.placeId && String(h.placeId) === String(place)) {
        matches = true;
      } else {
        // If ID doesn't match or doesn't exist, try matching by name
        const selectedPlaceName = placeOptions.find(opt => String(opt.id) === String(place))?.name;
        if (selectedPlaceName) {
          // Convert both to strings for comparison (handle type mismatches)
          const hotelPlaceStr = String(h.place || '').trim();
          const selectedPlaceStr = String(selectedPlaceName || '').trim();
          
          // Check if they match exactly
          matches = hotelPlaceStr === selectedPlaceStr;
        }
      }
      
      if (!matches) return false;
    }

    return true;
  });
}, [hotels, searchQuery, selectedhotel, selectedhoteltype, category, roomCategory, region, country, state, place, hotelOptions, hotelTypeOptions, hotelCategoryOptions, roomCategoryOptions, regionOptions, countryOptions, stateOptions, placeOptions]);

 const totalPages = useMemo(() => Math.ceil(filteredhotels.length / itemsPerPage), [filteredhotels.length, itemsPerPage]);
 const startIndex = useMemo(() => (currentpage -1) * itemsPerPage, [currentpage, itemsPerPage]);
 const endIndex = useMemo(() => startIndex + itemsPerPage, [startIndex, itemsPerPage]);
 const currentHotels = useMemo(() => filteredhotels.slice(startIndex, endIndex), [filteredhotels, startIndex, endIndex]);

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
    
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4 ">
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex align-items-center gap-2">
              <BackButton forceFallback fallback="/adminDashboard" />
              <span className="fw-semibold"> Hotel Wise Report</span>
            </Card.Header>

            {/* Filters Section */}
            <div className="p-4 bg-light border-bottom" style={{ overflow: 'visible' }}>
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

                {/* Row 4 — status / branch / supplier / service type */}
                <Col md={3}>
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
                <Col md={3}>
                  <Form.Select size="sm"
                    value={tempBookingFilters.branch}
                    onChange={(e) => updateBookingFilter("branch", e.target.value)}>
                    <option value="">Select Branch</option>
                    {branchOptions.map((branch) => (
                      <option key={branch} value={branch}>{branch}</option>
                    ))}
                  </Form.Select>
                </Col>
                <Col md={3}>
                  <Supplier
                    value={tempBookingFilters.supplierId}
                    onChange={(id) => updateBookingFilter("supplierId", String(id))}
                  />
                </Col>
                <Col md={3}>
                  <Form.Select size="sm"
                    value={tempBookingFilters.bookingType}
                    onChange={(e) => updateBookingFilter("bookingType", e.target.value)}>
                    <option value="">All Services</option>
                    <option value="NORMAL">Normal</option>
                    <option value="LAST_MINUTE">Last Minute</option>
                  </Form.Select>
                </Col>
              </Row>

              <h6 className="fw-bold text-primary mb-3">Basic Details</h6>
              <Row className="g-4 mb-4">

                <Col md={3}>

                  <HotelFilter
                  value={tempSelectedhotel}
                  onChange={setTempSelectedHotel}/>

                </Col>

                <Col md={3}>
                 
                <HotelTypefilters
                value={tempSelectedhoteltype}
                  onChange={setTempSelectedHoteltype}
                  />

                </Col>

                <Col md={3}>

                <HotelCategory
                value={tempCategory}
                  onChange={setTempCategory}
                  />
                 
                </Col>
                <Col md={3}>
                  <RoomCategory
                value={tempRoomCategory}
                  onChange={setTempRoomCategory}
                  />
                </Col>
              </Row>

              <h6 className="fw-bold text-primary mb-3">Location Details</h6>
              <Row className="g-4 mb-3">

             <Col 
  md={3} 
 
>
                 <Region
                value={tempRegion}
                  onChange={setTempRegion}
                  />
                </Col>


                <Col md={3}>
                  <Country
                  value={tempCountry}
                  onChange={setTempCountry}/>
                </Col>
                <Col md={3}>
                   <State
                  value={tempState}
                  onChange={setTempState}/>
                </Col>
                <Col md={3}>

                  <Place
                  value={tempPlace}
                  onChange={setTempPlace}
                  />
                </Col>
              </Row>

              <Row className="mt-4">
                <Col md={12}>
                  <div className="d-flex gap-2 justify-content-end">
                    <Button variant="success" size="sm" style={{ backgroundColor: "#676767", borderColor: "#676767" }} onClick={handleSearch}>
                      <i className="fas fa-search me-1"></i>Search
                    </Button>
                    <Button variant="outline-secondary" size="sm" onClick={handleReset}>
                      <i className="fas fa-undo me-1"></i>Reset
                    </Button>
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
                  </div>

                  <div>
                    <input
                    type="text"
                    value={tempSearchQuery}
                    onChange={(e) => {
                      const value = e.target.value;
                      setTempSearchQuery(value);
                      setSearchQuery(value); // Update searchQuery immediately for real-time filtering
                      setCurrentPage(1); // Reset to first page when searching
                    }}
                    placeholder="Search here"
                    className="form-control form-control-sm w-auto"
                    />
                  </div>

                </Col>
              </Row>
              
            </div>

            <Card.Body className="p-0 mt-1">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>S/N</th>
                    <th>Hotel Name</th>
                    <th>Hotel Type</th>
                    <th>Hotel Category</th>
                    <th>Room Category</th>
                    <th>Region</th>
                    <th>Country</th>
                    <th>State</th>
                    <th>Place</th>
                  </tr>
                </thead>
                <tbody>
                  {currentHotels.length > 0 ? (
                    currentHotels.map((h, index) => (
                      <tr key={index}>
                        <td>{startIndex + index + 1}</td>
                        <td>{h.hotelName}</td>
                        <td>{h.hotelType} </td>
                        <td>{h.hotelCategory} Star</td>
                        <td>{h.roomCategory}</td>
                        <td>{h.region}</td>
                        <td>{h.country}</td>
                        <td>{h.state}</td>
                        <td>{h.place}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="9" className="text-center py-4 text-muted">
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
                    {/* Showing 1 to {hotels.length} of {hotels.length} entries */}
showing {filteredhotels . length > 0 ? startIndex + 1 : 0} to {Math.min (endIndex, filteredhotels.length)} of{filteredhotels.length} entries
                  </small>
                </div>
                <div>
                  <Pagination className="mb-0">

                    <Pagination.Prev onClick={()=>setCurrentPage(prev =>Math.max(1,prev-1))}
                      disabled={currentpage === 1}/>

                      {Array.from({length:totalPages},(_,i)=>i+1).map((pageNum)=>{
                        if(
                          pageNum ===1||
                          pageNum ===totalPages||
                          (pageNum >= currentpage -1&&pageNum<=currentpage+1)
                        )
                        {
                          return(
                            <Pagination.Item
                              key={pageNum}
                              active={pageNum===currentpage}
                              onClick={()=>setCurrentPage(pageNum)}>
                                 {pageNum}
                                 </Pagination.Item>
                                 )}
                                 else if(
                                  pageNum === currentpage-2||
                                  pageNum === currentpage +2
                                )
                                {
                                  return <Pagination.Ellipsis key={pageNum}/>
                                }
                                return null;
                      })}

            
                    <Pagination.Next onClick={()=>setCurrentPage(prev=> Math.min(totalPages, prev+1))}
                    disabled={currentpage=== totalPages ||totalPages ===0} />
                  </Pagination>
                </div>
              </div>
            </Card.Body>
          </Card>

          <Modal show={showMailModal} onHide={() => setShowMailModal(false)} centered>
            <Modal.Header closeButton={!isSending}>
              <Modal.Title>
                Send Report via Email
              </Modal.Title>
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


