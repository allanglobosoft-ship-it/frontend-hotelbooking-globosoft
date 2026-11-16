import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Card,
  Form,
  Button,
  Table,
  Badge,
  Spinner,
  Row,
  Col,
} from "react-bootstrap";
import toast from "react-hot-toast";
import axiosInstance from "../../components/AxiosInstance";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import BackButton from "../../components/BackButton";
import { ArrowLeft, CheckCircle, AlertTriangle } from "lucide-react";

const HotelMappingBulkList = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchResults, setSearchResults] = useState(
    location.state?.searchResults || [],
  );
  const [bulkMapping, setBulkMapping] = useState(false);

  // Selection states
  const [selectedHundredPercentGroups, setSelectedHundredPercentGroups] =
    useState([]);
  const [
    selectedBelowHundredPercentGroup,
    setSelectedBelowHundredPercentGroup,
  ] = useState(null);

  console.log("searchResults::", searchResults);

  // Initialize 100% selections on load
  useEffect(() => {
    const unmappedHundredPercent = searchResults.reduce((acc, group, idx) => {
      if (
        Number(group.matchScore) === 100 &&
        group.hotels.some((h) => !h.mappingStatus)
      ) {
        acc.push(idx);
      }
      return acc;
    }, []);
    setSelectedHundredPercentGroups(unmappedHundredPercent);
  }, []);

  const handleConfirmBulkMap = async () => {
    const selectedIndices = [
      ...selectedHundredPercentGroups,
      ...(selectedBelowHundredPercentGroup !== null
        ? [selectedBelowHundredPercentGroup]
        : []),
    ];

    if (selectedIndices.length === 0) {
      toast.error("Please select at least one group to map.");
      return;
    }

    const unmappedGroupsToMap = selectedIndices.map(
      (idx) => searchResults[idx],
    );

    setBulkMapping(true);

    try {
      const payload = unmappedGroupsToMap.map((group) => {
        const sourceHotel = group.hotels[0];
        return {
          sourceSupplier: sourceHotel.supplier,
          sourceSupplierHotelId: sourceHotel.supplierHotelId,
          hotelsToMap: group.hotels.map((h) => ({
            supplier: h.supplier,
            supplierHotelId: h.supplierHotelId,
            name: h.name,
            latitude: h.latitude,
            longitude: h.longitude,
            city: h.city,
            country: h.country,
          })),
        };
      });

      const response = await axiosInstance.post(
        "/api/hotel-mapping/map-duplicates",
        payload,
        { timeout: 0 },
      );

      if (response.status === 200) {
        // One result per group: count real failures and the targets left on
        // another master hotel instead of always claiming full success.
        const results = Array.isArray(response.data) ? response.data : [];
        const failed = results.filter((r) => r && r.success === false).length;
        const skipped = results.reduce(
          (n, r) => n + (Array.isArray(r?.skipped) ? r.skipped.length : 0),
          0,
        );
        const mappedGroups = unmappedGroupsToMap.length - failed;
        if (failed > 0 || skipped > 0) {
          toast(
            `Mapped ${mappedGroups} of ${unmappedGroupsToMap.length} groups.` +
              (failed > 0 ? ` ${failed} failed.` : "") +
              (skipped > 0
                ? ` ${skipped} hotel(s) skipped: already mapped to another master hotel.`
                : ""),
            { icon: "⚠️", duration: 10000 },
          );
        } else {
          toast.success(
            `Successfully mapped ${unmappedGroupsToMap.length} groups!`,
          );
        }
        // Navigate back to the mapping page after a short delay to let the toast be seen
        setTimeout(() => {
          navigate("/masters/hotel-mapping");
        }, failed > 0 || skipped > 0 ? 4000 : 1500);
      } else {
        toast.error("Failed to map bulk data.");
      }
    } catch (error) {
      console.error("Bulk mapping error:", error);
      toast.error(
        error.response?.data?.message || "Error occurred during bulk mapping.",
      );
    } finally {
      setBulkMapping(false);
    }
  };

  const hundredPercentGroups = searchResults
    .map((group, idx) => ({ group, idx }))
    .filter(
      ({ group }) =>
        Number(group.matchScore) === 100 &&
        group.hotels.some((h) => !h.mappingStatus),
    );

  const underHundredPercentGroups = searchResults
    .map((group, idx) => ({ group, idx }))
    .filter(
      ({ group }) =>
        Number(group.matchScore) < 100 &&
        group.hotels.some((h) => !h.mappingStatus),
    );

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4" style={{ minWidth: 0, overflowX: "hidden" }}>
          <Card className="shadow-sm border-0 mb-4">
            <Card.Body className="p-4">
              <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                  <Button
                    variant="link"
                    className="p-0 text-decoration-none d-flex align-items-center text-muted mb-2"
                    onClick={() => navigate(-1)}
                  >
                    <ArrowLeft size={18} className="me-1" /> Back to Search
                  </Button>
                  <span className="d-flex align-items-center gap-2">
                    <BackButton fallback="/adminDashboard" />
                    <h4 className="fw-bold mb-0">Bulk Mapping Review</h4>
                  </span>
                  <p className="text-muted small">
                    Review and select candidate groups for bulk mapping.
                  </p>
                </div>
                <div className="text-end">
                  <p className="mb-2">
                    {hundredPercentGroups.length +
                      underHundredPercentGroups.length}{" "}
                    Unmapped Groups Total
                  </p>
                  <div>
                    <Button
                      variant="success"
                      size="lg"
                      className="fw-bold px-4"
                      onClick={handleConfirmBulkMap}
                      disabled={
                        bulkMapping ||
                        (selectedHundredPercentGroups.length === 0 &&
                          selectedBelowHundredPercentGroup === null)
                      }
                    >
                      {bulkMapping ? (
                        <>
                          <Spinner size="sm" className="me-2" /> Mapping...
                        </>
                      ) : (
                        "Confirm & Map Selected"
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <Row>
                {/* 100% Match Column */}
                <Col lg={6}>
                  <Card className="border-0 shadow-sm h-100">
                    <Card.Header className="bg-success bg-opacity-10 py-3 border-0">
                      <div className="d-flex justify-content-between align-items-center">
                        <h6 className="fw-bold mb-0 text-success d-flex align-items-center">
                          <CheckCircle size={18} className="me-2" /> 100% Match
                          Groups
                        </h6>
                        <Button
                          variant="link"
                          size="sm"
                          className="text-decoration-none p-0 text-success fw-bold"
                          onClick={() => {
                            const indices = hundredPercentGroups.map(
                              (g) => g.idx,
                            );
                            setSelectedHundredPercentGroups(
                              selectedHundredPercentGroups.length ===
                                indices.length
                                ? []
                                : indices,
                            );
                          }}
                        >
                          {selectedHundredPercentGroups.length ===
                            hundredPercentGroups.length
                            ? "Deselect All"
                            : "Select All"}
                        </Button>
                      </div>
                    </Card.Header>
                    <Card.Body
                      className="p-0"
                      style={{ maxHeight: "60vh", overflowY: "auto" }}
                    >
                      {hundredPercentGroups.length > 0 ? (
                        <div className="list-group list-group-flush">
                          {hundredPercentGroups.map(({ group, idx }) => (
                            <div
                              key={idx}
                              className={`list-group-item p-3 ${selectedHundredPercentGroups.includes(idx)
                                  ? "bg-light"
                                  : ""
                                }`}
                            >
                              <Form.Check id={`group-100-${idx}`}>
                                <Form.Check.Input
                                  type="checkbox"
                                  checked={selectedHundredPercentGroups.includes(
                                    idx,
                                  )}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedHundredPercentGroups(
                                        (prev) => [...prev, idx],
                                      );
                                    } else {
                                      setSelectedHundredPercentGroups((prev) =>
                                        prev.filter((id) => id !== idx),
                                      );
                                    }
                                  }}
                                />
                                <Form.Check.Label className="ms-2 w-100 cursor-pointer">
                                  <div className="d-flex justify-content-between align-items-start">
                                    <div className="fw-bold text-dark">
                                      {group.hotels[0]?.name}
                                    </div>
                                    <Badge bg="light" text="dark">
                                      {group.hotels.length} hotels
                                    </Badge>
                                  </div>
                                  <div className="text-muted small">
                                    City: {group.hotels[0]?.city} | Country:{" "}
                                    {group.hotels[0]?.country}
                                  </div>
                                  {/* <div className="text-muted small">
                                    Supplier: {group.hotels[0]?.city} | Country:{" "}
                                    {group.hotels[0]?.country}
                                  </div> */}
                                   <div className="text-muted small">
                                    Supplier:  {[...new Set(group.hotels.map(h => h.supplier))].map((sup, sIdx) => (
                                        <span  key={sIdx} bg="light" text="dark" className="font-monospace" style={{fontSize: '12px'}}>
                                          {sup}
                                        </span >
                                      ))}
                                  </div>
                               
                                </Form.Check.Label>
                              </Form.Check>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-5 text-center text-muted">
                          No unmapped 100% match groups available.
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                </Col>

                {/* Below 100% Match Column */}
                <Col lg={6}>
                  <Card className="border-0 shadow-sm h-100">
                    <Card.Header className="bg-warning bg-opacity-10 py-3 border-0">
                      <h6 className="fw-bold mb-0 text-warning d-flex align-items-center">
                        <AlertTriangle size={18} className="me-2" /> Under 100%
                        Match
                      </h6>
                    </Card.Header>
                    <Card.Body
                      className="p-0"
                      style={{ maxHeight: "60vh", overflowY: "auto" }}
                    >
                      {underHundredPercentGroups.length > 0 ? (
                        <div className="list-group list-group-flush">
                          {underHundredPercentGroups.map(({ group, idx }) => (
                            <div
                              key={idx}
                              className={`list-group-item p-3 ${selectedBelowHundredPercentGroup === idx
                                  ? "bg-light"
                                  : ""
                                }`}
                            >
                              <Form.Check id={`group-under-${idx}`}>
                                <Form.Check.Input
                                  type="radio"
                                  name="under100Group"
                                  checked={
                                    selectedBelowHundredPercentGroup === idx
                                  }
                                  onChange={() =>
                                    setSelectedBelowHundredPercentGroup(idx)
                                  }
                                />
                                <Form.Check.Label className="ms-2 w-100 cursor-pointer">
                                  <div className="d-flex justify-content-between align-items-start">
                                    <div className="fw-bold text-dark">
                                      {group.hotels[0]?.name}
                                    </div>
                                    <span style={{ whiteSpace: "nowrap" }}>
                                      Score:{" "}
                                      {Number(group.matchScore).toFixed(2)}%
                                    </span>
                                  </div>
                                  <div className="text-muted small">
                                    Matches: {group.hotels.length} hotels
                                  </div>
                                </Form.Check.Label>
                              </Form.Check>
                            </div>
                          ))}
                          <div className="p-3 bg-light border-top">
                            <Form.Check id="group-none">
                              <Form.Check.Input
                                type="radio"
                                name="under100Group"
                                checked={
                                  selectedBelowHundredPercentGroup === null
                                }
                                onChange={() =>
                                  setSelectedBelowHundredPercentGroup(null)
                                }
                              />
                              <Form.Check.Label className="ms-2 small text-muted">
                                Do not include any under-100% matches
                              </Form.Check.Label>
                            </Form.Check>
                          </div>
                        </div>
                      ) : (
                        <div className="p-5 text-center text-muted">
                          No unmapped groups with match score {"<"} 100%
                          available.
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </main>
      </div>
    </div>
  );
};

export default HotelMappingBulkList;
