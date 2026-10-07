/**
 * Snapshot version 3 (the renewals dashboard, Oct 7 2026): the session
 * ledger, the commitment end, the projection at it, the rate and the
 * retention signals, through the engine as the nightly job and the live
 * read call it.
 */
import { describe, it, expect } from "vitest";
import { buildRenewalSnapshot, sameSnapshot, type AttendanceRow, type RenewalEngineInput } from "./engine";
import { addDays } from "../client-history/model";
import { DEFAULT_RENEWAL_SETTINGS } from "./settings";
import {
  ledgerSentence,
  paceTrendSentence,
  projectionSentence,
  projectionWorking,
  rateSentence,
  tenureSentence,
} from "./sentences";
import type { Client, MindbodyContract, MindbodyService } from "../../types";

const TODAY = "2026-09-11";
const T = (n: number) => addDays(TODAY, n);
/** A Committed contract whose commitment ends 20 weeks from today. */
const END = T(140);
const START = addDays(END, -(12 * 28 - 1));

function contract(over: Partial<MindbodyContract> & { id: number }): MindbodyContract {
  const { id, ...rest } = over;
  return { clientContractId: id, status: "Active", contractName: "Committed 12 Month EFT", ...rest };
}

function service(id: number, name: string, remaining: number, activeDate: string, over: Partial<MindbodyService> = {}): MindbodyService {
  return { serviceId: id, name, count: 8, remaining, activeDate, ...over };
}

function client(over: Partial<Client> = {}): Client {
  return {
    id: "c1",
    firstName: "Mary",
    lastName: "Smith",
    homeStudioId: "solon",
    height: "",
    isActive: true,
    remainingSessions: 0,
    mindbodyCommercialSyncedAt: "synced",
    // Pulled this morning, so the projection counts from today; counting
    // from an older pull has its own tests ("counts from the day Mindbody counted").
    mindbodyServicesSyncedAt: "2026-09-11T04:12:00.000Z",
    ...over,
  } as Client;
}

function input(over: Partial<RenewalEngineInput> & { client: Client }): RenewalEngineInput {
  return { settings: DEFAULT_RENEWAL_SETTINGS, today: TODAY, attendance: [], attendanceSince: "2026-06-01", ...over };
}

function visits(...days: string[]): AttendanceRow[] {
  return days.map((day) => ({ day, kind: "visit" as const, trainerId: "t1" }));
}
function booked(...days: string[]): AttendanceRow[] {
  return days.map((day) => ({ day, kind: "booked" as const }));
}
/** Evenly at `perWeek` from `from` through today. */
function visitsAt(perWeek: number, from: string): AttendanceRow[] {
  const out: AttendanceRow[] = [];
  for (let i = 0; ; i++) {
    const day = addDays(from, Math.floor((i * 7) / perWeek));
    if (day > TODAY) break;
    out.push({ day, kind: "visit", trainerId: "t1" });
  }
  return out;
}

/** Twice a week for the 4 weeks before last month, once a week since: 8 weeks at 1.5. */
const SLOWING = visits(
  ...[0, 3, 7, 10, 14, 17, 21, 24].map((d) => T(-55 + d)),
  ...[0, 7, 14, 21].map((d) => T(-27 + d)),
);

/**
 * The rolled-over Committed client: an earlier contract renewed into this
 * one with 9 sessions unused; 11 bought under this one; 2 complimentary;
 * four payments still to come at $480.
 */
const rolledOver = (over: Partial<Client> = {}) =>
  client({
    mindbodyContracts: {
      "8001": contract({ id: 8001, startDate: addDays(START, -336), endDate: addDays(START, -1) }),
      "9001": contract({
        id: 9001,
        startDate: START,
        endDate: END,
        upcomingAutopayEvents: [14, 42, 70, 98].map((d) => ({ scheduleDate: T(d), chargeAmount: 480 })),
      }),
    },
    mindbodyServices: {
      a: service(1, "96 Sessions - 2X Week", 9, addDays(START, -30)),
      b: service(2, "96 Sessions - 2X Week", 3, T(-20)),
      c: service(3, "96 Sessions - 2X Week", 8, T(-2)),
      d: service(4, "Session Comp", 2, T(-40), { count: 2 }),
      e: service(5, "Mystery Pack", 4, T(-5)),
    },
    ...over,
  });

