import { describe, it, expect } from "vitest";
import { addDays } from "../../client-history/model";
import { DEFAULT_RENEWAL_SETTINGS } from "../../renewals/settings";
import type { RenewalCycle, RenewalSnapshot } from "../../renewals/types";
import { APP_LINES, type ClientJourney } from "../journey/states";
import type { Client } from "../../../types";
import { aheadClients, cantPlaceWhy, eventsOf, monthsBetween, shortestTier, type AheadInput, type AheadJourney } from "./events";

const TODAY = "2026-10-07";
const T = (n: number) => addDays(TODAY, n);
const STUDIO = "westlake";
const S = DEFAULT_RENEWAL_SETTINGS;

function snap(over: Partial<RenewalSnapshot> = {}): RenewalSnapshot {
  return {
    version: 3,
    cycleKey: "9001",
    renewalOnBooks: null,
    packageKey: "committed",
    packageLabel: "Committed · 12 months",
    paymentMode: "monthly",
    billingStart: T(-200),
    chargeDate: T(90),
    chargeDateSource: "mindbody",
    autoRenews: true,
    autoRenewsFrom: "mindbody",
    sessionsLeft: 26,
    sessionsLeftSource: "mindbody",
    sessionsOnHand: 2,
    paymentsLeft: 3,
    pacePerWeek: 2,
    runOutDate: T(91),
    bankedAtCharge: 0,
    situation: "on-track",
    conversationDue: false,
    chargeWarning: false,
    focusDate: T(90),
    flags: [],
    proof: {} as RenewalSnapshot["proof"],
    awayUntil: null,
    awayReason: null,
    lastVisitDate: T(-2),
    nextBookingDate: T(2),
    coachIds: ["dana"],
    primaryTrainerId: "dana",
    dataGaps: [],
    ledger: { carriedIn: 0, thisContract: 2, toCome: 24, extra: 0, total: 26, source: "mindbody", asOf: TODAY },
    commitmentEnd: T(90),
    commitmentEndSource: "mindbody",
    projection: {
      endsOn: T(90),
      endsOnSource: "mindbody",
      booked: 0,
      bookedThrough: null,
      paceWeeks: 12.9,
      pacePerWeek: 2,
      leftAtEnd: 0,
      leftAtEndLow: 0,
      leftAtEndHigh: 3,
      runOutDate: null,
    },
    paceRange: { slowest: 1.75, fastest: 2.25 },
    runOutRange: null,
    ...over,
  } as RenewalSnapshot;
}

function client(id: string, s: RenewalSnapshot | null, over: Partial<Client> = {}): Client {
  return { id, firstName: id[0].toUpperCase() + id.slice(1), lastName: "Example", homeStudioId: STUDIO, isActive: true, renewal: s ?? undefined, ...over } as Client;
}

function input(clients: Client[], over: Partial<AheadInput> = {}): AheadInput {
  return {
    clients,
    studioId: STUDIO,
    today: TODAY,
    until: T(180),
    settings: S,
    laneCtx: { studioId: STUDIO, settings: S, today: TODAY, inactiveMarks: new Map(), inactiveDays: 90 },
    cycles: {},
    cyclesKnown: true,
    journeys: null,
    breakDays: 14,
    lines: APP_LINES,
    cutover: null,
    ...over,
  };
}

const one = (c: Client, over: Partial<AheadInput> = {}) => aheadClients(input([c], over))[0];
const kinds = (c: Client, over: Partial<AheadInput> = {}) => one(c, over).events.map((e) => `${e.kind}@${e.day}`);

describe("the talk", () => {
  it("is Talk now at or under the studio's number, saying who last talked", () => {
    const s = snap({ sessionsLeft: 9, conversationDue: true });
    const a = one(client("maureen", s));
    expect(a.events[0]).toMatchObject({ kind: "talk-now", day: TODAY, now: true, sentence: "9 left · nobody has talked yet" });
    expect(a.needsNow).toBe(true);
    const talked = { lastTouchAt: "2026-10-02T15:00:00Z", lastTouchByName: "Dana Reyes" } as unknown as RenewalCycle;
    expect(one(client("maureen", s), { cycles: { "9001": talked } }).events[0].sentence).toBe("9 left · talked Oct 2, Dana");
    // Conversations not read yet: "nobody" is never said off a read that hasn't answered.
    expect(one(client("maureen", s), { cyclesKnown: false }).events[0].sentence).toBe("9 left");
  });

  it("is Talk due on the day the pace reaches the number, counted from the day Mindbody counted, with its range", () => {
    const e = one(client("ray", snap({ sessionsLeft: 26 }))).events.find((x) => x.kind === "talk")!;
    // 16 to go at 2 a week: 56 days; at 2.25 50, at 1.75 64.
    expect(e.day).toBe(T(56));
    expect(e.range).toEqual({ earliest: T(50), latest: T(64) });
    expect(e.sentence).toBe("Reaches 10 left · 26 now, about 2× a week");
    // Counted two weeks ago: two weeks earlier.
    const old = snap({ sessionsLeft: 26, ledger: { carriedIn: 0, thisContract: 2, toCome: 24, extra: 0, total: 26, source: "mindbody", asOf: T(-14) } });
    expect(one(client("ray", old)).events.find((x) => x.kind === "talk")!.day).toBe(T(42));
  });

  it("names a birthday or anniversary close to the talk", () => {
    const c = client("sofia", snap({ sessionsLeft: 12 }), { firstStudioDay: "2021-10-22" } as Partial<Client>);
    const talk = one(c).events.find((e) => e.kind === "talk")!;
    expect(talk.day).toBe(T(7));
    expect(talk.pair).toBe("5 years on Oct 22");
    const b = client("diane", snap({ sessionsLeft: 12 }), { dateOfBirth: "1966-10-20" } as Partial<Client>);
    expect(one(b).events.find((e) => e.kind === "talk")!.pair).toBe("turns 60 on Oct 20");
  });
});

