// Client-side activity + interaction log.
//
// Records the following and ships it in small batches to
// POST /api/activity-log/client (ClientActivityLogController.java):
//
//   * user interactions → backend interactions.log, a folder of its own:
//       NAVIGATE         route change (path only) + time spent on the last page
//       BUTTON_CLICK     <button>, .btn, role=button, input type=button/submit
//       LINK_CLICK       <a href>, role=link
//       MENU_SELECT      sidebar / top-bar menu entries, .dropdown-item,
//                        role=menuitem
//       TAB_SWITCH       role=tab, .nav-link inside .nav-tabs / .nav-pills
//       DROPDOWN_SELECT  native <select> change, react-select / listbox options,
//                        the in-house typeahead option lists
//       TOGGLE           checkbox / radio / switch
//       FORM_SUBMIT      <form> submit (merged with the click that caused it)
//       CLICK            any other element with a React onClick handler
//     each with its outcome (below), the page, the element, the component /
//     area it sits in and the identity of whoever was signed in at that moment;
//   * diagnostics → backend frontend.log: JavaScript errors and API calls that
//     failed or never reached the server.
// Login / logout, searches, bookings, cancellations and admin changes are ALSO
// recorded by the backend itself from the API calls (audit.log).
//
// Outcome: an interaction is held for CORRELATION_WINDOW_MS. API calls (axios →
// XMLHttpRequest) that start inside that window — or right after one of its
// calls finishes (chained requests, token refresh + retry) — belong to it. Once
// they have all finished the interaction is logged ONCE with SUCCESS /
// FAILURE / PARTIAL_FAILURE / CANCELLED, or NO_SERVER_CALL when it stayed in
// the browser (opening a modal, switching a tab). PENDING = the tab was closed
// before its calls finished. Lines can therefore reach the log a little after
// the action; "clientTs" / "seq" give the real order.
//
// Ground rules — keep them if you extend this file:
//   * observe only: never preventDefault / stopPropagation, never change a
//     request, never throw (every hook is wrapped in try/catch);
//   * never read what the user typed — text inputs are not observed at all —
//     and never send query strings, request bodies or tokens inside an event.
//     The only value sent is the visible label of a chosen dropdown option,
//     and never for credential / payment / personal fields (SENSITIVE_FIELD);
//   * clickable cards and table rows are logged by position, not by their text
//     (they show guest names, amounts …);
//   * who the user is comes from the JWT on the server; the user/role sent here
//     is only a hint for events fired while logged out. The identity is taken
//     when the event happens, so a logout click is still sent as the user who
//     clicked it.
//
// Opt-outs / hints for pages:
//   REACT_APP_ACTIVITY_LOG_ENABLED=false  disables everything at build time
//   data-activity-ignore                  nothing inside is logged
//   data-activity-mask                    labels / values inside → [MASKED]
//   data-activity="…"                     explicit label for an element
//   data-activity-component="…"           names the component of its contents

import {
  getAuthToken,
  getCurrentActiveRole,
  getRestaurantExtranetEmail,
  getRestaurantExtranetToken,
  getUserName,
  getUserRole,
} from "./authSession";

const API_BASE = process.env.REACT_APP_API_BASE_URL || "";
const ENDPOINT = `${API_BASE}/api/activity-log/client`;
const ENABLED =
  String(process.env.REACT_APP_ACTIVITY_LOG_ENABLED ?? "true").toLowerCase() !== "false";

const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH = 25;
const MAX_QUEUE = 300;
const MAX_SENDS_PER_FLUSH = 3;
// Browsers cap ALL in-flight keepalive bodies at 64 KB together.
const KEEPALIVE_MAX_BODY = 20000;
const MAX_ERRORS_PER_PAGE_LOAD = 50;

const CORRELATION_WINDOW_MS = 1500;
const CHAIN_GRACE_MS = 500;
const MAX_PENDING_MS = 60000;
const MAX_PENDING = 30;
const MAX_CALLS_TRACKED = 50;
const MAX_CALLS_REPORTED = 5;
const MAX_GENERIC_DESCENDANTS = 6;
const MAX_LABEL_DESCENDANTS = 12;

const SID_KEY = "activityLogSid";
const SID_OWNER_KEY = "activityLogSidOwner";
const GLOBAL_FLAG = "__hbsActivityLogger";
// The restaurant extranet signs in on its own and keeps its own token
// (sessionStorage, see utils/authSession.js).
const EXTRANET_PREFIX = "/restaurant-extranet";
const REFRESH_PATH = "/auth/refresh-token";

