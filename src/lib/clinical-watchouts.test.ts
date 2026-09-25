import { describe, expect, it } from "vitest";
import {
  catalogIdOfMatrixKey,
  generalWatchOuts,
  machineKey,
  machineSpecificWatchOuts,
  machineWatchOuts,
  machinesWithWatchOuts,
  namedMachines,
  shortCondition,
  toneOf,
} from "./clinical-watchouts";
import { CLINICAL_FLAGS_MATRIX } from "../data/clinical-matrix";
import { MACHINE_DEFINITIONS } from "../data/machine-definitions";
import type { ClinicalSafetyFlag } from "../types";

const MATRIX: ClinicalSafetyFlag[] = [
  {
    id: "bp",
    category: "Cardio",
    conditionName: "Uncontrolled Hypertension (Resting BP > 180/100 mmHg)",
    severity: "Absolute Contraindication",
    protocolHandling: [{ instruction: "Never hold the breath.", affectedMachineIds: [] }],
  },
  {
    id: "disc",
    category: "Spine",
    conditionName: "Degenerative Disc Disease",
    severity: "Moderate / Needs Modification",
    protocolHandling: [
      { instruction: "Shorten the range.", affectedMachineIds: ["lumbar_extension"], setupModification: " Gap 4-6. " },
    ],
  },
  {
    id: "osteo",
    category: "Bone",
    conditionName: "Osteoporosis / Severe Osteopenia",
    severity: "High Risk",
    protocolHandling: [{ instruction: "No flexion under load.", affectedMachineIds: ["leg_press", "lumbar_extension"] }],
  },
];

describe("shortCondition / toneOf / machineKey", () => {
  it("drops the parenthetical detail", () => {
    expect(shortCondition("Uncontrolled Hypertension (Resting BP > 180/100 mmHg)")).toBe("Uncontrolled Hypertension");
  });
  it("maps severity to a tone", () => {
    expect(toneOf("Absolute Contraindication")).toBe("alert");
    expect(toneOf("High Risk")).toBe("caution");
    expect(toneOf("Moderate / Needs Modification")).toBe("modify");
  });
  it("normalises ids and names to one key", () => {
    expect(machineKey("Leg Press")).toBe("leg_press");
    expect(machineKey("leg-press")).toBe("leg_press");
    expect(machineKey(" LEG_PRESS ")).toBe("leg_press");
    expect(machineKey(null)).toBe("");
  });
});

describe("machineWatchOuts", () => {
  it("returns nothing without flags", () => {
    expect(machineWatchOuts([], { id: "leg_press" }, MATRIX)).toEqual([]);
    expect(machineWatchOuts(undefined, { id: "leg_press" }, MATRIX)).toEqual([]);
  });

  it("matches on id and sorts the most serious first", () => {
    const list = machineWatchOuts(["disc", "osteo", "bp"], { id: "lumbar_extension" }, MATRIX);
    expect(list.map((w) => w.flagId)).toEqual(["osteo", "disc"]);
    expect(list[1].setup).toBe("Gap 4-6.");
    expect(list.every((w) => !w.general)).toBe(true);
  });

  it("matches a studio machine by name", () => {
    const list = machineWatchOuts(["osteo"], { id: "sm-solon-abc", name: "Leg Press" }, MATRIX);
    expect(list).toHaveLength(1);
  });

  it("ignores machines no instruction names", () => {
    expect(machineWatchOuts(["osteo"], { id: "chest_press", name: "Chest Press" }, MATRIX)).toEqual([]);
  });
});

describe("generalWatchOuts", () => {
  it("returns only instructions that name no machine", () => {
    const list = generalWatchOuts(["bp", "osteo"], MATRIX);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ flagId: "bp", tone: "alert", general: true, setup: null });
  });
});

describe("machinesWithWatchOuts", () => {
  it("counts machines with at least one specific watch-out", () => {
    expect(
      machinesWithWatchOuts(["osteo"], [{ id: "leg_press" }, { id: "lumbar_extension" }, { id: "chest_press" }], MATRIX),
    ).toBe(2);
    expect(machinesWithWatchOuts([], [{ id: "leg_press" }], MATRIX)).toBe(0);
  });
});

describe("the real matrix", () => {
  it("every machine id it names is a plain slug", () => {
    for (const f of CLINICAL_FLAGS_MATRIX) {
      for (const rule of f.protocolHandling) {
        for (const id of rule.affectedMachineIds) expect(machineKey(id)).toBe(id);
      }
    }
  });
});

/*
 * THE DRIFT GUARD (Sep 24 2026). The matrix names machines by the keys it was
 * written against; the floor carries the catalog's ids. Nine of the twenty
 * standard machines never matched — no watch-out ever showed on the lumbar,
 * abs, neck, hip abduction or adduction, pullover, chest fly, bicep or tricep
 * machine — and every test above passed, because they all used the matrix's
 * own keys as the machine id. These use the catalog the floor actually runs.
 */
