import { describe, expect, it } from "vitest";
import { nextSettings, nextSources } from "./settings-write";
import { parseSettingHistory } from "../machine-menu/setting-history";
import {
  journalBodyFor,
  parseStartingWeight,
  parseWeight,
  planSetupSave,
  reasonFor,
  weightRowOf,
  type SetupMachineInput,
} from "./setup-plan";

const FIELDS = [
  { key: "Seat", label: "Seat" },
  { key: "Gap", label: "Gap" },
  { key: "Chest Pad", label: "Chest Pad" },
];

const machine = (over: Partial<SetupMachineInput> = {}): SetupMachineInput => ({
  machineId: "m-compound-row",
  machineName: "Compound Row",
  fields: FIELDS,
  saved: {},
  draft: {},
  savedStartingWeight: null,
  savedCurrentWeight: null,
  ...over,
});

describe("what a settings save stores", () => {
  it("replaces this machine's fields, removes a cleared one, and keeps keys the screen does not show", () => {
    const saved = { Seat: "4", Gap: "0", "Old Lever": "B" };
    expect(nextSettings(FIELDS, saved, { Seat: "5", Gap: "", "Chest Pad": " 3 " })).toEqual({
      Seat: "5",
      "Chest Pad": "3",
      "Old Lever": "B",
    });
  });

  it("keeps an untouched field's source, and gives a changed one the source it was given — or typed", () => {
    const saved = { Seat: "4", Gap: "0" };
    const settings = { Seat: "4", Gap: "2", "Chest Pad": "3" };
    const sources = nextSources(FIELDS, saved, settings, { Seat: "suggested", Gap: "legacy" }, { "Chest Pad": "suggested" });
    // Seat untouched: still suggested. Gap retyped: typed, so not stored. Chest pad accepted: suggested.
    expect(sources).toEqual({ Seat: "suggested", "Chest Pad": "suggested" });
  });

  it("drops the source of a field that no longer has a value", () => {
    expect(nextSources(FIELDS, { Seat: "4" }, {}, { Seat: "suggested" }, null)).toEqual({});
  });
});

describe("planning the Setup screen's Save", () => {
  it("leaves an untouched machine out of the plan entirely", () => {
    const plan = planSetupSave([machine({ saved: { Seat: "4" }, draft: { Seat: "4" } }), machine({ machineId: "m-abs" })]);
    expect(plan.entries).toEqual([]);
    expect(plan.needsReason).toBe(false);
  });

  it("a first-time set-up needs no reason; changing a saved value does", () => {
    const first = planSetupSave([machine({ draft: { Seat: "4", Gap: "0" } })]);
    expect(first.needsReason).toBe(false);
    expect(first.entries[0]).toMatchObject({ isInitialSetup: true, settings: { Seat: "4", Gap: "0" } });
    expect(first.entries[0].changes.map((c) => `${c.label}:${c.from}>${c.to}`)).toEqual(["Seat:>4", "Gap:>0"]);

    const filling = planSetupSave([machine({ saved: { Seat: "4" }, draft: { Gap: "0" } })]);
    expect(filling.needsReason).toBe(false); // filling an empty field is still set-up
    expect(filling.entries[0].isInitialSetup).toBe(false);
    expect(filling.entries[0].settings).toEqual({ Seat: "4", Gap: "0" }); // a field the draft never mentioned is kept

    const changing = planSetupSave([machine({ saved: { Seat: "4" }, draft: { Seat: "5" } })]);
    expect(changing.needsReason).toBe(true);
    const clearing = planSetupSave([machine({ saved: { Seat: "4" }, draft: { Seat: "" } })]);
    expect(clearing.needsReason).toBe(true);
    expect(clearing.entries[0].settings).toEqual({});
  });

  it("records where each value came from", () => {
    const plan = planSetupSave([
      machine({ draft: { Seat: "4", Gap: "0" }, draftSources: { Seat: "suggested", Gap: "legacy" } }),
    ]);
    expect(plan.entries[0].sources).toEqual({ Seat: "suggested", Gap: "legacy" });
  });

  it("treats a typed load as the current weight, and as the starting weight only when there is none", () => {
    const fresh = planSetupSave([machine({ draftWeight: "112" })]);
    expect(fresh.entries[0].weight).toEqual({ current: 112, starting: 112, stampStart: true, from: null });
    expect(fresh.weightsChanged).toBe(1);
    expect(fresh.settingsChanged).toBe(0);

    const later = planSetupSave([machine({ savedStartingWeight: 80, savedCurrentWeight: 100, draftWeight: "112" })]);
    expect(later.entries[0].weight).toEqual({ current: 112, starting: 80, stampStart: false, from: 100 });

    expect(planSetupSave([machine({ savedCurrentWeight: 112, draftWeight: "112" })]).entries).toEqual([]);
    expect(planSetupSave([machine({ draftWeight: "heavy" })]).entries).toEqual([]);
    expect(parseWeight("")).toBeNull();
    expect(parseWeight("37.5")).toBe(37.5);
  });

  it("keeps what the shorthand reader could not place as a note, even with no other change", () => {
    const plan = planSetupSave([machine({ note: " PILLOW " })]);
    expect(plan.entries[0]).toMatchObject({ note: "PILLOW", changes: [] });
  });

  it("gives every audit row a reason", () => {
    const [first] = planSetupSave([machine({ draft: { Seat: "4" } })]).entries;
    const [change] = planSetupSave([machine({ saved: { Seat: "4" }, draft: { Seat: "5" } })]).entries;
    expect(reasonFor(first, "", false)).toBe("Initial setup");
    expect(reasonFor(change, "", false)).toBe("Settings update");
    expect(reasonFor(change, " Needs more ROM ", false)).toBe("Needs more ROM");
    expect(reasonFor(first, "", true)).toBe("Copied from the FileMaker chart");
  });

  it("writes ONE journal entry for the Save, and none when only loads moved", () => {
    const plan = planSetupSave([
      machine({ draft: { Seat: "4", Gap: "0" } }),
      machine({ machineId: "m-leg-press", machineName: "Leg Press", saved: { Seat: "3" }, draft: { Seat: "4" } }),
      machine({ machineId: "m-abs", machineName: "Abs", draftWeight: "60" }),
    ]);
    expect(journalBodyFor(plan, "Hip replaced in August", false)).toBe(
      "Machine set-up saved — 2 machines. Compound Row: Seat — → 4, Gap — → 0; Leg Press: Seat 3 → 4. Reason: Hip replaced in August",
    );
    expect(journalBodyFor(planSetupSave([machine({ draftWeight: "60" })]), "", false)).toBe("");
  });

  it("keeps a thirty-machine Save readable instead of writing a wall", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      machine({ machineId: `m-${i}`, machineName: `A machine with a long name ${i}`, draft: { Seat: "4", Gap: "0", "Chest Pad": "3" } }),
    );
    const body = journalBodyFor(planSetupSave(many), "", true);
    expect(body.startsWith("Machine set-up copied from the FileMaker chart — 30 machines.")).toBe(true);
    expect(body.length).toBeLessThan(1000);
    expect(body).toMatch(/… and \d+ more\.$/);
  });
});

