import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Card, Button, Table, Modal, Form, Pagination } from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import { FaEdit, FaTrash } from "react-icons/fa";
import axios from "axios";
import Select from "react-select";
import BackButton from "../../components/BackButton";
// Shared pagination pill styling — .pagination-modern is defined in this
// stylesheet and drives the orange rounded look used on
// /new-booking/hotel. Every other rule in the file is namespaced under
// the same class prefixes (.pagination-modern .page-link, etc.) so
// importing it here does not affect anything else on the master page.
import "../../styles/HotelSearch.css";

export default function Province() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  // True row count matching the current filter — sourced from the backend's
  // X-Total-Count header on /api/province, so "of N" always agrees with what
  // is actually in the DB. Same wiring the Hotel List page uses (see
  // src/pages/Registration/HotelList.jsx).
  const [totalElements, setTotalElements] = useState(0);
  // Kept as a constant here — matches the Hotel List "pageSize" and the
  // limit sent to the backend below. If this ever needs to differ per-user,
  // convert to state; nothing else on the page hard-codes 10.
  const PAGE_SIZE = 10;
  const [search, setSearch] = useState("");
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [isLoadingCountries, setIsLoadingCountries] = useState(false);
  const [countryList, setCountryList] = useState([]);
  const [state, setState] = useState("");
  const [stateCode, setStateCode] = useState("");

  const customSelectStyles = {
    control: (base) => ({
      ...base,
      minHeight: "42px",
      borderRadius: "0.5rem",
      border: "1px solid #dee2e6",
      boxShadow: "none",
      "&:hover": { borderColor: "#86b7fe" },
    }),
    menu: (base) => ({
      ...base,
      zIndex: 9999,
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? "#f8f9fa" : "white",
      color: state.isSelected ? "#0d6efd" : "#212529",
      "&:active": { backgroundColor: "#0d6efd", color: "white" },
    }),
  };

  const nextId = useMemo(
    () => Math.max(0, ...items.map((i) => i.id)) + 1,
    [items]
  );

  const openCreate = () => {
    setEditing(null);
    setState("");
    setSelectedCountry(null);
    setStateCode("");
    setError("");
    setShowModal(true);
  };

  const openEdit = (item) => {
    console.log("item::", item);
    setEditing(item);
    setState(item.stateName);
    setSelectedCountry(item.countryId ? { value: item.countryId, label: item.country } : null);
    setStateCode(item.stateCode);
    setError("");
    setShowModal(true);
  };

  const handleEdit = async () => {
    if (!editing) return;

    try {
      setIsLoading(true);
      const editRes = await axiosInstance.put(`/api/province/${editing.id}`, {
        stateName: `${state}`,
        countryId: `${selectedCountry?.value ?? ""}`,
        stateCode: `${stateCode}`,
      });

      if (editRes.data) {
        toast.success("Province Updated Successfully!");
        // First refresh the list
        await fetchStateList(page, search);
        // Then close modal and reset state
        closeModal();
      }
    } catch (error) {
      setError("Failed to update province");
      toast.error("Failed to update province");
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

  const fetchStateList = async (pageNum = 0, searchTerm = search) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: String(PAGE_SIZE),
      });

      if (searchTerm && searchTerm.trim()) {
        params.append("search", searchTerm.trim());
      }

      const res = await axiosInstance.get(`/api/province?${params.toString()}`);

      if (res.data && Array.isArray(res.data)) {
        setItems(res.data);

        // Size the pager from the backend's real match count (X-Total-Count
        // header) — mirrors the Hotel List page's pagination. Falls back to
        // the old page-length heuristic only when the header is absent (e.g.
        // an older backend build). The previous "Math.max(...) + 2" guess
        // could only ever grow, so after narrowing a search or paging deeper
        // the pager kept offering pages the filtered set no longer had.
        const rawTotal = Number(res.headers?.["x-total-count"]);
        if (Number.isFinite(rawTotal) && rawTotal >= 0) {
          setTotalElements(rawTotal);
          setTotalPages(Math.max(1, Math.ceil(rawTotal / PAGE_SIZE)));
        } else if (res.data.length < PAGE_SIZE) {
          setTotalElements(pageNum * PAGE_SIZE + res.data.length);
          setTotalPages(pageNum + 1);
        } else {
          setTotalElements(0);
          setTotalPages(pageNum + 2);
        }

        setPage(pageNum);
      } else {
        setItems([]);
        setTotalPages(0);
        setTotalElements(0);
        setPage(0);
      }
    } catch (err) {
      toast.error("Failed to load provinces");
      setItems([]);
      setTotalPages(0);
      setTotalElements(0);
      setPage(0);
    } finally {
      setIsLoading(false);
    }
  };

  const saveState = async () => {
    try {
      setIsLoading(true);
      const statePayLoad = {
        stateName: `${state}`,
        countryId: `${selectedCountry?.value ?? ""}`,
        stateCode: `${stateCode}`,
      };
      const saveRes = await axiosInstance.post(
        "/api/province/save",
        statePayLoad
      );
      if (saveRes.data !== 0) {
        toast.success("Province added Successfully!");
        // First refresh the list
        await fetchStateList(page, search);
        // Then close modal
        closeModal();
      }
    } catch (error) {
      setError("Sorry! Data not saved to db..");
      toast.error("Failed to save province data");
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced search effect
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Set new timeout for search
    if (search !== "") {
      const timeout = setTimeout(() => {
        fetchStateList(0, search);
      }, 500); // 500ms delay
      setSearchTimeout(timeout);
    } else if (search === "") {
      // If search is cleared, fetch all data
      fetchStateList(0, "");
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
      title: `Are you sure? You want to delete ${item.stateName}`,
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
          .delete(`/api/province/${item.id}`)
          .then(() => {
            toast.success("Province deleted successfully");
            fetchStateList(page, search);
          })
          .catch(() => {
            toast.error("Sorry!!Province not deleted");
          });
      }
    });
  };

  const fetchCountryList = async (search = "") => {
    setIsLoadingCountries(true);
    try {
      const response = await axiosInstance.get(`/api/country?page=0&limit=10&search=${search}`);
      setCountryList(response.data || []);
    } catch (error) {
      console.log("error for country list :", error);
    } finally {
      setIsLoadingCountries(false);
    }
  };

  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };
  const debouncedFetchCountryList = useCallback(debounce(fetchCountryList, 500), []);

  // ── Pagination helpers — same shape as /new-booking/hotel
  //    (see src/pages/HotelSearch.jsx: effectiveTotalPages, pageNumbers,
  //    goToPage). Ellipsis-aware windowed page list: when the total is 7
  //    pages or fewer we show every number; beyond that we anchor 1 and
  //    N, drop a left/right ellipsis where a gap opens, and only render
  //    a 3-wide window around the current page. Keeps the pager compact
  //    on wide result sets. ────────────────────────────────────────────
  const effectiveTotalPages = useMemo(
    () => Math.max(1, totalPages),
    [totalPages],
  );

  const pageNumbers = useMemo(() => {
    const current = page + 1;
    const total = effectiveTotalPages;
    const nums = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) nums.push(i);
    } else {
      nums.push(1);
      const left = Math.max(2, current - 1);
      const right = Math.min(total - 1, current + 1);
      if (left > 2) nums.push("ellipsis-left");
      for (let i = left; i <= right; i++) nums.push(i);
      if (right < total - 1) nums.push("ellipsis-right");
      nums.push(total);
    }
    return nums;
  }, [page, effectiveTotalPages]);

  // Jump to a specific 0-based page. Bounds-checked so the ellipsis
  // rendering never triggers an out-of-range fetch. Mirrors the
  // HotelSearch goToPage helper but drops the smooth-scroll ref call —
  // the master list is short enough that the scroll would be jarring.
  const goToPage = (idx) => {
    if (idx < 0 || idx >= effectiveTotalPages) return;
    fetchStateList(idx, search);
  };

  useEffect(() => {
    fetchCountryList();
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
                <span className="fw-semibold"> Province / City </span>
              </span>
              {/* State Search — one text box, three columns.
                  Backend (ProvinceService.getAllProvince) matches the
                  term against Country name, Province name, and Province
                  code with a case-insensitive contains predicate. The
                  placeholder tells the operator the scope up-front so
                  they don't wonder why "India" or "KL" now returns rows
                  that "province name only" used to hide. */}
              <Form.Group className="hotel-search-bar flex-grow-1 flex-sm-grow-0">
                <Form.Control
                  type="text"
                  placeholder="Search by country, province, or province code..."
                  className="form-control-modern-sm"
                  value={searchTerm}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearchTerm(value);
                    fetchStateList(0, value); // pass value to API
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
                    <th>Country</th>
                    <th>Province</th>
                    <th>Province Code</th>
                    <th style={{ width: 160 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1 + page * PAGE_SIZE}</td>
                       <td>{item.country}</td>
                      <td>{item.stateName}</td>
                      <td>{item.stateCode}</td>
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
                        Loading available provinces...
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={3} className="text-center text-muted py-4">
                        No provinces found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>

              {/* Pagination — mirrors the /new-booking/hotel pager
                  (src/pages/HotelSearch.jsx). Renders whenever there is
                  more than one page OR the true match count exceeds one
                  page's worth. Uses the ellipsis-aware windowed page
                  list computed above so wide result sets stay compact,
                  and the `pagination-modern` class picks up the same
                  visual treatment the booking search page uses. Read
                  the totalElements from the X-Total-Count header so
                  "of M" always agrees with the current filter. */}
              {!isLoading &&
                (effectiveTotalPages > 1 || totalElements > PAGE_SIZE) && (
                  <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 p-3 border-top">
                    <small className="text-muted">
                      Showing {items.length} provinces
                      {totalElements > 0 && ` of ${totalElements}`}
                    </small>
                    <Pagination className="mb-0 pagination-modern">
                      <Pagination.Prev
                        disabled={page === 0}
                        onClick={() => goToPage(page - 1)}
                      />
                      {pageNumbers.map((n) =>
                        typeof n === "number" ? (
                          <Pagination.Item
                            key={n}
                            active={n === page + 1}
                            onClick={() => goToPage(n - 1)}
                          >
                            {n}
                          </Pagination.Item>
                        ) : (
                          <Pagination.Ellipsis key={n} disabled />
                        ),
                      )}
                      <Pagination.Next
                        disabled={page >= effectiveTotalPages - 1}
                        onClick={() => goToPage(page + 1)}
                      />
                    </Pagination>
                  </div>
                )}
            </Card.Body>
          </Card>

          <Modal show={showModal} onHide={closeModal} centered>
            <Modal.Header closeButton={!isLoading}>
              <Modal.Title>
                {editing ? "Update Province" : "Create Province"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Country</Form.Label>
                  <Select
                    options={countryList.map((country) => ({
                      value: country.id,
                      label: country.name,
                    }))}
                    value={selectedCountry}
                    onChange={(option) => setSelectedCountry(option || null)}
                    onInputChange={(val) => debouncedFetchCountryList(val)}
                    isLoading={isLoadingCountries}
                    placeholder="Search and Select Country"
                    isSearchable
                    isClearable
                    styles={customSelectStyles}
                  />
                  {error && (
                    <div className="text-danger small mt-1">
                      {error}
                    </div>
                  )}
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>State</Form.Label>
                  <Form.Control
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="Enter state name"
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
                  <Form.Label>State Code</Form.Label>
                  <Form.Control
                    value={stateCode}
                    onChange={(e) => setStateCode(e.target.value)}
                    placeholder="Enter state code"
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
                onClick={editing ? handleEdit : saveState}
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