const CLICKABLE = [
  "button",
  "a[href]",
  '[role="button"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="link"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="checkbox"]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  "summary",
  ".btn",
  ".dropdown-item",
  ".nav-link",
  ".page-link",
  "[data-activity]",
].join(",");

const CLICK_INPUT_TYPES = new Set(["button", "submit", "reset", "checkbox", "radio", "image"]);
const TABLE_PARTS = new Set(["tr", "td", "th", "tbody", "thead", "table"]);
// Click-catching layers (modal / dropdown backdrops) — not user actions.
const BACKDROP = /backdrop|overlay|position-fixed|^modal\b/;
// Parents of the in-house typeahead option lists (components/filters/*).
const OPTION_LIST = /position-absolute|dropdown-menu|suggest|autocomplete|typeahead/i;

const SENSITIVE_KEY = /pass(word|wd|code)?|pwd|secret|token|api[-_]?key|credential|otp|cvv|cvc|card|authorization|cookie/i;
// A chosen option is never sent for these fields (matched on name / id / label).
const SENSITIVE_FIELD =
  /pass|pwd|secret|token|otp|cvv|cvc|card|iban|ifsc|swift|bank|account|payment|salutation|title|gender|nationality|religion|caste|passport|aadha?ar|\bpan\b|dob|birth|marital|blood|age\b|age\d|child/i;

// Saved before anything can wrap it, so our own sends are never observed.
const nativeFetch =
  typeof window !== "undefined" && typeof window.fetch === "function"
    ? window.fetch.bind(window)
    : null;

let queue = []; // [{ event, identity }]
let pending = []; // interactions waiting for the outcome of their API calls
let seq = 0;
let started = false;
let pausedUntil = 0;
let consecutiveFailures = 0;
let currentPath = null;
let pageSince = Date.now();
let lastClick = { key: "", at: 0 };
let errorsThisLoad = 0;
let reactPropsKey = null;
let memorySid = null;
const recentKeys = new Map();

// ── helpers ─────────────────────────────────────────────────────────────

function short(value, max) {
  if (value === null || value === undefined) return undefined;
  const s = String(value).replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// Light client-side masking; the backend applies the full set again.
function mask(text) {
  if (!text) return text;
  return String(text)
    .replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, "[JWT]")
    .replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, "$1***$2")
    .replace(/\+\d[\d\s-]{6,}\d/g, "[PHONE]")
    .replace(/(^|[^\w-])\d{9,}(?![\w-])/g, "$1[NUMBER]");
}

function stripQuery(url) {
  if (!url) return undefined;
  const s = String(url);
  const cut = s.search(/[?#]/);
  return cut >= 0 ? s.slice(0, cut) : s;
}

function classOf(el) {
  if (!el) return "";
  return typeof el.className === "string" ? el.className : el.getAttribute("class") || "";
}

/** First two class names, skipping generated css-in-js ones (react-select's "css-1x2y3z"). */
function classHint(el) {
  return classOf(el)
    .split(/\s+/)
    .filter((c) => c && !/^css-/.test(c))
    .slice(0, 2)
    .join(".");
}

/** True when el has at most max descendant elements (stops counting early). */
function hasFewDescendants(el, max) {
  let n = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    n += 1;
    if (n > max) return false;
  }
  return true;
}

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
    : `${Date.now().toString(16)}${Math.floor(Math.random() * 1e8).toString(16)}`;
}

// One random id per tab per signed-in user: a new one starts at login, logout
// and user switch, so it identifies a login session, not just a tab.
function sessionIdFor(user) {
  const owner = user || "";
  try {
    let id = sessionStorage.getItem(SID_KEY);
    if (!id || (sessionStorage.getItem(SID_OWNER_KEY) || "") !== owner) {
      id = newId();
      sessionStorage.setItem(SID_KEY, id);
      sessionStorage.setItem(SID_OWNER_KEY, owner);
    }
    return id;
  } catch (_) {
    if (!memorySid || memorySid.owner !== owner) memorySid = { owner, id: newId() };
    return memorySid.id;
  }
}

function activeRole() {
  try {
    return getCurrentActiveRole() || (getUserRole() || "").split(",")[0].trim() || undefined;
  } catch (_) {
    return undefined;
  }
}

