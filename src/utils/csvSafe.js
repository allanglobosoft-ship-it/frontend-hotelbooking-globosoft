// Shared CSV cell helpers for client-side exports.
//
// A spreadsheet opens a cell that starts with = + - @ (or a tab / carriage
// return) as a formula, so text typed by agents, guests or suppliers could
// run as a formula on an admin's machine. Such text gets a leading
// apostrophe, which spreadsheets show as plain text. Plain numbers ("-5.00",
// 12) are left alone so totals still add up.

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** The value as text, with a leading apostrophe if a spreadsheet would read it as a formula. */
export function neutralizeCsvValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  const text = String(value);
  if (FORMULA_START.test(text) && !PLAIN_NUMBER.test(text.trim())) {
    return "'" + text;
  }
  return text;
}

/** One CSV cell: neutralised, and quoted only when it holds a comma, quote or line break. */
export function csvCell(value) {
  const text = neutralizeCsvValue(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** One CSV cell, always quoted (for exports that quote every cell). */
export function csvCellQuoted(value) {
  return `"${neutralizeCsvValue(value).replace(/"/g, '""')}"`;
}
