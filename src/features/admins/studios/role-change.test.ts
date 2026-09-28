import { describe, expect, it } from "vitest";
import type { FranchiseNetwork, Studio } from "../../../types";
import { isAdministratorRole, roleChangeRecord, roleChoicesFor, roleConsequences, roleLabel, ROLE_CHOICES } from "./role-change";
import { detailsRecord, franchiseRecord } from "./studio-records";

describe("changing a role from the Admins dashboard", () => {
  it("offers what Operations offers an administrator, and keeps a role outside the list as it is", () => {
    expect(ROLE_CHOICES).toEqual(["LifeTransformer", "HeadTrainer", "StudioLeader", "StudioOwner", "Owner", "Admin"]);
    expect(roleChoicesFor("HeadTrainer")).toEqual([...ROLE_CHOICES]);
    expect(roleChoicesFor("Founder")[0]).toBe("Founder");
    expect(roleChoicesFor("Trainer")[0]).toBe("Trainer");
    expect(roleLabel("Owner")).toBe("Franchise Owner");
    expect(roleLabel(undefined)).toBe("No role yet");
  });

  it("knows which roles have the whole Admins dashboard", () => {
    expect(["Admin", "Founder", "Overseer"].every(isAdministratorRole)).toBe(true);
    expect(["StudioOwner", "Owner", "FranchiseOwner", "HeadTrainer"].some(isAdministratorRole)).toBe(false);
  });

  it("records making an administrator as an admin grant, for the company", () => {
    expect(roleChangeRecord({ personName: "Tuor", from: "HeadTrainer", to: "Admin", studioId: "gondolin", studioName: "Gondolin" })).toEqual({
      kind: "admin-grant",
      what: "Made Tuor a System Administrator (was Head Trainer).",
      studioId: null,
      before: { Role: "Head Trainer" },
      after: { Role: "System Administrator" },
    });
    const revoked = roleChangeRecord({ personName: "Tuor", from: "Admin", to: "StudioLeader", studioId: "gondolin" });
    expect(revoked.kind).toBe("admin-grant");
    expect(revoked.studioId).toBeNull();
    expect(revoked.what).toBe("Changed Tuor from System Administrator to Studio Leader: no longer an administrator.");
  });

  it("records any other role change at the studio it was made on", () => {
    expect(roleChangeRecord({ personName: "Beregond", from: "LifeTransformer", to: "HeadTrainer", studioId: "minas-tirith", studioName: "Minas Tirith" })).toEqual({
      kind: "assisted-change",
      what: "Changed Beregond's role at Minas Tirith from Life Transformer to Head Trainer.",
      studioId: "minas-tirith",
      before: { Role: "Life Transformer" },
      after: { Role: "Head Trainer" },
    });
  });

  it("says what will happen before it is saved", () => {
    const grant = roleConsequences({ personName: "Tuor", from: "HeadTrainer", to: "Admin" });
    expect(grant[0]).toContain("gets the whole Admins dashboard");
    expect(grant).toContain("It reaches their iPad the next time they sign in, or within the hour.");
    expect(grant[2]).toContain("admin grant");
    const revoke = roleConsequences({ personName: "Tuor", from: "Admin", to: "HeadTrainer" });
    expect(revoke[0]).toBe("Tuor loses the Admins dashboard.");
    const ordinary = roleConsequences({ personName: "Beregond", from: "LifeTransformer", to: "HeadTrainer" });
    expect(ordinary[2]).toBe("It's recorded in the studio's Activity, with your name.");
  });
});

describe("what a change at a studio says in the Activity record", () => {
  const studio = { id: "edoras", name: "Edoras", timezone: "America/New_York", phone: "", address: "Meduseld", networkId: "rohan" } as unknown as Studio;
  const networks = [
    { id: "rohan", name: "The Riddermark", studioIds: ["edoras"] },
    { id: "gondor", name: "Gondor", studioIds: [] },
  ] as unknown as FranchiseNetwork[];

  it("names the details that changed, with what they were", () => {
    expect(detailsRecord(studio, { phone: "440-555-0101", address: "The Golden Hall" })).toEqual({
      what: "Changed Edoras's phone and address.",
      before: { Phone: null, Address: "Meduseld" },
      after: { Phone: "440-555-0101", Address: "The Golden Hall" },
    });
    expect(detailsRecord(studio, {})).toBeNull();
  });

  it("says a franchise move in the words of both sides", () => {
    expect(franchiseRecord(studio, networks, "gondor")!.what).toBe("Moved Edoras from The Riddermark to Gondor.");
    expect(franchiseRecord(studio, networks, null)).toEqual({
      what: "Took Edoras out of The Riddermark: it is independent now.",
      before: { Franchise: "The Riddermark" },
      after: { Franchise: null },
    });
    expect(franchiseRecord({ ...studio, networkId: undefined }, networks, "rohan")!.what).toBe("Moved Edoras into The Riddermark (it was in no franchise).");
    expect(franchiseRecord(studio, networks, "rohan")).toBeNull();
  });
});
