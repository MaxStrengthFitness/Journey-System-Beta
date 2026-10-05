import { describe, expect, it } from "vitest";
import { NO_WINDOW, ownedWindow } from "../../lib/history-claims";
import type { ExerciseLog, WorkoutSession } from "../../types";
import type { JournalEntry } from "../../types/journal";
import {
  CUTOVER,
  LEG_PRESS_FIELDS,
  LEG_PRESS_HISTORY,
  LEG_PRESS_JOURNAL,
  STUDIO,
  TODAY,
  averyRead,
} from "./fixtures";
import { parseSettingHistory, type SettingHistoryDoc } from "./setting-history";
import {
  DEFAULT_DRIFT,
  MIN_PROGRESSION_POINTS,
  buildTimelineModel,
  canDrawLine,
  dayNumber,
  daysBetween,
  foldThreshold,
  isDrawableLog,
  lastCounted,
  loadRange,
  median,
  newestBeforeToday,
  type TimelineInput,
  type TimelineLogInput,
  type TimelineSessionInput,
} from "./timeline-model";

const WINDOW = ownedWindow({ coverage: "partial", cutover: CUTOVER });
const HISTORY = parseSettingHistory(LEG_PRESS_HISTORY, "avery");

function avery(from: number, over: Partial<TimelineInput> = {}) {
  const read = averyRead(from);
  return buildTimelineModel({
    machineId: "leg-press",
    machineName: "Leg Press",
    fields: LEG_PRESS_FIELDS,
    ...read,
    today: TODAY,
    unitStudioId: STUDIO,
    history: HISTORY,
    journal: LEG_PRESS_JOURNAL,
    window: WINDOW,
    ...over,
  });
}

/* A small hand-built client for the edge cases. */
const S = (id: string, date: string, over: Partial<TimelineSessionInput> = {}): TimelineSessionInput => ({
  id,
  date,
  sessionNumber: 0,
  trainerInitials: "SR",
  hostedAtStudioId: STUDIO,
  status: "Completed",
  ...over,
});
const L = (sessionId: string, over: Partial<TimelineLogInput> = {}): TimelineLogInput => ({
  sessionId,
  machineId: "m",
  weight: "100",
  reps: "10",
  ...over,
});
function small(sessions: TimelineSessionInput[], logs: TimelineLogInput[], over: Partial<TimelineInput> = {}) {
  return buildTimelineModel({
    machineId: "m",
    machineName: "Leg Press",
    fields: [
      { key: "seat", label: "Seat" },
      { key: "backPad", label: "Back pad" },
    ],
    sessions,
    logs,
    today: "2026-10-04",
    unitStudioId: STUDIO,
    everythingRead: true,
    moreToLoad: false,
    history: [],
    journal: [],
    ...over,
  });
}
const hist = (docs: SettingHistoryDoc[]) => parseSettingHistory(docs);

describe("the inputs", () => {
  it("take the app's own records as they are (a typecheck, as much as a test)", () => {
    const log: TimelineLogInput = { sessionId: "a", machineId: "m", weight: "100", reps: "10" } as ExerciseLog;
    const session: TimelineSessionInput = { id: "a", date: "2026-09-01" } as WorkoutSession;
    const m = buildTimelineModel({
      machineId: "m",
      machineName: "Leg Press",
      sessions: [session],
      logs: [log],
      today: "2026-10-04",
      everythingRead: false,
      moreToLoad: false,
      history: null,
      journal: null,
    });
    expect(m.columns).toHaveLength(1);
  });
});

