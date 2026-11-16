import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Container,
  Card,
  Row,
  Col,
  Form,
  Table,
  Badge,
  Button,
  Spinner,
} from "react-bootstrap";
import {
  FaHotel,
  FaCar,
  FaUmbrellaBeach,
  FaUser,
  FaCheckCircle,
  FaArrowLeft,
} from "react-icons/fa";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import Sidebar from "../../../components/Sidebar";
import TopBar from "../../../components/TopBar";
import axiosInstance from "../../../components/AxiosInstance";
import { escapeHtml } from "../../../utils/safeHtml";

/**
 * v3 Booking confirmation page. The hotel / transfer / activity lines
 * the operator picked on /results are read-only. The only thing this
 * page collects is the passenger manifest + the Tourism Dirham input.
 *
 * On Confirm, builds the v2 save payload shape (the same one used by
 * MakePkgBookingPageV2 so it lands in the existing mypkg_v2_* tables)
 * and POSTs /api/makeYourOwnPackageV2/booking/save.
 */

const fmtMoney = (n) => `AED ${Number(n || 0).toLocaleString()}`;
const hotelLabel = (h) => h.hotelName || h.name || `Hotel #${h.hotelId}`;
const hotelRate = (h) => Number(h.totalRate || h.baseRate || h.rate || 0);
const cabLabel = (c) => c.cabName || c.cabname || `Cab #${c.cabid || c.cabId}`;
const cabRate = (c) =>
  Number(c.totalRate || c.totalrate || c.privateTotal || c.sicRate || 0);
const actLabel = (a) =>
  a.activityName || a.activityname || a.name || `Activity #${a.activityId}`;
const actRate = (a) => Number(a.totalRate || a.rate || 0);

