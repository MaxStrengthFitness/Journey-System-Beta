import { describe, expect, it } from "vitest";
import {
  formatNextBooking,
  journeySentence,
  nextBookingFor,
  strengthJourney,
  todayHeadline,
  todayLines,
} from "./post-session";

const names: Record<string, string> = { hip: "Hip Adduction", leg: "Leg Press", row: "Compound Row", lum: "Lumbar" };
const nameOf = (id: string) => names[id] ?? id;

describe("todayLines", () => {
  it("reads today against the last performed set, in routine order", () => {
    const lines = todayLines({
      order: ["hip", "leg", "row", "lum"],
      logs: [
        { machineId: "hip", weight: "66", reps: "9", repQuality: 3 },
        { machineId: "leg", weight: "120", reps: "6", repQuality: 2 },
        { machineId: "row", weight: "56", outcome: "skipped", skipReason: "machine_occupied" },
        { machineId: "lum", weight: "40" },
      ],
      nameOf,
      priorOf: (id) => ({ hip: { weight: 66, reps: 8 }, leg: { weight: 116, reps: 8 } })[id],
    });
    expect(lines.map((l) => l.outcome)).toEqual(["performed", "performed", "skipped", "skipped"]);
    expect(lines[0]).toMatchObject({ name: "Hip Adduction", loadDelta: 0, countDelta: 1, quality: 3 });
    expect(lines[1]).toMatchObject({ loadDelta: 4, countDelta: -2 });
    expect(lines[2].skipReason).toBe("machine_occupied");
  });

  it("marks a first performance and never compares reps with seconds", () => {
    const lines = todayLines({
      order: ["hip"],
      logs: [{ machineId: "hip", weight: "40", seconds: "60", isTSC: true }],
      nameOf,
      priorOf: () => ({ weight: 40, reps: 8 }),
    });
    expect(lines[0].isTSC).toBe(true);
    expect(lines[0].loadDelta).toBeNull();
    expect(todayLines({ order: ["hip"], logs: [{ machineId: "hip", weight: "40", reps: "8" }], nameOf, priorOf: () => undefined })[0].first).toBe(true);
  });

  it("collapses a two-sided machine into one line", () => {
    const lines = todayLines({
      order: ["torso"],
      logs: [
        { machineId: "torso", weight: "30", reps: "8", side: "Left" },
        { machineId: "torso", weight: "30", reps: "7", side: "Right" },
      ],
      nameOf,
      priorOf: () => undefined,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].count).toBe(8);
  });
});

describe("todayHeadline", () => {
  it("counts what happened, not what did not", () => {
    const lines = todayLines({
      order: ["hip", "leg", "row"],
      logs: [
        { machineId: "hip", weight: "66", reps: "9", repQuality: 3 },
        { machineId: "leg", weight: "120", reps: "6" },
        { machineId: "row", outcome: "practice", weight: "56" },
      ],
      nameOf,
      priorOf: (id) => ({ hip: { weight: 66, reps: 8 }, leg: { weight: 116, reps: 8 } })[id],
    });
    expect(todayHeadline(lines)).toBe("2 of 3 machines · 1 max-strength set · load up on 1 · more reps on 1");
  });
});

describe("strengthJourney", () => {
  const rows = [
    { machineId: "hip", name: "Hip Adduction", group: "Lower Body", startWeight: 40, nowWeight: 66, sessions: 8, startDate: "2026-07-01" },
    { machineId: "leg", name: "Leg Press", group: "Lower Body", startWeight: 100, nowWeight: 120, sessions: 8, startDate: "2026-07-01" },
    { machineId: "row", name: "Compound Row", group: "Pull", startWeight: 50, nowWeight: 56, sessions: 6, startDate: "2026-07-15" },
    { machineId: "lat", name: "Pulldown", group: "Pull", startWeight: 60, nowWeight: 60, sessions: 5 },
    { machineId: "new", name: "Lumbar", group: "Core", startWeight: 36, nowWeight: 40, sessions: 2 },
  ];

  it("needs three machines with three sessions each before it speaks", () => {
    expect(strengthJourney(rows.slice(0, 2)).enough).toBe(false);
    expect(journeySentence(strengthJourney(rows.slice(0, 2)), "Judy")).toMatch(/Not enough history yet/);
  });

  it("reads the load change across machines, the strongest group, and the standout", () => {
    const read = strengthJourney(rows);
    expect(read.machines).toBe(4); // Lumbar has only 2 sessions
    expect(read.pct).toBe(21); // 250 -> 302
    expect(read.byGroup[0]).toMatchObject({ group: "Lower Body", pct: 33 });
    expect(read.standout?.name).toBe("Hip Adduction");
    expect(read.since).toBe("2026-07-01");
    expect(journeySentence(read, "Judy")).toBe(
      "Judy's working loads are up 21% since Jul 1, 2026 across 4 machines. Strongest trend: lower body, up 33%.",
    );
  });
});

describe("nextBookingFor", () => {
  const now = new Date("2026-09-13T18:30:00Z").getTime();
  it("picks the soonest future booking that is still on the books", () => {
    const next = nextBookingFor(
      "c1",
      [
        { clientId: "c1", startTime: new Date("2026-09-13T14:00:00Z"), status: "Completed" },
        { clientId: "c1", startTime: new Date("2026-09-20T14:00:00Z"), status: "Scheduled" },
        { clientId: "c1", startTime: new Date("2026-09-16T14:00:00Z"), status: "Scheduled" },
        { clientId: "c1", startTime: new Date("2026-09-15T14:00:00Z"), status: "Cancelled" },
        { clientId: "c2", startTime: new Date("2026-09-14T14:00:00Z"), status: "Scheduled" },
      ],
      now,
    );
    expect(next?.at.toISOString()).toBe("2026-09-16T14:00:00.000Z");
  });
  it("returns null when nothing is booked", () => {
    expect(nextBookingFor("c1", [], now)).toBeNull();
  });
  it("formats relative to today", () => {
    const today = new Date(2026, 8, 13, 9, 0);
    expect(formatNextBooking(new Date(2026, 8, 13, 14, 0), today)).toMatch(/^Today · /);
    expect(formatNextBooking(new Date(2026, 8, 14, 14, 0), today)).toMatch(/^Tomorrow · /);
    expect(formatNextBooking(new Date(2026, 8, 16, 14, 0), today)).toMatch(/^Wed, Sep 16 · /);
  });
});