describe("Correct the starting weight (AJ, Oct 4 2026, Q3 (a))", () => {
  const onFile = (over: Partial<SetupMachineInput> = {}) =>
    machine({ savedStartingWeight: 84, savedCurrentWeight: 100, ...over });

  it("corrects a start on file without touching today's weight, and asks no reason", () => {
    const plan = planSetupSave([onFile({ draftStart: "80" })]);
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].start).toEqual({ from: 84, to: 80, currentFrom: 100, currentTo: 100 });
    expect(plan.entries[0].weight).toBeUndefined();
    expect(plan.entries[0].settings).toBeUndefined();
    expect(plan.needsReason).toBe(false);
    expect(plan.weightsChanged).toBe(1);
    expect(plan.settingsChanged).toBe(0);
  });

  it("is only a correction: with no start on file the box is ignored (the load stamps one instead)", () => {
    expect(planSetupSave([machine({ draftStart: "80" })]).entries).toEqual([]);
  });

  it("writes nothing for the number already on file, or for a box that holds no weight", () => {
    expect(planSetupSave([onFile({ draftStart: "84" })]).entries).toEqual([]);
    expect(planSetupSave([onFile({ draftStart: "84.0" })]).entries).toEqual([]);
    expect(planSetupSave([onFile({ draftStart: "" })]).entries).toEqual([]);
    expect(planSetupSave([onFile({ draftStart: "0" })]).entries).toEqual([]);
    expect(planSetupSave([onFile({ draftStart: "heavy" })]).entries).toEqual([]);
    expect(planSetupSave([onFile({ draftStart: "2001" })]).entries).toEqual([]);
    expect(parseStartingWeight("0")).toBeNull();
    expect(parseStartingWeight(" 37.5 ")).toBe(37.5);
  });

  it("carries a load moved in the same Save, and counts the machine once", () => {
    const plan = planSetupSave([onFile({ draftStart: "80", draftWeight: "112" })]);
    expect(plan.entries[0].start).toEqual({ from: 84, to: 80, currentFrom: 100, currentTo: 112 });
    expect(plan.entries[0].weight).toEqual({ current: 112, starting: 84, stampStart: false, from: 100 });
    expect(plan.weightsChanged).toBe(1);
  });

  it("writes the Prescription card's WEIGHT row, the one the machine menu reads as the starting weight", () => {
    const [entry] = planSetupSave([onFile({ draftStart: "80" })]).entries;
    const row = weightRowOf(entry, false);
    expect(row).toEqual({ oldValue: "Start: 84, Current: 100", newValue: "Start: 80, Current: 100", reason: "Weight update" });
    const [parsed] = parseSettingHistory([{ id: "w1", clientId: "c1", changeType: "WEIGHT", timestamp: "2026-10-04T10:00:00-04:00", ...row }], "c1");
    expect(parsed.kind).toBe("start-weight");
    expect(parsed.pairs).toEqual([{ label: "Starting weight", from: "84", to: "80" }]);

    const [both] = planSetupSave([onFile({ draftStart: "80", draftWeight: "112" })]).entries;
    expect(weightRowOf(both, true)).toEqual({
      oldValue: "Start: 84, Current: 100",
      newValue: "Start: 80, Current: 112",
      reason: "Copied from the FileMaker chart",
    });
    const [noLoad] = planSetupSave([onFile({ savedCurrentWeight: null, draftStart: "80" })]).entries;
    expect(weightRowOf(noLoad, false)).toMatchObject({ oldValue: "Start: 84, Current: None", newValue: "Start: 80, Current: None" });
  });

  it("leaves a load alone in Setup's own words, and writes no row when no weight moved", () => {
    const [load] = planSetupSave([onFile({ draftWeight: "112" })]).entries;
    expect(weightRowOf(load, false)).toEqual({ oldValue: "Current: 100", newValue: "Current: 112", reason: "Weight update" });
    const [settings] = planSetupSave([machine({ saved: { Seat: "4" }, draft: { Seat: "5" } })]).entries;
    expect(weightRowOf(settings, false)).toBeNull();
  });

  it("is never journalled, like every weight", () => {
    expect(journalBodyFor(planSetupSave([onFile({ draftStart: "80" })]), "", false)).toBe("");
  });
});
