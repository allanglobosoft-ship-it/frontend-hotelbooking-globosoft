import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Container,
  Table,
  Button,
  Spinner,
  Badge,
  Card,
  Pagination,
  Modal,
  Form,
  Row,
  Col,
} from "react-bootstrap";
import { FaArrowLeft, FaPlus, FaEdit, FaTrash, FaEye } from "react-icons/fa";
import axiosInstance from "../../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Sidebar from "../../../components/Sidebar";
import Topbar from "../../../components/TopBar";
import HotelTitleBadge from "../../../components/HotelTitleBadge";
import Swal from "sweetalert2";

const Policy = () => {
  const { id } = useParams(); // Hotel ID
  const navigate = useNavigate();
    const { pathname } = useLocation();
    const isExtranet = pathname.startsWith("/extranet");
    const navBase = isExtranet ? "/extranet" : "/hotel-actions";
    const backUrl = isExtranet ? "/extranetDashboard" : `/hotel-details/${id}`;

  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showValidityModal, setShowValidityModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [marketTypes, setMarketTypes] = useState([]);

  // ✅ Market type master — used to show names instead of raw ids
  useEffect(() => {
    axiosInstance
      .get("/api/marketType")
      .then((res) => setMarketTypes(Array.isArray(res.data) ? res.data : []))
      .catch((error) => console.error("Error fetching market types:", error));
  }, []);

  // 100 is the "All Market" option on the create/edit pages
  const getMarketTypeLabel = (marketTypeIds) => {
    if (!Array.isArray(marketTypeIds) || marketTypeIds.length === 0) return "—";
    return marketTypeIds
      .map((mid) => {
        if (Number(mid) === 100) return "All Market";
        const match = marketTypes.find(
          (m) => String(m.marketTypeId) === String(mid)
        );
        return match?.name || "—";
      })
      .join(", ");
  };

  // View — reuses the existing edit page in read-only mode. Mirrors the
  // /occupancy-and-minimumlength view pattern.
  const handleView = (policyId) =>
    navigate(`${navBase}/${id}/hotel-policy/${policyId}/edit?mode=view`);

  // ✅ Fetch hotel policies with search and pagination
  const fetchPolicies = async (pageNum = 0, searchQuery = searchTerm) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "10",
        hotelId: id, // Add hotelId to filter on backend
      });

      if (searchQuery && searchQuery.trim()) {
        params.append("search", searchQuery.trim());
      }

      const res = await axiosInstance.get(
        `/api/hotelPolicy?${params.toString()}`
      );

      console.log("📦 API Response:", res.data);

      // ✅ Handle array or paginated response
      const allPolicies = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data.data)
        ? res.data.data
        : [];

      // ✅ Filter by current hotelId (additional client-side filter if needed)
      const filteredPolicies = allPolicies.filter(
        (p) => String(p.hotelId) === String(id)
      );

      console.log("🏨 Filtered Policies for Hotel", id, filteredPolicies);
      setPolicies(filteredPolicies);

      // ✅ Calculate total pages based on data length
      if (filteredPolicies.length < 10) {
        setTotalPages(pageNum + 1);
      } else {
        setTotalPages(Math.max(totalPages, pageNum + 2));
      }

      setPage(pageNum);
    } catch (error) {
      console.error("Error fetching policies:", error);
      toast.error("Failed to load hotel policies");
      setPolicies([]);
      setTotalPages(0);
      setPage(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, [id]);

  // ✅ Debounced search effect (similar to Bank.jsx)
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Set new timeout for search
    if (searchTerm !== "") {
      const timeout = setTimeout(() => {
        fetchPolicies(0, searchTerm);
      }, 500); // 500ms delay
      setSearchTimeout(timeout);
    } else if (searchTerm === "") {
      // If search is cleared, fetch all data
      fetchPolicies(0, "");
    }

    // Cleanup timeout on unmount
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [searchTerm]);

  // ✅ Delete policy
  const handleDelete = (policy) => {
    Swal.fire({
      title: `Are you sure? You want to delete policy ${policy.policyCode}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
      customClass: {
        popup: "swal-small",
        title: "swal-small-title",
        htmlContainer: "swal-small-text",
      },
    }).then((result) => {
      if (result.isConfirmed) {
        axiosInstance
          .delete(`/api/hotelPolicy/${policy.policyId}`)
          .then(() => {
            toast.success("Policy deleted successfully");
            fetchPolicies();
          })
          .catch((error) => {
            console.error("❌ Delete Error:", error.response || error);
            toast.error("Failed to delete policy");
          });
      }
    });
  };

  // ✅ Handle status toggle
  const handleStatusToggle = (policy) => {
    setSelectedPolicy(policy);
    setShowStatusModal(true);
  };

  // ✅ Update policy status
  const updatePolicyStatus = async () => {
    if (!selectedPolicy) return;

    try {
      const payload = {
        isLive: !selectedPolicy.live,
      };

     const policyStatusRes = await axiosInstance.patch(`/api/hotelPolicy/${id}/statusUpdate/${selectedPolicy.policyId}`, payload);
     console.log("policyStatusRes:::" , policyStatusRes);
          
     if(policyStatusRes.data.live === true){
      toast.success("Policy activated successfully");
     }else{
      toast.success("Policy deactivated successfully");
     }
     
      fetchPolicies();
      setShowStatusModal(false);
    } catch (error) {
      console.error("❌ Status Update Error:", error.response || error);
      toast.error("Failed to update policy status");
    }
  };

  // ✅ Navigate to Create Policy
  const handleCreate = () => {
    navigate(`${navBase}/${id}/hotel-policy/create`);
  };

  // ✅ Handle page change
  const handlePageChange = (pageNum) => {
    if (pageNum >= 0 && pageNum < totalPages) {
      fetchPolicies(pageNum, searchTerm);
    }
  };

  // ✅ Navigate to Edit
  const handleEdit = (policyId) =>
     navigate(`${navBase}/${id}/hotel-policy/${policyId}/edit`);

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Card className="shadow-sm rounded-xl">
            {/* Header */}
            <Card.Header className="d-flex justify-content-between align-items-center py-3">
              <div className="d-flex align-items-center gap-3">
                <Button
                  variant="outline-primary"
                  onClick={() => navigate(backUrl)}
                  className="d-flex align-items-center btn-sm gap-2"
                >
                  <FaArrowLeft />
                  Back
                </Button>
                <div className="fw-semibold fs-4 text-dark">
                  Policies
                </div>
                <HotelTitleBadge hotelId={id} className="ms-2" />
              </div>
              <div className="d-flex align-items-center justify-content-between w-100">
                {/* Centered search bar */}
                <div className="d-flex justify-content-center flex-grow-1">
                  <div className="position-relative" style={{ width: "260px" }}>
                    <Form.Control
                      type="text"
                      placeholder="Search policy..."
                      value={searchTerm}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSearchTerm(value);
                        fetchPolicies(0, value); // pass value to API
                      }}
                      className="border-1  bg-light"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        className="btn btn-link position-absolute top-50 end-0 translate-middle-y"
                        style={{
                          border: "none",
                          background: "none",
                          color: "#6c757d",
                          padding: "0 12px",
                          zIndex: 10,
                        }}
                        onClick={() => {
                          setSearchTerm("");
                          fetchPolicies(0, ""); // fetch all data
                        }}
                        title="Clear search"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    )}
                  </div>
                </div>

                {/* Create button on the right */}
                <Button
                  className="ms-3"
                  style={{ backgroundColor: "#28a745", borderColor: "#28a745" }}
                  onClick={handleCreate}
                >
                  + Create
                </Button>
              </div>
            </Card.Header>

            {/* Table */}
            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>S/N</th>
                    <th>POLICY CODE</th>
                    <th>MARKET TYPE</th>
                    <th>STATUS</th>
                    <th style={{ width: 230 }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.length > 0 ? (
                    policies.map((policy, index) => (
                      <tr key={policy.policyId}>
                        <td>{page * 10 + index + 1}</td>
                        <td>{policy.policyCode || "—"}</td>
                        <td>{getMarketTypeLabel(policy.marketTypeId)}</td>
                        <td>
                          <Badge 
                            bg={policy.live ? "success" : "danger"}
                            style={{ cursor: "pointer" }}
                            onClick={() => handleStatusToggle(policy)}
                            title={`Click to ${policy.live ? 'deactivate' : 'activate'} policy`}
                          >
                            {policy.live ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td>
                          <div className="d-flex gap-2 justify-content-center">
                            <Button
                              size="sm"
                              variant="outline-info"
                              className="d-flex align-items-center gap-1"
                              onClick={() => handleView(policy.policyId)}
                              title="View"
                            >
                              <FaEye /> View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-primary"
                              className="d-flex align-items-center gap-1"
                              onClick={() => handleEdit(policy.policyId)}
                              title="Edit"
                            >
                              <FaEdit /> Edit
                            </Button>

                            <Button
                              size="sm"
                              variant="outline-danger"
                              className="d-flex align-items-center gap-1"
                              onClick={() => handleDelete(policy)}
                              title="Delete"
                            >
                              <FaTrash /> Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : loading ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        <div
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        ></div>
                        Loading policies...
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        No policies found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center p-3 border-top bg-white">
                  <div>
                    <small className="text-muted">
                      Showing {policies.length} of {totalPages * 10} policies
                    </small>
                  </div>
                  <div>
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={page === 0}
                        onClick={() => handlePageChange(page - 1)}
                      />
                      {[...Array(totalPages)].map((_, i) => (
                        <Pagination.Item
                          key={i}
                          active={i === page}
                          onClick={() => handlePageChange(i)}
                        >
                          {i + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={page === totalPages - 1}
                        onClick={() => handlePageChange(page + 1)}
                      />
                    </Pagination>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>


          {/* ✅ Validity Modal */}
          <Modal
            show={showValidityModal}
            onHide={() => setShowValidityModal(false)}
            centered
            size="lg"
          >
            <Modal.Header className="bg-primary text-white" closeButton>
              <Modal.Title>Policy Details</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {selectedPolicy ? (
                <div>
                  <h6 className="fw-bold text-primary mb-3">Policy Information</h6>
                  <Table bordered responsive>
                    <tbody>
                      <tr>
                        <td className="fw-semibold">Policy Code:</td>
                        <td>{selectedPolicy.policyCode || "—"}</td>
                      </tr>
                      <tr>
                        <td className="fw-semibold">Policy Type:</td>
                        <td>{selectedPolicy.policyType || "—"}</td>
                      </tr>
                      <tr>
                        <td className="fw-semibold">Market Type:</td>
                        <td>{getMarketTypeLabel(selectedPolicy.marketTypeId)}</td>
                      </tr>
                      <tr>
                        <td className="fw-semibold">Status:</td>
                        <td>
                          <Badge bg={selectedPolicy.live ? "success" : "secondary"}>
                            {selectedPolicy.live ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                      </tr>
                    </tbody>
                  </Table>

                  {selectedPolicy.policyDescription && (
                    <>
                      <h6 className="fw-bold text-primary mt-4 mb-2">Description</h6>
                      <p className="text-muted">{selectedPolicy.policyDescription}</p>
                    </>
                  )}

                  {selectedPolicy.termsAndConditions && (
                    <>
                      <h6 className="fw-bold text-primary mt-4 mb-2">Terms & Conditions</h6>
                      <p className="text-muted">{selectedPolicy.termsAndConditions}</p>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-muted text-center">
                  No policy details available.
                </p>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={() => setShowValidityModal(false)}
              >
                Close
              </Button>
            </Modal.Footer>
          </Modal>

          {/* ✅ Status Toggle Modal */}
          <Modal
            show={showStatusModal}
            onHide={() => setShowStatusModal(false)}
            centered
            size="sm"
          >
            <Modal.Header className="bg-warning text-dark">
              <Modal.Title>Update Policy Status</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {selectedPolicy && (
                <div className="text-center">
                  <p className="mb-3">
                    Are you sure you want to{" "}
                    <strong className={selectedPolicy.live ? "text-danger" : "text-success"}>
                      {selectedPolicy.live ? "deactivate" : "activate"}
                    </strong>{" "}
                    this policy?
                  </p>
                </div>
              )}
            </Modal.Body>
            <Modal.Footer className="justify-content-between">
              <Button 
                variant="secondary" 
                onClick={() => setShowStatusModal(false)}
              >
                Cancel
              </Button>
              <Button 
                variant={selectedPolicy?.live ? "danger" : "success"}
                onClick={updatePolicyStatus}
              >
                {selectedPolicy?.live ? "Deactivate" : "Activate"}
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
};

export default Policy;



