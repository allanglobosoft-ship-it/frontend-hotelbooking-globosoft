import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "../../styles/FindBooking.css";

// Frame of the public "Find your booking" pages — the search page and its
// results tab: brand bar with Sign in, the page, then the footer. Same font
// and colours as the login screen. Each page is a browser tab of its own, so
// it gets its own title.
export default function FindBookingLayout({ title, children }) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  return (
    <div className="fbk-page">
      <header className="fbk-header">
        <div className="fbk-header-inner">
          <div className="fbk-brand">
            <img
              src={`${process.env.PUBLIC_URL}/images/logo-1.jpg`}
              alt="Globosoft"
              className="fbk-logo"
            />
            <div>
              <div className="fbk-brand-name">Globosoft</div>
              <div className="fbk-brand-sub">Global Contracting Solutions</div>
            </div>
          </div>
          <Link to="/login" className="fbk-header-link">
            <i className="fas fa-right-to-bracket" aria-hidden="true"></i> Sign in
          </Link>
        </div>
      </header>

      <main className="fbk-main">{children}</main>

      <footer className="fbk-footer">
        <div className="fbk-footer-inner">
          <span>© {new Date().getFullYear()} Globosoft. All rights reserved.</span>
          <span>
            Agent or staff? <Link to="/login">Sign in</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
