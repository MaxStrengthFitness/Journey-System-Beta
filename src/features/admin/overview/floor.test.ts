import { beforeAll, describe, expect, it } from "vitest";
import type { ScheduleEntry, WorkoutSession } from "../../../types";
import { setActiveTimeZone, studioDateKey } from "../../../lib/studio-time";
import { loggedSessions } from "../../../lib/booking-state";
import {
  attentionItems,
  entriesForDay,
  summariseFloor,
} from "./floor";

// Studios operate in US Eastern; pin it so these assertions do not move with
// whatever machine runs them.
beforeAll(() => setActiveTimeZone("America/New_York"));

/** Journey holds no session for anyone that day: the booking's own status and the clock decide. */
const NONE = loggedSessions([]);

/** A completed Journey session for the client that day (AJ, Sep 24 2026: that is what done means). */
const loggedFor = (clientId: string, day = "08") =>
  loggedSessions([{ clientId, status: "Completed", startTime: at("08:05", day), date: `2026-09-${day}` } as WorkoutSession]);

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
      NONE,
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
      NONE,
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
      NONE,
    );
    expect(s.unresolved).toBe(1);
    expect(s.inProgress).toBe(0);
  });

  it("gives a session that ran a couple of minutes over the benefit of the doubt", () => {
    const s = summariseFloor(
      [entry({ startTime: at("09:26"), endTime: at("09:56") })],
      now,
      NONE,
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
      NONE,
    );
    expect(s.booked).toBe(3);
    expect(s.clients).toBe(2);
  });

  it("does not count a cancelled client as a body on the floor", () => {
    const s = summariseFloor(
      [entry({ clientId: "c1", status: "Cancelled" })],
      now,
      NONE,
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
      NONE,
    );
    expect(s.showRate).toBeNull();
  });

  it("counts a finished slot as done when Journey logged a session for that client that day", () => {
    // Mindbody bookings never come back "Completed"; the session is the proof.
    const s = summariseFloor(
      [
        entry({ clientId: "c1", startTime: at("08:00"), endTime: at("08:30") }),
        entry({ clientId: "c2", startTime: at("08:00"), endTime: at("08:30") }),
      ],
      now,
      loggedFor("c1"),
    );
    expect(s.completed).toBe(1);
    expect(s.unresolved).toBe(1);
    expect(s.showRate).toBeCloseTo(0.5);
  });

  it("a session logged on another day does not complete today's booking", () => {
    const s = summariseFloor(
      [entry({ clientId: "c1", startTime: at("08:00"), endTime: at("08:30") })],
      now,
      loggedFor("c1", "07"),
    );
    expect(s.completed).toBe(0);
    expect(s.unresolved).toBe(1);
  });

  it("when the sessions could not be read, a finished slot is unknown — never unresolved — and the rate waits", () => {
    const s = summariseFloor(
      [
        entry({ status: "Completed" }),
        entry({ clientId: "c1", startTime: at("08:00"), endTime: at("08:30") }),
        entry({ startTime: at("14:00"), endTime: at("14:30") }),
      ],
      now,
      null,
    );
    expect(s.unknown).toBe(1);
    expect(s.unresolved).toBe(0);
    expect(s.completed).toBe(1);
    expect(s.upcoming).toBe(1);
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
      NONE,
    );
    expect(s.showRate).toBeCloseTo(0.75);
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
      NONE,
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
      NONE,
    );
    expect(items).toEqual([]);
  });

  it("a finished slot Journey logged is not a row, and neither is one whose sessions could not be read", () => {
    const booked = [entry({ clientId: "c1", startTime: at("08:00"), endTime: at("08:30") })];
    expect(attentionItems(booked, now, loggedFor("c1"))).toEqual([]);
    expect(attentionItems(booked, now, null)).toEqual([]);
    expect(attentionItems(booked, now, NONE).map((i) => i.kind)).toEqual(["unresolved"]);
  });

  it("orders within a kind by time of day", () => {
    const items = attentionItems(
      [
        entry({ status: "No-Show", clientName: "Late", startTime: at("11:00") }),
        entry({ status: "No-Show", clientName: "Early", startTime: at("07:00") }),
      ],
      now,
      NONE,
    );
    expect(items.map((i) => i.clientName)).toEqual(["Early", "Late"]);
  });
});
