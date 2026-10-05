/**
 * THE MACHINE MENU — every sentence the Staircase says, in one place.
 *
 * The rules, each held by the test beside this file:
 *   - Each figure is said ONCE, with one definition. "Heaviest / Lightest",
 *     never "Best / Lowest"; "First in Journey", never "Started".
 *   - Sentences, not scores: the count names its sample ("in the sessions
 *     loaded here"), and below MIN_PROGRESSION_POINTS the card says a
 *     sentence instead of drawing a line.
 *   - Every claim about the client's past goes through lib/history-claims.ts
 *     (the count, "#N", the first-time words), lib/session-total.ts (what
 *     came before Journey) and `canClaimGap` (a break), with the home
 *     studio's coverage.
 *   - Nothing tells the trainer what to do next: no "should", "try", "next
 *     weight", "ready", "increase to". The card is a log, never a coach.
 *   - No "her" or "she" about a client: a name, or no pronoun at all.
 *   - The before-Journey line is about the CLIENT, never one machine, and
 *     never says "at the studio": Mindbody counts per site, and Westlake
 *     shares site 29068 with Strongsville and Willoughby.
 *
 * PURE.
 */
import { historyStartWords, machineUsageSentence, sessionNumberTag } from "../../lib/history-claims";
import type { HistoryCoverage } from "../../lib/prior-history";
import { MINDBODY_GUESS_WORDS, beforeJourneyGuess, type SessionTotal } from "../../lib/session-total";
import { BLOOD_FLOW_GLOSS, BLOOD_FLOW_LABEL, SKIP_REASON_LABEL, SKIP_REASON_SHORT } from "../../lib/set-outcome";
import { formatSeconds, formatShortDate } from "../journey-grid/stats";
import { pairsWords } from "./setting-history";
import type { WeightRun } from "./step-runs";
import type { ColumnMark, ColumnSide, FoldInfo, LaneNote, SetupBoundary, TimelineColumn, TimelineModel } from "./timeline-model";
import type { ViewWindow } from "./timeline-geometry";

export interface WordsContext {
  /** The client's display name (nickname-aware), the same in both doors. */
  name: string;
  /** The studio day today. */
  today: string;
  /** The client's coverage, judged by the HOME studio's cutover. */
  coverage?: HistoryCoverage;
  /** `canQuoteSessionNumber(client, coverage)`: a "#N" only when true. */
  quotableNumbers?: boolean;
  /** Studio id → name, for "at Solon". */
  studioNames?: Readonly<Record<string, string>>;
}

/* ------------------------------------------------------------------ *
 * Days and small words
 * ------------------------------------------------------------------ */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Thu Sep 17", with the year when it isn't this one ("Tue Sep 9 2025"). */
export function dayWords(day: string, today: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const dow = WEEKDAYS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()];
  return `${dow} ${formatShortDate(day)}${m[1] !== today.slice(0, 4) ? ` ${m[1]}` : ""}`;
}

/** "Sep 17", with the year when it isn't this one. */
function shortWithYear(day: string, today: string): string {
  return `${formatShortDate(day)}${day.slice(0, 4) !== today.slice(0, 4) ? ` ${day.slice(0, 4)}` : ""}`;
}

