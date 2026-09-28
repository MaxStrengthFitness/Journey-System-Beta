/**
 * WHICH AGREED WEEK WAS IN FORCE ON A DAY (Openings,
 * docs/rounds/2026-09-27-openings.md, "Who is in" and the data, part 2).
 *
 * An agreed standing week describes the days FROM THE DAY IT WAS AGREED (the
 * studio day of `finalAt`) until the day it was changed. Today's weeks are
 * never applied to the past: a trainer who used to start at 6:00 and now
 * starts at 8:00 would otherwise turn every old 6:00 into "nobody in" and
 * every new 12:30 into "room". A day before a trainer's first agreement has
 * no agreed week for them.
 *
 * THE VERSIONS KEPT. Nothing but the Sunday summary holds an agreed week's
 * history (the standing week document keeps only the current one), so each
 * Sunday the job carries the versions forward (`carryHistory`):
 *
 *   - each current agreed week is in force from the day it was agreed;
 *   - where last Sunday's summary held a different version, that version is
 *     closed on the day before the new one began, and kept;
 *   - the same blocks agreed again keep the older start: nothing changed;
 *   - a week that is gone (removed, or its trainer left) is closed on the
 *     day last Sunday's summary was built, the last day Journey saw it;
 *   - versions that ended before the window drop off.
 *
 * If last Sunday's summary is missing or unreadable, older weeks use only
 * the current version, from the day it was agreed: the grid then says less,
 * never more.
 *
 * Only the blocks (the standing week's `hours`, "when I usually take
 * clients") are kept: who is in needs nothing else, and the regulars the
 * screens name are always today's.
 *
 * A BLOCK is stored as "1-0700-1300" (weekday, from, to): the summary may not
 * hold a list inside a list.
 *
 * PURE MODULE: the Sunday job imports it.
 */
import { studioDateKey, toDate, type DateLike } from "../../lib/studio-time";
import { addDays } from "./coverage";
import { ROW_MINUTES } from "./rows";
import { isClock, minutesOf, normalizeWeek, type StandingWeekDoc, type WorkHours } from "../standing-week/week";

/** One agreed week, and the days it was in force (both ends included; `to` null while it still is). */
export interface AgreedVersion {
  from: string;
  to: string | null;
  /** "1-0700-1300". */
  blocks: string[];
}

/** Each trainer's versions, by trainers/{id}, oldest first. */
export type AgreedHistory = Record<string, AgreedVersion[]>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "1-0700-1300" for Monday 7:00 AM to 1:00 PM. */
export function blockKey(h: Pick<WorkHours, "weekday" | "from" | "to">): string {
  return `${h.weekday}-${h.from.replace(":", "")}-${h.to.replace(":", "")}`;
}

