import { describe, expect, it } from "vitest";
import { isStaffBlock } from "../../lib/booking-state";
import {
  LATE_CANCEL_HOURS,
  atRow,
  bookedForUsual,
  cancellationOf,
  countedCancellation,
  freeAt,
  inAhead,
  inOnPastDay,
  pastRow,
  regularsAt,
  whyNotJudged,
  wordAt,
  type PlacedBooking,
  type RoomDay,
} from "./room";
import { PAT_WEEK, SAM_WEEK, at, standingWeek } from "./fixtures";

const start = at("2026-10-05", "08:00");
const cancelled = (hoursBefore: number | null) => ({
  status: "Cancelled" as const,
  startTime: start,
  cancelledAt: hoursBefore === null ? null : new Date(start.getTime() - hoursBefore * 3_600_000),
});

describe("what counts as booked", () => {
  it("a cancellation less than 24 hours before its start is late; 24 hours or more is on time", () => {
    expect(LATE_CANCEL_HOURS).toBe(24);
    expect(cancellationOf(cancelled(24))).toBe("early");
    expect(cancellationOf(cancelled(24 - 1 / 60))).toBe("late");
    expect(cancellationOf(cancelled(48))).toBe("early");
  });

  it("the old sweep's unstamped cancellations are neither booked nor counted", () => {
    const c = cancellationOf(cancelled(null));
    expect(c).toBe("unstamped");
    expect(bookedForUsual(c)).toBe(false);
    expect(countedCancellation(c)).toBe(false);
  });

  it("a stamp at or after its own start (a back-read found it) is a cancellation, never a late one", () => {
    expect(cancellationOf(cancelled(-5))).toBe("after-start");
    expect(cancellationOf(cancelled(0))).toBe("after-start");
    expect(bookedForUsual("after-start")).toBe(false);
    expect(countedCancellation("after-start")).toBe(true);
  });

  it("a late cancellation still counts as booked for the usual word; an early one doesn't", () => {
    expect(bookedForUsual("late")).toBe(true);
    expect(bookedForUsual("early")).toBe(false);
    expect(bookedForUsual("none")).toBe(true);
    expect(cancellationOf({ status: "Scheduled", startTime: start })).toBe("none");
  });

  it("a Mindbody Unavailable block is not a booking", () => {
    expect(isStaffBlock({ clientName: "Unavailable" })).toBe(true);
    expect(isStaffBlock({ clientName: "UNAVAILABLE - lunch" })).toBe(true);
    expect(isStaffBlock({ clientName: "Judy Smith" })).toBe(false);
    expect(isStaffBlock(null)).toBe(false);
  });
});

const sam = (rows: number[], cancellation: PlacedBooking["cancellation"] = "none"): PlacedBooking => ({ rows, place: { kind: "trainer", trainerId: "t-sam" }, cancellation });
const pat = (rows: number[], cancellation: PlacedBooking["cancellation"] = "none"): PlacedBooking => ({ rows, place: { kind: "trainer", trainerId: "t-pat" }, cancellation });
const rotation = (rows: number[]): PlacedBooking => ({ rows, place: { kind: "rotation" }, cancellation: "none" });
const agreed = new Map([
  ["t-sam", [{ weekday: 1, from: "07:00", to: "10:00" }]],
  ["t-pat", [{ weekday: 1, from: "07:00", to: "09:00" }]],
]);
const day = (bookings: PlacedBooking[], a = agreed): RoomDay => ({ weekday: 1, bookings, agreed: a });

