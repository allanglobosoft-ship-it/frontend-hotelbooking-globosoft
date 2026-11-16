import React, { useEffect, useState } from "react";
import { Card, Button, Table, Modal, Form, Row, Col, Badge, InputGroup } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../../components/Sidebar";
import Topbar from "../../../components/TopBar";
import BackButton from "../../../components/BackButton";
import axiosInstance from "../../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEdit, FaKey, FaCheck, FaTimes, FaCopy, FaListUl, FaTrash } from "react-icons/fa";

const BASE = "/api/super-admin/api-access/clients";
const COMPANIES_URL = "/api/companyProfile";
const SUPPLIERS_MATRIX_URL = (clientId) =>
  `/api/super-admin/api-access/clients/${clientId}/suppliers`;

const emptyCreate = {
  companyProfileId: "",   // '' when not linked to a company (legacy free-form client)
  clientCode: "",
  clientName: "",
  contactEmail: "",
  rateLimitPerMinute: "",
  expiresOn: "",
  notes: "",
  enabledSupplierIds: [], // multi-select of external_api.id values to enable on create
};

const emptyEdit = {
  clientName: "",
  contactEmail: "",
  rateLimitPerMinute: "",
  expiresOn: "",
  notes: "",
  isActive: true,
};

export default function ApiClientList() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Companies for the "Company" dropdown in the create modal + rendered
  // in the list as a friendly label next to legacy code/name. Paged
  // response — we take the first page (up to 100) because the modal is
  // a search-in-dropdown; large tenants can add server-side search later.
  const [companies, setCompanies] = useState([]);

  // Supplier catalog (external_api rows) for the "Allowed APIs" multi-select.
  // Fetched once and reused — the same catalog powers the supplier matrix.
  const [suppliers, setSuppliers] = useState([]);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [saving, setSaving] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEdit);

  const [keyReveal, setKeyReveal] = useState(null); // { rawApiKey, client, mode: 'create' | 'regenerate' }

  const fetchList = async () => {
    setIsLoading(true);
    try {
      const res = await axiosInstance.get(BASE);
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error("Failed to load clients");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      // The paged list endpoint returns { content: [...] } style Page JSON
      // (see CompanyProfileServiceImpl.getAllCompanyList). Read defensively
      // so we cope with either the paged shape or a plain array.
      const res = await axiosInstance.get(COMPANIES_URL, {
        params: { page: 0, size: 100 },
      });
      const rows = Array.isArray(res.data) ? res.data : (res.data?.content || []);
      setCompanies(rows);
    } catch {
      // Non-fatal — the create modal still works, just without the dropdown.
      setCompanies([]);
    }
  };

  const fetchSuppliers = async () => {
    try {
      // Piggy-back on the existing suppliers-matrix endpoint of ANY client
      // to get the full external_api catalog. If no clients exist yet,
      // fall back to an empty list (multi-select just shows nothing).
      const anyRes = await axiosInstance.get(BASE);
      const anyClient = Array.isArray(anyRes.data) && anyRes.data[0];
      if (!anyClient?.id) {
        setSuppliers([]);
        return;
      }
      const mat = await axiosInstance.get(SUPPLIERS_MATRIX_URL(anyClient.id));
      // Response shape: { clientId, clientCode, clientName, rows: [{ externalApiId, apiCode, apiName, ...}] }
      const rows = mat.data?.rows || [];
      setSuppliers(rows.map((r) => ({
        id: r.externalApiId,
        code: r.apiCode,
        name: r.apiName,
      })));
    } catch {
      setSuppliers([]);
    }
  };

  useEffect(() => {
    fetchList();
    fetchCompanies();
    fetchSuppliers();
  }, []);

  const openCreate = () => {
    setCreateForm(emptyCreate);
    setShowCreate(true);
  };

  // Called when super_admin picks a company from the dropdown — auto-fills
  // the Code + Name fields from that company row so the two identifiers
  // stay in sync with company_profile. Fields become read-only when a
  // company is selected; clearing the dropdown re-enables free text.
  const onPickCompany = (companyProfileId) => {
    if (!companyProfileId) {
      setCreateForm((f) => ({ ...f, companyProfileId: "" }));
      return;
    }
    const c = companies.find((x) => String(x.companyProfileId) === String(companyProfileId));
    if (!c) return;
    setCreateForm((f) => ({
      ...f,
      companyProfileId,
      clientCode: c.companyCode || f.clientCode,
      clientName: c.companyName || f.clientName,
    }));
  };

  const toggleSupplierPick = (supplierId) => {
    setCreateForm((f) => {
      const has = f.enabledSupplierIds.includes(supplierId);
      return {
        ...f,
        enabledSupplierIds: has
          ? f.enabledSupplierIds.filter((s) => s !== supplierId)
          : [...f.enabledSupplierIds, supplierId],
      };
    });
  };

  const submitCreate = async () => {
    if (!createForm.clientCode.trim() || !createForm.clientName.trim()) {
      return toast.error("Company code and name are required");
    }
    setSaving(true);
    try {
      // enabledSupplierIds is a UI-only companion field — never send it in
      // the create-client payload, the backend rejects unknown fields.
      const { enabledSupplierIds, companyProfileId, ...rest } = createForm;
      const payload = {
        ...rest,
        companyProfileId: companyProfileId ? Number(companyProfileId) : null,
        rateLimitPerMinute: createForm.rateLimitPerMinute
          ? Number(createForm.rateLimitPerMinute) : null,
        expiresOn: createForm.expiresOn || null,
      };
      const res = await axiosInstance.post(BASE, payload);
      const newClientId = res.data?.client?.id;

      // If super_admin picked APIs on the create form, push them to the
      // per-client supplier matrix immediately. Failure here doesn't undo
      // the client create — surface a toast and let super_admin fix via
      // the "Manage permissions" icon on the list row.
      if (newClientId && enabledSupplierIds.length > 0) {
        try {
          await axiosInstance.put(SUPPLIERS_MATRIX_URL(newClientId), {
            items: enabledSupplierIds.map((externalApiId) => ({
              externalApiId,
              isEnabled: true,
            })),
          });
        } catch {
          toast.error(
            "Client created but saving supplier picks failed — open Manage permissions to retry.",
          );
        }
      }

      setShowCreate(false);
      await fetchList();
      setKeyReveal({
        rawApiKey: res.data?.rawApiKey,
        client: res.data?.client,
        mode: "create",
      });
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data || "Save failed";
      toast.error(typeof msg === "string" ? msg : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setEditForm({
      clientName: row.clientName || "",
      contactEmail: row.contactEmail || "",
      rateLimitPerMinute: row.rateLimitPerMinute ?? "",
      expiresOn: row.expiresOn ? row.expiresOn.substring(0, 16) : "",
      notes: row.notes || "",
      isActive: row.isActive !== false,
    });
    setShowEdit(true);
  };

  const submitEdit = async () => {
    setSaving(true);
    try {
      const payload = {
        ...editForm,
        rateLimitPerMinute: editForm.rateLimitPerMinute === ""
          ? null : Number(editForm.rateLimitPerMinute),
        expiresOn: editForm.expiresOn || null,
      };
      await axiosInstance.put(`${BASE}/${editingId}`, payload);
      toast.success("Client updated");
      setShowEdit(false);
      setEditingId(null);
      await fetchList();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data || "Update failed";
      toast.error(typeof msg === "string" ? msg : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row) => {
    try {
      if (row.isActive) {
        await axiosInstance.post(`${BASE}/${row.id}/deactivate`);
        toast.success("Client deactivated");
      } else {
        await axiosInstance.post(`${BASE}/${row.id}/activate`);
        toast.success("Client activated");
      }
      await fetchList();
    } catch {
      toast.error("Status change failed");
    }
  };

  const confirmDeactivate = (row) => {
    Swal.fire({
      titleText: `Deactivate ${row.clientName}?`,
      text: "Their API key will stop working immediately.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#EC0B43",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Yes, deactivate",
    }).then((r) => { if (r.isConfirmed) toggleActive(row); });
  };

  // Hard-delete confirmation. For company-linked rows we call out the
  // consequence (next backend restart will re-provision an empty client)
  // so super_admin isn't surprised by the ghost row reappearing.
  const confirmDelete = (row) => {
    const isLinked = !!row.companyProfileId;
    Swal.fire({
      titleText: `Delete ${row.clientName}?`,
      html: isLinked
        ? "This removes the API key and every supplier/endpoint permission for this client.<br/><br/>"
          + "Because the client is linked to a company, a fresh (empty) client will be auto-provisioned on the next backend restart — the company keeps working, restrictions reset."
        : "This removes the API key and every supplier/endpoint permission for this client. Cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Yes, delete",
    }).then(async (r) => {
      if (!r.isConfirmed) return;
      try {
        await axiosInstance.delete(`${BASE}/${row.id}`);
        toast.success("Client deleted");
        await fetchList();
      } catch (e) {
        const msg = e?.response?.data?.message || e?.response?.data || "Delete failed";
        toast.error(typeof msg === "string" ? msg : "Delete failed");
      }
    });
  };

  const confirmRegenerate = (row) => {
    Swal.fire({
      titleText: `Regenerate key for ${row.clientName}?`,
      html: "The current key becomes invalid <b>immediately</b>. You must share the new key with the client.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#EC0B43",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Yes, regenerate",
    }).then(async (r) => {
      if (!r.isConfirmed) return;
      try {
        const res = await axiosInstance.post(`${BASE}/${row.id}/regenerate-key`);
        await fetchList();
        setKeyReveal({
          rawApiKey: res.data?.rawApiKey,
          client: res.data?.client,
          mode: "regenerate",
        });
      } catch {
        toast.error("Regenerate failed");
      }
    });
  };

  const copyKey = () => {
    if (!keyReveal?.rawApiKey) return;
    navigator.clipboard.writeText(keyReveal.rawApiKey)
      .then(() => toast.success("Copied to clipboard"))
      .catch(() => toast.error("Copy failed — select and copy manually"));
  };

  const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "—");

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
                <span className="fw-semibold">API Clients (Companies)</span>
                <small className="text-muted d-none d-md-inline">
                  Every registered company gets one row here — pick a row and use
                  the list icon to enable/disable API suppliers
                </small>
              </span>
              <Button className="btn-green" onClick={openCreate}>
                + Create Client
              </Button>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>S/N</th>
                    <th>Company Code</th>
                    <th>Company Name</th>
                    <th>Contact</th>
                    <th>Key</th>
                    <th style={{ width: 100 }}>Status</th>
                    <th>Rate/min</th>
                    <th>Expires</th>
                    <th style={{ width: 210 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, idx) => (
                    <tr key={row.id}>
                      <td>{idx + 1}</td>
                      <td><code>{row.clientCode}</code></td>
                      <td>
                        {row.clientName}
                        {!row.companyProfileId && (
                          <Badge bg="secondary" className="ms-2" title="Not linked to a company_profile row">
                            Legacy
                          </Badge>
                        )}
                      </td>
                      <td><small>{row.contactEmail || "—"}</small></td>
                      <td>
                        <code>{row.apiKeyPrefix}</code>
                        <small className="text-muted">…</small>
                      </td>
                      <td>
                        {row.isActive
                          ? <Badge bg="success">Active</Badge>
                          : <Badge bg="secondary">Inactive</Badge>}
                      </td>
                      <td>{row.rateLimitPerMinute ?? "—"}</td>
                      <td><small>{fmtDate(row.expiresOn)}</small></td>
                      <td>
                        <div className="d-flex gap-3 align-items-center">
                          <FaListUl
                            className="text-primary"
                            style={{ cursor: "pointer", fontSize: 18 }}
                            title="Manage permissions"
                            onClick={() => navigate(`/super-admin/api-access/clients/${row.id}/permissions`)}
                          />
                          <FaEdit
                            className="text-primary"
                            style={{ cursor: "pointer", fontSize: 18 }}
                            title="Edit"
                            onClick={() => openEdit(row)}
                          />
                          <FaKey
                            className="text-warning"
                            style={{ cursor: "pointer", fontSize: 18 }}
                            title="Regenerate key"
                            onClick={() => confirmRegenerate(row)}
                          />
                          {row.isActive
                            ? <FaTimes
                                className="text-danger"
                                style={{ cursor: "pointer", fontSize: 18 }}
                                title="Deactivate"
                                onClick={() => confirmDeactivate(row)}
                              />
                            : <FaCheck
                                className="text-success"
                                style={{ cursor: "pointer", fontSize: 18 }}
                                title="Activate"
                                onClick={() => toggleActive(row)}
                              />}
                          <FaTrash
                            className="text-danger"
                            style={{ cursor: "pointer", fontSize: 18 }}
                            title="Delete client"
                            onClick={() => confirmDelete(row)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {isLoading && (
                    <tr>
                      <td colSpan={9} className="text-center text-muted py-4">
                        <div className="spinner-border spinner-border-sm me-2" role="status" />
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!isLoading && items.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center text-muted py-4">
                        No clients yet. Click <b>+ Create Client</b> to onboard one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </main>
      </div>

      {/* Create modal */}
      <Modal show={showCreate} onHide={() => !saving && setShowCreate(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Create API Client (Company)</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row className="g-3">
            <Col md={12}>
              <Form.Group>
                <Form.Label>Company *</Form.Label>
                <Form.Select
                  value={createForm.companyProfileId}
                  onChange={(e) => onPickCompany(e.target.value)}
                  disabled={saving}
                >
                  <option value="">— Pick a company (auto-fills code + name) —</option>
                  {companies.map((c) => (
                    <option key={c.companyProfileId} value={c.companyProfileId}>
                      {c.companyName}
                      {c.companyCode ? ` (${c.companyCode})` : ""}
                    </option>
                  ))}
                </Form.Select>
                <Form.Text className="text-muted">
                  Leave blank only for a legacy free-form client not tied to a company row.
                </Form.Text>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Company Code *</Form.Label>
                <Form.Control
                  placeholder="CMP-000042"
                  value={createForm.clientCode}
                  onChange={(e) => setCreateForm({ ...createForm, clientCode: e.target.value })}
                  disabled={saving || !!createForm.companyProfileId}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Company Name *</Form.Label>
                <Form.Control
                  placeholder="Acme Travel Ltd."
                  value={createForm.clientName}
                  onChange={(e) => setCreateForm({ ...createForm, clientName: e.target.value })}
                  disabled={saving || !!createForm.companyProfileId}
                />
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Allowed APIs</Form.Label>
                <div className="border rounded p-2 d-flex flex-wrap gap-2" style={{ minHeight: 44 }}>
                  {suppliers.length === 0 && (
                    <small className="text-muted">
                      No supplier catalog available — you can pick suppliers later via the list icon on the row.
                    </small>
                  )}
                  {suppliers.map((s) => (
                    <Form.Check
                      key={s.id}
                      type="checkbox"
                      id={`create-supp-${s.id}`}
                      label={s.name || s.code}
                      checked={createForm.enabledSupplierIds.includes(s.id)}
                      onChange={() => toggleSupplierPick(s.id)}
                      disabled={saving}
                      className="me-3"
                    />
                  ))}
                </div>
                <Form.Text className="text-muted">
                  Only these APIs will respond to hotel searches from this company's admin + agents.
                  Leave empty to allow every API (unrestricted, default).
                </Form.Text>
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Contact Email</Form.Label>
                <Form.Control
                  type="email"
                  placeholder="ops@acmetravel.com"
                  value={createForm.contactEmail}
                  onChange={(e) => setCreateForm({ ...createForm, contactEmail: e.target.value })}
                  disabled={saving}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Rate Limit (per minute)</Form.Label>
                <Form.Control
                  type="number"
                  min="0"
                  placeholder="Leave blank for no limit"
                  value={createForm.rateLimitPerMinute}
                  onChange={(e) => setCreateForm({ ...createForm, rateLimitPerMinute: e.target.value })}
                  disabled={saving}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Expires On</Form.Label>
                <Form.Control
                  type="datetime-local"
                  value={createForm.expiresOn}
                  onChange={(e) => setCreateForm({ ...createForm, expiresOn: e.target.value })}
                  disabled={saving}
                />
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Notes</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  disabled={saving}
                />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={saving}>Cancel</Button>
          <Button className="btn-green" onClick={submitCreate} disabled={saving}>
            {saving ? "Creating…" : "Create & Generate Key"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Edit modal */}
      <Modal show={showEdit} onHide={() => !saving && setShowEdit(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Edit Client</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row className="g-3">
            <Col md={12}>
              <Form.Group>
                <Form.Label>Client Name</Form.Label>
                <Form.Control
                  value={editForm.clientName}
                  onChange={(e) => setEditForm({ ...editForm, clientName: e.target.value })}
                  disabled={saving}
                />
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Contact Email</Form.Label>
                <Form.Control
                  type="email"
                  value={editForm.contactEmail}
                  onChange={(e) => setEditForm({ ...editForm, contactEmail: e.target.value })}
                  disabled={saving}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Rate Limit (per minute)</Form.Label>
                <Form.Control
                  type="number"
                  min="0"
                  value={editForm.rateLimitPerMinute}
                  onChange={(e) => setEditForm({ ...editForm, rateLimitPerMinute: e.target.value })}
                  disabled={saving}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Expires On</Form.Label>
                <Form.Control
                  type="datetime-local"
                  value={editForm.expiresOn}
                  onChange={(e) => setEditForm({ ...editForm, expiresOn: e.target.value })}
                  disabled={saving}
                />
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Status</Form.Label>
                <Form.Check
                  type="switch"
                  id="edit-active"
                  label={editForm.isActive ? "Active" : "Inactive"}
                  checked={editForm.isActive}
                  onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                  disabled={saving}
                />
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Notes</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  disabled={saving}
                />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowEdit(false)} disabled={saving}>Cancel</Button>
          <Button className="btn-green" onClick={submitEdit} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* One-time key reveal */}
      <Modal show={!!keyReveal} onHide={() => setKeyReveal(null)} centered backdrop="static" keyboard={false}>
        <Modal.Header>
          <Modal.Title>
            {keyReveal?.mode === "regenerate" ? "New API Key" : "API Client Created"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">
            Client: <b>{keyReveal?.client?.clientName}</b>
            {" "}
            (<code>{keyReveal?.client?.clientCode}</code>)
          </p>
          <div className="alert alert-warning py-2 small mb-3">
            This key is shown <b>only once</b>. Copy it now and share it securely with the client.
            If lost, you must regenerate — the old value is unrecoverable.
          </div>
          <Form.Label>API Key</Form.Label>
          <InputGroup>
            <Form.Control
              value={keyReveal?.rawApiKey || ""}
              readOnly
              style={{ fontFamily: "monospace" }}
              onFocus={(e) => e.target.select()}
            />
            <Button variant="outline-primary" onClick={copyKey}>
              <FaCopy /> Copy
            </Button>
          </InputGroup>
          <div className="mt-3 small text-muted">
            Sent by the client on every request as:{" "}
            <code>X-Api-Key: {keyReveal?.rawApiKey?.substring(0, 12)}…</code>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button className="btn-green" onClick={() => setKeyReveal(null)}>Done</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
