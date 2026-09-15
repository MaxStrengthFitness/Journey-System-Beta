import { describe, expect, it } from "vitest";
import type { ExerciseLog, WorkoutSession } from "../../types";
import {
  CONSISTENCY_MIN_SESSIONS,
  MAX_ACCOLADES,
  QUALITY_MIN_RATED_SETS,
  QUALITY_MIN_STREAK,
  STRENGTH_MIN_SESSIONS,
  TUT_MIN_GAIN_SECONDS,
  TUT_MIN_SESSIONS,
  accoladeCandidates,
  accoladeSetsFrom,
  buildSlot,
  choiceOf,
  clean,
  consistencyCandidate,
  consistencyShortfall,
  consistencyFacts,
  daysBetween,
  draftAccolades,
  draftSlots,
  emptySlot,
  isOpenSlot,
  measuredTut,
  padSlots,
  qualityCandidate,
  qualityFacts,
  refreshSlots,
  reportCards,
  slotCard,
  slotKey,
  strengthCandidates,
  tutCandidates,
  tutFacts,
  type AccoladeMachine,
  type AccoladeSet,
  type DraftAccoladesInput,
  type HighlightSlot,
  type SlotContext,
} from "./accolades";

/* ------------------------------------------------------------------ *
 * Builders
 * ------------------------------------------------------------------ */

const machine = (id: string, pct: number, sessions = 5, start = 100): AccoladeMachine => ({
  machineId: id,
  label: `Machine ${id}`,
  startWeight: start,
  currentWeight: Math.round(start * (1 + pct / 100)),
  percentageIncrease: pct,
  sessionCount: sessions,
});

let seq = 0;
const set = (over: Partial<AccoladeSet> = {}): AccoladeSet => ({
  machineId: "m1",
  sessionId: "s1",
  seq: seq++,
  quality: null,
  tutSeconds: null,
  weight: 100,
  ...over,
});

/** `n` rated sets in order, from a string like "3332333". */
const ratedRun = (pattern: string): AccoladeSet[] =>
  [...pattern].map((c, i) =>
    set({
      seq: i,
      sessionId: `s${Math.floor(i / 4)}`,
      quality: c === "-" ? null : (Number(c) as 1 | 2 | 3),
    }),
  );

/** One timed set per session on a machine. */
const timed = (machineId: string, tuts: number[], weights?: number[]): AccoladeSet[] =>
  tuts.map((t, i) =>
    set({ machineId, sessionId: `${machineId}-s${i}`, seq: i * 10, tutSeconds: t, weight: weights?.[i] ?? 100 }),
  );

const input = (over: Partial<DraftAccoladesInput> = {}): DraftAccoladesInput => ({
  machines: [],
  sets: [],
  sessionsInWindow: 0,
  windowStart: "2026-06-01",
  windowEnd: "2026-09-01",
  ...over,
});

/* ------------------------------------------------------------------ *
 * Strength
 * ------------------------------------------------------------------ */

describe("strength gain", () => {
  it("needs the named minimum of sessions on the machine", () => {
    expect(strengthCandidates([machine("a", 40, STRENGTH_MIN_SESSIONS - 1)])).toEqual([]);
    expect(strengthCandidates([machine("a", 40, STRENGTH_MIN_SESSIONS)])).toHaveLength(1);
  });

  it("never offers a zero or negative gain", () => {
    expect(strengthCandidates([machine("a", 0), machine("b", -10)])).toEqual([]);
  });

  it("never offers a machine with no start weight or no name", () => {
    expect(strengthCandidates([{ ...machine("a", 20), startWeight: 0 }])).toEqual([]);
    expect(strengthCandidates([{ ...machine("a", 20), label: "" }])).toEqual([]);
  });

  it("writes a real headline and sentence", () => {
    const [c] = strengthCandidates([machine("a", 42, 9)]);
    expect(c.slot.headline).toBe("+42%");
    expect(c.slot.detail).toBe("From 100 lbs to 142 lbs over 9 sessions");
    expect(c.slot.suggested).toBe(true);
    expect(c.slot.metricType).toBe("strength_gain");
    expect(c.score).toBeCloseTo(4.2);
    expect(JSON.stringify(c.slot)).not.toMatch(/undefined|NaN/);
  });
});

