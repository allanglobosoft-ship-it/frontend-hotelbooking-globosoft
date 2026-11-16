import { useEffect, useState } from "react";
import axiosInstance from "../AxiosInstance";
import { Form } from "react-bootstrap";
import chevronStyle from "./dropdownChevron";

// Login-account typeahead (every user: admin, staff, agent, sub-agent,
// extranet …). Emits the username, or "" for "All users".
// Options come from /api/super-admin/user-accounts, which is SUPER_ADMIN-only —
// use this filter on super-admin pages only.
export default function UserAccount({ value, onChange, label = "User" }) {
  const [users, setUsers] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    axiosInstance
      .get("/api/super-admin/user-accounts")
      .then((res) => setUsers(Array.isArray(res.data) ? res.data : []))
      .catch((err) => console.error("error fetching user accounts:", err));
  }, []);

  const getDisplayName = (u) => {
    const name = (u.name || "").trim();
    return name && name !== u.userName ? `${name} (${u.userName})` : u.userName || "";
  };

  const q = searchTerm.trim().toLowerCase();
  const filtered = q
    ? users.filter((u) =>
        [u.name, u.userName, u.userType].some((v) => (v || "").toLowerCase().includes(q)),
      )
    : users;

  const selectedOption = users.find((u) => u.userName === value);
  const selectedText = value ? (selectedOption ? getDisplayName(selectedOption) : value) : "";

  const pick = (userName) => {
    onChange(userName);
    setIsOpen(false);
    setSearchTerm("");
  };

  return (
    <Form.Group>
      <Form.Label className="small mb-2">{label}</Form.Label>
      <div className="position-relative">
        <Form.Control
          size="sm"
          style={chevronStyle}
          value={isOpen ? searchTerm : selectedText}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="All users"
          autoComplete="off"
        />
        {isOpen && (
          <>
            <div
              className="position-absolute w-100 bg-white border shadow-lg"
              style={{ zIndex: 1050, maxHeight: "260px", overflowY: "auto", top: "100%" }}
            >
              <div
                className="px-3 py-2 dropdown-item"
                style={{ cursor: "pointer" }}
                onClick={() => pick("")}
              >
                All users
              </div>
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-muted">No users found</div>
              ) : (
                filtered.map((u) => (
                  <div
                    key={u.id}
                    className="px-3 py-2 dropdown-item d-flex justify-content-between gap-2"
                    style={{ cursor: "pointer" }}
                    onClick={() => pick(u.userName)}
                  >
                    <span className="text-truncate">{getDisplayName(u)}</span>
                    {u.userType && <small className="text-muted text-nowrap">{u.userType}</small>}
                  </div>
                ))
              )}
            </div>
            <div
              className="position-fixed"
              style={{ top: 0, left: 0, right: 0, bottom: 0, zIndex: 1040 }}
              onClick={() => {
                setIsOpen(false);
                setSearchTerm("");
              }}
            />
          </>
        )}
      </div>
    </Form.Group>
  );
}