/** Who is signed in right now — taken per event, never re-read at send time. */
function identitySnapshot() {
  try {
    let token = getAuthToken() || undefined;
    let user = getUserName() || undefined;
    let role = getUserRole() || undefined;
    let active = activeRole();
    if (!token && window.location.pathname.startsWith(EXTRANET_PREFIX)) {
      token = getRestaurantExtranetToken() || undefined;
      if (token) {
        user = user || getRestaurantExtranetEmail() || undefined;
        role = role || "restaurant_extranet";
        active = active || "restaurant_extranet";
      }
    }
    return { token, user, role, activeRole: active, sid: sessionIdFor(user) };
  } catch (_) {
    return {};
  }
}

function identityKey(id) {
  return `${id.token || ""}|${id.user || ""}|${id.role || ""}|${id.activeRole || ""}|${id.sid || ""}`;
}

/** Same key seen within windowMs → true (dedupes error loops). */
function seenRecently(key, windowMs) {
  const now = Date.now();
  const at = recentKeys.get(key);
  if (recentKeys.size > 500) recentKeys.clear();
  recentKeys.set(key, now);
  return at !== undefined && now - at < windowMs;
}

// ── queue / transport ───────────────────────────────────────────────────

function assignPresent(target, data) {
  Object.keys(data || {}).forEach((k) => {
    const v = data[k];
    if (v !== undefined && v !== null && v !== "") target[k] = v;
  });
  return target;
}

function enqueue(event, identity) {
  queue.push({ event, identity: identity || identitySnapshot() });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  if (queue.length >= MAX_BATCH) flush(false);
}

/** Immediate event: navigation, diagnostics, explicit business events. */
function push(type, data) {
  if (!started) return;
  try {
    enqueue(
      assignPresent(
        { type, ts: new Date().toISOString(), path: window.location.pathname, seq: ++seq },
        data
      )
    );
  } catch (_) {
    /* never break the app */
  }
}

function send(identity, events, keepalive) {
  const body = JSON.stringify({
    client: {
      sid: identity.sid,
      user: identity.user,
      role: identity.role,
      activeRole: identity.activeRole,
    },
    events,
  });
  const headers = { "Content-Type": "application/json" };
  if (identity.token) headers.Authorization = `Bearer ${identity.token}`;
  nativeFetch(ENDPOINT, {
    method: "POST",
    headers,
    body,
    credentials: "omit",
    // keepalive lets the last batch survive a page unload.
    keepalive: Boolean(keepalive) && body.length < KEEPALIVE_MAX_BODY,
  })
    .then((res) => {
      if (res.ok) {
        consecutiveFailures = 0;
        return;
      }
      // A backend without this endpoint (older deploy) answers 401/403/404:
      // stop trying for a while instead of retrying every 5 seconds.
      if ([401, 403, 404, 405, 410].includes(res.status)) {
        pausedUntil = Date.now() + 10 * 60 * 1000;
        queue = [];
      }
    })
    .catch(() => {
      // Not re-queued: a request that failed in flight may still have been
      // written, and a resend would duplicate it.
      consecutiveFailures += 1;
      if (consecutiveFailures >= 3) pausedUntil = Date.now() + 5 * 60 * 1000;
    });
}

function flush(keepalive) {
  if (!queue.length || !nativeFetch) return;
  if (Date.now() < pausedUntil) return;
  try {
    // One request per identity, in order, so every event is attributed to
    // whoever was signed in when it happened (login / logout / role switch).
    for (let sends = 0; sends < MAX_SENDS_PER_FLUSH && queue.length; sends += 1) {
      const { identity } = queue[0];
      const key = identityKey(identity);
      const events = [];
      while (events.length < MAX_BATCH && queue.length && identityKey(queue[0].identity) === key) {
        events.push(queue.shift().event);
      }
      send(identity, events, keepalive);
    }
  } catch (_) {
    /* ignore */
  }
}

// ── interactions + outcome ──────────────────────────────────────────────

function beginInteraction(action, data, el) {
  if (!started) return null;
  try {
    const at = Date.now();
    const it = {
      action,
      data: data || {},
      el,
      at,
      ts: new Date(at).toISOString(),
      path: window.location.pathname,
      seq: ++seq,
      identity: identitySnapshot(),
      calls: [],
      total: 0,
      open: 0,
      lastDoneAt: 0,
      done: false,
    };
    pending.push(it);
    if (pending.length > MAX_PENDING) finishInteraction(pending[0]);
    setTimeout(() => settle(it), CORRELATION_WINDOW_MS);
    setTimeout(() => finishInteraction(it), MAX_PENDING_MS);
    return it;
  } catch (_) {
    return null;
  }
}

/** Finishes the interaction once its window has passed and no call is (about to be) running. */
function settle(it) {
  if (it.done || it.open > 0) return;
  const now = Date.now();
  if (now - it.at < CORRELATION_WINDOW_MS - 20) return;
  if (it.lastDoneAt && now - it.lastDoneAt < CHAIN_GRACE_MS - 20) return;
  finishInteraction(it);
}

