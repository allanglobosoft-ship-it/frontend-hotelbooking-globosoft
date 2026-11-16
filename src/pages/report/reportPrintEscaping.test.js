/* global globalThis */
/* eslint-disable testing-library/no-unnecessary-act -- act() wraps state flushes on purpose in these tests */
// S:SEC-10: the report "Print" buttons build the print window's HTML from
// stored text (guest, agent, hotel names...). Every stored value must be
// escaped, so a guest name like <img src=x onerror=...> prints as text
// instead of running script in the staff user's logged-in session.
import React from "react";
import fs from "fs";
import path from "path";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import axiosInstance from "../../components/AxiosInstance";
import OnlineDailySalesReport from "./OnlineDailySalesReport";
import BookingReport from "./BookingReport";

jest.mock("../../components/AxiosInstance", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../../components/Sidebar", () => () => null);
jest.mock("../../components/TopBar", () => () => null);
jest.mock("../../components/BackButton", () => () => null);
jest.mock("../../components/filters/Agent", () => () => null);
jest.mock("../../components/filters/Staff", () => () => null);
jest.mock("../../components/filters/Supplier", () => () => null);
jest.mock("../../components/filters/DestinationCity", () => () => null);
// PDF export is not under test (and jsPDF needs TextEncoder, which jsdom lacks).
jest.mock("jspdf", () => jest.fn());
jest.mock("jspdf-autotable", () => jest.fn());

const SCRIPT_NAME = "<img src=x onerror=alert(document.domain)>"; // synthetic payload
const BOLD_NAME = "<b>x</b>";

// Renders a report page whose list API returns `rows`, clicks Print and
// returns the HTML written into the print window.
async function printReport(Page, rows) {
  axiosInstance.get.mockImplementation((url) =>
    Promise.resolve({ data: url.includes("branches") ? [] : rows }),
  );
  const written = [];
  const openSpy = jest.spyOn(window, "open").mockImplementation(() => ({
    document: { write: (html) => written.push(html), close: () => {} },
    print: () => {},
  }));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<Page />);
    });
    const printButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent.trim() === "Print",
    );
    expect(printButton).toBeDefined();
    act(() => printButton.click());
    expect(written).toHaveLength(1);
    return written[0];
  } finally {
    act(() => root.unmount());
    container.remove();
    openSpy.mockRestore();
  }
}

const cellTexts = (html) =>
  Array.from(new DOMParser().parseFromString(html, "text/html").querySelectorAll("td")).map(
    (td) => td.textContent,
  );

describe("S:SEC-10 report print windows escape stored text", () => {
  beforeAll(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
  });
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("Online Daily Sales: a script-carrying guest name prints as text", async () => {
    const html = await printReport(OnlineDailySalesReport, [
      {
        agentName: BOLD_NAME,
        supplierName: "Inhouse",
        customerName: SCRIPT_NAME,
        bookingCode: "BK-1001",
        bookingDoneBy: "agent8",
        bookingDate: "2026-10-28T10:00:00",
        nativeCountry: "AE",
        sellingPrice: "1250.00",
        netPrice: "1000.00",
        profit: "250.00",
      },
    ]);

    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(document.domain)&gt;");
    expect(html).not.toContain(SCRIPT_NAME);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("td img, td b")).toBeNull();
    expect(cellTexts(html)).toEqual(
      expect.arrayContaining([BOLD_NAME, SCRIPT_NAME, "BK-1001", "1250.00"]),
    );
  });

  test("Booking Report: guest and agent names print literally", async () => {
    const html = await printReport(BookingReport, [
      {
        bookingCode: "BK-1002",
        bookingDate: "2026-10-28T09:00:00",
        customerName: SCRIPT_NAME,
        bookingDoneBy: BOLD_NAME,
        sellingPrice: 1250,
        netPrice: 1000,
        profit: 250,
        nativeCountry: "AE",
      },
    ]);

    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain(SCRIPT_NAME);
    expect(new DOMParser().parseFromString(html, "text/html").querySelector("td img, td b")).toBeNull();
    expect(cellTexts(html)).toEqual(
      expect.arrayContaining(["BK-1002", SCRIPT_NAME, BOLD_NAME, "1250", "250"]),
    );
  });
});

// Source guard for every report page that writes a print window: inside
// handlePrint, each ${...} must be escapeHtml(...), the row counter, a
// .map(...) row builder (whose own ${...} are checked the same way) or a
// flag choosing fixed markup (e.g. showCost ? '<th>Net Price</th>' : '').
describe("S:SEC-10 print templates have no unescaped interpolation", () => {
  const dir = __dirname;
  const printPages = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsx"))
    .filter((f) => fs.readFileSync(path.join(dir, f), "utf8").includes("document.write"));

  const ALLOWED = [
    /^escapeHtml\(/,
    /^(index|i)\s*\+\s*1\s*\}/,
    /^[\w.?]+(\([^()]*\))?\s*\.map\(/,
    /^\w+\s*\?\s*['"`]/,
  ];

  test("all 17 print pages are covered", () => {
    expect(printPages.length).toBeGreaterThanOrEqual(17);
  });

  test.each(printPages)("%s", (file) => {
    const src = fs.readFileSync(path.join(dir, file), "utf8");
    const start = src.indexOf("const handlePrint");
    const end = src.indexOf(".print();", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    // The only document.write is the one inside handlePrint.
    expect(src.split("document.write").length - 1).toBe(1);
    expect(src.indexOf("document.write")).toBeGreaterThan(start);
    expect(src.indexOf("document.write")).toBeLessThan(end);

    const region = src.slice(start, end);
    const unescaped = [];
    const re = /\$\{/g;
    let m;
    while ((m = re.exec(region))) {
      const expr = region.slice(m.index + 2).replace(/^\s+/, "");
      if (!ALLOWED.some((rule) => rule.test(expr))) {
        const line = src.slice(0, start + m.index).split("\n").length;
        unescaped.push(`${file}:${line} \${${expr.split(/\r?\n/)[0].slice(0, 60)}`);
      }
    }
    expect(unescaped).toEqual([]);
  });
});
