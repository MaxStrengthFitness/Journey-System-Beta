import { describe, it, expect } from "vitest";
import type { ClinicalIncident, ExerciseLog, WorkoutSession } from "../../types";
import { buildFacts, daysBetween, factsInRange, hourInZone, toIsoDay, tutOf } from "./facts";
import {
  DIMENSION_BY_KEY,
  DIMENSIONS,
  NOT_ENOUGH_SESSIONS,
  OUTCOMES,
  OUTCOME_BY_KEY,
  attendanceRhythm,
  correlate,
  correlationMatrix,
  detectPlateaus,
  dialLevel,
  formHeatmap,
  painTimeline,
  perWeekWords,
  restBucket,
  summarize,
  timeBucket,
  weeklyTrend,
  weekStartOf,
  withBaselines,
  compact,
} from "./analytics";
import { RULE_OF_THREE, type SessionFact } from "./types";
import { correlationInsights, coverageInsights, plateauInsights, rankInsights, rhythmInsights, stallSentence } from "./insights";

/* ------------------------------------------------------------------ *
 * Fixture: 24 sessions, twice a week, with patterns planted on purpose:
 *  - poor sleep sessions carry far more poor-quality sets
 *  - Leg Press sits at 116 lb for the last 6 sessions with flat reps
 *  - Lumbar progresses 40 → 50 lb
 *  - one 21-day layoff in the middle
 *  - the first 18 sessions are LEGACY (sleepQuality / stressLevel /
 *    clientFeel / two-state body regions); the last 6 are DIAL-ERA
 *    (readiness / dose / region dials). Both must land on one axis.
 *  - one clinical incident on the leg press, a legacy sore knee, a legacy
 *    stiff shoulder, and a Dial-era stiff lower back that later reads Better
 * ------------------------------------------------------------------ */

const day = (offset: number): string => {
  const d = new Date(2026, 5, 1); // Jun 1 2026 (local)
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Sessions from this index on were written by the reporting round's screens (the Dial). */
const DIAL_ERA_FROM = 18;

function fixture() {
  const sessions: WorkoutSession[] = [];
  const logs: ExerciseLog[] = [];
  const incidents: ClinicalIncident[] = [];
  let offset = 0;
  for (let i = 0; i < 24; i++) {
    if (i === 12) offset += 21; // the layoff
    const date = day(offset);
    offset += i % 2 === 0 ? 3 : 4; // Mon / Thu rhythm
    const poorSleep = i % 4 === 1; // every fourth session
    const id = `s${i}`;
    // 8am / 3pm New York in June (EDT = UTC−4), as instants.
    const start = new Date(`${date}T${i % 3 === 0 ? "12" : "19"}:00:00Z`);
    const dialEra = i >= DIAL_ERA_FROM;
    const preSessionCheckIn: WorkoutSession["preSessionCheckIn"] = dialEra
      ? {
          readiness: { sleep: poorSleep ? -2 : 1, stress: poorSleep ? -1 : 0, recovery: 0 },
          bodyStates: i === 20 ? [{ region: "Lower back", state: "stiff", dial: -1 }] : i === 22 ? [{ region: "Lower back", state: "prime", dial: 1 }] : undefined,
        }
      : {
          sleepQuality: poorSleep ? "poor" : "optimal",
          stressLevel: poorSleep ? 4 : 2,
          sorenessRegions: i === 4 ? ["Left knee"] : undefined,
          bodyStates: i === 7 ? [{ region: "Right shoulder", state: "stiff" }] : undefined,
        };
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
      preSessionCheckIn,
      ...(dialEra ? { dose: poorSleep ? -2 : 0 } : { clientFeel: poorSleep ? "Wiped Out" : "Good" }),
    } as WorkoutSession);
    if (i === 10) {
      incidents.push({ id: "inc1", clientId: "c1", studioId: "solon", sessionId: id, machineId: "leg-press", region: "Lower back", severity: "mild", description: "twinge", reportedByTrainerId: "t-aj", createdAt: date } as ClinicalIncident);
    }

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
  return { sessions, logs, incidents };
}

