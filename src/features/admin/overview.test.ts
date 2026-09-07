import { beforeAll, describe, expect, it } from "vitest";
import type { ScheduleEntry, WorkoutSession } from "../../types";
import { setActiveTimeZone, studioDateKey } from "../../lib/studio-time";
import {
  attentionItems,
  entriesForDay,
  loadByDay,
  summariseFloor,
  trainerLanes,
} from "./overview";

// Studios operate in US Eastern; pin it so these assertions do not move with
// whatever machine runs them.
beforeAll(() => setActiveTimeZone("America/New_York"));

/** 2026-09-08 is a Tuesday. Times below are Eastern wall clock (EDT, -04:00). */
const at = (hhmm: string, day = "08") =>
  new Date(`2026-09-${day}T${hhmm}:00-04:00`);

let seq = 0;
function entry(over: Partial<ScheduleEntry> = {}): ScheduleEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    clientName: `Client ${seq}`,
    trainerName: "Marina",
    trainerId: "t-marina",
    studioId: "solon",
    startTime: at("09:00"),
    endTime: at("09:30"),
    status: "Scheduled",
    serviceName: "Max Strength",
    source: "MindBody",
    createdAt: at("08:00"),
    ...over,
  };
}

describe("entriesForDay", () => {
  it("keeps the studio's day, not UTC's", () => {
    // 8pm Eastern is already tomorrow in UTC. A board that filtered on UTC
    // would silently drop the last two hours of every evening.
    const evening = entry({ startTime: at("20:00"), endTime: at("20:30") });
    const morning = entry({ startTime: at("07:00"), endTime: at("07:30") });
    const yesterday = entry({
      startTime: at("09:00", "07"),
      endTime: at("09:30", "07"),
    });
    const kept = entriesForDay([evening, morning, yesterday], "2026-09-08");
    expect(kept.map((e) => e.id).sort()).toEqual(
      [evening.id, morning.id].sort(),
    );
  });

  it("drops entries with no usable start time", () => {
    expect(entriesForDay([entry({ startTime: null })], "2026-09-08")).toEqual([]);
  });
});

describe("summariseFloor", () => {
  const now = at("10:00");

  it("counts each status", () => {
    const s = summariseFloor(
      [
        entry({ status: "Completed" }),
        entry({ status: "Completed" }),
        entry({ status: "No-Show" }),
        entry({ status: "Cancelled" }),
        entry({ startTime: at("14:00"), endTime: at("14:30") }),
      ],
      now,
    );
    expect(s.booked).toBe(5);
    expect(s.completed).toBe(2);
    expect(s.noShow).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.upcoming).toBe(1);
    expect(s.missed).toBe(2);
  });

  it("counts a slot that is running right now as in progress", () => {
    const s = summariseFloor(
      [entry({ startTime: at("09:45"), endTime: at("10:15") })],
      now,
    );
    expect(s.inProgress).toBe(1);
    expect(s.unresolved).toBe(0);
  });

  it("flags a finished slot nobody marked as unresolved", () => {
    // The quiet one: still "Scheduled" at 10am for an 8:30 slot. Not
    // completed, not a no-show — and it corrupts every retention number
    // below it until a human touches it.
    const s = summariseFloor(
      [entry({ startTime: at("08:00"), endTime: at("08:30") })],
      now,
    );
    expect(s.unresolved).toBe(1);
    expect(s.inProgress).toBe(0);
  });

  it("gives a session that ran a couple of minutes over the benefit of the doubt", () => {
    const s = summariseFloor(
      [entry({ startTime: at("09:26"), endTime: at("09:56") })],
      now,
    );
    expect(s.unresolved).toBe(0);
    expect(s.inProgress).toBe(1);
  });

  it("counts people, not bookings, for client load", () => {
    const s = summariseFloor(
      [
        entry({ clientId: "c1", status: "Completed" }),
        entry({ clientId: "c1", startTime: at("16:00"), endTime: at("16:30") }),
        entry({ clientId: "c2", status: "Completed" }),
      ],
      now,
    );
    expect(s.booked).toBe(3);
    expect(s.clients).toBe(2);
  });

  it("does not count a cancelled client as a body on the floor", () => {
    const s = summariseFloor(
      [entry({ clientId: "c1", status: "Cancelled" })],
      now,
    );
    expect(s.clients).toBe(0);
    expect(s.booked).toBe(1);
  });

  it("reports no show rate before anything has resolved", () => {
    // 0 of 0 is not 0% — it is "the day has not started". Rendering 0% at
    // 6am would have a studio leader ringing people.
    const s = summariseFloor(
      [entry({ startTime: at("14:00"), endTime: at("14:30") })],
      now,
    );
    expect(s.showRate).toBeNull();
  });

  it("computes a show rate over what was supposed to happen", () => {
    const s = summariseFloor(
      [
        entry({ status: "Completed" }),
        entry({ status: "Completed" }),
        entry({ status: "Completed" }),
        entry({ status: "No-Show" }),
        // Cancellations are deliberately NOT in the denominator: a client who
        // cancelled with notice never owed the studio an appearance.
        entry({ status: "Cancelled" }),
      ],
      now,
    );
    expect(s.showRate).toBeCloseTo(0.75);
  });
});

