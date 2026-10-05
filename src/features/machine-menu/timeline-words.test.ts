import { describe, expect, it } from "vitest";
import { NO_WINDOW, ownedWindow } from "../../lib/history-claims";
import { sessionTotalOf } from "../../lib/session-total";
import { CUTOVER, LEG_PRESS_FIELDS, LEG_PRESS_HISTORY, LEG_PRESS_JOURNAL, STUDIO, TODAY, averyRead } from "./fixtures";
import { parseSettingHistory } from "./setting-history";
import { stepRuns } from "./step-runs";
import { foldFlags, newestWindow } from "./timeline-geometry";
import { buildTimelineModel, type TimelineInput, type TimelineLogInput, type TimelineSessionInput } from "./timeline-model";
import {
  CACHE_ONLY_LINE,
  EVENT_MAX_CHARS,
  OLDER_NOT_LOADED,
  OLDER_NOT_LOADED_LINES,
  ONE_SESSION_TAIL,
  RUNS_LIST_LABEL,
  PAGING_WORDS,
  PLOT_LABEL,
  READOUT_WORDS,
  RUNS_FOOT,
  SESSION_HEADS,
  beforeJourneyLine,
  boundaryWords,
  chartDescription,
  chartHeading,
  chartState,
  chartTitle,
  overviewLabel,
  runsButtonLabel,
  sessionsButtonLabel,
  sessionsCaption,
  showMoreLabel,
  wallLines,
  clipQuoted,
  columnDateLabel,
  columnFigures,
  dayWords,
  foldLabel,
  foldWords,
  gapSpan,
  idleLines,
  keyItems,
  laneWord,
  ordinal,
  readoutFor,
  runLines,
  sessionRow,
  stateLine,
  usageLine,
  type WordsContext,
} from "./timeline-words";

const CTX: WordsContext = { name: "Avery", today: TODAY, coverage: "partial" };

function avery(from: number, over: Partial<TimelineInput> = {}) {
  return buildTimelineModel({
    machineId: "leg-press",
    machineName: "Leg Press",
    fields: LEG_PRESS_FIELDS,
    ...averyRead(from),
    today: TODAY,
    unitStudioId: STUDIO,
    history: parseSettingHistory(LEG_PRESS_HISTORY, "avery"),
    journal: LEG_PRESS_JOURNAL,
    window: ownedWindow({ coverage: "partial", cutover: CUTOVER }),
    ...over,
  });
}

function small(rows: [string, Partial<TimelineLogInput>, Partial<TimelineSessionInput>?][], over: Partial<TimelineInput> = {}) {
  const sessions: TimelineSessionInput[] = rows.map(([day, , s], i) => ({
    id: `s${i}`,
    date: day,
    status: "Completed",
    hostedAtStudioId: STUDIO,
    trainerInitials: "SR",
    ...s,
  }));
  const logs: TimelineLogInput[] = rows.map(([, l], i) => ({ sessionId: `s${i}`, machineId: "m", weight: "100", reps: "10", ...l }));
  return buildTimelineModel({
    machineId: "m",
    machineName: "Torso Rotation",
    sessions,
    logs,
    today: TODAY,
    unitStudioId: STUDIO,
    everythingRead: false,
    moreToLoad: true,
    history: [],
    journal: [],
    ...over,
  });
}

describe("days and small words", () => {
  it("says the day with its weekday, and the year only when it isn't this one", () => {
    expect(dayWords("2026-09-17", TODAY)).toBe("Thu Sep 17");
    expect(dayWords("2025-09-09", TODAY)).toBe("Tue Sep 9 2025");
  });

  it("says ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"]);
  });

  it("says a gap in weeks from two weeks, else in days", () => {
    expect([gapSpan(49), foldLabel(49)]).toEqual(["7 weeks", "7 wk"]);
    expect([gapSpan(10), foldLabel(10)]).toEqual(["10 days", "10 d"]);
    expect(gapSpan(1)).toBe("1 day");
  });
});