const MakePkgV3BookingPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const criteria = location.state?.criteria || {};
  const selected = location.state?.selected || {
    hotels: [],
    transfers: [],
    activities: [],
  };
  const addOns = location.state?.addOns || criteria.addOns || {};

  // Pax counts (used to seed guest forms)
  const adults = Number(criteria.rooms?.[0]?.adultCount || 1);
  const childCount = Number(criteria.rooms?.[0]?.childCount || 0);
  const childAges = criteria.rooms?.[0]?.childAges || [];

  // ── customer ──────────────────────────────────────────────────────
  const [customer, setCustomer] = useState({
    salutation: "Mr",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    passport: "",
    nationality: criteria.nationalityCode || "",
  });

  // ── guests (one row per pax) ──────────────────────────────────────
  const initialGuests = () => {
    const rows = [];
    for (let i = 0; i < adults; i++)
      rows.push({
        salutation: "Mr",
        firstName: "",
        lastName: "",
        gender: "Male",
        isChild: false,
        age: "",
        passportNo: "",
        guestIndex: rows.length + 1,
      });
    for (let i = 0; i < childCount; i++)
      rows.push({
        salutation: "",
        firstName: "",
        lastName: "",
        gender: "",
        isChild: true,
        age: Number(childAges[i] || 0),
        passportNo: "",
        guestIndex: rows.length + 1,
      });
    return rows;
  };
  const [guests, setGuests] = useState(initialGuests);

  const updateGuest = (i, field, value) =>
    setGuests((p) => p.map((g, idx) => (idx === i ? { ...g, [field]: value } : g)));

  const [tourismDirham, setTourismDirham] = useState("");
  const [paymentMode, setPaymentMode] = useState("Online");
  const [submitting, setSubmitting] = useState(false);

  // ── totals ────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const hotelSum = selected.hotels.reduce(
      (s, x) => s + hotelRate(x.payload),
      0
    );
    const transferSum = selected.transfers.reduce(
      (s, x) => s + cabRate(x.payload),
      0
    );
    const activitySum = selected.activities.reduce(
      (s, x) => s + actRate(x.payload),
      0
    );
    const td = Number(tourismDirham) || 0;
    const sub = hotelSum + transferSum + activitySum;
    return {
      hotelSum,
      transferSum,
      activitySum,
      subTotal: sub,
      tourismDirham: td,
      grand: sub + td,
    };
  }, [selected, tourismDirham]);

  useEffect(() => {
    if (
      selected.hotels.length === 0 &&
      selected.transfers.length === 0 &&
      selected.activities.length === 0
    ) {
      toast.error("No selection found — go back to results.");
      const t = setTimeout(
        () => navigate("/new-booking/make-your-own-package-v3"),
        700
      );
      return () => clearTimeout(t);
    }
  }, [selected, navigate]);

  // ── submit ────────────────────────────────────────────────────────
  const validate = () => {
    if (!customer.firstName) return "Customer first name is required";
    if (!customer.phone) return "Customer phone is required";
    if (!customer.email) return "Customer email is required";
    return null;
  };

  const buildAddOnsMap = () => {
    const out = {};
    if (addOns.visa === "YES")
      out.visa = { enabled: true, required: "YES" };
    if (addOns.insurance === "YES")
      out.insurance = { enabled: true, required: "YES" };
    if (addOns.meetGreet === "YES")
      out.meetGreet = { enabled: true, required: "YES" };
    if (addOns.simForex === "YES")
      out.simForex = { enabled: true, required: "YES" };
    return out;
  };

  const submit = async () => {
    const err = validate();
    if (err) return toast.error(err);

    const payload = {
      agentId: criteria.agentId || null,
      agentName: null,
      userId: criteria.agentId || null,
      salutation: customer.salutation,
      customerFirstName: customer.firstName,
      customerLastName: customer.lastName,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      customerPassport: customer.passport,
      customerNationality: customer.nationality,
      sellingPrice: String(totals.grand.toFixed(2)),
      totalPrice: String(totals.grand.toFixed(2)),
      tourismDirham: totals.tourismDirham > 0 ? totals.tourismDirham : null,
      paymentMode,
      visaRequired: addOns.visa === "YES" ? "YES" : "NO",
      serviceFlags: criteria.modules || {
        hotel: true,
        transfer: false,
        activity: false,
      },
      addOnServices: buildAddOnsMap(),
      hotels: selected.hotels.map((x) => x.payload),
      cabs: selected.transfers.map((x) => x.payload),
      activities: selected.activities.map((x) => x.payload),
      guests,
    };

    setSubmitting(true);
    try {
      const res = await axiosInstance.post(
        "/api/makeYourOwnPackageV2/booking/save",
        payload
      );
      if (res.data?.status === "SUCCESS") {
        sessionStorage.removeItem("makePkgV3Criteria");
        sessionStorage.removeItem("makePkgV3Results");
        sessionStorage.removeItem("makePkgFlow");
        await Swal.fire({
          icon: "success",
          title: "Booking Confirmed!",
          html: `<div>Your booking id is <strong>${escapeHtml(res.data.id)}</strong></div>`,
          confirmButtonText: "View Bookings",
        });
        navigate("/booking-details/make-your-own-package-v2-list");
      } else {
        toast.error(res.data?.message || "Failed to save booking");
      }
    } catch (e) {
      console.error("v3 booking save error", e);
      toast.error(e?.response?.data?.message || "Failed to save booking");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-3" style={{ width: "100%" }}>
          <Container fluid className="px-0">
            <Card className="shadow-sm border-0 mb-3" style={{ borderRadius: 8 }}>
              <Card.Body className="d-flex justify-content-between align-items-center">
                <div>
                  <h3 className="fw-bold mb-0">
                    Confirm Booking <Badge bg="info" className="align-middle ms-2">v3</Badge>
                  </h3>
                  <small className="text-muted">
                    Review your selections and capture the guest manifest.
                  </small>
                </div>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => navigate(-1)}
                >
                  <FaArrowLeft className="me-1" /> Back to results
                </Button>
              </Card.Body>
            </Card>

            <Row className="g-3">
              <Col lg={8}>
                {/* Selection Summary */}
                <Card
                  className="shadow-sm border-0 mb-3"
                  style={{ borderRadius: 8 }}
                >
                  <Card.Header className="bg-white fw-bold">
                    Selection Summary
                  </Card.Header>
                  <Card.Body>
                    {selected.hotels.length > 0 && (
                      <>
                        <h6 className="fw-bold text-primary">
                          <FaHotel className="me-2" />
                          Hotels ({selected.hotels.length})
                        </h6>
                        <Table size="sm" bordered className="mb-3">
                          <thead className="table-light">
                            <tr>
                              <th>#</th>
                              <th>Hotel</th>
                              <th>Destination</th>
                              <th className="text-end">Rate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selected.hotels.map((x, i) => (
                              <tr key={x.key}>
                                <td>{i + 1}</td>
                                <td>{hotelLabel(x.payload)}</td>
                                <td>{x.leg?.cityName || "—"}</td>
                                <td className="text-end">
                                  {fmtMoney(hotelRate(x.payload))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </>
                    )}
                    {selected.transfers.length > 0 && (
                      <>
                        <h6 className="fw-bold text-info">
                          <FaCar className="me-2" />
                          Transfers ({selected.transfers.length})
                        </h6>
                        <Table size="sm" bordered className="mb-3">
                          <thead className="table-light">
                            <tr>
                              <th>#</th>
                              <th>Cab</th>
                              <th className="text-end">Rate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selected.transfers.map((x, i) => (
                              <tr key={x.key}>
                                <td>{i + 1}</td>
                                <td>{cabLabel(x.payload)}</td>
                                <td className="text-end">
                                  {fmtMoney(cabRate(x.payload))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </>
                    )}
                    {selected.activities.length > 0 && (
                      <>
                        <h6 className="fw-bold text-warning">
                          <FaUmbrellaBeach className="me-2" />
                          Activities ({selected.activities.length})
                        </h6>
                        <Table size="sm" bordered className="mb-0">
                          <thead className="table-light">
                            <tr>
                              <th>#</th>
                              <th>Activity</th>
                              <th className="text-end">Rate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selected.activities.map((x, i) => (
                              <tr key={x.key}>
                                <td>{i + 1}</td>
                                <td>{actLabel(x.payload)}</td>
                                <td className="text-end">
                                  {fmtMoney(actRate(x.payload))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </>
                    )}
                  </Card.Body>
                </Card>

                {/* Customer */}
                <Card
                  className="shadow-sm border-0 mb-3"
                  style={{ borderRadius: 8 }}
                >
                  <Card.Header className="bg-white fw-bold">
                    <FaUser className="me-2 text-primary" /> Customer
                  </Card.Header>
                  <Card.Body>
                    <Row className="g-2">
                      <Col md={1}>
                        <Form.Label className="small">Salutation</Form.Label>
                        <Form.Select
                          value={customer.salutation}
                          onChange={(e) =>
                            setCustomer((p) => ({ ...p, salutation: e.target.value }))
                          }
                        >
                          {["Mr", "Mrs", "Ms", "Dr"].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </Form.Select>
                      </Col>
                      <Col md={3}>
                        <Form.Label className="small">
                          First Name <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Control
                          value={customer.firstName}
                          onChange={(e) =>
                            setCustomer((p) => ({ ...p, firstName: e.target.value }))
                          }
                        />
                      </Col>
                      <Col md={3}>
                        <Form.Label className="small">Last Name</Form.Label>
                        <Form.Control
                          value={customer.lastName}
                          onChange={(e) =>
                            setCustomer((p) => ({ ...p, lastName: e.target.value }))
                          }
                        />
                      </Col>
                      <Col md={3}>
                        <Form.Label className="small">
                          Phone <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Control
                          value={customer.phone}
                          onChange={(e) =>
                            setCustomer((p) => ({ ...p, phone: e.target.value }))
                          }
                        />
                      </Col>
                      <Col md={2}>
                        <Form.Label className="small">Passport</Form.Label>
                        <Form.Control
                          value={customer.passport}
                          onChange={(e) =>
                            setCustomer((p) => ({ ...p, passport: e.target.value }))
                          }
                        />
                      </Col>
                      <Col md={5}>
                        <Form.Label className="small">
                          Email <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Control
                          type="email"
                          value={customer.email}
                          onChange={(e) =>
                            setCustomer((p) => ({ ...p, email: e.target.value }))
                          }
                        />
                      </Col>
                      <Col md={3}>
                        <Form.Label className="small">Nationality</Form.Label>
                        <Form.Control
                          value={customer.nationality}
                          onChange={(e) =>
                            setCustomer((p) => ({ ...p, nationality: e.target.value }))
                          }
                        />
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>

                {/* Guests */}
                <Card
                  className="shadow-sm border-0 mb-3"
                  style={{ borderRadius: 8 }}
                >
                  <Card.Header className="bg-white fw-bold">
                    Passenger Manifest ({guests.length})
                  </Card.Header>
                  <Card.Body>
                    <Table size="sm" bordered>
                      <thead className="table-light">
                        <tr>
                          <th style={{ width: 40 }}>#</th>
                          <th style={{ width: 90 }}>Type</th>
                          <th>Name</th>
                          <th style={{ width: 90 }}>Age</th>
                          <th style={{ width: 100 }}>Gender</th>
                          <th style={{ width: 140 }}>Passport</th>
                        </tr>
                      </thead>
                      <tbody>
                        {guests.map((g, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td>
                              <Badge bg={g.isChild ? "warning" : "primary"}>
                                {g.isChild ? "Child" : "Adult"}
                              </Badge>
                            </td>
                            <td>
                              <InputGroupName>
                                <Form.Select
                                  size="sm"
                                  style={{ maxWidth: 80 }}
                                  value={g.salutation}
                                  onChange={(e) =>
                                    updateGuest(i, "salutation", e.target.value)
                                  }
                                >
                                  <option value="">—</option>
                                  {["Mr", "Mrs", "Ms", "Master", "Miss"].map((s) => (
                                    <option key={s}>{s}</option>
                                  ))}
                                </Form.Select>
                                <Form.Control
                                  size="sm"
                                  placeholder="First"
                                  value={g.firstName}
                                  onChange={(e) =>
                                    updateGuest(i, "firstName", e.target.value)
                                  }
                                />
                                <Form.Control
                                  size="sm"
                                  placeholder="Last"
                                  value={g.lastName}
                                  onChange={(e) =>
                                    updateGuest(i, "lastName", e.target.value)
                                  }
                                />
                              </InputGroupName>
                            </td>
                            <td>
                              <Form.Control
                                size="sm"
                                type="number"
                                min={0}
                                value={g.age}
                                onChange={(e) =>
                                  updateGuest(i, "age", e.target.value)
                                }
                              />
                            </td>
                            <td>
                              <Form.Select
                                size="sm"
                                value={g.gender}
                                onChange={(e) =>
                                  updateGuest(i, "gender", e.target.value)
                                }
                              >
                                <option value="">—</option>
                                <option>Male</option>
                                <option>Female</option>
                                <option>Other</option>
                              </Form.Select>
                            </td>
                            <td>
                              <Form.Control
                                size="sm"
                                value={g.passportNo}
                                onChange={(e) =>
                                  updateGuest(i, "passportNo", e.target.value)
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </Card.Body>
                </Card>

                {/* Add-Ons echo */}
                <Card
                  className="shadow-sm border-0 mb-3"
                  style={{ borderRadius: 8 }}
                >
                  <Card.Header className="bg-white fw-bold">Add-Ons</Card.Header>
                  <Card.Body>
                    <Row className="g-2">
                      {[
                        ["Visa", addOns.visa],
                        ["Insurance", addOns.insurance],
                        ["Meet & Greet", addOns.meetGreet],
                        ["SIM/Forex", addOns.simForex],
                      ].map(([label, val]) => (
                        <Col md={3} key={label}>
                          <div className="border rounded p-2 text-center">
                            <div className="fw-semibold">{label}</div>
                            <Badge
                              bg={val === "YES" ? "danger" : "secondary"}
                              className="mt-1"
                            >
                              {val || "NO"}
                            </Badge>
                          </div>
                        </Col>
                      ))}
                    </Row>
                  </Card.Body>
                </Card>
              </Col>

              {/* ─── Right rail — totals + confirm ─────────── */}
              <Col lg={4}>
                <div style={{ position: "sticky", top: 80 }}>
                  <Card
                    className="shadow-sm border-0"
                    style={{ borderRadius: 8 }}
                  >
                    <Card.Header className="bg-success text-white fw-bold">
                      Price Summary
                    </Card.Header>
                    <Card.Body>
                      <div className="d-flex justify-content-between mb-1">
                        <span>Hotels</span>
                        <span>{fmtMoney(totals.hotelSum)}</span>
                      </div>
                      <div className="d-flex justify-content-between mb-1">
                        <span>Transfers</span>
                        <span>{fmtMoney(totals.transferSum)}</span>
                      </div>
                      <div className="d-flex justify-content-between mb-2">
                        <span>Activities</span>
                        <span>{fmtMoney(totals.activitySum)}</span>
                      </div>
                      <div className="border-top pt-2 mt-2">
                        <Form.Label className="small">Tourism Dirham</Form.Label>
                        <Form.Control
                          type="number"
                          min={0}
                          step="0.01"
                          value={tourismDirham}
                          onChange={(e) => setTourismDirham(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="border-top pt-2 mt-3">
                        <Form.Label className="small">Payment Mode</Form.Label>
                        <Form.Select
                          value={paymentMode}
                          onChange={(e) => setPaymentMode(e.target.value)}
                        >
                          {["Online", "Cash", "Card", "Net Banking"].map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </Form.Select>
                      </div>
                      <div className="border-top pt-2 mt-3 d-flex justify-content-between fw-bold fs-5">
                        <span>Total</span>
                        <span className="text-success">
                          {fmtMoney(totals.grand)}
                        </span>
                      </div>
                    </Card.Body>
                    <Card.Footer
                      className="bg-light"
                      style={{ borderRadius: "0 0 8px 8px" }}
                    >
                      <Button
                        variant="success"
                        className="w-100"
                        onClick={submit}
                        disabled={submitting}
                      >
                        {submitting ? (
                          <>
                            <Spinner
                              size="sm"
                              animation="border"
                              className="me-1"
                            />
                            Saving…
                          </>
                        ) : (
                          <>
                            <FaCheckCircle className="me-2" />
                            Confirm Booking
                          </>
                        )}
                      </Button>
                    </Card.Footer>
                  </Card>
                </div>
              </Col>
            </Row>
          </Container>
        </main>
      </div>
    </div>
  );
};

// Small helper to compose three inline form controls without InputGroup baggage.
const InputGroupName = ({ children }) => (
  <div className="d-flex gap-1 flex-wrap">{children}</div>
);

export default MakePkgV3BookingPage;
