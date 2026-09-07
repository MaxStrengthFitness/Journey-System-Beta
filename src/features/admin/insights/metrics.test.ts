import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../../types";
import {
  IMPLAUSIBLE_SESSION_MINUTES,
  LOW_COMPLETION_RATE,
  MIN_SESSIONS_FOR_STUDIO_CLAIM,
  MIN_SESSIONS_FOR_TRAINER_CLAIM,
  activeMinutes,
  hasFeel,
  hasNote,
  median,
  millis,
  observations,
  returnRate,
  sessionDay,
  studioSummary,
  trainerKeyOf,
  trainerMetrics,
} from "./metrics";

const DAY = 86_400_000;
const T0 = Date.parse("2026-08-01T09:00:00.000Z");

function session(over: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    hostedAtStudioId: "s1",
    clientHomeStudioId: "s1",
    isCrossTrain: false,
    sessionType: "Standard" as WorkoutSession["sessionType"],
    sessionNumber: 5,
    date: "2026-08-01",
    trainerInitials: "MA",
    trainerId: "t-marina",
    clientId: "c1",
    status: "Completed",
    createdAt: T0,
    ...over,
  } as WorkoutSession;
}

/** n sessions for one trainer, each on its own day and its own client. */
function run(n: number, over: Partial<WorkoutSession> = {}): WorkoutSession[] {
  return Array.from({ length: n }, (_, i) =>
    session({ clientId: `c${i}`, createdAt: T0 + i * DAY, ...over }),
  );
}

describe("millis", () => {
  it("reads a Firestore Timestamp, a Date, a number and an ISO string", () => {
    expect(millis({ toMillis: () => 5 })).toBe(5);
    expect(millis({ toDate: () => new Date(7) })).toBe(7);
    expect(millis(new Date(9))).toBe(9);
    expect(millis(11)).toBe(11);
    expect(millis("2026-08-01T09:00:00.000Z")).toBe(T0);
  });

  it("is null for absent or unparseable values, never zero", () => {
    // Zero would be 1970, which sorts and averages as a real moment.
    expect(millis(undefined)).toBeNull();
    expect(millis(null)).toBeNull();
    expect(millis("")).toBeNull();
    expect(millis("sometime tuesday")).toBeNull();
  });
});

describe("activeMinutes", () => {
  it("measures end minus start", () => {
    expect(
      activeMinutes(session({ startTime: T0, endTime: T0 + 45 * 60_000 })),
    ).toBe(45);
  });

  it("subtracts paused time", () => {
    expect(
      activeMinutes(
        session({
          startTime: T0,
          endTime: T0 + 60 * 60_000,
          totalPausedMs: 15 * 60_000,
        }),
      ),
    ).toBe(45);
  });

  it("falls back to the client clock while the server stamp is pending", () => {
    expect(
      activeMinutes(
        session({
          startTime: undefined,
          clientStartTime: new Date(T0).toISOString(),
          endTime: T0 + 30 * 60_000,
        }),
      ),
    ).toBe(30);
  });

  it("is null for a session that was never closed out", () => {
    // Not zero: averaging a zero in would drag the median toward a duration
    // no session ever took.
    expect(activeMinutes(session({ startTime: T0 }))).toBeNull();
  });

  it("is null for a session left running overnight", () => {
    expect(
      activeMinutes(
        session({
          startTime: T0,
          endTime: T0 + (IMPLAUSIBLE_SESSION_MINUTES + 60) * 60_000,
        }),
      ),
    ).toBeNull();
  });

  it("is null when the clock ran backwards", () => {
    expect(activeMinutes(session({ startTime: T0, endTime: T0 - 1000 }))).toBeNull();
  });

  it("ignores a negative paused total rather than inflating the length", () => {
    expect(
      activeMinutes(
        session({ startTime: T0, endTime: T0 + 30 * 60_000, totalPausedMs: -600_000 }),
      ),
    ).toBe(30);
  });
});

describe("sessionDay / trainerKeyOf / hasNote / hasFeel", () => {
  it("prefers the stored date string", () => {
    expect(sessionDay(session({ date: "2026-08-14" }))).toBe("2026-08-14");
  });

  it("falls back to the created timestamp", () => {
    expect(sessionDay(session({ date: "", createdAt: T0 }))).toBe("2026-08-01");
  });

  it("is null when there is no date at all", () => {
    expect(sessionDay(session({ date: "", createdAt: undefined }))).toBeNull();
  });

  it("keys on trainerId, falling back to initials", () => {
    expect(trainerKeyOf(session())).toBe("t-marina");
    expect(trainerKeyOf(session({ trainerId: undefined }))).toBe("initials:MA");
    expect(
      trainerKeyOf(session({ trainerId: undefined, trainerInitials: "" })),
    ).toBeNull();
  });

  it("does not count a whitespace note as a note", () => {
    expect(hasNote(session({ notes: "   " }))).toBe(false);
    expect(hasNote(session({ notes: "tight hamstrings" }))).toBe(true);
  });

  it("counts either feel field", () => {
    expect(hasFeel(session())).toBe(false);
    expect(hasFeel(session({ clientFeel: "Good" }))).toBe(true);
    expect(
      hasFeel(session({ postFeel: { physical: 3, mental: 4 } })),
    ).toBe(true);
  });
});

