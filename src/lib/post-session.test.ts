import { describe, expect, it } from "vitest";
import {
  ANOTHER_STUDIO,
  doseSentence,
  formatNextBooking,
  journeySentence,
  nextBookingAnswer,
  nextBookingFor,
  nextBookingSentence,
  strengthJourney,
  timesDoor,
  todayHeadline,
  todayLines,
} from "./post-session";
import { BACK_FROM_DAYS } from "../features/openings/back-from";
import { CHECK_DAYS } from "../features/standing-week/check";

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

  it("counts new machines only when Journey holds the client's whole story", () => {
    const lines = todayLines({
      order: ["hip", "leg"],
      logs: [
        { machineId: "hip", weight: "40", reps: "8" },
        { machineId: "leg", weight: "120", reps: "6" },
      ],
      nameOf,
      priorOf: () => undefined,
    });
    expect(todayHeadline(lines, "complete")).toBe("2 of 2 machines · 2 new machines");
    // A migration client's machines are empty because FileMaker's are not here.
    expect(todayHeadline(lines, "partial")).toBe("2 of 2 machines");
    expect(todayHeadline(lines, "unknown")).toBe("2 of 2 machines");
    expect(todayHeadline(lines)).toBe("2 of 2 machines");
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

/*
 * THE NEXT CARD (Openings round, Sep 27 2026, phase 8): the schedule already
 * on screen answers at once; otherwise her own bookings, and only the
 * server's answer is one. Never a plain "Nothing booked yet".
 */
describe("nextBookingAnswer", () => {
  const now = new Date("2026-11-09T17:00:00Z").getTime(); // Mon Nov 9, noon Eastern
  const at = (iso: string) => new Date(iso);
  const here = (iso: string, over: Record<string, unknown> = {}) => ({ clientId: "c1", startTime: at(iso), status: "Scheduled", studioId: "westlake", ...over });
  const names: Record<string, string> = { westlake: "Westlake", strongsville: "Strongsville" };
  const base = {
    clientId: "c1",
    loaded: [] as ReturnType<typeof here>[],
    heard: [] as ReturnType<typeof here>[],
    read: "ready" as const,
    monthRead: true as boolean | null,
    hereStudioId: "westlake",
    studioName: (id: string) => names[id] ?? null,
    linked: true,
    now,
  };

  it("answers at once from the schedule on screen, whatever her own read says", () => {
    const a = nextBookingAnswer({ ...base, loaded: [here("2026-11-10T13:00:00Z")], read: "loading" });
    expect(a).toEqual({ state: "booked", at: at("2026-11-10T13:00:00Z"), elsewhere: null });
  });

  it("says it is checking while her bookings haven't come back", () => {
    expect(nextBookingAnswer({ ...base, read: "loading" })).toEqual({ state: "checking" });
  });

  it("can't check offline, on a failed read, or on this iPad's cache alone, even with a booking in it", () => {
    for (const read of ["offline", "failed"] as const) {
      expect(nextBookingAnswer({ ...base, read, heard: [here("2026-11-12T13:00:00Z")] })).toEqual({ state: "cant-check" });
    }
  });

  it("finds a booking ten days out, beyond the schedule on screen", () => {
    const a = nextBookingAnswer({ ...base, heard: [here("2026-11-19T13:00:00Z")] });
    expect(a).toEqual({ state: "booked", at: at("2026-11-19T13:00:00Z"), elsewhere: null });
  });

  it("names another studio on the same Mindbody, and an unknown one as 'another studio'", () => {
    expect(nextBookingAnswer({ ...base, heard: [here("2026-11-12T13:00:00Z", { studioId: "strongsville" })] })).toMatchObject({
      state: "booked",
      elsewhere: "Strongsville",
    });
    expect(nextBookingAnswer({ ...base, heard: [here("2026-11-12T13:00:00Z", { studioId: "elsewhere" })] })).toMatchObject({
      elsewhere: ANOTHER_STUDIO,
    });
    // Without knowing where the iPad is, it claims nothing about where.
    expect(nextBookingAnswer({ ...base, hereStudioId: null, heard: [here("2026-11-12T13:00:00Z", { studioId: "strongsville" })] })).toMatchObject({
      elsewhere: null,
    });
  });

  it("drops cancellations and past bookings, and takes the soonest of the rest", () => {
    const a = nextBookingAnswer({
      ...base,
      heard: [
        here("2026-11-09T14:00:00Z"), // this morning: already past
        here("2026-11-10T13:00:00Z", { status: "Cancelled" }),
        here("2026-11-16T13:00:00Z"),
        here("2026-11-12T13:00:00Z", { clientId: "c2" }),
      ],
    });
    expect(a).toEqual({ state: "booked", at: at("2026-11-16T13:00:00Z"), elsewhere: null });
  });

  it("says how far ahead nothing is booked: 30 days once the month was read in full today, 7 otherwise or while unknown", () => {
    expect(nextBookingAnswer({ ...base, monthRead: true })).toEqual({ state: "none", days: BACK_FROM_DAYS });
    expect(nextBookingAnswer({ ...base, monthRead: false })).toEqual({ state: "none", days: CHECK_DAYS });
    expect(nextBookingAnswer({ ...base, monthRead: null })).toEqual({ state: "none", days: CHECK_DAYS });
    expect([BACK_FROM_DAYS, CHECK_DAYS]).toEqual([30, 7]);
  });

  it("at a studio whose bookings aren't linked, never says nothing is booked; a booking it heard of still answers (the final review)", () => {
    expect(nextBookingAnswer({ ...base, linked: false })).toEqual({ state: "cant-check" });
    expect(nextBookingAnswer({ ...base, linked: false, heard: [here("2026-11-12T13:00:00Z", { studioId: "strongsville" })] })).toMatchObject({
      state: "booked",
      elsewhere: "Strongsville",
    });
    expect(nextBookingAnswer({ ...base, linked: false, loaded: [here("2026-11-10T13:00:00Z")] })).toMatchObject({ state: "booked" });
  });
});

describe("nextBookingSentence", () => {
  const today = new Date(2026, 10, 9, 12, 0);

  it("says every state in its own words, and never a plain 'Nothing booked yet'", () => {
    const said = [
      // A real moment: 8:00 AM Eastern on Nov 12 (EST, -05:00). The line is read
      // on the studio's clock, so a local-clock Date would be wrong on any
      // machine not in Eastern time, GitHub's UTC runner included.
      nextBookingSentence({ state: "booked", at: new Date("2026-11-12T08:00:00-05:00"), elsewhere: null }, today),
      nextBookingSentence({ state: "booked", at: new Date("2026-11-12T08:00:00-05:00"), elsewhere: "Strongsville" }, today),
      nextBookingSentence({ state: "checking" }, today),
      nextBookingSentence({ state: "none", days: 30 }, today),
      nextBookingSentence({ state: "none", days: 7 }, today),
      nextBookingSentence({ state: "cant-check" }, today),
    ];
    expect(said).toEqual([
      "Next session: Thu, Nov 12 · 8:00 AM.",
      "Next session: Thu, Nov 12 · 8:00 AM at Strongsville.",
      "Checking the next booking…",
      "Nothing booked in the next 30 days. Book the next one before they leave.",
      "Nothing booked in the next 7 days. Book the next one before they leave.",
      "Can't check the next booking right now.",
    ]);
    for (const s of said) expect(s).not.toMatch(/Nothing booked yet/);
  });
});

describe("timesDoor", () => {
  it("is absent with nothing to offer, prominent only when nothing is booked, quiet otherwise", () => {
    const booked = { state: "booked", at: new Date(), elsewhere: null } as const;
    expect(timesDoor({ state: "none", days: 30 }, false)).toBe("none");
    expect(timesDoor(booked, false)).toBe("none");
    expect(timesDoor({ state: "none", days: 7 }, true)).toBe("prominent");
    expect(timesDoor(booked, true)).toBe("quiet");
    expect(timesDoor({ state: "checking" }, true)).toBe("quiet");
    // Offline is never the prominent door: nothing was confirmed.
    expect(timesDoor({ state: "cant-check" }, true)).toBe("quiet");
  });
});

describe("doseSentence", () => {
  it("says nothing until the dial is tapped", () => {
    expect(doseSentence(null, "Judy")).toBeNull();
    expect(doseSentence(undefined, "Judy")).toBeNull();
  });

  it("repeats the trainer's judgement in words, never a number", () => {
    expect(doseSentence(0, "Judy")).toBe("Judy left just right.");
    expect(doseSentence(-2, "Judy")).toBe("Judy left wiped out — worth a lighter start next time.");
    expect(doseSentence(-1, "Judy")).toBe("Judy left drained — ease off a touch next time.");
    expect(doseSentence(1, "Judy")).toBe("Judy had more in the tank — room to add a little next time.");
    expect(doseSentence(2, "Judy")).toBe("Today barely worked Judy — plenty of room to add next time.");
    for (const d of [-2, -1, 0, 1, 2] as const) expect(doseSentence(d, "Judy")).not.toMatch(/-?\d/);
  });

  it("falls back to 'The client' without a first name", () => {
    expect(doseSentence(0, "")).toBe("The client left just right.");
  });
});
