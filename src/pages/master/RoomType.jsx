import React, { useEffect, useMemo, useState } from "react";
import { Card, Button, Table, Modal, Form, Pagination } from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEdit, FaTrash } from "react-icons/fa";
import BackButton from "../../components/BackButton";

export default function RoomType() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [mealPlanId, setMealPlanId] = useState("");
  const [mealPlans, setMealPlans] = useState([]);
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

    // Name validation
    if (!name || name.trim() === "") {
      newErrors.name = "Name is required";
    } else if (name.trim().length < 2) {
      newErrors.name = "Name must be at least 2 characters long";
    } else if (name.trim().length > 100) {
      newErrors.name = "Name must not exceed 100 characters";
    }

    // Code validation
    if (!code || code.trim() === "") {
      newErrors.code = "Code is required";
    } else if (code.trim().length < 1) {
      newErrors.code = "Code must be at least 1 character long";
    } else if (code.trim().length > 20) {
      newErrors.code = "Code must not exceed 20 characters";
    }

    // Meal Plan validation
    if (!mealPlanId || mealPlanId === "") {
      newErrors.mealPlanId = "Meal Plan is required";
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

  // Fetch meal plans
  const fetchMealPlans = async () => {
    try {
      const res = await axiosInstance.get("/api/mealplan");
      if (res.data && Array.isArray(res.data)) {
        setMealPlans(res.data);
      }
    } catch (err) {
      console.error("Failed to load meal plans:", err);
      toast.error("Failed to load meal plans");
    }
  };

  const nextId = useMemo(
    () => Math.max(0, ...items.map((i) => i.id)) + 1,
    [items]
  );

  const openCreate = () => {
    setEditing(null);
    setName("");
    setCode("");
    setMealPlanId("");
    setError("");
    setErrors({});
    fetchMealPlans(); // Load meal plans when opening modal
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setName(item.name || "");
    setCode(item.code || "");
    setMealPlanId(item.mealPlanId || "");
    setError("");
    setErrors({});
    fetchMealPlans(); // Load meal plans when opening modal
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
        `/api/roomType/${editing.roomtypeId}`,
        {
          name: name.trim(),
          code: code.trim(),
          mealPlanId: Number(mealPlanId),
        }
      );

     if (editRes.data) {
        toast.success("Room Type Updated Successfully!");
        // First refresh the list
        await fetchRoomTypeList(page, search);
        // Then close modal and reset state
        closeModal();
      }
    } catch (error) {
      setError("Failed to update room type");
      toast.error("Failed to update room type");
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setName("");
    setCode("");
    setMealPlanId("");
    setError("");
    setErrors({});
  };

  const fetchRoomTypeList = async (pageNum = 0, searchTerm = search) => {
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
        `/api/roomType?${params.toString()}`
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
      toast.error("Failed to load room categories");
      setItems([]);
      setTotalPages(0);
      setPage(0);
    } finally {
      setIsLoading(false);
    }
  };

  const saveRoomType = async () => {
    // Validate form before submitting
    if (!validateForm()) {
      toast.error("Please fix the validation errors");
      return;
    }

    try {
      setIsLoading(true);
      const roomTypePayload = { 
        name: name.trim(),
        code: code.trim(),
        mealPlanId: Number(mealPlanId)
      };
      const roomTypeSaveRes = await axiosInstance.post(
        "/api/roomType/save",
        roomTypePayload
      );
      if (roomTypeSaveRes.data !== 0) {
        toast.success("Room Type added Successfully!");
        // First refresh the list
        await fetchRoomTypeList(page, search);
        // Then close modal
        closeModal();
      }
    } catch (error) {
      setError("Sorry! Data not saved to db..");
      toast.error("Failed to save room type data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRoomTypeList();
    fetchMealPlans(); // Load meal plans on component mount
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
        fetchRoomTypeList(0, search);
      }, 500); // 500ms delay
      setSearchTimeout(timeout);
    } else if (search === "") {
      // If search is cleared, fetch all data
      fetchRoomTypeList(0, "");
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
      titleText: `Are you sure? You want to delete ${item.name} Room Type`,
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
          .delete(`/api/roomType/${item.roomtypeId}`)
          .then(() => {
            toast.success("Room Type deleted successfully");
            fetchRoomTypeList(page, search);
          })
          .catch(() => {
            toast.error("Sorry!! Room Type not deleted");
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
                <span className="fw-semibold">Room Type</span>
              </span>
              {/* Room Type Search */}
               <Form.Group className="hotel-search-bar flex-grow-1 flex-sm-grow-0">
                  <Form.Control
                    type="text"
                    placeholder="Search room type...."
                    className="form-control-modern-sm"
                    value={searchTerm}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSearchTerm(value);
                      fetchRoomTypeList(0, value); // pass value to API
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
                    <th>Name</th>
                    <th>Code</th>
                    <th>Meal Plan</th>
                    <th style={{ width: 160 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.roomtypeId}>
                      <td>{index + 1 + page * 10}</td>
                      <td>{item.name}</td>
                      <td>{item.code}</td>
                      <td>
                        {mealPlans.find(plan => plan.mealPlanId === item.mealPlanId)?.name || ' - '}
                      </td>
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
                      <td colSpan={5} className="text-center text-muted py-4">
                        <div
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        >
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        Loading available room types...
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={5} className="text-center text-muted py-4">
                        No room types found.
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
                      Showing {items.length} of {totalPages * 10} room types
                    </small>
                  </div>
                  <div>
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={page === 0}
                        onClick={() => fetchRoomTypeList(page - 1, search)}
                      />
                      {[...Array(totalPages).keys()].map((num) => (
                        <Pagination.Item
                          key={num}
                          active={num === page}
                          onClick={() => fetchRoomTypeList(num, search)}
                        >
                          {num + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={page === totalPages - 1}
                        onClick={() => fetchRoomTypeList(page + 1, search)}
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
                {editing ? "Update Room Type" : "Create Room Type"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Name <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      clearError('name');
                    }}
                    placeholder="Enter room type name"
                    autoFocus
                    isInvalid={!!errors.name}
                    maxLength={100}
                  />
                 
                  {errors.name && (
                    <Form.Control.Feedback type="invalid">
                      {errors.name}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Code <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      clearError('code');
                    }}
                    placeholder="Enter code"
                    isInvalid={!!errors.code}
                    maxLength={20}
                  />
                  
                  {errors.code && (
                    <Form.Control.Feedback type="invalid">
                      {errors.code}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Meals <span className="text-danger">*</span></Form.Label>
                  <Form.Select
                    value={mealPlanId}
                    onChange={(e) => {
                      setMealPlanId(e.target.value);
                      clearError('mealPlanId');
                    }}
                    isInvalid={!!errors.mealPlanId}
                  >
                    <option value="">Select meal plan</option>
                    {mealPlans.map((mealPlan) => (
                      <option key={mealPlan.mealPlanId} value={mealPlan.mealPlanId}>
                        {mealPlan.name}
                      </option>
                    ))}
                  </Form.Select>
                  {errors.mealPlanId && (
                    <Form.Control.Feedback type="invalid">
                      {errors.mealPlanId}
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
                onClick={editing ? handleEdit : saveRoomType}
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
