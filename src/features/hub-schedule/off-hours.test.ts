/**
 * When a trainer isn't on: hatched only from an AGREED week or a day away,
 * never from a proposal, a missing week or a failed read.
 */
import { describe, expect, it } from "vitest";
import type { StandingWeekDoc } from "../standing-week/week";
import { outside, trainerDayFrame, weeksByTrainer } from "./off-hours";

const t = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const RANGE = { from: t("07:00"), to: t("17:00") };
const MONDAY = "2026-09-28";

const doc = (over: Partial<StandingWeekDoc> = {}): StandingWeekDoc => ({
  id: "uid-mablung",
  studioId: "westlake",
  trainerUid: "uid-mablung",
  trainerId: "t-mablung",
  trainerName: "Mablung",
  proposed: null,
  final: { hours: [{ weekday: 1, from: "07:00", to: "12:30" }, { weekday: 1, from: "14:00", to: "16:00" }], regulars: [] },
  away: [],
  ...over,
});

describe("the stretches outside a trainer's blocks", () => {
  it("fills the range around the blocks, merging overlaps and clipping to the range", () => {
    expect(outside([{ from: t("09:00"), to: t("10:00") }, { from: t("09:30"), to: t("11:00") }], RANGE)).toEqual([
      { from: t("07:00"), to: t("09:00") },
      { from: t("11:00"), to: t("17:00") },
    ]);
    expect(outside([{ from: t("06:00"), to: t("18:00") }], RANGE)).toEqual([]);
    expect(outside([], RANGE)).toEqual([RANGE]);
  });
});

describe("a trainer's day on the grid", () => {
  it("hatches outside the day's agreed blocks", () => {
    expect(trainerDayFrame(doc(), MONDAY, 1, RANGE)).toEqual({
      kind: "week",
      off: [
        { from: t("12:30"), to: t("14:00") },
        { from: t("16:00"), to: t("17:00") },
      ],
    });
  });

  it("hatches all day on a weekday the agreed week doesn't take clients", () => {
    expect(trainerDayFrame(doc(), "2026-09-29", 2, RANGE)).toEqual({ kind: "week", off: [RANGE] });
  });

  it("says a day away, from the trainer's own record, even with no agreed week", () => {
    const away = doc({ final: null, away: [{ id: "a1", from: "2026-09-27", to: "2026-10-03", note: "Rivendell" }] });
    expect(trainerDayFrame(away, MONDAY, 1, RANGE)).toEqual({ kind: "away", note: "Rivendell" });
  });

  it("claims nothing without an agreed week: a proposal, a missing week or a failed read is unknown", () => {
    expect(trainerDayFrame(doc({ final: null, proposed: { hours: [], regulars: [] } }), MONDAY, 1, RANGE)).toEqual({ kind: "unknown" });
    expect(trainerDayFrame(null, MONDAY, 1, RANGE)).toEqual({ kind: "unknown" });
  });

  it("finds each week by the trainer it belongs to", () => {
    expect(weeksByTrainer([doc()]).get("t-mablung")?.trainerName).toBe("Mablung");
  });
});
