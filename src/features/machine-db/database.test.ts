import { describe, expect, it } from "vitest";
import type { CatalogMachine } from "../catalog/types";
import {
  buildDatabase,
  databaseCounts,
  groupDatabase,
  lineageKeyOf,
  planAdoption,
  searchDatabase,
  sharedKeysFor,
  type SharedStudioMachine,
} from "./database";

const m = (id: string, name: string, over: Partial<CatalogMachine> = {}): CatalogMachine =>
  ({
    id,
    name,
    movementPattern: "Lower Body: Push",
    anatomicalRegion: "Lower Body",
    isStudioCustom: false,
    rosterStatus: "active",
    anatomy: { primary: [], secondary: [], preferredView: "front" },
    clinicalNote: "",
    kinematicClassification: "",
    executionPosture: "",
    setupGap: "",
    requiresHandoff: false,
    targetMuscles: ["Quadriceps"],
    synergists: [],
    clinicalWarnings: [],
    contraindicatedFor: [],
    setup: "",
    setupCues: [],
    execution: "",
    executionCues: [],
    studioNotes: "",
    ...over,
  }) as CatalogMachine;

const shared = (studioId: string, studioName: string, machineId: string, name: string, over: Partial<SharedStudioMachine> = {}): SharedStudioMachine => ({
  studioId,
  studioName,
  machineId,
  machine: m(machineId, name, { isStudioCustom: true }),
  definition: { name } as any,
  basedOn: null,
  adoptedFrom: null,
  ...over,
});

const MSF = [
  { machine: m("m-leg-press", "Leg Press"), retired: false },
  { machine: m("m-pulldown", "Pulldown", { movementPattern: "Vertical Pull", anatomicalRegion: "Upper Body" }), retired: false },
  { machine: m("m-old-row", "Old Row"), retired: true },
];

describe("buildDatabase", () => {
  it("lists every MSF machine and every shared studio machine, and knows what is on this floor", () => {
    const db = buildDatabase({
      msf: MSF,
      shared: [
        shared("solon", "Solon", "sm-solon-sled", "Sled Push", { basedOn: "m-leg-press" }),
        shared("westlake", "Westlake", "sm-westlake-belt-squat", "Belt Squat"),
      ],
      floor: [{ id: "m-leg-press" }, { id: "sm-westlake-sled-push", adoptedFrom: { studioId: "solon", machineId: "sm-solon-sled", studioName: "Solon" } }],
      studioId: "westlake",
    });
    expect(db.map((e) => [e.key, e.origin, e.floorMachineId])).toEqual([
      ["m-leg-press", "msf", "m-leg-press"],
      ["m-pulldown", "msf", null],
      ["m-old-row", "msf", null],
      ["westlake/sm-westlake-belt-squat", "studio", null],
      ["solon/sm-solon-sled", "studio", "sm-westlake-sled-push"],
    ]);
    // A shared machine is filed under its lineage; "added by this studio" is not said here.
    expect(db[4].lineageKey).toBe("m-leg-press");
    expect(db[4].machine.isStudioCustom).toBe(false);
    expect(db[4].sharedBy).toEqual({ studioId: "solon", studioName: "Solon" });
  });

  it("never lists a copy — its original is already there", () => {
    const db = buildDatabase({
      msf: [],
      shared: [shared("b", "B", "sm-b-x", "X", { adoptedFrom: { studioId: "a", machineId: "sm-a-x", studioName: "A" } })],
      floor: [],
      studioId: "c",
    });
    expect(db).toEqual([]);
  });

  it("counts what matters", () => {
    const db = buildDatabase({
      msf: MSF,
      shared: [shared("solon", "Solon", "sm-solon-sled", "Sled"), shared("solon", "Solon", "sm-solon-rope", "Rope")],
      floor: [{ id: "m-pulldown" }],
      studioId: "westlake",
    });
    expect(databaseCounts(db)).toEqual({ msf: 3, studio: 2, onFloor: 1, sharingStudios: 1 });
  });
});

describe("browsing", () => {
  const db = buildDatabase({
    msf: MSF,
    shared: [shared("solon", "Solon", "sm-solon-sled", "Sled Push", { basedOn: "m-leg-press" })],
    floor: [],
    studioId: "westlake",
  });

  it("puts a studio machine in its lineage's Academy category", () => {
    const groups = groupDatabase(db, "academy");
    const legs = groups.find((g) => g.entries.some((e) => e.key === "m-leg-press"));
    expect(legs?.entries.map((e) => e.key)).toContain("solon/sm-solon-sled");
  });

  it("finds a machine by its studio's name as well as its own", () => {
    expect(searchDatabase(db, "solon").map((e) => e.key)).toEqual(["solon/sm-solon-sled"]);
    expect(searchDatabase(db, "pull").map((e) => e.key)).toEqual(["m-pulldown"]);
    expect(searchDatabase(db, "  ")).toHaveLength(db.length);
  });
});

