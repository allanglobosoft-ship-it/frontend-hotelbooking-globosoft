import React, { useEffect, useMemo, useState } from "react";
import { Card, Button, Table, Modal, Form, Pagination } from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEdit, FaTrash } from "react-icons/fa";
import BackButton from "../../components/BackButton";

export default function SeasonType() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [season, setSeason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState("");
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [searchTerm, setSearchTerm] = useState(null);

  // Validation functions
  const validateForm = () => {
    const newErrors = {};

    // Season validation
    if (!season || season.trim() === "") {
      newErrors.season = "Season Type is required";
    } else if (season.trim().length < 2) {
      newErrors.season = "Season Type must be at least 2 characters long";
    } else if (season.trim().length > 100) {
      newErrors.season = "Season Type must not exceed 100 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const clearError = (fieldName) => {
    if (errors[fieldName]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
    }
  };

  const nextId = useMemo(
    () => Math.max(0, ...items.map((i) => i.id)) + 1,
    [items]
  );

  const openCreate = () => {
    setEditing(null);
    setSeason("");
    setError("");
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setSeason(item.season || "");
    setError("");
    setErrors({});
    setShowModal(true);
  };

  const handleEdit = async () => {
    if (!editing) return;

    // Validate form before submitting
    if (!validateForm()) {
      toast.error("Please fix the validation errors");
      return;
    }

    try {
      setIsLoading(true);
      const editRes = await axiosInstance.put(
        `/api/seasonType/${editing.seasonTypeId}`,
        {
          season: season.trim(),
        }
      );

     if (editRes.data) {
        toast.success("Season Type Updated Successfully!");
        // First refresh the list
        await fetchSeasonTypeList(page, search);
        // Then close modal and reset state
        closeModal();
      }
    } catch (error) {
      setError("Failed to update season type");
      toast.error("Failed to update season type");
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setSeason("");
    setError("");
    setErrors({});
  };

  const fetchSeasonTypeList = async (pageNum = 0, searchTerm = search) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "10",
      });

      if (searchTerm && searchTerm.trim()) {
        params.append("search", searchTerm.trim());
      }

      const res = await axiosInstance.get(
        `/api/seasonType?${params.toString()}`
      );
     
     // Check if response has data and pagination info
     if (res.data && Array.isArray(res.data)) {
        setItems(res.data);
        // Since backend doesn't return totalPages, we'll calculate it based on data length
        // If we get less than 10 items, it's likely the last page
        if (res.data.length < 10) {
          setTotalPages(pageNum + 1);
        } else {
          // If we get exactly 10 items, there might be more pages
          // We'll set a reasonable total or keep the current totalPages
          setTotalPages(Math.max(totalPages, pageNum + 2));
        }

        setPage(pageNum);
      } else {
        setItems([]);
        setTotalPages(0);
        setPage(0);
      }
    } catch (err) {
      toast.error("Failed to load season types");
      setItems([]);
      setTotalPages(0);
      setPage(0);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSeasonType = async () => {
    // Validate form before submitting
    if (!validateForm()) {
      toast.error("Please fix the validation errors");
      return;
    }

    try {
      setIsLoading(true);
      const seasonTypePayload = { 
        season: season.trim()
      };
      const seasonTypeSaveRes = await axiosInstance.post(
        "/api/seasonType/save",
        seasonTypePayload
      );
      if (seasonTypeSaveRes.data !== 0) {
        toast.success("Season Type added Successfully!");
        // First refresh the list
        await fetchSeasonTypeList(page, search);
        // Then close modal
        closeModal();
      }
    } catch (error) {
      setError("Sorry! Data not saved to db..");
      toast.error("Failed to save season type data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSeasonTypeList();
  }, []);

  // Debounced search effect
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Set new timeout for search
    if (search !== "") {
      const timeout = setTimeout(() => {
        fetchSeasonTypeList(0, search);
      }, 500); // 500ms delay
      setSearchTimeout(timeout);
    } else if (search === "") {
      // If search is cleared, fetch all data
      fetchSeasonTypeList(0, "");
    }

    // Cleanup timeout on unmount
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [search]);

  const handleDelete = (item) => {
    console.log("delete item :::" , item);
    Swal.fire({
      titleText: `Are you sure? You want to delete ${item.season} Season Type`,
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
          .delete(`/api/seasonType/${item.seasonTypeId}`)
          .then(() => {
            toast.success("Season Type deleted successfully");
            fetchSeasonTypeList(page, search);
          })
          .catch(() => {
            toast.error("Sorry!! Season Type not deleted");
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
                <span className="fw-semibold">Season Type</span>
              </span>
              {/* Season Type Search */}
               <Form.Group className="hotel-search-bar flex-grow-1 flex-sm-grow-0">
                  <Form.Control
                    type="text"
                    placeholder="Search season type...."
                    className="form-control-modern-sm"
                    value={searchTerm}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSearchTerm(value);
                      fetchSeasonTypeList(0, value); // pass value to API
                    }}
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
                    <th style={{ width: 100 }}>S/N</th>
                    <th>Season</th>
                    <th style={{ width: 160 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.seasonTypeId}>
                      <td>{index + 1 + page * 10}</td>
                      <td>{item.season}</td>
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
                      <td colSpan={3} className="text-center text-muted py-4">
                        <div
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        >
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        Loading available season types...
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={3} className="text-center text-muted py-4">
                        No season types found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center p-3 border-top">
                  <div>
                    <small className="text-muted">
                      Showing {items.length} of {totalPages * 10} season types
                    </small>
                  </div>
                  <div>
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={page === 0}
                        onClick={() => fetchSeasonTypeList(page - 1, search)}
                      />
                      {[...Array(totalPages).keys()].map((num) => (
                        <Pagination.Item
                          key={num}
                          active={num === page}
                          onClick={() => fetchSeasonTypeList(num, search)}
                        >
                          {num + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={page === totalPages - 1}
                        onClick={() => fetchSeasonTypeList(page + 1, search)}
                      />
                    </Pagination>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>

          <Modal show={showModal} onHide={() => {}} centered backdrop="static" keyboard={false}>
            <Modal.Header closeButton={!isLoading} onHide={closeModal}>
              <Modal.Title>
                {editing ? "Update Season Type" : "Create Season Type"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Season <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    value={season}
                    onChange={(e) => {
                      setSeason(e.target.value);
                      clearError('season');
                    }}
                    placeholder="Enter season type"
                    autoFocus
                    isInvalid={!!errors.season}
                    maxLength={100}
                  />
                  <Form.Text className="text-muted">
                    {season.length}/100 characters
                  </Form.Text>
                  {errors.season && (
                    <Form.Control.Feedback type="invalid">
                      {errors.season}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>
                {error && (
                  <div className="alert alert-danger" role="alert">
                    {error}
                  </div>
                )}
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
                onClick={editing ? handleEdit : saveSeasonType}
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
