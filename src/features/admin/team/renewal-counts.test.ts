import { describe, expect, it } from "vitest";
import type { OutcomeRow } from "../../renewals/rates";
import { chanceRange, checkLine, howWeCheck, renewalCounts } from "./renewal-counts";

const NAMES: Record<string, string> = { t1: "Imrahil Prince", t2: "Ioreth Healer", t3: "Beregond Guard", t4: "Bergil Guard" };
const nameOf = (id: string) => NAMES[id] ?? "A former trainer";
const RULE = { payAsYouGoCountsAs: "retained" as const };

let n = 0;
const rows = (trainer: string | null, kept: number, lost: number, keptAs: OutcomeRow["outcome"] = "renewed"): OutcomeRow[] => [
  ...Array.from({ length: kept }, () => ({ cycleKey: `c${n++}`, outcome: keptAs, primaryTrainerId: trainer })),
  ...Array.from({ length: lost }, () => ({ cycleKey: `c${n++}`, outcome: "lost" as const, primaryTrainerId: trainer })),
];

describe("what chance alone gives", () => {
  it("is the binomial's 2.5th to 97.5th percentile, worked out exactly", () => {
    // The blueprint's own example: 23 of 30 kept across the studio, a trainer with 9.
    expect(chanceRange(9, 23 / 30)).toEqual({ low: 4, high: 9 });
    expect(chanceRange(20, 0.5)).toEqual({ low: 6, high: 14 });
    // Large numbers never underflow to a stuck zero.
    expect(chanceRange(1000, 0.77)).toEqual({ low: 744, high: 796 });
    expect(chanceRange(0, 0.5)).toEqual({ low: 0, high: 0 });
  });
});

describe("renewals by trainer", () => {
  // 32 renewal points, 18 kept: p = 0.5625.
  const quarter = [...rows("t1", 10, 2), ...rows("t2", 2, 8), ...rows("t3", 0, 4), ...rows("t4", 3, 0), ...rows("t4", 1, 0, "pay-as-you-go"), ...rows(null, 2, 0)];

  it("counts every trainer in name order, a rate only from ten, and who has no trainer on record", () => {
    const c = renewalCounts(quarter, RULE, nameOf);
    expect(c.studio).toEqual({ points: 32, kept: 18 });
    expect(c.unattributed).toBe(2);
    expect(c.rows.map((r) => [r.name, r.points, r.kept, r.rate])).toEqual([
      ["Beregond Guard", 4, 0, null],
      ["Bergil Guard", 4, 4, null],
      ["Imrahil Prince", 12, 10, "83%"],
      ["Ioreth Healer", 10, 2, "20%"],
    ]);
  });

  it("calls out only a count outside the range chance gives for that number", () => {
    const c = renewalCounts(quarter, RULE, nameOf);
    expect(c.rows.find((r) => r.name === "Imrahil Prince")).toMatchObject({ range: { low: 3, high: 10 }, outside: null });
    expect(c.rows.find((r) => r.name === "Ioreth Healer")).toMatchObject({ range: { low: 3, high: 9 }, outside: "below" });
    expect(checkLine(c)).toBe("Ioreth Healer's 2 of 10 is outside the range chance alone gives for 10 renewal points (3 to 9). Worth a conversation, not a judgment.");
    expect(howWeCheck(c)).toBe(
      "With 18 of 32 kept across the studio, chance alone lets a trainer with 12 renewal points land anywhere from 3 to 10. Imrahil Prince's 10 of 12 sits inside that range, so it says nothing about them yet. A count outside the range is worth a conversation, not a judgment. Chance alone is the studio's own share kept this quarter. Nobody is called out below 5 renewal points: a range that wide says nothing about a person.",
    );
  });

  it("never calls out someone with fewer than five renewal points, however far off", () => {
    // p = 0.9: four lost of four is far below what chance gives, and still says nothing about a person.
    const few = renewalCounts([...rows("t1", 18, 0), ...rows("t3", 0, 4)], RULE, nameOf);
    expect(few.rows.find((r) => r.name === "Beregond Guard")).toMatchObject({ points: 4, kept: 0, outside: null });
    const five = renewalCounts([...rows("t1", 18, 0), ...rows("t3", 0, 5)], RULE, nameOf);
    expect(five.rows.find((r) => r.name === "Beregond Guard")).toMatchObject({ points: 5, kept: 0, outside: "below" });
  });

  it("makes no check below ten renewal points across the studio, or when every one went the same way", () => {
    const small = renewalCounts(rows("t1", 2, 1), RULE, nameOf);
    expect(small.p).toBeNull();
    expect(small.rows[0].range).toBeNull();
    expect(checkLine(small)).toBe("The chance check needs 10 renewal points across the studio this quarter. There are 3.");
    const all = renewalCounts(rows("t1", 12, 0), RULE, nameOf);
    expect(checkLine(all)).toBe("Every renewal point this quarter went the same way, so there is nothing to check a trainer against.");
  });

  it("follows the studio's pay-as-you-go rule", () => {
    const lostRule = renewalCounts([...rows("t4", 1, 0, "pay-as-you-go")], { payAsYouGoCountsAs: "lost" }, nameOf);
    expect(lostRule.rows[0]).toMatchObject({ points: 1, kept: 0 });
  });
});
