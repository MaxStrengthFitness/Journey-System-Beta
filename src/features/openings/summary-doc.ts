/**
 * THE WEEKLY SUMMARY, WRITTEN AND READ SAFELY (Openings,
 * docs/rounds/2026-09-27-openings.md, the data, part 2).
 *
 *   studios/{studioId}/watch/openings        written only by the Sunday job
 *     v         1                  the version the screen checks
 *     builtAt   ISO instant        "Built Sunday, Oct 4"
 *     tz        the studio clock the job used
 *     row       30                 minutes in a row
 *     since     the first Monday with a counted day, or null
 *     weeks     [{ m, d }]         the last 8 Monday-to-Saturday weeks, newest first
 *                 m  the Monday
 *                 d  "1".."6" -> { n, x?, j?, q? }
 *                      n  live bookings on file that day
 *                      x  why it didn't count: "r" not read in full, "c" closed or nearly
 *                      j  1 when it counted and could be judged
 *                      q  why a counted day couldn't be judged: "a" a trainer's
 *                         week wasn't agreed, "p" a booking couldn't be placed
 *     who       short key -> { id: trainers/{id}, n: name }
 *     agreed    short key -> [{ from, to?, blocks }]   the agreed weeks in force
 *     cells     "1-0800" -> { week index -> { s, b?, r?, c?, l?, i? } }
 *                 s  the word: "f" full, "r" room, "n" nobody booked,
 *                    "o" nobody in, "b" booked only
 *                 b  booked (a late cancellation counts)   r  of them on the rotation
 *                 c  stamped cancellations                 l  of them late
 *                 i  the trainers in (short keys), on a day that could be
 *                    judged; on any other, who was in isn't known
 *
 * NO CLIENT NAMES OR IDS. Terse on purpose: short keys, empty lists and zero
 * counts left out, and never a list inside a list (Firestore refuses one).
 *
 * A COUNTED WEEK WITH NO CELL at a time: judged, it was nobody in with
 * nothing booked; not judged, booked only with nothing booked. The fold
 * leaves those out (`isEmptyCell`) and `cellFor` puts them back.
 *
 * READING. A document that isn't there is "none" (never built); one that
 * isn't this version, or isn't a summary at all, is "unreadable" (the screen
 * says it can't read the usual week, never that it is empty). Inside a
 * readable one, anything malformed is left out rather than guessed.
 *
 * PURE MODULE: the Sunday job writes with it, the screens read with it.
 */
import { toDate, type DateLike } from "../../lib/studio-time";
import { normalizeVersions, type AgreedHistory, type AgreedVersion } from "./agreed";
import { isDayKey } from "./coverage";
import { ROW_MINUTES, parseTimeKey } from "./rows";
import type { Word } from "./room";

export const SUMMARY_VERSION = 1;

/** `studios/{studioId}/watch/{OPENINGS_WATCH_ID}`. */
export const OPENINGS_WATCH_ID = "openings";

/** A summary older than this shows its date plainly. */
export const STALE_DAYS = 8;

export type WordCode = "f" | "r" | "n" | "o" | "b";

export const WORD_CODE: Readonly<Record<Word, WordCode>> = { full: "f", room: "r", none: "n", out: "o", booked: "b" };
const CODE_WORD: Readonly<Record<WordCode, Word>> = { f: "full", r: "room", n: "none", o: "out", b: "booked" };

export interface CellWeek {
  s: WordCode;
  b?: number;
  r?: number;
  c?: number;
  l?: number;
  i?: string[];
}

export interface SummaryDay {
  n: number;
  x?: "r" | "c";
  j?: 1;
  q?: "a" | "p";
}

export interface SummaryWeek {
  /** The Monday. */
  m: string;
  /** "1" (Monday) to "6" (Saturday). */
  d: Record<string, SummaryDay>;
}

export interface SummaryWho {
  id: string;
  n: string;
}

export interface OpeningsSummary {
  v: number;
  builtAt: string;
  tz: string;
  row: number;
  since: string | null;
  weeks: SummaryWeek[];
  who: Record<string, SummaryWho>;
  agreed: Record<string, AgreedVersion[]>;
  cells: Record<string, Record<string, CellWeek>>;
}

export type SummaryRead = { state: "ok"; summary: OpeningsSummary } | { state: "none" } | { state: "unreadable" };

/** A cell the reader can put back on its own (the header). */
export function isEmptyCell(cell: CellWeek, judged: boolean): boolean {
  return cell.s === (judged ? "o" : "b") && !cell.b && !cell.c && !(cell.i && cell.i.length);
}

/** A cell as stored: zero counts and an empty list left out. */
export function cellForWrite(cell: { word: Word; booked: number; rotation: number; cancelled: number; late: number; inKeys: readonly string[] }): CellWeek {
  const out: CellWeek = { s: WORD_CODE[cell.word] };
  if (cell.booked > 0) out.b = cell.booked;
  if (cell.rotation > 0) out.r = cell.rotation;
  if (cell.cancelled > 0) out.c = cell.cancelled;
  if (cell.late > 0) out.l = cell.late;
  if (cell.inKeys.length > 0) out.i = [...cell.inKeys];
  return out;
}

/** A cell read back, whole: every count a number, the word a word. */
export interface Cell {
  word: Word;
  booked: number;
  rotation: number;
  cancelled: number;
  late: number;
  /** The trainers in, by short key. */
  inKeys: string[];
}

export function wordOf(code: WordCode): Word {
  return CODE_WORD[code];
}

/**
 * The cell at a time in a week: the stored one, or the empty one a counted
 * week leaves out. Null when that week's weekday didn't count.
 */