describe("the session ledger", () => {
  const snap = buildRenewalSnapshot(input({ client: rolledOver(), attendance: SLOWING, timeZone: "America/New_York" }));

  it("splits sessions left into rolled over, this contract, to come and extra, adding up to Mindbody's number", () => {
    expect(snap.sessionsLeft).toBe(54);
    expect(snap.ledger).toEqual({
      carriedIn: 9,
      thisContract: 11,
      toCome: 32,
      extra: 2,
      total: 54,
      source: "mindbody",
      asOf: "2026-09-11",
    });
    // The unmatched option is in no part, as it is in no balance.
    expect(snap.dataGaps.some((g) => g.includes("Mystery Pack"))).toBe(true);
  });

  it("says it with the extra sessions beside the package's number", () => {
    expect(ledgerSentence(snap)).toBe("52 left: 9 rolled over · 11 this contract · 32 to come · +2 extra");
  });

  it("marks payments counted from the contract's dates as estimated", () => {
    const est = buildRenewalSnapshot(
      input({
        client: rolledOver({
          mindbodyContracts: { "9001": contract({ id: 9001, startDate: START, endDate: END }) },
        }),
        attendance: SLOWING,
      }),
    );
    expect(est.ledger?.source).toBe("estimate");
    expect(ledgerSentence(est)).toContain("to come (estimated)");
    expect(est.ledger!.carriedIn + est.ledger!.thisContract + est.ledger!.toCome + est.ledger!.extra).toBe(est.sessionsLeft);
  });

  it("paid in full: the package's own option is this contract, an older one rolled over", () => {
    const pif = buildRenewalSnapshot(
      input({
        client: client({
          mindbodyContracts: {},
          mindbodyServices: {
            p: service(7, "144 PIF", 100, T(-120), { count: 144 }),
            o: service(8, "96 Sessions - 2X Week", 5, T(-400)),
          },
        }),
        attendance: visitsAt(2, "2026-06-01"),
      }),
    );
    expect(pif.paymentMode).toBe("prepaid");
    expect(pif.ledger).toMatchObject({ carriedIn: 5, thisContract: 100, toCome: 0, extra: 0, total: 105 });
    expect(ledgerSentence(pif)).toBe("105 left: 5 rolled over · 100 this contract");
    // A paid-in-full package commits to its weeks too: estimated from its start.
    expect(pif.commitmentEnd).toBe(addDays(T(-120), 18 * 28 - 1));
    expect(pif.commitmentEndSource).toBe("estimate");
    expect(pif.projection?.endsOnSource).toBe("estimate");
  });

  it("is null when the balance is the estimate from visits (no pricing options on file)", () => {
    const s = buildRenewalSnapshot(
      input({
        client: client({
          mindbodyServicesSyncedAt: undefined,
          mindbodyContracts: {
            "9001": contract({ id: 9001, contractName: "96 Sessions - 2X Week", startDate: "2026-07-01", endDate: END }),
          },
        }),
        attendanceSince: "2026-06-01",
        attendance: visitsAt(1, "2026-07-01"),
      }),
    );
    expect(s.sessionsLeftSource).toBe("estimate");
    expect(s.ledger).toBeNull();
    expect(ledgerSentence(s)).toBeNull();
  });
});

