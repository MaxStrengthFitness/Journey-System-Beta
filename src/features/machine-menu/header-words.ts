/**
 * THE MACHINE MENU — the header's words.
 *
 * Line 1 is the unit's floor name and the client's display name (nickname-
 * aware, the same in both doors). Line 2 is the SET-DOWN read: "Last time
 * 100 lb × 11 ★ · Thu Oct 1", what a trainer glances at with the iPad on the
 * machine. It is the newest record BEFORE today; in a session today's set is
 * on the Now Bar.
 *
 * The rules, each held by the test beside this file:
 *   - The header never shows height, gender or age. Both old headers printed
 *     "· None" for a client with no gender on file; nothing here takes one.
 *   - A running total (`client.currentMachineMetrics`, which Finish writes,
 *     or `client.machineStats`) is EVIDENCE, never a count: it fills Last time
 *     when the newest record isn't in the sessions loaded, and a machine
 *     either one knows is never "first time". Nothing here quotes a count.
 *   - "First time on this machine" only through `noMachineHistoryLine`, i.e.
 *     only when Journey holds the client's whole story AND every session has
 *     been read. With older sessions unread it says so ("in the sessions
 *     loaded here").
 *   - A failed read says it couldn't load. Never "first time".
 *   - No "her" or "she" about a client: a name, or no pronoun at all.
 *
 * PURE — no React, no Firestore. Days are the studio's Eastern day.
 */
import type { ClientMachineStat, CurrentMachineMetric } from "../../types";
import { clientDisplayName } from "../../lib/client-name";
import { noMachineHistoryLine } from "../../lib/history-claims";
import type { HistoryCoverage } from "../../lib/prior-history";
import { BLOOD_FLOW_LABEL, SKIP_REASON_SHORT } from "../../lib/set-outcome";
import { studioDayKeyOf } from "../../lib/studio-time";
import { lastCounted, newestBeforeToday, type ColumnMark, type TimelineColumn, type TimelineModel } from "./timeline-model";
import { MARK_WORDS, columnFigures, dayWords, setFigures } from "./timeline-words";

/* ------------------------------------------------------------------ *
 * Line 1: the names, Close, the safety pill
 * ------------------------------------------------------------------ */

type NameLike = Parameters<typeof clientDisplayName>[0];

/**
 * The header's two names: the unit's floor name and the client's display
 * name. Takes the client record as it is and says only its name — whatever
 * else the record carries (gender, height, age) never reaches the header.
 */
export function headerNames(machineName: string, client: NameLike): { machine: string; client: string } {
  return { machine: (machineName ?? "").trim(), client: clientDisplayName(client) };
}

/** Close's accessible name: "Close Leg Press". */
export function closeLabel(machineName: string): string {
  return `Close ${(machineName ?? "").trim() || "this machine"}`;
}

/** The pill shown while the safety strip is scrolled away: "1 thing to know first", and its accessible name. */
export function safetyPillWords(count: number): { label: string; ariaLabel: string } {
  const n = Math.max(1, Math.trunc(count) || 1);
  const label = `${n} ${n === 1 ? "thing" : "things"} to know first`;
  return { label, ariaLabel: `${label}. Show it` };
}

/* ------------------------------------------------------------------ *
 * Line 2: Last time
 * ------------------------------------------------------------------ */

export type HeaderLineKind =
  /** The newest record before today, counted. */
  | "last"
  /** The newest record before today wasn't counted (a skip, practice, not reached). */
  | "uncounted"
  /** The newest record isn't in the sessions loaded; a running total knows it. */
  | "elsewhere"
  /** Nothing on this machine in what was read. */
  | "nothing"
  /** The first read hasn't answered. */
  | "loading"
  | "failed";

export interface HeaderLine {
  kind: HeaderLineKind;
  /** "Last time" or "Last in Journey", 15px; null for a line that is all words. */
  lead: string | null;
  /** A line that is all words: "Nothing recorded on this machine", "Last time: couldn't load". */
  words: string | null;
  /** The set-down figures at 28px: "100 lb × 11", "94 lb · held 1:30", "skipped (pain)". */
  figures: string | null;
  /** The grid's QualityMark, drawn only when the set was marked. */
  mark: ColumnMark;
  /** The mark in words, for an accessible name; null when unmarked. */
  markWords: string | null;
  /** "Thu Oct 1", 17px. */
  day: string | null;
  /** Everything after the day, each said after a " · ": "at Solon", "last counted …", "Watching …". */
  rest: string[];
  /** The whole line in words (the glyph left out; `markWords` carries it). */
  text: string;
}

