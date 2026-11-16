import {
  apiIdOfResult,
  incompleteSearchNotice,
  mapHotelRow,
  pollUntilFinished,
  progressMessage,
  progressPercent,
  readProgress,
  roomListApiId,
  roomListHandoff,
} from "./hotelSearchResults";

const SUPPLIER_NAMES =
  /grn|iwtx|x3|atharva|ratehawk|jumeirah|darina|goglobal|juniper/i;

/** A reply as the server sends it, with only what a test cares about. */
function reply({
  total = 3,
  answered = 0,
  failed = 0,
  partial = 0,
  final = "IN_PROGRESS",
  status = {},
  partialSuppliers,
  result = [],
} = {}) {
  return {
    finalStatus: final,
    progress: { total, answered, failed, partial, complete: final === "COMPLETED" },
    status,
    partialSuppliers,
    result,
  };
}

describe("apiIdOfResult (student, senior citizen and gov employee results)", () => {
  it.each([1, 3, 10, 12, 14, 15, 16, 20, 21])(
    "opens supplier %i from an agent's card, which has no apiType",
    (apiId) => {
      expect(apiIdOfResult({ hotelCode: "H1", apiId })).toBe(apiId);
    },
  );

  it("prefers the card's number over its supplier name", () => {
    expect(apiIdOfResult({ apiType: "iwtx", apiId: 12 })).toBe(12);
  });

  it("reads a reply from an older backend by supplier name, GRN and GoGlobal included", () => {
    expect(apiIdOfResult({ apiType: "ATHARVA" })).toBe(3);
    expect(apiIdOfResult({ apiType: "grn" })).toBe(20);
    expect(apiIdOfResult({ apiType: "goglobal" })).toBe(21);
  });

  it("falls back to in-house when a reply has neither", () => {
    expect(apiIdOfResult({})).toBe(1);
    expect(apiIdOfResult({ apiType: "unknown" })).toBe(1);
  });
});

describe("roomListHandoff (what View Rooms stores for the room list)", () => {
  const payload = { hotelCode: "IN5", apiId: 1 };
  const meta = { hotelName: "Palm Hotel" };
  const currency = { code: "AED", factor: 1 };

  it.each(["refundable", "partial", "nonRefundable"])(
    "carries the ticked Refund Policy box (%s)",
    (refundPolicy) => {
      const stored = JSON.parse(
        JSON.stringify(roomListHandoff({ payload, meta, currency, refundPolicy })),
      );
      expect(stored).toEqual({ payload, meta, currency, refundPolicy });
    },
  );

  it("stores exactly what it stored before when no box is ticked", () => {
    expect(
      JSON.stringify(roomListHandoff({ payload, meta, currency, refundPolicy: undefined })),
    ).toBe(JSON.stringify({ payload, meta, currency }));
  });
});

describe("mapHotelRow", () => {
  const cheapestFromIwtx = { cardKey: "M5", hotelCode: "IW1", apiType: "iwtx", apiId: 12, baseRate: 500 };
  const cheapestFromAtharva = { cardKey: "M5", hotelCode: "AT1", apiType: "atharva", apiId: 3, baseRate: 450 };

  it("keeps a mapped hotel's card id when another supplier becomes the cheapest", () => {
    const before = mapHotelRow(cheapestFromIwtx, "s1", 0, {});
    const after = mapHotelRow(cheapestFromAtharva, "s1", 0, {});

    expect(after.id).toBe(before.id);
    // The price and the route to its room list move to the new supplier.
    expect(after.price).toBe(450);
    expect(after.hotelCode).toBe("AT1");
    expect(roomListApiId(after)).toBe(3);
  });

  it("gives an agent's card no supplier name, and still opens its room list", () => {
    const card = mapHotelRow({ cardKey: "U1", hotelCode: "G1", apiId: 20, baseRate: 100 }, "s1", 0, {});

    expect(card.channelType).toBe("");
    expect(JSON.stringify(card)).not.toMatch(SUPPLIER_NAMES);
    expect(roomListApiId(card)).toBe(20);
  });

  it("still works with a reply that has no cardKey or apiId", () => {
    const card = mapHotelRow({ hotelCode: "G1", apiType: "GRN", baseRate: 100 }, "s1", 0, {});

    expect(card.id).toBe("s1-G1");
    expect(card.channelType).toBe("grn");
    expect(roomListApiId(card)).toBe(20);
  });

  it("treats a row with no supplier at all as in-house, as before", () => {
    const card = mapHotelRow({ hotelCode: "IN5", baseRate: 100 }, "s1", 0, {});

    expect(card.channelType).toBe("inhouse");
    expect(roomListApiId(card)).toBe(1);
  });

  it("carries the display currency factor from the reply", () => {
    const card = mapHotelRow(
      { hotelCode: "G1", baseRate: 100, displayBaseRate: 27.2, displayCurrencyCode: "USD" },
      "s1",
      0,
      { displayCurrencyFactor: 0.272 },
    );

    expect(card.displayPrice).toBe(27.2);
    expect(card.displayCurrencyCode).toBe("USD");
    expect(card.displayFactor).toBe(0.272);
  });
});