describe("median", () => {
  it("handles odd and even counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it("is null for nothing", () => {
    expect(median([])).toBeNull();
  });

  it("does not mutate its input", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
});

describe("trainerMetrics", () => {
  it("splits sessions by trainer and counts distinct clients", () => {
    const rows = trainerMetrics([
      session({ trainerId: "a", clientId: "c1" }),
      session({ trainerId: "a", clientId: "c1" }),
      session({ trainerId: "a", clientId: "c2" }),
      session({ trainerId: "b", clientId: "c3" }),
    ]);
    expect(rows.map((r) => r.trainerKey)).toEqual(["a", "b"]);
    expect(rows[0].sessions).toBe(3);
    expect(rows[0].clients).toBe(2);
  });

  it("counts an unclosed session against completion", () => {
    const rows = trainerMetrics([
      session({ status: "Completed" }),
      session({ status: "In-Progress" }),
    ]);
    expect(rows[0].completed).toBe(1);
    expect(rows[0].unclosed).toBe(1);
    expect(rows[0].completionRate).toBe(0.5);
  });

  it("counts machine variety across sessions, not within one", () => {
    const rows = trainerMetrics([
      session({ sessionMachineIds: ["m1", "m2"] }),
      session({ sessionMachineIds: ["m2", "m3"] }),
    ]);
    expect(rows[0].machineVariety).toBe(3);
    expect(rows[0].medianMachinesPerSession).toBe(2);
  });

  it("uses the supplied name, and says so plainly when it has none", () => {
    const rows = trainerMetrics([session({ trainerId: "a" })], { a: "Marina" });
    expect(rows[0].label).toBe("Marina");
    expect(trainerMetrics([session({ trainerId: "z" })])[0].label).toBe(
      "Unnamed trainer",
    );
  });

  it("shows initials when that is all the session carried", () => {
    const rows = trainerMetrics([
      session({ trainerId: undefined, trainerInitials: "GV" }),
    ]);
    expect(rows[0].label).toBe("GV");
  });

  it("skips sessions with no trainer at all rather than inventing one", () => {
    const rows = trainerMetrics([
      session({ trainerId: undefined, trainerInitials: "" }),
      session({ trainerId: "a" }),
    ]);
    expect(rows).toHaveLength(1);
  });

  it("computes load share against the whole window", () => {
    const rows = trainerMetrics([
      ...run(3, { trainerId: "a" }),
      ...run(1, { trainerId: "b" }),
    ]);
    expect(rows[0].loadShare).toBe(0.75);
  });

  it("will not judge a trainer below the sample threshold", () => {
    const few = trainerMetrics(run(MIN_SESSIONS_FOR_TRAINER_CLAIM - 1));
    expect(few[0].enoughToJudge).toBe(false);
    const enough = trainerMetrics(run(MIN_SESSIONS_FOR_TRAINER_CLAIM));
    expect(enough[0].enoughToJudge).toBe(true);
  });

  it("orders by volume, then by name so ties do not shuffle", () => {
    const rows = trainerMetrics(
      [session({ trainerId: "z" }), session({ trainerId: "a" })],
      { z: "Zoe", a: "Ana" },
    );
    expect(rows.map((r) => r.label)).toEqual(["Ana", "Zoe"]);
  });
});

describe("studioSummary", () => {
  it("counts distinct clients and first-timers", () => {
    const s = studioSummary([
      session({ clientId: "c1", sessionNumber: 1 }),
      session({ clientId: "c1", sessionNumber: 2 }),
      session({ clientId: "c2", sessionNumber: 1 }),
    ]);
    expect(s.clients).toBe(2);
    expect(s.newClients).toBe(2);
  });

  it("ranks the busiest days", () => {
    const s = studioSummary([
      session({ date: "2026-08-01" }),
      session({ date: "2026-08-02" }),
      session({ date: "2026-08-02" }),
    ]);
    expect(s.busiestDays[0]).toEqual({ day: "2026-08-02", sessions: 2 });
    expect(s.activeDays).toBe(2);
  });

  it("is all zeroes and judges nothing for an empty window", () => {
    const s = studioSummary([]);
    expect(s.sessions).toBe(0);
    expect(s.completionRate).toBe(0);
    expect(s.medianMinutes).toBeNull();
    expect(s.enoughToJudge).toBe(false);
  });

  it("needs a real sample before it will speak", () => {
    expect(studioSummary(run(MIN_SESSIONS_FOR_STUDIO_CLAIM - 1)).enoughToJudge).toBe(
      false,
    );
    expect(studioSummary(run(MIN_SESSIONS_FOR_STUDIO_CLAIM)).enoughToJudge).toBe(
      true,
    );
  });
});

