import { describe, expect, it } from "vitest";
import { buildGuide, knowledgeOf } from "./adapters";
import { MACHINE_DATABASE } from "../../data/machine-database";
import { MACHINE_DEFINITIONS } from "../../data/machine-definitions";
import type { Machine } from "../../types";

/*
 * The first-time set-up guide (Sep 24 2026). MACHINE_DATABASE is keyed by its
 * own slugs and the floor carries the catalog's ids, so `MACHINE_DATABASE[id]`
 * found nothing for any of the twenty and the guide came up with no set-up
 * steps.
 */
describe("knowledgeOf", () => {
  it("finds the static record for every catalog machine, by its catalog id", () => {
    const missing = Object.keys(MACHINE_DEFINITIONS).filter((id) => !knowledgeOf({ id, name: "" }));
    expect(missing).toEqual([]);
  });

  it("gives the neck the Cervical Extension record, never the superseded 4-way neck one", () => {
    expect(knowledgeOf({ id: "m-neck", name: "CX (4 WAY NECK)" })).toBe(MACHINE_DATABASE.cervical_extension);
  });

  it("still reads a legacy database-keyed id directly", () => {
    expect(knowledgeOf({ id: "lumbar_extension", name: "Low Back" })).toBe(MACHINE_DATABASE.lumbar_extension);
  });

  it("never lends a studio's own machine the standard machine's set-up", () => {
    expect(knowledgeOf({ id: "sm-solon-hammer-leg-press", name: "Hammer Strength Press" })).toBeUndefined();
  });
});

describe("buildGuide", () => {
  const lumbar: Machine = { id: "m-lumbar", name: "LUMBAR" };

  it("the first-time guide has its set-up steps on a catalog machine", () => {
    const guide = buildGuide(lumbar, undefined);
    expect(guide?.setupCues.length).toBeGreaterThan(0);
    expect(guide?.setupCues).toEqual(MACHINE_DATABASE.lumbar_extension.setupCues);
    expect(guide?.setupSummary).toBe(MACHINE_DATABASE.lumbar_extension.setup);
  });

  it("the catalog's words still win over the static copy wherever the catalog has them", () => {
    const catalog = MACHINE_DEFINITIONS["m-lumbar"];
    const guide = buildGuide(lumbar, catalog);
    expect(guide?.executionCues).toEqual(catalog.execution.keyCues);
    if ((catalog.clinicalWarnings ?? []).length > 0) {
      expect(guide?.clinicalWarnings).toEqual(catalog.clinicalWarnings);
    }
    expect(guide?.requiresHandoff).toBe(Boolean(catalog.execution.requiresHandoff));
    // Set-up steps exist only in the static record.
    expect(guide?.setupCues).toEqual(MACHINE_DATABASE.lumbar_extension.setupCues);
  });

  it("an empty catalog field falls through to the static record rather than blanking it", () => {
    const catalog = {
      ...MACHINE_DEFINITIONS["m-lumbar"],
      clinicalWarnings: [],
      execution: { ...MACHINE_DEFINITIONS["m-lumbar"].execution, keyCues: [] },
    };
    const guide = buildGuide(lumbar, catalog);
    expect(guide?.executionCues).toEqual(MACHINE_DATABASE.lumbar_extension.executionCues);
    expect(guide?.clinicalWarnings).toEqual(MACHINE_DATABASE.lumbar_extension.clinicalWarnings);
  });
});
