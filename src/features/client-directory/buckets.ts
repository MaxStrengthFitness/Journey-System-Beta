/**
 * THE SORT IS THE STRUCTURE — sort keys, their words, and the sections each
 * one breaks the list into. Pure: buckets.test.ts (TZ=America/New_York).
 *
 * The directory round (Sep 27 2026), research-directory §5. A sort orders
 * the rows AND names the groups they fall in ("Last 7 days · 58"), so the
 * trainer can see the order rather than infer it. The rules:
 *
 *   - Sections are studio days, counted in the studio's time zone: every
 *     day here is a `yyyy-mm-dd` key from the row, compared by calendar
 *     arithmetic, never `new Date("yyyy-mm-dd")` (the date trap).
 *   - Unknowns always come LAST, in their own named section, whichever way
 *     the sort runs. "Before Journey", "Nothing recorded", "Nothing booked"
 *     and "Not on file" are sections of their own, never mixed in with a
 *     number or a date.
 *   - Ties break by the name she goes by, then her last name.
 *   - The direction is said in words ("Last in: most recent first"), never
 *     only an arrow.
 */
import { daysBetween } from "../client-history/model";
import type { DirectoryRow } from "./row";
import { heightWords } from "./row";

export type SortKey = "lastIn" | "next" | "left" | "total" | "age" | "height" | "name" | "lastName" | "since" | "time" | "renews";
export type SortDir = "asc" | "desc";
export interface SortSpec {
  key: SortKey;
  dir: SortDir;
}

export interface SortMeta {
  /** The column header it belongs to, or null for a sort with no column. */
  column: "client" | "lastIn" | "next" | "left" | "total" | "age" | "height" | "renews" | null;
  /** The direction a first tap picks. */
  defaultDir: SortDir;
  /** Each direction said in words. */
  words: Record<SortDir, string>;
}

export const SORTS: Record<SortKey, SortMeta> = {
  lastIn: { column: "lastIn", defaultDir: "desc", words: { desc: "Last in: most recent first", asc: "Last in: longest ago first" } },
  next: { column: "next", defaultDir: "asc", words: { asc: "Next booking: soonest first", desc: "Next booking: furthest first" } },
  left: { column: "left", defaultDir: "asc", words: { asc: "Sessions left: fewest first", desc: "Sessions left: most first" } },
  total: { column: "total", defaultDir: "desc", words: { desc: "Total sessions: most first", asc: "Total sessions: fewest first" } },
  age: { column: "age", defaultDir: "desc", words: { desc: "Age: oldest first", asc: "Age: youngest first" } },
  height: { column: "height", defaultDir: "desc", words: { desc: "Height: tallest first", asc: "Height: shortest first" } },
  name: { column: "client", defaultDir: "asc", words: { asc: "Name: first name A\u2013Z", desc: "Name: first name Z\u2013A" } },
  lastName: { column: null, defaultDir: "asc", words: { asc: "Name: last name A\u2013Z", desc: "Name: last name Z\u2013A" } },
  renews: { column: "renews", defaultDir: "asc", words: { asc: "Renewal: soonest first", desc: "Renewal: furthest first" } },
  since: { column: null, defaultDir: "asc", words: { asc: "Client since: longest first", desc: "Client since: newest first" } },
  time: { column: null, defaultDir: "asc", words: { asc: "Today\u2019s time: earliest first", desc: "Today\u2019s time: latest first" } },
};

/** The order the sort menu lists them in. `time` only makes sense in the In today view. */
export const SORT_MENU: SortKey[] = ["lastIn", "next", "left", "renews", "total", "age", "height", "name", "lastName", "since"];

export function sortWords(spec: SortSpec): string {
  return SORTS[spec.key].words[spec.dir];
}

/** A header tap: the same column again reverses it; a new one starts at its default. */
export function nextSortForTap(current: SortSpec, key: SortKey): SortSpec {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: SORTS[key].defaultDir };
}

export function isSortKey(v: unknown): v is SortKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(SORTS, v);
}

/* ------------------------------------------------------------------ */
/* Buckets                                                             */
/* ------------------------------------------------------------------ */

export interface BucketContext {
  /** The studio's day. */
  today: string;
  now: Date;
  /** "9:14 AM" — named in the Unknown section of the next-booking sort. */
  bookingsAsOf?: string | null;
  /** The held bookings' reach, for "Nothing booked (next 8 days)". */
  horizonDays?: number;
}

interface Bucket {
  id: string;
  label: string;
  /** Position among the KNOWN sections, in the key's natural (ascending) order. */
  rank: number;
  /** A section that is not a value: always last, in `rank` order, whatever the direction. */
  tail: boolean;
}

const known = (id: string, label: string, rank: number): Bucket => ({ id, label, rank, tail: false });
const tail = (id: string, label: string, rank: number): Bucket => ({ id, label, rank, tail: true });