describe("the charge and the commitment's end", () => {
  const banking = (over: Partial<RenewalSnapshot> = {}) =>
    snap({ situation: "will-bank", chargeDate: T(44), commitmentEnd: T(44), bankedAtCharge: 22, sessionsLeft: 28, pacePerWeek: 1, projection: { ...snap().projection!, endsOn: T(44), leftAtEnd: 22, leftAtEndLow: 20, leftAtEndHigh: 23 }, ...over });

  it("opens Before the charge 30 days ahead, and marks the charge's day", () => {
    const a = one(client("gordon", banking()));
    expect(a.events.map((e) => e.kind)).toEqual(expect.arrayContaining(["charge-window", "charge"]));
    const window = a.events.find((e) => e.kind === "charge-window")!;
    expect(window.day).toBe(T(14));
    expect(window.now).toBe(false);
    expect(window.sentence).toBe("Auto-renews Nov 20 with about 22 banked (20–23)");
    expect(a.events.find((e) => e.kind === "charge")!.sentence).toBe("Charges with about 22 banked · no plan yet");
  });

  it("is Before the charge today inside the window, with the plan's short label", () => {
    const plan = { plan: { choice: "pause-billing", packageKey: null, note: null, byUid: "u", byName: "Owen", at: null } } as unknown as RenewalCycle;
    const a = one(client("joan", banking({ chargeDate: T(24), commitmentEnd: T(24), chargeWarning: true })), { cycles: { "9001": plan } });
    const window = a.events.find((e) => e.kind === "charge-window")!;
    expect(window).toMatchObject({ day: TODAY, now: true });
    expect(window.sentence).toContain("plan: Pause billing");
    expect(a.needsNow).toBe(true);
  });

  it("never says 'no plan yet' while the conversations are unread", () => {
    expect(one(client("gordon", banking()), { cyclesKnown: false }).events.find((e) => e.kind === "charge")!.sentence).toBe("Charges with about 22 banked");
  });

  it("says Renews, Billing ends or Ends by the decided answer", () => {
    expect(one(client("arthur", snap({ projection: { ...snap().projection!, leftAtEnd: 3, leftAtEndLow: 2, leftAtEndHigh: 5 } }))).events.find((e) => e.kind === "renews")!.sentence).toBe(
      "About 3 left (2–5) when it renews",
    );
    expect(one(client("arthur", snap())).events.find((e) => e.kind === "renews")!.sentence).toBe("Sessions used up about when it renews");
    expect(one(client("celia", snap({ autoRenews: false, projection: { ...snap().projection!, leftAtEnd: 4, leftAtEndLow: 4, leftAtEndHigh: 4 } }))).events.find((e) => e.kind === "billing-ends")!.sentence).toBe(
      "Billing ends · about 4 left, which carry over",
    );
    const pif = snap({ paymentMode: "prepaid", chargeDate: null, bankedAtCharge: null, commitmentEnd: T(120), commitmentEndSource: "estimate", projection: null });
    expect(one(client("victor", pif)).events.find((e) => e.kind === "ends")!.sentence).toBe("Paid in full · ends around Feb 4, 2027");
  });

  it("a coach's paid-in-full lock means nothing charges", () => {
    const a = one(client("walt", banking(), { contractTierOverride: { payment: "pif" } } as Partial<Client>));
    expect(a.events.some((e) => e.kind === "charge" || e.kind === "charge-window")).toBe(false);
  });
});

describe("running out early", () => {
  it("says the day, its range, and how long before the end", () => {
    const s = snap({
      situation: "will-run-out",
      runOutDate: T(60),
      runOutRange: { earliest: T(52), latest: T(70) },
      projection: { ...snap().projection!, leftAtEnd: 0, runOutDate: T(60) },
    });
    const e = one(client("linda", s)).events.find((x) => x.kind === "runs-out")!;
    expect(e.day).toBe(T(60));
    expect(e.range).toEqual({ earliest: T(52), latest: T(70) });
    expect(e.sentence).toBe("Out of sessions around Dec 6 · 4 weeks before it renews");
  });

  it("says nothing within two weeks of the end", () => {
    const s = snap({ runOutDate: T(80), projection: { ...snap().projection!, runOutDate: T(80) } });
    expect(one(client("karen", s)).events.some((e) => e.kind === "runs-out")).toBe(false);
  });
});

