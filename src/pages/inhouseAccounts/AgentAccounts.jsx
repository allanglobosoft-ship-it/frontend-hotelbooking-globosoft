import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  Button,
  Table,
  Modal,
  Form,
  Pagination,
} from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";
import { getCurrentActiveRole } from "../../utils/authSession";
import {
  FaPlus,
  FaHistory,
  FaDollarSign,
} from "react-icons/fa";

export default function AgentAccounts() {
  const navigate = useNavigate();
  // Recording a payment adds to the agent's available credit, so only an
  // admin may do it (the backend refuses everyone else too).
  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(
    String(getCurrentActiveRole() || "").toUpperCase(),
  );
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

  const [dateOfReceive, setDateOfReceive] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState("");
  const [remarks, setRemarks] = useState("");
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [allAgents, setAllAgents] = useState([]);

  const totalPages = Math.ceil(allAgents.length / 10);
  
  const paginatedAgents = useMemo(() => {
    return allAgents.slice(page * 10, (page + 1) * 10);
  }, [allAgents, page]);

  // keepPage: refresh after a payment save/update/delete stays on the page
  // the admin was on (clamped if the list got shorter). A new search or the
  // first load still starts from page 1.
  const fetchAgentSummaries = async (searchVal = searchTerm, { keepPage = false } = {}) => {
    setIsLoading(true);
    try {
      const res = await axiosInstance.get("/api/agent-credit-limit/agents");
      if (res.data && Array.isArray(res.data)) {
        let data = res.data;
        if (searchVal && searchVal.trim()) {
          const lowerSearch = searchVal.toLowerCase().trim();
          data = data.filter(agent => 
            agent.agentName?.toLowerCase().includes(lowerSearch)
          );
        }
        setAllAgents(data);
        if (keepPage) {
          const lastPage = Math.max(0, Math.ceil(data.length / 10) - 1);
          setPage((prev) => Math.min(prev, lastPage));
        } else {
        setPage(0); // Reset to first page on new data/search
        }
      } else {
        setAllAgents([]);
      }
    } catch (err) {
      toast.error("Failed to load agent summaries");
      setAllAgents([]);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreate = (agent) => {
    setEditing(null);
    setSelectedAgent(agent);
    setDateOfReceive(new Date().toISOString().split('T')[0]);
    // Amount starts empty — admin types the receive amount fresh. The row's
    // used-credit is already surfaced as the "Available Balance" hint below
    // the field, so pre-filling it here would just be noise.
    setAmount("");
    setPaymentType("");
    setRemarks("");
    setError("");
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setSelectedAgent(item);
    setDateOfReceive(item.dateOfReceive || new Date().toISOString().split('T')[0]);
    setAmount(item.amount || "");
    setPaymentType(item.paymentType || "");
    setRemarks(item.remarks || "");
    setError("");
    setShowModal(true);
  };

  const handleEdit = async () => {
    if (!editing) return;

    if (!dateOfReceive) {
      setError("Date of receive is required");
      return;
    }
    if (!amount || amount <= 0) {
      setError("Amount must be greater than 0");
      return;
    }
    if (!paymentType) {
      setError("Payment type is required");
      return;
    }
    if (!remarks.trim()) {
      setError("Remarks is required");
      return;
    }

    try {
      setIsLoading(true);
      setError("");
      const payload = {
        dateOfReceive: dateOfReceive + "T00:00:00",
        amount: parseFloat(amount),
        paymentType: paymentType,
        remarks: remarks,
        agentId: selectedAgent.agentId || selectedAgent.id,
      };

      const editRes = await axiosInstance.put(
        `/api/inhouseAgentAccounts/${editing.id}`,
        payload
      );

      if (editRes.data) {
        toast.success("Amount Receive Updated Successfully!");
        await fetchAgentSummaries(searchTerm, { keepPage: true });
        closeModal();
      }
    } catch (error) {
      setError("Failed to update amount receive");
      toast.error("Failed to update amount receive");
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setSelectedAgent(null);
    setDateOfReceive("");
    setAmount("");
    setPaymentType("");
    setRemarks("");
    setError("");
  };

  const saveAmountReceive = async () => {
    if (!dateOfReceive) {
      setError("Date of receive is required");
      return;
    }
    if (!amount || amount <= 0) {
      setError("Amount must be greater than 0");
      return;
    }
    if (!paymentType) {
      setError("Payment type is required");
      return;
    }
    if (!remarks.trim()) {
      setError("Remarks is required");
      return;
    }

    try {
      setIsLoading(true);
      setError("");
      const payload = {
        dateOfReceive: dateOfReceive + "T00:00:00",
        amount: parseFloat(amount),
        paymentType: paymentType,
        remarks: remarks,
        agentId: selectedAgent.agentId || selectedAgent.id,
      };

      const saveRes = await axiosInstance.post(
        "/api/inhouseAgentAccounts/save",
        payload
      );

      if (saveRes.data !== 0) {
        toast.success("Amount Receive added Successfully!");
        await fetchAgentSummaries(searchTerm, { keepPage: true });
        closeModal();
      }
    } catch (error) {
      setError("Sorry! Data not saved to db..");
      toast.error("Failed to save amount receive data");
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setDateOfReceive(new Date().toISOString().split('T')[0]);
    setAmount(selectedAgent?.usedCreditLimit || "");
    setPaymentType("");
    setRemarks("");
    setError("");
  };

  useEffect(() => {
    fetchAgentSummaries();
  }, []);

  const handleDelete = (item) => {
    Swal.fire({
      title: `Are you sure? You want to delete this amount receive record?`,
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
          .delete(`/api/inhouseAgentAccounts/${item.id}`)
          .then(() => {
            toast.success("Amount receive record deleted successfully");
            fetchAgentSummaries(searchTerm, { keepPage: true });
          })
          .catch(() => {
            toast.error("Sorry!! Amount receive record not deleted");
          });
      }
    });
  };

  const handlePaymentHistory = (item) => {
    const agentId = item.agentId || item.id;
    navigate(`/inhouse-accounts/agent-payment-history/${agentId}`);
  };

  const handleCurrency = (item) => {
    const agentId = item.agentId || item.id;
    // 3rd icon ($) is the Auto Generated Invoice — it was wrongly pointing at
    // the payment-history route (same as the 2nd icon). Send it to its own page.
    navigate(`/inhouse-accounts/agent-auto-generated-invoice/${agentId}`);
  };

  const calculateAvailable = (creditLimit, used) => {
    return (parseFloat(creditLimit) - parseFloat(used)).toFixed(2);
  };


  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <span className="fw-semibold">Agent Accounts</span>
              {/* Search Bar */}
              <Form.Group className="hotel-search-bar">
                <Form.Control
                  type="text"
                  placeholder="Search agents by name..."
                  className="form-control-modern-sm"
                  value={searchTerm}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearchTerm(value);
                    fetchAgentSummaries(value);
                  }}
                />
              </Form.Group>
            
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>S/N</th>
                    <th>Agent Name</th>
                    <th>Credit Limit</th>
                    <th>Used</th>
                    <th>Available</th>
                    <th style={{ width: 260, whiteSpace: "nowrap" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAgents.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1 + page * 10}</td>
                      <td>{item.agentName}</td>
                      <td>{item.totalCreditLimit}</td>
                      <td>{item.usedCreditLimit}</td>
                      <td>{calculateAvailable(item.totalCreditLimit, item.usedCreditLimit)}</td>
                      <td>
                        <div
                          className="d-flex gap-1 flex-nowrap"
                          style={{ whiteSpace: "nowrap" }}
                        >
                          {isAdmin && (
                          <Button
                            size="sm"
                            variant="outline-success"
                            onClick={() => openCreate(item)}
                            title="Record a payment received from this agent"
                            className="d-inline-flex align-items-center"
                            style={{
                              padding: "1px 6px",
                              fontSize: "0.68rem",
                              lineHeight: 1.15,
                            }}
                          >
                            <FaPlus style={{ fontSize: "0.62rem" }} className="me-1" /> Payment
                          </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline-info"
                            onClick={() => handlePaymentHistory(item)}
                            title="List of payments received from this agent"
                            className="d-inline-flex align-items-center"
                            style={{
                              padding: "1px 6px",
                              fontSize: "0.68rem",
                              lineHeight: 1.15,
                            }}
                          >
                            <FaHistory style={{ fontSize: "0.62rem" }} className="me-1" /> Payments
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-warning"
                            onClick={() => handleCurrency(item)}
                            title="Credit-limit adjustments added from Agent Credit Limit"
                            className="d-inline-flex align-items-center"
                            style={{
                              padding: "1px 6px",
                              fontSize: "0.68rem",
                              lineHeight: 1.15,
                            }}
                          >
                            <FaDollarSign style={{ fontSize: "0.62rem" }} className="me-1" /> Credits
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {isLoading && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        <div
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        >
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        Loading agent accounts...
                      </td>
                    </tr>
                  )}
                  {(!allAgents || allAgents.length === 0) && !isLoading && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        No agent accounts found.
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
                      Showing {allAgents ? allAgents.length : 0} of {totalPages * 10} agents
                    </small>
                  </div>
                  <div>
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={page === 0}
                        onClick={() => setPage(page - 1)}
                      />
                      {Array.from({ length: totalPages }, (_, i) => (
                        <Pagination.Item
                          key={i}
                          active={i === page}
                          onClick={() => setPage(i)}
                        >
                          {i + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={page === totalPages - 1}
                        onClick={() => setPage(page + 1)}
                      />
                    </Pagination>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>

          {/* Amount Receive Modal (admins only, see isAdmin) */}
          <Modal show={showModal && isAdmin} onHide={closeModal} centered>
            <Modal.Header closeButton={!isLoading}>
              <Modal.Title>
                {editing ? "Update Amount Receive" : "Create Amount Receive"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Date of Receive</Form.Label>
                  <Form.Control
                    type="date"
                    value={dateOfReceive}
                    onChange={(e) => setDateOfReceive(e.target.value)}
                    autoFocus
                    isInvalid={!!error && !dateOfReceive}
                  />
                  {error && !dateOfReceive && (
                    <Form.Control.Feedback type="invalid">
                      {error}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Amount</Form.Label>
                  <Form.Control
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Enter amount"
                    isInvalid={!!error && (!amount || amount <= 0)}
                  />
                  {selectedAgent && (
                    <div
                      className="text-danger fw-semibold mt-1"
                      style={{ fontSize: "0.85rem" }}
                    >
                      Available Balance:{" "}
                      {calculateAvailable(
                        selectedAgent.totalCreditLimit,
                        selectedAgent.usedCreditLimit,
                      )}
                    </div>
                  )}
                  {error && (!amount || amount <= 0) && (
                    <Form.Control.Feedback type="invalid">
                      {error}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Payment Mode</Form.Label>
                  <Form.Select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value)}
                    isInvalid={!!error && !paymentType}
                  >
                    <option value="">SELECT</option>
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CREDIT_CARD">Credit Card</option>
                   </Form.Select>
                  {error && !paymentType && (
                    <Form.Control.Feedback type="invalid">
                      {error}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>
                    Remarks <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Enter remarks"
                    isInvalid={!!error && !remarks.trim()}
                  />
                  {error && !remarks.trim() && (
                    <Form.Control.Feedback type="invalid">
                      {error}
                    </Form.Control.Feedback>
                  )}
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
                onClick={editing ? handleEdit : saveAmountReceive}
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