describe("the projection at the commitment's end", () => {
  const base = (attendance: AttendanceRow[], over: Partial<Client> = {}) =>
    buildRenewalSnapshot(input({ client: rolledOver(over), attendance }));

  it("never takes the bookings Mindbody holds off a second time, and uses the count after them (as shipped), with a range from the 4-week paces", () => {
    // MINDBODY_REMAINING_INCLUDES_BOOKED: Mindbody's remaining has already
    // taken the booked visits off, so they are never subtracted again; they
    // use sessions the count no longer holds, so the pace starts using the
    // count after the last booked day (Ahead, Oct 7 2026, AJ's "2a").
    const s = base([...SLOWING, ...booked(T(1), T(5), T(8))]);
    expect(s.pacePerWeek).toBe(1.5);
    expect(s.commitmentEnd).toBe(END);
    expect(s.commitmentEndSource).toBe("mindbody");
    const p = s.projection!;
    expect(p.booked).toBe(0);
    expect(p.bookedThrough).toBeNull();
    // 132 days from the last booked day to the end: 18.9 weeks.
    expect(p.paceWeeks).toBe(18.9);
    // 54 − 1.5 × 18.86 = 25.7: about 26, where the pace from today said 24.
    expect(p.leftAtEnd).toBe(26);
    expect(s.bankedAtCharge).toBe(26);
    expect(base(SLOWING).bankedAtCharge).toBe(24);
    // Fastest 4 weeks (2×): 54 − 37.7 = 16. Slowest (1×): 54 − 18.9 = 35.
    expect(p.leftAtEndLow).toBe(16);
    expect(p.leftAtEndHigh).toBe(35);
    expect(p.runOutDate).toBeNull();
    expect(s.paceRange).toEqual({ slowest: 1, fastest: 2 });
    expect(projectionSentence(s, TODAY)).toBe("About 26 left when the commitment ends Jan 29, 2027 (16–35)");
    // The extras are in what is projected, said the way the ledger says them.
    expect(projectionWorking(s)).toBe("52 + 2 extra left, 1.5× a week for 19 weeks");
  });

  it("with nothing booked is the old banked-at-the-charge arithmetic", () => {
    const s = base(SLOWING);
    // 54 − 1.5 × 20 weeks.
    expect(s.projection?.leftAtEnd).toBe(24);
    expect(s.bankedAtCharge).toBe(24);
  });

  it("leaves logged away time ahead out of the pace", () => {
    const away = { events: [{ id: "e1", type: "Vacation", title: "Italy", date: T(30), endDate: T(43) } as any] };
    const without = base(SLOWING);
    const withAway = base(SLOWING, away);
    // Two weeks away use no sessions: 1.5 × 2 = 3 more left.
    expect(withAway.projection!.leftAtEnd! - without.projection!.leftAtEnd!).toBe(3);
  });

  it("runs out before the end: the day, and how long before the end", () => {
    const s = base([...visitsAt(2, "2026-06-01"), ...booked(T(1), T(3))], {
      mindbodyContracts: { "9001": contract({ id: 9001, startDate: START, endDate: END, upcomingAutopayEvents: [] }) },
      mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 6, T(-3)) },
    });
    expect(s.sessionsLeft).toBe(6);
    // The two booked visits are already out of Mindbody's remaining, so they
    // come first; then 6 at 2 a week from the last of them: 21 days after
    // T(3). Counting from today, as version 2 did, said T(21).
    expect(s.runOutDate).toBe(T(24));
    expect(s.projection?.runOutDate).toBe(T(24));
    expect(s.projection?.leftAtEnd).toBe(0);
    expect(projectionSentence(s, TODAY)).toBe("Runs out around Oct 5, 17 weeks before it ends");
  });

  it("counts from the day Mindbody counted, not from the night of the run (Ahead, AJ's 2a)", () => {
    const pulled = (day: string) => base(SLOWING, { mindbodyServicesSyncedAt: `${day}T04:12:00.000Z` });
    const fresh = pulled(TODAY);
    const old = pulled(T(-14));
    // The same 54 counted two weeks earlier runs out two weeks earlier...
    expect(fresh.runOutDate).toBe(T(252));
    expect(old.runOutDate).toBe(T(238));
    // ...and leaves about 3 fewer when the commitment ends (1.5 a week for 2 more weeks).
    expect(fresh.projection?.leftAtEnd).toBe(24);
    expect(old.projection?.leftAtEnd).toBe(21);
    expect(old.bankedAtCharge).toBe(21);
    // Sessions left on every screen is still Mindbody's number, never counted down.
    expect(old.sessionsLeft).toBe(54);
    expect(old.ledger?.asOf).toBe(T(-14));
  });

  it("never puts the run-out day in the past: a count the pace has already used up says today", () => {
    const s = base([...visitsAt(2, "2026-06-01")], {
      mindbodyContracts: { "9001": contract({ id: 9001, startDate: START, endDate: END, upcomingAutopayEvents: [] }) },
      mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 2, T(-60)) },
      mindbodyServicesSyncedAt: `${T(-30)}T04:12:00.000Z`,
    });
    expect(s.sessionsLeft).toBe(2);
    expect(s.runOutDate).toBe(TODAY);
  });

  it("keeps the pace range and the run-out range, so every date can say its range", () => {
    const s = base(SLOWING);
    expect(s.paceRange).toEqual({ slowest: 1, fastest: 2 });
    // 54 at 2 a week is 189 days; at 1 a week 378; the 1.5-a-week day between.
    expect(s.runOutRange).toEqual({ earliest: T(189), latest: T(378) });
    // No pace, no range.
    const thin = buildRenewalSnapshot(input({ client: rolledOver(), attendance: visits(T(-3)), attendanceSince: T(-10) }));
    expect(thin.paceRange).toBeNull();
    expect(thin.runOutRange).toBeNull();
  });

  it("says 'Not enough to project yet' below the pace's minimum sample", () => {
    const s = buildRenewalSnapshot(input({ client: rolledOver(), attendance: visits(T(-3)), attendanceSince: T(-10) }));
    expect(s.pacePerWeek).toBeNull();
    expect(s.projection?.leftAtEnd).toBeNull();
    expect(s.bankedAtCharge).toBeNull();
    expect(projectionSentence(s, TODAY)).toBe("Not enough to project yet");
  });

  it("has no projection once the commitment has ended (billing finished, using banked sessions)", () => {
    const s = buildRenewalSnapshot(
      input({
        client: client({
          mindbodyContracts: { "9001": contract({ id: 9001, startDate: "2025-09-01", endDate: T(-10) }) },
          mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 12, T(-40)) },
        }),
        attendance: visitsAt(1, "2026-06-01"),
      }),
    );
    expect(s.paymentMode).toBe("sessions-only");
    expect(s.commitmentEnd).toBeNull();
    expect(s.projection).toBeNull();
    expect(projectionSentence(s, TODAY)).toBeNull();
  });
});