function lastInBucket(row: DirectoryRow, ctx: BucketContext): Bucket {
  const l = row.lastIn;
  if (l.state === "known" && l.day) {
    const ago = daysBetween(l.day, ctx.today);
    // Ascending rank = oldest first, so "more recent" is a higher rank.
    if (ago <= 0) return known("today", "Today", 6);
    if (ago <= 7) return known("7d", "Last 7 days", 5);
    if (ago <= 14) return known("14d", "8\u201314 days ago", 4);
    if (ago <= 28) return known("28d", "15\u201328 days ago", 3);
    if (ago <= 91) return known("3m", "1\u20133 months ago", 2);
    return known("older", "More than 3 months ago", 1);
  }
  if (l.state === "before-journey") return tail("before", "Before Journey", 1);
  if (l.state === "nothing-recorded") return tail("nothing", "Nothing recorded", 2);
  return tail("unknown", "Unknown", 3);
}

function nextBucket(row: DirectoryRow, ctx: BucketContext): Bucket {
  const n = row.next;
  if (n.state === "booked" && n.day) {
    const ahead = daysBetween(ctx.today, n.day);
    if (ahead <= 0) return known("today", "Today", 1);
    if (ahead === 1) return known("tomorrow", "Tomorrow", 2);
    if (ahead <= 7) return known("7d", "Next 7 days", 3);
    if (ahead <= 30) return known("30d", "8\u201330 days", 4);
    return known("later", "Later", 5);
  }
  if (n.state === "none") return tail("none", `Nothing booked (next ${ctx.horizonDays ?? 8} days)`, 1);
  return tail("unknown", ctx.bookingsAsOf ? `Unknown (bookings as of ${ctx.bookingsAsOf})` : "Unknown (bookings not loaded)", 2);
}

function leftBucket(row: DirectoryRow): Bucket {
  const v = row.left.value;
  if (row.left.state !== "known" || v === null) return tail("unknown", "Unknown", 1);
  if (v <= 0) return known("none", row.left.perPayment ? "None on hand" : "None left", 1);
  if (v <= 4) return known("1-4", "1\u20134 left", 2);
  if (v <= 12) return known("5-12", "5\u201312 left", 3);
  return known("13+", "13 or more", 4);
}

function renewsBucket(row: DirectoryRow, ctx: BucketContext): Bucket {
  const r = row.renews;
  if (r.state === "known" && r.day) {
    const ahead = daysBetween(ctx.today, r.day);
    if (ahead < 0) return known("ended", "Already ended", 1);
    if (ahead <= 14) return known("14d", "Next 2 weeks", 2);
    if (ahead <= 31) return known("31d", "15–31 days", 3);
    if (ahead <= 92) return known("3m", "1–3 months", 4);
    return known("later", "Later", 5);
  }
  if (r.state === "renewed") return tail("renewed", "Already renewed", 1);
  if (r.state === "paid") return tail("paid", "Paid in full · ends when sessions run out", 2);
  if (r.state === "none") return tail("none", "No end date", 3);
  return tail("unknown", "Unknown", 4);
}

function totalBucket(row: DirectoryRow): Bucket {
  const v = row.total.value;
  if (row.total.state !== "known" || v === null) return tail("unknown", "Unknown", 1);
  if (v >= 500) return known("500", "500 or more", 5);
  if (v >= 200) return known("200", "200\u2013499", 4);
  if (v >= 100) return known("100", "100\u2013199", 3);
  if (v >= 50) return known("50", "50\u201399", 2);
  return known("0", "Fewer than 50", 1);
}

function ageBucket(row: DirectoryRow): Bucket {
  const a = row.age.value;
  if (a === null) return tail("unknown", "Not on file", 1);
  if (a >= 100) return known("100", "100 or older", 7);
  if (a >= 50) {
    const decade = Math.floor(a / 10) * 10;
    return known(String(decade), `${decade}s`, decade / 10 - 3);
  }
  return known("under50", "Under 50", 1);
}

function heightBucket(row: DirectoryRow): Bucket {
  const h = row.height.inches;
  if (h === null) return tail("unknown", "Not on file", 1);
  return known(String(h), heightWords(h), h);
}

function letterOf(text: string): string {
  const first = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .charAt(0)
    .toUpperCase();
  return /[A-Z]/.test(first) ? first : "#";
}

function nameBucket(text: string): Bucket {
  const l = letterOf(text);
  return l === "#" ? tail("#", "#", 1) : known(l, l, l.charCodeAt(0));
}

function sinceBucket(row: DirectoryRow): Bucket {
  const y = row.since.year;
  if (y === null) return tail("unknown", "Not on file", 1);
  return known(String(y), String(y), y);
}

