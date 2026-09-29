/**
 * AyurvedaRegistration.jsx
 *
 * Entry page for the Ayurveda registration module. Lists Ayurveda
 * Centres (the umbrella entity) and module-wide Enquiries.
 *
 * Per-centre management of Packages / Doctor Consultations / Courses
 * lives on a dedicated page (AyurvedaCentreManage). Click the "Manage"
 * button on a centre row to open it. This mirrors the
 * activity-provider → activity-rates flow used elsewhere in the app.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Form,
  Tab,
  Tabs,
  Table,
  Badge,
  Modal,
  Spinner,
} from "react-bootstrap";
import {
  FaPlus,
  FaEdit,
  FaTrash,
  FaLeaf,
  FaEnvelopeOpenText,
  FaReply,
  FaBuilding,
  FaCog,
  FaArrowLeft,
} from "react-icons/fa";
import toast from "react-hot-toast";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import "../../styles/Ayurveda.css";
import DashboardRedirections from "../../components/DashboardRedirections";

const AYURVEDA_API = "/api/v1/ayurveda";

const emptyCentre = {
  name: "",
  code: "",
  description: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  countryId: "",
  cityId: "",
  imageUrl: "",
  isActive: true,
};

const AyurvedaRegistration = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("centres");

  // Centres
  const [centres, setCentres] = useState([]);
  const [centresLoading, setCentresLoading] = useState(false);

  // Enquiries
  const [enquiries, setEnquiries] = useState([]);
  const [enquiriesLoading, setEnquiriesLoading] = useState(false);
  const [enquiryStatusFilter, setEnquiryStatusFilter] = useState("");
  const [respondingEnquiry, setRespondingEnquiry] = useState(null);
  const [respondForm, setRespondForm] = useState({
    status: "RESPONDED",
    response: "",
    respondedBy: "",
  });
  const [responding, setResponding] = useState(false);

  // Centre modal state (create + edit)
  const [centreModalOpen, setCentreModalOpen] = useState(false);
  const [editingCentreId, setEditingCentreId] = useState(null);
  const [centreForm, setCentreForm] = useState({ ...emptyCentre });
  const [savingCentre, setSavingCentre] = useState(false);

  // Country/city lookups for the centre form
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(false);

  // ----- Loaders -----
  const loadCentres = useCallback(async () => {
    setCentresLoading(true);
    try {
      const res = await axiosInstance.get(`${AYURVEDA_API}/centres`);
      setCentres(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load centres");
    } finally {
      setCentresLoading(false);
    }
  }, []);

  const loadEnquiries = useCallback(async () => {
    setEnquiriesLoading(true);
    try {
      const params = { page: 0, size: 100 };
      if (enquiryStatusFilter) params.status = enquiryStatusFilter;
      const res = await axiosInstance.get(`${AYURVEDA_API}/enquiries`, { params });
      const data = res.data?.content || res.data || [];
      setEnquiries(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load enquiries");
    } finally {
      setEnquiriesLoading(false);
    }
  }, [enquiryStatusFilter]);

  useEffect(() => {
    loadCentres();
  }, [loadCentres]);

  useEffect(() => {
    if (activeTab === "enquiries") loadEnquiries();
  }, [activeTab, loadEnquiries]);

  // Country list once
  useEffect(() => {
    axiosInstance
      .get("/api/country?limit=10000")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setCountries(list.filter((c) => !c.isDeleted));
      })
      .catch(() => {});
  }, []);

  // Cities re-load whenever the centre form's country changes
  useEffect(() => {
    if (!centreModalOpen) return;
    setCitiesLoading(true);
    const url = centreForm.countryId
      ? `/api/province/getByCountryId/${centreForm.countryId}`
      : `/api/province?limit=10000`;
    axiosInstance
      .get(url)
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setCities(list.filter((c) => !c.isDeleted));
      })
      .catch(() => setCities([]))
      .finally(() => setCitiesLoading(false));
  }, [centreModalOpen, centreForm.countryId]);

  // ----- Centre modal helpers -----
  const openCreateCentre = () => {
    setEditingCentreId(null);
    setCentreForm({ ...emptyCentre });
    setCentreModalOpen(true);
  };

  const openEditCentre = (row) => {
    setEditingCentreId(row.id);
    setCentreForm({ ...row });
    setCentreModalOpen(true);
  };

  const closeCentreModal = () => {
    setCentreModalOpen(false);
    setEditingCentreId(null);
    setCentreForm({ ...emptyCentre });
  };

  const setCentreField = (key, value) =>
    setCentreForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "countryId" && prev.countryId !== value) {
        next.cityId = "";
      }
      return next;
    });

  const submitCentre = async () => {
    if (!centreForm.name?.trim()) {
      toast.error("Centre name is required");
      return;
    }
    setSavingCentre(true);
    try {
      const payload = { ...centreForm };
      payload.countryId = payload.countryId ? Number(payload.countryId) : null;
      payload.cityId = payload.cityId ? Number(payload.cityId) : null;
      const url = `${AYURVEDA_API}/centres${
        editingCentreId ? `/${editingCentreId}` : ""
      }`;
      if (editingCentreId) await axiosInstance.put(url, payload);
      else await axiosInstance.post(url, payload);

      toast.success(editingCentreId ? "Updated successfully" : "Created successfully");
      closeCentreModal();
      loadCentres();
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.message || "Save failed");
    } finally {
      setSavingCentre(false);
    }
  };

  const deleteCentre = async (id) => {
    if (!window.confirm("Deactivate this centre? (Soft delete)")) return;
    try {
      await axiosInstance.delete(`${AYURVEDA_API}/centres/${id}`);
      toast.success("Deactivated");
      loadCentres();
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    }
  };

  const manageCentre = (centre) => {
    navigate(`/registration/ayurveda/centre/${centre.id}`, {
      state: { centre },
    });
  };

  // ----- Enquiry modal helpers -----
  const openRespond = (enquiry) => {
    setRespondingEnquiry(enquiry);
    setRespondForm({
      status: enquiry.status === "NEW" ? "IN_PROGRESS" : enquiry.status,
      response: enquiry.response || "",
      respondedBy:
        localStorage.getItem("UserName") ||
        localStorage.getItem("userName") ||
        "",
    });
  };

  const closeRespond = () => {
    setRespondingEnquiry(null);
    setRespondForm({ status: "RESPONDED", response: "", respondedBy: "" });
  };

  const submitRespond = async () => {
    if (!respondingEnquiry) return;
    if (!respondForm.status) {
      toast.error("Status is required");
      return;
    }
    setResponding(true);
    try {
      await axiosInstance.put(
        `${AYURVEDA_API}/enquiries/${respondingEnquiry.id}/status`,
        respondForm
      );
      toast.success("Enquiry updated");
      closeRespond();
      loadEnquiries();
    } catch (e) {
      console.error(e);
      toast.error("Update failed");
    } finally {
      setResponding(false);
    }
  };

  const deleteEnquiry = async (id) => {
    if (!window.confirm("Delete this enquiry permanently?")) return;
    try {
      await axiosInstance.delete(`${AYURVEDA_API}/enquiries/${id}`);
      toast.success("Deleted");
      loadEnquiries();
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    }
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1" style={{ minWidth: 0, overflowX: "hidden" }}>
        <div className="ayurveda-page">
          <Container fluid className="p-3">
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

            <div className="ayurveda-header">
              <div>
                <h2 className="ayurveda-title">
                  <FaLeaf /> Ayurveda Registration
                </h2>
                <p className="ayurveda-subtitle">
                  Register Ayurveda centres, then click <strong>Manage</strong>{" "}
                  on a centre to add its packages, doctors and courses.
                </p>
              </div>
            </div>

            <Tabs
              activeKey={activeTab}
              onSelect={(k) => setActiveTab(k)}
              className="ayurveda-tabs"
              fill
            >
              <Tab
                eventKey="centres"
                title={
                  <span>
                    <FaBuilding className="me-2" /> Centres
                  </span>
                }
              >
                <div className="ayurveda-action-bar">
                  <Button variant="success" onClick={openCreateCentre}>
                    <FaPlus className="me-1" /> New Centre
                  </Button>
                </div>
                <Card className="ayurveda-card-body">
                  {centresLoading ? (
                    <div className="text-center py-4">
                      <Spinner animation="border" variant="success" />
                    </div>
                  ) : centres.length === 0 ? (
                    <div className="ayurveda-empty">
                      No centres yet. Create one before adding packages, doctors
                      or courses.
                    </div>
                  ) : (
                    <Table responsive striped hover size="sm">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Name</th>
                          <th>Code</th>
                          <th>Contact</th>
                          <th>Phone</th>
                          <th>Email</th>
                          <th>Status</th>
                          <th style={{ width: 220 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {centres.map((c, idx) => (
                          <tr key={c.id}>
                            <td>{idx + 1}</td>
                            <td>
                              <strong>{c.name}</strong>
                            </td>
                            <td>{c.code || "-"}</td>
                            <td>{c.contactPerson || "-"}</td>
                            <td>{c.phone || "-"}</td>
                            <td>{c.email || "-"}</td>
                            <td>
                              {c.isActive ? (
                                <Badge bg="success">Active</Badge>
                              ) : (
                                <Badge bg="secondary">Inactive</Badge>
                              )}
                            </td>
                            <td>
                              <Button
                                size="sm"
                                variant="success"
                                className="me-1"
                                onClick={() => manageCentre(c)}
                                title="Manage packages, doctors, courses"
                              >
                                <FaCog className="me-1" /> Manage
                              </Button>
                              <Button
                                size="sm"
                                variant="outline-primary"
                                className="me-1"
                                onClick={() => openEditCentre(c)}
                                title="Edit centre"
                              >
                                <FaEdit />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline-danger"
                                onClick={() => deleteCentre(c.id)}
                                title="Deactivate"
                              >
                                <FaTrash />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </Card>
              </Tab>

              <Tab
                eventKey="enquiries"
                title={
                  <span>
                    <FaEnvelopeOpenText className="me-2" /> Enquiries
                  </span>
                }
              >
                <div className="ayurveda-action-bar">
                  <Form.Select
                    style={{ maxWidth: 200 }}
                    value={enquiryStatusFilter}
                    onChange={(e) => setEnquiryStatusFilter(e.target.value)}
                  >
                    <option value="">All Statuses</option>
                    <option value="NEW">New</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="RESPONDED">Responded</option>
                    <option value="CLOSED">Closed</option>
                  </Form.Select>
                  <Button variant="outline-success" onClick={loadEnquiries}>
                    Refresh
                  </Button>
                </div>
                <Card className="ayurveda-card-body">
                  {enquiriesLoading ? (
                    <div className="text-center py-4">
                      <Spinner animation="border" variant="success" />
                    </div>
                  ) : enquiries.length === 0 ? (
                    <div className="ayurveda-empty">No enquiries yet.</div>
                  ) : (
                    <Table responsive striped hover size="sm">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Ref</th>
                          <th>Customer</th>
                          <th>Contact</th>
                          <th>Treatment</th>
                          <th>Travel</th>
                          <th>Pax</th>
                          <th>Health Concern</th>
                          <th>Status</th>
                          <th>Submitted</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {enquiries.map((e, idx) => (
                          <tr key={e.id}>
                            <td>{idx + 1}</td>
                            <td>
                              <strong>{e.enquiryReference}</strong>
                            </td>
                            <td>{e.name}</td>
                            <td>
                              <div>{e.email || "-"}</div>
                              <div className="small text-muted">
                                {e.phone || "-"}
                              </div>
                            </td>
                            <td>{e.preferredTreatment || "-"}</td>
                            <td>
                              {e.travelStartDate || "-"}
                              {e.travelEndDate ? ` → ${e.travelEndDate}` : ""}
                            </td>
                            <td>{e.numberOfPersons}</td>
                            <td style={{ maxWidth: 200, whiteSpace: "normal" }}>
                              {e.healthConcern || "-"}
                            </td>
                            <td>
                              <Badge
                                bg={
                                  e.status === "NEW"
                                    ? "warning"
                                    : e.status === "IN_PROGRESS"
                                    ? "info"
                                    : e.status === "RESPONDED"
                                    ? "success"
                                    : "secondary"
                                }
                              >
                                {e.status}
                              </Badge>
                            </td>
                            <td>
                              {e.createdDate
                                ? new Date(e.createdDate).toLocaleString()
                                : "-"}
                            </td>
                            <td>
                              <Button
                                size="sm"
                                variant="outline-primary"
                                className="me-1"
                                onClick={() => openRespond(e)}
                                title="Respond / update status"
                              >
                                <FaReply />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline-danger"
                                onClick={() => deleteEnquiry(e.id)}
                              >
                                <FaTrash />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </Card>
              </Tab>
            </Tabs>
          </Container>
        </div>
        </main>
      </div>

      {/* ===== Centre Create/Edit Modal ===== */}
      <Modal
        show={centreModalOpen}
        onHide={closeCentreModal}
        size="lg"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {editingCentreId ? "Edit " : "New "}Ayurveda Centre
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-2">
                  <Form.Label>Centre Name *</Form.Label>
                  <Form.Control
                    value={centreForm.name || ""}
                    onChange={(e) => setCentreField("name", e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-2">
                  <Form.Label>Code</Form.Label>
                  <Form.Control
                    value={centreForm.code || ""}
                    onChange={(e) => setCentreField("code", e.target.value)}
                    placeholder="e.g. KER-AY-01"
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-2">
                  <Form.Label>Contact Person</Form.Label>
                  <Form.Control
                    value={centreForm.contactPerson || ""}
                    onChange={(e) =>
                      setCentreField("contactPerson", e.target.value)
                    }
                  />
                </Form.Group>
              </Col>
            </Row>
            <Form.Group className="mb-2">
              <Form.Label>Description</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={centreForm.description || ""}
                onChange={(e) => setCentreField("description", e.target.value)}
              />
            </Form.Group>
            <Row>
              <Col md={4}>
                <Form.Group className="mb-2">
                  <Form.Label>Phone</Form.Label>
                  <Form.Control
                    value={centreForm.phone || ""}
                    onChange={(e) => setCentreField("phone", e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-2">
                  <Form.Label>Email</Form.Label>
                  <Form.Control
                    type="email"
                    value={centreForm.email || ""}
                    onChange={(e) => setCentreField("email", e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-2">
                  <Form.Label>Image URL</Form.Label>
                  <Form.Control
                    value={centreForm.imageUrl || ""}
                    onChange={(e) => setCentreField("imageUrl", e.target.value)}
                  />
                </Form.Group>
              </Col>
            </Row>
            <Form.Group className="mb-2">
              <Form.Label>Address</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={centreForm.address || ""}
                onChange={(e) => setCentreField("address", e.target.value)}
              />
            </Form.Group>
            <Row className="mt-2">
              <Col md={6}>
                <Form.Group className="mb-2">
                  <Form.Label>Country</Form.Label>
                  <Form.Select
                    value={centreForm.countryId || ""}
                    onChange={(e) => setCentreField("countryId", e.target.value)}
                  >
                    <option value="">-- Select Country --</option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-2">
                  <Form.Label>
                    City {citiesLoading && <Spinner size="sm" animation="border" />}
                  </Form.Label>
                  <Form.Select
                    value={centreForm.cityId || ""}
                    onChange={(e) => setCentreField("cityId", e.target.value)}
                    disabled={citiesLoading}
                  >
                    <option value="">-- Select City --</option>
                    {cities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.stateName}
                        {c.country ? ` (${c.country})` : ""}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
            <Form.Check
              type="switch"
              className="mt-2"
              label="Active"
              checked={centreForm.isActive !== false}
              onChange={(e) => setCentreField("isActive", e.target.checked)}
            />
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={closeCentreModal}
            disabled={savingCentre}
          >
            Cancel
          </Button>
          <Button variant="success" onClick={submitCentre} disabled={savingCentre}>
            {savingCentre ? (
              <Spinner size="sm" animation="border" />
            ) : editingCentreId ? (
              "Update"
            ) : (
              "Create"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ===== Enquiry Respond Modal ===== */}
      <Modal show={!!respondingEnquiry} onHide={closeRespond} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            <FaReply className="me-2" /> Respond to Enquiry
            {respondingEnquiry?.enquiryReference
              ? ` — ${respondingEnquiry.enquiryReference}`
              : ""}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {respondingEnquiry && (
            <>
              <div className="ayurveda-summary-card">
                <Row className="g-2">
                  <Col md={6}>
                    <strong>Name:</strong> {respondingEnquiry.name}
                  </Col>
                  <Col md={6}>
                    <strong>Persons:</strong>{" "}
                    {respondingEnquiry.numberOfPersons}
                  </Col>
                  <Col md={6}>
                    <strong>Email:</strong> {respondingEnquiry.email || "-"}
                  </Col>
                  <Col md={6}>
                    <strong>Phone:</strong> {respondingEnquiry.phone || "-"}
                  </Col>
                  <Col md={6}>
                    <strong>Preferred Treatment:</strong>{" "}
                    {respondingEnquiry.preferredTreatment || "-"}
                  </Col>
                  <Col md={6}>
                    <strong>Travel:</strong>{" "}
                    {respondingEnquiry.travelStartDate || "-"}
                    {respondingEnquiry.travelEndDate
                      ? ` → ${respondingEnquiry.travelEndDate}`
                      : ""}
                  </Col>
                  {respondingEnquiry.healthConcern && (
                    <Col md={12}>
                      <strong>Health Concern:</strong>{" "}
                      {respondingEnquiry.healthConcern}
                    </Col>
                  )}
                  {respondingEnquiry.notes && (
                    <Col md={12}>
                      <strong>Notes:</strong> {respondingEnquiry.notes}
                    </Col>
                  )}
                </Row>
              </div>

              <Form>
                <Row>
                  <Col md={4}>
                    <Form.Group className="mb-2">
                      <Form.Label>Status *</Form.Label>
                      <Form.Select
                        value={respondForm.status}
                        onChange={(e) =>
                          setRespondForm({
                            ...respondForm,
                            status: e.target.value,
                          })
                        }
                      >
                        <option value="NEW">New</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="RESPONDED">Responded</option>
                        <option value="CLOSED">Closed</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={8}>
                    <Form.Group className="mb-2">
                      <Form.Label>Responded By</Form.Label>
                      <Form.Control
                        value={respondForm.respondedBy}
                        onChange={(e) =>
                          setRespondForm({
                            ...respondForm,
                            respondedBy: e.target.value,
                          })
                        }
                      />
                    </Form.Group>
                  </Col>
                </Row>
                <Form.Group className="mb-2">
                  <Form.Label>Response Message</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={4}
                    value={respondForm.response}
                    onChange={(e) =>
                      setRespondForm({
                        ...respondForm,
                        response: e.target.value,
                      })
                    }
                    placeholder="Recommendation, suggested package/consultation/course, follow-up details..."
                  />
                </Form.Group>
              </Form>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={closeRespond}
            disabled={responding}
          >
            Cancel
          </Button>
          <Button variant="success" onClick={submitRespond} disabled={responding}>
            {responding ? <Spinner size="sm" animation="border" /> : "Save"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default AyurvedaRegistration;
