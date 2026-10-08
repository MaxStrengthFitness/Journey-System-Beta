/**
 * The Edit routine drawer's templates (`drawerTemplates`): routines only.
 * A starting routine (a preset with a `start` part, Oct 8 2026) is a plan's
 * whole road and belongs to Start a plan, and seeding the Academy's eleven
 * never takes the built-in templates away.
 */
import { describe, expect, it } from "vitest";
import type { RoutinePreset } from "../types";
import { drawerTemplates, isStartingRoutinePreset, normalizeRoutinePreset } from "./routine-templates";

const preset = (raw: Partial<RoutinePreset>) => normalizeRoutinePreset(raw);

const builtIn: RoutinePreset[] = [
  preset({ id: "built-in-1", name: "Full body", machineIds: ["m-leg-press"], scope: "global" }),
];

const startingRoutine = (id: string, over: Partial<RoutinePreset> = {}) =>
  preset({
    id,
    name: `Starting ${id}`,
    machineIds: ["m-leg-press", "m-compound-row", "m-chest-press", "m-lumbar"],
    scope: "global",
    tier: "company",
    start: { dayOne: ["m-leg-press", "m-compound-row"] },
    ...over,
  });

describe("a starting routine preset", () => {
  it("is one with a start part, and only that", () => {
    expect(isStartingRoutinePreset(startingRoutine("academy-knee"))).toBe(true);
    expect(isStartingRoutinePreset(builtIn[0])).toBe(false);
    expect(isStartingRoutinePreset({ start: null as unknown as undefined })).toBe(false);
  });
});

describe("the Edit routine drawer's templates", () => {
  it("keeps the built-in templates while head office's only presets are starting routines", () => {
    const seeded = [startingRoutine("academy-knee"), startingRoutine("academy-arms")];
    const { company } = drawerTemplates(seeded, "studioA", builtIn);
    expect(company.map((p) => p.id)).toEqual(["built-in-1"]);
  });

  it("offers head office's routine templates by name, and never a starting routine among them", () => {
    const presets = [
      startingRoutine("academy-knee"),
      preset({ id: "c-2", name: "Upper", machineIds: ["m-pulldown"], scope: "global", tier: "company" }),
      preset({ id: "c-1", name: "Lower", machineIds: ["m-leg-press"], scope: "global", tier: "company" }),
    ];
    const { company } = drawerTemplates(presets, "studioA", builtIn);
    expect(company.map((p) => p.id)).toEqual(["c-1", "c-2"]);
  });

  it("offers this studio's templates first, then trainers' saved ones, and not the studio's starting routines", () => {
    const presets = [
      preset({ id: "t-1", name: "Alpha", machineIds: ["m-abs"], scope: "studioA", tier: "trainer" }),
      preset({ id: "s-1", name: "Zulu", machineIds: ["m-abs"], scope: "studioA", tier: "studio" }),
      startingRoutine("s-start", { scope: "studioA", tier: "studio", studioId: "studioA" }),
      preset({ id: "other", name: "Other studio", machineIds: ["m-abs"], scope: "studioB", tier: "studio" }),
    ];
    const { studio } = drawerTemplates(presets, "studioA", builtIn);
    expect(studio.map((p) => p.id)).toEqual(["s-1", "t-1"]);
    expect(drawerTemplates(presets, null, builtIn).studio).toEqual([]);
  });
});
