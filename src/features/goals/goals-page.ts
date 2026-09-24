/**
 * GOALS & FOCUS — the page's words, worked out from what the tab already
 * loaded. The pure half of the Goals & Focus page (client codex, phase 14).
 *
 * Client codex, Sep 2026. The long scroll's Goals section was a form: the
 * coach strategy, the why and the goal as input boxes, the focus board under
 * them. The page reads first — how to coach her, her why, what she is working
 * toward, each coach's focus, what she has reached — and every sentence here
 * comes from something the team already recorded:
 *
 *   howToCoachLead   THE lead line for "How to coach her" — the first
 *                    paragraph of the coach strategy, verbatim; with none,
 *                    the first of her Preference and Coaching-tip notes that
 *                    is not Critical (the red line carries those), with who
 *                    wrote it, its machine and its Loudness. Body & Pulse's
 *                    strip and the Overview's Goals slot read it, so the
 *                    three never disagree.
 *   howToCoachRows   the notes under it: Notes' own `howToCoachThreads` (by
 *                    KIND, so a legacy session wrap-up is never a
 *                    "Preference"), labelled with Notes' `noteCardLabel`.
 *   herWhyLinks      what else says why she came: Mindbody's long-term goal,
 *                    the consultation, the sign-up notes, and her Dreams in
 *                    FORD — only once FORD answered for a reader it lets in.
 *   reachedShelf     goals marked achieved and focuses achieved, newest first.
 *   smartSentence    how much of S·M·A·R·T a goal meets, in words.
 *   goalsTabHint     the sub-toggle's line; goalsGlance, the Overview's slot.
 *
 * The rules these keep:
 *  - Verbatim. The team's words are quoted, never summarised or reworded; the
 *    app never coaches and never suggests a progression.
 *  - Unknown is not empty. A read that has not answered, or failed, is said
 *    to be so — never "nothing written yet".
 *  - FORD text reaches only a reader FORD lets in (`fordStatus` "ready"). The
 *    client document's `fordSummary.pinned` is FORD text a cross-train studio
 *    can read, so nothing here reads it.
 *  - Dates are the studio's days, in en-US words ("Jan 22, 2027"). A day key
 *    is read at local noon, never through UTC.
 *  - No regex lookbehind (older iPadOS Safari fails the module).
 *
 * Pure: no React, no Firestore. goals-page.test.ts, under TZ=America/New_York.
 */
import type { Client } from "../../types";
import type { ClientFocus, JournalImportance } from "../../types/journal";
import type { JournalLoad } from "../../hooks/useClientJournal";
import type { NoteThread } from "../client-notes/threads";
import { noteCardLabel, noteCategoryOf, type NoteCategory } from "../client-notes/note-catalog";
import { howToCoachThreads, whoOf } from "../client-notes/record-selectors";
import type { FordEntry } from "../ford/types";
import type { CodexFordStatus } from "../client-codex/codex-data";
import { studioDayKeyOf, toDate } from "../../lib/studio-time";
import { dayKeyDate, inTime, joinDots, plural } from "../client-codex/kit/text";
import { focusDaysActive, focusEndDate, focusStartDate, formatSpan } from "./focus";
import {
  SMART_DEFS,
  SMART_KEYS,
  daysUntil,
  isDayKey,
  normalizeSmartChecks,
  readGoalHistory,
  smartCount,
  type SmartChecks,
} from "./goals";

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** Text as typed, with Windows line ends made plain and the ends trimmed. */
const tidy = (text: string | null | undefined): string => (text ?? "").replace(/\r\n?/g, "\n").trim();

/**
 * The first paragraph of a text, verbatim: everything up to the first blank
 * line. Null when nothing is written.
 */
export function firstParagraph(text: string | null | undefined): string | null {
  const all = tidy(text);
  if (!all) return null;
  const first = (all.split(/\n[ \t]*\n/)[0] ?? "").trim();
  return first || null;
}

/** "Jan 22, 2027" for a studio day key; "" for anything that is not one. */
export function dayWords(dayKey: string | null | undefined): string {
  const date = dayKeyDate(dayKey);
  return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
}

/** The studio day of a stored instant (an ISO string, a Timestamp, a Date). */
const dayOf = (value: unknown, tz?: string): string | null =>
  studioDayKeyOf(value as Parameters<typeof studioDayKeyOf>[0], tz);

