import { describe, it, expect } from "vitest";
import { byMonth, conversationDueDate, horizonEnd, laneOf, matchesFilter, nextStep, sortRows, type PipelineRow } from "./pipeline";
import { DEFAULT_RENEWAL_SETTINGS } from "./settings";
import type { RenewalCycle, RenewalSnapshot } from "./types";

const TODAY = "2026-09-11";
const S = DEFAULT_RENEWAL_SETTINGS;

function snap(over: Partial<RenewalSnapshot>): RenewalSnapshot {
  return {
    situation: "on-track",
    conversationDue: false,
    chargeWarning: false,
    focusDate: "2026-11-14",
    chargeDate: "2026-11-14",
    sessionsLeft: 20,
    pacePerWeek: 2,
    awayUntil: null,
    flags: [],
    proof: { weeksAttended: 11, weeksObserved: 12, machinesImproved: 5, machinesTracked: 6, bestGain: null, inbody: null },
    packageKey: "committed",
    ...over,
  } as RenewalSnapshot;
}

const talked = { lastTouchAt: new Date(), latestConcerns: ["price"], needsLeader: false } as unknown as RenewalCycle;

describe("lanes", () => {
  it("puts a will-bank client inside the window before the charge", () => {
    expect(laneOf(snap({ situation: "will-bank", chargeWarning: true }), null, S, TODAY)).toBe("before-charge");
  });

  it("puts a due conversation and an ended package in talk-now, until decided", () => {
    expect(laneOf(snap({ conversationDue: true }), null, S, TODAY)).toBe("talk-now");
    expect(laneOf(snap({ situation: "ended", focusDate: "2026-09-01" }), null, S, TODAY)).toBe("talk-now");
    expect(laneOf(snap({ conversationDue: true }), { stage: "decided" } as RenewalCycle, S, TODAY)).toBe("coming-up");
    // Decided on an ended package: nothing coming up about it.
    expect(laneOf(snap({ situation: "ended", focusDate: "2026-09-01" }), { stage: "decided" } as RenewalCycle, S, TODAY)).toBeNull();
  });

  it("follows the outcome once one is recorded", () => {
    const due = snap({ conversationDue: true });
    const ended = snap({ situation: "ended", focusDate: "2026-09-01" });
    expect(laneOf(due, { outcome: "upgraded" } as RenewalCycle, S, TODAY)).toBeNull();
    expect(laneOf(ended, { outcome: "lost", outcomeBy: "leader" } as RenewalCycle, S, TODAY)).toBe("lapsed");
    expect(laneOf(ended, { outcome: "pay-as-you-go" } as RenewalCycle, S, TODAY)).toBe("lapsed");
    expect(nextStep(ended, { outcome: "pay-as-you-go" } as RenewalCycle, S, TODAY)).toBe("On single sessions — offer a package");
    expect(nextStep(due, { outcome: "renewed" } as RenewalCycle, S, TODAY)).toBe("Renewal recorded");
    // Signed in Mindbody before tonight's job could record it: already off the list.
    expect(
      laneOf(
        snap({ situation: "will-bank", chargeWarning: true, renewalOnBooks: { cycleKey: "2", packageKey: "committed", startsOn: "2026-11-15" } }),
        null,
        S,
        TODAY,
      ),
    ).toBeNull();
  });

  it("plans ahead inside the studio's horizon only", () => {
    expect(horizonEnd(S, TODAY)).toBe("2026-12-11");
    expect(laneOf(snap({ focusDate: "2026-12-01" }), null, S, TODAY)).toBe("coming-up");
    expect(laneOf(snap({ focusDate: "2027-03-01" }), null, S, TODAY)).toBeNull();
  });

  it("keeps the lapsed list to the last six months", () => {
    expect(laneOf(snap({ situation: "lapsed", focusDate: "2026-07-01" }), null, S, TODAY)).toBe("lapsed");
    expect(laneOf(snap({ situation: "lapsed", focusDate: "2025-12-01" }), null, S, TODAY)).toBeNull();
  });

  it("never places a client the app knows nothing about", () => {
    expect(laneOf(snap({ situation: "unknown", focusDate: null }), null, S, TODAY)).toBeNull();
  });
});

describe("next step", () => {
  it("says what to do next, in words", () => {
    expect(nextStep(snap({ conversationDue: true }), null, S, TODAY)).toBe("Start the conversation");
    expect(nextStep(snap({ conversationDue: true }), talked, S, TODAY)).toBe("Keep the conversation going");
    expect(nextStep(snap({ situation: "will-bank", chargeWarning: true }), null, S, TODAY)).toBe(
      "Talk before Nov 14, then decide in Mindbody about the renewal",
    );
    expect(nextStep(snap({}), { ...talked, needsLeader: true }, S, TODAY)).toBe("A leader was asked to follow up");
  });

  it("projects when the 10-sessions conversation comes due", () => {
    // 20 left, due at 10, 2 a week: 5 weeks.
    expect(conversationDueDate(snap({}), S, TODAY)).toBe("2026-10-16");
    expect(nextStep(snap({}), null, S, TODAY)).toBe("Conversation due around Oct 16");
    expect(conversationDueDate(snap({ sessionsLeft: 8 }), S, TODAY)).toBeNull();
  });
});

describe("filters and grouping", () => {
  const row = (over: Partial<PipelineRow>): PipelineRow => ({
    clientId: "c",
    name: "A",
    snapshot: snap({}),
    cycle: null,
    lane: "coming-up",
    ...over,
  });

  it("filters by what the leader is looking for", () => {
    expect(matchesFilter(row({ cycle: talked }), "price", S)).toBe(true);
    expect(matchesFilter(row({}), "not-talked", S)).toBe(true);
    expect(matchesFilter(row({}), "upgrade", S)).toBe(true);
    expect(matchesFilter(row({}), "needs-leader", S)).toBe(false);
  });

  it("groups coming-up by month, soonest first", () => {
    const groups = byMonth([
      row({ clientId: "b", name: "B", snapshot: snap({ focusDate: "2026-11-02" }) }),
      row({ clientId: "a", name: "A", snapshot: snap({ focusDate: "2026-10-20" }) }),
      row({ clientId: "c", name: "C", snapshot: snap({ focusDate: "2026-10-05" }) }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["October 2026", "November 2026"]);
    expect(groups[0].rows.map((r) => r.clientId)).toEqual(["c", "a"]);
    expect(sortRows([row({ name: "Z", snapshot: snap({ focusDate: null }) }), row({ name: "Y" })])[0].name).toBe("Y");
  });
});
