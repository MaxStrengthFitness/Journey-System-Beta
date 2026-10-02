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
 * the card carries the glyph alone (its label too is only "Something to ask
 * about"), and the chip and the sentence live in the list and the peek,
 * which a trainer opens on purpose.
 *
 * AJ answered his two open questions (the Atlas answers, Oct 2 2026): both
 * count, "a small loudness note that offers the information to the trainer
 * to use or follow up on in order to show we care and listen":
 *
 *   - JUST HAPPENED: a dated detail whose day was in the week before the
 *     booking's day ("How did the recital go?"), an annual one included;
 *   - FOLLOW UP: a detail carrying a "Follow up next time" question
 *     (`followUp`), the question in the trainer's words.
 *
 * Each is offered at Note loudness (`loudness: "standard"`): a small line,
 * never a Heads up. One per client still: a day coming up first, then a
 * follow-up question, then one that just happened, then news.
 *
 * WIRED (wave 2 hub, Sep 28 2026; AJ: "all yes" to "one read of the studio's
 * FORD details for the Hub"). The Hub reads the studio's FORD once per
 * studio visit (use-hub-ford.ts over ford/hub-read.ts): ONE collection group
 * query, the Delight queue's kind, asking for exactly the three reasons a
 * detail can come up on the strip's days (`askReadWindow`). The engine asks
 * each booked client's details about the booking's day (moments-today's
 * `fordFor`), so nobody else's FORD is worked out.
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
/** The days on the Hub's strip: today and the six after it (ClientsView's carousel). */
export const HUB_STRIP_DAYS = 7;
/** A dated detail is worth asking "how did it go?" about for this many days after its day (Oct 2 2026). */
export const ASK_AFTER_DAYS = 7;
/** A "Follow up next time" question set within this many days is read for the Hub (Oct 2 2026). */
export const ASK_FOLLOW_UP_DAYS = 60;

/**
 * The mark's label on the grid (a card's glyph, its "+N", the Next 30
 * minutes strip): never the detail's own words, which are for the list and
 * the peek. A client stands next to the iPad.
 */
export const ASK_ABOUT_LABEL = "Something to ask about";

/**
 * What the peek and an opened row say when her FORD couldn't be checked (the
 * Hub's read failed): unknown, never "nothing special".
 */
export const ASK_UNREAD_LINE = "Couldn’t check FORD for something to ask about — her FORD page has it.";

export interface AskAbout {
  /** The FORD detail it came from. */
  entryId: string;
  clientId: string;
  /**
   * "dated": its day comes round within the week; "after": its day was in the
   * week before ("how did it go?"); "follow-up": a Follow up next time
   * question; "new": noted in the last two weeks.
   */
  reason: AskReason;
  /** Offered at Note loudness: a small line, never a Heads up (Oct 2 2026). */
  loudness: "standard";
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

export type AskReason = "dated" | "after" | "follow-up" | "new";

/** The question a detail asks to be followed up, or null. */
function followUpOf(e: FordEntry): string | null {
  const q = typeof e.followUp === "string" ? e.followUp.trim() : "";
  return q ? q : null;
}

/** Why a detail comes up on the day, or null. */
function reasonOn(e: FordEntry, day: string, tz?: string): { reason: AskReason; onDay: string | null; noted: string | null } | null {
  const noted = studioDayKeyOf(e.occurredAt ?? e.createdAt ?? null, tz);
  const stored = studioDayKeyOf(e.eventDate ?? null, tz);
  if (stored) {
    const annual = e.recurrence === "annual";
    const onDay = annual ? nextAnnualDay(stored, day) : stored;
    if (onDay) {
      const ahead = daysBetween(day, onDay);
      if (ahead >= 0 && ahead < ASK_DATED_DAYS) return { reason: "dated", onDay, noted };
    }
  }
  if (followUpOf(e)) return { reason: "follow-up", onDay: null, noted };
  if (stored) {
    // Just happened: its day (this year's, for an annual one) in the week before.
    const lastDay = e.recurrence === "annual" ? nextAnnualDay(stored, addDays(day, -ASK_AFTER_DAYS)) : stored;
    if (lastDay) {
      const since = daysBetween(lastDay, day);
      if (since >= 1 && since <= ASK_AFTER_DAYS) return { reason: "after", onDay: lastDay, noted };
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

function words(e: FordEntry, why: { reason: AskReason; onDay: string | null; noted: string | null }, day: string): { chip: string; sentence: string } {
  const body = e.body.trim().replace(/[.!]+$/, "");
  const what = chipWhat(e, body);
  if (why.reason === "follow-up") {
    const q = (followUpOf(e) ?? "").replace(/\s+/g, " ");
    const by = typeof e.followUpBy === "string" && e.followUpBy.trim() ? `from ${e.followUpBy.trim()}` : null;
    const proof = [pillarLabel(e.pillar), by].filter(Boolean).join(", ");
    return { chip: `Follow up: ${what}`, sentence: `Follow up: ${q}${/[?.!]$/.test(q) ? "" : "?"} (${body}${proof ? `; ${proof}` : ""})` };
  }
  if (why.reason === "after" && why.onDay) {
    const was = `${WEEKDAY_LONG[weekdayOf(why.onDay)]}, ${monthDay(why.onDay)}`;
    const proof = pillarLabel(e.pillar);
    return { chip: `Ask how it went: ${what}`, sentence: `Ask how it went: ${body} \u2014 ${was}${proof ? ` (${proof})` : ""}.` };
  }
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
  const asked = candidates
    .filter((c) => c.why.reason === "follow-up")
    .sort((a, b) => (studioDayKeyOf(b.e.followUpAt ?? null, tz) ?? "").localeCompare(studioDayKeyOf(a.e.followUpAt ?? null, tz) ?? ""));
  const after = candidates.filter((c) => c.why.reason === "after").sort((a, b) => (b.why.onDay ?? "").localeCompare(a.why.onDay ?? ""));
  const fresh = candidates.filter((c) => c.why.reason === "new").sort((a, b) => (b.why.noted ?? "").localeCompare(a.why.noted ?? ""));
  const pick = dated[0] ?? asked[0] ?? after[0] ?? fresh[0];
  const { chip, sentence } = words(pick.e, pick.why, day);
  return { entryId: pick.e.id, clientId: pick.e.clientId, reason: pick.why.reason, loudness: "standard", onDay: pick.why.onDay, chip, sentence };
}

/**
 * One studio read's details, by client: what the Hub hands the engine, so
 * each booked client is asked about her own details and nobody else's.
 */
export function fordByClient(details: ReadonlyArray<FordEntry>): ReadonlyMap<string, FordEntry[]> {
  const byClient = new Map<string, FordEntry[]>();
  for (const e of details) {
    if (!e?.clientId) continue;
    const list = byClient.get(e.clientId) ?? [];
    list.push(e);
    byClient.set(e.clientId, list);
  }
  return byClient;
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
  const out = new Map<string, AskAbout>();
  for (const [clientId, list] of fordByClient(details)) {
    if (!bookedIds.has(clientId)) continue;
    const ask = askAboutFor(list, day, tz);
    if (ask) out.set(clientId, ask);
  }
  return out;
}

/** The window a dated detail is looked for in, for a read that wants to name it: [day, day + 6]. */
export function askDatedWindow(day: string): { from: string; to: string } {
  return { from: day, to: addDays(day, ASK_DATED_DAYS - 1) };
}

/**
 * The studio days the Hub's ONE FORD read must hold (wave 2 hub), for every
 * day on its strip at once — today and the six after it — so flipping to
 * Saturday needs no second read. The rule decides exactly; the read only has
 * to hold everything it could pick:
 *
 *   - `datedFrom` … `datedUntil` (left out): a one-off day that comes round
 *     within a week of any strip day, today to today + 12, with a day of
 *     slack either side, because the FORD dialog stores a date at the iPad's
 *     midnight and the rule reads it on the studio's day;
 *   - `notedFrom`: noted in the two weeks up to any strip day, from
 *     today - 13, with a day of slack;
 *   - `datedFrom` reaches a week further back, for a day that just
 *     happened; `followUpFrom`: a Follow up next time question set in the
 *     last 60 days (Oct 2 2026; its own index, studioId + followUpAt);
 *   - an annual day comes round every year, so the read holds every one,
 *     whatever year it was stored in (the query's `recurrence` branch).
 */
export function askReadWindow(today: string): { datedFrom: string; datedUntil: string; notedFrom: string; followUpFrom: string } {
  const lastDated = addDays(today, HUB_STRIP_DAYS - 1 + ASK_DATED_DAYS - 1);
  return {
    // A week back too, for "how did it go?" on today's bookings (Oct 2 2026).
    datedFrom: addDays(today, -1 - ASK_AFTER_DAYS),
    followUpFrom: addDays(today, -ASK_FOLLOW_UP_DAYS),
    datedUntil: addDays(lastDated, 2),
    notedFrom: addDays(today, -(ASK_NEW_DAYS - 1) - 1),
  };
}
