import React, { useEffect, useMemo, useState } from "react";
import {
  Container,
  Card,
  Table,
  Spinner,
  Form,
  InputGroup,
  Pagination,
} from "react-bootstrap";
import { FaSearch, FaInbox } from "react-icons/fa";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import toast from "react-hot-toast";

const PAGE_SIZE = 10;
// Fetch limit sent to each per-type list endpoint. Big enough to cover
// the entire dataset in this deployment while still bounded; if any one
// registration type ever grows beyond this we'll want a real server-
// side unified endpoint instead of merging client-side.
const FETCH_LIMIT = 1000;

// Every source that feeds the unified list. Each entry describes how
// to call the endpoint and how to project its DTO onto the common
// { id, type, companyName, contactPerson, city, country, mobile, email }
// row shape the table renders.
const SOURCES = [
  {
    key: "agent",
    label: "Agent",
    url: "/api/agent",
    params: { page: 0, limit: FETCH_LIMIT },
    map: (r) => ({
      id: r.id,
      type: "Agent",
      companyName: r.companyName,
      contactPerson: joinName(r.firstName, r.lastName),
      city: r.provinceName,
      country: r.countryName,
      mobile: r.mobileNumber,
      email: r.personalEmail,
    }),
  },
  {
    key: "hotel",
    label: "Hotel",
    url: "/api/hotels",
    params: { page: 0, limit: FETCH_LIMIT },
    map: (r) => {
      // Contact info on Hotel lives on a nested contactDetails[] list —
      // pick the first row (if any) as the visible contact.
      const c = Array.isArray(r.contactDetails) ? r.contactDetails[0] : null;
      return {
        id: r.hotelId ?? r.id,
        type: "Hotel",
        companyName: r.hotelName,
        contactPerson: c ? c.contactPerson : null,
        city: r.placeName || r.stateName,
        // HotelDTO carries only countryId, no countryName — leave blank
        // rather than show an id number.
        country: null,
        mobile: c ? c.mobileNumber : null,
        email: c ? c.personalEmail : null,
      };
    },
  },
  {
    key: "cabProvider",
    label: "Cab Provider",
    url: "/api/cabProvider",
    params: { page: 0, limit: FETCH_LIMIT },
    map: (r) => ({
      id: r.cabprovider,
      type: "Cab Provider",
      companyName: r.providername,
      contactPerson: r.contactperson,
      city: null,
      country: null,
      mobile: r.phonenumber,
      email: r.emailid,
    }),
  },
  {
    key: "activityProvider",
    label: "Activity Provider",
    url: "/api/activityProvider",
    params: { page: 0, limit: FETCH_LIMIT },
    map: (r) => ({
      id: r.providerId,
      type: "Activity Provider",
      companyName: r.providerName,
      contactPerson: joinName(r.firstName, r.lastName),
      city: r.cityName,
      country: r.countryName,
      mobile: r.mobileNo,
      email: r.emailId,
    }),
  },
  {
    key: "supplier",
    label: "Supplier",
    url: "/api/supplier",
    params: { page: 0, limit: FETCH_LIMIT },
    map: (r) => ({
      id: r.supplierId ?? r.id,
      type: "Supplier",
      companyName: r.name,
      contactPerson: null,
      city: null,
      country: null,
      mobile: r.phoneNumber,
      email: r.email,
    }),
  },
  {
    key: "restaurant",
    label: "Restaurant",
    // Restaurant is the one endpoint that doesn't accept page/limit —
    // it returns the entire list.
    url: "/api/restaurant/list",
    params: null,
    map: (r) => ({
      id: r.id ?? r.restaurantId,
      type: "Restaurant",
      companyName: r.restaurantName,
      contactPerson: null,
      city: r.cityName,
      country: r.countryName,
      mobile: r.contactNumber,
      email: r.email,
    }),
  },
  {
    key: "schefferDriver",
    // The backend path uses capital-S SchefferDriver (see
    // SchefferDriverController @RequestMapping("/api/SchefferDriver")).
    label: "Chauffer Driver",
    url: "/api/SchefferDriver",
    params: { page: 0, limit: FETCH_LIMIT },
    map: (r) => ({
      id: r.cabprovider,
      type: "Chauffer Driver",
      companyName: r.providername,
      contactPerson: r.contactperson,
      city: null,
      country: null,
      mobile: r.phonenumber,
      email: r.emailid,
    }),
  },
];

function joinName(first, last) {
  const parts = [first, last].filter((p) => p && String(p).trim());
  return parts.length ? parts.join(" ") : null;
}

