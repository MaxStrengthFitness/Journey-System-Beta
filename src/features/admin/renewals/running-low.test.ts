import { describe, expect, it } from "vitest";
import { inactiveOnRecord, leftLine, lowLeftNow, notKnownLine, runningLow, runningLowFoot, type RunningLowInput } from "./running-low";
import { DEFAULT_RENEWAL_SETTINGS } from "../../renewals/settings";
import type { RenewalCycle, RenewalSnapshot } from "../../renewals/types";
import type { Client } from "../../../types";

const TODAY = "2026-10-06";
const STUDIO = "solon";
const ACTIVE = { isActive: true } as Pick<Client, "isActive">;

function snap(over: Partial<RenewalSnapshot> = {}): RenewalSnapshot {
  return {
    version: 2,
    cycleKey: "c-1",
    renewalOnBooks: null,
    situation: "on-track",
    sessionsLeft: 6,
    sessionsLeftSource: "mindbody",
    sessionsOnHand: 6,
    paymentsLeft: 0,
    paymentMode: "prepaid",
    pacePerWeek: 2,
    runOutDate: "2026-10-27",
    lastVisitDate: "2026-10-03",
    nextBookingDate: "2026-10-08",
    conversationDue: true,
    chargeWarning: false,
    focusDate: "2026-10-27",
    flags: [],
    ...over,
  } as RenewalSnapshot;
}

function client(id: string, renewal: RenewalSnapshot | null, over: Partial<Client> = {}): Client {
  return {
    id,
    firstName: id[0].toUpperCase() + id.slice(1),
    lastName: "Test",
    homeStudioId: STUDIO,
    ...(renewal ? { renewal } : {}),
    ...over,
  } as Client;
}

function input(clients: Client[], over: Partial<RunningLowInput> = {}): RunningLowInput {
  return {
    clients,
    studioId: STUDIO,
    cycles: {},
    settings: DEFAULT_RENEWAL_SETTINGS,
    today: TODAY,
    inactiveMarks: new Map(),
    inactiveDays: 90,
    ...over,
  };
}

