import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, Table, Badge, Form, Button, Modal, InputGroup } from "react-bootstrap";
import { FaTrash, FaUserPlus, FaEye, FaEyeSlash, FaEdit, FaSearch } from "react-icons/fa";
import Swal from "sweetalert2";
import Sidebar from "../../../components/Sidebar";
import Topbar from "../../../components/TopBar";
import BackButton from "../../../components/BackButton";
import axiosInstance from "../../../components/AxiosInstance";
import { toast } from "react-hot-toast";

/**
 * SUPER_ADMIN-only screen that lists every ADMIN login and lets the
 * super_admin bind each one to a company. The company assignment is
 * inherited by every AGENT the admin creates from that point onward
 * (see UserAccountService.createAgentUser). At hotel-search time
 * HotelApiCallerContext.applyCompanySupplierRestriction resolves the
 * agent → admin → company chain to a per-company API allow-list.
 *
 * Backend endpoints:
 *   GET    /api/super-admin/admins                      list admins
 *   POST   /api/super-admin/admins                      create admin (username + password)
 *   DELETE /api/super-admin/admins/{id}                 delete admin
 *   PATCH  /api/super-admin/admins/{id}/company         assign / clear company
 *   GET    /api/companyProfile                          picker source
 */
const ADMINS_URL = "/api/super-admin/admins";
const COMPANIES_URL = "/api/companyProfile";

// Mirror of the backend password rule in CreateAdminRequestDTO — one upper,
// one lower, one digit, one special (@$!%*?&); min 8 chars. Kept in sync
// with UserDTO.password so admins created here obey the same policy as
// everyone registering via /auth/register.
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/;
const EMPTY_CREATE_FORM = { username: "", password: "" };
/* Edit modal shares username / password rules with Create; keeps company as
   a separate opt-in so a blank password + unchanged company round-trips as
   a username-only rename (see UpdateAdminRequestDTO.updateCompany). */
const EMPTY_EDIT_FORM = { username: "", password: "", companyProfileId: "" };
/* Debounce ms for the search box — matches the AgentReg pager. Kept short
   enough that the operator feels the result track their typing, long
   enough to avoid a request per keystroke. */
const SEARCH_DEBOUNCE_MS = 400;

