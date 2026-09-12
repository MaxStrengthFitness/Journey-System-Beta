import { describe, it, expect } from "vitest";
import {
  enoughToShow,
  groupTallies,
  isKept,
  quarterOf,
  rateText,
  recentQuarters,
  tallyOutcomes,
  type OutcomeRow,
} from "./rates";

const row = (outcome: OutcomeRow["outcome"], packageKey = "committed", primaryTrainerId: string | null = "ann"): OutcomeRow => ({
  cycleKey: Math.random().toString(36).slice(2),
  outcome,
  packageKey,
  primaryTrainerId,
  closedOn: "2026-08-01",
});

describe("renewal rates", () => {
  it("counts pay-as-you-go the way the studio chose", () => {
    expect(isKept("pay-as-you-go", { payAsYouGoCountsAs: "retained" })).toBe(true);
    expect(isKept("pay-as-you-go", { payAsYouGoCountsAs: "lost" })).toBe(false);
    expect(isKept("downgraded", { payAsYouGoCountsAs: "lost" })).toBe(true);
    expect(isKept("lost", { payAsYouGoCountsAs: "retained" })).toBe(false);
  });

  it("tallies what was recorded, and ignores cycles without an outcome", () => {
    const t = tallyOutcomes(
      [row("renewed"), row("upgraded"), row("pay-as-you-go"), row("lost"), row(null)],
      { payAsYouGoCountsAs: "retained" },
    );
    expect(t).toEqual({ total: 4, renewed: 1, upgraded: 1, downgraded: 0, payAsYouGo: 1, lost: 1, kept: 3, keptRate: 0.75 });
    expect(rateText(t)).toBe("75%");
    expect(rateText(tallyOutcomes([], { payAsYouGoCountsAs: "retained" }))).toBe("—");
  });

  it("groups by trainer, biggest first, and holds back small samples", () => {
    const rows = [
      ...Array.from({ length: 5 }, () => row("renewed", "committed", "ann")),
      row("lost", "trial", "bo"),
      row("renewed", "trial", null),
    ];
    const groups = groupTallies(rows, (r) => r.primaryTrainerId, { payAsYouGoCountsAs: "retained" });
    expect(groups.map((g) => [g.key, g.tally.total])).toEqual([
      ["ann", 5],
      ["bo", 1],
      [null, 1],
    ]);
    expect(enoughToShow(groups[0].tally)).toBe(true);
    expect(enoughToShow(groups[1].tally)).toBe(false);
  });
});

describe("across studios", () => {
  it("counts each row by its own studio's pay-as-you-go rule", () => {
    const rows = [
      { ...row("pay-as-you-go"), studioId: "solon" },
      { ...row("pay-as-you-go"), studioId: "avon" },
    ];
    const t = tallyOutcomes(rows, (r) => (r.studioId === "avon" ? "lost" : "retained"));
    expect(t.kept).toBe(1);
    expect(t.keptRate).toBe(0.5);
  });
});

describe("quarters", () => {
  it("knows the quarter a day falls in", () => {
    expect(quarterOf("2026-09-11")).toEqual({ key: "2026-Q3", label: "Jul–Sep 2026", from: "2026-07-01", to: "2026-09-30" });
    expect(quarterOf("2026-01-01").to).toBe("2026-03-31");
  });

  it("lists this quarter and the ones before it, across a new year", () => {
    expect(recentQuarters("2026-02-10", 3).map((q) => q.key)).toEqual(["2026-Q1", "2025-Q4", "2025-Q3"]);
  });
});