describe("trainerLanes", () => {
  const now = at("10:00");

  it("groups by trainer and orders by when their day starts", () => {
    const lanes = trainerLanes(
      [
        entry({ trainerId: "t-b", trainerName: "Bo", startTime: at("11:00"), endTime: at("11:30") }),
        entry({ trainerId: "t-a", trainerName: "Ann", startTime: at("07:00"), endTime: at("07:30"), status: "Completed" }),
        entry({ trainerId: "t-a", trainerName: "Ann", startTime: at("08:00"), endTime: at("08:30"), status: "Completed" }),
      ],
      now,
    );
    expect(lanes.map((l) => l.trainerName)).toEqual(["Ann", "Bo"]);
    expect(lanes[0].total).toBe(2);
    expect(lanes[0].completed).toBe(2);
    expect(lanes[0].remaining).toBe(0);
  });

  it("names who a trainer is with right now", () => {
    const lanes = trainerLanes(
      [entry({ clientName: "Gerri Lane", startTime: at("09:45"), endTime: at("10:15") })],
      now,
    );
    expect(lanes[0].nowWith).toBe("Gerri Lane");
  });

  it("keeps a lane for a trainer whose whole day cancelled", () => {
    // "Marina's four bookings all cancelled" is exactly what a studio leader
    // needs to see. Dropping the empty lane hides it.
    const lanes = trainerLanes(
      [
        entry({ status: "Cancelled" }),
        entry({ status: "Cancelled", startTime: at("10:00"), endTime: at("10:30") }),
      ],
      now,
    );
    expect(lanes).toHaveLength(1);
    expect(lanes[0].cancelled).toBe(2);
    expect(lanes[0].total).toBe(0);
  });

  it("does not count cancellations toward remaining work", () => {
    const lanes = trainerLanes(
      [
        entry({ status: "Completed" }),
        entry({ status: "Cancelled", startTime: at("13:00"), endTime: at("13:30") }),
        entry({ startTime: at("14:00"), endTime: at("14:30") }),
      ],
      now,
    );
    expect(lanes[0].total).toBe(2);
    expect(lanes[0].remaining).toBe(1);
  });

  it("floats anyone mid-session to the top regardless of start time", () => {
    const live: WorkoutSession[] = [
      { trainerId: "t-late", status: "In-Progress" } as WorkoutSession,
    ];
    const lanes = trainerLanes(
      [
        entry({ trainerId: "t-early", trainerName: "Ann", startTime: at("07:00"), endTime: at("07:30") }),
        entry({ trainerId: "t-late", trainerName: "Zed", startTime: at("15:00"), endTime: at("15:30") }),
      ],
      now,
      live,
    );
    expect(lanes[0].trainerName).toBe("Zed");
    expect(lanes[0].live).toBe(true);
    expect(lanes[1].live).toBe(false);
  });

  it("ignores a finished session when deciding who is live", () => {
    const live: WorkoutSession[] = [
      { trainerId: "t-marina", status: "Completed" } as WorkoutSession,
    ];
    const lanes = trainerLanes([entry()], now, live);
    expect(lanes[0].live).toBe(false);
  });

  it("groups unassigned bookings by name rather than losing them", () => {
    const lanes = trainerLanes(
      [entry({ trainerId: undefined, trainerName: "Rotation" })],
      now,
    );
    expect(lanes[0].trainerId).toBeNull();
    expect(lanes[0].trainerName).toBe("Rotation");
  });

  it("reports the next appointment start", () => {
    const lanes = trainerLanes(
      [
        entry({ startTime: at("14:00"), endTime: at("14:30") }),
        entry({ startTime: at("11:00"), endTime: at("11:30") }),
      ],
      now,
    );
    expect(lanes[0].nextAt?.toISOString()).toBe(at("11:00").toISOString());
  });
});

describe("attentionItems", () => {
  const now = at("12:00");

  it("puts no-shows first, then unresolved, then cancellations", () => {
    const items = attentionItems(
      [
        entry({ status: "Cancelled", clientName: "Cancelled Carl" }),
        entry({ status: "Scheduled", clientName: "Unmarked Uma", startTime: at("08:00"), endTime: at("08:30") }),
        entry({ status: "No-Show", clientName: "Noshow Ned" }),
      ],
      now,
    );
    expect(items.map((i) => i.clientName)).toEqual([
      "Noshow Ned",
      "Unmarked Uma",
      "Cancelled Carl",
    ]);
  });

  it("leaves a slot that is still running alone", () => {
    const items = attentionItems(
      [entry({ startTime: at("11:45"), endTime: at("12:15") })],
      now,
    );
    expect(items).toEqual([]);
  });

  it("orders within a kind by time of day", () => {
    const items = attentionItems(
      [
        entry({ status: "No-Show", clientName: "Late", startTime: at("11:00") }),
        entry({ status: "No-Show", clientName: "Early", startTime: at("07:00") }),
      ],
      now,
    );
    expect(items.map((i) => i.clientName)).toEqual(["Early", "Late"]);
  });
});

describe("loadByDay", () => {
  it("buckets by studio-local day, in order", () => {
    const rows = loadByDay([
      entry({ startTime: at("20:00", "08"), status: "Completed" }),
      entry({ startTime: at("09:00", "09") }),
      entry({ startTime: at("09:00", "07"), status: "No-Show" }),
    ]);
    expect(rows.map((r) => r.dayKey)).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
    ]);
    expect(rows[0].missed).toBe(1);
    expect(rows[1].completed).toBe(1);
  });

  it("agrees with studioDateKey about which day an evening belongs to", () => {
    const evening = entry({ startTime: at("22:30", "08") });
    expect(loadByDay([evening])[0].dayKey).toBe(
      studioDateKey(at("22:30", "08")),
    );
  });
});
