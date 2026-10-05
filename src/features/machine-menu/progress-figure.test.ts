import { describe, expect, it } from "vitest";
import { TODAY, averyRead } from "./fixtures";
import {
  STARTING_WEIGHT_LABEL,
  gainWords,
  progressFigure,
  progressFromModel,
  progressFromSets,
  progressWords,
  startWords,
} from "./progress-figure";
import { buildTimelineModel } from "./timeline-model";

function avery(from: number) {
  return buildTimelineModel({
    machineId: "leg-press",
    machineName: "Leg Press",
    ...averyRead(from),
    today: TODAY,
    history: [],
    journal: [],
  });
}

describe("the start is the starting weight on file (AJ, Q2 (a))", () => {
  it("counts 80 → 100 as +25%, labelled Starting weight", () => {
    const fig = progressFigure({ startingWeight: 80, firstCounted: 84, lastCounted: 100, everythingRead: true })!;
    expect(fig).toMatchObject({ start: 80, source: "on-file", last: 100, gain: 25, up: true });
    expect(startWords(fig)).toBe("Starting weight 80 lb");
    expect(gainWords(fig)).toBe("+25%");
    expect(progressWords(fig)).toBe("Starting weight 80 lb, +25%");
  });

  it("is the same in a session whose early sessions aren't loaded", () => {
    for (const from of [42, 21, 1]) {
      const fig = progressFromModel(avery(from), 80, "partial");
      expect(progressWords(fig)).toBe("Starting weight 80 lb, +25%");
    }
  });

  it("is never labelled First in Journey for a typed start, whatever the coverage", () => {
    for (const coverage of ["complete", "partial", "unknown"] as const) {
      const fig = progressFigure({ startingWeight: 80, lastCounted: 100, everythingRead: true, coverage })!;
      expect(fig.startLabel).toBe(STARTING_WEIGHT_LABEL);
      expect(startWords(fig)).not.toMatch(/First in Journey|First performed|Started/);
    }
  });

  it("reads an old row's numeric string, and ignores a start that can't be counted from", () => {
    expect(progressFigure({ startingWeight: "80", lastCounted: 100, everythingRead: false })?.gain).toBe(25);
    for (const bad of [0, -5, "", "heavy", null, undefined, Number.NaN]) {
      expect(progressFigure({ startingWeight: bad, firstCounted: 84, lastCounted: 100, everythingRead: false })).toBeNull();
    }
  });
});

describe("the fallback: the first counted set, only when everything has been read", () => {
  it("shows no % when the start is unknown and older sessions are unread", () => {
    expect(progressFigure({ firstCounted: 84, lastCounted: 100, everythingRead: false })).toBeNull();
    expect(progressFromModel(avery(42), undefined, "partial")).toBeNull();
    expect(progressFromModel(avery(21), null, "partial")).toBeNull();
  });

  it("counts from Journey's first counted set once every session is read: 84 → 100 is +19%", () => {
    const fig = progressFromModel(avery(1), undefined, "partial")!;
    expect(fig).toMatchObject({ start: 84, source: "first-counted", last: 100, gain: 19, up: true });
    expect(progressWords(fig)).toBe("First in Journey 84 lb, +19%");
  });

  it("takes the history words' label for a client Journey holds the whole story of", () => {
    const fig = progressFigure({ firstCounted: 84, lastCounted: 100, everythingRead: true, coverage: "complete" })!;
    expect(startWords(fig)).toBe("First performed 84 lb");
  });

  it("skips practice, skips and today's set: only counted columns move it", () => {
    const model = buildTimelineModel({
      machineId: "m",
      machineName: "Torso Rotation",
      sessions: [
        { id: "a", date: "2026-09-08", status: "Completed" },
        { id: "b", date: "2026-09-17", status: "Completed" },
        { id: "c", date: "2026-10-01", status: "Completed" },
        { id: "d", date: TODAY, status: "In-Progress" },
      ],
      logs: [
        { sessionId: "a", machineId: "m", weight: "30", reps: "12", outcome: "practice" },
        { sessionId: "b", machineId: "m", weight: "40", reps: "10", outcome: "performed" },
        { sessionId: "c", machineId: "m", outcome: "skipped", skipReason: "pain_injury" },
        { sessionId: "d", machineId: "m", weight: "60", reps: "8", outcome: "performed" },
      ],
      today: TODAY,
      runningSessionId: "d",
      everythingRead: true,
      moreToLoad: false,
      history: [],
      journal: [],
    });
    const fig = progressFromModel(model, undefined, "partial")!;
    expect(fig).toMatchObject({ start: 40, last: 40, gain: 0, up: false });
  });
});

describe("shown only when up (the Now Bar's rule)", () => {
  it("keeps the start but no % when the weight is level or down", () => {
    const level = progressFigure({ startingWeight: 100, lastCounted: 100, everythingRead: false })!;
    expect([level.gain, level.up, gainWords(level), progressWords(level)]).toEqual([0, false, null, null]);
    expect(startWords(level)).toBe("Starting weight 100 lb");
    const down = progressFigure({ startingWeight: 100, lastCounted: 90, everythingRead: false })!;
    expect([down.gain, down.up, progressWords(down)]).toEqual([-10, false, null]);
  });

  it("rounds to a whole percent and never shows +0%", () => {
    expect(progressFigure({ startingWeight: 300, lastCounted: 301, everythingRead: false })).toMatchObject({ gain: 0, up: false });
    expect(gainWords(progressFigure({ startingWeight: 40, lastCounted: 42, everythingRead: false }))).toBe("+5%");
  });

  it("has a start and no % before anything has been counted", () => {
    const fig = progressFigure({ startingWeight: 80, everythingRead: false })!;
    expect([fig.last, fig.gain, fig.up, progressWords(fig)]).toEqual([null, null, false, null]);
    expect(startWords(fig)).toBe("Starting weight 80 lb");
    expect(gainWords(null)).toBeNull();
    expect(progressWords(null)).toBeNull();
  });
});

describe("the Now Bar's door: the grid's performed sets", () => {
  it("gives the same figure as the card", () => {
    const sets = [84, 86, 90, 94, 100].map((weight) => ({ weight }));
    expect(progressWords(progressFromSets(sets, { startingWeight: 80, everythingRead: false }))).toBe("Starting weight 80 lb, +25%");
    expect(progressFromSets(sets, { everythingRead: false })).toBeNull();
    expect(progressWords(progressFromSets(sets, { everythingRead: true, coverage: "partial" }))).toBe("First in Journey 84 lb, +19%");
    expect(progressFromSets([], { everythingRead: true })).toBeNull();
  });
});
