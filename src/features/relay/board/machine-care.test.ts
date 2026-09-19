import { describe, expect, it } from "vitest";
import { deepSentence, groupFloor, heatOf, wearOf, wipeSentence, type MachineCare } from "./machine-care";

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