/** A stored block, or null for anything that isn't one. */
export function parseBlock(raw: unknown): WorkHours | null {
  if (typeof raw !== "string") return null;
  const m = /^([0-6])-(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(raw);
  if (!m) return null;
  const from = `${m[2]}:${m[3]}`;
  const to = `${m[4]}:${m[5]}`;
  if (!isClock(from) || !isClock(to) || minutesOf(from)! >= minutesOf(to)!) return null;
  return { weekday: Number(m[1]), from, to };
}

/** The blocks of a week, as stored, in the week's own order. */
export function blocksOf(hours: readonly WorkHours[]): string[] {
  return normalizeWeek({ hours, regulars: [] }).hours.map(blockKey);
}

const sameBlocks = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

/**
 * Each trainer's agreed week as it stands now, by trainers/{id}: in force
 * from the studio day it was agreed. An agreement whose day can't be read is
 * taken as today's, so it says nothing about the past.
 */
export function currentVersions(docs: readonly StandingWeekDoc[], today: string, tz: string): Record<string, AgreedVersion> {
  const out: Record<string, AgreedVersion> = {};
  for (const doc of docs) {
    if (!doc.final || !doc.trainerId) continue;
    const at = toDate(doc.finalAt as DateLike);
    const agreedOn = at ? studioDateKey(at, tz) : null;
    const from = agreedOn && agreedOn <= today ? agreedOn : today;
    out[doc.trainerId] = { from, to: null, blocks: blocksOf(doc.final.hours) };
  }
  return out;
}

/** A stored list of versions, made safe: malformed ones left out, overlaps trimmed, oldest first. */
export function normalizeVersions(raw: unknown): AgreedVersion[] {
  const list = (Array.isArray(raw) ? raw : [])
    .map((v) => v as Partial<AgreedVersion> | null)
    .filter((v): v is AgreedVersion => !!v && typeof v.from === "string" && DAY.test(v.from) && (v.to === null || v.to === undefined || (typeof v.to === "string" && DAY.test(v.to) && v.to >= v.from)))
    .map((v) => ({ from: v.from, to: typeof v.to === "string" ? v.to : null, blocks: (Array.isArray(v.blocks) ? v.blocks : []).filter((b): b is string => parseBlock(b) !== null) }))
    .sort((a, b) => a.from.localeCompare(b.from));
  // One version a day: a version runs at most until the day before the next begins.
  const out: AgreedVersion[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const v = list[i];
    const next = list[i + 1];
    if (next && next.from <= v.from) continue;
    const cap = next ? addDays(next.from, -1) : null;
    const to = cap && (v.to === null || v.to > cap) ? cap : v.to;
    out.push({ ...v, to });
  }
  return out;
}

/**
 * Last Sunday's versions carried to this Sunday (the header). `keepFrom` is
 * the first day of the window: a version that ended before it drops off.
 * `previousBuilt` is the studio day last Sunday's summary was built, or null.
 */
export function carryHistory(
  previous: AgreedHistory | null,
  current: Readonly<Record<string, AgreedVersion>>,
  options: { keepFrom: string; previousBuilt: string | null },
): AgreedHistory {
  const out: AgreedHistory = {};
  const ids = new Set([...Object.keys(previous ?? {}), ...Object.keys(current)]);
  for (const id of ids) {
    const before = normalizeVersions(previous?.[id] ?? []);
    const closed = before.filter((v) => v.to !== null);
    const open = before.find((v) => v.to === null) ?? null;
    const now = current[id] ?? null;
    let versions: AgreedVersion[] = [...closed];
    if (now) {
      if (open && sameBlocks(open.blocks, now.blocks)) {
        versions.push({ ...now, from: open.from < now.from ? open.from : now.from });
      } else {
        if (open && open.from < now.from) versions.push({ ...open, to: addDays(now.from, -1) });
        versions.push({ ...now });
      }
    } else if (open && options.previousBuilt && options.previousBuilt >= open.from) {
      versions.push({ ...open, to: options.previousBuilt });
    }
    versions = normalizeVersions(versions).filter((v) => v.to === null || v.to >= options.keepFrom);
    if (versions.length > 0) out[id] = versions;
  }
  return out;
}

/** The version in force on a day, or null. */
export function versionOn(versions: readonly AgreedVersion[] | null | undefined, day: string): AgreedVersion | null {
  return (versions ?? []).find((v) => v.from <= day && (v.to === null || day <= v.to)) ?? null;
}

/** The blocks of a version, read back (malformed ones left out). */
export function blocksIn(version: AgreedVersion | null): WorkHours[] {
  return (version?.blocks ?? []).map(parseBlock).filter((b): b is WorkHours => b !== null);
}

/** Do these blocks have the trainer taking clients across the whole half-hour starting at `row` on `weekday`? */
export function takesClientsAt(blocks: readonly WorkHours[], weekday: number, row: number): boolean {
  return blocks.some((b) => b.weekday === weekday && minutesOf(b.from)! <= row && minutesOf(b.to)! >= row + ROW_MINUTES);
}

/** Every half-hour the blocks cover on a weekday, earliest first. */
export function rowsCovered(blocks: readonly WorkHours[], weekday: number): number[] {
  const rows = new Set<number>();
  for (const b of blocks) {
    if (b.weekday !== weekday) continue;
    const from = minutesOf(b.from)!;
    const to = minutesOf(b.to)!;
    const first = Math.ceil(from / ROW_MINUTES) * ROW_MINUTES;
    for (let row = first; row + ROW_MINUTES <= to; row += ROW_MINUTES) rows.add(row);
  }
  return [...rows].sort((a, b) => a - b);
}
