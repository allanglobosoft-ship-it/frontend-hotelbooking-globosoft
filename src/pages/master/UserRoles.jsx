import React, { useEffect, useMemo, useState } from "react";
import { Card, Button, Table, Modal, Form } from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEdit, FaTrash } from "react-icons/fa";
import BackButton from "../../components/BackButton";

export default function UserRoles() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [roleName, setRoleName] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState({});
  const [searchTerm, setSearchTerm] = useState("");

  // roles is a small master table (a handful of rows), so we fetch the full
  // list once and filter client-side. Mirrors Bank.jsx structurally but
  // without the server-side pagination, which would be overkill here.
  const filteredItems = useMemo(() => {
    const q = (searchTerm || "").trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (r) =>
        (r.roleName || "").toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q),
    );
  }, [items, searchTerm]);

  const openCreate = () => {
    setEditing(null);
    setRoleName("");
    setDescription("");
    setError("");
    setValidationErrors({});
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setRoleName(item.roleName || "");
    setDescription(item.description || "");
    setValidationErrors({});
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setRoleName("");
    setDescription("");
    setError("");
    setValidationErrors({});
  };

  const validateForm = () => {
    const errors = {};
    if (!roleName.trim()) {
      errors.roleName = "Role name is required";
    }
    return errors;
  };

  const fetchRoles = async () => {
    setIsLoading(true);
    try {
      const res = await axiosInstance.get("/api/userRoles");
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error("Failed to load roles");
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  const saveRole = async () => {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    try {
      setIsLoading(true);
      setValidationErrors({});
      const payload = {
        roleName: roleName.trim(),
        description: description.trim(),
      };
      const res = await axiosInstance.post("/api/userRoles/save", payload);
      if (res.data) {
        toast.success("Role added successfully!");
        await fetchRoles();
        closeModal();
      }
    } catch (err) {
      setError("Sorry! Data not saved to db..");
      toast.error("Failed to save role");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editing) return;
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    try {
      setIsLoading(true);
      setValidationErrors({});
      const payload = {
        roleName: roleName.trim(),
        description: description.trim(),
      };
      const res = await axiosInstance.put(
        `/api/userRoles/${editing.id}`,
        payload,
      );
      if (res.data) {
        toast.success("Role updated successfully!");
        await fetchRoles();
        closeModal();
      }
    } catch (err) {
      setError("Failed to update role");
      toast.error("Failed to update role");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = (item) => {
    Swal.fire({
      titleText: `Are you sure? You want to delete ${item.roleName}`,
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
          .delete(`/api/userRoles/${item.id}`)
          .then(() => {
            toast.success("Role deleted successfully");
            fetchRoles();
          })
          .catch(() => {
            toast.error("Sorry! Role not deleted");
          });
      }
    });
  };

  useEffect(() => {
    fetchRoles();
  }, []);

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
                <span className="fw-semibold">User Roles</span>
              </span>
              <Form.Group className="hotel-search-bar flex-grow-1 flex-sm-grow-0">
                <Form.Control
                  type="text"
                  placeholder="Search role by name or description..."
                  className="form-control-modern-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </Form.Group>
              <Button className="btn-green" onClick={openCreate}>
                + Create
              </Button>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>S/N</th>
                    <th>Role Name</th>
                    <th>Description</th>
                    <th style={{ width: 160 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1}</td>
                      <td>{item.roleName}</td>
                      <td>{item.description || "—"}</td>
                      <td>
                        <div className="d-flex gap-2">
                          <FaEdit
                            className="text-primary"
                            style={{ cursor: "pointer", fontSize: "18px" }}
                            onClick={() => openEdit(item)}
                            title="Edit"
                          />
                          <FaTrash
                            className="text-danger"
                            style={{ cursor: "pointer", fontSize: "18px" }}
                            onClick={() => handleDelete(item)}
                            title="Delete"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {isLoading && (
                    <tr>
                      <td colSpan={4} className="text-center text-muted py-4">
                        <div
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        >
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        Loading available roles...
                      </td>
                    </tr>
                  )}
                  {filteredItems.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={4} className="text-center text-muted py-4">
                        No roles found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>

          <Modal show={showModal} onHide={closeModal} centered>
            <Modal.Header closeButton={!isLoading}>
              <Modal.Title>
                {editing ? "Update Role" : "Create Role"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Role Name</Form.Label>
                  <Form.Control
                    value={roleName}
                    onChange={(e) => {
                      setRoleName(e.target.value);
                      if (validationErrors.roleName) {
                        setValidationErrors((prev) => ({
                          ...prev,
                          roleName: "",
                        }));
                      }
                    }}
                    placeholder="e.g. ADMIN, AGENT, STAFF"
                    autoFocus
                    isInvalid={!!validationErrors.roleName}
                  />
                  {validationErrors.roleName && (
                    <Form.Control.Feedback type="invalid">
                      {validationErrors.roleName}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Description</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Short description of what this role can do"
                  />
                </Form.Group>
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={closeModal}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                className="btn-indigo"
                onClick={editing ? handleEdit : saveRole}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    {editing ? "Updating..." : "Saving..."}
                  </>
                ) : editing ? (
                  "Update"
                ) : (
                  "Save"
                )}
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
}
