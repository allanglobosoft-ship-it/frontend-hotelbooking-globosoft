import React, { useEffect, useMemo, useRef, useState } from "react";
import { Nav, Offcanvas } from "react-bootstrap";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, PlusCircle, ClipboardList, BookOpen } from "lucide-react";
import "./Sidebar.css";
import usePartnerAccess from "../hooks/usePartnerAccess";
import {
  PARTNER_TYPE_LABEL,
  partnerDashboardPath,
  registrationTargetFor,
  resolveApprovedFeatures,
} from "../config/partnerFeatures";

/**
 * Sidebar for Supplier / DMC logins — generated from the account's live
 * approved features (GET /api/partner/me) rather than the hardcoded list in
 * Sidebar.jsx, which delegates here for partner roles.
 *
 * Shape mirrors the admin/agent menu the partner would recognise:
 *   Dashboard · Registration · New Booking · Booking List
 * with each group holding only the entries of approved features (see
 * config/partnerFeatures.js). A feature the admin has not approved is not
 * rendered at all; the route guard + backend filter enforce the same set.
 *
 * Purely presentational on top of the parent's shell state: the parent
 * Sidebar keeps owning the collapse / offcanvas toggles (it already wires
 * the TopBar events), and passes them down.
 */
export default function PartnerSidebar({
  role,
  show,
  onClose,
  collapsed,
  onToggleCollapsed,
}) {
  // (the parent Sidebar keeps the open/close + collapse handlers; only the
  //  state and the setters it needs are passed down)
  const { pathname } = useLocation();
  const { access, loading } = usePartnerAccess();
  const [openGroups, setOpenGroups] = useState({});
  const sidebarRef = useRef(null);
  const offcanvasRef = useRef(null);

  const dashboardPath = partnerDashboardPath(role);
  const dashboardLabel = `${PARTNER_TYPE_LABEL[role] || "Partner"} Dashboard`;

  const items = useMemo(() => {
    const features = resolveApprovedFeatures(access?.approvedFeatures);

    const newBooking = features.map((f) => ({
      key: `nb-${f.code}`,
      label: f.newBooking.label,
      to: f.newBooking.to,
    }));

    // Several hotel-family features share the hotel registration hub, so
    // registration links are de-duplicated by target path.
    const registration = [];
    const seen = new Set();
    for (const f of features) {
      for (const r of f.registration) {
        if (seen.has(r.to)) continue;
        seen.add(r.to);
        registration.push({
          key: `reg-${f.code}-${r.to}`,
          label: r.to === "/registration/hotel" ? "Hotel" : r.label,
          // DMC: hotel registration opens the create form (see catalog).
          to: registrationTargetFor(role, r.to),
        });
      }
    }

    const bookingList = features.map((f) => ({
      key: `bl-${f.code}`,
      label: f.bookingList.label,
      to: f.bookingList.to,
    }));

    // Menu order: Registration (set up inventory) → New Booking → Booking List.
    const groups = [];
    if (registration.length) groups.push({ label: "Registration", children: registration });
    if (newBooking.length) groups.push({ label: "New Booking", children: newBooking });
    if (bookingList.length) groups.push({ label: "Booking List", children: bookingList });
    return groups;
  }, [access, role]);

  const toggleGroup = (label) =>
    setOpenGroups((prev) => ({ [label]: !prev[label] }));

  // Same behaviour as Sidebar.jsx: a click anywhere outside the menu closes
  // the open flyout, otherwise it would sit over the page content.
  useEffect(() => {
    const handleClickOutside = (event) => {
      const sidebarEl = sidebarRef.current;
      const offcanvasEl = offcanvasRef.current;
      if (
        sidebarEl &&
        !sidebarEl.contains(event.target) &&
        (!offcanvasEl || !offcanvasEl.contains(event.target))
      ) {
        setOpenGroups({});
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const iconFor = (label) => {
    const props = { size: 18, strokeWidth: 1.5, className: "sidebar-icon" };
    switch (label) {
      case "New Booking":
        return <PlusCircle {...props} />;
      case "Registration":
        return <ClipboardList {...props} />;
      case "Booking List":
        return <BookOpen {...props} />;
      default:
        return <LayoutDashboard {...props} />;
    }
  };

  const renderMenu = (variant) => (
    <Nav
      className="flex-column"
      style={variant === "desktop" ? { paddingTop: 6, flex: "0 0 auto", flexWrap: "nowrap" } : undefined}
    >
      {/* Dashboard */}
      <Nav.Item className="nav-item-custom">
        <Nav.Link
          as={Link}
          to={dashboardPath}
          className={`d-flex align-items-center justify-content-between${pathname === dashboardPath ? " rw-active" : ""}`}
        >
          <span className="d-flex align-items-center">
            <span className="me-2">{iconFor("Dashboard")}</span>
            {/* Sidebar.css forces nowrap + hidden overflow on the link, so a
                long label ("Supplier Dashboard") would run under the collapse
                button; let just this label wrap and stop short of it. */}
            <span
              style={
                variant === "desktop"
                  ? { whiteSpace: "normal", lineHeight: 1.15, paddingRight: 30 }
                  : undefined
              }
            >
              {dashboardLabel}
            </span>
          </span>
        </Nav.Link>
      </Nav.Item>

      {items.map((group) => {
        const isOpen = !!openGroups[group.label];
        return (
          <Nav.Item
            key={group.label}
            className={`nav-item-custom nav-item-has-children${variant === "desktop" && group.children.length > 4 ? " submenu-center" : ""}`}
          >
            <Nav.Link
              as="div"
              className={`d-flex align-items-center justify-content-between${isOpen ? " rw-active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleGroup(group.label);
              }}
              style={{ cursor: "pointer" }}
            >
              <span className="d-flex align-items-center">
                <span className="me-2">{iconFor(group.label)}</span>
                <span>{group.label}</span>
              </span>
              <span className="caret">{isOpen ? "▴" : "▾"}</span>
            </Nav.Link>
            <div
              className={`submenu ${isOpen ? "show" : ""}`}
              style={{
                display: isOpen ? "block" : "none",
                zIndex: 9999,
                marginLeft: "12px",
                marginTop: "6px",
                paddingLeft: "8px",
                borderLeft: "1px solid var(--color-border, #e5e7eb)",
                maxHeight: "380px",
                overflowY: "auto",
                scrollbarWidth: "thin",
              }}
            >
              {group.children.map((child) => (
                <Nav.Link
                  as={Link}
                  to={child.to}
                  key={child.key}
                  className="submenu-link"
                  onClick={variant === "mobile" ? onClose : undefined}
                  style={{
                    display: "block",
                    padding: "8px 12px",
                    color: "var(--color-secondary, #111827)",
                    textDecoration: "none",
                    cursor: "pointer",
                    fontWeight: 450,
                  }}
                >
                  {child.label}
                </Nav.Link>
              ))}
            </div>
          </Nav.Item>
        );
      })}

      {!loading && items.length === 0 && (
        <div
          className="px-3 py-2"
          style={{ fontSize: "0.8rem", color: "#6b7280", lineHeight: 1.4 }}
        >
          No modules have been enabled for your account yet. Please contact the
          administrator.
        </div>
      )}
    </Nav>
  );

  return (
    <>
      {!collapsed && (
        <aside
          className="sidebar d-none d-lg-flex"
          ref={sidebarRef}
          style={{
            position: "sticky",
            top: "60px",
            height: "calc(100vh - 60px)",
            background: "var(--color-bg, #fff)",
            borderRight: "1px solid var(--color-border, #e5e7eb)",
            zIndex: 100,
          }}
        >
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 5,
              border: "1px solid var(--color-border, #e5e7eb)",
              background: "#fff",
              color: "#EC0B43",
              width: 30,
              height: 30,
              borderRadius: 8,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            «
          </button>

          {renderMenu("desktop")}
        </aside>
      )}

      <Offcanvas show={show} onHide={onClose}>
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Globosoft</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body ref={offcanvasRef}>{renderMenu("mobile")}</Offcanvas.Body>
      </Offcanvas>
    </>
  );
}
