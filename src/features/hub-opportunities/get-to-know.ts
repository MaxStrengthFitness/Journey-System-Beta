/**
 * GET TO KNOW — the ✎ "Ask about" mark, from FORD (hub cherry round, Sep 28
 * 2026). Pure: get-to-know.test.ts.
 *
 * The Hub room's round 7 (the Redesign Blueprints), research-hub §5 and §7:
 * "A FORD detail dated in the next 7 days, or new in the last 14 days; at
 * most one per client" — "Ask: recital Sat" on the list, "Ask about: her
 * granddaughter's recital on Saturday (Family, noted Sep 22)" in the peek.
 * FORD is how a studio with no lounge builds its community on purpose
 * (docs/business/the-floor.md), and this is FORD reaching the floor on the
 * day it can be used.
 *
 * Asked about the BOOKING's day, never today, like every Hub moment:
 *
 *   - DATED: the detail's day comes round within the next 7 days, the day
 *     itself included — an annual one (a birthday, an anniversary) rolled
 *     forward to its next occurrence, read from its digits on the studio's
 *     day, never through a Date in the iPad's zone;
 *   - NEW: noted in the 14 days up to the day;
 *   - never an archived detail, the team's In one line (a FORD document that
 *     is not a detail, ford/one-line.ts), a legacy `client.events` row, a
 *     detail someone marked no longer true (`resolvedAt`), or one whose
 *     window has closed;
 *   - at most ONE per client: the soonest dated one, else the newest new one.
 *
 * On a shared screen the words stay off the grid (research-hub §7, rule 9):
 * the card would carry the glyph alone, and the chip and the sentence live
 * in the list and the peek, which a trainer opens on purpose.
 *
 * UNWIRED, ON PURPOSE. It needs the studio's FORD details read once for the
 * Hub, and the one studio-wide FORD read Journey makes today — the Delight
 * queue's collection group query (ford/useClientFord.ts) — asks only for
 * details with an open gesture (`opportunity.status` idea or planned), so it
 * cannot give these. Any read that can (every detail at the studio; the
 * dated ones by `eventDate`, which misses an anniversary stored in an
 * earlier year; the new ones by `occurredAt`, which has no index) is a new
 * read shape, and a new one needs AJ's OK (the room's Needs OK: "one
 * read-only FORD read per studio"). What is built is what the read will feed.
 */
import type { FordEntry, FordPillar } from "../ford/types";
import { FORD_META } from "../ford/types";
import { isOneLineDoc } from "../ford/one-line";
import { studioDayKeyOf } from "../../lib/studio-time";
import { addDays, daysBetween, weekdayOf } from "../client-history/model";

/** A dated detail is worth asking about this many days ahead of the day (the day itself included). */
export const ASK_DATED_DAYS = 7;
/** A new detail is worth asking about for this many days after it was noted. */
export const ASK_NEW_DAYS = 14;

