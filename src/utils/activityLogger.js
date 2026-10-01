// User activity trail → backend user-activity.log.
//
// Records what the user does in the browser (page views, clicks on
// buttons / links / fields / clickable cards, form submits, dropdown
// picks) and ships it in small batches to POST /api/activity-log/events.
// The backend writes one "UI" line per event into
// <logs>/activity/user-activity.log, next to the "API" line it writes for
// every request and the "AUTH" lines for login / logout. Who the user is
// comes from the JWT on the server, never from this payload.
//
// Privacy: never reads what the user TYPES. Text / password / email /
// date field values are not captured, only which field was clicked.
// Labels are clipped to a short length.
//
// Sends with fetch() instead of the shared axiosInstance on purpose. A
// background log flush must never trigger the 401 → refresh-token →
// "Session Expired" modal flow in AxiosInstance.jsx; a flush that lands
// just after logout would otherwise pop that modal on the login page.
//
// Mounted once from components/ActivityTracker.jsx. Pages do not need to
// call anything. To give an icon-only button a readable name in the log,
// add data-activity="Delete booking" (aria-label / title work too).

const ENDPOINT = `${process.env.REACT_APP_API_BASE_URL || ""}/api/activity-log/events`;

const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH = 50;      // backend accepts up to 100 per request
const MAX_QUEUE = 500;     // oldest events are dropped beyond this
const MAX_LABEL = 80;
const MAX_DETAIL = 200;
const TAB_ID_KEY = "activityTabId";

// Elements that count as "something the user acted on". Clickable
// <div>/<tr>/<span> cards with a React onClick leave no trace in the
// DOM, so those are picked up by their cursor:pointer style instead.
const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='option']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  ".dropdown-item",
  ".nav-link",
  // react-select menu options (ids like "react-select-3-option-0")
  "[id^='react-select'][id*='-option-']",
  "[data-activity]",
].join(",");

const LOGOUT_LABEL = /\b(log\s?out|sign\s?out)\b/i;

let queue = [];
let lastKnownToken = null;  // lets the post-logout flush still authenticate
let rejectedToken = null;   // a token the server refused; wait for a new one
let flushTimer = null;
let sending = false;
let installed = false;
let fallbackTabId = null;

// ── Storage helpers (storage can throw in private mode) ─────────────────

function readToken() {
  try {
    return localStorage.getItem("authToken");
  } catch {
    return null;
  }
}

function readActiveRole() {
  try {
    return (
      localStorage.getItem("currentActiveRole") ||
      (localStorage.getItem("userRole") || "").split(",")[0] ||
      null
    );
  } catch {
    return null;
  }
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function getTabId() {
  try {
    let id = sessionStorage.getItem(TAB_ID_KEY);
    if (!id) {
      id = randomId();
      sessionStorage.setItem(TAB_ID_KEY, id);
    }
    return id;
  } catch {
    if (!fallbackTabId) fallbackTabId = randomId();
    return fallbackTabId;
  }
}

function clip(value, max) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// ── Queue + sender ──────────────────────────────────────────────────────

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL_MS);
}

function requeue(batch) {
  queue = batch.concat(queue);
  if (queue.length > MAX_QUEUE) queue = queue.slice(queue.length - MAX_QUEUE);
}

function flush({ keepalive = false } = {}) {
  if (queue.length === 0) return;
  if (sending && !keepalive) return;

  const currentToken = readToken();
  const token = currentToken || lastKnownToken;
  // Not logged in (yet): hold the events. Clicks on the login page are
  // sent, under the new user, once the login succeeds.
  if (!token) return;
  // The server refused this token (expired / inactive account). Wait for
  // AxiosInstance's refresh flow to store a new one.
  if (token === rejectedToken) return;

  const batch = queue.splice(0, MAX_BATCH);
  const body = JSON.stringify({
    sessionId: getTabId(),
    activeRole: readActiveRole(),
    events: batch,
  });

  sending = true;
  let request;
  try {
    request = fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body,
      keepalive,
    });
  } catch {
    sending = false;
    requeue(batch);
    return;
  }

  request
    .then((res) => {
      if (res.status === 401 || res.status === 403) {
        // Still logged in → retry after the token is refreshed.
        // Logged out → nobody left to attribute them to; drop.
        if (readToken()) {
          rejectedToken = token;
          requeue(batch);
        }
      }
      // Any other non-2xx is a server-side problem; drop rather than loop.
    })
    .catch(() => {
      requeue(batch); // network blip — try again on the next tick
    })
    .finally(() => {
      sending = false;
      // That was the last flush of a session that has just logged out.
      if (!currentToken) lastKnownToken = null;
      if (queue.length) scheduleFlush();
    });
}

/**
 * Queue one activity event. Safe to call from anywhere; never throws.
 *
 * @param {string} type    PAGE_VIEW | CLICK | SUBMIT | SELECT | any UPPER_CASE code
 * @param {object} [info]
 * @param {string} [info.target]  element descriptor, e.g. "button#save"
 * @param {string} [info.label]   what the user saw on it
 * @param {string} [info.detail]  extra context (href, option text, checked state)
 * @param {boolean} [info.urgent] send now instead of on the next tick
 */
export function logActivity(type, info = {}) {
  try {
    const token = readToken();
    if (token) lastKnownToken = token;

    queue.push({
      type,
      page: window.location.pathname,
      target: clip(info.target, 120),
      label: clip(info.label, MAX_LABEL),
      detail: clip(info.detail, MAX_DETAIL),
      clientTime: new Date().toISOString(),
    });
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);

    if (info.urgent || queue.length >= MAX_BATCH) {
      flush();
    } else {
      scheduleFlush();
    }
  } catch {
    // Activity logging must never break the page.
  }
}

