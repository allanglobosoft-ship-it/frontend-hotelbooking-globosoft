import React, { useEffect, useState } from "react";
import { Card, Button, Table, Modal, Form, Pagination, Row, Col } from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEdit, FaTrash } from "react-icons/fa";
import BackButton from "../../components/BackButton";

// Cab-type master. Feeds the Cab Type dropdown on /registration/schefferDriver
// with name + max adult / child pax counts.
export default function CabType() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [adultCount, setAdultCount] = useState("");
  const [childCount, setChildCount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setName("");
    setAdultCount("");
    setChildCount("");
    setErrors({});
  };

  const openCreate = () => {
    setEditing(null);
    setName("");
    setAdultCount("");
    setChildCount("");
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setName(item.name || "");
    setAdultCount(item.adultCount != null ? String(item.adultCount) : "");
    setChildCount(item.childCount != null ? String(item.childCount) : "");
    setErrors({});
    setShowModal(true);
  };

  const fetchCabTypeList = async (pageNum = 0, search = searchTerm) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: "10",
      });
      if (search && search.trim()) {
        params.append("search", search.trim());
      }
      const res = await axiosInstance.get(`/api/masterCabType?${params.toString()}`);
      const data = Array.isArray(res.data) ? res.data : [];
      setItems(data);
      if (data.length < 10) {
        setTotalPages(pageNum + 1);
      } else {
        setTotalPages(Math.max(totalPages, pageNum + 2));
      }
      setPage(pageNum);
    } catch (err) {
      toast.error("Failed to load cab types");
      setItems([]);
      setTotalPages(0);
      setPage(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCabTypeList(0, "");
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchCabTypeList(0, searchTerm), 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const validate = () => {
    const next = {};
    if (!name.trim()) next.name = "Name is required";
    if (adultCount === "" || Number.isNaN(Number(adultCount)) || Number(adultCount) < 0) {
      next.adultCount = "Enter a valid adult count (0 or more)";
    }
    if (childCount === "" || Number.isNaN(Number(childCount)) || Number(childCount) < 0) {
      next.childCount = "Enter a valid child count (0 or more)";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveCabType = async () => {
    if (!validate()) return;
    try {
      setIsLoading(true);
      const payload = {
        name: name.trim(),
        adultCount: Number(adultCount),
        childCount: Number(childCount),
      };
      const res = await axiosInstance.post("/api/masterCabType/saveCabType", payload);
      if (res.data) {
        toast.success("Cab Type added successfully!");
        await fetchCabTypeList(page, searchTerm);
        closeModal();
      }
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to save cab type";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const editCabType = async () => {
    if (!editing || !validate()) return;
    try {
      setIsLoading(true);
      const payload = {
        name: name.trim(),
        adultCount: Number(adultCount),
        childCount: Number(childCount),
      };
      const res = await axiosInstance.put(`/api/masterCabType/${editing.id}`, payload);
      if (res.data) {
        toast.success("Cab Type updated successfully!");
        await fetchCabTypeList(page, searchTerm);
        closeModal();
      }
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to update cab type";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = (item) => {
    Swal.fire({
      titleText: `Delete cab type "${item.name}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
    }).then((result) => {
      if (result.isConfirmed) {
        axiosInstance
          .delete(`/api/masterCabType/${item.id}`)
          .then(() => {
            toast.success("Cab Type deleted successfully");
            fetchCabTypeList(page, searchTerm);
          })
          .catch(() => {
            toast.error("Failed to delete cab type");
          });
      }
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
                <span className="fw-semibold">Cab Type</span>
              </span>
              <Form.Group className="hotel-search-bar flex-grow-1 flex-sm-grow-0">
                <Form.Control
                  type="text"
                  placeholder="Search cab type..."
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
                    <th>Name</th>
                    <th style={{ width: 160 }}>Max Adults</th>
                    <th style={{ width: 160 }}>Max Children</th>
                    <th style={{ width: 140 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1 + page * 10}</td>
                      <td>{item.name}</td>
                      <td>{item.adultCount}</td>
                      <td>{item.childCount}</td>
                      <td>
                        <div className="d-flex gap-3">
                          <FaEdit
                            className="text-primary"
                            style={{ cursor: "pointer", fontSize: 18 }}
                            onClick={() => openEdit(item)}
                            title="Edit"
                          />
                          <FaTrash
                            className="text-danger"
                            style={{ cursor: "pointer", fontSize: 18 }}
                            onClick={() => handleDelete(item)}
                            title="Delete"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {isLoading && (
                    <tr>
                      <td colSpan={5} className="text-center text-muted py-4">
                        <div className="spinner-border spinner-border-sm me-2" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        Loading cab types...
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={5} className="text-center text-muted py-4">
                        No cab types found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>

              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center p-3 border-top">
                  <small className="text-muted">
                    Showing {items.length} of ~{totalPages * 10} cab types.
                  </small>
                  <Pagination className="mb-0">
                    <Pagination.Prev
                      disabled={page === 0}
                      onClick={() => fetchCabTypeList(page - 1, searchTerm)}
                    />
                    {[...Array(totalPages).keys()].map((num) => (
                      <Pagination.Item
                        key={num}
                        active={num === page}
                        onClick={() => fetchCabTypeList(num, searchTerm)}
                      >
                        {num + 1}
                      </Pagination.Item>
                    ))}
                    <Pagination.Next
                      disabled={page === totalPages - 1}
                      onClick={() => fetchCabTypeList(page + 1, searchTerm)}
                    />
                  </Pagination>
                </div>
              )}
            </Card.Body>
          </Card>

          <Modal show={showModal} onHide={closeModal} centered>
            <Modal.Header closeButton={!isLoading}>
              <Modal.Title>
                {editing ? "Update Cab Type" : "Create Cab Type"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Cab Type Name</Form.Label>
                  <Form.Control
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Sedan"
                    isInvalid={!!errors.name}
                    autoFocus
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.name}
                  </Form.Control.Feedback>
                </Form.Group>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Max Adult Count</Form.Label>
                      <Form.Control
                        type="number"
                        min={0}
                        value={adultCount}
                        onChange={(e) => setAdultCount(e.target.value)}
                        placeholder="e.g. 3"
                        isInvalid={!!errors.adultCount}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.adultCount}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Max Child Count</Form.Label>
                      <Form.Control
                        type="number"
                        min={0}
                        value={childCount}
                        onChange={(e) => setChildCount(e.target.value)}
                        placeholder="e.g. 1"
                        isInvalid={!!errors.childCount}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.childCount}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={closeModal} disabled={isLoading}>
                Cancel
              </Button>
              <Button
                className="btn-indigo"
                onClick={editing ? editCabType : saveCabType}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    />
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