describe("fold words, gated", () => {
  const fold = { index: 27, days: 49, fromDay: "2026-05-28", toDay: "2026-07-16", visits: 0, claimable: true };

  it("says 'away' only where Journey owns the timeline and nobody came in", () => {
    expect(foldWords(fold, "Leg Press")).toBe("7 weeks away");
    expect(foldWords({ ...fold, claimable: false }, "Leg Press")).toBe("7 weeks between May 28 and Jul 16");
  });

  it("counts the visits when the client came in on other machines", () => {
    expect(foldWords({ ...fold, visits: 5 }, "Leg Press")).toBe("7 weeks · 5 visits without Leg Press");
    expect(foldWords({ ...fold, visits: 1, claimable: false }, "Leg Press")).toBe("7 weeks · 1 visit without Leg Press");
  });

  it("follows canClaimGap through the model: no owned window, no break", () => {
    const m = avery(1, { window: NO_WINDOW });
    expect(foldWords(m.folds[0], m.machineName)).toBe("7 weeks between May 28 and Jul 16");
    expect(foldWords(avery(1).folds[0], "Leg Press")).toBe("7 weeks away");
  });
});

describe("the sentence and the block's state", () => {
  it("names the sample: the design page's three sentences for Avery", () => {
    expect(usageLine(avery(21), CTX, "Starting weight 80 lb, +25%")).toBe(
      "24 times in the sessions loaded here, Dec 15 2025 – Oct 1 2026 · Starting weight 80 lb, +25%",
    );
    expect(usageLine(avery(1), CTX)).toBe("34 times in Journey since Tue Sep 9 2025");
    expect(usageLine(avery(42), CTX)).toBe("15 times in the sessions loaded here, Apr 2 – Oct 1 2026");
  });

  it("says how to use it, and that older sessions aren't loaded yet when more can be", () => {
    expect(idleLines(avery(21), CTX).second).toBe("Tap a session for its set, set-up and notes. Older sessions aren't loaded yet.");
    expect(idleLines(avery(1), CTX).second).toBe("Tap a session for its set, set-up and notes.");
  });

  it("draws a chart only from two counted sessions, and says why not otherwise", () => {
    expect(chartState(avery(1))).toBe("chart");
    const one = small([["2026-09-24", {}]]);
    expect(chartState(one)).toBe("one");
    expect(stateLine("one", one, CTX)).toBe("Once in the sessions loaded here (Thu Sep 24 2026). The chart starts at the second time.");
    const practice = small([
      ["2026-09-01", { outcome: "practice" }],
      ["2026-09-08", { outcome: "practice" }],
      ["2026-09-15", { outcome: "practice", bloodFlow: true }],
    ]);
    expect(chartState(practice)).toBe("practice-only");
    expect(stateLine("practice-only", practice, CTX)).toBe("Practised here 3 times in the sessions loaded here; no counted set yet.");
    const skips = small([
      ["2026-09-01", { reps: undefined, outcome: "skipped" }],
      ["2026-09-08", { reps: undefined, outcome: "not_reached" }],
    ]);
    expect(chartState(skips)).toBe("uncounted");
    expect(stateLine("uncounted", skips, CTX)).toBe("2 times in the sessions loaded here, none counted yet.");
  });

  it("says nothing recorded, known elsewhere, loading and failed — never the first-time words", () => {
    const none = small([]);
    expect(chartState(none)).toBe("nothing");
    expect(chartState(none, { knownElsewhere: true })).toBe("elsewhere");
    expect(stateLine("elsewhere", none, CTX)).toBe("Done here in Journey before · not in the sessions loaded here");
    expect(chartState(small([], { readState: "loading" }))).toBe("loading");
    expect(stateLine("loading", none, CTX)).toBe("Loading Avery's sessions on Torso Rotation…");
    expect(chartState(avery(1, { readState: "failed" }))).toBe("failed");
    expect(stateLine("failed", avery(1), CTX)).toBe("Couldn't load Avery's sessions on Leg Press");
    expect(CACHE_ONLY_LINE).toBe("From what this iPad has saved; couldn't check for newer.");
  });

  it("ignores today's column for the state: it is the Now Bar's", () => {
    const m = small(
      [
        ["2026-09-24", {}],
        [TODAY, { reps: "9" }, { status: "In-Progress" }],
      ],
      { runningSessionId: "s1" },
    );
    expect(chartState(m)).toBe("one");
  });
});

