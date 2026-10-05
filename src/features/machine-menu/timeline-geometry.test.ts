import { describe, expect, it } from "vitest";
import { ownedWindow } from "../../lib/history-claims";
import { CUTOVER, LEG_PRESS_FIELDS, LEG_PRESS_HISTORY, LEG_PRESS_JOURNAL, STUDIO, TODAY, averyRead } from "./fixtures";
import { parseSettingHistory } from "./setting-history";
import {
  COL_W,
  FOLD_W,
  GUTTER_W,
  PHONE_INSET,
  WALL_W,
  allHoldsInView,
  capacityOf,
  chipSpots,
  columnAt,
  contentWidthOf,
  fitWindow,
  foldFlags,
  foldsInView,
  hairlinePairs,
  hitBands,
  layoutSlots,
  loadsInView,
  mergeMarkers,
  nearestColumnAt,
  needsOverview,
  newerWindow,
  newestWindow,
  noteX,
  olderWindow,
  overviewLayout,
  pinnedY,
  plotRows,
  plotWidthOf,
  repsFrame,
  repsInView,
  repsScale,
  scaleY,
  stepSegments,
  weightFrame,
  weightLabelIndexes,
  weightScale,
  windowAround,
  windowShowing,
} from "./timeline-geometry";
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

function small(rows: [string, Partial<TimelineLogInput>][]) {
  const sessions: TimelineSessionInput[] = rows.map(([day], i) => ({ id: `s${i}`, date: day, status: "Completed", hostedAtStudioId: STUDIO }));
  const logs: TimelineLogInput[] = rows.map(([, over], i) => ({ sessionId: `s${i}`, machineId: "m", weight: "100", reps: "10", ...over }));
  return buildTimelineModel({
    machineId: "m",
    machineName: "Leg Press",
    sessions,
    logs,
    today: TODAY,
    unitStudioId: STUDIO,
    everythingRead: true,
    moreToLoad: false,
    history: [],
    journal: [],
  });
}

const PORTRAIT_PLOT = plotWidthOf(contentWidthOf(760)); // 664

describe("width and capacity at 52px columns", () => {
  it("fits 12 at a 760px dialog (712 of content), 13 at 820, 11 on an iPad mini, 10 in the landscape column, 5 on a phone", () => {
    expect(contentWidthOf(760)).toBe(712);
    expect(PORTRAIT_PLOT).toBe(712 - GUTTER_W);
    expect(capacityOf(PORTRAIT_PLOT)).toBe(12);
    expect(capacityOf(plotWidthOf(contentWidthOf(820)))).toBe(13);
    expect(capacityOf(plotWidthOf(contentWidthOf(684)))).toBe(11);
    expect(capacityOf(560)).toBe(10);
    expect(contentWidthOf(390, PHONE_INSET)).toBe(358);
    expect(capacityOf(plotWidthOf(contentWidthOf(390, PHONE_INSET)))).toBe(5);
  });

  it("gives a fold its 36px", () => {
    expect(capacityOf(PORTRAIT_PLOT, 1)).toBe(Math.floor((PORTRAIT_PLOT - FOLD_W) / COL_W));
    expect(capacityOf(PORTRAIT_PLOT, 2)).toBe(11);
    expect(capacityOf(10)).toBe(0);
  });
});

