import React, { useEffect, useState } from "react";
import {
  Card,
  Button,
  Table,
  Modal,
  Form,
  Pagination,
  Row,
  Col,
  Badge,
  Tabs,
  Tab,
} from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import {
  FaEdit,
  FaTrash,
  FaEye,
  FaSignInAlt,
  FaArrowLeft,
} from "react-icons/fa";
import { useParams, useNavigate } from "react-router-dom";

// SearchableSelect Component
const SearchableSelect = ({
  options,
  value,
  onChange,
  placeholder,
  className,
  isInvalid,
  name,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredOptions, setFilteredOptions] = useState(options || []);

  useEffect(() => {
    if (!options || !Array.isArray(options)) {
      setFilteredOptions([]);
      return;
    }
    if (searchTerm) {
      const filtered = options.filter((option) => {
        const optionName =
          option.name || option.marketTypeName || String(option);
        return optionName.toLowerCase().includes(searchTerm.toLowerCase());
      });
      setFilteredOptions(filtered);
    } else {
      setFilteredOptions(options);
    }
  }, [searchTerm, options]);

  const handleSelect = (option) => {
    try {
      onChange({
        target: {
          name: name,
          value: option.marketTypeId, // Use marketTypeId as per your data
        },
      });
      setIsOpen(false);
      setSearchTerm("");
    } catch (error) {
      console.error("Error in handleSelect:", error);
    }
  };

  const selectedOption = options?.find(
    (option) => String(option.marketTypeId) === String(value),
  );

  return (
    <div className="position-relative">
      <Form.Control
        type="text"
        value={
          isOpen
            ? searchTerm
            : selectedOption?.name || selectedOption?.marketTypeName || ""
        }
        onChange={(e) => {
          if (disabled) return;
          if (isOpen) {
            setSearchTerm(e.target.value);
          } else {
            setIsOpen(true);
            setSearchTerm(e.target.value);
          }
        }}
        onFocus={() => !disabled && setIsOpen(true)}
        placeholder={placeholder}
        className={`form-input ${isInvalid ? "is-invalid" : ""} ${
          className || ""
        }`}
        disabled={disabled}
        readOnly={disabled}
        autoComplete="off"
      />
      {isOpen && !disabled && (
        <div
          className="position-absolute w-100 bg-white border border-top-0 rounded-bottom shadow-lg"
          style={{
            zIndex: 1050,
            maxHeight: "200px",
            overflowY: "auto",
            top: "100%",
          }}
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <div
                key={option.marketTypeId} // Use marketTypeId as key
                className="px-3 py-2 cursor-pointer"
                style={{ cursor: "pointer", borderBottom: "1px solid #eee" }}
                onMouseEnter={(e) =>
                  (e.target.style.backgroundColor = "#f8f9fa")
                }
                onMouseLeave={(e) => (e.target.style.backgroundColor = "white")}
                onClick={() => handleSelect(option)}
              >
                {option.name || option.marketTypeName || String(option)}
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-muted">No options found</div>
          )}
        </div>
      )}
      {isOpen && (
        <div
          className="position-fixed"
          style={{ top: 0, left: 0, right: 0, bottom: 0, zIndex: 1040 }}
          onClick={() => {
            setIsOpen(false);
            setSearchTerm("");
          }}
        />
      )}
    </div>
  );
};