/** A running total's entry for this machine, as the client record holds it. */
export interface RunningTotals {
  /** `client.currentMachineMetrics[machineId]` — Finish writes it, with reps. */
  metric?: Partial<CurrentMachineMetric> | null;
  /** `client.machineStats[machineId]` — the lifetime rollup, a load and a day. */
  stat?: ClientMachineStat | null;
}

export interface HeaderInput extends RunningTotals {
  model: Pick<TimelineModel, "columns" | "readState" | "everythingRead">;
  /** The studio day today. */
  today: string;
  /** The client's coverage, judged by the HOME studio's cutover. */
  coverage?: HistoryCoverage;
  /** Studio id → name, for "at Solon". */
  studioNames?: Readonly<Record<string, string>>;
  /** Watching another trainer's session: that trainer's name (read only). */
  watching?: string | null;
}

export const NOT_LOADED_HERE = "not in the sessions loaded here";
export const COULDNT_LOAD_LINE = "Last time: couldn't load";
export const LOADING_LINE = "Last time: loading…";

const firstName = (full: string | null | undefined): string => (full ?? "").trim().split(/\s+/)[0] ?? "";

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};

/** A stored day (a yyyy-mm-dd, a Date, a Timestamp) as the studio's day; null when unreadable. */
function dayOf(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  try {
    return studioDayKeyOf(v as Parameters<typeof studioDayKeyOf>[0]);
  } catch {
    return null;
  }
}

interface Evidence {
  day: string;
  sessionId: string | null;
  /** "100 lb × 11" from the metric, which has reps; null from the rollup, which has only a load. */
  figures: string | null;
  /** The rollup's "100 lb". */
  load: string | null;
}

/** The running totals' newest record before today, when one can be read. The metric first: it has reps. */
function evidenceOf(totals: RunningTotals, today: string): Evidence | null {
  const m = totals.metric;
  const mDay = m ? dayOf(m.lastPerformedDate) : null;
  if (m && mDay && mDay < today) {
    const weight = num(m.weight);
    const hold = !!(m.isTSC || m.isStaticHold);
    const seconds = hold ? num(m.seconds) : null;
    const reps = hold ? null : num(m.reps);
    if ((weight !== null && weight > 0) || reps !== null || seconds !== null) {
      return {
        day: mDay,
        sessionId: typeof m.lastSessionId === "string" && m.lastSessionId ? m.lastSessionId : null,
        figures: setFigures(weight !== null && weight > 0 ? weight : null, reps, seconds),
        load: null,
      };
    }
  }
  const s = totals.stat;
  const sDay = s ? dayOf(s.lastPerformedDate) : null;
  if (s && sDay && sDay < today) {
    const w = num(s.lastWeight);
    return { day: sDay, sessionId: null, figures: null, load: w !== null && w > 0 ? `${w} lb` : null };
  }
  return null;
}

/**
 * Does a running total know this client did the machine before today? Only
 * evidence, never a count. An entry whose day can't be read counts as known
 * (the cautious answer: a machine done before is never "first time"); an
 * entry dated today is today's session, not a time before.
 */
export function knownElsewhere(totals: RunningTotals, today: string): boolean {
  const m = totals.metric;
  if (m && (num(m.weight) !== null || num(m.reps) !== null || num(m.seconds) !== null)) {
    const d = dayOf(m.lastPerformedDate);
    if (d === null || d < today) return true;
  }
  const s = totals.stat;
  if (s && ((num(s.timesPerformed) ?? 0) > 0 || s.firstPerformedDate || s.lastPerformedDate)) {
    const first = dayOf(s.firstPerformedDate);
    const last = dayOf(s.lastPerformedDate);
    if (first === null && last === null) return true;
    if ((first !== null && first < today) || (last !== null && last < today)) return true;
  }
  return false;
}

type LineParts = Omit<HeaderLine, "kind" | "text" | "markWords" | "words">;