describe("the window", () => {
  const m = avery(1);
  const folds = foldFlags(m);
  const n = m.columns.length;

  it("opens on the newest twelve, the fold taking its slot", () => {
    const w = newestWindow(n, folds, PORTRAIT_PLOT, true);
    expect(w).toEqual({ start: 24, end: 35, wall: false });
    expect(foldsInView(w, folds)).toBe(1);
  });

  it("pages back by capacity − 1, keeping one column for context, and forward the same way", () => {
    const newest = newestWindow(n, folds, PORTRAIT_PLOT, true);
    const older = olderWindow(newest, n, folds, PORTRAIT_PLOT, true);
    expect(older.end).toBe(newest.start);
    expect(older).toEqual({ start: 13, end: 24, wall: false });
    expect(newerWindow(older, n, folds, PORTRAIT_PLOT, true)).toEqual(newest);
  });

  it("crosses pages by itself for ‹ ›, and stays put when the column is in view", () => {
    const newest = newestWindow(n, folds, PORTRAIT_PLOT, true);
    expect(windowShowing(30, newest, n, folds, PORTRAIT_PLOT, true)).toBe(newest);
    const w = windowShowing(10, newest, n, folds, PORTRAIT_PLOT, true);
    expect(w.start <= 10 && w.end >= 10).toBe(true);
    const back = windowShowing(35, w, n, folds, PORTRAIT_PLOT, true);
    expect(back.end).toBe(35);
  });

  it("shows the start wall only beside the oldest column, giving up a column for it when it must", () => {
    const twelve = Array.from({ length: 12 }, () => false);
    expect(fitWindow(12, twelve, 11, PORTRAIT_PLOT, true)).toEqual({ start: 1, end: 11, wall: false });
    expect(olderWindow({ start: 1, end: 11, wall: false }, 12, twelve, PORTRAIT_PLOT, true)).toEqual({ start: 0, end: 1, wall: true });
    expect(fitWindow(12, twelve, 11, PORTRAIT_PLOT, false)).toEqual({ start: 0, end: 11, wall: false });
    expect(fitWindow(3, [false, false, false], 2, PORTRAIT_PLOT, true)).toEqual({ start: 0, end: 2, wall: true });
  });

  it("centres a tapped spot on the overview", () => {
    const w = windowAround(5, n, folds, PORTRAIT_PLOT, true);
    expect(w.start <= 5 && w.end >= 5).toBe(true);
    expect(w.end - 5).toBeGreaterThan(2);
  });

  it("has nothing to show for nothing", () => {
    expect(fitWindow(0, [], 0, PORTRAIT_PLOT, true)).toEqual({ start: -1, end: -1, wall: false });
  });
});

describe("slots: right-aligned, so the newest is always in the same place", () => {
  it("puts three columns against the right edge with the wall beside them and room on the left", () => {
    const layout = layoutSlots({ start: 0, end: 2, wall: true }, [false, false, false], PORTRAIT_PLOT);
    const right = GUTTER_W + PORTRAIT_PLOT;
    expect(layout.colX.get(2)).toBe(right - COL_W / 2);
    expect(layout.slots[0]).toMatchObject({ kind: "wall", w: WALL_W });
    expect(layout.left).toBe(right - 3 * COL_W - WALL_W);
    expect(layout.leftRoom).toBe(layout.left - GUTTER_W);
  });

  it("puts the newest column of a full window in the same place", () => {
    const m = avery(1);
    const folds = foldFlags(m);
    const full = layoutSlots(newestWindow(36, folds, PORTRAIT_PLOT, true), folds, PORTRAIT_PLOT);
    expect(full.colX.get(35)).toBe(GUTTER_W + PORTRAIT_PLOT - COL_W / 2);
    expect(full.slots.filter((s) => s.kind === "fold")).toHaveLength(1);
    expect(full.slots.filter((s) => s.kind === "col")).toHaveLength(12);
  });
});

describe("frames", () => {
  it("frames the weight to the performed loads in view, never under max(8 lb, 15% of the heaviest)", () => {
    expect(weightFrame([92, 94, 96, 98, 100])).toEqual({ min: 88.5, max: 103.5 });
    expect(weightFrame([40, 42])).toEqual({ min: 37, max: 45 });
    expect(weightFrame([20, 60])).toEqual({ min: 20, max: 60 });
    expect(weightFrame([])).toBeNull();
    // A 2 lb step is a small step: under a quarter of the panel.
    const y = scaleY(weightFrame([40, 42])!, 0, 100);
    expect(Math.abs(y(42) - y(40))).toBeLessThanOrEqual(25);
  });

  it("frames the reps to the client's own fewest and most in view, never under 4 reps", () => {
    expect(repsFrame([8, 9])).toEqual({ min: 6.5, max: 10.5 });
    expect(repsFrame([8, 12])).toEqual({ min: 8, max: 12 });
    expect(repsFrame([7, 13])).toEqual({ min: 7, max: 13 });
    expect(repsFrame([9])).toEqual({ min: 7, max: 11 });
    const f = repsFrame([8, 9])!;
    expect(f.max - f.min).toBeGreaterThanOrEqual(4);
  });

  it("reads the frames from performed sets only", () => {
    const m = avery(1);
    const view = { start: 10, end: 16, wall: false };
    expect(loadsInView(m.columns, view)).not.toContain(70);
    expect(repsInView(m.columns, view)).not.toContain(14);
  });

  it("pins a practice load outside the frame to its edge instead of stretching it", () => {
    const f = weightFrame([92, 100])!;
    const y = weightScale(f, 0, 112);
    expect(pinnedY(70, f, y)).toEqual({ y: y(f.min), pinned: "below" });
    expect(pinnedY(96, f, y).pinned).toBeNull();
  });

  it("keeps room for the labels above the top dot", () => {
    const y = weightScale({ min: 90, max: 100 }, 0, 112);
    expect(y(100)).toBeGreaterThanOrEqual(24);
    expect(y(90)).toBeLessThan(112);
    const r = repsScale({ min: 7, max: 11 }, 112, 104);
    expect(r(11)).toBeGreaterThan(112);
    expect(r(7)).toBeLessThan(216);
  });
});

