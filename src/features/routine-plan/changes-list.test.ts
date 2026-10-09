/**
 * A routine's Changes as ONE list (the design round, §4.3): the plan's
 * changes and the old routineAdjustments, newest first, each saying who,
 * when, what and the reason when one was given.
 */
import { describe, expect, it } from "vitest";
import type { RoutineAdjustment } from "../../types";
import { adjustmentWhat, daysAgoWords, planChangeWhat, planChangesAndAdjustments } from "./changes-list";
import type { StoredPlanChange } from "./store";

const NAMES: Record<string, string> = {
  "m-leg-press": "Leg Press",
  "m-compound-row": "Compound Row",
  "m-lumbar": "Lumbar",
  "m-dip": "Seated Dip",
  "m-chest-fly": "Chest Flye",
  "m-hip-abd": "Hip Abduction",
  "m-overhead-press": "Overhead Press",
};
const nameOf = (id: string) => NAMES[id] ?? id;

// Sam signs in with a uid that is not their trainer document's id (an older account).
const trainers = [
  { id: "t-sam", authUid: "uid-sam", fullName: "Sam Lee", initials: "SL" },
  { id: "uid-casey", fullName: "Casey Park", initials: "CP" },
];

const at = (iso: string) => Date.parse(iso);

function change(over: Partial<StoredPlanChange> & Pick<StoredPlanChange, "kind">): StoredPlanChange {
  return { id: `pc-${over.kind}`, machineIds: [], byUid: "uid-sam", atMs: at("2026-10-08T14:00:00Z"), ...over };
}

function adjustment(over: Partial<RoutineAdjustment>): RoutineAdjustment {
  return {
    id: "adj-1",
    routineId: "r-a",
    clientId: "c1",
    previousMachineIds: [],
    newMachineIds: [],
    trainerId: "t-sam",
    createdAt: { toMillis: () => at("2026-09-01T14:00:00Z") },
    ...over,
  };
}

const base = { adjustments: [] as RoutineAdjustment[], routineId: "r-a", trainers, nameOf, routineName: "Routine A" };

