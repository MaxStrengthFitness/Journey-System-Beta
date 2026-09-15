import { describe, expect, it } from "vitest";
import {
  CHANGE_MERGE_WINDOW_MS,
  DAY_MS,
  EMPTY_BASELINE,
  baselineFromHistory,
  buildHistoryLog,
  deltaKind,
  deriveAssessmentDeltas,
  finalizedSubjective,
  freshnessOf,
  historyFromDocs,
  isImprovement,
  lastUpdated,
  latestChangeFor,
  measureSection,
  pillarFreshness,
  pillarFreshnessSentence,
  previousFromHistory,
  recordChanges,
  sectionTouches,
  withChangeNote,
  type AssessmentHistory,
  type AssessmentHistoryReport,
} from "./assessment-history";
import { ASSESSMENT_PILLARS } from "./pillars";
import { emptyAssessment, summarize } from "./scoring";
import type { AssessmentChange, SubjectiveAssessment } from "./types";

/* ---------------- fixtures ---------------- */

/** An assessment with sleep answered s1/s2/s3 (0–10) and anything else patched in. */
function withSleep(values: (number | null)[], patch: Partial<SubjectiveAssessment> = {}): SubjectiveAssessment {
  const a = emptyAssessment();
  const answers: SubjectiveAssessment["answers"] = {};
  values.forEach((v, i) => {
    if (v !== null) answers[`sleepRecovery_${i + 1}`] = { value: v };
  });
  return { ...a, answers, ...patch };
}

function report(
  id: string,
  date: string,
  assessment: SubjectiveAssessment,
  extra: Partial<AssessmentHistoryReport> = {},
): AssessmentHistoryReport {
  return {
    id,
    date,
    savedAtMs: null,
    trainerId: "t1",
    trainerName: "Christian Moore",
    enteredBy: "coach",
    assessment,
    sectionsReviewed: [],
    ...extra,
  };
}