const ExtranetOccupancyAndMinimumLength = () => {
  const { id } = useParams(); // hotelId
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [itemsOcc, setItemsOcc] = useState([]);
  const [showModalOcc, setShowModalOcc] = useState(false);
  const [editingOcc, setEditingOcc] = useState(null);
  const [occupancyId, setOccupancyId] = useState(null);
  const [isViewModeOcc, setIsViewModeOcc] = useState(false);
  const [formDataOcc, setFormDataOcc] = useState({
    marketTypeId: "", // Single ID as per your backend
    validityPeriods: [
      {
        validityFrom: "",
        validityTo: "",
      },
    ],
    hotelRooms: [
      {
        id: "", // Backend expects 'id' instead of roomCategoryId
        roomOccupancies: [
          {
            occupancyTypeId: "",
            totalAdult: 0,
            totalChild: 0,
            extraAdult: 0,
            extraChild: 0,
          },
        ],
      },
    ],
    live: false,
  });
  const [validationErrorsOcc, setValidationErrorsOcc] = useState({});
  const [pageOcc, setPageOcc] = useState(0);
  const [totalPagesOcc, setTotalPagesOcc] = useState(0);
  const [searchOcc, setSearchOcc] = useState("");
  const [searchTimeoutOcc, setSearchTimeoutOcc] = useState(null);
  const [showLiveStatusModalOcc, setShowLiveStatusModalOcc] = useState(false);
  const [selectedItemOcc, setSelectedItemOcc] = useState(null);
  const [itemsMin, setItemsMin] = useState([]);
  const [showModalMin, setShowModalMin] = useState(false);
  const [editingMin, setEditingMin] = useState(null);
  const [isViewModeMin, setIsViewModeMin] = useState(false);
  const [formDataMin, setFormDataMin] = useState({
    marketTypeId: "",
    validityPeriods: [
      {
        validityFrom: "",
        validityTo: "",
      },
    ],
    hotelRooms: [
      {
        roomId: "",
        roomCategory: "",
        minimumLength: "",
      },
    ],
  });
  const [validationErrorsMin, setValidationErrorsMin] = useState({});
  const [pageMin, setPageMin] = useState(0);
  const [totalPagesMin, setTotalPagesMin] = useState(0);
  const [searchMin, setSearchMin] = useState("");
  const [searchTimeoutMin, setSearchTimeoutMin] = useState(null);
  const [showLiveStatusModalMin, setShowLiveStatusModalMin] = useState(false);
  const [selectedItemMin, setSelectedItemMin] = useState(null);

  // ✅ Helper function to get minimum date for Validity To (From date + 1 minute)
  const getMinValidityToDate = (fromDate) => {
    if (!fromDate) return "";
    const date = new Date(fromDate);
    // Add 1 minute to the from date to ensure validityTo is after validityFrom
    date.setMinutes(date.getMinutes() + 1);
    // Format to YYYY-MM-DDTHH:MM for datetime-local input
    const pad = (num) => num.toString().padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const [activeTab, setActiveTab] = useState("occupancy");
  const [showAllOccModal, setShowAllOccModal] = useState(false);
  const [showAllMinModal, setShowAllMinModal] = useState(false);
  const [marketTypes, setMarketTypes] = useState([]);
  const [roomCategories, setRoomCategories] = useState([]);
  const [occupancyTypes, setOccupancyTypes] = useState([]);
  const [hotelRoomsData, setHotelRoomsData] = useState([]);

  const getFormControlPropsOcc = (
    fieldName,
    onChangeHandler,
    additionalProps = {},
  ) => {
    return {
      ...additionalProps,
      readOnly: isViewModeOcc,
      onChange: isViewModeOcc ? undefined : onChangeHandler,
      className: `${additionalProps.className || ""} ${
        isViewModeOcc ? "bg-light" : ""
      }`.trim(),
      autoFocus: isViewModeOcc ? false : additionalProps.autoFocus,
    };
  };

  const loadMarketTypes = async () => {
    try {
      const response = await axiosInstance.get("/api/marketType");
      console.log("Market Types Data:", response.data); // Debug log

      // Add "All" option with value -1 at the beginning
      const marketTypesWithAll = [
        { marketTypeId: 100, name: "All", marketTypeName: "All" },
        ...(response.data || []),
      ];

      setMarketTypes(marketTypesWithAll);
    } catch (error) {
      console.error("Error loading market types:", error);
      toast.error("Failed to load market types");
    }
  };

  const loadOccupancyTypes = async () => {
    try {
      const response = await axiosInstance.get("/api/occupancyType");
      setOccupancyTypes(response.data || []);
    } catch (error) {
      console.error("Error loading occupancy types:", error);
      toast.error("Failed to load occupancy types");
    }
  };

  const loadHotelRoomDatas = async () => {
    try {
      const response = await axiosInstance.get(
        `/api/hotelRoomDetailsController/${id}`,
      );
      console.log("Hotel Rooms Data:", response.data);
      setHotelRoomsData(response.data || []);
    } catch (error) {
      toast.error("Failed to load Hotel Rooms Data");
    }
  };

  // Test backend connectivity

  // useEffect(() => {
  //   loadMarketTypes();
  //   loadOccupancyTypes();
  //   loadHotelRoomDatas();
  // }, []);

  useEffect(() => {
    if (hotelRoomsData.length > 0) {
      setFormDataOcc((prev) => ({
        ...prev,
        hotelRooms: hotelRoomsData.map((room) => ({
          id: room.rommCategoryId || room.roomCategoryId || "",
          roomOccupancies: room.occupancyDetailsDTOs.map((occ) => ({
            occupancyTypeId: occ.id || "",
            totalAdult: 0,
            totalChild: 0,
            extraAdult: 0,
            extraChild: 0,
          })),
        })),
      }));
    }
  }, [hotelRoomsData]);

  const fetchOccupancyList = async (pageNum = 0, searchTerm = searchOcc) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "10",
      });
      if (searchTerm && searchTerm.trim()) {
        params.append("search", searchTerm.trim());
      }
      const res = await axiosInstance.get(`/api/hotels/${id}/occupancies`, {
        params,
      });
      if (res.data && Array.isArray(res.data)) {
        setItemsOcc(res.data);
        if (res.data.length < 10) {
          setTotalPagesOcc(pageNum + 1);
        } else {
          setTotalPagesOcc(Math.max(totalPagesOcc, pageNum + 2));
        }
        setPageOcc(pageNum);
      } else {
        setItemsOcc([]);
        setTotalPagesOcc(0);
        setPageOcc(0);
      }
    } catch (err) {
      toast.error("Failed to load occupancies");
      setItemsOcc([]);
      setTotalPagesOcc(0);
      setPageOcc(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch occupancy data initially since it's the default active tab
    fetchOccupancyList();
  }, []);

  const validateOccupancyForm = (data) => {
    const newErrors = {};
    if (!data.marketTypeId || data.marketTypeId === "") {
      newErrors.marketTypeId = "Market type is required";
    }
    if (!data.validityPeriods || data.validityPeriods.length === 0) {
      newErrors.validityPeriods = "At least one validity period is required";
    } else {
      data.validityPeriods.forEach((period, index) => {
        if (!period.validityFrom) {
          newErrors.validityFrom = `Validity From is required for period ${
            index + 1
          }`;
        }
        if (!period.validityTo) {
          newErrors.validityTo = `Validity To is required for period ${
            index + 1
          }`;
        }
      });
    }
    if (!data.hotelRooms || data.hotelRooms.length === 0) {
      newErrors.hotelRooms = "At least one room is required";
    } else {
      data.hotelRooms.forEach((room, index) => {
        console.log("Validating room:", room);
        if (!room.id) {
          newErrors.roomId = `Room ID is required for room ${index + 1}`;
        }
        if (!room.roomOccupancies || room.roomOccupancies.length === 0) {
          newErrors.roomOccupancies = `At least one occupancy is required for room ${
            index + 1
          }`;
        } else {
          room.roomOccupancies.forEach((occ, occIndex) => {
            console.log("Validating occupancy:", occ);
            if (!occ.occupancyTypeId) {
              newErrors.occupancyTypeId = `Occupancy Type is required for occupancy ${
                occIndex + 1
              } in room ${index + 1}`;
            }
          });
        }
      });
    }
    return newErrors;
  };

  const saveOccupancy = async (e) => {
    console.log("save occupancy fn::", formDataOcc);
    e.preventDefault();
    const errors = validateOccupancyForm(formDataOcc);
    if (Object.keys(errors).length > 0) {
      setValidationErrorsOcc(errors);
      toast.error(
        "Please check the form for errors. Some required fields are missing.",
      );
      console.error("Validation errors:", errors);
      return;
    }
    try {
      setIsLoading(true);
      const payload = {
        hotelId: id,
        marketTypeId: formDataOcc.marketTypeId || null,
        validityPeriods: formDataOcc.validityPeriods.map((period) => ({
          validityFrom: period.validityFrom
            ? `${period.validityFrom}:00`
            : period.validityFrom,
          validityTo: period.validityTo
            ? `${period.validityTo}:00`
            : period.validityTo,
        })),
        hotelRooms: formDataOcc.hotelRooms.map((room) => ({
          id: room.id, // Use the mapped rommCategoryId
          roomOccupancies: room.roomOccupancies.map((occ) => ({
            occupancyTypeId: occ.occupancyTypeId,
            totalAdult: Number(occ.totalAdult) || 0,
            totalChild: Number(occ.totalChild) || 0,
            extraAdult: Number(occ.extraAdult) || 0,
            extraChild: Number(occ.extraChild) || 0,
          })),
        })),
      };
      console.log("Final Occupancy Payload:", payload);
      const response = await axiosInstance.post(
        `/api/hotels/${id}/occupancies`,
        payload,
        {
          headers: { "Content-Type": "application/json" },
        },
      );
      if (response.data) {
        toast.success("Occupancy added successfully!");
        setValidationErrorsOcc({});
        await fetchOccupancyList(pageOcc, searchOcc);
        closeModalOcc();
      }
    } catch (error) {
      console.error("Save occupancy error:", error);
      setError("Failed to save occupancy data");
      toast.error(
        `Failed to save occupancy data: ${
          error.response?.data?.message || error.message
        }`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditOcc = async () => {
    console.log("edit occupancy fn::", editingOcc);
    const errors = validateOccupancyForm(formDataOcc);
    if (Object.keys(errors).length > 0) {
      setValidationErrorsOcc(errors);
      toast.error(
        "Please check the form for errors. Some required fields are missing.",
      );
      console.error("Validation errors:", errors);
      return;
    }
    if (!editingOcc) return;
    try {
      setIsLoading(true);
      const payload = {
        hotelId: id,
        marketTypeId: formDataOcc.marketTypeId || null,
        validityPeriods: formDataOcc.validityPeriods.map((period) => ({
          validityFrom: period.validityFrom
            ? `${period.validityFrom}:00`
            : period.validityFrom,
          validityTo: period.validityTo
            ? `${period.validityTo}:00`
            : period.validityTo,
        })),
        hotelRooms: formDataOcc.hotelRooms.map((room) => ({
          id: room.id, // Use the mapped rommCategoryId
          roomOccupancies: room.roomOccupancies.map((occ) => ({
            occupancyTypeId: occ.occupancyTypeId,
            totalAdult: Number(occ.totalAdult) || 0,
            totalChild: Number(occ.totalChild) || 0,
            extraAdult: Number(occ.extraAdult) || 0,
            extraChild: Number(occ.extraChild) || 0,
          })),
        })),
      };
      console.log("Edit Occupancy Payload:", payload);
      const response = await axiosInstance.put(
        `/api/hotels/${id}/occupancies/${occupancyId}`,
        payload,
      );
      if (response.data) {
        toast.success("Occupancy updated successfully!");
        setValidationErrorsOcc({});
        await fetchOccupancyList(pageOcc, searchOcc);
        closeModalOcc();
      }
    } catch (error) {
      console.error("Edit occupancy error:", error);
      setError("Failed to update occupancy");
      toast.error(
        `Failed to update occupancy: ${
          error.response?.data?.message || error.message
        }`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const closeModalOcc = () => {
    setShowModalOcc(false);
    setEditingOcc(null);
    setIsViewModeOcc(false);
    setFormDataOcc({
      marketTypeId: "",
      validityPeriods: [{ validityFrom: "", validityTo: "" }],
      hotelRooms: [
        {
          id: "",
          roomOccupancies: [
            {
              occupancyTypeId: "",
              totalAdult: 0,
              totalChild: 0,
              extraAdult: 0,
              extraChild: 0,
            },
          ],
        },
      ],
      live: false,
    });
    setValidationErrorsOcc({});
    setError("");
  };

  useEffect(() => {
    if (searchTimeoutOcc) {
      clearTimeout(searchTimeoutOcc);
    }
    const timeout = setTimeout(() => {
      fetchOccupancyList(0, searchOcc);
    }, 500);
    setSearchTimeoutOcc(timeout);
    return () => {
      if (searchTimeoutOcc) {
        clearTimeout(searchTimeoutOcc);
      }
    };
  }, [searchOcc]);

  const handleDeleteOcc = (item) => {
    Swal.fire({
      titleText: `Are you sure? You want to delete occupancy ${item.occupancyId}`,
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
          .delete(`/api/hotels/${id}/occupancies/${item.occupancyId}`)
          .then(() => {
            toast.success("Occupancy deleted successfully");
            fetchOccupancyList(pageOcc, searchOcc);
          })
          .catch(() => {
            toast.error("Sorry!! Occupancy not deleted");
          });
      }
    });
  };

  const openEditOcc = async (item) => {
    try {
      loadMarketTypes();
      loadOccupancyTypes();
      loadHotelRoomDatas();
      const editRes = await axiosInstance.get(
        `/api/hotels/${id}/occupancies/${item.occupancyId}`,
      );
      console.log("edit res::", editRes.data);
      const data = editRes.data;
      setOccupancyId(item.occupancyId);

      // Transform rooms to match save structure
      const hotelRooms = [];
      const roomMap = {};
      (data.rooms || []).forEach((room) => {
        if (!roomMap[room.roomId]) {
          roomMap[room.roomId] = {
            id: room.roomId,
            roomOccupancies: [],
          };
        }
        roomMap[room.roomId].roomOccupancies.push({
          occupancyTypeId: room.occupancyTypeId,
          totalAdult: room.totalAdult || 0,
          totalChild: room.totalChild || 0,
          extraAdult: room.extraAdult || 0,
          extraChild: room.extraChild || 0,
        });
      });
      Object.values(roomMap).forEach((room) => hotelRooms.push(room));

      // Transform validity list - convert from yyyy-MM-dd'T'HH:mm:ss to yyyy-MM-ddTHH:mm for UI
      const validityPeriods = (data.validityList || []).map((v) => ({
        validityFrom: v.validityFrom
          ? v.validityFrom.substring(0, 16)
          : v.validityFrom,
        validityTo: v.validityTo ? v.validityTo.substring(0, 16) : v.validityTo,
      }));

      // Map marketName to marketTypeId if needed
      const marketTypeId =
        marketTypes.find(
          (mt) =>
            mt.name === data.marketName ||
            mt.marketTypeName === data.marketName,
        )?.marketTypeId ||
        data.marketTypeId ||
        "";

      setEditingOcc(data);
      setIsViewModeOcc(false);
      setFormDataOcc({
        marketTypeId: marketTypeId,
        validityPeriods: validityPeriods.length
          ? validityPeriods
          : [{ validityFrom: "", validityTo: "" }],
        hotelRooms: hotelRooms.length
          ? hotelRooms
          : [
              {
                id: "",
                roomOccupancies: [
                  {
                    occupancyTypeId: "",
                    totalAdult: 0,
                    totalChild: 0,
                    extraAdult: 0,
                    extraChild: 0,
                  },
                ],
              },
            ],
        live: data.live || false,
      });
      setValidationErrorsOcc({});
      setShowModalOcc(true);
    } catch (error) {
      console.error("Failed to load occupancy for edit:", error);
      toast.error("Failed to load occupancy data");
    }
  };

  const handleViewOcc = async (item) => {
    try {
      setIsLoading(true);
      // Fetch detailed occupancy data from API
      const viewRes = await axiosInstance.get(
        `/api/hotels/${id}/occupancies/${item.occupancyId}`,
      );
      console.log("View occupancy data:", viewRes.data);
      const data = viewRes.data;

      // Transform rooms to match form structure
      const hotelRooms = [];
      const roomMap = {};
      (data.rooms || []).forEach((room) => {
        if (!roomMap[room.roomId]) {
          roomMap[room.roomId] = {
            id: room.roomId,
            roomOccupancies: [],
          };
        }
        roomMap[room.roomId].roomOccupancies.push({
          occupancyTypeId: room.occupancyTypeId,
          totalAdult: room.totalAdult || 0,
          totalChild: room.totalChild || 0,
          extraAdult: room.extraAdult || 0,
          extraChild: room.extraChild || 0,
        });
      });
      Object.values(roomMap).forEach((room) => hotelRooms.push(room));

      // Transform validity list - convert from yyyy-MM-dd'T'HH:mm:ss to yyyy-MM-ddTHH:mm for UI
      const validityPeriods = (data.validityList || []).map((v) => ({
        validityFrom: v.validityFrom
          ? v.validityFrom.substring(0, 16)
          : v.validityFrom,
        validityTo: v.validityTo ? v.validityTo.substring(0, 16) : v.validityTo,
      }));

      // Map marketName to marketTypeId
      const marketTypeId =
        marketTypes.find(
          (mt) =>
            mt.name === data.marketName ||
            mt.marketTypeName === data.marketName,
        )?.marketTypeId ||
        data.marketTypeId ||
        "";

      setEditingOcc(data);
      setIsViewModeOcc(true);
      setFormDataOcc({
        marketTypeId: marketTypeId,
        validityPeriods: validityPeriods.length
          ? validityPeriods
          : [{ validityFrom: "", validityTo: "" }],
        hotelRooms: hotelRooms.length
          ? hotelRooms
          : [
              {
                id: "",
                roomOccupancies: [
                  {
                    occupancyTypeId: "",
                    totalAdult: 0,
                    totalChild: 0,
                    extraAdult: 0,
                    extraChild: 0,
                  },
                ],
              },
            ],
        live: data.live || false,
      });
      setValidationErrorsOcc({});
      setShowModalOcc(true);
    } catch (error) {
      console.error("Failed to load occupancy for view:", error);
      toast.error("Failed to load occupancy data for viewing");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLiveStatusOcc = async (item) => {
    setSelectedItemOcc(item);
    setShowLiveStatusModalOcc(true);
  };

  const confirmLiveStatusChangeOcc = async () => {
    console.log("=== CONFIRM LIVE STATUS CHANGE OCC ===");
    console.log("Toggling live status for:", selectedItemOcc);
    console.log("Hotel ID from params:", id);
    console.log("Occupancy ID:", selectedItemOcc.occupancyId);

    if (!selectedItemOcc) {
      console.error("No selected item found!");
      return;
    }

    try {
      setIsLoading(true);

      // Create payload matching HotelOccupancyPatchDTO structure
      const payload = {
        isLive: !selectedItemOcc.isLive, // Toggle the current status
      };

      console.log("Sending payload:", payload);
      // Add CORS headers to the request
      const res = await axiosInstance.patch(
        `/api/hotels/${id}/occupancies/${selectedItemOcc.occupancyId}/status`,
        payload,
      );

      console.log("✅ API call successful!");
      console.log("API response:", res.data);

      if (res.data.isLive === true || res.data.isLive === "true") {
        toast.success("Occupancy activated successfully");
      } else {
        toast.success("Occupancy deactivated successfully");
      }

      // Refresh the occupancy list to show updated data
      await fetchOccupancyList(pageOcc, searchOcc);
      setShowLiveStatusModalOcc(false);
      setSelectedItemOcc(null);
    } catch (error) {
      // Handle CORS error specifically
      if (error.code === "ERR_NETWORK" || error.message.includes("CORS")) {
        console.error("🚨 CORS Error Detected!");
        console.error("This is a CORS (Cross-Origin Resource Sharing) issue.");
        console.error(
          "The backend server needs to be configured to allow requests from localhost:3000",
        );

        toast.error(
          <div>
            <strong>CORS Error:</strong>
            <br />
            Backend server needs CORS configuration.
            <br />
            <small>
              Add @CrossOrigin annotation to your Spring Boot controller
            </small>
          </div>,
        );
      } else if (error.response?.status === 404) {
        toast.error("API endpoint not found. Please check the backend routes.");
      } else if (error.response?.status === 500) {
        toast.error("Server error. Please check the backend logs.");
      } else {
        toast.error(
          `Failed to update status: ${
            error.response?.data?.message || error.message
          }`,
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const closeLiveStatusModalOcc = () => {
    setShowLiveStatusModalOcc(false);
    setSelectedItemOcc(null);
  };

  const openCreateMin = () => {
    setEditingMin(null);
    setIsViewModeMin(false);
    setFormDataMin({
      marketTypeId: "",
      validityPeriods: [
        {
          validityFrom: "",
          validityTo: "",
        },
      ],
      hotelRooms: [], // Start with empty array, will be populated as user enters data
    });
    setValidationErrorsMin({});
    setError("");
    setShowModalMin(true);
  };

  const openEditMin = async (item) => {
    console.log("Opening edit for minimum length item:", item);
    try {
      setIsLoading(true);

      // Try different possible ID fields
      const itemId = item.minimumLengthId;
      console.log("Final ID to use:", itemId);

      // Ensure hotelRoomsData is loaded first
      if (hotelRoomsData.length === 0) {
        console.log("Loading hotel rooms data first...");
        await loadHotelRoomDatas();
      }

      // Fetch detailed minimum length data from API
      const editRes = await axiosInstance.get(
        `/api/hotels/${id}/minimumlengths/${itemId}`,
      );
      console.log("Edit API response:", editRes.data);
      const data = editRes.data;

      setEditingMin(data);
      setIsViewModeMin(false);

      // Map validity periods correctly - convert from yyyy-MM-dd'T'HH:mm:ss to yyyy-MM-dd for UI
      const mappedValidityPeriods = (data.validityPeriods || []).map(
        (period) => ({
          validityFrom: period.validityFrom
            ? period.validityFrom.substring(0, 16)
            : "",
          validityTo: period.validityTo
            ? period.validityTo.substring(0, 16)
            : "",
        }),
      );

      // Map hotel rooms correctly - need to match with hotelRoomsData
      const mappedHotelRooms = (data.hotelRooms || []).map((room) => {
        const matchingCategory = hotelRoomsData.find(
          (cat) => cat.rommCategoryId === room.roomId,
        );
        console.log(`Mapping room ${room.roomId}:`, {
          roomData: room,
          matchingCategory: matchingCategory,
          categoryName: matchingCategory?.roomCategory,
        });

        return {
          roomId: room.roomId.toString(),
          roomCategory: matchingCategory?.roomCategory || `Room ${room.roomId}`,
          minimumLength: room.minimumLength || "",
        };
      });

      console.log("Mapped validity periods:", mappedValidityPeriods);
      console.log("Mapped hotel rooms:", mappedHotelRooms);
      console.log("Available hotel rooms data:", hotelRoomsData);

      setFormDataMin({
        marketTypeId: data.marketTypeId || "",
        validityPeriods:
          mappedValidityPeriods.length > 0
            ? mappedValidityPeriods
            : [{ validityFrom: "", validityTo: "" }],
        hotelRooms: mappedHotelRooms,
      });
      setValidationErrorsMin({});
      setShowModalMin(true);
    } catch (error) {
      console.error("Error in openEditMin:", error);
      toast.error(
        `Failed to load minimum length data for editing: ${
          error.response?.data?.message || error.message
        }`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditMin = async () => {
    const errors = validateMinForm(formDataMin);
    if (Object.keys(errors).length > 0) {
      setValidationErrorsMin(errors);
      return;
    }
    if (!editingMin) return;
    try {
      setIsLoading(true);
      const payload = {
        hotelId: id,
        marketTypeId: formDataMin.marketTypeId,
        validityPeriods: formDataMin.validityPeriods.map((period) => ({
          validityFrom: period.validityFrom
            ? `${period.validityFrom}:00`
            : period.validityFrom,
          validityTo: period.validityTo
            ? `${period.validityTo}:00`
            : period.validityTo,
        })),
        hotelRooms: hotelRoomsData.map((category) => {
          const roomData = formDataMin.hotelRooms.find(
            (room) => room.roomId === category.rommCategoryId.toString(),
          );
          return {
            roomId: category.rommCategoryId,
            minimumLength: Number(roomData?.minimumLength) || 0,
          };
        }),
      };
      console.log("Edit Minimum Length Payload:", payload);
      const editId =
        editingMin.id || editingMin.minimumLengthId || editingMin.minLengthId;
      const editRes = await axiosInstance.put(
        `/api/hotels/${id}/minimumlengths/${editId}`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      if (editRes.data) {
        toast.success("Minimum Length Updated Successfully!");
        setValidationErrorsMin({});
        await fetchMinLengthList(pageMin, searchMin);
        closeModalMin();
      }
    } catch (error) {
      console.error("Edit min length error:", error);
      setError("Failed to update min length");
      toast.error(
        `Failed to update min length: ${
          error.response?.data?.message || error.message
        }`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const closeModalMin = () => {
    setShowModalMin(false);
    setEditingMin(null);
    setIsViewModeMin(false);
    setFormDataMin({
      marketTypeId: "",
      validityPeriods: [
        {
          validityFrom: "",
          validityTo: "",
        },
      ],
      hotelRooms: [], // Start with empty array
    });
    setValidationErrorsMin({});
    setError("");
  };

  const fetchMinLengthList = async (pageNum = 0, searchTerm = searchMin) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "10",
      });
      if (searchTerm && searchTerm.trim()) {
        params.append("search", searchTerm.trim());
      }
      const res = await axiosInstance.get(`/api/hotels/${id}/minimumlengths`, {
        params,
      });
      console.log("Fetching min length list response:", res.data);
      if (res.data && Array.isArray(res.data)) {
        setItemsMin(res.data);
        if (res.data.length < 10) {
          setTotalPagesMin(pageNum + 1);
        } else {
          setTotalPagesMin(Math.max(totalPagesMin, pageNum + 2));
        }
        setPageMin(pageNum);
        console.log("Updated itemsMin:", res.data);
      } else {
        setItemsMin([]);
        setTotalPagesMin(0);
        setPageMin(0);
        console.log("No data found, cleared itemsMin");
      }
    } catch (err) {
      toast.error("Failed to load min lengths");
      setItemsMin([]);
      setTotalPagesMin(0);
      setPageMin(0);
    } finally {
      setIsLoading(false);
    }
  };

  // Remove the automatic fetch for minimum length on mount
  // It will be called when the tab is selected

  const validateMinForm = (data) => {
    const newErrors = {};
    if (!data.marketTypeId || data.marketTypeId === "")
      newErrors.marketTypeId = "Market Type is required";
    if (!data.validityPeriods || data.validityPeriods.length === 0) {
      newErrors.validityPeriods = "At least one validity period is required";
    } else {
      data.validityPeriods.forEach((period, index) => {
        if (!period.validityFrom) {
          newErrors.validityFrom = `Validity From is required for period ${
            index + 1
          }`;
        }
        if (!period.validityTo) {
          newErrors.validityTo = `Validity To is required for period ${
            index + 1
          }`;
        }
      });
    }
    // Validate minimum length for each room category
    hotelRoomsData.forEach((category) => {
      const roomData = data.hotelRooms.find(
        (room) => room.roomId === category.rommCategoryId.toString(),
      );
      if (!roomData || !roomData.minimumLength || roomData.minimumLength <= 0) {
        newErrors[`minimumLength_${category.rommCategoryId}`] =
          `Minimum Length is required for ${category.roomCategory}`;
      }
    });
    return newErrors;
  };

  const saveMinLength = async (e) => {
    e.preventDefault();
    const errors = validateMinForm(formDataMin);
    if (Object.keys(errors).length > 0) {
      setValidationErrorsMin(errors);
      return;
    }
    try {
      setIsLoading(true);
      const payload = {
        hotelId: id,
        marketTypeId: formDataMin.marketTypeId,
        validityPeriods: formDataMin.validityPeriods.map((period) => ({
          validityFrom: period.validityFrom
            ? `${period.validityFrom}:00`
            : period.validityFrom,
          validityTo: period.validityTo
            ? `${period.validityTo}:00`
            : period.validityTo,
        })),
        hotelRooms: hotelRoomsData.map((category) => {
          const roomData = formDataMin.hotelRooms.find(
            (room) => room.roomId === category.rommCategoryId.toString(),
          );
          return {
            roomId: category.rommCategoryId,
            minimumLength: Number(roomData?.minimumLength) || 0,
          };
        }),
      };
      console.log("Save Minimum Length Payload:", payload);
      const response = await axiosInstance.post(
        `/api/hotels/${id}/minimumlengths`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      if (response.data) {
        toast.success("Minimum Length Stay added Successfully!");
        setValidationErrorsMin({});
        await fetchMinLengthList(pageMin, searchMin);
        closeModalMin();
      }
    } catch (error) {
      console.error("Save min length error:", error);
      setError("Sorry! Data not saved to db..");
      toast.error(
        `Failed to save min length data: ${
          error.response?.data?.message || error.message
        }`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (searchTimeoutMin) {
      clearTimeout(searchTimeoutMin);
    }
    const timeout = setTimeout(() => {
      fetchMinLengthList(0, searchMin);
    }, 500);
    setSearchTimeoutMin(timeout);
    return () => {
      if (searchTimeoutMin) {
        clearTimeout(searchTimeoutMin);
      }
    };
  }, [searchMin]);

  const handleDeleteMin = async (item) => {
    console.log("Deleting minimum length item:", item);

    Swal.fire({
      titleText: `Are you sure? You want to delete minimum length for ${item.marketName}?`,
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
    }).then(async (result) => {
      // ✅ make callback async

      if (result.isConfirmed) {
        try {
          const itemId = item.minimumLengthId;
          const minDeleteRes = await axiosInstance.delete(
            `/api/hotels/${id}/minimumlengths/${itemId}`,
          );

          console.log("Minimum length delete response:", minDeleteRes);

          if (minDeleteRes.status === 200 || minDeleteRes.status === 204) {
            toast.success("Minimum Length deleted successfully");
            console.log("Delete successful, refreshing list...");

            // Force refresh the list by calling fetchMinLengthList
            await fetchMinLengthList(pageMin, searchMin);

            // Additional force update - remove the deleted item from state immediately
            setItemsMin((prevItems) =>
              prevItems.filter((item) => item.minimumLengthId !== itemId),
            );

            console.log("List refreshed after deletion");
          } else {
            toast.error("Sorry!! Minimum Length not deleted");
          }
        } catch (error) {
          console.error("Error deleting minimum length:", error);
          toast.error("Something went wrong while deleting minimum length");
        }
      }
    });
  };

  const handleViewMin = async (item) => {
    try {
      setIsLoading(true);
      console.log("View item:", item);
      console.log("Available fields:", Object.keys(item));
      console.log("Using ID:", item.id);

      // Try different possible ID fields
      const itemId = item.id || item.minimumLengthId || item.minLengthId;
      console.log("Final ID to use:", itemId);

      // Ensure hotelRoomsData is loaded first
      if (hotelRoomsData.length === 0) {
        console.log("Loading hotel rooms data first for view...");
        await loadHotelRoomDatas();
      }

      // Fetch detailed minimum length data from API
      const viewRes = await axiosInstance.get(
        `/api/hotels/${id}/minimumlengths/${itemId}`,
      );
      console.log("View API response:", viewRes.data);
      const data = viewRes.data;

      setEditingMin(data);
      setIsViewModeMin(true);

      // Map validity periods correctly - convert from yyyy-MM-dd'T'HH:mm:ss to yyyy-MM-dd for UI
      const mappedValidityPeriods = (data.validityPeriods || []).map(
        (period) => ({
          validityFrom: period.validityFrom
            ? period.validityFrom.substring(0, 16)
            : "",
          validityTo: period.validityTo
            ? period.validityTo.substring(0, 16)
            : "",
        }),
      );

      // Map hotel rooms correctly (same as edit)
      const mappedHotelRooms = (data.hotelRooms || []).map((room) => {
        const matchingCategory = hotelRoomsData.find(
          (cat) => cat.rommCategoryId === room.roomId,
        );
        console.log(`View mapping room ${room.roomId}:`, {
          roomData: room,
          matchingCategory: matchingCategory,
          categoryName: matchingCategory?.roomCategory,
        });

        return {
          roomId: room.roomId.toString(),
          roomCategory: matchingCategory?.roomCategory || `Room ${room.roomId}`,
          minimumLength: room.minimumLength || "",
        };
      });

      console.log("View mapped validity periods:", mappedValidityPeriods);
      console.log("View mapped hotel rooms:", mappedHotelRooms);
      console.log("Available hotel rooms data for view:", hotelRoomsData);

      setFormDataMin({
        marketTypeId: data.marketTypeId || "",
        validityPeriods:
          mappedValidityPeriods.length > 0
            ? mappedValidityPeriods
            : [{ validityFrom: "", validityTo: "" }],
        hotelRooms: mappedHotelRooms,
      });
      setValidationErrorsMin({});
      setShowModalMin(true);
    } catch (error) {
      console.error("Failed to load minimum length for view:", error);
      console.error("Error response:", error.response?.data);
      console.error("Error status:", error.response?.status);
      console.error("Error message:", error.message);
      toast.error(
        `Failed to load minimum length data for viewing: ${
          error.response?.data?.message || error.message
        }`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleLiveStatusMin = async (item) => {
    setSelectedItemMin(item);
    setShowLiveStatusModalMin(true);
  };

  const confirmLiveStatusChangeMin = async () => {
    console.log("=== CONFIRM LIVE STATUS CHANGE MIN ===");
    console.log("Toggling live status for:", selectedItemMin);
    console.log("Hotel ID from params:", id);
    console.log("Minimum Length ID:", selectedItemMin.minimumLengthId);

    if (!selectedItemMin) {
      console.error("No selected item found!");
      return;
    }

    try {
      setIsLoading(true);

      // Create payload matching the backend DTO structure
      const payload = {
        isLive: !selectedItemMin.status, // Toggle the current status
      };

      console.log("Sending payload:", payload);

      const res = await axiosInstance.patch(
        `/api/hotels/${id}/minimumlengths/${selectedItemMin.minimumLengthId}/status`,
        payload,
      );

      console.log("✅ API call successful!");
      console.log("API response:", res.data);

      if (res.data.isLive === true || res.data.isLive === "true") {
        toast.success("Minimum Length activated successfully");
      } else {
        toast.success("Minimum Length deactivated successfully");
      }

      // Refresh the minimum length list to show updated data
      await fetchMinLengthList(pageMin, searchMin);
      setShowLiveStatusModalMin(false);
      setSelectedItemMin(null);
    } catch (error) {
      console.error("❌ Error updating minimum length status:", error);

      // Handle different error types
      if (error.response?.status === 404) {
        toast.error("API endpoint not found. Please check the backend routes.");
      } else if (error.response?.status === 500) {
        toast.error("Server error. Please check the backend logs.");
      } else {
        toast.error(
          `Failed to update status: ${
            error.response?.data?.message || error.message
          }`,
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const closeLiveStatusModalMin = () => {
    setShowLiveStatusModalMin(false);
    setSelectedItemMin(null);
  };

  const handleTabSelect = (key) => {
    setActiveTab(key);

    // Call appropriate API based on selected tab
    if (key === "occupancy") {
      // Reset occupancy search and fetch data
      setSearchOcc("");
      setPageOcc(0);
      setItemsOcc([]); // Clear previous data
      fetchOccupancyList(0, "");
    } else if (key === "minlength") {
      // Reset minimum length search and fetch data
      setSearchMin("");
      setPageMin(0);
      setItemsMin([]); // Clear previous data
      fetchMinLengthList(0, "");
    }
  };

  const openAllOccupancy = () => {
    setShowAllOccModal(true);
  };

  const openAllMinLength = () => {
    setShowAllMinModal(true);
  };

  const closeAllOccModal = () => {
    setShowAllOccModal(false);
  };

  const closeAllMinModal = () => {
    setShowAllMinModal(false);
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <div className="d-flex align-items-center gap-3 mb-3">
            <Button
              variant="outline-primary"
              onClick={() => navigate(`/extranetDashboard`)}
              className="d-flex align-items-center btn-sm gap-2"
            >
              <FaArrowLeft />
              Back
            </Button>
            <h3 className="mb-0">Extranet Occupancy And Minimum Length</h3>
          </div>

          <Tabs
            activeKey={activeTab}
            onSelect={handleTabSelect}
            id="occupancy-tabs"
            className="mb-3"
          >
            <Tab eventKey="occupancy" title="Hotel Occupancy">
              <Card className="shadow-sm rounded-xl mb-3">
                <Card.Header className="d-flex justify-content-between align-items-center text-white">
                  <span
                    className="fw-semibold cursor-pointer text-primary"
                    // onClick={openAllOccupancy}
                    style={{ padding: "10px" }}
                  >
                    Occupancy
                  </span>
                  <Form.Group className="hotel-search-bar position-relative">
                    <Form.Control
                      type="text"
                      placeholder="Search occupancy..."
                      className="form-control-modern-sm"
                      value={searchOcc}
                      onChange={(e) => setSearchOcc(e.target.value)}
                    />
                  </Form.Group>
                  <Button
                    className="btn-green create-btn"
                    onClick={() => {
                      loadMarketTypes();
                      loadOccupancyTypes();
                      loadHotelRoomDatas();

                      setEditingOcc(null);
                      setIsViewModeOcc(false);
                      setShowModalOcc(true);
                    }}
                  >
                    + Create
                  </Button>
                </Card.Header>
                <Card.Body className="p-0">
                  <Table responsive hover striped className="mb-0 align-middle">
                    <thead>
                      <tr>
                        <th style={{ width: 100 }}>S/N</th>
                        <th>Hotel Name</th>
                        <th>Market Type</th>
                        <th>Status</th>
                        <th style={{ width: 160 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsOcc.map((item, index) => (
                        <tr key={item.occupancyId}>
                          <td>{index + 1 + pageOcc * 10}</td>
                          <td>{item.hotelName}</td>
                          <td>{item.marketTypeName}</td>
                          <td>
                            {item.isLive ? (
                              <Badge
                                bg="success"
                                style={{ cursor: "pointer" }}
                                onClick={() => handleLiveStatusOcc(item)}
                              >
                                Active
                              </Badge>
                            ) : (
                              <Badge
                                bg="danger"
                                style={{ cursor: "pointer" }}
                                onClick={() => handleLiveStatusOcc(item)}
                              >
                                Inactive
                              </Badge>
                            )}
                          </td>
                          <td>
                            <div className="d-flex gap-2">
                              <FaEdit
                                className="text-primary occupancyEdit"
                                style={{ cursor: "pointer", fontSize: "18px" }}
                                onClick={() => openEditOcc(item)}
                                title="Edit"
                              />
                              <FaEye
                                className="text-info view occupancyView"
                                style={{ cursor: "pointer", fontSize: "18px" }}
                                onClick={() => handleViewOcc(item)}
                                title="View"
                              />
                              <FaTrash
                                className="text-danger delete occupancyDelete"
                                style={{ cursor: "pointer", fontSize: "18px" }}
                                onClick={() => handleDeleteOcc(item)}
                                title="Delete"
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                      {isLoading && (
                        <tr>
                          <td
                            colSpan={5}
                            className="text-center text-muted py-4"
                          >
                            <div
                              className="spinner-border spinner-border-sm me-2"
                              role="status"
                            >
                              <span className="visually-hidden">
                                Loading...
                              </span>
                            </div>
                            Loading available occupancies...
                          </td>
                        </tr>
                      )}
                      {itemsOcc.length === 0 && !isLoading && (
                        <tr>
                          <td
                            colSpan={5}
                            className="text-center text-muted py-4"
                          >
                            No occupancies found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                  {totalPagesOcc > 1 && (
                    <div className="d-flex justify-content-between align-items-center p-3 border-top">
                      <div>
                        <small className="text-muted">
                          Showing {itemsOcc.length} of {totalPagesOcc * 10}{" "}
                          occupancies
                        </small>
                      </div>
                      <div>
                        <Pagination className="mb-0">
                          <Pagination.Prev
                            disabled={pageOcc === 0}
                            onClick={() =>
                              fetchOccupancyList(pageOcc - 1, searchOcc)
                            }
                          />
                          {[...Array(totalPagesOcc).keys()].map((num) => (
                            <Pagination.Item
                              key={num}
                              active={num === pageOcc}
                              onClick={() => fetchOccupancyList(num, searchOcc)}
                            >
                              {num + 1}
                            </Pagination.Item>
                          ))}
                          <Pagination.Next
                            disabled={pageOcc === totalPagesOcc - 1}
                            onClick={() =>
                              fetchOccupancyList(pageOcc + 1, searchOcc)
                            }
                          />
                        </Pagination>
                      </div>
                    </div>
                  )}
                </Card.Body>
              </Card>
              <Modal
                show={showAllOccModal}
                onHide={closeAllOccModal}
                centered
                size="xl"
                backdrop="static"
                keyboard={false}
              >
                <Modal.Header closeButton>
                  <Modal.Title>All Occupancies</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                  <Table striped bordered hover responsive>
                    <thead>
                      <tr>
                        <th>S/N</th>
                        <th>Occupancy ID</th>
                        <th>Hotel Name</th>
                        <th>Market Type</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsOcc.map((item, index) => (
                        <tr key={item.occupancyId}>
                          <td>{index + 1 + pageOcc * 10}</td>
                          <td>{item.occupancyId}</td>
                          <td>{item.hotelName}</td>
                          <td>{item.marketTypeName}</td>
                          <td>{item.isLive ? "Active" : "Inactive"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="secondary" onClick={closeAllOccModal}>
                    Close
                  </Button>
                </Modal.Footer>
              </Modal>
              <Modal
                show={showModalOcc}
                onHide={closeModalOcc}
                centered
                size="lg"
                backdrop="static"
                keyboard={false}
              >
                <Modal.Header closeButton={!isLoading}>
                  <Modal.Title>
                    {isViewModeOcc
                      ? "View Occupancy"
                      : editingOcc
                        ? "Update Occupancy"
                        : "Create Occupancy"}
                  </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                  <Form>
                    <Row>
                      <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>
                            Market Type <span className="text-danger">*</span>
                          </Form.Label>
                          <SearchableSelect
                            options={marketTypes}
                            value={formDataOcc.marketTypeId || ""}
                            onChange={(e) =>
                              setFormDataOcc({
                                ...formDataOcc,
                                marketTypeId: e.target.value,
                              })
                            }
                            placeholder="Select market type"
                            name="marketTypeId"
                            isInvalid={!!validationErrorsOcc.marketTypeId}
                            disabled={isViewModeOcc}
                          />
                          {validationErrorsOcc.marketTypeId && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrorsOcc.marketTypeId}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                      </Col>
                    </Row>
                    {/* Validity Periods Section */}
                    <Card className="mb-3">
                      <Card.Header>Validity Periods</Card.Header>
                      <Card.Body>
                        {formDataOcc.validityPeriods.map((period, index) => (
                          <Row key={index} className="mb-3">
                            <Col md={5}>
                              <Form.Group>
                                <Form.Label>
                                  Validity From{" "}
                                  <span className="text-danger">*</span>
                                </Form.Label>
                                <Form.Control
                                  type="datetime-local"
                                  value={period.validityFrom || ""}
                                  onChange={(e) => {
                                    const newPeriods = [
                                      ...formDataOcc.validityPeriods,
                                    ];
                                    newPeriods[index].validityFrom =
                                      e.target.value;

                                    // Clear Validity To if it becomes invalid (before or equal to From date)
                                    const currentToDate =
                                      formDataOcc.validityPeriods[index]
                                        .validityTo;
                                    if (
                                      currentToDate &&
                                      e.target.value &&
                                      new Date(currentToDate) <=
                                        new Date(e.target.value)
                                    ) {
                                      newPeriods[index].validityTo = "";
                                    }

                                    setFormDataOcc({
                                      ...formDataOcc,
                                      validityPeriods: newPeriods,
                                    });
                                  }}
                                  disabled={isViewModeOcc}
                                  isInvalid={!!validationErrorsOcc.validityFrom}
                                />
                                {validationErrorsOcc.validityFrom && (
                                  <Form.Control.Feedback type="invalid">
                                    {validationErrorsOcc.validityFrom}
                                  </Form.Control.Feedback>
                                )}
                              </Form.Group>
                            </Col>
                            <Col md={5}>
                              <Form.Group>
                                <Form.Label>
                                  Validity To{" "}
                                  <span className="text-danger">*</span>
                                </Form.Label>
                                <Form.Control
                                  type="datetime-local"
                                  value={period.validityTo || ""}
                                  min={getMinValidityToDate(
                                    period.validityFrom,
                                  )}
                                  onChange={(e) => {
                                    const newPeriods = [
                                      ...formDataOcc.validityPeriods,
                                    ];
                                    newPeriods[index].validityTo =
                                      e.target.value;
                                    setFormDataOcc({
                                      ...formDataOcc,
                                      validityPeriods: newPeriods,
                                    });
                                  }}
                                  disabled={isViewModeOcc}
                                  isInvalid={!!validationErrorsOcc.validityTo}
                                />
                                {validationErrorsOcc.validityTo && (
                                  <Form.Control.Feedback type="invalid">
                                    {validationErrorsOcc.validityTo}
                                  </Form.Control.Feedback>
                                )}
                              </Form.Group>
                            </Col>
                            {!isViewModeOcc &&
                              formDataOcc.validityPeriods.length > 1 && (
                                <Col
                                  md={2}
                                  className="d-flex align-items-end pb-2"
                                >
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => {
                                      const newPeriods =
                                        formDataOcc.validityPeriods.filter(
                                          (_, i) => i !== index,
                                        );
                                      setFormDataOcc({
                                        ...formDataOcc,
                                        validityPeriods: newPeriods,
                                      });
                                    }}
                                  >
                                    Remove
                                  </Button>
                                </Col>
                              )}
                          </Row>
                        ))}
                        {!isViewModeOcc && (
                          <Button
                            className="mb-3 addValidityBtn"
                            variant="primary"
                            size="sm"
                            onClick={() =>
                              setFormDataOcc({
                                ...formDataOcc,
                                validityPeriods: [
                                  ...formDataOcc.validityPeriods,
                                  { validityFrom: "", validityTo: "" },
                                ],
                              })
                            }
                          >
                            Add Validity Period
                          </Button>
                        )}
                      </Card.Body>
                    </Card>
                    {/* Hotel Rooms Section */}
                    {formDataOcc.hotelRooms.map((room, roomIndex) => (
                      <Card className="mb-3" key={roomIndex}>
                        <Card.Header>
                          <div className="d-flex justify-content-between align-items-center">
                            <span>
                              {hotelRoomsData[roomIndex]?.roomCategory
                                ? hotelRoomsData[
                                    roomIndex
                                  ].roomCategory.toUpperCase()
                                : `Room ${roomIndex + 1}`}
                            </span>
                            {hotelRoomsData[roomIndex]?.roomTypeDetailsDTOs && (
                              <div className="text-muted small">
                                Room Types:{" "}
                                {hotelRoomsData[roomIndex].roomTypeDetailsDTOs
                                  .map((rt) => rt.roomTypeName)
                                  .join(", ")}
                              </div>
                            )}
                          </div>
                        </Card.Header>
                        <Card.Body>
                          {(room.roomOccupancies || []).map((occ, occIndex) => (
                            <Row key={occIndex} className="mb-3">
                              {/* Occupancy Type */}
                              <Col md={2}>
                                <Form.Group>
                                  <Form.Label>Occupancy Type</Form.Label>
                                  <Form.Select
                                    value={occ.occupancyTypeId || ""}
                                    onChange={(e) => {
                                      const newRooms = [
                                        ...formDataOcc.hotelRooms,
                                      ];
                                      newRooms[roomIndex].roomOccupancies[
                                        occIndex
                                      ].occupancyTypeId = e.target.value;
                                      setFormDataOcc({
                                        ...formDataOcc,
                                        hotelRooms: newRooms,
                                      });
                                    }}
                                    name="occupancyTypeId"
                                    isInvalid={
                                      !!validationErrorsOcc.occupancyTypeId
                                    }
                                    disabled={isViewModeOcc}
                                  >
                                    <option value="">Select</option>
                                    {occupancyTypes.map((type) => (
                                      <option
                                        key={type.occupancyTypeId}
                                        value={type.occupancyTypeId}
                                      >
                                        {type.occupancy}
                                      </option>
                                    ))}
                                  </Form.Select>
                                  {validationErrorsOcc.occupancyTypeId && (
                                    <Form.Control.Feedback type="invalid">
                                      {validationErrorsOcc.occupancyTypeId}
                                    </Form.Control.Feedback>
                                  )}
                                </Form.Group>
                              </Col>
                              {/* Total Adults */}
                              <Col md={2}>
                                <Form.Group>
                                  <Form.Label>Total Adults</Form.Label>
                                  <Form.Control
                                    type="number"
                                    value={occ.totalAdult || 0}
                                    onChange={(e) => {
                                      const newRooms = [
                                        ...formDataOcc.hotelRooms,
                                      ];
                                      newRooms[roomIndex].roomOccupancies[
                                        occIndex
                                      ].totalAdult = e.target.value;
                                      setFormDataOcc({
                                        ...formDataOcc,
                                        hotelRooms: newRooms,
                                      });
                                    }}
                                    disabled={isViewModeOcc}
                                  />
                                </Form.Group>
                              </Col>
                              {/* Total Children */}
                              <Col md={2}>
                                <Form.Group>
                                  <Form.Label>Total Children</Form.Label>
                                  <Form.Control
                                    type="number"
                                    value={occ.totalChild || 0}
                                    onChange={(e) => {
                                      const newRooms = [
                                        ...formDataOcc.hotelRooms,
                                      ];
                                      newRooms[roomIndex].roomOccupancies[
                                        occIndex
                                      ].totalChild = e.target.value;
                                      setFormDataOcc({
                                        ...formDataOcc,
                                        hotelRooms: newRooms,
                                      });
                                    }}
                                    disabled={isViewModeOcc}
                                  />
                                </Form.Group>
                              </Col>
                              {/* Extra Adults */}
                              <Col md={2}>
                                <Form.Group>
                                  <Form.Label>Extra Adults</Form.Label>
                                  <Form.Control
                                    type="number"
                                    value={occ.extraAdult || 0}
                                    onChange={(e) => {
                                      const newRooms = [
                                        ...formDataOcc.hotelRooms,
                                      ];
                                      newRooms[roomIndex].roomOccupancies[
                                        occIndex
                                      ].extraAdult = e.target.value;
                                      setFormDataOcc({
                                        ...formDataOcc,
                                        hotelRooms: newRooms,
                                      });
                                    }}
                                    disabled={isViewModeOcc}
                                  />
                                </Form.Group>
                              </Col>
                              {/* Extra Children */}
                              <Col md={2}>
                                <Form.Group>
                                  <Form.Label>Extra Children</Form.Label>
                                  <Form.Control
                                    type="number"
                                    value={occ.extraChild || 0}
                                    onChange={(e) => {
                                      const newRooms = [
                                        ...formDataOcc.hotelRooms,
                                      ];
                                      newRooms[roomIndex].roomOccupancies[
                                        occIndex
                                      ].extraChild = e.target.value;
                                      setFormDataOcc({
                                        ...formDataOcc,
                                        hotelRooms: newRooms,
                                      });
                                    }}
                                    disabled={isViewModeOcc}
                                  />
                                </Form.Group>
                              </Col>
                              {/* Remove Occupancy Button */}
                              {!isViewModeOcc &&
                                room.roomOccupancies.length > 1 && (
                                  <Col
                                    md={1}
                                    className="d-flex align-items-end pb-2"
                                  >
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      onClick={() => {
                                        const newRooms = [
                                          ...formDataOcc.hotelRooms,
                                        ];
                                        newRooms[roomIndex].roomOccupancies =
                                          newRooms[
                                            roomIndex
                                          ].roomOccupancies.filter(
                                            (_, i) => i !== occIndex,
                                          );
                                        setFormDataOcc({
                                          ...formDataOcc,
                                          hotelRooms: newRooms,
                                        });
                                      }}
                                    >
                                      Remove
                                    </Button>
                                  </Col>
                                )}
                            </Row>
                          ))}
                          {/* Add Occupancy Button */}
                          {!isViewModeOcc && (
                            <Button
                              className="mt-2"
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                const newRooms = [...formDataOcc.hotelRooms];
                                newRooms[roomIndex].roomOccupancies.push({
                                  occupancyTypeId: "",
                                  totalAdult: 0,
                                  totalChild: 0,
                                  extraAdult: 0,
                                  extraChild: 0,
                                });
                                setFormDataOcc({
                                  ...formDataOcc,
                                  hotelRooms: newRooms,
                                });
                              }}
                            >
                              Add Occupancy
                            </Button>
                          )}
                        </Card.Body>
                      </Card>
                    ))}
                  </Form>
                  {error && <div className="text-danger mt-3">{error}</div>}
                </Modal.Body>
                <Modal.Footer>
                  <Button
                    variant="secondary"
                    onClick={closeModalOcc}
                    disabled={isLoading}
                  >
                    {isViewModeOcc ? "Close" : "Cancel"}
                  </Button>
                  {!isViewModeOcc && (
                    <Button
                      variant="primary"
                      onClick={editingOcc ? handleEditOcc : saveOccupancy}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <span
                            className="spinner-border spinner-border-sm me-2"
                            role="status"
                            aria-hidden="true"
                          ></span>
                          {editingOcc ? "Updating..." : "Saving..."}
                        </>
                      ) : editingOcc ? (
                        "Update"
                      ) : (
                        "Save"
                      )}
                    </Button>
                  )}
                </Modal.Footer>
              </Modal>
              <Modal
                show={showLiveStatusModalOcc}
                onHide={closeLiveStatusModalOcc}
                centered
                size="sm"
                backdrop="static"
                keyboard={false}
              >
                <Modal.Header closeButton={!isLoading}>
                  <Modal.Title>Confirm Status Change</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                  <p>
                    Are you sure you want to{" "}
                    {selectedItemOcc?.isLive ? "deactivate" : "activate"} this
                    occupancy?
                  </p>
                </Modal.Body>
                <Modal.Footer>
                  <Button
                    variant="secondary"
                    onClick={closeLiveStatusModalOcc}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={confirmLiveStatusChangeOcc}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                          aria-hidden="true"
                        ></span>
                        Processing...
                      </>
                    ) : (
                      "Confirm"
                    )}
                  </Button>
                </Modal.Footer>
              </Modal>
            </Tab>
            <Tab eventKey="minlength" title="Minimum Length">
              <Card className="shadow-sm rounded-xl mb-3">
                <Card.Header className="d-flex justify-content-between align-items-center text-white">
                  <span
                    className="fw-semibold cursor-pointer text-primary"
                    onClick={openAllMinLength}
                    style={{ padding: "10px" }}
                  >
                    Minimum Length
                  </span>
                  <Form.Group className="hotel-search-bar position-relative">
                    <Form.Control
                      type="text"
                      placeholder="Search minimum length..."
                      value={searchMin}
                      onChange={(e) => setSearchMin(e.target.value)}
                      className="d-inline-block w-auto"
                    />
                  </Form.Group>
                  <Button
                    className="btn-green create-btn"
                    onClick={openCreateMin}
                  >
                    + Create
                  </Button>
                </Card.Header>
                <Card.Body className="p-0">
                  <Table striped bordered hover responsive>
                    <thead>
                      <tr>
                        <th style={{ width: 100 }}>S/N</th>
                        <th>Market Type</th>
                        <th>Status</th>
                        <th style={{ width: 160 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsMin.map((item, index) => (
                        <tr key={item.id}>
                          <td>{index + 1 + pageMin * 10}</td>
                          <td>{item.marketName}</td>

                          <td>
                            {item.status ? (
                              <Badge
                                bg="success"
                                style={{ cursor: "pointer" }}
                                onClick={() => handleLiveStatusMin(item)}
                              >
                                Active
                              </Badge>
                            ) : (
                              <Badge
                                bg="danger"
                                style={{ cursor: "pointer" }}
                                onClick={() => handleLiveStatusMin(item)}
                              >
                                Inactive
                              </Badge>
                            )}
                          </td>
                          <td>
                            <div className="d-flex gap-2">
                              <FaEdit
                                className="text-primary minLengthEdit"
                                style={{ cursor: "pointer", fontSize: "18px" }}
                                onClick={() => openEditMin(item)}
                                title="Edit"
                              />
                              <FaEye
                                className="text-info view minLengthView"
                                style={{ cursor: "pointer", fontSize: "18px" }}
                                onClick={() => handleViewMin(item)}
                                title="View"
                              />
                              <FaTrash
                                className="text-danger delete minLengthDelete"
                                style={{ cursor: "pointer", fontSize: "18px" }}
                                onClick={() => handleDeleteMin(item)}
                                title="Delete"
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                      {isLoading && (
                        <tr>
                          <td
                            colSpan={4}
                            className="text-center text-muted py-4"
                          >
                            <div
                              className="spinner-border spinner-border-sm me-2"
                              role="status"
                            >
                              <span className="visually-hidden">
                                Loading...
                              </span>
                            </div>
                            Loading minimum lengths...
                          </td>
                        </tr>
                      )}
                      {itemsMin.length === 0 && !isLoading && (
                        <tr>
                          <td
                            colSpan={4}
                            className="text-center text-muted py-4"
                          >
                            No minimum lengths found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                  {totalPagesMin > 1 && (
                    <div className="d-flex justify-content-between align-items-center p-3 border-top">
                      <div>
                        <small className="text-muted">
                          Showing {itemsMin.length} of {totalPagesMin * 10}{" "}
                          minimum lengths
                        </small>
                      </div>
                      <div>
                        <Pagination className="mb-0">
                          <Pagination.Prev
                            disabled={pageMin === 0}
                            onClick={() =>
                              fetchMinLengthList(pageMin - 1, searchMin)
                            }
                          />
                          {[...Array(totalPagesMin).keys()].map((num) => (
                            <Pagination.Item
                              key={num}
                              active={num === pageMin}
                              onClick={() => fetchMinLengthList(num, searchMin)}
                            >
                              {num + 1}
                            </Pagination.Item>
                          ))}
                          <Pagination.Next
                            disabled={pageMin === totalPagesMin - 1}
                            onClick={() =>
                              fetchMinLengthList(pageMin + 1, searchMin)
                            }
                          />
                        </Pagination>
                      </div>
                    </div>
                  )}
                </Card.Body>
              </Card>
              <Modal
                show={showAllMinModal}
                onHide={closeAllMinModal}
                centered
                size="lg"
                backdrop="static"
                keyboard={false}
              >
                <Modal.Header closeButton>
                  <Modal.Title>All Minimum Lengths</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                  <Table striped bordered hover responsive>
                    <thead>
                      <tr>
                        <th>S/N</th>
                        <th>Market</th>
                        <th>Min Length</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsMin.map((item, index) => (
                        <tr key={item.id}>
                          <td>{index + 1 + pageMin * 10}</td>
                          <td>{item.market}</td>
                          <td>{item.minLength}</td>
                          <td>{item.isLive ? "Active" : "Inactive"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="secondary" onClick={closeAllMinModal}>
                    Close
                  </Button>
                </Modal.Footer>
              </Modal>
              <Modal
                show={showModalMin}
                onHide={closeModalMin}
                centered
                size="lg"
                backdrop="static"
                keyboard={false}
              >
                <Modal.Header closeButton>
                  <Modal.Title>
                    {isViewModeMin
                      ? "View Hotel Minimum Length Stay"
                      : editingMin
                        ? "Update Hotel Minimum Length Stay"
                        : "Create Hotel Minimum Length Stay"}
                  </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                  <Form>
                    {/* MarketType Section */}
                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>
                            MarketType <span className="text-danger">*</span>
                          </Form.Label>
                          <SearchableSelect
                            options={marketTypes}
                            value={formDataMin.marketTypeId || ""}
                            onChange={(e) =>
                              setFormDataMin({
                                ...formDataMin,
                                marketTypeId: e.target.value,
                              })
                            }
                            placeholder="SELECT"
                            name="marketTypeId"
                            isInvalid={!!validationErrorsMin.marketTypeId}
                            disabled={isViewModeMin}
                          />
                          {validationErrorsMin.marketTypeId && (
                            <Form.Control.Feedback type="invalid">
                              {validationErrorsMin.marketTypeId}
                            </Form.Control.Feedback>
                          )}
                        </Form.Group>
                      </Col>
                    </Row>

                    {/* Validity List Section */}
                    <Card className="mb-3">
                      <Card.Header>Validity List</Card.Header>
                      <Card.Body>
                        {formDataMin.validityPeriods.map((period, index) => (
                          <Row key={index} className="mb-3">
                            <Col md={5}>
                              <Form.Group>
                                <Form.Label>
                                  Validity From{" "}
                                  <span className="text-danger">*</span>
                                </Form.Label>
                                <Form.Control
                                  type="datetime-local"
                                  value={period.validityFrom || ""}
                                  onChange={(e) => {
                                    const newValidityPeriods = [
                                      ...formDataMin.validityPeriods,
                                    ];
                                    newValidityPeriods[index].validityFrom =
                                      e.target.value;

                                    // Clear Validity To if it becomes invalid (before or equal to From date)
                                    const currentToDate =
                                      formDataMin.validityPeriods[index]
                                        .validityTo;
                                    if (
                                      currentToDate &&
                                      e.target.value &&
                                      new Date(currentToDate) <=
                                        new Date(e.target.value)
                                    ) {
                                      newValidityPeriods[index].validityTo = "";
                                    }

                                    setFormDataMin({
                                      ...formDataMin,
                                      validityPeriods: newValidityPeriods,
                                    });
                                  }}
                                  disabled={isViewModeMin}
                                  isInvalid={!!validationErrorsMin.validityFrom}
                                />
                                {validationErrorsMin.validityFrom && (
                                  <Form.Control.Feedback type="invalid">
                                    {validationErrorsMin.validityFrom}
                                  </Form.Control.Feedback>
                                )}
                              </Form.Group>
                            </Col>
                            <Col md={5}>
                              <Form.Group>
                                <Form.Label>
                                  Validity To{" "}
                                  <span className="text-danger">*</span>
                                </Form.Label>
                                <Form.Control
                                  type="datetime-local"
                                  value={period.validityTo || ""}
                                  min={getMinValidityToDate(
                                    period.validityFrom,
                                  )}
                                  onChange={(e) => {
                                    const newValidityPeriods = [
                                      ...formDataMin.validityPeriods,
                                    ];
                                    newValidityPeriods[index].validityTo =
                                      e.target.value;
                                    setFormDataMin({
                                      ...formDataMin,
                                      validityPeriods: newValidityPeriods,
                                    });
                                  }}
                                  disabled={isViewModeMin}
                                  isInvalid={!!validationErrorsMin.validityTo}
                                />
                                {validationErrorsMin.validityTo && (
                                  <Form.Control.Feedback type="invalid">
                                    {validationErrorsMin.validityTo}
                                  </Form.Control.Feedback>
                                )}
                              </Form.Group>
                            </Col>
                            {!isViewModeMin &&
                              formDataMin.validityPeriods.length > 1 && (
                                <Col
                                  md={2}
                                  className="d-flex align-items-end pb-2"
                                >
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => {
                                      const newValidityPeriods =
                                        formDataMin.validityPeriods.filter(
                                          (_, i) => i !== index,
                                        );
                                      setFormDataMin({
                                        ...formDataMin,
                                        validityPeriods: newValidityPeriods,
                                      });
                                    }}
                                  >
                                    <FaTrash size={10} />
                                  </Button>
                                </Col>
                              )}
                          </Row>
                        ))}
                        {!isViewModeMin && (
                          <Button
                            className="mb-3"
                            variant="primary"
                            size="sm"
                            onClick={() =>
                              setFormDataMin({
                                ...formDataMin,
                                validityPeriods: [
                                  ...formDataMin.validityPeriods,
                                  { validityFrom: "", validityTo: "" },
                                ],
                              })
                            }
                          >
                            + Add Validity Period
                          </Button>
                        )}
                      </Card.Body>
                    </Card>

                    {/* Minimum Length Stay Section */}
                    <Card className="mb-3">
                      <Card.Header>Minimum Length Stay</Card.Header>
                      <Card.Body>
                        {hotelRoomsData.map((category, index) => (
                          <Row key={category.rommCategoryId} className="mb-3">
                            <Col md={6}>
                              <Form.Group>
                                <Form.Label>Room Category</Form.Label>
                                <Form.Control
                                  value={category.roomCategory}
                                  readOnly
                                  className="bg-light"
                                />
                              </Form.Group>
                            </Col>
                            <Col md={4}>
                              <Form.Group>
                                <Form.Label>
                                  Minimum Length{" "}
                                  <span className="text-danger">*</span>
                                </Form.Label>
                                <Form.Control
                                  type="number"
                                  value={(() => {
                                    const roomData =
                                      formDataMin.hotelRooms.find(
                                        (room) =>
                                          room.roomId ===
                                          category.rommCategoryId.toString(),
                                      );
                                    console.log(
                                      `Finding minimum length for category ${category.rommCategoryId}:`,
                                      {
                                        categoryId: category.rommCategoryId,
                                        roomData: roomData,
                                        minimumLength: roomData?.minimumLength,
                                      },
                                    );
                                    return roomData?.minimumLength || "";
                                  })()}
                                  onChange={(e) => {
                                    const newHotelRooms = [
                                      ...formDataMin.hotelRooms,
                                    ];
                                    const existingRoomIndex =
                                      newHotelRooms.findIndex(
                                        (room) =>
                                          room.roomId ===
                                          category.rommCategoryId.toString(),
                                      );

                                    if (existingRoomIndex >= 0) {
                                      // Update existing room
                                      newHotelRooms[
                                        existingRoomIndex
                                      ].minimumLength = e.target.value;
                                    } else {
                                      // Add new room
                                      newHotelRooms.push({
                                        roomId:
                                          category.rommCategoryId.toString(),
                                        roomCategory: category.roomCategory,
                                        minimumLength: e.target.value,
                                      });
                                    }

                                    setFormDataMin({
                                      ...formDataMin,
                                      hotelRooms: newHotelRooms,
                                    });
                                  }}
                                  placeholder="Enter minimum length"
                                  disabled={isViewModeMin}
                                  isInvalid={
                                    !!validationErrorsMin[
                                      `minimumLength_${category.rommCategoryId}`
                                    ]
                                  }
                                />
                                {validationErrorsMin[
                                  `minimumLength_${category.rommCategoryId}`
                                ] && (
                                  <Form.Control.Feedback type="invalid">
                                    {
                                      validationErrorsMin[
                                        `minimumLength_${category.rommCategoryId}`
                                      ]
                                    }
                                  </Form.Control.Feedback>
                                )}
                              </Form.Group>
                            </Col>
                          </Row>
                        ))}
                      </Card.Body>
                    </Card>
                  </Form>
                  {error && <div className="text-danger mt-3">{error}</div>}
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="danger" onClick={closeModalMin}>
                    <i className="fas fa-times me-2"></i>
                    {isViewModeMin ? "Close" : "Cancel"}
                  </Button>
                  {!isViewModeMin && (
                    <Button
                      variant="success"
                      onClick={editingMin ? handleEditMin : saveMinLength}
                      disabled={isLoading}
                    >
                      <i className="fas fa-arrow-right me-2"></i>
                      {isLoading
                        ? editingMin
                          ? "Updating..."
                          : "Creating..."
                        : editingMin
                          ? "Update"
                          : "Create"}
                    </Button>
                  )}
                  {!isViewModeMin && (
                    <Button
                      variant="info"
                      onClick={() => {
                        setFormDataMin({
                          marketTypeId: "",
                          validityPeriods: [
                            { validityFrom: "", validityTo: "" },
                          ],
                          hotelRooms: [], // Reset to empty array
                        });
                        setValidationErrorsMin({});
                      }}
                    >
                      <i className="fas fa-refresh me-2"></i>
                      Reset
                    </Button>
                  )}
                </Modal.Footer>
              </Modal>
              <Modal
                show={showLiveStatusModalMin}
                onHide={closeLiveStatusModalMin}
                centered
                size="sm"
                backdrop="static"
                keyboard={false}
              >
                <Modal.Header closeButton={!isLoading}>
                  <Modal.Title>Confirm Status Change</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                  {selectedItemMin && (
                    <div className="text-center">
                      <p className="mb-3">
                        Are you sure you want to{" "}
                        <strong
                          className={
                            selectedItemMin.status
                              ? "text-danger"
                              : "text-success"
                          }
                        >
                          {selectedItemMin.status ? "deactivate" : "activate"}
                        </strong>{" "}
                        this minimum length?
                      </p>
                    </div>
                  )}
                </Modal.Body>
                <Modal.Footer className="justify-content-between">
                  <Button
                    variant="secondary"
                    onClick={closeLiveStatusModalMin}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant={selectedItemMin?.status ? "danger" : "success"}
                    onClick={confirmLiveStatusChangeMin}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                          aria-hidden="true"
                        ></span>
                        Processing...
                      </>
                    ) : selectedItemMin?.status ? (
                      "Deactivate"
                    ) : (
                      "Activate"
                    )}
                  </Button>
                </Modal.Footer>
              </Modal>
            </Tab>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default ExtranetOccupancyAndMinimumLength;
