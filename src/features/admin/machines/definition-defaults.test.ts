import { describe, expect, it } from "vitest";
import { MACHINE_DEFINITION_LIST, MACHINE_DEFINITIONS } from "../../../data/machine-definitions";
import type { MachineDefinition } from "../../../types/machines";
import { CODEX_FIELDS, codexFieldsOf, definitionOf, normalizeMachineDefinition } from "./definition-defaults";

const legPress = MACHINE_DEFINITIONS["m-leg-press"];

describe("the Codex format, v2, in the normaliser", () => {
  it("reads every one of the twenty exactly as before: no v2 key appears", () => {
    // AJ's approval: "an old definition reads exactly as before".
    for (const m of MACHINE_DEFINITION_LIST) {
      const d = definitionOf(m) as unknown as Record<string, unknown>;
      for (const k of CODEX_FIELDS) expect(k in d).toBe(false);
    }
  });

  it("keeps a well-formed v2 field", () => {
    const d = normalizeMachineDefinition({
      ...(legPress as MachineDefinition),
      setUp: { entry: "Have a seat." },
      stopRules: [{ text: "The knees never lock out." }],
      switches: { repCap: 8 },
      sources: [{ path: "setUp.entry", kind: "academy", ref: "script" }],
      modelId: " mm-hoist-roc-it-leg-press ",
    });
    expect(d.setUp).toEqual({ entry: "Have a seat." });
    expect(d.stopRules).toEqual([{ text: "The knees never lock out." }]);
    expect(d.switches).toEqual({ repCap: 8 });
    expect(d.sources).toHaveLength(1);
    expect(d.modelId).toBe("mm-hoist-roc-it-leg-press");
  });

  it("drops a v2 field in the wrong shape rather than bending it", () => {
    const d = normalizeMachineDefinition({
      ...(legPress as MachineDefinition),
      setUp: "have a seat" as never,
      stopRules: [{ text: "" }, "loose words"] as never,
      sources: [{ path: "x", kind: "rumour" }] as never,
      modelId: "   ",
    }) as unknown as Record<string, unknown>;
    for (const k of ["setUp", "stopRules", "sources", "modelId"]) expect(k in d).toBe(false);
  });

  it("returns nothing for a document with no v2 field", () => {
    expect(codexFieldsOf({ name: "Minas Tirith Sled" })).toEqual({});
  });
});