describe("progress", () => {
  it("is counted from the reply and reaches 100 only when the search is complete", () => {
    expect(progressPercent(readProgress(reply({ total: 4, answered: 1 })))).toBe(25);
    expect(progressPercent(readProgress(reply({ total: 4, answered: 2, failed: 1 })))).toBe(75);
    expect(progressPercent(readProgress(reply({ total: 3, answered: 3 })))).toBe(99);
    expect(progressPercent(readProgress(reply({ total: 3, answered: 3, final: "COMPLETED" })))).toBe(100);
  });

  it("says how many suppliers have answered and how many hotels are in", () => {
    expect(progressMessage(readProgress(reply({ total: 7, answered: 3 })), 124)).toBe(
      "3 of 7 suppliers answered · 124 hotels so far",
    );
    expect(progressMessage(readProgress(reply({ total: 7, answered: 0 })), 0)).toBe(
      "0 of 7 suppliers answered",
    );
    expect(progressMessage(readProgress(reply({ total: 1, answered: 1 })), 1)).toBe(
      "1 of 1 supplier answered · 1 hotel so far",
    );
    expect(progressMessage(null, 0)).toBe("Asking suppliers");
  });

  it("names failed suppliers for an admin", () => {
    const progress = readProgress(
      reply({
        total: 3,
        answered: 1,
        failed: 2,
        final: "COMPLETED",
        status: { grn: "TIMEOUT", iwtx: "ERROR", x3: "COMPLETED" },
      }),
    );

    expect(incompleteSearchNotice(progress)).toBe(
      "Did not answer: GRN (timed out), IWTX (failed). Showing all the hotels found.",
    );
  });

  it("never names a supplier to an agent, even when one fails", () => {
    const agentReply = reply({
      total: 3,
      answered: 1,
      failed: 2,
      final: "COMPLETED",
      status: { "supplier-1": "TIMEOUT", "supplier-2": "ERROR", "supplier-3": "COMPLETED" },
    });
    const progress = readProgress(agentReply);

    expect(progress.suppliers).toEqual([]);
    const notice = incompleteSearchNotice(progress);
    expect(notice).toBe("2 suppliers did not answer. Showing all the hotels found.");
    expect(notice).not.toMatch(SUPPLIER_NAMES);
    expect(notice).not.toMatch(/supplier-\d/);
    expect(progressMessage(progress, 5)).not.toMatch(SUPPLIER_NAMES);
  });

  it("has nothing to say while searching, or when every supplier answered", () => {
    expect(incompleteSearchNotice(readProgress(reply({ answered: 1, failed: 1 })))).toBeNull();
    expect(incompleteSearchNotice(readProgress(reply({ answered: 3, final: "COMPLETED" })))).toBeNull();
    expect(incompleteSearchNotice(null)).toBeNull();
  });

  it("names a supplier that answered in part for an admin", () => {
    const progress = readProgress(
      reply({
        total: 3,
        answered: 3,
        partial: 1,
        final: "COMPLETED",
        status: { grn: "COMPLETED", atharva: "COMPLETED", x3: "COMPLETED" },
        partialSuppliers: { atharva: "batch 2/5: HTTP 500 (after a second try)" },
      }),
    );

    expect(progress.partial).toBe(1);
    expect(progress.partialSuppliers).toEqual([
      { name: "atharva", reason: "batch 2/5: HTTP 500 (after a second try)" },
    ]);
    expect(incompleteSearchNotice(progress)).toBe(
      "Answered in part, some of their hotels may be missing: ATHARVA. Showing all the hotels found.",
    );
  });

  it("says both who did not answer and who answered in part", () => {
    const progress = readProgress(
      reply({
        total: 3,
        answered: 2,
        failed: 1,
        partial: 1,
        final: "COMPLETED",
        status: { grn: "TIMEOUT", atharva: "COMPLETED", x3: "COMPLETED" },
        partialSuppliers: { atharva: "batch 2/5: HTTP 500" },
      }),
    );

    expect(incompleteSearchNotice(progress)).toBe(
      "Did not answer: GRN (timed out). Answered in part, some of their hotels may be missing: ATHARVA."
        + " Showing all the hotels found.",
    );
  });

  it("counts partial answers for an agent without naming anyone", () => {
    const notice = incompleteSearchNotice(
      readProgress(
        reply({
          total: 2,
          answered: 2,
          partial: 2,
          final: "COMPLETED",
          status: { "supplier-1": "COMPLETED", "supplier-2": "COMPLETED" },
        }),
      ),
    );

    expect(notice).toBe(
      "2 suppliers answered in part, so some hotels may be missing. Showing all the hotels found.",
    );
    expect(notice).not.toMatch(SUPPLIER_NAMES);
  });

  it("says nothing about a partial answer before the search has finished", () => {
    expect(
      incompleteSearchNotice(readProgress(reply({ total: 3, answered: 1, partial: 1 }))),
    ).toBeNull();
  });
});

