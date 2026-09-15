import { describe, expect, it } from "vitest";
import {
  generalWatchOuts,
  machineKey,
  machineWatchOuts,
  machinesWithWatchOuts,
  shortCondition,
  toneOf,
} from "./clinical-watchouts";
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
    return import("../data/clinical-matrix").then(({ CLINICAL_FLAGS_MATRIX }) => {
      for (const f of CLINICAL_FLAGS_MATRIX) {
        for (const rule of f.protocolHandling) {
          for (const id of rule.affectedMachineIds) expect(machineKey(id)).toBe(id);
        }
      }
    });
  });
});