describe("the columns: one per session with a record on the machine", () => {
  it("draws every Leg Press session read, oldest first, and no session where it wasn't on the plan", () => {
    const m = avery(1);
    expect(m.columns).toHaveLength(36);
    expect(m.columns[0].day).toBe("2025-09-09");
    expect(m.columns[35].day).toBe("2026-10-01");
    expect(m.columns.every((c, i) => c.index === i)).toBe(true);
    // The other machines' sessions are read but have no column.
    expect(m.columns.some((c) => c.day === "2025-09-10")).toBe(false);
  });

  it("counts performed sets only: practice and blood flow and skips keep a column, off the count", () => {
    const m = avery(1);
    expect(m.counted).toEqual({ count: 34, firstDay: "2025-09-09", lastDay: "2026-10-01" });
    const flow = m.columns[12];
    expect(flow.outcome).toBe("practice");
    expect(flow.practice).toBe("bloodFlow");
    expect(flow.counted).toBe(false);
    expect(flow.weight).toBe(70);
    expect(m.practiceCount).toBe(1);
    const skip = m.columns[16];
    expect(skip.outcome).toBe("skipped");
    expect(skip.counted).toBe(false);
    expect(skip.weight).toBeNull();
    expect(skip.skipReason).toBe("pain_injury");
    expect(skip.skipNote).toBe("Left knee sore going in");
  });

  it("counts from the loaded columns only, never a running total", () => {
    expect(avery(21).counted).toEqual({ count: 24, firstDay: "2025-12-15", lastDay: "2026-10-01" });
    expect(avery(42).counted).toEqual({ count: 15, firstDay: "2026-04-02", lastDay: "2026-10-01" });
    expect(avery(42).columns).toHaveLength(15);
    // The session after one Load older (#12 on): 30 columns, 28 counted, and the hold is in.
    const older = avery(12);
    expect(older.columns).toHaveLength(30);
    expect(older.counted).toEqual({ count: 28, firstDay: "2025-11-06", lastDay: "2026-10-01" });
    expect(older.hasHolds).toBe(true);
  });

  it("marks quality by exception: 3 and 1 only, 2 and none plain", () => {
    const m = avery(1);
    expect(m.columns[2].mark).toBe("max");
    expect(m.columns[8].mark).toBe("poor");
    expect(m.columns[1].mark).toBeNull(); // quality 2
    expect(m.columns[0].mark).toBeNull(); // not marked
  });

  it("keeps a timed hold as seconds, never as reps", () => {
    const hold = avery(1).columns[20];
    expect(hold.isHold).toBe(true);
    expect(hold.seconds).toBe(90);
    expect(hold.reps).toBeNull();
    expect(hold.counted).toBe(true);
    const m = avery(1);
    expect(m.hasHolds).toBe(true);
    expect(m.hasRepSets).toBe(true);
    expect(avery(42).hasHolds).toBe(false);
  });

  it("carries the trainer, the machine's place in the session and the studio", () => {
    const c = avery(1).columns[34];
    expect(c.trainerInitials).toBe("AC");
    expect(c.trainerName).toBe("Ana Cole");
    expect(c.machineOrder).toEqual({ position: 4, of: 7 });
    expect(c.studioId).toBe(STUDIO);
    expect(c.atOtherStudio).toBe(false);
    expect(avery(1).columns[10].machineOrder).toBeNull();
  });

  it("keeps both sides of a one-side-at-a-time set, the line on the heavier side", () => {
    const m = small(
      [S("a", "2026-09-08"), S("b", "2026-09-17")],
      [
        L("a", { side: "Left", weight: "40", reps: "10" }),
        L("a", { side: "Right", weight: "42", reps: "9", repQuality: 3 }),
        L("b", { weight: "42", reps: undefined, outcome: "performed", repsLeft: 9, repsRight: 8 }),
      ],
    );
    const [a, b] = m.columns;
    expect(a.sides?.L).toMatchObject({ weight: 40, reps: 10, mark: null });
    expect(a.sides?.R).toMatchObject({ weight: 42, reps: 9, mark: "max" });
    expect(a.weight).toBe(42);
    expect(a.reps).toBeNull();
    // One log carrying both counts reads the same way, never averaged.
    expect(b.sides?.L?.reps).toBe(9);
    expect(b.sides?.R?.reps).toBe(8);
    expect(m.counted.count).toBe(2);
  });

  it("lists two performed sets in one session, the heaviest driving the line", () => {
    const m = small([S("a", "2026-09-08")], [L("a", { weight: "96", reps: "11" }), L("a", { weight: "100", reps: "8" })]);
    expect(m.columns[0].weight).toBe(100);
    expect(m.columns[0].reps).toBe(8);
    expect(m.columns[0].performedSets.map((s) => s.weight)).toEqual([100, 96]);
  });

  it("draws today's column only for a set someone worked on, and never counts it", () => {
    const sessions = [S("a", "2026-09-08"), S("t", "2026-10-04", { status: "In-Progress" })];
    // Start seeds the prescribed weight and nothing else: no column.
    const seeded = small(sessions, [L("a"), L("t", { reps: undefined })], { runningSessionId: "t" });
    expect(seeded.columns).toHaveLength(1);
    expect(seeded.todayIndex).toBeNull();
    const begun = small(sessions, [L("a"), L("t", { reps: "9" })], { runningSessionId: "t" });
    expect(begun.columns).toHaveLength(2);
    expect(begun.columns[1].isToday).toBe(true);
    expect(begun.todayIndex).toBe(1);
    expect(begun.counted.count).toBe(1);
  });

  it("keeps a finished session's not-reached set, and drops an unfinished session's placeholder", () => {
    const m = small(
      [S("a", "2026-09-01"), S("b", "2026-09-08", { status: "In-Progress" }), S("c", "2026-09-15")],
      [L("a"), L("b", { reps: undefined }), L("c", { reps: undefined, outcome: "not_reached" })],
    );
    expect(m.columns.map((c) => [c.sessionId, c.outcome])).toEqual([
      ["a", "performed"],
      ["c", "not_reached"],
    ]);
  });

  it("marks a session at another studio", () => {
    const m = small([S("a", "2026-09-01"), S("b", "2026-09-08", { hostedAtStudioId: "solon" })], [L("a"), L("b")]);
    expect(m.columns[1].atOtherStudio).toBe(true);
    expect(m.columns[1].counted).toBe(true);
  });
});

