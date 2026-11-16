import { resultsCounterText } from "./resultsCounter";

/** A paged search of 300 hotels, 10 a page. */
const paged = (pageIndex, shown, pageRows = 10) =>
  resultsCounterText({
    pageIndex,
    pageSize: 10,
    shown,
    pageRows,
    totalElements: 300,
    totalPages: 30,
  });

describe("resultsCounterText", () => {
  it("gives the server's numbers when the page drops nothing", () => {
    expect(paged(0, 10)).toBe("Showing 1 to 10 of 300 entries");
    expect(paged(4, 10)).toBe("Showing 41 to 50 of 300 entries");
    expect(paged(29, 7, 7)).toBe("Showing 291 to 297 of 300 entries");
  });

  it("counts only this page when its own filters drop hotels", () => {
    // 24 Hour Check-In: 3 of page 5's hotels are eligible.
    expect(paged(4, 3)).toBe("Showing 3 of the 10 entries on page 5 of 30");
    expect(paged(0, 2)).toBe("Showing 2 of the 10 entries on page 1 of 30");
    expect(paged(29, 1, 7)).toBe("Showing 1 of the 7 entries on page 30 of 30");
  });

  it("says a filtered page is empty without inventing a range", () => {
    // Was "Showing 0 to 10 of 10 entries".
    expect(paged(1, 0)).toBe("Showing 0 of the 10 entries on page 2 of 30");
  });

  it("shows what is on screen when every hotel is on hand", () => {
    // A name or deal filter loads the whole set on page 1.
    const whole = (shown) =>
      resultsCounterText({
        pageIndex: 0,
        pageSize: 10,
        shown,
        pageRows: 300,
        totalElements: 300,
        totalPages: 1,
      });
    expect(whole(4)).toBe("Showing 1 to 4 of 4 entries");
    expect(whole(300)).toBe("Showing 1 to 300 of 300 entries");
    expect(whole(0)).toBe("Showing 0 to 0 of 0 entries");

    // A search with fewer hotels than a page.
    const small = { pageIndex: 0, pageSize: 10, pageRows: 7, totalElements: 7, totalPages: 1 };
    expect(resultsCounterText({ ...small, shown: 7 })).toBe("Showing 1 to 7 of 7 entries");
    expect(resultsCounterText({ ...small, shown: 3 })).toBe("Showing 1 to 3 of 3 entries");
  });

  it("reads 0 of 0 before any hotel has arrived", () => {
    expect(resultsCounterText({ pageIndex: 0, pageSize: 10 })).toBe(
      "Showing 0 to 0 of 0 entries",
    );
    expect(resultsCounterText()).toBe("Showing 0 to 0 of 0 entries");
  });

  it("does not take a later page for the whole set", () => {
    // A reply without a total: the page's own rows stand in for it.
    expect(
      resultsCounterText({
        pageIndex: 1,
        pageSize: 10,
        shown: 10,
        pageRows: 10,
        totalElements: 10,
        totalPages: 1,
      }),
    ).toBe("Showing 11 to 20 of 20 entries");
    // An empty page past the end.
    expect(paged(2, 0, 0)).toBe("Showing 0 to 0 of 300 entries");
  });
});
