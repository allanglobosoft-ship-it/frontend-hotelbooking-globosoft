import React, { useEffect, useState } from "react";
import { Card, Table, Button, Form, Modal, Row, Col, Badge, InputGroup } from "react-bootstrap";
import { FaPlus, FaEdit, FaTrash, FaDollarSign, FaSearch, FaArrowLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import DashboardRedirections from "../../components/DashboardRedirections";

/**
 * Admin master for MYOP add-ons. Lists every add-on, lets admin create / edit
 * the master record, toggle active, and jump into the per-add-on rate manager.
 *
 * Reaches /api/package-addon. The MYOP v2 search page only displays add-ons
 * whose `isActive` is true on this page AND that have at least one active rate
 * covering the pickup date.
 */
const BLANK = {
  addonId: null,
  code: "",
  name: "",
  description: "",
  hasDetails: true,
  isActive: false,
  displayOrder: 100,
  discountText: "",
};

export default function PackageAddOnReg() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(BLANK);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/package-addon?page=0&limit=100&search=${encodeURIComponent(search.trim())}`
      );
      const list = Array.isArray(res.data) ? res.data : res.data?.content || [];
      setItems(list);
    } catch (e) {
      console.error("load add-ons failed", e);
      toast.error("Failed to load add-ons");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditing({ ...BLANK });
    setShowModal(true);
  };

  const openEdit = (row) => {
    setEditing({
      addonId: row.addonId,
      code: row.code || "",
      name: row.name || "",
      description: row.description || "",
      hasDetails: row.hasDetails !== false,
      isActive: !!row.isActive,
      displayOrder: row.displayOrder ?? 100,
      discountText: row.discountText || "",
    });
    setShowModal(true);
  };

  const validate = () => {
    if (!editing.code.trim()) {
      toast.error("Code is required");
      return false;
    }
    if (!editing.name.trim()) {
      toast.error("Name is required");
      return false;
    }
    return true;
  };

  const save = async () => {
    if (!validate()) return;
    try {
      if (editing.addonId) {
        await axiosInstance.put(`/api/package-addon/${editing.addonId}`, editing);
        toast.success("Add-on updated");
      } else {
        await axiosInstance.post("/api/package-addon/register", editing);
        toast.success("Add-on created");
      }
      setShowModal(false);
      load();
    } catch (e) {
      console.error("save failed", e);
      toast.error(e?.response?.data?.message || "Save failed");
    }
  };

  const toggleActive = async (row) => {
    try {
      await axiosInstance.patch(`/api/package-addon/${row.addonId}/active`, {
        isActive: !row.isActive,
      });
      load();
    } catch (e) {
      console.error("toggle failed", e);
      toast.error("Toggle failed");
    }
  };

  const handleDelete = async (row) => {
    const res = await Swal.fire({
      title: `Delete "${row.name}"?`,
      text: "This will remove the master record and all its rates.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc3545",
    });
    if (!res.isConfirmed) return;
    try {
      await axiosInstance.delete(`/api/package-addon/${row.addonId}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      console.error("delete failed", e);
      toast.error(e?.response?.data?.message || "Delete failed");
    }
  };

  return (
    <div className="d-flex flex-column" style={{ minHeight: "100vh" }}>
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <div className="flex-grow-1" style={{ background: "#f6f8fa", minWidth: 0 }}>
          <div className="container-fluid p-4">
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

            <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
              <h4 className="fw-bold mb-0">MYOP Package Add-Ons</h4>
              <Button variant="primary" onClick={openCreate}>
                <FaPlus className="me-2" /> New Add-On
              </Button>
            </div>

            <Card className="border-0 shadow-sm rounded-4 mb-3">
              <Card.Body className="p-3">
                <Row>
                  <Col md={6}>
                    <InputGroup>
                      <InputGroup.Text><FaSearch /></InputGroup.Text>
                      <Form.Control
                        placeholder="Search code or name…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && load()}
                      />
                      <Button variant="outline-secondary" onClick={load}>Search</Button>
                    </InputGroup>
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            <Card className="border-0 shadow-sm rounded-4">
              <Card.Body className="p-0">
                <Table responsive hover className="mb-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>#</th>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Discount</th>
                      <th>Has Details</th>
                      <th>Order</th>
                      <th>Active</th>
                      <th className="text-end pe-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr><td colSpan={8} className="text-center text-muted py-4">Loading…</td></tr>
                    )}
                    {!loading && items.length === 0 && (
                      <tr><td colSpan={8} className="text-center text-muted py-4">No add-ons yet.</td></tr>
                    )}
                    {!loading && items.map((row, i) => (
                      <tr key={row.addonId}>
                        <td>{i + 1}</td>
                        <td><code>{row.code}</code></td>
                        <td>
                          <div className="fw-semibold">{row.name}</div>
                          {row.description && <small className="text-muted">{row.description}</small>}
                        </td>
                        <td>
                          {row.discountText
                            ? <Badge bg="success" className="fw-normal">{row.discountText}</Badge>
                            : <span className="text-muted small">—</span>}
                        </td>
                        <td>{row.hasDetails ? "Yes" : "No"}</td>
                        <td>{row.displayOrder}</td>
                        <td>
                          <Form.Check
                            type="switch"
                            id={`active-${row.addonId}`}
                            checked={!!row.isActive}
                            onChange={() => toggleActive(row)}
                          />
                        </td>
                        <td className="text-end pe-3">
                          <Button size="sm" variant="outline-success" className="me-2"
                            title="Manage rates"
                            onClick={() => navigate(`/package-addons-rates/${row.addonId}`, { state: { addon: row } })}>
                            <FaDollarSign />
                          </Button>
                          <Button size="sm" variant="outline-primary" className="me-2"
                            title="Edit" onClick={() => openEdit(row)}>
                            <FaEdit />
                          </Button>
                          <Button size="sm" variant="outline-danger"
                            title="Delete" onClick={() => handleDelete(row)}>
                            <FaTrash />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </div>
        </div>
      </div>

      <Modal show={showModal} onHide={() => setShowModal(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{editing.addonId ? "Edit Add-On" : "New Add-On"}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row className="g-3">
            <Col md={4}>
              <Form.Label>Code<span className="text-danger">*</span></Form.Label>
              <Form.Control
                value={editing.code}
                disabled={!!editing.addonId}
                placeholder="VISA, YACHT_RENTAL…"
                onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase().replace(/\s+/g, "_") })}
              />
              {editing.addonId && <small className="text-muted">Code is set at creation and immutable.</small>}
            </Col>
            <Col md={8}>
              <Form.Label>Name<span className="text-danger">*</span></Form.Label>
              <Form.Control
                value={editing.name}
                placeholder="Visa, Yacht Rental, …"
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Col>
            <Col md={12}>
              <Form.Label>Description</Form.Label>
              <Form.Control
                as="textarea" rows={2}
                value={editing.description}
                placeholder="Short marketing copy shown under the toggle."
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </Col>
            <Col md={6}>
              <Form.Label>Discount Text</Form.Label>
              <Form.Control
                value={editing.discountText}
                placeholder='e.g. "10% off departure combo"'
                onChange={(e) => setEditing({ ...editing, discountText: e.target.value })}
              />
            </Col>
            <Col md={3}>
              <Form.Label>Display Order</Form.Label>
              <Form.Control
                type="number"
                value={editing.displayOrder}
                onChange={(e) => setEditing({ ...editing, displayOrder: parseInt(e.target.value, 10) || 0 })}
              />
            </Col>
            <Col md={3} className="d-flex align-items-end">
              <Form.Check
                type="switch"
                id="hasDetails"
                label="Show details step"
                checked={editing.hasDetails}
                onChange={(e) => setEditing({ ...editing, hasDetails: e.target.checked })}
              />
            </Col>
            <Col md={12}>
              <Form.Check
                type="switch"
                id="isActive"
                label="Active — visible in MYOP v2 search"
                checked={editing.isActive}
                onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
              />
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}