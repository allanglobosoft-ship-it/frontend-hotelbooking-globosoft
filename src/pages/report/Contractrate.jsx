import React, { useState, useEffect } from "react";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import BackButton from "../../components/BackButton";
import { Row, Col, Card, Form, Button, Table } from "react-bootstrap";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import HotelFilter from "../../components/filters/Hotelfilters";
import MarketType from "../../components/filters/MarketType";
import Supplier from "../../components/filters/Supplier";
import DestinationCity from "../../components/filters/DestinationCity";

export default function Contractrate() {
  const [contracts, setContracts] = useState([]);
  const [marketTypes, setMarketTypes] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const initialFilters = {
    fromDate: "",
    toDate: "",
    marketType: "",
    hotelId: "",
  };
  const [filters, setFilters] = useState(initialFilters);

  // Booking-level search filters (sent to the search API) — a contract is
  // listed when its hotel has at least one matching booking. Service Name is
  // covered by the existing Hotel filter; the existing From/To Date filters
  // the contract validity, which is separate from the Service (check-in) Date.
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

  // Fetches contract rates; all filters are optional query params
  const fetchContracts = async (allFilters = {}) => {
    const params = {};
    Object.entries(allFilters).forEach(([key, value]) => {
      const trimmed = typeof value === "string" ? value.trim() : value;
      if (trimmed !== "" && trimmed !== null && trimmed !== undefined) {
        params[key] = trimmed;
      }
    });
    const res = await axiosInstance.get("/api/reports/contract-rate/search", { params });
    return Array.isArray(res.data) ? res.data : [];
  };

  // Fetch initial contract data
  useEffect(() => {
    const loadInitial = async () => {
      try {
        setContracts(await fetchContracts());
      } catch (e) {
        console.error(e);
      }
    };
    loadInitial();

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

  // Fetch market types for display purposes
  useEffect(() => {
    const fetchMarketTypes = async () => {
      try {
        const res = await axiosInstance.get("/api/marketType");
        setMarketTypes(res.data?.filter((i) => !i.isDeleted) || []);
      } catch (e) {
        console.error("Failed to load market types");
      }
    };
    fetchMarketTypes();
  }, []);

  const getMarketTypeNames = (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return "N/A";
    return ids
      .map((id) => marketTypes.find((m) => m.marketTypeId === id)?.name || id)
      .join(", ");
  };

  const handleSearch = async () => {
    setSearchLoading(true);
    try {
      // Contract filters + booking-level filters, all applied server-side
      const data = await fetchContracts({ ...filters, ...tempBookingFilters });
      setContracts(data);
      toast.success(`Found ${data.length} contract(s)`);
    } catch (e) {
      toast.error("Failed to fetch contracts");
      setContracts([]);
    }
    setSearchLoading(false);
  };

  const handleReset = async () => {
    setFilters(initialFilters);
    setTempBookingFilters(initialBookingFilters);
    try {
      setContracts(await fetchContracts());
    } catch (e) {
      console.error(e);
      setContracts([]);
    }
  };

  const handlePrint = () => {
    if (!contracts.length) return toast.error("No data to print");

    const win = window.open("", "_blank");
    let html = `
      <html>
        <head>
          <title>Contract Rate Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            h1 { text-align: center; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <h1>Contract Rate Report</h1>
    `;

    contracts.forEach((c) => {
      html += `
        <h4>Rate Code: ${c.rateCode || "N/A"}</h4>
        <p><b>Market Type:</b> ${getMarketTypeNames(c.markeType)}</p>
        <p><b>Validity:</b><br>${
          c.contractRateValidityDTO?.map(
            (v) => `${v.validityFrom} to ${v.validityTo}<br>`
          ) || "N/A"
        }</p>

        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Single</th>
              <th>Double</th>
              <th>EB Adult</th>
              <th>EB Child</th>
            </tr>
          </thead>
          <tbody>
      `;

      c.contractRateRoomDTO?.forEach((r) => {
        html += `
          <tr>
            <td>${r.meal ? "Room with Breakfast" : "Room Only"}</td>
            <td>${r.rate || "-"}</td>
            <td>${r.rate || "-"}</td>
            <td>${r.adultRate || "-"}</td>
            <td>${r.childRate || "-"}</td>
          </tr>
        `;
      });

      html += `</tbody></table><br><hr>`;
    });

    html += `</body></html>`;
    win.document.write(html);
    win.document.close();
    win.print();
  };

  const handlePDF = () => {
    if (!contracts.length) {
      toast.error("No data available to export");
      return;
    }

    const doc = new jsPDF();
    doc.text("Contract Rate Report", 20, 20);

    contracts.forEach((c, idx) => {
      let yPos = 30;
      
      if (idx > 0) {
        doc.addPage();
        yPos = 20;
      }

      doc.text(`Rate Code: ${c.rateCode || "N/A"}`, 20, yPos);
      yPos += 10;
      doc.text(`Market Type: ${getMarketTypeNames(c.markeType)}`, 20, yPos);
      yPos += 10;
      
      if (c.contractRateValidityDTO?.length > 0) {
        doc.text("Validity:", 20, yPos);
        yPos += 7;
        c.contractRateValidityDTO.forEach((v) => {
          doc.text(`${v.validityFrom} to ${v.validityTo}`, 25, yPos);
          yPos += 7;
        });
      }

      if (c.contractRateRoomDTO?.length > 0) {
        const tableData = c.contractRateRoomDTO.map((r) => [
          r.meal ? "Room with Breakfast" : "Room Only",
          r.rate || "-",
          r.rate || "-",
          r.adultRate || "-",
          r.childRate || "-",
        ]);

        autoTable(doc, {
          head: [["Type", "Single", "Double", "EB Adult", "EB Child"]],
          body: tableData,
          startY: yPos + 5,
          margin: { left: 20 },
        });
      }
    });

    doc.save("contract-rate-report.pdf");
    toast.success("PDF downloaded successfully");
  };

  const handleExcel = () => {
    if (!contracts.length) {
      toast.error("No data available to export");
      return;
    }

    const escapeCSV = (v) => {
      const s = String(v || "");
      return (s.includes(",") || s.includes("\n") || s.includes('"'))
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    let csvRows = [];
    
    contracts.forEach((c) => {
      csvRows.push(`Rate Code: ${escapeCSV(c.rateCode || "N/A")}`);
      csvRows.push(`Market Type: ${escapeCSV(getMarketTypeNames(c.markeType))}`);
      
      if (c.contractRateValidityDTO?.length > 0) {
        csvRows.push("Validity:");
        c.contractRateValidityDTO.forEach((v) => {
          csvRows.push(`${escapeCSV(v.validityFrom)} to ${escapeCSV(v.validityTo)}`);
        });
      }

      csvRows.push("Type,Single,Double,EB Adult,EB Child");
      if (c.contractRateRoomDTO?.length > 0) {
        c.contractRateRoomDTO.forEach((r) => {
          csvRows.push([
            escapeCSV(r.meal ? "Room with Breakfast" : "Room Only"),
            escapeCSV(r.rate || "-"),
            escapeCSV(r.rate || "-"),
            escapeCSV(r.adultRate || "-"),
            escapeCSV(r.childRate || "-"),
          ].join(","));
        });
      }
      
      csvRows.push(""); // Empty line between contracts
    });

    const csv = csvRows.join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contract-rate-report.csv";
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success("Excel file downloaded successfully");
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
              <span className="fw-semibold">Contract Rate Report</span>
            </Card.Header>

            {/* Filters */}
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
                <Col md={3}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">From Date</Form.Label>
                    <Form.Control
                      type="date"
                      size="sm"
                      value={filters.fromDate}
                      onChange={(e) =>
                        setFilters({ ...filters, fromDate: e.target.value })
                      }
                    />
                  </Form.Group>
                </Col>

                <Col md={3}>
                  <Form.Group className="mb-0">
                    <Form.Label className="small mb-2">To Date</Form.Label>
                    <Form.Control
                      type="date"
                      size="sm"
                      value={filters.toDate}
                      onChange={(e) =>
                        setFilters({ ...filters, toDate: e.target.value })
                      }
                    />
                  </Form.Group>
                </Col>

                <Col md={3}
>
                  <MarketType
                    value={filters.marketType}
                    onChange={(value) =>
                      setFilters({ ...filters, marketType: value || "" })
                    }
                  />
                </Col>

                <Col md={3}>
                  <HotelFilter
                    value={filters.hotelId}
                    onChange={(value) =>
                      setFilters({ ...filters, hotelId: value })
                    }
                  />
                </Col>
              </Row>

              <Row className="mt-3">
                <Col md={3}>
                  <Button
                    variant="success"
                    className="w-100"
                    size="sm"
                    style={{ backgroundColor: "#676767", borderColor: "#676767" }} onClick={handleSearch}
                    disabled={searchLoading}
                  >
                    {searchLoading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2"></span>
                        Searching...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-search me-1"></i>Search
                      </>
                    )}
                  </Button>
                </Col>
                <Col md={3}>
                  <Button
                    variant="outline-secondary"
                    className="w-100"
                    size="sm"
                    onClick={handleReset}
                    disabled={searchLoading}
                  >
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
                </Col>
              </Row>
            </div>

            {/* Results */}
            <Card.Body className="p-0 mt-1">
              {contracts.length > 0 ? (
                contracts.map((c, idx) => (
                  <div key={idx} className="mb-4">
                    <h5 className="text-center">Contract Rate</h5>

                    <Row className="mb-3">
                      <Col md={4}>
                        <b>Market Type:</b>
                        <p>{getMarketTypeNames(c.markeType)}</p>
                      </Col>
                      <Col md={4}>
                        <b>Validity:</b>
                        {c.contractRateValidityDTO?.map((v, i) => (
                          <p key={i}>{v.validityFrom} - {v.validityTo}</p>
                        ))}
                      </Col>
                      <Col md={4}>
                        <b>Rate Code:</b>
                        <p>{c.rateCode || "N/A"}</p>
                      </Col>
                    </Row>

                    {c.contractRateRoomDTO?.length > 0 ? (
                      <Table bordered>
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Single</th>
                            <th>Double</th>
                            <th>EB Adult</th>
                            <th>EB Child</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.contractRateRoomDTO.map((r, i) => (
                            <tr key={i}>
                              <td>{r.meal ? "Room with Breakfast" : "Room Only"}</td>
                              <td>{r.rate}</td>
                              <td>{r.rate}</td>
                              <td>{r.adultRate}</td>
                              <td>{r.childRate}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    ) : (
                      <p className="text-muted text-center">
                        No room rate data
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-center text-muted">No contract data</p>
              )}
            </Card.Body>
          </Card>
        </main>
      </div>
    </div>
  );
}
