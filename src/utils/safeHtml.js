// Safe rendering helpers for text that other people wrote (agents on the
// public registration form, hotel / activity partners, supplier APIs).
//
// Three tools, pick by how the text is shown:
//   - escapeHtml(text)            text going into an HTML string we build
//                                 ourselves (e.g. a SweetAlert2 `html:`).
//   - sanitizeRichHtml(html)      partner/hotel-written rich text rendered
//                                 with dangerouslySetInnerHTML (terms and
//                                 conditions, activity details): formatting
//                                 stays, scripts / event handlers / javascript:
//                                 links / forms / <style> are removed.
//   - sanitizeSupplierHtml(html)  supplier API descriptions (GRN): a small
//                                 formatting-only allow-list, no attributes.
//
// Example: a hotel's terms and conditions saved as
//   <p><b>Check-in</b> from 2 PM</p><img src=x onerror="steal()">
// still shows "Check-in from 2 PM" in bold, but the onerror handler (which
// would have run inside the agent's logged-in session) is gone.
import DOMPurify from "dompurify";

// A private DOMPurify instance, so the hook below cannot affect jsPDF's own
// (optional) use of the shared default instance.
const purify = DOMPurify(typeof window !== "undefined" ? window : undefined);

if (purify.isSupported) {
  // Links that open a new tab must not hand the opener page to the target.
  purify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

const RICH_TEXT_CONFIG = {
  USE_PROFILES: { html: true },
  // Page-wide styling, forms and embeds have no place in a description.
  FORBID_TAGS: [
    "style", "form", "input", "button", "textarea", "select", "option",
    "iframe", "frame", "object", "embed", "link", "meta", "base",
  ],
  ADD_ATTR: ["target"],
};

const SUPPLIER_TEXT_CONFIG = {
  ALLOWED_TAGS: [
    "p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li",
    "span", "div", "small", "h1", "h2", "h3", "h4", "h5", "h6",
  ],
  ALLOWED_ATTR: [],
};

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes text so it shows literally when placed inside an HTML string. */
export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// Render paths call these on every re-render; a small cache keeps that cheap.
const makeCached = (config) => {
  const cache = new Map();
  return (html) => {
    if (html === null || html === undefined) return "";
    const input = String(html);
    if (!input) return "";
    if (cache.has(input)) return cache.get(input);
    // Not a browser (should not happen in the app): never return raw markup.
    const output = purify.isSupported ? purify.sanitize(input, config) : escapeHtml(input);
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(input, output);
    return output;
  };
};

/** Partner / hotel rich text → safe HTML that keeps its formatting. */
export const sanitizeRichHtml = makeCached(RICH_TEXT_CONFIG);

/** Supplier API description → safe HTML limited to basic formatting tags. */
export const sanitizeSupplierHtml = makeCached(SUPPLIER_TEXT_CONFIG);
