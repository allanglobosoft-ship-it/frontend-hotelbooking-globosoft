// URL / path-segment guards for values that come from outside the app.

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Returns the link when it is a web link (http/https, or a relative path on
 * this site), otherwise null. Use it before window.open / href for any link
 * an admin or partner typed in.
 *
 * Example: "https://hotel.example/offer" → returned as-is;
 *          "javascript:alert(document.cookie)" → null (nothing is opened).
 */
export function safeHttpUrl(raw) {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    return HTTP_PROTOCOLS.has(new URL(value, base).protocol) ? value : null;
  } catch (_) {
    return null;
  }
}

/** True for an absolute http:// or https:// link (what the ad form accepts). */
export function isAbsoluteHttpUrl(raw) {
  if (typeof raw !== "string") return false;
  const value = raw.trim();
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    return HTTP_PROTOCOLS.has(new URL(value).protocol);
  } catch (_) {
    return false;
  }
}

// CC Avenue order ids are minted by the backend as "HBP<millis>[-<agentId>]"
// (CCAvenuePaymentServiceImpl.generateOrderId, max 30 chars). No dots or
// slashes, so a value from the URL cannot walk to another API path.
const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Validates an order id read from the URL and encodes it for use as one
 * path segment. Throws for anything else, so the caller's existing
 * try/catch shows its normal "could not complete" message and no request
 * is sent.
 *
 * Example: "HBP1761543210000-42" → "HBP1761543210000-42";
 *          "../../agent/5/status" → throws (previously it would have been
 *          POSTed as /api/payment/agent/5/status).
 */
export function orderIdPathSegment(orderId) {
  const value = orderId === null || orderId === undefined ? "" : String(orderId);
  if (!ORDER_ID_PATTERN.test(value)) {
    throw new Error("Invalid payment reference.");
  }
  return encodeURIComponent(value);
}