describe("the key: only the marks in view", () => {
  it("lists Avery's newest page", () => {
    const m = avery(1);
    const view = newestWindow(36, foldFlags(m), 664, true);
    expect(keyItems(m, view).map((k) => k.words)).toEqual([
      "max strength",
      "needs improvement",
      "Heads up",
      "set-up changed",
      "shaded = same set-up",
      "long gap, folded",
    ]);
  });

  it("says skipped and blood flow where they are in view", () => {
    const m = avery(1);
    const words = keyItems(m, { start: 10, end: 17, wall: false }).map((k) => k.words);
    expect(words).toContain("skipped");
    expect(words).toContain("blood flow, not counted");
    expect(words).toContain("note");
    expect(words).not.toContain("Heads up");
  });
});

describe("the readout for a tapped session", () => {
  it("says the design page's Sep 17", () => {
    const r = readoutFor(avery(1), 34, CTX)!;
    expect(r.rowA).toBe("Thu Sep 17 · AC · 4th machine of 7");
    expect(r.figures).toBe("100 lb × 9");
    expect(r.mark).toBeNull();
    expect(r.settings).toBe("Seat 5 · Back pad 2 · Foot plate High (as saved)");
    expect(r.event).toEqual({ glyph: "headsUp", text: "Heads up · Ana: “Pushes through the toes near the end of the set; cue heels down.”" });
    expect(r.noteId).toBe("journal:n3");
  });

  it("puts a session number in only through the gate", () => {
    expect(readoutFor(avery(1), 34, { ...CTX, quotableNumbers: true })!.rowA).toBe("Thu Sep 17 · #68 · AC · 4th machine of 7");
  });

  it("says the set-up change before a session, with its reason and who", () => {
    const r = readoutFor(avery(1), 31, CTX)!;
    expect(r.event).toEqual({ glyph: "setup", text: "Set-up changed before this session: Back pad 3 → 2 · Comfort or fit · Theo" });
    expect(readoutFor(avery(1), 35, CTX)!.mark).toBe("Max strength");
  });

  it("says the fold, the hold, the skip, blood flow and an empty snapshot", () => {
    const m = avery(1);
    expect(readoutFor(m, 27, CTX)!.event?.text).toBe("7 weeks away before this session");
    expect(readoutFor(m, 20, CTX)!.figures).toBe("94 lb · held 1:30");
    const skip = readoutFor(m, 16, CTX)!;
    expect(skip.figures).toBe("Skipped · Pain or injury");
    expect(skip.event?.text).toBe("Resolved note · Ana: “Left knee sore going in; Leg Press skipped today.”");
    const flow = readoutFor(m, 12, CTX)!;
    expect(flow.figures).toBe("Blood flow · 70 lb × 14 · recorded, not counted");
    expect(flow.event?.text).toMatch(/^Blood flow: a light set/);
    expect(readoutFor(m, 4, CTX)!.settings).toBe("Settings not recorded");
    expect(readoutFor(m, 8, CTX)!.mark).toBe("Needs improvement");
  });

  it("says both sides, never averaged, and both of two sets", () => {
    const m = small([
      ["2026-09-08", { weight: "42", reps: undefined, outcome: "performed", repsLeft: 9, repsRight: 9 }],
      ["2026-09-17", { side: "Left", weight: "40", reps: "10" }],
      ["2026-10-01", { weight: "96", reps: "11" }],
    ]);
    // A second log on the same sessions:
    const two = buildTimelineModel({
      machineId: "m",
      machineName: "Torso Rotation",
      sessions: [
        { id: "a", date: "2026-09-17", status: "Completed" },
        { id: "b", date: "2026-10-01", status: "Completed" },
      ],
      logs: [
        { sessionId: "a", machineId: "m", side: "Left", weight: "40", reps: "10" },
        { sessionId: "a", machineId: "m", side: "Right", weight: "42", reps: "9", repQuality: 3 },
        { sessionId: "b", machineId: "m", weight: "96", reps: "11" },
        { sessionId: "b", machineId: "m", weight: "100", reps: "8" },
      ],
      today: TODAY,
      everythingRead: true,
      moreToLoad: false,
      history: [],
      journal: [],
    });
    expect(readoutFor(m, 0, CTX)!.figures).toBe("42 lb · L 9 · R 9");
    expect(columnFigures(two.columns[0])).toBe("L 40 lb × 10 · R 42 lb × 9");
    expect(readoutFor(two, 0, CTX)!.mark).toBe("R: Max strength");
    expect(columnFigures(two.columns[1])).toBe("100 lb × 8 · 96 lb × 11");
  });

  it("says another studio, and today", () => {
    const m = small(
      [
        ["2026-09-08", {}, { hostedAtStudioId: "solon" }],
        [TODAY, { reps: "9" }, { status: "In-Progress" }],
      ],
      { runningSessionId: "s1" },
    );
    expect(readoutFor(m, 0, { ...CTX, studioNames: { solon: "Solon" } })!.rowA).toBe("Tue Sep 8 · SR · at Solon");
    expect(readoutFor(m, 1, CTX)!.rowA).toBe("Today · SR");
    expect(columnDateLabel(m.columns[1])).toBe("Today");
    expect(columnDateLabel(m.columns[0])).toBe("Sep 8");
  });

  it("cuts only inside the quoted words, never a name", () => {
    const long = "word ".repeat(40).trim();
    const line = clipQuoted("Heads up · Ana: ", long);
    expect(line.startsWith("Heads up · Ana: “")).toBe(true);
    expect(line.endsWith("…”")).toBe(true);
    expect(line.length).toBeLessThanOrEqual(EVENT_MAX_CHARS);
    expect(clipQuoted("Note · Ana: ", "short")).toBe("Note · Ana: “short”");
    const b = boundaryWords({
      index: 1,
      changes: [{ label: "Seat", from: "4", to: "5" }],
      reason: "x".repeat(200),
      reasonUnread: false,
      trainerName: "Theo Marsh",
      sameDay: true,
      fromHistory: true,
      fromSnapshot: false,
    });
    expect(b.startsWith("Set-up changed on the day of this session: Seat 4 → 5 · ")).toBe(true);
    expect(b.endsWith("… · Theo")).toBe(true);
  });

  it("cuts at the end of a word where one is near, so a narrow readout never says half a word", () => {
    const quote = "Pushes through the toes near the end of the set; cue heels down.";
    expect(clipQuoted("Heads up · Ana: ", quote, 44)).toBe("Heads up · Ana: “Pushes through the toes…”");
    // One long word: cut where the room ends, as before.
    expect(clipQuoted("Note · ", "x".repeat(60), 20)).toBe(`Note · “${"x".repeat(10)}…”`);
  });

  it("says a change the snapshots show without a recorded reason, or one that couldn't be read", () => {
    const base = { index: 1, changes: [{ label: "Seat", from: "4", to: "5" }], reason: null, trainerName: null, sameDay: false, fromHistory: false, fromSnapshot: true };
    expect(boundaryWords({ ...base, reasonUnread: false })).toBe("Set-up differs from the session before: Seat 4 → 5 (no reason recorded)");
    expect(boundaryWords({ ...base, reasonUnread: true })).toBe("Set-up differs from the session before: Seat 4 → 5 (reason couldn't be loaded)");
  });
});

