// ✅ ADDED: Additional imports for table, modal, toast, PDF and Excel functionality
import React, { useEffect, useState,useMemo } from "react";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import BackButton from "../../components/BackButton";
import { Row, Col, Card, Form, Button, Dropdown, Table, Modal } from "react-bootstrap";
import { toast } from "react-hot-toast";
import axiosInstance from "../../components/AxiosInstance";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


function Comparison() {
  
  const [comparison,setComparison] = useState([]);
  const [agentsList, setAgentsList] = useState([]);
  const [hotelsList, setHotelsList] = useState([]);
  const [searchQuery,setSearchQuery]=useState("");
  const [selectedOption, setSelectedOption] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [compareOption, setCompareOption] = useState("");
  const [showCompareDropdown, setShowCompareDropdown] = useState(false);
  const [showDateInputs, setShowDateInputs] = useState(false);
  const [selectedAgentHotel, setSelectedAgentHotel] = useState("");
  const [selectedComparePeriod, setSelectedComparePeriod] = useState("");
  const [showCompareValidation, setShowCompareValidation] = useState(false);
   const [showMailModal, setShowMailModal] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [reportType, setReportType] = useState("");
  const [selectedFromDate, setSelectedFromDate] = useState("");
  const [selectedToDate, setSelectedToDate] = useState("");
  const [selectedOtherEntity, setSelectedOtherEntity] = useState("");

  // Fetch agents list
  useEffect(()=>{
    const fetchAgents = async ()=>{
      try{
        const response = await axiosInstance.get("/api/agent")
        setAgentsList(response.data || [])
      }catch(error){
        console.error("Error while fetching agents",error)
      }
    };fetchAgents();
  },[])

  // Fetch hotels list
  useEffect(()=>{
    const fetchHotels = async ()=>{
      try{
        const response = await axiosInstance.get("/api/hotels")
        setHotelsList(response.data || [])
      }catch(error){
        console.error("Error while fetching hotels",error)
      }
    };fetchHotels();
  },[])

  const fetchcomparison = async ( fromDate = null,toDate = null ) => {
    try{
      const params = {};
      if(fromDate && toDate){
        params.fromDate = fromDate;
        params.toDate = toDate;
      }
      const response =await axiosInstance.get(
        "/api/reports/hotel-summary",
        {params}
      );
      setComparison(response.data || []);
    }catch(error){
      console.error("Error while fetching data",error)
      toast.error("failed to load data")
    }
  }

  useEffect(()=>{
    fetchcomparison();
  },[]);

  // useEffect(()=>{
  //   const fetchcomparison = async ()=>{
  //     try{
  //       const response = await axiosInstance.get("/api/reports/hotel-summary")
  //       setComparison(response.data || [])
  //     }catch(error){
  //       console.error("Error while fetching data",error)
  //       toast.error("Failed to load data");
  //     }
  //   };fetchcomparison();
  // },[])

  // Reset "Compare With" section when switching between Agent and Hotel
 
  useEffect(() => {
    // Clear comparison-related states when selectedOption changes
    setCompareOption("");
    setSelectedOtherEntity("");
    setSelectedFromDate("");
    setSelectedToDate("");
    setShowCompareDropdown(false);
    setShowDateInputs(false);
  }, [selectedOption]);

  // Options for Agent/Hotel dropdown
  const agentOptions = useMemo(() => {
    if (!agentsList || !Array.isArray(agentsList)) return [];
    return agentsList
      .map(agent => agent.companyName || agent.agentName || agent.name || '')
      .filter(Boolean)
      .sort();
  }, [agentsList]);

  const hotelOptions = useMemo(() => {
    if (!hotelsList || !Array.isArray(hotelsList)) return [];
    return hotelsList
      .map(hotel => hotel.hotelName || hotel.name || '')
      .filter(Boolean)
      .sort();
  }, [hotelsList]);

  // Extract agent booking data from comparison API response
  const agentData = useMemo(() => {
    if (!comparison || !Array.isArray(comparison)) return [];
    return comparison
      .filter(item => item.agentId || item.agentName || item.agentname)
      .map(item => {
        const agentName = item.agentName || item.agentname || '';
        return {
          slNo: item.slNo || item.id,
          agentname: agentName,
          noofbooking: item.noOfBooking || item.noofbooking || item.noOfBookings || 0,
          cancelledbooking: item.cancelledBooking || item.cancelledbooking || item.cancelledBookings || 0,
          fromDate: item.fromDate || item.checkIn || item.bookingDate || item.date,
          toDate: item.toDate || item.checkOut || item.bookingDate || item.date
        };
      });
  }, [comparison]);

  // Extract hotel booking data from comparison API response
  const hotelData = useMemo(() => {
    if (!comparison || !Array.isArray(comparison)) return [];
    return comparison
      .filter(item => item.hotelId || item.hotelName || item.hotelname)
      .map(item => {
        const hotelName = item.hotelName || item.hotelname || '';
        return {
          slNo: item.slNo || item.id,
          agentname: hotelName,
          noofbooking: item.noOfBooking || item.noofbooking || item.noOfBookings || 0,
          cancelledbooking: item.cancelledBooking || item.cancelledbooking || item.cancelledBookings || 0,
          fromDate: item.fromDate || item.checkIn || item.bookingDate || item.date,
          toDate: item.toDate || item.checkOut || item.bookingDate || item.date
        };
      });
  }, [comparison]);

  // Other entities for comparison (exclude the selected one)
  const otherOptions = useMemo(() => {
    if (selectedOption === "agent") {
      if (!selectedAgentHotel) {
        return agentOptions.filter(opt => opt && opt.trim() !== '');
      }
      const selectedTrimmed = String(selectedAgentHotel).trim().toLowerCase();
      return agentOptions.filter(opt => {
        if (!opt || opt.trim() === '') return false;
        const optTrimmed = String(opt).trim().toLowerCase();
        return optTrimmed !== selectedTrimmed;
      });
    } else if (selectedOption === "hotel") {
      if (!selectedAgentHotel) {
        return hotelOptions.filter(opt => opt && opt.trim() !== '');
      }
      const selectedTrimmed = String(selectedAgentHotel).trim().toLowerCase();
      return hotelOptions.filter(opt => {
        if (!opt || opt.trim() === '') return false;
        const optTrimmed = String(opt).trim().toLowerCase();
        return optTrimmed !== selectedTrimmed;
      });
    }
    return [];
  }, [selectedOption, selectedAgentHotel, agentOptions, hotelOptions]);

  // Data for other entities (for "Other" comparison)
  const otherEntitiesData = useMemo(() => {
    const data = {};
    otherOptions.forEach(option => {
      if (selectedOption === "agent") {
        data[option] = agentData.filter(item => item.agentname === option);
      } else if (selectedOption === "hotel") {
        data[option] = hotelData.filter(item => item.agentname === option);
      }
    });
    return data;
  }, [otherOptions, selectedOption, agentData, hotelData]);

  const handleSendEmail = async () => {
    if (!emailAddress || !emailAddress.includes('@')) {
      toast.error("Please enter a valid email address");
      return;
    }
  
    setIsSending(true);
    try {
      const response = await axiosInstance.post('/api/reports/send-email', {
        email: emailAddress,
        reportType: 'Comparison',
        subType: reportType, 
        filters: {
          selectedOption: selectedOption,
          selectedAgentHotel: selectedAgentHotel,
          compareOption: compareOption,
          selectedOtherEntity: selectedOtherEntity,
          fromDate: selectedFromDate,
          toDate: selectedToDate,
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
    const primaryData = (reportType === 'agent' ? agentData : hotelData)
      .filter(item => item.agentname === selectedAgentHotel)
      .filter(item => {
        if (!selectedFromDate || !selectedToDate) return true;
        const itemFromDate = new Date(item.fromDate);
        const itemToDate = new Date(item.toDate);
        const selectedFrom = new Date(selectedFromDate);
        const selectedTo = new Date(selectedToDate);
        return itemFromDate <= selectedTo && itemToDate >= selectedFrom;
      });
    
   
    const otherData = compareOption === "other" && selectedOtherEntity 
      ? otherEntitiesData[selectedOtherEntity] || []
      : [];
    const allData = [...primaryData, ...otherData];
  const columns = ['Sl.No', 'Entity Name', 'No Of Booking', 'Cancelled Booking'];
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Comparison Report - ${reportType === 'agent' ? 'Agent' : 'Hotel'}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            h1 { text-align: center; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <h1>Comparison Report - ${reportType === 'agent' ? 'Agent' : 'Hotel'}</h1>
          <table>
            <thead>
              <tr>
                ${columns.map(col => `<th>${col}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${allData.map((item, index) => (
                `<tr>
                  <td>${index + 1}</td>
                  <td>${item.agentname}</td>
                  <td>${item.noofbooking}</td>
                  <td>${item.cancelledbooking}</td>
                </tr>`
              )).join('')}
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
    
    const primaryData = (reportType === 'agent' ? agentData : hotelData)
      .filter(item => item.agentname === selectedAgentHotel) 
      .filter(item => {
        if (!selectedFromDate || !selectedToDate) return true;
        const itemFromDate = new Date(item.fromDate);
        const itemToDate = new Date(item.toDate);
        const selectedFrom = new Date(selectedFromDate);
        const selectedTo = new Date(selectedToDate);
        return itemFromDate <= selectedTo && itemToDate >= selectedFrom;
      });
    
    const otherData = compareOption === "other" && selectedOtherEntity 
      ? otherEntitiesData[selectedOtherEntity] || []
      : [];
    
  
    const allData = [...primaryData, ...otherData];
    
    doc.text(`Comparison Report - ${reportType === 'agent' ? 'Agent' : 'Hotel'}`, 20, 20);
    
    autoTable(doc, {
      head: [['Sl.No', 'Entity Name', 'No Of Booking', 'Cancelled Booking']],
      body: allData.map((item, index) => [
        index + 1,
        item.agentname,
        item.noofbooking,
        item.cancelledbooking,
      ]),
      startY: 30,
    });
    
    doc.save(`comparison-${reportType}-report.pdf`);
  };
  
  const handleExcel = () => {
    
    const primaryData = (reportType === 'agent' ? agentData : hotelData)
      .filter(item => item.agentname === selectedAgentHotel) 
      .filter(item => {
        if (!selectedFromDate || !selectedToDate) return true;
        const itemFromDate = new Date(item.fromDate);
        const itemToDate = new Date(item.toDate);
        const selectedFrom = new Date(selectedFromDate);
        const selectedTo = new Date(selectedToDate);
        return itemFromDate <= selectedTo && itemToDate >= selectedFrom;
      });
    
    const otherData = compareOption === "other" && selectedOtherEntity 
      ? otherEntitiesData[selectedOtherEntity] || []
      : [];
    
    const allData = [...primaryData, ...otherData];
    
    const headers = ['Sl.No', 'Entity Name', 'No Of Booking', 'Cancelled Booking'];
    
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
      ...allData.map((item, index) => {
        return [
          index + 1, 
          item.agentname,
          item.noofbooking,
          item.cancelledbooking,
        ].map(escapeCSV).join(',');
      })
    ].join('\n');
  
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `comparison-${reportType}-report.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleOptionChange = (option) => {
    setSelectedOption(option);
    setShowDropdown(true);
    // Clear selected agent/hotel when switching between Agent and Hotel
    setSelectedAgentHotel("");
    // Also clear related comparison states
    setCompareOption("");
    setSelectedOtherEntity("");
    setSelectedFromDate("");
    setSelectedToDate("");
    setShowCompareDropdown(false);
    setShowDateInputs(false);
    setShowResults(false);
  };

  const handleCompareChange = (option) => {
    setCompareOption(option);
    setShowCompareDropdown(option === "other");
    setShowDateInputs(option === "date");
    setShowCompareValidation(false); 
  };
  

  return (
    <div className="bg-light d-flex flex-column" style={{ minHeight: "100vh" }}>
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />

        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Card className="shadow-sm rounded-xl" style={{ overflow: 'visible' }}>
            <Card.Header className="d-flex align-items-center gap-2">
              <BackButton forceFallback fallback="/adminDashboard" />
              <span className="fw-semibold">Comparison Report</span>
            </Card.Header>

            {/* Filters Section */}
            <div className="p-4 bg-light border-bottom">
              <Form>
                <Row className="align-items-center">
                  <Col md={6}>
                    <Form.Label className="fw-semibold">* Please select:</Form.Label>
                    <div className="d-flex gap-3 mt-2">
                      <Form.Check 
                        type="radio" 
                        label="Agent" 
                        name="selectOption" 
                        onChange={() => handleOptionChange("agent")}
                      />
                      <Form.Check 
                        type="radio" 
                        label="Hotel" 
                        name="selectOption" 
                        onChange={() => handleOptionChange("hotel")}
                      />
                    </div>
                    
                    {showDropdown && (
                      <div className="mt-3 mb-4" style={{ position: 'relative' }}>
                        <Dropdown
                          drop="down"
                          flip={false}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Dropdown.Toggle variant="outline-secondary" size="sm">
                            {selectedAgentHotel
                              ? selectedAgentHotel
                              : `Select ${selectedOption === "agent" ? "Agent" : "Hotel"} Criteria`}
                          </Dropdown.Toggle>

                          <Dropdown.Menu
                            container={document.body}
                            style={{
                              zIndex: 2000,
                              minWidth: "200px",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                              border: "1px solid #dee2e6",
                            }}
                          >
                            {(selectedOption === "agent" ? agentOptions : hotelOptions).map(
                              (option, index) => (
                                <Dropdown.Item
                                  key={index}
                                  onClick={() => setSelectedAgentHotel(option)}
                                >
                                  {option}
                                </Dropdown.Item>
                              )
                            )}
                          </Dropdown.Menu>
                        </Dropdown>
                      </div>
                    )}
                  </Col>
                  
                  <Col md={6}>
                    <Form.Label className="fw-semibold">* Compare With:</Form.Label>
                    <div className="d-flex gap-3 mt-2">
                      <Form.Check 
                        type="radio" 
                        label="Date" 
                        name="compareOption" 
                        checked={compareOption === "date"}
                        onChange={() => handleCompareChange("date")} 
                      />
                      <Form.Check 
                        type="radio" 
                        label="Other" 
                        name="compareOption" 
                        checked={compareOption === "other"}
                        onChange={() => handleCompareChange("other")}
                      />
                    </div>
                    
                    {showCompareDropdown && (
                      <div className="mt-3 mb-4">
                        {!selectedOption ? (
                          <div className="text-muted small">
                            Please select Agent or Hotel first
                          </div>
                        ) : !selectedAgentHotel ? (
                          <div className="text-muted small">
                            Please select a {selectedOption === "agent" ? "agent" : "hotel"} first
                          </div>
                        ) : (
                          <Dropdown
                            drop="down"
                            flip={false}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Dropdown.Toggle variant="outline-secondary" size="sm">
                              {selectedOtherEntity
                                ? selectedOtherEntity
                                : `Select ${selectedOption === "agent" ? "Agent" : "Hotel"} to Compare`}
                            </Dropdown.Toggle>

                            <Dropdown.Menu
                              container={document.body}
                              style={{
                                position: 'fixed !important',
                                zIndex: "9999",
                                minWidth: "200px",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                                border: "1px solid #dee2e6",
                                top: 'auto !important',
                                left: 'auto !important',
                                transform: 'none !important'
                              }}
                            >
                              {(() => {
                                // Get all available options (not filtered)
                                const allOptions = selectedOption === "agent" ? agentOptions : hotelOptions;
                                const availableOptions = allOptions.filter(opt => opt && opt.trim() !== '');
                                
                                if (availableOptions.length === 0) {
                                  return (
                                    <Dropdown.Item disabled className="text-muted">
                                      No {selectedOption === "agent" ? "agents" : "hotels"} available
                                    </Dropdown.Item>
                                  );
                                }
                                
                                // Show all options normally
                                return availableOptions.map((option, index) => (
                                  <Dropdown.Item
                                    key={index}
                                    onClick={() => setSelectedOtherEntity(option)}
                                  >
                                    {option}
                                  </Dropdown.Item>
                                ));
                              })()}
                            </Dropdown.Menu>
                          </Dropdown>
                        )}
                      </div>
                    )}

                    {/* Date input fields */}
                    {showDateInputs && (
                      <div className="mt-3">
                        <Row>
                          <Col md={6}>
                            <Form.Label className="small mb-2">From Date</Form.Label>
                            <Form.Control 
                              type="date" 
                              size="sm"
                              value={selectedFromDate}
                              onChange={(e) => setSelectedFromDate(e.target.value)}
                            />
                          </Col>
                          <Col md={6}>
                            <Form.Label className="small mb-2">To Date</Form.Label>
                            <Form.Control 
                              type="date" 
                              size="sm"
                              value={selectedToDate}
                              onChange={(e) => setSelectedToDate(e.target.value)}
                            />
                          </Col>
                        </Row>
                      </div>
                    )}
                    
                    {/* Validation message for Compare With */}
                    {showCompareValidation && !compareOption && (
                      <div className="mt-2">
                        <small className="text-danger"> Choose an option</small>
                      </div>
                    )}
                  </Col>
                </Row>

                {/* Search Button */}
                <Row className="mt-4">
                  <Col className="d-flex justify-content-end">
                    <Button 
                      variant="success" 
                      size="sm"
                      disabled={!selectedAgentHotel}
                      onClick={async() => {
                        if (!selectedAgentHotel) {
                          alert("Please select Agent or Hotel criteria first");
                          return;
                        }
                        if (!compareOption) {
                          setShowCompareValidation(true);
                          return;
                        }
                        if (compareOption === "date" && (!selectedFromDate || !selectedToDate)) {
                          alert("Please select date range");
                          return;
                        }
                        if (compareOption === "other" && !selectedOtherEntity) {
                          alert("Please select comparison entity");
                          return;
                        }
                        // Set report type and show results
                        setReportType(selectedOption);
                        
                        if (compareOption === "date" && selectedFromDate && selectedToDate) {
                          await fetchcomparison(selectedFromDate,selectedToDate);
                        }else{
                              await fetchcomparison();
                             }
                        setShowResults(true);
                      }}
                    >
                      <i className="fas fa-search me-1"></i>Search
                    </Button>
                  </Col>
                </Row>
              </Form>
            </div>

            {/* Results Section */}
            {showResults && (
              <Card.Body className="p-0 mt-1">
                {/* Action Buttons */}
                <div className="p-3 border-bottom">
                  <Row>
                    <Col className="d-flex justify-content-end gap-2">
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
                
                {/* Display and Search Row */}
                <div className="p-2 border-bottom">
                  <Row className="d-flex justify-content-between align-items-center">
                    <Col md="auto">
                      <span className="text-muted">Display</span>
                      <Form.Select size="sm" className="d-inline-block ms-2" style={{width: '80px'}}>
                        <option>10</option>
                        <option>25</option>
                        <option>50</option>
                        <option>100</option>
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

                {/* Unified Comparison Table */}
                <Table responsive hover striped className="mb-0 align-middle">
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>S/N</th>
                      <th>Agent Name</th>
                      <th>No.Of Booking</th>
                      <th>Cancelled Booking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Show primary entity data */}
                    {(reportType === 'agent' ? agentData : hotelData)
                      .filter(item => item.agentname === selectedAgentHotel)
                      .filter(item => {
                        if (!selectedFromDate || !selectedToDate) return true;
                        const itemFromDate = new Date(item.fromDate);
                        const itemToDate = new Date(item.toDate);
                        const selectedFrom = new Date(selectedFromDate);
                        const selectedTo = new Date(selectedToDate);
                        return itemFromDate <= selectedTo && itemToDate >= selectedFrom;
                      })
                      .map((item, index) => (
                        <tr key={`primary-${item.slNo}`}>
                          <td>{index + 1}</td>
                          <td>{item.agentname}</td>
                          <td>{item.noofbooking}</td>
                          <td>{item.cancelledbooking}</td>
                        </tr>
                      ))}
                    
                    {/* Show other entity data in the same table */}
                    {compareOption === "other" && selectedOtherEntity && 
                      otherEntitiesData[selectedOtherEntity]?.map((item, index) => (
                        <tr key={`other-${item.slNo}`}>
                          <td>{(reportType === 'agent' ? agentData : hotelData).filter(item => item.agentname === selectedAgentHotel).length + index + 1}</td>
                          <td>{item.agentname}</td>
                          <td>{item.noofbooking}</td>
                          <td>{item.cancelledbooking}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </Table>
              </Card.Body>
            )}
          </Card>

          {/* Mail Modal */}
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

export default Comparison;