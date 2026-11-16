import React, { useState, useEffect, useCallback } from "react";
import { Container, Button, Row, Col, Spinner, Card } from "react-bootstrap";
import { FaCloudUploadAlt, FaTrash, FaEye, FaSave, FaArrowLeft } from "react-icons/fa";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../../components/AxiosInstance";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import HotelTitleBadge from "../../components/HotelTitleBadge";
import "../../styles/ExtranetImgUpload.css";

// Uploaded images are stored on the backend with an ABSOLUTE filesystem path
// (e.g. "D:/hbsImages/imageDir/123_photo.jpg") which a browser cannot load.
// The same folder is served at "/images/**" (proxied to the backend in dev via
// package.json "proxy"), so resolve any stored value to a loadable URL:
//   - full http(s) URL  → use as-is
//   - already "/images/" path → use as-is
//   - absolute/relative fs path → take the file name and serve from /images/
const resolveImgSrc = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/images/")) return path;
  const filename = path.split(/[\\/]/).pop();
  return `/images/${filename}`;
};

const ExtranetImgUpload = () => {
  const navigate = useNavigate();
  const [hotelId, setHotelId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [dragActive, setDragActive] = useState(false);

  const fetchHotelId = useCallback(async () => {
    try {
      const userName = sessionStorage.getItem("UserName");
      if (userName) {
        const response = await axiosInstance.get(`/api/personalProfile/${userName}`);
        if (response.data && response.data.id) {
          setHotelId(response.data.id);
          fetchImages(response.data.id);
        } else {
          toast.error("Hotel profile not found");
          setIsLoading(false);
        }
      } else {
        toast.error("User not logged in");
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast.error("Failed to fetch profile data");
      setIsLoading(false);
    }
  }, []);

  const fetchImages = async (id) => {
    try {
      const response = await axiosInstance.get(`/api/hotelInventory/list`);
      if (response.data && Array.isArray(response.data)) {
        // Filter images by hotelId since the endpoint returns all images
        const filteredImages = response.data.filter(img => String(img.hotelId) === String(id));
        setUploadedImages(filteredImages);
      }
    } catch (error) {
      console.error("Error fetching images:", error);
    } finally {
      setIsLoading(false);
    }
  };


  useEffect(() => {
    fetchHotelId();
  }, [fetchHotelId]);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...filesArray]);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      setSelectedFiles((prev) => [...prev, ...filesArray]);
    }
  };

  const removeSelectedFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveImages = async () => {
    if (selectedFiles.length === 0) {
      toast.error("Please select files first");
      return;
    }

    setIsUploading(true);
    let successCount = 0;
    let failCount = 0;

    for (const file of selectedFiles) {
      const formData = new FormData();
      formData.append("image1", file);

      try {
        const response = await axiosInstance.post(
          `/api/hotelInventory/${hotelId}/imageUpload/save`,
          formData,
          {
            headers: { "Content-Type": "multipart/form-data" },
          }
        );

        if (response.data) {
          successCount++;
        }
      } catch (error) {
        console.error("Upload failed for file:", file.name, error);
        failCount++;
      }
    }

    setIsUploading(false);
    if (successCount > 0) {
      toast.success(`${successCount} images uploaded successfully!`);
      setSelectedFiles([]);
      fetchImages(hotelId);
    }
    if (failCount > 0) {
      toast.error(`${failCount} images failed to upload.`);
    }
  };

  const handleDeleteImage = async (imageId) => {
    if (!window.confirm("Are you sure you want to delete this image?")) return;

    try {
      await axiosInstance.delete(`/api/hotelInventory/${hotelId}/imageUpload/${imageId}`);
      toast.success("Image deleted successfully!");
      fetchImages(hotelId);
    } catch (error) {
      console.error("Error deleting image:", error);
      toast.error("Failed to delete image");
    }
  };


  if (isLoading) {
    return (
      <div className="d-flex min-vh-100 align-items-center justify-content-center bg-light">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1" style={{ minWidth: 0, overflowX: "hidden" }}>
        <Container fluid className="extranet-img-upload-container">
          <Card className="shadow-sm border-0 rounded-4 overflow-hidden mb-4">
            <Card.Header className="bg-white border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
              <div className="d-flex align-items-center gap-3 flex-wrap">
                <h4 className="fw-bold mb-0">Hotel Image Gallery</h4>
                {hotelId && <HotelTitleBadge hotelId={hotelId} />}
              </div>
              <Button
                variant="outline-secondary"
                size="sm"
                className="d-flex align-items-center gap-2"
                onClick={() => navigate("/extranetDashboard")}
              >
                <FaArrowLeft /> Back
              </Button>
            </Card.Header>
            <Card.Body className="p-4">
              {/* Upload Zone */}
              <div
                className={`upload-zone ${dragActive ? "border-primary bg-light" : ""}`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById("fileInput").click()}
              >
                <input
                  type="file"
                  id="fileInput"
                  multiple
                  hidden
                  onChange={handleFileChange}
                  accept="image/*"
                />
                <div className="upload-icon">
                  <FaCloudUploadAlt />
                </div>
                <div className="upload-text">
                  <h4>Upload Files</h4>
                  <p>Click here to browse files to upload, you can drag and drop files too</p>
                </div>
              </div>

              {/* Preview Selected Images */}
              {selectedFiles.length > 0 && (
                <div className="mb-4">
                  <h6 className="fw-bold mb-3">Selected Images ({selectedFiles.length})</h6>
                  <div className="preview-gallery">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="preview-item">
                        <img src={URL.createObjectURL(file)} alt="preview" />
                        <button className="remove-btn" onClick={(e) => { e.stopPropagation(); removeSelectedFile(index); }}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button 
                    variant="success" 
                    className="save-btn d-flex align-items-center gap-2"
                    onClick={handleSaveImages}
                    disabled={isUploading}
                  >
                    {isUploading ? <Spinner animation="border" size="sm" /> : <FaSave />}
                    Save
                  </Button>
                </div>
              )}

              {/* Uploaded Gallery */}
              <div className="uploaded-gallery">
                <h5 className="fw-bold mb-4 border-bottom pb-2">All Uploaded Images</h5>
                {uploadedImages.length === 0 ? (
                  <div className="text-center py-5 text-muted">
                    <p>No images uploaded yet.</p>
                  </div>
                ) : (
                  <div className="gallery-grid">
                    {uploadedImages.map((img, index) => (
                      <div key={index} className="gallery-item">
                        <div className="position-relative">
                          <img
                            src={resolveImgSrc(img.image1Path)}
                            alt={`hotel-${index}`}
                          />
                          <button 
                            className="remove-btn" 
                            style={{ width: "25px", height: "25px", fontSize: "14px" }}
                            onClick={() => handleDeleteImage(img.id)}
                          >
                            <FaTrash />
                          </button>
                        </div>
                        <div className="img-info">
                          <span>Image {index + 1}</span>
                        </div>
                      </div>
                    ))}

                  </div>
                )}
              </div>
            </Card.Body>
          </Card>
        </Container>
        </main>
      </div>
    </div>
  );
};

export default ExtranetImgUpload;