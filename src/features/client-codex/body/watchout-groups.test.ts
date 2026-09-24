import { describe, expect, it } from "vitest";
import { CLINICAL_FLAGS_MATRIX } from "../../../data/clinical-matrix";
import { flagChip, groupEyebrow, watchOutGroups } from "./watchout-groups";
import { selectedFlags } from "../../clinical-flags/flag-search";

const machine = (id: string, name: string) => ({ id, name });
const matrixText = (flagId: string) =>
  CLINICAL_FLAGS_MATRIX.find((f) => f.id === flagId)!.protocolHandling!.map((r) => r.instruction);

describe("watch-outs grouped by instruction", () => {
  it("lists every floor machine one instruction names under ONE group", () => {
    const floor = [
      machine("m-overhead-press", "Overhead Press"),
      machine("m-neck", "4-Way Neck"),
      machine("m-cervical", "Cervical Extension"),
      machine("m-leg", "Leg Press"),
    ];
    const groups = watchOutGroups(["gen-neck"], floor);
    expect(groups).toHaveLength(1);
    expect(groups[0].machines.map((m) => m.name)).toEqual(["4-Way Neck", "Cervical Extension", "Overhead Press"]);
    expect(groups[0].instruction).toBe(matrixText("gen-neck")[0]);
    expect(groups[0].namesOffFloor).toBe(false);
  });

  it("quotes a general instruction for every set", () => {
    const [g] = watchOutGroups(["gen-blood-pressure"], []);
    expect(g.general).toBe(true);
    expect(g.instruction).toBe("Keep the breathing continuous on every set — no breath-holding under load.");
    expect(groupEyebrow(g)).toBe("Every set · High blood pressure — managed");
  });

  it("still shows an instruction that names no machine on this floor, and says so", () => {
    const [g] = watchOutGroups(["joint-tka"], [machine("m-chest", "Chest Press")]);
    expect(g.general).toBe(false);
    expect(g.machines).toEqual([]);
    expect(g.namesOffFloor).toBe(true);
  });

  it("keeps the set-up change the matrix names, verbatim", () => {
    const [g] = watchOutGroups(["spine-ddd"], [machine("m-lumbar", "Lumbar Extension")]);
    expect(g.setup).toBe("Gap 4-6. Diagnostic load: 20 lbs / 3 reps.");
    expect(g.machines.map((m) => m.id)).toEqual(["m-lumbar"]);
  });

  it("finds the floor's machines by catalog id and lineage, not only by a name that spells the matrix's key", () => {
    // The floor's names for the standard machines ("LUMBAR", "SEATED
    // ABDOMINALS") never spelled the matrix's keys ("lumbar_extension"), so
    // before the catalog-id matcher (clinical watch-outs, Sep 24) these read
    // "names no machine on this floor" while the machine stood on it.
    const floor = [
      machine("m-lumbar", "LUMBAR"),
      { id: "sm-westlake-lumbar", name: "Our Lumbar", comparisonKey: "m-lumbar" },
      machine("m-chest", "Chest Press"),
    ];
    const [g] = watchOutGroups(["spine-ddd"], floor);
    expect(g.namesOffFloor).toBe(false);
    expect(g.machines.map((m) => m.id)).toEqual(["m-lumbar", "sm-westlake-lumbar"]);
  });

  it("puts every-set groups first, then Stop before High before modify", () => {
    const groups = watchOutGroups(["gen-neck", "joint-tka", "cv-hypertension", "gen-blood-pressure"], []);
    expect(groups.map((g) => [g.general, g.flag.tone])).toEqual([
      [true, "alert"],
      [true, "modify"],
      [false, "caution"],
      [false, "modify"],
    ]);
  });

  it("prints a flag's bracketed detail in its heading, never only in a tooltip", () => {
    const [g] = watchOutGroups(["cv-hypertension"], []);
    expect(groupEyebrow(g)).toBe("Every set · Uncontrolled Hypertension · Resting BP > 180/100 mmHg");
  });

  it("never rewords an instruction: every one is the matrix's text", () => {
    const every = CLINICAL_FLAGS_MATRIX.map((f) => f.id);
    const all = new Set(CLINICAL_FLAGS_MATRIX.flatMap((f) => (f.protocolHandling ?? []).map((r) => r.instruction)));
    for (const g of watchOutGroups(every, [])) expect(all.has(g.instruction), g.instruction).toBe(true);
  });
});

describe("flagChip", () => {
  it("names the flag, badges Stop and High, and is crimson only for an absolute contraindication", () => {
    const chips = selectedFlags(["cv-hypertension", "gen-blood-pressure", "joint-tka"]).map(flagChip);
    const tones = new Map(selectedFlags(["cv-hypertension", "gen-blood-pressure", "joint-tka"]).map((f, i) => [f.tone, chips[i]]));
    for (const [tone, chip] of tones) {
      if (tone === "alert") {
        expect(chip.tone).toBe("alert");
        expect(chip.text).toMatch(/ · Stop$/);
      } else if (tone === "caution") {
        expect(chip.tone).toBe("warn");
        expect(chip.text).toMatch(/ · High$/);
      } else {
        expect(chip.tone).toBe("live");
        expect(chip.text).not.toContain(" · ");
      }
    }
    expect(flagChip({ name: "Neck limitation", tone: "modify" })).toEqual({ text: "Neck limitation", tone: "live" });
  });
});