describe("isDrawableLog", () => {
  it("draws every set of a finished session, and only begun sets of an unfinished or running one", () => {
    const seed = L("x", { reps: undefined });
    expect(isDrawableLog(seed, { id: "x", status: "Completed" })).toBe(true);
    expect(isDrawableLog(seed, { id: "x", status: "In-Progress" })).toBe(false);
    expect(isDrawableLog(seed, { id: "x", status: "Completed" }, "x")).toBe(false);
    expect(isDrawableLog(L("x"), { id: "x", status: "In-Progress" })).toBe(true);
    expect(isDrawableLog(L("x", { reps: undefined, outcome: "skipped" }), { id: "x", status: "In-Progress" })).toBe(true);
  });
});

describe("folds: long gaps, at the studio's own Drifting line", () => {
  it("folds only the seven-week gap on Avery's Leg Press (median 10 days, so 20)", () => {
    const m = avery(1);
    expect(m.foldThresholdDays).toBe(20);
    expect(m.folds).toHaveLength(1);
    expect(m.folds[0]).toMatchObject({ index: 27, days: 49, fromDay: "2026-05-28", toDay: "2026-07-16", visits: 0, claimable: true });
    expect(m.foldAt[27]).toBe(m.folds[0]);
    expect(m.foldAt[28]).toBeNull();
  });

  it("reads the machine's median gap from what was loaded (the session's window: 10.5 days, so 21)", () => {
    const m = avery(42);
    expect(m.foldThresholdDays).toBe(21);
    expect(m.folds.map((f) => f.days)).toEqual([49]);
  });

  it("follows the studio's own numbers", () => {
    const m = avery(1, { drift: { multiple: 1.2, minDays: 3 } });
    expect(m.foldThresholdDays).toBe(12);
    expect(m.folds.map((f) => f.days)).toEqual([14, 49, 12, 12, 14]);
  });

  it("uses twice the minimum when fewer than three gaps are known", () => {
    expect(foldThreshold([10, 40])).toBe(2 * DEFAULT_DRIFT.minDays);
    expect(foldThreshold([10, 10, 40], { multiple: 2, minDays: 7 })).toBe(20);
    expect(foldThreshold([2, 2, 2], { multiple: 2, minDays: 7 })).toBe(7);
  });

  it("counts the visits inside a gap, and claims a break only where Journey owns the timeline", () => {
    const sessions = [
      S("a", "2026-03-01"),
      S("b", "2026-03-08"),
      S("c", "2026-03-15"),
      S("v1", "2026-03-30"),
      S("v2", "2026-04-10"),
      S("d", "2026-05-01"),
    ];
    const logs = ["a", "b", "c", "d"].map((id) => L(id));
    const m = small(sessions, logs, { window: NO_WINDOW });
    expect(m.folds).toHaveLength(1);
    expect(m.folds[0]).toMatchObject({ index: 3, days: 47, visits: 2, claimable: false });
    const owned = small(sessions, logs, { window: ownedWindow({ coverage: "partial", cutover: "2026-01-01" }) });
    expect(owned.folds[0].claimable).toBe(true);
    const before = small(sessions, logs, { window: ownedWindow({ coverage: "partial", cutover: "2026-04-01" }) });
    expect(before.folds[0].claimable).toBe(false);
  });
});

