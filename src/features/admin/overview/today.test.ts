import { describe, expect, it } from "vitest";
import type { ScheduleEntry } from "../../../types";
import { chaseList, pct, todayFoot, todayNumbers } from "./today";

const at = (hm: string) => new Date(`2026-09-19T${hm}:00-04:00`);
const NOW = at("12:00");

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
    const n = todayNumbers(DAY, NOW);
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
    const n = todayNumbers([], NOW);
    expect(n.donePct).toBeNull();
    expect(n.notCompletedPct).toBeNull();
    expect(pct(n.donePct)).toBe("—");
    expect(todayFoot(n).done).toBe("nothing booked");
  });

  it("the foot lines read in studio English", () => {
    const foot = todayFoot(todayNumbers(DAY, NOW));
    expect(foot.done).toBe("29% of 7 booked");
    expect(foot.notCompleted).toBe("1 cancelled · 1 no-show · 1 never logged");
    expect(foot.neverLogged).toBe("past their slot, nothing marked — chase these");
    expect(foot.floor).toBe("2 still to come");
  });
});

describe("chaseList", () => {
  it("lists only the never-logged, earliest first, with who and when", () => {
    const rows = chaseList([...DAY, booking("i", "07:00", "Scheduled", { trainerName: "Sara" })], NOW, "America/New_York");
    expect(rows.map((r) => [r.clientName, r.trainerName, r.at])).toEqual([
      ["Client i", "Sara", "7:00 AM"],
      ["Client e", "Tom", "10:00 AM"],
    ]);
  });
});
