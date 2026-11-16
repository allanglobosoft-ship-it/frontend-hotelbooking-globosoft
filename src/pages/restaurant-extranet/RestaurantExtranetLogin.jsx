import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Card, Form, Button, Spinner, Alert } from "react-bootstrap";
import { FaUtensils, FaSignInAlt } from "react-icons/fa";
import { getRestaurantExtranetToken, setRestaurantExtranetSession } from "../../utils/authSession";

/**
 * Restaurant-side extranet login page.
 *
 * Separate from the agent / admin login (`/login`). The two flows store
 * their JWTs under different keys (`authToken` for admin / agent,
 * `restaurantExtranetToken` for this portal) so logging into one does not
 * invalidate the other. Both live in this tab's sessionStorage (see
 * utils/authSession.js), never localStorage.
 *
 * On success → store token + restaurant info → navigate to
 * `/restaurant-extranet/dashboard`.
 */
const RestaurantExtranetLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // If already logged in, jump straight to the dashboard. Keeps the
  // page out of the way when an extranet user accidentally lands here.
  useEffect(() => {
    if (getRestaurantExtranetToken()) {
      navigate("/restaurant-extranet/dashboard", { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const baseURL = process.env.REACT_APP_API_BASE_URL || "";
      const res = await axios.post(
        `${baseURL}/api/restaurant-extranet/login`,
        { email: email.trim(), password },
        { timeout: 30000 }
      );
      const data = res?.data || {};
      if (data.status === "SUCCESS" && data.token) {
        setRestaurantExtranetSession({
          token: data.token,
          restaurantId: data.restaurantId,
          restaurantName: data.restaurantName,
          email: data.email,
        });
        navigate("/restaurant-extranet/dashboard", { replace: true });
      } else {
        setError(data.message || "Invalid email or password.");
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Login failed.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-vh-100 d-flex align-items-center justify-content-center"
      style={{
        background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
        padding: "1rem",
      }}
    >
      <Card
        className="shadow-lg border-0 rounded-4"
        style={{ width: "100%", maxWidth: 440 }}
      >
        <Card.Body className="p-4 p-md-5">
          <div className="text-center mb-4">
            <div
              className="d-inline-flex align-items-center justify-content-center mb-3"
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                color: "#fff",
              }}
            >
              <FaUtensils size={28} />
            </div>
            <h3 className="fw-bold mb-1" style={{ color: "#111827" }}>
              Restaurant Extranet
            </h3>
            <p className="text-muted mb-0" style={{ fontSize: "0.9rem" }}>
              Manage your incoming reservations
            </p>
          </div>

          {error && (
            <Alert variant="danger" className="py-2 small">
              {error}
            </Alert>
          )}

          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Email</Form.Label>
              <Form.Control
                type="email"
                value={email}
                placeholder="manager@restaurant.com"
                disabled={submitting}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError("");
                }}
                autoFocus
              />
            </Form.Group>
            <Form.Group className="mb-4">
              <Form.Label className="fw-semibold">Password</Form.Label>
              <Form.Control
                type="password"
                value={password}
                placeholder="Enter your password"
                disabled={submitting}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
              />
            </Form.Group>
            <Button
              type="submit"
              variant="primary"
              className="w-100 d-flex align-items-center justify-content-center gap-2 py-2 rounded-pill fw-semibold"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Spinner animation="border" size="sm" />
                  Signing in…
                </>
              ) : (
                <>
                  <FaSignInAlt /> Sign In
                </>
              )}
            </Button>
          </Form>

          <div className="text-center mt-4">
            <small className="text-muted">
              Don't have an account? Contact your platform administrator.
            </small>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

export default RestaurantExtranetLogin;
