import { describe, expect, it } from "vitest";
import type { RenewalSnapshot } from "../../renewals/types";
import { resolveAll } from "../../studio-settings/resolve";
import { APP_LINES, countStates, driftLine, journeyOf, linesOf, sameLines, stageOf, type JourneyInput } from "./states";
import type { InactiveMark } from "./inactive";

const TODAY = "2026-09-28";

const snap = (extra: Partial<RenewalSnapshot> = {}): RenewalSnapshot =>
  ({
    situation: "on-track",
    pacePerWeek: 2,
    proof: { weeksObserved: 12, weeksAttended: 12, machinesImproved: null, machinesTracked: null, bestGain: null, inbody: null },
    awayUntil: null,
    awayReason: null,
    flags: [],
    ...extra,
  }) as RenewalSnapshot;

const input = (extra: Partial<JourneyInput> = {}): JourneyInput => ({
  active: true,
  snapshot: snap(),
  lastVisit: "2026-09-26",
  next: { state: "booked", day: "2026-09-30" },
  quotableTotal: null,
  today: TODAY,
  breakDays: 14,
  nightlyStale: false,
  lines: APP_LINES,
  ...extra,
});

describe("the lines", () => {
  it("takes the app's own lines from the settings' registry, and nowhere else", () => {
    expect(APP_LINES).toEqual({ driftMultiple: 2, driftMinDays: 7, lapsedDays: 45, inactiveDays: 90, newMax: 10, settlingMax: 24 });
  });

  it("drifts at twice her usual gap, never under a week", () => {
    expect(driftLine(3.5, APP_LINES)).toBe(7);
    expect(driftLine(2, APP_LINES)).toBe(APP_LINES.driftMinDays);
    expect(driftLine(7, APP_LINES)).toBe(14);
  });

  it("drifts at the studio's own multiple and least", () => {
    expect(driftLine(3.5, { driftMultiple: 3, driftMinDays: 7 })).toBe(11);
    expect(driftLine(2, { driftMultiple: 2, driftMinDays: 10 })).toBe(10);
  });

  it("puts a quotable total on the stages", () => {
    expect(stageOf(4, APP_LINES)).toBe("new");
    expect(stageOf(APP_LINES.newMax, APP_LINES)).toBe("new");
    expect(stageOf(11, APP_LINES)).toBe("settling");
    expect(stageOf(25, APP_LINES)).toBeNull();
    expect(stageOf(null, APP_LINES)).toBeNull();
  });

  it("puts the stages at the studio's own sessions", () => {
    const lines = { ...APP_LINES, newMax: 5, settlingMax: 30 };
    expect(stageOf(6, lines)).toBe("settling");
    expect(stageOf(30, lines)).toBe("settling");
    expect(stageOf(31, lines)).toBeNull();
  });

  it("reads the five out of the resolved settings: the studio's own, then head office's, then the app's", () => {
    const lines = linesOf(resolveAll({ studio: { lapsedDays: 60 }, company: { lapsedDays: 30, driftMultiple: 2.5, newMax: 8 } }));
    expect(lines).toEqual({ driftMultiple: 2.5, driftMinDays: 7, lapsedDays: 60, inactiveDays: 90, newMax: 8, settlingMax: 24 });
    expect(sameLines(lines, { ...lines })).toBe(true);
    expect(sameLines(lines, APP_LINES)).toBe(false);
  });
});

