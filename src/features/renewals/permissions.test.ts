import { describe, it, expect } from "vitest";
import { canManageRenewals, canTakePartInRenewals, leadsStudio, worksAt } from "./permissions";

const base = { accessibleStudioIds: [] as string[], activeGuestStudioIds: [] as string[], ownedStudioIds: [] as string[] };

describe("renewal permissions", () => {
  const trainer = { ...base, role: "LifeTransformer" as const, primaryHomeStudioId: "solon" };
  const leader = { ...base, role: "StudioLeader" as const, primaryHomeStudioId: "solon" };
  const owner = { ...base, role: "StudioOwner" as const, primaryHomeStudioId: "solon", ownedStudioIds: ["westlake"] };
  const admin = { ...base, role: "Admin" as const, primaryHomeStudioId: "system" };

  it("lets a trainer take part at their own studio, but not manage it", () => {
    expect(canTakePartInRenewals(trainer, "solon")).toBe(true);
    expect(canManageRenewals(trainer, "solon")).toBe(false);
    expect(canTakePartInRenewals(trainer, "westlake")).toBe(false);
  });

  it("lets a leader manage their own studio only", () => {
    expect(canManageRenewals(leader, "solon")).toBe(true);
    expect(canManageRenewals(leader, "westlake")).toBe(false);
  });

  it("counts an owned studio for the studio-owner role", () => {
    expect(leadsStudio(owner, "westlake")).toBe(true);
    expect(worksAt(owner, "westlake")).toBe(false);
  });

  it("lets administrators manage every studio", () => {
    expect(canManageRenewals(admin, "anything")).toBe(true);
  });

  it("counts the grant: a trainer given managedStudioIds leads that studio and no other (My Studio, Sep 2026)", () => {
    const granted = { ...trainer, managedStudioIds: ["solon"] };
    expect(leadsStudio(granted, "solon")).toBe(true);
    expect(canManageRenewals(granted, "solon")).toBe(true);
    expect(leadsStudio(granted, "westlake")).toBe(false);
    // The grant is per studio, never a role: nothing about the other studios changes.
    expect(canTakePartInRenewals(granted, "westlake")).toBe(false);
  });

  it("says no to nobody", () => {
    expect(canTakePartInRenewals(null, "solon")).toBe(false);
    expect(canManageRenewals(leader, null)).toBe(false);
  });
});
