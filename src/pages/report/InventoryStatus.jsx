import React, { useState, useEffect, useCallback } from "react";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import { Row, Col, Card, Form, Button, Spinner } from "react-bootstrap";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";


export default function InventoryStatus() {

  const [tempSelectedHotel,setTempSelectedHotel]=useState("");
  const [tempRoomCategory,setTempRoomCategory]=useState("");
  
  const [selectedHotel,setSelectedHotel] = useState("");
  const [roomCategory,setRoomCategory] = useState("");

  // Hotels list from report API
  const [hotels, setHotels] = useState([]);
  
  // Room categories from report API for selected hotel
  const [roomCategories, setRoomCategories] = useState([]);
  
  // Calendar events
  const [calendarEvents, setCalendarEvents] = useState([]);

  // Responsive calendar: below md the month grid + 3-button toolbar is too
  // cramped, so switch to a single-day time view with a compact toolbar.
  // Desktop (>=768px) keeps the original month view + toolbar unchanged.
  const [isCalMobile, setIsCalMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const onResize = () => setIsCalMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  
  // Loading states
  const [isLoadingHotels, setIsLoadingHotels] = useState(false);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);

  // Hotel dropdown state
  const [isHotelOpen, setIsHotelOpen] = useState(false);
  const [hotelSearchTerm, setHotelSearchTerm] = useState("");

  // Room category dropdown state
  const [isRoomOpen, setIsRoomOpen] = useState(false);
  const [roomSearchTerm, setRoomSearchTerm] = useState("");

  // Fetch hotels from report API
  useEffect(() => {
    const fetchHotels = async () => {
      setIsLoadingHotels(true);
      try {
        const response = await axiosInstance.get("/api/report/hotels");
        setHotels(response.data || []);
      } catch (error) {
        console.error("Failed to load hotels:", error);
        toast.error("Failed to load hotels");
        setHotels([]);
      } finally {
        setIsLoadingHotels(false);
      }
    };

    fetchHotels();
  }, []);

  // Fetch room categories when hotel is selected
  useEffect(() => {
    const fetchRoomCategories = async () => {
      if (!tempSelectedHotel) {
        setRoomCategories([]);
        setTempRoomCategory("");
        return;
      }

      setIsLoadingRooms(true);
      try {
        const response = await axiosInstance.get(
          `/api/report/rooms/${tempSelectedHotel}`
        );
        setRoomCategories(response.data || []);
      } catch (error) {
        console.error("Failed to load room categories:", error);
        toast.error("Failed to load room categories");
        setRoomCategories([]);
      } finally {
        setIsLoadingRooms(false);
      }
    };

    fetchRoomCategories();
    // Clear room category when hotel changes
    setTempRoomCategory("");
  }, [tempSelectedHotel]);

  // Helper function to get colors based on availability type
  const getAvailabilityColors = (availabilityType) => {
    switch (availabilityType) {
      case 'FREE_SALE':
        return {
          backgroundColor: '#28a745',
          borderColor: '#218838'
        };
      case 'PRE_BUY':
        return {
          backgroundColor: '#007bff',
          borderColor: '#0056b3'
        };
      case 'ROOM_ALLOCATION':
        return {
          backgroundColor: '#fd7e14',
          borderColor: '#dc6502'
        };
      default:
        return {
          backgroundColor: '#ffc107',
          borderColor: '#e0a800'
        };
    }
  };

  // Fetch inventory function - memoized to avoid recreating on every render
  const fetchInventory = useCallback(async (hotelId, roomCategoryId) => {
    if (!hotelId || !roomCategoryId) {
      setCalendarEvents([]);
      return;
    }

    // roomCategoryId is directly used as roomId for inventory API
    const roomId = roomCategoryId;

    setIsLoadingInventory(true);
    try {
      console.log(`Fetching inventory for hotel ${hotelId}, room ${roomId}`);
      
      // Try multiple endpoint patterns
      let endpoint = `/api/hotels/${hotelId}/inventory`;
      let response;
      
      try {
        // First try: /api/hotels/{hotelId}/inventory
        response = await axiosInstance.get(endpoint);
        console.log(`✅ Success with endpoint: ${endpoint}`);
      } catch (error) {
        console.log(`❌ Failed with endpoint: ${endpoint}`, error.response?.status);
        
        // Second try: /api/hotelInventory/{hotelId}
        try {
          endpoint = `/api/hotelInventory/${hotelId}`;
          console.log(`Attempting alternative endpoint: ${endpoint}`);
          response = await axiosInstance.get(endpoint);
          console.log(`✅ Success with alternative endpoint: ${endpoint}`);
        } catch (error2) {
          console.log(`❌ Failed with alternative endpoint: ${endpoint}`, error2.response?.status);
          
          // Third try: /api/hotels/{hotelId}/inventory/{roomId}
          try {
            endpoint = `/api/hotels/${hotelId}/inventory/${roomId}`;
            console.log(`Attempting endpoint with roomId: ${endpoint}`);
            response = await axiosInstance.get(endpoint);
            console.log(`✅ Success with roomId endpoint: ${endpoint}`);
          } catch (error3) {
            console.log(`❌ Failed with all endpoints`);
            throw error3; // Throw the last error
          }
        }
      }
      
      console.log("Inventory API response:", response.data);
      console.log("Response data type:", typeof response.data);
      console.log("Is array?", Array.isArray(response.data));

      // Handle different response structures
      let availabilityRecords = [];
      if (Array.isArray(response.data)) {
        availabilityRecords = response.data;
      } else if (response.data && Array.isArray(response.data.data)) {
        // Handle wrapped response: { data: [...] }
        availabilityRecords = response.data.data;
      } else if (response.data && response.data.availabilityRecords) {
        // Handle nested structure: { availabilityRecords: [...] }
        availabilityRecords = response.data.availabilityRecords;
      } else if (response.data && Array.isArray(response.data.availabilityList)) {
        // Handle structure: { availabilityList: [...] }
        availabilityRecords = response.data.availabilityList;
      } else if (response.data && typeof response.data === 'object') {
        // If it's a single object or object with nested arrays, try to extract
        console.warn("Response is an object, checking for nested arrays");
        // Check all properties for arrays
        for (const key in response.data) {
          if (Array.isArray(response.data[key]) && response.data[key].length > 0) {
            console.log(`Found array in property: ${key}`);
            availabilityRecords = response.data[key];
            break;
          }
        }
        // If no array found, wrap the object itself
        if (availabilityRecords.length === 0) {
          availabilityRecords = [response.data];
        }
      } else if (response.data) {
        // If it's a single object, wrap it in an array
        console.warn("Response is not an array, attempting to handle as single object");
        availabilityRecords = [response.data];
      }
      
      // Validate we have data
      if (!availabilityRecords || availabilityRecords.length === 0) {
        console.warn("No availability records found in response");
        setCalendarEvents([]);
        setIsLoadingInventory(false);
        toast.info("No inventory data available for the selected filters", { duration: 4000 });
        return;
      }
      
      console.log("Processed availability records:", availabilityRecords);
      console.log("Number of records:", availabilityRecords.length);
      
      // Filter by roomId if provided (since endpoint returns all inventory for hotel)
      if (roomId && availabilityRecords.length > 0) {
        console.log("Filtering by roomId:", roomId);
        console.log("Sample record hotelRoomId:", availabilityRecords[0]?.hotelRoomId);
        console.log("All hotelRoomIds in records:", availabilityRecords.map(r => r.hotelRoomId));
        
        const filteredRecords = availabilityRecords.filter(
          record => String(record.hotelRoomId) === String(roomId)
        );
        console.log(`Filtered ${availabilityRecords.length} records to ${filteredRecords.length} records for roomId: ${roomId}`);
        
        // If no matches, show all records and log a warning
        if (filteredRecords.length === 0) {
          console.warn(`No records found matching roomId: ${roomId}. Showing all records.`);
          console.warn("Available hotelRoomIds:", [...new Set(availabilityRecords.map(r => r.hotelRoomId))]);
          // Don't filter - show all records
        } else {
          availabilityRecords = filteredRecords;
        }
      }
      
      // Validate data structure
      if (availabilityRecords.length > 0) {
        console.log("First record structure:", availabilityRecords[0]);
        console.log("Has availabilityValidities?", availabilityRecords[0].availabilityValidities);
      }
      
      // Transform availabilityValidities to FullCalendar events
      // Use Map to prevent duplicate events on the same date with same key
      const eventsMap = new Map();
      
      if (availabilityRecords && availabilityRecords.length > 0) {
        // Outer loop: Iterate through each availability record
        availabilityRecords.forEach((availabilityRecord) => {
          // Check if this record has availabilityValidities
          if (availabilityRecord && availabilityRecord.availabilityValidities && availabilityRecord.availabilityValidities.length > 0) {
            // Inner loop: Iterate through each validity period in the record
            availabilityRecord.availabilityValidities.forEach((validity, index) => {
              console.log(`Record ID ${availabilityRecord.id}, Validity ${index}:`, validity);
              
              // Parse dates - handle timezone correctly
              let startDate = null;
              let endDate = null;
              
              try {
              if (validity.validityFrom) {
                // If the string already starts with YYYY-MM-DD, extract it directly
                if (validity.validityFrom.includes('T')) {
                  startDate = validity.validityFrom.split('T')[0];
                } else {
                  // Otherwise parse as date
                  const fromDate = new Date(validity.validityFrom);
                    if (isNaN(fromDate.getTime())) {
                      console.warn(`Invalid start date: ${validity.validityFrom}`);
                      return; // Skip this validity period
                    }
                  const year = fromDate.getUTCFullYear();
                  const month = String(fromDate.getUTCMonth() + 1).padStart(2, '0');
                  const day = String(fromDate.getUTCDate()).padStart(2, '0');
                  startDate = `${year}-${month}-${day}`;
                }
                console.log(`Parsed start date: ${validity.validityFrom} → ${startDate}`);
              }
              
              if (validity.validityTo) {
                // If the string already starts with YYYY-MM-DD, extract it directly
                if (validity.validityTo.includes('T')) {
                  endDate = validity.validityTo.split('T')[0];
                } else {
                  // Otherwise parse as date
                  const toDate = new Date(validity.validityTo);
                    if (isNaN(toDate.getTime())) {
                      console.warn(`Invalid end date: ${validity.validityTo}`);
                      return; // Skip this validity period
                    }
                  const year = toDate.getUTCFullYear();
                  const month = String(toDate.getUTCMonth() + 1).padStart(2, '0');
                  const day = String(toDate.getUTCDate()).padStart(2, '0');
                  endDate = `${year}-${month}-${day}`;
                }
                console.log(`Parsed end date: ${validity.validityTo} → ${endDate}`);
              }

              if (startDate && endDate) {
                  // Validate date range
                const start = new Date(startDate);
                const end = new Date(endDate);
                  
                  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                    console.warn(`Invalid date range: ${startDate} to ${endDate}`);
                    return;
                  }
                  
                  if (start > end) {
                    console.warn(`Start date after end date: ${startDate} > ${endDate}`);
                    return;
                  }
                
                // Generate events for each day from start to end (inclusive)
                const currentDate = new Date(start);
                  let daysProcessed = 0;
                  const maxDays = 365 * 2; // Safety limit: max 2 years
                  
                  while (currentDate <= end && daysProcessed < maxDays) {
                  const year = currentDate.getUTCFullYear();
                  const month = String(currentDate.getUTCMonth() + 1).padStart(2, '0');
                  const day = String(currentDate.getUTCDate()).padStart(2, '0');
                  const dateStr = `${year}-${month}-${day}`;
                  
                    // Create unique key for deduplication: date + hotelRoomId + marketTypeId + availabilityType
                    // This ensures different records/types show as separate events, but same record overlapping validities merge
                    const eventKey = `${dateStr}_${availabilityRecord.hotelRoomId}_${availabilityRecord.marketTypeId}_${availabilityRecord.availabilityType}`;
                    
                    // Check if event already exists for this key
                    if (!eventsMap.has(eventKey)) {
                  // Get colors based on availability type
                  const colors = getAvailabilityColors(availabilityRecord.availabilityType);
                  
                  // Format title with release day info if applicable
                  const releaseDayText = availabilityRecord.releaseDay > 0 
                    ? ` (Release: ${availabilityRecord.releaseDay} days)` 
                    : '';
                  const title = `${availabilityRecord.noOfRooms || 0} Rooms - ${availabilityRecord.availabilityType || 'Available'}${releaseDayText}`;
                  
                      eventsMap.set(eventKey, {
                    title: title,
                    start: dateStr,
                    allDay: true,
                    backgroundColor: colors.backgroundColor,
                    borderColor: colors.borderColor,
                    extendedProps: {
                      id: availabilityRecord.id,
                      hotelId: availabilityRecord.hotelId,
                      hotelRoomId: availabilityRecord.hotelRoomId,
                      marketTypeId: availabilityRecord.marketTypeId,
                      noOfRooms: availabilityRecord.noOfRooms,
                      availabilityType: availabilityRecord.availabilityType,
                      checkinAllowedDays: availabilityRecord.checkinAllowedDays || [],
                      releaseDay: availabilityRecord.releaseDay,
                      date: dateStr,
                    },
                  });
                    } else {
                      // Event already exists - update with higher room count if applicable
                      const existingEvent = eventsMap.get(eventKey);
                      if (availabilityRecord.noOfRooms > existingEvent.extendedProps.noOfRooms) {
                        existingEvent.extendedProps.noOfRooms = availabilityRecord.noOfRooms;
                        const releaseDayText = existingEvent.extendedProps.releaseDay > 0 
                          ? ` (Release: ${existingEvent.extendedProps.releaseDay} days)` 
                          : '';
                        existingEvent.title = `${availabilityRecord.noOfRooms || 0} Rooms - ${existingEvent.extendedProps.availabilityType || 'Available'}${releaseDayText}`;
                      }
                    }
                  
                  // Move to next day
                  currentDate.setUTCDate(currentDate.getUTCDate() + 1);
                    daysProcessed++;
                  }
                  
                  if (daysProcessed >= maxDays) {
                    console.warn(`Date range too large, limited to ${maxDays} days`);
                }
                
                console.log(`Created events for validity period ${index} from ${startDate} to ${endDate}`);
                }
              } catch (dateError) {
                console.error(`Error processing validity period ${index} for record ${availabilityRecord.id}:`, dateError);
              }
            }); // Close inner loop (availabilityValidities.forEach)
          } // Close if statement (checking availabilityValidities)
        }); // Close outer loop (availabilityRecords.forEach)
      }
      
      // Convert Map to array
      const events = Array.from(eventsMap.values());
      console.log(`Total events created (after deduplication): ${events.length}`, events);

      setCalendarEvents(events);

      if (events.length === 0) {
        toast("No availability data found for the selected filters", { 
          icon: 'ℹ️',
          duration: 4000 
        });
      } else {
        toast.success(`Found ${events.length} availability period(s)`);
      }
    } catch (error) {
      console.error("Failed to load inventory:", error);
      console.error("Error details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        hotelId,
        roomId
      });
      
      // Handle specific error cases
      let errorMessage = "Failed to load inventory data";
      
      if (error.response?.status === 403) {
        // 403 Forbidden - Permission issue
        const userRole = sessionStorage.getItem("currentActiveRole") || sessionStorage.getItem("userRole") || "Unknown";
        console.warn("403 Forbidden - Current user role:", userRole);
        console.warn("This endpoint may require specific permissions. Please check:");
        console.warn("1. Your user role has access to inventory reports");
        console.warn("2. The endpoint requires admin/agent role");
        console.warn("3. Contact your administrator to grant permissions");
        
        errorMessage = error.response?.data?.message 
          || error.response?.data?.error 
          || `Access denied. Your current role (${userRole}) doesn't have permission to view inventory data. Please contact your administrator.`;
        toast.error(errorMessage, { duration: 6000 });
      } else if (error.response?.status === 401) {
        // 401 Unauthorized - Authentication issue
        errorMessage = "Your session has expired. Please log in again.";
        toast.error(errorMessage, { duration: 5000 });
      } else if (error.response?.status === 404) {
        // 404 Not Found - Endpoint or resource doesn't exist
        errorMessage = `Inventory data not found for Hotel ID: ${hotelId}, Room ID: ${roomId}`;
        toast.error(errorMessage, { duration: 5000 });
      } else if (error.response?.status >= 500) {
        // Server error
        errorMessage = "Server error. Please try again later or contact support.";
        toast.error(errorMessage, { duration: 5000 });
      } else if (error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
        // Network error
        errorMessage = "Network error. Please check your internet connection.";
        toast.error(errorMessage, { duration: 5000 });
      } else {
        // Other errors
        errorMessage = error.response?.data?.message 
          || error.response?.data?.error 
          || error.message 
          || "Failed to load inventory data";
        toast.error(`Failed to load inventory: ${errorMessage}`, { duration: 5000 });
      }
      
      setCalendarEvents([]);
    } finally {
      setIsLoadingInventory(false);
    }
  }, []);

  const handleSearch = async () => {
    // Validate both filters are selected
    if (!tempSelectedHotel || !tempRoomCategory) {
      toast.error("Please select both Hotel and Room Category");
      return;
    }

    // Update states
    const hotelId = tempSelectedHotel;
    const roomCatId = tempRoomCategory;
    
    setSelectedHotel(hotelId);
    setRoomCategory(roomCatId);

    // Clear previous calendar events
    setCalendarEvents([]);

    // Fetch inventory directly using hotelId and roomCategoryId (which is used as roomId)
    await fetchInventory(hotelId, roomCatId);
  }

  // Get selected hotel name
  const selectedHotelOption = hotels.find(h => String(h.hotelId) === String(tempSelectedHotel));
  
  // Get selected room category name
  const selectedRoomOption = roomCategories.find(rc => String(rc.roomCategoryId) === String(tempRoomCategory));

  // Filter hotels by search term
  const filteredHotels = hotelSearchTerm
    ? hotels.filter(h => h.hotelName?.toLowerCase().includes(hotelSearchTerm.toLowerCase()))
    : hotels;

  // Filter room categories by search term
  const filteredRooms = roomSearchTerm
    ? roomCategories.filter(rc => rc.roomCategory?.toLowerCase().includes(roomSearchTerm.toLowerCase()))
    : roomCategories;

  return (
    <div className="bg-light d-flex flex-column" style={{ minHeight: "100vh" }}>
      {/* ✅ TopBar */}
      <TopBar />
      <div className="d-flex flex-grow-1">
        {/* ✅ Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <main className="flex-grow-1 p-3" style={{ overflow: "auto" }}>
          <Row>
            {/* Calendar */}
            <Col md={9}>
              <Card className="shadow-sm border-0 p-3">
                {isLoadingInventory && (
                  <div className="text-center p-3">
                    <Spinner animation="border" variant="primary" className="me-2" />
                    <span>Loading inventory data...</span>
                  </div>
                )}
                <FullCalendar
                  // Re-mount when crossing the breakpoint so initialView applies.
                  key={isCalMobile ? "cal-mobile" : "cal-desktop"}
                  plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                  initialView={isCalMobile ? "timeGridDay" : "dayGridMonth"}
                  headerToolbar={
                    isCalMobile
                      ? { left: "prev,next", center: "title", right: "today" }
                      : {
                          left: "prev,next today",
                          center: "title",
                          right: "dayGridMonth,timeGridWeek,timeGridDay",
                        }
                  }
                  handleWindowResize={true}
                  events={calendarEvents}
                  height="80vh"
                  eventClick={(info) => {
                    const { extendedProps } = info.event;
                    const checkinDays = extendedProps.checkinAllowedDays?.length > 0 
                      ? extendedProps.checkinAllowedDays.join(', ') 
                      : 'All days';
                    const releaseInfo = extendedProps.releaseDay > 0 
                      ? `Release: ${extendedProps.releaseDay} days. ` 
                      : '';
                    toast.success(
                      `${extendedProps.noOfRooms} rooms - ${extendedProps.availabilityType}. ${releaseInfo}Check-in: ${checkinDays}`,
                      { duration: 4000 }
                    );
                  }}
                />
              </Card>
            </Col>

            {/* Search Criteria Sidebar */}
            <Col md={3}>
              <Card className="p-3 shadow-sm border-0">
                <h5 className="fw-bold text-primary mb-3">Search Criteria</h5>
                <Form>
                  <Form.Group className="mb-3">
                    <Form.Label>Hotel</Form.Label>
                    <div className="position-relative">
                      <Form.Control
                        size="sm"
                        value={isHotelOpen ? hotelSearchTerm : (selectedHotelOption?.hotelName || "")}
                        onChange={(e) => {
                          setHotelSearchTerm(e.target.value);
                          if (!isHotelOpen) setIsHotelOpen(true);
                        }}
                        onFocus={() => setIsHotelOpen(true)}
                        placeholder="Select Hotel"
                        autoComplete="off"
                        disabled={isLoadingHotels}
                      />
                      {isHotelOpen && (
                        <>
                          <div className="position-absolute w-100 bg-white border shadow-lg" 
                               style={{ zIndex: 1050, maxHeight: "200px", overflowY: "auto", top: "100%" }}>
                            {isLoadingHotels ? (
                              <div className="px-3 py-2 text-center">
                                <Spinner animation="border" size="sm" />
                              </div>
                            ) : filteredHotels.length === 0 ? (
                              <div className="px-3 py-2 text-muted">No hotels found</div>
                            ) : (
                              filteredHotels.map(hotel => (
                                <div key={hotel.hotelId} className="px-3 py-2" 
                                     style={{ cursor: "pointer" }}
                                     onMouseEnter={e => e.target.style.backgroundColor = "#f8f9fa"}
                                     onMouseLeave={e => e.target.style.backgroundColor = "white"}
                                     onClick={() => { 
                                       setTempSelectedHotel(hotel.hotelId); 
                                       setIsHotelOpen(false); 
                                       setHotelSearchTerm(""); 
                                     }}>
                                  {hotel.hotelName}
                                </div>
                              ))
                            )}
                          </div>
                          <div className="position-fixed" style={{ top: 0, left: 0, right: 0, bottom: 0, zIndex: 1040 }}
                               onClick={() => { setIsHotelOpen(false); setHotelSearchTerm(""); }} />
                        </>
                      )}
                    </div>
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>Room Category</Form.Label>
                    <div className="position-relative">
                      <Form.Control
                        size="sm"
                        value={isRoomOpen ? roomSearchTerm : (selectedRoomOption?.roomCategory || "")}
                        onChange={(e) => {
                          setRoomSearchTerm(e.target.value);
                          if (!isRoomOpen) setIsRoomOpen(true);
                        }}
                        onFocus={() => setIsRoomOpen(true)}
                        placeholder={tempSelectedHotel ? "Select Room Category" : "Select Hotel First"}
                        autoComplete="off"
                        disabled={!tempSelectedHotel || isLoadingRooms}
                      />
                      {isRoomOpen && tempSelectedHotel && (
                        <>
                          <div className="position-absolute w-100 bg-white border shadow-lg" 
                               style={{ zIndex: 1050, maxHeight: "200px", overflowY: "auto", top: "100%" }}>
                            {isLoadingRooms ? (
                              <div className="px-3 py-2 text-center">
                                <Spinner animation="border" size="sm" />
                              </div>
                            ) : filteredRooms.length === 0 ? (
                              <div className="px-3 py-2 text-muted">No room categories found</div>
                            ) : (
                              filteredRooms.map(room => (
                                <div key={room.roomCategoryId} className="px-3 py-2" 
                                     style={{ cursor: "pointer" }}
                                     onMouseEnter={e => e.target.style.backgroundColor = "#f8f9fa"}
                                     onMouseLeave={e => e.target.style.backgroundColor = "white"}
                                     onClick={() => { 
                                       setTempRoomCategory(room.roomCategoryId); 
                                       setIsRoomOpen(false); 
                                       setRoomSearchTerm(""); 
                                     }}>
                                  {room.roomCategory}
                                </div>
                              ))
                            )}
                          </div>
                          <div className="position-fixed" style={{ top: 0, left: 0, right: 0, bottom: 0, zIndex: 1040 }}
                               onClick={() => { setIsRoomOpen(false); setRoomSearchTerm(""); }} />
                        </>
                      )}
                    </div>
                  </Form.Group>
                  {tempSelectedHotel && roomCategories.length > 0 && (
                    <small className="text-info d-block mb-2">
                      Available: {roomCategories.length} room category(ies)
                    </small>
                  )}
                  {tempSelectedHotel && roomCategories.length === 0 && !isLoadingRooms && (
                    <small className="text-muted d-block mb-2">
                      No room categories available for this hotel
                    </small>
                  )}
                  <Button 
                    variant="success" 
                    className="w-100" 
                    style={{ backgroundColor: "#676767", borderColor: "#676767" }} onClick={handleSearch}
                    disabled={isLoadingRooms || isLoadingInventory}
                  >
                    {isLoadingRooms || isLoadingInventory ? (
                      <>
                        <Spinner animation="border" size="sm" className="me-2" />
                        Loading...
                      </>
                    ) : (
                      "🔍 Search"
                    )}
                  </Button>
                  {selectedHotel && roomCategory && calendarEvents.length > 0 && (
                    <div className="mt-3 p-2 bg-light rounded">
                      <small className="text-muted">
                        Showing {calendarEvents.length} availability period(s)
                      </small>
                    </div>
                  )}
                </Form>
              </Card>
            </Col>
          </Row>
        </main>
      </div>
    </div>
  );
}