/** The interaction an API call starting now belongs to, if any. */
function correlate(now) {
  for (let i = pending.length - 1; i >= 0; i -= 1) {
    const it = pending[i];
    if (
      !it.done &&
      (now - it.at <= CORRELATION_WINDOW_MS ||
        (it.lastDoneAt && now - it.lastDoneAt <= CHAIN_GRACE_MS))
    ) {
      return it;
    }
  }
  return null;
}

function summarize(it) {
  if (it.total === 0) return { outcome: "NO_SERVER_CALL" };
  let counted = 0;
  let failed = 0;
  let cancelled = 0;
  let end = it.at;
  it.calls.forEach((c, i) => {
    if (c.end) end = Math.max(end, c.end);
    if (c.status === undefined) return; // still running
    if (c.path === REFRESH_PATH) return; // token refresh is plumbing, not the action
    if (c.cancelled) {
      cancelled += 1;
      return;
    }
    // 401 → refresh → retry: the retry decides.
    if (
      c.status === 401 &&
      it.calls
        .slice(i + 1)
        .some((d) => d.method === c.method && d.path === c.path && d.status >= 200 && d.status < 400)
    ) {
      return;
    }
    counted += 1;
    if (c.status === 0 || c.status >= 400) failed += 1;
  });
  let outcome;
  if (it.open > 0) outcome = "PENDING";
  else if (counted === 0) outcome = cancelled > 0 ? "CANCELLED" : "NO_SERVER_CALL";
  else if (failed === 0) outcome = "SUCCESS";
  else outcome = failed === counted ? "FAILURE" : "PARTIAL_FAILURE";
  return {
    outcome,
    result: {
      calls: it.total,
      failed,
      durationMs: Math.max(0, end - it.at),
      requests: it.calls.slice(0, MAX_CALLS_REPORTED).map((c) => ({
        method: c.method,
        path: c.path,
        status: c.status,
        ms: c.ms,
        cancelled: c.cancelled || undefined,
      })),
    },
  };
}

function finishInteraction(it) {
  if (!it || it.done) return;
  it.done = true;
  it.el = null;
  pending = pending.filter((p) => p !== it);
  try {
    const event = assignPresent({ type: it.action, ts: it.ts, path: it.path, seq: it.seq }, it.data);
    const summary = summarize(it);
    event.outcome = summary.outcome;
    if (summary.result) event.result = summary.result;
    enqueue(event, it.identity);
  } catch (_) {
    /* ignore */
  }
}

function finishAll() {
  pending.slice().forEach(finishInteraction);
}

// ── describing an element ───────────────────────────────────────────────

function hasReactClick(el) {
  try {
    if (!reactPropsKey) {
      reactPropsKey = Object.keys(el).find((k) => k.startsWith("__reactProps$")) || null;
      if (!reactPropsKey) return false;
    }
    const props = el[reactPropsKey];
    return Boolean(props && typeof props.onClick === "function");
  } catch (_) {
    return false;
  }
}

/** Nearest clickable: a semantic control, else an element with a React onClick. */
function findTarget(start) {
  let el = start;
  for (let depth = 0; el && el !== document.body && depth < 8; depth += 1) {
    if (el.matches(CLICKABLE)) return { el, semantic: true };
    if (hasReactClick(el)) return { el, semantic: false };
    el = el.parentElement;
  }
  const far = start.closest(CLICKABLE);
  return far ? { el: far, semantic: true } : null;
}

function labelOf(el, semantic) {
  if (el.closest("[data-activity-mask]")) return "[MASKED]";
  const tag = el.tagName.toLowerCase();
  let text =
    el.getAttribute("data-activity") || el.getAttribute("aria-label") || el.getAttribute("title");
  if (!text && !semantic) {
    // Generic clickable (div / span / li / tr / svg with onClick): a row or a
    // card is identified by position only — its text shows guest names,
    // amounts … A large container that merely listens for clicks (a modal's
    // backdrop handler, a page wrapper) is not an action at all.
    if (TABLE_PARTS.has(tag)) return `<${tag}>`;
    if (!hasFewDescendants(el, MAX_GENERIC_DESCENDANTS)) return undefined;
    const t = short(el.innerText, 200);
    if (t && t.length <= 60) return short(mask(t), 80);
    const hint = classHint(el);
    if (!hint || BACKDROP.test(hint)) return undefined;
    return `<${tag}.${hint}>`;
  }
  if (!text) {
    if (tag === "input") {
      // Button-like inputs show their value as the caption; for checkboxes /
      // radios use the attached <label>, never a typed value.
      if (["button", "submit", "reset"].includes(el.type)) text = el.value;
      else if (el.labels && el.labels[0]) text = el.labels[0].innerText;
    } else if (hasFewDescendants(el, MAX_LABEL_DESCENDANTS)) {
      text = el.innerText || el.textContent;
    }
  }
  if (!text) {
    const img = el.querySelector && el.querySelector("img[alt]");
    if (img) text = img.getAttribute("alt");
  }
  if (!text) {
    // Icon-only button: fall back to a short class hint.
    const hint = classHint(el);
    text = hint ? `<${tag}.${hint}>` : `<${tag}>`;
  }
  return short(mask(text), 80);
}