/** "1st", "2nd", "3rd", "4th", "11th". */
export function ordinal(n: number): string {
  const v = n % 100;
  const s = v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

const times = (n: number): string => (n === 1 ? "once" : `${n} times`);
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;
const firstName = (full: string | null | undefined): string => (full ?? "").trim().split(/\s+/)[0] ?? "";

export const MARK_WORDS: Record<Exclude<ColumnMark, null>, string> = {
  max: "Max strength",
  poor: "Needs improvement",
};

/* ------------------------------------------------------------------ *
 * Folds
 * ------------------------------------------------------------------ */

/** "7 weeks", or "10 days" under two weeks. */
export function gapSpan(days: number): string {
  return days >= 14 ? `${Math.round(days / 7)} weeks` : plural(days, "day");
}

/** The fold's mark in the date row: "7 wk", or "10 d" under two weeks. */
export function foldLabel(days: number): string {
  return days >= 14 ? `${Math.round(days / 7)} wk` : `${days} d`;
}

/**
 * What a fold says. "7 weeks away" only where Journey owns the timeline AND
 * no session on any machine fell in the gap; "7 weeks · 5 visits without
 * Leg Press" when the client came in; otherwise the plain dates. Never
 * "Drifting" or "Lapsed": those are Operations' words about a client.
 */
export function foldWords(fold: FoldInfo, machineName: string): string {
  const span = gapSpan(fold.days);
  if (fold.visits > 0) return `${span} · ${plural(fold.visits, "visit")} without ${machineName}`;
  if (fold.claimable) return `${span} away`;
  return `${span} between ${formatShortDate(fold.fromDay)} and ${formatShortDate(fold.toDay)}`;
}

/* ------------------------------------------------------------------ *
 * The block's state, and the idle readout
 * ------------------------------------------------------------------ */

export type ChartState =
  /** The first read hasn't answered (the profile opened before Journey had loaded). */
  | "loading"
  | "failed"
  /** Nothing on this machine in what was read. */
  | "nothing"
  /** Nothing loaded, but a running total knows the machine was done before. */
  | "elsewhere"
  /** Only practice or blood flow: dashed chips, no line. */
  | "practice-only"
  /** Only skips or not reached: no chart. */
  | "uncounted"
  /** One counted session: a sentence, no chart. */
  | "one"
  | "chart";

/**
 * What the block draws. `knownElsewhere`: `client.machineStats` or
 * `currentMachineMetrics` knows the machine — evidence only, never a count.
 */
export function chartState(model: TimelineModel, opts: { knownElsewhere?: boolean } = {}): ChartState {
  const past = model.columns.filter((c) => !c.isToday);
  if (model.readState === "failed") return "failed";
  if (model.readState === "loading" && past.length === 0) return "loading";
  if (past.length === 0) return opts.knownElsewhere ? "elsewhere" : "nothing";
  if (model.counted.count === 0) return model.practiceCount === past.length ? "practice-only" : "uncounted";
  if (model.counted.count === 1) return "one";
  return "chart";
}

/** The count, with the progress figure after it when there is one (progress-figure.ts builds it). */
export function usageLine(model: TimelineModel, ctx: WordsContext, progress?: string | null): string | null {
  const sentence = machineUsageSentence({
    count: model.counted.count,
    firstDay: model.counted.firstDay,
    lastDay: model.counted.lastDay,
    everythingRead: model.everythingRead,
    coverage: ctx.coverage,
  });
  if (!sentence) return null;
  return progress ? `${sentence} · ${progress}` : sentence;
}

/** The sentence the block shows in place of a chart, for the states that have one. */
export function stateLine(state: ChartState, model: TimelineModel, ctx: WordsContext, progress?: string | null): string | null {
  const where = model.everythingRead ? "in Journey" : "in the sessions loaded here";
  const past = model.columns.filter((c) => !c.isToday).length;
  switch (state) {
    case "loading":
      return `Loading ${ctx.name}'s sessions on ${model.machineName}…`;
    case "failed":
      return `Couldn't load ${ctx.name}'s sessions on ${model.machineName}`;
    case "elsewhere":
      return "Done here in Journey before · not in the sessions loaded here";
    case "practice-only":
      return `Practised here ${times(model.practiceCount)} ${where}; no counted set yet.`;
    case "uncounted":
      return past === 1 ? `Once ${where}, not counted.` : `${past} times ${where}, none counted yet.`;
    case "one":
      return `${usageLine(model, ctx, progress)}. ${ONE_SESSION_TAIL}`;
    default:
      return null;
  }
}

/** The idle readout's two lines: the count, then how to use the chart. */
export function idleLines(model: TimelineModel, ctx: WordsContext, progress?: string | null): { first: string | null; second: string } {
  return {
    first: usageLine(model, ctx, progress),
    second: `Tap a session for its set, set-up and notes.${model.moreToLoad ? " Older sessions aren't loaded yet." : ""}`,
  };
}

/** The extra line when what was drawn came only from this iPad's saved copy. */
export const CACHE_ONLY_LINE = "From what this iPad has saved; couldn't check for newer.";
export const NOTES_UNREAD_LINE = "Notes couldn't be loaded";
export const REASON_UNREAD = "reason couldn't be loaded";
export const OLDER_NOT_LOADED = "Older sessions aren't loaded yet";
/** The same words in two lines, for the room left of the chart's oldest column. */
export const OLDER_NOT_LOADED_LINES: readonly [string, string] = ["Older sessions", "aren't loaded yet"];
/** What the one-session sentence ends with. */
export const ONE_SESSION_TAIL = "The chart starts at the second time.";

/* ------------------------------------------------------------------ *
 * The block's own words: its heading, its buttons, its lists
 * ------------------------------------------------------------------ */

/** The chart block's heading: "How Avery has done here". */
export function chartHeading(name: string): string {
  return `How ${name} has done here`;
}

/** The two list buttons under the chart. */
export const sessionsButtonLabel = (n: number): string => `Every session (${n})`;
export const runsButtonLabel = (n: number): string => `Weight by weight (${n})`;

/** The controls row under the chart, and Load older's states. */
export const PAGING_WORDS = {
  older: "Older",
  newer: "Newer",
  loadOlder: "Load older",
  loading: "Loading…",
  failed: "Couldn't load older sessions",
  offline: "Can't load older sessions offline",
  /** The "a running total knows it" state's button. */
  loadThem: "Load them",
} as const;

/** The readout's buttons, as a screen reader hears them. */
export const READOUT_WORDS = {
  openNote: "Open note",
  older: "Older session",
  newer: "Newer session",
  close: "Back to the summary",
} as const;

/** The plot, as a screen reader hears it before the arrow keys. */
export const PLOT_LABEL = "Chart of every loaded session. Left and right arrow keys step through sessions.";

/**
 * The start wall's label in two lines: the start of the RECORD, in the
 * history words the Journey grid's rail uses ("Start of / Journey", or
 * "Start of / history" for a client Journey holds the whole story of). It
 * marks where the record begins, never a set: the column beside it may be a
 * practice or a skip, so it never says "First performed" (the readout's
 * count names the first counted day).
 */
export function wallLines(coverage?: HistoryCoverage): [string, string] {
  const words = historyStartWords(coverage).label;
  const at = words.lastIndexOf(" ");
  return at > 0 ? [words.slice(0, at), words.slice(at + 1)] : [words, ""];
}

/** The overview strip, said: what it spans and what its box is. */
export function overviewLabel(model: TimelineModel, today: string): string {
  const first = model.columns[0];
  if (!first) return "";
  return `Every loaded session on calendar time, ${shortWithYear(first.day, today)} to today. The box is what the chart shows; tap or drag to move it.`;
}

/** Every session's table: its caption and its column heads. */
export const sessionsCaption = (machineName: string): string => `Every session on ${machineName}, newest first`;
export const SESSION_HEADS = {
  day: "Day",
  number: "Session",
  lb: "lb",
  effort: "Reps",
  mark: "Mark",
  outcome: "Outcome",
  setup: "Set-up",
  trainer: "Trainer",
  notes: "Notes",
} as const;
export const showMoreLabel = (n: number): string => `Show ${n} more`;

/** Weight by weight's list, as a screen reader hears it, and the line under it. */
export const RUNS_LIST_LABEL = "Weight by weight, newest first";
export const RUNS_FOOT = "Counts only: practice and skips are noted, never counted.";

/* ------------------------------------------------------------------ *
 * The key
 * ------------------------------------------------------------------ */

export type KeyGlyph = "max" | "poor" | "critical" | "headsUp" | "note" | "skip" | "practice" | "bloodFlow" | "setup" | "shade" | "fold";

const NOTE_GLYPH: Record<LaneNote["loudness"], KeyGlyph> = { critical: "critical", elevated: "headsUp", standard: "note" };

/** Only the marks in view, in a fixed order. */
export function keyItems(model: TimelineModel, view: ViewWindow): { glyph: KeyGlyph; words: string }[] {
  const inView = (i: number) => i >= view.start && i <= view.end;
  const cols = model.columns.filter((c) => inView(c.index));
  const notes = model.notes.filter((n) => n.place.kind === "column" ? inView(n.place.index) : n.place.kind === "between" ? inView(n.place.after) || inView(n.place.after + 1) : n.place.kind === "edge" && view.end === model.columns.length - 1);
  const marks = (m: ColumnMark) => cols.some((c) => c.mark === m || c.sides?.L?.mark === m || c.sides?.R?.mark === m);
  const glyphs = new Set(notes.map((n) => (n.resolved ? "note" : NOTE_GLYPH[n.loudness])));
  const out: { glyph: KeyGlyph; words: string }[] = [];
  if (marks("max")) out.push({ glyph: "max", words: "max strength" });
  if (marks("poor")) out.push({ glyph: "poor", words: "needs improvement" });
  if (glyphs.has("critical")) out.push({ glyph: "critical", words: "Critical" });
  if (glyphs.has("headsUp")) out.push({ glyph: "headsUp", words: "Heads up" });
  if (glyphs.has("note")) out.push({ glyph: "note", words: "note" });
  if (cols.some((c) => c.outcome === "skipped")) out.push({ glyph: "skip", words: "skipped" });
  if (cols.some((c) => c.practice === "practice")) out.push({ glyph: "practice", words: "practice, not counted" });
  if (cols.some((c) => c.practice === "bloodFlow")) out.push({ glyph: "bloodFlow", words: "blood flow, not counted" });
  if (cols.some((c) => model.boundaryAt[c.index])) out.push({ glyph: "setup", words: "set-up changed" });
  if (model.stretches.filter((s) => s.end >= view.start && s.start <= view.end).length >= 2) {
    out.push({ glyph: "shade", words: "shaded = same set-up" });
  }
  if (cols.some((c) => c.index > view.start && model.foldAt[c.index])) out.push({ glyph: "fold", words: "long gap, folded" });
  return out;
}

/* ------------------------------------------------------------------ *
 * A set, said
 * ------------------------------------------------------------------ */

const effortOf = (reps: number | null, seconds: number | null): string | null =>
  seconds !== null ? `held ${formatSeconds(seconds)}` : reps !== null ? String(reps) : null;

function sidesFigures(w: number | null, L: ColumnSide | null, R: ColumnSide | null): string {
  const part = (s: ColumnSide | null, side: "L" | "R") => {
    if (!s) return `${side} not recorded`;
    const e = effortOf(s.reps, s.seconds);
    return `${side} ${e ?? "—"}`;
  };
  if (L && R && L.weight !== null && R.weight !== null && L.weight !== R.weight) {
    const one = (s: ColumnSide) => {
      const e = effortOf(s.reps, s.seconds);
      return `${s.side} ${s.weight} lb${e === null ? "" : s.seconds !== null ? ` · ${e}` : ` × ${e}`}`;
    };
    return `${one(L)} · ${one(R)}`;
  }
  return `${w === null ? "" : `${w} lb · `}${part(L, "L")} · ${part(R, "R")}`;
}

/** One set's figures: "100 lb × 9", "94 lb · held 1:30", "100 lb". */
export function setFigures(weight: number | null, reps: number | null, seconds: number | null): string {
  if (weight === null) return effortOf(reps, seconds) ?? "No load recorded";
  if (seconds !== null) return `${weight} lb · held ${formatSeconds(seconds)}`;
  return reps !== null ? `${weight} lb × ${reps}` : `${weight} lb`;
}

/** The big line of the readout: "100 lb × 9", "94 lb · held 1:30", "42 lb · L 9 · R 9", "Skipped · Pain or injury". */
export function columnFigures(col: TimelineColumn): string {
  switch (col.outcome) {
    case "skipped":
      return col.skipReason && col.skipReason !== "unknown" ? `Skipped · ${SKIP_REASON_LABEL[col.skipReason]}` : "Skipped · no reason recorded";
    case "not_reached":
      return "Not reached";
    case "practice": {
      const label = col.practice === "bloodFlow" ? BLOOD_FLOW_LABEL : "Practice";
      const figs = col.sides ? sidesFigures(col.weight, col.sides.L, col.sides.R) : setFigures(col.weight, col.reps, col.seconds);
      return `${label} · ${figs} · recorded, not counted`;
    }
    default: {
      if (col.sides) return sidesFigures(col.weight, col.sides.L, col.sides.R);
      if (col.performedSets.length > 1) {
        return col.performedSets.map((s) => setFigures(s.weight, s.reps, s.seconds)).join(" · ");
      }
      return setFigures(col.weight, col.reps, col.seconds);
    }
  }
}

/** The mark, in words, only when there is one ("Max strength"; by side when the sides differ). */
export function columnMarkWords(col: TimelineColumn): string | null {
  if (col.outcome !== "performed") return null;
  if (col.sides) {
    const parts = [col.sides.L, col.sides.R]
      .filter((s): s is ColumnSide => !!s && s.mark !== null && s.outcome === "performed")
      .map((s) => `${s.side}: ${MARK_WORDS[s.mark as "max" | "poor"]}`);
    return parts.length ? parts.join(" · ") : null;
  }
  return col.mark ? MARK_WORDS[col.mark] : null;
}

/** The settings in force for a column, as saved: "Seat 5 · Back pad 2 · Foot plate High (as saved)". */
export function settingsWords(col: TimelineColumn, fields: TimelineModel["fields"]): string {
  if (!col.settings) return "Settings not recorded";
  const keys = Object.keys(col.settings);
  const ordered = [
    ...fields.filter((f) => keys.includes(f.key)).map((f) => [f.label, col.settings![f.key]] as const),
    ...keys.filter((k) => !fields.some((f) => f.key === k)).map((k) => [k, col.settings![k]] as const),
  ];
  return `${ordered.map(([l, v]) => `${l} ${v}`).join(" · ")} (as saved)`;
}

/* ------------------------------------------------------------------ *
 * The readout for a tapped session
 * ------------------------------------------------------------------ */

/** How long the event line may run before its quoted words are cut. */
export const EVENT_MAX_CHARS = 90;

/**
 * "Ana: "Pushes through the toes…"" — the head (whose name comes first) is
 * never cut; only the quoted words are, with "…".
 */
export function clipQuoted(head: string, quote: string, max: number = EVENT_MAX_CHARS): string {
  const whole = `${head}“${quote}”`;
  if (whole.length <= max) return whole;
  const room = max - head.length - 3;
  if (room <= 0) return `${head}“…”`;
  return `${head}“${cutAt(quote, room)}…”`;
}

/**
 * The first `room` characters, ending at a word where one ends in the second
 * half of the room ("the toes…", not "the toes n…").
 */
function cutAt(words: string, room: number): string {
  const cut = words.slice(0, room);
  const space = cut.lastIndexOf(" ");
  return (space >= room / 2 && /\S/.test(words.charAt(room)) ? cut.slice(0, space) : cut).trimEnd();
}

/** A line with a clippable middle: the head and the tail (a name) are kept whole. */
function clipMiddle(head: string, middle: string, tail: string, max: number): string {
  const whole = `${head}${middle}${tail}`;
  if (whole.length <= max) return whole;
  const room = max - head.length - tail.length - 1;
  return room <= 0 ? `${head}…${tail}` : `${head}${cutAt(middle, room)}…${tail}`;
}

const NOTE_WORD: Record<LaneNote["loudness"], string> = { critical: "Critical", elevated: "Heads up", standard: "Note" };
const RANK: Record<LaneNote["loudness"], number> = { critical: 3, elevated: 2, standard: 1 };

/** The loudest note (an open one before a resolved one). */
export function loudestNote(notes: readonly LaneNote[]): LaneNote | null {
  if (notes.length === 0) return null;
  return [...notes].sort((a, b) => (b.resolved ? 0 : RANK[b.loudness]) - (a.resolved ? 0 : RANK[a.loudness]))[0];
}

/** The notes the lane draws at one column. */
export function notesAtColumn(model: TimelineModel, index: number): LaneNote[] {
  return model.notes.filter((n) => n.place.kind === "column" && n.place.index === index);
}

/** "Set-up changed before this session: Back pad 3 → 2 · Comfort or fit · Theo". */
export function boundaryWords(b: SetupBoundary, max: number = EVENT_MAX_CHARS): string {
  const changes = pairsWords(b.changes);
  const who = firstName(b.trainerName);
  const tail = who ? ` · ${who}` : "";
  if (!b.fromHistory && !b.reason) {
    return `Set-up differs from the session before: ${changes} (${b.reasonUnread ? REASON_UNREAD : "no reason recorded"})`;
  }
  const head = `${b.sameDay ? "Set-up changed on the day of this session" : "Set-up changed before this session"}: ${changes} · `;
  return clipMiddle(head, b.reason ?? (b.reasonUnread ? REASON_UNREAD : "no reason recorded"), tail, max);
}

export type EventGlyph = "setup" | "critical" | "headsUp" | "note" | "resolved" | null;

export interface Readout {
  /** "Thu Sep 17 · AC · 4th machine of 7" (+ "#N" only through sessionNumberTag, "· at Solon"). */
  rowA: string;
  /** "100 lb × 9". */
  figures: string;
  /** "Max strength", only when marked. */
  mark: string | null;
  /** The settings in force, as saved. */
  settings: string;
  /** One event, one line; null for none. */
  event: { glyph: EventGlyph; text: string } | null;
  /** The column has a note: Open note shows. */
  noteId: string | null;
}

export function readoutFor(model: TimelineModel, index: number, ctx: WordsContext, max: number = EVENT_MAX_CHARS): Readout | null {
  const col = model.columns[index];
  if (!col) return null;
  const studio = col.atOtherStudio && col.studioId ? ctx.studioNames?.[col.studioId] ?? "another studio" : null;
  const rowA = [
    col.isToday ? "Today" : dayWords(col.day, ctx.today),
    sessionNumberTag(col.sessionNumber, !!ctx.quotableNumbers),
    col.trainerInitials,
    col.machineOrder ? `${ordinal(col.machineOrder.position)} machine of ${col.machineOrder.of}` : null,
    studio ? `at ${studio}` : null,
  ]
    .filter((p): p is string => !!p)
    .join(" · ");

  const notes = notesAtColumn(model, index);
  const note = loudestNote(notes);
  let event: Readout["event"] = null;
  const boundary = model.boundaryAt[index];
  const fold = model.foldAt[index];
  if (boundary) {
    event = { glyph: "setup", text: boundaryWords(boundary, max) };
  } else if (note) {
    const word = note.resolved ? "Resolved note" : NOTE_WORD[note.loudness];
    const who = firstName(note.authorName);
    event = {
      glyph: note.resolved ? "resolved" : note.loudness === "critical" ? "critical" : note.loudness === "elevated" ? "headsUp" : "note",
      text: clipQuoted(`${word} · ${who ? `${who}: ` : ""}`, note.words, max),
    };
  } else if (col.outcome === "skipped" && col.skipNote) {
    event = { glyph: null, text: clipQuoted("Skip note: ", col.skipNote, max) };
  } else if (fold) {
    event = { glyph: null, text: `${foldWords(fold, model.machineName)} before this session` };
  } else if (col.practice === "bloodFlow") {
    event = { glyph: null, text: `${BLOOD_FLOW_LABEL}: ${BLOOD_FLOW_GLOSS}` };
  }
  return {
    rowA,
    figures: columnFigures(col),
    mark: columnMarkWords(col),
    settings: settingsWords(col, model.fields),
    event,
    noteId: note?.id ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * The rows and lanes, said
 * ------------------------------------------------------------------ */

/** The date row: "Sep 17", or "Today". */
export function columnDateLabel(col: TimelineColumn): string {
  return col.isToday ? "Today" : formatShortDate(col.day);
}

/** The lane's word under a skip ("pain"), empty for an unknown reason; "–" for not reached. */
export function laneWord(col: TimelineColumn): string | null {
  if (col.outcome === "skipped") return col.skipReason ? SKIP_REASON_SHORT[col.skipReason] : "";
  if (col.outcome === "not_reached") return "–";
  return null;
}

/** The SVG's title. */
export function chartTitle(model: TimelineModel): string {
  return `${model.machineName}: weight and reps, session by session`;
}

/** The SVG's description: what is in view, and where the exact numbers are. */
export function chartDescription(model: TimelineModel, view: ViewWindow, ctx: Pick<WordsContext, "today">): string {
  if (view.start < 0) return "";
  const cols = model.columns.slice(view.start, view.end + 1);
  const a = cols[0];
  const b = cols[cols.length - 1];
  const loads = cols.filter((c) => c.outcome === "performed" && c.weight !== null).map((c) => c.weight as number);
  const weight = loads.length ? ` Weight ${Math.min(...loads)} to ${Math.max(...loads)} lb.` : "";
  return `${plural(cols.length, "session")} shown, ${shortWithYear(a.day, ctx.today)} to ${formatShortDate(b.day)} ${b.day.slice(0, 4)}.${weight} Every number is in the two lists under the chart.`;
}

/* ------------------------------------------------------------------ *
 * Every session (the table)
 * ------------------------------------------------------------------ */

export interface SessionRowWords {
  sessionId: string;
  day: string;
  number: string | null;
  lb: string;
  effort: string;
  mark: string;
  outcome: string;
  setup: string;
  trainer: string;
  notes: string;
}

/** One row of Every session, newest first in the list. */
export function sessionRow(model: TimelineModel, index: number, ctx: WordsContext): SessionRowWords | null {
  const col = model.columns[index];
  if (!col) return null;
  const b = model.boundaryAt[index];
  const notes = notesAtColumn(model, index);
  const loud = loudestNote(notes);
  let effort = "";
  if (col.sides) {
    effort = [col.sides.L, col.sides.R]
      .filter((s): s is ColumnSide => !!s)
      .map((s) => `${s.side} ${effortOf(s.reps, s.seconds) ?? "—"}`)
      .join(" · ");
  } else effort = effortOf(col.reps, col.seconds) ?? "";
  const outcome =
    col.outcome === "performed"
      ? "Counted"
      : col.outcome === "practice"
        ? `${col.practice === "bloodFlow" ? BLOOD_FLOW_LABEL : "Practice"}, not counted`
        : col.outcome === "skipped"
          ? col.skipReason && col.skipReason !== "unknown"
            ? `Skipped (${SKIP_REASON_SHORT[col.skipReason]})`
            : "Skipped"
          : "Not reached";
  return {
    sessionId: col.sessionId,
    day: col.isToday ? "Today" : dayWords(col.day, ctx.today),
    number: sessionNumberTag(col.sessionNumber, !!ctx.quotableNumbers),
    lb: col.weight === null ? "—" : String(col.weight),
    effort,
    mark: columnMarkWords(col) ?? "",
    outcome,
    setup: !col.settings
      ? "not recorded"
      : b
        ? b.changes.map((c) => `${c.label} ${c.to || "—"}, was ${c.from || "—"}`).join(" · ")
        : "",
    trainer: col.trainerInitials ?? "",
    notes: loud ? (notes.length > 1 ? `${notes.length} notes` : loud.resolved ? "Resolved note" : NOTE_WORD[loud.loudness]) : "",
  };
}

/* ------------------------------------------------------------------ *
 * Weight by weight (step-runs.ts says what; this says it)
 * ------------------------------------------------------------------ */

export interface RunLine {
  kind: "run";
  /** The whole line in words: "100 lb · 3 times · Sep 8 – Oct 1 2026 · 8, 9, 11 (max strength)". */
  text: string;
  weight: number | null;
  /** The reps in order, each with its mark, for a screen that draws the star. */
  reps: { text: string; mark: ColumnMark }[];
}

export interface DividerLine {
  kind: "divider";
  text: string;
}

const repText = (c: TimelineColumn): string => {
  if (c.isHold && c.seconds !== null) return `held ${formatSeconds(c.seconds)}`;
  if (c.sides) {
    return [c.sides.L, c.sides.R]
      .filter((s): s is ColumnSide => !!s)
      .map((s) => `${s.side} ${effortOf(s.reps, s.seconds) ?? "—"}`)
      .join(" · ");
  }
  return c.reps !== null ? String(c.reps) : "—";
};

const markSuffix = (m: ColumnMark): string => (m === "max" ? " (max strength)" : m === "poor" ? " (needs improvement)" : "");

function extraWords(c: TimelineColumn): string {
  const day = formatShortDate(c.day);
  if (c.outcome === "skipped") {
    const why = c.skipReason ? SKIP_REASON_SHORT[c.skipReason] : "";
    return `skipped ${day}${why ? ` (${why})` : ""}`;
  }
  if (c.outcome === "practice") return `${c.practice === "bloodFlow" ? "blood flow" : "practice"} ${day}, not counted`;
  if (c.outcome === "not_reached") return `not reached ${day}`;
  return `${day}, no load recorded`;
}

/** "Set-up changed before Aug 18: Back pad 3 → 2 (Comfort or fit)". */
function setupDivider(b: SetupBoundary, day: string): string {
  return `Set-up changed before ${formatShortDate(day)}: ${pairsWords(b.changes)}${b.reason ? ` (${b.reason})` : ""}`;
}

/**
 * The list, NEWEST first: each run as a line, with what broke it from the
 * older run beneath it as a divider. A year shows on the newest and oldest
 * runs and wherever it changes. More than six sessions in a run read first
 * … last, with the fewest and the most.
 */
export function runLines(runs: readonly WeightRun[], model: TimelineModel, ctx: Pick<WordsContext, "today">): (RunLine | DividerLine)[] {
  const newest = [...runs].reverse();
  const yearOf = (r: WeightRun) => (r.items[r.items.length - 1] ?? r.extras[r.extras.length - 1])?.day.slice(0, 4) ?? "";
  const out: (RunLine | DividerLine)[] = [];
  newest.forEach((run, k) => {
    const y = yearOf(run);
    const showYear =
      k === 0 || k === newest.length - 1 || yearOf(newest[k - 1]) !== y || (k + 1 < newest.length && yearOf(newest[k + 1]) !== y);
    const items = run.items;
    let text: string;
    let reps: RunLine["reps"] = [];
    if (items.length === 0) {
      text = run.extras.map(extraWords).join(" · ");
    } else {
      const a = items[0].day;
      const b = items[items.length - 1].day;
      const crossesYear = a.slice(0, 4) !== b.slice(0, 4);
      const dates =
        items.length === 1
          ? `${formatShortDate(a)}${showYear ? ` ${a.slice(0, 4)}` : ""}`
          : crossesYear
            ? `${formatShortDate(a)} ${a.slice(0, 4)} – ${formatShortDate(b)} ${b.slice(0, 4)}`
            : `${formatShortDate(a)} – ${formatShortDate(b)}${showYear ? ` ${b.slice(0, 4)}` : ""}`;
      reps = items.map((c) => ({ text: repText(c), mark: c.mark }));
      const said = reps.map((r) => `${r.text}${markSuffix(r.mark)}`);
      let repsText = said.join(", ");
      if (items.length > 6) {
        const counts = items.filter((c) => !c.isHold && !c.sides && c.reps !== null).map((c) => c.reps as number);
        const range = counts.length ? ` · fewest ${Math.min(...counts)}, most ${Math.max(...counts)}` : "";
        repsText = `${said[0]} … ${said[said.length - 1]}${range}`;
      }
      const extras = run.extras.length ? ` · ${run.extras.map(extraWords).join(" · ")}` : "";
      text = `${run.weight} lb · ${times(items.length)} · ${dates} · ${repsText}${extras}`;
    }
    out.push({ kind: "run", text, weight: run.weight, reps });
    // What broke this run from the older one sits beneath it.
    const opener = run.items[0] ?? run.extras[0];
    for (const d of [...run.before].reverse()) {
      out.push({
        kind: "divider",
        text: d.kind === "fold" ? foldWords(d.fold, model.machineName) : setupDivider(d.boundary, opener?.day ?? ""),
      });
    }
  });
  return out;
}

/* ------------------------------------------------------------------ *
 * Before Journey (client-level, no points)
 * ------------------------------------------------------------------ */

/**
 * Shown whenever coverage isn't complete. It is about the CLIENT — Mindbody's
 * visits are per site, never per machine — and has no points on the chart.
 * Word for word as Account says the guess ("from Mindbody, not yet confirmed").
 */
export function beforeJourneyLine(total: SessionTotal | null, coverage: HistoryCoverage = "unknown"): string | null {
  if (coverage === "complete") return null;
  if (total?.basis === "confirmed" && total.before !== null && total.before > 0) {
    return `${plural(total.before, "session")} before Journey (confirmed)`;
  }
  const guess = total ? beforeJourneyGuess(total) : null;
  if (guess !== null && guess > 0) {
    return `About ${plural(guess, "session")} before Journey (${MINDBODY_GUESS_WORDS}). No machine detail for those.`;
  }
  return "Anything before Journey isn't on this chart.";
}