/** A bare fact for the pure functions, with every Dial field present and untouched. */
function fact(patch: Partial<SessionFact>): SessionFact {
  return {
    id: "x",
    date: "2026-01-01",
    dayMs: 0,
    startMs: null,
    hour: null,
    dayOfWeek: 1,
    restDays: null,
    durationMin: null,
    trainerKey: null,
    trainerInitials: "AJ",
    isCrossTrain: false,
    readiness: { sleep: null, energy: null, recovery: null, stress: null },
    dose: null,
    regionDials: [],
    sleep: null,
    stress: null,
    energy: null,
    mood: null,
    hydration: null,
    stiffRegions: [],
    primeRegions: [],
    postFeel: null,
    postPhysical: null,
    postMental: null,
    postRpe: null,
    sets: 0,
    setsRated: 0,
    setsMax: 0,
    setsDone: 0,
    setsPoor: 0,
    reps: 0,
    tonnage: 0,
    tutSeconds: 0,
    setsWithTut: 0,
    machineIds: [],
    avgRpe: null,
    symptomCount: 0,
    symptomRegions: [],
    incidentCount: 0,
    incidentMachineIds: [],
    ...patch,
  };
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
    const { sessions, logs, incidents } = fixture();
    const { facts, sets } = buildFacts(sessions, logs, incidents, { timeZone: "America/New_York" });
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
    expect(facts[10].incidentCount).toBe(1);
    expect(facts[10].incidentMachineIds).toEqual(["leg-press"]);
  });

  it("reads legacy sessions and Dial-era sessions onto ONE Dial axis", () => {
    const { sessions, logs } = fixture();
    const { facts } = buildFacts(sessions, logs);
    // Legacy: optimal → +1, poor → −1; stress 2 → 0, 4 → −1; Good → 0, Wiped Out → −2.
    expect(facts[0].readiness).toEqual({ sleep: 1, energy: null, recovery: null, stress: 0 });
    expect(facts[1].readiness).toEqual({ sleep: -1, energy: null, recovery: null, stress: -1 });
    expect(facts[0].dose).toBe(0);
    expect(facts[1].dose).toBe(-2);
    // Dial-era: stored as tapped, recovery present.
    expect(facts[18].readiness).toEqual({ sleep: 1, energy: null, recovery: 0, stress: 0 });
    expect(facts[21].readiness).toEqual({ sleep: -2, energy: null, recovery: 0, stress: -1 });
    expect(facts[21].dose).toBe(-2);
    expect(facts[18].dose).toBe(0);
    // Both eras group the same way.
    expect(dialLevel(facts[1].readiness.sleep)).toBe("below");
    expect(dialLevel(facts[21].readiness.sleep)).toBe("below");
    expect(dialLevel(facts[0].readiness.sleep)).toBe("above");
    expect(dialLevel(facts[18].readiness.sleep)).toBe("above");
    // Regions: legacy soreness → Stiff (−1); legacy stiff → −1; Dial-era as tapped.
    expect(facts[4].regionDials).toEqual([{ region: "Left knee", dial: -1 }]);
    expect(facts[7].regionDials).toEqual([{ region: "Right shoulder", dial: -1 }]);
    expect(facts[20].regionDials).toEqual([{ region: "Lower back", dial: -1 }]);
    expect(facts[22].regionDials).toEqual([{ region: "Lower back", dial: 1 }]);
    expect(facts[20].stiffRegions).toEqual(["Lower back"]);
    expect(facts[22].primeRegions).toEqual(["Lower back"]);
    // The legacy fields are still populated for older readers.
    expect(facts[1].sleep).toBe("poor");
    expect(facts[21].sleep).toBeNull();
  });

  it("never defaults an untouched dial to the centre", () => {
    const { facts } = buildFacts(
      [{ id: "a", status: "Completed", date: "2026-01-01", preSessionCheckIn: { readiness: { sleep: 0 } } } as WorkoutSession],
      [{ id: "l", sessionId: "a", machineId: "m", weight: "50", reps: "10" } as ExerciseLog],
    );
    // An explicit centre tap IS stored; everything untapped is null, never 0.
    expect(facts[0].readiness).toEqual({ sleep: 0, energy: null, recovery: null, stress: null });
    expect(facts[0].dose).toBeNull();
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
    expect(facts[0].readiness.sleep).toBe(-1);
    expect(facts[0].stiffRegions).toEqual(["Lower back"]);
    expect(facts[0].regionDials).toEqual([{ region: "Lower back", dial: -1 }]);
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
  it("finds the planted sleep → poor-quality relationship across both eras, on the Dial", () => {
    const { sessions, logs } = fixture();
    const facts = withBaselines(buildFacts(sessions, logs).facts);
    const c = correlate(facts, DIMENSION_BY_KEY.sleep, OUTCOME_BY_KEY.poorRate);
    const below = c.levels.find((l) => l.level === "below")!;
    const above = c.levels.find((l) => l.level === "above")!;
    // 5 legacy "poor" + 1 Dial-era −2 land on the same level.
    expect(below.n).toBe(6);
    expect(above.n).toBe(18);
    expect(below.label).toBe("Off days");
    expect(above.label).toBe("Up days");
    expect(below.mean).toBeGreaterThan(above.mean!);
    expect(below.confidence).toBe("solid");
    expect(c.standout?.level).toBe("below");
    expect(c.spread).toBeGreaterThan(30);
    // The dose lands the same way: Wiped Out (legacy) and −2 (Dial) together.
    const d = correlate(facts, DIMENSION_BY_KEY.dose, OUTCOME_BY_KEY.poorRate);
    expect(d.levels.find((l) => l.level === "below")!.n).toBe(6);
    expect(d.levels.find((l) => l.level === "centre")!.label).toBe("Just right");
  });

  it("groups the Dial below · centre · above and marks a level under three sessions insufficient", () => {
    const facts = withBaselines(
      [
        { sleep: 1, poor: 1 },
        { sleep: -2, poor: 6 },
        { sleep: 0, poor: 2 },
        { sleep: 0, poor: 3 },
        { sleep: 0, poor: 2 },
        { sleep: 2, poor: 1 },
        { sleep: -1, poor: 5 },
      ].map((x, i) => fact({ id: `s${i}`, date: day(i), setsRated: 10, setsPoor: x.poor, readiness: { sleep: x.sleep as -2 | -1 | 0 | 1 | 2, energy: null, recovery: null, stress: null } })),
    );
    const c = correlate(facts, DIMENSION_BY_KEY.sleep, OUTCOME_BY_KEY.poorRate);
    expect(c.levels.map((l) => l.level)).toEqual(["below", "centre", "above"]);
    expect(c.levels.map((l) => l.n)).toEqual([2, 3, 2]);
    expect(c.levels[0].confidence).toBe("insufficient");
    expect(c.levels[1].confidence).toBe("early");
    expect(c.levels[2].confidence).toBe("insufficient");
    // Only a level that meets the rule of three can be the standout — even
    // though "below" has by far the biggest effect.
    expect(c.standout?.level).toBe("centre");
  });

  it("has no mood, no tonnage and no RPE on the axis any more", () => {
    expect(DIMENSIONS.map((d) => d.key)).not.toContain("mood");
    expect(DIMENSIONS.map((d) => d.key)).not.toContain("postFeel");
    expect(DIMENSIONS.map((d) => d.key)).toEqual(expect.arrayContaining(["sleep", "energy", "recovery", "stress", "dose"]));
    expect(OUTCOMES.map((o) => o.key)).toEqual(["poorRate", "maxRate", "repsIndex", "tutIndex"]);
    expect(RULE_OF_THREE).toBe(3);
    expect(NOT_ENOUGH_SESSIONS).toBe("not enough sessions yet (needs 3)");
  });

  it("builds a matrix only where there is something to compare", () => {
    const { sessions, logs } = fixture();
    const facts = withBaselines(buildFacts(sessions, logs).facts);
    const matrix = correlationMatrix(facts);
    expect(matrix.length).toBeGreaterThan(5);
    // Energy was never tapped in this fixture → no correlations for it.
    expect(matrix.some((c) => c.dimension === "energy")).toBe(false);
    // Recovery exists only on the six Dial-era sessions, all at the centre:
    // one level, nothing to compare, so it stays off the matrix.
    expect(matrix.some((c) => c.dimension === "recovery")).toBe(false);
    expect(matrix.some((c) => c.dimension === "dose")).toBe(true);
    expect(matrix.some((c) => c.dimension === "restGap")).toBe(true);
    expect(matrix.some((c) => c.dimension === "timeOfDay")).toBe(true);
    expect(matrix.some((c) => c.outcome === ("tonnageIndex" as string))).toBe(false);
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
    expect(sleep!.title).toMatch(/on off days for sleep/i);
    expect(sleep!.tone).toBe("notable");
    expect(sleep!.evidence).toMatch(/6 of 24 sessions/);
    expect(corr.some((i) => i.outcome === ("tonnageIndex" as string))).toBe(false);

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
    const base = { sets: 10, setsRated: 10, setsMax: 1, setsDone: 8, setsPoor: 1, tonnage: 100, reps: 10 };
    const summary = summarize([
      fact({ ...base, setsWithTut: 1, restDays: null, date: "2026-01-01" }),
      fact({ ...base, setsWithTut: 0, restDays: 3, date: "2026-01-04" }),
      fact({ ...base, setsWithTut: 0, restDays: 3, date: "2026-01-07" }),
    ]);
    expect(summary.checkInCoverage).toBe(0);
    const cov = coverageInsights(summary);
    expect(cov.some((i) => i.id === "coverage:tut")).toBe(true);
    expect(cov.some((i) => i.id === "coverage:checkin")).toBe(true);
  });

  it("writes the stall rows as sentences and says 'not enough sessions yet' under three", () => {
    const { sessions, logs } = fixture();
    const built = buildFacts(sessions, logs);
    const rows = detectPlateaus(built.sets.filter((s) => s.date >= day(70)), names);
    const lp = rows.find((p) => p.machineId === "leg-press")!;
    expect(stallSentence(lp)).toMatch(/^leg-press — 116 lb for 6 sessions since \w{3} \d+, no gain$/);
    const lum = rows.find((p) => p.machineId === "lumbar")!;
    expect(stallSentence(lum)).toMatch(/^lumbar — \d+ → \d+ lb over \d+ sessions, progressing$/);
    const hip = rows.find((p) => p.machineId === "hip-adduction")!;
    expect(stallSentence(hip)).toMatch(/66 lb for \d+ sessions since/);
    const thin = detectPlateaus(built.sets.filter((s) => s.date >= day(100)), names).find((p) => p.machineId === "leg-press")!;
    expect(thin.status).toBe("insufficient");
    expect(stallSentence(thin)).toBe("leg-press — not enough sessions yet (needs 3)");
  });
});

