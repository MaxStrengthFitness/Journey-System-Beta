import { describe, it, expect } from "vitest";
import { DEMO_STUDIO_ID } from "./constants";
import {
  canEnterDemo,
  hasRunOfDemo,
  studiosInRealm,
  splitOutDemo,
} from "./access";
import { canManageRenewals, worksAt, leadsStudio } from "../renewals/permissions";
import { operationsStudios } from "../admin/scope";
import type { Studio, Trainer } from "../../types";

const trainer = (over: Partial<Trainer> = {}): Trainer =>
  ({
    id: "t1",
    role: "LifeTransformer",
    fullName: "A Trainer",
    initials: "AT",
    primaryHomeStudioId: "solon",
    ...over,
  }) as Trainer;

const studio = (id: string, over: Partial<Studio> = {}): Studio =>
  ({ id, name: id, ...over }) as Studio;

describe("who may enter Demo Mode", () => {
  it("anybody signed in, and nobody who is not", () => {
    expect(canEnterDemo(trainer())).toBe(true);
    expect(canEnterDemo(null)).toBe(false);
    expect(canEnterDemo(undefined)).toBe(false);
  });

  it("gives a plain trainer the run of the demo studio and of no other", () => {
    const t = trainer({ role: "LifeTransformer" });
    expect(hasRunOfDemo(t, DEMO_STUDIO_ID)).toBe(true);
    expect(hasRunOfDemo(t, "solon")).toBe(false);
    expect(hasRunOfDemo(t, null)).toBe(false);
    expect(hasRunOfDemo(null, DEMO_STUDIO_ID)).toBe(false);
  });
});

describe("full access is authorisation, never membership", () => {
  /*
   * The distinction this whole design turns on. Operations → Renewals and the
   * Delight queue build their people lists by filtering EVERY trainer in the
   * company through worksAt(); if demo widened that, Demo Mode's team screens
   * would have shown the entire staff directory.
   */
  const outsider = trainer({ role: "LifeTransformer", primaryHomeStudioId: "solon" });
  const demoTrainer = trainer({ id: "hob", primaryHomeStudioId: DEMO_STUDIO_ID });

  it("a plain trainer may MANAGE the demo studio", () => {
    expect(canManageRenewals(outsider, DEMO_STUDIO_ID)).toBe(true);
    expect(canManageRenewals(outsider, "solon")).toBe(false);
  });

  it("but is NOT on the demo studio's team", () => {
    expect(worksAt(outsider, DEMO_STUDIO_ID)).toBe(false);
    expect(leadsStudio(outsider, DEMO_STUDIO_ID)).toBe(false);
  });

  it("while a demo trainer genuinely is, with no special case at all", () => {
    expect(worksAt(demoTrainer, DEMO_STUDIO_ID)).toBe(true);
  });
});

describe("one realm at a time", () => {
  const all = [studio("solon"), studio(DEMO_STUDIO_ID), studio("westlake")];

  it("from inside Demo Mode you see Demo Mode and nothing else", () => {
    expect(studiosInRealm(all, DEMO_STUDIO_ID).map((s) => s.id)).toEqual([
      DEMO_STUDIO_ID,
    ]);
  });

  it("from a real studio you do not see Demo Mode at all", () => {
    expect(studiosInRealm(all, "solon").map((s) => s.id)).toEqual([
      "solon",
      "westlake",
    ]);
  });

  it("nor from nowhere in particular", () => {
    expect(studiosInRealm(all, null).map((s) => s.id)).toEqual([
      "solon",
      "westlake",
    ]);
  });

  it("honours the isDemo flag as well as the id", () => {
    const flagged = [studio("solon"), studio("other", { isDemo: true } as Partial<Studio>)];
    expect(studiosInRealm(flagged, "solon").map((s) => s.id)).toEqual(["solon"]);
  });
});

describe("Operations cannot mix the two", () => {
  const all = [studio("solon"), studio(DEMO_STUDIO_ID), studio("westlake")];
  const admin = trainer({ role: "Admin" });

  it("an administrator's 'every studio' leaves Demo Mode out", () => {
    // The leak that matters: practice sessions folded into the company's
    // numbers, where nobody would ever notice they were there.
    const readable = operationsStudios(admin, all, [], true, "solon");
    expect(readable.map((s) => s.id)).toEqual(["solon", "westlake"]);
  });

  it("and inside Demo Mode is exactly one studio, so 'all my studios' cannot appear", () => {
    const readable = operationsStudios(admin, all, [], true, DEMO_STUDIO_ID);
    expect(readable.map((s) => s.id)).toEqual([DEMO_STUDIO_ID]);
    expect(readable.length > 1).toBe(false);
  });

  it("a plain trainer standing in Demo Mode gets Operations, on the demo studio", () => {
    // They lead nothing and own nothing, so without the demo clause this
    // would be empty -- Operations offered from the menu and then blank.
    const t = trainer({ role: "LifeTransformer" });
    expect(
      operationsStudios(t, all, [], false, DEMO_STUDIO_ID).map((s) => s.id),
    ).toEqual([DEMO_STUDIO_ID]);
  });

  it("and the same trainer back in their own studio gets nothing, as before", () => {
    const t = trainer({ role: "LifeTransformer" });
    expect(operationsStudios(t, all, [], false, "solon")).toEqual([]);
  });
});

describe("the selection screen pulls Demo Mode out of the list", () => {
  it("finds it and leaves the order of the rest alone", () => {
    const { demo, rest } = splitOutDemo([
      studio("solon"),
      studio(DEMO_STUDIO_ID),
      studio("westlake"),
    ]);
    expect(demo?.id).toBe(DEMO_STUDIO_ID);
    expect(rest.map((s) => s.id)).toEqual(["solon", "westlake"]);
  });

  it("returns null when it has not been seeded yet, and nothing else changes", () => {
    const { demo, rest } = splitOutDemo([studio("solon"), studio("westlake")]);
    expect(demo).toBeNull();
    expect(rest).toHaveLength(2);
  });
});
