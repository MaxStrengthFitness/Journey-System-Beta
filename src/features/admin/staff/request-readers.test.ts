import { describe, expect, it } from "vitest";
import { mayReadAccessRequests } from "./request-readers";

describe("mayReadAccessRequests (the access_requests read rule's mirror)", () => {
  it("lets the people who let people in read: leaders, owners, administrators", () => {
    for (const role of ["StudioOwner", "HeadTrainer", "StudioLeader", "Owner", "FranchiseOwner", "Admin", "Founder", "Overseer"]) {
      expect(mayReadAccessRequests({ role }), role).toBe(true);
    }
  });

  it("lets a trainer the studio granted read (the grant anywhere is the rules' leadsAnyStudio)", () => {
    expect(mayReadAccessRequests({ role: "LifeTransformer", managedStudioIds: ["s1"] })).toBe(true);
  });

  it("keeps everyone else out: a trainer, the front desk, a document with no role, nobody", () => {
    expect(mayReadAccessRequests({ role: "LifeTransformer" })).toBe(false);
    expect(mayReadAccessRequests({ role: "Trainer", managedStudioIds: [] })).toBe(false);
    expect(mayReadAccessRequests({ role: "Administrative" })).toBe(false);
    expect(mayReadAccessRequests({})).toBe(false);
    expect(mayReadAccessRequests(null)).toBe(false);
  });
});
