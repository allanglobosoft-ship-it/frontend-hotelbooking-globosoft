import React, { useEffect, useRef, useState } from "react";
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
} from "react-bootstrap";
import Select from "react-select";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/TopBar";
import axiosInstance from "../components/AxiosInstance";
import { toast } from "react-hot-toast";
import { FaEye } from "react-icons/fa";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { isAbsoluteHttpUrl } from "../utils/urlSafety";

// ───────────────────────────────────────────────────────────────────────
// Date-time picker with explicit OK / Cancel — ported from
// OccupancyAndMinimumLength.jsx so date & time entry stays uniform across
// the app. Supports month/year selection and typing the time directly.
// Value in/out is the "YYYY-MM-DDTHH:mm" string; the backend gets it with
// ":00" seconds appended.
// ───────────────────────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, "0");

const parseLocalDateTime = (str) => {
  if (!str) return null;
  const [datePart, timePart = "00:00"] = str.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, hh || 0, mm || 0);
};

const formatLocalDateTime = (date) => {
  if (!date) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate(),
  )}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 31 }, (_, i) => CURRENT_YEAR - 10 + i);

const formatDisplay = (date) => {
  if (!date) return "";
  const h24 = date.getHours();
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()} ${pad2(
    h12,
  )}:${pad2(date.getMinutes())} ${ampm}`;
};

const sameDay = (a, b) =>
  !!a &&
  !!b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const buildCalendar = (view) => {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
};

const DateTimeApplyPicker = ({
  value,
  onApply,
  disabled = false,
  isInvalid = false,
  minDate,
  placeholder = "Select date & time",
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(parseLocalDateTime(value));
  const [viewDate, setViewDate] = useState(
    parseLocalDateTime(value) || new Date(),
  );
  const wrapRef = useRef(null);
  const popupRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [hourText, setHourText] = useState("");
  const [minuteText, setMinuteText] = useState("");

  useEffect(() => {
    setDraft(parseLocalDateTime(value));
  }, [value]);

  const computePos = () => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const W = 470;
    const H = 360;
    let left = r.left;
    if (left + W > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - W - 8);
    }
    let top = r.bottom + 4;
    if (top + H > window.innerHeight - 8) {
      const above = r.top - H - 4;
      top = above > 8 ? above : Math.max(8, window.innerHeight - H - 8);
    }
    setPos({ top, left });
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (e) => {
      const inInput = wrapRef.current && wrapRef.current.contains(e.target);
      const inPopup = popupRef.current && popupRef.current.contains(e.target);
      if (!inInput && !inPopup) {
        setDraft(parseLocalDateTime(value));
        setOpen(false);
      }
    };
    const onReflow = () => computePos();
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, value]);

  const openPicker = () => {
    if (disabled) return;
    const init = parseLocalDateTime(value) || new Date();
    init.setSeconds(0, 0);
    setDraft(init);
    setViewDate(init);
    computePos();
    setOpen(true);
  };

  const handleApply = () => {
    onApply(formatLocalDateTime(draft));
    setOpen(false);
  };

  const handleCancel = () => {
    setDraft(parseLocalDateTime(value));
    setOpen(false);
  };

  const handleClear = () => {
    setDraft(null);
    onApply("");
    setOpen(false);
  };

  const draftHour24 = draft ? draft.getHours() : 0;
  const draftAmPm = draftHour24 >= 12 ? "PM" : "AM";
  const draftHour12 = draftHour24 % 12 === 0 ? 12 : draftHour24 % 12;
  const draftMinute = draft ? draft.getMinutes() : 0;

  useEffect(() => {
    setHourText(pad2(draftHour12));
    setMinuteText(pad2(draftMinute));
  }, [draftHour12, draftMinute]);

  const ensureDraft = () => {
    const base = draft ? new Date(draft) : new Date();
    base.setSeconds(0, 0);
    return base;
  };

  const stepHour = (delta) => {
    const base = ensureDraft();
    base.setHours((base.getHours() + delta + 24) % 24);
    setDraft(base);
  };

  const stepMinute = (delta) => {
    const base = ensureDraft();
    base.setMinutes((base.getMinutes() + delta + 60) % 60);
    setDraft(base);
  };

  const setAmPm = (ampm) => {
    const base = ensureDraft();
    const isPM = base.getHours() >= 12;
    if (ampm === "PM" && !isPM) base.setHours(base.getHours() + 12);
    if (ampm === "AM" && isPM) base.setHours(base.getHours() - 12);
    setDraft(base);
  };

  const commitHour = () => {
    const h = parseInt(hourText.replace(/\D/g, ""), 10);
    if (Number.isNaN(h)) {
      setHourText(pad2(draftHour12));
      return;
    }
    const clamped = Math.min(12, Math.max(1, h));
    const base = ensureDraft();
    base.setHours((clamped % 12) + (draftAmPm === "PM" ? 12 : 0));
    setDraft(base);
  };

  const commitMinute = () => {
    const m = parseInt(minuteText.replace(/\D/g, ""), 10);
    if (Number.isNaN(m)) {
      setMinuteText(pad2(draftMinute));
      return;
    }
    const clamped = Math.min(59, Math.max(0, m));
    const base = ensureDraft();
    base.setMinutes(clamped);
    setDraft(base);
  };

  const setMonth = (m) =>
    setViewDate((prev) => new Date(prev.getFullYear(), m, 1));
  const setYear = (y) => setViewDate((prev) => new Date(y, prev.getMonth(), 1));

  const selectDay = (day) => {
    if (minDate && startOfDay(day) < startOfDay(minDate)) return;
    const base = ensureDraft();
    base.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    setDraft(base);
  };

  const gotoMonth = (delta) => {
    setViewDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1),
    );
  };

  const committed = parseLocalDateTime(value);
  const days = buildCalendar(viewDate);

  return (
    <div className="cdt" ref={wrapRef}>
      <input
        type="text"
        readOnly
        value={formatDisplay(committed)}
        placeholder={placeholder}
        onClick={openPicker}
        disabled={disabled}
        className={`form-control ${isInvalid ? "is-invalid" : ""}`}
        autoComplete="off"
      />

      {open &&
        !disabled &&
        createPortal(
          <div
            className="cdt-popup"
            ref={popupRef}
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="cdt-body">
              <div className="cdt-cal">
                <div className="cdt-cal-head">
                  <button
                    type="button"
                    className="cdt-nav"
                    onClick={() => gotoMonth(-1)}
                    aria-label="Previous month"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="cdt-cal-selects">
                    <select
                      className="cdt-select"
                      value={viewDate.getMonth()}
                      onChange={(e) => setMonth(Number(e.target.value))}
                    >
                      {MONTHS.map((m, i) => (
                        <option key={m} value={i}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      className="cdt-select"
                      value={viewDate.getFullYear()}
                      onChange={(e) => setYear(Number(e.target.value))}
                    >
                      {YEARS.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="cdt-nav"
                    onClick={() => gotoMonth(1)}
                    aria-label="Next month"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
                <div className="cdt-grid cdt-grid-dow">
                  {WEEKDAYS.map((d) => (
                    <span key={d} className="cdt-dow">
                      {d}
                    </span>
                  ))}
                </div>
                <div className="cdt-grid">
                  {days.map((day, i) => {
                    const outside = day.getMonth() !== viewDate.getMonth();
                    const isSel = sameDay(day, draft);
                    const isDisabled =
                      !!minDate && startOfDay(day) < startOfDay(minDate);
                    return (
                      <button
                        type="button"
                        key={i}
                        disabled={isDisabled}
                        onClick={() => selectDay(day)}
                        className={`cdt-day${outside ? " cdt-day-out" : ""}${
                          isSel ? " cdt-day-sel" : ""
                        }${isDisabled ? " cdt-day-disabled" : ""}`}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="cdt-time">
                <div className="cdt-stepper">
                  <button
                    type="button"
                    className="cdt-chev"
                    onClick={() => stepHour(1)}
                    aria-label="Hour up"
                  >
                    <ChevronUp size={18} />
                  </button>
                  <input
                    className="cdt-num"
                    inputMode="numeric"
                    maxLength={2}
                    value={hourText}
                    onChange={(e) =>
                      setHourText(e.target.value.replace(/\D/g, "").slice(0, 2))
                    }
                    onBlur={commitHour}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    aria-label="Hour"
                  />
                  <button
                    type="button"
                    className="cdt-chev"
                    onClick={() => stepHour(-1)}
                    aria-label="Hour down"
                  >
                    <ChevronDown size={18} />
                  </button>
                </div>

                <span className="cdt-sep">:</span>

                <div className="cdt-stepper">
                  <button
                    type="button"
                    className="cdt-chev"
                    onClick={() => stepMinute(1)}
                    aria-label="Minute up"
                  >
                    <ChevronUp size={18} />
                  </button>
                  <input
                    className="cdt-num"
                    inputMode="numeric"
                    maxLength={2}
                    value={minuteText}
                    onChange={(e) =>
                      setMinuteText(
                        e.target.value.replace(/\D/g, "").slice(0, 2),
                      )
                    }
                    onBlur={commitMinute}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    aria-label="Minute"
                  />
                  <button
                    type="button"
                    className="cdt-chev"
                    onClick={() => stepMinute(-1)}
                    aria-label="Minute down"
                  >
                    <ChevronDown size={18} />
                  </button>
                </div>

                <div className="cdt-ampm">
                  <button
                    type="button"
                    className={`cdt-ampm-btn${draftAmPm === "AM" ? " active" : ""}`}
                    onClick={() => setAmPm("AM")}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    className={`cdt-ampm-btn${draftAmPm === "PM" ? " active" : ""}`}
                    onClick={() => setAmPm("PM")}
                  >
                    PM
                  </button>
                </div>
              </div>
            </div>

            <div className="cdt-footer">
              <button type="button" className="cdt-clear" onClick={handleClear}>
                Clear
              </button>
              <div className="cdt-foot-actions">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={handleCancel}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={handleApply}
                >
                  OK
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

// Self-contained styles for the date-time picker (the cdt-* classes are not
// defined in any shared stylesheet, so we ship them with the page).
const PICKER_CSS = `
.cdt { position: relative; }
.cdt-popup {
  position: fixed;
  z-index: 20000;
  width: 470px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0,0,0,.18);
  padding: 12px;
}
.cdt-body { display: flex; gap: 12px; }
.cdt-cal { flex: 1; }
.cdt-cal-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px; gap: 6px;
}
.cdt-cal-selects { display: flex; gap: 6px; }
.cdt-select {
  border: 1px solid #e5e7eb; border-radius: 6px; padding: 2px 6px; font-size: 13px;
}
.cdt-nav {
  border: 1px solid #e5e7eb; background: #f9fafb; border-radius: 6px;
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.cdt-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.cdt-grid-dow { margin-bottom: 4px; }
.cdt-dow { text-align: center; font-size: 12px; color: #6b7280; padding: 4px 0; }
.cdt-day {
  border: none; background: transparent; border-radius: 6px; height: 34px;
  cursor: pointer; font-size: 13px; color: #111827;
}
.cdt-day:hover { background: #eef2ff; }
.cdt-day-out { color: #c4c8ce; }
.cdt-day-sel { background: #4f46e5; color: #fff; }
.cdt-day-sel:hover { background: #4338ca; }
.cdt-day-disabled { color: #d1d5db; cursor: not-allowed; }
.cdt-time {
  width: 150px; display: flex; flex-direction: column; align-items: center;
  gap: 6px; border-left: 1px solid #f0f0f0; padding-left: 12px;
}
.cdt-stepper { display: flex; flex-direction: column; align-items: center; }
.cdt-chev {
  border: none; background: transparent; cursor: pointer; color: #4f46e5;
}
.cdt-num {
  width: 48px; text-align: center; border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 4px; font-size: 15px;
}
.cdt-sep { font-size: 18px; font-weight: 600; }
.cdt-ampm { display: flex; gap: 4px; margin-top: 4px; }
.cdt-ampm-btn {
  border: 1px solid #e5e7eb; background: #fff; border-radius: 6px;
  padding: 4px 10px; cursor: pointer; font-size: 13px;
}
.cdt-ampm-btn.active { background: #4f46e5; color: #fff; border-color: #4f46e5; }
.cdt-footer {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 10px; padding-top: 10px; border-top: 1px solid #f0f0f0;
}
.cdt-clear {
  border: none; background: transparent; color: #ef4444; cursor: pointer; font-size: 13px;
}
.cdt-foot-actions { display: flex; gap: 8px; }
`;

// ── Field option lists (from the requirements screenshot) ───────────────
const DISPLAY_POSITIONS = ["Home Top", "Search Page", "Hotel Details"];
const PRIORITIES = [1, 2, 3];
const DEVICE_TYPES = ["Desktop", "Mobile", "Both"];
const BUTTON_TEXTS = ["Book Now", "Learn More"];

// Keep react-select menus above the Bootstrap modal.
const selectMenuPortal = {
  menuPortal: (base) => ({ ...base, zIndex: 20001 }),
};

const emptyForm = {
  title: "",
  description: "",
  imageUrls: [],
  targetUrl: "",
  displayPosition: "",
  priority: "",
  countryId: "",
  countryName: "",
  cityId: "",
  cityName: "",
  deviceType: "",
  buttonText: "",
  startDateTime: "",
  endDateTime: "",
};

// Picker uses "YYYY-MM-DDTHH:mm"; backend wants seconds → append ":00".
const toBackendDateTime = (v) => (v ? `${v}:00` : null);
// Backend returns "YYYY-MM-DDTHH:mm:ss" → trim to the picker's 16 chars.
const toPickerDateTime = (v) => (v ? v.substring(0, 16) : "");

export default function Advertisements() {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isViewMode, setIsViewMode] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [isLoading, setIsLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState("");

  const [countryOptions, setCountryOptions] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);

  // Status toggle modal (mirrors the contract-rate status patch flow).
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);

  // ── lookups (country / city) — same endpoints the Hotel registration
  //    page uses: /api/country for countries, /api/province/getByCountryId
  //    for that country's cities. ─────────────────────────────────────
  const loadCountries = async () => {
    try {
      const res = await axiosInstance.get(
        "/api/country?page=0&limit=300&search=",
      );
      const list = Array.isArray(res.data) ? res.data : res.data?.content || [];
      setCountryOptions(list.map((c) => ({ value: c.id, label: c.name })));
    } catch (err) {
      console.error("Load countries failed", err);
      setCountryOptions([]);
    }
  };

  const loadCitiesForCountry = async (countryId) => {
    if (!countryId) {
      setCityOptions([]);
      return;
    }
    try {
      const res = await axiosInstance.get(
        `/api/province/getByCountryId/${countryId}`,
      );
      const list = Array.isArray(res.data) ? res.data : res.data?.content || [];
      setCityOptions(
        list.map((p) => ({ value: p.id, label: p.stateName || p.name })),
      );
    } catch (err) {
      console.error("Load cities failed", err);
      setCityOptions([]);
    }
  };

  useEffect(() => {
    loadCountries();
  }, []);

  // ── list ────────────────────────────────────────────────────────────
  const fetchAdvertisements = async (pageNum = 0, searchTerm = search) => {
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
        `/api/advertisement?${params.toString()}`,
      );
      if (res.data && Array.isArray(res.data)) {
        setItems(res.data);
        if (res.data.length < 10) {
          setTotalPages(pageNum + 1);
        } else {
          setTotalPages(Math.max(totalPages, pageNum + 2));
        }
        setPage(pageNum);
      } else {
        setItems([]);
        setTotalPages(0);
        setPage(0);
      }
    } catch (err) {
      toast.error("Failed to load advertisements");
      setItems([]);
      setTotalPages(0);
      setPage(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdvertisements();
  }, []);

  // The detail page's Edit button navigates here with { editId } so we open
  // the edit modal for that ad, then clear the state so a refresh won't
  // reopen it.
  useEffect(() => {
    const editId = location.state?.editId;
    if (editId) {
      prefillFromItem({ advertisementId: editId }, false);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      fetchAdvertisements(0, search);
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ── form helpers ────────────────────────────────────────────────────
  const setField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    if (validationErrors[name]) {
      setValidationErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleCountryChange = (opt) => {
    setForm((prev) => ({
      ...prev,
      countryId: opt ? opt.value : "",
      countryName: opt ? opt.label : "",
      cityId: "",
      cityName: "",
    }));
    loadCitiesForCountry(opt ? opt.value : "");
    if (validationErrors.countryId) {
      setValidationErrors((prev) => ({ ...prev, countryId: "" }));
    }
  };

  const handleCityChange = (opt) => {
    setForm((prev) => ({
      ...prev,
      cityId: opt ? opt.value : "",
      cityName: opt ? opt.label : "",
    }));
  };

  // Upload the picked image(s) immediately; append each returned public URL
  // to the ad's image list. Supports selecting multiple files at once.
  const handleImageChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      setImageUploading(true);
      const uploaded = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append("imageFile", file);
        // eslint-disable-next-line no-await-in-loop
        const res = await axiosInstance.post(
          "/api/advertisement/upload-image",
          fd,
          { headers: { "Content-Type": "multipart/form-data" } },
        );
        if (res.data && res.data.imageUrl) uploaded.push(res.data.imageUrl);
      }
      if (uploaded.length > 0) {
        setForm((prev) => ({
          ...prev,
          imageUrls: [...(prev.imageUrls || []), ...uploaded],
        }));
        toast.success(
          uploaded.length > 1
            ? `${uploaded.length} images uploaded`
            : "Image uploaded",
        );
      } else {
        toast.error("Image upload failed");
      }
    } catch (err) {
      toast.error("Image upload failed");
    } finally {
      setImageUploading(false);
      // Allow re-selecting the same file again later.
      e.target.value = "";
    }
  };

  const removeImage = (idx) => {
    setForm((prev) => ({
      ...prev,
      imageUrls: prev.imageUrls.filter((_, i) => i !== idx),
    }));
  };

  const validateForm = () => {
    const errors = {};
    if (!form.title.trim()) errors.title = "Title is required";
    // Display Position is hidden from the form (backend treats it as
    // optional), so it's no longer validated as required here.
    if (!form.countryId) errors.countryId = "Country is required";
    // Ads link out to web pages only; javascript:/data: links are refused.
    if (form.targetUrl && form.targetUrl.trim() && !isAbsoluteHttpUrl(form.targetUrl)) {
      errors.targetUrl = "Target URL must start with http:// or https://";
    }
    if (form.startDateTime && form.endDateTime) {
      if (
        parseLocalDateTime(form.endDateTime) <=
        parseLocalDateTime(form.startDateTime)
      ) {
        errors.endDateTime = "End must be after start";
      }
    }
    return errors;
  };

  const buildPayload = () => ({
    title: form.title,
    description: form.description || null,
    imageUrls: form.imageUrls || [],
    targetUrl: form.targetUrl || null,
    displayPosition: form.displayPosition || null,
    priority: form.priority ? Number(form.priority) : null,
    countryId: form.countryId ? Number(form.countryId) : null,
    countryName: form.countryName || null,
    cityId: form.cityId ? Number(form.cityId) : null,
    cityName: form.cityName || null,
    deviceType: form.deviceType || null,
    buttonText: form.buttonText || null,
    startDateTime: toBackendDateTime(form.startDateTime),
    endDateTime: toBackendDateTime(form.endDateTime),
  });

  const openCreate = () => {
    setEditing(null);
    setIsViewMode(false);
    setForm(emptyForm);
    setCityOptions([]);
    setValidationErrors({});
    setShowModal(true);
  };

  const prefillFromItem = async (item, viewMode) => {
    try {
      setIsLoading(true);
      const res = await axiosInstance.get(
        `/api/advertisement/${item.advertisementId}`,
      );
      const data = res.data;
      if (data.countryId) loadCitiesForCountry(data.countryId);
      setForm({
        title: data.title || "",
        description: data.description || "",
        imageUrls:
          Array.isArray(data.imageUrls) && data.imageUrls.length > 0
            ? data.imageUrls
            : data.imageUrl
              ? [data.imageUrl]
              : [],
        targetUrl: data.targetUrl || "",
        displayPosition: data.displayPosition || "",
        priority: data.priority != null ? String(data.priority) : "",
        countryId: data.countryId != null ? String(data.countryId) : "",
        countryName: data.countryName || "",
        cityId: data.cityId != null ? String(data.cityId) : "",
        cityName: data.cityName || "",
        deviceType: data.deviceType || "",
        buttonText: data.buttonText || "",
        startDateTime: toPickerDateTime(data.startDateTime),
        endDateTime: toPickerDateTime(data.endDateTime),
      });
      setEditing(data);
      setIsViewMode(viewMode);
      setValidationErrors({});
      setShowModal(true);
    } catch (err) {
      toast.error("Failed to load advertisement");
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setIsViewMode(false);
    setForm(emptyForm);
    setCityOptions([]);
    setValidationErrors({});
  };

  const handleSave = async () => {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      toast.error("Please fix the highlighted fields");
      return;
    }
    try {
      setIsLoading(true);
      if (editing) {
        await axiosInstance.put(
          `/api/advertisement/${editing.advertisementId}`,
          buildPayload(),
        );
        toast.success("Advertisement updated successfully!");
      } else {
        await axiosInstance.post("/api/advertisement/save", buildPayload());
        toast.success("Advertisement added successfully!");
      }
      await fetchAdvertisements(page, search);
      closeModal();
    } catch (err) {
      toast.error(
        editing
          ? "Failed to update advertisement"
          : "Failed to save advertisement",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ── status toggle (PATCH) — mirrors the contract-rate status flow ────
  const openStatusModal = (item) => {
    setStatusTarget(item);
    setShowStatusModal(true);
  };

  const confirmStatusChange = async () => {
    if (!statusTarget) return;
    try {
      setIsLoading(true);
      const res = await axiosInstance.patch(
        `/api/advertisement/${statusTarget.advertisementId}/status`,
        { isActive: !statusTarget.isActive },
      );
      if (res.data && res.data.isActive) {
        toast.success("Advertisement activated successfully");
      } else {
        toast.success("Advertisement deactivated successfully");
      }
      await fetchAdvertisements(page, search);
      setShowStatusModal(false);
      setStatusTarget(null);
    } catch (err) {
      toast.error("Failed to update status");
    } finally {
      setIsLoading(false);
    }
  };

  const ro = isViewMode; // read-only shorthand
  const selectedCountry =
    countryOptions.find((c) => String(c.value) === String(form.countryId)) ||
    (form.countryId
      ? { value: form.countryId, label: form.countryName }
      : null);
  const selectedCity =
    cityOptions.find((c) => String(c.value) === String(form.cityId)) ||
    (form.cityId ? { value: form.cityId, label: form.cityName } : null);

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <style>{PICKER_CSS}</style>
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <span className="fw-semibold">Advertisements</span>
              <Form.Group className="hotel-search-bar">
                <Form.Control
                  type="text"
                  placeholder="Search ad by title..."
                  className="form-control-modern-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
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
                    <th style={{ width: 60 }}>S/N</th>
                    <th>Title</th>
                    <th>Country</th>
                    <th>City</th>
                    <th>Status</th>
                    <th style={{ width: 90 }} title="Times seen across search pages (once per page per login)">Views</th>
                    <th style={{ width: 130 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.advertisementId}>
                      <td>{index + 1 + page * 10}</td>
                      <td>{item.title}</td>
                      <td>{item.countryName || "—"}</td>
                      <td>{item.cityName || "—"}</td>
                      <td>
                        <Badge
                          bg={item.isActive ? "success" : "danger"}
                          style={{ cursor: "pointer" }}
                          onClick={() => openStatusModal(item)}
                          title={`Click to ${
                            item.isActive ? "deactivate" : "activate"
                          }`}
                        >
                          {item.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="fw-semibold">{item.viewCount ?? 0}</td>
                      <td>
                        <FaEye
                          className="text-secondary"
                          style={{ cursor: "pointer", fontSize: "18px" }}
                          onClick={() =>
                            navigate(
                              `/advertisements/view/${item.advertisementId}`,
                            )
                          }
                          title="View"
                        />
                      </td>
                    </tr>
                  ))}
                  {isLoading && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        <div
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        >
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        Loading advertisements...
                      </td>
                    </tr>
                  )}
                  {items.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        No advertisements found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>

              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center p-3 border-top">
                  <div>
                    <small className="text-muted">
                      Showing {items.length} of {totalPages * 10} ads
                    </small>
                  </div>
                  <div>
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={page === 0}
                        onClick={() => fetchAdvertisements(page - 1, search)}
                      />
                      {[...Array(totalPages).keys()].map((num) => (
                        <Pagination.Item
                          key={num}
                          active={num === page}
                          onClick={() => fetchAdvertisements(num, search)}
                        >
                          {num + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={page === totalPages - 1}
                        onClick={() => fetchAdvertisements(page + 1, search)}
                      />
                    </Pagination>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>

          {/* Create / Edit modal — enforceFocus disabled so the portaled
              date-time picker popup (month/year selects, typed time) is
              interactive inside the modal. */}
          <Modal
            show={showModal}
            onHide={closeModal}
            centered
            size="lg"
            enforceFocus={false}
          >
            <Modal.Header closeButton={!isLoading}>
              <Modal.Title>
                {isViewMode
                  ? "Advertisement Details"
                  : editing
                    ? "Update Advertisement"
                    : "Create Advertisement"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <Row>
                  <Col md={6} className="mb-3">
                    <Form.Label>
                      Title <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control
                      value={form.title}
                      readOnly={ro}
                      onChange={(e) => setField("title", e.target.value)}
                      placeholder="Enter ad title"
                      isInvalid={!!validationErrors.title}
                    />
                    <Form.Control.Feedback type="invalid">
                      {validationErrors.title}
                    </Form.Control.Feedback>
                  </Col>
                  {/* Display Position field hidden per requirement. */}
                </Row>

                <Form.Group className="mb-3">
                  <Form.Label>Description (Internal notes)</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    value={form.description}
                    readOnly={ro}
                    onChange={(e) => setField("description", e.target.value)}
                    placeholder="Internal notes about this ad"
                  />
                </Form.Group>

                <Row>
                  <Col md={6} className="mb-3">
                    <Form.Label>Advertisement Images</Form.Label>
                    {form.imageUrls && form.imageUrls.length > 0 && (
                      <div className="d-flex flex-wrap gap-2 mb-2">
                        {form.imageUrls.map((url, idx) => (
                          <div
                            key={`${url}-${idx}`}
                            className="position-relative"
                            style={{ width: 96, height: 72 }}
                          >
                            <img
                              src={url}
                              alt={`Ad ${idx + 1}`}
                              style={{
                                width: "96px",
                                height: "72px",
                                objectFit: "cover",
                                borderRadius: "6px",
                                border: "1px solid #e5e7eb",
                              }}
                              onError={(e) => {
                                e.target.style.display = "none";
                              }}
                            />
                            {!ro && (
                              <span
                                onClick={() => removeImage(idx)}
                                title="Remove"
                                style={{
                                  position: "absolute",
                                  top: -6,
                                  right: -6,
                                  background: "#dc3545",
                                  color: "#fff",
                                  borderRadius: "50%",
                                  width: 18,
                                  height: 18,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 12,
                                  lineHeight: 1,
                                  cursor: "pointer",
                                }}
                              >
                                ×
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {!ro && (
                      <>
                        <Form.Control
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleImageChange}
                          disabled={imageUploading}
                        />
                        <Form.Text className="text-muted">
                          {imageUploading
                            ? "Uploading..."
                            : "Upload one or more images (you can select multiple)"}
                        </Form.Text>
                      </>
                    )}
                  </Col>
                  <Col md={6} className="mb-3">
                    <Form.Label>Target URL</Form.Label>
                    <Form.Control
                      value={form.targetUrl}
                      readOnly={ro}
                      onChange={(e) => setField("targetUrl", e.target.value)}
                      placeholder="Where the ad links to"
                      isInvalid={!!validationErrors.targetUrl}
                    />
                    <Form.Control.Feedback type="invalid">
                      {validationErrors.targetUrl}
                    </Form.Control.Feedback>
                  </Col>
                </Row>

                <Row>
                  {/* Priority and Device Type fields hidden per requirement. */}
                  <Col md={4} className="mb-3">
                    <Form.Label>Button Text</Form.Label>
                    <Form.Select
                      value={form.buttonText}
                      disabled={ro}
                      onChange={(e) => setField("buttonText", e.target.value)}
                    >
                      <option value="">Select button</option>
                      {BUTTON_TEXTS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </Form.Select>
                  </Col>
                </Row>

                <Row>
                  <Col md={6} className="mb-3">
                    <Form.Label>
                      Country <span className="text-danger">*</span>
                    </Form.Label>
                    <Select
                      options={countryOptions}
                      value={selectedCountry}
                      onChange={handleCountryChange}
                      isDisabled={ro}
                      isClearable
                      placeholder="Search & select country..."
                      menuPortalTarget={
                        typeof document !== "undefined" ? document.body : null
                      }
                      styles={selectMenuPortal}
                    />
                    {validationErrors.countryId && (
                      <div className="text-danger small mt-1">
                        {validationErrors.countryId}
                      </div>
                    )}
                  </Col>
                  <Col md={6} className="mb-3">
                    <Form.Label>City</Form.Label>
                    <Select
                      options={cityOptions}
                      value={selectedCity}
                      onChange={handleCityChange}
                      isDisabled={ro || !form.countryId}
                      isClearable
                      placeholder={
                        form.countryId
                          ? "Search & select city..."
                          : "Select country first"
                      }
                      menuPortalTarget={
                        typeof document !== "undefined" ? document.body : null
                      }
                      styles={selectMenuPortal}
                    />
                  </Col>
                </Row>

                <Row>
                  <Col md={6} className="mb-3">
                    <Form.Label>Start Date &amp; Time</Form.Label>
                    <DateTimeApplyPicker
                      value={form.startDateTime}
                      disabled={ro}
                      onApply={(v) => setField("startDateTime", v)}
                      placeholder="Select start date & time"
                    />
                  </Col>
                  <Col md={6} className="mb-3">
                    <Form.Label>End Date &amp; Time</Form.Label>
                    <DateTimeApplyPicker
                      value={form.endDateTime}
                      disabled={ro}
                      minDate={parseLocalDateTime(form.startDateTime)}
                      onApply={(v) => setField("endDateTime", v)}
                      isInvalid={!!validationErrors.endDateTime}
                      placeholder="Select end date & time"
                    />
                    {validationErrors.endDateTime && (
                      <div className="text-danger small mt-1">
                        {validationErrors.endDateTime}
                      </div>
                    )}
                  </Col>
                </Row>

              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={closeModal}
                disabled={isLoading}
              >
                {isViewMode ? "Close" : "Cancel"}
              </Button>
              {!isViewMode && (
                <Button
                  className="btn-indigo"
                  onClick={handleSave}
                  disabled={isLoading || imageUploading}
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
              )}
            </Modal.Footer>
          </Modal>

          {/* Status toggle confirm modal */}
          <Modal
            show={showStatusModal}
            onHide={() => setShowStatusModal(false)}
            centered
          >
            <Modal.Header closeButton={!isLoading}>
              <Modal.Title>Confirm Status Change</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              Are you sure you want to{" "}
              <strong>
                {statusTarget?.isActive ? "deactivate" : "activate"}
              </strong>{" "}
              the advertisement "{statusTarget?.title}"?
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={() => setShowStatusModal(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                variant={statusTarget?.isActive ? "danger" : "success"}
                onClick={confirmStatusChange}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    Updating...
                  </>
                ) : statusTarget?.isActive ? (
                  "Deactivate"
                ) : (
                  "Activate"
                )}
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
}