describe("the real matrix against the real catalog", () => {
  const keys = [
    ...new Set(CLINICAL_FLAGS_MATRIX.flatMap((f) => f.protocolHandling.flatMap((r) => r.affectedMachineIds))),
  ];
  const everyFlag = CLINICAL_FLAGS_MATRIX.map((f) => f.id);
  const catalog = Object.values(MACHINE_DEFINITIONS);

  it("every machine key the matrix names resolves to a real catalog machine", () => {
    const unresolved = keys.filter((k) => !MACHINE_DEFINITIONS[catalogIdOfMatrixKey(k)]);
    expect(unresolved).toEqual([]);
  });

  it("resolves the keys that used to miss to the machines they mean", () => {
    expect(catalogIdOfMatrixKey("lumbar_extension")).toBe("m-lumbar");
    expect(catalogIdOfMatrixKey("abdominals")).toBe("m-abs");
    expect(catalogIdOfMatrixKey("abduction")).toBe("m-hip-abd");
    expect(catalogIdOfMatrixKey("adduction")).toBe("m-hip-add");
    expect(catalogIdOfMatrixKey("4_way_neck")).toBe("m-neck");
    expect(catalogIdOfMatrixKey("cervical_extension")).toBe("m-neck");
    expect(catalogIdOfMatrixKey("pullover")).toBe("m-pullover");
    expect(catalogIdOfMatrixKey("chest_flye")).toBe("m-chest-fly");
    expect(catalogIdOfMatrixKey("biceps_curl")).toBe("m-bicep");
    expect(catalogIdOfMatrixKey("triceps_extension")).toBe("m-tricep-ext");
  });

  it("every catalog machine a rule names shows that rule, as the floor carries it (id + name)", () => {
    for (const key of keys) {
      const id = catalogIdOfMatrixKey(key);
      const m = MACHINE_DEFINITIONS[id];
      const flagged = CLINICAL_FLAGS_MATRIX.filter((f) =>
        f.protocolHandling.some((r) => r.affectedMachineIds.includes(key)),
      );
      const shown = new Set(machineWatchOuts(everyFlag, { id: m.id, name: m.name }).map((w) => w.flagId));
      for (const f of flagged) expect([id, f.id, shown.has(f.id)]).toEqual([id, f.id, true]);
    }
  });

  it("a studio that renamed a catalog machine keeps its watch-outs (matched on the id)", () => {
    const list = machineWatchOuts(["spine-ddd"], { id: "m-lumbar", name: "Back Extension (Nautilus)" });
    expect(list).toHaveLength(1);
    expect(list[0].setup).toBe("Gap 4-6. Diagnostic load: 20 lbs / 3 reps.");
  });

  it("a studio's own machine is matched by its lineage, else by name, else not at all", () => {
    const hammer = { id: "sm-solon-hammer-leg-press", name: "Hammer Strength Press", comparisonKey: "m-leg-press" };
    expect(machineWatchOuts(["joint-tka"], hammer).map((w) => w.flagId)).toEqual(["joint-tka"]);
    expect(machineWatchOuts(["joint-tka"], { id: "sm-solon-leg-press", name: "Seated Leg Press" })).toHaveLength(1);
    expect(machineWatchOuts(["joint-tka"], { id: "sm-solon-sled", name: "Sled Push" })).toEqual([]);
  });

  it("a machine no rule names stays quiet, even with every flag on", () => {
    // Every catalog machine is named by at least one rule today; a made-up
    // one proves the match is not "anything goes".
    expect(machineWatchOuts(everyFlag, { id: "m-glute-ham-raise", name: "Glute Ham Raise" })).toEqual([]);
    expect(catalog.length).toBe(20);
  });
});

describe("namedMachines", () => {
  const floor = [
    { id: "m-leg-press", name: "LEG PRESS" },
    { id: "m-lumbar", name: "LUMBAR" },
    { id: "m-abs", name: "SEATED ABDOMINALS" },
    { id: "m-chest-press", name: "CHEST PRESS" },
  ];

  it("names the machines on this floor, in floor order, never the matrix's keys", () => {
    expect(namedMachines(["abdominals", "torso_rotation", "lumbar_extension", "leg_press"], floor)).toEqual([
      "LEG PRESS",
      "LUMBAR",
      "SEATED ABDOMINALS",
    ]);
  });

  it("says the keys as words when none of them is on the floor, one per machine", () => {
    expect(namedMachines(["cervical_extension", "4_way_neck"], floor)).toEqual(["Cervical Extension"]);
    expect(namedMachines(["lumbar_extension"])).toEqual(["Lumbar Extension"]);
    expect(namedMachines([], floor)).toEqual([]);
  });
});

describe("machineSpecificWatchOuts", () => {
  it("lists the conditions that name machines, with the machines, most serious first", () => {
    const list = machineSpecificWatchOuts(["gen-knee", "bone-osteoporosis", "cv-hypertension"], [
      { id: "m-leg-press", name: "LEG PRESS" },
      { id: "m-ext", name: "LEG EXTENSION" },
    ]);
    expect(list.map((w) => w.flagId)).toEqual(["bone-osteoporosis", "gen-knee"]);
    expect(list[0]).toMatchObject({ tone: "caution", general: false, machines: ["LEG PRESS"] });
    expect(list[1].machines).toEqual(["LEG PRESS", "LEG EXTENSION"]);
  });
});
