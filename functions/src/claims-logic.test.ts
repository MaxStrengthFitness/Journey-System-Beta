import { describe, expect, it } from "vitest";
import { authUidOf, claimsMatch, desiredClaims, roleOf } from "./claims-logic";

describe("desiredClaims", () => {
  it("mirrors a valid role and defaults a missing or unknown one", () => {
    expect(desiredClaims({ role: "StudioLeader" })).toEqual({ role: "StudioLeader" });
    expect(desiredClaims({ role: "Admin" })).toEqual({ role: "Admin" });
    expect(desiredClaims({})).toEqual({ role: "LifeTransformer" });
    expect(desiredClaims({ role: "Wizard" })).toEqual({ role: "LifeTransformer" });
    expect(desiredClaims({ role: null })).toEqual({ role: "LifeTransformer" });
  });

  it("clears the claims for a deleted document or a superseded placeholder", () => {
    expect(desiredClaims(null)).toEqual({});
    expect(desiredClaims(undefined)).toEqual({});
    expect(desiredClaims({ role: "Admin", supersededByUid: "uid-live" })).toEqual({});
    expect(desiredClaims({ role: "Admin", supersededByUid: "" })).toEqual({ role: "Admin" });
  });

  it("never invents a studioId claim", () => {
    expect(Object.keys(desiredClaims({ role: "StudioOwner" }))).toEqual(["role"]);
  });
});

describe("roleOf / authUidOf", () => {
  it("prefers an explicit authUid on older documents", () => {
    expect(authUidOf("random-doc-id", { authUid: "uid-1" })).toBe("uid-1");
    expect(authUidOf("uid-2", { authUid: "" })).toBe("uid-2");
    expect(authUidOf("uid-3", null)).toBe("uid-3");
    expect(roleOf({ role: "Trainer" })).toBe("Trainer");
  });
});

describe("claimsMatch", () => {
  it("is true only when the role is the same and nothing extra is set", () => {
    expect(claimsMatch({ role: "Admin" }, { role: "Admin" })).toBe(true);
    expect(claimsMatch(undefined, {})).toBe(true);
    expect(claimsMatch({}, {})).toBe(true);
    expect(claimsMatch({ role: "Admin" }, { role: "Trainer" })).toBe(false);
    expect(claimsMatch(undefined, { role: "Trainer" })).toBe(false);
    expect(claimsMatch({ role: "Trainer" }, {})).toBe(false);
    expect(claimsMatch({ role: "Admin", studioId: "westlake" }, { role: "Admin" })).toBe(false);
  });
});
