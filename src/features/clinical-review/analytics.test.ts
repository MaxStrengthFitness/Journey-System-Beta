import { describe, it, expect } from "vitest";
import type { ExerciseLog, WorkoutSession } from "../../types";
import { buildFacts, daysBetween, factsInRange, hourInZone, toIsoDay, tutOf } from "./facts";
import {
  DIMENSION_BY_KEY,
  OUTCOME_BY_KEY,
  correlate,
  correlationMatrix,
  detectPlateaus,
  formHeatmap,
  restBucket,
  summarize,
  timeBucket,
  weeklyTrend,
  weekStartOf,
  withBaselines,
  compact,
} from "./analytics";
import { correlationInsights, coverageInsights, plateauInsights, rankInsights } from "./insights";

/* ------------------------------------------------------------------ *
 * Fixture: 24 sessions, twice a week, with patterns planted on purpose:
 *  - poor sleep sessions carry far more poor-quality sets
 *  - Leg Press sits at 116 lb for the last 6 sessions with flat reps
 *  - Lumbar progresses 40 → 50 lb
 *  - one 21-day layoff in the middle
 * ------------------------------------------------------------------ */

const day = (offset: number): string => {
  const d = new Date(2026, 5, 1); // Jun 1 2026 (local)
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function fixture() {
  const sessions: WorkoutSession[] = [];
  const logs: ExerciseLog[] = [];
  let offset = 0;
  for (let i = 0; i < 24; i++) {
    if (i === 12) offset += 21; // the layoff
    const date = day(offset);
    offset += i % 2 === 0 ? 3 : 4; // Mon / Thu rhythm
    const poorSleep = i % 4 === 1; // every fourth session
    const id = `s${i}`;
    // 8am / 3pm New York in June (EDT = UTC−4), as instants.
    const start = new Date(`${date}T${i % 3 === 0 ? "12" : "19"}:00:00Z`);
    sessions.push({
      id,
      clientId: "c1",
      hostedAtStudioId: "solon",
      clientHomeStudioId: "solon",
      isCrossTrain: false,
      sessionType: "Standard",
      sessionNumber: i + 1,
      date,
      trainerInitials: i % 5 === 0 ? "MP" : "AJ",
      trainerId: i % 5 === 0 ? "t-mp" : "t-aj",
      status: "Completed",
      startTime: start,
      endTime: new Date(start.getTime() + 28 * 60_000),
      preSessionCheckIn: { sleepQuality: poorSleep ? "poor" : "optimal", stressLevel: poorSleep ? 4 : 2 },
      clientFeel: poorSleep ? "Wiped Out" : "Good",
    } as WorkoutSession);

    // Leg Press: 100 → 116 over the first 18 sessions, then flat at 116, reps flat at 8.
    const legWeight = i < 18 ? 100 + Math.floor(i / 3) * 2 + (i >= 15 ? 4 : 0) : 116;
    const lp = i >= 18 ? 116 : legWeight;
    logs.push({
      id: `l${i}-lp`,
      sessionId: id,
      machineId: "leg-press",
      weight: String(lp),
      reps: "8",
      repQuality: poorSleep ? 1 : i % 3 === 0 ? 3 : 2,
      totalTimeUnderLoad: 90,
    } as ExerciseLog);
    // Lumbar: progresses 40 → 50.
    logs.push({
      id: `l${i}-lum`,
      sessionId: id,
      machineId: "lumbar",
      weight: String(40 + Math.floor(i / 6) * 2 + (i >= 20 ? 2 : 0)),
      reps: String(8 + (i % 3)),
      repQuality: poorSleep ? 1 : 2,
    } as ExerciseLog);
    // Hip Adduction: a timed static contraction, poor quality often.
    logs.push({
      id: `l${i}-hip`,
      sessionId: id,
      machineId: "hip-adduction",
      weight: "66",
      seconds: "60",
      isTSC: true,
      repQuality: i % 2 === 0 ? 1 : 2,
    } as ExerciseLog);
  }
  // An in-progress session must be ignored.
  sessions.push({ id: "live", clientId: "c1", status: "In-Progress", date: day(200), sessionNumber: 99 } as WorkoutSession);
  return { sessions, logs };
}

const names = { machineName: (id: string) => id, machineGroup: (id: string) => (id === "lumbar" ? "Core & Spine" : "Lower Body") };

/* ------------------------------------------------------------------ */

describe("facts", () => {
  it("normalises dates and hours", () => {
    expect(toIsoDay("9/2/2026")).toBe("2026-09-02");
    expect(toIsoDay("2026-9-2 10:30")).toBe("2026-09-02");
    expect(daysBetween("2026-09-01", "2026-09-15")).toBe(14);
    expect(hourInZone(new Date("2026-09-05T13:30:00Z").getTime(), "America/New_York")).toBe(9);
  });

  it("builds one row per completed session with rest days, hours and quality counts", () => {
    const { sessions, logs } = fixture();
    const { facts, sets } = buildFacts(sessions, logs, [], { timeZone: "America/New_York" });
    expect(facts).toHaveLength(24);
    expect(sets).toHaveLength(72);
    expect(facts[0].restDays).toBeNull();
    expect(facts[1].restDays).toBe(3);
    expect(facts[12].restDays).toBe(25); // 4 + 21 day layoff
    expect(facts[0].hour).toBe(8);
    expect(facts[1].hour).toBe(15);
    expect(facts[0].sets).toBe(3);
    expect(facts[0].setsRated).toBe(3);
    expect(facts[0].tonnage).toBe(100 * 8 + 40 * 8); // TSC set contributes no tonnage
    expect(facts[0].tutSeconds).toBe(90 + 60); // explicit TUT + TSC seconds
    expect(facts[0].setsWithTut).toBe(2);
    expect(facts[1].sleep).toBe("poor");
    expect(facts[1].stress).toBe(4);
    expect(facts[1].postFeel).toBe("Wiped Out");
    expect(facts[0].durationMin).toBe(28);
    expect(facts[0].trainerInitials).toBe("MP");
  });

  it("maps legacy sleep hours into the three buckets and legacy soreness into stiffness", () => {
    const { facts } = buildFacts(
      [
        {
          id: "a",
          status: "Completed",
          date: "2026-01-01",
          preSessionCheckIn: { sleepHours: 5, sorenessRegions: ["Lower back"] },
        } as WorkoutSession,
      ],
      [{ id: "l", sessionId: "a", machineId: "m", weight: "50", reps: "10" } as ExerciseLog],
    );
    expect(facts[0].sleep).toBe("poor");
    expect(facts[0].stiffRegions).toEqual(["Lower back"]);
  });

  it("reads TUT from the fields the app has used over time", () => {
    expect(tutOf({ totalTimeUnderLoad: 75 } as ExerciseLog)).toBe(75);
    expect(tutOf({ isTSC: true, seconds: "45" } as ExerciseLog)).toBe(45);
    expect(tutOf({ reps: "10", averageTimePerRep: 6 } as ExerciseLog)).toBe(60);
    expect(tutOf({ reps: "10" } as ExerciseLog)).toBeNull();
  });

  it("filters facts to a range", () => {
    const { sessions, logs } = fixture();
    const { facts } = buildFacts(sessions, logs);
    const inRange = factsInRange(facts, day(30), day(60));
    expect(inRange.every((f) => f.date >= day(30) && f.date <= day(60))).toBe(true);
    expect(inRange.length).toBeGreaterThan(0);
    expect(inRange.length).toBeLessThan(facts.length);
  });
});

describe("summary", () => {
  it("totals the range and reports coverage", () => {
    const { sessions, logs } = fixture();
    const { facts } = buildFacts(sessions, logs);
    const s = summarize(facts);
    expect(s.sessions).toBe(24);
    expect(s.setsRated).toBe(72);
    expect(s.poorRate).toBeGreaterThan(0.3);
    expect(s.tutCoverage).toBeCloseTo(2 / 3);
    expect(s.checkInCoverage).toBe(1);
    expect(s.longestGapDays).toBe(25);
    expect(s.medianRestDays).toBeGreaterThanOrEqual(3);
    expect(s.sessionsPerWeek).toBeGreaterThan(1);
  });
});

describe("baselines", () => {
  it("indexes tonnage against the trailing mean and leaves the first sessions null", () => {
    const facts = withBaselines(
      [1000, 1000, 1000, 1200, 800].map(
        (t, i) => ({ id: `s${i}`, date: day(i), tonnage: t, reps: 10, tutSeconds: 0, setsRated: 0 }) as any,
      ),
    );
    // Three sessions of history before an index is trusted.
    expect(facts[0].tonnageIndex).toBeNull();
    expect(facts[1].tonnageIndex).toBeNull();
    expect(facts[2].tonnageIndex).toBeNull();
    expect(facts[3].tonnageIndex).toBeCloseTo(20);
    expect(facts[4].tonnageIndex).toBeCloseTo(((800 - 1050) / 1050) * 100);
  });
});

describe("correlate", () => {
  it("finds the planted sleep → poor-quality relationship", () => {
    const { sessions, logs } = fixture();
    const facts = withBaselines(buildFacts(sessions, logs).facts);
    const c = correlate(facts, DIMENSION_BY_KEY.sleep, OUTCOME_BY_KEY.poorRate);
    const poor = c.levels.find((l) => l.level === "poor")!;
    const optimal = c.levels.find((l) => l.level === "optimal")!;
    expect(poor.n).toBe(6);
    expect(optimal.n).toBe(18);
    expect(poor.mean).toBeGreaterThan(optimal.mean!);
    expect(poor.confidence).toBe("solid");
    expect(c.standout?.level).toBe("poor");
    expect(c.spread).toBeGreaterThan(30);
  });

  it("orders levels by the dimension's order and marks thin levels insufficient", () => {
    const facts = withBaselines(
      [
        { sleep: "optimal", setsRated: 10, setsPoor: 1 },
        { sleep: "poor", setsRated: 10, setsPoor: 6 },
        { sleep: "average", setsRated: 10, setsPoor: 2 },
        { sleep: "average", setsRated: 10, setsPoor: 3 },
        { sleep: "average", setsRated: 10, setsPoor: 2 },
      ].map((x, i) => ({ id: `s${i}`, date: day(i), tonnage: 0, reps: 0, tutSeconds: 0, stiffRegions: [], primeRegions: [], ...x }) as any),
    );
    const c = correlate(facts, DIMENSION_BY_KEY.sleep, OUTCOME_BY_KEY.poorRate);
    expect(c.levels.map((l) => l.level)).toEqual(["poor", "average", "optimal"]);
    expect(c.levels[0].confidence).toBe("insufficient");
    expect(c.levels[1].confidence).toBe("early");
    // Only early/solid levels can be the standout.
    expect(c.standout?.level).toBe("average");
  });

  it("builds a matrix only where there is something to compare", () => {
    const { sessions, logs } = fixture();
    const facts = withBaselines(buildFacts(sessions, logs).facts);
    const matrix = correlationMatrix(facts);
    expect(matrix.length).toBeGreaterThan(5);
    // Energy and mood were never captured in this fixture → no correlations for them.
    expect(matrix.some((c) => c.dimension === "energy")).toBe(false);
    expect(matrix.some((c) => c.dimension === "restGap")).toBe(true);
    expect(matrix.some((c) => c.dimension === "timeOfDay")).toBe(true);
  });

  it("buckets rest gaps and hours the way the trainer talks about them", () => {
    expect(restBucket(1)).toBe("1");
    expect(restBucket(4)).toBe("3-4");
    expect(restBucket(10)).toBe("8-14");
    expect(restBucket(21)).toBe("15+");
    expect(restBucket(null)).toBeNull();
    expect(timeBucket(8)).toBe("morning");
    expect(timeBucket(12)).toBe("midday");
    expect(timeBucket(15)).toBe("afternoon");
    expect(timeBucket(18)).toBe("evening");
  });
});

describe("weeklyTrend", () => {
  it("fills empty weeks so a layoff shows as a gap", () => {
    const { sessions, logs } = fixture();
    const weeks = weeklyTrend(buildFacts(sessions, logs).facts);
    expect(weeks.some((w) => w.sessions === 0)).toBe(true);
    expect(weeks[0].weekStart).toBe(weekStartOf(day(0)));
    const total = weeks.reduce((a, w) => a + w.sessions, 0);
    expect(total).toBe(24);
  });
});

describe("formHeatmap", () => {
  it("ranks the worst machine first and rolls up by group", () => {
    const { sessions, logs } = fixture();
    const { sets } = buildFacts(sessions, logs);
    const heat = formHeatmap(sets, { period: "month", ...names });
    expect(heat.rows[0].machineId).toBe("hip-adduction"); // 50% poor by construction
    expect(heat.rows[0].total.rate).toBeCloseTo(0.5);
    expect(heat.columns.length).toBeGreaterThanOrEqual(3);
    expect(heat.groups.map((g) => g.group)).toContain("Core & Spine");
    expect(heat.maxRate).toBeGreaterThan(0);
  });

  it("drops machines with too few rated sets", () => {
    const heat = formHeatmap(
      [{ sessionId: "a", date: "2026-01-01", dayMs: 0, machineId: "x", weight: 1, reps: 1, seconds: null, isTSC: false, quality: 1, tutSeconds: null }],
      { period: "week", ...names },
    );
    expect(heat.rows).toHaveLength(0);
  });
});

describe("detectPlateaus", () => {
  it("flags the machine that stalled and clears the one that progressed", () => {
    const { sessions, logs } = fixture();
    const { sets } = buildFacts(sessions, logs);
    const recent = sets.filter((s) => s.date >= day(70)); // the back half of the range
    const result = detectPlateaus(recent, names);
    const lp = result.find((p) => p.machineId === "leg-press")!;
    const lum = result.find((p) => p.machineId === "lumbar")!;
    // Over this window Leg Press still rose 108 → 116, so the RANGE verdict is
    // "progressing" — but it has been parked at 116 for six sessions, which
    // is the stall flag a trainer needs to see today.
    expect(lp.status).toBe("progressing");
    expect(lp.stalled).toBe(true);
    expect(lp.sessionsAtCurrentWeight).toBe(6);
    expect(lp.lastWeight).toBe(116);
    expect(lum.status).toBe("progressing");
    expect(lum.stalled).toBe(false); // four flat sessions is not yet a stall
    expect(lum.weightChangePct).toBeGreaterThan(0);
    // The static hold never changed load or time: a true range plateau, and
    // it sorts first; the stall comes next, clean progress last.
    const hip = result.find((p) => p.machineId === "hip-adduction")!;
    expect(hip.status).toBe("plateau");
    expect(hip.isTSC).toBe(true);
    expect(result.map((p) => p.machineId)).toEqual(["hip-adduction", "leg-press", "lumbar"]);

    // Narrow the window to the flat stretch and it becomes a true plateau.
    const flat = detectPlateaus(sets.filter((s) => s.date >= day(84)), names).find((p) => p.machineId === "leg-press")!;
    expect(flat.status).toBe("plateau");
    expect(flat.weightChangePct).toBe(0);
  });

  it("calls a load drop a regression and a thin history insufficient", () => {
    const mk = (i: number, w: number, reps = 8) => ({
      sessionId: `s${i}`,
      date: day(i * 3),
      dayMs: i,
      machineId: "m",
      weight: w,
      reps,
      seconds: null,
      isTSC: false,
      quality: 2 as const,
      tutSeconds: null,
    });
    expect(detectPlateaus([mk(0, 100), mk(1, 100), mk(2, 96), mk(3, 96)], names)[0].status).toBe("regressing");
    expect(detectPlateaus([mk(0, 100), mk(1, 100)], names)[0].status).toBe("insufficient");
    // Same load but +2 reps counts as progress.
    expect(detectPlateaus([mk(0, 100, 6), mk(1, 100, 7), mk(2, 100, 8), mk(3, 100, 8)], names)[0].status).toBe("progressing");
  });
});

describe("insights", () => {
  it("writes a sleep insight and a plateau insight from the fixture, ranked", () => {
    const { sessions, logs } = fixture();
    const built = buildFacts(sessions, logs);
    const facts = withBaselines(built.facts);
    const corr = correlationInsights(correlationMatrix(facts), "Judy");
    const sleep = corr.find((i) => i.dimension === "sleep" && i.outcome === "poorRate");
    expect(sleep).toBeDefined();
    expect(sleep!.title).toMatch(/sleep is poor/i);
    expect(sleep!.tone).toBe("notable");
    expect(sleep!.evidence).toMatch(/6 of 24 sessions/);

    const plateaus = plateauInsights(detectPlateaus(built.sets.filter((s) => s.date >= day(70)), names));
    const lp = plateaus.find((p) => p.machineId === "leg-press")!;
    expect(lp).toBeDefined();
    expect(lp.title).toMatch(/116 lb for 6 sessions/);
    expect(lp.body).toMatch(/reps flat at 8/);
    const hip = plateaus.find((p) => p.machineId === "hip-adduction")!;
    expect(hip.body).toMatch(/hold flat at 60s/);

    const ranked = rankInsights([...corr, ...plateaus], 5);
    expect(ranked).toHaveLength(5);
    // Breadth first: the top list never shows the same subject twice while
    // other subjects are waiting.
    const subjects = ranked.map((i) => i.dimension ?? i.machineId ?? i.kind);
    expect(new Set(subjects).size).toBe(subjects.length);
  });

  it("never claims what is not captured", () => {
    const summary = summarize([
      { sets: 10, setsWithTut: 1, setsRated: 10, setsMax: 1, setsDone: 8, setsPoor: 1, tonnage: 100, reps: 10, tutSeconds: 0, restDays: null, date: "2026-01-01", stiffRegions: [], primeRegions: [] },
      { sets: 10, setsWithTut: 0, setsRated: 10, setsMax: 1, setsDone: 8, setsPoor: 1, tonnage: 100, reps: 10, tutSeconds: 0, restDays: 3, date: "2026-01-04", stiffRegions: [], primeRegions: [] },
      { sets: 10, setsWithTut: 0, setsRated: 10, setsMax: 1, setsDone: 8, setsPoor: 1, tonnage: 100, reps: 10, tutSeconds: 0, restDays: 3, date: "2026-01-07", stiffRegions: [], primeRegions: [] },
    ] as any);
    const cov = coverageInsights(summary);
    expect(cov.some((i) => i.id === "coverage:tut")).toBe(true);
    expect(cov.some((i) => i.id === "coverage:checkin")).toBe(true);
  });
});

describe("formatting", () => {
  it("compacts numbers the way a stat tile wants them", () => {
    expect(compact(950)).toBe("950");
    expect(compact(1284)).toBe("1.3K");
    expect(compact(111050)).toBe("111K");
    expect(compact(2_400_000)).toBe("2.4M");
  });
});