describe("the rate", () => {
  const withCharges = (amount: number) =>
    buildRenewalSnapshot(
      input({
        client: rolledOver({
          mindbodyContracts: {
            "9001": contract({
              id: 9001,
              startDate: START,
              endDate: END,
              upcomingAutopayEvents: [
                { scheduleDate: T(14), chargeAmount: 120 }, // a prorated first charge doesn't set the rate
                { scheduleDate: T(42), chargeAmount: amount },
                { scheduleDate: T(70), chargeAmount: amount },
              ],
            }),
          },
        }),
        attendance: SLOWING,
      }),
    );

  it("reads Mindbody's charge, and calls a price off the table special", () => {
    const s = withCharges(432);
    expect(s.rate).toEqual({ perSession: 54, payment: 432, source: "mindbody", packageRate: 60, special: true });
    expect(rateSentence(s)).toBe("at $54 a session (special)");
  });

  it("is the package's rate when Mindbody charges the table's price", () => {
    const s = withCharges(480);
    expect(s.rate).toMatchObject({ perSession: 60, payment: 480, source: "mindbody", special: false });
    expect(rateSentence(s)).toBe("at $60 a session");
  });

  it("falls back to the package table with no charges on file, the prepay rate when paid in full", () => {
    const monthly = buildRenewalSnapshot(
      input({
        client: rolledOver({ mindbodyContracts: { "9001": contract({ id: 9001, startDate: START, endDate: END }) } }),
        attendance: SLOWING,
      }),
    );
    expect(monthly.rate).toEqual({ perSession: 60, payment: 480, source: "package", packageRate: 60, special: false });
    const pif = buildRenewalSnapshot(
      input({
        client: client({ mindbodyContracts: {}, mindbodyServices: { p: service(7, "144 PIF", 100, T(-120), { count: 144 }) } }),
        attendance: SLOWING,
      }),
    );
    expect(pif.rate).toMatchObject({ perSession: 51, payment: null, source: "package" });
  });

  it("knows nothing about an unmatched package: no rate", () => {
    const s = buildRenewalSnapshot(
      input({
        client: client({
          mindbodyContracts: { "9001": contract({ id: 9001, contractName: "SV Special", startDate: START, endDate: END }) },
          mindbodyServices: { a: service(1, "Mystery Pack", 5, T(-3)) },
        }),
      }),
    );
    expect(s.rate).toBeNull();
  });
});

