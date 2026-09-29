// Hands a "Find your booking" search from the search page to the results tab
// it opens. The search travels through localStorage under a random id; only
// the id rides in the new tab's address (#hash), so a booking code and the
// guest's last name never reach browser history or server logs. The results
// tab takes the search out straight away and keeps its own copy in
// sessionStorage, so reloading that tab shows the same results.

const HANDOFF_PREFIX = "fbk-search:";
const TAB_KEY = "fbk-search";
// A handoff no tab picked up (the tab was blocked, or closed at once) is
// dropped after this long.
const HANDOFF_TTL_MS = 60 * 1000;

// crypto.randomUUID needs https; getRandomValues works on plain http too.
function newId() {
  const bytes = window.crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function dropStaleHandoffs(now) {
  Object.keys(localStorage)
    .filter((key) => key.startsWith(HANDOFF_PREFIX))
    .forEach((key) => {
      let savedAt = 0;
      try {
        savedAt = JSON.parse(localStorage.getItem(key))?.savedAt || 0;
      } catch {
        // unreadable: dropped below
      }
      if (now - savedAt >= HANDOFF_TTL_MS) localStorage.removeItem(key);
    });
}

/**
 * Opens the results tab for `search` — { type: "code", bookingCode, lastName }
 * or { type: "date", date, dateType }. Call it straight from the submit
 * handler, or the browser treats the tab as an unwanted pop-up. False when
 * the browser blocked the tab anyway.
 */
export function openResultsTab(search) {
  const id = newId();
  const key = HANDOFF_PREFIX + id;
  try {
    const now = Date.now();
    dropStaleHandoffs(now);
    localStorage.setItem(key, JSON.stringify({ search, savedAt: now }));
  } catch {
    // Storage blocked: the results tab will say the search is gone.
  }
  const tab = window.open(`${process.env.PUBLIC_URL}/find-booking/results#${id}`, "_blank");
  if (tab) return true;
  try {
    localStorage.removeItem(key);
  } catch {
    // nothing to clean up
  }
  return false;
}

/** The search this results tab was opened for, or null when it's gone. */
export function takeHandedOffSearch() {
  const id = window.location.hash.slice(1);
  if (!id) return null;
  try {
    const handedOff = localStorage.getItem(HANDOFF_PREFIX + id);
    if (handedOff) {
      localStorage.removeItem(HANDOFF_PREFIX + id);
      const { search } = JSON.parse(handedOff);
      sessionStorage.setItem(TAB_KEY, JSON.stringify({ id, search }));
      return search || null;
    }
    // Already taken: this tab was reloaded.
    const kept = JSON.parse(sessionStorage.getItem(TAB_KEY) || "null");
    return kept && kept.id === id ? kept.search : null;
  } catch {
    return null;
  }
}
