import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Container, Row, Col, Spinner } from "react-bootstrap";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import axiosInstance from "../components/AxiosInstance";
import toast from "react-hot-toast";
import Swal from "sweetalert2";
import {
  FaArrowLeft,
  FaEdit,
  FaTrash,
  FaToggleOn,
  FaToggleOff,
} from "react-icons/fa";
import { safeHttpUrl } from "../utils/urlSafety";

// ── Styling tokens, adopted from PackageDetailedView so this page has the
//    same look-and-feel as the other "view" screens. ──────────────────
const BUTTON_STYLE = {
  color: "#fff",
  border: "none",
  borderRadius: "3px",
  padding: "6px 14px",
  fontSize: "0.78rem",
  fontWeight: "600",
  cursor: "pointer",
  letterSpacing: "0.4px",
  whiteSpace: "nowrap",
  marginRight: "8px",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
};

const SECTION_HEADER = {
  backgroundColor: "#f0f0f0",
  padding: "7px 12px",
  fontWeight: "600",
  fontSize: "0.9rem",
  borderBottom: "1px solid #ddd",
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const INFO_LABEL = {
  fontWeight: "600",
  color: "#555",
  fontSize: "0.82rem",
  minWidth: "160px",
  display: "inline-block",
};

const INFO_VALUE = {
  color: "#222",
  fontSize: "0.82rem",
};

const card = {
  border: "1px solid #ddd",
  borderRadius: "4px",
  marginBottom: "14px",
  overflow: "hidden",
  backgroundColor: "#fff",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

const StatusBadge = ({ status }) => {
  const isActive = status === true || status === "true";
  return (
    <span
      style={{
        color: isActive ? "#27ae60" : "#888",
        fontWeight: "700",
        fontSize: "0.85rem",
      }}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
};

const InfoRow = ({ label, value }) => (
  <div
    style={{ marginBottom: "6px", display: "flex", alignItems: "flex-start" }}
  >
    <span style={INFO_LABEL}>{label}</span>
    <span style={{ ...INFO_VALUE, marginLeft: "8px" }}>{value ?? "-"}</span>
  </div>
);

// Backend sends "yyyy-MM-ddTHH:mm:ss" → "dd-MM-yyyy hh:mm AM/PM".
const formatDateTime = (str) => {
  if (!str) return "-";
  const [datePart, timePart = "00:00:00"] = str.split("T");
  const [y, m, d] = datePart.split("-");
  const [hhRaw, mm] = timePart.split(":");
  let hh = parseInt(hhRaw, 10);
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12 === 0 ? 12 : hh % 12;
  return `${d}-${m}-${y} ${String(hh).padStart(2, "0")}:${mm} ${ampm}`;
};

export default function AdvertisementDetailedView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ad, setAd] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadAd = () => {
    if (!id) return;
    setLoading(true);
    axiosInstance
      .get(`/api/advertisement/${id}`)
      .then((res) => {
        if (res.data) {
          setAd(res.data);
        } else {
          toast.error("Failed to load advertisement");
        }
      })
      .catch((err) => {
        console.error("Error loading advertisement:", err);
        toast.error(
          err.response?.data?.message || "Error loading advertisement",
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Edit → open the edit modal back on the list page.
  const handleEdit = () => {
    navigate("/advertisements", { state: { editId: ad.advertisementId } });
  };

  // Status toggle → PATCH.
  const handleToggleStatus = async () => {
    try {
      setBusy(true);
      const res = await axiosInstance.patch(
        `/api/advertisement/${ad.advertisementId}/status`,
        { isActive: !ad.isActive },
      );
      if (res.data && res.data.isActive) {
        toast.success("Advertisement activated successfully");
      } else {
        toast.success("Advertisement deactivated successfully");
      }
      setAd(res.data || ad);
    } catch (err) {
      toast.error("Failed to update status");
    } finally {
      setBusy(false);
    }
  };

  // Delete → confirm, then go back to the list.
  const handleDelete = () => {
    Swal.fire({
      titleText: `Are you sure? You want to delete "${ad.title}"`,
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
          .delete(`/api/advertisement/${ad.advertisementId}`)
          .then(() => {
            toast.success("Advertisement deleted successfully");
            navigate("/advertisements");
          })
          .catch(() => toast.error("Sorry!! Advertisement not deleted"));
      }
    });
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Container fluid style={{ maxWidth: "1100px" }}>
            <div className="mb-3 d-flex align-items-center flex-wrap">
              <button
                style={{ ...BUTTON_STYLE, backgroundColor: "#555" }}
                onClick={() => navigate("/advertisements")}
              >
                <FaArrowLeft /> Back
              </button>
              <span
                style={{
                  marginLeft: "4px",
                  marginRight: "auto",
                  fontWeight: "700",
                  fontSize: "1.1rem",
                  color: "#333",
                }}
              >
                Advertisement Details
              </span>

              {ad && !loading && (
                <div className="mt-2 mt-md-0">
                  <button
                    style={{ ...BUTTON_STYLE, backgroundColor: "#2c5fb3" }}
                    onClick={handleEdit}
                    disabled={busy}
                  >
                    <FaEdit /> Edit
                  </button>
                  <button
                    style={{
                      ...BUTTON_STYLE,
                      backgroundColor: ad.isActive ? "#e08e0b" : "#27ae60",
                    }}
                    onClick={handleToggleStatus}
                    disabled={busy}
                  >
                    {ad.isActive ? (
                      <>
                        <FaToggleOff /> Deactivate
                      </>
                    ) : (
                      <>
                        <FaToggleOn /> Activate
                      </>
                    )}
                  </button>
                  <button
                    style={{ ...BUTTON_STYLE, backgroundColor: "#c0392b" }}
                    onClick={handleDelete}
                    disabled={busy}
                  >
                    <FaTrash /> Delete
                  </button>
                </div>
              )}
            </div>

            {loading ? (
              <div className="text-center py-5">
                <Spinner animation="border" style={{ color: "#c0392b" }} />
                <p className="mt-3 text-muted">
                  Loading advertisement details...
                </p>
              </div>
            ) : !ad ? (
              <div className="text-center py-5 text-muted">
                Advertisement not found.
              </div>
            ) : (
              <>
                {/* ── Basic Details ──────────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>Basic Details</div>
                  <div style={{ padding: "12px 16px" }}>
                    <Row>
                      <Col md={6}>
                        <InfoRow label="Title" value={ad.title} />
                        <InfoRow
                          label="Display Position"
                          value={ad.displayPosition}
                        />
                        <InfoRow label="Priority" value={ad.priority} />
                        <InfoRow label="Device Type" value={ad.deviceType} />
                        <InfoRow label="Button Text" value={ad.buttonText} />
                      </Col>
                      <Col md={6}>
                        <InfoRow
                          label="Status"
                          value={<StatusBadge status={ad.isActive} />}
                        />
                        <InfoRow
                          label="Target URL"
                          value={
                            ad.targetUrl ? (
                              // Non-web links (javascript:, data:) are shown
                              // as text, never as a clickable link.
                              safeHttpUrl(ad.targetUrl) ? (
                              <a
                                  href={safeHttpUrl(ad.targetUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {ad.targetUrl}
                              </a>
                              ) : (
                                <span>{ad.targetUrl}</span>
                              )
                            ) : (
                              "-"
                            )
                          }
                        />
                        <InfoRow
                          label="Created By"
                          value={ad.createdByAdmin}
                        />
                      </Col>
                    </Row>
                  </div>
                </div>

                {/* ── Targeting ──────────────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>Targeting</div>
                  <div style={{ padding: "12px 16px" }}>
                    <Row>
                      <Col md={6}>
                        <InfoRow label="Country" value={ad.countryName} />
                        <InfoRow label="City" value={ad.cityName} />
                      </Col>
                      <Col md={6}>
                        <InfoRow
                          label="Start Date & Time"
                          value={formatDateTime(ad.startDateTime)}
                        />
                        <InfoRow
                          label="End Date & Time"
                          value={formatDateTime(ad.endDateTime)}
                        />
                      </Col>
                    </Row>
                  </div>
                </div>

                {/* ── Description ────────────────────────────────────── */}
                {ad.description && (
                  <div style={card}>
                    <div style={SECTION_HEADER}>Description (Internal notes)</div>
                    <div
                      style={{
                        padding: "12px 16px",
                        fontSize: "0.85rem",
                        color: "#333",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {ad.description}
                    </div>
                  </div>
                )}

                {/* ── Images ─────────────────────────────────────────── */}
                {(() => {
                  const imgs =
                    Array.isArray(ad.imageUrls) && ad.imageUrls.length > 0
                      ? ad.imageUrls
                      : ad.imageUrl
                        ? [ad.imageUrl]
                        : [];
                  if (imgs.length === 0) return null;
                  return (
                    <div style={card}>
                      <div style={SECTION_HEADER}>
                        Images ({imgs.length})
                      </div>
                      <div
                        style={{
                          padding: "12px 16px",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "10px",
                        }}
                      >
                        {imgs.map((url, i) => (
                          <img
                            key={`${url}-${i}`}
                            src={url}
                            alt={`Advertisement ${i + 1}`}
                            style={{
                              width: "220px",
                              height: "150px",
                              objectFit: "cover",
                              borderRadius: "4px",
                              border: "1px solid #ddd",
                            }}
                            onError={(e) => {
                              e.target.style.display = "none";
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Analytics ──────────────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>Analytics</div>
                  <div style={{ padding: "12px 16px" }}>
                    <Row className="text-center">
                      <Col>
                        <div className="text-muted small">Views</div>
                        <div className="fw-bold fs-5" style={{ color: "#EC0B43" }}>
                          {ad.viewCount ?? 0}
                        </div>
                        <div
                          className="text-muted"
                          style={{ fontSize: "0.68rem" }}
                        >
                          per page / login
                        </div>
                      </Col>
                      <Col>
                        <div className="text-muted small">Impressions</div>
                        <div className="fw-bold fs-5">
                          {ad.impressions ?? 0}
                        </div>
                      </Col>
                      <Col>
                        <div className="text-muted small">Clicks</div>
                        <div className="fw-bold fs-5">{ad.clicks ?? 0}</div>
                      </Col>
                      <Col>
                        <div className="text-muted small">CTR</div>
                        <div className="fw-bold fs-5">
                          {(ad.ctr ?? 0).toFixed(2)}%
                        </div>
                      </Col>
                      <Col>
                        <div className="text-muted small">Last Clicked</div>
                        <div className="fw-bold">
                          {ad.lastClickedAt
                            ? formatDateTime(ad.lastClickedAt)
                            : "-"}
                        </div>
                      </Col>
                    </Row>
                  </div>
                </div>
              </>
            )}
          </Container>
        </main>
      </div>
    </div>
  );
}
