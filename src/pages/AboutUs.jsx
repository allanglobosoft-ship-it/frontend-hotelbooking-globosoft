import React from "react";
import {
  ABOUT_INTRO,
  ABOUT_USP_LEAD,
  ABOUT_PRODUCTS,
  ABOUT_PLATFORM,
  ABOUT_SERVICES,
  ABOUT_VISION,
  ABOUT_MISSION,
  ABOUT_WHY,
  ABOUT_CLOSING,
} from "./Login";

/**
 * Standalone About Us page, exposed at `/Aboutus` so the mobile app can render
 * the same content inside a WebView without going through the login shell (no
 * background image, no login form, no auth gating). Content is sourced from
 * `Login.jsx` so the popup and this page stay in sync. Styles are self-
 * contained here because the login modal's `.lg-about-*` rules are scoped to
 * `.lg-shell` and wouldn't resolve on a bare page.
 */
export default function AboutUs() {
  return (
    <div className="au-page">
      <div className="au-container">
        <header className="au-head">
          <p className="au-eyebrow">Globosoft Travels LLC</p>
          <h2>About Us</h2>
          <p className="au-tagline">
            Your Global B2B Accommodation &amp; Travel Distribution Partner
          </p>
        </header>

        <div className="au-body">
          {ABOUT_INTRO.map((para) => (
            <p key={para.slice(0, 32)}>{para}</p>
          ))}

          <h3>Our unique selling proposition</h3>
          <p className="au-lede">A complete travel ecosystem.</p>
          <p>{ABOUT_USP_LEAD}</p>

          <ul className="au-chips">
            {ABOUT_PRODUCTS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <p>{ABOUT_PLATFORM}</p>

          <h3>Our services</h3>
          <div className="au-services">
            {ABOUT_SERVICES.map((svc) => (
              <div className="au-service" key={svc.title}>
                <div className="au-service-title">{svc.title}</div>
                <p>{svc.desc}</p>
              </div>
            ))}
          </div>

          <div className="au-split">
            <section>
              <h3>Our vision</h3>
              <p>{ABOUT_VISION}</p>
            </section>
            <section>
              <h3>Our mission</h3>
              <p>{ABOUT_MISSION}</p>
            </section>
          </div>

          <h3>Why Globosoft?</h3>
          <ul className="au-why">
            {ABOUT_WHY.map((item) => (
              <li key={item.label}>
                <span aria-hidden="true">{item.emoji}</span>
                {item.label}
              </li>
            ))}
          </ul>

          <p>{ABOUT_CLOSING}</p>

          <p className="au-signoff">
            Globosoft Travels LLC &mdash; Destinations Worldwide.
          </p>
        </div>
      </div>

      <style>{`
        .au-page {
          min-height: 100vh;
          background: #ffffff;
          padding: 24px 16px 48px;
          color: #3b3f47;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          line-height: 1.55;
        }
        .au-container {
          max-width: 820px;
          margin: 0 auto;
        }
        .au-head {
          padding: 0 0 16px;
          border-bottom: 1px solid #eef0f4;
          margin-bottom: 20px;
        }
        .au-eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-size: 12px;
          font-weight: 700;
          color: #ec0b43;
          margin: 0 0 6px;
        }
        .au-head h2 {
          font-size: 28px;
          font-weight: 700;
          color: #1b2a4a;
          margin: 0 0 6px;
        }
        .au-tagline {
          color: #5a6478;
          margin: 0;
          font-size: 15px;
        }
        .au-body h3 {
          font-size: 18px;
          font-weight: 700;
          color: #1b2a4a;
          margin: 24px 0 10px;
        }
        .au-body p {
          margin: 0 0 12px;
          font-size: 15px;
        }
        .au-lede {
          font-weight: 600;
          color: #1b2a4a;
        }
        .au-chips {
          list-style: none;
          padding: 0;
          margin: 4px 0 16px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .au-chips li {
          background: #fff5f8;
          color: #c90939;
          border: 1px solid #ffd9b8;
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 600;
        }
        .au-services {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
          margin: 8px 0 16px;
        }
        .au-service {
          border: 1px solid #eef0f4;
          border-radius: 10px;
          padding: 14px 16px;
          background: #fafbfc;
        }
        .au-service-title {
          font-weight: 700;
          color: #1b2a4a;
          margin-bottom: 6px;
        }
        .au-service p {
          margin: 0;
          font-size: 14px;
          color: #5a6478;
        }
        .au-split {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin: 8px 0 16px;
        }
        @media (max-width: 600px) {
          .au-split { grid-template-columns: 1fr; }
        }
        .au-why {
          list-style: none;
          padding: 0;
          margin: 4px 0 16px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 8px 16px;
        }
        .au-why li {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          color: #3b3f47;
        }
        .au-why span {
          font-size: 18px;
        }
        .au-signoff {
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid #eef0f4;
          font-weight: 600;
          color: #1b2a4a;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
