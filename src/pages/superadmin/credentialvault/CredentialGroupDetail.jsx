import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, Button, Table, Modal, Form, Row, Col, Badge, InputGroup, Alert } from "react-bootstrap";
import Sidebar from "../../../components/Sidebar";
import Topbar from "../../../components/TopBar";
import BackButton from "../../../components/BackButton";
import axiosInstance from "../../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEye, FaEdit, FaTrash, FaCopy } from "react-icons/fa";

const GROUP_BASE = "/api/super-admin/credential-vault/groups";

const emptyForm = { entryKey: "", plaintextValue: "", isSecret: true };

export default function CredentialGroupDetail() {
  const { groupId } = useParams();
  const [group, setGroup] = useState(null);
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingKey, setEditingKey] = useState(null); // when non-null we're editing that key
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showValueInPlaintext, setShowValueInPlaintext] = useState(false);

  const [revealed, setRevealed] = useState(null); // { entryKey, plaintextValue, warning }

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [g, e] = await Promise.all([
        axiosInstance.get(`${GROUP_BASE}/${groupId}`),
        axiosInstance.get(`${GROUP_BASE}/${groupId}/entries`),
      ]);
      setGroup(g.data);
      setEntries(Array.isArray(e.data) ? e.data : []);
    } catch (err) {
      if (err?.response?.status === 403) {
        toast.error("Credential Vault requires the SUPER_ADMIN role.");
      } else {
        toast.error("Failed to load group");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [groupId]);

  const openCreate = () => {
    setEditingKey(null);
    setForm(emptyForm);
    setShowValueInPlaintext(false);
    setShowModal(true);
  };
  const openOverwrite = (row) => {
    setEditingKey(row.entryKey);
    setForm({ entryKey: row.entryKey, plaintextValue: "", isSecret: row.isSecret !== false });
    setShowValueInPlaintext(false);
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditingKey(null); setForm(emptyForm); };

  const save = async () => {
    if (!form.entryKey.trim() || form.plaintextValue === "") {
      return toast.error("Key and value are required");
    }
    setSaving(true);
    try {
      await axiosInstance.post(`${GROUP_BASE}/${groupId}/entries`, form);
      toast.success(editingKey ? "Value overwritten" : "Entry saved");
      await fetchAll();
      closeModal();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data || "Save failed";
      toast.error(typeof msg === "string" ? msg : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const doReveal = (row) => {
    Swal.fire({
      titleText: `Reveal ${row.entryKey}?`,
      html: "The decrypted plaintext will be shown in a modal. This action is <b>logged</b> under your username. Continue?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#EC0B43",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Reveal",
    }).then(async (r) => {
      if (!r.isConfirmed) return;
      try {
        const res = await axiosInstance.post(
          `${GROUP_BASE}/${groupId}/entries/${row.id}/reveal`);
        setRevealed(res.data);
      } catch (e) {
        const msg = e?.response?.data?.message || "Reveal failed";
        toast.error(typeof msg === "string" ? msg : "Reveal failed");
      }
    });
  };

  const copyReveal = () => {
    if (!revealed?.plaintextValue) return;
    navigator.clipboard.writeText(revealed.plaintextValue)
      .then(() => toast.success("Copied to clipboard"))
      .catch(() => toast.error("Copy failed — select the value and copy manually"));
  };

  const confirmDelete = (row) => {
    Swal.fire({
      titleText: `Delete ${row.entryKey}?`,
      text: "The encrypted value will be removed permanently.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#EC0B43",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Yes, delete",
    }).then(async (r) => {
      if (!r.isConfirmed) return;
      try {
        await axiosInstance.delete(`${GROUP_BASE}/${groupId}/entries/${row.id}`);
        toast.success("Entry deleted");
        await fetchAll();
      } catch { toast.error("Delete failed"); }
    });
  };

  const fmt = (s) => (s ? new Date(s).toLocaleString() : "—");

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex flex-column flex-sm-row gap-2 justify-content-between align-items-stretch align-items-sm-center">
              <span className="d-flex align-items-center gap-2 flex-wrap">
                <BackButton fallback="/super-admin/credential-vault" />
                <span className="fw-semibold">Credential Entries</span>
                {group && (
                  <>
                    <span className="text-muted">·</span>
                    <span><b>{group.groupName}</b> <code className="text-muted">({group.groupCode})</code></span>
                    <Badge bg={group.environment === "LIVE" ? "danger" : "info"}>{group.environment}</Badge>
                  </>
                )}
              </span>
              <Button className="btn-green" onClick={openCreate}>+ Add Entry</Button>
            </Card.Header>
            <Card.Body className="p-0">
              <Alert variant="light" className="mb-0 rounded-0 small border-bottom">
                Values are encrypted at rest with AES-256-GCM. Only masked previews (last 4
                chars) are shown here. Use <b>Reveal</b> to view the plaintext once — every
                reveal is logged under your username.
              </Alert>
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>S/N</th>
                    <th>Key</th>
                    <th>Preview</th>
                    <th style={{ width: 100 }}>Type</th>
                    <th>Last Rotated</th>
                    <th>Updated By</th>
                    <th style={{ width: 180 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((row, idx) => (
                    <tr key={row.id}>
                      <td>{idx + 1}</td>
                      <td><code>{row.entryKey}</code></td>
                      <td>
                        {row.isSecret
                          ? <code className="text-muted">{row.maskedPreview || "••••"}</code>
                          : <code>{row.maskedPreview}</code>}
                      </td>
                      <td>
                        {row.isSecret
                          ? <Badge bg="warning" text="dark">Secret</Badge>
                          : <Badge bg="secondary">Public</Badge>}
                      </td>
                      <td><small>{fmt(row.lastRotatedOn)}</small></td>
                      <td><small>{row.updatedBy || "—"}</small></td>
                      <td>
                        <div className="d-flex gap-3 align-items-center">
                          <FaEye
                            className="text-primary"
                            style={{ cursor: "pointer", fontSize: 18 }}
                            title="Reveal plaintext (logged)"
                            onClick={() => doReveal(row)}
                          />
                          <FaEdit
                            className="text-primary"
                            style={{ cursor: "pointer", fontSize: 18 }}
                            title="Overwrite value"
                            onClick={() => openOverwrite(row)}
                          />
                          <FaTrash
                            className="text-danger"
                            style={{ cursor: "pointer", fontSize: 18 }}
                            title="Delete"
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
                  {!isLoading && entries.length === 0 && (
                    <tr><td colSpan={7} className="text-center text-muted py-4">
                      No entries yet. Click <b>+ Add Entry</b> to store the first one
                      (e.g. <code>LOGIN</code>, <code>PASSWORD</code>, <code>BASE_URL</code>).
                    </td></tr>
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </main>
      </div>

      {/* Add / overwrite modal */}
      <Modal show={showModal} onHide={() => !saving && closeModal()} centered>
        <Modal.Header closeButton>
          <Modal.Title>{editingKey ? `Overwrite ${editingKey}` : "Add Entry"}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row className="g-3">
            <Col md={12}>
              <Form.Group>
                <Form.Label>Key *</Form.Label>
                <Form.Control
                  placeholder="LOGIN"
                  value={form.entryKey}
                  onChange={(e) => setForm({ ...form, entryKey: e.target.value })}
                  disabled={saving || !!editingKey}
                />
                <Form.Text className="text-muted">
                  Uppercase identifier. Convention: <code>LOGIN</code>, <code>PASSWORD</code>,{" "}
                  <code>BASE_URL</code>, <code>API_KEY</code>.
                </Form.Text>
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Value *</Form.Label>
                <InputGroup>
                  <Form.Control
                    type={showValueInPlaintext ? "text" : "password"}
                    placeholder={editingKey ? "New value" : "Value to encrypt"}
                    value={form.plaintextValue}
                    onChange={(e) => setForm({ ...form, plaintextValue: e.target.value })}
                    disabled={saving}
                    autoComplete="off"
                  />
                  <Button
                    variant="outline-secondary"
                    onClick={() => setShowValueInPlaintext((v) => !v)}
                    disabled={saving}
                  >
                    {showValueInPlaintext ? "Hide" : "Show"}
                  </Button>
                </InputGroup>
                <Form.Text className="text-muted">
                  Encrypted server-side before storage. This field is not persisted anywhere in the browser.
                </Form.Text>
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Check
                type="switch"
                id="is-secret"
                label={form.isSecret
                  ? "Secret (reveal is logged)"
                  : "Public (URL / non-sensitive metadata)"}
                checked={form.isSecret}
                onChange={(e) => setForm({ ...form, isSecret: e.target.checked })}
                disabled={saving}
              />
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancel</Button>
          <Button className="btn-green" onClick={save} disabled={saving}>
            {saving ? "Saving…" : (editingKey ? "Overwrite" : "Save")}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Reveal modal */}
      <Modal show={!!revealed} onHide={() => setRevealed(null)} centered backdrop="static">
        <Modal.Header>
          <Modal.Title>Revealed: {revealed?.entryKey}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="alert alert-warning py-2 small mb-3">
            {revealed?.warning}
          </div>
          <Form.Label>Plaintext</Form.Label>
          <InputGroup>
            <Form.Control
              value={revealed?.plaintextValue || ""}
              readOnly
              style={{ fontFamily: "monospace" }}
              onFocus={(e) => e.target.select()}
            />
            <Button variant="outline-primary" onClick={copyReveal}>
              <FaCopy /> Copy
            </Button>
          </InputGroup>
        </Modal.Body>
        <Modal.Footer>
          <Button className="btn-green" onClick={() => setRevealed(null)}>Done</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