describe("running low: who counts", () => {
  it("counts everyone at or under the studio's number, in total, fewest first", () => {
    const r = runningLow(
      input([
        client("ann", snap({ sessionsLeft: 10, sessionsOnHand: 10 })),
        client("bea", snap({ sessionsLeft: 2, sessionsOnHand: 2 })),
        client("cal", snap({ sessionsLeft: 11, sessionsOnHand: 11 })),
        client("dot", snap({ sessionsLeft: 0, sessionsOnHand: 0, runOutDate: null })),
      ]),
    );
    expect(r.rows.map((x) => [x.clientId, x.left])).toEqual([
      ["dot", 0],
      ["bea", 2],
      ["ann", 10],
    ]);
    expect(r.notKnown).toBe(0);
  });

  it("reads the total, not what's on hand: payments still to come keep a monthly client off the list", () => {
    // 4 on hand, 6 payments of 8 to come: 52 in total.
    const monthly = snap({ paymentMode: "monthly", sessionsOnHand: 4, paymentsLeft: 6, sessionsLeft: 52 });
    // The last payment: 8 on hand and nothing to come.
    const last = snap({ paymentMode: "monthly", sessionsOnHand: 8, paymentsLeft: 0, sessionsLeft: 8 });
    const r = runningLow(input([client("ann", monthly), client("bea", last)]));
    expect(r.rows.map((x) => x.clientId)).toEqual(["bea"]);
  });

  it("follows the studio's own number", () => {
    const clients = [client("ann", snap({ sessionsLeft: 12 })), client("bea", snap({ sessionsLeft: 6 }))];
    expect(runningLow(input(clients, { settings: { ...DEFAULT_RENEWAL_SETTINGS, conversationAtSessionsLeft: 12 } })).rows).toHaveLength(2);
    expect(runningLow(input(clients, { settings: { ...DEFAULT_RENEWAL_SETTINGS, conversationAtSessionsLeft: 5 } })).rows).toHaveLength(0);
  });

  it("finds a slow client the pipeline's date window would miss", () => {
    // 8 left at a quarter a week runs out in 32 weeks, well past a 3-month horizon.
    const slow = snap({ sessionsLeft: 8, pacePerWeek: 0.25, runOutDate: "2027-05-18", focusDate: "2027-05-18" });
    expect(runningLow(input([client("ann", slow)])).rows.map((x) => x.clientId)).toEqual(["ann"]);
  });

  it("leaves out a client whose next package is already signed, or whose renewal a leader recorded", () => {
    const onBooks = snap({ renewalOnBooks: { cycleKey: "c-2", packageKey: "committed", startsOn: "2026-11-01" } });
    const cycles = {
      "c-up": { outcome: "upgraded" } as RenewalCycle,
      "c-lost": { outcome: "lost" } as RenewalCycle,
      "c-talk": { stage: "decided" } as RenewalCycle,
    };
    const r = runningLow(
      input(
        [
          client("ann", onBooks),
          client("bea", snap({ cycleKey: "c-up" })),
          client("cal", snap({ cycleKey: "c-lost" })),
          client("dot", snap({ cycleKey: "c-talk" })),
        ],
        { cycles },
      ),
    );
    // Lost and decided are still running low: only a renewal takes a client off.
    expect(r.rows.map((x) => x.clientId)).toEqual(["cal", "dot"]);
    expect(r.rows[0].cycle).toBe(cycles["c-lost"]);
  });

  it("keeps an away client in, and leaves an ended or lapsed package to the pipeline", () => {
    const r = runningLow(
      input([
        client("ann", snap({ situation: "away", awayUntil: "2027-04-01" })),
        client("bea", snap({ situation: "ended", sessionsLeft: null })),
        client("cal", snap({ situation: "lapsed", sessionsLeft: 0 })),
      ]),
    );
    expect(r.rows.map((x) => x.clientId)).toEqual(["ann"]);
    // Ended and lapsed are said elsewhere, so they aren't "not known" either.
    expect(r.notKnown).toBe(0);
  });

  it("counts a client whose total isn't known, never drops one or calls it fine", () => {
    const r = runningLow(
      input([
        client("ann", null),
        client("bea", snap({ situation: "unknown", sessionsLeft: null })),
        client("cal", snap({ sessionsLeft: 3 })),
      ]),
    );
    expect(r.rows.map((x) => x.clientId)).toEqual(["cal"]);
    expect(r.notKnown).toBe(2);
  });

  it("is the home studio's list: a visitor from another studio isn't counted", () => {
    const r = runningLow(input([client("ann", snap(), { homeStudioId: "westlake" }), client("bea", null, { homeStudioId: "westlake" })]));
    expect(r.rows).toEqual([]);
    expect(r.notKnown).toBe(0);
  });

  it("leaves out inactive clients: Mindbody's flag, a leader's mark that holds, past the Inactive line", () => {
    const quiet = snap({ lastVisitDate: "2026-06-01", nextBookingDate: null });
    const r = runningLow(
      input(
        [
          client("ann", snap(), { isActive: false }),
          client("bea", snap({ lastVisitDate: "2026-09-01", nextBookingDate: null })),
          client("cal", quiet),
          client("dot", snap({ lastVisitDate: "2026-09-20", nextBookingDate: null })),
          client("eve", null, { isActive: false }),
        ],
        { inactiveMarks: new Map([["bea", { day: "2026-09-10" }]]) },
      ),
    );
    expect(r.rows.map((x) => x.clientId)).toEqual(["dot"]);
    // An inactive client with no record isn't "not known" either.
    expect(r.notKnown).toBe(0);
  });

  it("sorts ties by the soonest run-out, then the undated, then by name", () => {
    const r = runningLow(
      input([
        client("zed", snap({ sessionsLeft: 4, runOutDate: null })),
        client("amy", snap({ sessionsLeft: 4, runOutDate: null })),
        client("kit", snap({ sessionsLeft: 4, runOutDate: "2026-10-20" })),
      ]),
    );
    expect(r.rows.map((x) => x.clientId)).toEqual(["kit", "amy", "zed"]);
  });
});

