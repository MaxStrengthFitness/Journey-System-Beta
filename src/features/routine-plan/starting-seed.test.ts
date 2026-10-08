/**
 * What scripts/seed-starting-routines.ts writes (starting-seed.ts): the
 * Academy's eleven as head office's routine presets, read back exactly as the
 * fallback builds them, named and described without a gender, and never over
 * a document that is already there.
 */
import { describe, expect, it } from "vitest";
import { academyStartingRoutines, startingRoutineFromPreset } from "./starting-routines";
import {
  SEED_CREATED_BY,
  SEED_CREATED_BY_NAME,
  SEED_RECORD,
  seededIdsFromRecord,
  startingSeedDescription,
  startingSeedDoc,
  startingSeedPlan,
  unknownSeedIds,
} from "./starting-seed";

const academy = academyStartingRoutines();

describe("the seed's documents", () => {
  it("are head office's routine presets, company tier and global, by the seed, nobody's default", () => {
    for (const r of academy) {
      const doc = startingSeedDoc(r);
      expect(doc).toMatchObject({
        name: r.name,
        tier: "company",
        scope: "global",
        createdBy: SEED_CREATED_BY,
        createdByName: SEED_CREATED_BY_NAME,
      });
      expect(doc.start.default).toBe(false);
      expect(doc.start.dayOne.length).toBeGreaterThan(0);
      expect(doc.start.source).toBe(r.source);
      expect(doc.start.kind).toBe(r.kind);
    }
  });

  it("read back as exactly the routines Start a plan uses before the seed has run", () => {
    for (const r of academy) {
      const back = startingRoutineFromPreset({ id: r.id, ...startingSeedDoc(r) });
      expect(back).toEqual(r);
    }
  });

  it("never name or describe a gender", () => {
    for (const r of academy) {
      const doc = startingSeedDoc(r);
      expect(`${doc.name} ${doc.description}`).not.toMatch(/\b(fe)?male\b|\bwom[ae]n\b|\bm[ae]n\b|\bher\b|\bhis\b/i);
    }
  });

  it("each say in one line who they are for, from the Academy", () => {
    const lines = academy.map((r) => startingSeedDescription(r));
    for (const line of lines) {
      expect(line).toMatch(/^For a client .+\. From the Academy's Exercise Selection Template, a first draft to change\.$/);
      expect(line).not.toMatch(/\n/);
    }
    expect(startingSeedDescription({ id: "academy-knee", kind: "condition" })).toBe(
      "For a client with a knee problem. From the Academy's Exercise Selection Template, a first draft to change.",
    );
    // A row the table doesn't know yet still says something true, from its kind.
    expect(startingSeedDescription({ id: "academy-new-row", kind: "goal" })).toMatch(/^For a client with a goal\./);
  });

  it("send nothing Firestore would refuse", () => {
    const hasUndefined = (v: unknown): boolean =>
      v === undefined || (typeof v === "object" && v !== null && Object.values(v).some(hasUndefined));
    for (const r of academy) expect(hasUndefined(startingSeedDoc(r))).toBe(false);
  });
});

describe("a run's plan", () => {
  it("writes all eleven on a first run, as academy-<template>, never an id that names a gender", () => {
    const plan = startingSeedPlan(new Set());
    expect(plan.write).toHaveLength(11);
    expect(plan.skip).toEqual([]);
    expect(plan.retired).toEqual([]);
    expect(plan.write.every((w) => w.id.startsWith("academy-"))).toBe(true);
    // The ids are stored for good (every plan's templateId, every studio's
    // choice), so the Academy's sex split is left out of them as of the names.
    for (const w of plan.write) expect(w.id).not.toMatch(/(fe)?male/i);
    expect(plan.write.map((w) => w.id)).toEqual(
      expect.arrayContaining(["academy-clear-dip-adduction", "academy-clear-chest-pulldown"]),
    );
  });

  it("skips every id that is already there, so an administrator's edit survives a second run", () => {
    const plan = startingSeedPlan(new Set(["academy-knee", "academy-low-back", "someone-elses"]));
    expect(plan.skip.sort()).toEqual(["academy-knee", "academy-low-back"]);
    expect(plan.write.map((w) => w.id)).not.toContain("academy-knee");
    expect(plan.write).toHaveLength(9);
    expect(startingSeedPlan(new Set(academy.map((r) => r.id))).write).toEqual([]);
  });

  it("never brings back a routine an earlier run wrote and an administrator has since removed", () => {
    const everyId = new Set(academy.map((r) => r.id));
    const stillThere = new Set([...everyId].filter((id) => id !== "academy-arms" && id !== "academy-posture"));
    const plan = startingSeedPlan(stillThere, { seededBefore: everyId });
    expect(plan.write).toEqual([]);
    expect(plan.retired.sort()).toEqual(["academy-arms", "academy-posture"]);
    expect(plan.skip).toHaveLength(9);
  });

  it("brings one back only when it is asked for again", () => {
    const everyId = new Set(academy.map((r) => r.id));
    const stillThere = new Set([...everyId].filter((id) => id !== "academy-arms" && id !== "academy-posture"));
    const plan = startingSeedPlan(stillThere, { seededBefore: everyId, again: new Set(["academy-arms"]) });
    expect(plan.write.map((w) => w.id)).toEqual(["academy-arms"]);
    expect(plan.retired).toEqual(["academy-posture"]);
  });

  it("finishes the rest after an interrupted run, whose batch wrote nothing and recorded nothing", () => {
    const plan = startingSeedPlan(new Set(["academy-knee"]), { seededBefore: new Set(["academy-knee"]) });
    expect(plan.write).toHaveLength(10);
    expect(plan.retired).toEqual([]);
  });
});

describe("the seed's record", () => {
  it("is the ids it lists, and a missing or broken record is a seed that has never run", () => {
    expect([...seededIdsFromRecord({ ids: ["academy-knee", " academy-arms ", "", 7] })]).toEqual([
      "academy-knee",
      "academy-arms",
    ]);
    expect(seededIdsFromRecord(undefined).size).toBe(0);
    expect(seededIdsFromRecord({ ids: "academy-knee" }).size).toBe(0);
    expect(SEED_RECORD).toEqual({ collection: "system", id: "startingRoutinesSeed" });
  });

  it("says which ids asked for again aren't one of the Academy's", () => {
    expect(unknownSeedIds(["academy-knee", "academy-kneee", "academy-clear-female"])).toEqual([
      "academy-kneee",
      "academy-clear-female",
    ]);
  });
});
