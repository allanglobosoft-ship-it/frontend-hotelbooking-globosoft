import { hidesTransporter, isAgentLogin, supplierText, withoutSupplierName } from "./supplierDisplay";

/** Sets up the login the way the login and role-picker pages store it. */
function login({ roles = "", active = "" }) {
  sessionStorage.clear();
  if (roles) sessionStorage.setItem("userRole", roles);
  if (active) sessionStorage.setItem("currentActiveRole", active);
}

afterEach(() => sessionStorage.clear());

describe("isAgentLogin", () => {
  it.each([
    ["a main agent", { roles: "AGENT" }],
    ["a sub-account before it picks a role", { roles: "SUB_USER,AGENT" }],
    ["a sub-user that picked its own role", { roles: "SUB_USER,AGENT", active: "SUB_USER" }],
    ["a sub-agent that picked its own role", { roles: "SUB_AGENT,AGENT", active: "SUB_AGENT" }],
    ["a sub-account that picked AGENT", { roles: "SUB_USER,AGENT", active: "AGENT" }],
    ["a login holding the sub-user role alone", { roles: "SUB_USER" }],
    ["a role stored in lower case", { roles: "SUB_USER,AGENT", active: "agent" }],
    ["an admin who chose to work as an agent", { roles: "ADMIN,AGENT", active: "AGENT" }],
  ])("hides supplier names from %s", (_who, session) => {
    login(session);
    expect(isAgentLogin()).toBe(true);
  });

  it.each([
    ["an admin", { roles: "ADMIN" }],
    ["a super admin", { roles: "SUPER_ADMIN" }],
    ["staff", { roles: "STAFF" }],
    ["an admin who also holds AGENT and has not picked", { roles: "ADMIN,AGENT" }],
    ["an admin who also holds AGENT and picked ADMIN", { roles: "ADMIN,AGENT", active: "ADMIN" }],
    ["nobody logged in", {}],
  ])("does not treat %s as an agent", (_who, session) => {
    login(session);
    expect(isAgentLogin()).toBe(false);
  });
});

describe("hidesTransporter", () => {
  it.each([
    ["a main agent", { roles: "AGENT" }],
    ["a sub-agent", { roles: "SUB_AGENT,AGENT", active: "SUB_AGENT" }],
    ["a sub-user", { roles: "SUB_USER,AGENT", active: "SUB_USER" }],
  ])("hides an outside transfer's transporter from %s but keeps an in-house one", (_who, session) => {
    login(session);
    expect(hidesTransporter({ external: true })).toBe(true);
    expect(hidesTransporter({ external: false })).toBe(false);
    expect(hidesTransporter(null)).toBe(false);
  });

  it.each([
    ["an admin", { roles: "ADMIN" }],
    ["a super admin", { roles: "SUPER_ADMIN" }],
  ])("keeps it for %s", (_who, session) => {
    login(session);
    expect(hidesTransporter({ external: true })).toBe(false);
  });
});

describe("supplierText", () => {
  it.each([
    ["a main agent", { roles: "AGENT" }],
    ["a sub-agent", { roles: "SUB_AGENT,AGENT", active: "SUB_AGENT" }],
    ["a sub-user", { roles: "SUB_USER,AGENT", active: "SUB_USER" }],
  ])("gives %s the agent wording", (_who, session) => {
    login(session);
    expect(supplierText("for i'way bookings", "for this booking")).toBe("for this booking");
  });

  it.each([
    ["an admin", { roles: "ADMIN" }],
    ["a super admin", { roles: "SUPER_ADMIN" }],
    ["staff", { roles: "STAFF" }],
  ])("gives %s the staff wording", (_who, session) => {
    login(session);
    expect(supplierText("for i'way bookings", "for this booking")).toBe("for i'way bookings");
  });
});

describe("withoutSupplierName", () => {
  const MESSAGES = [
    "Darina live-rate check failed. Please retry or reselect the rate.",
    "ATHARVA prebook: search response is missing tokenId",
    "Rate confirmed by GoGlobal — no price change since search.",
    "Updated by GRN since your search — accepted.",
    "Live rate (RateHawk)",
    "Valuated rate (Go Global)",
    "IWTX API returned an error response",
    "X3 API returned an error response",
    "i'way requires international format",
    "Could not reach api.grnconnect.com",
  ];
  const ANY_NAME = /atharva|darina|go\s?global|grn|iwtx|i'?way|rate\s?hawk|x3/i;

  it.each(MESSAGES)("hides the name from an agent: %s", (message) => {
    login({ roles: "AGENT" });
    const shown = withoutSupplierName(message);
    expect(shown).not.toMatch(ANY_NAME);
    expect(shown).toContain("Supplier");
  });

  it("hides the name from a sub-user that picked its own role", () => {
    login({ roles: "SUB_USER,AGENT", active: "SUB_USER" });
    expect(withoutSupplierName("Live rate (Darina)")).toBe("Live rate (Supplier)");
  });

  it.each(MESSAGES)("leaves it for an admin: %s", (message) => {
    login({ roles: "ADMIN" });
    expect(withoutSupplierName(message)).toBe(message);
  });

  it("leaves other text and non-text alone", () => {
    login({ roles: "AGENT" });
    expect(withoutSupplierName("Unable to proceed with booking.")).toBe("Unable to proceed with booking.");
    expect(withoutSupplierName(null)).toBeNull();
    expect(withoutSupplierName(undefined)).toBeUndefined();
  });
});