describe("running low: inactive off the nightly record", () => {
  const s = (over: Partial<RenewalSnapshot>) => snap(over);

  it("is never inactive while booked ahead, even with a mark", () => {
    expect(inactiveOnRecord(ACTIVE, s({ lastVisitDate: "2026-01-01", nextBookingDate: "2026-10-09" }), { day: "2026-09-01" }, TODAY, 90)).toBe(false);
  });

  it("a mark holds until a visit after the day it was made", () => {
    expect(inactiveOnRecord(ACTIVE, s({ lastVisitDate: "2026-08-30", nextBookingDate: null }), { day: "2026-09-01" }, TODAY, 90)).toBe(true);
    expect(inactiveOnRecord(ACTIVE, s({ lastVisitDate: "2026-09-02", nextBookingDate: null }), { day: "2026-09-01" }, TODAY, 90)).toBe(false);
  });

  it("goes past the studio's line only with a known last visit, and never while away", () => {
    expect(inactiveOnRecord(ACTIVE, s({ lastVisitDate: "2026-07-08", nextBookingDate: null }), null, TODAY, 90)).toBe(true);
    expect(inactiveOnRecord(ACTIVE, s({ lastVisitDate: "2026-07-09", nextBookingDate: null }), null, TODAY, 90)).toBe(false);
    expect(inactiveOnRecord(ACTIVE, s({ lastVisitDate: null, nextBookingDate: null }), null, TODAY, 90)).toBe(false);
    expect(inactiveOnRecord(ACTIVE, s({ situation: "away", lastVisitDate: "2026-01-01", nextBookingDate: null }), null, TODAY, 90)).toBe(false);
    // A booking that has already passed is not a booking ahead.
    expect(inactiveOnRecord(ACTIVE, s({ lastVisitDate: "2026-07-01", nextBookingDate: "2026-10-01" }), null, TODAY, 90)).toBe(true);
  });
});

describe("running low: the words", () => {
  it("says the count and when it runs out", () => {
    expect(leftLine(snap({ sessionsLeft: 6 }), TODAY)).toBe("6 left · runs out around Oct 27");
    expect(leftLine(snap({ sessionsLeft: 1, sessionsOnHand: 1, runOutDate: null }), TODAY)).toBe("1 left");
    expect(leftLine(snap({ sessionsLeft: 0, sessionsOnHand: 0, runOutDate: "2026-10-06" }), TODAY)).toBe("None left");
  });

  it("says what a total with a payment to come is made of", () => {
    const s = snap({ paymentMode: "monthly", sessionsOnHand: 2, paymentsLeft: 1, sessionsLeft: 10, runOutDate: "2026-11-10" });
    expect(leftLine(s, TODAY)).toBe("10 left in total: 2 on hand, 8 still to come · runs out around Nov 10");
  });

  it("says an estimate is one", () => {
    expect(leftLine(snap({ sessionsLeft: 7, sessionsOnHand: null, sessionsLeftSource: "estimate", runOutDate: null }), TODAY)).toBe("7 left (estimated)");
  });

  it("puts the year on a run-out date in another year", () => {
    expect(leftLine(snap({ sessionsLeft: 8, runOutDate: "2027-05-18" }), TODAY)).toBe("8 left · runs out around May 18, 2027");
  });

  it("says the ledger on the dashboard row, and still when the sessions run out", () => {
    const ledger = { carriedIn: 4, thisContract: 5, toCome: 0, extra: 0, total: 9, source: "mindbody" as const, asOf: null };
    // No ledger yet: the list's own line.
    expect(lowLeftNow(snap({ sessionsLeft: 6 }), TODAY)).toBe("6 left · runs out around Oct 27");
    // A ledger: the ledger, then when they run out.
    expect(lowLeftNow(snap({ sessionsLeft: 9, ledger }), TODAY)).toBe("9 left: 4 rolled over · 5 this contract · runs out around Oct 27");
    // At the end already says it: not twice.
    const projection = { endsOn: "2026-12-01", endsOnSource: "mindbody" as const, booked: 2, bookedThrough: "2026-10-10", paceWeeks: 3, pacePerWeek: 2, leftAtEnd: 0, leftAtEndLow: 0, leftAtEndHigh: 0, runOutDate: "2026-10-27" };
    expect(lowLeftNow(snap({ sessionsLeft: 9, ledger, projection }), TODAY)).toBe("9 left: 4 rolled over · 5 this contract");
    // No run-out date: the ledger alone.
    expect(lowLeftNow(snap({ sessionsLeft: 9, ledger, runOutDate: null }), TODAY)).toBe("9 left: 4 rolled over · 5 this contract");
  });

  it("names the studio's number on the tile, and says the not-known once", () => {
    expect(runningLowFoot(DEFAULT_RENEWAL_SETTINGS)).toBe("10 or fewer left, in total");
    expect(runningLowFoot({ conversationAtSessionsLeft: 8 })).toBe("8 or fewer left, in total");
    expect(notKnownLine(0)).toBeNull();
    expect(notKnownLine(1)).toBe("Not counted: 1 client whose sessions left aren't known yet.");
    expect(notKnownLine(12)).toBe("Not counted: 12 clients whose sessions left aren't known yet.");
  });
});
