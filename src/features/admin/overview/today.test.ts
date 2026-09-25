import { describe, expect, it } from "vitest";
import type { ScheduleEntry, WorkoutSession } from "../../../types";
import { loggedSessions } from "../../../lib/booking-state";
import { chaseList, pct, todayFoot, todayNumbers } from "./today";

const at = (hm: string) => new Date(`2026-09-19T${hm}:00-04:00`);
const NOW = at("12:00");
const TZ = "America/New_York";
/** Journey holds no session for anyone today. */
const NONE = loggedSessions([]);
/** A completed Journey session for these clients today. */
const loggedFor = (...clientIds: string[]) =>
  loggedSessions(clientIds.map((clientId) => ({ clientId, status: "Completed", startTime: at("10:02"), date: "2026-09-19" }) as WorkoutSession), TZ);

function booking(id: string, start: string, status: ScheduleEntry["status"], over: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    id,
    clientId: `c-${id}`,
    clientName: `Client ${id}`,
    trainerName: "Tom",
    studioId: "s1",
    startTime: at(start),
    endTime: new Date(at(start).getTime() + 30 * 60_000),
    status,
    serviceName: "Training Session",
    source: "MindBody",
    createdAt: null,
    ...over,
  };
}

const DAY = [
  booking("a", "08:00", "Completed"),
  booking("b", "08:30", "Completed"),
  booking("c", "09:00", "No-Show"),
  booking("d", "09:30", "Cancelled"),
  booking("e", "10:00", "Scheduled"), // finished at 10:30, nothing marked: never logged
  booking("f", "11:45", "Scheduled"), // on the floor now
  booking("g", "14:00", "Scheduled"), // still to come
  booking("h", "15:00", "Scheduled"),
];

describe("todayNumbers", () => {
  it("counts live bookings, done, not completed and the never-logged", () => {
    const n = todayNumbers(DAY, NOW, NONE, TZ);
    expect(n.booked).toBe(7);
    expect(n.cancelled).toBe(1);
    expect(n.done).toBe(2);
    expect(n.donePct).toBeCloseTo(2 / 7);
    expect(n.noShow).toBe(1);
    expect(n.neverLogged).toBe(1);
    expect(n.notCompleted).toBe(3);
    expect(n.notCompletedPct).toBeCloseTo(3 / 8);
    expect(n.onTheFloor).toBe(1);
    expect(n.stillToCome).toBe(2);
  });

  it("an empty day has no percentages, not zero percent", () => {
    const n = todayNumbers([], NOW, NONE, TZ);
    expect(n.donePct).toBeNull();
    expect(n.notCompletedPct).toBeNull();
    expect(pct(n.donePct)).toBe("—");
    expect(todayFoot(n).done).toBe("nothing booked");
  });

  it("the foot lines read in studio English", () => {
    const foot = todayFoot(todayNumbers(DAY, NOW, NONE, TZ));
    expect(foot.done).toBe("29% of 7 booked");
    expect(foot.notCompleted).toBe("1 cancelled · 1 no-show · 1 never logged");
    expect(foot.neverLogged).toBe("past their slot, nothing logged — chase these");
    expect(foot.floor).toBe("2 still to come");
  });

  it("a booking is done when Journey logged a session for that client today — Mindbody never says so", () => {
    const n = todayNumbers(DAY, NOW, loggedFor("c-e"), TZ);
    expect(n.done).toBe(3);
    expect(n.neverLogged).toBe(0);
    expect(n.notCompleted).toBe(2);
    expect(todayFoot(n).neverLogged).toBe("every finished slot is logged");
  });

  it("when today's sessions could not be read, the finished slot is missing — not never logged, not zero", () => {
    const n = todayNumbers(DAY, NOW, null, TZ);
    expect(n.unknown).toBe(1);
    expect(n.neverLogged).toBe(0);
    expect(n.done).toBe(2); // Mindbody's own marks still count
    expect(n.onTheFloor).toBe(1);
    expect(n.stillToCome).toBe(2);
    const foot = todayFoot(n);
    expect(foot.neverLogged).toBe("missing, not zero — Journey's sessions could not be read");
    expect(foot.done).toBe(foot.neverLogged);
    expect(foot.floor).toBe("2 still to come");
  });
});

describe("chaseList", () => {
  it("lists only the never-logged, earliest first, with who and when", () => {
    const rows = chaseList([...DAY, booking("i", "07:00", "Scheduled", { trainerName: "Sara" })], NOW, NONE, TZ);
    expect(rows.map((r) => [r.clientName, r.trainerName, r.at])).toEqual([
      ["Client i", "Sara", "7:00 AM"],
      ["Client e", "Tom", "10:00 AM"],
    ]);
  });

  it("drops a booking once its session is logged, and chases nobody when the sessions could not be read", () => {
    const day = [...DAY, booking("i", "07:00", "Scheduled", { trainerName: "Sara" })];
    expect(chaseList(day, NOW, loggedFor("c-e"), TZ).map((r) => r.clientName)).toEqual(["Client i"]);
    expect(chaseList(day, NOW, null, TZ)).toEqual([]);
  });
});