describe("returnRate", () => {
  const start = T0;
  const end = T0 + 40 * DAY;

  it("counts a client who trained in both halves as returned", () => {
    const r = returnRate(
      [
        session({ clientId: "c1", createdAt: start + 1 * DAY }),
        session({ clientId: "c1", createdAt: start + 30 * DAY }),
        session({ clientId: "c2", createdAt: start + 2 * DAY }),
      ],
      start,
      end,
    );
    expect(r).toEqual({ eligible: 2, returned: 1, rate: 0.5 });
  });

  it("is null when nobody trained in the first half", () => {
    expect(
      returnRate([session({ createdAt: start + 35 * DAY })], start, end),
    ).toBeNull();
  });

  it("does not count a second visit in the same half as a return", () => {
    const r = returnRate(
      [
        session({ clientId: "c1", createdAt: start + 1 * DAY }),
        session({ clientId: "c1", createdAt: start + 2 * DAY }),
      ],
      start,
      end,
    );
    expect(r?.returned).toBe(0);
  });
});

describe("observations", () => {
  const names = { a: "Marina", b: "Giovanni" };

  function build(sessions: WorkoutSession[]) {
    const summary = studioSummary(sessions);
    return observations(
      summary,
      trainerMetrics(sessions, names),
      returnRate(sessions, T0, T0 + 40 * DAY),
    );
  }

  it("says nothing at all about too small a window", () => {
    // The most important behaviour here: silence beats a confident wrong call.
    expect(build(run(5))).toEqual([]);
  });

  it("raises unclosed sessions as a problem", () => {
    const sessions = [
      ...run(20, { trainerId: "a", status: "In-Progress" }),
      ...run(20, { trainerId: "b", status: "Completed", notes: "n" }),
    ];
    const found = build(sessions).find((o) => o.id === "studio-completion");
    expect(found?.tone).toBe("problem");
    expect(found?.text).toContain("20 of 40");
  });

  it("does not raise completion when the floor is closing out properly", () => {
    const sessions = run(40, { trainerId: "a", notes: "n" });
    expect(build(sessions).some((o) => o.id === "studio-completion")).toBe(false);
  });

  it("calls out a lopsided floor, but only with more than one trainer", () => {
    const lopsided = [
      ...run(30, { trainerId: "a", notes: "n" }),
      ...run(5, { trainerId: "b", notes: "n" }),
    ];
    expect(build(lopsided).some((o) => o.id === "load-lopsided")).toBe(true);

    const solo = run(30, { trainerId: "a", notes: "n" });
    expect(build(solo).some((o) => o.id === "load-lopsided")).toBe(false);
  });

  it("flags a trainer who writes nothing down", () => {
    const sessions = [
      ...run(20, { trainerId: "a", notes: "" }),
      ...run(20, { trainerId: "b", notes: "solid form today" }),
    ];
    const found = build(sessions).find((o) => o.id === "trainer-no-notes-a");
    expect(found?.text).toContain("Marina");
    expect(found?.text).toContain("no notes at all");
  });

  it("will not accuse a trainer who has barely worked", () => {
    // Marina has 4 unclosed of 4 — but four sessions is a quiet week.
    const sessions = [
      ...run(4, { trainerId: "a", status: "In-Progress" }),
      ...run(40, { trainerId: "b", notes: "n" }),
    ];
    const ids = build(sessions).map((o) => o.id);
    expect(ids).not.toContain("trainer-completion-a");
    expect(ids).not.toContain("trainer-no-notes-a");
  });

  it("puts problems above things to watch, and good news last", () => {
    const sessions = [
      ...run(20, { trainerId: "a", status: "In-Progress" }),
      ...run(20, { trainerId: "b", status: "Completed" }),
    ];
    const tones = build(sessions).map((o) => o.tone);
    expect(tones[0]).toBe("problem");
    expect(tones).toEqual([...tones].sort((x, y) => {
      const r = { problem: 0, watch: 1, neutral: 2, good: 3 } as const;
      return r[x] - r[y];
    }));
  });

  it("congratulates a clean floor rather than staying silent", () => {
    const sessions = run(40, { trainerId: "a", notes: "n" });
    expect(build(sessions).some((o) => o.id === "completion-good")).toBe(true);
  });

  it("uses the threshold constant rather than a magic number", () => {
    // A floor sitting exactly on the line is not a problem.
    const total = 100;
    const unclosed = Math.round(total * (1 - LOW_COMPLETION_RATE));
    const sessions = [
      ...run(unclosed, { trainerId: "b", status: "In-Progress" }),
      ...run(total - unclosed, { trainerId: "a", notes: "n" }),
    ];
    expect(build(sessions).some((o) => o.id === "studio-completion")).toBe(false);
  });
});