function timeBucket(row: DirectoryRow, ctx: BucketContext): Bucket {
  const t = row.today;
  if (!t) return tail("none", "Not booked today", 1);
  return t.end <= ctx.now.getTime() ? known("earlier", "Earlier today", 1) : known("coming", "Coming up", 2);
}

export function bucketOf(row: DirectoryRow, key: SortKey, ctx: BucketContext): Bucket {
  switch (key) {
    case "lastIn":
      return lastInBucket(row, ctx);
    case "next":
      return nextBucket(row, ctx);
    case "left":
      return leftBucket(row);
    case "renews":
      return renewsBucket(row, ctx);
    case "total":
      return totalBucket(row);
    case "age":
      return ageBucket(row);
    case "height":
      return heightBucket(row);
    case "name":
      return nameBucket(row.name.goesBy || row.name.last);
    case "lastName":
      return nameBucket(row.name.last || row.name.goesBy);
    case "since":
      return sinceBucket(row);
    case "time":
      return timeBucket(row, ctx);
  }
}

/* ------------------------------------------------------------------ */
/* The order inside a section                                          */
/* ------------------------------------------------------------------ */

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** Ties: the name she goes by, then her last name. Always A–Z, whichever way the sort runs. */
export function byName(a: DirectoryRow, b: DirectoryRow): number {
  return collator.compare(a.name.goesBy, b.name.goesBy) || collator.compare(a.name.last, b.name.last) || a.id.localeCompare(b.id);
}

/** The value a row sorts by inside its section; null sorts with the section's order alone. */
function valueOf(row: DirectoryRow, key: SortKey): number | string | null {
  switch (key) {
    case "lastIn":
      return row.lastIn.day;
    case "next":
      return row.next.at;
    case "left":
      return row.left.value;
    case "renews":
      // Paid in full has no day: it ends when her sessions run out, so fewest left first.
      return row.renews.state === "paid" ? row.left.value : row.renews.day;
    case "total":
      return row.total.value;
    case "age":
      // Age alone ties every 72-year-old; the birthday orders them, so
      // "oldest first" is true to the day. Days to the next birthday run
      // the other way from age within one year of age.
      return row.age.value === null ? null : row.age.value * 1000 - (row.age.daysToBirthday ?? 0);
    case "height":
      return row.height.inches;
    case "name":
      return null;
    case "lastName":
      return row.name.last.toLowerCase();
    case "since":
      return row.since.at;
    case "time":
      return row.today?.at ?? null;
  }
}

function compareValues(a: number | string | null, b: number | string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "string" && typeof b === "string") return collator.compare(a, b);
  return (a as number) - (b as number);
}

export interface Section {
  id: string;
  label: string;
  rows: DirectoryRow[];
  /** A section that is not a value (Unknown, Before Journey, Not on file…). */
  tail: boolean;
}

/**
 * The rows, sorted and broken into sections for the sort. Empty sections are
 * never returned.
 */
export function sectionRows(rows: ReadonlyArray<DirectoryRow>, sort: SortSpec, ctx: BucketContext): Section[] {
  const groups = new Map<string, { bucket: Bucket; rows: DirectoryRow[] }>();
  for (const row of rows) {
    const bucket = bucketOf(row, sort.key, ctx);
    const key = `${bucket.tail ? "t" : "k"}:${bucket.id}`;
    const g = groups.get(key) ?? { bucket, rows: [] };
    g.rows.push(row);
    groups.set(key, g);
  }
  const sign = sort.dir === "asc" ? 1 : -1;
  const ordered = [...groups.values()].sort((a, b) => {
    if (a.bucket.tail !== b.bucket.tail) return a.bucket.tail ? 1 : -1;
    if (a.bucket.tail) return a.bucket.rank - b.bucket.rank;
    return sign * (a.bucket.rank - b.bucket.rank);
  });
  return ordered.map(({ bucket, rows: list }) => ({
    id: `${bucket.tail ? "t" : "k"}:${bucket.id}`,
    label: bucket.label,
    tail: bucket.tail,
    rows: [...list].sort((a, b) => {
      const va = valueOf(a, sort.key);
      const vb = valueOf(b, sort.key);
      if (va !== null && vb !== null) {
        const c = compareValues(va, vb);
        if (c !== 0) return sign * c;
      } else if (va !== vb) {
        return compareValues(va, vb);
      }
      return sort.key === "name" && sort.dir === "desc" ? byName(b, a) : byName(a, b);
    }),
  }));
}

/** The rows in section order, flat — the order a list or a test reads them in. */
export function sortRows(rows: ReadonlyArray<DirectoryRow>, sort: SortSpec, ctx: BucketContext): DirectoryRow[] {
  return sectionRows(rows, sort, ctx).flatMap((s) => s.rows);
}
