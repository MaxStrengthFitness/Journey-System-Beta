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
