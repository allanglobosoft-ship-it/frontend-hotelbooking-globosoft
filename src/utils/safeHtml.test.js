import { escapeHtml, sanitizeRichHtml, sanitizeSupplierHtml } from "./safeHtml";

describe("escapeHtml", () => {
  test("shows markup literally", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });
  test("plain text and numbers are unchanged", () => {
    expect(escapeHtml("Globosoft Travels LLC")).toBe("Globosoft Travels LLC");
    expect(escapeHtml(1250)).toBe("1250");
    expect(escapeHtml(null)).toBe("");
  });
});

describe("sanitizeRichHtml (terms & conditions, activity details)", () => {
  test("keeps formatting", () => {
    const html = "<p><b>Check-in</b> from 2 PM<br><i>ID required</i></p><ul><li>No pets</li></ul>";
    expect(sanitizeRichHtml(html)).toBe(html);
  });
  test("removes scripts, handlers and javascript: links", () => {
    const out = sanitizeRichHtml(
      '<p onclick="steal()">Terms</p><script>steal()</script><img src="x" onerror="steal()"><a href="javascript:steal()">x</a>',
    );
    expect(out).not.toMatch(/script|onerror|onclick|javascript:/i);
    expect(out).toContain("Terms");
  });
  test("drops page-wide <style> and forms", () => {
    const out = sanitizeRichHtml('<style>body{display:none}</style><form action="https://evil"><input name="pw"></form>ok');
    expect(out).toBe("ok");
  });
  test("new-tab links get rel=noopener", () => {
    const out = sanitizeRichHtml('<a href="https://hotel.example" target="_blank">site</a>');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('href="https://hotel.example"');
  });
  test("cut-off text from a 220-character preview stays well-formed", () => {
    expect(sanitizeRichHtml("<b>Desert safari with BBQ din")).toBe("<b>Desert safari with BBQ din</b>");
  });
});

describe("sanitizeSupplierHtml (GRN description)", () => {
  test("keeps GRN's plain markup", () => {
    expect(sanitizeSupplierHtml("<p><b>Property Location</b> Near the beach.<br></p>")).toBe(
      "<p><b>Property Location</b> Near the beach.<br></p>",
    );
  });
  test("blocks what the old regex let through", () => {
    // The old regex only matched `<script>...</script>` and ` on...=` after a
    // space; these slipped past it.
    const out = sanitizeSupplierHtml(
      '<svg/onload=alert(1)><a href="javascript:alert(1)">x</a><img/src=x/onerror=alert(1)><iframe src="https://evil"></iframe>',
    );
    expect(out).not.toMatch(/onload|onerror|javascript:|<svg|<img|<iframe|href/i);
  });
  test("no attributes survive", () => {
    expect(sanitizeSupplierHtml('<p style="position:fixed" class="x">Hi</p>')).toBe("<p>Hi</p>");
  });
});
