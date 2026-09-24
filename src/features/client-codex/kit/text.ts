/**
 * THE CODEX'S COPY HELPERS — small, pure, and the same on every page.
 *
 * Client codex, Sep 2026. Seven pages write sentences out of the record
 * ("Birthday in 17 days", "Pulse Sep 20", "3 unsaved changes · FORD ·
 * Occupation"). Each of these used to be written by hand wherever it was
 * needed, so the same fact read three ways on three screens. They live here
 * once.
 *
 * Rules these keep:
 *  - Sentences, not scores. Nothing here makes a percentage or a "/10".
 *  - A date-only key is read at LOCAL NOON (`dayKeyDate`), never as
 *    `new Date("yyyy-mm-dd")`, which is UTC midnight and lands on the day
 *    before in Eastern (KNOWN-TRAPS → React, tests, dates and tooling).
 *  - No regex lookbehind: older iPadOS Safari fails the whole module when it
 *    parses one. text.test.ts reads this file to keep it that way.
 *  - Words are for the studios, which are American: dates are en-US ("Sep 20").
 */

export { firstSentences, hasMoreThanFirstSentences } from "../../../lib/first-sentences";

/**
 * Wrap text in curly quotes, verbatim. Used for anything the page QUOTES
 * rather than says — a watch-out from the clinical list, a Pulse statement,
 * a client's own words — so the reader can see it was not reworded.
 */
export function curly(text: string): string {
  return `“${text.trim()}”`;
}

/** Capitalise the first letter: "her why" → "Her why". */
export function cap(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** "1 note", "3 notes", "1 watch-out" — the count and the right word. */
export function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The parts that exist, joined with " · ". */
export function joinDots(parts: ReadonlyArray<string | null | undefined | false>): string {
  return parts.filter((p): p is string => typeof p === "string" && p.trim().length > 0).join(" · ");
}

/** "Sep 20". */
export function monthDay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Sep 20, 2025" when the year is not `today`'s, else "Sep 20". */
export function monthDayYear(date: Date, today: Date): string {
  return date.getFullYear() === today.getFullYear()
    ? monthDay(date)
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * A studio day key ("2026-09-20") as a Date at local noon, or null when the
 * key is not a real calendar day ("2026-02-30", "", "Sep 20").
 */
export function dayKeyDate(key: string | null | undefined): Date | null {
  if (typeof key !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d, 12, 0, 0, 0);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * How far away a day is, the way a trainer would say it: "today",
 * "tomorrow", "in 5 days", "in 6 weeks", "in 4 months", "in 2 years" — and
 * "yesterday", "5 days ago" and so on for the past. Lower case, so it can sit
 * inside a sentence; `cap()` it to start one.
 *
 * Days up to 30 are counted as days — the same window FORD's `urgencyOf`
 * calls "soon", and the mockup's "Birthday in 17 days" — then weeks up to 83
 * ("in 12 weeks"), months up to 23, then years. FORD's Coming up uses this,
 * with `cap()`, rather than a formatter of its own, so the sub-toggle, the
 * Overview and the FORD page say one date one way.
 */
export function inTime(days: number): string {
  if (!Number.isFinite(days)) return "";
  const n = Math.round(days);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  const abs = Math.abs(n);
  let span: string;
  if (abs <= 30) span = plural(abs, "day");
  else if (abs <= 83) span = plural(Math.round(abs / 7), "week");
  else if (abs < 700) span = plural(Math.max(3, Math.round(abs / 30.44)), "month");
  else span = plural(Math.round(abs / 365.25), "year");
  return n > 0 ? `in ${span}` : `${span} ago`;
}

/** "September" in `today`'s year, "Sep 2025" otherwise — for "was Sometimes in September". */
export function monthLabel(date: Date, today: Date): string {
  return date.getFullYear() === today.getFullYear()
    ? date.toLocaleDateString("en-US", { month: "long" })
    : date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
