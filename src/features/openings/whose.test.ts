import { describe, expect, it } from "vitest";
import { staffIdsAt } from "../standing-week/check";
import { placeBooking, trainerRefs } from "./whose";

const trainers = trainerRefs(
  [
    { id: "t-sam", name: "Sam Lee" },
    { id: "t-pat", name: "Pat Moss" },
    { id: "t-kim", name: "Kim Ray" },
  ],
  { "t-kim": "101" },
);

describe("placeBooking — the standing week check's own rule", () => {
  it("the trainer id decides, whatever the name says", () => {
    expect(placeBooking({ trainerId: "t-sam", trainerName: "Samuel Lee" }, trainers)).toEqual({ kind: "trainer", trainerId: "t-sam" });
    // A trainer id the studio's list doesn't hold is still that trainer's (someone who has left).
    expect(placeBooking({ trainerId: "t-gone", trainerName: "Jo Gone" }, trainers)).toEqual({ kind: "trainer", trainerId: "t-gone" });
  });

  it("the rotation is nobody's in particular, even with a trainer id beside it", () => {
    expect(placeBooking({ trainerName: "Westlake Rotation" }, trainers)).toEqual({ kind: "rotation" });
    expect(placeBooking({ trainerId: "t-rot", trainerName: "Solon Rotation" }, trainers)).toEqual({ kind: "rotation" });
  });

  it("then the Mindbody staff id at this site, then the same name", () => {
    expect(placeBooking({ trainerName: "K. Ray", mindbodyStaffId: 101 }, trainers)).toEqual({ kind: "trainer", trainerId: "t-kim" });
    expect(placeBooking({ trainerName: "pat  moss" }, trainers)).toEqual({ kind: "trainer", trainerId: "t-pat" });
  });

  it("a name that differs proves nothing, and neither does no name", () => {
    expect(placeBooking({ trainerName: "Samuel Lee" }, trainers)).toEqual({ kind: "unplaced" });
    expect(placeBooking({ trainerName: "" }, trainers)).toEqual({ kind: "unplaced" });
    expect(placeBooking({ trainerName: "Kim Ray", mindbodyStaffId: "999" }, trainers)).toEqual({ kind: "trainer", trainerId: "t-kim" });
  });

  it("two trainers who answer to the same name are no answer, unless one staff id picks one out", () => {
    const twins = trainerRefs([{ id: "a", name: "Alex Doe" }, { id: "b", name: "Alex Doe" }], { b: "7" });
    expect(placeBooking({ trainerName: "Alex Doe" }, twins)).toEqual({ kind: "unplaced" });
    expect(placeBooking({ trainerName: "Alex Doe", mindbodyStaffId: "7" }, twins)).toEqual({ kind: "trainer", trainerId: "b" });
  });

  it("uses staff ids only from this studio's site (staffIdsAt)", () => {
    const ids = staffIdsAt([{ id: "t-kim", mindbodyStaffId: "101", mindbody: { siteId: "5746957" } } as never], "29068");
    expect(placeBooking({ trainerName: "K. Ray", mindbodyStaffId: "101" }, trainerRefs([{ id: "t-kim", name: "Kim Ray" }], ids))).toEqual({ kind: "unplaced" });
  });
});