describe("the start wall", () => {
  it("is drawn only when every Journey session has been read", () => {
    expect(avery(1).startWall).toBe(true);
    expect(avery(21).startWall).toBe(false);
    expect(avery(21).moreToLoad).toBe(true);
    expect(small([], []).startWall).toBe(false);
  });
});

describe("set-up stretches: from non-empty snapshots and netted setting changes", () => {
  it("draws Avery's two changes once each, with their reasons, and nothing for the empty snapshot", () => {
    const m = avery(1);
    expect(m.boundaries.map((b) => b.index)).toEqual([13, 31]);
    expect(m.boundaryAt[13]).toMatchObject({
      changes: [{ label: "Seat", from: "4", to: "5" }],
      reason: "Range of motion",
      trainerName: "Sam Reyes",
      sameDay: false,
      fromHistory: true,
      fromSnapshot: true,
    });
    expect(m.boundaryAt[31]).toMatchObject({ changes: [{ label: "Back pad", from: "3", to: "2" }], reason: "Comfort or fit" });
    // Oct 17 2025 was entered with no settings: "not recorded", never a boundary.
    expect(m.columns[4].settings).toBeNull();
    expect(m.boundaryAt[4]).toBeNull();
    expect(m.boundaryAt[5]).toBeNull();
    expect(m.setupLane).toBe(true);
    expect(m.stretches.map((s) => [s.start, s.end])).toEqual([
      [0, 12],
      [13, 30],
      [31, 35],
    ]);
    expect(m.stretches[2].settings).toEqual([
      { label: "Seat", value: "5" },
      { label: "Back pad", value: "2" },
      { label: "Foot plate", value: "High" },
    ]);
  });

  it("never draws the first set-up, which came before the first column", () => {
    const m = avery(1);
    expect(m.boundaryAt[0]).toBeNull();
  });

  it("still draws a change from the snapshots when the history couldn't be read, and says the reason can't be told", () => {
    const m = avery(1, { history: null });
    expect(m.historyRead).toBe(false);
    expect(m.boundaries.map((b) => b.index)).toEqual([13, 31]);
    expect(m.boundaryAt[13]).toMatchObject({ reason: null, reasonUnread: true, fromHistory: false, fromSnapshot: true });
  });

  it("draws nothing for a Save and its Undo", () => {
    const sessions = [S("a", "2026-09-01"), S("b", "2026-09-08")];
    const logs = [L("a", { machineSettings: { seat: "5" } }), L("b", { machineSettings: { seat: "5" } })];
    const history = hist([
      { id: "s", timestamp: "2026-09-03T10:00:00-04:00", changeType: "SETTINGS", oldValue: "Seat: 5", newValue: "Seat: 6", reason: "Comfort or fit" },
      { id: "u", timestamp: "2026-09-03T10:00:20-04:00", changeType: "SETTINGS", oldValue: "Seat: 6", newValue: "Seat: 5", reason: "Undone" },
    ]);
    const m = small(sessions, logs, { history });
    expect(m.boundaries).toEqual([]);
    expect(m.setupLane).toBe(false);
  });

  it("never makes a boundary into or out of an empty snapshot", () => {
    const sessions = [S("a", "2026-09-01"), S("b", "2026-09-08"), S("c", "2026-09-15")];
    const same = small(sessions, [
      L("a", { machineSettings: { seat: "4" } }),
      L("b", { machineSettings: {} }),
      L("c", { machineSettings: { seat: "4" } }),
    ]);
    expect(same.boundaries).toEqual([]);
    const moved = small(sessions, [
      L("a", { machineSettings: { seat: "4" } }),
      L("b", { machineSettings: {} }),
      L("c", { machineSettings: { seat: "5" } }),
    ]);
    expect(moved.boundaries.map((b) => [b.index, b.changes])).toEqual([[2, [{ label: "Seat", from: "4", to: "5" }]]]);
  });

  it("draws a change the history knows even across an empty snapshot, once", () => {
    const sessions = [S("a", "2026-09-01"), S("b", "2026-09-08"), S("c", "2026-09-15")];
    const logs = [
      L("a", { machineSettings: { seat: "4" } }),
      L("b", { machineSettings: {} }),
      L("c", { machineSettings: { seat: "5" } }),
    ];
    const history = hist([
      { id: "r", timestamp: "2026-09-04T09:00:00-04:00", changeType: "SETTINGS", oldValue: "Seat: 4", newValue: "Seat: 5", reason: "Range of motion" },
    ]);
    const m = small(sessions, logs, { history });
    expect(m.boundaries.map((b) => [b.index, b.reason])).toEqual([[1, "Range of motion"]]);
  });

  describe("a change saved the same day as a session", () => {
    const sessions = [S("a", "2026-09-01"), S("b", "2026-09-08"), S("c", "2026-09-15")];
    const row = (time: string) =>
      hist([{ id: "r", timestamp: `2026-09-08T${time}-04:00`, changeType: "SETTINGS", oldValue: "Seat: 4", newValue: "Seat: 5", reason: "Comfort or fit" }]);

    it("goes before the session when it was saved before the set was written", () => {
      const logs = [
        L("a", { machineSettings: { seat: "4" } }),
        L("b", { machineSettings: { seat: "5" }, createdAt: new Date("2026-09-08T10:05:00-04:00") }),
        L("c", { machineSettings: { seat: "5" } }),
      ];
      const m = small(sessions, logs, { history: row("10:00:00") });
      expect(m.boundaries.map((b) => [b.index, b.sameDay])).toEqual([[1, false]]);
    });

    it("goes after the session when it was saved after, and the set still shows the old set-up", () => {
      const logs = [
        L("a", { machineSettings: { seat: "4" } }),
        L("b", { machineSettings: { seat: "4" }, createdAt: new Date("2026-09-08T10:05:00-04:00") }),
        L("c", { machineSettings: { seat: "5" } }),
      ];
      const m = small(sessions, logs, { history: row("10:30:00") });
      expect(m.boundaries.map((b) => [b.index, b.reason])).toEqual([[2, "Comfort or fit"]]);
    });

    it("is drawn once, before the session, when the set already shows the new set-up (the snapshot is re-saved with every set)", () => {
      const logs = [
        L("a", { machineSettings: { seat: "4" } }),
        L("b", { machineSettings: { seat: "5" }, createdAt: new Date("2026-09-08T10:05:00-04:00") }),
        L("c", { machineSettings: { seat: "5" } }),
      ];
      const m = small(sessions, logs, { history: row("10:30:00") });
      expect(m.boundaries.map((b) => [b.index, b.reason, b.fromHistory])).toEqual([[1, "Comfort or fit", true]]);
    });

    it("is drawn before the session too when nothing was recorded before it", () => {
      const logs = [
        L("a", { machineSettings: {} }),
        L("b", { machineSettings: { seat: "5" }, createdAt: new Date("2026-09-08T10:05:00-04:00") }),
        L("c", { machineSettings: { seat: "5" } }),
      ];
      const m = small(sessions, logs, { history: row("10:30:00") });
      expect(m.boundaries.map((b) => [b.index, b.reason])).toEqual([[1, "Comfort or fit"]]);
    });

    it("draws nothing when the rows contradict every set (the set-up already showed it before)", () => {
      const logs = [
        L("a", { machineSettings: { seat: "5" } }),
        L("b", { machineSettings: { seat: "5" }, createdAt: new Date("2026-09-08T10:05:00-04:00") }),
        L("c", { machineSettings: { seat: "5" } }),
      ];
      const m = small(sessions, logs, { history: row("10:30:00") });
      expect(m.boundaries).toEqual([]);
    });

    it("says it was the same day, and can't say which came first, when the set was entered on another day", () => {
      const logs = [
        L("a", { machineSettings: {} }),
        L("b", { machineSettings: {}, createdAt: new Date("2026-09-20T12:00:00-04:00") }),
        L("c", { machineSettings: {} }),
      ];
      const m = small(sessions, logs, { history: row("10:30:00") });
      expect(m.boundaries.map((b) => [b.index, b.sameDay])).toEqual([[1, true]]);
    });
  });

  it("never compares settings across studios", () => {
    const m = small(
      [S("a", "2026-09-01"), S("b", "2026-09-08", { hostedAtStudioId: "solon" }), S("c", "2026-09-15")],
      [L("a", { machineSettings: { seat: "4" } }), L("b", { machineSettings: { seat: "7" } }), L("c", { machineSettings: { seat: "4" } })],
    );
    expect(m.boundaries).toEqual([]);
    expect(m.stretches).toEqual([{ start: 0, end: 2, settings: [{ label: "Seat", value: "4" }] }]);
  });
});

