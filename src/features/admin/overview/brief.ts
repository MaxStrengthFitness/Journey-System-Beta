/**
 * TODAY'S BRIEF — the pure half. brief.test.ts (TZ=America/New_York).
 *
 * The redesign's Operations room, phase 2 (Sep 28 2026; the pick "Brief +
 * Journey"). Today's Overview was five tiles and eight panels of equal
 * weight, so the leader did the adding up every morning. The brief led with
 * one bottom line written by rules, then the same sections in the same order
 * every day: Needs you · Catch today · Slipping away · Since yesterday ·
 * Coming up · Going right.
 *
 * The calm round (Oct 3 2026, AJ: "there's just so many words on there. It's
 * really overwhelming"; "i trust all your recommended"): the written bottom
 * line became one line of counts (TodayBrief), a section with nothing in it
 * folds into one "All clear" line, and what the nightly record can't tell is
 * said ONCE at the top (`nightlyNote`), never in each section.
 *
 * WHAT EACH RULE REFUSES TO SAY (the pins "Some lines give false comfort"):
 *
 *   - "Needs you" counts only what a leader can clear on the page (AJ's
 *     question 3, default: "Yes. Everything else becomes a door"). Since
 *     wave 2 (AJ, Sep 28 2026: "all yes") that includes a session nobody
 *     logged: a leader who asked and learned she didn't come marks it
 *     ("Didn't come", attention/booking-marks.ts), and it clears by itself
 *     when its trainer logs the workout. For someone who can't mark at this
 *     studio it stays a door and a clause, never a count that cannot go down
 *     (`unloggedInNeeds`).
 *   - A section folds into "All clear" only when every read behind it
 *     answered. An unread schedule or day's logging keeps its section on the
 *     page, saying so; a nightly record that can't judge yet is the page's
 *     one note, and the sections it covers are never called clear.
 *   - Catch today says nothing off bookings the server hasn't confirmed; it
 *     returns null (unknown) rather than an empty list.
 *
 * No reads here. The page hands in what it already reads.
 */
import type { Client, ScheduleEntry } from "../../../types";
import { clientDisplayName } from "../../../lib/client-name";
import { isStaffBlock, type LoggedSessions } from "../../../lib/booking-state";
import { formatStudioDate, formatStudioTime, studioDateKey, studioDayBoundsForKey, toDate, formatDateWords } from "../../../lib/studio-time";
import { addDays } from "../../client-history/model";
import type { MomentFamily, RunSheetEntry } from "../../hub-opportunities/moments-today";
import type { RenewalSnapshot } from "../../renewals/types";
import { changesForDay, type ChangeRow } from "../changes/changes";

/* ------------------------------------------------------------------ *
 * The nightly record
 * ------------------------------------------------------------------ */

/**
 * How long the nightly record may go without a single client's snapshot
 * changing before the page stops trusting it. The job (server/renewals-
 * job.ts) rebuilds every studio's snapshots each night and writes only the
 * ones that changed, so at a working studio someone's last visit moves every
 * night. Three quiet days means the job has most likely not run. A named
 * constant, not a studio setting: storing settings is a data change that
 * needs AJ's OK.
 */
export const NIGHTLY_STALE_DAYS = 3;

export interface NightlyRead {
  /** The newest `renewal.computedAt` among the studio's clients: when the record last changed. */
  lastChangedAt: Date | null;
  /** Nothing changed for NIGHTLY_STALE_DAYS (or nothing was ever written). */
  stale: boolean;
  /** Active clients whose home is this studio. */
  homeClients: number;
  /** Those with no snapshot at all. */
  missing: string[];
  /** Those the engine couldn't place for lack of Mindbody data (situation "unknown"). */
  unknownData: string[];
}

const DAY_MS = 86_400_000;

const homeOf = (c: Client): string | null => c.homeStudioId || (c as { studioId?: string }).studioId || null;

export function nightlyRead(clients: readonly Client[], studioId: string, now: Date): NightlyRead {
  let last: Date | null = null;
  let homeClients = 0;
  const missing: string[] = [];
  const unknownData: string[] = [];
  for (const c of clients) {
    if (!c.id || c.isActive === false || homeOf(c) !== studioId) continue;
    homeClients += 1;
    const s = c.renewal as RenewalSnapshot | undefined;
    if (!s) {
      missing.push(c.id);
      continue;
    }
    if (s.situation === "unknown") unknownData.push(c.id);
    const at = toDate((s.computedAt ?? null) as never);
    if (at && (!last || at.getTime() > last.getTime())) last = at;
  }
  const stale = homeClients > 0 && (!last || now.getTime() - last.getTime() > NIGHTLY_STALE_DAYS * DAY_MS);
  return { lastChangedAt: last, stale, homeClients, missing, unknownData };
}

