import { describe, it, expect } from "vitest";
import { addDays } from "../client-history/model";
import {
  BOOKING_LOOKAHEAD_DAYS,
  bookedDaysAhead,
  ledgerParts,
  MINDBODY_REMAINING_INCLUDES_BOOKED,
  paceBetween,
  paceRange,
  paceTrendOf,
  projectAtEnd,
  projectionStart,
  rateOf,
  runOutDay,
  suggestPackage,
} from "./projection";
import { mindbodyDayKey } from "./engine";
import { buildPackageNameIndex, DEFAULT_PACKAGES, DEFAULT_RENEWAL_SETTINGS } from "./settings";

const TODAY = "2026-09-11";
const T = (n: number) => addDays(TODAY, n);

describe("paceBetween", () => {
  it("is visits a week over the observed days, away left out, to the quarter", () => {
    const used = new Set([T(-1), T(-5), T(-9), T(-13), T(-17), T(-20)]);
    expect(paceBetween(used, T(-20), TODAY, [])).toBe(2);
    // Away for the first week of the window: only 14 observed days, too few to say.
    expect(paceBetween(used, T(-20), TODAY, [{ from: T(-27), to: T(-14), reason: "Vacation" }])).toBeNull();
  });
  it("says nothing under 21 observed days", () => {
    expect(paceBetween(new Set([T(-1)]), T(-19), TODAY, [])).toBeNull();
  });
});

describe("paceRange", () => {
  it("needs two 4-week windows to be a range", () => {
    expect(paceRange({ used: new Set([T(-1)]), today: TODAY, floor: T(-20), away: [] })).toBeNull();
    expect(paceRange({ used: new Set([T(-1)]), today: TODAY, floor: T(-27), away: [] })).toEqual({ slowest: 0, fastest: 0.25 });
    expect(paceRange({ used: new Set([T(-1)]), today: TODAY, floor: null, away: [] })).toBeNull();
  });
});

describe("bookedDaysAhead", () => {
  it("counts distinct booked days from today, never past the read horizon or the end", () => {
    const rows = [
      { day: T(-1), kind: "booked" },
      { day: TODAY, kind: "booked" },
      { day: T(2), kind: "booked" },
      { day: T(2), kind: "booked" },
      { day: T(3), kind: "visit" },
      { day: T(BOOKING_LOOKAHEAD_DAYS + 1), kind: "booked" },
    ];
    // For the day Mindbody's remaining is found to still count booked visits.
    expect(bookedDaysAhead(rows, TODAY, null, false)).toEqual([TODAY, T(2)]);
    expect(bookedDaysAhead(rows, TODAY, T(1), false)).toEqual([TODAY]);
  });
  it("as found (Oct 7 2026): Mindbody's remaining still counts the booked visits", () => {
    expect(MINDBODY_REMAINING_INCLUDES_BOOKED).toBe(false);
    expect(bookedDaysAhead([{ day: TODAY, kind: "booked" }], TODAY, null)).toEqual([TODAY]);
    // The other answer takes nothing off.
    expect(bookedDaysAhead([{ day: TODAY, kind: "booked" }], TODAY, null, true)).toEqual([]);
  });
});

describe("runOutDay", () => {
  it("is the old arithmetic with nothing booked, pushed past away time", () => {
    expect(runOutDay({ sessionsLeft: 10, booked: [], pacePerWeek: 2, today: TODAY, away: [] })).toBe(T(35));
    expect(
      runOutDay({ sessionsLeft: 10, booked: [], pacePerWeek: 2, today: TODAY, away: [{ from: T(10), to: T(16), reason: "Vacation" }] }),
    ).toBe(T(42));
  });
  it("is null with no pace, today with nothing left", () => {
    expect(runOutDay({ sessionsLeft: 10, booked: [], pacePerWeek: null, today: TODAY, away: [] })).toBeNull();
    expect(runOutDay({ sessionsLeft: 10, booked: [], pacePerWeek: 0, today: TODAY, away: [] })).toBeNull();
    expect(runOutDay({ sessionsLeft: 0, booked: [], pacePerWeek: 1, today: TODAY, away: [] })).toBe(TODAY);
  });
  it("with bookings to take off: the booked days first, then the pace after the last one", () => {
    // Two booked, then 4 more at 2 a week: 14 days after the last booking.
    expect(runOutDay({ sessionsLeft: 6, booked: [T(1), T(3)], pacePerWeek: 2, today: TODAY, away: [] })).toBe(T(17));
    // The bookings use the last of them: a booked day.
    expect(runOutDay({ sessionsLeft: 2, booked: [T(1), T(3), T(5)], pacePerWeek: 2, today: TODAY, away: [] })).toBe(T(3));
  });
});