describe("notes on the lane", () => {
  it("places each note at its session, leaves settings copies and thread updates off, and knows a resolved one", () => {
    const m = avery(1);
    expect(m.notesRead).toBe(true);
    expect(m.notes.map((n) => [n.journalEntryId, n.place, n.loudness, n.resolved])).toEqual([
      ["n1", { kind: "column", index: 5 }, "standard", false],
      ["n2", { kind: "column", index: 16 }, "standard", true],
      ["n3", { kind: "column", index: 34 }, "elevated", false],
    ]);
    expect(m.notes[2].words).toBe("Pushes through the toes near the end of the set; cue heels down.");
    expect(m.notes[2].authorName).toBe("Ana Cole");
  });

  it("hides nothing when the setting changes couldn't be read: the copies show as notes", () => {
    const m = avery(1, { history: null });
    expect(m.notes).toHaveLength(6);
  });

  it("places a note with no session between the sessions it fell between, at the edge after the newest, and off the chart before the oldest", () => {
    const note = (id: string, when: string): JournalEntry => ({
      ...LEG_PRESS_JOURNAL[3],
      id,
      sessionId: null,
      sessionDay: null,
      machineId: "m",
      occurredAt: new Date(when),
    });
    const m = small(
      [S("a", "2026-09-01"), S("b", "2026-09-08"), S("c", "2026-09-15")],
      ["a", "b", "c"].map((id) => L(id)),
      {
        journal: [
          note("mid", "2026-09-04T12:00:00-04:00"),
          note("same", "2026-09-08T18:00:00-04:00"),
          note("late", "2026-09-30T12:00:00-04:00"),
          note("old", "2026-08-01T12:00:00-04:00"),
        ],
      },
    );
    expect(Object.fromEntries(m.notes.map((n) => [n.journalEntryId, n.place]))).toEqual({
      mid: { kind: "between", after: 0 },
      same: { kind: "column", index: 1 },
      late: { kind: "edge" },
      old: { kind: "before" },
    });
  });

  it("reads the old list for notes with no journal copy, and says when the journal couldn't be read", () => {
    const m = small([S("a", "2026-09-01")], [L("a")], {
      journal: null,
      legacyNotes: [{ id: "1", content: "Seat sticks", authorName: "Sam Reyes", timestamp: "2026-09-01T12:00:00-04:00", isImportant: true }],
    });
    expect(m.notesRead).toBe(false);
    expect(m.notes).toEqual([
      expect.objectContaining({ journalEntryId: null, loudness: "critical", words: "Seat sticks", place: { kind: "column", index: 0 } }),
    ]);
  });
});

