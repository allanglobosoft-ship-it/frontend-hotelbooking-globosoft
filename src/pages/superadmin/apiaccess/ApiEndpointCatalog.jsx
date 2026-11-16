import React, { useEffect, useState } from "react";
import { Card, Button, Table, Modal, Form, Row, Col, Badge } from "react-bootstrap";
import Sidebar from "../../../components/Sidebar";
import Topbar from "../../../components/TopBar";
import BackButton from "../../../components/BackButton";
import axiosInstance from "../../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEdit, FaTrash, FaCheck, FaTimes } from "react-icons/fa";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const BASE = "/api/super-admin/api-access/endpoints";

const emptyForm = {
  endpointCode: "",
  endpointName: "",
  httpMethod: "GET",
  urlPattern: "",
  category: "",
  description: "",
  isActive: true,
};

export default function ApiEndpointCatalog() {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchList = async () => {
    setIsLoading(true);
    try {
      const res = await axiosInstance.get(BASE);
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error("Failed to load endpoints");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({
      endpointCode: row.endpointCode || "",
      endpointName: row.endpointName || "",
      httpMethod: row.httpMethod || "GET",
      urlPattern: row.urlPattern || "",
      category: row.category || "",
      description: row.description || "",
      isActive: row.isActive !== false,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const validate = () => {
    if (!form.endpointCode.trim()) return "Endpoint code is required";
    if (!form.endpointName.trim()) return "Endpoint name is required";
    if (!form.httpMethod) return "HTTP method is required";
    if (!form.urlPattern.trim()) return "URL pattern is required";
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) return toast.error(err);
    setSaving(true);
    try {
      if (editingId) {
        await axiosInstance.put(`${BASE}/${editingId}`, form);
        toast.success("Endpoint updated");
      } else {
        await axiosInstance.post(BASE, form);
        toast.success("Endpoint created");
      }
      await fetchList();
      closeModal();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data || "Save failed";
      toast.error(typeof msg === "string" ? msg : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row) => {
    try {
      if (row.isActive) {
        await axiosInstance.delete(`${BASE}/${row.id}`);
        toast.success("Endpoint deactivated");
      } else {
        await axiosInstance.post(`${BASE}/${row.id}/activate`);
        toast.success("Endpoint activated");
      }
      await fetchList();
    } catch (e) {
      toast.error("Status change failed");
    }
  };

  const confirmDeactivate = (row) => {
    Swal.fire({
      titleText: `Deactivate ${row.endpointName}?`,
      text: "Clients will not be able to call this endpoint. Its permission rows are kept for audit.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#EC0B43",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Yes, deactivate",
    }).then((r) => {
      if (r.isConfirmed) toggleActive(row);
    });
  };

  const methodBadge = (m) => {
    const map = {
      GET: "primary",
      POST: "success",
      PUT: "warning",
      PATCH: "info",
      DELETE: "danger",
    };
    return <Badge bg={map[m] || "secondary"}>{m}</Badge>;
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex flex-column flex-sm-row gap-2 justify-content-between align-items-stretch align-items-sm-center">
              <span className="d-flex align-items-center gap-2">
                <BackButton fallback="/adminDashboard" />
                <span className="fw-semibold">API Endpoint Catalog</span>
                <small className="text-muted d-none d-md-inline">
                  Endpoints eligible for external client access
                </small>
              </span>
              <Button className="btn-green" onClick={openCreate}>
                + Register Endpoint
              </Button>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>S/N</th>
                    <th>Code</th>
                    <th>Name</th>
                    <th style={{ width: 90 }}>Method</th>
                    <th>URL Pattern</th>
                    <th>Category</th>
                    <th style={{ width: 100 }}>Status</th>
                    <th style={{ width: 130 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, idx) => (
                    <tr key={row.id}>
                      <td>{idx + 1}</td>
                      <td><code>{row.endpointCode}</code></td>
                      <td>{row.endpointName}</td>
                      <td>{methodBadge(row.httpMethod)}</td>
                      <td><small className="text-muted">{row.urlPattern}</small></td>
                      <td>{row.category || <span className="text-muted">—</span>}</td>
                      <td>
                        {row.isActive
                          ? <Badge bg="success">Active</Badge>
                          : <Badge bg="secondary">Inactive</Badge>}
                      </td>
                      <td>
                        <div className="d-flex gap-2 align-items-center">
                          <FaEdit
                            className="text-primary"
                            style={{ cursor: "pointer", fontSize: 18 }}
                            onClick={() => openEdit(row)}
                            title="Edit"
                          />
                          {row.isActive
                            ? <FaTimes
                                className="text-danger"
                                style={{ cursor: "pointer", fontSize: 18 }}
                                onClick={() => confirmDeactivate(row)}
                                title="Deactivate"
                              />
                            : <FaCheck
                                className="text-success"
                                style={{ cursor: "pointer", fontSize: 18 }}
                                onClick={() => toggleActive(row)}
                                title="Activate"
                              />}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {isLoading && (
                    <tr>
                      <td colSpan={8} className="text-center text-muted py-4">
                        <div className="spinner-border spinner-border-sm me-2" role="status" />
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!isLoading && items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-muted py-4">
                        No endpoints registered yet. Click <b>+ Register Endpoint</b> to publish one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </main>
      </div>

      <Modal show={showModal} onHide={closeModal} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{editingId ? "Edit Endpoint" : "Register Endpoint"}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row className="g-3">
            <Col md={6}>
              <Form.Group>
                <Form.Label>Code *</Form.Label>
                <Form.Control
                  placeholder="HOTEL_SEARCH"
                  value={form.endpointCode}
                  onChange={(e) => handleField("endpointCode", e.target.value)}
                  disabled={saving}
                />
                <Form.Text className="text-muted">
                  Uppercase identifier. Cannot be changed once used in permissions.
                </Form.Text>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Name *</Form.Label>
                <Form.Control
                  placeholder="Hotel Search"
                  value={form.endpointName}
                  onChange={(e) => handleField("endpointName", e.target.value)}
                  disabled={saving}
                />
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group>
                <Form.Label>Method *</Form.Label>
                <Form.Select
                  value={form.httpMethod}
                  onChange={(e) => handleField("httpMethod", e.target.value)}
                  disabled={saving}
                >
                  {HTTP_METHODS.map((m) => <option key={m}>{m}</option>)}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={9}>
              <Form.Group>
                <Form.Label>URL Pattern *</Form.Label>
                <Form.Control
                  placeholder="/api/v1/external/hotel-search/**"
                  value={form.urlPattern}
                  onChange={(e) => handleField("urlPattern", e.target.value)}
                  disabled={saving}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Category</Form.Label>
                <Form.Control
                  placeholder="Search / Booking / Reports"
                  value={form.category}
                  onChange={(e) => handleField("category", e.target.value)}
                  disabled={saving}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Status</Form.Label>
                <Form.Check
                  type="switch"
                  id="endpoint-active-switch"
                  label={form.isActive ? "Active" : "Inactive"}
                  checked={form.isActive}
                  onChange={(e) => handleField("isActive", e.target.checked)}
                  disabled={saving}
                />
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Description</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  placeholder="What this endpoint does — helps Super Admin decide who to grant access to."
                  value={form.description}
                  onChange={(e) => handleField("description", e.target.value)}
                  disabled={saving}
                />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancel</Button>
          <Button className="btn-green" onClick={save} disabled={saving}>
            {saving ? "Saving…" : (editingId ? "Update" : "Register")}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
