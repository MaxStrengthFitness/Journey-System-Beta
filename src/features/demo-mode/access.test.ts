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
import { queryStudioIds, realmStudioIds } from "../../lib/tenancy";
import { announcementReach } from "../admin/announcements/reach";
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

/*
 * THE REALM RULE AT EVERY DOOR THAT LISTS STUDIOS (Oct 1 2026). Seen on the
 * live app inside Demo Mode: Search clients listed real clients, Add Client
 * offered the real studios, and Operations → Setup offered every studio to
 * an announcement and showed every studio's Mindbody row. Each door now asks
 * the realm; these pin the shared answers (the screens' own tests mount them).
 */
describe("the realm rule at the doors that list studios", () => {
  const leader = trainer({ role: "StudioLeader", accessibleStudioIds: ["solon", "westlake"] });
  const realStudios = [studio("solon"), studio("westlake")];
  const withDemo = [...realStudios, studio(DEMO_STUDIO_ID)];

  it("client search inside Demo Mode asks about Demo Mode alone", () => {
    expect(queryStudioIds(leader, DEMO_STUDIO_ID)).toEqual([DEMO_STUDIO_ID]);
    expect(queryStudioIds(leader, DEMO_STUDIO_ID, { includeAll: true })).toEqual([DEMO_STUDIO_ID]);
    expect(realmStudioIds(leader, DEMO_STUDIO_ID)).toEqual([DEMO_STUDIO_ID]);
  });

  it("client search outside never reaches into Demo Mode", () => {
    expect(queryStudioIds(leader, "solon", { includeAll: true })).not.toContain(DEMO_STUDIO_ID);
  });

  it("Add Client's home studio inside Demo Mode is Demo Mode alone", () => {
    expect(studiosInRealm(withDemo, DEMO_STUDIO_ID).map((s) => s.id)).toEqual([DEMO_STUDIO_ID]);
    expect(studiosInRealm(withDemo, "solon").map((s) => s.id)).toEqual(["solon", "westlake"]);
  });

  it("an announcement from inside Demo Mode reaches Demo Mode alone", () => {
    const r = announcementReach({ isAdmin: true, isOwnerTier: true, allStudios: withDemo, readable: [studio(DEMO_STUDIO_ID)], activeStudioId: DEMO_STUDIO_ID });
    expect(r.scopes).toEqual(["studio"]);
    expect(r.fixedStudioId).toBe(DEMO_STUDIO_ID);
    expect(r.studios.map((s) => s.id)).toEqual([DEMO_STUDIO_ID]);
  });
});
