/* eslint-disable no-script-url -- the javascript: strings are the attack inputs under test */
import { isAbsoluteHttpUrl, orderIdPathSegment, safeHttpUrl } from "./urlSafety";

describe("safeHttpUrl (advertisement links)", () => {
  test("web links pass through unchanged", () => {
    expect(safeHttpUrl("https://hotel.example/offer?x=1")).toBe("https://hotel.example/offer?x=1");
    expect(safeHttpUrl("http://hotel.example")).toBe("http://hotel.example");
    expect(safeHttpUrl("  https://hotel.example  ")).toBe("https://hotel.example");
  });
  test("script and data links are refused", () => {
    expect(safeHttpUrl("javascript:alert(document.cookie)")).toBeNull();
    expect(safeHttpUrl(" JavaScript:alert(1)")).toBeNull();
    expect(safeHttpUrl("java\tscript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHttpUrl("vbscript:msgbox(1)")).toBeNull();
  });
  test("empty values give null", () => {
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});

describe("isAbsoluteHttpUrl (advertisement form)", () => {
  test("accepts http/https only", () => {
    expect(isAbsoluteHttpUrl("https://hotel.example")).toBe(true);
    expect(isAbsoluteHttpUrl("www.hotel.example")).toBe(false);
    expect(isAbsoluteHttpUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("orderIdPathSegment (CC Avenue order id from the URL)", () => {
  test("real order ids pass", () => {
    expect(orderIdPathSegment("HBP1761543210000-42")).toBe("HBP1761543210000-42");
    expect(orderIdPathSegment("HBP1761543210000")).toBe("HBP1761543210000");
  });
  test("path tricks are refused before any request is made", () => {
    ["../../agent/5/status", "..", "HBP1/../x", "HBP1?x=1", "HBP1#x", "HBP 1", "", null].forEach((bad) => {
      expect(() => orderIdPathSegment(bad)).toThrow("Invalid payment reference.");
    });
  });
});