describe("reads over the model", () => {
  it("finds the last counted set, the newest column before today, and the load range", () => {
    const m = avery(1);
    expect(lastCounted(m)?.day).toBe("2026-10-01");
    expect(newestBeforeToday(m)?.day).toBe("2026-10-01");
    expect(loadRange(m.columns)).toEqual({ lightest: 84, heaviest: 100 });
    const skippedLast = small([S("a", "2026-09-01"), S("b", "2026-09-08")], [L("a"), L("b", { reps: undefined, outcome: "skipped" })]);
    expect(lastCounted(skippedLast)?.sessionId).toBe("a");
    expect(newestBeforeToday(skippedLast)?.sessionId).toBe("b");
  });

  it("draws a line only from two counted sessions", () => {
    expect(MIN_PROGRESSION_POINTS).toBe(2);
    expect(canDrawLine(small([S("a", "2026-09-01")], [L("a")]))).toBe(false);
    expect(canDrawLine(small([S("a", "2026-09-01"), S("b", "2026-09-08")], [L("a"), L("b")]))).toBe(true);
    expect(canDrawLine(small([S("a", "2026-09-01"), S("b", "2026-09-08")], [L("a"), L("b", { outcome: "practice" })]))).toBe(false);
  });
});

describe("day arithmetic", () => {
  it("counts calendar days without a time zone", () => {
    expect(dayNumber("2026-03-08") - dayNumber("2026-03-07")).toBe(1); // across the spring change
    expect(daysBetween("2026-05-28", "2026-07-16")).toBe(49);
    expect(Number.isNaN(dayNumber("nope"))).toBe(true);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});
