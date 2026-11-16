import React, { useEffect, useMemo, useState } from "react";
import { Card, Button, Table, Modal, Form, Pagination } from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEdit, FaTrash } from "react-icons/fa";
import axios from "axios";
import BackButton from "../../components/BackButton";

export default function Country() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState("");
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [marketTypes, setMarketTypes] = useState([]);
  const [regionTypes, setRegionTypes] = useState([]);
  const [countryCode, setCountryCode] = useState("");
  const [selectedMarketType, setSelectedMarketType] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");

  const nextId = useMemo(
    () => Math.max(0, ...items.map((i) => i.id)) + 1,
    [items]
  );

  const openCreate = () => {
  setEditing(null);
  setName("");
  setCountryCode("");
  setSelectedMarketType("");
  setSelectedRegion("");
  setError("");
  setShowModal(true);
};

const openEdit = (item) => {
  console.log("item::" , item)
  setEditing(item);
  setName(item.name);
  setCountryCode(item.countryCode || "");
  setSelectedMarketType(item.marketTypeId || "");
  setSelectedRegion(item.regionId || "");
  setError("");
  setShowModal(true);
};

  const handleEdit = async () => {
    if (!editing) return;

    try {
      setIsLoading(true);
      const editRes = await axiosInstance.put(`/api/country/${editing.id}`, {
        name: name,
        marketTypeId : `${selectedMarketType}`,
        regionId : `${selectedRegion}`,
        countryCode : `${countryCode}`
      });

      if (editRes.data) {
        toast.success("Country Updated Successfully!");
        // First refresh the list
        await fetchCountryList(page, search);
        // Then close modal and reset state
        closeModal();
      }
    } catch (error) {
      setError("Failed to update country");
      toast.error("Failed to update country");
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setName("");
    setError("");
  };

  const fetchCountryList = async (pageNum = 0, searchTerm = search) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "10",
      });

      if (searchTerm && searchTerm.trim()) {
        params.append("search", searchTerm.trim());
      }

      const res = await axiosInstance.get(`/api/country?${params.toString()}`);

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
      toast.error("Failed to load regions");
      setItems([]);
      setTotalPages(0);
      setPage(0);
    } finally {
      setIsLoading(false);
    }
  };

  const saveCountry = async () => {
    try {
      setIsLoading(true);
      const countrypayload = {
        name: `${name}`,
        marketTypeId : `${selectedMarketType}`,
        regionId : `${selectedRegion}`,
        countryCode : `${countryCode}`
      };
      const saveRes = await axiosInstance.post(
        "/api/country/saveCountry",
        countrypayload
      );
      if (saveRes.data !== 0) {
        toast.success("Country added Successfully!");
        // First refresh the list
        await fetchCountryList(page, search);
        // Then close modal
        closeModal();
      }
    } catch (error) {
      setError("Sorry! Data not saved to db..");
      toast.error("Failed to save country data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCountryList();
    MarketTypeList();
    RegionList();
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
        fetchCountryList(0, search);
      }, 500); // 500ms delay
      setSearchTimeout(timeout);
    } else if (search === "") {
      // If search is cleared, fetch all data
      fetchCountryList(0, "");
    }

    // Cleanup timeout on unmount
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [search]);

  const handleDelete = (item) => {
    Swal.fire({
      titleText: `Are you sure? You want to delete ${item.name}`,
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
          .delete(`/api/country/${item.id}`)
          .then(() => {
            toast.success("Country deleted successfully");
            fetchCountryList(page, search);
          })
          .catch(() => {
            toast.error("Sorry!!Country not deleted");
          });
      }
    });
  };

  const MarketTypeList = async () => {
    try {
      const response = await axiosInstance.get("/api/marketType");
      setMarketTypes(response.data);
    } catch (error) {
      console.log("error for markettype list :", error);
    }
  };

  const RegionList = async () => {
    try {
      const response = await axiosInstance.get("/api/region");
      setRegionTypes(response.data);
    } catch (error) {
      console.log("error for region list :", error);
    }
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
                <span className="fw-semibold">Country</span>
              </span>
              {/* Country Name Search */}
              <Form.Group className="hotel-search-bar flex-grow-1 flex-sm-grow-0">
                <Form.Control
                  type="text"
                  placeholder="Search country..."
                  className="form-control-modern-sm"
                  value={searchTerm}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearchTerm(value);
                    fetchCountryList(0, value); // pass value to API
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
                    <th>Region</th>
                    <th>Country</th>
                    <th>Country Code</th>
                    <th>Market Type</th>
                    <th style={{ width: 160 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1 + page * 10}</td>
                      <td>{item.region}</td>
                      <td>{item.name}</td>
                      <td>{item.countryCode}</td>
                      <td>{item.marketType}</td>
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
                        Loading available countries...
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={3} className="text-center text-muted py-4">
                        No countries found.
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
                      Showing {items.length} of {totalPages * 10} countries
                    </small>
                  </div>
                  <div>
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={page === 0}
                        onClick={() => fetchCountryList(page - 1, search)}
                      />
                      {[...Array(totalPages).keys()].map((num) => (
                        <Pagination.Item
                          key={num}
                          active={num === page}
                          onClick={() => fetchCountryList(num, search)}
                        >
                          {num + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={page === totalPages - 1}
                        onClick={() => fetchCountryList(page + 1, search)}
                      />
                    </Pagination>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>

          <Modal show={showModal} onHide={closeModal} centered>
            <Modal.Header closeButton={!isLoading}>
              <Modal.Title>
                {editing ? "Update Country" : "Create Country"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Market Type</Form.Label>
                  <Form.Select
                    name="marketTypeId"
                    value={selectedMarketType}
                    onChange={(e) => setSelectedMarketType(e.target.value)}
                    isInvalid={!!error}
                  >
                    <option value="">Select MarketType</option>
                    {marketTypes.map((market) => (
                      <option key={market.marketTypeId} value={market.marketTypeId}>
                        {market.name}
                      </option>
                    ))}
                  </Form.Select>
                  {error && (
                    <Form.Control.Feedback type="invalid">
                      {error}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Region</Form.Label>
                  <Form.Select
                    name="regionId"
                    value={selectedRegion}
                    onChange={(e) => setSelectedRegion(e.target.value)}
                    isInvalid={!!error}
                  >
                    <option value="">Select Region</option>
                    {regionTypes.map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.name}
                      </option>
                    ))}
                  </Form.Select>
                  {error && (
                    <Form.Control.Feedback type="invalid">
                      {error}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Country Name</Form.Label>
                  <Form.Control
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter country name"
                    autoFocus
                    isInvalid={!!error}
                  />
                  {error && (
                    <Form.Control.Feedback type="invalid">
                      {error}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Country Code</Form.Label>
                  <Form.Control
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    placeholder="Enter country code"
                    autoFocus
                    isInvalid={!!error}
                  />
                  {error && (
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
                onClick={editing ? handleEdit : saveCountry}
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
