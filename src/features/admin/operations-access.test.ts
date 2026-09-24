import { describe, expect, it } from "vitest";
import type { Trainer } from "../../types";
import { DEMO_STUDIO_ID } from "../demo-mode/constants";
import { HUB_PLACE, guardPlace, mayOpenOperations, type AppPlace } from "./operations-access";

const person = (role: string, extra: Partial<Trainer> = {}) =>
  ({ id: `t-${role}`, fullName: role, initials: "XX", role, primaryHomeStudioId: "westlake", ...extra }) as unknown as Trainer;

describe("mayOpenOperations — the one test the menu, the route and the shell share", () => {
  it("studio leaders and above, at any real studio", () => {
    for (const role of ["StudioLeader", "HeadTrainer", "StudioOwner", "Owner", "FranchiseOwner", "Founder", "Overseer", "Admin"]) {
      expect(mayOpenOperations(person(role), "westlake"), role).toBe(true);
    }
  });

  it("never a Life Transformer at a real studio", () => {
    expect(mayOpenOperations(person("LifeTransformer"), "westlake")).toBe(false);
    expect(mayOpenOperations(person("Trainer"), "westlake")).toBe(false);
  });

  it("not the grant either: it opens My Studio's leader sections, not Operations", () => {
    const granted = person("LifeTransformer", { managedStudioIds: ["westlake"] } as Partial<Trainer>);
    expect(mayOpenOperations(granted, "westlake")).toBe(false);
  });

  it("everyone inside Demo Mode, and only while they are in it", () => {
    const lt = person("LifeTransformer");
    expect(mayOpenOperations(lt, DEMO_STUDIO_ID)).toBe(true);
    expect(mayOpenOperations(lt, "westlake")).toBe(false);
    expect(mayOpenOperations(lt, null)).toBe(false);
  });

  it("nobody signed in", () => {
    expect(mayOpenOperations(null, DEMO_STUDIO_ID)).toBe(false);
    expect(mayOpenOperations(undefined, "westlake")).toBe(false);
  });
});

describe("guardPlace — where someone who may not open a screen is sent", () => {
  const operations: AppPlace = { view: "admin-dashboard", appMode: "admin" };
  const admins: AppPlace = { view: "admins-dashboard", appMode: "admin" };
  const trainerOnly = { operations: false, admins: false };
  const leader = { operations: true, admins: false };
  const administrator = { operations: true, admins: true };

  it("a Life Transformer on Operations goes to the Hub, in trainer mode", () => {
    expect(guardPlace(operations, trainerOnly)).toEqual(HUB_PLACE);
    // Reached with the trainer bar under it (the settings screen's door): same answer.
    expect(guardPlace({ view: "admin-dashboard", appMode: "trainer" }, trainerOnly)).toEqual(HUB_PLACE);
  });

  it("the Operations bar goes, the screen stays, on any other screen", () => {
    expect(guardPlace({ view: "trainer-hub", appMode: "admin" }, trainerOnly)).toEqual({ view: "trainer-hub", appMode: "trainer" });
    expect(guardPlace({ view: "profile", appMode: "admin" }, trainerOnly)).toEqual({ view: "profile", appMode: "trainer" });
  });

  it("a leader who is not an administrator is sent from the Admins dashboard", () => {
    expect(guardPlace(admins, leader)).toEqual(HUB_PLACE);
  });

  it("leaves the people who may be there where they are, as the same object", () => {
    expect(guardPlace(operations, leader)).toBe(operations);
    expect(guardPlace(admins, administrator)).toBe(admins);
    const hub = { view: "clients", appMode: "trainer" } as AppPlace;
    expect(guardPlace(hub, trainerOnly)).toBe(hub);
  });

  it("the Demo Mode door: allowed at the demo studio, shut the moment a real studio is chosen", () => {
    const lt = person("LifeTransformer");
    const access = (studioId: string) => ({ operations: mayOpenOperations(lt, studioId), admins: false });
    expect(guardPlace(operations, access(DEMO_STUDIO_ID))).toBe(operations);
    expect(guardPlace(operations, access("westlake"))).toEqual(HUB_PLACE);
  });
});
