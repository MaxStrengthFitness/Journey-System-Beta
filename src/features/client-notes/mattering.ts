/**
 * MATTERING — when a note matters. The one answer, pure.
 *
 * Operations overhaul, Sep 2026. AJ (Sep 19): forward notes made in a
 * session or a pre-session briefing had no lifespan — "they either haunt the
 * trainer forever or get lost". Every note now has a mattering window in
 * one of three shapes, on the fields the entry already carried plus one:
 *
 *   ALWAYS   matters continuously until someone marks it as no longer
 *            mattering (resolvedAt). The default for a critical note.
 *            `effectiveFrom` may push the start to a future date;
 *            `effectiveUntil` is blank.
 *   RANGE    matters from `effectiveFrom` (defaults to the day it was
 *            written) until `effectiveUntil`.
 *   DAY      matters only on one date: `effectiveFrom` and `effectiveUntil`
 *            fall on the same studio day. `repeat: "yearly"` brings it back
 *            every year — birthdays, anniversaries.
 *
 * THE 60-DAY REVIEW. Nothing expires on its own, so an ALWAYS note would
 * slowly fill the studio's list with stale notes nobody retires. After
 * REVIEW_AFTER_DAYS it surfaces for review (Operations → Overview) — it
 * does not silently drop. "Still matters" writes `reviewedAt` and restarts
 * the clock; "No longer matters" resolves it.
 *
 * Readers: the briefing's critical strip and heads-up rows, the Overview's
 * pain-and-notes panel and its Moments (a DAY note on its day), and the
 * review list. Anything that asks "does this note matter today" asks here.
 */
import { studioDateKey, toDate } from "../../lib/studio-time";
import type { JournalEntry } from "../../types/journal";

export type MatteringShape = "always" | "range" | "day";
export type NoteRepeat = "yearly";

export type MatteringFields = Pick<JournalEntry, "resolvedAt" | "isArchived" | "occurredAt" | "effectiveFrom" | "effectiveUntil"> & {
  repeat?: NoteRepeat | null;
  reviewedAt?: unknown;
};

export const REVIEW_AFTER_DAYS = 60;

const dayOf = (v: unknown, tz?: string): string | null => {
  const d = toDate(v as Parameters<typeof toDate>[0]);
  return d ? studioDateKey(d, tz) : null;
};

/** The day a note starts mattering: `effectiveFrom`, else the day it was written. */
export function startDayOf(entry: MatteringFields, tz?: string): string | null {
  return dayOf(entry.effectiveFrom, tz) ?? dayOf(entry.occurredAt, tz);
}

export function shapeOf(entry: MatteringFields, tz?: string): MatteringShape {
  const until = dayOf(entry.effectiveUntil, tz);
  if (!until) return "always";
  const from = dayOf(entry.effectiveFrom, tz);
  return from === until ? "day" : "range";
}

/** `MM-DD` of a day key. */
const monthDay = (day: string) => day.slice(5);

/** Does this note matter on the given studio day? */
export function mattersOn(entry: MatteringFields, day: string, tz?: string): boolean {
  if (entry.resolvedAt || entry.isArchived) return false;
  const shape = shapeOf(entry, tz);
  const start = startDayOf(entry, tz);
  if (shape === "day") {
    const on = dayOf(entry.effectiveUntil, tz) as string;
    if (on === day) return true;
    // A yearly note matters on its anniversary, from the first one onward.
    return entry.repeat === "yearly" && day > on && monthDay(day) === monthDay(on);
  }
  if (start !== null && day < start) return false;
  if (shape === "range") {
    const until = dayOf(entry.effectiveUntil, tz) as string;
    return day <= until;
  }
  return true;
}

/**
 * Has the note's window RUN OUT — its last day has gone by?
 *
 * Client codex, Sep 2026. Only a window with an end can end: a RANGE whose
 * until-day is before `today`, or a one-off DAY that has passed. Never an
 * ALWAYS note (it waits for someone to resolve it), never a yearly day (it
 * is only between anniversaries), and never a resolved or archived note —
 * that is closed, which is a different thing and reads differently.
 *
 * This is NOT `!mattersOn(...)`. A note whose start is pushed ahead does not
 * matter yet, and the card used to read "Ended —" on it: "no lunges from the
 * 20th" written on the 10th looked finished before it began.
 */
export function windowEnded(entry: MatteringFields, today: string, tz?: string): boolean {
  if (entry.resolvedAt || entry.isArchived) return false;
  const shape = shapeOf(entry, tz);
  if (shape === "always") return false;
  const until = dayOf(entry.effectiveUntil, tz) as string;
  if (shape === "day" && entry.repeat === "yearly") return false;
  return until < today;
}

