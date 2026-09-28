import { describe, expect, it } from "vitest";
import type { RenewalSnapshot } from "../../renewals/types";
import { DRIFT_MIN_DAYS, LAPSED_DAYS, NEW_MAX, countStates, driftLine, journeyOf, stageOf, type JourneyInput } from "./states";

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
  ...extra,
});

describe("the lines", () => {
  it("drifts at twice her usual gap, never under a week", () => {
    expect(driftLine(3.5)).toBe(7);
    expect(driftLine(2)).toBe(DRIFT_MIN_DAYS);
    expect(driftLine(7)).toBe(14);
  });

  it("puts a quotable total on the stages", () => {
    expect(stageOf(4)).toBe("new");
    expect(stageOf(NEW_MAX)).toBe("new");
    expect(stageOf(11)).toBe("settling");
    expect(stageOf(25)).toBeNull();
    expect(stageOf(null)).toBeNull();
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
    expect(lapsed.why).toContain(`past the ${LAPSED_DAYS}-day line`);
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

  it("counts every state, the empty ones as zero", () => {
    const counts = countStates([journeyOf(input()), journeyOf(input({ lastVisit: "2026-09-18", next: { state: "none", day: null } }))]);
    expect(counts.steady).toBe(1);
    expect(counts.drifting).toBe(1);
    expect(counts.lapsed).toBe(0);
  });
});
