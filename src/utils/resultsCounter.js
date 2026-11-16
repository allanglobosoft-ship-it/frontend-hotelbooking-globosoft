/**
 * The "Showing … entries" line above the hotel search results.
 *
 * The server pages the results; the page then drops the hotels its own
 * filters rule out (24-hour eligibility, hotel name, hotel type, deals), so
 * what is on screen can be fewer than the server sent.
 *
 *   pageIndex     — the page on screen, from 0
 *   pageSize      — hotels per server page
 *   shown         — hotels on screen, after the page's own filters
 *   pageRows      — hotels the server sent for this page
 *   totalElements — hotels the server has for this search and its filters
 *   totalPages    — the server's page count
 *
 * Three cases:
 *   - Nothing dropped: the server's numbers, "Showing 41 to 50 of 300 entries".
 *   - Every hotel is on hand (a small search, or a name or deal filter that
 *     loads the whole set on page 1): what is on screen,
 *     "Showing 1 to 4 of 4 entries".
 *   - Otherwise only this page's count is known, so it says just that:
 *     "Showing 3 of the 10 entries on page 5 of 30". Other pages may have
 *     more, or none.
 */
export function resultsCounterText({
  pageIndex = 0,
  pageSize = 10,
  shown = 0,
  pageRows = 0,
  totalElements = 0,
  totalPages = 1,
} = {}) {
  const offset = pageIndex * pageSize;
  const wholeSet = pageIndex === 0 && pageRows >= totalElements;

  if (shown < pageRows && !wholeSet) {
    const pages = Math.max(1, totalPages, pageIndex + 1);
    return `Showing ${shown} of the ${pageRows} entries on page ${pageIndex + 1} of ${pages}`;
  }
  if (shown === 0) {
    return `Showing 0 to 0 of ${wholeSet ? 0 : totalElements} entries`;
  }
  const total = wholeSet ? shown : Math.max(totalElements, offset + shown);
  return `Showing ${offset + 1} to ${offset + shown} of ${total} entries`;
}
