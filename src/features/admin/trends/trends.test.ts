import { describe, expect, it } from "vitest";
import type { Client } from "../../../types";
import type { OutcomeRow, OutcomeTally } from "../../renewals/rates";
import type { JourneyEntry } from "../journey/journey-list";
import { LOST_REASONS_MIN, RATE_MIN, STUDIO_AVERAGE_MIN, longerPackageLine, lostReasonsLine, renewalOutcomesLine, startGroups, startGroupsLine, studioRhythmLine } from "./trends";

const tally = (over: Partial<OutcomeTally>): OutcomeTally => ({ total: 0, renewed: 0, upgraded: 0, downgraded: 0, payAsYouGo: 0, lost: 0, kept: 0, keptRate: null, ...over });

describe("renewal outcomes", () => {
  it("shows counts under the minimum, and a rate from it", () => {
    const few = renewalOutcomesLine(tally({ total: 4, renewed: 3, lost: 1, kept: 3 }), "Jul–Sep 2026");
    expect(few.say).toBe("4 renewal points closed this quarter: 3 renewed, 0 on a longer package, 0 on a shorter one, 0 pay-as-you-go, 1 lost.");
    expect(few.min).toBe(`A rate appears from ${RATE_MIN} renewal points. There are 4.`);
    expect(few.ready).toBe(false);
    const many = renewalOutcomesLine(tally({ total: 30, renewed: 19, upgraded: 4, payAsYouGo: 3, lost: 4, kept: 23 }), "Jul–Sep 2026");
    expect(many.say).toBe("Of 30 renewal points this quarter, 23 were kept (77%): 19 renewed, 4 on a longer package, 0 on a shorter one, 3 pay-as-you-go, 4 lost.");
    expect(many.ready).toBe(true);
    expect(renewalOutcomesLine(null, "Jul–Sep 2026").say).toContain("couldn't be read");
  });

  it("compares a longer package with last quarter only when both have ten renewals", () => {
    expect(longerPackageLine(tally({ renewed: 19, upgraded: 4 }), tally({ renewed: 17, upgraded: 2 })).say).toBe("4 of 23 renewals this quarter moved to a longer package (17%); last quarter 2 of 19 (11%).");
    const thin = longerPackageLine(tally({ renewed: 5, upgraded: 1 }), tally({ renewed: 17, upgraded: 2 }));
    expect(thin.ready).toBe(false);
    expect(thin.min).toContain("this quarter 6, last quarter 19");
  });
});

describe("start groups", () => {
  const entry = (id: string, since: string | null, daysSince: number | null): JourneyEntry =>
    ({
      id,
      client: { id, firstAppointmentDate: since } as unknown as Client,
      row: { coverage: "partial" },
      journey: { daysSince },
    }) as unknown as JourneyEntry;

  it("groups clients by the month Mindbody says they started, and counts who is still training", () => {
    const entries = [
      entry("a", "2026-07-08", 3),
      entry("b", "2026-07-20", 60),
      entry("c", "2026-07-22", null),
      entry("d", "2026-08-03", 2),
      entry("e", "2026-09-10", 1), // this month: not a full month yet
      entry("f", null, 2),
    ];
    const groups = startGroups(entries, "2026-09-28", "America/New_York");
    expect(groups.map((g) => [g.label, g.members, g.stillTraining, g.unknown])).toEqual([
      ["June", 0, 0, 0],
      ["July", 3, 1, 1],
      ["August", 1, 1, 0],
    ]);
    const line = startGroupsLine(groups);
    expect(line.say).toBe("3 started in July; 1 still training, 1 not known. 1 started in August; 1 still training.");
    expect(line.ready).toBe(false);
  });

  it("gives a share from ten in a group", () => {
    const ten = Array.from({ length: 10 }, (_, i) => entry(`c${i}`, "2026-08-05", i < 8 ? 5 : 70));
    expect(startGroupsLine(startGroups(ten, "2026-09-28")).say).toBe("Of the 10 who started in August, 8 are still training (80%).");
  });
});

describe("studio rhythm and lost reasons", () => {
  it(`averages only from ${STUDIO_AVERAGE_MIN} clients with a measured rhythm`, () => {
    const withRhythm = (gap: number) => ({ journey: { rhythm: { gapDays: gap } } }) as unknown as JourneyEntry;
    expect(studioRhythmLine([withRhythm(3.5), withRhythm(7)]).say).toBe("2 clients have a measured rhythm so far.");
    const thirty = Array.from({ length: 30 }, (_, i) => withRhythm(i % 2 ? 3.5 : 7));
    expect(studioRhythmLine(thirty).say).toBe("Clients with a measured rhythm average 1.5 sessions a week (30 clients).");
  });

  it(`breaks down what the lost were unsure about only from ${LOST_REASONS_MIN} lost, and says reasons aren't the whole story`, () => {
    const lost = (concerns: string[]): OutcomeRow => ({ cycleKey: Math.random().toString(), outcome: "lost", latestConcerns: concerns as never });
    expect(lostReasonsLine([lost(["price"])]).say).toBe("1 client was lost this quarter. That's fewer than 5, so no breakdown by reason yet.");
    const five = lostReasonsLine([lost(["price"]), lost(["price", "schedule"]), lost([]), lost(["price"]), lost(["health"])]);
    expect(five.say).toBe("5 clients were lost this quarter. What they were on the fence about at their last conversation: price 3, health 1, no reason noted 1, schedule 1.");
    expect(five.min).toBe("Reasons people give aren't always the whole story.");
    expect(lostReasonsLine(null).say).toContain("couldn't be read");
  });
});