/**
 * The next day on which a DAY-shaped note matters, on or after `today` —
 * for the Moments panel ("Pat's birthday, Tuesday"). Null for other shapes,
 * for a past one-off, and when nothing is left.
 */
export function nextOccurrence(entry: MatteringFields, today: string, tz?: string): string | null {
  if (entry.resolvedAt || entry.isArchived) return null;
  if (shapeOf(entry, tz) !== "day") return null;
  const on = dayOf(entry.effectiveUntil, tz) as string;
  if (on >= today) return on;
  if (entry.repeat !== "yearly") return null;
  const md = monthDay(on);
  const thisYear = `${today.slice(0, 4)}-${md}`;
  if (thisYear >= today) return thisYear;
  return `${Number(today.slice(0, 4)) + 1}-${md}`;
}

/** Days between two day keys (b − a). */
function daysApart(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * An ALWAYS note that has mattered for REVIEW_AFTER_DAYS since it started —
 * or since it was last reviewed — is due a look. Only notes that shout
 * (elevated, critical) are reviewed: a standard note never surfaced anywhere
 * by its loudness, so there is nothing to retire.
 */
export function needsReview(entry: MatteringFields & Pick<JournalEntry, "importance">, today: string, tz?: string): boolean {
  if (entry.importance === "standard") return false;
  if (!mattersOn(entry, today, tz)) return false;
  if (shapeOf(entry, tz) !== "always") return false;
  const since = dayOf(entry.reviewedAt, tz) ?? startDayOf(entry, tz);
  if (!since) return false;
  return daysApart(since, today) >= REVIEW_AFTER_DAYS;
}

/** How many days a note has been mattering, for the review row's proof line. */
export function daysMattering(entry: MatteringFields, today: string, tz?: string): number | null {
  const start = startDayOf(entry, tz);
  return start ? Math.max(0, daysApart(start, today)) : null;
}

/* ------------------------------------------------------------------ *
 * Building the window from what the composer asks
 * ------------------------------------------------------------------ */

export interface MatteringChoice {
  shape: MatteringShape;
  /** `YYYY-MM-DD` from a date input; blank means today / not set. */
  from: string;
  until: string;
  repeat: boolean;
}

/**
 * The three fields a draft carries for its window. Dates from an input are
 * read at local noon (from) and end of day (until) — never as UTC midnight,
 * which is the previous evening in Ohio. A blank "from" is left null, which
 * `startDayOf` reads as the day the note was written.
 */
export function windowFromChoice(choice: MatteringChoice): { effectiveFrom: Date | null; effectiveUntil: Date | null; repeat: NoteRepeat | null } {
  const fromDate = choice.from ? new Date(`${choice.from}T12:00:00`) : null;
  if (choice.shape === "day") {
    const on = choice.until || choice.from;
    if (!on) return { effectiveFrom: null, effectiveUntil: null, repeat: null };
    return { effectiveFrom: new Date(`${on}T12:00:00`), effectiveUntil: new Date(`${on}T23:59:59`), repeat: choice.repeat ? "yearly" : null };
  }
  if (choice.shape === "range") {
    return { effectiveFrom: fromDate, effectiveUntil: choice.until ? new Date(`${choice.until}T23:59:59`) : null, repeat: null };
  }
  return { effectiveFrom: fromDate, effectiveUntil: null, repeat: null };
}

/** The choice as it would be shown for an existing entry (for edits and cards). */
export function choiceOf(entry: MatteringFields, tz?: string): MatteringChoice {
  const shape = shapeOf(entry, tz);
  const from = dayOf(entry.effectiveFrom, tz) ?? "";
  const until = dayOf(entry.effectiveUntil, tz) ?? "";
  return { shape, from: shape === "day" ? until : from, until, repeat: entry.repeat === "yearly" };
}

/** One line for a card: "Matters always" · "Matters until Oct 3" · "Only on Nov 5, every year". */
export function describeWindow(entry: MatteringFields, tz?: string): string {
  const shape = shapeOf(entry, tz);
  const pretty = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  };
  if (shape === "day") {
    const on = dayOf(entry.effectiveUntil, tz) as string;
    return `Only on ${pretty(on)}${entry.repeat === "yearly" ? ", every year" : ""}`;
  }
  const from = dayOf(entry.effectiveFrom, tz);
  if (shape === "range") {
    const until = dayOf(entry.effectiveUntil, tz) as string;
    return from ? `Matters ${pretty(from)} – ${pretty(until)}` : `Matters until ${pretty(until)}`;
  }
  return from ? `Matters from ${pretty(from)}` : "Matters always";
}
