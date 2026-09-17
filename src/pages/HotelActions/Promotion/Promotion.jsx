import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Container,
  Table,
  Button,
  Modal,
  Form,
  Spinner,
  Badge,
  Card,
  Pagination,
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

const Promotion = () => {
  const { id } = useParams();
  const navigate = useNavigate();
    const location = useLocation();
    const { pathname } = location;
    const isExtranet = pathname.startsWith("/extranet");
    const navBase = isExtranet ? "/extranet" : "/hotel-actions";
    // When the operator navigated here from the /promotion deals
    // showcase (PromotionHotelSearch.jsx passes { state: { from:
    // "/promotion" } } on its "Manage Promotions" navigation), the
    // Back button should return them to /promotion instead of the
    // usual hotel-details / extranet dashboard fallback. The marker
    // is scoped to this specific entry point, so every other flow
    // that lands on this page (sidebar, hotel-details, extranet)
    // keeps its existing Back destination.
    const cameFromPromotionPage = location.state?.from === "/promotion";
    const backUrl = cameFromPromotionPage
      ? "/promotion"
      : isExtranet
        ? "/extranetDashboard"
        : `/hotel-details/${id}`;

  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showValidityModal, setShowValidityModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState(null);
  const [formData, setFormData] = useState({ type: "" });

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // View — reuses the existing edit route for the row's promotion type
  // in read-only mode (`?mode=view`). Each edit screen wraps its form
  // in `<fieldset disabled={isViewMode}>` so every field reads non-
  // editable and the Save button is hidden. Mirrors the
  // /occupancy-and-minimumlength view pattern.
  const handleView = (promo) => {
    const type = (promo.promotionType || "").toLowerCase();
    if (type.includes("special")) {
      navigate(`${navBase}/${id}/promotion/special-rate/edit/${promo.id}?mode=view`);
    } else if (type.includes("discount")) {
      navigate(`${navBase}/${id}/promotion/discount/edit/${promo.id}?mode=view`);
    } else if (type.includes("staypay") || type.includes("stay pay")) {
      navigate(`${navBase}/${id}/promotion/staypay/edit/${promo.id}?mode=view`);
    } else {
      toast.error("Unknown promotion type");
    }
  };

  // ✅ Fetch Promotions with search and pagination
  const fetchPromotions = async (pageNum = 0, searchQuery = searchTerm) => {
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
        `/api/hotelPromotions/${id}?${params.toString()}`
      );

      console.log("📦 API Response:", res.data);

      // ✅ Handle array or paginated response
      const allPromotions = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data.data)
        ? res.data.data
        : [];

      console.log("🏨 Filtered Promotions for Hotel", id, allPromotions);
      const uniquePromotions = allPromotions.filter(
        (promo, index, list) =>
          index ===
          list.findIndex(
            (item) =>
              item.id === promo.id &&
              item.promotionType === promo.promotionType
          )
      );

      setPromotions(uniquePromotions);

      // ✅ Calculate total pages based on data length
      if (uniquePromotions.length < 10) {
        setTotalPages(pageNum + 1);
      } else {
        setTotalPages(Math.max(totalPages, pageNum + 2));
      }

      setPage(pageNum);
    } catch (error) {
      console.error("Error fetching promotions:", error);
      toast.error("Failed to load promotions");
      setPromotions([]);
      setTotalPages(0);
      setPage(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchPromotions();
  }, [id]);

  // ✅ Debounced search effect (similar to Bank.jsx)
  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchPromotions(0, searchTerm);
    }, 500);

    return () => clearTimeout(timeout);
  }, [searchTerm]);

  // ✅ Delete promotion
  const handleDelete = (promo) => {
    Swal.fire({
      title: `Are you sure? You want to delete ${promo.promotionType} for ${promo.promotionCode}?`,
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
        let endpoint = "";
        switch (promo.promotionType) {
          case "Special Rates":
            endpoint = `/api/hotelSpecialRate/${promo.id}`;
            break;
          case "Discount":
          case "Discount Promotion":
            endpoint = `/api/discount/${promo.id}`;
            break;
          case "StayPay":
          case "Stay Pay Promotion":
            endpoint = `/api/hotelStaypay/${promo.id}`;
            break;
          default:
            toast.error("Unknown promotion type");
            return;
        }

        axiosInstance
          .delete(endpoint)
          .then(() => {
            toast.success(`${promo.promotionType} deleted successfully`);
            fetchPromotions();
          })
          .catch((error) => {
            console.error("❌ Delete Error:", error.response || error);
            toast.error("Failed to delete promotion");
          });
      }
    });
  };

  // ✅ Handle status toggle
  const handleStatusToggle = (promo) => {
    setSelectedPromo(promo);
    setShowStatusModal(true);
  };

  // ✅ Update promotion status
  const updatePromotionStatus = async () => {
    if (!selectedPromo) return;

    try {
      let endpoint = "";
      let payload = {
        id: selectedPromo.id,
        isLive: !selectedPromo.status,
        type: selectedPromo.promotionType
      };

      switch (selectedPromo.promotionType) {
        case "Special Rates":
          endpoint = `/api/hotelSpecialRate/specialRateIsLiveUpdate/${selectedPromo.id}`;
          break;
        case "Discount":
        case "Discount Promotion":
          endpoint = `/api/discount/isLiveUpdate/${selectedPromo.id}`;
          break;
        case "StayPay":
        case "Stay Pay Promotion":
          endpoint = `/api/hotelStaypay/isLiveUpdate/${selectedPromo.id}`;
          break;
        default:
          toast.error("Unknown promotion type");
          return;
      }

      await axiosInstance.put(endpoint, payload);
      toast.success(`Promotion ${payload.isLive ? 'activated' : 'deactivated'} successfully`);
      fetchPromotions();
      setShowStatusModal(false);
    } catch (error) {
      console.error("❌ Status Update Error:", error.response || error);
      toast.error("Failed to update promotion status");
    }
  };

  // Normalise the multiple date shapes the promotion endpoints return
  // ("yyyy-MM-ddTHH:mm:ss", "dd-MM-yyyy", "yyyy-MM-dd", legacy "dd-MM-yyyy HH:mm:ss")
  // into a stable display string for the validity modal & list cells.
  // Without this the modal showed whatever the API happened to emit,
  // which differed across Special Rate / Discount / Stay Pay.
  const formatValidity = (raw) => {
    if (!raw) return "—";
    const str = String(raw);
    // ISO with T separator: 2026-07-01T00:00:00 → 2026-07-01
    if (str.includes("T")) return str.split("T")[0];
    // DD-MM-YYYY[ HH:mm:ss]: flip to YYYY-MM-DD for readability
    const m = str.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    // Anything else (already YYYY-MM-DD or just a date) — pass through.
    return str;
  };

  // ✅ Handle navigation for creation
  const handleGo = () => {
    if (!formData.type) return toast.error("Please select a promotion type");
    switch (formData.type) {
      case "special-rates":
        navigate(`${navBase}/${id}/promotion/special-rate/save`);
        break;
      case "discount-promotion":
        navigate(`${navBase}/${id}/promotion/discount/save`);
        break;
      case "stay-pay-promotion":
        navigate(`${navBase}/${id}/promotion/staypay/save`);
        break;
      default:
        break;
    }
    setShowModal(false);
  };

  // ✅ Handle page change
  const handlePageChange = (pageNum) => {
    if (pageNum >= 0 && pageNum < totalPages) {
      fetchPromotions(pageNum, searchTerm);
    }
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Card className="shadow-sm rounded-xl">
            {/* Header */}
            <Card.Header className="d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center gap-3 mb-3">
                <Button
                  variant="outline-primary"
                  onClick={() => navigate(backUrl)}
                  className="d-flex align-items-center btn-sm gap-2"
                >
                  <FaArrowLeft />
                  Back
                </Button>
                <div className="fw-semibold fs-4 text-dark">
                  Promotions
                </div>
                <HotelTitleBadge hotelId={id} className="ms-2" />
              </div>
              <div className="d-flex align-items-center justify-content-between w-100">
                {/* Centered search bar */}
                <div className="d-flex justify-content-center flex-grow-1">
                  <div className="position-relative" style={{ width: "260px" }}>
                    <Form.Control
                      type="text"
                      placeholder="Search by type, status, or code..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                      }}
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
                          fetchPromotions(0, ""); // fetch all data
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
                  className="ms-3 btn-green"
                  onClick={() => setShowModal(true)}
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
                    <th>Type</th>
                    <th>Validity</th>
                    <th>Promotion Code</th>
                    <th>Day Type</th>
                    <th>Status</th>
                    <th style={{ width: 230 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {promotions.length > 0 ? (
                    promotions.map((promo, index) => (
                      <tr key={`${promo.promotionType || "promotion"}-${promo.id}`}>
                        <td>{page * 10 + index + 1}</td>
                        <td>{promo.promotionType || "—"}</td>
                        <td>
                          <Button
                            variant="link"
                            className="text-decoration-none text-primary fw-semibold p-0"
                            onClick={() => {
                              setSelectedPromo(promo);
                              setShowValidityModal(true);
                            }}
                          >
                            view
                          </Button>
                        </td>
                        <td>{promo.promotionCode || "—"}</td>
                        <td>{promo.dayType || "—"}</td>
                        <td>
                          <Badge
                            bg={promo.status ? "success" : "danger"}
                            style={{ cursor: "pointer" }}
                            onClick={() => handleStatusToggle(promo)}
                            title={`Click to ${promo.status ? 'deactivate' : 'activate'} promotion`}
                          >
                            {promo.status ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td>
                          <div className="d-flex gap-2 justify-content-center">
                            <Button
                              size="sm"
                              variant="outline-info"
                              className="d-flex align-items-center gap-1"
                              onClick={() => handleView(promo)}
                              title="View"
                            >
                              <FaEye /> View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-primary"
                              className="d-flex align-items-center gap-1"
                              onClick={() => {
                                const type = promo.promotionType?.toLowerCase();
                                if (type.includes("special")) {
                                  navigate(
                                    `${navBase}/${id}/promotion/special-rate/edit/${promo.id}`
                                  );
                                } else if (type.includes("discount")) {
                                  navigate(
                                   `${navBase}/${id}/promotion/discount/edit/${promo.id}`
                                  );
                                } else if (
                                  type.includes("staypay") ||
                                  type.includes("stay pay")
                                ) {
                                  navigate(
                                   `${navBase}/${id}/promotion/staypay/edit/${promo.id}`
                                  );
                                } else {
                                  toast.error("Unknown promotion type");
                                }
                              }}
                              title="Edit"
                            >
                              <FaEdit /> Edit
                            </Button>

                            <Button
                              size="sm"
                              variant="outline-danger"
                              className="d-flex align-items-center gap-1"
                              onClick={() => handleDelete(promo)}
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
                      <td colSpan={8} className="text-center text-muted py-4">
                        <div
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        ></div>
                        Loading promotions...
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan={8} className="text-center text-muted py-4">
                        No promotions found.
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
                      Showing {promotions.length} of {totalPages * 10} promotions
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

          {/* ✅ Create Modal */}
          <Modal show={showModal} onHide={() => setShowModal(false)} centered>
            <Modal.Header className="bg-primary text-white">
              <Modal.Title>Select Promotion Type</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <Form.Label className="fw-semibold text-danger">
                  * Choose one:
                </Form.Label>
                <div className="mt-2">
                  {[
                    {
                      id: "specialRates",
                      label: "Special Rates",
                      value: "special-rates",
                    },
                    {
                      id: "discountPromotion",
                      label: "Discount Promotion",
                      value: "discount-promotion",
                    },
                    {
                      id: "stayPayPromotion",
                      label: "Stay Pay Promotion",
                      value: "stay-pay-promotion",
                    },
                  ].map((opt) => (
                    <Form.Check
                      key={opt.id}
                      type="radio"
                      id={opt.id}
                      name="promotionType"
                      label={opt.label}
                      value={opt.value}
                      checked={formData.type === opt.value}
                      onChange={(e) =>
                        setFormData({ ...formData, type: e.target.value })
                      }
                      className="mb-2"
                    />
                  ))}
                </div>
              </Form>
            </Modal.Body>
            <Modal.Footer className="justify-content-between">
              <Button variant="danger" onClick={() => setShowModal(false)}>
                ✖ Cancel
              </Button>
              <Button variant="success" onClick={handleGo}>
                Go →
              </Button>
            </Modal.Footer>
          </Modal>

          {/* ✅ Validity Modal */}
          <Modal
            show={showValidityModal}
            onHide={() => setShowValidityModal(false)}
            centered
            size="lg"
          >
            <Modal.Header className="bg-primary text-white" closeButton>
              <Modal.Title>Validity List</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {selectedPromo ? (
                <>
                  {selectedPromo.contractRateValidityDTO?.length > 0 && (
                    <>
                      <h6 className="fw-bold text-primary mb-2">
                        Special Rates
                      </h6>
                      <Table bordered responsive>
                        <thead>
                          <tr className="table-light">
                            <th>Validity From</th>
                            <th>Validity To</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPromo.contractRateValidityDTO.map((v, i) => (
                            <tr key={i}>
                              <td>{v.validityFrom || "—"}</td>
                              <td>{v.validityTo || "—"}</td>
                              <td>
                                <Badge bg="success">Live</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </>
                  )}

                  {selectedPromo.promotionValidityDTO && (
                    <>
                      <h6 className="fw-bold text-primary mb-2">
                        Discount Periods
                      </h6>
                      <Table bordered responsive>
                        <thead>
                          <tr className="table-light">
                            <th>Validity From</th>
                            <th>Validity To</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPromo.promotionValidityDTO.discountValidities?.map(
                            (v, i) => (
                              <tr key={i}>
                                <td>{formatValidity(v.validityFrom)}</td>
                                <td>{formatValidity(v.validityTo)}</td>
                                <td>
                                  <Badge bg="success">Live</Badge>
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </Table>

                      <h6 className="fw-bold text-primary mt-4 mb-2">
                        BlackOut
                      </h6>
                      <Table bordered responsive>
                        <thead>
                          <tr className="table-light">
                            <th>BlackOut From</th>
                            <th>BlackOut To</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPromo.promotionValidityDTO.blackOutValidities?.map(
                            (b, i) => (
                              <tr key={i}>
                                <td>{formatValidity(b.blackOutFrom)}</td>
                                <td>{formatValidity(b.blackOutTo)}</td>
                                <td>
                                  <Badge bg="secondary">—</Badge>
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </Table>
                    </>
                  )}
                </>
              ) : (
                <p className="text-muted text-center">
                  No validity data available.
                </p>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="danger"
                onClick={() => setShowValidityModal(false)}
              >
                ✖ Cancel
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
              <Modal.Title>Update Promotion Status</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {selectedPromo && (
                <div className="text-center">
                  <p className="mb-3">
                    Are you sure you want to{" "}
                    <strong className={selectedPromo.status ? "text-danger" : "text-success"}>
                      {selectedPromo.status ? "deactivate" : "activate"}
                    </strong>{" "}
                    this promotion?
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
                variant={selectedPromo?.status ? "danger" : "success"}
                onClick={updatePromotionStatus}
              >
                {selectedPromo?.status ? "Deactivate" : "Activate"}
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
};

export default Promotion;