describe("who is left out, and why", () => {
  it("leaves out visitors and inactive clients' renewal dates, never their moments", () => {
    expect(aheadClients(input([client("visitor", snap(), { homeStudioId: "solon" })]))).toHaveLength(0);
    const marked = input([client("peter", snap({ sessionsLeft: 9, conversationDue: true, nextBookingDate: null }), { dateOfBirth: "1960-11-02" } as Partial<Client>)], {
      laneCtx: { studioId: STUDIO, settings: S, today: TODAY, // Marked yesterday, after the last visit (T(-2)): the mark holds.
      inactiveMarks: new Map([["peter", { day: T(-1) }]]), inactiveDays: 90 },
    });
    expect(aheadClients(marked)[0].events.map((e) => e.kind)).toEqual(["birthday"]);
  });

  it("has nothing ahead once the renewal is signed or recorded", () => {
    expect(kinds(client("elaine", snap({ renewalOnBooks: { cycleKey: "9002", packageKey: "committed", startsOn: T(90) } } as Partial<RenewalSnapshot>)))).toEqual([]);
    expect(kinds(client("elaine", snap()), { cycles: { "9001": { outcome: "renewed" } as RenewalCycle } })).toEqual([]);
  });

  it("counts a client it can't place, with the reason", () => {
    expect(cantPlaceWhy(null)).toBe("No nightly record for this client yet.");
    const unknown = snap({ situation: "unknown", dataGaps: ['"SV 18 Months/144 Sessions PIF + 2 Free" isn\'t matched to a package in Renewal settings, so it isn\'t counted.'] });
    const a = one(client("omar", unknown));
    expect(a.cantPlace).toContain("isn't matched");
    expect(a.events).toEqual([]);
  });

  it("away: the return, nothing else", () => {
    const s = snap({ situation: "away", awayUntil: T(40), awayReason: "Snowbird" });
    expect(one(client("grace", s)).events.map((e) => [e.kind, e.sentence])).toEqual([["back", "Back from snowbird around Nov 16"]]);
  });
});

describe("May slip", () => {
  const journey = (over: Partial<ClientJourney>): ClientJourney =>
    ({ state: "steady", lastVisit: T(-6), driftDays: 8, nextBooking: null, ...over }) as ClientJourney;
  const withJourney = (j: AheadJourney, id = "dennis") => ({ journeys: new Map([[id, j]]) });

  it("is the next line if nothing is booked", () => {
    const a = one(client("dennis", snap()), withJourney({ journey: journey({}), nextState: "none" }));
    const e = a.events.find((x) => x.kind === "may-slip")!;
    expect(e).toMatchObject({ day: T(2), line: "drifting", sentence: "Turns Drifting if nothing is booked · last came Oct 1" });
    // Within a week: it needs you now.
    expect(a.needsNow).toBe(true);
  });

  it("says nothing when booked, unread, away or before the Journey is ready", () => {
    expect(kinds(client("dennis", snap()), withJourney({ journey: journey({}), nextState: "booked" }))).not.toContain(`may-slip@${T(2)}`);
    expect(kinds(client("dennis", snap()), withJourney({ journey: journey({}), nextState: "unknown" })).some((k) => k.startsWith("may-slip"))).toBe(false);
    expect(kinds(client("dennis", snap()), withJourney({ journey: journey({ state: "away" }), nextState: "none" })).some((k) => k.startsWith("may-slip"))).toBe(false);
    expect(kinds(client("dennis", snap())).some((k) => k.startsWith("may-slip"))).toBe(false);
  });

  it("a client already slipping needs you now", () => {
    const a = one(client("yvonne", snap()), withJourney({ journey: journey({ state: "at-risk", lastVisit: T(-20) }), nextState: "none" }, "yvonne"));
    expect(a.slipping).toBe(true);
    expect(a.needsNow).toBe(true);
  });
});

describe("helpers", () => {
  it("the Trial is the studio's shortest package, by its commitment", () => {
    expect(shortestTier(S.packages)?.key).toBe("trial");
    expect(one(client("ray", snap({ packageKey: "trial" }))).onTrial).toBe(true);
    expect(one(client("ray", snap())).onTrial).toBe(false);
  });

  it("lists the months the weeks touch", () => {
    expect(monthsBetween("2026-10-05", "2027-01-03")).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"]);
  });

  it("orders a studio's events by day, then by what needs doing first", () => {
    const list = eventsOf(aheadClients(input([client("joan", snap({ sessionsLeft: 9, conversationDue: true })), client("ray", snap({ sessionsLeft: 26 }))])));
    expect(list[0].kind).toBe("talk-now");
    expect(list.map((e) => e.day)).toEqual([...list.map((e) => e.day)].sort());
  });
});