describe("lanes and the SVG's words", () => {
  it("says a skip's short reason (never red words, just the word) and not reached as a dash", () => {
    const m = avery(1);
    expect(laneWord(m.columns[16])).toBe("pain");
    expect(laneWord(m.columns[15])).toBeNull();
    const nr = small([["2026-09-08", { reps: undefined, outcome: "not_reached" }]]);
    expect(laneWord(nr.columns[0])).toBe("–");
  });

  it("titles and describes the chart, pointing at the lists", () => {
    const m = avery(1);
    const view = newestWindow(36, foldFlags(m), 664, true);
    expect(chartTitle(m)).toBe("Leg Press: weight and reps, session by session");
    expect(chartDescription(m, view, CTX)).toBe(
      "12 sessions shown, May 4 to Oct 1 2026. Weight 92 to 100 lb. Every number is in the two lists under the chart.",
    );
  });
});

describe("Every session", () => {
  it("says a row, the set-up only where it changed, and 'not recorded' for an empty snapshot", () => {
    const m = avery(1);
    expect(sessionRow(m, 31, CTX)).toEqual({
      sessionId: "s-2026-08-18",
      day: "Tue Aug 18",
      number: null,
      lb: "98",
      effort: "8",
      mark: "",
      outcome: "Counted",
      setup: "Back pad 2, was 3",
      trainer: "TM",
      notes: "",
    });
    expect(sessionRow(m, 4, CTX)!.setup).toBe("not recorded");
    expect(sessionRow(m, 16, CTX)).toMatchObject({ lb: "—", outcome: "Skipped (pain)", notes: "Resolved note" });
    expect(sessionRow(m, 12, CTX)!.outcome).toBe("Blood flow, not counted");
    expect(sessionRow(m, 20, CTX)!.effort).toBe("held 1:30");
  });
});