describe("plot rows", () => {
  it("draws the hold row whenever the LOADED history mixes holds and reps, and the set-up lane when there is a change", () => {
    expect(plotRows(avery(1)).map((r) => [r.key, r.top, r.height])).toEqual([
      ["weight", 0, 112],
      ["reps", 112, 104],
      ["hold", 216, 36],
      ["setup", 252, 28],
      ["notes", 280, 40],
      ["dates", 320, 28],
    ]);
    expect(plotRows(avery(42)).map((r) => r.key)).toEqual(["weight", "reps", "setup", "notes", "dates"]);
    expect(plotRows(avery(42), { landscape: true }).map((r) => r.height)).toEqual([104, 96, 28, 40, 28]);
  });

  it("knows when every column in view is a hold", () => {
    const holds = small([
      ["2026-09-01", { reps: undefined, seconds: "60", isTSC: true }],
      ["2026-09-08", { reps: undefined, seconds: "75", isTSC: true }],
    ]);
    expect(allHoldsInView(holds.columns, { start: 0, end: 1, wall: false })).toBe(true);
    expect(allHoldsInView(avery(1).columns, { start: 18, end: 22, wall: false })).toBe(false);
  });
});

describe("the weight line", () => {
  it("steps after each set, carries dashed across a column that counted nothing, and breaks at a fold", () => {
    const m = small([
      ["2026-01-01", { weight: "90" }],
      ["2026-01-08", { weight: "90", reps: undefined, outcome: "skipped" }],
      ["2026-01-15", { weight: "92" }],
      ["2026-01-22", { weight: "94" }],
      ["2026-03-30", { weight: "92" }],
      ["2026-04-06", { weight: "60", outcome: "practice" }],
    ]);
    expect(m.foldAt[4]).not.toBeNull();
    const view = { start: 0, end: 5, wall: false };
    const folds = foldFlags(m);
    const layout = layoutSlots(view, folds, PORTRAIT_PLOT);
    const y = (w: number) => 200 - w;
    const segs = stepSegments(m.columns, view, folds, layout.colX, y);
    const x = (i: number) => layout.colX.get(i)!;
    expect(segs).toEqual([
      { x1: x(0), y1: y(90), x2: x(2), y2: y(90), dashed: true },
      { x1: x(2), y1: y(90), x2: x(2), y2: y(92), dashed: false },
      { x1: x(2), y1: y(92), x2: x(3), y2: y(92), dashed: false },
      { x1: x(3), y1: y(92), x2: x(3), y2: y(94), dashed: false },
      // the fold: nothing joins column 3 to column 4
      { x1: x(4), y1: y(92), x2: x(5), y2: y(92), dashed: true },
    ]);
  });

  it("is not broken at a set-up change", () => {
    const m = avery(1);
    const view = { start: 28, end: 35, wall: false };
    const folds = foldFlags(m);
    const layout = layoutSlots(view, folds, PORTRAIT_PLOT);
    const segs = stepSegments(m.columns, view, folds, layout.colX, (w) => 300 - w);
    const at = layout.colX.get(31)!;
    expect(segs.some((s) => s.x2 === at && s.x1 < at)).toBe(true);
  });

  it("labels the first load in view and every change: 7 of Avery's 12 newest columns", () => {
    const m = avery(1);
    const view = newestWindow(36, foldFlags(m), PORTRAIT_PLOT, true);
    expect(weightLabelIndexes(m.columns, view, foldFlags(m))).toEqual([24, 26, 27, 28, 29, 31, 33]);
  });
});