describe("projectAtEnd", () => {
  it("never projects below zero, and keeps a run-out date only when it is before the end", () => {
    const p = projectAtEnd({
      sessionsLeft: 4,
      endsOn: T(60),
      endsOnSource: "mindbody",
      today: TODAY,
      booked: [T(1), T(70)],
      pacePerWeek: 2,
      range: null,
      away: [],
      runOutDate: T(12),
    });
    expect(p.booked).toBe(1); // the booking after the end isn't counted
    expect(p.leftAtEnd).toBe(0);
    expect(p.leftAtEndLow).toBe(0);
    expect(p.leftAtEndHigh).toBe(0);
    expect(p.runOutDate).toBe(T(12));
  });
  it("with bookings to take off: sessions left less the booked days, then the pace after the last one", () => {
    const p = projectAtEnd({
      sessionsLeft: 54,
      endsOn: T(140),
      endsOnSource: "mindbody",
      today: TODAY,
      booked: [T(1), T(5), T(8)],
      pacePerWeek: 1.5,
      range: { slowest: 1, fastest: 2 },
      away: [],
      runOutDate: null,
    });
    // 132 days after the last booking: 18.9 weeks; 54 − 3 − 1.5 × 18.86 = 22.7.
    expect(p.booked).toBe(3);
    expect(p.bookedThrough).toBe(T(8));
    expect(p.paceWeeks).toBe(18.9);
    expect(p.leftAtEnd).toBe(23);
    expect(p.leftAtEndLow).toBe(13);
    expect(p.leftAtEndHigh).toBe(32);
  });
  it("stores no week count without a pace, so the snapshot doesn't change every night for nothing", () => {
    const p = projectAtEnd({
      sessionsLeft: 20,
      endsOn: T(60),
      endsOnSource: "mindbody",
      today: TODAY,
      booked: [],
      pacePerWeek: null,
      range: null,
      away: [],
      runOutDate: null,
    });
    expect(p.leftAtEnd).toBeNull();
    expect(p.paceWeeks).toBeNull();
  });
});

describe("paceTrendOf", () => {
  it("is steady inside half a visit a week, and down or up past a quarter of the earlier pace", () => {
    expect(paceTrendOf(1.25, 1.5)).toBe("steady");
    expect(paceTrendOf(1, 1.5)).toBe("down");
    expect(paceTrendOf(2, 1.5)).toBe("up");
    expect(paceTrendOf(2.25, 1.5)).toBe("up");
    expect(paceTrendOf(null, 1.5)).toBeNull();
  });
});

describe("suggestPackage", () => {
  it("is the current package when every package has the same rhythm, and null without a pace", () => {
    expect(suggestPackage(DEFAULT_PACKAGES, 1.5, "trial")).toBe("trial");
    expect(suggestPackage(DEFAULT_PACKAGES, null, "trial")).toBeNull();
  });
  it("suggests nothing when the current package isn't known: no made-up upsell", () => {
    expect(suggestPackage(DEFAULT_PACKAGES, 1.5, null)).toBeNull();
    expect(suggestPackage(DEFAULT_PACKAGES, 1.5, "not-a-package")).toBeNull();
  });
  it("suggests another package only when it fits the pace better by a quarter of a session a week", () => {
    // A once-a-week package beside the twice-a-week ones (24 sessions over 6 payments).
    const once = { ...DEFAULT_PACKAGES[0], key: "once", label: "Once a week", sessions: 24 };
    const table = [...DEFAULT_PACKAGES, once];
    expect(suggestPackage(table, 1, "trial")).toBe("once");
    // 1.5 a week is equally far from 1 and 2: no clear winner, stay put.
    expect(suggestPackage(table, 1.5, "trial")).toBe("trial");
    // 1.75 is closer to 2 by half a session: stay on the twice-a-week package.
    expect(suggestPackage(table, 1.75, "trial")).toBe("trial");
  });
});