describe("Weight by weight, said", () => {
  it("reads Avery's fourteen runs newest first, with the three dividers where they happened", () => {
    const m = avery(1);
    expect(runLines(stepRuns(m), m, CTX).map((l) => l.text)).toEqual([
      "100 lb · 3 times · Sep 8 – Oct 1 2026 · 8, 9, 11 (max strength)",
      "98 lb · 2 times · Aug 18 – Aug 27 · 8, 10",
      "Set-up changed before Aug 18: Back pad 3 → 2 (Comfort or fit)",
      "96 lb · 2 times · Jul 30 – Aug 6 · 8 (needs improvement), 10",
      "94 lb · once · Jul 23 · 8",
      "92 lb · once · Jul 16 · 9",
      "7 weeks away",
      "98 lb · once · May 28 · 8",
      "96 lb · 3 times · Apr 23 – May 14 · 8, 9 (needs improvement), 10",
      "94 lb · 4 times · Mar 12 – Apr 13 · 8, held 1:30, 9, 11 (max strength)",
      "92 lb · 3 times · Feb 2 – Mar 3 · 8, 8, 10 · skipped Feb 11 (pain)",
      "90 lb · 2 times · Jan 13 – Jan 22 2026 · 9, 10",
      "Set-up changed before Jan 13: Seat 4 → 5 (Range of motion)",
      "90 lb · 2 times · Dec 15 – Dec 26 2025 · 8, 9 · blood flow Jan 3, not counted",
      "88 lb · 4 times · Nov 6 – Dec 4 · 8, 9, 9 (needs improvement), 11 (max strength)",
      "86 lb · 3 times · Oct 8 – Oct 28 · 8, 9, 10",
      "84 lb · 3 times · Sep 9 – Sep 29 2025 · 8, 9, 11 (max strength)",
    ]);
  });

  it("reads a long run first … last, with the fewest and the most", () => {
    const days = ["2026-08-01", "2026-08-05", "2026-08-09", "2026-08-13", "2026-08-17", "2026-08-21", "2026-08-25"];
    const reps = ["8", "9", "12", "7", "10", "11", "9"];
    const m = small(days.map((d, i) => [d, { reps: reps[i] }] as [string, Partial<TimelineLogInput>]));
    const [line] = runLines(stepRuns(m), m, CTX);
    expect(line.text).toBe("100 lb · 7 times · Aug 1 – Aug 25 2026 · 8 … 9 · fewest 7, most 12");
  });
});

describe("before Journey: about the client, never one machine", () => {
  const client = { sessionCount: 70, clientsNumberOfVisitsAtSite: 372, firstSessionDate: "2025-09-09" };

  it("says Mindbody's guess word for word as Account does", () => {
    expect(beforeJourneyLine(sessionTotalOf(client, "partial"), "partial")).toBe(
      "About 302 sessions before Journey (from Mindbody, not yet confirmed). No machine detail for those.",
    );
  });

  it("says a confirmed number, nothing figured, and nothing at all for a whole story", () => {
    const prior = { sessions: 302, through: "2025-09-08", source: "mindbody" as const };
    expect(beforeJourneyLine(sessionTotalOf({ ...client, priorHistory: prior }, "partial"), "partial")).toBe(
      "302 sessions before Journey (confirmed)",
    );
    expect(beforeJourneyLine(sessionTotalOf({ sessionCount: 12 }, "unknown"), "unknown")).toBe("Anything before Journey isn't on this chart.");
    expect(beforeJourneyLine(null)).toBe("Anything before Journey isn't on this chart.");
    expect(beforeJourneyLine(sessionTotalOf(client, "complete"), "complete")).toBeNull();
  });

  it("never says 'at the studio'", () => {
    const lines = [
      beforeJourneyLine(sessionTotalOf(client, "partial"), "partial"),
      beforeJourneyLine(sessionTotalOf({ ...client, priorHistory: { sessions: 1, through: "2025-09-08", source: "paper" } }, "partial"), "partial"),
      beforeJourneyLine(null),
    ];
    for (const l of lines) expect(l).not.toMatch(/at the studio/i);
  });
});