/** Clients whose renewal timing is unknown: no snapshot, or not enough Mindbody data. */
export function renewalUnknownCount(n: NightlyRead): number {
  return n.missing.length + n.unknownData.length;
}

/* ------------------------------------------------------------------ *
 * The nightly record, said once
 * ------------------------------------------------------------------ */

export type WeekReadState = "ready" | "loading" | "failed" | "offline";

export type NightlyNoteKind = "not-live" | "no-record" | "stale" | "unknown";

export interface NightlyNote {
  kind: NightlyNoteKind;
  /** One line, at the top of the page. */
  text: string;
  /** Behind "Why": what it means and who it is. */
  why: string;
}

/**
 * WHAT THE NIGHTLY RECORD CAN'T TELL YET, SAID ONCE (Oct 3 2026, AJ:
 * "there's just so many words on there"). Before, every section that leans on
 * the record said so in its own sentence: a studio before its Journey start
 * said "no nightly record" a dozen times across Operations, six on Team alone.
 * Now one line at the top of each page says it, and the sections it covers
 * stay quiet: never counted as fine, never repeated.
 *
 *   not-live    the studio's Journey start date isn't set or hasn't come, so
 *               the nightly job doesn't run for it (`studioIsLive`)
 *   no-record   it has come, and nothing has been written yet
 *   stale       nothing changed for NIGHTLY_STALE_DAYS: the job most likely
 *               hasn't run
 *   unknown     the record is fresh, but some clients can't be placed
 *
 * Null when there is nothing to say (no clients, or every one judged).
 */