describe("ledgerParts", () => {
  it("counts only recognised options with sessions left, by when they were bought", () => {
    const index = buildPackageNameIndex(DEFAULT_RENEWAL_SETTINGS);
    const parts = ledgerParts(
      {
        a: { serviceId: 1, name: "48 Sessions - 2X Week", remaining: 3, activeDate: "2026-01-02" },
        b: { serviceId: 2, name: "48 Sessions - 2X Week", remaining: 8, paymentDate: "2026-09-01" },
        c: { serviceId: 3, name: "session comp", remaining: 1 },
        d: { serviceId: 4, name: "Unknown", remaining: 9 },
        e: { serviceId: 5, name: "48 Sessions - 2X Week", remaining: 0, activeDate: "2025-01-01" },
      },
      index,
      "2026-03-01",
      mindbodyDayKey,
    );
    expect(parts).toEqual({ carriedIn: 3, thisContract: 8, extra: 1 });
  });
});

describe("rateOf", () => {
  const tier = DEFAULT_PACKAGES[2];
  it("takes the amount most charges carry", () => {
    const r = rateOf({
      contract: {
        clientContractId: 1,
        status: "Active",
        upcomingAutopayEvents: [
          { scheduleDate: T(1), chargeAmount: 432 },
          { scheduleDate: T(29), chargeAmount: 432 },
          { scheduleDate: T(57), chargeAmount: 0 },
        ],
      },
      tier,
      paymentMode: "monthly",
    });
    expect(r).toEqual({ perSession: 54, payment: 432, source: "mindbody", packageRate: 54, special: false });
  });
  it("says a payment without a package can't be split into sessions", () => {
    const r = rateOf({
      contract: {
        clientContractId: 1,
        status: "Active",
        upcomingAutopayEvents: [
          { scheduleDate: T(1), chargeAmount: 400 },
          { scheduleDate: T(29), chargeAmount: 400 },
        ],
      },
      tier: null,
      paymentMode: "monthly",
    });
    expect(r).toEqual({ perSession: null, payment: 400, source: "mindbody", packageRate: null, special: false });
  });
  it("needs two charges that agree before Mindbody sets the rate: one odd charge, or a tie, is the package's rate", () => {
    const one = rateOf({
      contract: { clientContractId: 1, status: "Active", upcomingAutopayEvents: [{ scheduleDate: T(1), chargeAmount: 400 }] },
      tier,
      paymentMode: "monthly",
    });
    expect(one).toMatchObject({ perSession: 54, source: "package", special: false });
    const tie = rateOf({
      contract: {
        clientContractId: 1,
        status: "Active",
        upcomingAutopayEvents: [
          { scheduleDate: T(1), chargeAmount: 400 },
          { scheduleDate: T(29), chargeAmount: 400 },
          { scheduleDate: T(57), chargeAmount: 432 },
          { scheduleDate: T(85), chargeAmount: 432 },
        ],
      },
      tier,
      paymentMode: "monthly",
    });
    expect(tie).toMatchObject({ source: "package", special: false });
    // Without a package and without agreeing charges there is no rate at all.
    expect(
      rateOf({
        contract: { clientContractId: 1, status: "Active", upcomingAutopayEvents: [{ scheduleDate: T(1), chargeAmount: 400 }] },
        tier: null,
        paymentMode: "monthly",
      }),
    ).toBeNull();
  });
});