function line(kind: HeaderLineKind, parts: LineParts, words: string | null = null): HeaderLine {
  const body = [words, parts.figures, parts.day, ...parts.rest].filter((p): p is string => !!p).join(" · ");
  const text = parts.lead ? `${parts.lead}${body ? ` ${body}` : ""}` : body;
  return { kind, ...parts, words, markWords: parts.mark ? MARK_WORDS[parts.mark] : null, text };
}

/** Words only: "Nothing recorded on this machine", "Last time: couldn't load". */
const wordsOnly = (kind: HeaderLineKind, words: string, rest: string[] = []): HeaderLine =>
  line(kind, { lead: null, figures: null, mark: null, day: null, rest }, words);

/** The figures of a counted column, said as the header says them (the set that drives the line). */
function countedFigures(col: TimelineColumn): string {
  return col.sides ? columnFigures(col) : setFigures(col.weight, col.reps, col.seconds);
}

/** "skipped (pain)", "practice", "blood flow", "not reached". */
function uncountedWords(col: TimelineColumn): string {
  switch (col.outcome) {
    case "skipped": {
      const why = col.skipReason && col.skipReason !== "unknown" ? SKIP_REASON_SHORT[col.skipReason] : "";
      return why ? `skipped (${why})` : "skipped";
    }
    case "practice":
      return col.practice === "bloodFlow" ? BLOOD_FLOW_LABEL.toLowerCase() : "practice";
    default:
      return "not reached";
  }
}

/**
 * Line 2. Every case of the design's table: performed, a hold, one side at a
 * time, another studio, a newest record that wasn't counted, a newest record
 * not in the sessions loaded, nothing (gated), a failed read, and the
 * watched session's suffix.
 */
export function lastTimeLine(input: HeaderInput): HeaderLine {
  const { model, today } = input;
  const watched = input.watching !== undefined && input.watching !== null;
  const suffix = watched
    ? [`Watching ${firstName(input.watching) ? `${firstName(input.watching)}'s` : "another trainer's"} session, read only`]
    : [];

  if (model.readState === "failed") return wordsOnly("failed", COULDNT_LOAD_LINE, suffix);

  const newest = newestBeforeToday(model);
  if (!newest && model.readState === "loading") return wordsOnly("loading", LOADING_LINE, suffix);

  // The newest record isn't in what was read: a running total says it, hedged.
  const evidence = evidenceOf(input, today);
  const loaded = (id: string | null) => !!id && model.columns.some((c) => c.sessionId === id);
  if (evidence && (!newest || evidence.day > newest.day) && !loaded(evidence.sessionId)) {
    const day = dayWords(evidence.day, today);
    return evidence.figures
      ? line("elsewhere", { lead: "Last in Journey", figures: evidence.figures, mark: null, day, rest: [NOT_LOADED_HERE, ...suffix] })
      : line("elsewhere", {
          lead: "Last in Journey",
          figures: null,
          mark: null,
          day,
          rest: [...(evidence.load ? [evidence.load] : []), NOT_LOADED_HERE, ...suffix],
        });
  }

  if (newest) {
    const at = newest.atOtherStudio && newest.studioId ? [`at ${input.studioNames?.[newest.studioId] ?? "another studio"}`] : [];
    const day = dayWords(newest.day, today);
    if (newest.counted) {
      return line("last", { lead: "Last time", figures: countedFigures(newest), mark: newest.mark, day, rest: [...at, ...suffix] });
    }
    const counted = lastCounted(model);
    const before = counted ? [`last counted ${countedFigures(counted)}, ${dayWords(counted.day, today)}`] : [];
    return line("uncounted", { lead: "Last time", figures: uncountedWords(newest), mark: null, day, rest: [...at, ...before, ...suffix] });
  }

  // Nothing in what was read. "First time" only through noMachineHistoryLine,
  // only with every session read, and never for a machine a total knows.
  if (model.everythingRead) {
    const words = knownElsewhere(input, today) ? noMachineHistoryLine("unknown") : noMachineHistoryLine(input.coverage);
    return wordsOnly("nothing", words, suffix);
  }
  return wordsOnly("nothing", `${noMachineHistoryLine("unknown")} in the sessions loaded here`, suffix);
}
