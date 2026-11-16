import { csvCell, csvCellQuoted, neutralizeCsvValue } from "./csvSafe";

describe("csvSafe", () => {
  test("text that a spreadsheet would run as a formula gets an apostrophe", () => {
    expect(neutralizeCsvValue("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(neutralizeCsvValue("+1")).toBe("'+1");
    expect(neutralizeCsvValue("@cmd")).toBe("'@cmd");
    expect(neutralizeCsvValue("-x")).toBe("'-x");
    expect(neutralizeCsvValue("\tvalue")).toBe("'\tvalue");
  });

  test("plain numbers and ordinary text are unchanged", () => {
    expect(neutralizeCsvValue(-5)).toBe("-5");
    expect(neutralizeCsvValue("-5.00")).toBe("-5.00");
    expect(neutralizeCsvValue("Hotel Name")).toBe("Hotel Name");
    expect(neutralizeCsvValue(null)).toBe("");
    expect(neutralizeCsvValue(undefined)).toBe("");
  });

  test("csvCell quotes only when needed", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("=1,2")).toBe('"\'=1,2"');
  });

  test("csvCellQuoted always quotes", () => {
    expect(csvCellQuoted("plain")).toBe('"plain"');
    expect(csvCellQuoted("=1")).toBe('"\'=1"');
  });
});