describe("projectionStart (Ahead, AJ's 2a: the dates count from the day Mindbody counted)", () => {
  const away: never[] = [];
  it("were Mindbody's remaining net of the bookings: the count is used after the visits held at it, from its day", () => {
    // Counted today, nothing held: the pace starts today, as it always did.
    expect(projectionStart({ sessionsLeft: 20, countedOn: TODAY, today: TODAY, pacePerWeek: 2, heldThrough: null, bookedAhead: [], away, remainingIncludesBooked: true })).toEqual({
      from: TODAY,
      left: 20,
      booked: [],
      countedOn: TODAY,
    });
    // Counted 10 days ago, nothing held: the pace has been using it since then.
    expect(projectionStart({ sessionsLeft: 20, countedOn: T(-10), today: TODAY, pacePerWeek: 2, heldThrough: null, bookedAhead: [], away, remainingIncludesBooked: true }).from).toBe(T(-10));
    // Visits held through T(20) use sessions the count no longer holds: the count is used after them.
    expect(projectionStart({ sessionsLeft: 20, countedOn: TODAY, today: TODAY, pacePerWeek: 2, heldThrough: T(20), bookedAhead: [T(2), T(20)], away, remainingIncludesBooked: true }).from).toBe(T(20));
    expect(projectionStart({ sessionsLeft: 20, countedOn: T(-10), today: TODAY, pacePerWeek: 2, heldThrough: T(15), bookedAhead: [], away, remainingIncludesBooked: true }).from).toBe(T(15));
    // A held day before the count's own day starts nothing later.
    expect(projectionStart({ sessionsLeft: 20, countedOn: T(-10), today: TODAY, pacePerWeek: 2, heldThrough: T(-12), bookedAhead: [], away, remainingIncludesBooked: true }).from).toBe(T(-10));
    // Never subtracted a second time.
    expect(projectionStart({ sessionsLeft: 20, countedOn: TODAY, today: TODAY, pacePerWeek: 2, heldThrough: T(20), bookedAhead: [T(2), T(20)], away, remainingIncludesBooked: true }).left).toBe(20);
  });

  it("with Mindbody's remaining still holding the bookings (as found), uses the count at the pace from its own day", () => {
    // The booked visits are part of the pace: never taken off a second time, and the count is never counted down.
    expect(
      projectionStart({ sessionsLeft: 20, countedOn: T(-14), today: TODAY, pacePerWeek: 2, heldThrough: T(10), bookedAhead: [T(2), T(5)], away: [] }),
    ).toEqual({ from: T(-14), left: 20, booked: [], countedOn: T(-14) });
    expect(projectionStart({ sessionsLeft: 20, countedOn: null, today: TODAY, pacePerWeek: 2, bookedAhead: [T(2)], away: [] }).from).toBe(TODAY);
  });

  it("treats a count with no usable day as today's", () => {
    for (const countedOn of [null, "soon", T(3)]) {
      const s = projectionStart({ sessionsLeft: 20, countedOn, today: TODAY, pacePerWeek: 2, bookedAhead: [], away });
      expect(s.from).toBe(TODAY);
      expect(s.countedOn).toBeNull();
    }
  });
});

describe("paceRange with whole windows only (Ahead, Oct 7 2026)", () => {
  it("leaves out a window cut short by a floor that only moves with the night", () => {
    // Every day from T(-40) to T(-30), then once a week to today.
    const used = new Set<string>();
    for (let d = -40; d <= -30; d++) used.add(T(d));
    for (let d = -28; d <= 0; d += 7) used.add(T(d));
    const floor = T(-40);
    // Cut short: the window ending T(-14) starts at the floor (27 days, 14 visits: 3.75 a week).
    expect(paceRange({ used, today: TODAY, floor, away: [] })).toEqual({ slowest: 1, fastest: 3.75 });
    // Whole windows only: the two that fit after the floor, 1 and 2.25 a week.
    expect(paceRange({ used, today: TODAY, floor, away: [], wholeWindows: true })).toEqual({ slowest: 1, fastest: 2.25 });
  });
});
