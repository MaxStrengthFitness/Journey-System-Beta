import { describe, it, expect } from "vitest";
import {
  decideMindbodyAccess,
  decodeRestFields,
  resolveRole,
  resolveStaffAccess,
  restDocId,
} from "./staff-access";

const SITES = {
  westlake: "29068",
  strongsville: "29068",
  solon: "5746957",
  offline: null,
};

describe("resolveRole", () => {
  it("prefers the sign-in token's role claim", () => {
    expect(resolveRole("Admin", { role: "LifeTransformer" })).toBe("Admin");
  });
  it("falls back to the document's role, then to LifeTransformer", () => {
    expect(resolveRole(undefined, { role: "HeadTrainer" })).toBe("HeadTrainer");
    expect(resolveRole(undefined, {})).toBe("LifeTransformer");
  });
  it("is 'none' without a trainer document", () => {
    expect(resolveRole(undefined, null)).toBe("none");
  });
});

describe("resolveStaffAccess", () => {
  it("is null for a sign-in with no trainer document", () => {
    expect(resolveStaffAccess({ uid: "u1", trainer: null, siteIdByStudio: SITES })).toBeNull();
  });

  it("collects the sites of every studio a trainer works at", () => {
    const access = resolveStaffAccess({
      uid: "u1",
      trainer: {
        role: "LifeTransformer",
        primaryHomeStudioId: "solon",
        accessibleStudioIds: ["solon"],
        activeGuestStudioIds: ["westlake"],
      },
      siteIdByStudio: SITES,
    })!;
    expect(access.allSites).toBe(false);
    expect(access.studioIds.sort()).toEqual(["solon", "westlake"]);
    expect(access.siteIds.sort()).toEqual(["29068", "5746957"]);
  });

  it("counts owned studios only for the studio-leader roles", () => {
    const trainer = { primaryHomeStudioId: "solon", ownedStudioIds: ["westlake"] };
    const leader = resolveStaffAccess({
      uid: "u1",
      trainer: { ...trainer, role: "StudioLeader" },
      siteIdByStudio: SITES,
    })!;
    const lt = resolveStaffAccess({
      uid: "u2",
      trainer: { ...trainer, role: "LifeTransformer" },
      siteIdByStudio: SITES,
    })!;
    expect(leader.siteIds.sort()).toEqual(["29068", "5746957"]);
    expect(lt.siteIds).toEqual(["5746957"]);
  });

  it("gives super and franchise roles every site", () => {
    for (const role of ["Admin", "Founder", "Overseer", "FranchiseOwner", "Owner"]) {
      const access = resolveStaffAccess({
        uid: "u",
        trainer: { role, primaryHomeStudioId: "system" },
        siteIdByStudio: SITES,
      })!;
      expect(access.allSites).toBe(true);
    }
  });

  it("ignores studios that have no Mindbody site", () => {
    const access = resolveStaffAccess({
      uid: "u1",
      trainer: { primaryHomeStudioId: "offline" },
      siteIdByStudio: SITES,
    })!;
    expect(access.siteIds).toEqual([]);
  });
});

describe("decideMindbodyAccess", () => {
  const solonTrainer = resolveStaffAccess({
    uid: "u1",
    trainer: { primaryHomeStudioId: "solon" },
    siteIdByStudio: SITES,
  });
  const admin = resolveStaffAccess({
    uid: "u2",
    trainer: { role: "Admin" },
    siteIdByStudio: SITES,
  });

  it("refuses a caller with no staff profile", () => {
    const d = decideMindbodyAccess(null, { siteId: "5746957" });
    expect(d.ok).toBe(false);
    expect(d.status).toBe(403);
  });

  it("lets staff reach their own site, as a string or a number", () => {
    expect(decideMindbodyAccess(solonTrainer, { siteId: "5746957" }).ok).toBe(true);
    expect(decideMindbodyAccess(solonTrainer, { siteId: 5746957 }).ok).toBe(true);
  });

  it("refuses another site, and says which", () => {
    const d = decideMindbodyAccess(solonTrainer, { siteId: "29068" });
    expect(d.ok).toBe(false);
    expect(d.error).toContain("29068");
  });

  it("lets an administrator reach any site", () => {
    expect(decideMindbodyAccess(admin, { siteId: "29068" }).ok).toBe(true);
  });

  it("keeps the administrator-only tools to administrators", () => {
    expect(decideMindbodyAccess(solonTrainer, { requireSuper: true }).ok).toBe(false);
    expect(decideMindbodyAccess(admin, { requireSuper: true }).ok).toBe(true);
  });

  it("allows a call that names no site (the route itself then refuses it)", () => {
    expect(decideMindbodyAccess(solonTrainer, {}).ok).toBe(true);
  });
});

describe("Firestore REST decoding", () => {
  it("decodes the value types a trainer document uses", () => {
    const fields = decodeRestFields({
      role: { stringValue: "HeadTrainer" },
      primaryHomeStudioId: { stringValue: "solon" },
      accessibleStudioIds: { arrayValue: { values: [{ stringValue: "solon" }, { stringValue: "westlake" }] } },
      activeGuestStudioIds: { arrayValue: {} },
      mindbodySiteId: { integerValue: "5746957" },
      isActive: { booleanValue: true },
      nothing: { nullValue: null },
      nested: { mapValue: { fields: { a: { doubleValue: 1.5 } } } },
    });
    expect(fields).toEqual({
      role: "HeadTrainer",
      primaryHomeStudioId: "solon",
      accessibleStudioIds: ["solon", "westlake"],
      activeGuestStudioIds: [],
      mindbodySiteId: 5746957,
      isActive: true,
      nothing: null,
      nested: { a: 1.5 },
    });
  });

  it("takes the document id from a REST name", () => {
    expect(restDocId("projects/p/databases/d/documents/studios/abc")).toBe("abc");
    expect(restDocId(undefined)).toBeNull();
  });
});
