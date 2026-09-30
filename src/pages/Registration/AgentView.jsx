import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Card,
  Button,
  Row,
  Col,
  Modal,
  Form,
  Spinner,
  Container,
} from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import AgentReg from "./AgentReg";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import {
  FaEdit,
  FaSignInAlt,
  FaCreditCard,
  FaBan,
  FaArrowLeft,
  FaKey,
  FaToggleOn,
  FaToggleOff,
  FaPlus,
  FaTrashAlt,
} from "react-icons/fa";
import { formatDateTimeDisplay } from "../../utils/dateUtils";

/**
 * Read-only details page for a single agent. Opened from the Agent list
 * View icon. The bottom action bar carries the rest of the actions that
 * used to live as icons in the list — Edit (re-opens the create/edit
 * modal back on the list page), Credit Limit, Exclude, Login and Delete.
 *
 * Login / Credit / Exclude / Delete modals are inline on this page so
 * the admin doesn't have to bounce back to the list to perform routine
 * follow-up actions on an agent they just opened.
 */
// ── Look-and-feel tokens, matched to PackageDetailedView so this page
//    shares the same clean "details" styling (gray section header bars,
//    compact label/value rows inside bordered cards). ──
const SECTION_HEADER = {
  backgroundColor: "#f0f0f0",
  padding: "8px 14px",
  fontWeight: 600,
  fontSize: "0.9rem",
  borderBottom: "1px solid #ddd",
  display: "flex",
  alignItems: "center",
  gap: "6px",
  color: "#333",
};

const INFO_LABEL = {
  fontWeight: 600,
  color: "#555",
  fontSize: "0.82rem",
  minWidth: "180px",
  display: "inline-block",
};

const INFO_VALUE = { color: "#222", fontSize: "0.82rem" };

const cardBox = {
  border: "1px solid #ddd",
  borderRadius: "4px",
  marginBottom: "14px",
  overflow: "hidden",
  backgroundColor: "#fff",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

// One label / value line. Renders a muted em-dash for empty values.
const InfoRow = ({ label, value }) => {
  const blank = value === null || value === undefined || value === "";
  return (
    <div style={{ marginBottom: "6px", display: "flex", alignItems: "flex-start" }}>
      <span style={INFO_LABEL}>{label}</span>
      <span style={{ ...INFO_VALUE, marginLeft: "8px" }}>
        {blank ? <span style={{ color: "#9CA3AF" }}>—</span> : value}
      </span>
    </div>
  );
};

// Section card with a gray header bar (PackageDetailedView pattern).
const Section = ({ title, children }) => (
  <div style={cardBox}>
    <div style={SECTION_HEADER}>{title}</div>
    <div style={{ padding: "12px 16px" }}>{children}</div>
  </div>
);

// dd-MM-yyyy when the value is a valid date, else the raw string.
const formatDob = (v) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB");
};

