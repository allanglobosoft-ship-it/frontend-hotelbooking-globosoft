import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Card,
  Button,
  Table,
  Modal,
  Form,
  Pagination,
  Row,
  Col,
} from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import Select from "react-select";
import {
  FaEdit,
  FaTrash,
  FaEye,
  FaPlus,
  FaDollarSign,
  FaBackward,
  FaCog,
  FaTimes,
} from "react-icons/fa";

// ─── SearchableSelect ────────────────────────────────────────────────────────
const SearchableSelect = ({
  name,
  value,
  onChange,
  options = [],
  placeholder = "Search and select...",
  isInvalid = false,
  disabled = false,
  isLoading = false,
  onInputChange,
}) => {
  const [isOpen, setIsOpen]         = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtered, setFiltered]     = useState([]);
  const [pos, setPos]               = useState({ top: 0, left: 0, width: 0 });
  const inputRef                    = useRef(null);

  /* filter options */
  useEffect(() => {
    if (!Array.isArray(options)) { setFiltered([]); return; }
    setFiltered(
      searchTerm.trim()
        ? options.filter(o =>
            (o.name || String(o)).toLowerCase().includes(searchTerm.toLowerCase())
          )
        : options
    );
  }, [searchTerm, options]);

  /* recalculate portal position */
  const recalc = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    const top = window.innerHeight - r.bottom < 210
      ? r.top  + window.scrollY - 210
      : r.bottom + window.scrollY;
    setPos({ top, left: r.left + window.scrollX, width: r.width });
  };

  const open  = () => { if (!disabled) { recalc(); setIsOpen(true); } };
  const close = () => { setIsOpen(false); setSearchTerm(""); if (onInputChange) onInputChange(""); };
  const toggle = (e) => { e.preventDefault(); e.stopPropagation(); isOpen ? close() : open(); };

  const onType = (e) => {
    if (disabled) return;
    const v = e.target.value;
    setSearchTerm(v);
    if (!isOpen) { recalc(); setIsOpen(true); }
    if (onInputChange) onInputChange(v);
  };

  const select = (opt) => {
    onChange({ target: { name, value: opt.id !== undefined ? opt.id : opt } });
    close();
  };

  const selected = Array.isArray(options)
    ? options.find(o => String(o.id) === String(value))
    : null;

  return (
    <>
      {/* wrapper — plain div, no Bootstrap classes that might clip */}
      <div style={{ position: "relative", width: "100%" }}>

        {/* text input */}
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? searchTerm : (selected?.name || "")}
          onChange={onType}
          onFocus={open}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className={`form-control${isInvalid ? " is-invalid" : ""}`}
          style={{ paddingRight: "2.4rem" }}
        />

        {/* chevron button — rendered as a real <button> so nothing can hide it */}
        <button
          type="button"
          onMouseDown={toggle}
          disabled={disabled}
          tabIndex={-1}
          style={{
            position : "absolute",
            right    : 0,
            top      : 0,
            height   : "100%",
            width    : "2.4rem",
            background: "none",
            border   : "none",
            cursor   : disabled ? "default" : "pointer",
            display  : "flex",
            alignItems: "center",
            justifyContent: "center",
            color    : disabled ? "#adb5bd" : "#6c757d",
            zIndex   : 5,
            padding  : 0,
            outline  : "none",
          }}
        >
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{
              transform : isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}
          >
            <path
              d="M1.5 4L6 8.5L10.5 4"
              stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* dropdown portal */}
      {isOpen && !disabled && createPortal(
        <>
          {/* backdrop */}
          <div
            onMouseDown={close}
            style={{ position:"fixed", inset:0, zIndex:999998 }}
          />
          {/* list */}
          <div
            style={{
              position       : "fixed",
              top            : pos.top,
              left           : pos.left,
              width          : pos.width,
              zIndex         : 999999,
              maxHeight      : "210px",
              overflowY      : "auto",
              backgroundColor: "#fff",
              border         : "1px solid #dee2e6",
              borderRadius   : "0.375rem",
              boxShadow      : "0 0.5rem 1rem rgba(0,0,0,.15)",
            }}
          >
            {isLoading ? (
              <div style={{ padding:"0.75rem 1rem", textAlign:"center", color:"#6c757d", fontSize:14 }}>
                <span className="spinner-border spinner-border-sm me-2" role="status"/>
                Loading…
              </div>
            ) : filtered.length > 0 ? filtered.map(opt => (
              <div
                key={opt.id}
                onMouseDown={() => select(opt)}
                onMouseEnter={e => { e.currentTarget.style.background="#f0f4ff"; e.currentTarget.style.color="#0d6efd"; }}
                onMouseLeave={e => { e.currentTarget.style.background="#fff";    e.currentTarget.style.color="#212529"; }}
                style={{
                  padding     : "0.45rem 1rem",
                  cursor      : "pointer",
                  fontSize    : 14,
                  color       : "#212529",
                  borderBottom: "1px solid #f8f9fa",
                }}
              >
                {opt.name || opt.stateName || opt.placeName || String(opt)}
              </div>
            )) : (
              <div style={{ padding:"0.5rem 1rem", color:"#6c757d", fontStyle:"italic", fontSize:14 }}>
                No options found
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

const ActivityRates = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const providerId   = location.state?.activityProviderId   || "";
  const providerName = location.state?.activityProviderName || "";

  const [rates, setRates]                           = useState([]);
  const [isLoading, setIsLoading]                   = useState(false);
  const [showModal, setShowModal]                   = useState(false);
  const [showSettingsModal, setShowSettingsModal]   = useState(false);
  const [settingsActivityRateId, setSettingsActivityRateId] = useState(null);
  const [inclusions, setInclusions]                 = useState([{ id: 1, value: "" }]);
  const [termsAndConditions, setTermsAndConditions] = useState([{ id: 1, value: "" }]);
  // Cancellation Policy rows — saved through the same /api/activityRate/
  // inclutionAndTerms/save endpoint with type=3. Surfaced on the Make
  // Your Own Package booking-confirmation modal alongside hotel + cab
  // cancellation policies. Optional — admins can leave the section
  // empty and the booking page just doesn't render an entry for this
  // activity in its Cancellation Policies accordion.
  const [cancellationPolicies, setCancellationPolicies] = useState([{ id: 1, value: "" }]);
  const [settingsLoading, setSettingsLoading]       = useState(false);
  const [settingsFetching, setSettingsFetching]     = useState(false);
  const [editing, setEditing]                       = useState(null);
  const [isViewMode, setIsViewMode]                 = useState(false);
  const [search, setSearch]                         = useState("");
  const [searchTimeout, setSearchTimeout]           = useState(null);
  const [searchTerm, setSearchTerm]                 = useState("");
  const [validationErrors, setValidationErrors]     = useState({});
  const [page, setPage]                             = useState(0);
  const [totalPages, setTotalPages]                 = useState(0);

  const [countries, setCountries]                   = useState([]);
  const [places, setPlaces]                         = useState([]);
  const [marketTypes, setMarketTypes]               = useState([]);
  const [isLoadingPlaces, setIsLoadingPlaces]       = useState(false);
  const [selectedCountryOption, setSelectedCountryOption] = useState(null);
  const [isCountryLoading, setIsCountryLoading]     = useState(false);
  const countryDebounceRef = useRef(null);
  const placeDebounceRef   = useRef(null);

  const [formData, setFormData] = useState({
    activityName: "", activityCode: "", activityDetails: "",
    childAgeMin: "", childAgeMax: "", totalUsersAllowed: "",
    activityRate: "", maxPax: "", adultRate: "", childRate: "", minPax: "",
    activityType: "", countryId: "", placeId: "",
    durationHr: "", durationMin: "", reportingPoint: "", rating: "", marketType: "",
    // ── Pickup / Drop-off fields ──
    // The picker uses /api/activity/lookup and stores the chosen item as
    // { source, id, name } plus a "HH:mm" time.
    pickupSource: "", pickupId: "", pickupName: "", pickupTime: "",
    dropOffSource: "", dropOffId: "", dropOffName: "", dropOffTime: "",
    activityImage: null, activityImagePreview: null,
    // Multi-image gallery state.
    //   activityImages       : File[] – new uploads from the form
    //   activityImagesPreview: string[] – data: URLs for new uploads
    //   existingImagePaths   : string[] – URLs already saved on backend
    // (Included Hotels picker removed — activity-to-hotel linkage is
    //  now managed elsewhere.)
    activityImages: [], activityImagesPreview: [],
    existingImagePaths: [],
  });

  // Lookup options shared by both pickers — loaded on modal open. We
  // flatten the grouped response into a single array of {value, label,
  // source, raw} so react-select can search across all groups, then
  // render them as optgroups visually.
  const [lookupOptions, setLookupOptions] = useState({
    zones: [], hotels: [], airports: [],
  });
  const [lookupLoading, setLookupLoading] = useState(false);

  // Build the react-select option groups from the raw lookup payload.
  const lookupGroupedOptions = React.useMemo(() => {
    const toOpts = (items, label) => ({
      label,
      options: items.map((i) => ({
        value: `${i.source}:${i.id}`,
        label: i.subtitle ? `${i.name} — ${i.subtitle}` : i.name,
        rawName: i.name,
        source: i.source,
        id: i.id,
      })),
    });
    return [
      toOpts(lookupOptions.zones || [], "Zones"),
      toOpts(lookupOptions.hotels || [], "Hotels"),
      toOpts(lookupOptions.airports || [], "Airports"),
    ].filter((g) => g.options.length);
  }, [lookupOptions]);

  // Loads /api/activity/lookup — duplicate of /api/cab-search/lookup
  // dedicated to this form. Called once when the modal opens, plus on
  // every keystroke (debounced) inside the pickup/dropoff dropdowns.
  const fetchLookup = async (search = "") => {
    try {
      setLookupLoading(true);
      const res = await axiosInstance.get(
        `/api/activity/lookup?search=${encodeURIComponent(search)}&limit=20`
      );
      setLookupOptions({
        zones: Array.isArray(res.data?.zones) ? res.data.zones : [],
        hotels: Array.isArray(res.data?.hotels) ? res.data.hotels : [],
        airports: Array.isArray(res.data?.airports) ? res.data.airports : [],
      });
    } catch (err) {
      console.warn("Activity lookup failed:", err);
      setLookupOptions({ zones: [], hotels: [], airports: [] });
    } finally {
      setLookupLoading(false);
    }
  };

  // Resolve the currently-saved pickup/dropoff back into a react-select
  // option value. Falls back to a synthetic option if the lookup hasn't
  // loaded yet so the field still displays its label on edit/view.
  const findLookupOption = (source, id, name) => {
    if (!source || !id) return null;
    const all = [
      ...(lookupOptions.zones || []),
      ...(lookupOptions.hotels || []),
      ...(lookupOptions.airports || []),
    ];
    const hit = all.find(
      (i) => i.source === source && String(i.id) === String(id)
    );
    if (hit) {
      return {
        value: `${hit.source}:${hit.id}`,
        label: hit.subtitle ? `${hit.name} — ${hit.subtitle}` : hit.name,
        source: hit.source,
        id: hit.id,
        rawName: hit.name,
      };
    }
    return {
      value: `${source}:${id}`,
      label: name || `${source} #${id}`,
      source,
      id,
      rawName: name,
    };
  };

  const [validityDates, setValidityDates] = useState([{ id: 1, validityFrom: "", validityTo: "" }]);

  // ── API helpers ──────────────────────────────────────────────────────────
  const fetchCountries = async (term = "") => {
    setIsCountryLoading(true);
    try {
      const res = await axiosInstance.get(`/api/country?page=0&limit=250&search=${encodeURIComponent(term)}`);
      if (Array.isArray(res.data)) {
        const opts = res.data.map(c => ({ value: c.id, label: c.name }));
        setCountries(opts);
        return opts;
      }
      return [];
    } catch { return []; }
    finally { setIsCountryLoading(false); }
  };

  const loadMarketTypes = async () => {
    try {
      const r = await axiosInstance.get("/api/marketType");
      setMarketTypes(r.data || []);
    } catch { toast.error("Failed to load market types"); }
  };

  const cityList = async (countryId, term = "") => {
    try {
      setIsLoadingPlaces(true);
      const r = await axiosInstance.get(`/api/province?countryId=${countryId}&page=0&limit=50&search=${encodeURIComponent(term)}`);
      setPlaces(Array.isArray(r.data) ? r.data : []);
    } catch { setPlaces([]); }
    finally { setIsLoadingPlaces(false); }
  };

  const fetchActivityRatesList = async (pageNum = 0, term = search) => {
    if (!providerId) return;
    try {
      setIsLoading(true);
      const p = new URLSearchParams({ page: pageNum.toString(), limit: "20" });
      if (term?.trim()) p.append("search", term.trim());
      const r = await axiosInstance.get(`/api/activityRate/list/${providerId}?${p}`);
      if (Array.isArray(r.data)) {
        setRates(r.data);
        setTotalPages(r.data.length < 20 ? pageNum + 1 : Math.max(totalPages, pageNum + 2));
        setPage(pageNum);
      } else { setRates([]); setTotalPages(0); setPage(0); }
    } catch { setRates([]); setTotalPages(0); setPage(0); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { fetchActivityRatesList(); }, [providerId]);
  useEffect(() => { fetchCountries(""); loadMarketTypes(); }, []);

  // (Included-Hotels lookup removed — that picker is no longer rendered
  //  and the field is no longer sent on save.)

  // Multi-image handlers — appends to the staged list, dedupes by name.
  const handleImagesChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const valid = files.filter((f) => {
      if (!f.type.startsWith("image/")) {
        toast.error(`${f.name}: not an image`);
        return false;
      }
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`${f.name}: over 5 MB`);
        return false;
      }
      return true;
    });
    if (valid.length === 0) return;
    Promise.all(
      valid.map(
        (f) =>
          new Promise((resolve) => {
            const r = new FileReader();
            r.onloadend = () => resolve({ file: f, preview: r.result });
            r.readAsDataURL(f);
          })
      )
    ).then((entries) => {
      setFormData((prev) => ({
        ...prev,
        activityImages: [...prev.activityImages, ...entries.map((x) => x.file)],
        activityImagesPreview: [
          ...prev.activityImagesPreview,
          ...entries.map((x) => x.preview),
        ],
      }));
    });
    // Allow re-selecting the same file later.
    e.target.value = "";
  };

  const removeStagedImage = (idx) => {
    setFormData((prev) => ({
      ...prev,
      activityImages: prev.activityImages.filter((_, i) => i !== idx),
      activityImagesPreview: prev.activityImagesPreview.filter((_, i) => i !== idx),
    }));
  };

  const removeExistingImage = (idx) => {
    setFormData((prev) => ({
      ...prev,
      existingImagePaths: prev.existingImagePaths.filter((_, i) => i !== idx),
    }));
  };
  useEffect(() => {
    if (searchTimeout) clearTimeout(searchTimeout);
    const t = setTimeout(() => fetchActivityRatesList(0, search), 500);
    setSearchTimeout(t);
    return () => clearTimeout(t);
  }, [search]);

  // ── form helpers ─────────────────────────────────────────────────────────
  const emptyForm = () => ({
    activityName:"", activityCode:"", activityDetails:"",
    childAgeMin:"", childAgeMax:"", totalUsersAllowed:"",
    activityRate:"", maxPax:"", adultRate:"", childRate:"", minPax:"",
    activityType:"", countryId:"", placeId:"",
    durationHr:"", durationMin:"", reportingPoint:"", rating:"", marketType:"",
    pickupSource:"", pickupId:"", pickupName:"", pickupTime:"",
    dropOffSource:"", dropOffId:"", dropOffName:"", dropOffTime:"",
    activityImage:null, activityImagePreview:null,
    activityImages: [], activityImagesPreview: [],
    existingImagePaths: [],
  });

  const openCreate = () => {
    setEditing(null); setIsViewMode(false); setValidationErrors({});
    setFormData(emptyForm()); setSelectedCountryOption(null);
    fetchCountries("");
    fetchLookup("");
    setValidityDates([{ id:1, validityFrom:"", validityTo:"" }]);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false); setEditing(null); setIsViewMode(false);
    setValidationErrors({}); setFormData(emptyForm());
    setValidityDates([{ id:1, validityFrom:"", validityTo:"" }]);
  };

  const handleFieldChange = (field, val) => {
    setFormData(prev => {
      const next = { ...prev, [field]: val };
      if (field === "activityType") {
        if (String(val) === "1") { next.adultRate=""; next.childRate=""; next.minPax=""; }
        else if (String(val) === "2") { next.activityRate=""; next.maxPax=""; }
      }
      return next;
    });
    setValidationErrors(prev => {
      if (field === "activityType")
        return { ...prev, activityType:"", activityRate:"", maxPax:"", adultRate:"", childRate:"", minPax:"" };
      return { ...prev, [field]:"" };
    });
  };

  const handleCountryChange = (opt) => {
    const val = opt ? String(opt.value) : "";
    setSelectedCountryOption(opt);
    setPlaces([]); setIsLoadingPlaces(false);
    setFormData(prev => ({ ...prev, countryId: val, placeId: "" }));
    if (val) cityList(val);
    setValidationErrors(prev => ({ ...prev, countryId:"", placeId:"" }));
  };

  const handlePlaceChange = (e) => {
    setFormData(prev => ({ ...prev, placeId: String(e.target.value) }));
    setValidationErrors(prev => ({ ...prev, placeId:"" }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 5*1024*1024) { toast.error("Image must be under 5 MB"); return; }
    const reader = new FileReader();
    reader.onloadend = () => setFormData(prev => ({ ...prev, activityImage: file, activityImagePreview: reader.result }));
    reader.readAsDataURL(file);
  };

  // validity
  const addValidityDate = () => setValidityDates(d => [...d, { id: Date.now(), validityFrom:"", validityTo:"" }]);
  const removeValidityDate = (id) => setValidityDates(d => d.length > 1 ? d.filter(x => x.id !== id) : d);
  const updateValidityDate = (id, field, val) =>
    setValidityDates(d => d.map(x => {
      if (x.id !== id) return x;
      const u = { ...x, [field]: val };
      if (field === "validityFrom" && val && x.validityTo && new Date(val) >= new Date(x.validityTo)) u.validityTo = "";
      return u;
    }));
  const getMinValidityTo = (from) => {
    if (!from) return "";
    const d = new Date(from); d.setDate(d.getDate()+1);
    return d.toISOString().split("T")[0];
  };

  // validation
  const validateForm = (data) => {
    const e = {};
    const t = String(data.activityType || "");
    if (!data.activityName?.trim())    e.activityName    = "Activity Name is required";
    if (!data.activityCode?.trim())    e.activityCode    = "Activity Code is required";
    if (!data.activityDetails?.trim()) e.activityDetails = "Activity Details is required";
    if (!data.activityType)            e.activityType    = "Activity Type is required";
    if (!data.countryId)               e.countryId       = "Country is required";
    if (!data.placeId)                 e.placeId         = "Place is required";
    if (data.durationHr === "" || data.durationHr === null || data.durationHr === undefined)
      e.durationHr = "Duration Hours is required";
    if (data.durationMin === "" || data.durationMin === null || data.durationMin === undefined)
      e.durationMin = "Duration Minutes is required";
    if (!data.reportingPoint?.trim()) e.reportingPoint = "Reporting Point is required";
    if (!data.rating)                 e.rating         = "Rating is required";
    if (!data.marketType || !String(data.marketType).trim()) e.marketType = "Market Type is required";
    if (t === "1") {
      if (!data.activityRate || !String(data.activityRate).trim()) e.activityRate = "Activity Rate is required";
      if (!data.maxPax       || !String(data.maxPax).trim())       e.maxPax       = "Maximum Pax is required";
    }
    if (t === "2") {
      if (!data.adultRate || !String(data.adultRate).trim()) e.adultRate = "Adult Rate is required";
      if (!data.childRate || !String(data.childRate).trim()) e.childRate = "Child Rate is required";
      if (!data.minPax    || !String(data.minPax).trim())    e.minPax    = "Minimum Pax is required";
    }
    return e;
  };

  const formatDateForAPI   = (s) => { if (!s) return ""; const d=new Date(s); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; };
  const formatDateForInput = (s) => { if (!s) return ""; const p=s.split("/"); return p.length===3 ? `${p[2]}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}` : s; };

  const buildPayload = (isPrivate, isSic) => {
    const fd = new FormData();
    fd.append("providerId",      providerId);
    fd.append("activityRateId",  editing?.activityRateId || "");
    fd.append("activityName",    formData.activityName);
    fd.append("activityCode",    formData.activityCode);
    fd.append("activityDetails", formData.activityDetails);
    fd.append("childAgeMin",     formData.childAgeMin);
    fd.append("childAgeMax",     formData.childAgeMax);
    fd.append("totalUsersAllowed", formData.totalUsersAllowed);
    fd.append("activityRate",    isPrivate ? formData.activityRate : "0");
    fd.append("maxPax",          isPrivate ? formData.maxPax : "0");
    fd.append("adultRate",       isSic ? formData.adultRate : "0");
    fd.append("adult_rate",      isSic ? formData.adultRate : "0");
    fd.append("childRate",       isSic ? formData.childRate : "0");
    fd.append("child_rate",      isSic ? formData.childRate : "0");
    fd.append("minimunPax",      isSic ? formData.minPax : "0");
    fd.append("activityType",    formData.activityType);
    fd.append("countryId",       formData.countryId);
    fd.append("placeId",         formData.placeId);
    fd.append("durationHr",      formData.durationHr);
    fd.append("durationMin",     formData.durationMin);
    fd.append("reportingPoint",  formData.reportingPoint);
    fd.append("rating",          formData.rating);
    fd.append("marketType",      formData.marketType);
    // Pickup / Drop-off — only include the field if a value was picked,
    // otherwise the backend would persist an empty string and the
    // numeric `*Id` columns would fail on parse.
    if (formData.pickupSource) fd.append("pickupSource", formData.pickupSource);
    if (formData.pickupId)     fd.append("pickupId",     String(formData.pickupId));
    if (formData.pickupName)   fd.append("pickupName",   formData.pickupName);
    if (formData.pickupTime)   fd.append("pickupTime",   formData.pickupTime);
    if (formData.dropOffSource) fd.append("dropOffSource", formData.dropOffSource);
    if (formData.dropOffId)     fd.append("dropOffId",     String(formData.dropOffId));
    if (formData.dropOffName)   fd.append("dropOffName",   formData.dropOffName);
    if (formData.dropOffTime)   fd.append("dropOffTime",   formData.dropOffTime);
    if (formData.activityImage)  fd.append("activityImage", formData.activityImage);
    // Multi-image gallery — every file under the same param name. Spring
    // binds them into ActivityRateDTO.activityImages (List<MultipartFile>).
    (formData.activityImages || []).forEach((file) => {
      fd.append("activityImages", file);
    });
    // Existing gallery URLs the operator chose to KEEP. Backend reads
    // these into ActivityRateDTO.imagePaths and prunes any persisted
    // image whose URL isn't in this list — so adding a new image
    // appends instead of wiping the old ones.
    (formData.existingImagePaths || []).forEach((p) => {
      if (p) fd.append("imagePaths", p);
    });
    // (Linked hotels removed — `includedHotelIds` is no longer sent.)
    validityDates.forEach((v, i) => {
      fd.append(`validity[${i}].validityFrom`, formatDateForAPI(v.validityFrom));
      fd.append(`validity[${i}].validityTo`,   formatDateForAPI(v.validityTo));
    });
    return fd;
  };

  const saveActivityRate = async (e) => {
    e.preventDefault();
    const errs = validateForm(formData);
    if (Object.keys(errs).length) { setValidationErrors(errs); return; }
    try {
      setIsLoading(true);
      const t = String(formData.activityType||"");
      const r = await axiosInstance.post("/api/activityRate/save", buildPayload(t==="1", t==="2"), { headers:{"Content-Type":"multipart/form-data"} });
      if (r.data) { toast.success("Activity Rate added!"); setValidationErrors({}); await fetchActivityRatesList(); closeModal(); }
    } catch (err) { toast.error(`Failed: ${err.response?.data?.message||err.message}`); }
    finally { setIsLoading(false); }
  };

  const updateActivityRate = async (e) => {
    e.preventDefault();
    const errs = validateForm(formData);
    if (Object.keys(errs).length) { setValidationErrors(errs); return; }
    if (!editing) return;
    try {
      setIsLoading(true);
      const t = String(formData.activityType||"");
      const r = await axiosInstance.put(`/api/activityRate/${editing.activityRateId}`, buildPayload(t==="1", t==="2"), { headers:{"Content-Type":"multipart/form-data"} });
      if (r.data) { toast.success("Activity Rate updated!"); setValidationErrors({}); await fetchActivityRatesList(); closeModal(); }
    } catch (err) { toast.error(`Failed: ${err.response?.data?.message||err.message}`); }
    finally { setIsLoading(false); }
  };

  const loadFormData = (data) => {
    setFormData({
      activityName:    data.activityName    || "",
      activityCode:    data.activityCode    || "",
      activityDetails: data.activityDetails || "",
      childAgeMin:     data.childAgeMin  ?? "",
      childAgeMax:     data.childAgeMax  ?? "",
      totalUsersAllowed: data.totalUsersAllowed || "",
      activityRate:    data.activityRate || "",
      maxPax:          data.maxPax       || "",
      adultRate:       data.adultRate    || "",
      childRate:       data.childRate    || "",
      minPax:          data.minimunPax || data.minPax || data.minPaxsic || "",
      activityType:    data.activityType != null ? String(data.activityType) : "",
      countryId:       data.countryId  || "",
      placeId:         data.placeId    || "",
      durationHr:      data.durationHr  || "",
      durationMin:     data.durationMin || "",
      reportingPoint:  data.reportingPoint || "",
      rating:          data.rating     || "",
      marketType:      Array.isArray(data.marketType) ? data.marketType[0] : (data.marketType || ""),
      activityImage:        null,
      activityImagePreview: data.imagePath || data.activityImage || null,
      activityImages:       [],
      activityImagesPreview: [],
      // imagePaths is the persisted gallery returned by GET — render it
      // as the "existing" thumbnails the operator can remove.
      existingImagePaths: Array.isArray(data.imagePaths) ? data.imagePaths : [],
      // (includedHotelIds removed — picker no longer rendered.)
      // Pickup / Drop-off — restore the previously-saved selections.
      pickupSource: data.pickupSource || "",
      pickupId: data.pickupId || "",
      pickupName: data.pickupName || "",
      pickupTime: data.pickupTime || "",
      dropOffSource: data.dropOffSource || "",
      dropOffId: data.dropOffId || "",
      dropOffName: data.dropOffName || "",
      dropOffTime: data.dropOffTime || "",
    });
    // Make sure the pickup/dropoff dropdowns have options to resolve the
    // saved IDs against. fetchLookup populates lookupOptions, then
    // findLookupOption hits a synthetic option in the meantime.
    fetchLookup("");
    const vd = data.validity || [];
    setValidityDates(
      vd.length > 0
        ? vd.map((v, i) => ({ id: v.validityId||v.id||Date.now()+i, validityFrom: formatDateForInput(v.validityFrom)||"", validityTo: formatDateForInput(v.validityTo)||"" }))
        : [{ id:1, validityFrom:"", validityTo:"" }]
    );
    setValidationErrors({});
    if (data.countryId) {
      cityList(data.countryId);
      fetchCountries("").then(opts => {
        const m = opts.find(c => String(c.value) === String(data.countryId));
        if (m) setSelectedCountryOption(m);
      });
    } else { setSelectedCountryOption(null); fetchCountries(""); }
  };

  const handleEdit = async (item) => {
    setIsLoading(true);
    try {
      const r = await axiosInstance.get(`/api/activityRate/${item.activityRateId}`);
      if (!r.data) { toast.error("Failed to fetch details"); return; }
      setEditing(r.data); setIsViewMode(false); loadFormData(r.data); setShowModal(true);
    } catch { toast.error("Failed to fetch details"); }
    finally { setIsLoading(false); }
  };

  // View icon → full-page activity view.
  // Conceptually requested at /registration/package/view/:id, but that
  // route is already taken by TravelPackage (PackageDetailedView) — so
  // activity rates use /registration/activity-rate/view/:id. The view
  // renders the complete activity record plus inclusions, T&C, and
  // cancellation policies, with a red banner when none of them are set.
  const handleView = (item) => {
    if (!item?.activityRateId) {
      toast.error("Missing activity reference");
      return;
    }
    navigate(`/registration/activity-rate/view/${item.activityRateId}`);
  };

  const handleDelete = (item) => {
    Swal.fire({
      titleText: `Delete ${item.activityName}?`, icon:"warning",
      showCancelButton:true, confirmButtonColor:"#d33", cancelButtonColor:"#3085d6",
      confirmButtonText:"Yes, delete it!",
    }).then(res => {
      if (res.isConfirmed)
        axiosInstance.delete(`/api/activityRate/${item.activityRateId}`)
          .then(() => { toast.success("Deleted"); fetchActivityRatesList(); })
          .catch(err => toast.error(`Failed: ${err.response?.data?.message||err.message}`));
    });
  };

  // ── settings modal ────────────────────────────────────────────────────────
  const handleOpenSettings = async (rate) => {
    setSettingsActivityRateId(rate.activityRateId);
    setSettingsFetching(true); setShowSettingsModal(true);
    try {
      const r = await axiosInstance.get(`/api/activityRate/inclutionAndTerms/${rate.activityRateId}`);
      if (Array.isArray(r.data) && r.data.length > 0) {
        const inc  = r.data.filter(x=>x.type===1).map((x,i)=>({id:i+1,value:x.data||""}));
        const trms = r.data.filter(x=>x.type===2).map((x,i)=>({id:i+1,value:x.data||""}));
        // type=3 is the new Cancellation Policy bucket. Activity rows
        // pre-dating this feature won't have any type=3 entries and the
        // list defaults to one empty row, identical to T&C behaviour.
        const cans = r.data.filter(x=>x.type===3).map((x,i)=>({id:i+1,value:x.data||""}));
        setInclusions(inc.length>0 ? inc : [{id:1,value:""}]);
        setTermsAndConditions(trms.length>0 ? trms : [{id:1,value:""}]);
        setCancellationPolicies(cans.length>0 ? cans : [{id:1,value:""}]);
      } else {
        setInclusions([{id:1,value:""}]);
        setTermsAndConditions([{id:1,value:""}]);
        setCancellationPolicies([{id:1,value:""}]);
      }
    } catch {
      setInclusions([{id:1,value:""}]);
      setTermsAndConditions([{id:1,value:""}]);
      setCancellationPolicies([{id:1,value:""}]);
    }
    finally { setSettingsFetching(false); }
  };
  const handleCloseSettings = () => {
    setShowSettingsModal(false);
    setSettingsActivityRateId(null);
    setInclusions([{id:1,value:""}]);
    setTermsAndConditions([{id:1,value:""}]);
    setCancellationPolicies([{id:1,value:""}]);
  };
  const handleSaveSettings = async () => {
    if (inclusions.some(x=>!x.value.trim()))        { toast.error("Fill all inclusion fields"); return; }
    if (termsAndConditions.some(x=>!x.value.trim())) { toast.error("Fill all T&C fields"); return; }
    // Cancellation rows are OPTIONAL — empty rows are simply dropped on
    // the way to the backend. Only the non-empty ones get persisted, so
    // an admin who hasn't filled in cancellation yet can still save the
    // form without a validation error. (The booking page falls back to
    // hiding the section gracefully when no row is configured.)
    try {
      setSettingsLoading(true);
      await axiosInstance.post("/api/activityRate/inclutionAndTerms/save", [
        ...inclusions.filter(x=>x.value.trim()).map(x=>({ activityRateId:String(settingsActivityRateId), data:x.value.trim(), type:1 })),
        ...termsAndConditions.filter(x=>x.value.trim()).map(x=>({ activityRateId:String(settingsActivityRateId), data:x.value.trim(), type:2 })),
        ...cancellationPolicies.filter(x=>x.value.trim()).map(x=>({ activityRateId:String(settingsActivityRateId), data:x.value.trim(), type:3 })),
      ]);
      toast.success("Settings saved!"); handleCloseSettings();
    } catch (err) { toast.error(err.response?.data?.message||"Failed"); }
    finally { setSettingsLoading(false); }
  };

  const activityTypeVal  = String(formData.activityType||"");
  const isPrivateActivity = activityTypeVal === "1";
  const isSicActivity     = activityTypeVal === "2";

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <div>
                <Button variant="outline-primary" size="sm" className="mb-2 me-3"
                  onClick={() => navigate("/registration/activityProvider")}>
                  <FaBackward className="me-2"/>Back
                </Button>
                <span className="fw-semibold">
                 <FaDollarSign className="me-2 text-success" />
  Activity Rates{" "}
  <span className="fs-6 fw-normal">for</span>
                  {providerId
                    ? <span className="text-muted ms-2">({providerName || `Provider ID: ${providerId}`})</span>
                    : <span className="text-warning ms-2">(No Provider Selected)</span>}
                </span>
              </div>
              <div className="d-flex align-items-center gap-3">
                <Form.Group className="position-relative">
                  <Form.Control type="text" placeholder="Search activity rates by name..."
                    className="form-control-modern-sm" value={searchTerm} style={{ width:250 }}
                    onChange={e => { setSearchTerm(e.target.value); setSearch(e.target.value); setPage(0); }}/>
                  {searchTerm && (
                    <button type="button" className="btn btn-link position-absolute top-50 end-0 translate-middle-y"
                      style={{ border:"none", background:"none", color:"#6c757d", padding:"0 12px", zIndex:10 }}
                      onClick={() => { setSearchTerm(""); setSearch(""); setPage(0); }}>
                      <i className="fas fa-times"/>
                    </button>
                  )}
                </Form.Group>
                <Button className="btn-green" onClick={openCreate}>+ Create</Button>
              </div>
            </Card.Header>

            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{width:100}}>S/N</th>
                    <th>Activity Name</th><th>Activity Code</th>
                    <th>Rate</th><th>Allowed Users</th><th>Duration</th>
                    <th style={{width:200}}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((rate,i) => (
                    <tr key={rate.activityRateId||i}>
                      <td>{i+1}</td>
                      <td>{rate.activityName}</td>
                      <td>{rate.activityCode}</td>
                      <td>{rate.activityRate}</td>
                      <td>{rate.maxPax}</td>
                      <td>{rate.durationHr}h {rate.durationMin}m</td>
                      <td>
                        <div className="d-flex gap-2">
                          <FaEdit  className="text-primary" style={{cursor:"pointer",fontSize:18}} onClick={()=>handleEdit(rate)}   title="Edit"/>
                          <FaEye   className="text-info"    style={{cursor:"pointer",fontSize:18}} onClick={()=>handleView(rate)}   title="View"/>
                          <FaCog   className="text-secondary" style={{cursor:"pointer",fontSize:18}} onClick={()=>handleOpenSettings(rate)} title="Settings"/>
                          <FaTrash className="text-danger"  style={{cursor:"pointer",fontSize:18}} onClick={()=>handleDelete(rate)} title="Delete"/>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {isLoading && (
                    <tr><td colSpan={7} className="text-center text-muted py-4">
                      <div className="spinner-border spinner-border-sm me-2" role="status"/>Loading…
                    </td></tr>
                  )}
                  {!isLoading && rates.length === 0 && (
                    <tr><td colSpan={7} className="text-center text-muted py-4">No activity rates found.</td></tr>
                  )}
                </tbody>
              </Table>

              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center p-3 border-top">
                  <small className="text-muted">Showing {rates.length} of {totalPages*10} activity rates</small>
                  <Pagination className="mb-0">
                    <Pagination.Prev disabled={page===0} onClick={()=>fetchActivityRatesList(page-1,search)}/>
                    {[...Array(totalPages).keys()].map(n=>(
                      <Pagination.Item key={n} active={n===page} onClick={()=>fetchActivityRatesList(n,search)}>{n+1}</Pagination.Item>
                    ))}
                    <Pagination.Next disabled={page===totalPages-1} onClick={()=>fetchActivityRatesList(page+1,search)}/>
                  </Pagination>
                </div>
              )}
            </Card.Body>
          </Card>

          {/* ── Main Modal ── */}
          <Modal show={showModal} onHide={closeModal} centered size="xl" backdrop="static" keyboard={false}>
            <Modal.Header closeButton={!isLoading}>
              <Modal.Title>
                {isViewMode ? "View Activity" : editing ? "Edit Activity" : "Create Activity"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <Row>
                  {/* LEFT */}
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Activity Name <span className="text-danger">*</span></Form.Label>
                      <Form.Control type="text" value={formData.activityName} disabled={isViewMode}
                        isInvalid={!!validationErrors.activityName}
                        onChange={e=>handleFieldChange("activityName",e.target.value)}/>
                      <Form.Control.Feedback type="invalid">{validationErrors.activityName}</Form.Control.Feedback>
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Activity Code <span className="text-danger">*</span></Form.Label>
                      <Form.Control type="text" value={formData.activityCode} disabled={isViewMode}
                        isInvalid={!!validationErrors.activityCode}
                        onChange={e=>handleFieldChange("activityCode",e.target.value)}/>
                      <Form.Control.Feedback type="invalid">{validationErrors.activityCode}</Form.Control.Feedback>
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Activity Details <span className="text-danger">*</span></Form.Label>
                      <Form.Control as="textarea" rows={6} value={formData.activityDetails} disabled={isViewMode}
                        isInvalid={!!validationErrors.activityDetails}
                        onChange={e=>handleFieldChange("activityDetails",e.target.value)}/>
                      <Form.Control.Feedback type="invalid">{validationErrors.activityDetails}</Form.Control.Feedback>
                    </Form.Group>

                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>Child Age Min</Form.Label>
                          <Form.Control type="number" value={formData.childAgeMin} disabled={isViewMode}
                            onChange={e=>handleFieldChange("childAgeMin",e.target.value)}/>
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>Child Age Max</Form.Label>
                          <Form.Control type="number" value={formData.childAgeMax} disabled={isViewMode}
                            onChange={e=>handleFieldChange("childAgeMax",e.target.value)}/>
                        </Form.Group>
                      </Col>
                    </Row>

                    <Form.Group className="mb-3">
                      <Form.Label>Total Users Allowed</Form.Label>
                      <Form.Control type="number" value={formData.totalUsersAllowed} disabled={isViewMode}
                        onChange={e=>handleFieldChange("totalUsersAllowed",e.target.value)}/>
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Activity Type <span className="text-danger">*</span></Form.Label>
                      <Form.Select value={formData.activityType} disabled={isViewMode}
                        isInvalid={!!validationErrors.activityType}
                        onChange={e=>handleFieldChange("activityType",e.target.value)}>
                        <option value="">SELECT</option>
                        <option value="1">Private</option>
                        <option value="2">SIC</option>
                      </Form.Select>
                      <Form.Control.Feedback type="invalid">{validationErrors.activityType}</Form.Control.Feedback>
                    </Form.Group>

                    {isPrivateActivity && (<>
                      <Form.Group className="mb-3">
                        <Form.Label>Activity Rate <span className="text-danger">*</span></Form.Label>
                        <Form.Control type="number" value={formData.activityRate} disabled={isViewMode}
                          isInvalid={!!validationErrors.activityRate}
                          onChange={e=>handleFieldChange("activityRate",e.target.value)}/>
                        <Form.Control.Feedback type="invalid">{validationErrors.activityRate}</Form.Control.Feedback>
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>Maximum Pax <span className="text-danger">*</span></Form.Label>
                        <Form.Control type="number" value={formData.maxPax} disabled={isViewMode}
                          isInvalid={!!validationErrors.maxPax}
                          onChange={e=>handleFieldChange("maxPax",e.target.value)}/>
                        <Form.Control.Feedback type="invalid">{validationErrors.maxPax}</Form.Control.Feedback>
                      </Form.Group>
                    </>)}

                    {isSicActivity && (<>
                      <Form.Group className="mb-3">
                        <Form.Label>Adult Rate <span className="text-danger">*</span></Form.Label>
                        <Form.Control type="number" value={formData.adultRate} disabled={isViewMode}
                          isInvalid={!!validationErrors.adultRate}
                          onChange={e=>handleFieldChange("adultRate",e.target.value)}/>
                        <Form.Control.Feedback type="invalid">{validationErrors.adultRate}</Form.Control.Feedback>
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>Child Rate <span className="text-danger">*</span></Form.Label>
                        <Form.Control type="number" value={formData.childRate} disabled={isViewMode}
                          isInvalid={!!validationErrors.childRate}
                          onChange={e=>handleFieldChange("childRate",e.target.value)}/>
                        <Form.Control.Feedback type="invalid">{validationErrors.childRate}</Form.Control.Feedback>
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>Minimum Pax <span className="text-danger">*</span></Form.Label>
                        <Form.Control type="number" value={formData.minPax} disabled={isViewMode}
                          isInvalid={!!validationErrors.minPax}
                          onChange={e=>handleFieldChange("minPax",e.target.value)}/>
                        <Form.Control.Feedback type="invalid">{validationErrors.minPax}</Form.Control.Feedback>
                      </Form.Group>
                    </>)}

                    {/* Country */}
                    <Form.Group className="mb-3">
                      <Form.Label><span className="text-danger">*</span> Country</Form.Label>
                      <Select
                        value={selectedCountryOption}
                        onChange={handleCountryChange}
                        onInputChange={v => {
                          if (countryDebounceRef.current) clearTimeout(countryDebounceRef.current);
                          countryDebounceRef.current = setTimeout(()=>fetchCountries(v), 400);
                        }}
                        menuPortalTarget={document.body}
                        styles={{ menuPortal:b=>({...b,zIndex:9999}), menu:b=>({...b,zIndex:9999}) }}
                        filterOption={()=>true}
                        placeholder="Search and select country"
                        isSearchable isClearable
                        isLoading={isCountryLoading}
                        options={countries}
                        isDisabled={isViewMode}
                        className={`react-select-container${validationErrors.countryId?" is-invalid":""}`}
                        classNamePrefix="react-select"
                      />
                      {validationErrors.countryId && <div className="text-danger small mt-1">{validationErrors.countryId}</div>}
                    </Form.Group>

                    {/* Place — uses inline SearchableSelect */}
                    <Form.Group className="mb-3">
                      <Form.Label><span className="text-danger">*</span> Place</Form.Label>
                      <SearchableSelect
                        name="placeId"
                        value={formData.placeId}
                        onChange={handlePlaceChange}
                        onInputChange={v => {
                          if (placeDebounceRef.current) clearTimeout(placeDebounceRef.current);
                          placeDebounceRef.current = setTimeout(()=>{ if (formData.countryId) cityList(formData.countryId, v); }, 400);
                        }}
                        placeholder={isLoadingPlaces ? "Loading places…" : "Search and select place"}
                        options={places.map(p=>({ id:p.id, name:p.name||p.stateName }))}
                        isInvalid={!!validationErrors.placeId}
                        disabled={isViewMode || !formData.countryId || isLoadingPlaces}
                        isLoading={isLoadingPlaces}
                      />
                      {validationErrors.placeId && <div className="text-danger small mt-1">{validationErrors.placeId}</div>}
                    </Form.Group>
                  </Col>

                  {/* RIGHT */}
                  <Col md={6}>
                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>Duration Hours <span className="text-danger">*</span></Form.Label>
                          <Form.Select value={formData.durationHr} disabled={isViewMode}
                            isInvalid={!!validationErrors.durationHr}
                            onChange={e=>handleFieldChange("durationHr",e.target.value)}>
                            <option value="">SELECT</option>
                            {[...Array(25)].map((_,i)=><option key={i} value={i}>{i}</option>)}
                          </Form.Select>
                          <Form.Control.Feedback type="invalid">{validationErrors.durationHr}</Form.Control.Feedback>
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>Duration Min <span className="text-danger">*</span></Form.Label>
                          <Form.Select value={formData.durationMin} disabled={isViewMode}
                            isInvalid={!!validationErrors.durationMin}
                            onChange={e=>handleFieldChange("durationMin",e.target.value)}>
                            <option value="">SELECT</option>
                            {[0,5,10,15,20,25,30,35,40,45,50,55].map(m=><option key={m} value={m}>{m}</option>)}
                          </Form.Select>
                          <Form.Control.Feedback type="invalid">{validationErrors.durationMin}</Form.Control.Feedback>
                        </Form.Group>
                      </Col>
                    </Row>

                    {/* ── Activity Images (multi-upload) ───────────────
                        Backwards compatible with the legacy single
                        Activity Image field (still uploaded as cover);
                        on top of that, the operator can attach a
                        gallery that's shown on the search info modal. */}
                    <Form.Group className="mb-2">
                      <Form.Label>Activity Image (cover)</Form.Label>
                      <Form.Control type="file" accept="image/*" disabled={isViewMode} onChange={handleImageChange}/>
                      {formData.activityImagePreview && (
                        <div className="mt-2">
                          <img src={formData.activityImagePreview} alt="preview"
                            style={{ maxWidth:200, maxHeight:200, objectFit:"contain", border:"1px solid #dee2e6", borderRadius:4, padding:4 }}
                            onError={e=>e.target.style.display="none"}/>
                          {!isViewMode && <div className="mt-2"><small className="text-muted">Selected image will replace the existing cover</small></div>}
                        </div>
                      )}
                      {!formData.activityImagePreview && isViewMode && <div className="mt-2"><small className="text-muted">No cover image</small></div>}
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Activity Gallery (multiple images)</Form.Label>
                      <Form.Control
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={isViewMode}
                        onChange={handleImagesChange}
                      />
                      {(formData.existingImagePaths.length > 0 ||
                        formData.activityImagesPreview.length > 0) && (
                        <div className="mt-2 d-flex flex-wrap gap-2">
                          {formData.existingImagePaths.map((src, i) => (
                            <div key={`ex-${i}`} className="position-relative">
                              <img
                                src={src}
                                alt={`existing-${i}`}
                                style={{
                                  width: 90, height: 90, objectFit: "cover",
                                  border: "1px solid #dee2e6", borderRadius: 4,
                                }}
                                onError={(e) => (e.target.style.display = "none")}
                              />
                              {!isViewMode && (
                                <Button
                                  size="sm"
                                  variant="danger"
                                  className="position-absolute top-0 end-0 px-1 py-0"
                                  style={{ borderRadius: 0 }}
                                  onClick={() => removeExistingImage(i)}
                                  title="Remove"
                                >
                                  <FaTimes size={10} />
                                </Button>
                              )}
                            </div>
                          ))}
                          {formData.activityImagesPreview.map((src, i) => (
                            <div key={`new-${i}`} className="position-relative">
                              <img
                                src={src}
                                alt={`new-${i}`}
                                style={{
                                  width: 90, height: 90, objectFit: "cover",
                                  border: "2px solid #0d6efd", borderRadius: 4,
                                }}
                              />
                              <span
                                className="position-absolute bottom-0 start-0 badge bg-primary"
                                style={{ fontSize: "0.6rem", borderRadius: 0 }}
                              >
                                NEW
                              </span>
                              {!isViewMode && (
                                <Button
                                  size="sm"
                                  variant="danger"
                                  className="position-absolute top-0 end-0 px-1 py-0"
                                  style={{ borderRadius: 0 }}
                                  onClick={() => removeStagedImage(i)}
                                  title="Remove"
                                >
                                  <FaTimes size={10} />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {!isViewMode && (
                        <small className="text-muted d-block mt-1">
                          Drop multiple files at once. Existing gallery is replaced
                          on save when new files are uploaded.
                        </small>
                      )}
                    </Form.Group>

                    {/* (Included Hotels picker removed by request — linkage is
                        handled elsewhere; payload no longer sends
                        includedHotelIds.) */}

                    <Form.Group className="mb-3">
                      <Form.Label>Reporting Point <span className="text-danger">*</span></Form.Label>
                      <Form.Control type="text" value={formData.reportingPoint} disabled={isViewMode}
                        isInvalid={!!validationErrors.reportingPoint}
                        onChange={e=>handleFieldChange("reportingPoint",e.target.value)}/>
                      <Form.Control.Feedback type="invalid">{validationErrors.reportingPoint}</Form.Control.Feedback>
                    </Form.Group>

                    {/* ── Pick-up Location + Time ─────────────────────────
                        Both fields are optional. The dropdown sources from
                        /api/activity/lookup (duplicate of /api/cab-search/
                        lookup) and stores source+id+name onto formData. */}
                    <Form.Group className="mb-3">
                      <Form.Label>Pick-up Location</Form.Label>
                      <Select
                        isDisabled={isViewMode}
                        options={lookupGroupedOptions}
                        isLoading={lookupLoading}
                        isClearable
                        placeholder="Search hotel / zone / airport..."
                        onInputChange={(input, { action }) => {
                          if (action === "input-change") fetchLookup(input);
                        }}
                        value={findLookupOption(
                          formData.pickupSource,
                          formData.pickupId,
                          formData.pickupName
                        )}
                        onChange={(opt) =>
                          setFormData((prev) => ({
                            ...prev,
                            pickupSource: opt?.source || "",
                            pickupId: opt?.id || "",
                            pickupName: opt?.rawName || opt?.label || "",
                          }))
                        }
                        menuPortalTarget={document.body}
                        styles={{ menuPortal: (b) => ({ ...b, zIndex: 9999 }) }}
                      />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>Pick-up Time</Form.Label>
                      <Form.Control
                        type="time"
                        value={formData.pickupTime}
                        disabled={isViewMode}
                        onChange={(e) =>
                          handleFieldChange("pickupTime", e.target.value)
                        }
                      />
                    </Form.Group>

                    {/* ── Drop-off Location + Time ───────────────────────── */}
                    <Form.Group className="mb-3">
                      <Form.Label>Drop-off Location</Form.Label>
                      <Select
                        isDisabled={isViewMode}
                        options={lookupGroupedOptions}
                        isLoading={lookupLoading}
                        isClearable
                        placeholder="Search hotel / zone / airport..."
                        onInputChange={(input, { action }) => {
                          if (action === "input-change") fetchLookup(input);
                        }}
                        value={findLookupOption(
                          formData.dropOffSource,
                          formData.dropOffId,
                          formData.dropOffName
                        )}
                        onChange={(opt) =>
                          setFormData((prev) => ({
                            ...prev,
                            dropOffSource: opt?.source || "",
                            dropOffId: opt?.id || "",
                            dropOffName: opt?.rawName || opt?.label || "",
                          }))
                        }
                        menuPortalTarget={document.body}
                        styles={{ menuPortal: (b) => ({ ...b, zIndex: 9999 }) }}
                      />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>Drop-off Time</Form.Label>
                      <Form.Control
                        type="time"
                        value={formData.dropOffTime}
                        disabled={isViewMode}
                        onChange={(e) =>
                          handleFieldChange("dropOffTime", e.target.value)
                        }
                      />
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Rating <span className="text-danger">*</span></Form.Label>
                      <Form.Select value={formData.rating} disabled={isViewMode}
                        isInvalid={!!validationErrors.rating}
                        onChange={e=>handleFieldChange("rating",e.target.value)}>
                        <option value="">SELECT</option>
                        {[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}
                      </Form.Select>
                      <Form.Control.Feedback type="invalid">{validationErrors.rating}</Form.Control.Feedback>
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Market Type <span className="text-danger">*</span></Form.Label>
                      <Form.Select value={formData.marketType||""} disabled={isViewMode}
                        isInvalid={!!validationErrors.marketType}
                        onChange={e=>handleFieldChange("marketType",e.target.value)}>
                        <option value="">Select Market Type</option>
                        {marketTypes.map(m=><option key={m.marketTypeId} value={m.marketTypeId}>{m.name}</option>)}
                      </Form.Select>
                      <Form.Control.Feedback type="invalid">{validationErrors.marketType}</Form.Control.Feedback>
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Validity Periods</Form.Label>
                      <div className="d-flex gap-2 mb-2">
                        <Button variant="outline-primary" size="sm" disabled={isViewMode} onClick={addValidityDate}>
                          <FaPlus size={12}/> Add Validity Period
                        </Button>
                      </div>
                      {validityDates.map(date=>(
                        <div key={date.id} className="border rounded p-2 mb-2">
                          <Row>
                            <Col md={6}>
                              <Form.Label>Validity From</Form.Label>
                              <Form.Control type="date" value={date.validityFrom} disabled={isViewMode}
                                onChange={e=>updateValidityDate(date.id,"validityFrom",e.target.value)}/>
                            </Col>
                            <Col md={6}>
                              <Form.Label>Validity To</Form.Label>
                              <div className="d-flex gap-2">
                                <Form.Control type="date" value={date.validityTo} disabled={isViewMode}
                                  min={getMinValidityTo(date.validityFrom)}
                                  onChange={e=>updateValidityDate(date.id,"validityTo",e.target.value)}/>
                                {!isViewMode && validityDates.length > 1 && (
                                  <Button variant="danger" size="sm" onClick={()=>removeValidityDate(date.id)}>
                                    <FaTrash size={10}/>
                                  </Button>
                                )}
                              </div>
                            </Col>
                          </Row>
                        </div>
                      ))}
                    </Form.Group>
                  </Col>
                </Row>
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="danger" onClick={closeModal}>
                <i className="fas fa-times me-2"/>{isViewMode ? "Close" : "Cancel"}
              </Button>
              {!isViewMode && (
                <Button variant="success" disabled={isLoading}
                  onClick={editing ? updateActivityRate : saveActivityRate}>
                  <i className="fas fa-arrow-right me-2"/>
                  {isLoading ? (editing ? "Updating…" : "Saving…") : (editing ? "Update" : "Create")}
                </Button>
              )}
            </Modal.Footer>
          </Modal>

          {/* ── Settings Modal ── */}
          <Modal show={showSettingsModal} onHide={handleCloseSettings} size="lg" centered backdrop="static" keyboard={false}>
            <Modal.Header style={{ backgroundColor:"#28a745", color:"white", borderBottom:"none" }}>
              <Modal.Title className="w-100 text-center">Inclusion Settings</Modal.Title>
            </Modal.Header>
            <Modal.Body style={{ padding:20 }}>
              {settingsFetching ? (
                <div className="text-center py-4">
                  <div className="spinner-border text-primary" role="status"/>
                  <p className="mt-2 text-muted">Loading settings…</p>
                </div>
              ) : (<>
                <Form.Group className="mb-4">
                  <div className="d-flex align-items-center mb-2">
                    <Form.Label className="mb-0 me-2" style={{ color:"#0d6efd", fontWeight:"bold" }}>
                      <span className="text-danger">*</span> INCLUSION
                    </Form.Label>
                    <Button variant="success" size="sm"
                      style={{ width:32,height:32,borderRadius:"50%",padding:0,display:"flex",alignItems:"center",justifyContent:"center",minWidth:32 }}
                      onClick={()=>setInclusions(p=>[...p,{id:Math.max(...p.map(x=>x.id),0)+1,value:""}])}>
                      <FaPlus size={18} style={{ color:"white" }}/>
                    </Button>
                  </div>
                  {inclusions.map(inc=>(
                    <div key={inc.id} className="d-flex align-items-start mb-2">
                      <Form.Control as="textarea" rows={3} className="me-2" placeholder="Enter inclusion…"
                        value={inc.value} onChange={e=>setInclusions(p=>p.map(x=>x.id===inc.id?{...x,value:e.target.value}:x))}/>
                      {inclusions.length > 1 && (
                        <Button variant="danger" size="sm"
                          style={{ width:32,height:32,borderRadius:"50%",padding:0,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,minWidth:32 }}
                          onClick={()=>setInclusions(p=>p.filter(x=>x.id!==inc.id))}>
                          <FaTimes size={18} style={{ color:"white" }}/>
                        </Button>
                      )}
                    </div>
                  ))}
                </Form.Group>

                <Form.Group className="mb-4">
                  <div className="d-flex align-items-center mb-2">
                    <Form.Label className="mb-0 me-2" style={{ color:"#dc3545", fontWeight:"bold" }}>
                      <span className="text-danger">*</span> TERMS AND CONDITION
                    </Form.Label>
                    <Button variant="success" size="sm"
                      style={{ width:32,height:32,borderRadius:"50%",padding:0,display:"flex",alignItems:"center",justifyContent:"center",minWidth:32 }}
                      onClick={()=>setTermsAndConditions(p=>[...p,{id:Math.max(...p.map(x=>x.id),0)+1,value:""}])}>
                      <FaPlus size={18} style={{ color:"white" }}/>
                    </Button>
                  </div>
                  {termsAndConditions.map(term=>(
                    <div key={term.id} className="d-flex align-items-start mb-2">
                      <Form.Control as="textarea" rows={3} className="me-2" placeholder="Enter terms…"
                        value={term.value} onChange={e=>setTermsAndConditions(p=>p.map(x=>x.id===term.id?{...x,value:e.target.value}:x))}/>
                      {termsAndConditions.length > 1 && (
                        <Button variant="danger" size="sm"
                          style={{ width:32,height:32,borderRadius:"50%",padding:0,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,minWidth:32 }}
                          onClick={()=>setTermsAndConditions(p=>p.filter(x=>x.id!==term.id))}>
                          <FaTimes size={18} style={{ color:"white" }}/>
                        </Button>
                      )}
                    </div>
                  ))}
                </Form.Group>

                {/* ── Cancellation Policy ──────────────────────────────
                    Optional rows. Saved with type=3 through the same
                    /api/activityRate/inclutionAndTerms/save endpoint and
                    surfaced on the Make-Your-Own-Package booking-page
                    policy modal under the Cancellation Policies section.
                    Mirrors the Inclusions / T&C UX exactly — dynamic
                    add / remove rows. Label is NOT marked required
                    (asterisk omitted) so admins can leave it blank when
                    the rate has no cancellation rules yet. */}
                <Form.Group className="mb-4">
                  <div className="d-flex align-items-center mb-2">
                    <Form.Label className="mb-0 me-2" style={{ color:"#0d6efd", fontWeight:"bold" }}>
                      CANCELLATION POLICY
                    </Form.Label>
                    <Button variant="success" size="sm"
                      style={{ width:32,height:32,borderRadius:"50%",padding:0,display:"flex",alignItems:"center",justifyContent:"center",minWidth:32 }}
                      onClick={()=>setCancellationPolicies(p=>[...p,{id:Math.max(...p.map(x=>x.id),0)+1,value:""}])}>
                      <FaPlus size={18} style={{ color:"white" }}/>
                    </Button>
                  </div>
                  {cancellationPolicies.map(can=>(
                    <div key={can.id} className="d-flex align-items-start mb-2">
                      <Form.Control as="textarea" rows={3} className="me-2"
                        placeholder="Enter cancellation policy (e.g. Free cancellation up to 24 hours before activity)…"
                        value={can.value}
                        onChange={e=>setCancellationPolicies(p=>p.map(x=>x.id===can.id?{...x,value:e.target.value}:x))}/>
                      {cancellationPolicies.length > 1 && (
                        <Button variant="danger" size="sm"
                          style={{ width:32,height:32,borderRadius:"50%",padding:0,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,minWidth:32 }}
                          onClick={()=>setCancellationPolicies(p=>p.filter(x=>x.id!==can.id))}>
                          <FaTimes size={18} style={{ color:"white" }}/>
                        </Button>
                      )}
                    </div>
                  ))}
                </Form.Group>
              </>)}
            </Modal.Body>
            <Modal.Footer style={{ borderTop:"none", padding:"15px 20px" }}>
              <Button variant="danger" style={{ minWidth:100 }} disabled={settingsLoading||settingsFetching} onClick={handleCloseSettings}>Cancel</Button>
              <Button variant="success" style={{ minWidth:100 }} disabled={settingsLoading||settingsFetching} onClick={handleSaveSettings}>
                {settingsLoading ? <><span className="spinner-border spinner-border-sm me-2"/>Saving…</> : <>Create <i className="fas fa-arrow-right ms-2"/></>}
              </Button>
              <Button variant="primary" style={{ minWidth:100 }} disabled={settingsLoading||settingsFetching}
                onClick={()=>{ setInclusions([{id:1,value:""}]); setTermsAndConditions([{id:1,value:""}]); setCancellationPolicies([{id:1,value:""}]); }}>
                Reset <i className="fas fa-redo ms-2"/>
              </Button>
            </Modal.Footer>
          </Modal>

        </main>
      </div>
    </div>
  );
};

export default ActivityRates;