export interface AskAbout {
  /** The FORD detail it came from. */
  entryId: string;
  clientId: string;
  /** "dated": its day comes round within the week; "new": noted in the last two weeks. */
  reason: "dated" | "new";
  /** The studio day the detail points at, when dated (its next occurrence for an annual one). */
  onDay: string | null;
  /** A few words for the list's chip: "Ask: Ethan · Sat", "Ask: the garden". */
  chip: string;
  /** The whole sentence, in the trainer's own words, for the peek and the opened row. */
  sentence: string;
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const monthDay = (key: string) => `${MONTH[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(8, 10))}`;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The day an annual detail next comes round on or after `day`, from its
 * digits (Feb 29 falls on Mar 1 in a year without one).
 */
export function nextAnnualDay(stored: string, day: string): string | null {
  const m = DAY_KEY.exec(stored);
  const d = DAY_KEY.exec(day);
  if (!m || !d) return null;
  const md = `${m[2]}-${m[3]}`;
  for (const y of [Number(d[1]), Number(d[1]) + 1]) {
    const key = md === "02-29" && !isLeap(y) ? `${y}-03-01` : `${y}-${md}`;
    if (key >= day) return key;
  }
  return null;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function pillarLabel(p: FordPillar | null | undefined): string | null {
  return p && FORD_META[p] ? FORD_META[p].label : null;
}

/** May this detail be asked about at all, on the day? */
function askable(e: FordEntry, day: string, tz?: string): boolean {
  if (!e || !e.id || !e.clientId) return false;
  if (e.isArchived || e.isLegacy || isOneLineDoc(e)) return false;
  if (e.resolvedAt) return false;
  const until = studioDayKeyOf(e.effectiveUntil ?? null, tz);
  if (until && until < day) return false;
  return typeof e.body === "string" && e.body.trim().length > 0;
}

/** Why a detail comes up on the day, or null. */
function reasonOn(e: FordEntry, day: string, tz?: string): { reason: "dated" | "new"; onDay: string | null; noted: string | null } | null {
  const noted = studioDayKeyOf(e.occurredAt ?? e.createdAt ?? null, tz);
  const stored = studioDayKeyOf(e.eventDate ?? null, tz);
  if (stored) {
    const onDay = e.recurrence === "annual" ? nextAnnualDay(stored, day) : stored;
    if (onDay) {
      const ahead = daysBetween(day, onDay);
      if (ahead >= 0 && ahead < ASK_DATED_DAYS) return { reason: "dated", onDay, noted };
    }
  }
  if (noted) {
    const since = daysBetween(noted, day);
    if (since >= 0 && since < ASK_NEW_DAYS) return { reason: "new", onDay: null, noted };
  }
  return null;
}

/**
 * The chip's few words: the detail's own subject ("the recital", "Ethan"),
 * or else the first words the trainer wrote, marked as a start with an
 * ellipsis. Never a name cut: a subject is used whole, and the sentence in
 * the peek always has every word.
 */
function chipWhat(e: FordEntry, body: string): string {
  const subject = (e.subject ?? "").trim();
  if (subject) return subject;
  const parts = body.split(/\s+/).filter(Boolean);
  return parts.length > 3 ? `${parts.slice(0, 3).join(" ")}…` : parts.join(" ");
}

function words(e: FordEntry, why: { reason: "dated" | "new"; onDay: string | null; noted: string | null }, day: string): { chip: string; sentence: string } {
  const body = e.body.trim().replace(/[.!]+$/, "");
  const what = chipWhat(e, body);
  const when = why.onDay ? (why.onDay === day ? "today" : WEEKDAY[weekdayOf(why.onDay)]) : null;
  const chip = `Ask: ${what}${when ? ` · ${when}` : ""}`;
  const whenLong = why.onDay ? (why.onDay === day ? "today" : `${WEEKDAY_LONG[weekdayOf(why.onDay)]}, ${monthDay(why.onDay)}`) : null;
  const proof = [pillarLabel(e.pillar), why.noted ? `noted ${monthDay(why.noted)}` : null].filter(Boolean).join(", ");
  const sentence = `Ask about: ${body}${whenLong ? ` — ${whenLong}` : ""}${proof ? ` (${proof})` : ""}.`;
  return { chip, sentence };
}

/** The one thing worth asking this client about on the day, or null. */
export function askAboutFor(details: ReadonlyArray<FordEntry>, day: string, tz?: string): AskAbout | null {
  if (!DAY_KEY.test(day)) return null;
  const candidates = details
    .filter((e) => askable(e, day, tz))
    .map((e) => ({ e, why: reasonOn(e, day, tz) }))
    .filter((c): c is { e: FordEntry; why: NonNullable<ReturnType<typeof reasonOn>> } => c.why !== null);
  if (candidates.length === 0) return null;
  const dated = candidates.filter((c) => c.why.reason === "dated").sort((a, b) => (a.why.onDay ?? "").localeCompare(b.why.onDay ?? ""));
  const fresh = candidates.filter((c) => c.why.reason === "new").sort((a, b) => (b.why.noted ?? "").localeCompare(a.why.noted ?? ""));
  const pick = dated[0] ?? fresh[0];
  const { chip, sentence } = words(pick.e, pick.why, day);
  return { entryId: pick.e.id, clientId: pick.e.clientId, reason: pick.why.reason, onDay: pick.why.onDay, chip, sentence };
}

/**
 * One studio read's details, sorted into each booked client's one Ask about
 * for the day. `bookedIds` keeps it to the clients on the day: nobody else's
 * FORD is worked out, and nothing is said about them.
 */
export function askAboutByClient(
  details: ReadonlyArray<FordEntry>,
  bookedIds: ReadonlySet<string>,
  day: string,
  tz?: string,
): ReadonlyMap<string, AskAbout> {
  const byClient = new Map<string, FordEntry[]>();
  for (const e of details) {
    if (!e?.clientId || !bookedIds.has(e.clientId)) continue;
    const list = byClient.get(e.clientId) ?? [];
    list.push(e);
    byClient.set(e.clientId, list);
  }
  const out = new Map<string, AskAbout>();
  for (const [clientId, list] of byClient) {
    const ask = askAboutFor(list, day, tz);
    if (ask) out.set(clientId, ask);
  }
  return out;
}

/** The window a dated detail is looked for in, for a read that wants to name it: [day, day + 6]. */
export function askDatedWindow(day: string): { from: string; to: string } {
  return { from: day, to: addDays(day, ASK_DATED_DAYS - 1) };
}