const AgentView = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  /**
   * Approval record from agent_external_registration for this agent id
   * (null when the agent was created directly by an admin — no self-service
   * registration record exists in that case).
   */
  const [approvalInfo, setApprovalInfo] = useState(null);
  // Trade-license preview modal — same iframe/img pattern as
  // AgentApprovalDetail so the admin can inspect the file inline.
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  // Active/Inactive toggle in-flight flag (disables the button while saving).
  const [statusUpdating, setStatusUpdating] = useState(false);
  // Card-payment-mode toggle in-flight flag.
  const [cardPaymentUpdating, setCardPaymentUpdating] = useState(false);
  // Agent-incentive-program toggle in-flight flag.
  const [incentiveUpdating, setIncentiveUpdating] = useState(false);
  /* Lightbox state — when the user clicks the agent photo on the header,
     the full image is shown enlarged inside a clean Bootstrap Modal. */
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  // Inline-edit state — when the admin clicks Edit, the full Update Agent
  // modal (owned by AgentReg) is rendered on this same view page instead of
  // bouncing back to /registration/agent. Kept as a flag so the AgentReg
  // component mounts only while editing (and unmounts on close, resetting
  // its internal form state cleanly).
  const [showInlineEdit, setShowInlineEdit] = useState(false);

  // ---------- Login modal state (mirrors AgentReg) -----------------
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isAlreadyRegistered, setIsAlreadyRegistered] = useState(false);
  const [loginFormData, setLoginFormData] = useState({
    username: "",
    password: "",
    repassword: "",
    userroles: [],
  });
  const [loginErrors, setLoginErrors] = useState({
    username: "",
    password: "",
    repassword: "",
    userroles: "",
  });
  const [loginServerError, setLoginServerError] = useState("");
  const [rolesList, setRolesList] = useState([]);
  const [showRolesDropdown, setShowRolesDropdown] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showRePassword, setShowRePassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // ---------- Credit limit modal state -----------------------------
  const [showCreditLimitModal, setShowCreditLimitModal] = useState(false);
  const [creditLimitType, setCreditLimitType] = useState("initial");
  // Update Credit Limit — whether the entered amount is added to or
  // subtracted from the current total. The amount field always takes a
  // positive number; this just flips its sign before it's sent as
  // additionalCredit, so reducing the limit no longer requires the admin
  // to type a negative number by hand.
  const [creditAdjustDirection, setCreditAdjustDirection] = useState("add");
  const [hasInitialCredit, setHasInitialCredit] = useState(false);
  const [creditRowExists, setCreditRowExists] = useState(false);
  const [creditLimitFormData, setCreditLimitFormData] = useState({
    addCreditLimit: "",
    remarks: "",
    totalCreditLimit: "0",
    availableCreditLimit: "0",
    usedCreditLimit: "0",
    // Payment Mode selected when adding/updating the credit limit. Mirrors the
    // dropdown on inhouse-accounts/agent.
    paymentMode: "",
  });
  const [creditLimitErrors, setCreditLimitErrors] = useState({
    addCreditLimit: "",
    remarks: "",
  });

  // ---------- Temporary Credit Limit state (extends the Credit Limit
  // section above — not a separate section) ------------------------
  const [tempCredits, setTempCredits] = useState([]);
  const [tempCreditsLoading, setTempCreditsLoading] = useState(false);
  // Combined "regular available + active temporary" figure surfaced by the
  // backend on the same GET the base credit-limit fields come from.
  const [effectiveAvailableCredit, setEffectiveAvailableCredit] = useState(null);
  // Header-scoped copy of the effective available credit — same value the
  // Credit Limit modal shows internally, but kept live even when the modal
  // is closed so the red "Available Credit" line under the agent logo stays
  // accurate as credit / temp-credit changes happen.
  const [headerAvailableCredit, setHeaderAvailableCredit] = useState(null);
  const [showTempCreditForm, setShowTempCreditForm] = useState(false);
  const [editingTempCreditId, setEditingTempCreditId] = useState(null);
  const [tempCreditFormData, setTempCreditFormData] = useState({
    amount: "",
    startDateTime: "",
    endDateTime: "",
    remarks: "",
  });
  const [tempCreditErrors, setTempCreditErrors] = useState({});
  const [tempCreditSaving, setTempCreditSaving] = useState(false);

  // ---------- Exclusion modal state --------------------------------
  const [showExclusionModal, setShowExclusionModal] = useState(false);
  const [exclusionFormData, setExclusionFormData] = useState({
    nationality: "",
    externalApi: [],
  });
  const [exclusionErrors, setExclusionErrors] = useState({
    nationality: "",
    externalApi: "",
  });
  const [showApiDropdown, setShowApiDropdown] = useState(false);
  const externalApis = [
    { code: "Select", name: "Select" },
    { code: "INHOUSE", name: "INHOUSE" },
  ];

  // ---------- Data fetch -------------------------------------------
  const fetchAgent = async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get(`/api/agent/${id}`);
      setAgent(res.data || null);
    } catch (e) {
      console.error("Failed to load agent:", e);
      toast.error("Failed to load agent details");
    } finally {
      setLoading(false);
    }
  };

  // Fetch the header's "Available Credit" figure. Same endpoint the Credit
  // Limit modal reads on open — kept separate so mutations elsewhere (base
  // credit update, temporary credit add/edit/delete/toggle) can refresh
  // just this figure without re-opening the modal.
  const fetchHeaderCredit = async () => {
    try {
      const res = await axiosInstance.get(`/api/agent-credit-limit/agent/${id}`);
      setHeaderAvailableCredit(
        res.data?.effectiveAvailableCreditLimit ?? res.data?.availableCreditLimit ?? null
      );
    } catch (_) {
      // No credit row yet is normal for a freshly created agent — leave null
      // so the header shows nothing rather than a stale figure.
      setHeaderAvailableCredit(null);
    }
  };

  useEffect(() => {
    fetchAgent();
    fetchHeaderCredit();
    (async () => {
      try {
        const rolesRes = await axiosInstance.get("/api/userRoles");
        setRolesList(rolesRes.data || []);
      } catch (_) {
        /* swallow — roles only needed inside login modal */
      }
    })();
    // Latest approval record for this agent — used for the request /
    // approved timestamps + approver username. 204 (empty) is fine when
    // the agent was created without the /register flow.
    (async () => {
      try {
        const res = await axiosInstance.get(
          `/api/agent-external-register/by-agent/${id}`,
        );
        setApprovalInfo(res.data || null);
      } catch (_) {
        setApprovalInfo(null);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ===================================================================
  // Edit — opens the AgentReg Update Agent modal inline on THIS view
  // page (via AgentReg's `embedded` mode) so the admin never leaves
  // /registration/agent/view/{id}. AgentReg remains the single source of
  // truth for the edit/create form; we just render it as a modal-only
  // overlay here. On close we refetch the agent so any saved changes
  // reflect immediately in the view panels.
  // ===================================================================
  const handleEditClick = () => {
    setShowInlineEdit(true);
  };

  const handleInlineEditClose = () => {
    setShowInlineEdit(false);
    // Refresh view-page data so edits done in the modal are visible without
    // a manual page reload. Also arm the missing-config alert again so if
    // the admin closed the modal without saving Markup/Currency, the
    // reminder re-fires against the freshly-loaded agent record.
    missingConfigAlertShownRef.current = false;
    fetchAgent();
    fetchHeaderCredit();
  };

  // ===================================================================
  // Markup / Currency configuration guard
  // -------------------------------------------------------------------
  // A freshly-approved agent (coming in from /admin/approval/agents/:id →
  // /registration/agent/view/:id) can arrive with Markup and/or Currency
  // still unset, because the external registration form does not force
  // them. Downstream actions (activating the agent, setting a credit
  // limit, creating a login) all assume those two values exist, so we
  // block them here until they do and nudge the admin into Edit to fill
  // them in. Shown as a one-time SweetAlert on page load and re-asserted
  // per-action so it can never be bypassed by just dismissing the alert.
  // ===================================================================
  const isFieldMissing = (v) =>
    v === null || v === undefined || String(v).trim() === "";

  const getMissingConfigFields = (agentObj) => {
    const missing = [];
    if (!agentObj) return missing;
    if (isFieldMissing(agentObj.markup)) missing.push("Markup");
    // Currency can be surfaced as either the numeric id (`currency`) or the
    // resolved code (`currencyCode`) — treat the agent as configured if
    // either is present.
    if (isFieldMissing(agentObj.currency) && isFieldMissing(agentObj.currencyCode)) {
      missing.push("Currency");
    }
    return missing;
  };

  // Sentinel so the mount-time alert only fires once per fetched agent
  // record. Reset after an inline edit so a still-missing value re-alerts.
  const missingConfigAlertShownRef = useRef(false);

  // Blocks an action when Markup/Currency aren't configured yet. Returns
  // true when it is safe to proceed. When it blocks, shows a SweetAlert
  // with an "Open Edit" shortcut into the same modal used by handleEditClick
  // so the admin can fix it without navigating away.
  const assertMarkupCurrencyConfigured = () => {
    const missing = getMissingConfigFields(agent);
    if (missing.length === 0) return true;
    Swal.fire({
      title: "Please add missing details",
      html:
        `<div style="text-align:left">` +
        `<p style="margin:0 0 8px 0">Please add ` +
        `<b>${missing.join("</b> and <b>")}</b> for this agent first.</p>` +
        `</div>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Edit",
      cancelButtonText: "Close",
      confirmButtonColor: "#0d6efd",
    }).then((res) => {
      if (res.isConfirmed) setShowInlineEdit(true);
    });
    return false;
  };

  // Back-navigation guard. Same missing-config check as the per-action
  // guards, but framed for the "you're about to leave" case: offers to
  // Configure now (opens Edit) or Leave anyway (goes back to the list).
  // Wired to both Back controls (top link + bottom action bar) so neither
  // route slips past the check. When both fields are set, navigates
  // straight to the list with no prompt.
  const handleBackNavigation = () => {
    const missing = getMissingConfigFields(agent);
    if (missing.length === 0) {
      navigate("/registration/agent");
      return;
    }
    Swal.fire({
      title: "Please add missing details",
      html:
        `<div style="text-align:left">` +
        `<p style="margin:0 0 8px 0"><b>` +
        missing.join("</b> and <b>") +
        `</b> ${missing.length > 1 ? "are" : "is"} still empty.</p>` +
        `<p style="margin:0">Do you want to leave anyway?</p>` +
        `</div>`,
      icon: "warning",
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: "Edit",
      denyButtonText: "Leave",
      cancelButtonText: "Stay",
      confirmButtonColor: "#0d6efd",
      denyButtonColor: "#6c757d",
    }).then((res) => {
      if (res.isConfirmed) {
        setShowInlineEdit(true);
      } else if (res.isDenied) {
        navigate("/registration/agent");
      }
      // Cancel / dismiss keeps the admin on the page.
    });
  };

  // One-time post-load alert. Fires once per fresh agent fetch when either
  // Markup or Currency is missing — typical right after approval — so the
  // admin sees it without having to click one of the guarded actions first.
  useEffect(() => {
    if (!agent) return;
    if (missingConfigAlertShownRef.current) return;
    const missing = getMissingConfigFields(agent);
    if (missing.length === 0) return;
    missingConfigAlertShownRef.current = true;
    Swal.fire({
      title: "Please add missing details",
      html:
        `<div style="text-align:left">` +
        `<p style="margin:0">Please add ` +
        `<b>${missing.join("</b> and <b>")}</b> for this agent.</p>` +
        `</div>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Edit",
      cancelButtonText: "Later",
      confirmButtonColor: "#0d6efd",
    }).then((res) => {
      if (res.isConfirmed) setShowInlineEdit(true);
    });
  }, [agent]);

  // Delete handler removed by design — agents are never deleted; access is
  // managed via the Active/Inactive status toggle below.

  // ===================================================================
  // Active / Inactive toggle
  // Flips the agent's access on/off (status + login account) without
  // touching any booking / invoice / payment data. Confirms first.
  // ===================================================================
  const isAgentActive =
    String(agent?.status || "").trim().toLowerCase() !== "inactive";

  const handleToggleStatus = () => {
    const goingInactive = isAgentActive; // currently active → will deactivate
    const nextLabel = goingInactive ? "Inactive" : "Active";
    // Activating an unconfigured agent leaves them unable to book (no
    // markup / no currency), so block the flip to Active until both are
    // set. Deactivation is always allowed.
    if (!goingInactive && !assertMarkupCurrencyConfigured()) {
      return;
    }
    Swal.fire({
      title: `Set ${agent?.companyName || "this agent"} to ${nextLabel}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: goingInactive ? "#d33" : "#198754",
      cancelButtonColor: "#3085d6",
      confirmButtonText: `Yes, set ${nextLabel}`,
    }).then((result) => {
      if (!result.isConfirmed) return;
      setStatusUpdating(true);
      axiosInstance
        .patch(`/api/agent/${id}/status`, { active: !goingInactive })
        .then((res) => {
          toast.success(res.data?.message || `Agent set to ${nextLabel}`);
          // Reflect the new status without a full reload, then refresh.
          setAgent((prev) =>
            prev ? { ...prev, status: res.data?.status || nextLabel } : prev
          );
          fetchAgent();
        })
        .catch((err) =>
          toast.error(
            err.response?.data?.message || "Failed to update agent status"
          )
        )
        .finally(() => setStatusUpdating(false));
    });
  };

  // ===================================================================
  // Hard-delete an agent — SUPER_ADMIN-only path added on top of the
  // existing Active/Inactive lifecycle. Active/Inactive stays the day-to-
  // day tool (deactivation preserves every booking, invoice and payment
  // for audit); this button is the escape hatch for genuinely mistaken
  // registrations (test rows, duplicates, bad approvals) that carry no
  // downstream data. Guarded three ways so a routine misclick can never
  // wipe an agent:
  //   1. Rendered only when the caller's active role is SUPER_ADMIN
  //      (checked via localStorage.currentActiveRole + userRole — same
  //      source Sidebar.jsx and HotelSearch.jsx use).
  //   2. Requires a strong Swal confirmation naming the agent.
  //   3. Delegates to the existing DELETE /api/agent/{id} endpoint,
  //      which is @Transactional and surfaces any FK-constraint failure
  //      (bookings, credit history, pending approvals) as a 400 with an
  //      operator-friendly message rather than silently orphaning rows.
  // Everything else on this page is untouched.
  // ===================================================================
  const activeRoleRaw = (
    localStorage.getItem("currentActiveRole") ||
    ""
  ).trim().toUpperCase();
  const storedRolesRaw = (
    localStorage.getItem("userRole") || ""
  ).toUpperCase();
  const isSuperAdmin = activeRoleRaw
    ? activeRoleRaw === "SUPER_ADMIN"
    : storedRolesRaw.includes("SUPER_ADMIN");

  const [deleteUpdating, setDeleteUpdating] = useState(false);

  const handleDeleteAgent = () => {
    if (!isSuperAdmin) return; // belt-and-braces guard for the render check
    const name = agent?.companyName || `Agent #${id}`;
    Swal.fire({
      title: `Delete ${name}?`,
      html:
        `<div style="text-align:left">` +
        `<p style="margin:0 0 8px 0">This permanently removes the agent record.</p>` +
        `<p style="margin:0 0 8px 0"><b>Prefer Set Inactive</b> whenever the agent has any bookings, invoices or credit history — deletion is refused by the database for agents with linked records.</p>` +
        `<p style="margin:0">Continue?</p>` +
        `</div>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete permanently",
      cancelButtonText: "Cancel",
    }).then((result) => {
      if (!result.isConfirmed) return;
      setDeleteUpdating(true);
      axiosInstance
        .delete(`/api/agent/${id}`)
        .then(() => {
          toast.success(`${name} deleted successfully`);
          navigate("/registration/agent");
        })
        .catch((err) => {
          // Backend wraps FK violations in AgentRegistrationException
          // ("Failed to delete agent: ...") — surface that verbatim so
          // the operator sees WHY (linked bookings, credits, etc.) and
          // can fall back to Set Inactive.
          const msg =
            err.response?.data?.message ||
            err.response?.data ||
            "Failed to delete agent";
          toast.error(typeof msg === "string" ? msg : "Failed to delete agent");
        })
        .finally(() => setDeleteUpdating(false));
    });
  };

  // ===================================================================
  // Card-payment toggle — flips the per-agent "Card" payment-mode gate.
  // Booking pages read agent.cardPaymentEnabled to decide whether to
  // surface the Card option in the payment-mode dropdown.
  // ===================================================================
  const handleToggleCardPayment = (e) => {
    const enabled = !!e?.target?.checked;
    setCardPaymentUpdating(true);
    axiosInstance
      .patch(`/api/agent/${id}/card-payment`, { enabled })
      .then((res) => {
        toast.success(
          res.data?.message ||
            `Payment gateway ${enabled ? "enabled" : "disabled"} for agent`,
        );
        setAgent((prev) =>
          prev ? { ...prev, cardPaymentEnabled: enabled } : prev,
        );
      })
      .catch((err) =>
        toast.error(
          err.response?.data?.message ||
            "Failed to update payment gateway setting",
        ),
      )
      .finally(() => setCardPaymentUpdating(false));
  };

  // ===================================================================
  // Agent-incentive toggle — flips the per-agent Agent Incentive Program
  // gate. When disabled the backend incentive-sync job skips this agent
  // so no new points accrue; historical rows already in agent_incentive
  // stay untouched so re-enabling later is safe.
  // ===================================================================
  // Actual API call, split out so the confirmation flow can reuse it
  // unchanged from the previous behaviour.
  const applyIncentiveToggle = (enabled) => {
    setIncentiveUpdating(true);
    axiosInstance
      .patch(`/api/agent/${id}/incentive`, { enabled })
      .then((res) => {
        toast.success(
          res.data?.message ||
            `Agent incentive ${enabled ? "enabled" : "disabled"}`,
        );
        setAgent((prev) =>
          prev ? { ...prev, incentiveEnabled: enabled } : prev,
        );
      })
      .catch((err) =>
        toast.error(
          err.response?.data?.message ||
            "Failed to update agent incentive setting",
        ),
      )
      .finally(() => setIncentiveUpdating(false));
  };

  const handleToggleIncentive = (e) => {
    const enabled = !!e?.target?.checked;
    const currentlyEnabled = Boolean(agent?.incentiveEnabled);
    // No-op — the target state is the same as the current one.
    if (enabled === currentlyEnabled) return;
    // Switching OFF keeps the previous frictionless flow.
    if (!enabled) {
      applyIncentiveToggle(false);
      return;
    }
    // Switching ON — confirm with a mandatory acknowledgement checkbox so
    // the admin knows the incentive starts accruing from today. The API
    // call only fires after the box is ticked and Confirm is clicked.
    // Snapshot the current system date/time at open time so the admin sees
    // exactly the moment they are enabling from.
    const nowLabel = formatDateTimeDisplay(new Date().toISOString());
    Swal.fire({
      title: "Enable Agent Incentive",
      icon: "info",
      html:
        `<div style="text-align:left">` +
        `<p style="margin:0 0 6px 0">Incentive will be applicable from ` +
        `today onwards.</p>` +
        `<p style="margin:0"><b>Effective from:</b> ${nowLabel}</p>` +
        `</div>`,
      input: "checkbox",
      inputValue: 0,
      inputPlaceholder: `I confirm — enable from ${nowLabel}`,
      confirmButtonText: "Confirm",
      cancelButtonText: "Cancel",
      showCancelButton: true,
      confirmButtonColor: "#198754",
      // Confirm stays disabled until the checkbox is ticked — gates the
      // action at the button itself rather than relying on validator text.
      didOpen: () => {
        const confirmBtn = Swal.getConfirmButton();
        const checkbox = Swal.getInput();
        if (!confirmBtn || !checkbox) return;
        confirmBtn.disabled = true;
        checkbox.addEventListener("change", () => {
          confirmBtn.disabled = !checkbox.checked;
        });
      },
    }).then((res) => {
      if (res.isConfirmed && res.value) {
        applyIncentiveToggle(true);
      }
      // Cancel / dismiss — leave the toggle where it was. Because `checked`
      // is driven by `agent.incentiveEnabled` (not local state), no manual
      // revert is needed.
    });
  };

  // ===================================================================
  // Login modal
  // ===================================================================
  const handleLogin = async () => {
    // Creating a login for an agent whose markup/currency isn't set would
    // hand them a working account that still can't book, so block until
    // both are configured.
    if (!assertMarkupCurrencyConfigured()) return;
    setLoginFormData({
      username: "",
      password: "",
      repassword: "",
      userroles: [],
    });
    setLoginErrors({
      username: "",
      password: "",
      repassword: "",
      userroles: "",
    });
    setLoginServerError("");
    setShowRolesDropdown(false);
    setShowPassword(false);
    setShowRePassword(false);

    setIsAlreadyRegistered(false);
    try {
      // Scope the check to the AGENT user type so entities of other types that
      // share the same numeric id don't resolve to this agent's account.
      const agentRole = rolesList.find((r) => r.roleName === "AGENT");
      // subUserType=AGENT_MAIN disambiguates from sub-agent / sub-user rows
      // that share the same (user_id, user_type_id) because those three
      // entity tables have overlapping id sequences under the AGENT type.
      const response = await axiosInstance.post(
        agentRole
          ? `/auth/checkRegisteredUserExist/${id}?userTypeId=${agentRole.id}&subUserType=AGENT_MAIN`
          : `/auth/checkRegisteredUserExist/${id}`
      );
      if (response.data) {
        const userNameValue =
          response.data.userName || response.data.username || "";
        setLoginFormData((prev) => ({ ...prev, username: userNameValue }));
        if (userNameValue) setIsAlreadyRegistered(true);
      }
    } catch (_) {
      /* normal for un-registered agents */
    }
    setShowLoginModal(true);
  };

  const closeLoginModal = () => {
    setShowLoginModal(false);
    setShowRolesDropdown(false);
    setShowPassword(false);
    setShowRePassword(false);
    setIsAlreadyRegistered(false);
    setLoginFormData({
      username: "",
      password: "",
      repassword: "",
      userroles: [],
    });
    setLoginErrors({
      username: "",
      password: "",
      repassword: "",
      userroles: "",
    });
    setLoginServerError("");
  };

  const handleLoginChange = (e) => {
    const { name, value } = e.target;
    let fieldName = name;
    if (name === "login-username") fieldName = "username";
    else if (name === "login-password") fieldName = "password";
    else if (name === "login-repassword") fieldName = "repassword";
    setLoginFormData((prev) => ({ ...prev, [fieldName]: value }));
  };

  const toggleRole = (roleId) => {
    setLoginFormData((prev) => ({
      ...prev,
      userroles: prev.userroles.includes(roleId)
        ? prev.userroles.filter((id) => id !== roleId)
        : [...prev.userroles, roleId],
    }));
    setShowRolesDropdown(false);
  };

  const removeRole = (roleId) => {
    setLoginFormData((prev) => ({
      ...prev,
      userroles: prev.userroles.filter((rid) => rid !== roleId),
    }));
  };

  const handleLoginSubmit = async () => {
    let isValid = true;
    const errors = {
      username: "",
      password: "",
      repassword: "",
      userroles: "",
    };

    if (!loginFormData.username.trim()) {
      errors.username = "Username is required";
      isValid = false;
    } else if (loginFormData.username.length < 4) {
      errors.username = "Username must be at least 4 characters long";
      isValid = false;
    } else if (!/^[a-zA-Z0-9_]+$/.test(loginFormData.username)) {
      errors.username =
        "Username can only contain letters, numbers, and underscores";
      isValid = false;
    }

    if (!loginFormData.password) {
      errors.password = "Password is required";
      isValid = false;
    } else if (loginFormData.password.length < 8) {
      errors.password = "Password must be at least 8 characters long";
      isValid = false;
    } else if (!/(?=.*[A-Z])(?=.*[0-9])/.test(loginFormData.password)) {
      errors.password =
        "Password must contain at least one uppercase letter and one number";
      isValid = false;
    }

    if (!loginFormData.repassword) {
      errors.repassword = "Please confirm your password";
      isValid = false;
    } else if (loginFormData.password !== loginFormData.repassword) {
      errors.repassword = "Passwords do not match";
      isValid = false;
    }

    if (!loginFormData.userroles || loginFormData.userroles.length === 0) {
      errors.userroles = "At least one user role is required";
      isValid = false;
    }

    setLoginErrors(errors);
    setLoginServerError("");

    if (!isValid) {
      toast.error("Please fix the errors in the form");
      return;
    }

    try {
      setIsLoading(true);
      const activeRoleObj = rolesList.find((r) => r.roleName === "AGENT");
      if (!activeRoleObj) {
        setLoginServerError("AGENT role is not configured in the system.");
        setIsLoading(false);
        return;
      }
      // Trim credentials before submit — trailing/leading whitespace was
      // silently persisted (Postgres varchar keeps the space) and the agent's
      // login form doesn't send one, causing "Invalid username or password"
      // on the very credentials the admin just saved. The backend also trims
      // now, but doing it here surfaces any resulting empty-value error
      // inline in the modal instead of a generic 500.
      const payload = {
        userId: Number(id),
        userTypeId: activeRoleObj.id,
        userName: (loginFormData.username || "").trim(),
        userRoleIds: loginFormData.userroles,
        password: (loginFormData.password || "").trim(),
      };
      const response = await axiosInstance.post("/auth/register", payload);
      if (response.data) {
        toast.success("Login credentials saved successfully!");
        closeLoginModal();
      }
    } catch (error) {
      const serverMsg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        "Failed to save login credentials";
      setLoginServerError(serverMsg);
      toast.error(serverMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetAgentPassword = async () => {
    const confirm = await Swal.fire({
      title: "Reset agent password?",
      text: `A new password will be generated and emailed to ${
        agent?.companyName || "this agent"
      }.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, reset and email",
    });
    if (!confirm.isConfirmed) return;
    try {
      setIsResettingPassword(true);
      const res = await axiosInstance.post(
        `/auth/agent/reset-password/${id}`
      );
      toast.success(
        res?.data?.message ||
          "New password has been generated and emailed to the agent."
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          error.response?.data?.error ||
          error.message ||
          "Failed to reset password"
      );
    } finally {
      setIsResettingPassword(false);
    }
  };

  // ===================================================================
  // Credit limit modal
  // ===================================================================
  // Re-fetches just the temporary-credit list (used after add/edit/delete so
  // the modal doesn't need a full close/reopen round-trip).
  const fetchTempCredits = async () => {
    setTempCreditsLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/agent-credit-limit/temporary/agent/${id}`
      );
      setTempCredits(Array.isArray(res.data) ? res.data : []);
    } catch (_) {
      setTempCredits([]);
    } finally {
      setTempCreditsLoading(false);
    }
  };

  const handleCreditLimit = async () => {
    // Credit limit is expressed in the agent's currency and consumed by
    // rate/markup calculations, so refuse to open the modal until both
    // Markup and Currency are set.
    if (!assertMarkupCurrencyConfigured()) return;
    setCreditLimitFormData({
      addCreditLimit: "",
      remarks: "",
      totalCreditLimit: "0",
      availableCreditLimit: "0",
      usedCreditLimit: "0",
      paymentMode: "",
    });
    setCreditLimitErrors({ addCreditLimit: "", remarks: "" });
    setCreditAdjustDirection("add");
    setEffectiveAvailableCredit(null);
    setTempCredits([]);
    setShowTempCreditForm(false);
    setEditingTempCreditId(null);

    try {
      const response = await axiosInstance.get(
        `/api/agent-credit-limit/agent/${id}`
      );
      const creditData = response.data;
      if (creditData) {
        const initialDone = Number(creditData.totalCreditLimit) > 0;
        setCreditRowExists(true);
        setHasInitialCredit(initialDone);
        setCreditLimitType(initialDone ? "update" : "initial");
        setCreditLimitFormData((prev) => ({
          ...prev,
          totalCreditLimit: creditData.totalCreditLimit || "0",
          availableCreditLimit: creditData.availableCreditLimit || "0",
          usedCreditLimit: creditData.usedCreditLimit || "0",
          // Preserve the previously selected payment mode so it's visible
          // when the modal reopens.
          paymentMode: creditData.paymentMode || "",
        }));
        setEffectiveAvailableCredit(
          creditData.effectiveAvailableCreditLimit ?? creditData.availableCreditLimit ?? null
        );
        // Temporary credit only ever applies once a regular credit limit
        // exists (mirrors the backend guard) — no point fetching otherwise.
        if (initialDone) {
          fetchTempCredits();
        }
      } else {
        setCreditRowExists(false);
        setHasInitialCredit(false);
        setCreditLimitType("initial");
      }
    } catch (_) {
      setCreditRowExists(false);
      setHasInitialCredit(false);
      setCreditLimitType("initial");
    }
    setShowCreditLimitModal(true);
  };

  const closeCreditLimitModal = () => {
    setShowCreditLimitModal(false);
    setCreditLimitType("initial");
    setCreditRowExists(false);
    setHasInitialCredit(false);
    setCreditLimitFormData({
      addCreditLimit: "",
      remarks: "",
      totalCreditLimit: "",
      availableCreditLimit: "",
      usedCreditLimit: "",
      paymentMode: "",
    });
    setCreditLimitErrors({ addCreditLimit: "", remarks: "" });
    setCreditAdjustDirection("add");
    setTempCredits([]);
    setEffectiveAvailableCredit(null);
    setShowTempCreditForm(false);
    setEditingTempCreditId(null);
    setTempCreditFormData({ amount: "", startDateTime: "", endDateTime: "", remarks: "" });
    setTempCreditErrors({});
  };

  // ===================================================================
  // Temporary Credit Limit — Add / Edit / Delete
  // ===================================================================
  const openAddTempCreditForm = () => {
    setEditingTempCreditId(null);
    setTempCreditFormData({ amount: "", startDateTime: "", endDateTime: "", remarks: "" });
    setTempCreditErrors({});
    setShowTempCreditForm(true);
  };

  // datetime-local inputs need "yyyy-MM-ddTHH:mm" (no seconds/zone); the
  // backend returns a plain LocalDateTime ISO string ("...THH:mm:ss").
  const toDatetimeLocalValue = (value) => (value ? String(value).slice(0, 16) : "");

  const openEditTempCreditForm = (row) => {
    setEditingTempCreditId(row.id);
    setTempCreditFormData({
      amount: row.amount ?? "",
      startDateTime: toDatetimeLocalValue(row.startDateTime),
      endDateTime: toDatetimeLocalValue(row.endDateTime),
      remarks: row.remarks || "",
    });
    setTempCreditErrors({});
    setShowTempCreditForm(true);
  };

  const closeTempCreditForm = () => {
    setShowTempCreditForm(false);
    setEditingTempCreditId(null);
    setTempCreditFormData({ amount: "", startDateTime: "", endDateTime: "", remarks: "" });
    setTempCreditErrors({});
  };

  const handleTempCreditFormChange = (e) => {
    const { name, value } = e.target;
    setTempCreditFormData((prev) => ({ ...prev, [name]: value }));
    if (tempCreditErrors[name]) {
      setTempCreditErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateTempCreditForm = (data) => {
    const errors = {};
    if (!data.amount.toString().trim()) {
      errors.amount = "Amount is required";
    } else if (isNaN(data.amount) || Number(data.amount) <= 0) {
      errors.amount = "Amount must be a positive number";
    }
    if (!data.startDateTime) {
      errors.startDateTime = "Start date & time is required";
    }
    if (!data.endDateTime) {
      errors.endDateTime = "End date & time is required";
    }
    if (
      data.startDateTime &&
      data.endDateTime &&
      new Date(data.endDateTime) <= new Date(data.startDateTime)
    ) {
      errors.endDateTime = "End date & time must be after the start date & time";
    }
    return errors;
  };

  const handleTempCreditSubmit = async () => {
    const errors = validateTempCreditForm(tempCreditFormData);
    if (Object.keys(errors).length > 0) {
      setTempCreditErrors(errors);
      return;
    }
    setTempCreditSaving(true);
    try {
      const payload = {
        amount: Number(tempCreditFormData.amount),
        startDateTime: tempCreditFormData.startDateTime,
        endDateTime: tempCreditFormData.endDateTime,
        remarks: tempCreditFormData.remarks || undefined,
      };
      if (editingTempCreditId) {
        await axiosInstance.put(
          `/api/agent-credit-limit/temporary/${editingTempCreditId}`,
          payload
        );
        toast.success("Temporary credit limit updated successfully!");
      } else {
        await axiosInstance.post("/api/agent-credit-limit/temporary", {
          agentId: Number(id),
          ...payload,
        });
        toast.success("Temporary credit limit added successfully!");
      }
      closeTempCreditForm();
      await fetchTempCredits();
      // Refresh the combined "Total Available Credit" figure so it reflects
      // the newly added/edited temporary credit immediately (both the modal
      // strip and the header line under the agent logo).
      try {
        const res = await axiosInstance.get(`/api/agent-credit-limit/agent/${id}`);
        const nextEffective =
          res.data?.effectiveAvailableCreditLimit ?? res.data?.availableCreditLimit ?? null;
        setEffectiveAvailableCredit(nextEffective);
        setHeaderAvailableCredit(nextEffective);
      } catch (_) {
        /* non-critical refresh */
      }
    } catch (e) {
      toast.error(
        e.response?.data?.message || "Failed to save temporary credit limit"
      );
    } finally {
      setTempCreditSaving(false);
    }
  };

  const handleDeleteTempCredit = (row) => {
    Swal.fire({
      title: "Delete this temporary credit limit?",
      html: `Amount: <b>${row.amount}</b><br/>This removes it immediately — it will no longer count toward the agent's available credit.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete",
    }).then(async (result) => {
      if (!result.isConfirmed) return;
      try {
        await axiosInstance.delete(`/api/agent-credit-limit/temporary/${row.id}`);
        toast.success("Temporary credit limit deleted");
        await fetchTempCredits();
        try {
          const res = await axiosInstance.get(`/api/agent-credit-limit/agent/${id}`);
          const nextEffective =
            res.data?.effectiveAvailableCreditLimit ?? res.data?.availableCreditLimit ?? null;
          setEffectiveAvailableCredit(nextEffective);
          setHeaderAvailableCredit(nextEffective);
        } catch (_) {
          /* non-critical refresh */
        }
      } catch (e) {
        toast.error(
          e.response?.data?.message || "Failed to delete temporary credit limit"
        );
      }
    });
  };

  // Manual Active/Inactive toggle — flips the temporary credit's enabled
  // flag regardless of its date window (e.g. pre-disable an Upcoming row,
  // or pause a currently-Active one, without touching its dates).
  const [tempCreditTogglingId, setTempCreditTogglingId] = useState(null);
  const handleToggleTempCreditEnabled = async (row) => {
    const nextEnabled = !row.enabled;
    setTempCreditTogglingId(row.id);
    try {
      await axiosInstance.patch(
        `/api/agent-credit-limit/temporary/${row.id}/status`,
        { enabled: nextEnabled }
      );
      toast.success(
        nextEnabled
          ? "Temporary credit limit activated"
          : "Temporary credit limit deactivated"
      );
      await fetchTempCredits();
      try {
        const res = await axiosInstance.get(`/api/agent-credit-limit/agent/${id}`);
        const nextEffective =
          res.data?.effectiveAvailableCreditLimit ?? res.data?.availableCreditLimit ?? null;
        setEffectiveAvailableCredit(nextEffective);
        setHeaderAvailableCredit(nextEffective);
      } catch (_) {
        /* non-critical refresh */
      }
    } catch (e) {
      toast.error(
        e.response?.data?.message || "Failed to update temporary credit limit status"
      );
    } finally {
      setTempCreditTogglingId(null);
    }
  };

  const handleCreditLimitChange = (e) => {
    const { name, value } = e.target;
    setCreditLimitFormData((prev) => ({ ...prev, [name]: value }));
    if (creditLimitErrors[name]) {
      setCreditLimitErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleCreditLimitTypeChange = (e) => {
    setCreditLimitType(e.target.value);
    setCreditLimitFormData((prev) => ({
      ...prev,
      addCreditLimit: "",
      remarks: "",
    }));
    setCreditLimitErrors({ addCreditLimit: "", remarks: "" });
    setCreditAdjustDirection("add");
  };

  const validateCreditLimitForm = (data, type) => {
    const newErrors = {};
    if (!data.addCreditLimit.toString().trim()) {
      newErrors.addCreditLimit =
        type === "initial"
          ? "Add Credit Limit is required"
          : "Add-on Credit Limit is required";
    } else if (isNaN(data.addCreditLimit)) {
      newErrors.addCreditLimit =
        type === "initial"
          ? "Add Credit Limit must be a number"
          : "Add-on Credit Limit must be a number";
    }
    if (type === "update" && !data.remarks.trim()) {
      newErrors.remarks = "Remarks is required";
    }
    return newErrors;
  };

  const handleCreditLimitSubmit = async () => {
    const errors = validateCreditLimitForm(creditLimitFormData, creditLimitType);
    if (Object.keys(errors).length > 0) {
      setCreditLimitErrors(errors);
      return;
    }
    try {
      setIsLoading(true);
      const addAmount = parseFloat(creditLimitFormData.addCreditLimit);
      let response;
      const pm = creditLimitFormData.paymentMode || undefined;
      if (creditLimitType === "initial") {
        if (creditRowExists) {
          response = await axiosInstance.put(
            "/api/agent-credit-limit/update",
            {
              agentId: Number(id),
              totalCreditLimit: addAmount,
              availableCreditLimit: 0,
              additionalCredit: addAmount,
              paymentMode: pm,
            }
          );
        } else {
          response = await axiosInstance.post(
            "/api/agent-credit-limit/create",
            null,
            {
              params: {
                agentId: Number(id),
                totalCreditLimit: addAmount,
                ...(pm ? { paymentMode: pm } : {}),
              },
            }
          );
        }
      } else {
        const currentTotal =
          parseFloat(creditLimitFormData.totalCreditLimit) || 0;
        const currentAvailable =
          parseFloat(creditLimitFormData.availableCreditLimit) || 0;
        // Reduce flips the entered (always-positive) amount negative before
        // it's applied — same additionalCredit math as before, just no
        // longer requires typing a "-" by hand.
        const signedAmount =
          creditAdjustDirection === "reduce" ? -Math.abs(addAmount) : Math.abs(addAmount);
        response = await axiosInstance.put(
          "/api/agent-credit-limit/update",
          {
            agentId: Number(id),
            additionalCredit: signedAmount,
            remarks: creditLimitFormData.remarks,
            totalCreditLimit: currentTotal + signedAmount,
            availableCreditLimit: currentAvailable,
            paymentMode: pm,
          }
        );
      }
      if (response.data) {
        toast.success(
          creditLimitType === "initial"
            ? "Initial credit limit created successfully!"
            : "Credit limit updated successfully!"
        );
        setHasInitialCredit(true);
        setCreditRowExists(true);
        closeCreditLimitModal();
        fetchHeaderCredit();
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to update credit limit");
    } finally {
      setIsLoading(false);
    }
  };

  // ===================================================================
  // Exclusion modal
  // ===================================================================
  const handleAgentExclude = async () => {
    setExclusionFormData({ nationality: "", externalApi: [] });
    setExclusionErrors({ nationality: "", externalApi: "" });
    try {
      const response = await axiosInstance.get(
        `/api/agent-api-exclusion/agent/${id}`
      );
      if (response.data && Array.isArray(response.data)) {
        const existingApiCodes = response.data
          .map((exclusion) => exclusion.apiCode)
          .filter(Boolean);
        setExclusionFormData((prev) => ({
          ...prev,
          externalApi: existingApiCodes,
        }));
      }
    } catch (_) {
      /* no prior exclusions — normal */
    }
    setShowExclusionModal(true);
  };

  const closeExclusionModal = () => {
    setShowExclusionModal(false);
    setExclusionFormData({ nationality: "", externalApi: [] });
    setExclusionErrors({ nationality: "", externalApi: "" });
    setShowApiDropdown(false);
  };

  const toggleApi = (apiCode) => {
    setExclusionFormData((prev) => ({
      ...prev,
      externalApi: prev.externalApi.includes(apiCode)
        ? prev.externalApi.filter((code) => code !== apiCode)
        : [...prev.externalApi, apiCode],
    }));
    if (exclusionErrors.externalApi) {
      setExclusionErrors((prev) => ({ ...prev, externalApi: "" }));
    }
    setShowApiDropdown(false);
  };

  const removeApi = (apiCode) => {
    setExclusionFormData((prev) => ({
      ...prev,
      externalApi: prev.externalApi.filter((code) => code !== apiCode),
    }));
  };

  const handleExclusionSubmit = async () => {
    try {
      setIsLoading(true);
      let existingApiCodes = [];
      try {
        const existingResponse = await axiosInstance.get(
          `/api/agent-api-exclusion/agent/${id}`
        );
        if (
          existingResponse.data &&
          Array.isArray(existingResponse.data)
        ) {
          existingApiCodes = existingResponse.data
            .map((exclusion) => exclusion.apiCode)
            .filter(Boolean);
        }
      } catch (_) {
        /* none */
      }

      const newApiCodes = exclusionFormData.externalApi.filter(
        (apiCode) => !existingApiCodes.includes(apiCode)
      );
      const removedApiCodes = existingApiCodes.filter(
        (apiCode) => !exclusionFormData.externalApi.includes(apiCode)
      );

      if (newApiCodes.length === 0 && removedApiCodes.length === 0) {
        toast("No changes made to API exclusions.");
        setIsLoading(false);
        return;
      }

      const promises = [];
      newApiCodes.forEach((apiCode) => {
        promises.push(
          axiosInstance.post("/api/agent-api-exclusion/exclude", {
            agentId: Number(id),
            nationality: exclusionFormData.nationality,
            apiCode,
          })
        );
      });
      removedApiCodes.forEach((apiCode) => {
        promises.push(
          axiosInstance.delete(
            `/api/agent-api-exclusion/agent/${id}/api/${apiCode}`
          )
        );
      });
      await Promise.all(promises);
      toast.success("API exclusions updated successfully!", { duration: 1000 });
      closeExclusionModal();
    } catch (e) {
      console.error(e);
      toast.error("Failed to update API exclusions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ===================================================================
  // Render
  // ===================================================================
  if (loading) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <Topbar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="flex-grow-1 p-4 d-flex justify-content-center align-items-center">
            <Spinner animation="border" />
          </main>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <Topbar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="flex-grow-1 p-4">
            <Card className="shadow-sm">
              <Card.Body className="text-center text-muted">
                Agent not found.
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    onClick={() => navigate("/registration/agent")}
                  >
                    Back to list
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </main>
        </div>
      </div>
    );
  }

  const gst = agent.agentGSTDetailsDTO || {};

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Container fluid style={{ maxWidth: "1100px" }}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <Button
                variant="link"
                className="p-0 text-decoration-none"
                onClick={handleBackNavigation}
              >
                <FaArrowLeft className="me-2" />
                Back to Agent List
              </Button>
              <h4 className="mt-2 mb-0">
                {agent.companyName}
                {agent.shortName ? (
                  <span className="text-muted small ms-2">
                    ({agent.shortName})
                  </span>
                ) : null}
                <span
                  className={`badge ms-2 align-middle ${
                    isAgentActive ? "bg-success" : "bg-secondary"
                  }`}
                  style={{ fontSize: "0.7rem", verticalAlign: "middle" }}
                >
                  {isAgentActive ? "Active" : "Inactive"}
                </span>
              </h4>
            </div>
            <div className="d-flex flex-column align-items-center" style={{ gap: 6 }}>
            {(() => {
              /* Robust agent-logo rendering:
                 - Accept either a data:URL or a raw base64 string.
                 - Detect PNG / JPEG / GIF / WEBP from base64 magic bytes so the
                   browser doesn't reject the wildcard "image/*" MIME we were
                   sending before (which is why the image often didn't show).
                 - If no logo, show a clean initials badge as a fallback. */
              const raw = typeof agent.agentLogo === "string" ? agent.agentLogo.trim() : "";
              let src = "";
              if (raw) {
                if (raw.startsWith("data:")) {
                  src = raw;
                } else {
                  let mime = "image/png";
                  if (raw.startsWith("/9j/")) mime = "image/jpeg";
                  else if (raw.startsWith("iVBORw")) mime = "image/png";
                  else if (raw.startsWith("R0lGOD")) mime = "image/gif";
                  else if (raw.startsWith("UklGR")) mime = "image/webp";
                  src = `data:${mime};base64,${raw}`;
                }
              }
              const initials = ((agent.companyName || agent.firstName || "A")
                .trim()
                .split(/\s+/)
                .map((w) => w[0])
                .slice(0, 2)
                .join("") || "A")
                .toUpperCase();
              return src ? (
                <img
                  src={src}
                  alt={`${agent.companyName || "Agent"} logo`}
                  onClick={() => setShowPhotoModal(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setShowPhotoModal(true);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  title="Click to view full image"
                  onError={(e) => {
                    // If the inferred MIME doesn't match, hide the broken icon.
                    e.currentTarget.style.display = "none";
                  }}
                  style={{
                    width: 96,
                    height: 96,
                    objectFit: "contain",
                    background: "#FAFAF8",
                    border: "1px solid #ECECE8",
                    borderRadius: "16px",
                    padding: "8px",
                    boxShadow: "0 4px 14px rgba(17, 19, 24, .06)",
                    cursor: "pointer",
                    transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 10px 24px rgba(17, 19, 24, .12)";
                    e.currentTarget.style.borderColor = "#EC0B43";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "";
                    e.currentTarget.style.boxShadow = "0 4px 14px rgba(17, 19, 24, .06)";
                    e.currentTarget.style.borderColor = "#ECECE8";
                  }}
                />
              ) : (
                <div
                  aria-label="Agent initials"
                  style={{
                    width: 96,
                    height: 96,
                    display: "grid",
                    placeItems: "center",
                    background: "#FDE7ED",
                    color: "#EC0B43",
                    border: "1px solid #F8C9D5",
                    borderRadius: "16px",
                    fontWeight: 700,
                    fontSize: "28px",
                    letterSpacing: "-0.02em",
                    boxShadow: "0 4px 14px rgba(17, 19, 24, .06)",
                  }}
                >
                  {initials}
                </div>
              );
            })()}
            {/* Red "Available Credit" line under the agent logo — mirrors the
                figure shown inside the Credit Limit modal so the admin can
                see the current balance without having to open the modal.
                Hidden until the credit endpoint has resolved. */}
            {headerAvailableCredit != null && (
              <div
                style={{
                  color: "#dc3545",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  lineHeight: 1.15,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                }}
                title="Available credit balance (includes any active temporary credit)"
              >
                Available Credit:{" "}
                {Number(headerAvailableCredit).toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}
                {agent.currencyCode ? ` ${agent.currencyCode}` : ""}
              </div>
            )}
            </div>
          </div>

          {/* Persistent banner — kept visible while Markup or Currency is
              still unset so the admin sees the requirement even after
              dismissing the mount-time SweetAlert. Clicking "Configure now"
              opens the same inline Edit modal used by the Edit button. */}
          {(() => {
            const missing = getMissingConfigFields(agent);
            if (missing.length === 0) return null;
            return (
              <div
                className="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2 py-2 px-3 mb-3"
                role="alert"
                style={{ borderLeft: "4px solid #ffc107" }}
              >
                <div style={{ fontSize: "0.9rem" }}>
                  Please add <b>{missing.join(" and ")}</b> for this agent.
                </div>
                <Button
                  size="sm"
                  variant="warning"
                  onClick={() => setShowInlineEdit(true)}
                >
                  Edit
                </Button>
              </div>
            );
          })()}

          <Section title="Agent Details">
            <Row>
              <Col md={6}>
                <InfoRow label="Company Name" value={agent.companyName} />
                <InfoRow label="Short Name" value={agent.shortName} />
                <InfoRow label="Business Type" value={agent.businessType} />
                <InfoRow
                  label="Agent Category"
                  value={
                    agent.agentCategoryName ||
                    agent.agentCategory?.categoryName ||
                    agent.agentCategory?.name ||
                    agent.agentCategoryId
                  }
                />
                <InfoRow label="Company Code" value={agent.companyCode} />
                <InfoRow label="Agent URL" value={agent.agentUrl} />
              </Col>
              <Col md={6}>
                <InfoRow label="Salutation" value={agent.salutation} />
                <InfoRow label="First Name" value={agent.firstName} />
                <InfoRow label="Last Name" value={agent.lastName} />
                <InfoRow label="Date of Birth" value={formatDob(agent.dateOfBirth)} />
                <InfoRow label="Status" value={agent.status} />
                <InfoRow label="Agent ID" value={agent.id} />
                <InfoRow label="Timezone" value={agent.timezone} />
                <InfoRow label="VAT Number" value={agent.vatNumber} />
              </Col>
            </Row>
          </Section>

          {(agent.tradeLicenseNo ||
            agent.tradeLicenseExpiry ||
            agent.tradeLicenseFile) && (
            <Section title="Trade License">
              <Row>
                <Col md={6}>
                  <InfoRow label="License Number" value={agent.tradeLicenseNo} />
                  <InfoRow label="Expiry Date" value={agent.tradeLicenseExpiry} />
                </Col>
                <Col md={6}>
                  {agent.tradeLicenseFile ? (
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => setShowLicenseModal(true)}
                    >
                      Open Trade License File
                    </Button>
                  ) : (
                    <span className="text-muted small">No file uploaded</span>
                  )}
                </Col>
              </Row>
            </Section>
          )}

          {approvalInfo && (
            <Section title="Approval Info">
              <Row>
                <Col md={6}>
                  <InfoRow
                    label="Approval Requested"
                    value={
                      approvalInfo.createdDate
                        ? new Date(approvalInfo.createdDate).toLocaleString()
                        : "-"
                    }
                  />
                  <InfoRow
                    label={
                      approvalInfo.status === "REJECTED"
                        ? "Rejected On"
                        : approvalInfo.status === "CANCELLED"
                        ? "Cancelled On"
                        : "Approved On"
                    }
                    value={
                      approvalInfo.reviewedDate
                        ? new Date(approvalInfo.reviewedDate).toLocaleString()
                        : "-"
                    }
                  />
                </Col>
                <Col md={6}>
                  <InfoRow
                    label={
                      approvalInfo.status === "REJECTED"
                        ? "Rejected By"
                        : approvalInfo.status === "CANCELLED"
                        ? "Cancelled By"
                        : "Approved By"
                    }
                    value={approvalInfo.reviewedBy || "-"}
                  />
                  <InfoRow
                    label="Approval Status"
                    value={approvalInfo.status || "-"}
                  />
                </Col>
              </Row>
            </Section>
          )}

          <Section title="Contact Details">
            <Row>
              <Col md={6}>
                <InfoRow label="Email" value={agent.personalEmail} />
                <InfoRow label="Mobile Number" value={agent.mobileNumber} />
                <InfoRow label="Telephone Number" value={agent.telephoneNumber} />
                <InfoRow label="Contact Person" value={agent.contactPerson} />
                <InfoRow label="Zip Code" value={agent.zipCode} />
              </Col>
              <Col md={6}>
                <InfoRow label="Country" value={agent.countryName} />
                <InfoRow label="City / Province" value={agent.provinceName} />
                <InfoRow label="Location" value={agent.placeName} />
                <InfoRow label="Address" value={agent.address} />
              </Col>
            </Row>
          </Section>

          {String(agent.countryId) === "1" && (
            <Section title="GST Information">
              <Row>
                <Col md={6}>
                  <InfoRow
                    label="Agency Classification"
                    value={gst.agentClassification}
                  />
                  <InfoRow label="GSTIN" value={gst.agentGstIn} />
                  <InfoRow
                    label="Provisional GST Number"
                    value={gst.agentProvisionalGstno}
                  />
                  <InfoRow
                    label="Correspondence Email"
                    value={gst.agentCorrespondmail}
                  />
                </Col>
                <Col md={6}>
                  <InfoRow
                    label="GST Registration Status"
                    value={gst.agentRegisterstatus}
                  />
                  <InfoRow label="HSN/SAC Code" value={gst.agentHsncode} />
                  <InfoRow label="Agent Status" value={gst.agentStatus} />
                </Col>
              </Row>
            </Section>
          )}

          <Section title="Finance Manager & GM">
            <div
              className="fw-semibold mb-2"
              style={{ color: "#c0392b", fontSize: "0.85rem" }}
            >
              Finance Manager
            </div>
            <Row>
              <Col md={6}>
                <InfoRow label="Name" value={agent.financeManagerName} />
                <InfoRow label="Contact No" value={agent.financeManagerContactNo} />
              </Col>
              <Col md={6}>
                <InfoRow label="Email" value={agent.financeManagerEmail} />
              </Col>
            </Row>
            <hr className="my-3" />
            <div
              className="fw-semibold mb-2"
              style={{ color: "#c0392b", fontSize: "0.85rem" }}
            >
              General Manager
            </div>
            <Row>
              <Col md={6}>
                <InfoRow label="Name" value={agent.gmName} />
                <InfoRow label="Contact No" value={agent.gmContactNo} />
              </Col>
              <Col md={6}>
                <InfoRow label="Email" value={agent.gmEmail} />
              </Col>
            </Row>
          </Section>

          {/* Incentive & Settings — hidden by request (code retained). */}
          {false && (
          <Section title="Incentive & Settings">
            <Row>
              <Col md={6}>
                <InfoRow
                  label="Preferred Incentive Claim Method"
                  value={agent.preferredClaimMethod}
                />
                <InfoRow label="Markup" value={`${agent.markup} (${agent.markupType})`} />
              </Col>
              <Col md={6}>
                <InfoRow
                  label="Currency"
                  value={agent.currencyCode || agent.currency}
                />
              </Col>
            </Row>
            {agent.preferredClaimMethod === "BANK_TRANSFER" && (
              <>
                <hr className="my-3" />
                <div
                  className="fw-semibold mb-2"
                  style={{ color: "#16a34a", fontSize: "0.85rem" }}
                >
                  Bank Details
                </div>
                <Row>
                  <Col md={6}>
                    <InfoRow
                      label="Account Holder Name"
                      value={agent.bankAccountHolderName}
                    />
                    <InfoRow label="Bank Name" value={agent.bankName} />
                    <InfoRow
                      label="Account Number"
                      value={agent.bankAccountNumber}
                    />
                  </Col>
                  <Col md={6}>
                    <InfoRow label="IFSC Code" value={agent.bankIfscCode} />
                    <InfoRow label="Branch Name" value={agent.bankBranchName} />
                  </Col>
                </Row>
              </>
            )}
          </Section>
          )}

          {/* ------------ Agent Incentive toggle -------------------- */}
          <div
            className="d-flex justify-content-end align-items-center gap-3 mb-2 px-3 py-2 rounded"
            style={{
              background: "#e8f5e9",
              border: "1px solid #66bb6a",
            }}
          >
            <span
              className="fw-bold"
              style={{ fontSize: "1.05rem", color: "#1b5e20" }}
            >
              Agent Incentive
            </span>
            <div
              className="d-flex align-items-center gap-3 fw-semibold"
              style={{ fontSize: "1rem" }}
              title="When Yes, this agent participates in the Agent Incentive Program and earns points on new bookings. Disabling stops new accruals; historical points remain."
            >
              <Form.Check
                inline
                type="radio"
                id={`agent-incentive-yes-${id}`}
                name={`agent-incentive-${id}`}
                label="Yes"
                checked={Boolean(agent?.incentiveEnabled)}
                onChange={() => handleToggleIncentive({ target: { checked: true } })}
                disabled={incentiveUpdating}
                className="mb-0"
              />
              <Form.Check
                inline
                type="radio"
                id={`agent-incentive-no-${id}`}
                name={`agent-incentive-${id}`}
                label="No"
                checked={!agent?.incentiveEnabled}
                onChange={() => handleToggleIncentive({ target: { checked: false } })}
                disabled={incentiveUpdating}
                className="mb-0"
              />
              {incentiveUpdating && (
                <span className="text-muted">Updating…</span>
              )}
            </div>
          </div>

          {/* ------------ Allow Card payment toggle ----------------- */}
          <div
            className="d-flex justify-content-end align-items-center gap-3 mb-2 px-3 py-2 rounded"
            style={{
              background: "#fff4e5",
              border: "1px solid #ffb84d",
            }}
          >
            <span
              className="fw-bold"
              style={{ fontSize: "1.05rem", color: "#b45309" }}
            >
              Allow Payment Gateway
            </span>
            <div
              className="d-flex align-items-center gap-3 fw-semibold"
              style={{ fontSize: "1rem" }}
              title="When Yes, this agent sees the 'Card' option in the booking-page payment-mode dropdown."
            >
              <Form.Check
                inline
                type="radio"
                id={`agent-card-payment-yes-${id}`}
                name={`agent-card-payment-${id}`}
                label="Yes"
                checked={Boolean(agent?.cardPaymentEnabled)}
                onChange={() => handleToggleCardPayment({ target: { checked: true } })}
                disabled={cardPaymentUpdating}
                className="mb-0"
              />
              <Form.Check
                inline
                type="radio"
                id={`agent-card-payment-no-${id}`}
                name={`agent-card-payment-${id}`}
                label="No"
                checked={!agent?.cardPaymentEnabled}
                onChange={() => handleToggleCardPayment({ target: { checked: false } })}
                disabled={cardPaymentUpdating}
                className="mb-0"
              />
              {cardPaymentUpdating && (
                <span className="text-muted">Updating…</span>
              )}
            </div>
          </div>

          {/* ------------ Bottom action bar ----------------------- */}
          <Card className="shadow-sm">
            <Card.Body className="d-flex flex-wrap gap-2 justify-content-end">
              <Button
                variant="outline-secondary"
                onClick={handleBackNavigation}
              >
                <FaArrowLeft className="me-2" />
                Back
              </Button>
              <Button variant="primary" onClick={handleEditClick}>
                <FaEdit className="me-2" />
                Edit
              </Button>
              <Button variant="warning" onClick={handleCreditLimit}>
                <FaCreditCard className="me-2" />
                Credit Limit
              </Button>
              <Button variant="secondary" onClick={handleAgentExclude}>
                <FaBan className="me-2" />
                Agent Exclude
              </Button>
              <Button variant="success" onClick={handleLogin}>
                <FaSignInAlt className="me-2" />
                Login
              </Button>
              <Button
                variant={isAgentActive ? "outline-danger" : "outline-success"}
                onClick={handleToggleStatus}
                disabled={statusUpdating}
                title={
                  isAgentActive
                    ? "Deactivate this agent (blocks login and all operations)"
                    : "Reactivate this agent (restores access)"
                }
              >
                {isAgentActive ? (
                  <>
                    <FaToggleOff className="me-2" />
                    {statusUpdating ? "Updating..." : "Set Inactive"}
                  </>
                ) : (
                  <>
                    <FaToggleOn className="me-2" />
                    {statusUpdating ? "Updating..." : "Set Active"}
                  </>
                )}
              </Button>
              {/* Delete — SUPER_ADMIN only. Active/Inactive remains the
                  right choice for agents with bookings/invoices/credit
                  history (the DB refuses hard-delete on those). This
                  button exists for genuinely mistaken registrations —
                  test rows, duplicates, bad approvals — that carry no
                  downstream data. Hidden entirely for every other role,
                  so the day-to-day flow is untouched. */}
              {isSuperAdmin && (
                <Button
                  variant="danger"
                  onClick={handleDeleteAgent}
                  disabled={deleteUpdating}
                  title="Permanently delete this agent (super admin only)"
                >
                  <FaTrashAlt className="me-2" />
                  {deleteUpdating ? "Deleting..." : "Delete"}
                </Button>
              )}
            </Card.Body>
          </Card>
          </Container>

          {/* ---------------- Login Modal ---------------- */}
          <Modal
            show={showLoginModal}
            onHide={closeLoginModal}
            centered
            backdrop="static"
            keyboard={false}
          >
            <Modal.Header closeButton>
              <Modal.Title>
                {isAlreadyRegistered ? "Login" : "Create Login"} for Agent:{" "}
                {agent?.companyName}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {isAlreadyRegistered ? (
                <div>
                  <div className="alert alert-success mb-3 d-flex align-items-center">
                    <i className="fas fa-check-circle me-2"></i>
                    <span className="fw-semibold">Registered Agent</span>
                  </div>
                  <Form.Group className="mb-2">
                    <Form.Label className="fw-semibold">
                      Registered Username
                    </Form.Label>
                    <Form.Control
                      type="text"
                      value={loginFormData.username}
                      readOnly
                      className="bg-light"
                    />
                  </Form.Group>
                  <div className="mt-3 d-flex justify-content-end">
                    <Button
                      variant="outline-warning"
                      size="sm"
                      onClick={handleResetAgentPassword}
                      disabled={isResettingPassword}
                      title="Generate a new password and email it to the agent"
                    >
                      {isResettingPassword ? (
                        <>
                          <span
                            className="spinner-border spinner-border-sm me-2"
                            role="status"
                            aria-hidden="true"
                          ></span>
                          Resetting...
                        </>
                      ) : (
                        <>
                          <FaKey className="me-1" />
                          Reset Password
                        </>
                      )}
                    </Button>
                  </div>
                  <small className="text-muted d-block mt-2">
                    A new password will be generated by the system and emailed
                    to the agent's registered email address.
                  </small>
                </div>
              ) : (
                <Form className="loginForm">
                  {loginServerError && (
                    <div className="alert alert-danger py-2 mb-3" role="alert">
                      <i className="fas fa-exclamation-triangle me-2"></i>
                      {loginServerError}
                    </div>
                  )}
                  <Form.Group className="mb-3">
                    <Form.Label>Username</Form.Label>
                    <Form.Control
                      type="text"
                      name="login-username"
                      value={loginFormData.username}
                      onChange={handleLoginChange}
                      isInvalid={!!loginErrors.username}
                      placeholder="Enter username"
                      autoComplete="new-password"
                    />
                    <Form.Control.Feedback type="invalid">
                      {loginErrors.username}
                    </Form.Control.Feedback>
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Password</Form.Label>
                    <div className="position-relative">
                      <Form.Control
                        type={showPassword ? "text" : "password"}
                        name="login-password"
                        value={loginFormData.password}
                        onChange={handleLoginChange}
                        isInvalid={!!loginErrors.password}
                        placeholder="Enter password"
                        autoComplete="new-password"
                        style={{ paddingRight: 40 }}
                      />
                      <button
                        type="button"
                        className="btn btn-link position-absolute top-50 end-0 translate-middle-y"
                        style={{
                          border: "none",
                          background: "none",
                          color: "#6c757d",
                          padding: "0 12px",
                          zIndex: 10,
                        }}
                        onClick={() => setShowPassword((s) => !s)}
                      >
                        {showPassword ? (
                          <i className="fas fa-eye-slash"></i>
                        ) : (
                          <i className="fas fa-eye"></i>
                        )}
                      </button>
                    </div>
                    {/* Rendered as a plain block (not Form.Control.Feedback)
                        because the input sits inside a wrapper div for the
                        eye toggle, so Bootstrap's sibling rule would keep the
                        feedback hidden — which previously swallowed the
                        password-criteria message. */}
                    {loginErrors.password && (
                      <div className="text-danger small mt-1">
                        {loginErrors.password}
                      </div>
                    )}
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Re-enter Password</Form.Label>
                    <div className="position-relative">
                      <Form.Control
                        type={showRePassword ? "text" : "password"}
                        name="login-repassword"
                        value={loginFormData.repassword}
                        onChange={handleLoginChange}
                        isInvalid={!!loginErrors.repassword}
                        placeholder="Re-enter password"
                        autoComplete="new-password"
                        style={{ paddingRight: 40 }}
                      />
                      <button
                        type="button"
                        className="btn btn-link position-absolute top-50 end-0 translate-middle-y"
                        style={{
                          border: "none",
                          background: "none",
                          color: "#6c757d",
                          padding: "0 12px",
                          zIndex: 10,
                        }}
                        onClick={() => setShowRePassword((s) => !s)}
                      >
                        {showRePassword ? (
                          <i className="fas fa-eye-slash"></i>
                        ) : (
                          <i className="fas fa-eye"></i>
                        )}
                      </button>
                    </div>
                    {loginErrors.repassword && (
                      <div className="text-danger small mt-1">
                        {loginErrors.repassword}
                      </div>
                    )}
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>User Roles</Form.Label>
                    <div className="position-relative">
                      <div
                        className="form-control d-flex flex-wrap align-items-center"
                        style={{
                          minHeight: 38,
                          padding: "4px 8px",
                          cursor: "pointer",
                        }}
                        onClick={() => setShowRolesDropdown((s) => !s)}
                      >
                        {loginFormData.userroles.length > 0 ? (
                          loginFormData.userroles.map((roleId) => {
                            const role = rolesList.find((r) => r.id === roleId);
                            return role ? (
                              <span
                                key={roleId}
                                className="badge bg-primary me-1 mb-1 d-flex align-items-center"
                                style={{ fontSize: 12 }}
                              >
                                {role.roleName}
                                <button
                                  type="button"
                                  className="btn-close btn-close-white ms-1"
                                  style={{ fontSize: 8 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeRole(roleId);
                                  }}
                                ></button>
                              </span>
                            ) : null;
                          })
                        ) : (
                          <span className="text-muted">Select roles...</span>
                        )}
                      </div>
                      {showRolesDropdown && (
                        <div
                          className="position-absolute w-100 bg-white border rounded shadow-lg"
                          style={{
                            bottom: "100%",
                            left: 0,
                            zIndex: 9999,
                            maxHeight: 200,
                            overflowY: "auto",
                            minHeight: 120,
                            border: "2px solid #007bff",
                            marginBottom: 2,
                          }}
                        >
                          {rolesList.map((role) => {
                            const isSelected =
                              loginFormData.userroles.includes(role.id);
                            return (
                              <div
                                key={role.id}
                                className={`px-3 py-2 ${
                                  isSelected ? "bg-light text-muted" : ""
                                }`}
                                style={{
                                  cursor: "pointer",
                                  borderBottom: "1px solid #eee",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleRole(role.id);
                                }}
                              >
                                {role.roleName}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {loginErrors.userroles && (
                      <div className="text-danger small mt-1">
                        {loginErrors.userroles}
                      </div>
                    )}
                  </Form.Group>
                </Form>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={closeLoginModal}
                disabled={isLoading}
              >
                {isAlreadyRegistered ? "Close" : "Cancel"}
              </Button>
              {!isAlreadyRegistered && (
                <Button
                  variant="primary"
                  onClick={handleLoginSubmit}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm me-2"
                        role="status"
                        aria-hidden="true"
                      ></span>
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              )}
            </Modal.Footer>
          </Modal>

          {/* ---------------- Credit Limit Modal ---------------- */}
          <Modal
            show={showCreditLimitModal}
            onHide={closeCreditLimitModal}
            centered
            size="xl"
            backdrop="static"
            keyboard={false}
          >
            <Modal.Header closeButton={!isLoading}>
              <Modal.Title>
                Manage Credit Limit - {agent.companyName}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <Form.Group className="mb-4">
                  <Form.Label className="fw-bold">Select Action:</Form.Label>
                  <Row>
                    <Col xs="auto">
                      <Form.Check
                        type="radio"
                        id="initial-credit"
                        name="creditLimitType"
                        value="initial"
                        label="Add Initial Credit Limit"
                        checked={creditLimitType === "initial"}
                        onChange={handleCreditLimitTypeChange}
                        disabled={hasInitialCredit}
                        className="mb-2"
                      />
                    </Col>
                    <Col xs="auto">
                      <Form.Check
                        type="radio"
                        id="update-credit"
                        name="creditLimitType"
                        value="update"
                        label="Update Credit Limit"
                        checked={creditLimitType === "update"}
                        onChange={handleCreditLimitTypeChange}
                        disabled={!hasInitialCredit}
                        className="mb-2"
                      />
                    </Col>
                  </Row>
                </Form.Group>
                <hr className="my-3" />
                {creditLimitType === "initial" ? (
                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>
                          <span className="text-danger">*</span>Add Credit Limit
                        </Form.Label>
                        <Form.Control
                          type="number"
                          name="addCreditLimit"
                          value={creditLimitFormData.addCreditLimit}
                          onChange={handleCreditLimitChange}
                          placeholder="Enter initial credit limit amount"
                          isInvalid={!!creditLimitErrors.addCreditLimit}
                          min="0"
                          step="0.01"
                        />
                        <Form.Control.Feedback type="invalid">
                          {creditLimitErrors.addCreditLimit}
                        </Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Paid Through</Form.Label>
                        <Form.Select
                          name="paymentMode"
                          value={creditLimitFormData.paymentMode}
                          onChange={handleCreditLimitChange}
                        >
                          <option value="">SELECT</option>
                          <option value="CASH">Cash</option>
                          <option value="CREDIT_CARD">Credit Card</option>
                          <option value="BANK_TRANSFER">Bank Transfer</option>
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  </Row>
                ) : (
                  <>
                    <Form.Group className="mb-3">
                      <Form.Label className="fw-bold d-block">
                        Add or Reduce
                      </Form.Label>
                      <Form.Check
                        inline
                        type="radio"
                        id="credit-adjust-add"
                        name="creditAdjustDirection"
                        value="add"
                        label="Add"
                        checked={creditAdjustDirection === "add"}
                        onChange={() => setCreditAdjustDirection("add")}
                      />
                      <Form.Check
                        inline
                        type="radio"
                        id="credit-adjust-reduce"
                        name="creditAdjustDirection"
                        value="reduce"
                        label="Reduce"
                        checked={creditAdjustDirection === "reduce"}
                        onChange={() => setCreditAdjustDirection("reduce")}
                      />
                    </Form.Group>
                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>
                            <span className="text-danger">*</span>
                            {creditAdjustDirection === "reduce"
                              ? "Reduce Credit Limit By"
                              : "Add-on Credit Limit"}
                          </Form.Label>
                          <Form.Control
                            type="number"
                            name="addCreditLimit"
                            value={creditLimitFormData.addCreditLimit}
                            onChange={handleCreditLimitChange}
                            placeholder={
                              creditAdjustDirection === "reduce"
                                ? "Enter amount to reduce"
                                : "Enter amount to add"
                            }
                            isInvalid={!!creditLimitErrors.addCreditLimit}
                            min="0"
                            step="0.01"
                          />
                          <Form.Control.Feedback type="invalid">
                            {creditLimitErrors.addCreditLimit}
                          </Form.Control.Feedback>
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>
                            <span className="text-danger">*</span>Remarks
                          </Form.Label>
                          <Form.Control
                            as="textarea"
                            rows={3}
                            name="remarks"
                            value={creditLimitFormData.remarks}
                            onChange={handleCreditLimitChange}
                            placeholder="Enter remarks"
                            isInvalid={!!creditLimitErrors.remarks}
                          />
                          <Form.Control.Feedback type="invalid">
                            {creditLimitErrors.remarks}
                          </Form.Control.Feedback>
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>Paid Through</Form.Label>
                          <Form.Select
                            name="paymentMode"
                            value={creditLimitFormData.paymentMode}
                            onChange={handleCreditLimitChange}
                          >
                            <option value="">SELECT</option>
                            <option value="CASH">Cash</option>
                            <option value="CREDIT_CARD">Credit Card</option>
                            <option value="BANK_TRANSFER">Bank Transfer</option>
                          </Form.Select>
                        </Form.Group>
                      </Col>
                    </Row>
                    <hr className="my-3" />
                    <Row>
                      <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>Total Credit Limit</Form.Label>
                          <Form.Control
                            type="text"
                            value={creditLimitFormData.totalCreditLimit}
                            readOnly
                            className="bg-light"
                          />
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>Available Credit Limit</Form.Label>
                          <Form.Control
                            type="text"
                            value={creditLimitFormData.availableCreditLimit}
                            readOnly
                            className="bg-light"
                          />
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <Form.Group className="mb-3">
                          <Form.Label>Used Credit Limit</Form.Label>
                          <Form.Control
                            type="text"
                            value={creditLimitFormData.usedCreditLimit}
                            readOnly
                            className="bg-light"
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                  </>
                )}

                {/* ---- Temporary Credit Limit — extends this same Credit
                    Limit section; only available once a regular credit
                    limit exists. ---- */}
                {hasInitialCredit && (
                  <>
                    <hr className="my-3" />
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <span className="fw-bold">Temporary Credit Limit</span>
                      {!showTempCreditForm && (
                        <Button
                          size="sm"
                          variant="outline-primary"
                          className="d-inline-flex align-items-center gap-1"
                          onClick={openAddTempCreditForm}
                        >
                          <FaPlus size={11} /> Add Temporary Credit
                        </Button>
                      )}
                    </div>

                    {showTempCreditForm ? (
                      <div className="border rounded p-3 mb-3 bg-light">
                        <Row>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                <span className="text-danger">*</span>Temporary
                                Credit Limit Amount
                              </Form.Label>
                              <Form.Control
                                type="number"
                                name="amount"
                                value={tempCreditFormData.amount}
                                onChange={handleTempCreditFormChange}
                                placeholder="Enter amount"
                                isInvalid={!!tempCreditErrors.amount}
                                min="0"
                                step="0.01"
                              />
                              <Form.Control.Feedback type="invalid">
                                {tempCreditErrors.amount}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>Remarks</Form.Label>
                              <Form.Control
                                type="text"
                                name="remarks"
                                value={tempCreditFormData.remarks}
                                onChange={handleTempCreditFormChange}
                                placeholder="Optional"
                              />
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                <span className="text-danger">*</span>Start Date
                                &amp; Time
                              </Form.Label>
                              <Form.Control
                                type="datetime-local"
                                name="startDateTime"
                                value={tempCreditFormData.startDateTime}
                                onChange={handleTempCreditFormChange}
                                isInvalid={!!tempCreditErrors.startDateTime}
                              />
                              <Form.Control.Feedback type="invalid">
                                {tempCreditErrors.startDateTime}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                <span className="text-danger">*</span>End Date &amp;
                                Time
                              </Form.Label>
                              <Form.Control
                                type="datetime-local"
                                name="endDateTime"
                                value={tempCreditFormData.endDateTime}
                                onChange={handleTempCreditFormChange}
                                isInvalid={!!tempCreditErrors.endDateTime}
                              />
                              <Form.Control.Feedback type="invalid">
                                {tempCreditErrors.endDateTime}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                        </Row>
                        <div className="d-flex justify-content-end gap-2">
                          <Button
                            size="sm"
                            variant="outline-secondary"
                            onClick={closeTempCreditForm}
                            disabled={tempCreditSaving}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={handleTempCreditSubmit}
                            disabled={tempCreditSaving}
                          >
                            {tempCreditSaving
                              ? "Saving..."
                              : editingTempCreditId
                                ? "Update"
                                : "Save"}
                          </Button>
                        </div>
                      </div>
                    ) : tempCreditsLoading ? (
                      <div className="text-center py-3">
                        <Spinner animation="border" size="sm" />
                      </div>
                    ) : tempCredits.length === 0 ? (
                      <div className="text-muted small mb-3">
                        No temporary credit limits added yet.
                      </div>
                    ) : (
                      <div
                        className="table-responsive mb-3 border rounded"
                        style={{ minWidth: 0 }}
                      >
                        <table
                          className="table align-middle mb-0"
                          style={{ minWidth: "760px" }}
                        >
                          <thead>
                            <tr
                              style={{
                                fontSize: "0.75rem",
                                backgroundColor: "#f8f9fa",
                              }}
                            >
                              <th className="py-3 px-3">Amount</th>
                              <th className="py-3 px-3">Available</th>
                              <th className="py-3 px-3">Start</th>
                              <th className="py-3 px-3">End</th>
                              <th className="py-3 px-3">Remarks</th>
                              <th className="py-3 px-3">Status</th>
                              <th
                                className="py-3 px-3 text-center"
                                style={{ width: "160px" }}
                              >
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody style={{ fontSize: "0.82rem" }}>
                            {tempCredits.map((row) => (
                              <tr key={row.id}>
                                <td className="py-2 px-3">{row.amount}</td>
                                <td className="py-2 px-3">{row.availableAmount}</td>
                                <td className="py-2 px-3 text-nowrap">
                                  {formatDateTimeDisplay(row.startDateTime)}
                                </td>
                                <td className="py-2 px-3 text-nowrap">
                                  {formatDateTimeDisplay(row.endDateTime)}
                                </td>
                                <td className="py-2 px-3">{row.remarks || "-"}</td>
                                <td className="py-2 px-3">
                                  <Button
                                    size="sm"
                                    variant={
                                      row.status === "Active" ? "success" : "outline-secondary"
                                    }
                                    className="d-inline-flex align-items-center gap-1"
                                    disabled={tempCreditTogglingId === row.id}
                                    title={
                                      row.enabled
                                        ? "Click to deactivate"
                                        : "Click to activate"
                                    }
                                    onClick={() => handleToggleTempCreditEnabled(row)}
                                  >
                                    {row.status === "Active" ? <FaToggleOn /> : <FaToggleOff />}
                                    {row.status}
                                  </Button>
                                </td>
                                <td className="py-2 px-3">
                                  <div className="d-flex justify-content-center gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline-primary"
                                      onClick={() => openEditTempCreditForm(row)}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline-danger"
                                      onClick={() => handleDeleteTempCredit(row)}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={closeCreditLimitModal}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreditLimitSubmit}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    {creditLimitType === "initial" ? "Creating..." : "Updating..."}
                  </>
                ) : creditLimitType === "initial" ? (
                  "Save"
                ) : (
                  "Update"
                )}
              </Button>
            </Modal.Footer>
          </Modal>

          {/* ---------------- Exclusion Modal ---------------- */}
          <Modal
            show={showExclusionModal}
            onHide={closeExclusionModal}
            centered
            size="md"
            backdrop="static"
            keyboard={false}
          >
            <Modal.Header closeButton={!isLoading}>
              <Modal.Title>Agent Exclusion - {agent.companyName}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form className="agent-exclude-form">
                <Row>
                  <Col md={12}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        <span className="text-danger">*</span>External API
                      </Form.Label>
                      <div className="api-dropdown-container position-relative">
                        <div
                          className={`form-control d-flex flex-wrap align-items-center ${
                            exclusionErrors.externalApi ? "is-invalid" : ""
                          }`}
                          style={{
                            minHeight: 38,
                            cursor: "pointer",
                            border: exclusionErrors.externalApi
                              ? "1px solid #dc3545"
                              : "1px solid #ced4da",
                          }}
                          onClick={() => setShowApiDropdown((s) => !s)}
                        >
                          {exclusionFormData.externalApi.length === 0 ? (
                            <span className="text-muted">
                              Select APIs to exclude
                            </span>
                          ) : (
                            exclusionFormData.externalApi.map((apiCode) => {
                              const api = externalApis.find(
                                (a) => a.code === apiCode
                              );
                              return (
                                <span
                                  key={apiCode}
                                  className="badge bg-primary me-1 mb-1 d-flex align-items-center"
                                  style={{ fontSize: 12 }}
                                >
                                  {api?.name || apiCode}
                                  <button
                                    type="button"
                                    className="btn-close btn-close-white ms-1"
                                    style={{ fontSize: 8 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeApi(apiCode);
                                    }}
                                  ></button>
                                </span>
                              );
                            })
                          )}
                        </div>
                        {showApiDropdown && (
                          <div
                            className="position-absolute w-100 bg-white border rounded shadow-lg"
                            style={{
                              zIndex: 9999,
                              maxHeight: 200,
                              overflowY: "auto",
                              minHeight: 120,
                              border: "2px solid #007bff",
                              marginBottom: 2,
                            }}
                          >
                            {externalApis.map((api) => {
                              const isSelected =
                                exclusionFormData.externalApi.includes(api.code);
                              return (
                                <div
                                  key={api.code}
                                  className="px-3 py-2"
                                  style={{
                                    borderBottom: "1px solid #eee",
                                    cursor: isSelected
                                      ? "not-allowed"
                                      : "pointer",
                                    opacity: isSelected ? 0.5 : 1,
                                    color: isSelected
                                      ? "#6c757d"
                                      : "inherit",
                                  }}
                                  onClick={() => {
                                    if (!isSelected) toggleApi(api.code);
                                  }}
                                >
                                  <div className="fw-small">{api.name}</div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {exclusionErrors.externalApi && (
                          <div className="invalid-feedback d-block">
                            {exclusionErrors.externalApi}
                          </div>
                        )}
                      </div>
                    </Form.Group>
                  </Col>
                </Row>
                <div className="alert alert-info">
                  <small>
                    <strong>Note:</strong> This will exclude the selected
                    external API for this agent.
                  </small>
                </div>
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={closeExclusionModal}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleExclusionSubmit}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    Submitting...
                  </>
                ) : (
                  "Submit Exclusion"
                )}
              </Button>
            </Modal.Footer>
          </Modal>

          {/* ── Agent photo lightbox ──
              Opens when the user clicks the small photo in the page header.
              Renders the same image at a large, contained size for inspection. */}
          <Modal
            show={showPhotoModal}
            onHide={() => setShowPhotoModal(false)}
            size="lg"
            centered
            aria-labelledby="agent-photo-modal-title"
          >
            <Modal.Header closeButton className="border-0 pb-0">
              <Modal.Title id="agent-photo-modal-title" style={{ fontSize: "1rem", fontWeight: 600 }}>
                {agent?.companyName ? `${agent.companyName} — Photo` : "Agent Photo"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body
              className="d-flex align-items-center justify-content-center"
              style={{ background: "#FAFAF8", padding: "24px" }}
            >
              {(() => {
                const raw = typeof agent?.agentLogo === "string" ? agent.agentLogo.trim() : "";
                let src = "";
                if (raw) {
                  if (raw.startsWith("data:")) {
                    src = raw;
                  } else {
                    let mime = "image/png";
                    if (raw.startsWith("/9j/")) mime = "image/jpeg";
                    else if (raw.startsWith("iVBORw")) mime = "image/png";
                    else if (raw.startsWith("R0lGOD")) mime = "image/gif";
                    else if (raw.startsWith("UklGR")) mime = "image/webp";
                    src = `data:${mime};base64,${raw}`;
                  }
                }
                return src ? (
                  <img
                    src={src}
                    alt={`${agent?.companyName || "Agent"} photo (full size)`}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "70vh",
                      objectFit: "contain",
                      borderRadius: "12px",
                      background: "#fff",
                      boxShadow: "0 8px 24px rgba(17, 19, 24, .10)",
                    }}
                  />
                ) : (
                  <div style={{ color: "#9CA3AF", fontSize: "14px", padding: "40px 0" }}>
                    No photo uploaded for this agent.
                  </div>
                );
              })()}
            </Modal.Body>
          </Modal>

          {/* Trade-license preview modal — inline iframe/img so the admin
              never leaves the page. Mirrors the /admin/approval/agents/:id
              modal so the two views behave identically. */}
          <Modal
            show={showLicenseModal}
            onHide={() => setShowLicenseModal(false)}
            size="xl"
            centered
            backdrop="static"
          >
            <Modal.Header closeButton>
              <Modal.Title style={{ fontSize: "1rem", fontWeight: 700 }}>
                Trade License — {agent?.companyName || "Agent"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body style={{ padding: 0, height: "80vh", background: "#f8f9fa" }}>
              {agent?.tradeLicenseFile ? (
                /\.pdf($|\?)/i.test(agent.tradeLicenseFile) ? (
                  <iframe
                    key={agent.tradeLicenseFile}
                    src={agent.tradeLicenseFile}
                    title="Trade License"
                    style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                  />
                ) : (
                  <div className="d-flex align-items-center justify-content-center h-100 p-3">
                    <img
                      src={agent.tradeLicenseFile}
                      alt="Trade License"
                      style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                    />
                  </div>
                )
              ) : (
                <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                  No file uploaded.
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" size="sm" onClick={() => setShowLicenseModal(false)}>
                Close
              </Button>
            </Modal.Footer>
          </Modal>

          {/* Inline Update Agent modal — opens on this view page rather than
              bouncing back to /registration/agent. Mounted only while
              editing so its internal form/modal state resets cleanly on
              close. `embedded` tells AgentReg to skip its own Topbar/
              Sidebar/list Card and render only the modals. */}
          {showInlineEdit && (
            <AgentReg
              embedded
              initialEditId={id}
              onClose={handleInlineEditClose}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default AgentView;
