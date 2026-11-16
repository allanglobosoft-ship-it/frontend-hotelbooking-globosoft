import React, { useEffect, useState } from "react";
import { FaWallet } from "react-icons/fa";
import axiosInstance from "./AxiosInstance";

/**
 * Right-aligned "Available Credit" strip for the /new-booking/* search
 * pages. Renders ONLY for agent logins — the logged-in agent's available
 * credit balance is resolved server-side from the JWT via
 * /api/agent-credit-limit/single-agent (same endpoint the Agent Dashboard
 * credit panel uses). Admin / staff / extranet logins (and agents whose
 * balance fails to load) render nothing, so pages can include this
 * unconditionally.
 *
 * Drop it as the first element of the page's <main> content:
 *   <AgentCreditBalance />
 */
export default function AgentCreditBalance() {
  // Same agent-login detection the search pages already use for hiding
  // the manual Agent picker: prefer the multi-role currentActiveRole,
  // fall back to userRole for single-role logins.
  const activeRole = (sessionStorage.getItem("currentActiveRole") || "")
    .trim()
    .toUpperCase();
  const storedRoles = (sessionStorage.getItem("userRole") || "").toUpperCase();
  const isAgentRole = activeRole
    ? activeRole === "AGENT"
    : storedRoles.includes("AGENT") && !storedRoles.includes("ADMIN");

  const [available, setAvailable] = useState(null);

  useEffect(() => {
    if (!isAgentRole) return undefined;
    let alive = true;
    axiosInstance
      .get("/api/agent-credit-limit/single-agent")
      .then((res) => {
        if (!alive) return;
        // effectiveAvailableCreditLimit = regular available credit + any
        // currently-Active Temporary Credit Limit. Falls back to
        // availableCreditLimit for older cached responses.
        const value = Number(
          res?.data?.effectiveAvailableCreditLimit ??
            res?.data?.availableCreditLimit,
        );
        setAvailable(Number.isFinite(value) ? value : null);
      })
      .catch((error) => {
        console.error("Error fetching agent credit balance:", error);
      });
    return () => {
      alive = false;
    };
  }, [isAgentRole]);

  if (!isAgentRole || available === null) return null;

  return (
    <div
      className="d-flex justify-content-end mb-2"
      style={{ gap: 6, alignItems: "center" }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          background: "#FDE7ED",
          border: "1px solid #F8C9D5",
          borderRadius: 999,
          padding: "5px 14px",
          fontSize: 13,
          fontWeight: 700,
          color: "#EC0B43",
          whiteSpace: "nowrap",
        }}
      >
        <FaWallet />
        Available Credit:{" "}
        {`AED ${available.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
      </span>
    </div>
  );
}
