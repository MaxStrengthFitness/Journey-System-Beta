import { describe, expect, it } from "vitest";
import { ownedWindow } from "../../lib/history-claims";
import { CUTOVER, LEG_PRESS_FIELDS, LEG_PRESS_HISTORY, LEG_PRESS_JOURNAL, STUDIO, TODAY, averyRead } from "./fixtures";
import { parseSettingHistory } from "./setting-history";
import { countedRuns, stepRuns } from "./step-runs";
import { buildTimelineModel, type TimelineLogInput, type TimelineSessionInput } from "./timeline-model";

function avery(from: number) {
  return buildTimelineModel({
    machineId: "leg-press",
    machineName: "Leg Press",
    fields: LEG_PRESS_FIELDS,
    ...averyRead(from),
    today: TODAY,
    unitStudioId: STUDIO,
    history: parseSettingHistory(LEG_PRESS_HISTORY, "avery"),
    journal: LEG_PRESS_JOURNAL,
    window: ownedWindow({ coverage: "partial", cutover: CUTOVER }),
  });
}

describe("Weight by weight", () => {
  it("makes Avery's fourteen runs, breaking at weight changes, the fold and the set-up changes", () => {
    const runs = stepRuns(avery(1));
    expect(countedRuns(runs)).toBe(14);
    expect(runs.map((r) => [r.weight, r.items.length])).toEqual([
      [84, 3],
      [86, 3],
      [88, 4],
      [90, 2],
      [90, 2],
      [92, 3],
      [94, 4],
      [96, 3],
      [98, 1],
      [92, 1],
      [94, 1],
      [96, 2],
      [98, 2],
      [100, 3],
    ]);
  });

  it("says what broke a run: the set-up change at the second 90, the fold before 92, the back pad at 98", () => {
    const runs = stepRuns(avery(1));
    expect(runs[4].before.map((d) => d.kind)).toEqual(["setup"]);
    expect(runs[9].before.map((d) => d.kind)).toEqual(["fold"]);
    expect(runs[12].before.map((d) => d.kind)).toEqual(["setup"]);
    expect(runs[1].before).toEqual([]);
  });

  it("notes practice and skips with the run they fell in, never counting them", () => {
    const runs = stepRuns(avery(1));
    expect(runs[3].extras.map((c) => [c.day, c.practice])).toEqual([["2026-01-03", "bloodFlow"]]);
    expect(runs[5].extras.map((c) => [c.day, c.outcome])).toEqual([["2026-02-11", "skipped"]]);
    expect(runs[5].items).toHaveLength(3);
    // The hold counts at its weight, by itself, never averaged.
    expect(runs[6].items.map((c) => (c.isHold ? `held ${c.seconds}` : c.reps))).toEqual([8, "held 90", 9, 11]);
  });

  it("counts what each door has read", () => {
    expect(countedRuns(stepRuns(avery(21)))).toBe(11);
    expect(countedRuns(stepRuns(avery(42)))).toBe(8);
  });

  it("leaves today's column to the Now Bar, and gives uncounted columns before any counted one a line of their own", () => {
    const sessions: TimelineSessionInput[] = [
      { id: "a", date: "2026-09-01", status: "Completed" },
      { id: "b", date: "2026-09-08", status: "Completed" },
      { id: "t", date: TODAY, status: "In-Progress" },
    ];
    const logs: TimelineLogInput[] = [
      { sessionId: "a", machineId: "m", weight: "60", reps: "12", outcome: "practice" },
      { sessionId: "b", machineId: "m", weight: "80", reps: "9" },
      { sessionId: "t", machineId: "m", weight: "82", reps: "8" },
    ];
    const m = buildTimelineModel({
      machineId: "m",
      machineName: "Leg Press",
      sessions,
      logs,
      today: TODAY,
      runningSessionId: "t",
      everythingRead: true,
      moreToLoad: false,
      history: [],
      journal: [],
    });
    const runs = stepRuns(m);
    expect(runs.map((r) => [r.weight, r.items.map((c) => c.sessionId), r.extras.map((c) => c.sessionId)])).toEqual([
      [null, [], ["a"]],
      [80, ["b"], []],
    ]);
    expect(countedRuns(runs)).toBe(1);
  });
});