describe("attendanceRhythm", () => {
  it("says the pace in words, finds the longest gap and judges the last month against the client's own pace", () => {
    const { sessions, logs } = fixture();
    const { facts } = buildFacts(sessions, logs);
    const last = facts[facts.length - 1].date;
    const r = attendanceRhythm(facts, { preset: "custom", from: facts[0].date, to: last });
    expect(r.status).toBe("ok");
    expect(r.sessions).toBe(24);
    expect(r.perWeekWords).toBe("Twice a week");
    expect(r.longestGap).toEqual({ days: 25, from: day(38), to: day(63) });
    expect(r.currentGapDays).toBe(0);
    expect(r.sessionsLast2Weeks).toBe(4);
    expect(r.sessionsLast4Weeks).toBe(8);
    expect(r.belowUsual).toBe(false);
    expect(r.sentence).toBe(`Twice a week on average · longest gap 25 days (${shortDateOf(day(38))}–${shortDateOf(day(63))}) · 4 sessions in the last 2 weeks`);

    // Ask for the report three weeks after her last visit: the pace is
    // measured to the day asked, so the drift shows.
    const later = attendanceRhythm(facts, { preset: "custom", from: facts[0].date, to: day(101 + 21) });
    expect(later.currentGapDays).toBe(21);
    expect(later.sessionsLast2Weeks).toBe(0);
    expect(later.sessionsLast4Weeks).toBe(2);
    expect(later.belowUsual).toBe(true);
    expect(later.sentence).toMatch(/0 sessions in the last 2 weeks — below the usual pace · last session 21 days ago$/);
    const cards = rhythmInsights(later, "Judy");
    expect(cards.find((c) => c.id === "rhythm:below-usual")?.title).toBe("Judy has trained less than usual in the last four weeks");
    expect(cards.find((c) => c.id === "rhythm:gap")?.kind).toBe("rhythm");
  });

  it("says not enough sessions yet under three, and has no 'usual' under eight weeks", () => {
    const two = [fact({ id: "a", date: "2026-03-02" }), fact({ id: "b", date: "2026-03-05", restDays: 3 })];
    const r = attendanceRhythm(two, { preset: "30d", from: "2026-02-05", to: "2026-03-06" });
    expect(r.status).toBe("insufficient");
    expect(r.perWeek).toBeNull();
    expect(r.sentence).toBe("2 sessions in the range — not enough sessions yet (needs 3).");
    expect(rhythmInsights(r, "Judy")).toEqual([]);

    const three = [...two, fact({ id: "c", date: "2026-03-09", restDays: 4 })];
    const ok = attendanceRhythm(three, { preset: "30d", from: "2026-02-08", to: "2026-03-09" });
    expect(ok.status).toBe("ok");
    expect(ok.belowUsual).toBeNull();
    expect(ok.longestGap?.days).toBe(4);
    expect(ok.sentence).toBe("Three times a week on average · 3 sessions in the last 2 weeks");
  });

  it("turns sessions per week into a trainer's words", () => {
    expect(perWeekWords(3.6)).toBe("Four or more times a week");
    expect(perWeekWords(2.6)).toBe("Three times a week");
    expect(perWeekWords(1.8)).toBe("Twice a week");
    expect(perWeekWords(1.0)).toBe("Once a week");
    expect(perWeekWords(0.5)).toBe("Every other week");
    expect(perWeekWords(0.2)).toBe("Less than every other week");
  });
});

