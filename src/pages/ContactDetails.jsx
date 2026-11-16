import React from "react";
import { CONTACT_BLOCKS } from "../components/FooterLegalLinks";
import "../styles/FooterLegalLinks.css";

/**
 * Standalone Contact Details page, exposed at `/ContactDetails` so the mobile
 * app can render the same content inside a WebView without going through the
 * dashboard shell (no Sidebar / TopBar / auth gating). Content is sourced from
 * `FooterLegalLinks.jsx` so the popup and this page stay in sync.
 */
export default function ContactDetails() {
  return (
    <div className="cd-page">
      <div className="cd-container">
        <header className="dbf-head">
          <p className="dbf-eyebrow">Globosoft Travels LLC</p>
          <h2>Contact Details</h2>
          <p className="dbf-tagline">
            Palarivattom, Kochi, Kerala, India
          </p>
        </header>

        <div className="dbf-body">
          {CONTACT_BLOCKS.map((block) => (
            <section className="dbf-contact" key={block.title}>
              <h3>{block.title}</h3>
              <dl>
                {block.rows.map((row) => (
                  <React.Fragment key={row.label + row.value}>
                    <dt>{row.label}</dt>
                    <dd>
                      {row.href ? <a href={row.href}>{row.value}</a> : row.value}
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>

      <style>{`
        .cd-page {
          min-height: 100vh;
          background: #ffffff;
          padding: 24px 16px 48px;
        }
        .cd-container {
          max-width: 820px;
          margin: 0 auto;
        }
        .cd-page .dbf-head {
          padding: 0 0 16px;
          border-bottom: 1px solid var(--dbf-line);
          margin-bottom: 20px;
        }
        .cd-page .dbf-body {
          padding: 0;
          max-height: none;
          overflow: visible;
        }
      `}</style>
    </div>
  );
}
