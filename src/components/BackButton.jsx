import React from "react";
import { Button } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft } from "react-icons/fa";

/**
 * Generic "go to previous page" button. Uses the browser/router history
 * (navigate(-1)) so it works the same on any page without needing to know
 * its parent route. Falls back to `fallback` when there's no history to go
 * back to (e.g. the page was opened directly via a bookmarked URL).
 *
 * Pass `forceFallback` to skip the history check entirely and always
 * navigate to `fallback` — used by report pages that should always return
 * to the caller's dashboard rather than the previous sibling report.
 */
export default function BackButton({
  label = "Back",
  fallback = "/",
  variant = "light",
  size = "sm",
  className = "",
  forceFallback = false,
}) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (forceFallback) {
      navigate(fallback);
      return;
    }
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };

  return (
    <Button variant={variant} size={size} className={className} onClick={handleClick}>
      <FaArrowLeft className="me-1" /> {label}
    </Button>
  );
}