function display(v) {
  const s = v == null ? "" : String(v).trim();
  return s ? s : "-";
}

// Admin-only unified list of every company/entity registered under the
// Registration menu — Agents, Hotels, Cab Providers, Activity Providers,
// Suppliers, Restaurants, and Chauffer Drivers. Data is fetched in
// parallel from each type's existing list endpoint, normalised into a
// common row shape, and searched/paginated entirely client-side. The
// Designation column is always "Owner" — that field isn't stored on any
// of these entities today.
export default function AllRegistrations() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      const results = await Promise.allSettled(
        SOURCES.map((s) =>
          s.params
            ? axiosInstance.get(s.url, { params: s.params })
            : axiosInstance.get(s.url),
        ),
      );
      if (cancelled) return;

      const failedLabels = [];
      const merged = [];
      results.forEach((res, i) => {
        const src = SOURCES[i];
        if (res.status === "fulfilled") {
          const data = Array.isArray(res.value?.data) ? res.value.data : [];
          data.forEach((raw, idx) => {
            const mapped = src.map(raw) || {};
            merged.push({
              // Guarantee a unique React key even if the source's own id
              // is missing/duplicated across types.
              _key: `${src.key}-${mapped.id ?? idx}`,
              ...mapped,
            });
          });
        } else {
          failedLabels.push(src.label);
        }
      });

      // Sort by company name so the list reads predictably across a
      // mixed set of types.
      merged.sort((a, b) => {
        const an = (a.companyName || "").toString().toLowerCase();
        const bn = (b.companyName || "").toString().toLowerCase();
        return an.localeCompare(bn);
      });

      setRows(merged);
      setLoading(false);
      if (failedLabels.length) {
        toast.error(
          `Some registration types failed to load: ${failedLabels.join(", ")}`,
        );
      }
    };
    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.type, r.companyName, r.contactPerson, r.city, r.country, r.mobile, r.email]
        .map((v) => (v == null ? "" : String(v).toLowerCase()))
        .some((v) => v.includes(q)),
    );
  }, [rows, search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(startIdx, startIdx + PAGE_SIZE);
  const displayStart = totalCount === 0 ? 0 : startIdx + 1;
  const displayEnd = Math.min(startIdx + PAGE_SIZE, totalCount);

  const pageWindow = useMemo(() => {
    const windowSize = 5;
    const startPage = Math.max(
      1,
      Math.min(safePage - Math.floor(windowSize / 2), totalPages - windowSize + 1),
    );
    const endPage = Math.min(totalPages, startPage + windowSize - 1);
    return Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
  }, [safePage, totalPages]);

  const goToPage = (p) => {
    if (p < 1 || p > totalPages) return;
    setCurrentPage(p);
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-3" style={{ width: "100%", overflow: "hidden" }}>
          <Container
            fluid
            style={{ maxWidth: "100%", paddingLeft: "0.5rem", paddingRight: "0.5rem" }}
          >
            <div className="d-flex justify-content-between align-items-end mb-3 flex-wrap gap-2">
              <div>
                <h3 className="fw-bold text-dark mb-2">All Registrations</h3>
                <InputGroup style={{ height: "40px", width: "360px" }}>
                  <InputGroup.Text
                    style={{
                      backgroundColor: "#f8f9fa",
                      borderRight: "none",
                      borderColor: "#dee2e6",
                    }}
                  >
                    <FaSearch style={{ color: "#6c757d" }} />
                  </InputGroup.Text>
                  <Form.Control
                    type="text"
                    placeholder="Search by type, company, city, mobile, email…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                      borderLeft: "none",
                      fontSize: "0.85rem",
                      borderColor: "#dee2e6",
                      height: "40px",
                    }}
                  />
                </InputGroup>
              </div>
              {/* <button
                type="button"
                className="btn d-inline-flex align-items-center gap-2"
                onClick={() => setRefreshTick((t) => t + 1)}
                disabled={loading}
                style={{
                  border: "1.5px solid #c0392b",
                  color: "#c0392b",
                  background: "#fff",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  borderRadius: "8px",
                  height: "40px",
                }}
              >
                <FaSync /> Refresh
              </button> */}
            </div>

            <Card className="border mb-3 shadow-sm" style={{ borderRadius: "6px" }}>
              <Card.Header
                className="d-flex justify-content-between align-items-center text-dark border-bottom py-2"
                style={{ 
                  borderRadius: "6px 6px 0 0",
                  backgroundColor: "#f8f9fa",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                }}
              >
                <span>Registered Entities</span>
                <span className="text-muted" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                  {loading ? "Loading…" : `${totalCount} total`}
                </span>
              </Card.Header>
              <Card.Body style={{ padding: "1.5rem 1rem 1rem" }}>
                {loading ? (
                  <div className="text-center py-5">
                    <Spinner animation="border" variant="primary" />
                    <p className="mt-3 text-muted">Loading registrations…</p>
                  </div>
                ) : pageRows.length === 0 ? (
                  <div className="text-center py-5 text-muted">
                    <FaInbox className="display-4 mb-3" style={{ opacity: 0.4 }} />
                    <h6 className="fw-semibold">No registrations found</h6>
                    <p className="mb-0 small">
                      {search
                        ? "No entries match your search."
                        : "No agents, hotels or providers registered yet."}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="table-responsive saas-table-wrap">
                      <Table hover className="mb-0 align-middle saas-table">
                        <thead>
                          <tr>
                            <th style={{ width: "48px" }}>#</th>
                            <th>Type</th>
                            <th>Agency Name</th>
                            <th>Contact Person</th>
                            <th>Designation</th>
                            <th>City</th>
                            <th>Country</th>
                            <th>Mobile</th>
                            <th>Email Address</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pageRows.map((r, idx) => (
                            <tr key={r._key}>
                              <td className="text-muted">{displayStart + idx}</td>
                              <td>
                                <span
                                  className="d-inline-block px-2 py-1 rounded"
                                  style={{
                                    backgroundColor: "#eff6ff",
                                    color: "#1d4ed8",
                                    fontSize: "0.7rem",
                                    fontWeight: 600,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {r.type}
                                </span>
                              </td>
                              <td className="fw-semibold text-dark">{display(r.companyName)}</td>
                              <td>{display(r.contactPerson)}</td>
                              <td>Owner</td>
                              <td>{display(r.city)}</td>
                              <td>{display(r.country)}</td>
                              <td>{display(r.mobile)}</td>
                              <td>{display(r.email)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>

                    <style>{`
                      .saas-table-wrap { border: 1px solid #eaecf0; border-radius: 8px; overflow-x: auto; }
                      .saas-table { font-size: 0.8rem; margin-bottom: 0; }
                      .saas-table thead th {
                        background-color: #f9fafb;
                        color: #667085;
                        font-size: 0.68rem;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.04em;
                        border-bottom: 1px solid #eaecf0;
                        border-top: none;
                        padding: 0.65rem 0.75rem;
                        white-space: nowrap;
                      }
                      .saas-table tbody td {
                        padding: 0.65rem 0.75rem;
                        border-top: 1px solid #f2f4f7;
                        vertical-align: middle;
                        color: #344054;
                      }
                      .saas-table tbody tr:first-child td { border-top: none; }
                      .saas-table tbody tr:hover { background-color: #fafbfc; }
                    `}</style>

                    <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mt-3">
                      <div className="text-muted" style={{ fontSize: "0.875rem" }}>
                        Showing <span className="fw-semibold text-dark">{displayStart}</span> to{" "}
                        <span className="fw-semibold text-dark">{displayEnd}</span> of{" "}
                        <span className="fw-semibold text-dark">{totalCount}</span> entries
                      </div>
                      <Pagination className="mb-0">
                        <Pagination.Prev
                          disabled={safePage === 1}
                          onClick={() => goToPage(safePage - 1)}
                          style={{
                            cursor: safePage === 1 ? "not-allowed" : "pointer",
                            opacity: safePage === 1 ? 0.5 : 1,
                          }}
                        />
                        {pageWindow.map((pageNumber) => (
                          <Pagination.Item
                            key={pageNumber}
                            active={safePage === pageNumber}
                            onClick={() => goToPage(pageNumber)}
                            style={{ cursor: "pointer", minWidth: "38px", textAlign: "center" }}
                          >
                            {pageNumber}
                          </Pagination.Item>
                        ))}
                        <Pagination.Next
                          disabled={safePage === totalPages}
                          onClick={() => goToPage(safePage + 1)}
                          style={{
                            cursor: safePage === totalPages ? "not-allowed" : "pointer",
                            opacity: safePage === totalPages ? 0.5 : 1,
                          }}
                        />
                      </Pagination>
                    </div>
                  </>
                )}
              </Card.Body>
            </Card>
          </Container>
        </main>
      </div>
    </div>
  );
}