export function nightlyNote(
  n: NightlyRead,
  studio: { name?: string | null; journeyCutoverDate?: string | null },
  today: string,
  names: (ids: string[]) => string,
  tz?: string,
): NightlyNote | null {
  if (n.homeClients === 0) return null;
  const studioName = studio.name?.trim() || "This studio";
  const waiting = `${n.homeClients === 1 ? "One client is" : `${n.homeClients} clients are`} waiting on it.`;
  if (!n.lastChangedAt) {
    const live = typeof studio.journeyCutoverDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(studio.journeyCutoverDate) && studio.journeyCutoverDate <= addDays(today, 1);
    return live
      ? {
          kind: "no-record",
          text: `No nightly record for ${studioName} yet, so rhythm, MIA and renewals aren't judged.`,
          why: `Journey works these out each night from Mindbody. ${studioName}'s Journey start date has come, but the first night's record hasn't been written. ${waiting}`,
        }
      : {
          kind: "not-live",
          text: `${studioName} isn't live in Journey yet. Rhythm, MIA and renewals start after its first nightly run.`,
          why: `Journey works these out each night from Mindbody, from a studio's Journey start date on${
            studio.journeyCutoverDate ? ` (${studioName}'s is ${studio.journeyCutoverDate})` : `, and ${studioName} doesn't have one yet`
          }. ${waiting}`,
        };
  }
  if (n.stale) {
    return {
      kind: "stale",
      text: `The nightly record last changed ${formatStudioDate(n.lastChangedAt, { weekday: "short", month: "short", day: "numeric" }, tz)}, so nobody is called slipping until it runs again.`,
      why: "The job rebuilds every client's record each night, so at a working studio something changes every night. Three quiet days means it most likely hasn't run.",
    };
  }
  const ids = [...n.missing, ...n.unknownData];
  if (ids.length === 0) return null;
  return {
    kind: "unknown",
    text: `${ids.length === 1 ? "One client" : `${ids.length} clients`} can't be judged yet.`,
    why: `No renewal record from last night, or not enough Mindbody data for one: ${names(ids.slice(0, 6))}${ids.length > 6 ? ", and more" : ""}. Their renewal timing and rhythm are unknown, and they're never counted as on track or steady.`,
  };
}

/* ------------------------------------------------------------------ *
 * Catch today
 * ------------------------------------------------------------------ */

export interface CatchRow {
  key: string;
  clientId: string | null;
  name: string;
  /** Epoch ms the booking starts (the order they're in); for "left", when the day's session was logged is not known, so the day's start. */
  at: number;
  /** "In at 9:00 AM with Mablung." */
  sentence: string;
  proof: string;
  kind: "moment" | "left";
}

/** The moments worth catching someone in person for (the Hub engine's own families). */
export const CATCH_FAMILIES: ReadonlySet<MomentFamily> = new Set(["renew", "welcome", "celebrate"]);

/**
 * Everyone booked today, still to come or on the floor, with a reason to see
 * them in person: the Hub's ONE engine (hub-opportunities/moments-today),
 * asked about today, so the brief and the Hub's Opportunities list can
 * never disagree about who is new, who is back and whose renewal is due.
 */
export function catchToday(entries: readonly RunSheetEntry[], nowMs: number, tz?: string): CatchRow[] {
  const rows: CatchRow[] = [];
  for (const e of entries) {
    if (!e.clientId || e.end <= nowMs) continue;
    const reasons = e.moments.filter((m) => CATCH_FAMILIES.has(m.family));
    if (reasons.length === 0) continue;
    rows.push({
      key: `moment:${e.key}`,
      clientId: e.clientId,
      name: e.name,
      at: e.start,
      sentence: `${e.stateText === "now" ? "On the floor now" : `In at ${formatStudioTime(new Date(e.start), tz)}`}${e.withText ? ` ${e.withText}` : ""}.`,
      proof: reasons.map((m) => m.sentence).join(" · "),
      kind: "moment",
    });
  }
  return rows.sort((a, b) => a.at - b.at || a.name.localeCompare(b.name));
}

export interface LeftInput {
  clients: readonly Client[];
  /** The week's bookings as the server answered them (today and six days). */
  weekEntries: readonly ScheduleEntry[];
  logged: LoggedSessions | null;
  today: string;
  now: Date;
  tz?: string;
  /** When the week was read, for the proof ("the week read at 9:14 AM"). */
  readAt?: number | null;
}

/**
 * Clients who trained today and have nothing booked in the week read — the
 * research's "leaving with nothing booked" (metric 4). Null when today's
 * logging or the week's bookings aren't known: unknown, never "nobody".
 * A booking last night's record holds beyond the week read counts as booked.
 */
export function leftWithNothingBooked(i: LeftInput): CatchRow[] | null {
  if (!i.logged) return null;
  const nowMs = i.now.getTime();
  const lastDay = addDays(i.today, 6);
  const booked = new Set<string>();
  for (const b of i.weekEntries) {
    if (!b.clientId || b.status === "Cancelled" || isStaffBlock(b)) continue;
    const start = toDate(b.startTime)?.getTime();
    if (typeof start === "number" && start > nowMs) booked.add(b.clientId);
  }
  const at = i.readAt ? formatStudioTime(new Date(i.readAt), i.tz) : null;
  const rows: CatchRow[] = [];
  for (const c of i.clients) {
    if (!c.id || c.isActive === false || !i.logged.has(c.id, i.today) || booked.has(c.id)) continue;
    const s = c.renewal as RenewalSnapshot | undefined;
    // Last night's record reaches further than the week this page reads.
    if (s?.nextBookingDate && s.nextBookingDate > lastDay) continue;
    const pace = typeof s?.pacePerWeek === "number" && s.pacePerWeek > 0 ? s.pacePerWeek : null;
    rows.push({
      key: `left:${c.id}`,
      clientId: c.id,
      name: clientDisplayName(c, "A client"),
      at: 0,
      sentence: "Trained today, and has nothing booked in the next 7 days.",
      proof: [pace ? `Usually about ${pace} a week over the last eight weeks.` : null, `Next booking: none in the week${at ? ` read at ${at}` : ""}.`].filter(Boolean).join(" "),
      kind: "left",
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ *
 * Since yesterday
 * ------------------------------------------------------------------ */

/**
 * The cancellations and moves NOTICED since the start of yesterday, each
 * still held against the day its session was for (changes.ts, AJ's rule).
 * A change today's list holds with no stamp (the webhook's, before it
 * stamped) is today's news too, so it is kept; an older unstamped change on
 * a later day can't be dated, so it waits on the Week page.
 */
export function sinceYesterday(entries: readonly ScheduleEntry[], today: string, tz: string | undefined, sinceMs: number, days = 7): ChangeRow[] {
  const out: ChangeRow[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = addDays(today, i);
    for (const r of changesForDay(entries as ScheduleEntry[], day, tz)) {
      const t = r.detectedAt?.getTime();
      if ((typeof t === "number" && t >= sinceMs) || (r.detectedAt === null && r.forDay === today)) out.push(r);
    }
  }
  return out.sort((a, b) => a.forDay.localeCompare(b.forDay) || a.originalStart.getTime() - b.originalStart.getTime());
}

/** "held against Thursday" — the words for a change's own day. */
export function heldAgainst(day: string, today: string): string {
  if (day === today) return "today";
  if (day === addDays(today, 1)) return "tomorrow";
  const [y, m, d] = day.split("-").map(Number);
  return formatDateWords(new Date(Date.UTC(y, m - 1, d)), { weekday: "long", timeZone: "UTC" }, "en-US");
}

/** The studio day's start as epoch ms, for "since the start of yesterday". */
export function dayStartMs(day: string, tz?: string): number {
  return studioDayBoundsForKey(day, tz).start.getTime();
}

/** Today's studio day, the way every piece of the brief reads it. */
export function todayOf(now: Date, tz?: string): string {
  return studioDateKey(now, tz) ?? now.toISOString().slice(0, 10);
}
