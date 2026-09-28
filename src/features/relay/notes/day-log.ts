/**
 * THE DAY LOG — a trainer's own record of one day at one studio (the second
 * wave of the Relay room, Sep 28 2026; AJ: "all yes").
 *
 *   studios/{studioId}/dayLogs/{uid}_{yyyy-mm-dd}
 *
 * Two small cards on the Board write it, and the Journal's Day logs shelf
 * reads it back:
 *
 *   Opening    "things to carry today": up to three short lines the trainer
 *              chooses at the start of the day ("slow down at the door").
 *   Close out  the day so far, in facts Journey saw (board/shift-cards.ts
 *              `dayDraft`), and one line for yourself: What happened? So
 *              what? Now what? — then "Save to my journal".
 *
 * PRIVATE: read and written only by the person whose uid is in the id
 * (firestore.rules "WAVE 2 RELAY: the day log"). Never shown to leaders,
 * never counted, never compared (research-relay §7: "a complete record of
 * what each trainer did is tempting for managers"). The facts are drafted
 * from what happened; the trainer adds the meaning.
 *
 * Pure: no React, no Firestore, no clock of its own.
 */

/** Up to three things to carry today (Sunsama's daily plan, the blueprint's Opening). */
export const CARRY_MAX = 3;
export const CARRY_TEXT_MAX = 160;
export const LINE_TEXT_MAX = 500;
export const FACTS_MAX = 12;
export const FACT_TEXT_MAX = 500;

export interface DayLine {
  what: string;
  soWhat: string;
  nowWhat: string;
}

/** studios/{studioId}/dayLogs/{uid}_{day} */
export interface DayLog {
  id: string;
  uid: string;
  studioId: string;
  /** The studio day, yyyy-mm-dd. */
  day: string;
  /** The day in facts, as they stood when saved (Close out). */
  facts: string[];
  /** Opening's things to carry today. */
  carry: string[];
  /** Close out's one line for yourself; null until written. */
  line: DayLine | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** The document id: the person, then the day. */
export function dayLogId(uid: string, day: string): string {
  return `${uid}_${day}`;
}

const tidy = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+$/g, "").slice(0, max) : "");

/** Up to three lines, each trimmed, empty ones left out. */
export function cleanCarry(lines: readonly string[]): string[] {
  return lines.map((l) => tidy(l, CARRY_TEXT_MAX).trim()).filter(Boolean).slice(0, CARRY_MAX);
}

/** The one line, trimmed; null when all three parts are empty. */
export function cleanLine(line: Partial<DayLine> | null | undefined): DayLine | null {
  if (!line) return null;
  const out = { what: tidy(line.what, LINE_TEXT_MAX).trim(), soWhat: tidy(line.soWhat, LINE_TEXT_MAX).trim(), nowWhat: tidy(line.nowWhat, LINE_TEXT_MAX).trim() };
  return out.what || out.soWhat || out.nowWhat ? out : null;
}

export function cleanFacts(facts: readonly string[]): string[] {
  return facts.map((f) => tidy(f, FACT_TEXT_MAX).trim()).filter(Boolean).slice(0, FACTS_MAX);
}

/** A day log off its document, defensively (an odd one never blanks the shelf). */
export function dayLogFromDoc(id: string, d: Record<string, unknown> | undefined): DayLog | null {
  if (!d || typeof d.uid !== "string" || typeof d.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.day)) return null;
  const list = (v: unknown, max: number, each: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, each)).slice(0, max) : []);
  const line = d.line && typeof d.line === "object" ? cleanLine(d.line as Partial<DayLine>) : null;
  return {
    id,
    uid: d.uid,
    studioId: typeof d.studioId === "string" ? d.studioId : "",
    day: d.day,
    facts: list(d.facts, FACTS_MAX, FACT_TEXT_MAX),
    carry: list(d.carry, CARRY_MAX, CARRY_TEXT_MAX),
    line,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

/** Does a day log hold anything a person wrote or chose (so the shelf shows it)? */
export function dayLogIsEmpty(log: Pick<DayLog, "facts" | "carry" | "line">): boolean {
  return log.facts.length === 0 && log.carry.length === 0 && !log.line;
}

/** The day log's heading: "Monday, September 28". */
export function dayLogHeading(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

/** One line for the list: the trainer's own words first, else the first fact. */
export function dayLogSummary(log: Pick<DayLog, "facts" | "carry" | "line">): string {
  if (log.line?.nowWhat) return `Now what: ${log.line.nowWhat}`;
  if (log.line?.what) return log.line.what;
  if (log.carry.length) return `Carried: ${log.carry.join(" · ")}`;
  return log.facts[1] ?? log.facts[0] ?? "";
}