describe("painTimeline", () => {
  it("lists regions below the centre, flagged symptoms and incidents, oldest first, as sentences", () => {
    const { sessions, logs, incidents } = fixture();
    const { facts } = buildFacts(sessions, logs, incidents);
    const t = painTimeline(facts, (id) => (id === "leg-press" ? "Leg press" : id));
    expect(t.sessions).toBe(24);
    expect(t.events.map((e) => `${e.date} ${e.text}`)).toEqual([
      `${day(14)} Left knee · Stiff`,
      `${day(24)} Right shoulder · Stiff`,
      `${day(35)} Incident on Leg press`,
      `${day(91)} Lower back · Stiff`,
    ]);
    // The "Better" reading on the lower back is not pain and stays off the timeline.
    expect(t.events.some((e) => e.date === day(98))).toBe(false);
    expect(t.quietSessions).toBe(20);
    expect(t.events[0].kind).toBe("region");
    expect(t.events[0].dial).toBe(-1);
    expect(t.events[2].kind).toBe("incident");
  });

  it("reads Pain as Pain, a symptom on a set once, and an incident with no machine", () => {
    const t = painTimeline([
      fact({ id: "a", date: "2026-02-01", regionDials: [{ region: "Neck", dial: -2 }], symptomRegions: ["Neck", "Left hip"], symptomCount: 2 }),
      fact({ id: "b", date: "2026-02-04", incidentCount: 2 }),
      fact({ id: "c", date: "2026-02-08" }),
    ]);
    expect(t.events.map((e) => e.text)).toEqual(["Neck · Pain", "Left hip · flagged during a set", "2 incidents on the floor"]);
    expect(t.events[0].dial).toBe(-2);
    expect(t.quietSessions).toBe(1);
  });
});

/** Local helper mirroring analytics.shortDate for the sentence assertions. */
function shortDateOf(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${d}`;
}

describe("formatting", () => {
  it("compacts numbers the way a stat tile wants them", () => {
    expect(compact(950)).toBe("950");
    expect(compact(1284)).toBe("1.3K");
    expect(compact(111050)).toBe("111K");
    expect(compact(2_400_000)).toBe("2.4M");
  });
});