// ── DOM capture ─────────────────────────────────────────────────────────

function findActionElement(start) {
  let el = start instanceof Element ? start : start && start.parentElement;
  if (!el) return null;

  const interactive = el.closest(INTERACTIVE_SELECTOR);
  if (interactive) return interactive;

  for (let i = 0; el && i < 6 && el !== document.body; i += 1, el = el.parentElement) {
    if (window.getComputedStyle(el).cursor === "pointer") {
      // cursor is inherited: climb to the element that set it (the card /
      // row itself) rather than the <span> inside it that was hit.
      let owner = el;
      for (let j = 0; j < 8; j += 1) {
        const parent = owner.parentElement;
        if (!parent || parent === document.body) break;
        if (window.getComputedStyle(parent).cursor !== "pointer") break;
        owner = parent;
      }
      return owner;
    }
  }
  return null;
}

function describeTarget(el) {
  const tag = el.tagName.toLowerCase();
  let desc = tag;
  const type = el.getAttribute("type");
  if (tag === "input" && type) desc += `[type=${type}]`;
  if (el.id) {
    desc += `#${el.id}`;
  } else if (el.getAttribute("name")) {
    desc += `[name=${el.getAttribute("name")}]`;
  }
  return desc;
}

function fieldLabel(el) {
  const own = el.labels && el.labels.length ? el.labels[0].innerText : "";
  return own || el.getAttribute("placeholder") || el.getAttribute("name") || "";
}

function iconHint(el) {
  const icon = el.querySelector && el.querySelector("i[class*='fa-'], svg[class]");
  if (!icon) return "";
  const cls = icon.getAttribute("class") || "";
  const match = cls.match(/\b(?:fa-|lucide-)([a-z0-9-]+)/i);
  return match ? `[icon: ${match[1]}]` : "";
}

function labelOf(el) {
  const explicit =
    el.getAttribute("data-activity") ||
    el.getAttribute("aria-label") ||
    el.getAttribute("title");
  if (explicit) return explicit;

  const tag = el.tagName;
  if (tag === "INPUT") {
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (type === "button" || type === "submit" || type === "reset") return el.value;
    return fieldLabel(el); // never the typed value
  }
  if (tag === "TEXTAREA" || tag === "SELECT") return fieldLabel(el);

  const text = el.innerText || el.textContent || "";
  if (text.trim()) return text;
  const img = el.querySelector && el.querySelector("img[alt]");
  if (img && img.getAttribute("alt")) return img.getAttribute("alt");
  return iconHint(el);
}

function detailOf(el) {
  const tag = el.tagName;
  if (tag === "A") {
    const href = el.getAttribute("href") || "";
    return href.toLowerCase().startsWith("javascript:") ? null : href;
  }
  if (tag === "INPUT") {
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (type === "checkbox" || type === "radio") return `checked=${el.checked}`;
  }
  return null;
}

function onClick(event) {
  const hit = event.target instanceof Element ? event.target : null;

  // A click on a <label> is followed by a synthetic click on its field,
  // which is logged with the label's text. Skip the label's own click so
  // one user click is one line.
  const wrappingLabel = hit ? hit.closest("label") : null;
  if (
    wrappingLabel &&
    wrappingLabel.control &&
    !wrappingLabel.control.contains(hit)
  ) {
    return;
  }

  const el = findActionElement(event.target);
  if (!el) return; // plain text / background: not an action

  const label = labelOf(el);
  logActivity("CLICK", {
    target: describeTarget(el),
    label,
    detail: detailOf(el),
    // Send "Logout" right away, while the token is still in storage.
    urgent: LOGOUT_LABEL.test(label || ""),
  });
}

function onSubmit(event) {
  const form = event.target;
  if (!form || form.tagName !== "FORM") return;
  const submitter = event.submitter;
  logActivity("SUBMIT", {
    target: describeTarget(form),
    label: submitter
      ? labelOf(submitter)
      : form.getAttribute("aria-label") || form.getAttribute("name") || "",
  });
}

function onChange(event) {
  const el = event.target;
  if (!el || el.tagName !== "SELECT") return; // typed values are never logged
  const option = el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
  logActivity("SELECT", {
    target: describeTarget(el),
    label: fieldLabel(el),
    detail: option ? option.text : null,
  });
}

function onPageHidden() {
  flush({ keepalive: true });
}

// Activity logging must never break the page.
function safely(handler) {
  return (event) => {
    try {
      handler(event);
    } catch {
      // ignore
    }
  };
}

/** Attach the document-level listeners once for the life of the tab. */
export function installActivityTracking() {
  if (installed || typeof document === "undefined") return;
  installed = true;

  // Capture phase: runs before React's own handlers, so a Logout click is
  // queued while the token is still in localStorage.
  document.addEventListener("click", safely(onClick), true);
  document.addEventListener("submit", safely(onSubmit), true);
  document.addEventListener("change", safely(onChange), true);

  // Full page loads (window.location.href = ...) and tab closes: send what
  // is left. keepalive lets the request outlive the page.
  window.addEventListener("pagehide", safely(onPageHidden));
  document.addEventListener(
    "visibilitychange",
    safely(() => {
      if (document.visibilityState === "hidden") onPageHidden();
    })
  );
}