function headingText(node, kind) {
  const t = node ? short(mask(node.innerText || node.textContent), 60) : undefined;
  return t ? `${kind}: ${t}` : kind;
}

function formName(form) {
  const named =
    form.getAttribute("data-activity-component") ||
    form.getAttribute("name") ||
    form.getAttribute("aria-label") ||
    form.id;
  if (named) return short(mask(named), 80);
  return headingText(form.querySelector("legend, h1, h2, h3, h4, h5, h6, .card-title"), "Form");
}

/** Which part of the page an element belongs to: explicit name, dialog, form or card heading. */
function componentOf(el) {
  try {
    const explicit = el.closest("[data-activity-component]");
    if (explicit) return short(explicit.getAttribute("data-activity-component"), 80);
    if (el.closest("[data-activity-mask]")) return undefined;
    const dialog = el.closest('.modal, [role="dialog"], .swal2-popup');
    if (dialog) {
      return headingText(dialog.querySelector(".modal-title, .swal2-title, h1, h2, h3, h4, h5"), "Dialog");
    }
    const form = el.closest("form");
    if (form) return formName(form);
    const card = el.closest(".card");
    if (card) {
      const h = card.querySelector(".card-header, .card-title, h1, h2, h3, h4, h5, h6");
      if (h) return headingText(h, "Card");
    }
  } catch (_) {
    /* ignore */
  }
  return undefined;
}

function areaOf(el) {
  if (el.closest('.modal, [role="dialog"], .swal2-container')) return "DIALOG";
  if (el.closest(".sidebar, aside")) return "SIDEBAR";
  if (el.closest(".topbar, .navbar")) return "TOPBAR";
  return "PAGE";
}

function linkTarget(a) {
  try {
    const url = new URL(a.getAttribute("href"), window.location.href);
    if (url.origin === window.location.origin) return url.pathname;
    return `${url.protocol}//${url.host}`;
  } catch (_) {
    return undefined;
  }
}

function describe(el, semantic) {
  const tag = el.tagName.toLowerCase();
  const label = labelOf(el, semantic);
  if (!label) return null;
  const data = {
    tag,
    label,
    elementId: short(el.id, 100),
    elementName: short(el.getAttribute("name"), 100),
    elementType: tag === "input" || tag === "button" ? short(el.getAttribute("type"), 30) : undefined,
    elementRole: short(el.getAttribute("role"), 30),
    component: componentOf(el),
    area: areaOf(el),
  };
  if (tag === "a") data.href = linkTarget(el);
  if (el.type === "checkbox" || el.type === "radio") data.checked = Boolean(el.checked);
  else if (el.getAttribute("aria-checked")) data.checked = el.getAttribute("aria-checked") === "true";
  return data;
}

function looksLikeOption(el) {
  const list = el.parentElement;
  if (!list || list.children.length < 2) return false;
  return OPTION_LIST.test(classOf(list)) || OPTION_LIST.test(classOf(list.parentElement));
}

function classify(el, tag, semantic) {
  const role = (el.getAttribute("role") || "").toLowerCase();
  const cls = el.classList;
  if (role === "tab" || (cls.contains("nav-link") && el.closest('.nav-tabs, .nav-pills, [role="tablist"]'))) {
    return "TAB_SWITCH";
  }
  if (role === "option" || el.closest('[role="listbox"]')) return "DROPDOWN_SELECT";
  if (role === "menuitem" || cls.contains("dropdown-item")) return "MENU_SELECT";
  if (cls.contains("page-link")) return tag === "a" ? "LINK_CLICK" : "BUTTON_CLICK";
  if (
    (tag === "a" || cls.contains("nav-link") || /submenu/.test(classOf(el))) &&
    el.closest(".sidebar, aside, .topbar, .navbar")
  ) {
    return "MENU_SELECT";
  }
  if (el.type === "checkbox" || el.type === "radio" || ["switch", "checkbox", "radio"].includes(role)) {
    return "TOGGLE";
  }
  if (tag === "a" || role === "link") return "LINK_CLICK";
  if (tag === "button" || tag === "summary" || tag === "input" || role === "button" || cls.contains("btn")) {
    return "BUTTON_CLICK";
  }
  if (!semantic && looksLikeOption(el)) return "DROPDOWN_SELECT";
  return "CLICK";
}