/**
 * The quote-mark families: straight or curly, a double is a double and a
 * single a single. `open` may start a quote, `close` may end one, `all` is
 * every mark of the family (an apostrophe is a single).
 */
const QUOTE_FAMILIES: readonly { open: string; close: string; all: string }[] = [
  { open: "\"“", close: "\"”", all: "\"“”" },
  { open: "'‘", close: "'’", all: "'‘’" },
  { open: "«", close: "»", all: "«»" },
];

/**
 * The words without quote marks already wrapped round them, so the page can
 * wrap them in its own curly quotes once — never ““…””. Only a PAIR is taken
 * off: the first mark and the last must be the same family, and nothing
 * between them may be of that family — so the opening mark's partner IS the
 * last character. Anything else is left exactly as typed:
 * `"I want to garden" she said`, `"Lose weight" and "get strong"`, and
 * `'Tis the season, I'm told'` keep every mark.
 */
export function withoutOuterQuotes(text: string | null | undefined): string {
  let t = tidy(text);
  for (;;) {
    if (t.length < 2) return t;
    const first = t[0];
    const last = t[t.length - 1];
    const family = QUOTE_FAMILIES.find((f) => f.open.includes(first) && f.close.includes(last));
    if (!family) return t;
    const inner = t.slice(1, -1);
    for (const ch of inner) if (family.all.includes(ch)) return t;
    t = inner.trim();
  }
}

/* ------------------------------------------------------------------ */
/* How to coach her                                                    */
/* ------------------------------------------------------------------ */

/**
 * The one line that leads "How to coach her", wherever it is shown.
 *
 *   strategy  the first paragraph of the coach strategy on her record,
 *             verbatim. `more` when Goals & Focus holds more than it: the
 *             rest of the strategy, or coaching notes (once they are read).
 *   note      no strategy: the first of her Preference and Coaching-tip notes
 *             in the list's own order (loudest first, then the one that moved
 *             most recently) that is NOT Critical, its whole body, with who
 *             wrote it, its machine and its Loudness — so a machine's tip is
 *             never shown as a general cue, and a Heads up still says so. A
 *             Critical note is carried by the red line under the bar (and
 *             leads the Overview's Notes slot), so the lead passes over it —
 *             unless every coaching note she has is Critical: then it leads,
 *             marked Critical, rather than the line claiming none is written.
 *   none      nothing written, and the notes were read.
 *   unknown   no strategy, and the notes have not answered or failed — the
 *             line cannot say "nothing written".
 */
export type HowToCoachLead =
  | { kind: "strategy"; text: string; more: boolean }
  | {
      kind: "note";
      text: string;
      author: string;
      threadId: string;
      /** The machine the note is about; the line names it first, as the rows do. */
      machineId: string | null;
      importance: JournalImportance;
      more: boolean;
    }
  | { kind: "none" }
  | { kind: "unknown"; state: "loading" | "failed" };

export function howToCoachLead({
  discoveryNotes,
  threads,
  notesState,
  today,
  tz,
}: {
  discoveryNotes: string | null | undefined;
  threads: readonly NoteThread[] | null | undefined;
  notesState: JournalLoad;
  today: string;
  tz?: string;
}): HowToCoachLead {
  const all = tidy(discoveryNotes);
  const first = firstParagraph(all);
  const notes = notesState === "ready" ? liveCoachThreads(threads, today, tz) : null;
  if (first) {
    return { kind: "strategy", text: first, more: all.length > first.length || (notes?.length ?? 0) > 0 };
  }
  if (notes === null) return { kind: "unknown", state: notesState === "failed" ? "failed" : "loading" };
  const lead = notes.find((t) => importanceOf(t) !== "critical") ?? notes[0];
  if (!lead) return { kind: "none" };
  return {
    kind: "note",
    text: tidy(lead.root.body),
    author: whoOf(lead.root),
    threadId: lead.id,
    machineId: lead.root.machineId ?? null,
    importance: importanceOf(lead),
    more: notes.length > 1,
  };
}

/** A thread's Loudness, read off its root; anything unknown is plain. */
function importanceOf(thread: NoteThread): JournalImportance {
  const i = thread.root.importance;
  return i === "elevated" || i === "critical" ? i : "standard";
}

/** Notes' how-to-coach threads that have words in them. */
function liveCoachThreads(threads: readonly NoteThread[] | null | undefined, today: string, tz?: string): NoteThread[] {
  return howToCoachThreads(threads ?? [], today, tz).filter((t) => tidy(t.root.body).length > 0);
}

