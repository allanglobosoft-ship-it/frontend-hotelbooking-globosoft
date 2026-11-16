import React, { useEffect, useMemo, useState } from "react";
import { Card, Button, Table, Modal, Form, Pagination } from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEdit, FaTrash, FaTimes, FaCheck, FaUndo } from "react-icons/fa";
import BackButton from "../../components/BackButton";

export default function ItineraryDetails() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({
    itineraryHeading: "",
    itineraryDesc: "",
    itineraryImg: null
  });
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

    // Heading validation
    if (!formData.itineraryHeading || formData.itineraryHeading.trim() === "") {
      newErrors.itineraryHeading = "Heading is required";
    } else if (formData.itineraryHeading.trim().length < 2) {
      newErrors.itineraryHeading = "Heading must be at least 2 characters long";
    } else if (formData.itineraryHeading.trim().length > 100) {
      newErrors.itineraryHeading = "Heading must not exceed 100 characters";
    }

    // Description validation
    if (!formData.itineraryDesc || formData.itineraryDesc.trim() === "") {
      newErrors.itineraryDesc = "Description is required";
    } else if (formData.itineraryDesc.trim().length < 10) {
      newErrors.itineraryDesc = "Description must be at least 10 characters long";
    } else if (formData.itineraryDesc.trim().length > 500) {
      newErrors.itineraryDesc = "Description must not exceed 500 characters";
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
    setFormData({
      itineraryHeading: "",
      itineraryDesc: "",
      itineraryImg: null
    });
    setError("");
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setFormData({
      itineraryHeading: item.itineraryHeading || "",
      itineraryDesc: item.itineraryDesc || "",
      itineraryImg: null
    });
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
      
      const formDataToSend = new FormData();
      formDataToSend.append('itineraryHeading', formData.itineraryHeading.trim());
      formDataToSend.append('itineraryDesc', formData.itineraryDesc.trim());
      if (formData.itineraryImg) {
        formDataToSend.append('itineraryImg', formData.itineraryImg);
      }

      const editRes = await axiosInstance.put(
        `/api/master/itenaryDetails/${editing.itineraryId}`,
        formDataToSend,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

     if (editRes.data) {
        toast.success("Itinerary Details Updated Successfully!");
        // First refresh the list
        await fetchItineraryDetailsList(page, search);
        // Then close modal and reset state
        closeModal();
      }
    } catch (error) {
      setError("Failed to update itinerary details");
      toast.error("Failed to update itinerary details");
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setFormData({
      itineraryHeading: "",
      itineraryDesc: "",
      itineraryImg: null
    });
    setError("");
    setErrors({});
  };

  const fetchItineraryDetailsList = async (pageNum = 0, searchTerm = search) => {
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
        `/api/master/itenaryDetails?${params.toString()}`
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
      toast.error("Failed to load itinerary detailss");
      setItems([]);
      setTotalPages(0);
      setPage(0);
    } finally {
      setIsLoading(false);
    }
  };

  const saveItineraryDetails = async () => {
    // Validate form before submitting
    if (!validateForm()) {
      toast.error("Please fix the validation errors");
      return;
    }

    try {
      setIsLoading(true);
      
      const formDataToSend = new FormData();
      formDataToSend.append('itineraryHeading', formData.itineraryHeading.trim());
      formDataToSend.append('itineraryDesc', formData.itineraryDesc.trim());
      if (formData.itineraryImg) {
        formDataToSend.append('itineraryImg', formData.itineraryImg);
      }

      const itineraryDetailsSaveRes = await axiosInstance.post(
        "/api/master/itenaryDetails/save",
        formDataToSend,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      if (itineraryDetailsSaveRes.data) {
        toast.success("Itinerary Details added Successfully!");
        // First refresh the list
        await fetchItineraryDetailsList(page, search);
        // Then close modal
        closeModal();
      }
    } catch (error) {
      setError("Sorry! Data not saved to db..");
      toast.error("Failed to save itinerary details data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchItineraryDetailsList();
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
        fetchItineraryDetailsList(0, search);
      }, 500); // 500ms delay
      setSearchTimeout(timeout);
    } else if (search === "") {
      // If search is cleared, fetch all data
      fetchItineraryDetailsList(0, "");
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
      titleText: `Are you sure? You want to delete ${item.itineraryHeading} Itinerary Details`,
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
          .delete(`/api/master/itenaryDetails/${item.itineraryId}`)
          .then(() => {
            toast.success("Itinerary Details deleted successfully");
            fetchItineraryDetailsList(page, search);
          })
          .catch(() => {
            toast.error("Sorry!! Itinerary Details not deleted");
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
              <div className="d-flex align-items-center gap-2">
                <BackButton fallback="/adminDashboard" />
                <h4 className="fw-bold text-primary mb-0">Itinerary Details</h4>
               </div>
              <div className="d-flex align-items-center gap-3">
               
                <Form.Group className="mb-0">
                  <Form.Control
                    type="text"
                    placeholder="Search"
                    className="form-control-sm"
                    value={searchTerm}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSearchTerm(value);
                      fetchItineraryDetailsList(0, value);
                    }}
                  />
                </Form.Group>
                <Button className="btn btn-success" onClick={openCreate}>
                  Create +
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>S.N</th>
                    <th>Description</th>
                    <th style={{ width: 160 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.itineraryId}>
                      <td>{index + 1 + page * 10}</td>
                      <td>
                        <div>
                          <div className="fw-semibold">{item.itineraryHeading}</div>
                          {item.itineraryDesc && (
                            <div className="text-muted small">
                              {item.itineraryDesc.length > 100 
                                ? `${item.itineraryDesc.substring(0, 100)}...` 
                                : item.itineraryDesc}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="d-flex gap-2">
                          <FaEdit
                            className="text-success"
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
                        Loading available itinerary detailss...
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={3} className="text-center text-muted py-4">
                        No itinerary detailss found.
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
                      Showing {items.length} of {totalPages * 10} itinerary detailss
                    </small>
                  </div>
                  <div>
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={page === 0}
                        onClick={() => fetchItineraryDetailsList(page - 1, search)}
                      />
                      {[...Array(totalPages).keys()].map((num) => (
                        <Pagination.Item
                          key={num}
                          active={num === page}
                          onClick={() => fetchItineraryDetailsList(num, search)}
                        >
                          {num + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={page === totalPages - 1}
                        onClick={() => fetchItineraryDetailsList(page + 1, search)}
                      />
                    </Pagination>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>

          <Modal show={showModal} onHide={() => {}} centered backdrop="static" keyboard={false} size="lg">
            <Modal.Header className="bg-primary text-white">
              <Modal.Title className="fw-bold">
                Save Itinerary Details
              </Modal.Title>
              <div className="text-danger small">* mandatory fields</div>
            </Modal.Header>
            <Modal.Body className="p-4">
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold">
                    * Heading
                  </Form.Label>
                  <Form.Control
                    value={formData.itineraryHeading}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, itineraryHeading: e.target.value }));
                      clearError('itineraryHeading');
                    }}
                    placeholder="Enter itinerary heading"
                    autoFocus
                    isInvalid={!!errors.itineraryHeading}
                    maxLength={100}
                  />
                  <Form.Text className="text-muted">
                    {formData.itineraryHeading.length}/100 characters
                  </Form.Text>
                  {errors.itineraryHeading && (
                    <Form.Control.Feedback type="invalid">
                      {errors.itineraryHeading}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold">
                    * Description
                  </Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={4}
                    value={formData.itineraryDesc}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, itineraryDesc: e.target.value }));
                      clearError('itineraryDesc');
                    }}
                    placeholder="Enter itinerary description"
                    isInvalid={!!errors.itineraryDesc}
                    maxLength={500}
                  />
                  <Form.Text className="text-muted">
                    {formData.itineraryDesc.length}/500 characters
                  </Form.Text>
                  {errors.itineraryDesc && (
                    <Form.Control.Feedback type="invalid">
                      {errors.itineraryDesc}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold">
                    Itinerary Image
                  </Form.Label>
                  <div className="d-flex align-items-center gap-2">
                    <Form.Control
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, itineraryImg: e.target.files[0] }));
                      }}
                      className="form-control-sm"
                    />
                    <Button 
                      variant="outline-primary" 
                      size="sm"
                      onClick={() => document.querySelector('input[type="file"]').click()}
                    >
                      Choose
                    </Button>
                  </div>
                  <Form.Text className="text-muted">
                    {formData.itineraryImg ? formData.itineraryImg.name : "No file selected"}
                  </Form.Text>
                </Form.Group>

                {error && (
                  <div className="alert alert-danger" role="alert">
                    {error}
                  </div>
                )}
              </Form>
            </Modal.Body>
            <Modal.Footer className="d-flex justify-content-between">
              <Button
                variant="danger"
                onClick={closeModal}
                disabled={isLoading}
                className="d-flex align-items-center gap-2"
              >
                <FaTimes />
                Cancel
              </Button>
              <div className="d-flex gap-2">
                <Button
                  variant="success"
                  onClick={editing ? handleEdit : saveItineraryDetails}
                  disabled={isLoading}
                  className="d-flex align-items-center gap-2"
                >
                  <FaCheck />
                  {isLoading ? (editing ? "Updating..." : "Saving...") : (editing ? "Update" : "Create")}
                </Button>
                <Button
                  variant="info"
                  onClick={() => {
                    setFormData({
                      itineraryHeading: "",
                      itineraryDesc: "",
                      itineraryImg: null
                    });
                    setErrors({});
                  }}
                  disabled={isLoading}
                  className="d-flex align-items-center gap-2"
                >
                  <FaUndo />
                  Reset
                </Button>
              </div>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
}