// ── clicks / dropdowns / forms ──────────────────────────────────────────

function onClick(ev) {
  try {
    const start = ev.target instanceof Element ? ev.target : null;
    if (!start || start.closest("[data-activity-ignore]")) return;
    // A click on a <label> is re-dispatched by the browser on its control;
    // that second click is the one logged.
    const lbl = start.closest("label");
    if (lbl && lbl.control && lbl.control !== start && !lbl.control.contains(start)) return;

    const found = findTarget(start);
    if (!found) return;
    const { el, semantic } = found;
    const tag = el.tagName.toLowerCase();
    // Fields are not actions: selects are logged on change, typing never.
    if (tag === "select" || tag === "textarea" || tag === "option") return;
    if (tag === "input" && !CLICK_INPUT_TYPES.has(el.type)) return;

    const data = describe(el, semantic);
    if (!data) return;
    const key = `${tag}|${data.label}|${el.id || ""}`;
    const now = Date.now();
    if (lastClick.key === key && now - lastClick.at < 400) return; // double click
    lastClick = { key, at: now };
    beginInteraction(classify(el, tag, semantic), data, el);
  } catch (_) {
    /* ignore */
  }
}

function fieldLabel(el) {
  if (el.closest("[data-activity-mask]")) return "[MASKED]";
  let text =
    el.getAttribute("data-activity") ||
    el.getAttribute("aria-label") ||
    (el.labels && el.labels[0] && el.labels[0].innerText);
  if (!text) {
    const group = el.closest(".mb-3, .form-group, .col, [class*='col-'], td");
    const lbl = group && group.querySelector("label, .form-label");
    if (lbl) text = lbl.innerText;
  }
  return short(mask(text || el.getAttribute("name") || el.id || "<select>"), 80);
}

function isSensitiveField(el, label) {
  const hay = [el.getAttribute("name"), el.id, el.getAttribute("aria-label"), label]
    .filter(Boolean)
    .join(" ");
  return SENSITIVE_FIELD.test(hay);
}

/** Native <select>: the field and the chosen option's visible text (never for sensitive fields). */
function onChange(ev) {
  try {
    const el = ev.target;
    if (!el || el.tagName !== "SELECT" || el.closest("[data-activity-ignore]")) return;
    const data = {
      tag: "select",
      label: fieldLabel(el),
      elementId: short(el.id, 100),
      elementName: short(el.getAttribute("name"), 100),
      component: componentOf(el),
      area: areaOf(el),
    };
    if (el.multiple) {
      data.value = `${el.selectedOptions ? el.selectedOptions.length : 0} selected`;
    } else if (!el.closest("[data-activity-mask]") && !isSensitiveField(el, data.label)) {
      const opt = el.options[el.selectedIndex];
      if (opt) data.value = short(mask(opt.text), 80);
    }
    beginInteraction("DROPDOWN_SELECT", data, el);
  } catch (_) {
    /* ignore */
  }
}

function countFields(form) {
  try {
    return Array.from(form.elements || []).filter(
      (f) => (f.name || f.id) && !["button", "submit", "reset", "fieldset"].includes(f.type)
    ).length;
  } catch (_) {
    return undefined;
  }
}

function onSubmit(ev) {
  try {
    const form = ev.target;
    if (!form || form.tagName !== "FORM" || form.closest("[data-activity-ignore]")) return;
    const info = { name: formName(form), fields: countFields(form) };
    const submitter = ev.submitter instanceof Element ? ev.submitter : null;
    const now = Date.now();
    // The click on the submit button is already pending: it BECOMES the
    // submission instead of the same action being logged twice.
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const it = pending[i];
      if (
        !it.done &&
        now - it.at < 1000 &&
        it.el &&
        (it.el === submitter || (it.action === "BUTTON_CLICK" && form.contains(it.el)))
      ) {
        it.action = "FORM_SUBMIT";
        it.data.form = info;
        return;
      }
    }
    // Submitted with the Enter key (no click).
    const data = (submitter && describe(submitter, true)) || {
      tag: "form",
      component: componentOf(form),
      area: areaOf(form),
    };
    data.form = info;
    beginInteraction("FORM_SUBMIT", data, form);
  } catch (_) {
    /* ignore */
  }
}

