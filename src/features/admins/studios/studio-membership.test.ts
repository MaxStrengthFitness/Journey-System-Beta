import { describe, expect, it } from "vitest";
import { worksHere } from "../../../lib/who-works-here";
import {
  addableStudios,
  homeStudioLine,
  membershipConsequences,
  membershipPlan,
  membershipRecords,
  memberships,
  takeOffPlan,
  whyNotRemovable,
} from "./studio-membership";

const studios = [
  { id: "westlake", name: "Westlake" },
  { id: "solon", name: "Solon" },
  { id: "strongsville", name: "Strongsville" },
  { id: "willoughby", name: "Willoughby" },
  { id: "demo-studio", name: "Demo Studio", isDemo: true },
];

const beregond = {
  id: "ber",
  fullName: "Beregond",
  primaryHomeStudioId: "solon",
  accessibleStudioIds: ["solon", "westlake"],
  activeGuestStudioIds: ["strongsville"],
  managedStudioIds: ["westlake"],
};

describe("the studios a person works at besides home", () => {
  it("lists also-works-at before guest, never the home studio, never twice", () => {
    expect(memberships(beregond)).toEqual([
      { studioId: "westlake", kind: "also" },
      { studioId: "strongsville", kind: "guest" },
    ]);
    expect(memberships({ primaryHomeStudioId: "solon", accessibleStudioIds: ["westlake", "westlake", ""], activeGuestStudioIds: ["westlake"] })).toEqual([
      { studioId: "westlake", kind: "also" },
    ]);
    expect(memberships({ primaryHomeStudioId: "solon" })).toEqual([]);
  });

  it("offers every real studio not already theirs, by name, and never Demo Mode", () => {
    expect(addableStudios(beregond, studios, ["westlake", "strongsville"]).map((s) => s.id)).toEqual(["willoughby"]);
    expect(addableStudios({ primaryHomeStudioId: "solon" }, studios, []).map((s) => s.id)).toEqual(["strongsville", "westlake", "willoughby"]);
  });
});

describe("what a save writes", () => {
  it("adds a second studio to also-works-at only, and nothing else", () => {
    const plan = membershipPlan({ primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"], activeGuestStudioIds: [] }, ["westlake"]);
    expect(plan.added).toEqual(["westlake"]);
    expect(plan.removed).toEqual([]);
    expect(plan.changes).toEqual([{ field: "accessibleStudioIds", add: ["westlake"], remove: [], next: ["solon", "westlake"] }]);
  });

  it("takes a studio out of all three lists, the grant included, and keeps home where it was", () => {
    const plan = takeOffPlan(beregond, "westlake")!;
    expect(plan.removed).toEqual(["westlake"]);
    expect(plan.changes).toEqual([
      { field: "accessibleStudioIds", add: [], remove: ["westlake"], next: ["solon"] },
      { field: "managedStudioIds", add: [], remove: ["westlake"], next: [] },
    ]);
    // After it, they no longer work there by the one rule.
    const after = { ...beregond, accessibleStudioIds: ["solon"], managedStudioIds: [] };
    expect(worksHere(after, "westlake")).toBe(false);
    expect(worksHere(after, "solon")).toBe(true);
  });

  it("takes a guest off the guest list", () => {
    const plan = takeOffPlan(beregond, "strongsville")!;
    expect(plan.changes).toEqual([{ field: "activeGuestStudioIds", add: [], remove: ["strongsville"], next: [] }]);
  });

  it("never takes the home studio away, and has nothing to do for a studio they don't work at", () => {
    expect(whyNotRemovable(beregond, "solon")).toBe("home");
    expect(takeOffPlan(beregond, "solon")).toBeNull();
    expect(takeOffPlan(beregond, "willoughby")).toBeNull();
    // Passing home in the wanted list changes nothing either.
    expect(membershipPlan(beregond, ["solon", "westlake", "strongsville"]).changes).toEqual([]);
    expect(homeStudioLine(beregond, studios)).toContain("Solon is Beregond's home studio");
    expect(homeStudioLine(beregond, studios)).toContain("Operations → Setup → People & access");
  });

  it("swaps one studio for another in one list write", () => {
    const plan = membershipPlan(beregond, ["willoughby", "strongsville"]);
    expect(plan.added).toEqual(["willoughby"]);
    expect(plan.removed).toEqual(["westlake"]);
    expect(plan.changes[0]).toEqual({ field: "accessibleStudioIds", add: ["willoughby"], remove: ["westlake"], next: ["solon", "willoughby"] });
  });
});

describe("the record and the sentences", () => {
  it("writes one entry per studio, at that studio, with the list before and after", () => {
    const plan = membershipPlan(beregond, ["willoughby", "strongsville"]);
    const records = membershipRecords({ person: beregond, plan, studios, byName: "Ada Admin" });
    expect(records).toEqual([
      {
        kind: "assisted-change",
        what: "Added Beregond to Willoughby's team: also works there.",
        studioId: "willoughby",
        before: { "Also works at": "Westlake, Strongsville" },
        after: { "Also works at": "Strongsville, Willoughby" },
        byName: "Ada Admin",
      },
      {
        kind: "assisted-change",
        what: "Took Beregond off Westlake's team.",
        studioId: "westlake",
        before: { "Also works at": "Westlake, Strongsville" },
        after: { "Also works at": "Strongsville, Willoughby" },
        byName: "Ada Admin",
      },
    ]);
  });

  it("says what happens, the grant and the kept history included, and nothing when nothing changes", () => {
    const lines = membershipConsequences({ person: beregond, plan: takeOffPlan(beregond, "westlake")!, studios });
    expect(lines[0]).toBe(
      "Beregond comes off the team at Westlake, and no longer helps run it. Nothing they did there is deleted: their sessions, notes and history stay.",
    );
    expect(lines).toContain("It's recorded in each studio's Activity, with your name.");
    expect(membershipConsequences({ person: beregond, plan: membershipPlan(beregond, ["westlake", "strongsville"]), studios })).toEqual([]);
  });
});
