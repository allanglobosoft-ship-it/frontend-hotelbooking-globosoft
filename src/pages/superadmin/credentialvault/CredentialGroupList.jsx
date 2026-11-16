import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button, Table, Modal, Form, Row, Col, Badge, Alert } from "react-bootstrap";
import Sidebar from "../../../components/Sidebar";
import Topbar from "../../../components/TopBar";
import BackButton from "../../../components/BackButton";
import axiosInstance from "../../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEdit, FaTrash, FaListUl } from "react-icons/fa";

const BASE = "/api/super-admin/credential-vault/groups";
const ENVIRONMENTS = ["TEST", "LIVE"];

const emptyForm = {
  groupCode: "",
  groupName: "",
  environment: "TEST",
  description: "",
  isActive: true,
};

export default function CredentialGroupList() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [health, setHealth] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [listRes, healthRes] = await Promise.all([
        axiosInstance.get(BASE),
        axiosInstance.get(`${BASE}/health`).catch(() => null),
      ]);
      setItems(Array.isArray(listRes.data) ? listRes.data : []);
      setHealth(healthRes?.data || null);
    } catch (e) {
      if (e?.response?.status === 403) {
        toast.error("Credential Vault requires the SUPER_ADMIN role.");
      } else {
        toast.error("Failed to load credential groups");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({
      groupCode: row.groupCode || "",
      groupName: row.groupName || "",
      environment: row.environment || "TEST",
      description: row.description || "",
      isActive: row.isActive !== false,
    });
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditingId(null); setForm(emptyForm); };

  const save = async () => {
    if (!form.groupCode.trim() || !form.groupName.trim()) {
      return toast.error("Group code and name are required");
    }
    setSaving(true);
    try {
      if (editingId) {
        await axiosInstance.put(`${BASE}/${editingId}`, form);
        toast.success("Group updated");
      } else {
        await axiosInstance.post(BASE, form);
        toast.success("Group created");
      }
      await fetchAll();
      closeModal();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data || "Save failed";
      toast.error(typeof msg === "string" ? msg : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (row) => {
    Swal.fire({
      titleText: `Delete ${row.groupName}?`,
      html: "All encrypted entries in this group will be <b>permanently removed</b>. This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#EC0B43",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Yes, delete",
    }).then(async (r) => {
      if (!r.isConfirmed) return;
      try {
        await axiosInstance.delete(`${BASE}/${row.id}`);
        toast.success("Group deleted");
        await fetchAll();
      } catch { toast.error("Delete failed"); }
    });
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
                <span className="fw-semibold">Credential Vault</span>
                <small className="text-muted d-none d-md-inline">
                  Encrypted supplier credentials (SUPER_ADMIN only)
                </small>
              </span>
              <Button className="btn-green" onClick={openCreate}>+ New Group</Button>
            </Card.Header>
            <Card.Body className="p-0">
              {health && !health.masterKeyLoaded && (
                <Alert variant="warning" className="mb-0 rounded-0">
                  <b>Master key not loaded.</b> {health.message}
                </Alert>
              )}
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>S/N</th>
                    <th>Code</th>
                    <th>Name</th>
                    <th style={{ width: 100 }}>Env</th>
                    <th>Description</th>
                    <th style={{ width: 100 }}>Status</th>
                    <th style={{ width: 180 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, idx) => (
                    <tr key={row.id}>
                      <td>{idx + 1}</td>
                      <td><code>{row.groupCode}</code></td>
                      <td>{row.groupName}</td>
                      <td>
                        <Badge bg={row.environment === "LIVE" ? "danger" : "info"}>
                          {row.environment}
                        </Badge>
                      </td>
                      <td><small className="text-muted">{row.description || "—"}</small></td>
                      <td>
                        {row.isActive
                          ? <Badge bg="success">Active</Badge>
                          : <Badge bg="secondary">Inactive</Badge>}
                      </td>
                      <td>
                        <div className="d-flex gap-3 align-items-center">
                          <FaListUl
                            className="text-primary"
                            style={{ cursor: "pointer", fontSize: 18 }}
                            title="Manage entries"
                            onClick={() => navigate(`/super-admin/credential-vault/groups/${row.id}`)}
                          />
                          <FaEdit
                            className="text-primary"
                            style={{ cursor: "pointer", fontSize: 18 }}
                            title="Edit group"
                            onClick={() => openEdit(row)}
                          />
                          <FaTrash
                            className="text-danger"
                            style={{ cursor: "pointer", fontSize: 18 }}
                            title="Delete group"
                            onClick={() => confirmDelete(row)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {isLoading && (
                    <tr><td colSpan={7} className="text-center text-muted py-4">
                      <div className="spinner-border spinner-border-sm me-2" role="status" />
                      Loading…
                    </td></tr>
                  )}
                  {!isLoading && items.length === 0 && (
                    <tr><td colSpan={7} className="text-center text-muted py-4">
                      No credential groups yet. Click <b>+ New Group</b> to create one.
                    </td></tr>
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </main>
      </div>

      <Modal show={showModal} onHide={closeModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>{editingId ? "Edit Group" : "New Credential Group"}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row className="g-3">
            <Col md={6}>
              <Form.Group>
                <Form.Label>Code *</Form.Label>
                <Form.Control
                  value={form.groupCode}
                  onChange={(e) => setForm({ ...form, groupCode: e.target.value })}
                  disabled={saving || !!editingId}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Name *</Form.Label>
                <Form.Control
                  value={form.groupName}
                  onChange={(e) => setForm({ ...form, groupName: e.target.value })}
                  disabled={saving}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Environment</Form.Label>
                <Form.Select
                  value={form.environment}
                  onChange={(e) => setForm({ ...form, environment: e.target.value })}
                  disabled={saving}
                >
                  {ENVIRONMENTS.map((v) => <option key={v} value={v}>{v}</option>)}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Status</Form.Label>
                <Form.Check
                  type="switch"
                  id="grp-active"
                  label={form.isActive ? "Active" : "Inactive"}
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  disabled={saving}
                />
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Description</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  disabled={saving}
                />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancel</Button>
          <Button className="btn-green" onClick={save} disabled={saving}>
            {saving ? "Saving…" : (editingId ? "Update" : "Create")}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