/* ------------------------------------------------------------------ *
 * Quality
 * ------------------------------------------------------------------ */

describe("quality reps", () => {
  it("finds the longest run of top-quality sets; unrated sets neither break nor extend it", () => {
    expect(qualityFacts(ratedRun("33323333"))).toEqual({ rated: 8, top: 7, longestStreak: 4 });
    expect(qualityFacts(ratedRun("33-33-3"))).toEqual({ rated: 5, top: 5, longestStreak: 5 });
    expect(qualityFacts(ratedRun("----"))).toEqual({ rated: 0, top: 0, longestStreak: 0 });
  });

  it("reads the sets in history order, not array order", () => {
    const sets = ratedRun("3332");
    // Array reversed: the 2 now comes first, but it happened last.
    expect(qualityFacts([...sets].reverse()).longestStreak).toBe(3);
  });

  it("says nothing below the rated-set minimum, however perfect", () => {
    const perfect = ratedRun("3".repeat(QUALITY_MIN_RATED_SETS - 1));
    expect(qualityCandidate(perfect)).toBeNull();
    expect(qualityCandidate(ratedRun("3".repeat(QUALITY_MIN_RATED_SETS)))).not.toBeNull();
  });

  it("headlines a streak once it reaches the minimum", () => {
    const c = qualityCandidate(ratedRun("2" + "3".repeat(QUALITY_MIN_STREAK) + "2222"))!;
    expect(c.slot.headline).toBe(`${QUALITY_MIN_STREAK} in a row`);
    expect(c.slot.detail).toContain(`${QUALITY_MIN_STREAK} of 10 rated sets at top quality`);
    expect(c.machineId).toBeNull();
    expect(c.slot.metricType).toBe("consistent_quality");
    expect(c.key).toBe("consistent_quality:all");
  });

  it("falls back to a count when there is no streak but plenty of top sets", () => {
    const c = qualityCandidate(ratedRun("3323".repeat(4)))!; // 12 top, best run 3
    expect(c.slot.headline).toBe("12 top-quality sets");
    expect(c.score).toBeCloseTo(12 / 30);
  });

  it("offers nothing when the sets are rated but not top quality", () => {
    expect(qualityCandidate(ratedRun("2".repeat(20)))).toBeNull();
    expect(qualityCandidate(ratedRun("3232".repeat(4)))).toBeNull(); // 8 top, run 1
  });
});

/* ------------------------------------------------------------------ *
 * Time under tension
 * ------------------------------------------------------------------ */

