import { describe, expect, it } from "vitest";
import { canWriteStudioPages, isSuperRole, leadsStudioPerRules } from "./permissions";

const t = (role: string, home = "solon", owned: string[] = []) =>
  ({ role, primaryHomeStudioId: home, ownedStudioIds: owned }) as any;

describe("canWriteStudioPages — mirrors the studios/{s}/wiki page rule", () => {
  it("lets super admins write anywhere", () => {
    for (const role of ["Admin", "Founder", "Overseer"]) {
      expect(canWriteStudioPages(t(role, "elsewhere"), "solon")).toBe(true);
    }
  });

  it("lets a studio's own leaders write, at their studio only", () => {
    for (const role of ["StudioOwner", "HeadTrainer", "StudioLeader"]) {
      expect(canWriteStudioPages(t(role), "solon")).toBe(true);
      expect(canWriteStudioPages(t(role), "westlake")).toBe(false);
    }
    expect(canWriteStudioPages(t("StudioOwner", "solon", ["westlake"]), "westlake")).toBe(true);
  });

  it("refuses franchise owners, whom the rule leaves out (the old button did not)", () => {
    expect(canWriteStudioPages(t("FranchiseOwner"), "solon")).toBe(false);
    expect(canWriteStudioPages(t("Owner"), "solon")).toBe(false);
  });

  it("refuses trainers, a missing trainer and a missing studio", () => {
    expect(canWriteStudioPages(t("LifeTransformer"), "solon")).toBe(false);
    expect(canWriteStudioPages(null, "solon")).toBe(false);
    expect(canWriteStudioPages(t("Admin"), null)).toBe(false);
  });

  it("exposes the two halves of the rule", () => {
    expect(isSuperRole(t("Founder"))).toBe(true);
    expect(isSuperRole(t("StudioLeader"))).toBe(false);
    expect(leadsStudioPerRules(t("HeadTrainer"), "solon")).toBe(true);
    expect(leadsStudioPerRules(t("HeadTrainer"), undefined)).toBe(false);
  });
});