/** How many notes the How-to-coach card lists before "All n in Notes". */
export const HOW_TO_COACH_SHOWN = 6;

export interface CoachRow {
  threadId: string;
  /** The catalog's category, for the row's icon. */
  category: NoteCategory;
  /** The note's label, in Notes' one vocabulary ("Preference", "Pace", "Note"). */
  label: string;
  importance: JournalImportance;
  /** Heads up or Critical: the row shows its Loudness. */
  loud: boolean;
  machineId: string | null;
  /** The note's words, verbatim. The row may fold them to two lines; Notes has them whole. */
  text: string;
}

/**
 * The notes under the strategy: her Preference and Coaching-tip notes that
 * are still true, loudest first — the same threads, in the same order, as on
 * Notes. `rows` is the first HOW_TO_COACH_SHOWN; `total` is all of them.
 */
export function howToCoachRows(
  threads: readonly NoteThread[] | null | undefined,
  today: string,
  tz?: string,
): { rows: CoachRow[]; total: number } {
  const live = liveCoachThreads(threads, today, tz);
  const rows = live.slice(0, HOW_TO_COACH_SHOWN).map((thread): CoachRow => {
    const { id, root } = thread;
    const importance = importanceOf(thread);
    return {
      threadId: id,
      category: noteCategoryOf(root),
      label: noteCardLabel(root),
      importance,
      loud: importance !== "standard",
      machineId: root.machineId ?? null,
      text: tidy(root.body),
    };
  });
  return { rows, total: live.length };
}

/* ------------------------------------------------------------------ */
/* Her why                                                             */
/* ------------------------------------------------------------------ */

/**
 * Her Dreams in FORD, for the why's link line. Only once FORD answered for a
 * reader it lets in: loading, failed and "the home studio keeps it" are each
 * their own answer, never "nothing in Dreams".
 */
export type DreamsLink =
  | { status: "ok"; text: string }
  | { status: "none" }
  | { status: "loading" }
  | { status: "failed" }
  | { status: "home-only" };

export interface HerWhyLinks {
  /** Mindbody's client index, verbatim ("IncreasedFlexibility" included). */
  longTermGoal: string | null;
  /** What she said at the consultation (`client.goals`), verbatim. */
  consultation: string | null;
  /** Goals lines from her Mindbody sign-up notes, verbatim, read only. */
  signUp: string[];
  dreams: DreamsLink;
}

const occurredMs = (e: Pick<FordEntry, "occurredAt">) => toDate(e.occurredAt as Parameters<typeof toDate>[0])?.getTime() ?? 0;

/** A Dreams detail that is still true: filed under Dreams, not archived, not closed, with words. */
function isLiveDream(e: FordEntry): boolean {
  return e.pillar === "dreams" && !e.isArchived && !e.resolvedAt && e.kind !== "one-line" && tidy(e.body).length > 0;
}

/**
 * The lines under her why. Dreams is the newest standing (pinned) Dreams
 * detail, else the newest Dreams moment — "nothing in Dreams" only when FORD
 * holds no live Dreams detail at all.
 */
export function herWhyLinks({
  client,
  fordStatus,
  fordEntries,
  signUp = [],
}: {
  client: Pick<Client, "mindbodyIndexes" | "goals">;
  fordStatus: CodexFordStatus;
  fordEntries: readonly FordEntry[] | null | undefined;
  signUp?: readonly string[];
}): HerWhyLinks {
  const indexes = client.mindbodyIndexes ?? {};
  const longTermGoal = tidy(indexes.LongtermGoal || indexes.LongTermGoal) || null;
  const consultation = withoutOuterQuotes(client.goals) || null;

  let dreams: DreamsLink;
  if (fordStatus === "off" || fordStatus === "denied") dreams = { status: "home-only" };
  else if (fordStatus === "failed") dreams = { status: "failed" };
  else if (fordStatus === "loading") dreams = { status: "loading" };
  else {
    const live = (fordEntries ?? []).filter(isLiveDream).sort((a, b) => occurredMs(b) - occurredMs(a));
    const lead = live.find((e) => e.isPinned) ?? live[0];
    dreams = lead ? { status: "ok", text: tidy(lead.body) } : { status: "none" };
  }

  return {
    longTermGoal,
    consultation,
    signUp: signUp.map((s) => withoutOuterQuotes(s)).filter((s) => s.length > 0),
    dreams,
  };
}

