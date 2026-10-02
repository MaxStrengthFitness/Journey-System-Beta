import { describe, expect, it } from "vitest";
import { DEFAULT_WIPE_AFTER_SESSIONS, checklistFlagFor, deepSentence, groupFloor, heatOf, wantsWipeSentence, wearOf, weeklyMaintenanceLine, wipeSentence, type MachineCare } from "./machine-care";

const NOW = Date.parse("2026-09-16T18:00:00Z");
const ago = (min: number) => NOW - min * 60_000;
const session = (machineIds: string[], startedMinAgo: number) => ({
  sessionMachineIds: machineIds,
  startTime: new Date(ago(startedMinAgo)),
  createdAt: null,
  status: "Completed" as const,
});
const care = (over: Partial<MachineCare> = {}): MachineCare => ({
  machineId: "lp",
  lastWipedAt: null,
  lastWipedBy: null,
  lastDeepCleanAt: null,
  lastDeepCleanBy: null,
  flag: null,
  ...over,
});

describe("wearOf", () => {
  it("counts the sessions on the machine since the last wipe", () => {
    const sessions = [session(["lp", "cp"], 200), session(["lp"], 90), session(["lp"], 30), session(["cp"], 10)];
    const w = wearOf("lp", { sessions, care: care({ lastWipedAt: ago(120), lastWipedBy: { id: "m", name: "Marina B" } }), now: NOW });
    expect(w.touches).toBe(2);
    expect(w.heat).toBe(1);
    expect(w.sinceWipeMin).toBe(120);
    expect(wipeSentence(w, care({ lastWipedBy: { id: "m", name: "Marina B" } }))).toBe("Wiped 2 h ago by Marina");
  });

  it("with no wipe on record, every session today counts", () => {
    const sessions = [session(["lp"], 300), session(["lp"], 30)];
    const w = wearOf("lp", { sessions, care: null, now: NOW });
    expect(w.touches).toBe(2);
    expect(w.sinceWipeMin).toBeNull();
    expect(wipeSentence(w, null)).toBe("No wipe on record");
  });

  it("ignores sessions with no machine list or no start", () => {
    const w = wearOf("lp", {
      sessions: [{ sessionMachineIds: undefined, startTime: null, createdAt: null, status: "Completed" }, { sessionMachineIds: ["lp"], startTime: null, createdAt: null, status: "Completed" }],
      care: null,
      now: NOW,
    });
    expect(w.touches).toBe(0);
  });

  it("fills the deep-clean bar over the interval and says when it is due", () => {
    const fresh = wearOf("lp", { sessions: [], care: care({ lastDeepCleanAt: NOW - 3 * 86_400_000 }), now: NOW, deepCleanDays: 10 });
    expect(fresh.daysSinceDeep).toBe(3);
    expect(fresh.deepFraction).toBeCloseTo(0.3);
    expect(fresh.deepDue).toBe(false);
    expect(deepSentence(fresh, 10)).toBe("Deep clean in 7 days");
    const due = wearOf("lp", { sessions: [], care: care({ lastDeepCleanAt: NOW - 15 * 86_400_000 }), now: NOW });
    expect(due.deepDue).toBe(true);
    expect(deepSentence(due)).toBe("Deep clean due · 15 days");
    const never = wearOf("lp", { sessions: [], care: null, now: NOW });
    expect(never.deepFraction).toBe(1);
    expect(deepSentence(never)).toBe("No deep clean on record");
  });

  it("carries the flag through", () => {
    const flag = { note: "Pad torn", by: { id: "a", name: "Austin" }, at: ago(5) };
    expect(wearOf("lp", { sessions: [], care: care({ flag }), now: NOW }).flag).toEqual(flag);
  });
});

describe("heatOf", () => {
  it("steps at 2, 4 and 6", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 9].map(heatOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe("groupFloor", () => {
  it("groups by movement pattern in the Catalog's order, unknowns last", () => {
    const groups = groupFloor([
      { id: "x", name: "Mystery", movementPattern: null },
      { id: "m-leg-press", name: "Leg Press", movementPattern: "Lower Body: Quad Dominant" },
      { id: "m-chest-press", name: "Chest Press", movementPattern: null },
      { id: "m-row", name: "Row", movementPattern: "Upper Body: Horizontal Pull" },
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Horizontal Push", "Horizontal Pull", "Quad Dominant", "Other equipment"]);
    // The chest press had no pattern of its own and borrowed the anatomy map's.
    expect(groups[0].machines[0].name).toBe("Chest Press");
  });
});

describe("the studio's own cleaning log (Sep 28 2026)", () => {
  it("wants a wipe once the studio's number of sessions used a machine since its last wipe", () => {
    const sessions = [session(["lp"], 90), session(["lp"], 60), session(["lp"], 30)];
    expect(DEFAULT_WIPE_AFTER_SESSIONS).toBe(4);
    expect(wearOf("lp", { sessions, care: null, now: NOW }).wantsWipe).toBe(false);
    const two = wearOf("lp", { sessions, care: null, now: NOW, wipeAfterSessions: 2 });
    expect(two.wantsWipe).toBe(true);
    expect(wantsWipeSentence(two, 2)).toBe("Wants a wipe: 3 sessions since the last one (this studio wipes after 2).");
    expect(wantsWipeSentence(wearOf("lp", { sessions, care: null, now: NOW }), 4)).toBeNull();
  });

  it("counts a daily deep clean at 1 day", () => {
    const yesterday = wearOf("lp", { sessions: [], care: care({ lastDeepCleanAt: NOW - 86_400_000 }), now: NOW, deepCleanDays: 1 });
    expect(yesterday.deepDue).toBe(true);
  });

  it("puts the weekly maintenance line on the studio's day for it, and nowhere else", () => {
    // Sep 28 2026 is a Monday (1).
    expect(weeklyMaintenanceLine(1, "2026-09-28")).toBe("Weekly maintenance today: Monday is this studio's day for it.");
    expect(weeklyMaintenanceLine(3, "2026-09-28")).toBeNull();
    expect(weeklyMaintenanceLine(null, "2026-09-28")).toBeNull();
  });
});

describe("one maintenance record: a checklist problem flags the machine (Oct 2 2026)", () => {
  it("flags a machine row closed with a problem, in the trainer's words", () => {
    expect(checklistFlagFor({ machineId: "m-leg-press", machineName: "Leg Press", title: "Machine check" }, " Cable frayed ", true)).toEqual({
      machineId: "m-leg-press",
      machineName: "Leg Press",
      note: "Cable frayed",
    });
  });

  it("says which duty found it when no note was written", () => {
    expect(checklistFlagFor({ machineId: "m-lumbar", title: "Weekly machine check" }, "", true)?.note).toBe(
      "A problem found on the Weekly machine check.",
    );
  });

  it("flags nothing for a row closed clean or a duty with no machine", () => {
    expect(checklistFlagFor({ machineId: "m-leg-press" }, "fine", false)).toBeNull();
    expect(checklistFlagFor({ title: "Front desk" }, "Door sticks", true)).toBeNull();
  });
});
