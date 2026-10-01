import { describe, expect, it } from "vitest";
import { UNASSIGNED_ID, columnIdOf, planColumns, staffLabel, worksHereOnCalendar } from "./columns";

const t = (id: string, extra: Record<string, unknown> = {}) => ({ id, primaryHomeStudioId: "westlake", ...extra });
const CHRIS_A = t("t-chris-a");
const CHRIS_B = t("t-chris-b");
const IDS = new Set(["t-chris-a", "t-chris-b"]);

describe("which column a booking goes in (hub fixes, Oct 1 2026)", () => {
  it("is decided by the trainer id, never by a name: two Chrises never swap", () => {
    expect(columnIdOf({ trainerId: "t-chris-b", trainerName: "Chris" }, IDS)).toBe("t-chris-b");
    expect(columnIdOf({ trainerId: "t-chris-a", trainerName: "Chris Bolger" }, IDS)).toBe("t-chris-a");
    // A name alone, even a full one, is Unassigned.
    expect(columnIdOf({ trainerId: null, trainerName: "Chris" }, IDS)).toBe(UNASSIGNED_ID);
  });

  it("uses a Mindbody staff id only as a positive match at this studio's site", () => {
    const staffIds = { "t-chris-a": "100000042" };
    expect(columnIdOf({ trainerId: null, trainerName: "Christopher A", mindbodyStaffId: 100000042 }, IDS, staffIds)).toBe("t-chris-a");
    expect(columnIdOf({ trainerId: null, trainerName: "Chris", mindbodyStaffId: "999" }, IDS, staffIds)).toBe(UNASSIGNED_ID);
    // A trainer id still decides over a staff id.
    expect(columnIdOf({ trainerId: "t-chris-b", mindbodyStaffId: "100000042" }, IDS, staffIds)).toBe("t-chris-b");
    // Two trainers claiming one staff id prove nothing.
    expect(columnIdOf({ mindbodyStaffId: "7" }, IDS, { "t-chris-a": "7", "t-chris-b": "7" })).toBe(UNASSIGNED_ID);
  });

  it("puts a blank, placeholder, rotation or unknown trainer in Unassigned, never nowhere", () => {
    expect(columnIdOf({ trainerName: "" }, IDS)).toBe(UNASSIGNED_ID);
    expect(columnIdOf({ trainerName: "Select a staff member" }, IDS)).toBe(UNASSIGNED_ID);
    expect(columnIdOf({ trainerName: "Westlake Rotation", trainerId: "t-chris-a" }, IDS)).toBe(UNASSIGNED_ID);
    expect(columnIdOf({ trainerId: "t-gone", trainerName: "Someone who left" }, IDS)).toBe(UNASSIGNED_ID);
  });

  it("draws Mindbody's Unavailable in its trainer's column, and nowhere when it is nobody's", () => {
    expect(columnIdOf({ trainerId: "t-chris-a", clientName: "Unavailable" }, IDS)).toBe("t-chris-a");
    expect(columnIdOf({ trainerName: "", clientName: "Unavailable" }, IDS)).toBeNull();
  });
});

describe("the day's columns", () => {
  it("gives every trainer with a booking a column, yours first, and Unassigned what's left", () => {
    const plan = planColumns({
      trainers: [CHRIS_A, CHRIS_B, t("t-idle")],
      bookings: [
        { trainerId: "t-chris-b", clientName: "Ann" },
        { trainerId: "t-chris-a", clientName: "Bea" },
        { trainerId: null, trainerName: "", clientName: "Cal" },
        { trainerId: null, trainerName: "Select", clientName: "Dot" },
      ],
      studioId: "westlake",
      selfId: "t-chris-b",
    });
    expect(plan.trainers.map((x) => x.id)).toEqual(["t-chris-b", "t-chris-a"]);
    expect(plan.unassigned).toBe(2);
    expect(plan.columnOf).toEqual(["t-chris-b", "t-chris-a", UNASSIGNED_ID, UNASSIGNED_ID]);
  });

  it("gives a trainer hidden from the calendar a column for their own booking, so nothing is dropped", () => {
    const hidden = t("t-hidden", { isVisibleOnCalendar: false });
    const plan = planColumns({ trainers: [hidden], bookings: [{ trainerId: "t-hidden", clientName: "Eve" }] });
    expect(plan.trainers.map((x) => x.id)).toEqual(["t-hidden"]);
    expect(plan.unassigned).toBe(0);
  });

  it("on an empty day shows the studio's visible trainers", () => {
    const plan = planColumns({
      trainers: [CHRIS_A, t("t-solon", { primaryHomeStudioId: "solon" }), t("t-hidden", { isVisibleOnCalendar: false })],
      bookings: [],
      studioId: "westlake",
    });
    expect(plan.trainers.map((x) => x.id)).toEqual(["t-chris-a"]);
  });

  it("with only Unassigned bookings, still shows the studio's trainers beside them", () => {
    const plan = planColumns({ trainers: [CHRIS_A], bookings: [{ trainerName: "Westlake Rotation", clientName: "Fay" }], studioId: "westlake" });
    expect(plan.trainers.map((x) => x.id)).toEqual(["t-chris-a"]);
    expect(plan.unassigned).toBe(1);
  });

  it("leaves a staff block off the grid when its trainer has no column", () => {
    const plan = planColumns({
      trainers: [CHRIS_A, CHRIS_B],
      bookings: [
        { trainerId: "t-chris-a", clientName: "Gil" },
        { trainerId: "t-chris-b", clientName: "Unavailable" },
      ],
    });
    expect(plan.trainers.map((x) => x.id)).toEqual(["t-chris-a"]);
    expect(plan.columnOf).toEqual(["t-chris-a", null]);
  });

  it("says Mindbody's staff name on an Unassigned card, never a placeholder", () => {
    expect(staffLabel("  Samuel   Lee ")).toBe("Samuel Lee");
    expect(staffLabel("Westlake Rotation")).toBe("Westlake Rotation");
    expect(staffLabel("Select a staff member")).toBeNull();
    expect(staffLabel("")).toBeNull();
    expect(staffLabel(null)).toBeNull();
  });

  it("knows who is on this studio's calendar", () => {
    expect(worksHereOnCalendar(t("a", { accessibleStudioIds: ["solon"], primaryHomeStudioId: "x" }), "solon")).toBe(true);
    expect(worksHereOnCalendar(t("a", { activeGuestStudioIds: ["solon"], primaryHomeStudioId: "x" }), "solon")).toBe(true);
    expect(worksHereOnCalendar(t("a"), "solon")).toBe(false);
  });
});