describe("the block's own words", () => {
  it("heads the block with the client's display name and no pronoun", () => {
    expect(chartHeading("Avery")).toBe("How Avery has done here");
  });

  it("counts the two lists on their buttons", () => {
    expect(sessionsButtonLabel(26)).toBe("Every session (26)");
    expect(runsButtonLabel(11)).toBe("Weight by weight (11)");
    expect(showMoreLabel(20)).toBe("Show 20 more");
  });

  it("says the unread older sessions in two lines that read as the one sentence", () => {
    expect(OLDER_NOT_LOADED_LINES.join(" ")).toBe(OLDER_NOT_LOADED);
  });

  it("labels the start wall with the history words, in two lines", () => {
    expect(wallLines("partial")).toEqual(["First in", "Journey"]);
    expect(wallLines("complete")).toEqual(["First", "performed"]);
    expect(wallLines()).toEqual(["First in", "Journey"]);
  });

  it("says what the overview strip spans, from the oldest loaded column to today", () => {
    expect(overviewLabel(avery(21), TODAY)).toBe(
      "Every loaded session on calendar time, Dec 15 2025 to today. The box is what the chart shows; tap or drag to move it.",
    );
    expect(overviewLabel(small([]), TODAY)).toBe("");
  });

  it("ends the one-session sentence the same way the state line does", () => {
    const one = small([["2026-09-24", { outcome: "performed" }]]);
    expect(stateLine("one", one, CTX)).toBe(`Once in the sessions loaded here (Thu Sep 24 2026). ${ONE_SESSION_TAIL}`);
  });
});

describe("guard words: a log, never a coach", () => {
  const FORBIDDEN = /\b(best|started|her|she|should|try|ready)\b|next weight|increase to/i;

  it("never ranks, coaches or guesses a pronoun, anywhere the card speaks", () => {
    const said: string[] = [];
    for (const from of [1, 21, 42]) {
      const m = avery(from);
      const view = newestWindow(m.columns.length, foldFlags(m), 664, true);
      said.push(usageLine(m, CTX) ?? "", idleLines(m, CTX).second, chartTitle(m), chartDescription(m, view, CTX));
      said.push(...keyItems(m, view).map((k) => k.words));
      m.columns.forEach((c) => {
        const r = readoutFor(m, c.index, CTX)!;
        said.push(r.rowA, r.figures, r.mark ?? "", r.settings, r.event?.text ?? "");
        const row = sessionRow(m, c.index, CTX)!;
        said.push(...Object.values(row).map((v) => v ?? ""));
      });
      said.push(...runLines(stepRuns(m), m, CTX).map((l) => l.text));
      for (const f of m.folds) said.push(foldWords(f, m.machineName));
    }
    for (const s of ["loading", "failed", "elsewhere", "practice-only", "uncounted", "one"] as const) {
      said.push(stateLine(s, avery(1), CTX) ?? "");
    }
    said.push(beforeJourneyLine(sessionTotalOf({ sessionCount: 70, clientsNumberOfVisitsAtSite: 372, firstSessionDate: "x" }, "partial"), "partial") ?? "");
    // The block's own words (the chart block, phase 4). Retry buttons say
    // "Try again" — a button, not advice — and are not scanned here.
    said.push(chartHeading("Avery"), sessionsButtonLabel(26), runsButtonLabel(11), showMoreLabel(20), ONE_SESSION_TAIL, PLOT_LABEL, RUNS_FOOT, RUNS_LIST_LABEL);
    said.push(...OLDER_NOT_LOADED_LINES);
    said.push(...Object.values(PAGING_WORDS), ...Object.values(READOUT_WORDS), ...Object.values(SESSION_HEADS));
    said.push(...wallLines("partial"), ...wallLines("complete"), overviewLabel(avery(21), TODAY), sessionsCaption("Leg Press"));
    const all = said.join("\n");
    expect(all.length).toBeGreaterThan(1000);
    expect(all).not.toMatch(FORBIDDEN);
  });
});