// ── page views ──────────────────────────────────────────────────────────

function trackPageView() {
  try {
    const path = window.location.pathname;
    if (path === currentPath) return;
    const now = Date.now();
    const from = currentPath;
    currentPath = path;
    const durationMs = from ? now - pageSince : undefined;
    pageSince = now;
    push("NAVIGATE", { from: from || undefined, durationMs, title: short(document.title, 120) });
  } catch (_) {
    /* ignore */
  }
}

function hookHistory() {
  ["pushState", "replaceState"].forEach((name) => {
    const original = window.history[name];
    if (typeof original !== "function" || original.__activityWrapped) return;
    const wrapped = function wrappedHistoryMethod() {
      // eslint-disable-next-line prefer-rest-params
      const result = original.apply(this, arguments);
      setTimeout(trackPageView, 0);
      return result;
    };
    wrapped.__activityWrapped = true;
    window.history[name] = wrapped;
  });
  window.addEventListener("popstate", () => setTimeout(trackPageView, 0));
}

// ── errors ──────────────────────────────────────────────────────────────

function reportError(data) {
  if (errorsThisLoad >= MAX_ERRORS_PER_PAGE_LOAD) return;
  if (seenRecently(`err|${data.kind}|${data.message}|${data.source}`, 10000)) return;
  errorsThisLoad += 1;
  push("CLIENT_ERROR", data);
  setTimeout(() => flush(false), 1000);
}

function onError(ev) {
  try {
    const t = ev.target;
    if (t && t !== window && t.tagName) {
      // Resource failed to load (capture phase). Scripts / stylesheets matter
      // (a failed chunk = blank page); images are ignored — supplier hotel
      // photos fail to load all the time.
      const tag = t.tagName.toLowerCase();
      if (tag === "script" || tag === "link") {
        reportError({ kind: "resource", message: `Failed to load ${tag}`, source: stripQuery(t.src || t.href) });
      }
      return;
    }
    reportError({
      kind: "error",
      message: short(mask(ev.message), 500),
      source: stripQuery(ev.filename),
      line: ev.lineno || undefined,
      column: ev.colno || undefined,
      stack: ev.error && ev.error.stack ? String(ev.error.stack).slice(0, 4000) : undefined,
    });
  } catch (_) {
    /* ignore */
  }
}

function onUnhandledRejection(ev) {
  try {
    const r = ev.reason;
    // Only name / message / stack — an axios error object also carries the
    // request config (headers incl. Authorization, body), which must not leave.
    const message =
      r && typeof r === "object" ? r.message || r.name || "Unhandled rejection" : String(r);
    reportError({
      kind: r && r.isAxiosError ? "unhandled-api-rejection" : "unhandledrejection",
      message: short(mask(message), 500),
      stack: r && r.stack ? String(r.stack).slice(0, 4000) : undefined,
    });
  } catch (_) {
    /* ignore */
  }
}

// ── API calls (axios uses XMLHttpRequest) ───────────────────────────────

function apiPath(url) {
  try {
    const u = new URL(url, API_BASE || window.location.origin);
    const apiOrigin = API_BASE ? new URL(API_BASE, window.location.origin).origin : window.location.origin;
    if (u.origin !== apiOrigin && u.origin !== window.location.origin) return null; // third-party call
    return u.pathname;
  } catch (_) {
    return null;
  }
}

function recordApiError(method, url, status, reason, durationMs) {
  const path = apiPath(url);
  if (!path || path.startsWith("/api/activity-log/")) return;
  if (seenRecently(`api|${method}|${path}|${status}`, 3000)) return;
  push("API_ERROR", {
    method,
    url: path,
    status,
    reason: reason || (status === 0 ? "network" : undefined),
    durationMs,
  });
  // status 0 = the backend never saw it (offline, CORS, timeout, server down):
  // this event is the only trace, so send it promptly.
  if (status === 0) setTimeout(() => flush(false), 1000);
}