describe("journeyOf", () => {
  it("is Steady in her own rhythm", () => {
    const j = journeyOf(input());
    expect(j.state).toBe("steady");
    expect(j.judged).toBe(true);
    expect(j.why).toBe("Trains every 3–4 days, in her own rhythm.");
  });

  it("is Drifting at twice her usual gap with nothing booked, and names the line", () => {
    const j = journeyOf(input({ lastVisit: "2026-09-18", next: { state: "none", day: null } }));
    expect(j.state).toBe("drifting");
    expect(j.crossed).toBe("twice-usual");
    expect(j.daysSince).toBe(10);
    expect(j.since).toBe("2026-09-25");
    expect(j.why).toBe("She usually trains every 3–4 days. It has been 10 days, and nothing is booked.");
    expect(j.proof).toContain("twice her usual gap is 7 days");
  });

  it("is At risk past the studio's own line, and Lapsed past 45 days", () => {
    const atRisk = journeyOf(input({ lastVisit: "2026-09-10", next: { state: "none", day: null } }));
    expect(atRisk.state).toBe("at-risk");
    expect(atRisk.crossed).toBe("studio-line");
    expect(atRisk.why).toBe("18 days since her last visit, past the studio's 14-day line, and nothing is booked.");
    const lapsed = journeyOf(input({ lastVisit: "2026-08-10", next: { state: "none", day: null } }));
    expect(lapsed.state).toBe("lapsed");
    expect(lapsed.crossed).toBe("lapse-line");
    expect(lapsed.daysSince).toBe(49);
    expect(lapsed.why).toContain(`past the ${APP_LINES.lapsedDays}-day line`);
  });

  it("is Back when she booked again after crossing a line", () => {
    const j = journeyOf(input({ lastVisit: "2026-09-08", next: { state: "booked", day: "2026-10-01" } }));
    expect(j.state).toBe("back");
    expect(j.why).toBe("Booked again after 20 days away.");
  });

  it("never calls a client slipping when her bookings couldn't be read", () => {
    const j = journeyOf(input({ lastVisit: "2026-09-10", next: { state: "unknown", day: null } }));
    expect(j.state).toBe("unknown");
    expect(j.unknownWhy).toBe("bookings-unread");
    expect(j.why).toContain("whether anything is booked couldn't be read");
  });

  it("is never Lapsed off an unknown last visit: that is Unknown", () => {
    const j = journeyOf(input({ lastVisit: null, next: { state: "none", day: null } }));
    expect(j.state).toBe("unknown");
    expect(j.unknownWhy).toBe("no-visit");
  });

  it("is New or Settling in only from a total that may be quoted — never off a low Journey count", () => {
    expect(journeyOf(input({ quotableTotal: 4, snapshot: snap({ pacePerWeek: null }) })).state).toBe("new");
    expect(journeyOf(input({ quotableTotal: 18 })).state).toBe("settling");
    // A migration client nobody has recorded a total for, with no rhythm yet: too new to judge, not "New".
    const migrant = journeyOf(input({ quotableTotal: null, snapshot: snap({ pacePerWeek: null }) }));
    expect(migrant.state).toBe("unknown");
    expect(migrant.unknownWhy).toBe("too-new");
    expect(migrant.why).toContain("Too new to judge");
  });

  it("still holds a new client to the studio's line: At risk needs only her last visit", () => {
    const j = journeyOf(input({ quotableTotal: 3, snapshot: snap({ pacePerWeek: null }), lastVisit: "2026-09-10", next: { state: "none", day: null } }));
    expect(j.state).toBe("at-risk");
    expect(j.judged).toBe(false);
  });

  it("is Away with a reason and a return date; At risk once that date passes with nothing booked; Back once booked", () => {
    const away = snap({ situation: "away", awayReason: "Snowbird", awayUntil: "2026-10-12" });
    expect(journeyOf(input({ snapshot: away, lastVisit: "2026-09-01", next: { state: "none", day: null } }))).toMatchObject({ state: "away", why: "Snowbird until Mon, Oct 12." });
    const due = snap({ situation: "away", awayReason: "Knee surgery", awayUntil: "2026-09-25" });
    expect(journeyOf(input({ snapshot: due, lastVisit: "2026-08-20", next: { state: "none", day: null } }))).toMatchObject({ state: "at-risk", crossed: "due-back" });
    expect(journeyOf(input({ snapshot: due, lastVisit: "2026-08-20", next: { state: "booked", day: "2026-09-30" } })).state).toBe("back");
  });

  it("is Unknown with no nightly record, or one that has stopped changing", () => {
    expect(journeyOf(input({ snapshot: null })).unknownWhy).toBe("no-record");
    expect(journeyOf(input({ nightlyStale: true })).unknownWhy).toBe("stale-record");
  });

  it("holds a client to the studio's own lines", () => {
    // Twelve days out, nothing booked, usually every 3–4 days: Drifting at twice (7 days) …
    const out = { lastVisit: "2026-09-16", next: { state: "none" as const, day: null } };
    expect(journeyOf(input(out)).state).toBe("drifting");
    // … but not at a studio that drifts at four times her gap (14 days).
    const patient = journeyOf(input({ ...out, lines: { ...APP_LINES, driftMultiple: 4 } }));
    expect(patient.state).toBe("steady");
    expect(patient.driftDays).toBe(14);
    // A studio that calls it lapsed at 30 days, past its own 14-day At-risk line.
    const lapsed = journeyOf(input({ lastVisit: "2026-08-25", next: { state: "none", day: null }, lines: { ...APP_LINES, lapsedDays: 30 } }));
    expect(lapsed.state).toBe("lapsed");
    expect(lapsed.since).toBe("2026-09-24");
    expect(lapsed.why).toContain("past the 30-day line");
    // The drifting proof names the studio's own multiple.
    const drifting = journeyOf(input({ ...out, lines: { ...APP_LINES, driftMultiple: 3 } }));
    expect(drifting.state).toBe("drifting");
    expect(drifting.proof).toContain("three times her usual gap is 11 days");
    // New and Settling in at the studio's own sessions.
    expect(journeyOf(input({ quotableTotal: 12, lines: { ...APP_LINES, newMax: 12 } })).why).toBe("At session 12 of her first 12.");
  });

  it("counts every state, the empty ones as zero", () => {
    const counts = countStates([journeyOf(input()), journeyOf(input({ lastVisit: "2026-09-18", next: { state: "none", day: null } }))]);
    expect(counts.steady).toBe(1);
    expect(counts.drifting).toBe(1);
    expect(counts.lapsed).toBe(0);
    expect(counts.inactive).toBe(0);
  });
});