describe("planAdoption", () => {
  const ctx = { studioId: "westlake", studioName: "Westlake", floorSource: "roster" as const, takenIds: new Set<string>() };
  const db = buildDatabase({
    msf: MSF,
    shared: [shared("solon", "Solon", "sm-solon-sled", "Sled Push", { basedOn: "m-leg-press" })],
    floor: [{ id: "m-leg-press" }],
    studioId: "westlake",
  });
  const byKey = (k: string) => db.find((e) => e.key === k)!;

  it("adds an MSF machine the way the Equipment panel does", () => {
    expect(planAdoption(byKey("m-pulldown"), ctx)).toEqual({
      ok: true,
      machineId: "m-pulldown",
      entry: { machineId: "m-pulldown", studioId: "westlake", source: "catalog", basedOn: "m-pulldown", status: "active" },
    });
  });

  it("copies a studio's machine under this studio's own id, keeping its lineage and its origin", () => {
    const plan = planAdoption(byKey("solon/sm-solon-sled"), { ...ctx, takenIds: new Set(["sm-westlake-sled-push"]) });
    expect(plan.ok && plan.machineId).toBe("sm-westlake-sled-push-2");
    expect(plan.ok && plan.entry).toMatchObject({
      source: "custom",
      basedOn: "m-leg-press",
      adoptedFrom: { studioId: "solon", machineId: "sm-solon-sled", studioName: "Solon" },
      definition: { name: "Sled Push" },
    });
  });

  it("refuses what it cannot honestly do", () => {
    const why = (p: ReturnType<typeof planAdoption>) => (p.ok ? "" : p.reason);
    expect(why(planAdoption(byKey("m-leg-press"), ctx))).toMatch(/Already/);
    expect(why(planAdoption(byKey("m-old-row"), ctx))).toMatch(/Retired/);
    // No roster yet: adding one machine would hide the rest.
    expect(why(planAdoption(byKey("m-pulldown"), { ...ctx, floorSource: "global" }))).toMatch(/hasn't been set up/);
    expect(planAdoption(byKey("m-pulldown"), { ...ctx, studioId: null }).ok).toBe(false);
  });

  it("switches a machine the studio switched off back on, rather than adding it twice", () => {
    const off = (machineId: string, adoptedFrom?: { studioId: string; machineId: string }) => ({
      machineId,
      status: "inactive",
      adoptedFrom: adoptedFrom ?? null,
    });
    const back = { entry: { status: "active" }, reactivates: true };

    // An MSF machine the studio said it doesn't have.
    expect(planAdoption(byKey("m-pulldown"), { ...ctx, roster: [off("m-pulldown")] })).toMatchObject({
      ok: true,
      machineId: "m-pulldown",
      ...back,
    });

    // Its copy of Solon's sled: the same copy comes back, not a "-2".
    const copy = off("sm-westlake-sled-push", { studioId: "solon", machineId: "sm-solon-sled" });
    expect(
      planAdoption(byKey("solon/sm-solon-sled"), {
        ...ctx,
        takenIds: new Set([copy.machineId]),
        roster: [copy],
      }),
    ).toMatchObject({ ok: true, machineId: "sm-westlake-sled-push", ...back });

    // Its own shared machine: the original comes back; the studio never copies itself.
    const ownDb = buildDatabase({
      msf: MSF,
      shared: [shared("westlake", "Westlake", "sm-westlake-rope", "Rope Pull")],
      floor: [],
      studioId: "westlake",
    });
    const own = ownDb.find((e) => e.key === "westlake/sm-westlake-rope")!;
    expect(
      planAdoption(own, { ...ctx, takenIds: new Set(["sm-westlake-rope"]), roster: [off("sm-westlake-rope")] }),
    ).toMatchObject({ ok: true, machineId: "sm-westlake-rope", ...back });
  });
});

describe("sharing keys", () => {
  it("files a tip under each machine's lineage", () => {
    const floor = [{ id: "m-leg-press" }, { id: "sm-w-sled", comparisonKey: "m-leg-press" }, { id: "sm-w-rope", comparisonKey: "sm-w-rope" }];
    expect(sharedKeysFor(["sm-w-sled", "m-leg-press", "sm-w-rope", "unknown"], floor)).toEqual(["m-leg-press", "sm-w-rope", "unknown"]);
    expect(lineageKeyOf({ id: "x", comparisonKey: "" })).toBe("x");
  });
});
