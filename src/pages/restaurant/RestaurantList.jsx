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
  Form,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import {
  FaPlus,
  FaUtensils,
  FaMapMarkerAlt,
  FaClock,
  FaEye,
  FaEdit,
  FaTrash,
  FaSearch,
  FaExclamationTriangle,
  FaPhone,
  FaStar,
  FaRupeeSign,
  FaEnvelope,
  FaPaperPlane,
  FaTimes,
  FaKey,
  FaArrowLeft,
} from "react-icons/fa";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import "../../styles/HotelList.css";
import DashboardRedirections from "../../components/DashboardRedirections";

const PAGE_SIZE = 12;

/**
 * Restaurant list — card-grid layout that mirrors HotelList.jsx so the two
 * registration entry points feel consistent.
 *
 * Each card surfaces image, name, location, contact, open–close hours and
 * cuisine chips with View / Edit / Delete actions. Header has a search box
 * and a "+ New Restaurant" button that opens /restaurant/register.
 */
const RestaurantList = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  // ── Multi-select + email-out state ───────────────────────────────
  // `selectedIds` carries every restaurant the operator has ticked
  // (across all pages). Survives pagination + filter changes. The
  // email modal opens via the toolbar's "Send via Email" button once
  // at least one row is selected; submitting it POSTs to the new
  // /api/restaurant/email endpoint, which renders one PDF per
  // restaurant and emails them as attachments.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailError, setEmailError] = useState("");
  const [sending, setSending] = useState(false);

  // ── Extranet-credentials modal state ─────────────────────────────
  // Mirrors the hotel pattern from `HotelRegistrationActions.jsx` —
  // admin types a username + password + (optional) extra roles, the
  // form submits to `POST /auth/register` with the RESTAURANT_EXTRANET
  // userType. The backend's `UserAccountService.createRestaurantUser`
  // creates a UserAccount whose `userId` is this restaurant's id, so
  // when the manager later logs in through the standard `/login` page
  // the JWT carries the RESTAURANT_EXTRANET role and the resolver on
  // the extranet dashboard scopes everything to this restaurant.
  const [credsRestaurant, setCredsRestaurant] = useState(null);
  const [credsUsername, setCredsUsername] = useState("");
  const [credsPassword, setCredsPassword] = useState("");
  const [credsConfirm, setCredsConfirm] = useState("");
  const [credsSubmitting, setCredsSubmitting] = useState(false);
  const [credsError, setCredsError] = useState("");
  // Master lookups — fetched lazily the first time the modal opens.
  // userTypeId for "RESTAURANT_EXTRANET" is required by /auth/register;
  // we also use the matching role id so the manager's roles list
  // includes the expected entry (mirrors the hotel modal behaviour).
  const [restaurantExtranetUserTypeId, setRestaurantExtranetUserTypeId] = useState(null);
  const [restaurantExtranetRoleId, setRestaurantExtranetRoleId] = useState(null);

  const ensureUserTypeAndRole = async () => {
    if (restaurantExtranetUserTypeId && restaurantExtranetRoleId) return true;
    try {
      // Single focused lookup added on the restaurant controller —
      // returns { userTypeId, roleId } for the RESTAURANT_EXTRANET pair
      // seeded by RestaurantExtranetRoleSeeder. Avoids depending on the
      // legacy /api/userTypes GET (which is commented out) and /api/userRoles
      // (which works but would need a second call + name match).
      const res = await axiosInstance.get("/api/restaurant/extranet-lookup");
      const data = res?.data || {};
      if (data.status !== "SUCCESS" || !data.userTypeId || !data.roleId) {
        toast.error(
          data.message ||
            "RESTAURANT_EXTRANET user-type / role not seeded yet on the backend."
        );
        return false;
      }
      setRestaurantExtranetUserTypeId(data.userTypeId);
      setRestaurantExtranetRoleId(data.roleId);
      return true;
    } catch (err) {
      console.error("extranet lookup failed", err);
      toast.error("Failed to load user-type list. Try again.");
      return false;
    }
  };

  const openCredsModal = async (r) => {
    setCredsRestaurant(r);
    setCredsUsername("");
    setCredsPassword("");
    setCredsConfirm("");
    setCredsError("");
    // Fire-and-forget — even if this fails the modal opens and the
    // submit button will re-validate before posting.
    ensureUserTypeAndRole();
  };
  const closeCredsModal = () => {
    if (credsSubmitting) return;
    setCredsRestaurant(null);
    setCredsUsername("");
    setCredsPassword("");
    setCredsConfirm("");
    setCredsError("");
  };
  const submitCreds = async () => {
    const uname = (credsUsername || "").trim();
    if (!uname) {
      setCredsError("Username is required.");
      return;
    }
    if (uname.length < 4) {
      setCredsError("Username must be at least 4 characters.");
      return;
    }
    if (!/^[a-zA-Z0-9_.@-]+$/.test(uname)) {
      setCredsError("Username may only contain letters, numbers, _ . - @");
      return;
    }
    if (!credsPassword || credsPassword.length < 8) {
      setCredsError("Password must be at least 8 characters.");
      return;
    }
    if (!/(?=.*[A-Z])(?=.*[0-9])/.test(credsPassword)) {
      setCredsError("Password must include an uppercase letter and a number.");
      return;
    }
    if (credsPassword !== credsConfirm) {
      setCredsError("Password and confirmation do not match.");
      return;
    }
    setCredsError("");
    setCredsSubmitting(true);
    try {
      const ok = await ensureUserTypeAndRole();
      if (!ok) {
        setCredsSubmitting(false);
        return;
      }
      const payload = {
        userId: credsRestaurant.id, // Restaurant id — UserAccount.user_id
        userTypeId: restaurantExtranetUserTypeId,
        userName: uname,
        password: credsPassword,
        userRoleIds: [restaurantExtranetRoleId],
      };
      // Same endpoint the hotel-details modal calls — backend branches
      // on userType.typeName ("RESTAURANT_EXTRANET" -> createRestaurantUser).
      const res = await axiosInstance.post("/auth/register", payload);
      if (res?.data) {
        toast.success(
          "Extranet credentials saved. The restaurant can now log in via the standard login page."
        );
        setCredsRestaurant(null);
        setCredsUsername("");
        setCredsPassword("");
        setCredsConfirm("");
      } else {
        toast.error("Failed to save credentials.");
      }
    } catch (e) {
      console.error("set extranet creds failed", e);
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        "Failed to save credentials.";
      setCredsError(msg);
    } finally {
      setCredsSubmitting(false);
    }
  };

  const isSelected = (id) => selectedIds.has(id);
  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const selectAllOnPage = (rows) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      rows.forEach((r) => next.add(r.id));
      return next;
    });
  };
  const deselectAllOnPage = (rows) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      rows.forEach((r) => next.delete(r.id));
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get("/api/restaurant/list");
      const data = Array.isArray(res.data) ? res.data : res.data?.content || [];
      setItems(data);
      setFiltered(data);
    } catch (e) {
      console.error(e);
      setError("Failed to load restaurants.");
      setItems([]);
      setFiltered([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Local filter — list is small enough that we filter client-side.
  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      setFiltered(items);
    } else {
      setFiltered(
        items.filter(
          (r) =>
            r.restaurantName?.toLowerCase().includes(q) ||
            r.place?.toLowerCase().includes(q) ||
            r.email?.toLowerCase().includes(q) ||
            (r.cuisineTypes || []).join(",").toLowerCase().includes(q)
        )
      );
    }
    setPage(0);
  }, [search, items]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleCreate = () => navigate("/restaurant/register");
  const handleView = (id) => navigate(`/restaurant/view/${id}`);
  const handleEdit = (id) => navigate(`/restaurant/edit/${id}`);

  const confirmDelete = (r) => setToDelete(r);

  const doDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await axiosInstance.delete(`/api/restaurant/${toDelete.id}`);
      toast.success("Restaurant deleted");
      setToDelete(null);
      load();
    } catch (e) {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  // ── Send selected restaurants via email ──────────────────────────
  // Validates the address client-side, then POSTs to
  // /api/restaurant/email. The backend always returns HTTP 200 with a
  // { status, message, count } payload — failures are surfaced via the
  // `status === "FAILURE"` branch so a misconfigured mailer doesn't
  // throw a generic axios error.
  const openEmailModal = () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one restaurant first.");
      return;
    }
    setEmailTo("");
    setEmailError("");
    setShowEmailModal(true);
  };
  const closeEmailModal = () => {
    if (sending) return;
    setShowEmailModal(false);
    setEmailTo("");
    setEmailError("");
  };
  const handleSendEmail = async () => {
    const trimmed = (emailTo || "").trim();
    const rx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmed || !rx.test(trimmed)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    if (selectedIds.size === 0) {
      setEmailError("Selection is empty. Close this dialog and pick at least one restaurant.");
      return;
    }
    setEmailError("");
    setSending(true);
    try {
      const res = await axiosInstance.post("/api/restaurant/email", {
        restaurantIds: Array.from(selectedIds),
        email: trimmed,
      });
      const data = res?.data || {};
      if (data.status === "SUCCESS") {
        toast.success(data.message || "Email sent.");
        setShowEmailModal(false);
        setEmailTo("");
        clearSelection();
      } else {
        toast.error(data.message || "Failed to send email.");
      }
    } catch (e) {
      console.error("restaurant email send failed", e);
      toast.error(
        e?.response?.data?.message || "Failed to send email. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="min-vh-100 bg-gradient-light d-flex flex-column"
      style={{
        background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
      }}
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

            {/* Header */}
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div>
                <h2 className="text-primary mb-1">
                  <FaUtensils className="me-2" />
                  Restaurant Management
                </h2>
                <p className="text-muted mb-0">
                  Manage your restaurant listings and details
                </p>
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <Button
                  variant="primary"
                  onClick={openEmailModal}
                  disabled={selectedIds.size === 0}
                  className="d-flex align-items-center gap-2 px-4 py-2 rounded-pill shadow"
                  title={
                    selectedIds.size === 0
                      ? "Tick at least one restaurant to enable"
                      : `Email ${selectedIds.size} restaurant${
                          selectedIds.size === 1 ? "" : "s"
                        } via PDF`
                  }
                >
                  <FaEnvelope />
                  Send via Email
                  {selectedIds.size > 0 && (
                    <Badge bg="light" text="dark" className="ms-1">
                      {selectedIds.size}
                    </Badge>
                  )}
                </Button>
                <Button
                  variant="success"
                  onClick={handleCreate}
                  className="d-flex align-items-center gap-2 px-4 py-2 rounded-pill shadow"
                >
                  <FaPlus />
                  Create New Restaurant
                </Button>
              </div>
            </div>

            {/* Card */}
            <Card className="shadow-lg border-0 rounded-4">
              <Card.Header className="bg-gradient-primary text-white border-0 rounded-top-4">
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                  <h4 className="mb-0 d-flex align-items-center">
                    <FaUtensils className="me-2" />
                    Restaurant List
                  </h4>
                  <div className="d-flex align-items-center gap-3">
                    <Badge bg="light" text="dark" className="fs-6 px-3 py-2">
                      {filtered.length} Restaurant{filtered.length !== 1 ? "s" : ""}
                      {search && (
                        <span className="ms-2 text-muted">
                          (filtered from {items.length})
                        </span>
                      )}
                    </Badge>
                    <div className="search-wrapper">
                      <i className="bi bi-search search-icon"></i>
                      <input
                        type="text"
                        placeholder="Search by name, place, cuisine..."
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
                    <p className="mt-3 text-muted">Loading restaurants...</p>
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
                    <FaUtensils size={64} className="mb-3 text-muted opacity-50" />
                    <h5 className="mb-2 text-muted">
                      {search ? "No Restaurants Found" : "No Restaurants Yet"}
                    </h5>
                    <p className="text-muted mb-4">
                      {search
                        ? `No restaurants match "${search}". Try a different search.`
                        : "Start by creating your first restaurant."}
                    </p>
                    {search ? (
                      <Button
                        variant="outline-primary"
                        onClick={() => setSearch("")}
                        className="d-flex align-items-center gap-2 mx-auto px-4 py-2 rounded-pill"
                      >
                        <FaSearch /> Clear Search
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        onClick={handleCreate}
                        className="d-flex align-items-center gap-2 mx-auto px-4 py-2 rounded-pill"
                      >
                        <FaPlus /> Create First Restaurant
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Page-level selection toolbar — appears whenever
                        any row is selected on any page, plus a quick
                        "select all on this page" action so the operator
                        doesn't have to tick rows one by one for a bulk
                        email send. */}
                    <div className="d-flex flex-wrap align-items-center gap-3 mb-3 px-1">
                      <div className="text-muted small">
                        {selectedIds.size > 0 ? (
                          <>
                            <strong>{selectedIds.size}</strong> selected
                          </>
                        ) : (
                          <>No restaurants selected</>
                        )}
                      </div>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 text-decoration-none"
                        onClick={() => selectAllOnPage(pageData)}
                      >
                        Select all on this page
                      </Button>
                      {selectedIds.size > 0 && (
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0 text-decoration-none text-danger"
                          onClick={clearSelection}
                        >
                          <FaTimes className="me-1" />
                          Clear selection
                        </Button>
                      )}
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 text-decoration-none"
                        onClick={() => deselectAllOnPage(pageData)}
                      >
                        Deselect this page
                      </Button>
                    </div>
                    <Row>
                    {pageData.map((r) => (
                      <Col key={r.id} lg={4} md={6} className="mb-4">
                        <Card
                          className={`h-100 shadow-sm border-0 rounded-4 hotel-card${
                            isSelected(r.id) ? " border border-primary" : ""
                          }`}
                          style={{
                            cursor: "pointer",
                            boxShadow: isSelected(r.id)
                              ? "0 0 0 2px #0d6efd, 0 4px 16px rgba(13,110,253,0.15)"
                              : undefined,
                          }}
                          onClick={() => handleView(r.id)}
                        >
                          {/* Selection checkbox — sits over the cover
                              image; stopPropagation so clicking it
                              doesn't trigger the card-level navigate. */}
                          <Form.Check
                            type="checkbox"
                            id={`rest-select-${r.id}`}
                            checked={isSelected(r.id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelected(r.id);
                            }}
                            style={{
                              position: "absolute",
                              top: 12,
                              left: 12,
                              zIndex: 5,
                              background: "rgba(255,255,255,0.92)",
                              borderRadius: 4,
                              padding: "2px 6px",
                              boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                            }}
                            title="Select this restaurant for email"
                          />
                          <div className="position-relative">
                            <Card.Img
                              variant="top"
                              src={r.images?.[0] || "/images/not-available.jpg"}
                              alt={r.restaurantName}
                              style={{
                                height: "170px",
                                objectFit: "cover",
                                borderRadius: "1rem 1rem 0 0",
                              }}
                              onError={(e) => {
                                e.target.src = "/images/not-available.jpg";
                              }}
                            />
                            <div className="position-absolute top-0 end-0 m-3">
                              <Badge
                                bg={r.status === "Active" ? "success" : "secondary"}
                                className="px-3 py-2"
                              >
                                {r.status || "Active"}
                              </Badge>
                            </div>
                            {r.rating != null && (
                              <div className="position-absolute top-0 start-0 m-3">
                                <Badge bg="warning" text="dark" className="px-2 py-2">
                                  <FaStar className="me-1" />
                                  {Number(r.rating).toFixed(1)}
                                </Badge>
                              </div>
                            )}
                          </div>

                          <Card.Body className="d-flex flex-column">
                            <div className="mb-2">
                              <h5 className="card-title text-primary mb-2 d-flex align-items-center">
                                <FaUtensils className="me-2" />
                                {r.restaurantName}
                              </h5>
                              <p className="text-muted small mb-1">
                                <FaMapMarkerAlt className="me-1 text-danger" />
                                {r.place}
                                {r.address ? ` · ${truncate(r.address, 40)}` : ""}
                              </p>
                              <p className="text-muted small mb-1">
                                <FaPhone className="me-1 text-success" />
                                {r.contactNumber || "-"}
                              </p>
                              <p className="text-muted small mb-2">
                                <FaClock className="me-1 text-info" />
                                {fmtTime(r.openTime)} - {fmtTime(r.closeTime)}
                              </p>
                              <div className="mb-1 d-flex flex-wrap gap-1">
                                {(r.cuisineTypes || []).slice(0, 3).map((c) => (
                                  <Badge key={c} bg="light" text="dark" className="border">
                                    {c}
                                  </Badge>
                                ))}
                                {r.cuisineTypes?.length > 3 && (
                                  <Badge bg="secondary">+{r.cuisineTypes.length - 3}</Badge>
                                )}
                              </div>
                              {r.averageCostForTwo > 0 && (
                                <small className="text-muted">
                                  <FaRupeeSign className="me-1" />
                                  {r.averageCostForTwo} for two (approx.)
                                </small>
                              )}
                            </div>

                            <div className="mt-auto">
                              <div className="d-flex gap-2">
                                <Button
                                  variant="outline-primary"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleView(r.id);
                                  }}
                                  className="flex-fill rounded-pill"
                                >
                                  <FaEye className="me-1" /> View
                                </Button>
                                <Button
                                  variant="outline-warning"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEdit(r.id);
                                  }}
                                  className="flex-fill rounded-pill"
                                >
                                  <FaEdit className="me-1" /> Edit
                                </Button>
                                <Button
                                  variant="outline-danger"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    confirmDelete(r);
                                  }}
                                  className="flex-fill rounded-pill"
                                >
                                  <FaTrash className="me-1" /> Delete
                                </Button>
                              </div>
                              {/* Admin-only — opens the credential
                                  setup modal so the manager can log
                                  into the restaurant extranet portal. */}
                              <div className="d-flex mt-2">
                                <Button
                                  variant="outline-secondary"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCredsModal(r);
                                  }}
                                  className="flex-fill rounded-pill"
                                  title="Set / reset the extranet login for this restaurant"
                                >
                                  <FaKey className="me-1" /> Extranet Login
                                </Button>
                              </div>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                    ))}
                    </Row>
                  </>
                )}

                {!loading && !error && totalPages > 1 && (
                  <div className="d-flex justify-content-between align-items-center mt-4 pt-3 border-top">
                    <div className="text-muted small">
                      Showing {pageData.length} of {filtered.length}
                    </div>
                    <Pagination className="mb-0 custom-pagination">
                      <Pagination.Prev
                        disabled={page === 0}
                        onClick={() => setPage((p) => p - 1)}
                      />
                      {[...Array(totalPages).keys()].map((n) => (
                        <Pagination.Item
                          key={n}
                          active={n === page}
                          onClick={() => setPage(n)}
                        >
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

      {/* ──────────────────────────────────────────────────────────
          Send-via-Email modal — opens when the operator clicks
          "Send via Email" with at least one restaurant ticked. POSTs
          { restaurantIds, email } to /api/restaurant/email; backend
          renders one PDF per restaurant and emails them as
          attachments. The summary block lists the picked restaurants
          so the operator can confirm the selection before send.
          ────────────────────────────────────────────────────────── */}
      <Modal
        show={showEmailModal}
        onHide={closeEmailModal}
        centered
        backdrop="static"
        keyboard={!sending}
      >
        <Modal.Header closeButton={!sending}>
          <Modal.Title className="d-flex align-items-center">
            <FaEnvelope className="text-primary me-2" />
            Send Restaurant Details
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-3 small text-muted">
            One PDF per restaurant will be generated and attached to the email.
          </div>
          <div className="mb-3">
            <div className="fw-semibold mb-1">
              Selected ({selectedIds.size})
            </div>
            <div
              style={{
                maxHeight: 140,
                overflowY: "auto",
                background: "#f8f9fa",
                border: "1px solid #e9ecef",
                borderRadius: 8,
                padding: "0.5rem 0.75rem",
              }}
            >
              {selectedIds.size === 0 ? (
                <div className="text-muted small fst-italic">
                  No restaurants selected.
                </div>
              ) : (
                items
                  .filter((r) => selectedIds.has(r.id))
                  .map((r) => (
                    <div
                      key={r.id}
                      className="d-flex justify-content-between align-items-center small py-1"
                    >
                      <span>
                        <FaUtensils className="me-2 text-primary" />
                        {r.restaurantName}
                        {r.place ? (
                          <span className="text-muted ms-2">· {r.place}</span>
                        ) : null}
                      </span>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 text-danger"
                        onClick={() => toggleSelected(r.id)}
                        disabled={sending}
                        title="Remove from selection"
                      >
                        <FaTimes />
                      </Button>
                    </div>
                  ))
              )}
            </div>
          </div>
          <Form.Group className="mb-2">
            <Form.Label className="fw-semibold">Recipient email</Form.Label>
            <Form.Control
              type="email"
              placeholder="customer@example.com"
              value={emailTo}
              isInvalid={!!emailError}
              disabled={sending}
              onChange={(e) => {
                setEmailTo(e.target.value);
                if (emailError) setEmailError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !sending) {
                  e.preventDefault();
                  handleSendEmail();
                }
              }}
              autoFocus
            />
            {emailError && (
              <Form.Control.Feedback type="invalid">
                {emailError}
              </Form.Control.Feedback>
            )}
            <Form.Text className="text-muted">
              The selected restaurants' details will be emailed to this address.
            </Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            onClick={closeEmailModal}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSendEmail}
            disabled={sending || selectedIds.size === 0}
            className="d-flex align-items-center gap-2"
          >
            {sending ? (
              <>
                <Spinner animation="border" size="sm" />
                Sending…
              </>
            ) : (
              <>
                <FaPaperPlane />
                Send Email
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ──────────────────────────────────────────────────────────
          Extranet credentials modal (admin only)
          ────────────────────────────────────────────────────────────
          Creates a UserAccount for the restaurant manager via the
          standard `/auth/register` endpoint with userType =
          RESTAURANT_EXTRANET. The manager logs in at the platform's
          regular `/login` page; DashboardRedirections routes them to
          /restaurant-extranet/dashboard once the role is on the JWT.
          ────────────────────────────────────────────────────────── */}
      <Modal
        show={!!credsRestaurant}
        onHide={closeCredsModal}
        centered
        backdrop="static"
        keyboard={!credsSubmitting}
      >
        <Modal.Header closeButton={!credsSubmitting}>
          <Modal.Title className="d-flex align-items-center">
            <FaKey className="text-warning me-2" />
            Restaurant Manager Login
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="small text-muted mb-3">
            Create login credentials for{" "}
            <strong>{credsRestaurant?.restaurantName}</strong>. The
            manager can then log in at the regular{" "}
            <code>/login</code> page and will be routed to the
            restaurant extranet dashboard automatically.
          </div>
          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">Username</Form.Label>
            <Form.Control
              type="text"
              placeholder="e.g. golden_manager"
              value={credsUsername}
              disabled={credsSubmitting}
              onChange={(e) => setCredsUsername(e.target.value)}
              autoFocus
            />
            <Form.Text className="text-muted">
              Letters, numbers, and{" "}
              <code>_ . - @</code> only. Minimum 4 characters.
            </Form.Text>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">Password</Form.Label>
            <Form.Control
              type="password"
              placeholder="At least 8 chars, with a number and uppercase"
              value={credsPassword}
              disabled={credsSubmitting}
              onChange={(e) => setCredsPassword(e.target.value)}
            />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label className="fw-semibold">Confirm Password</Form.Label>
            <Form.Control
              type="password"
              placeholder="Re-enter the password"
              value={credsConfirm}
              disabled={credsSubmitting}
              onChange={(e) => setCredsConfirm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !credsSubmitting) {
                  e.preventDefault();
                  submitCreds();
                }
              }}
            />
          </Form.Group>
          {credsError && (
            <div className="text-danger small mt-2">{credsError}</div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            onClick={closeCredsModal}
            disabled={credsSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submitCreds}
            disabled={credsSubmitting}
          >
            {credsSubmitting ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Saving…
              </>
            ) : (
              "Save Credentials"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={!!toDelete} onHide={() => !deleting && setToDelete(null)} centered>
        <Modal.Header closeButton={!deleting}>
          <Modal.Title>
            <FaExclamationTriangle className="text-danger me-2" />
            Delete Restaurant
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete <strong>{toDelete?.restaurantName}</strong>?
          <br />
          <small className="text-muted">This action cannot be undone.</small>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            disabled={deleting}
            onClick={() => setToDelete(null)}
          >
            Cancel
          </Button>
          <Button variant="danger" disabled={deleting} onClick={doDelete}>
            {deleting ? (
              <>
                <Spinner size="sm" animation="border" className="me-2" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

const fmtTime = (t) => (t ? String(t).slice(0, 5) : "");
const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "");

export default RestaurantList;