describe("Inactive, the end of the line (Oct 1 2026)", () => {
  const nothing = { state: "none" as const, day: null };
  const mark = (extra: Partial<InactiveMark> = {}): InactiveMark => ({
    clientId: "eowyn",
    reason: "moved",
    note: null,
    day: "2026-09-20",
    markedBy: { id: "uid-leader", name: "Beregond Leader" },
    markedAt: null,
    ...extra,
  });

  it("walks the line: Lapsed at 45 days, Inactive by herself at the studio's 90, nothing booked", () => {
    // 89 days out: still Lapsed.
    expect(journeyOf(input({ lastVisit: "2026-07-01", next: nothing })).state).toBe("lapsed");
    // 90 days out: Inactive, since the day she crossed the line.
    const j = journeyOf(input({ lastVisit: "2026-06-30", next: nothing }));
    expect(j.state).toBe("inactive");
    expect(j.crossed).toBe("inactive-line");
    expect(j.since).toBe("2026-09-28");
    expect(j.inactive).toEqual({ kind: "automatic", since: "2026-09-28", mark: null });
    expect(j.why).toBe("90 days since her last visit, past the studio's 90-day line, and nothing is booked: inactive by herself.");
  });

  it("holds a client to the studio's own Inactive line", () => {
    const lines = { ...APP_LINES, inactiveDays: 120 };
    expect(journeyOf(input({ lastVisit: "2026-06-30", next: nothing, lines })).state).toBe("lapsed");
    expect(journeyOf(input({ lastVisit: "2026-05-31", next: nothing, lines })).state).toBe("inactive");
  });

  it("reads Back when she books again after going inactive by herself", () => {
    const j = journeyOf(input({ lastVisit: "2026-05-01", next: { state: "booked", day: "2026-10-02" } }));
    expect(j.state).toBe("back");
    expect(j.inactive).toBeNull();
  });

  it("never makes Away inactive by herself, however long she has been gone", () => {
    const away = snap({ situation: "away", awayReason: "Snowbird", awayUntil: "2026-12-01" } as Partial<RenewalSnapshot>);
    expect(journeyOf(input({ snapshot: away, lastVisit: "2026-05-01", next: nothing })).state).toBe("away");
  });

  it("stays Unknown when Journey can't judge her, never Inactive off what it doesn't know", () => {
    // No last visit on record (her history is before the bookings began syncing).
    expect(journeyOf(input({ lastVisit: null, next: nothing })).state).toBe("unknown");
    // Last night's record hasn't reached her, or has stopped changing.
    expect(journeyOf(input({ snapshot: null, lastVisit: "2026-05-01", next: nothing })).state).toBe("unknown");
    expect(journeyOf(input({ nightlyStale: true, lastVisit: "2026-05-01", next: nothing })).state).toBe("unknown");
    // Her bookings couldn't be read: whether she is inactive can't be said.
    const unread = journeyOf(input({ lastVisit: "2026-05-01", next: { state: "unknown", day: null } }));
    expect(unread.state).toBe("unknown");
    expect(unread.unknownWhy).toBe("bookings-unread");
  });

  it("is Inactive when a leader marked her, whatever the lines say, signed and dated", () => {
    const j = journeyOf(input({ lastVisit: "2026-09-12", next: nothing, mark: mark({ note: "Back in the spring" }) }));
    expect(j.state).toBe("inactive");
    expect(j.crossed).toBe("marked");
    expect(j.since).toBe("2026-09-20");
    expect(j.inactive?.kind).toBe("manual");
    expect(j.inactive?.mark?.reason).toBe("moved");
    expect(j.why).toBe("Marked inactive by Beregond Leader on Sun, Sep 20: Moved away: Back in the spring.");
    // A person said so: even with no nightly record, or Away, or bookings unread.
    expect(journeyOf(input({ snapshot: null, lastVisit: null, next: nothing, mark: mark() })).state).toBe("inactive");
    expect(journeyOf(input({ lastVisit: "2026-09-12", next: { state: "unknown", day: null }, mark: mark() })).state).toBe("inactive");
  });

  it("reads Back when a marked client books again, and lets the rules decide once she visits after the mark", () => {
    const booked = journeyOf(input({ lastVisit: "2026-09-12", next: { state: "booked", day: "2026-10-01" }, mark: mark() }));
    expect(booked.state).toBe("back");
    expect(booked.why).toContain("booked again since: she's back");
    // She came in on the 26th, after the mark of the 20th: the mark no longer holds.
    const visited = journeyOf(input({ lastVisit: "2026-09-26", next: { state: "booked", day: "2026-09-30" }, mark: mark() }));
    expect(visited.state).toBe("steady");
    expect(visited.inactive).toBeNull();
  });
});