const T0 = new Date("2026-09-14T14:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);

/* ---------------- measures ---------------- */

describe("measureSection", () => {
  it("scores a category on the 0–12 scale and says null when nothing was asked", () => {
    expect(measureSection("sleepRecovery", withSleep([10, 10, 10]))).toBe(12);
    expect(measureSection("sleepRecovery", withSleep([5, 5, 5]))).toBe(6);
    expect(measureSection("sleepRecovery", emptyAssessment())).toBeNull();
  });

  it("converts scale-1 answers the same way the scoring code does", () => {
    const v1 = { ...withSleep([4, 4, 4]), scaleVersion: 1 as const };
    expect(measureSection("sleepRecovery", v1)).toBe(12);
  });

  it("fills the statements a draft did not ask from what was saved before", () => {
    const base = baselineFromHistory({
      reports: [report("r1", "2026-06-01", withSleep([5, 5, 5]))],
      complete: true,
      coversSinceMs: null,
    });
    // Only statement 1 re-asked, now a 10: (10+5+5)/30 × 12 = 8.
    expect(measureSection("sleepRecovery", withSleep([10]), [], base)).toBe(8);
    // Asked on its own, one statement would have claimed 12.
    expect(measureSection("sleepRecovery", withSleep([10]))).toBe(12);
  });

  it("reads protein and hydration as days a week", () => {
    const a = emptyAssessment();
    a.protein = { ...a.protein, daysPerWeekOnTarget: 5 };
    a.hydration = { ...a.hydration, daysPerWeekOnTarget: 2 };
    expect(measureSection("protein", a)).toBe(5);
    expect(measureSection("hydration", a)).toBe(2);
  });

  it("reads pain as the worst active spot, 0 once reviewed with nothing active, else unknown", () => {
    const a = emptyAssessment();
    expect(measureSection("pain", a)).toBeNull();
    expect(measureSection("pain", a, ["pain"])).toBe(0);
    const spot = (severity: number, status: "active" | "improving" | "resolved") => ({
      id: `p${severity}${status}`,
      region: "knee" as const,
      side: "left" as const,
      type: "joint" as const,
      severity,
      frequency: "daily" as const,
      aggravatingMachineIds: [],
      linkedJournalEntryIds: [],
      status,
    });
    expect(measureSection("pain", { ...a, painMap: [spot(4, "active"), spot(7, "improving"), spot(9, "resolved")] })).toBe(7);
    expect(measureSection("pain", { ...a, painMap: [spot(9, "resolved")] })).toBe(0);
  });

  it("reads stress as the overall level", () => {
    expect(measureSection("stress", { ...emptyAssessment(), overallStressLevel: 7 })).toBe(7);
    expect(measureSection("stress", emptyAssessment())).toBeNull();
  });
});

/* ---------------- the in-draft log ---------------- */

describe("recordChanges", () => {
  it("appends a row when an area's number moves, with who and when", () => {
    const prev = emptyAssessment();
    const next = withSleep([5, 5, 5]);
    const log = recordChanges({ prev, next, at: T0, byId: "t1", byName: "Christian Moore" });
    expect(log).toEqual([
      { categoryId: "sleepRecovery", from: null, to: 6, at: T0.toISOString(), byId: "t1", byName: "Christian Moore" },
    ]);
  });

  it("returns the same array when nothing measurable moved (typing a note)", () => {
    const existing: AssessmentChange[] = [{ categoryId: "sleepRecovery", from: 6, to: 9, at: T0.toISOString() }];
    const prev = { ...withSleep([8, 8, 7]), changeLog: existing };
    const next = { ...prev, categoryNotes: { sleepRecovery: "new mattress" } };
    expect(recordChanges({ prev, next, at: later(1000) })).toBe(existing);
  });

  it("starts from the last SAVED value, because a new draft starts empty", () => {
    const base = baselineFromHistory({
      reports: [report("r1", "2026-06-01", withSleep([5, 5, 5]))],
      complete: true,
      coversSinceMs: null,
    });
    const log = recordChanges({ prev: emptyAssessment(), next: withSleep([10]), baseline: base, at: T0 });
    expect(log[0]).toMatchObject({ categoryId: "sleepRecovery", from: 6, to: 8 });
  });

  it("does not log re-entering the value that was already saved", () => {
    const base = baselineFromHistory({
      reports: [report("r1", "2026-06-01", withSleep([5, 5, 5]))],
      complete: true,
      coversSinceMs: null,
    });
    const log = recordChanges({ prev: emptyAssessment(), next: withSleep([5]), baseline: base, at: T0 });
    expect(log).toEqual([]);
  });

  it("records 'before' as unknown, not new, while the saved history is unknown", () => {
    const log = recordChanges({
      prev: emptyAssessment(),
      next: withSleep([10]),
      baselineKnown: false,
      at: T0,
    });
    expect(log).toEqual([
      { categoryId: "sleepRecovery", from: null, to: 12, at: T0.toISOString(), fromUnknown: true },
    ]);
    const rows = buildHistoryLog({ history: null, draftChangeLog: log });
    expect(rows[0].kind).toBe("updated");

    // A value the draft itself already held fully is still known.
    const own = { ...emptyAssessment(), overallStressLevel: 4 };
    const stress = recordChanges({
      prev: own,
      next: { ...own, overallStressLevel: 6 },
      baselineKnown: false,
      at: T0,
    });
    expect(stress).toEqual([{ categoryId: "stress", from: 4, to: 6, at: T0.toISOString() }]);
  });

  it("folds quick corrections by the same person into one row", () => {
    let a = emptyAssessment();
    const step = (next: SubjectiveAssessment, at: Date, byId = "t1") => {
      const changeLog = recordChanges({ prev: a, next, at, byId });
      a = { ...next, changeLog };
    };
    step(withSleep([3]), T0);
    step(withSleep([3, 8]), later(20_000));
    step(withSleep([3, 8, 9]), later(40_000));
    expect(a.changeLog).toHaveLength(1);
    expect(a.changeLog![0]).toMatchObject({ from: null, to: 8, at: later(40_000).toISOString() });

    // Past the window it is a new row, starting where the last one ended.
    step(withSleep([10, 10, 10]), later(CHANGE_MERGE_WINDOW_MS + 60_000));
    expect(a.changeLog).toHaveLength(2);
    expect(a.changeLog![1]).toMatchObject({ from: 8, to: 12 });

    // Someone else, inside the window: their own row.
    step(withSleep([5, 5, 5]), later(CHANGE_MERGE_WINDOW_MS + 90_000), "t2");
    expect(a.changeLog).toHaveLength(3);
    expect(a.changeLog![2]).toMatchObject({ from: 12, to: 6, byId: "t2" });
  });

  it("drops a row that a quick correction undoes, unless it carries a note", () => {
    const first = recordChanges({ prev: emptyAssessment(), next: withSleep([5, 5, 5]), at: T0 });
    const undone = recordChanges({
      prev: { ...withSleep([5, 5, 5]), changeLog: first },
      next: { ...emptyAssessment(), changeLog: first },
      at: later(5000),
    });
    expect(undone).toEqual([]);

    const noted = withChangeNote(first, "sleepRecovery", first[0].at, "new mattress");
    const kept = recordChanges({
      prev: { ...withSleep([5, 5, 5]), changeLog: noted },
      next: { ...emptyAssessment(), changeLog: noted },
      at: later(5000),
    });
    expect(kept).toHaveLength(1);
    expect(kept[0].note).toBe("new mattress");
  });

  it("logs pain when a coach marks it reviewed with nothing active", () => {
    const base = baselineFromHistory({
      reports: [
        report(
          "r1",
          "2026-06-01",
          {
            ...emptyAssessment(),
            painMap: [
              {
                id: "p",
                region: "knee",
                side: "left",
                type: "joint",
                severity: 6,
                frequency: "daily",
                aggravatingMachineIds: [],
                linkedJournalEntryIds: [],
                status: "active",
              },
            ],
          },
        ),
      ],
      complete: true,
      coversSinceMs: null,
    });
    const a = emptyAssessment();
    const log = recordChanges({ prev: a, next: a, prevReviewed: [], nextReviewed: ["pain"], baseline: base, at: T0 });
    expect(log).toEqual([{ categoryId: "pain", from: 6, to: 0, at: T0.toISOString() }]);
  });

  it("sets, trims to one line's length, and clears a note", () => {
    const log: AssessmentChange[] = [{ categoryId: "stress", from: 3, to: 7, at: T0.toISOString() }];
    const noted = withChangeNote(log, "stress", T0.toISOString(), "Mother moved in");
    expect(noted[0].note).toBe("Mother moved in");
    expect(withChangeNote(log, "stress", T0.toISOString(), "x".repeat(500))[0].note).toHaveLength(140);
    expect("note" in withChangeNote(noted, "stress", T0.toISOString(), "   ")[0]).toBe(false);
    expect(latestChangeFor(noted, "stress")?.note).toBe("Mother moved in");
    expect(latestChangeFor(noted, "sleepRecovery")).toBeNull();
  });
});

describe("finalizedSubjective", () => {
  it("keeps the change log on the saved assessment", () => {
    const changeLog: AssessmentChange[] = [
      { categoryId: "sleepRecovery", from: 6, to: 9, at: T0.toISOString(), note: "Bought a new mattress" },
    ];
    const a = { ...withSleep([8, 8, 7]), changeLog };
    const out = finalizedSubjective(a, "2026-09-14", summarize(a, null, T0));
    expect(out.changeLog).toEqual(changeLog);
    expect(out.completedAt).toBe("2026-09-14");
    expect(out.summary).toBeDefined();
  });

  it("does not invent a log for an assessment that had none", () => {
    const a = withSleep([8, 8, 7]);
    expect("changeLog" in finalizedSubjective(a, "2026-09-14", summarize(a, null, T0))).toBe(false);
  });
});

/* ---------------- saved assessments ---------------- */

describe("historyFromDocs", () => {
  const docs = [
    { id: "d1", status: "Draft", isCheckInOnly: true, subjective: withSleep([1, 1, 1]), date: "2026-09-10" },
    { id: "f2", status: "Finalized", subjective: withSleep([8, 8, 8]), date: "2026-09-01", trainerName: "Ana", updatedAt: { seconds: 1_788_000_000 }, checkInSectionsReviewed: ["pain"] },
    { id: "full", status: "Finalized", date: "2026-08-15" }, // a full report with no check-in
    { id: "f1", status: "Finalized", subjective: withSleep([5, 5, 5]), date: "2026-06-01", createdAt: { toMillis: () => 1_780_000_000_000 } },
  ];

  it("keeps only finalized reports that carry a check-in, newest first", () => {
    const h = historyFromDocs(docs, 25);
    expect(h.reports.map((r) => r.id)).toEqual(["f2", "f1"]);
    expect(h.reports[0]).toMatchObject({ trainerName: "Ana", savedAtMs: 1_788_000_000_000, sectionsReviewed: ["pain"] });
    expect(h.complete).toBe(true);
    expect(h.coversSinceMs).toBeNull();
    expect(previousFromHistory(h)).toMatchObject({ reportId: "f2", date: "2026-09-01", trainerName: "Ana" });
    expect(previousFromHistory(null)).toBeNull();
  });

  it("knows when the read stopped short of the client's first report", () => {
    const h = historyFromDocs(docs, 4);
    expect(h.complete).toBe(false);
    expect(h.coversSinceMs).toBe(1_780_000_000_000);
  });
});

describe("deriveAssessmentDeltas", () => {
  const reports = [
    report("r3", "2026-09-01", withSleep([9, 9, 9]), { trainerName: "Ana" }),
    report("r2", "2026-07-15", withSleep([5, 5, 5], { overallStressLevel: 4 })),
    report("r1", "2026-06-01", withSleep([5, 5, 5])),
  ];

  it("compares consecutive saved assessments, newest first, skipping what did not change", () => {
    const rows = deriveAssessmentDeltas(reports);
    expect(rows.map((r) => [r.reportId, r.sectionId, r.from, r.to, r.kind])).toEqual([
      ["r3", "sleepRecovery", 6, 11, "up"],
      ["r2", "stress", null, 4, "new"],
      ["r1", "sleepRecovery", null, 6, "new"],
    ]);
    expect(rows[0]).toMatchObject({ at: "2026-09-01", hasTime: false, byName: "Ana", source: "derived", pillarId: "recovery-fuel" });
  });

  it("carries an area forward past an assessment that did not ask it", () => {
    const rows = deriveAssessmentDeltas([
      report("r3", "2026-09-01", withSleep([5, 5, 5])),
      report("r2", "2026-07-15", { ...emptyAssessment(), overallStressLevel: 2 }),
      report("r1", "2026-06-01", withSleep([10, 10, 10])),
    ]);
    const sleep = rows.filter((r) => r.sectionId === "sleepRecovery");
    expect(sleep.map((r) => [r.reportId, r.from, r.to])).toEqual([
      ["r3", 12, 6],
      ["r1", null, 12],
    ]);
  });

  it("says nothing is new when older reports were not read", () => {
    const rows = deriveAssessmentDeltas(reports, { complete: false });
    expect(rows.map((r) => [r.reportId, r.sectionId, r.kind])).toEqual([["r3", "sleepRecovery", "up"]]);
  });

  it("orders a same-day pair by save time, not by list position", () => {
    const rows = deriveAssessmentDeltas([
      report("late", "2026-09-01", withSleep([10, 10, 10]), { savedAtMs: 2_000 }),
      report("early", "2026-09-01", withSleep([5, 5, 5]), { savedAtMs: 1_000 }),
    ]);
    expect(rows.find((r) => r.reportId === "late")).toMatchObject({ from: 6, to: 12 });
  });
});

describe("buildHistoryLog", () => {
  const noted: AssessmentChange[] = [
    { categoryId: "sleepRecovery", from: 6, to: 8, at: "2026-08-20T15:00:00.000Z", byName: "Ana", note: "Client finally purchased a new mattress; sleep improved" },
    { categoryId: "sleepRecovery", from: 8, to: 11, at: "2026-08-28T15:00:00.000Z", byName: "Ana" },
  ];
  const history: AssessmentHistory = {
    reports: [
      report("r2", "2026-08-15", { ...withSleep([9, 9, 9], { overallStressLevel: 6 }), changeLog: noted }),
      report("r1", "2026-06-01", withSleep([5, 5, 5], { overallStressLevel: 3 })),
    ],
    complete: true,
    coversSinceMs: null,
  };

  it("uses the recorded rows instead of the derived one for the same change", () => {
    const rows = buildHistoryLog({ history });
    const sleepR2 = rows.filter((r) => r.reportId === "r2" && r.sectionId === "sleepRecovery");
    expect(sleepR2.map((r) => [r.source, r.from, r.to])).toEqual([
      ["logged", 8, 11],
      ["logged", 6, 8],
    ]);
    expect(sleepR2[1].note).toBe("Client finally purchased a new mattress; sleep improved");
    // Stress was not recorded live in r2, so its derived row stays.
    expect(rows.find((r) => r.reportId === "r2" && r.sectionId === "stress")).toMatchObject({
      source: "derived",
      from: 3,
      to: 6,
    });
  });

  it("puts the open draft's changes on top, newest first", () => {
    const draft: AssessmentChange[] = [
      { categoryId: "hydration", from: null, to: 5, at: "2026-09-14T13:00:00.000Z" },
      { categoryId: "stress", from: 6, to: 3, at: "2026-09-14T13:05:00.000Z", note: "Work project ended" },
    ];
    const rows = buildHistoryLog({ history, draftId: "d1", draftChangeLog: draft });
    expect(rows.slice(0, 2).map((r) => [r.source, r.sectionId, r.kind])).toEqual([
      ["draft", "stress", "down"],
      ["draft", "hydration", "new"],
    ]);
    expect(rows.every((r, i) => i === 0 || rows[i - 1].atMs >= r.atMs)).toBe(true);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("shows a draft that already appears as a saved report only once", () => {
    const rows = buildHistoryLog({ history, draftId: "r2", draftChangeLog: noted });
    expect(rows.filter((r) => r.source === "draft")).toHaveLength(0);
  });

  it("still lists the draft's own changes when the saved history is unknown", () => {
    const rows = buildHistoryLog({
      history: null,
      draftChangeLog: [{ categoryId: "protein", from: 2, to: 5, at: "2026-09-14T13:00:00.000Z" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("draft");
  });

  it("ignores a row with an unreadable time rather than misplacing it", () => {
    const rows = buildHistoryLog({
      history: null,
      draftChangeLog: [{ categoryId: "protein", from: 2, to: 5, at: "not a time" }],
    });
    expect(rows).toEqual([]);
  });

  it("names the newest change in 'last updated', falling back to the last saved assessment", () => {
    const rows = buildHistoryLog({ history });
    expect(lastUpdated(rows, previousFromHistory(history))).toMatchObject({
      at: "2026-08-28T15:00:00.000Z",
      hasTime: true,
      byName: "Ana",
    });
    expect(lastUpdated([], previousFromHistory(history))).toMatchObject({ at: "2026-08-15", hasTime: false });
    expect(lastUpdated([], null)).toBeNull();
  });
});

describe("delta words", () => {
  it("names the direction", () => {
    expect(deltaKind(null, 4)).toBe("new");
    expect(deltaKind(4, null)).toBe("cleared");
    expect(deltaKind(4, 6)).toBe("up");
    expect(deltaKind(6, 4)).toBe("down");
    expect(deltaKind(4, 4)).toBe("same");
  });

  it("knows pain going down is good news and sleep going down is not", () => {
    expect(isImprovement("pain", 7, 3)).toBe(true);
    expect(isImprovement("sleepRecovery", 7, 3)).toBe(false);
    expect(isImprovement("sleepRecovery", null, 3)).toBeNull();
  });
});

/* ---------------- freshness ---------------- */

describe("freshness", () => {
  const NOW = new Date("2026-09-15T16:00:00Z").getTime();

  const history: AssessmentHistory = {
    reports: [
      report("r2", "2026-08-01", withSleep([5])),
      report("r1", "2026-03-01", { ...emptyAssessment(), overallStressLevel: 3 }, { sectionsReviewed: ["pain"] }),
    ],
    complete: true,
    coversSinceMs: null,
  };

  it("marks areas touched in the last 90 days fresh, older ones stale, and unasked ones never", () => {
    const touches = sectionTouches({ history });
    expect(freshnessOf("sleepRecovery", touches, history, NOW)).toBe("fresh");
    expect(freshnessOf("stress", touches, history, NOW)).toBe("stale");
    expect(freshnessOf("pain", touches, history, NOW)).toBe("stale");
    expect(freshnessOf("hydration", touches, history, NOW)).toBe("never");
  });

  it("counts the open draft's work as touched", () => {
    const touches = sectionTouches({
      history,
      draftChangeLog: [{ categoryId: "stress", from: 3, to: 5, at: new Date(NOW - DAY_MS).toISOString() }],
      draftDoneIds: ["hydration"],
      draftSavedAtMs: NOW - 1000,
    });
    expect(freshnessOf("stress", touches, history, NOW)).toBe("fresh");
    expect(freshnessOf("hydration", touches, history, NOW)).toBe("fresh");
  });

  it("says unknown, never 'never', when the history did not load", () => {
    expect(freshnessOf("hydration", new Map(), null, NOW)).toBe("unknown");
  });

  it("uses a partial read only when it reaches back past 90 days", () => {
    const partial = (coversSinceMs: number): AssessmentHistory => ({ reports: [], complete: false, coversSinceMs });
    expect(freshnessOf("hydration", new Map(), partial(NOW - 120 * DAY_MS), NOW)).toBe("stale");
    expect(freshnessOf("hydration", new Map(), partial(NOW - 30 * DAY_MS), NOW)).toBe("unknown");
  });

  it("puts a pillar's count into a sentence that never overclaims", () => {
    const recovery = ASSESSMENT_PILLARS[0];
    const touches = sectionTouches({ history });
    const p = pillarFreshness(recovery, (id) => freshnessOf(id, touches, history, NOW));
    expect(p).toEqual({ total: 4, fresh: 1, unknown: 0 });
    expect(pillarFreshnessSentence(p, "ready")).toBe("1 of 4 updated in the last 90 days");
    expect(pillarFreshnessSentence({ total: 4, fresh: 4, unknown: 0 }, "ready")).toBe("All 4 updated in the last 90 days");
    expect(pillarFreshnessSentence({ total: 4, fresh: 0, unknown: 0 }, "ready")).toBe("None of 4 updated in the last 90 days");
    expect(pillarFreshnessSentence({ total: 4, fresh: 1, unknown: 3 }, "error")).toBe("At least 1 of 4 updated in the last 90 days");
    expect(pillarFreshnessSentence({ total: 4, fresh: 0, unknown: 4 }, "error")).toMatch(/History unavailable/);
    expect(pillarFreshnessSentence({ total: 4, fresh: 0, unknown: 4 }, "loading")).toMatch(/Checking/);
  });

  it("has an empty baseline when there is no history", () => {
    expect(baselineFromHistory(null)).toEqual(EMPTY_BASELINE);
  });
});
