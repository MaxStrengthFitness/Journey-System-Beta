import { describe, expect, it } from "vitest";
import { bookingsKnown, teamWeeks, uidOf, waitingOnALeader, waitingSentence } from "./team";
import type { StandingWeek, StandingWeekDoc } from "./week";

/** The standing weeks on My Studio → Team (voice-review round, Sep 27 2026). */

const week: StandingWeek = { hours: [{ weekday: 1, from: "07:00", to: "13:00" }], regulars: [] };
const trainer = (id: string, fullName: string, over: Record<string, unknown> = {}) => ({
  id,
  fullName,
  primaryHomeStudioId: "solon",
  accessibleStudioIds: ["solon"],
  activeGuestStudioIds: [],
  ...over,
});
const doc = (id: string, over: Partial<StandingWeekDoc> = {}): StandingWeekDoc => ({
  id,
  studioId: "solon",
  trainerUid: id,
  trainerId: id,
  trainerName: "Someone",
  proposed: week,
  final: null,
  ...over,
});

describe("who Team lists", () => {
  it("is everyone who works at the studio, by name, each with their week", () => {
    const rows = teamWeeks(
      [trainer("t-sam", "Sam Lee"), trainer("t-ann", "Ann Park"), trainer("t-far", "Far Away", { primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake"] })],
      [doc("t-sam")],
      "solon",
    );
    expect(rows.map((r) => [r.name, r.status])).toEqual([
      ["Ann Park", "none"],
      ["Sam Lee", "proposed"],
    ]);
  });

  it("finds an older account's week under its Auth uid, or by its trainer id", () => {
    const old = trainer("t-old", "Old Account", { authUid: "uid-old" });
    expect(uidOf(old)).toBe("uid-old");
    expect(teamWeeks([old], [doc("uid-old", { trainerId: "t-old" })], "solon")[0]).toMatchObject({ uid: "uid-old", status: "proposed" });
    expect(teamWeeks([old], [doc("uid-x", { trainerId: "t-old" })], "solon")[0]).toMatchObject({ uid: "uid-x", onStaff: true });
    expect(teamWeeks([old], [], "solon")[0]).toMatchObject({ uid: "uid-old", doc: null });
  });

  it("leaves out a placeholder nobody claimed, a replaced account and an inactive one", () => {
    const rows = teamWeeks(
      [trainer("t-new", "New Hire", { pendingClaim: true }), trainer("t-gone", "Gone", { supersededByUid: "uid-2" }), trainer("t-off", "Off", { isActive: false })],
      [],
      "solon",
    );
    expect(rows).toEqual([]);
  });

  it("lists a floater and a guest who work here too (AJ: everyone who works there)", () => {
    const rows = teamWeeks(
      [
        trainer("t-float", "Flo Ater", { primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake", "solon"] }),
        trainer("t-guest", "Gus Guest", { primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake"], activeGuestStudioIds: ["solon"] }),
      ],
      [],
      "solon",
    );
    expect(rows.map((r) => r.name)).toEqual(["Flo Ater", "Gus Guest"]);
  });

  it("lists Demo Mode's own trainers in Demo Mode, never the whole company (the realm rule)", () => {
    const aragorn = trainer("demo-aragorn", "Aragorn Elessar", {
      primaryHomeStudioId: "demo-studio",
      accessibleStudioIds: ["demo-studio"],
      pendingClaim: true,
      isDemo: true,
    });
    const rows = teamWeeks([trainer("t-sam", "Sam Lee"), trainer("t-ann", "Ann Park"), aragorn], [], "demo-studio");
    expect(rows.map((r) => r.name)).toEqual(["Aragorn Elessar"]);
    // And Demo Mode's trainer is not on a real studio's list.
    expect(teamWeeks([aragorn], [], "solon")).toEqual([]);
  });

  it("lists a real trainer's practice week at the Demo studio as theirs to have agreed, never as someone who left", () => {
    // Demo Mode lets everyone act, so a real trainer practising there may
    // propose a week on My Profile (present.ts worksAt, the rules). Their own
    // week keeps them on the list; the rest of the company still isn't listed.
    const aragorn = trainer("demo-aragorn", "Aragorn Elessar", {
      primaryHomeStudioId: "demo-studio",
      accessibleStudioIds: ["demo-studio"],
      pendingClaim: true,
      isDemo: true,
    });
    const rows = teamWeeks(
      [trainer("t-sam", "Sam Lee"), trainer("t-ann", "Ann Park"), aragorn],
      [doc("t-sam", { studioId: "demo-studio" })],
      "demo-studio",
    );
    expect(rows.map((r) => [r.name, r.onStaff])).toEqual([
      ["Aragorn Elessar", true],
      ["Sam Lee", true],
    ]);
    expect(rows.find((r) => r.name === "Sam Lee")).toMatchObject({ uid: "t-sam", trainerId: "t-sam", status: "proposed" });
    expect(waitingOnALeader(rows).map((r) => r.name)).toEqual(["Sam Lee"]);
    expect(waitingSentence(rows)).toBe("Sam has a week waiting to be agreed.");
    // A practice week whose trainer document isn't loaded is still nobody who "left".
    expect(teamWeeks([aragorn], [doc("uid-who", { studioId: "demo-studio", trainerName: "Who Ever" })], "demo-studio").map((r) => [r.name, r.onStaff])).toEqual([
      ["Aragorn Elessar", true],
      ["Who Ever", true],
    ]);
    // At a real studio a week left behind is still someone who no longer works there.
    expect(teamWeeks([], [doc("uid-who", { trainerName: "Who Ever" })], "solon")[0]).toMatchObject({ onStaff: false });
  });

  it("never gives one person's own week to another person's row by its trainer id", () => {
    // Sam's week carries Ann's trainer id (a hand-made write). It stays Sam's:
    // Ann, with no week of her own, is not offered it.
    const rows = teamWeeks([trainer("t-sam", "Sam Lee"), trainer("t-ann", "Ann Park")], [doc("t-sam", { trainerId: "t-ann" })], "solon");
    expect(rows.map((r) => [r.name, r.doc?.id ?? null])).toEqual([
      ["Ann Park", null],
      ["Sam Lee", "t-sam"],
    ]);
    expect(new Set(rows.map((r) => r.uid)).size).toBe(rows.length);
  });

  it("lists a week left behind by someone who no longer works here, after the staff", () => {
    const rows = teamWeeks([trainer("t-sam", "Sam Lee")], [doc("uid-left", { trainerId: "t-left", trainerName: "Lee Left", final: week })], "solon");
    expect(rows.map((r) => [r.name, r.onStaff])).toEqual([
      ["Sam Lee", true],
      ["Lee Left", false],
    ]);
  });
});

describe("whose week is waiting", () => {
  it("names the people with a proposal to agree, and says nothing when nobody is waiting", () => {
    const rows = teamWeeks(
      [trainer("t-sam", "Sam Lee"), trainer("t-ann", "Ann Park"), trainer("t-bo", "Bo Chen")],
      [doc("t-sam"), doc("t-ann", { final: week, proposed: { ...week, regulars: [] , note: "x" } }), doc("t-bo", { final: week })],
      "solon",
    );
    expect(waitingOnALeader(rows).map((r) => r.name)).toEqual(["Ann Park", "Sam Lee"]);
    expect(waitingSentence(rows)).toBe("Ann and Sam have a week waiting to be agreed.");
    expect(waitingSentence(rows.slice(1))).toBe("Sam has a week waiting to be agreed.");
    expect(waitingSentence([])).toBeNull();
  });
});

describe("whether the week can be checked", () => {
  it("needs Mindbody linked, and the Demo studio's week is seeded", () => {
    expect(bookingsKnown({ id: "solon", mindbodySiteId: "5746957" })).toBe(true);
    expect(bookingsKnown({ id: "solon", mindbodySiteId: "5746957", mindbodyMode: "offline" })).toBe(false);
    expect(bookingsKnown({ id: "solon", mindbodySiteId: " " })).toBe(false);
    expect(bookingsKnown({ id: "demo-studio" })).toBe(true);
    expect(bookingsKnown(null)).toBe(false);
  });
});
