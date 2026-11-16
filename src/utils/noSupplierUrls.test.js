import fs from "fs";
import path from "path";

/** The pages agents reach that once called a supplier-named URL. */
const AGENT_PAGES = [
  "pages/ExternalApiRoomList.jsx",
  "pages/RoomList.jsx",
  "pages/roomlist/makeyourownpkg/AccomodationRoomList.jsx",
  "pages/booking/ApiBookingPageForHotels.jsx",
  "utils/lastMinuteApiHotels.js",
];

const SUPPLIER_URL =
  /["'`]\/?api\/[^"'`]*(atharva|grn|darina|ratehawk|goglobal|iwtx|x3|iway|jumeirah|juniper)[^"'`]*["'`]/i;

const source = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

describe("URLs the browser's network tab shows an agent", () => {
  it.each(AGENT_PAGES)("%s calls no supplier-named URL", (file) => {
    expect(source(file)).not.toMatch(SUPPLIER_URL);
  });

  it("Last Minute asks by page name, not by supplier", () => {
    const code = source("utils/lastMinuteApiHotels.js");
    expect(code).toContain('forPage: "last-minute"');
    expect(code).not.toContain("excludeApiTypes:");
  });
});