/* ------------------------------------------------------------------ */
/* Working toward now                                                  */
/* ------------------------------------------------------------------ */

/** How much of S·M·A·R·T the goal meets, in words. Never a score. */
export function smartSentence(raw: SmartChecks | unknown): string {
  const n = smartCount(normalizeSmartChecks(raw));
  if (n === SMART_KEYS.length) return "All five ticked";
  if (n === 0) return "Nothing ticked yet";
  return `${n} of 5 ticked`;
}

/** The five squares' name for a screen reader: which letters, in words. */
export function smartLabel(raw: SmartChecks | unknown): string {
  const checks = normalizeSmartChecks(raw);
  const n = smartCount(checks);
  if (n === SMART_KEYS.length) return "Specific, measurable, achievable, relevant, time-bound: all five ticked";
  if (n === 0) return "SMART checklist: nothing ticked yet";
  const words = SMART_KEYS.filter((k) => checks[k]).map((k) => SMART_DEFS[k].word);
  return `SMART checklist: ${words.join(", ")} ticked, ${n} of 5`;
}

/**
 * The target, as the read view says it: "May 1, 2027 · in 6 weeks" — the
 * kit's one way of saying how far away a day is. Empty for no target.
 */
export function targetLine(target: unknown, now: Date = new Date()): string {
  if (!isDayKey(target)) return "";
  const days = daysUntil(target, now);
  return joinDots([dayWords(target), days === null ? null : inTime(days)]);
}

/* ------------------------------------------------------------------ */
/* Reached                                                             */
/* ------------------------------------------------------------------ */

export interface ReachedRow {
  key: string;
  kind: "goal" | "focus";
  /** The goal as it was written, or "Pace: Slow the lower turnaround." */
  title: string;
  /** "Goal · Jan 22, 2027 · reward: dinner out · marked by AJ" */
  meta: string;
  /** When it was reached, for the order. */
  at: number;
  /** Marked achieved on this iPad and not saved yet — only in the form. */
  unsaved: boolean;
}

/** How many reached rows the shelf shows before "See all". */
export const REACHED_SHOWN = 5;

/**
 * Goals marked achieved (the form's history, so one marked a moment ago
 * shows, flagged as not saved yet) and focuses achieved, newest first.
 * Retired focuses are not reached. `focuses` null means they have not been
 * read: the shelf then holds the goals only, and says so.
 */
export function reachedShelf({
  current,
  saved,
  focuses,
  tz,
}: {
  /** The goal history the form holds (formData, else the record). */
  current: unknown;
  /** The goal history on the saved record. */
  saved: unknown;
  focuses: readonly ClientFocus[] | null;
  tz?: string;
}): ReachedRow[] {
  const savedAt = new Set(readGoalHistory(saved).map((g) => g.achievedAt));
  const rows: ReachedRow[] = [];

  readGoalHistory(current).forEach((g, i) => {
    const day = dayOf(g.achievedAt, tz);
    rows.push({
      key: `goal:${g.achievedAt}:${i}`,
      kind: "goal",
      title: g.goal,
      meta: joinDots([
        "Goal",
        dayWords(day),
        isDayKey(g.targetDate) ? `target was ${dayWords(g.targetDate)}` : null,
        g.reward ? `reward: ${g.reward}` : null,
        g.byName ? `marked by ${g.byName}` : null,
      ]),
      at: Date.parse(g.achievedAt) || 0,
      unsaved: !savedAt.has(g.achievedAt),
    });
  });

  for (const f of focuses ?? []) {
    if (f.status !== "passed") continue;
    const end = focusEndDate(f);
    rows.push({
      key: `focus:${f.id}`,
      kind: "focus",
      title: `${f.category}: ${f.intent}`,
      meta: joinDots([
        "Focus",
        dayWords(dayOf(end, tz)),
        focusStartDate(f) ? formatSpan(focusDaysActive(f)) : null,
        f.trainerName || f.trainerInitials || null,
        f.rewardNote ? `reward: ${f.rewardNote}` : null,
      ]),
      at: end?.getTime() ?? 0,
      unsaved: false,
    });
  }

  return rows.sort((a, b) => b.at - a.at || a.key.localeCompare(b.key));
}