export function cellFor(summary: OpeningsSummary, key: string, weekIndex: number): Cell | null {
  const t = parseTimeKey(key);
  const week = summary.weeks[weekIndex];
  if (!t || !week) return null;
  const day = week.d[String(t.weekday)];
  if (!day || day.x) return null;
  const stored = summary.cells[key]?.[String(weekIndex)];
  const judged = day.j === 1;
  if (!stored) return { word: judged ? "out" : "booked", booked: 0, rotation: 0, cancelled: 0, late: 0, inKeys: [] };
  return {
    word: CODE_WORD[stored.s],
    booked: stored.b ?? 0,
    rotation: stored.r ?? 0,
    cancelled: stored.c ?? 0,
    late: stored.l ?? 0,
    inKeys: stored.i ?? [],
  };
}

/** Nothing `undefined` anywhere, and `to` left out while a version still runs: what the job writes. */
export function summaryForWrite(summary: OpeningsSummary): OpeningsSummary {
  const agreed: Record<string, AgreedVersion[]> = {};
  for (const [k, versions] of Object.entries(summary.agreed)) {
    agreed[k] = versions.map((v) => ({ from: v.from, ...(v.to ? { to: v.to } : {}), blocks: [...v.blocks] }) as AgreedVersion);
  }
  return strip({ ...summary, agreed }) as OpeningsSummary;
}

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter((v) => v !== undefined).map(strip);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = strip(v);
    return out;
  }
  return value;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown): number | undefined => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : undefined);
const CODES = new Set<string>(["f", "r", "n", "o", "b"]);

function readDay(raw: unknown): SummaryDay | null {
  if (!isObject(raw)) return null;
  const n = typeof raw.n === "number" && Number.isInteger(raw.n) && raw.n >= 0 ? raw.n : 0;
  if (raw.x === "r" || raw.x === "c") return { n, x: raw.x };
  return { n, ...(raw.j === 1 ? { j: 1 as const } : raw.q === "a" || raw.q === "p" ? { q: raw.q } : {}) };
}

function readCell(raw: unknown, keys: ReadonlySet<string>): CellWeek | null {
  if (!isObject(raw) || typeof raw.s !== "string" || !CODES.has(raw.s)) return null;
  const out: CellWeek = { s: raw.s as WordCode };
  for (const f of ["b", "r", "c", "l"] as const) {
    const n = count(raw[f]);
    if (n !== undefined) out[f] = n;
  }
  const i = Array.isArray(raw.i) ? raw.i.filter((k): k is string => typeof k === "string" && keys.has(k)) : [];
  if (i.length > 0) out.i = i;
  return out;
}

/** A stored summary, read safely (the header). */
export function readSummary(data: unknown): SummaryRead {
  if (data === undefined || data === null) return { state: "none" };
  if (!isObject(data) || data.v !== SUMMARY_VERSION) return { state: "unreadable" };
  const built = toDate(data.builtAt as DateLike);
  if (!built || !Array.isArray(data.weeks) || !isObject(data.cells)) return { state: "unreadable" };

  const weeks: SummaryWeek[] = [];
  for (const w of data.weeks) {
    if (!isObject(w) || !isDayKey(w.m) || !isObject(w.d)) return { state: "unreadable" };
    const d: Record<string, SummaryDay> = {};
    for (const wd of ["1", "2", "3", "4", "5", "6"]) {
      const day = readDay(w.d[wd]);
      if (day) d[wd] = day;
    }
    weeks.push({ m: w.m, d });
  }

  const who: Record<string, SummaryWho> = {};
  if (isObject(data.who)) {
    for (const [k, v] of Object.entries(data.who)) {
      if (isObject(v) && typeof v.id === "string" && v.id !== "") who[k] = { id: v.id, n: typeof v.n === "string" ? v.n : "" };
    }
  }
  const keys = new Set(Object.keys(who));

  const agreed: Record<string, AgreedVersion[]> = {};
  if (isObject(data.agreed)) {
    for (const [k, v] of Object.entries(data.agreed)) {
      if (!keys.has(k)) continue;
      const versions = normalizeVersions(v);
      if (versions.length > 0) agreed[k] = versions;
    }
  }

  const cells: Record<string, Record<string, CellWeek>> = {};
  for (const [key, byWeek] of Object.entries(data.cells)) {
    if (!parseTimeKey(key) || !isObject(byWeek)) continue;
    const out: Record<string, CellWeek> = {};
    for (const [index, raw] of Object.entries(byWeek)) {
      if (!/^\d+$/.test(index) || Number(index) >= weeks.length) continue;
      const cell = readCell(raw, keys);
      if (cell) out[index] = cell;
    }
    if (Object.keys(out).length > 0) cells[key] = out;
  }

  return {
    state: "ok",
    summary: {
      v: SUMMARY_VERSION,
      builtAt: built.toISOString(),
      tz: typeof data.tz === "string" ? data.tz : "",
      row: typeof data.row === "number" ? data.row : ROW_MINUTES,
      since: isDayKey(data.since) ? data.since : null,
      weeks,
      who,
      agreed,
      cells,
    },
  };
}

/** The agreed weeks' history by trainers/{id}, for next Sunday's carry. */
export function historyOf(summary: OpeningsSummary): AgreedHistory {
  const out: AgreedHistory = {};
  for (const [k, versions] of Object.entries(summary.agreed)) {
    const id = summary.who[k]?.id;
    if (id) out[id] = versions;
  }
  return out;
}

/** Is the summary older than STALE_DAYS? An unreadable date is old. */
export function isStale(summary: Pick<OpeningsSummary, "builtAt">, now: Date): boolean {
  const built = toDate(summary.builtAt);
  if (!built) return true;
  return now.getTime() - built.getTime() > STALE_DAYS * 24 * 60 * 60 * 1000;
}