export default function AdminList() {
  const [admins, setAdmins] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  // Pending picks are held per-row so a single Save click writes them.
  // Undefined = no change yet; anything else (including "") = user picked.
  const [pending, setPending] = useState({});
  const [savingId, setSavingId] = useState(null);
  // Create-admin modal state — independent from the company-assignment flow above.
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [createError, setCreateError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // --- Search + active-only filter --------------------------------------
  // `search` is what the operator is typing; `debouncedSearch` is what
  // actually reaches the API. Same pattern used by AgentReg's list pager
  // — decoupling the two stops the network from firing per keystroke.
  // `activeOnly` is off by default so today's default view is unchanged.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  // Guards a superseded fetch from clobbering a fresher one — if the
  // operator types, backspaces, and the older request resolves last,
  // the sequence check drops it.
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  // --- Edit modal state -------------------------------------------------
  const [showEdit, setShowEdit] = useState(false);
  const [editRow, setEditRow] = useState(null);          // the admin being edited
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editError, setEditError] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // --- Active toggle state ---------------------------------------------
  const [togglingStatusId, setTogglingStatusId] = useState(null);

  // --- Self-account guard ----------------------------------------------
  // The backend refuses username / password / delete / deactivate on the
  // caller's own row. We mirror that on the FE so the operator never sees
  // a button they cannot use. Falls back to sessionStorage the same way
  // Sidebar.jsx does, so the check works after a hard refresh too.
  const selfUsername = useMemo(() => (
    (localStorage.getItem("UserName") ||
      sessionStorage.getItem("UserName") ||
      "").trim().toLowerCase()
  ), []);
  const isSelfRow = (row) =>
    !!selfUsername && (row?.username || "").toLowerCase() === selfUsername;

  const fetchAdmins = async () => {
    const seq = ++fetchSeqRef.current;
    setIsLoading(true);
    try {
      // Only forward the two params when they carry a value — an omitted
      // search + activeOnly=false makes the request byte-identical to the
      // pre-search-feature call, so nothing else on the app that hits this
      // endpoint (if anything ever does) is affected.
      const params = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (activeOnly) params.activeOnly = true;
      const res = await axiosInstance.get(ADMINS_URL, {
        params: Object.keys(params).length ? params : undefined,
      });
      if (seq !== fetchSeqRef.current) return; // superseded, drop
      setAdmins(Array.isArray(res.data) ? res.data : []);
    } catch {
      if (seq === fetchSeqRef.current) {
        toast.error("Failed to load admins");
        setAdmins([]);
      }
    } finally {
      if (seq === fetchSeqRef.current) setIsLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      const res = await axiosInstance.get(COMPANIES_URL, {
        params: { page: 0, size: 200 },
      });
      const rows = Array.isArray(res.data) ? res.data : (res.data?.content || []);
      setCompanies(rows);
    } catch {
      setCompanies([]);
    }
  };

  useEffect(() => {
    fetchAdmins();
    fetchCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch whenever the operator settles on a new search term or flips
  // the active-only checkbox. The initial mount is covered by the effect
  // above; this one takes over once either state moves off its default.
  useEffect(() => {
    // Skip the very first run — the mount effect above already fetched
    // with the default params, so without this guard the app would fire
    // two identical requests on mount.
    if (debouncedSearch === "" && activeOnly === false) {
      // Only skip when BOTH are still at their initial defaults. Once the
      // operator has cleared a previous search, we DO want the reset to
      // fire so the list snaps back to the full set.
      if (fetchSeqRef.current === 0) return;
    }
    fetchAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, activeOnly]);

  const companyLabel = (id) => {
    if (id == null) return "";
    const c = companies.find((x) => String(x.companyProfileId) === String(id));
    if (!c) return `#${id}`;
    return c.companyCode ? `${c.companyName} (${c.companyCode})` : c.companyName;
  };

  const pickedFor = (row) =>
    Object.prototype.hasOwnProperty.call(pending, row.id)
      ? pending[row.id]
      : (row.companyProfileId ?? "");

  const isDirty = (row) => {
    const cur = row.companyProfileId ?? "";
    const next = pickedFor(row);
    // Compare as strings — <select> yields strings for numeric ids.
    return String(cur) !== String(next);
  };

  const openCreate = () => {
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateError("");
    setShowPassword(false);
    setShowCreate(true);
  };

  const closeCreate = () => {
    if (submittingCreate) return;
    setShowCreate(false);
  };

  const submitCreate = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const username = (createForm.username || "").trim();
    const password = createForm.password || "";
    if (!USERNAME_REGEX.test(username)) {
      setCreateError("Username may contain only letters, digits, and underscores.");
      return;
    }
    // Case-insensitive uniqueness check against the currently loaded list.
    // The backend also enforces this (existsByUsernameIgnoreCase); this is
    // just a fast client-side bail-out so the user sees the error without
    // a round-trip. Cross-role collisions (e.g. an existing AGENT with the
    // same username) are still caught by the backend.
    const usernameLc = username.toLowerCase();
    if (admins.some((a) => (a.username || "").toLowerCase() === usernameLc)) {
      setCreateError(`Username '${username}' is already taken.`);
      return;
    }
    if (password.length < 8) {
      setCreateError("Password must be at least 8 characters long.");
      return;
    }
    if (!PASSWORD_REGEX.test(password)) {
      // Diagnose exactly which rule failed so the user isn't guessing.
      const missing = [];
      if (!/[A-Z]/.test(password)) missing.push("an uppercase letter");
      if (!/[a-z]/.test(password)) missing.push("a lowercase letter");
      if (!/\d/.test(password)) missing.push("a digit");
      if (!/[@$!%*?&]/.test(password)) missing.push("a special character (@ $ ! % * ? &)");
      const disallowed = password.replace(/[A-Za-z\d@$!%*?&]/g, "");
      if (disallowed.length > 0) {
        const unique = Array.from(new Set(disallowed.split(""))).join(" ");
        setCreateError(
          `Password contains characters that are not allowed: ${unique}. ` +
          "Allowed: letters, digits, and one of @ $ ! % * ? & — no other symbols (e.g. # _ . -)."
        );
      } else if (missing.length > 0) {
        setCreateError(`Password is missing ${missing.join(", ")}.`);
      } else {
        setCreateError("Password does not meet the required policy.");
      }
      return;
    }
    setCreateError("");
    setSubmittingCreate(true);
    try {
      await axiosInstance.post(ADMINS_URL, { username, password });
      toast.success(`Admin '${username}' created`);
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE_FORM);
      await fetchAdmins();
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data ||
        "Failed to create admin";
      setCreateError(typeof msg === "string" ? msg : "Failed to create admin");
    } finally {
      setSubmittingCreate(false);
    }
  };

  const confirmDelete = (row) => {
    Swal.fire({
      title: `Delete admin '${row.username}'?`,
      html:
        "This removes the login and its company assignment. " +
        "Any agents this admin already created will keep working.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#EC0B43",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Yes, delete",
    }).then(async (r) => {
      if (!r.isConfirmed) return;
      setDeletingId(row.id);
      try {
        await axiosInstance.delete(`${ADMINS_URL}/${row.id}`);
        toast.success("Admin deleted");
        // Also drop any pending company pick for this row so state stays clean.
        setPending((p) => {
          const { [row.id]: _drop, ...rest } = p;
          return rest;
        });
        await fetchAdmins();
      } catch (err) {
        const msg =
          err?.response?.data?.message ||
          err?.response?.data ||
          "Delete failed";
        toast.error(typeof msg === "string" ? msg : "Delete failed");
      } finally {
        setDeletingId(null);
      }
    });
  };

  // ---------- Edit modal ------------------------------------------------
  const openEdit = (row) => {
    setEditRow(row);
    setEditForm({
      username: row?.username || "",
      password: "",
      // Keep as string so the <select> comparison stays in string-space,
      // matching how the row-inline dropdown already works.
      companyProfileId:
        row?.companyProfileId == null ? "" : String(row.companyProfileId),
    });
    setEditError("");
    setShowEditPassword(false);
    setShowEdit(true);
  };

  const closeEdit = () => {
    if (submittingEdit) return;
    setShowEdit(false);
    setEditRow(null);
    setEditForm(EMPTY_EDIT_FORM);
    setEditError("");
  };

  const submitEdit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!editRow) return;
    const row = editRow;
    const isSelf = isSelfRow(row);

    const trimmedUsername = (editForm.username || "").trim();
    const password = editForm.password || "";
    // Compare the picked company (string) to the row's current one so a
    // "no-change" edit does not send the field at all — the backend then
    // leaves the current assignment untouched. Empty string means "clear".
    const currentCompanyStr =
      row.companyProfileId == null ? "" : String(row.companyProfileId);
    const pickedCompanyStr = editForm.companyProfileId ?? "";
    const companyChanged = currentCompanyStr !== pickedCompanyStr;

    const usernameChanged =
      trimmedUsername.length > 0 &&
      trimmedUsername.toLowerCase() !== (row.username || "").toLowerCase();
    const passwordChanged = password.length > 0;

    if (!usernameChanged && !passwordChanged && !companyChanged) {
      setEditError("Nothing to save — change at least one field.");
      return;
    }

    // Client-side echo of the backend self-guard so the operator sees the
    // reason before we round-trip.
    if (isSelf && (usernameChanged || passwordChanged)) {
      setEditError(
        "You cannot rename or change your own password from here — use the standard change-password flow."
      );
      return;
    }

    if (usernameChanged) {
      if (!USERNAME_REGEX.test(trimmedUsername)) {
        setEditError("Username may contain only letters, digits, and underscores.");
        return;
      }
      const usernameLc = trimmedUsername.toLowerCase();
      if (admins.some((a) => a.id !== row.id && (a.username || "").toLowerCase() === usernameLc)) {
        setEditError(`Username '${trimmedUsername}' is already taken.`);
        return;
      }
    }

    if (passwordChanged) {
      if (password.length < 8) {
        setEditError("Password must be at least 8 characters long.");
        return;
      }
      if (!PASSWORD_REGEX.test(password)) {
        const missing = [];
        if (!/[A-Z]/.test(password)) missing.push("an uppercase letter");
        if (!/[a-z]/.test(password)) missing.push("a lowercase letter");
        if (!/\d/.test(password)) missing.push("a digit");
        if (!/[@$!%*?&]/.test(password)) missing.push("a special character (@ $ ! % * ? &)");
        const disallowed = password.replace(/[A-Za-z\d@$!%*?&]/g, "");
        if (disallowed.length > 0) {
          const unique = Array.from(new Set(disallowed.split(""))).join(" ");
          setEditError(
            `Password contains characters that are not allowed: ${unique}. ` +
            "Allowed: letters, digits, and one of @ $ ! % * ? & — no other symbols."
          );
        } else if (missing.length > 0) {
          setEditError(`Password is missing ${missing.join(", ")}.`);
        } else {
          setEditError("Password does not meet the required policy.");
        }
        return;
      }
    }

    // Only send the fields the operator actually changed. The DTO's
    // updateCompany flag lets us tell "leave company alone" (omit or
    // false) apart from "explicitly clear it" (true + null id).
    const payload = {};
    if (usernameChanged) payload.username = trimmedUsername;
    if (passwordChanged) payload.password = password;
    if (companyChanged) {
      payload.updateCompany = true;
      payload.companyProfileId = pickedCompanyStr === "" ? null : Number(pickedCompanyStr);
    }

    setEditError("");
    setSubmittingEdit(true);
    try {
      const res = await axiosInstance.put(`${ADMINS_URL}/${row.id}`, payload);
      setAdmins((list) => list.map((r) => (r.id === row.id ? res.data : r)));
      toast.success("Admin updated");
      closeEdit();
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data ||
        "Failed to update admin";
      setEditError(typeof msg === "string" ? msg : "Failed to update admin");
    } finally {
      setSubmittingEdit(false);
    }
  };

  // ---------- Activate / deactivate toggle -----------------------------
  const toggleStatus = (row) => {
    const nextActive = !row.active;
    const nextLabel = nextActive ? "Activate" : "Deactivate";
    if (!nextActive && isSelfRow(row)) {
      toast.error("You cannot deactivate your own account while logged in");
      return;
    }
    Swal.fire({
      title: `${nextLabel} '${row.username}'?`,
      html: nextActive
        ? "Restores this admin's access to every /api endpoint. They will need to log in again."
        : "Immediately blocks this admin from every /api endpoint on their next request. Any agents they already created keep working.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: nextActive ? "#198754" : "#EC0B43",
      cancelButtonColor: "#6c757d",
      confirmButtonText: `Yes, ${nextLabel.toLowerCase()}`,
    }).then(async (r) => {
      if (!r.isConfirmed) return;
      setTogglingStatusId(row.id);
      try {
        const res = await axiosInstance.patch(
          `${ADMINS_URL}/${row.id}/status`,
          { active: nextActive }
        );
        setAdmins((list) => list.map((r2) => (r2.id === row.id ? res.data : r2)));
        toast.success(`Admin ${nextActive ? "activated" : "deactivated"}`);
      } catch (err) {
        const msg =
          err?.response?.data?.message ||
          err?.response?.data ||
          "Status change failed";
        toast.error(typeof msg === "string" ? msg : "Status change failed");
      } finally {
        setTogglingStatusId(null);
      }
    });
  };

  const saveRow = async (row) => {
    const next = pickedFor(row);
    const body = { companyProfileId: next === "" ? null : Number(next) };
    setSavingId(row.id);
    try {
      const res = await axiosInstance.patch(`${ADMINS_URL}/${row.id}/company`, body);
      setAdmins((list) => list.map((r) => (r.id === row.id ? res.data : r)));
      setPending((p) => {
        const { [row.id]: _, ...rest } = p;
        return rest;
      });
      toast.success("Company assignment saved");
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data || "Save failed";
      toast.error(typeof msg === "string" ? msg : "Save failed");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex align-items-center gap-2 flex-wrap">
              <BackButton fallback="/superAdminDashboard" />
              <span className="fw-semibold">Admin Management</span>
              <small className="text-muted d-none d-md-inline">
                Bind an ADMIN login to a company — every agent the admin
                creates from now on inherits the company's API restrictions.
              </small>
              {/* Search box — case-insensitive substring match on username.
                  Debounced so typing does not fire a request per keystroke.
                  A cleared box snaps back to the full unfiltered list. */}
              <InputGroup size="sm" style={{ maxWidth: 260 }} className="ms-auto">
                <InputGroup.Text><FaSearch /></InputGroup.Text>
                <Form.Control
                  type="search"
                  placeholder="Search username"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </InputGroup>
              {/* Active-only checkbox — off by default so today's default
                  view (all admins, active + inactive) is unchanged. */}
              <Form.Check
                type="switch"
                id="admin-active-only-switch"
                label="Active only"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
              />
              <Button
                size="sm"
                variant="primary"
                className="d-inline-flex align-items-center gap-1"
                onClick={openCreate}
              >
                <FaUserPlus /> Create Admin
              </Button>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>S/N</th>
                    <th>Username</th>
                    <th style={{ width: 130 }}>Status</th>
                    <th>Current Company</th>
                    <th>Assign Company</th>
                    <th style={{ width: 210 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((row, idx) => (
                    <tr key={row.id}>
                      <td>{idx + 1}</td>
                      <td>{row.username}</td>
                      <td>
                        {/* Interactive toggle. Swal-confirms before flipping.
                            Falls back to a plain Badge for the self-row so
                            the operator can't deactivate themselves. Hidden
                            entirely = never — same width kept so the column
                            stays aligned. */}
                        <div className="d-flex align-items-center gap-2">
                          <Form.Check
                            type="switch"
                            id={`admin-status-${row.id}`}
                            checked={!!row.active}
                            onChange={() => toggleStatus(row)}
                            disabled={
                              togglingStatusId === row.id ||
                              (isSelfRow(row) && row.active) /* can't self-deactivate */
                            }
                            title={
                              isSelfRow(row) && row.active
                                ? "You cannot deactivate your own account"
                                : (row.active
                                    ? "Click to deactivate"
                                    : "Click to activate")
                            }
                          />
                          {row.active
                            ? <Badge bg="success">Active</Badge>
                            : <Badge bg="secondary">Inactive</Badge>}
                        </div>
                      </td>
                      <td>
                        {row.companyProfileId
                          ? <small>{companyLabel(row.companyProfileId)}</small>
                          : <small className="text-muted">— unassigned (unrestricted)</small>}
                      </td>
                      <td>
                        <Form.Select
                          size="sm"
                          value={pickedFor(row)}
                          onChange={(e) =>
                            setPending((p) => ({ ...p, [row.id]: e.target.value }))
                          }
                          disabled={savingId === row.id}
                        >
                          <option value="">— None (unrestricted) —</option>
                          {companies.map((c) => (
                            <option key={c.companyProfileId} value={c.companyProfileId}>
                              {c.companyName}
                              {c.companyCode ? ` (${c.companyCode})` : ""}
                            </option>
                          ))}
                        </Form.Select>
                      </td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <Button
                            size="sm"
                            className="btn-green"
                            disabled={!isDirty(row) || savingId === row.id}
                            onClick={() => saveRow(row)}
                          >
                            {savingId === row.id ? "Saving…" : "Save"}
                          </Button>
                          {/* Edit — opens the Edit Admin modal for
                              username / password / company changes.
                              Self-row keeps the button but the username
                              and password inputs render disabled — the
                              backend refuses that combination anyway. */}
                          <Button
                            size="sm"
                            variant="outline-primary"
                            title="Edit admin"
                            onClick={() => openEdit(row)}
                          >
                            <FaEdit />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-danger"
                            title={
                              isSelfRow(row)
                                ? "You cannot delete your own account"
                                : "Delete admin"
                            }
                            disabled={deletingId === row.id || isSelfRow(row)}
                            onClick={() => confirmDelete(row)}
                          >
                            {deletingId === row.id
                              ? <span className="spinner-border spinner-border-sm" role="status" />
                              : <FaTrash />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {isLoading && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        <div className="spinner-border spinner-border-sm me-2" role="status" />
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!isLoading && admins.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        {(debouncedSearch || activeOnly)
                          ? "No admin accounts match the current filter."
                          : "No admin accounts found."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </main>
      </div>

      <Modal show={showCreate} onHide={closeCreate} centered backdrop="static">
        <Form onSubmit={submitCreate}>
          <Modal.Header closeButton={!submittingCreate}>
            <Modal.Title>Create Admin</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3" controlId="createAdminUsername">
              <Form.Label>Username</Form.Label>
              <Form.Control
                type="text"
                autoComplete="off"
                autoFocus
                value={createForm.username}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, username: e.target.value }))
                }
                disabled={submittingCreate}
                placeholder="e.g. admin_kochi"
              />
              <Form.Text className="text-muted">
                Letters, digits, and underscores only. No dots.
              </Form.Text>
            </Form.Group>
            <Form.Group className="mb-3" controlId="createAdminPassword">
              <Form.Label>Password</Form.Label>
              <InputGroup>
                <Form.Control
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, password: e.target.value }))
                  }
                  disabled={submittingCreate}
                />
                <Button
                  variant="outline-secondary"
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  disabled={submittingCreate}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </Button>
              </InputGroup>
              <Form.Text className="text-muted">
                Min 8 chars. Must include uppercase, lowercase, digit, and
                one of <code>@ $ ! % * ? &amp;</code>. Other symbols
                (e.g. <code>#</code> <code>_</code> <code>.</code>
                {" "}<code>-</code>) are <strong>not allowed</strong>.
              </Form.Text>
            </Form.Group>
            {createError && (
              <div className="alert alert-danger py-2 mb-0" role="alert">
                {createError}
              </div>
            )}
            <small className="text-muted d-block mt-2">
              Company assignment is a separate step — pick one from the row's
              dropdown after the admin is created.
            </small>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={closeCreate}
              disabled={submittingCreate}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={submittingCreate}
            >
              {submittingCreate ? "Creating…" : "Create Admin"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* ---------------- Edit Admin Modal ----------------
          Reuses the Create modal's field-level rules — same USERNAME_REGEX,
          same PASSWORD_REGEX — so validation errors read identically. Every
          field is opt-in on save: blank password = "keep current"; company
          unchanged = "leave assignment alone" via the DTO's updateCompany
          flag. Self-row renders username/password inputs disabled to
          mirror the backend refusal on those two edits.
      */}
      <Modal show={showEdit} onHide={closeEdit} centered backdrop="static">
        <Form onSubmit={submitEdit}>
          <Modal.Header closeButton={!submittingEdit}>
            <Modal.Title>
              Edit Admin{editRow ? ` — ${editRow.username}` : ""}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3" controlId="editAdminUsername">
              <Form.Label>Username</Form.Label>
              <Form.Control
                type="text"
                autoComplete="off"
                value={editForm.username}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, username: e.target.value }))
                }
                disabled={
                  submittingEdit || (editRow && isSelfRow(editRow))
                }
              />
              <Form.Text className="text-muted">
                Letters, digits, and underscores only. No dots.
                {editRow && isSelfRow(editRow) && (
                  <> · <em>You cannot rename your own account here — use the change-password flow.</em></>
                )}
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3" controlId="editAdminPassword">
              <Form.Label>New password (optional)</Form.Label>
              <InputGroup>
                <Form.Control
                  type={showEditPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Leave blank to keep current password"
                  value={editForm.password}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, password: e.target.value }))
                  }
                  disabled={
                    submittingEdit || (editRow && isSelfRow(editRow))
                  }
                />
                <Button
                  variant="outline-secondary"
                  type="button"
                  onClick={() => setShowEditPassword((v) => !v)}
                  tabIndex={-1}
                  disabled={
                    submittingEdit || (editRow && isSelfRow(editRow))
                  }
                  title={showEditPassword ? "Hide password" : "Show password"}
                >
                  {showEditPassword ? <FaEyeSlash /> : <FaEye />}
                </Button>
              </InputGroup>
              <Form.Text className="text-muted">
                Same policy as create — min 8 chars, upper + lower + digit +
                one of <code>@ $ ! % * ? &amp;</code>.
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3" controlId="editAdminCompany">
              <Form.Label>Company</Form.Label>
              <Form.Select
                value={editForm.companyProfileId}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, companyProfileId: e.target.value }))
                }
                disabled={submittingEdit}
              >
                <option value="">— None (unrestricted) —</option>
                {companies.map((c) => (
                  <option key={c.companyProfileId} value={c.companyProfileId}>
                    {c.companyName}
                    {c.companyCode ? ` (${c.companyCode})` : ""}
                  </option>
                ))}
              </Form.Select>
              <Form.Text className="text-muted">
                Every agent this admin creates from now on inherits this
                company. Existing agents are not retro-assigned.
              </Form.Text>
            </Form.Group>

            {editError && (
              <div className="alert alert-danger py-2 mb-0" role="alert">
                {editError}
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={closeEdit}
              disabled={submittingEdit}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={submittingEdit}
            >
              {submittingEdit ? "Saving…" : "Save changes"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}
