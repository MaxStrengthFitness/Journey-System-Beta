import { describe, it, expect } from "vitest";
import { MACHINE_DEFINITIONS, MACHINE_DEFINITION_LIST } from "../../../data/machine-definitions";
import type { MachineDefinition } from "../../../types/machines";
import {
  SECTIONS,
  completeness,
  describeGaps,
  sectionStates,
} from "./completeness";

const legPress = MACHINE_DEFINITIONS["m-leg-press"];

describe("the generated catalog", () => {
  it("covers all twenty machines", () => {
    expect(MACHINE_DEFINITION_LIST).toHaveLength(20);
  });

  it("gives every machine a distinct id and display order", () => {
    const ids = new Set(MACHINE_DEFINITION_LIST.map((m) => m.id));
    expect(ids.size).toBe(20);
    // Order is what the catalog list sorts on. Ties are why the old list
    // rendered in Firestore snapshot order.
    const orders = new Set(MACHINE_DEFINITION_LIST.map((m) => m.defaultOrder));
    expect(orders.size).toBe(20);
  });

  it("never leaves a machine on the wrong movement pattern", () => {
    // The bug this round exists to kill: every legacy document fell back to
    // emptyMachineDefinition()'s "Upper Body: Horizontal Push", including the
    // leg press, and saving wrote it in.
    expect(legPress.movementPattern).toBe("Lower Body: Quad Dominant");
    const pushes = MACHINE_DEFINITION_LIST.filter(
      (m) => m.movementPattern === "Upper Body: Horizontal Push",
    );
    expect(pushes.length).toBeLessThan(4);
  });

  it("classifies multi-joint movements as compound even where the guide says squeeze", () => {
    // The Academy gives the compound row a pause and a squeeze at the
    // contracted position. That is its PROTOCOL; it is still multi-joint, and
    // deriving the class from the turnaround would split the roll-ups.
    expect(MACHINE_DEFINITIONS["m-compound-row"].kinematicClass).toBe("compound-linear");
    expect(MACHINE_DEFINITIONS["m-compound-row"].execution.upperTurnaround.style).toBe(
      "pause-squeeze",
    );
    expect(MACHINE_DEFINITIONS["m-pulldown"].kinematicClass).toBe("compound-linear");
  });

  it("carries never-to-failure on the two spinal machines, and nowhere else", () => {
    const never = MACHINE_DEFINITION_LIST.filter((m) => m.execution.neverToFailure);
    expect(never.map((m) => m.id).sort()).toEqual(["m-lumbar", "m-neck"]);
    // Structured so the session UI can enforce it, and explained so a trainer
    // reading the screen knows why.
    for (const m of never) expect(m.execution.safetyNotice).toBeTruthy();
  });

  it("keeps the house cadence everywhere the guide does not say otherwise", () => {
    for (const m of MACHINE_DEFINITION_LIST) {
      expect(m.execution.concentricSeconds).toBeGreaterThan(0);
      expect(m.execution.eccentricSeconds).toBeGreaterThan(0);
    }
  });

  it("lifts the Academy's prose rather than summarising it", () => {
    // A spot check that the parser kept whole sentences, citations stripped.
    expect(legPress.universalBaseline.seatHeightPosition).toContain("Position 2 (P2)");
    expect(legPress.universalBaseline.seatHeightPosition).not.toMatch(/\[\d+/);
    expect(legPress.alignmentCheckpoints[0].title).toBe("Knee Tracking");
  });

  it("gives every machine its dials, from the labels the app already used", () => {
    for (const m of MACHINE_DEFINITION_LIST) {
      expect(m.settingFields.length).toBeGreaterThan(0);
      // The key is a foreign key into every client's stored settings, so it
      // must be a stable slug and never the display label.
      for (const f of m.settingFields) {
        expect(f.key).toMatch(/^[a-z0-9-]+$/);
      }
    }
  });

  it("leaves a dial default absent rather than guessing one", () => {
    // Only the machines whose guide states a starting gap get one.
    const withDefaults = MACHINE_DEFINITION_LIST.filter(
      (m) => Object.keys(m.defaultSettings).length > 0,
    );
    expect(withDefaults.length).toBeGreaterThan(0);
    expect(withDefaults.length).toBeLessThan(20);
    for (const m of withDefaults) {
      for (const key of Object.keys(m.defaultSettings)) {
        // A default with no dial to sit on is the phantom row pruneToFields exists for.
        expect(m.settingFields.map((f) => f.key)).toContain(key);
      }
    }
  });
});

describe("completeness", () => {
  it("counts a generated machine as nearly finished", () => {
    const c = completeness(legPress);
    expect(c.percent).toBeGreaterThan(80);
    expect(c.done).toBeLessThanOrEqual(c.total);
  });

  it("names what is missing instead of only scoring it", () => {
    const stripped = {
      ...legPress,
      alignmentCheckpoints: [],
      clinicalWarnings: [],
    } as MachineDefinition;
    const c = completeness(stripped);
    const what = c.gaps.map((g) => g.what);
    expect(what).toContain("at least one alignment checkpoint");
    expect(what).toContain("clinical warnings");
  });

  it("does not ask for a handoff protocol on a machine with no handoff", () => {
    const noHandoff = {
      ...legPress,
      execution: { ...legPress.execution, requiresHandoff: false, handoffProtocol: "" },
    } as MachineDefinition;
    const gaps = completeness(noHandoff).gaps.map((g) => g.what);
    expect(gaps).not.toContain("how the handoff is performed");

    const withHandoff = {
      ...legPress,
      execution: { ...legPress.execution, requiresHandoff: true, handoffProtocol: "" },
    } as MachineDefinition;
    expect(completeness(withHandoff).gaps.map((g) => g.what)).toContain(
      "how the handoff is performed",
    );
  });

  it("keeps the denominator honest when a conditional check applies", () => {
    const a = completeness({
      ...legPress,
      execution: { ...legPress.execution, requiresHandoff: false },
    } as MachineDefinition);
    const b = completeness({
      ...legPress,
      execution: { ...legPress.execution, requiresHandoff: true, handoffProtocol: "Yes." },
    } as MachineDefinition);
    // The handoff machine is asked one more question, and answered it.
    expect(b.total).toBe(a.total + 1);
    expect(b.percent).toBeGreaterThanOrEqual(a.percent);
  });

  it("locks the method sections for a studio and no one else", () => {
    const studio = sectionStates(legPress, "studio");
    const admin = sectionStates(legPress, "admin");
    const locked = studio.filter((s) => s.locked).map((s) => s.id);
    // Musculature and execution are the company's; the baseline and the
    // dials are the studio's own hardware.
    expect(locked).toContain("musculature");
    expect(locked).toContain("execution");
    expect(locked).not.toContain("baseline");
    expect(locked).not.toContain("dials");
    expect(admin.every((s) => !s.locked)).toBe(true);
  });

  it("gives every section at least one check", () => {
    for (const s of sectionStates(legPress)) {
      expect(s.total).toBeGreaterThan(0);
    }
    expect(sectionStates(legPress)).toHaveLength(SECTIONS.length);
  });
});

describe("describeGaps", () => {
  it("names the first few and counts the rest", () => {
    const gaps = [
      { section: "baseline" as const, what: "the seat position" },
      { section: "baseline" as const, what: "the restraints" },
      { section: "safety" as const, what: "clinical warnings" },
    ];
    expect(describeGaps(gaps)).toBe(
      "Needs the seat position and the restraints, and 1 more",
    );
    expect(describeGaps(gaps.slice(0, 1))).toBe("Needs the seat position");
    expect(describeGaps([])).toBe("");
  });
});