function onXhrLoadEnd(xhr) {
  try {
    const meta = xhr.__activity;
    if (!meta || !meta.start) return;
    const end = Date.now();
    const status = xhr.status;
    const it = meta.interaction;
    if (it) {
      if (meta.call) {
        meta.call.status = status;
        meta.call.ms = end - meta.start;
        meta.call.end = end;
        if (meta.reason === "abort") meta.call.cancelled = true;
      }
      it.open = Math.max(0, it.open - 1);
      it.lastDoneAt = end;
      setTimeout(() => settle(it), CHAIN_GRACE_MS);
    }
    if (meta.reason === "abort") return; // cancelled by the app itself
    if (status === 0 || status >= 400) {
      recordApiError(meta.method, meta.url, status, meta.reason, end - meta.start);
    }
  } catch (_) {
    /* ignore */
  }
}

function hookXhr() {
  const Xhr = window.XMLHttpRequest;
  const proto = Xhr && Xhr.prototype;
  if (!proto || proto.__activityWrapped) return;
  const open = proto.open;
  const send = proto.send;
  proto.open = function wrappedOpen(method, url) {
    try {
      this.__activity = { method: String(method || "GET").toUpperCase(), url: String(url) };
      if (!this.__activityListening) {
        // Registered here, before axios sets its own onloadend, so an
        // interaction learns that its call finished BEFORE the app's .then()
        // starts the next (chained) request.
        this.__activityListening = true;
        this.addEventListener("timeout", () => {
          if (this.__activity) this.__activity.reason = "timeout";
        });
        this.addEventListener("abort", () => {
          if (this.__activity) this.__activity.reason = "abort";
        });
        this.addEventListener("error", () => {
          if (this.__activity) this.__activity.reason = this.__activity.reason || "network";
        });
        this.addEventListener("loadend", () => onXhrLoadEnd(this));
      }
    } catch (_) {
      /* ignore */
    }
    // Forward the ORIGINAL argument list: passing an explicit undefined for
    // the optional "async" flag would turn the request synchronous.
    // eslint-disable-next-line prefer-rest-params
    return open.apply(this, arguments);
  };
  proto.send = function wrappedSend() {
    try {
      const meta = this.__activity;
      if (meta) {
        meta.start = Date.now();
        meta.reason = null;
        meta.interaction = null;
        meta.call = null;
        const path = apiPath(meta.url);
        const it = path && !path.startsWith("/api/activity-log/") ? correlate(meta.start) : null;
        if (it) {
          it.total += 1;
          it.open += 1;
          meta.interaction = it;
          if (it.calls.length < MAX_CALLS_TRACKED) {
            meta.call = { method: meta.method, path };
            it.calls.push(meta.call);
          }
        }
      }
    } catch (_) {
      /* ignore */
    }
    // eslint-disable-next-line prefer-rest-params
    return send.apply(this, arguments);
  };
  proto.__activityWrapped = true;
}

// ── public API ──────────────────────────────────────────────────────────

/** Starts the logger once. Safe to call more than once (hot reload). */
export function initActivityLogger() {
  if (!ENABLED || typeof window === "undefined" || started) return;
  if (window[GLOBAL_FLAG]) return;
  window[GLOBAL_FLAG] = true;
  started = true;
  const safe = (fn) => {
    try {
      fn();
    } catch (_) {
      /* a hook that cannot install is simply skipped */
    }
  };
  safe(hookHistory);
  safe(hookXhr);
  safe(() => document.addEventListener("click", onClick, true));
  safe(() => document.addEventListener("change", onChange, true));
  safe(() => document.addEventListener("submit", onSubmit, true));
  safe(() => window.addEventListener("error", onError, true));
  safe(() => window.addEventListener("unhandledrejection", onUnhandledRejection));
  safe(() =>
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush(true);
    })
  );
  safe(() =>
    window.addEventListener("pagehide", () => {
      // Closing / reloading: log interactions still waiting for their calls
      // (outcome PENDING) and send everything while the page can.
      finishAll();
      flush(true);
    })
  );
  safe(trackPageView);
  setInterval(() => flush(false), FLUSH_INTERVAL_MS);
}

/**
 * Explicit business event from a page, e.g.
 * logActivity("VOUCHER_DOWNLOAD", { bookingId }). Only primitive values are
 * kept; credential-looking keys are dropped. Written to interactions.log as
 * action CUSTOM with this name.
 */
export function logActivity(name, details) {
  try {
    const clean = {};
    Object.keys(details || {})
      .slice(0, 20)
      .forEach((k) => {
        const v = details[k];
        if (SENSITIVE_KEY.test(k)) return;
        if (typeof v === "number" || typeof v === "boolean") clean[k] = v;
        else if (typeof v === "string") clean[k] = short(mask(v), 200);
      });
    push("CUSTOM", { name: short(name, 60), details: clean });
  } catch (_) {
    /* ignore */
  }
}
