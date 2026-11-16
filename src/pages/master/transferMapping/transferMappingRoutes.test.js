import fs from "fs";
import path from "path";

/**
 * The Transfer Location Mapping screens name the supplier and can re-route every
 * transfer search, so only admins may open them (the API is @AdminOnly too).
 * The sidebar already hides them from other logins; this pins the routes, which
 * an agent could otherwise reach by typing the URL.
 */
const app = fs.readFileSync(path.join(__dirname, "..", "..", "..", "App.jsx"), "utf8");

const PATHS = [
  "/masters/transfer-airport-mapping",
  "/masters/transfer-place-mapping",
  "/masters/transfer-hotel-mapping",
];

describe("Transfer Location Mapping routes", () => {
  it.each(PATHS)("%s is limited to admins", (routePath) => {
    const line = app.split(/\r?\n/).find((l) => l.includes(`path="${routePath}"`));
    expect(line).toBeDefined();
    expect(line).toContain('<PrivateRoute roles={["admin"]}>');
  });
});