describe("time under tension", () => {
  const labels = new Map([["leg", "Leg Press"], ["row", "Row"]]);

  it("compares the first and latest session's average time per set", () => {
    const sets = [
      ...timed("leg", [60, 65, 80]),
      set({ machineId: "leg", sessionId: "leg-s2", seq: 21, tutSeconds: 90 }),
    ];
    const [f] = tutFacts(sets);
    expect(f).toMatchObject({ sessions: 3, startSeconds: 60, currentSeconds: 85, gainSeconds: 25, pct: 42 });
  });

  it("needs the named minimum of timed sessions", () => {
    expect(tutCandidates(timed("leg", [60, 90].slice(0, TUT_MIN_SESSIONS - 1)), labels)).toEqual([]);
    expect(tutCandidates(timed("leg", [60, 70, 90]), labels)).toHaveLength(1);
  });

  it("needs a real gain of at least the minimum seconds", () => {
    expect(tutCandidates(timed("leg", [60, 61, 60 + TUT_MIN_GAIN_SECONDS - 1]), labels)).toEqual([]);
    expect(tutCandidates(timed("leg", [60, 61, 60 + TUT_MIN_GAIN_SECONDS]), labels)).toHaveLength(1);
  });

  it("is not a win when the load went down", () => {
    expect(tutCandidates(timed("leg", [60, 70, 90], [150, 140, 120]), labels)).toEqual([]);
    expect(tutCandidates(timed("leg", [60, 70, 90], [150, 150, 160]), labels)).toHaveLength(1);
  });

  it("never names a machine it has no label for", () => {
    expect(tutCandidates(timed("mystery", [60, 70, 90]), labels)).toEqual([]);
  });

  it("writes the sentence per set", () => {
    const [c] = tutCandidates(timed("row", [40, 50, 55]), labels);
    expect(c.slot.headline).toBe("+15 s");
    expect(c.slot.detail).toBe("From 40 s to 55 s under tension per set over 3 sessions");
    expect(c.label).toBe("Row");
  });

  it("measuredTut ignores the machine clock", () => {
    const base = { sessionId: "s", machineId: "m" } as ExerciseLog;
    expect(measuredTut({ ...base, machineDurationSeconds: 300 })).toBeNull();
    expect(measuredTut({ ...base, totalTimeUnderLoad: 75, machineDurationSeconds: 300 })).toBe(75);
    expect(measuredTut({ ...base, isTSC: true, seconds: "45" })).toBe(45);
    expect(measuredTut({ ...base, reps: "10", averageTimePerRep: 6 })).toBe(60);
  });
});

/* ------------------------------------------------------------------ *
 * Consistency
 * ------------------------------------------------------------------ */