describe("a past day", () => {
  it("a trainer is in when their agreed week has them in AND they had a booking that day", () => {
    expect(inOnPastDay(day([sam([420]), pat([480])]), 480)).toEqual(["t-pat", "t-sam"]);
    // Pat had no booking all day: Journey can't tell they worked.
    expect(inOnPastDay(day([sam([420])]), 480)).toEqual(["t-sam"]);
    // An early cancellation is no booking; a late one is.
    expect(inOnPastDay(day([sam([420]), pat([480], "early")]), 480)).toEqual(["t-sam"]);
    expect(inOnPastDay(day([sam([420]), pat([480], "late")]), 480)).toEqual(["t-pat", "t-sam"]);
    expect(inOnPastDay(day([sam([420]), pat([480])]), 540)).toEqual(["t-sam"]);
  });

  it("can be judged only when everyone with a booking there is known", () => {
    expect(whyNotJudged(day([sam([420]), pat([480])]))).toBeNull();
    // Kim has bookings and no agreed week: probably in and free at 8:00, but Journey can't know it.
    const kim: PlacedBooking = { rows: [420], place: { kind: "trainer", trainerId: "t-kim" }, cancellation: "none" };
    expect(whyNotJudged(day([sam([420]), kim]))).toBe("unagreed");
    expect(whyNotJudged(day([sam([420]), { rows: [480], place: { kind: "unplaced" }, cancellation: "none" }]))).toBe("unplaced");
    // Rotation doesn't stop it, and nor does a booking cancelled in good time.
    expect(whyNotJudged(day([sam([420]), rotation([480]), { ...kim, cancellation: "early" }]))).toBeNull();
  });

  it("full, room, nobody booked, nobody in, booked only", () => {
    const d = day([sam([420, 480, 540]), pat([480])]);
    expect(pastRow(d, 480, true)).toMatchObject({ word: "full", booked: 2, inIds: ["t-pat", "t-sam"] });
    expect(pastRow(day([sam([420]), pat([480])]), 420, true).word).toBe("room");
    expect(pastRow(d, 450, true).word).toBe("none");
    expect(pastRow(d, 600, true)).toMatchObject({ word: "out", booked: 0, inIds: [] });
    expect(pastRow(d, 480, false).word).toBe("booked");
  });

  it("rotation takes one free trainer's place without saying whose", () => {
    const d = day([sam([420]), pat([480]), rotation([420])]);
    expect(pastRow(d, 420, true)).toMatchObject({ word: "full", booked: 2, rotation: 1 });
    // Nobody in, and the rotation booked anyway: counted, nothing more.
    expect(pastRow(day([sam([420]), rotation([700]), rotation([700])]), 700, true)).toMatchObject({ word: "out", booked: 2, rotation: 2 });
  });

  it("counts stamped cancellations and the late ones at the time they were for", () => {
    const r = atRow([sam([480], "late"), pat([480], "early"), sam([480], "unstamped"), pat([480], "after-start")], 480);
    expect(r).toMatchObject({ booked: 1, cancelled: 3, late: 1 });
  });
});

describe("the next 7 days", () => {
  it("a trainer usually in: agreed week, still works here, not away", () => {
    expect(inAhead([SAM_WEEK, PAT_WEEK], "2026-11-09", 480)).toEqual(["t-pat", "t-sam"]);
    expect(inAhead([SAM_WEEK, PAT_WEEK], "2026-11-09", 480, (id) => id !== "t-pat")).toEqual(["t-sam"]);
    const away = standingWeek({ away: [{ id: "a1", from: "2026-11-09", to: "2026-11-13" }] });
    expect(inAhead([away, PAT_WEEK], "2026-11-09", 480)).toEqual(["t-pat"]);
    expect(inAhead([standingWeek({ final: null })], "2026-11-09", 480)).toEqual([]);
  });

  it("free, and whether the names are known once the rotation has taken places", () => {
    expect(freeAt(["t-pat", "t-sam"], { placed: ["t-sam"], rotation: 0 })).toEqual({ free: ["t-pat"], room: 1, namesKnown: true });
    expect(freeAt(["t-pat", "t-sam"], { placed: [], rotation: 1 })).toEqual({ free: ["t-pat", "t-sam"], room: 1, namesKnown: false });
    expect(wordAt(true, ["t-sam"], { placed: [], rotation: 0, booked: 0 })).toBe("none");
    expect(wordAt(true, ["t-sam"], { placed: ["t-sam"], rotation: 0, booked: 1 })).toBe("full");
  });
});

describe("today's regulars at a time", () => {
  it("counts regulars within 15 minutes of the half-hour, of trainers still here", () => {
    const regular = (id: string, start: string) => ({ id, weekday: 1, start, clientId: `c-${id}`, clientName: id });
    const withRegulars = standingWeek({ final: { hours: [{ weekday: 1, from: "07:00", to: "10:00" }], regulars: [regular("a", "08:00"), regular("b", "08:15"), regular("c", "08:20"), regular("d", "09:00")] } });
    expect(regularsAt([withRegulars], 1, 480)).toBe(2);
    expect(regularsAt([withRegulars], 1, 510)).toBe(2);
    expect(regularsAt([withRegulars], 1, 480, () => false)).toBe(0);
    expect(regularsAt([standingWeek({ final: null })], 1, 480)).toBe(0);
  });
});