describe("pollUntilFinished", () => {
  const noWait = () => Promise.resolve();
  let warn;
  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  function repliesInOrder(...steps) {
    let i = 0;
    return jest.fn(() => {
      const step = steps[Math.min(i++, steps.length - 1)];
      return step instanceof Error ? Promise.reject(step) : Promise.resolve(step);
    });
  }

  it("hands over each reply as it comes and stops when the search has finished", async () => {
    const partOne = reply({ answered: 1 });
    const partTwo = reply({ answered: 2 });
    const finished = reply({ answered: 3, final: "COMPLETED" });
    const fetchPage = repliesInOrder(partOne, partTwo, finished);
    const seen = [];

    const result = await pollUntilFinished({ fetchPage, onReply: (r) => seen.push(r), wait: noWait });

    expect(seen).toEqual([partOne, partTwo, finished]);
    expect(result).toEqual({ outcome: "completed", reply: finished });
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("asks fresh on every tick, so it always follows the page, sort and filters on screen", async () => {
    let page = 0;
    const askedFor = [];
    const fetchPage = () => {
      askedFor.push(page);
      page += 1; // The user moves on between ticks.
      return Promise.resolve(reply({ final: askedFor.length === 3 ? "COMPLETED" : "IN_PROGRESS" }));
    };

    await pollUntilFinished({ fetchPage, wait: noWait });

    expect(askedFor).toEqual([0, 1, 2]);
  });

  it("never runs two polls at once", async () => {
    let running = 0;
    let most = 0;
    let calls = 0;
    const fetchPage = async () => {
      running += 1;
      most = Math.max(most, running);
      await Promise.resolve();
      running -= 1;
      calls += 1;
      return reply({ final: calls === 4 ? "COMPLETED" : "IN_PROGRESS" });
    };

    await pollUntilFinished({ fetchPage, wait: noWait });

    expect(most).toBe(1);
  });

  it("keeps going after a failed poll", async () => {
    const finished = reply({ final: "COMPLETED" });
    const fetchPage = repliesInOrder(new Error("blip"), reply({ answered: 1 }), new Error("blip"), finished);

    const result = await pollUntilFinished({ fetchPage, wait: noWait });

    expect(result.outcome).toBe("completed");
    expect(fetchPage).toHaveBeenCalledTimes(4);
  });

  it("gives up after too many failed polls in a row, keeping the last good reply", async () => {
    const good = reply({ answered: 1 });
    const fetchPage = repliesInOrder(good, new Error("down"));

    const result = await pollUntilFinished({ fetchPage, wait: noWait, maxFailuresInARow: 3 });

    expect(result).toEqual({ outcome: "gave-up", reply: good });
    expect(fetchPage).toHaveBeenCalledTimes(4);
  });

  it("gives up at the ceiling if the server never says finished", async () => {
    let clock = 0;
    const fetchPage = repliesInOrder(reply({ answered: 1 }));

    const result = await pollUntilFinished({
      fetchPage,
      wait: () => {
        clock += 1000;
        return Promise.resolve();
      },
      now: () => clock,
      ceilingMs: 5000,
    });

    expect(result.outcome).toBe("gave-up");
  });

  it("stops at once when a newer search has started", async () => {
    let cancelled = false;
    const seen = [];
    const fetchPage = jest.fn(() => {
      cancelled = true; // A new search starts while this request is out.
      return Promise.resolve(reply({ answered: 1 }));
    });

    const result = await pollUntilFinished({
      fetchPage,
      onReply: (r) => seen.push(r),
      isCancelled: () => cancelled,
      wait: noWait,
    });

    expect(result.outcome).toBe("cancelled");
    expect(seen).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
