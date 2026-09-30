import React, { useEffect, useState } from "react";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import { Form, Button, Card, Alert, Badge, Spinner } from "react-bootstrap";
import Swal from "sweetalert2";
import { toast } from "react-hot-toast";
import axiosInstance from "../../components/AxiosInstance";

/**
 * Self-service management of the TOTP second factor (Google Authenticator), multi-device.
 *
 * Three states drive the layout:
 *   - qrCode set        -> mid-enrollment: show the QR + first-code confirmation
 *   - not enabled       -> offer "Enable" (which asks for password + device name)
 *   - enabled           -> show device list; offer "Add device" and "Turn off"
 *
 * Every listed device is a real row on the backend with its own secret and
 * its own name, so removing one only removes that enrolment — the user's other
 * authenticators keep working. Removing the LAST device auto-disables 2FA
 * (the backend flips the flag), which the page picks up on the next status
 * refresh.
 *
 * Errors return 400 (never 401/403), so they land inline instead of tripping
 * the axios session-expired flow.
 */
const TwoFactorAuth = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Enrolment — password + name step, then QR + first code.
  const [showSetup, setShowSetup] = useState(false);
  const [setupPassword, setSetupPassword] = useState("");
  const [setupDeviceName, setSetupDeviceName] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [setupParams, setSetupParams] = useState(null);
  const [showManualKey, setShowManualKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [setupCode, setSetupCode] = useState("");
  const [setupError, setSetupError] = useState("");
  const [startingSetup, setStartingSetup] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Per-device remove (one form at a time; deviceId identifies which).
  const [removingDeviceId, setRemovingDeviceId] = useState(null);
  const [removePassword, setRemovePassword] = useState("");
  const [removeError, setRemoveError] = useState("");
  const [removing, setRemoving] = useState(false);

  // Disable-all form.
  const [showDisable, setShowDisable] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [disableError, setDisableError] = useState("");
  const [disabling, setDisabling] = useState(false);

  const loadStatus = async () => {
    try {
      const res = await axiosInstance.get("/api/two-factor/status");
      setStatus(res.data);
      setLoadError("");
    } catch (err) {
      setLoadError(
        err?.response?.data?.message ||
          "Could not load your two-factor settings. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const resetForms = () => {
    setShowSetup(false);
    setSetupPassword("");
    setSetupDeviceName("");
    setQrCode("");
    setSetupParams(null);
    setShowManualKey(false);
    setKeyCopied(false);
    setSetupCode("");
    setSetupError("");
    setRemovingDeviceId(null);
    setRemovePassword("");
    setRemoveError("");
    setShowDisable(false);
    setDisablePassword("");
    setDisableCode("");
    setDisableError("");
  };

  const onCodeChange = (setter) => (e) =>
    setter(e.target.value.replace(/\D/g, "").slice(0, 6));

  const formatManualKey = (key) =>
    (key || "").replace(/\s+/g, "").match(/.{1,4}/g)?.join(" ") || "";

  const copyManualKey = async () => {
    const key = setupParams?.manualEntryKey || "";
    if (!key) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(key);
      } else {
        const ta = document.createElement("textarea");
        ta.value = key;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 1800);
    } catch {
      toast.error("Could not copy the key. Please select and copy it manually.");
    }
  };

  // Simple relative-time helper for "last used 5 minutes ago" — good enough
  // without pulling a date library in for one label.
  const formatRelative = (iso) => {
    if (!iso) return "never";
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return iso;
    const diffMs = Date.now() - then;
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
    return new Date(iso).toLocaleDateString();
  };

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const handleStartSetup = async (e) => {
    e.preventDefault();
    if (!setupPassword.trim()) {
      setSetupError("Your password is required.");
      return;
    }
    if (!setupDeviceName.trim()) {
      setSetupError("Please give this device a name.");
      return;
    }
    setStartingSetup(true);
    setSetupError("");
    try {
      const res = await axiosInstance.post("/api/two-factor/setup", {
        password: setupPassword,
        deviceName: setupDeviceName.trim(),
      });
      setQrCode(res.data?.qrCodeDataUri || "");
      setSetupParams({
        manualEntryKey: res.data?.manualEntryKey || "",
        account: res.data?.account || "",
        issuer: res.data?.issuer || "",
        digits: res.data?.digits || 6,
        periodSeconds: res.data?.periodSeconds || 30,
      });
      setShowManualKey(false);
      setKeyCopied(false);
      setSetupPassword("");
      setSetupCode("");
    } catch (err) {
      setSetupError(
        err?.response?.data?.message ||
          "Could not start two-factor setup. Please try again.",
      );
    } finally {
      setStartingSetup(false);
    }
  };

  const handleVerifySetup = async (e) => {
    e.preventDefault();
    if (setupCode.length !== 6) {
      setSetupError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setVerifying(true);
    setSetupError("");
    try {
      await axiosInstance.post("/api/two-factor/verify-setup", {
        otp: setupCode,
      });
      const wasEnabled = !!status?.enabled;
      resetForms();
      await loadStatus();
      await Swal.fire({
        title: wasEnabled ? "Device Added" : "Two-Factor Authentication Enabled",
        text: wasEnabled
          ? "You can now sign in with a code from either device."
          : "You'll be asked for a code from your authenticator app the next time you sign in.",
        icon: "success",
        confirmButtonText: "OK",
      });
    } catch (err) {
      setSetupError(
        err?.response?.data?.message ||
          "That code wasn't accepted. Please try again.",
      );
      setSetupCode("");
    } finally {
      setVerifying(false);
    }
  };

  const openRemoveDevice = (deviceId) => {
    setRemovingDeviceId(deviceId);
    setRemovePassword("");
    setRemoveError("");
  };

  const cancelRemoveDevice = () => {
    setRemovingDeviceId(null);
    setRemovePassword("");
    setRemoveError("");
  };

  const handleRemoveDevice = async (e, device) => {
    e.preventDefault();
    if (!removePassword.trim()) {
      setRemoveError("Your password is required.");
      return;
    }
    const isLast = (status?.devices?.length || 0) <= 1;
    if (isLast) {
      const confirmed = await Swal.fire({
        title: "Remove your only device?",
        text: "This will also turn two-factor authentication off for your account.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, remove it",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#c0392b",
      });
      if (!confirmed.isConfirmed) return;
    }
    setRemoving(true);
    setRemoveError("");
    try {
      await axiosInstance.delete(`/api/two-factor/devices/${device.id}`, {
        data: { password: removePassword },
      });
      cancelRemoveDevice();
      await loadStatus();
      toast.success(
        isLast
          ? "Device removed. Two-factor authentication is now off."
          : `Removed “${device.deviceName}”.`,
      );
    } catch (err) {
      setRemoveError(
        err?.response?.data?.message ||
          "Could not remove that device. Please try again.",
      );
    } finally {
      setRemoving(false);
    }
  };

  const handleDisable = async (e) => {
    e.preventDefault();
    if (!disablePassword.trim()) {
      setDisableError("Your password is required.");
      return;
    }
    if (disableCode.length !== 6) {
      setDisableError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    const confirmed = await Swal.fire({
      title: "Turn off two-factor authentication?",
      text: "Every enrolled device will be removed. Your account will be protected by your password alone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, turn it off",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#c0392b",
    });
    if (!confirmed.isConfirmed) return;

    setDisabling(true);
    setDisableError("");
    try {
      await axiosInstance.post("/api/two-factor/disable", {
        password: disablePassword,
        otp: disableCode,
      });
      resetForms();
      await loadStatus();
      toast.success("Two-factor authentication has been turned off.");
    } catch (err) {
      setDisableError(
        err?.response?.data?.message ||
          "Could not turn off two-factor authentication. Please try again.",
      );
      setDisableCode("");
    } finally {
      setDisabling(false);
    }
  };

  const isEnabled = !!status?.enabled;
  const devices = status?.devices || [];

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />

      <div className="d-flex flex-grow-1">
        <Sidebar />

        <main
          className="flex-grow-1 p-3"
          style={{ minWidth: 0, overflowX: "hidden" }}
        >
          <div className="container mt-5 d-flex justify-content-center">
            <Card
              className="p-4 shadow-sm rounded-4 w-100"
              style={{ maxWidth: "580px" }}
            >
              <div className="text-center mb-4">
                <h4 className="fw-bold mb-2">Two-Factor Authentication</h4>
                <p className="text-muted mb-0" style={{ fontSize: 14 }}>
                  Add a second step to your sign-in using a code from{" "}
                  <strong>Google Authenticator</strong>.
                </p>
                <p className="text-muted mb-0 mt-1" style={{ fontSize: 13 }}>
                  Get the app at{" "}
                  <a
                    href="https://support.google.com/accounts/answer/1066447"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#EC0B43", textDecoration: "none", fontWeight: 600 }}
                  >
                    Google Authenticator
                  </a>
                </p>
              </div>

              {loading && (
                <div className="text-center py-4">
                  <Spinner animation="border" size="sm" className="me-2" />
                  Loading your settings…
                </div>
              )}

              {!loading && loadError && (
                <Alert variant="danger" className="text-center">
                  {loadError}
                </Alert>
              )}

              {!loading && !loadError && (
                <>
                  {/* ── Status card ── */}
                  <div className="d-flex align-items-center justify-content-between border rounded-3 p-3 mb-3">
                    <div>
                      <div className="fw-semibold">Status</div>
                      <div className="text-muted" style={{ fontSize: 13 }}>
                        {isEnabled
                          ? `A code is required at every sign-in. ${devices.length} device${devices.length === 1 ? "" : "s"} enrolled.`
                          : "Your account is protected by your password only."}
                      </div>
                    </div>
                    <Badge bg={isEnabled ? "success" : "secondary"}>
                      {isEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>

                  {/* ── Enrolled devices list ── */}
                  {!qrCode && isEnabled && devices.length > 0 && (
                    <div className="mb-3">
                      <div
                        className="fw-semibold mb-2"
                        style={{ fontSize: 14 }}
                      >
                        Registered devices
                      </div>
                      <div className="border rounded-3">
                        {devices.map((device, idx) => (
                          <div
                            key={device.id}
                            className={
                              idx === devices.length - 1
                                ? "p-3"
                                : "p-3 border-bottom"
                            }
                          >
                            <div className="d-flex align-items-start justify-content-between gap-2">
                              <div style={{ minWidth: 0 }}>
                                <div
                                  className="fw-semibold"
                                  style={{
                                    fontSize: 14,
                                    wordBreak: "break-word",
                                  }}
                                >
                                  <i className="fas fa-mobile-alt me-2 text-muted"></i>
                                  {device.deviceName}
                                </div>
                                <div
                                  className="text-muted"
                                  style={{ fontSize: 12, marginTop: 2 }}
                                >
                                  Added {formatDate(device.addedAt)}
                                  {" · "}
                                  Last used {formatRelative(device.lastUsedAt)}
                                </div>
                              </div>
                              {removingDeviceId !== device.id && (
                                <Button
                                  variant="outline-danger"
                                  size="sm"
                                  onClick={() => openRemoveDevice(device.id)}
                                >
                                  Remove
                                </Button>
                              )}
                            </div>

                            {removingDeviceId === device.id && (
                              <Form
                                onSubmit={(e) => handleRemoveDevice(e, device)}
                                className="mt-3 border-top pt-3"
                              >
                                <div
                                  className="text-muted mb-2"
                                  style={{ fontSize: 12 }}
                                >
                                  Enter your password to remove{" "}
                                  <strong>{device.deviceName}</strong>.
                                </div>
                                <Form.Control
                                  type="password"
                                  size="sm"
                                  placeholder="Password"
                                  value={removePassword}
                                  onChange={(e) =>
                                    setRemovePassword(e.target.value)
                                  }
                                  isInvalid={!!removeError}
                                  className="mb-2"
                                />
                                {removeError && (
                                  <div
                                    className="text-danger small mb-2"
                                  >
                                    {removeError}
                                  </div>
                                )}
                                <div className="d-flex gap-2">
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    type="submit"
                                    disabled={removing}
                                  >
                                    {removing ? "Removing…" : "Remove device"}
                                  </Button>
                                  <Button
                                    variant="outline-secondary"
                                    size="sm"
                                    type="button"
                                    onClick={cancelRemoveDevice}
                                    disabled={removing}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </Form>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Mid-enrolment: QR + first code ── */}
                  {qrCode && (
                    <div className="mb-4">
                      <Alert variant="info" className="mb-3">
                        <strong>Step 1.</strong> Open Google Authenticator and scan this QR
                        code — or, on a desktop, use the setup key below.
                        <br />
                        <strong>Step 2.</strong> Enter the 6-digit code it shows
                        to confirm.
                      </Alert>

                      <div className="text-center mb-3">
                        <img
                          src={qrCode}
                          alt="Two-factor authentication QR code"
                          style={{
                            width: 200,
                            height: 200,
                            border: "1px solid #e0e0e0",
                            borderRadius: 8,
                            padding: 8,
                            background: "#fff",
                          }}
                        />
                      </div>

                      {setupParams?.manualEntryKey && (
                        <div className="mb-3">
                          {!showManualKey ? (
                            <div className="text-center">
                              <button
                                type="button"
                                className="btn btn-link p-0"
                                style={{ fontSize: 13 }}
                                onClick={() => setShowManualKey(true)}
                              >
                                <i className="fas fa-desktop me-2"></i>
                                Can't scan? Enter this key manually
                              </button>
                            </div>
                          ) : (
                            <div
                              className="border rounded-3 p-3"
                              style={{ background: "#f8f9fa" }}
                            >
                              <div
                                className="fw-semibold mb-2"
                                style={{ fontSize: 13 }}
                              >
                                Set up on a desktop authenticator
                              </div>
                              <div
                                className="text-muted mb-2"
                                style={{ fontSize: 12 }}
                              >
                                In your authenticator app, add a new entry by
                                hand and paste this key.
                              </div>

                              <label
                                className="text-muted"
                                style={{ fontSize: 11 }}
                              >
                                Setup key
                              </label>
                              <div className="d-flex align-items-stretch gap-2 mb-2">
                                <code
                                  style={{
                                    flexGrow: 1,
                                    padding: "8px 10px",
                                    background: "#fff",
                                    border: "1px solid #dee2e6",
                                    borderRadius: 6,
                                    fontFamily:
                                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                                    fontSize: 13,
                                    letterSpacing: "0.05em",
                                    wordBreak: "break-all",
                                    color: "#212529",
                                    userSelect: "all",
                                  }}
                                >
                                  {formatManualKey(setupParams.manualEntryKey)}
                                </code>
                                <Button
                                  variant={
                                    keyCopied
                                      ? "success"
                                      : "outline-secondary"
                                  }
                                  size="sm"
                                  type="button"
                                  onClick={copyManualKey}
                                  style={{ whiteSpace: "nowrap" }}
                                >
                                  <i
                                    className={
                                      keyCopied
                                        ? "fas fa-check me-1"
                                        : "far fa-copy me-1"
                                    }
                                  ></i>
                                  {keyCopied ? "Copied" : "Copy"}
                                </Button>
                              </div>

                              <div
                                className="d-flex flex-wrap gap-3 text-muted"
                                style={{ fontSize: 12 }}
                              >
                                <span>
                                  <strong>Account:</strong>{" "}
                                  {setupParams.account}
                                </span>
                                <span>
                                  <strong>Issuer:</strong>{" "}
                                  {setupParams.issuer}
                                </span>
                                <span>
                                  <strong>Type:</strong> Time-based
                                </span>
                                <span>
                                  <strong>Digits:</strong>{" "}
                                  {setupParams.digits}
                                </span>
                                <span>
                                  <strong>Interval:</strong>{" "}
                                  {setupParams.periodSeconds}s
                                </span>
                              </div>

                              <div className="text-end mt-2">
                                <button
                                  type="button"
                                  className="btn btn-link btn-sm p-0"
                                  style={{ fontSize: 12 }}
                                  onClick={() => setShowManualKey(false)}
                                >
                                  Hide
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <Form onSubmit={handleVerifySetup}>
                        <Form.Group className="mb-3" controlId="setupCode">
                          <Form.Label>Verification code</Form.Label>
                          <Form.Control
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            placeholder="000000"
                            value={setupCode}
                            onChange={onCodeChange(setSetupCode)}
                            isInvalid={!!setupError}
                            style={{
                              textAlign: "center",
                              letterSpacing: "0.4em",
                              fontSize: 20,
                              fontWeight: 600,
                            }}
                          />
                          {setupError && (
                            <div className="text-danger small mt-1">
                              {setupError}
                            </div>
                          )}
                        </Form.Group>

                        <div className="d-flex gap-2">
                          <Button
                            variant="primary"
                            type="submit"
                            disabled={verifying}
                            className="flex-grow-1"
                          >
                            {verifying ? "Verifying…" : "Confirm device"}
                          </Button>
                          <Button
                            variant="outline-secondary"
                            type="button"
                            onClick={resetForms}
                            disabled={verifying}
                          >
                            Cancel
                          </Button>
                        </div>
                      </Form>
                    </div>
                  )}

                  {/* ── Password + device name step (first enable OR add device) ── */}
                  {!qrCode && showSetup && (
                    <Form
                      onSubmit={handleStartSetup}
                      className="border rounded-3 p-3 mb-3"
                    >
                      <div className="fw-semibold mb-2">
                        {isEnabled ? "Add a new device" : "Confirm it's you"}
                      </div>
                      <p className="text-muted small">
                        {isEnabled
                          ? "Give this device a name and enter your password. We'll then show a QR code to scan with Google Authenticator."
                          : "Enter your password and pick a name for this device. We'll then show a QR code to scan with Google Authenticator."}
                      </p>
                      <Form.Group className="mb-3" controlId="setupPassword">
                        <Form.Label>Password</Form.Label>
                        <Form.Control
                          type="password"
                          placeholder="Enter your password"
                          value={setupPassword}
                          onChange={(e) => setSetupPassword(e.target.value)}
                          isInvalid={!!setupError}
                        />
                      </Form.Group>
                      <Form.Group className="mb-3" controlId="setupDeviceName">
                        <Form.Label>Device name</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="e.g. iPhone 15, Work MacBook"
                          value={setupDeviceName}
                          maxLength={60}
                          onChange={(e) => setSetupDeviceName(e.target.value)}
                          isInvalid={!!setupError}
                        />
                        <Form.Text className="text-muted">
                          Only you see this — it just helps you tell your
                          devices apart in this list.
                        </Form.Text>
                      </Form.Group>
                      {setupError && (
                        <div className="text-danger small mb-2">
                          {setupError}
                        </div>
                      )}
                      <div className="d-flex gap-2">
                        <Button
                          variant="primary"
                          type="submit"
                          disabled={startingSetup}
                          className="flex-grow-1"
                        >
                          {startingSetup ? "Preparing…" : "Continue"}
                        </Button>
                        <Button
                          variant="outline-secondary"
                          type="button"
                          onClick={resetForms}
                          disabled={startingSetup}
                        >
                          Cancel
                        </Button>
                      </div>
                    </Form>
                  )}

                  {/* ── Not enrolled: primary CTA ── */}
                  {!qrCode && !isEnabled && !showSetup && (
                    <div className="d-grid">
                      <Button
                        variant="primary"
                        onClick={() => {
                          resetForms();
                          setShowSetup(true);
                        }}
                      >
                        Enable Two-Factor Authentication
                      </Button>
                    </div>
                  )}

                  {/* ── Enrolled: add another device / disable ── */}
                  {!qrCode && isEnabled && !showSetup && (
                    <div className="d-flex gap-2 mt-2">
                      <Button
                        variant="outline-primary"
                        className="flex-grow-1"
                        onClick={() => {
                          resetForms();
                          setShowSetup(true);
                        }}
                      >
                        <i className="fas fa-plus me-2"></i>
                        Add a device
                      </Button>
                      <Button
                        variant="outline-danger"
                        className="flex-grow-1"
                        onClick={() => {
                          resetForms();
                          setShowDisable(true);
                        }}
                      >
                        Turn off
                      </Button>
                    </div>
                  )}

                  {/* ── Disable-all form ── */}
                  {!qrCode && isEnabled && showDisable && (
                    <Form
                      onSubmit={handleDisable}
                      className="border rounded-3 p-3 mt-3"
                    >
                      <div className="fw-semibold mb-2">
                        Turn off two-factor authentication
                      </div>
                      <p className="text-muted small">
                        Every enrolled device will be removed. For your security
                        this needs both your password and a current code from
                        any device.
                      </p>
                      <Form.Group className="mb-3" controlId="disablePassword">
                        <Form.Label>Password</Form.Label>
                        <Form.Control
                          type="password"
                          placeholder="Enter your password"
                          value={disablePassword}
                          onChange={(e) => setDisablePassword(e.target.value)}
                        />
                      </Form.Group>
                      <Form.Group className="mb-3" controlId="disableCode">
                        <Form.Label>Verification code</Form.Label>
                        <Form.Control
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          placeholder="000000"
                          value={disableCode}
                          onChange={onCodeChange(setDisableCode)}
                          style={{
                            textAlign: "center",
                            letterSpacing: "0.4em",
                            fontSize: 20,
                            fontWeight: 600,
                          }}
                        />
                      </Form.Group>
                      {disableError && (
                        <div className="text-danger small mb-2">
                          {disableError}
                        </div>
                      )}
                      <div className="d-flex gap-2">
                        <Button
                          variant="danger"
                          type="submit"
                          disabled={disabling}
                        >
                          {disabling ? "Turning off…" : "Turn off"}
                        </Button>
                        <Button
                          variant="outline-secondary"
                          type="button"
                          onClick={() => setShowDisable(false)}
                          disabled={disabling}
                        >
                          Cancel
                        </Button>
                      </div>
                    </Form>
                  )}
                </>
              )}
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
};

export default TwoFactorAuth;
