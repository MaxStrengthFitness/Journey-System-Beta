/**
 * WHEN A TRAINER ISN'T ON (calm Hub round, Sep 28 2026). Pure: off-hours.test.ts.
 *
 * AJ's Mindbody screenshots, Keep: "who's working, at a glance: the darker
 * stretches show when a trainer isn't on. Ours hatches them, so it reads in
 * both themes." Journey's own answer to when a trainer works is the AGREED
 * standing week (features/standing-week): the blocks a leader agreed, and the
 * days away a trainer set. So a column is hatched:
 *
 *   - outside the day's agreed blocks;
 *   - all day on a weekday the agreed week has no block ("doesn't take
 *     clients" that day);
 *   - all day when the trainer is away (their own record, no agreement
 *     needed: AJ, Sep 27, "if someone has a vacation then it should block it
 *     out");
 *
 * and NOT AT ALL when there is no agreed week, or it couldn't be read: an
 * unknown is never drawn as "off" (a failed read is unknown, never empty).
 * A proposed week that nobody agreed says nothing either.
 *
 * It only shades. A booking in a hatched stretch is still drawn, and Journey
 * books nothing (the standing week is a check, never a booking).
 */
import { awayOn, minutesOf, type StandingWeekDoc } from "../standing-week/week";
import type { Span } from "./grid-model";

export type TrainerDayFrame =
  | { kind: "unknown" }
  | { kind: "away"; note: string | null }
  | { kind: "week"; off: Span[] };

const UNKNOWN: TrainerDayFrame = { kind: "unknown" };

/** The stretches of `range` outside the given blocks, in order. */
export function outside(blocks: ReadonlyArray<Span>, range: Span): Span[] {
  const sorted = blocks
    .map((b) => ({ from: Math.max(range.from, b.from), to: Math.min(range.to, b.to) }))
    .filter((b) => b.to > b.from)
    .sort((a, b) => a.from - b.from);
  const off: Span[] = [];
  let cursor = range.from;
  for (const b of sorted) {
    if (b.from > cursor) off.push({ from: cursor, to: b.from });
    cursor = Math.max(cursor, b.to);
  }
  if (cursor < range.to) off.push({ from: cursor, to: range.to });
  return off;
}

/**
 * What the grid may say about one trainer on one day. `day` is the studio
 * day ("yyyy-mm-dd"), `weekday` its day of the week (0 = Sunday), `range`
 * the stretch of the day the grid draws.
 */
export function trainerDayFrame(
  doc: StandingWeekDoc | null | undefined,
  day: string,
  weekday: number,
  range: Span,
): TrainerDayFrame {
  if (!doc) return UNKNOWN;
  const away = awayOn(doc.away ?? [], day);
  if (away) return { kind: "away", note: away.note?.trim() || null };
  const week = doc.final;
  if (!week) return UNKNOWN;
  const blocks: Span[] = [];
  for (const h of week.hours) {
    if (h.weekday !== weekday) continue;
    const from = minutesOf(h.from);
    const to = minutesOf(h.to);
    if (from === null || to === null || to <= from) continue;
    blocks.push({ from, to });
  }
  return { kind: "week", off: outside(blocks, range) };
}

/** The agreed weeks by the trainer they belong to (trainers/{id}, what a column is keyed by). */
export function weeksByTrainer(docs: ReadonlyArray<StandingWeekDoc>): ReadonlyMap<string, StandingWeekDoc> {
  const out = new Map<string, StandingWeekDoc>();
  for (const d of docs) if (d.trainerId) out.set(d.trainerId, d);
  return out;
}
