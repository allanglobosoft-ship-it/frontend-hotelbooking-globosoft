import React, { useEffect, useRef, useState } from "react";
import {
  Card,
  Button,
  Row,
  Col,
  Container,
  Badge,
  Spinner,
  Alert,
  Form,
  Pagination,
  Modal,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import {
  FaPlus,
  FaHotel,
  FaMapMarkerAlt,
  FaStar,
  FaEye,
  FaEdit,
  FaTrash,
  FaSearch,
  FaExclamationTriangle,
  FaArrowLeft,
} from "react-icons/fa";
import "../../styles/HotelList.css";
import DashboardRedirections from "../../components/DashboardRedirections";

// Same 300ms debounce shape used by DestinationCity.jsx. Local copy keeps
// this page self-contained — no new shared util, no risk of touching other
// callers of any existing helper.
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

const HotelList = () => {
  const [filteredHotels, setFilteredHotels] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [hotelToDelete, setHotelToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Country / City (state) filters. countryId/cityId hold the APPLIED
  // filter values (empty string = no filter). selectedCountry/selectedCity
  // carry the display objects so the input can show a chosen label without
  // a second lookup. The *SearchTerm / is*Open pieces drive the searchable
  // dropdown UI — typing there refetches the endpoint with search=<text>,
  // matching how DestinationCity.jsx works.
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [countryId, setCountryId] = useState("");
  const [cityId, setCityId] = useState("");
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [countrySearchTerm, setCountrySearchTerm] = useState("");
  const [citySearchTerm, setCitySearchTerm] = useState("");
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [isCityOpen, setIsCityOpen] = useState(false);
  const [isLoadingCountries, setIsLoadingCountries] = useState(false);
  const [isLoadingCities, setIsLoadingCities] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [pageSize] = useState(20);
  const [totalElements, setTotalElements] = useState(0);

  const navigate = useNavigate();

  // Load hotels from API with pagination + optional Country/City filters.
  // Positional defaults keep prior call sites (which only pass page or
  // page+search) working — the extra params are opt-in.
  const loadHotels = async (
    page = 0,
    search = searchTerm,
    country = countryId,
    city = cityId,
  ) => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
      });

      if (search.trim()) {
        params.append("search", search.trim());
      }
      if (country) {
        params.append("countryId", country);
      }
      if (city) {
        params.append("stateId", city);
      }

      const response = await axiosInstance.get(
        `/api/hotels?${params.toString()}`,
        {
          timeout: 0,
        },
      );

      console.log("Hotels response:", response.data);

      // Handle both array response and paginated object response
      if (Array.isArray(response.data)) {
        setFilteredHotels(response.data);
        // Fallback pagination logic if backend doesn't provide totalElements
        if (response.data.length < pageSize) {
          setTotalPages(page + 1);
        } else {
          setTotalPages(Math.max(totalPages, page + 2));
        }
      } else if (response.data && response.data.content) {
        setFilteredHotels(response.data.content);
        setTotalPages(response.data.totalPages || 0);
        setTotalElements(response.data.totalElements || 0);
      }

      setCurrentPage(page);
      setError(null);
    } catch (error) {
      console.error("Error loading hotels:", error);
      setError("Failed to load hotels");
      toast.error("Failed to load hotels");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle search input change
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    // Reset to first page on search
    loadHotels(0, value, countryId, cityId);
  };

  // Country fetch — server-side search. Called on focus (empty term for the
  // initial page) and on typing (via the debounced ref below). The search
  // string is passed straight through to the endpoint's `search` param, so
  // typing "Ind" hits /api/country?search=Ind and the backend returns the
  // narrowed set — that's the piece that was missing before.
  const loadCountries = async (search = "") => {
    setIsLoadingCountries(true);
    try {
      const res = await axiosInstance.get(
        `/api/country?page=0&limit=20&search=${encodeURIComponent(search)}`,
      );
      const list = Array.isArray(res.data) ? res.data : [];
      setCountries(list.filter((c) => !c.isDeleted));
    } catch (err) {
      console.error("Failed to load countries", err);
      setCountries([]);
    } finally {
      setIsLoadingCountries(false);
    }
  };

  // Debounced by 300ms so we don't spam the endpoint on every keystroke.
  // Kept in a ref so the same debounced instance survives re-renders.
  const debouncedCountrySearch = useRef(
    debounce((text) => loadCountries(text), 300),
  ).current;

  const handleCountryInput = (text) => {
    setCountrySearchTerm(text);
    if (!isCountryOpen) setIsCountryOpen(true);
    debouncedCountrySearch(text);
  };

  // "All Countries" row is a special sentinel — id="" clears the applied
  // filter (and the dependent city).
  const selectCountry = (country) => {
    const id = country ? String(country.id) : "";
    setSelectedCountry(country);
    setCountryId(id);
    // Changing country invalidates any prior city selection.
    setSelectedCity(null);
    setCityId("");
    setCities([]);
    setCitySearchTerm("");
    setIsCountryOpen(false);
    setCountrySearchTerm("");
    loadHotels(0, searchTerm, id, "");
  };

  // City fetch — same server-search pattern, scoped to the currently-selected
  // country. Guarded by a `runId` so a slow response for an older country
  // can't overwrite the current list.
  const cityFetchIdRef = useRef(0);
  const loadCities = async (forCountryId, search = "") => {
    if (!forCountryId) {
      setCities([]);
      return;
    }
    const myId = ++cityFetchIdRef.current;
    setIsLoadingCities(true);
    try {
      const res = await axiosInstance.get(
        `/api/province/countryId?countryId=${forCountryId}&page=0&limit=50&search=${encodeURIComponent(search)}`,
      );
      if (myId !== cityFetchIdRef.current) return;
      const list = Array.isArray(res.data) ? res.data : [];
      setCities(list);
    } catch (err) {
      if (myId !== cityFetchIdRef.current) return;
      console.error("Failed to load cities", err);
      setCities([]);
    } finally {
      if (myId === cityFetchIdRef.current) setIsLoadingCities(false);
    }
  };

  const debouncedCitySearch = useRef(
    debounce((countryIdArg, text) => loadCities(countryIdArg, text), 300),
  ).current;

  const handleCityInput = (text) => {
    setCitySearchTerm(text);
    if (!isCityOpen) setIsCityOpen(true);
    debouncedCitySearch(countryId, text);
  };

  const selectCity = (city) => {
    const id = city ? String(city.id) : "";
    setSelectedCity(city);
    setCityId(id);
    setIsCityOpen(false);
    setCitySearchTerm("");
    loadHotels(0, searchTerm, countryId, id);
  };

  // Load hotels on component mount + prime the country dropdown.
  useEffect(() => {
    loadHotels();
    loadCountries("");
  }, []);

  // Handle create new hotel
  const handleCreateHotel = () => {
    navigate("/registration/hotel/create");
  };

  // Handle view hotel details
  const handleViewHotel = (hotelId) => {
    navigate(`/hotel-details/${hotelId}`);
  };

  // Handle edit hotel
  const handleEditHotel = (hotelId) => {
    navigate(`/registration/hotel/create/${hotelId}`);
  };

  // Trigger delete confirmation modal
  const confirmDelete = (hotel) => {
    setHotelToDelete(hotel);
    setShowDeleteModal(true);
  };

  // Handle delete hotel
  const handleDeleteHotel = async () => {
    if (!hotelToDelete) return;

    try {
      setIsDeleting(true);
      const response = await axiosInstance.delete(`/api/hotels/${hotelToDelete.id}`);

      console.log("Hotel deleted:", response.data);

      // ✅ Show success toast (use backend message)
      toast.success(response.data || "Hotel deleted successfully");

      // ✅ Remove deleted hotel from UI instantly
      setFilteredHotels((prevHotels) =>
        prevHotels.filter((hotel) => hotel.id !== hotelToDelete.id),
      );

      // ✅ Optional: update totalElements (if pagination used)
      setTotalElements((prev) => prev - 1);
      setShowDeleteModal(false);
      setHotelToDelete(null);
    } catch (error) {
      console.error("Error while deleting hotel:", error);
      const backendMsg =
        error?.response?.data && typeof error.response.data === "string"
          ? error.response.data
          : error?.response?.data?.message;
      toast.error(backendMsg || "Failed to delete hotel");
    } finally {
      setIsDeleting(false);
    }
  };

  // Get star rating display
  const getStarRating = (hotelCategoryId) => {
    // This would typically come from your hotel categories API
    // For now, showing a placeholder
    return "⭐⭐⭐⭐⭐";
  };

  return (
    <div
      className="min-vh-100 bg-gradient-light d-flex flex-column"
      style={{
        background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
      }}
    >
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Container fluid>
            {/* Back to the signed-in user's dashboard — top-left, above the page header */}
            <div className="mb-3">
              <Button
                variant="outline-secondary"
                onClick={() => DashboardRedirections((localStorage.getItem("currentActiveRole") || "").trim().toUpperCase(), navigate)}
                className="d-inline-flex align-items-center gap-2 rounded-pill px-3 py-2"
              >
                <FaArrowLeft />
                Back
              </Button>
            </div>

            {/* Header Section */}
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div>
                <h2 className="text-primary mb-1">
                  <FaHotel className="me-2" />
                  Hotel Management
                </h2>
                <p className="text-muted mb-0">
                  Manage your hotel listings and details
                </p>
              </div>
              <div className="d-flex gap-2">
                <Button
                  variant="success"
                  onClick={handleCreateHotel}
                  className="d-flex align-items-center gap-2 px-4 py-2 rounded-pill shadow"
                >
                  <FaPlus />
                  Create New Hotel
                </Button>
              </div>
            </div>

            {/* Content Section */}
            <Card className="shadow-lg border-0 rounded-4">
              <Card.Header className="bg-gradient-primary text-white border-0 rounded-top-4">
                <div className="d-flex align-items-center justify-content-between">
                  {/* LEFT: Title */}
                  <h4 className="mb-0 d-flex align-items-center">
                    <FaHotel className="me-2" />
                    Hotel List
                  </h4>

                  {/* RIGHT: Search + Badge */}
                  <div className="d-flex align-items-center gap-3">
                    {/* <Badge bg="light" text="dark" className="fs-6 px-3 py-2">
        {filteredHotels.length} Hotel{filteredHotels.length !== 1 ? "s" : ""}
        {searchTerm && (
          <span className="ms-2 text-muted">
            (filtered from {hotels.length})
          </span>
        )}
      </Badge> */}

                    <div className="search-wrapper">
                      <i className="bi bi-search search-icon"></i>
                      <input
                        type="text"
                        placeholder="Search hotel names..."
                        value={searchTerm}
                        onChange={handleSearchChange}
                        className="modern-search-input"
                      />
                    </div>
                  </div>
                </div>
              </Card.Header>
              <Card.Body className="p-4">
                {/* Country / City filter row. Searchable dropdowns — typing
                    debounces a fetch that passes the text through as the
                    endpoint's `search` param, so the backend narrows the list
                    instead of us receiving the full page and dropping the
                    filter. City is disabled until Country is chosen because
                    /api/province/countryId requires it. Selecting the "All ..."
                    sentinel row clears the filter (empty id). */}
                <Row className="g-3 mb-4">
                  <Col md={4}>
                    <Form.Label className="small text-muted mb-1">
                      Country
                    </Form.Label>
                    <div className="position-relative">
                      <Form.Control
                        size="sm"
                        value={
                          isCountryOpen
                            ? countrySearchTerm
                            : selectedCountry?.name || ""
                        }
                        onChange={(e) => handleCountryInput(e.target.value)}
                        onFocus={() => {
                          setIsCountryOpen(true);
                          if (countries.length === 0) loadCountries("");
                        }}
                        placeholder="All Countries"
                        autoComplete="off"
                        className="rounded-pill"
                      />
                      {isCountryOpen && (
                        <>
                          <div
                            className="position-absolute w-100 bg-white border shadow-lg"
                            style={{
                              zIndex: 1050,
                              maxHeight: "220px",
                              overflowY: "auto",
                              top: "100%",
                            }}
                          >
                            <div
                              className="px-3 py-2 text-muted small"
                              style={{ cursor: "pointer" }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.backgroundColor =
                                  "#f8f9fa")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.backgroundColor =
                                  "white")
                              }
                              onClick={() => selectCountry(null)}
                            >
                              All Countries
                            </div>
                            {isLoadingCountries ? (
                              <div className="px-3 py-2 text-muted">
                                Loading...
                              </div>
                            ) : countries.length > 0 ? (
                              countries.map((c) => (
                                <div
                                  key={c.id}
                                  className="px-3 py-2"
                                  style={{ cursor: "pointer" }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.backgroundColor =
                                      "#f8f9fa")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.backgroundColor =
                                      "white")
                                  }
                                  onClick={() => selectCountry(c)}
                                >
                                  {c.name}
                                </div>
                              ))
                            ) : (
                              <div className="px-3 py-2 text-muted">
                                No countries found
                              </div>
                            )}
                          </div>
                          <div
                            className="position-fixed"
                            style={{
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              zIndex: 1040,
                            }}
                            onClick={() => {
                              setIsCountryOpen(false);
                              setCountrySearchTerm("");
                            }}
                          />
                        </>
                      )}
                    </div>
                  </Col>
                  <Col md={4}>
                    <Form.Label className="small text-muted mb-1">
                      City
                    </Form.Label>
                    <div className="position-relative">
                      <Form.Control
                        size="sm"
                        value={
                          isCityOpen
                            ? citySearchTerm
                            : selectedCity?.stateName ||
                              selectedCity?.name ||
                              ""
                        }
                        onChange={(e) => handleCityInput(e.target.value)}
                        onFocus={() => {
                          if (!countryId) return;
                          setIsCityOpen(true);
                          if (cities.length === 0) loadCities(countryId, "");
                        }}
                        placeholder={
                          !countryId
                            ? "Select a country first"
                            : "All Cities"
                        }
                        disabled={!countryId}
                        autoComplete="off"
                        className="rounded-pill"
                      />
                      {isCityOpen && (
                        <>
                          <div
                            className="position-absolute w-100 bg-white border shadow-lg"
                            style={{
                              zIndex: 1050,
                              maxHeight: "220px",
                              overflowY: "auto",
                              top: "100%",
                            }}
                          >
                            <div
                              className="px-3 py-2 text-muted small"
                              style={{ cursor: "pointer" }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.backgroundColor =
                                  "#f8f9fa")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.backgroundColor =
                                  "white")
                              }
                              onClick={() => selectCity(null)}
                            >
                              All Cities
                            </div>
                            {isLoadingCities ? (
                              <div className="px-3 py-2 text-muted">
                                Loading...
                              </div>
                            ) : cities.length > 0 ? (
                              cities.map((s) => (
                                <div
                                  key={s.id}
                                  className="px-3 py-2"
                                  style={{ cursor: "pointer" }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.backgroundColor =
                                      "#f8f9fa")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.backgroundColor =
                                      "white")
                                  }
                                  onClick={() => selectCity(s)}
                                >
                                  {s.stateName || s.name}
                                </div>
                              ))
                            ) : (
                              <div className="px-3 py-2 text-muted">
                                No cities found
                              </div>
                            )}
                          </div>
                          <div
                            className="position-fixed"
                            style={{
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              zIndex: 1040,
                            }}
                            onClick={() => {
                              setIsCityOpen(false);
                              setCitySearchTerm("");
                            }}
                          />
                        </>
                      )}
                    </div>
                  </Col>
                </Row>

                {isLoading ? (
                  <div className="text-center py-5">
                    <Spinner animation="border" variant="primary" size="lg" />
                    <p className="mt-3 text-muted">Loading hotels...</p>
                  </div>
                ) : error ? (
                  <Alert variant="danger" className="text-center">
                    <FaHotel className="me-2" />
                    {error}
                    <Button
                      variant="outline-danger"
                      className="ms-3"
                      onClick={loadHotels}
                    >
                      Retry
                    </Button>
                  </Alert>
                ) : filteredHotels.length === 0 ? (
                  <div className="text-center py-5">
                    <FaHotel size={64} className="mb-3 text-muted opacity-50" />
                    <h5 className="mb-2 text-muted">No Hotels Found</h5>
                    <p className="text-muted mb-4">
                      {searchTerm || countryId || cityId
                        ? "No hotels match the current filters. Try adjusting Hotel Name, Country, or City."
                        : "Start by creating your first hotel."}
                    </p>
                    {searchTerm || countryId || cityId ? (
                      <Button
                        variant="outline-primary"
                        onClick={() => {
                          setSearchTerm("");
                          setCountryId("");
                          setCityId("");
                          setSelectedCountry(null);
                          setSelectedCity(null);
                          setCitySearchTerm("");
                          setCountrySearchTerm("");
                          setCities([]);
                          loadHotels(0, "", "", "");
                        }}
                        className="d-flex align-items-center gap-2 mx-auto px-4 py-2 rounded-pill"
                      >
                        <FaSearch />
                        Clear Filters
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        onClick={handleCreateHotel}
                        className="d-flex align-items-center gap-2 mx-auto px-4 py-2 rounded-pill"
                      >
                        <FaPlus />
                        Create First Hotel
                      </Button>
                    )}
                  </div>
                ) : (
                  <Row>
                    {filteredHotels.map((hotel) => (
                      <Col key={hotel.id} lg={4} md={6} className="mb-4">
                        <Card
                          className="h-100 shadow-sm border-0 rounded-4 hotel-card"
                          style={{ cursor: "pointer" }}
                          onClick={() => handleViewHotel(hotel.id)}
                        >
                          <div className="position-relative">
                            <Card.Img
                              variant="top"
                              src={
                                hotel.image360 || "/images/not-available.jpg"
                              }
                              alt={hotel.hotelName}
                              style={{
                                height: "170px",
                                objectFit: "cover",
                                borderRadius: "1rem 1rem 0 0",
                              }}
                              onError={(e) => {
                                e.target.src = "/images/not-available.jpg";
                              }}
                            />
                            <div className="position-absolute top-0 end-0 m-3">
                              <Badge bg="success" className="px-3 py-2">
                                {getStarRating(hotel.hotelCategoryId)}
                              </Badge>
                            </div>
                          </div>

                          <Card.Body className="d-flex flex-column">
                            <div className="mb-0">
                              <h5 className="card-title text-primary mb-2">
                                <FaHotel className="me-2" />
                                {hotel.hotelName}
                              </h5>
                              <p className="text-muted small mb-2">
                                <FaMapMarkerAlt className="me-1" />
                                {hotel.address}
                              </p>
                              <p className="text-muted small mb-0">
                                ZIP: {hotel.zipcode}
                              </p>
                            </div>

                            <div className="mt-1">
                              <div className="d-flex gap-2">
                                <Button
                                  variant="outline-primary"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewHotel(hotel.id);
                                  }}
                                  className="flex-fill rounded-pill"
                                >
                                  <FaEye className="me-1" />
                                  View Rates
                                </Button>
                                <Button
                                  variant="outline-warning"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditHotel(hotel.id);
                                  }}
                                  className="flex-fill rounded-pill"
                                >
                                  <FaEdit className="me-1" />
                                  Edit
                                </Button>
                                <Button
                                  variant="outline-danger"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    confirmDelete(hotel);
                                  }}
                                  className="flex-fill rounded-pill"
                                >
                                  <FaTrash className="me-1" />
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                )}

                {/* Pagination Controls */}
                {!isLoading &&
                  !error &&
                  (totalPages > 1 || totalElements > pageSize) && (
                    <div className="d-flex justify-content-between align-items-center mt-4 pt-3 border-top">
                      <div className="text-muted small">
                        Showing {filteredHotels.length} hotels
                        {totalElements > 0 && ` of ${totalElements}`}
                      </div>
                      <Pagination className="mb-0 custom-pagination">
                        <Pagination.Prev
                          disabled={currentPage === 0}
                          onClick={() => loadHotels(currentPage - 1)}
                        />
                        {[...Array(totalPages).keys()].map((num) => (
                          <Pagination.Item
                            key={num}
                            active={num === currentPage}
                            onClick={() => loadHotels(num)}
                          >
                            {num + 1}
                          </Pagination.Item>
                        ))}
                        <Pagination.Next
                          disabled={currentPage >= totalPages - 1}
                          onClick={() => loadHotels(currentPage + 1)}
                        />
                      </Pagination>
                    </div>
                  )}
              </Card.Body>
            </Card>
          </Container>
        </main>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        show={showDeleteModal}
        onHide={() => !isDeleting && setShowDeleteModal(false)}
        centered
      >
        <Modal.Header closeButton closeVariant="white" className="border-0">
          <Modal.Title className="text-white h5 fw-bold d-flex align-items-center">
            <FaExclamationTriangle className="me-2" /> Confirm Deletion
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-2">
          <p className="mb-2">
            Are you sure you want to delete
            {hotelToDelete?.name ? (
              <> the hotel <strong>"{hotelToDelete.name}"</strong>?</>
            ) : (
              <> this hotel?</>
            )}
          </p>
          <p className="text-muted small mb-0">
            This action cannot be undone. All associated data will be permanently removed.
          </p>
        </Modal.Body>
        <Modal.Footer className="border-0">
          <Button
            variant="light"
            onClick={() => setShowDeleteModal(false)}
            disabled={isDeleting}
            className="rounded-pill px-4"
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteHotel}
            disabled={isDeleting}
            className="rounded-pill px-4"
          >
            {isDeleting ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Deleting...
              </>
            ) : (
              <>
                <FaTrash className="me-2" />
                Delete
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default HotelList;