describe("the retention signals", () => {
  it("sees a client coming less: the last 4 weeks against the 8 before", () => {
    const older = visits(...[0, 3, 7, 10, 14, 17, 21, 24, 28, 31, 35, 38, 42, 45, 49, 52].map((d) => T(-83 + d)));
    const recent = visits(T(-20), T(-6));
    const s = buildRenewalSnapshot(input({ client: rolledOver(), attendance: [...older, ...recent], attendanceSince: "2026-05-01" }));
    expect(s.signals?.pacePrior).toBe(2);
    expect(s.signals?.paceRecent).toBe(0.5);
    expect(s.signals?.paceTrend).toBe("down");
    expect(paceTrendSentence(s)).toBe("Coming less: 0.5× a week in the last 4 weeks, 2× in the 8 before");
  });

  it("never reads a new client's weeks before their first package as 'coming more'", () => {
    const s = buildRenewalSnapshot(
      input({
        client: client({
          mindbodyContracts: { "9001": contract({ id: 9001, startDate: T(-20), endDate: addDays(T(-20), 335) }) },
          mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 4, T(-20)) },
        }),
        attendance: visitsAt(2, T(-20)),
        attendanceSince: "2026-01-01",
      }),
    );
    expect(s.signals?.pacePrior).toBeNull();
    expect(s.signals?.paceTrend).toBeNull();
    expect(paceTrendSentence(s)).toBeNull();
  });

  it("counts the total sessions, before Journey included, and says where the number came from", () => {
    const guessed = buildRenewalSnapshot(
      input({ client: rolledOver({ sessionCount: 12, clientsNumberOfVisitsAtSite: 318, firstSessionDate: "2026-08-01" } as any), attendance: SLOWING, coverage: "partial" }),
    );
    expect(guessed.signals).toMatchObject({ totalSessions: 318, totalSessionsBasis: "mindbody" });
    expect(tenureSentence(guessed)).toBe("About 318 sessions in all (from Mindbody, not yet confirmed)");
    const whole = buildRenewalSnapshot(
      input({ client: rolledOver({ sessionCount: 40 } as any), attendance: SLOWING, coverage: "complete" }),
    );
    expect(tenureSentence(whole)).toBe("40 sessions in all");
    const journeyOnly = buildRenewalSnapshot(input({ client: rolledOver({ sessionCount: 6 } as any), attendance: SLOWING }));
    expect(tenureSentence(journeyOnly)).toBe("6 sessions in Journey");
  });

  it("suggests the package whose rhythm fits the pace: the same one when every package is twice a week", () => {
    const s = buildRenewalSnapshot(input({ client: rolledOver(), attendance: SLOWING }));
    expect(s.signals?.suggestedPackageKey).toBe("committed");
    const weekly = {
      ...DEFAULT_RENEWAL_SETTINGS,
      packages: [
        ...DEFAULT_RENEWAL_SETTINGS.packages,
        { ...DEFAULT_RENEWAL_SETTINGS.packages[1], key: "once", label: "Once a week", sessions: 48, mindbodyNames: [] },
      ],
    };
    const once = buildRenewalSnapshot(input({ client: rolledOver(), settings: weekly, attendance: visitsAt(1, "2026-06-01") }));
    expect(once.pacePerWeek).toBe(1);
    expect(once.signals?.suggestedPackageKey).toBe("once");
  });
});

describe("sameSnapshot sees the version 3 fields", () => {
  it("writes again when only the ledger's parts moved", () => {
    const a = buildRenewalSnapshot(input({ client: rolledOver(), attendance: SLOWING }));
    const b = { ...a, ledger: { ...a.ledger!, carriedIn: a.ledger!.carriedIn - 1, thisContract: a.ledger!.thisContract + 1 } };
    expect(sameSnapshot(a, a)).toBe(true);
    expect(sameSnapshot(a, b)).toBe(false);
  });
});

describe("a contract whose whole package was issued up front", () => {
  it("doesn't count the payments to come twice: sessions left is what's on hand", () => {
    // A Committed contract, but Mindbody put all 96 on one option at the start
    // (one way a "96 Sessions w/ Roll Over" option could be issued).
    const s = buildRenewalSnapshot(
      input({
        client: client({
          mindbodyContracts: {
            "9001": contract({
              id: 9001,
              startDate: START,
              endDate: END,
              upcomingAutopayEvents: [14, 42, 70, 98].map((d) => ({ scheduleDate: T(d), chargeAmount: 480 })),
            }),
          },
          mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 40, addDays(START, 1), { count: 96 }) },
        }),
        attendance: SLOWING,
      }),
    );
    expect(s.paymentMode).toBe("monthly");
    expect(s.sessionsLeft).toBe(40);
    expect(s.ledger).toMatchObject({ thisContract: 40, toCome: 0, total: 40 });
  });

  it("still adds a payment's sessions for each payment to come when Mindbody issues them a payment at a time", () => {
    const s = buildRenewalSnapshot(input({ client: rolledOver(), attendance: SLOWING }));
    expect(s.ledger?.toCome).toBe(32);
  });
});
