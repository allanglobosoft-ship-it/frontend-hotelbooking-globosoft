import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
// NOTE: do NOT import bootstrap/dist/css/bootstrap.min.css here — it is global
// and re-introduces the default blue theme on top of the red SCSS build.
import "bootstrap/dist/js/bootstrap.bundle.min";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "../styles/Login.css";
import "../styles/LoginModern.css";
import DashboardRedirections from "../components/DashboardRedirections";
import axiosInstance from "../components/AxiosInstance";
import { toast } from "react-hot-toast";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [forgetEmail, setForgetEmail] = useState("");
  const [forgetUsername, setForgetUsername] = useState("");
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState("Agent");
  // ── Agent login OTP (second factor) ──
  // When /auth/login returns { otpRequired: true } for an agent, we open a
  // popup to collect the emailed 6-digit code and finish login via
  // /auth/verify-login-otp. No token is stored until the code is verified.
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpUsername, setOtpUsername] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState(null);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [otpResending, setOtpResending] = useState(false);
  const [otpResendIn, setOtpResendIn] = useState(0); // resend cooldown, seconds
  // True when the backend flags this as the account's very first login —
  // never signed in before. Only ever set on the initial /auth/login response
  // (not on resend), so the welcome message stays specifically about the
  // first-time flow and doesn't reappear on later logins from the same page.
  const [otpFirstLogin, setOtpFirstLogin] = useState(false);
  // ── TOTP (Ente Auth) second factor ──
  // Separate from the emailed-OTP flow above: the code comes from the user's
  // authenticator app, so there is nothing to send and nothing to resend. When
  // /auth/login returns { totpRequired: true } we collect the 6-digit code and
  // finish via /auth/verify-totp, echoing back the one-time twoFactorToken that
  // proves the password step just succeeded. The backend only ever sets one of
  // otpRequired / totpRequired, so the two modals can never both be open.
  const [showTotpModal, setShowTotpModal] = useState(false);
  const [totpUsername, setTotpUsername] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpError, setTotpError] = useState(null);
  const [totpSubmitting, setTotpSubmitting] = useState(false);
  const [totpFallingBack, setTotpFallingBack] = useState(false);
  // Promo carousel on the login brand panel. Two public sources feed it:
  //   1. OfferZone banners (/api/offerDetails) — shown FIRST, each carrying a
  //      description + validity dates overlaid on the banner image.
  //   2. Offer images (/api/offerImageUpload/public) — plain promo images,
  //      appended after the banners.
  // Section hides completely when neither source has anything to show.
  const [slides, setSlides] = useState([]);
  const [offerIdx, setOfferIdx] = useState(0);
  const navigate = useNavigate();

  // Fetch both public sources once on mount and flatten them into a single
  // ordered list of slide objects ({ url, title?, description?, validity* }).
  useEffect(() => {
    let alive = true;
    const apiBase = process.env.REACT_APP_API_BASE_URL || "";

    Promise.all([
      axiosInstance.get("/api/offerDetails").catch(() => ({ data: [] })),
      axiosInstance
        .get("/api/offerImageUpload/public")
        .catch(() => ({ data: [] })),
    ])
      .then(([offerRes, imageRes]) => {
        if (!alive) return;
        const next = [];

        // OfferZone banners first — with text overlay (description + validity).
        // bannerImagePah is already a full /images/ URL served publicly.
        if (Array.isArray(offerRes.data)) {
          offerRes.data.forEach((offer) => {
            if (!offer.bannerImagePah) return;
            next.push({
              key: `offer-${offer.offerId}`,
              url: offer.bannerImagePah,
              title: offer.title,
              description: offer.description,
              validityFrom: offer.validityFrom,
              validityTo: offer.validityTo,
            });
          });
        }

        // Offer-upload images next — image only, no overlay.
        if (Array.isArray(imageRes.data)) {
          imageRes.data.forEach((set) => {
            if (set.hasImage1) {
              next.push({
                key: `img-${set.id}-1`,
                url: `${apiBase}/api/offerImageUpload/public/${set.id}/image1`,
              });
            }
            if (set.hasImage2) {
              next.push({
                key: `img-${set.id}-2`,
                url: `${apiBase}/api/offerImageUpload/public/${set.id}/image2`,
              });
            }
          });
        }

        setSlides(next);
        setOfferIdx(0);
      })
      .catch(() => {
        if (alive) setSlides([]);
      });

    return () => {
      alive = false;
    };
  }, []);

  // Auto-rotate through slides when there is more than one.
  useEffect(() => {
    if (slides.length < 2) return undefined;
    const t = setInterval(() => {
      setOfferIdx((i) => (i + 1) % slides.length);
    }, 4000);
    return () => clearInterval(t);
  }, [slides]);

  // Count down the "Resend OTP" cooldown once per second while active.
  useEffect(() => {
    if (otpResendIn <= 0) return undefined;
    const t = setInterval(() => {
      setOtpResendIn((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [otpResendIn]);

  // Format a LocalDateTime string ("2026-06-22T00:00:00") to a readable date.
  const formatOfferDate = (value) => {
    if (!value) return "";
    const datePart = typeof value === "string" ? value.split("T")[0] : value;
    const d = new Date(datePart);
    if (Number.isNaN(d.getTime())) return datePart;
    return d.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Store the issued token, prime per-login state, and route to the right
  // dashboard. Shared by the direct (non-agent) login and the post-OTP path so
  // both finish a login identically once a token is in hand.
  const completeLogin = async (data) => {
    const token = data?.token;
    const roles = data?.roles;
    const loginedUserName = data?.username;

    if (!token || !roles || !loginedUserName) {
      throw new Error(
        "Invalid response from server: Missing token or roles or username",
      );
    }

    localStorage.setItem("authToken", token);
    localStorage.setItem("userRole", roles);
    localStorage.setItem("UserName", loginedUserName);

    // Prime localStorage.userId with the caller's own entity id (for
    // agents: their agent id) BEFORE any downstream page mounts. Several
    // pages (HotelSearch, LongStaySearch, etc.) read userId synchronously
    // as the "self" agent id when building the search payload — if userId
    // is missing they lazily fetch /api/personalProfile and fall back to
    // agentId=1 in the meantime, which then flows into bookingData and
    // makes the HotelBookingPage's `/api/agent/{id}` lookup read Globo's
    // (id=1) `cardPaymentEnabled` instead of the logged-in agent's, so
    // brand-new agents incorrectly see "online card payment is not
    // enabled" on the booking page.
    // Non-blocking on failure — login itself never fails on a
    // personalProfile hiccup; the lazy fallback in downstream pages
    // remains as a safety net.
    try {
      const profile = await axiosInstance.get(
        `/api/personalProfile/${loginedUserName}`,
      );
      if (profile?.data?.id != null) {
        localStorage.setItem("userId", String(profile.data.id));
      }
    } catch (profileErr) {
      // Swallow — the per-page lazy fetch will still run.
      console.warn("Failed to prime userId at login:", profileErr);
    }

    // Fresh per-login id used to dedupe advertisement views (an ad is counted
    // once per page per login session). A new login → new id → countable again.
    const newAdSessionId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `s-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    localStorage.setItem("adSessionId", newAdSessionId);

    if (roles.length > 1) {
      navigate("/select-userRole", { state: { roles } });
    } else {
      DashboardRedirections(roles[0] || "User", navigate);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      const loginRequest = { username: `${username}`, password: `${password}` };
      const response = await axiosInstance.post("/auth/login", loginRequest, {
        withCredentials: true,
      });

      // The account has an authenticator enrolled: the backend validated the
      // password and withheld the token. Collect the code from Ente Auth
      // instead of completing the login here. Checked before otpRequired to
      // mirror the backend's precedence.
      if (response.data?.totpRequired) {
        setTotpUsername(response.data.username || username);
        setTotpToken(response.data.twoFactorToken || "");
        setTotpCode("");
        setTotpError(null);
        setShowTotpModal(true);
        return;
      }

      // Agent accounts get a second factor: the backend has validated the
      // password, emailed a one-time code, and withheld the token. Open the
      // OTP popup instead of completing the login here.
      //
      // First-time agents (registered, admin-approved, never signed in) are
      // guaranteed to land here — the TOTP branch above cannot fire without an
      // enrolled device, and TOTP enrolment requires an authenticated session,
      // which they don't have yet. The backend flags this case with
      // firstLogin so the modal can greet them with a welcome message
      // explaining why they're getting an emailed code.
      if (response.data?.otpRequired) {
        setOtpUsername(response.data.username || username);
        setOtpEmail(response.data.email || "");
        setOtpFirstLogin(!!response.data.firstLogin);
        setOtpCode("");
        setOtpError(null);
        setOtpResendIn(30);
        setShowOtpModal(true);
        return;
      }

      await completeLogin(response.data);
    } catch (err) {
      setError("Invalid username or password");
    }
  };

  // Submit the 6-digit code; on success the backend returns the same
  // { token, roles, username } shape as a normal login.
  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    const code = otpCode.trim();
    if (code.length !== 6) {
      setOtpError("Please enter the 6-digit code sent to your email.");
      return;
    }
    setOtpSubmitting(true);
    setOtpError(null);
    try {
      const res = await axiosInstance.post(
        "/auth/verify-login-otp",
        { username: otpUsername, otp: code },
        { withCredentials: true },
      );
      // On success completeLogin navigates away, unmounting this page (and the
      // modal). If it throws, the modal stays open and shows the error below.
      await completeLogin(res.data);
    } catch (err) {
      // The backend returns 400 (not 401/403) for a bad/expired code, so it
      // lands here rather than triggering the axios refresh/session flow.
      setOtpError(
        err?.response?.data?.message ||
          "Invalid or expired code. Please try again.",
      );
    } finally {
      setOtpSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpResendIn > 0 || otpResending) return;
    setOtpResending(true);
    setOtpError(null);
    try {
      const res = await axiosInstance.post(
        "/auth/resend-login-otp",
        { username: otpUsername },
        { withCredentials: true },
      );
      if (res.data?.email) setOtpEmail(res.data.email);
      setOtpCode("");
      setOtpResendIn(30);
      toast.success("A new verification code has been sent to your email.");
    } catch (err) {
      setOtpError(
        err?.response?.data?.message ||
          "Could not resend the code. Please try again.",
      );
    } finally {
      setOtpResending(false);
    }
  };

  const closeOtpModal = () => {
    setShowOtpModal(false);
    setOtpCode("");
    setOtpError(null);
    setOtpUsername("");
    setOtpEmail("");
    setOtpResendIn(0);
    setOtpFirstLogin(false);
  };

  // Submit the 6-digit authenticator code. On success the backend returns the
  // same { token, roles, username } shape as a normal login.
  const handleVerifyTotp = async (e) => {
    if (e) e.preventDefault();
    const code = totpCode.trim();
    if (code.length !== 6) {
      setTotpError("Please enter the 6-digit code from your authenticator app.");
      return;
    }
    setTotpSubmitting(true);
    setTotpError(null);
    try {
      const res = await axiosInstance.post(
        "/auth/verify-totp",
        { username: totpUsername, otp: code, twoFactorToken: totpToken },
        { withCredentials: true },
      );
      // On success completeLogin navigates away, unmounting this page (and the
      // modal). If it throws, the modal stays open and shows the error below.
      await completeLogin(res.data);
    } catch (err) {
      // The backend returns 400 (not 401/403) for a bad, reused or rate-limited
      // code, so it lands here rather than triggering the axios refresh flow.
      setTotpError(
        err?.response?.data?.message ||
          "Invalid code. Please try again.",
      );
      // A used-up code can never work again — clear it so the user reads the
      // next one off their app rather than resubmitting the same digits.
      setTotpCode("");
    } finally {
      setTotpSubmitting(false);
    }
  };

  const closeTotpModal = () => {
    setShowTotpModal(false);
    setTotpCode("");
    setTotpError(null);
    setTotpUsername("");
    // Drop the one-time token too — going back to the login form abandons this
    // login attempt entirely, and the token is useless without a fresh password
    // step anyway.
    setTotpToken("");
  };

  // "Lost my authenticator" escape hatch. Trades the mid-flight TOTP challenge
  // (via the single-use twoFactorToken) for an emailed code, then hands off to
  // the existing email-OTP modal. The backend consumes the pending TOTP row on
  // the server side, so there is no going back to the authenticator for this
  // sign-in — the user has to complete the email flow or start over.
  const handleTotpFallbackToEmail = async () => {
    if (totpFallingBack || totpSubmitting) return;
    setTotpFallingBack(true);
    setTotpError(null);
    try {
      const res = await axiosInstance.post(
        "/auth/totp-fallback-email",
        { username: totpUsername, twoFactorToken: totpToken },
        { withCredentials: true },
      );
      // Both the direct email-OTP path and this fallback path return the
      // address unmasked (`email`). The code is going to the user's own
      // inbox; there is no leak in showing them where it went.
      const email = res.data?.email || "";
      const uname = res.data?.username || totpUsername;
      // Close the authenticator modal and hand the sign-in over to the email
      // flow. The existing verify-login-otp path handles it from here — same
      // OTP modal, same submit endpoint, same resend cooldown.
      setShowTotpModal(false);
      setTotpCode("");
      setTotpToken("");
      setOtpUsername(uname);
      setOtpEmail(email);
      setOtpCode("");
      setOtpError(null);
      setOtpResendIn(30);
      setShowOtpModal(true);
      toast.success(
        email
          ? `A verification code has been sent to ${email}.`
          : "A verification code has been sent to your email.",
      );
    } catch (err) {
      setTotpError(
        err?.response?.data?.message ||
          "Could not send an email code. Please try again.",
      );
    } finally {
      setTotpFallingBack(false);
    }
  };

  const [forgetSubmitting, setForgetSubmitting] = useState(false);

  const handleForgetPasswordSubmit = async (e) => {
    e.preventDefault();
    const email = forgetEmail.trim();
    const username = forgetUsername.trim();
    if (!email || !username) {
      toast.error("Please enter both your email and username.");
      return;
    }
    try {
      setForgetSubmitting(true);
      await axiosInstance.post("/auth/forgot-password", { email, username });
      // The backend responds the same way whether or not the account
      // exists (anti-enumeration), so the message is deliberately generic.
      toast.success(
        "If the email and username match an account, a new password has been emailed to you."
      );
      setForgetEmail("");
      setForgetUsername("");
      const modal = document.getElementById("exampleModal");
      if (modal && window.bootstrap?.Modal) {
        const bootstrapModal = window.bootstrap.Modal.getInstance(modal);
        if (bootstrapModal) bootstrapModal.hide();
      }
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          "Could not process the request. Please try again."
      );
    } finally {
      setForgetSubmitting(false);
    }
  };

  return (
    <div className="lg-shell">
      {/* ── Left · brand panel ── */}
      <aside className="lg-brand">
        {/* ── Offer showcase (from /upload-offer-image) ──
            Sits directly under the brand logo so it's the first visual the
            user sees. Section is conditional — when no offers are uploaded
            it disappears completely and the original layout shows. */}
        {slides.length > 0 && (
          <div className="lg-offers">
            <div className="lg-offers-head">
              <span className="lg-offer-pill">
                <i className="fas fa-tag"></i> Offer
              </span>
              <span className="lg-offers-title">Limited-time promotions</span>
            </div>

            <div className="lg-offer-frame">
              {slides.map((slide, i) => (
                <img
                  key={slide.key}
                  src={slide.url}
                  alt={slide.title || `Offer ${i + 1}`}
                  className={`lg-offer-img${i === offerIdx ? " is-active" : ""}`}
                />
              ))}
              <div className="lg-offer-shade" aria-hidden="true" />

              {/* Details overlay for the active slide — only banners coming
                  from OfferZone carry a description / validity window. */}
              {(() => {
                const active = slides[offerIdx];
                if (
                  !active ||
                  (!active.description &&
                    !active.validityFrom &&
                    !active.validityTo)
                ) {
                  return null;
                }
                return (
                  <div className="lg-offer-caption">
                    {active.title && (
                      <div className="lg-offer-caption-title">
                        {active.title}
                      </div>
                    )}
                    {active.description && (
                      <p className="lg-offer-caption-desc">
                        {active.description}
                      </p>
                    )}
                    {(active.validityFrom || active.validityTo) && (
                      <div className="lg-offer-caption-validity">
                        <i className="fas fa-calendar-alt"></i>
                        <span>
                          {active.validityFrom && active.validityTo
                            ? `${formatOfferDate(
                                active.validityFrom,
                              )} – ${formatOfferDate(active.validityTo)}`
                            : active.validityFrom
                            ? `From ${formatOfferDate(active.validityFrom)}`
                            : `Until ${formatOfferDate(active.validityTo)}`}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {slides.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous offer"
                    className="lg-offer-nav lg-offer-nav--prev"
                    onClick={() =>
                      setOfferIdx(
                        (i) => (i - 1 + slides.length) % slides.length,
                      )
                    }
                  >
                    <i className="fas fa-chevron-left"></i>
                  </button>
                  <button
                    type="button"
                    aria-label="Next offer"
                    className="lg-offer-nav lg-offer-nav--next"
                    onClick={() => setOfferIdx((i) => (i + 1) % slides.length)}
                  >
                    <i className="fas fa-chevron-right"></i>
                  </button>

                  <div className="lg-offer-dots">
                    {slides.map((slide, i) => (
                      <button
                        key={slide.key}
                        type="button"
                        aria-label={`Show offer ${i + 1}`}
                        className={`lg-offer-dot${
                          i === offerIdx ? " is-active" : ""
                        }`}
                        onClick={() => setOfferIdx(i)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="lg-hero">
          <h1>Manage hotel contracts with confidence.</h1>
          <p>
            One platform to manage contracts, track performance, and grow your
            relationships with leading hotel chains worldwide.
          </p>
        </div>

        <div className="lg-features">
          <div className="lg-feature">
            <i className="fas fa-chart-line"></i>
            <span>Real-time performance analytics</span>
          </div>
          <div className="lg-feature">
            <i className="fas fa-bed"></i>
            <span>Real-time hotel availability</span>
          </div>
          <div className="lg-feature">
            <i className="fas fa-handshake"></i>
            <span>End-to-end contract management</span>
          </div>
          <div className="lg-feature">
            <i className="fas fa-bolt"></i>
            <span>Fast &amp; seamless bookings</span>
          </div>
          <div className="lg-feature">
            <i className="fas fa-globe"></i>
            <span>5000+ hotels across 150+ countries</span>
          </div>
          <div className="lg-feature">
            <i className="fas fa-tags"></i>
            <span>Manage rates &amp; reservations</span>
          </div>
        </div>

        <div className="lg-brand-foot">
          © {new Date().getFullYear()} Globosoft. All rights reserved.
        </div>
      </aside>

      {/* ── Right · sign-in card ── */}
      <main className="lg-main">
        <div className="lg-card">
          <div className="lg-brand-top lg-brand-top--card">
            <img
              src={`${process.env.PUBLIC_URL}/images/logo-1.jpg`}
              alt="Globosoft"
              className="lg-logo"
            />
        
            <div>
              <div className="lg-brand-name">Globosoft</div>
              <div className="lg-brand-sub">Global Contracting Solutions</div>
            </div>
          </div>

          <div className="lg-head">
            <h2>Welcome back</h2>
            <p>Sign in to your contracting dashboard</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="lg-field">
              <label htmlFor="username">
                <i className="fas fa-user"></i> Username
              </label>
              <input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="lg-field">
              <label htmlFor="password">
                <i className="fas fa-lock"></i> Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ width: "100%", paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    top: "50%",
                    right: 12,
                    transform: "translateY(-50%)",
                    border: "none",
                    background: "none",
                    color: "#6c757d",
                    cursor: "pointer",
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  <i className={showPassword ? "fas fa-eye-slash" : "fas fa-eye"}></i>
                </button>
              </div>
            </div>

            {error && <div className="lg-error">{error}</div>}

            <button type="submit" className="lg-submit">
              <i className="fas fa-sign-in-alt"></i> Sign In
            </button>

            <div className="lg-links">
              <button
                type="button"
                className="lg-link"
                onClick={() => { setSelectedRole("Agent"); setShowRoleModal(true); }}
              >
                <i className="fas fa-user-plus"></i> Create Account
              </button>
              <button
                type="button"
                className="lg-link"
                data-bs-toggle="modal"
                data-bs-target="#exampleModal"
              >
                <i className="fas fa-key"></i> Forgot Password?
              </button>
            </div>
          </form>

          {/* Booking lookup for people without a login — FindBooking.jsx,
              opened as its own page in a new tab. */}
          <div className="lg-divider">
            <span>or</span>
          </div>
          <Link
            to="/find-booking"
            target="_blank"
            rel="noopener noreferrer"
            className="lg-find-booking"
            title="Opens in a new tab"
          >
            <span className="lg-find-booking-icon">
              <i className="fas fa-magnifying-glass"></i>
            </span>
            <span className="lg-find-booking-text">
              <strong>Find a booking</strong>
              <small>Check its status with the booking code — no sign-in needed</small>
            </span>
            <i className="fas fa-arrow-up-right-from-square lg-find-booking-arrow"></i>
          </Link>

          <div className="lg-secure">
            <i className="fas fa-shield-alt"></i>
            <span>Protected with enterprise-grade security</span>
          </div>
        </div>
      </main>

      {/* ── Role Selection Modal ── */}
      {showRoleModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1060,
            background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setShowRoleModal(false)}
        >
          <div
            style={{
              background: "#fff", borderRadius: 12, padding: "32px 36px",
              minWidth: 320, boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h5 style={{ marginBottom: 20, fontWeight: 700, color: "#1a1a2e" }}>
              <i className="fas fa-user-circle me-2"></i>Create Account As
            </h5>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 28 }}>
              {["Agent", "Hotel"].map((role) => (
                <label
                  key={role}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    cursor: "pointer", padding: "10px 14px",
                    border: `2px solid ${selectedRole === role ? "#c0392b" : "#e0e0e0"}`,
                    borderRadius: 8,
                    background: selectedRole === role ? "#fff5f5" : "#fafafa",
                    fontWeight: selectedRole === role ? 600 : 400,
                    color: "#1a1a2e",
                    transition: "all 0.15s",
                  }}
                >
                  <input
                    type="radio"
                    name="registerRole"
                    value={role}
                    checked={selectedRole === role}
                    onChange={() => setSelectedRole(role)}
                    style={{ accentColor: "#c0392b", width: 18, height: 18 }}
                  />
                  <i className={`fas ${role === "Agent" ? "fa-briefcase" : "fa-hotel"} me-1`}></i>
                  {role}
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowRoleModal(false)}
                style={{
                  padding: "8px 22px", borderRadius: 7, border: "1px solid #ccc",
                  background: "#fff", color: "#555", cursor: "pointer", fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRoleModal(false);
                  navigate(selectedRole === "Hotel" ? "/hotel-register" : "/register");
                }}
                style={{
                  padding: "8px 22px", borderRadius: 7, border: "none",
                  background: "#c0392b", color: "#fff", cursor: "pointer", fontWeight: 600,
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Agent Login OTP Modal ── */}
      {showOtpModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1070,
            background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#fff", borderRadius: 12, padding: "30px 34px",
              width: 400, maxWidth: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: "center", marginBottom: 6 }}>
              <div
                style={{
                  width: 56, height: 56, borderRadius: "50%", background: "#fff5f5",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  color: "#c0392b", fontSize: 22, marginBottom: 12,
                }}
              >
                <i className={`fas ${otpFirstLogin ? "fa-hand-sparkles" : "fa-shield-alt"}`}></i>
              </div>
              <h5 style={{ margin: 0, fontWeight: 700, color: "#1a1a2e" }}>
                {otpFirstLogin ? "Welcome — let's verify your email" : "Verify it's you"}
              </h5>
              <p style={{ margin: "8px 0 0", color: "#6c757d", fontSize: 14 }}>
                {otpFirstLogin ? (
                  <>
                    This is your first sign-in, so we&apos;ve emailed a 6-digit
                    verification code
                    {otpEmail ? (
                      <>
                        {" "}to{" "}
                        <strong style={{ wordBreak: "break-word" }}>
                          {otpEmail}
                        </strong>
                      </>
                    ) : null}
                    . Enter it below to finish signing in.
                  </>
                ) : (
                  <>
                    We&apos;ve emailed a 6-digit verification code
                    {otpEmail ? (
                      <>
                        {" "}to{" "}
                        <strong style={{ wordBreak: "break-word" }}>
                          {otpEmail}
                        </strong>
                      </>
                    ) : null}
                    . Enter it below to finish signing in.
                  </>
                )}
              </p>
            </div>

            {otpFirstLogin && (
              <div
                style={{
                  marginTop: 14, padding: "10px 12px",
                  background: "#e6f4ea", border: "1px solid #b7e0c1",
                  borderRadius: 8, color: "#1e5631", fontSize: 12,
                }}
              >
                <i className="fas fa-info-circle me-2"></i>
                For your first sign-in, verification is by email only. Once
                you&apos;re in, you can set up an authenticator app under
                Two-Factor Authentication if you prefer.
              </div>
            )}

            <form onSubmit={handleVerifyOtp}>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                value={otpCode}
                onChange={(e) => {
                  setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  if (otpError) setOtpError(null);
                }}
                placeholder="••••••"
                aria-label="6-digit verification code"
                style={{
                  width: "100%", textAlign: "center", letterSpacing: "0.5em",
                  fontSize: 24, fontWeight: 600, padding: "12px 14px",
                  border: `2px solid ${otpError ? "#c0392b" : "#e0e0e0"}`,
                  borderRadius: 8, outline: "none", marginTop: 16, boxSizing: "border-box",
                }}
              />

              {otpError && (
                <div
                  style={{
                    color: "#c0392b", fontSize: 13, marginTop: 10, textAlign: "center",
                  }}
                >
                  {otpError}
                </div>
              )}

              <button
                type="submit"
                disabled={otpSubmitting || otpCode.length !== 6}
                style={{
                  width: "100%", marginTop: 18, padding: "11px 0", borderRadius: 8,
                  border: "none",
                  background: otpSubmitting || otpCode.length !== 6 ? "#e39b93" : "#c0392b",
                  color: "#fff", fontWeight: 600, fontSize: 15,
                  cursor: otpSubmitting || otpCode.length !== 6 ? "not-allowed" : "pointer",
                }}
              >
                {otpSubmitting ? "Verifying…" : "Verify & Sign In"}
              </button>
            </form>

            <div
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginTop: 16,
              }}
            >
              <button
                type="button"
                onClick={closeOtpModal}
                style={{
                  border: "none", background: "none", color: "#6c757d",
                  cursor: "pointer", fontSize: 13, padding: 0,
                }}
              >
                <i className="fas fa-arrow-left me-1"></i> Back to login
              </button>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={otpResendIn > 0 || otpResending}
                style={{
                  border: "none", background: "none",
                  color: otpResendIn > 0 || otpResending ? "#adb5bd" : "#c0392b",
                  cursor: otpResendIn > 0 || otpResending ? "default" : "pointer",
                  fontWeight: 600, fontSize: 13, padding: 0,
                }}
              >
                {otpResending
                  ? "Sending…"
                  : otpResendIn > 0
                  ? `Resend in ${otpResendIn}s`
                  : "Resend code"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Authenticator (Ente Auth) TOTP Modal ── */}
      {showTotpModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1070,
            background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#fff", borderRadius: 12, padding: "30px 34px",
              width: 400, maxWidth: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: "center", marginBottom: 6 }}>
              <div
                style={{
                  width: 56, height: 56, borderRadius: "50%", background: "#fff5f5",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  color: "#c0392b", fontSize: 22, marginBottom: 12,
                }}
              >
                <i className="fas fa-mobile-alt"></i>
              </div>
              <h5 style={{ margin: 0, fontWeight: 700, color: "#1a1a2e" }}>
                Two-factor authentication
              </h5>
              <p style={{ margin: "8px 0 0", color: "#6c757d", fontSize: 14 }}>
                Open <strong>Ente Auth</strong> and enter the 6-digit code shown
                for this account to finish signing in.
              </p>
            </div>

            <form onSubmit={handleVerifyTotp}>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                value={totpCode}
                onChange={(e) => {
                  setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  if (totpError) setTotpError(null);
                }}
                placeholder="••••••"
                aria-label="6-digit authenticator code"
                style={{
                  width: "100%", textAlign: "center", letterSpacing: "0.5em",
                  fontSize: 24, fontWeight: 600, padding: "12px 14px",
                  border: `2px solid ${totpError ? "#c0392b" : "#e0e0e0"}`,
                  borderRadius: 8, outline: "none", marginTop: 16, boxSizing: "border-box",
                }}
              />

              {totpError && (
                <div
                  style={{
                    color: "#c0392b", fontSize: 13, marginTop: 10, textAlign: "center",
                  }}
                >
                  {totpError}
                </div>
              )}

              <button
                type="submit"
                disabled={totpSubmitting || totpCode.length !== 6}
                style={{
                  width: "100%", marginTop: 18, padding: "11px 0", borderRadius: 8,
                  border: "none",
                  background: totpSubmitting || totpCode.length !== 6 ? "#e39b93" : "#c0392b",
                  color: "#fff", fontWeight: 600, fontSize: 15,
                  cursor: totpSubmitting || totpCode.length !== 6 ? "not-allowed" : "pointer",
                }}
              >
                {totpSubmitting ? "Verifying…" : "Verify & Sign In"}
              </button>
            </form>

            {/* No "resend" here — unlike the emailed code, the authenticator
                generates a new one every 30 seconds on the user's own device. */}

            {/* "OR" divider, then the email fallback. The divider uses two flex
                lines around the word to avoid a single hairline underlining a
                middle span, which drifts by 1px depending on browser DPI. */}
            <div
              style={{
                display: "flex", alignItems: "center", gap: 10, margin: "18px 0 12px",
              }}
              aria-hidden="true"
            >
              <div style={{ flex: 1, height: 1, background: "#eef0f2" }} />
              <span style={{ color: "#adb5bd", fontSize: 11, letterSpacing: "0.08em" }}>
                OR
              </span>
              <div style={{ flex: 1, height: 1, background: "#eef0f2" }} />
            </div>

            <button
              type="button"
              onClick={handleTotpFallbackToEmail}
              disabled={totpFallingBack || totpSubmitting}
              style={{
                width: "100%", padding: "10px 0", borderRadius: 8,
                border: "1px solid #c0392b",
                background: "#fff",
                color: totpFallingBack || totpSubmitting ? "#adb5bd" : "#c0392b",
                fontWeight: 600, fontSize: 14,
                cursor: totpFallingBack || totpSubmitting ? "not-allowed" : "pointer",
              }}
            >
              {totpFallingBack ? (
                "Sending code…"
              ) : (
                <>
                  <i className="fas fa-envelope me-2"></i>
                  Send a code to my email instead
                </>
              )}
            </button>

            <div
              style={{
                marginTop: 6, color: "#6c757d", fontSize: 12, textAlign: "center",
              }}
            >
              Can't access your authenticator app?
            </div>

            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button
                type="button"
                onClick={closeTotpModal}
                style={{
                  border: "none", background: "none", color: "#6c757d",
                  cursor: "pointer", fontSize: 13, padding: 0,
                }}
              >
                <i className="fas fa-arrow-left me-1"></i> Back to login
              </button>
            </div>

            <div
              style={{
                marginTop: 14, paddingTop: 12, borderTop: "1px solid #f0f0f0",
                color: "#adb5bd", fontSize: 12, textAlign: "center",
              }}
            >
              Still stuck? Contact your administrator.
            </div>
          </div>
        </div>
      )}

      {/* ── Forgot Password Modal ── */}
      <div
        className="modal fade"
        id="exampleModal"
        tabIndex="-1"
        aria-labelledby="exampleModalLabel"
        aria-hidden="true"
      >
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h1 className="modal-title fs-5" id="exampleModalLabel">
                <i className="fas fa-key me-2"></i>
                Reset Your Password
              </h1>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body">
              <p className="modal-description text-muted mb-3">
                Enter the email and username on your account. We'll email a new
                password to the address on file.
              </p>
              <form id="changePass" onSubmit={handleForgetPasswordSubmit} autoComplete="off">
                <div className="mb-3">
                  <label className="form-label" htmlFor="forgetmail">
                    <span className="text-danger">*</span> Email Address
                  </label>
                  <input
                    type="email"
                    id="forgetmail"
                    className="form-control"
                    name="forgetmail"
                    placeholder="Enter your email address"
                    value={forgetEmail}
                    onChange={(e) => setForgetEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="userCode">
                    <span className="text-danger">*</span> Username
                  </label>
                  <input
                    type="text"
                    id="userCode"
                    className="form-control"
                    name="userCode"
                    placeholder="Enter your username"
                    value={forgetUsername}
                    onChange={(e) => setForgetUsername(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  id="submit"
                  className="btn w-100 lg-submit"
                  style={{ marginTop: 4 }}
                  disabled={forgetSubmitting}
                >
                  {forgetSubmitting ? "Sending…" : "Send New Password"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
