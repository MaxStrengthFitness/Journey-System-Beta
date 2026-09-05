import { describe, expect, it } from "vitest";
import { machinesForBodySlug, resolveMachineAnatomy } from "./anatomy";
import { MACHINE_ANATOMY } from "../../data/machine-anatomy-map";
import { isMuscleVisibleOn, toBodySlug } from "../../types/machines";

describe("resolveMachineAnatomy", () => {
  it("puts Hip Abduction on the posterior view targeting the abductors", () => {
    // The regression this round exists for. The legacy machineMuscleMap said
    // primary ['gluteal'] + synergist ['lower-back','obliques'] and the figure
    // sat on the anterior view, so a glute machine lit up the client's core.
    const a = resolveMachineAnatomy("m-hip-abd");
    expect(a.preferredView).toBe("back");
    expect(a.primary).toContain("abductors");
    expect(a.primary).not.toContain("obliques");
    expect(a.secondary).not.toContain("obliques");
    expect(a.secondary).not.toContain("lower-back");
  });

  it("never paints a region as both primary and secondary", () => {
    // Hip Abduction is the sharp case: abductors AND glutes both collapse onto
    // the model's single 'gluteal' region, and the library paints in order, so
    // a duplicate would let the lighter secondary pass win over the primary.
    for (const id of Object.keys(MACHINE_ANATOMY)) {
      const { primary, secondary } = resolveMachineAnatomy(id);
      const primarySlugs = new Set(primary.map(toBodySlug));
      for (const m of secondary) {
        expect(
          primarySlugs.has(toBodySlug(m)),
          `${id}: ${m} is secondary but its region is already primary`,
        ).toBe(false);
      }
    }
  });

  it("prefers the machine document's own MuscleId fields over the map", () => {
    const a = resolveMachineAnatomy("m-hip-abd", {
      primaryMuscles: ["quads"],
      preferredView: "front",
    });
    expect(a.primary).toEqual(["quads"]);
    expect(a.preferredView).toBe("front");
  });

  it("ignores loose display names rather than half-painting the figure", () => {
    // Some legacy documents carry "Gluteus Medius" in primaryMuscles. All or
    // nothing: fall back to the map instead of rendering a blank figure.
    const a = resolveMachineAnatomy("m-hip-abd", {
      primaryMuscles: ["Gluteus Medius", "glutes"],
    });
    expect(a.primary).toContain("abductors");
  });

  it("renders a neutral figure for a machine it has never heard of", () => {
    const a = resolveMachineAnatomy("sm-solon-hammer-leg-press");
    expect(a.primary).toEqual([]);
    expect(a.secondary).toEqual([]);
  });

  it("every mapped machine resolves to at least one primary muscle", () => {
    for (const id of Object.keys(MACHINE_ANATOMY)) {
      expect(resolveMachineAnatomy(id).primary.length, id).toBeGreaterThan(0);
    }
  });
});

describe("machinesForBodySlug", () => {
  it("ranks a machine that targets the region above one that assists it", () => {
    const hits = machinesForBodySlug("chest");
    expect(hits[0]).toBe("m-chest-press");
    // Dip lists pecs as a synergist, so it must come after the pressing lifts.
    expect(hits.indexOf("m-dip")).toBeGreaterThan(hits.indexOf("m-chest-press"));
  });

  it("matches both halves of a collapsed region", () => {
    // 'gluteal' covers glutes AND abductors; 'deltoids' covers front and rear.
    expect(machinesForBodySlug("gluteal")).toContain("m-hip-abd");
    expect(machinesForBodySlug("deltoids")).toContain("m-overhead-press");
  });

  it("returns nothing for a region no machine maps to", () => {
    expect(machinesForBodySlug("hair")).toEqual([]);
    expect(machinesForBodySlug("")).toEqual([]);
  });
});

describe("preferredView actually shows the target", () => {
  it("every machine's preferred view renders at least one PRIMARY muscle", () => {
    // The generalised form of the Hip Abduction bug. A machine whose primary
    // muscles are all on the other side of the body renders a figure lit only
    // by its synergists — which reads to a trainer as "this machine works the
    // core" when it works the glutes.
    const wrong: string[] = [];
    for (const id of Object.keys(MACHINE_ANATOMY)) {
      const { primary, preferredView } = resolveMachineAnatomy(id);
      if (primary.length === 0) continue;
      if (!primary.some((m) => isMuscleVisibleOn(m, preferredView))) {
        wrong.push(
          `${id}: primary [${primary.join(", ")}] is invisible on the ${preferredView} view`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });
});