describe("one list, newest first", () => {
  it("merges the plan's changes and the old adjustments by time, and keeps only this routine's", () => {
    const rows = planChangesAndAdjustments({
      ...base,
      planChanges: [
        change({ id: "p1", kind: "start", machineIds: ["m-leg-press"], value: "Low back issues", atMs: at("2026-10-01T14:00:00Z") }),
        change({ id: "p2", kind: "add", machineIds: ["m-hip-abd"], reason: "Moving well", atMs: at("2026-10-08T14:00:00Z") }),
      ],
      adjustments: [
        adjustment({ id: "a1", changeType: "created", newMachineIds: ["m-leg-press", "m-lumbar"] }),
        adjustment({ id: "a-b", routineId: "r-b", changeType: "enabled" }),
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(["plan:p2", "plan:p1", "adjustment:a1"]);
    expect(rows[0]).toMatchObject({ who: "Sam Lee", initials: "SL", what: "Added Hip Abduction", reason: "Moving well", source: "plan" });
    expect(rows[1]!.what).toBe("Started the plan from Low back issues");
    expect(rows[2]).toMatchObject({ what: "Made Routine A: Leg Press and Lumbar", source: "adjustment", kind: "created" });
  });

  it("puts a change still waiting for the server's time first, as just now", () => {
    const rows = planChangesAndAdjustments({
      ...base,
      planChanges: [
        change({ id: "old", kind: "purpose", value: "The core", atMs: at("2026-10-01T14:00:00Z") }),
        change({ id: "pending", kind: "add", machineIds: ["m-dip"], atMs: null }),
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(["plan:pending", "plan:old"]);
    expect(rows[0]!.at).toBeNull();
  });
});

describe("who", () => {
  it("finds a plan change's trainer by the Auth uid, and an adjustment's by the trainer's id", () => {
    const rows = planChangesAndAdjustments({
      ...base,
      planChanges: [change({ kind: "purpose", value: "x", byUid: "uid-sam" })],
      adjustments: [adjustment({ changeType: "machines", trainerId: "t-sam", newMachineIds: ["m-dip"] })],
    });
    expect(rows.map((r) => r.who)).toEqual(["Sam Lee", "Sam Lee"]);
  });

  it("finds a trainer whose document id is the uid, then the name it was signed with, else says a trainer", () => {
    const rows = planChangesAndAdjustments({
      ...base,
      planChanges: [
        change({ id: "a", kind: "purpose", value: "x", byUid: "uid-casey", atMs: 3 }),
        change({ id: "b", kind: "purpose", value: "x", byUid: "uid-gone", byName: "Jo Ray", atMs: 2 }),
        change({ id: "c", kind: "purpose", value: "x", byUid: "uid-gone", atMs: 1 }),
      ],
    });
    expect(rows.map((r) => [r.who, r.initials])).toEqual([
      ["Casey Park", "CP"],
      ["Jo Ray", "JR"],
      ["A trainer", "?"],
    ]);
  });
});

describe("what, in a sentence", () => {
  const say = (c: Partial<StoredPlanChange> & Pick<StoredPlanChange, "kind">, firstName?: string) =>
    planChangeWhat(change(c), { nameOf, routineName: "Routine A", firstName, todayYmd: "2026-10-08" });

  it("says every kind of plan change", () => {
    expect(say({ kind: "start" })).toBe("Started the plan");
    expect(say({ kind: "add", machineIds: ["m-dip", "m-hip-abd"] })).toBe("Added Seated Dip and Hip Abduction");
    expect(say({ kind: "remove", machineIds: ["m-dip"] })).toBe("Took Seated Dip out of the plan");
    expect(say({ kind: "swap", machineIds: ["m-dip", "m-overhead-press"] })).toBe("Overhead Press instead of Seated Dip");
    expect(say({ kind: "reorder", machineIds: ["m-lumbar", "m-leg-press"] })).toBe("New order: Lumbar, Leg Press");
    expect(say({ kind: "purpose", value: "The core: whole body" })).toBe("Purpose: The core: whole body");
    expect(say({ kind: "building", value: "on" })).toBe("Turned on: Routine A is being built");
    expect(say({ kind: "building", value: "off" })).toBe("Turned off: Routine A is being built");
    expect(say({ kind: "focus", value: "delts,grip" })).toBe("Focus: Delts and Grip");
    expect(say({ kind: "focus", value: "" })).toBe("Took the focus off");
    expect(say({ kind: "cando", machineIds: ["m-dip"] })).toBe("Can do Seated Dip again");
    expect(say({ kind: "replan", machineIds: ["m-leg-press"], value: "Surgery coming up" })).toBe("Re-planned");
  });

  it("says a can't-do with its reason and until, by the client's first name when it is known", () => {
    expect(say({ kind: "cantdo", machineIds: ["m-dip"], value: "Surgery · cleared" }, "Dana")).toBe(
      "Not for Dana: Seated Dip · Surgery · until cleared",
    );
    expect(say({ kind: "cantdo", machineIds: ["m-dip"], value: "2026-11-20" })).toBe("Can't do: Seated Dip · until Nov 20");
  });

  it("says a machine put on or taken off a kept plan's day one", () => {
    expect(say({ kind: "add", machineIds: ["m-dip"], value: "dayone" })).toBe("Put Seated Dip on day one");
    expect(say({ kind: "remove", machineIds: ["m-dip"], value: "dayone" })).toBe("Took Seated Dip off day one");
  });

  it("says the Academy sheet's column by its level, or that ranges are off", () => {
    // The level alone outside the pick sheet: never the sheet's sex word (the whole-branch review, Oct 9 2026).
    expect(say({ kind: "column", value: "female-novice" })).toBe("Academy's starting ranges: the Novice column");
    expect(say({ kind: "column", value: "male-advanced" })).not.toMatch(/male|female/i);
    expect(say({ kind: "column", value: "none" })).toBe("Academy's starting ranges: not shown");
  });

  it("says an old adjustment", () => {
    const sayAdj = (a: Partial<RoutineAdjustment>, routineName = "Routine A") =>
      adjustmentWhat(adjustment(a), { nameOf, routineName });
    expect(sayAdj({ changeType: "machines", previousMachineIds: ["m-dip"], newMachineIds: ["m-hip-abd"] })).toBe(
      "Added Hip Abduction · Took Seated Dip out",
    );
    expect(sayAdj({ changeType: "machines", previousMachineIds: ["m-dip", "m-lumbar"], newMachineIds: ["m-lumbar", "m-dip"] })).toBe(
      "Changed the order",
    );
    expect(sayAdj({ changeType: "enabled" }, "Routine B")).toBe("Turned Routine B on");
    expect(sayAdj({ changeType: "disabled" }, "Routine B")).toBe("Turned Routine B off");
  });
});

describe("a Re-plan is a divider, and nothing before it is erased", () => {
  it("draws the re-plan as a divider with what changed as its reason", () => {
    const rows = planChangesAndAdjustments({
      ...base,
      planChanges: [
        change({ id: "s", kind: "start", atMs: 1 }),
        change({ id: "r", kind: "replan", machineIds: ["m-leg-press"], value: "Surgery coming up", atMs: 2 }),
      ],
    });
    expect(rows[0]).toMatchObject({ id: "plan:r", isDivider: true, what: "Re-planned", reason: "Surgery coming up" });
    expect(rows[1]).toMatchObject({ id: "plan:s", isDivider: false });
  });
});

describe("one save, said once", () => {
  const sameTime = at("2026-10-08T15:00:00Z");

  it("leaves out the drawer's adjustment written in the same batch as its plan change, keeping its reason", () => {
    const rows = planChangesAndAdjustments({
      ...base,
      planChanges: [change({ id: "p", kind: "add", machineIds: ["m-hip-abd"], byUid: "uid-sam", atMs: sameTime })],
      adjustments: [
        adjustment({
          id: "a",
          changeType: "machines",
          trainerId: "t-sam",
          previousMachineIds: ["m-leg-press"],
          newMachineIds: ["m-leg-press", "m-hip-abd"],
          notes: "Ready for a fourth",
          createdAt: { toMillis: () => sameTime },
        }),
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "plan:p", what: "Added Hip Abduction", reason: "Ready for a fourth" });
  });

  it("keeps both when another trainer made the adjustment, or at another time, or it was the B switch", () => {
    const rows = planChangesAndAdjustments({
      ...base,
      planChanges: [change({ id: "p", kind: "add", machineIds: ["m-hip-abd"], byUid: "uid-sam", atMs: sameTime })],
      adjustments: [
        adjustment({ id: "other", changeType: "machines", trainerId: "uid-casey", createdAt: { toMillis: () => sameTime } }),
        adjustment({ id: "later", changeType: "machines", trainerId: "t-sam", createdAt: { toMillis: () => sameTime + 60_000 } }),
        adjustment({ id: "switch", changeType: "enabled", trainerId: "t-sam", createdAt: { toMillis: () => sameTime } }),
      ],
    });
    expect(rows.map((r) => r.id).sort()).toEqual(["adjustment:later", "adjustment:other", "adjustment:switch", "plan:p"]);
  });
});

/*
 * The screens preview (Oct 9 2026): the Changes said "yesterday · Oct 7" on
 * Oct 9, the words counted in 24-hour spans and the day in the studio's
 * days. Both are the studio's days now.
 */
describe("how long ago a change was, in the studio's days", () => {
  it("agrees with the day said beside it, whatever the hour", () => {
    expect(daysAgoWords("2026-10-09", "2026-10-09")).toBe("today");
    expect(daysAgoWords("2026-10-08", "2026-10-09")).toBe("yesterday");
    expect(daysAgoWords("2026-10-07", "2026-10-09")).toBe("2 days ago");
    expect(daysAgoWords("2026-10-01", "2026-10-09")).toBe("8 days ago");
    expect(daysAgoWords("2026-09-30", "2026-10-09")).toBe("9 days ago");
    // Across a month's end and a year's.
    expect(daysAgoWords("2026-12-31", "2027-01-01")).toBe("yesterday");
    expect(daysAgoWords("2026-08-01", "2026-10-09")).toBe("2 months ago");
    expect(daysAgoWords("2026-09-05", "2026-10-09")).toBe("a month ago");
  });

  it("says nothing it can't stand behind", () => {
    expect(daysAgoWords("2026-10-10", "2026-10-09")).toBe("today");
    expect(daysAgoWords("Oct 7", "2026-10-09")).toBeNull();
    expect(daysAgoWords("2026-10-07", "")).toBeNull();
  });
});
