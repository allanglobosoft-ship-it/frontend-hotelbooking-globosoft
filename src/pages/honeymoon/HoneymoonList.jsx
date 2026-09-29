import React, { useEffect, useState } from "react";
import {
  Card,
  Button,
  Row,
  Col,
  Container,
  Badge,
  Spinner,
  Alert,
  Pagination,
  Modal,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import {
  FaPlus,
  FaSuitcaseRolling,
  FaMapMarkerAlt,
  FaMoon,
  FaEye,
  FaEdit,
  FaTrash,
  FaSearch,
  FaExclamationTriangle,
  FaRupeeSign,
  FaStar,
  FaArrowLeft,
} from "react-icons/fa";
import { toast } from "react-hot-toast";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import "../../styles/HotelList.css";
import DashboardRedirections from "../../components/DashboardRedirections";

const PAGE_SIZE = 12;

const HoneymoonList = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get("/api/honeymoon/list");
      const data = Array.isArray(res.data) ? res.data : res.data?.content || [];
      setItems(data);
      setFiltered(data);
    } catch (e) {
      console.error(e);
      setError("Failed to load packages.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    setFiltered(
      !q
        ? items
        : items.filter(
            (p) =>
              p.packageName?.toLowerCase().includes(q) ||
              p.destination?.toLowerCase().includes(q) ||
              p.category?.toLowerCase().includes(q) ||
              p.theme?.toLowerCase().includes(q)
          )
    );
    setPage(0);
  }, [search, items]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const doDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await axiosInstance.delete(`/api/honeymoon/${toDelete.id}`);
      toast.success("Package deleted");
      setToDelete(null);
      load();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="min-vh-100 d-flex flex-column"
      style={{ background: "#f5f7fb" }}
    >
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Container fluid>
            {/* Back to the signed-in user's dashboard — top-left, above the page header */}
            <div className="mb-3">
              <Button
                variant="outline-secondary"
                onClick={() => DashboardRedirections((localStorage.getItem("currentActiveRole") || "").trim().toUpperCase(), navigate)}
                className="d-inline-flex align-items-center gap-2 rounded-pill px-3 py-2"
              >
                <FaArrowLeft />
                Back
              </Button>
            </div>

            <div className="d-flex justify-content-between align-items-center mb-4">
              <div>
                <h2 className="text-primary mb-1">
                  <FaSuitcaseRolling className="me-2" />
                  Honeymoon Packages
                </h2>
                <p className="text-muted mb-0">Manage curated romantic getaways.</p>
              </div>
              <Button
                variant="success"
                onClick={() => navigate("/honeymoon/register")}
                className="rounded-pill shadow d-flex align-items-center gap-2 px-4 py-2"
              >
                <FaPlus /> New Honeymoon Package
              </Button>
            </div>

            <Card className="shadow-lg border-0 rounded-4">
              <Card.Header className="bg-gradient-primary text-white border-0 rounded-top-4">
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                  <h4 className="mb-0">
                    <FaSuitcaseRolling className="me-2" /> Honeymoon Package List
                  </h4>
                  <div className="d-flex align-items-center gap-3">
                    <Badge bg="light" text="dark" className="fs-6 px-3 py-2">
                      {filtered.length} Package{filtered.length !== 1 ? "s" : ""}
                      {search && (
                        <span className="ms-2 text-muted">(from {items.length})</span>
                      )}
                    </Badge>
                    <div className="search-wrapper">
                      <i className="bi bi-search search-icon"></i>
                      <input
                        type="text"
                        placeholder="Search by name, destination, theme..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="modern-search-input"
                      />
                    </div>
                  </div>
                </div>
              </Card.Header>

              <Card.Body className="p-4">
                {loading ? (
                  <div className="text-center py-5">
                    <Spinner animation="border" variant="primary" />
                  </div>
                ) : error ? (
                  <Alert variant="danger" className="text-center">
                    <FaExclamationTriangle className="me-2" />
                    {error}
                    <Button variant="outline-danger" className="ms-3" onClick={load}>
                      Retry
                    </Button>
                  </Alert>
                ) : pageData.length === 0 ? (
                  <div className="text-center py-5">
                    <FaSuitcaseRolling size={64} className="mb-3 text-muted opacity-50" />
                    <h5 className="text-muted mb-2">
                      {search ? "No Packages Found" : "No Honeymoon Packages Yet"}
                    </h5>
                    {search ? (
                      <Button
                        variant="outline-primary"
                        onClick={() => setSearch("")}
                        className="rounded-pill"
                      >
                        <FaSearch /> Clear Search
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        onClick={() => navigate("/honeymoon/register")}
                        className="rounded-pill"
                      >
                        <FaPlus /> Create First Package
                      </Button>
                    )}
                  </div>
                ) : (
                  <Row>
                    {pageData.map((p) => (
                      <Col key={p.id} lg={4} md={6} className="mb-4">
                        <Card
                          className="h-100 shadow-sm border-0 rounded-4 hotel-card"
                          style={{ cursor: "pointer" }}
                          onClick={() => navigate(`/honeymoon/view/${p.id}`)}
                        >
                          <div className="position-relative">
                            <Card.Img
                              variant="top"
                              src={p.images?.[0] || "/images/not-available.jpg"}
                              alt={p.packageName}
                              style={{
                                height: "180px",
                                objectFit: "cover",
                                borderRadius: "1rem 1rem 0 0",
                              }}
                              onError={(e) => (e.target.src = "/images/not-available.jpg")}
                            />
                            <div className="position-absolute top-0 end-0 m-3">
                              <Badge bg={p.status === "Active" ? "success" : "secondary"} className="px-3 py-2">
                                {p.status}
                              </Badge>
                            </div>
                            {p.rating != null && (
                              <div className="position-absolute top-0 start-0 m-3">
                                <Badge bg="warning" text="dark" className="px-2 py-2">
                                  <FaStar className="me-1" />
                                  {Number(p.rating).toFixed(1)}
                                </Badge>
                              </div>
                            )}
                          </div>
                          <Card.Body className="d-flex flex-column">
                            <h5 className="text-primary mb-2">
                              <FaSuitcaseRolling className="me-2" />
                              {p.packageName}
                            </h5>
                            <div className="small text-muted mb-1">
                              <FaMapMarkerAlt className="me-1 text-primary" />
                              {p.startingFrom} → {p.destination}
                            </div>
                            <div className="small text-muted mb-1">
                              <FaMoon className="me-1 text-info" />
                              {p.noOfNights}N / {p.noOfDays}D · {p.hotelCategory} · {p.mealPlan}
                            </div>
                            <div className="mb-2 d-flex flex-wrap gap-1">
                              {p.category && (
                                <Badge bg="light" text="dark" className="border">
                                  {p.category}
                                </Badge>
                              )}
                              {p.theme && (
                                <Badge bg="light" text="dark" className="border">
                                  {p.theme}
                                </Badge>
                              )}
                            </div>
                            {/* <h6 className="text-success mb-3">
                              <FaRupeeSign className="me-1" />
                              {Number(p.perPaxRate || 0).toLocaleString()}
                              <small className="text-muted"> / pax</small>
                            </h6> */}
                            <div className="mt-auto d-flex gap-2 flex-wrap">
                              <Button
                                variant="outline-success"
                                size="sm"
                                className="flex-fill rounded-pill"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/honeymoon/package-rates/${p.id}`);
                                }}
                              >
                                <FaPlus className="me-1" /> Add Rates
                              </Button>
                              <Button
                                variant="outline-primary"
                                size="sm"
                                className="flex-fill rounded-pill"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/honeymoon/view/${p.id}`);
                                }}
                              >
                                <FaEye className="me-1" /> View
                              </Button>
                              <Button
                                variant="outline-warning"
                                size="sm"
                                className="flex-fill rounded-pill"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/honeymoon/edit/${p.id}`);
                                }}
                              >
                                <FaEdit className="me-1" /> Edit
                              </Button>
                              <Button
                                variant="outline-danger"
                                size="sm"
                                className="flex-fill rounded-pill"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setToDelete(p);
                                }}
                              >
                                <FaTrash className="me-1" /> Delete
                              </Button>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                )}

                {!loading && !error && totalPages > 1 && (
                  <div className="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
                    <div className="text-muted small">
                      Showing {pageData.length} of {filtered.length}
                    </div>
                    <Pagination className="mb-0">
                      <Pagination.Prev disabled={page === 0} onClick={() => setPage((p) => p - 1)} />
                      {[...Array(totalPages).keys()].map((n) => (
                        <Pagination.Item key={n} active={n === page} onClick={() => setPage(n)}>
                          {n + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage((p) => p + 1)}
                      />
                    </Pagination>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Container>
        </main>
      </div>

      <Modal show={!!toDelete} onHide={() => !deleting && setToDelete(null)} centered>
        <Modal.Header closeButton={!deleting}>
          <Modal.Title>
            <FaExclamationTriangle className="text-primary me-2" /> Delete Package
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete <strong>{toDelete?.packageName}</strong>?
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" disabled={deleting} onClick={() => setToDelete(null)}>
            Cancel
          </Button>
          <Button variant="danger" disabled={deleting} onClick={doDelete}>
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default HoneymoonList;
