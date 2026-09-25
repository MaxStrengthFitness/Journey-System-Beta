import { describe, expect, it } from "vitest";
import type { Trainer } from "../../types";
import { codexAccess, readOnlyLine, recordStudioIdOf } from "./access";
import { canEditPriorHistory } from "../client-profile/prior-history-door";

/**
 * codexAccess mirrors two rules, and a trainer is offered exactly what they
 * allow: the clients/{id} update rule (canEdit — administrators, and anyone
 * who trains at or leads the client's HOME studio, the grant and Demo Mode
 * included) and the FORD read rule (fordReadable — the same, plus franchise
 * owners). A cross-train visitor reads the record and gets neither. The FORD
 * create rule (fordWritable) is the studio's own people only: an
 * administrator or franchise owner who works elsewhere is refused a detail.
 */

const trainer = (over: Partial<Trainer>): Trainer =>
  ({
    id: "t1",
    fullName: "Jane Coach",
    initials: "JC",
    role: "LifeTransformer",
    primaryHomeStudioId: "s-other",
    ...over,
  }) as Trainer;

const client = { homeStudioId: "s-home", approvedCrossTrainStudioIds: ["s-cross"] };
const studios = [
  { id: "s-home", name: "Westlake" },
  { id: "s-cross", name: "Solon" },
];

describe("codexAccess", () => {
  it("lets a trainer at the home studio edit and read FORD", () => {
    const a = codexAccess(trainer({ primaryHomeStudioId: "s-home" }), client, studios);
    expect(a).toEqual({
      canEdit: true,
      fordReadable: true,
      fordWritable: true,
      homeStudioId: "s-home",
      homeStudioName: "Westlake",
    });
  });

  it("counts a guest and an accessible studio as working there", () => {
    expect(codexAccess(trainer({ activeGuestStudioIds: ["s-home"] }), client, studios).canEdit).toBe(true);
    expect(codexAccess(trainer({ accessibleStudioIds: ["s-home"] }), client, studios).canEdit).toBe(true);
    expect(codexAccess(trainer({ activeGuestStudioIds: ["s-home"] }), client, studios).fordWritable).toBe(true);
    expect(codexAccess(trainer({ accessibleStudioIds: ["s-home"] }), client, studios).fordWritable).toBe(true);
  });

  it("lets a leader who owns the home studio, and a granted trainer, edit", () => {
    expect(
      codexAccess(trainer({ role: "StudioOwner", ownedStudioIds: ["s-home"] }), client, studios).canEdit,
    ).toBe(true);
    expect(codexAccess(trainer({ managedStudioIds: ["s-home"] }), client, studios).canEdit).toBe(true);
    expect(
      codexAccess(trainer({ role: "StudioOwner", ownedStudioIds: ["s-home"] }), client, studios).fordWritable,
    ).toBe(true);
    expect(codexAccess(trainer({ managedStudioIds: ["s-home"] }), client, studios).fordWritable).toBe(true);
  });

  it("lets administrators edit any record, but add FORD only where they work (the create rule)", () => {
    for (const role of ["Admin", "Founder", "Overseer"] as const) {
      const a = codexAccess(trainer({ role }), client, studios);
      expect(a.canEdit, role).toBe(true);
      expect(a.fordReadable, role).toBe(true);
      expect(a.fordWritable, role).toBe(false);
      expect(codexAccess(trainer({ role, primaryHomeStudioId: "s-home" }), client, studios).fordWritable, role).toBe(true);
    }
  });

  it("gives everyone the run of a Demo Mode client", () => {
    const demo = { homeStudioId: "demo-studio" };
    const a = codexAccess(trainer({}), demo, studios);
    expect(a.canEdit).toBe(true);
    expect(a.fordReadable).toBe(true);
    expect(a.fordWritable).toBe(true);
  });

  it("keeps a cross-train visitor read only, and out of FORD", () => {
    const a = codexAccess(trainer({ primaryHomeStudioId: "s-cross" }), client, studios);
    expect(a.canEdit).toBe(false);
    expect(a.fordReadable).toBe(false);
    expect(a.fordWritable).toBe(false);
    expect(a.homeStudioName).toBe("Westlake");
  });

  it("lets a franchise owner read FORD but not edit a studio they do not work at", () => {
    for (const role of ["FranchiseOwner", "Owner"] as const) {
      const a = codexAccess(trainer({ role }), client, studios);
      expect(a.canEdit, role).toBe(false);
      expect(a.fordReadable, role).toBe(true);
      expect(a.fordWritable, role).toBe(false);
    }
  });

  it("reads the home from the older studioId when homeStudioId is missing", () => {
    expect(recordStudioIdOf({ studioId: "s-home" })).toBe("s-home");
    expect(codexAccess(trainer({ primaryHomeStudioId: "s-home" }), { studioId: "s-home" }, studios).canEdit).toBe(true);
  });

  it("reads the home as the update rule does: a null or empty home does not fall back to studioId", () => {
    // firestore.rules getStudioIdFromData: data.get('homeStudioId',
    // data.get('studioId', null)) - the older field only when the home is
    // ABSENT. Offering Edit here would be refused at save, while the
    // prior-history door on the same Account card opens read only.
    const here = trainer({ primaryHomeStudioId: "s-home" });
    for (const home of [null, ""]) {
      const legacy = { homeStudioId: home, studioId: "s-home" };
      const a = codexAccess(here, legacy, studios);
      expect(a.canEdit, String(home)).toBe(false);
      expect(canEditPriorHistory(here, legacy), String(home)).toBe(false);
      // Still named, and still her studio for FORD (a detail carries its own studio).
      expect(a.homeStudioId).toBe("s-home");
      expect(a.fordReadable).toBe(true);
      expect(codexAccess(trainer({ role: "Admin" }), legacy, studios).canEdit).toBe(true);
    }
  });

  it("lets only administrators edit a client with no studio at all", () => {
    expect(recordStudioIdOf({})).toBeNull();
    expect(codexAccess(trainer({ primaryHomeStudioId: "s-home" }), {}, studios).canEdit).toBe(false);
    expect(codexAccess(trainer({ role: "Admin" }), {}, studios).canEdit).toBe(true);
    // Nobody can add FORD for a client with no studio: the detail would carry none.
    expect(codexAccess(trainer({ role: "Admin" }), {}, studios).fordWritable).toBe(false);
  });

  it("says nothing for a reader not yet known", () => {
    const a = codexAccess(null, client, studios);
    expect(a.canEdit).toBe(false);
    expect(a.fordReadable).toBe(false);
    expect(a.fordWritable).toBe(false);
  });

  it("does not guess a studio name before the studios load", () => {
    expect(codexAccess(trainer({}), client, []).homeStudioName).toBeNull();
    expect(codexAccess(trainer({}), client, null).homeStudioName).toBeNull();
  });
});

describe("readOnlyLine", () => {
  it("says whose record it is, and that notes still save", () => {
    expect(readOnlyLine({ canEdit: false, homeStudioName: "Westlake" })).toBe(
      "Read only here · Westlake keeps this record. Notes you write still save.",
    );
    expect(readOnlyLine({ canEdit: false, homeStudioName: null })).toContain("The home studio keeps this record.");
  });

  it("is null for a reader who may edit", () => {
    expect(readOnlyLine({ canEdit: true, homeStudioName: "Westlake" })).toBeNull();
  });
});
