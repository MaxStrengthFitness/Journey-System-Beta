/**
 * TODAY'S BRIEF — the pure half. brief.test.ts (TZ=America/New_York).
 *
 * The redesign's Operations room, phase 2 (Sep 28 2026; the pick "Brief +
 * Journey"). Today's Overview was five tiles and eight panels of equal
 * weight, so the leader did the adding up every morning. The brief leads
 * with ONE bottom line, written by rules (research-operations §6.3; BLUF,
 * the President's Daily Brief), then the same sections in the same order
 * every day: Needs you · Catch today · Slipping away · Since yesterday ·
 * Coming up · Going right.
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
 *   - The bottom line says the day "looks steady" only when every read
 *     behind it answered. An unread schedule, an unread day's logging, a
 *     client whose renewal timing is unknown and a nightly record that has
 *     stopped changing are each NAMED in it, never folded into "fine".
 *   - Catch today says nothing off bookings the server hasn't confirmed; it
 *     returns null (unknown) rather than an empty list.
 *
 * No reads here. The page hands in what it already reads.
 */
import type { Client, ScheduleEntry } from "../../../types";
import { clientDisplayName } from "../../../lib/client-name";
import { isStaffBlock, type LoggedSessions } from "../../../lib/booking-state";
import { formatStudioDate, formatStudioTime, studioDateKey, studioDayBoundsForKey, toDate, zonedHM } from "../../../lib/studio-time";
import { addDays } from "../../client-history/model";
import type { MomentFamily, RunSheetEntry } from "../../hub-opportunities/moments-today";
import type { RenewalSnapshot } from "../../renewals/types";
import { changesForDay, type ChangeRow } from "../changes/changes";

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

const WORDS = ["Nothing", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** "Three", or "three" mid-sentence; digits past ten. */
export function countWord(n: number, capital = true): string {
  const w = n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
  return capital ? w : w.toLowerCase();
}

export type PartOfDay = "this morning" | "this afternoon" | "this evening";

/** The studio's part of the day: before noon, before five, then evening. */
export function partOfDay(now: Date, tz?: string): PartOfDay {
  const hour = zonedHM(now, tz)?.hour ?? 9;
  return hour < 12 ? "this morning" : hour < 17 ? "this afternoon" : "this evening";
}

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
 * The bottom line
 * ------------------------------------------------------------------ */

export type WeekReadState = "ready" | "loading" | "failed" | "offline";

export interface BottomLineInput {
  part: PartOfDay;
  /** Rows in Needs you. */
  needs: number;
  /** A read behind Needs you failed or is still out: there may be more. */
  needsPartial: boolean;
  /** Clients worth catching in person; null while today's bookings are unread. */
  catchCount: number | null;
  /** Finished sessions with nothing logged; null when unknown. */
  neverLogged: number | null;
  /** Those sessions are Needs-you rows (the reader may mark "didn't come" here), not a door. */
  unloggedInNeeds?: boolean;
  week: WeekReadState;
  renewalUnknown: number;
  nightly: Pick<NightlyRead, "stale" | "lastChangedAt">;
  tz?: string;
}

export interface BottomLine {
  sentence: string;
  /** "How this line is written": the rules, with this morning's numbers. */
  rules: string[];
}

export function bottomLine(i: BottomLineInput): BottomLine {
  const parts: string[] = [];
  const need =
    i.needs > 0
      ? `${countWord(i.needs)} ${i.needs === 1 ? "thing needs" : "things need"} you ${i.part}`
      : i.needsPartial
        ? `Nothing that could be read needs you ${i.part}`
        : `Nothing needs you ${i.part}`;
  if (i.catchCount !== null && i.catchCount > 0) {
    parts.push(`${need}, and ${countWord(i.catchCount, false)} ${i.catchCount === 1 ? "client is" : "clients are"} worth catching in person.`);
  } else {
    parts.push(`${need}.`);
    if (i.catchCount === 0) parts.push("Nobody needs catching in person today.");
  }
  if (i.needs > 0 && i.needsPartial) parts.push("Part of the page couldn't be read, so there may be more.");

  if (i.week === "loading") parts.push("Today's bookings are still being read.");
  else if (i.week !== "ready") parts.push("Today's bookings couldn't be read, so the floor is unknown.");
  else if (i.neverLogged === null) parts.push("Today's logging couldn't be read, so what was done is unknown.");
  else if (i.neverLogged > 0) {
    parts.push(
      `${countWord(i.neverLogged)} of today's finished ${i.neverLogged === 1 ? "sessions has" : "sessions have"} no workout logged yet${
        i.unloggedInNeeds ? ": ask on the floor, then its trainer logs it or you mark it didn't come" : ""
      }.`,
    );
  }

  if (i.renewalUnknown > 0) {
    parts.push(`Renewal timing is unknown for ${i.renewalUnknown === 1 ? "one client" : `${i.renewalUnknown} clients`}, so nothing here calls them on track.`);
  }
  if (i.nightly.stale) {
    parts.push(
      i.nightly.lastChangedAt
        ? `The nightly record hasn't changed since ${formatStudioDate(i.nightly.lastChangedAt, { weekday: "short", month: "short", day: "numeric" }, i.tz)}, so nobody's rhythm is judged from it.`
        : "There is no nightly record for this studio yet, so nobody's rhythm is judged.",
    );
  }
  const allKnown = i.week === "ready" && i.neverLogged !== null && i.renewalUnknown === 0 && !i.nightly.stale && !i.needsPartial;
  if (allKnown && i.neverLogged === 0) parts.push("The rest of the day looks steady.");

  const rules = [
    i.unloggedInNeeds
      ? `Needs you: ${i.needs} ${i.needs === 1 ? "row" : "rows"} you can clear on this page (acknowledge, take a gesture, review a note, or mark a session nobody logged "didn't come"), and nothing else. A session its trainer logs later clears by itself.`
      : `Needs you: ${i.needs} ${i.needs === 1 ? "row" : "rows"} you can clear on this page (acknowledge, take a gesture, review a note), and nothing else. A session nobody logged is its trainer's to log, so it is a door, not a count.`,
    `Catch today: ${i.catchCount === null ? "unknown until today's bookings are read" : `${i.catchCount} ${i.catchCount === 1 ? "client" : "clients"}`} in the studio today with a reason to see them in person: a renewal talk, back after a break, early sessions, a milestone, or leaving with nothing booked.`,
    "An unread schedule, an unread day's logging, a client whose renewal timing is unknown and a nightly record that stopped changing are each named here, never counted as fine.",
    "Written by rules each time the page reads. Never typed by hand.",
  ];
  return { sentence: parts.join(" "), rules };
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
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

/** The studio day's start as epoch ms, for "since the start of yesterday". */
export function dayStartMs(day: string, tz?: string): number {
  return studioDayBoundsForKey(day, tz).start.getTime();
}

/** Today's studio day, the way every piece of the brief reads it. */
export function todayOf(now: Date, tz?: string): string {
  return studioDateKey(now, tz) ?? now.toISOString().slice(0, 10);
}