describe("chips and the climb-and-reset hairline", () => {
  it("places plain chips, half-chips by side, the hold in its row and practice pinned", () => {
    const m = small([
      ["2026-09-01", { reps: "9", repQuality: 3 }],
      ["2026-09-08", { reps: undefined, outcome: "performed", repsLeft: 12, repsRight: 10 }],
      ["2026-09-15", { reps: undefined, seconds: "90", isTSC: true }],
      ["2026-09-22", { weight: "60", reps: "20", outcome: "practice" }],
    ]);
    const view = { start: 0, end: 3, wall: false };
    const layout = layoutSlots(view, foldFlags(m), PORTRAIT_PLOT);
    const frame = repsFrame(repsInView(m.columns, view))!;
    const ry = repsScale(frame, 112, 104);
    const spots = chipSpots(m.columns, view, layout.colX, ry, frame, (s) => 230 + s / 100);
    expect(spots.map((s) => [s.index, s.kind, s.side, s.value, s.pinned])).toEqual([
      [0, "reps", null, 9, null],
      [1, "side", "L", 12, null],
      [1, "side", "R", 10, null],
      [2, "hold", null, 90, null],
      [3, "practice", null, 20, "above"],
    ]);
  });

  it("joins chips within one load and one set-up only, never across a fold or a change", () => {
    const m = avery(1);
    const view = newestWindow(36, foldFlags(m), PORTRAIT_PLOT, true);
    expect(hairlinePairs(m, view)).toEqual([
      [24, 25],
      [29, 30],
      [31, 32],
      [33, 34],
      [34, 35],
    ]);
  });
});

describe("lanes and hits", () => {
  it("merges markers closer than 44px, drawn at the loudest", () => {
    const merged = mergeMarkers([
      { x: 100, rank: 1, item: "note" },
      { x: 120, rank: 3, item: "critical" },
      { x: 200, rank: 2, item: "heads" },
    ]);
    expect(merged).toEqual([
      { x: 120, count: 2, items: ["critical", "note"] },
      { x: 200, count: 1, items: ["heads"] },
    ]);
  });

  it("places a note between two columns at their midpoint, and at the edge only when the newest is in view", () => {
    const colX = new Map([
      [3, 100],
      [4, 152],
    ]);
    const view = { start: 3, end: 4, wall: false };
    expect(noteX({ kind: "between", after: 3 }, view, colX, 4)).toBe(126);
    expect(noteX({ kind: "column", index: 4 }, view, colX, 4)).toBe(152);
    expect(noteX({ kind: "edge" }, view, colX, 4)).toBe(152 + COL_W / 2 - 8);
    expect(noteX({ kind: "edge" }, view, colX, 9)).toBeNull();
    expect(noteX({ kind: "before" }, view, colX, 4)).toBeNull();
  });

  it("makes each column a whole 52px tap target, and nothing over a fold", () => {
    const m = avery(1);
    const folds = foldFlags(m);
    const view = newestWindow(36, folds, PORTRAIT_PLOT, true);
    const layout = layoutSlots(view, folds, PORTRAIT_PLOT);
    const bands = hitBands(view, layout.colX);
    expect(bands).toHaveLength(12);
    expect(bands.every((b) => b.width === COL_W)).toBe(true);
    expect(columnAt(layout.colX.get(30)!, bands)).toBe(30);
    const fold = layout.slots.find((s) => s.kind === "fold")!;
    expect(columnAt(fold.x + 4, bands)).toBeNull();
  });
});

describe("the overview strip", () => {
  it("is drawn only when the loaded columns don't fit", () => {
    const m = avery(1);
    expect(needsOverview(36, foldFlags(m), PORTRAIT_PLOT, true)).toBe(true);
    const three = small([
      ["2026-09-01", {}],
      ["2026-09-08", {}],
      ["2026-09-15", {}],
    ]);
    expect(needsOverview(3, foldFlags(three), PORTRAIT_PLOT, true)).toBe(false);
  });

  it("runs on calendar time, breaks the line at the fold, and keeps the box at least 44px", () => {
    const m = avery(1);
    const view = newestWindow(36, foldFlags(m), PORTRAIT_PLOT, true);
    const o = overviewLayout(m, view, TODAY, 400)!;
    expect(o.ticks).toHaveLength(36);
    expect(o.ticks[0].x).toBe(0);
    expect(o.ticks[35].x).toBeLessThan(400);
    expect(o.ticks.filter((t) => !t.counted)).toHaveLength(2);
    expect(o.lines).toHaveLength(2);
    expect(o.box.width).toBeGreaterThanOrEqual(44);
    expect(nearestColumnAt(0, o)).toBe(0);
    const narrow = overviewLayout(m, { start: 35, end: 35, wall: false }, TODAY, 400)!;
    expect(narrow.box.width).toBe(44);
  });
});