/**
 * The shelf's heading: "Reached · 2 goals, 1 focus". While the focuses are
 * unknown it counts the goals only — never "0 focuses".
 */
export function reachedHeading(rows: readonly ReachedRow[], focusesKnown: boolean): string {
  const goals = rows.filter((r) => r.kind === "goal").length;
  const focuses = focusesKnown ? rows.filter((r) => r.kind === "focus").length : 0;
  const parts = [goals > 0 ? plural(goals, "goal") : null, focuses > 0 ? plural(focuses, "focus", "focuses") : null];
  const said = parts.filter((p): p is string => p !== null);
  return said.length > 0 ? `Reached · ${said.join(", ")}` : "Reached";
}

/* ------------------------------------------------------------------ */
/* The sub-toggle and the Overview                                     */
/* ------------------------------------------------------------------ */

/**
 * The Goals & Focus segment's line: "2 focuses running"; with none running,
 * "a goal set" when the record holds a goal, else "no focus running". The
 * shell adds "loading" and "couldn't load" (page-meta.ts).
 */
export function goalsTabHint({ running, goal }: { running: number; goal: string | null | undefined }): string {
  if (running > 0) return `${plural(running, "focus", "focuses")} running`;
  return tidy(goal) ? "a goal set" : "no focus running";
}

export interface GoalsGlance {
  /** Her why, verbatim, without quote marks of its own. */
  why: string | null;
  /** "Walk 10 miles two days running by May 1 · target May 1, 2027". */
  workingToward: string | null;
  /**
   * The newest running focus: "Pace: Slow the lower turnaround. · AJ, 2 weeks"
   * — the coach alone when the focus has no start date.
   */
  focusLine: string | null;
  /** The How-to-coach lead line. */
  coach: HowToCoachLead;
  /**
   * "2 focuses running · 2 goals reached · 1 focus achieved". While the
   * focuses are unknown only the goals are counted — never "0 running". What
   * was reached is said only when Journey holds some: never "0 goals
   * reached" for a client whose story began before Journey. Empty when
   * there is nothing to say.
   */
  foot: string;
}

/** The Overview's Goals & Focus slot (phase 18), from the saved record and the tab's one load. */
export function goalsGlance({
  client,
  focuses,
  threads,
  notesState,
  today,
  tz,
}: {
  client: Pick<Client, "globalNotes" | "smartGoal" | "goalTargetDate" | "goalHistory" | "discoveryNotes">;
  /** Null while the focuses are unknown. */
  focuses: readonly ClientFocus[] | null;
  threads: readonly NoteThread[] | null | undefined;
  notesState: JournalLoad;
  today: string;
  tz?: string;
}): GoalsGlance {
  const goal = tidy(client.smartGoal);
  const target = isDayKey(client.goalTargetDate) ? `target ${dayWords(client.goalTargetDate)}` : null;
  const running = focuses
    ? focuses
        .filter((f) => f.status === "active")
        .sort((a, b) => (focusStartDate(b)?.getTime() ?? 0) - (focusStartDate(a)?.getTime() ?? 0))
    : null;
  const newest = running?.[0] ?? null;
  const newestDays = newest ? focusDaysActive(newest) : null;
  const coachName = newest ? newest.trainerName || newest.trainerInitials || "A coach" : "";
  const goalsReached = readGoalHistory(client.goalHistory).length;
  const focusesReached = focuses ? focuses.filter((f) => f.status === "passed").length : null;

  return {
    why: withoutOuterQuotes(client.globalNotes) || null,
    workingToward: goal ? joinDots([goal, target]) : null,
    focusLine: newest
      ? joinDots([
          `${newest.category}: ${newest.intent}`,
          // No start date, no span: the coach alone, never "AJ, —".
          newestDays === null ? coachName : `${coachName}, ${formatSpan(newestDays)}`,
        ])
      : null,
    coach: howToCoachLead({ discoveryNotes: client.discoveryNotes, threads, notesState, today, tz }),
    // Counts of what Journey holds, and only when there is one: "0 goals
    // reached" would be a confident zero for a client whose goals were
    // reached before Journey (prior history is real history).
    foot: joinDots([
      running ? `${plural(running.length, "focus", "focuses")} running` : null,
      goalsReached ? `${plural(goalsReached, "goal")} reached` : null,
      focusesReached ? `${plural(focusesReached, "focus", "focuses")} achieved` : null,
    ]),
  };
}