describe("consistency", () => {
  it("counts days between date-only strings without a time zone", () => {
    expect(daysBetween("2026-03-01", "2026-03-15")).toBe(14);
    // Across the US spring-forward change: still whole days.
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("", "2026-03-09")).toBeNull();
    expect(daysBetween("03/01/2026", "2026-03-09")).toBeNull();
  });

  it("measures sessions a week against the twice-a-week target", () => {
    const f = consistencyFacts({ sessionsInWindow: 20, windowStart: "2026-06-01", windowEnd: "2026-08-10" })!;
    expect(f.weeks).toBe(10);
    expect(f.perWeek).toBe(2);
    expect(f.share).toBe(1);
  });

  it("names every minimum it misses", () => {
    expect(consistencyShortfall(null)).toMatch(/not enough data yet/i);
    expect(
      consistencyShortfall(consistencyFacts({ sessionsInWindow: 8, windowStart: "2026-06-01", windowEnd: "2026-06-20" })),
    ).toMatch(/4 weeks/);
    expect(
      consistencyShortfall(
        consistencyFacts({ sessionsInWindow: CONSISTENCY_MIN_SESSIONS - 1, windowStart: "2026-06-01", windowEnd: "2026-06-29" }),
      ),
    ).toMatch(/needs 8 sessions/);
    expect(
      consistencyShortfall(consistencyFacts({ sessionsInWindow: 10, windowStart: "2026-01-01", windowEnd: "2026-05-01" })),
    ).toMatch(/under 75 %/);
  });

  it("is an accolade at 75 % of the target or better", () => {
    const c = consistencyCandidate({ sessionsInWindow: 16, windowStart: "2026-06-01", windowEnd: "2026-07-27" })!;
    expect(c.slot.headline).toBe("2.0 a week");
    expect(c.slot.detail).toBe("16 sessions in 8 weeks · the target is 2 a week");
    expect(consistencyCandidate({ sessionsInWindow: 11, windowStart: "2026-06-01", windowEnd: "2026-07-27" })).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * The draft
 * ------------------------------------------------------------------ */

describe("draftAccolades", () => {
  const richSets = [...ratedRun("3".repeat(12)), ...timed("t1", [40, 50, 60])];
  /** The timed machine, known by name but with no strength gain. */
  const t1 = { ...machine("t1", 0), label: "Chest" };

  it("returns nothing when nothing is proven", () => {
    expect(draftAccolades(input())).toEqual([]);
    expect(draftAccolades(input({ machines: [machine("a", 0), machine("b", 30, 1)] }))).toEqual([]);
  });

  it("never returns more than three", () => {
    const machines = ["a", "b", "c", "d", "e"].map((id, i) => machine(id, 10 + i * 5));
    expect(draftAccolades(input({ machines, sets: richSets, sessionsInWindow: 30 }))).toHaveLength(MAX_ACCOLADES);
    expect(draftAccolades(input({ machines }), { max: 10 })).toHaveLength(MAX_ACCOLADES);
    expect(draftAccolades(input({ machines }), { max: 1 })).toHaveLength(1);
  });

  it("returns distinct accolades", () => {
    const machines = ["a", "b", "c"].map((id) => machine(id, 20));
    const keys = draftAccolades(input({ machines })).map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("takes the best of each milestone kind before a second of any", () => {
    const machines = [machine("a", 60), machine("b", 50), machine("c", 45), t1];
    const kinds = draftAccolades(input({ machines, sets: richSets })).map((c) => c.kind);
    expect(kinds.sort()).toEqual(["quality_reps", "strength_gain", "time_under_tension"]);
  });

  it("ranks the result by impressiveness", () => {
    const machines = [machine("a", 15), t1];
    // quality 2.5, time 10.0, strength 1.5
    const sets = [...ratedRun("3".repeat(25)), ...timed("t1", [40, 45, 80])];
    const out = draftAccolades(input({ machines, sets }));
    expect(out.map((c) => c.kind)).toEqual(["time_under_tension", "quality_reps", "strength_gain"]);
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  it("gives the most impressive kind first pick when there is room for fewer", () => {
    const machines = [machine("a", 15), t1];
    const sets = [...ratedRun("3".repeat(25)), ...timed("t1", [40, 45, 80])];
    expect(draftAccolades(input({ machines, sets }), { max: 1 }).map((c) => c.kind)).toEqual([
      "time_under_tension",
    ]);
  });

  it("fills with more strength gains, new machines first", () => {
    const machines = [machine("a", 60), machine("b", 50), machine("c", 45), machine("d", 5)];
    const out = draftAccolades(input({ machines }));
    expect(out.map((c) => c.machineId)).toEqual(["a", "b", "c"]);
  });

  it("prefers a different machine for the second kind when one exists", () => {
    const machines = [
      { ...machine("leg", 50), label: "Leg Press" },
      { ...machine("row", 40), label: "Row" },
    ];
    // Leg press time under tension (score 10) picks first and takes the leg
    // press, so the strength slot goes to the row even though the leg press
    // gain is bigger.
    const sets = timed("leg", [40, 50, 80]);
    const out = draftAccolades(input({ machines, sets }), { max: 2 });
    expect(out.map((c) => c.key)).toEqual(["time_under_tension:leg", "strength_gain:row"]);
    // With room for three, the leg press gain comes back.
    expect(draftAccolades(input({ machines, sets })).map((c) => c.key)).toEqual([
      "time_under_tension:leg",
      "strength_gain:leg",
      "strength_gain:row",
    ]);
  });

  it("uses consistency only to fill what the milestones leave empty", () => {
    const consistent = { sessionsInWindow: 26, windowStart: "2026-06-01", windowEnd: "2026-08-31" };
    const full = draftAccolades(input({ ...consistent, machines: ["a", "b", "c"].map((id) => machine(id, 5)) }));
    expect(full.map((c) => c.kind)).not.toContain("consistency");
    const sparse = draftAccolades(input({ ...consistent, machines: [machine("a", 5)] }));
    expect(sparse.map((c) => c.kind)).toEqual(["consistency", "strength_gain"]);
  });

  it("skips accolades already on the report and avoids their machines", () => {
    const machines = [machine("a", 60), machine("b", 50), machine("c", 45)];
    const out = draftAccolades(input({ machines }), {
      max: 2,
      excludeKeys: ["strength_gain:a"],
      usedMachineIds: ["b"],
    });
    // c is taken first (b is already on the report), then b as the only one left.
    expect(out.map((c) => c.machineId)).toEqual(["b", "c"]);
    expect(out.map((c) => c.key)).not.toContain("strength_gain:a");
  });

  it("lists every candidate, best first", () => {
    const machines = [machine("a", 10), machine("b", 30), t1];
    const all = accoladeCandidates(input({ machines, sets: richSets }));
    expect(all.length).toBe(4);
    for (let i = 1; i < all.length; i++) expect(all[i - 1].score).toBeGreaterThanOrEqual(all[i].score);
  });
});

/* ------------------------------------------------------------------ *
 * Slots and cards
 * ------------------------------------------------------------------ */

describe("slots", () => {
  it("pads to exactly three DISTINCT objects", () => {
    const slots = padSlots([{ label: "x" }]);
    expect(slots).toHaveLength(3);
    expect(slots[1]).not.toBe(slots[2]);
    slots[1].label = "changed";
    expect(slots[2].label).toBe("");
    expect(emptySlot()).not.toBe(emptySlot());
  });

  it("never mutates what it was given", () => {
    const given = [{ label: "a" }];
    const out = padSlots(given);
    out[0].label = "b";
    expect(given[0].label).toBe("a");
    expect(padSlots(undefined)).toHaveLength(3);
    expect(padSlots(new Array(5).fill(null).map(() => ({ label: "z" })))).toHaveLength(3);
  });

  it("keys a slot by kind and machine", () => {
    expect(slotKey({ label: "", machineId: "a" })).toBe("strength_gain:a");
    expect(slotKey({ label: "", metricType: "consistent_quality" })).toBe("consistent_quality:all");
    expect(slotKey({ label: "", metricType: "time_under_tension", machineId: "none" })).toBe("time_under_tension:all");
  });

  it("cleans garbage strings", () => {
    expect(clean("undefined lbs")).toBe("");
    expect(clean("NaN%")).toBe("");
    expect(clean("  +12% ")).toBe("+12%");
    expect(clean(12)).toBe("");
  });
});

describe("slotCard — nothing empty or undefined ever prints", () => {
  it("draws nothing for the blank slots old reports saved", () => {
    const legacyBlanks: HighlightSlot[] = [
      { label: "", startValue: "", currentValue: "" },
      { label: "", metricType: "strength_gain" },
      { label: "Movement Slot", metricType: "strength_gain" },
      { label: "", machineId: "none", metricType: "total_volume" },
    ];
    expect(reportCards(legacyBlanks)).toEqual([]);
    expect(reportCards(undefined)).toEqual([]);
    expect(slotCard(null)).toBeNull();
  });

  it("draws nothing for the live bug: +0% from undefined to undefined", () => {
    expect(slotCard({ label: "Leg Press", machineId: "m", metricType: "strength_gain", percentageIncrease: 0 })).toBeNull();
    expect(
      slotCard({ label: "Leg Press", machineId: "m", percentageIncrease: 12, startValue: "undefined lbs", currentValue: "undefined lbs" }),
    ).toBeNull();
  });

  it("still draws a real legacy strength slot, titled by its kind", () => {
    expect(
      slotCard({ label: "Leg Press", machineId: "m", percentageIncrease: 25, startValue: "100 lbs", currentValue: "125 lbs" }),
    ).toEqual({ title: "Strength gain", label: "Leg Press", hero: "+25%", context: "From 100 lbs to 125 lbs", tone: "gain" });
  });

  it("draws legacy volume / quality / time slots only with a positive number", () => {
    const base = { label: "Row", machineId: "r" };
    expect(slotCard({ ...base, metricType: "total_volume", totalVolume: 0 })).toBeNull();
    expect(slotCard({ ...base, metricType: "total_volume", totalVolume: 12500 })?.hero).toBe("12,500 lbs");
    expect(slotCard({ ...base, metricType: "consistent_quality", perfectSets: 0 })).toBeNull();
    expect(slotCard({ ...base, metricType: "consistent_quality", perfectSets: 4 })?.title).toBe("Quality reps");
    expect(slotCard({ ...base, metricType: "time_under_tension" })).toBeNull();
    expect(slotCard({ ...base, metricType: "time_under_tension", timeUnderTension: 90 })?.title).toBe("Time under tension");
  });

  it("draws a custom highlight only when it has words", () => {
    expect(slotCard({ label: "", metricType: "custom", customText: "   " })).toBeNull();
    expect(slotCard({ label: "", metricType: "custom", customText: "Mastered breathing" })).toMatchObject({
      title: "Trainer highlight",
      hero: "Mastered breathing",
      context: "Trainer highlight",
    });
  });

  it("draws a drafted slot from its headline", () => {
    const [c] = strengthCandidates([machine("a", 30)]);
    expect(slotCard(c.slot)).toMatchObject({ title: "Strength gain", hero: "+30%", label: "Machine a" });
    expect(slotCard(consistencyCandidate({ sessionsInWindow: 20, windowStart: "2026-06-01", windowEnd: "2026-08-10" })!.slot)?.title).toBe(
      "Consistency",
    );
  });

  it("keeps order and drops only the blanks", () => {
    const cards = reportCards([
      { label: "" },
      { label: "", metricType: "custom", customText: "One" },
      { label: "", metricType: "custom", customText: "Two" },
    ]);
    expect(cards.map((c) => c.hero)).toEqual(["One", "Two"]);
  });
});

/* ------------------------------------------------------------------ *
 * The editor
 * ------------------------------------------------------------------ */

const ctx = (over: Partial<SlotContext> = {}): SlotContext => ({
  stats: {
    leg: { startWeight: 100, currentWeight: 130, percentageIncrease: 30, totalVolume: 9000, perfectSets: 3, timeUnderTension: 0, sessionCount: 6 },
    thin: { startWeight: 100, currentWeight: 120, percentageIncrease: 20, totalVolume: 800, perfectSets: 0, sessionCount: 2 },
    flat: { startWeight: 100, currentWeight: 100, percentageIncrease: 0, totalVolume: 800, perfectSets: 0, sessionCount: 5 },
  },
  labels: new Map([["leg", "Leg Press"], ["thin", "Chest"], ["flat", "Row"], ["tut", "Abductor"]]),
  sets: [...ratedRun("3".repeat(10)), ...timed("tut", [30, 35, 45])],
  sessionsInWindow: 20,
  windowStart: "2026-06-01",
  windowEnd: "2026-08-10",
  ...over,
});

describe("buildSlot", () => {
  it("an empty choice is an empty slot", () => {
    expect(buildSlot({}, ctx())).toEqual({ slot: { label: "" }, note: null });
    expect(buildSlot({ metricType: "" }, ctx()).slot).toEqual({ label: "" });
  });

  it("choosing 'none' clears the numbers", () => {
    const { slot, note } = buildSlot({ metricType: "strength_gain", machineId: "none" }, ctx());
    expect(slot).toEqual({ label: "", metricType: "strength_gain" });
    expect(note).toBe("Choose a machine.");
    expect(slotCard(slot)).toBeNull();
  });

  it("builds a strength slot from the window numbers, as the trainer's own", () => {
    const { slot, note } = buildSlot({ metricType: "strength_gain", machineId: "leg" }, ctx());
    expect(note).toBeNull();
    expect(slot).toMatchObject({ headline: "+30%", label: "Leg Press", machineId: "leg", sessionCount: 6 });
    expect(slot.suggested).toBeUndefined();
  });

  it("says why a strength slot can't print", () => {
    const thin = buildSlot({ metricType: "strength_gain", machineId: "thin" }, ctx());
    expect(thin.note).toMatch(/not enough data yet.*3 sessions on Chest.*has 2/i);
    expect(slotCard(thin.slot)).toBeNull();
    const flat = buildSlot({ metricType: "strength_gain", machineId: "flat" }, ctx());
    expect(flat.note).toMatch(/No gain on Row/);
    const none = buildSlot({ metricType: "strength_gain", machineId: "ghost" }, ctx());
    expect(none.note).toMatch(/No performed sets/);
    expect(none.slot.label).toBe("this machine");
  });

  it("builds volume and per-machine quality slots", () => {
    expect(buildSlot({ metricType: "total_volume", machineId: "leg" }, ctx()).slot.headline).toBe("9,000 lbs moved");
    expect(buildSlot({ metricType: "consistent_quality", machineId: "leg" }, ctx()).slot.headline).toBe("3 top-quality sets");
    expect(buildSlot({ metricType: "consistent_quality", machineId: "flat" }, ctx()).note).toMatch(/No top-quality sets/);
  });

  it("builds the client-wide quality and consistency slots", () => {
    expect(buildSlot({ metricType: "consistent_quality" }, ctx()).slot.headline).toBe("10 in a row");
    expect(buildSlot({ metricType: "consistency" }, ctx()).slot.headline).toBe("2.0 a week");
    const thin = buildSlot({ metricType: "consistent_quality" }, ctx({ sets: [] }));
    expect(thin.note).toMatch(/not enough data yet/i);
    expect(slotCard(thin.slot)).toBeNull();
    const short = buildSlot({ metricType: "consistency" }, ctx({ sessionsInWindow: 3 }));
    expect(short.note).toMatch(/needs 8 sessions/);
    expect(slotCard(short.slot)).toBeNull();
  });

  it("builds a time-under-tension slot or says why not", () => {
    expect(buildSlot({ metricType: "time_under_tension", machineId: "tut" }, ctx()).slot.headline).toBe("+15 s");
    expect(buildSlot({ metricType: "time_under_tension", machineId: "leg" }, ctx()).note).toMatch(/No measured time/);
  });

  it("a custom slot carries its text as the headline", () => {
    expect(buildSlot({ metricType: "custom", customText: "Big day" }, ctx()).slot).toMatchObject({
      headline: "Big day",
      customText: "Big day",
    });
    expect(buildSlot({ metricType: "custom", customText: "" }, ctx()).note).toMatch(/never printed/);
  });

  it("round-trips a stored slot's choice", () => {
    const { slot } = buildSlot({ metricType: "time_under_tension", machineId: "tut" }, ctx());
    expect(choiceOf(slot)).toEqual({ metricType: "time_under_tension", machineId: "tut", customText: undefined });
    expect(choiceOf({ label: "Leg", machineId: "leg" }).metricType).toBe("strength_gain");
    expect(choiceOf({ label: "" }).metricType).toBe("");
  });
});

describe("open slots and refreshing", () => {
  it("knows which slots the trainer chose", () => {
    expect(isOpenSlot({ label: "" })).toBe(true);
    expect(isOpenSlot({ label: "", metricType: "strength_gain" })).toBe(true);
    expect(isOpenSlot({ label: "", machineId: "none", metricType: "strength_gain" })).toBe(true);
    expect(isOpenSlot({ label: "x", headline: "+3%", suggested: true })).toBe(true);
    expect(isOpenSlot({ label: "Leg", machineId: "leg", metricType: "strength_gain" })).toBe(false);
    expect(isOpenSlot({ label: "", metricType: "custom" })).toBe(false);
    expect(isOpenSlot({ label: "", metricType: "consistency" })).toBe(false);
    expect(isOpenSlot({ label: "", metricType: "consistent_quality" })).toBe(false);
  });

  it("drafts a new report's three slots", () => {
    const slots = draftSlots(ctx());
    expect(slots).toHaveLength(3);
    expect(slots.every((s) => s.suggested)).toBe(true);
    expect(new Set(slots.map(slotKey)).size).toBe(3);
  });

  it("pads a thin draft with distinct blanks", () => {
    const slots = draftSlots(ctx({ sets: [], sessionsInWindow: 0, stats: {} }));
    expect(slots).toEqual([{ label: "" }, { label: "" }, { label: "" }]);
    expect(slots[0]).not.toBe(slots[1]);
  });

  it("keeps the trainer's choices with new numbers and re-drafts around them", () => {
    const chosen = buildSlot({ metricType: "strength_gain", machineId: "leg" }, ctx()).slot;
    const custom = buildSlot({ metricType: "custom", customText: "Hi" }, ctx()).slot;
    const newWindow = ctx({
      stats: { ...ctx().stats, leg: { ...ctx().stats.leg!, currentWeight: 150, percentageIncrease: 50 } },
    });
    const out = refreshSlots([chosen, { label: "", headline: "+1%", suggested: true }, custom], newWindow);
    expect(out[0]).toMatchObject({ machineId: "leg", headline: "+50%" });
    expect(out[0].suggested).toBeUndefined();
    expect(out[1].suggested).toBe(true);
    expect(slotKey(out[1])).not.toBe("strength_gain:leg");
    expect(out[2]).toEqual(custom);
  });

  it("empties a chosen card when the new window has no data for it", () => {
    const chosen = buildSlot({ metricType: "strength_gain", machineId: "leg" }, ctx()).slot;
    const out = refreshSlots([chosen], ctx({ stats: {}, sets: [], sessionsInWindow: 0 }));
    expect(slotCard(out[0])).toBeNull();
    expect(out[0]).toMatchObject({ machineId: "leg", metricType: "strength_gain" });
    expect(out[0].headline).toBeUndefined();
    expect(out).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ *
 * History → sets
 * ------------------------------------------------------------------ */

describe("accoladeSetsFrom", () => {
  const ts = (ms: number) => ({ toMillis: () => ms });
  const sessions = [
    { id: "b", date: "2026-06-03", sessionNumber: 2 },
    { id: "a", date: "2026-06-01", sessionNumber: 1 },
    { id: "old", date: "2026-05-01", sessionNumber: 0 },
  ] as WorkoutSession[];
  const logs = [
    { sessionId: "b", machineId: "m", reps: "8", weight: "100", repQuality: 3, createdAt: ts(5) },
    { sessionId: "a", machineId: "m", reps: "8", weight: "90", repQuality: 2, createdAt: ts(9) },
    { sessionId: "a", machineId: "m", reps: "8", weight: "95", repQuality: 3, createdAt: ts(10) },
    { sessionId: "a", machineId: "m", weight: "95" }, // seeded, never performed
    { sessionId: "a", machineId: "m", reps: "8", outcome: "practice", repQuality: 3 },
    { sessionId: "old", machineId: "m", reps: "8", repQuality: 1 },
    { sessionId: "elsewhere", machineId: "m", reps: "8", repQuality: 1 },
    { sessionId: "a", machineId: "", reps: "8", repQuality: 1 },
  ] as ExerciseLog[];

  it("keeps performed sets in the window, in the order they happened", () => {
    const out = accoladeSetsFrom(sessions, logs, "2026-06-01");
    expect(out.map((s) => [s.sessionId, s.quality, s.weight])).toEqual([
      ["a", 2, 90],
      ["a", 3, 95],
      ["b", 3, 100],
    ]);
    expect(out.map((s) => s.seq)).toEqual([0, 1, 2]);
  });

  it("a blank window start means every session", () => {
    expect(accoladeSetsFrom(sessions, logs)).toHaveLength(4);
  });
});
