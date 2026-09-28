import { describe, expect, it } from "vitest";
import { MACHINE_ANATOMY } from "../../data/machine-anatomy-map";
import { ALL_MUSCLE_IDS, toBodySlug } from "../../types/machines";
import {
  BODY_REGIONS,
  mainCounts,
  regionById,
  regionForSlug,
  regionNames,
  regionOnFloor,
} from "./body-lens";
import { resolveMachineAnatomy } from "./anatomy";
import { MOVEMENT_IDS } from "./names";
import type { CatalogMachine } from "./types";

const floorMachine = (id: string, name: string): CatalogMachine =>
  ({ id, name, anatomy: resolveMachineAnatomy(id) }) as CatalogMachine;

describe("the body's regions are the model's", () => {
  it("names each part the model lights once, with the muscles it draws there", () => {
    const ids = BODY_REGIONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of BODY_REGIONS) {
      expect(r.muscles.length, r.id).toBeGreaterThan(0);
      for (const m of r.muscles) expect(toBodySlug(m), `${r.id} ${m}`).toBe(r.id);
    }
  });

  it("puts every muscle the diagram knows in a region, so no machine is out of reach", () => {
    const covered = new Set(BODY_REGIONS.flatMap((r) => r.muscles));
    for (const m of ALL_MUSCLE_IDS) expect(covered.has(m), m).toBe(true);
    for (const id of MOVEMENT_IDS) {
      for (const m of MACHINE_ANATOMY[id].primary) expect(covered.has(m), `${id} ${m}`).toBe(true);
    }
  });

  it("says both muscles where the model draws one patch for two", () => {
    expect(regionById("upper-back")?.label).toBe("Upper back and lats");
    expect(regionById("upper-back")?.muscles.sort()).toEqual(["lats", "rhomboids"]);
    expect(regionById("gluteal")?.label).toBe("Glutes and outer hip");
    expect(regionById("gluteal")?.muscles.sort()).toEqual(["abductors", "glutes"]);
  });

  it("answers a tap on the figure, and ignores a part no machine trains", () => {
    expect(regionForSlug("quadriceps")?.label).toBe("Quads");
    expect(regionForSlug("hands")).toBeNull();
    expect(regionForSlug("head")).toBeNull();
  });

  it("knows each part by the words a trainer uses, for Find", () => {
    expect(regionNames(regionById("upper-back")!)).toEqual(expect.arrayContaining(["lats", "latissimus", "rhomboids"]));
    expect(regionNames(regionById("quadriceps")!)).toEqual(expect.arrayContaining(["quads", "quadriceps"]));
    expect(regionNames(regionById("lower-back")!)).toEqual(expect.arrayContaining(["lower back", "low back", "erectors"]));
  });
});

describe("what trains a part, on this floor", () => {
  const floor = [
    floorMachine("m-leg-press", "LEG PRESS"),
    floorMachine("m-ext", "LEG EXTENSION"),
    floorMachine("m-leg-curl", "LEG CURL"),
    floorMachine("m-hip-abd", "HIP ABDUCTION"),
  ];

  it("lists main movers first, in walking order, then the machines that help", () => {
    const quads = regionOnFloor(regionById("quadriceps")!, floor);
    expect(quads.main.map((m) => m.name)).toEqual(["LEG PRESS", "LEG EXTENSION"]);
    const glutes = regionOnFloor(regionById("gluteal")!, floor);
    // The leg press's glutes are primary; the abduction's abductors paint the same patch.
    expect(glutes.main.map((m) => m.name)).toEqual(["LEG PRESS", "HIP ABDUCTION"]);
    expect(glutes.helps.map((m) => m.name)).toEqual(["LEG CURL"]);
  });

  it("names the MSF movements that would train it, which this floor lacks", () => {
    const lowBack = regionOnFloor(regionById("lower-back")!, floor);
    expect(lowBack.main).toEqual([]);
    expect(lowBack.notHere.map((m) => m.name)).toEqual(["Lumbar Extension"]);
    const quads = regionOnFloor(regionById("quadriceps")!, floor);
    expect(quads.notHere).toEqual([]);
  });

  it("counts, per part, the units that train it most", () => {
    const counts = mainCounts(floor);
    expect(counts.quadriceps).toBe(2);
    expect(counts.hamstring).toBe(1);
    expect(counts.chest).toBe(0);
  });
});
