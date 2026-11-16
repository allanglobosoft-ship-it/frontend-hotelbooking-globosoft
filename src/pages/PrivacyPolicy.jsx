import React from "react";
import { TERMS_INTRO, TERMS_SECTIONS } from "../components/FooterLegalLinks";
import "../styles/FooterLegalLinks.css";

/**
 * Standalone Terms & Conditions page, exposed at `/privacypolicy` so the mobile
 * app can render the same content inside a WebView without going through the
 * dashboard shell (no Sidebar / TopBar / auth gating). Content is sourced from
 * `FooterLegalLinks.jsx` so the popup and this page stay in sync.
 */
export default function PrivacyPolicy() {
  return (
    <div className="pp-page">
      <div className="pp-container">
        <header className="dbf-head">
          <p className="dbf-eyebrow">Globosoft Travels LLC</p>
          <h2>Terms &amp; Conditions</h2>
          <p className="dbf-tagline">Effective Date: September 2026</p>
        </header>

        <div className="dbf-body">
          <p>{TERMS_INTRO}</p>

          {TERMS_SECTIONS.map((section, i) => (
            <section className="dbf-clause" key={section.title}>
              <h3>
                <span className="dbf-clause-no">{i + 1}.</span>
                {section.title}
              </h3>
              <p>{section.body}</p>
            </section>
          ))}

          <div className="dbf-signoff">
            <strong>Globosoft Travels LLC</strong>
            <span>Palarivattom, Kochi, Kerala, India</span>
            <span>
              Website:{" "}
              <a
                href="https://www.globosoft.in"
                target="_blank"
                rel="noreferrer"
              >
                www.globosoft.in
              </a>
            </span>
            <span>
              Email:{" "}
              <a href="mailto:info@globosoft.in">info@globosoft.in</a>
            </span>
          </div>
        </div>
      </div>

      <style>{`
        .pp-page {
          min-height: 100vh;
          background: #ffffff;
          padding: 24px 16px 48px;
        }
        .pp-container {
          max-width: 820px;
          margin: 0 auto;
        }
        .pp-page .dbf-head {
          padding: 0 0 16px;
          border-bottom: 1px solid var(--dbf-line);
          margin-bottom: 20px;
        }
        .pp-page .dbf-body {
          padding: 0;
          max-height: none;
          overflow: visible;
        }
      `}</style>
    </div>
  );
}
