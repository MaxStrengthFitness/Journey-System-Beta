/**
 * SINCE YOU WERE IN — what changed at the studio since this trainer last
 * opened the Board (the second wave of the Relay room, Sep 28 2026; AJ: "all
 * yes"). The pure half: every rule and every sentence. The marker is
 * `last-seen.ts`, the screen `SinceYouWereIn.tsx`.
 *
 * The blueprint's notice board (research-relay §4.5, after the Witcher's
 * board: a filled dot for what you haven't seen, a hollow one once you have):
 *
 *   From leadership   announcements that reach this trainer, with who posted
 *                     them and their role (a notice is always leadership's:
 *                     only leaders, owners and head office may post one)
 *   New this week     clients whose FIRST-EVER visit falls this week (below)
 *   Out of service    machines the studio took off the floor, and machines
 *                     flagged on the Floor Map, with who and when
 *   The Playbook      answers the team kept, in the last two weeks
 *   To you            hearts on your own work, shown only to you
 *
 * A notice is NEW when it happened after the marker (`seenAt`): the last time
 * this trainer opened the Board at this studio. With no marker yet (a first
 * visit) the last seven days are new. Tapping a notice marks it seen on this
 * iPad for the session; Mark all read moves the marker.
 *
 * NEW TO THE STUDIO THIS WEEK — her first-ever visit, never her first Journey
 * session (CLAUDE.md: "Prior history is real history"). In order:
 *
 *   1. Mindbody's own first visit (`firstAppointmentDate` with no inferred
 *      source: client-story/story.ts `firstVisitOf`, authoritative) decides
 *      on its own: in this week, she is new; before it, she isn't.
 *   2. Otherwise, anything that proves an earlier visit says she isn't:
 *      history before Journey (lib/prior-history.ts `historyCoverage`
 *      "partial"), an inferred first date before the week (a ceiling: the
 *      first can only be earlier), or a Journey session before the week.
 *   3. Otherwise she is new only when Journey holds her whole story (someone
 *      said so, or a prior record says there's nothing before) or Mindbody
 *      counts no visit yet; her first Journey session in the week, else her
 *      first booking in it, is the day.
 *   4. Anyone else booked this week is UNSURE, and the notice says how many
 *      it couldn't check. A roster that hasn't answered, or failed, is
 *      "Checking…" or "Couldn't check", never "nobody new".
 *
 * It reads only what the app already streams: the studio's clients and the
 * bookings from yesterday to a week ahead. No query of its own.
 *
 * Pure: no React, no Firestore, no clock of its own. Day keys compare as
 * text (the date trap in CLAUDE.md).
 */
import { historyCoverage, priorHistoryOf, priorUncounted } from "../../../lib/prior-history";
import { isStaffBlock } from "../../../lib/booking-state";
import { studioDateKey, studioDayKeyOf, toDate, zonedHM, type DateLike } from "../../../lib/studio-time";
import { firstVisitOf } from "../../client-story/first-visit";
import { addDays } from "../../studio-tasks/recurrence";
import { minutesToClock } from "./now-context";

/** A first visit (no marker yet): what counts as new. */
export const FIRST_VISIT_WINDOW_DAYS = 7;
/** How far back the Playbook's additions are listed. */
export const PLAYBOOK_LOOKBACK_DAYS = 14;
/** How far back hearts on your work are listed. */
export const HEARTS_LOOKBACK_DAYS = 7;

const DAY_MS = 86_400_000;
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export function millisOf(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  const t = v as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

function weekdayOf(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The studio's week around a day: Monday through Sunday, as day keys. */
export function weekOf(todayKey: string): { start: string; end: string } {
  const back = (weekdayOf(todayKey) + 6) % 7;
  const start = addDays(todayKey, -back);
  return { start, end: addDays(start, 6) };
}

/** "today", "yesterday", "tomorrow", or the weekday: a day inside this week. */
export function weekDayWords(dayKey: string, todayKey: string): string {
  if (dayKey === todayKey) return "today";
  if (dayKey === addDays(todayKey, -1)) return "yesterday";
  if (dayKey === addDays(todayKey, 1)) return "tomorrow";
  return WEEKDAY[weekdayOf(dayKey)];
}

/* ------------------------------------------------------------------ *
 * New to the studio this week
 * ------------------------------------------------------------------ */

export interface NewClientInputClient {
  id?: string;
  firstName?: string;
  lastName?: string;
  firstAppointmentDate?: unknown;
  firstAppointmentDateSource?: string;
  priorHistory?: unknown;
  historyIsComplete?: boolean;
  clientsNumberOfVisitsAtSite?: number;
  firstSessionDate?: unknown;
  lastSessionDate?: string;
  homeStudioId?: string | null;
  studioId?: string | null;
}

export interface NewClientInputBooking {
  id?: string;
  clientId?: string;
  clientName?: string;
  trainerId?: string;
  trainerName?: string;
  startTime: unknown;
  status?: string;
  createdAt?: unknown;
}

export interface NewClientRow {
  clientId: string;
  name: string;
  /** Her first visit, a studio day in this week. */
  day: string;
  /** The booking on that day, in studio minutes, when the app holds it. */
  startMin: number | null;
  trainerId: string | null;
  trainerName: string | null;
  /** Still to come (a later day, or later today). */
  upcoming: boolean;
  /**
   * When this became something to know, for the dot: the visit's own time
   * once it has happened, the booking's arrival while it is still to come.
   */
  appearedAt: number | null;
  /** Where the day came from: Mindbody's own first visit, or Journey's whole story. */
  basis: "mindbody" | "journey";
}

export type NewClientsState = "known" | "loading" | "failed";

export interface NewClients {
  state: NewClientsState;
  clients: NewClientRow[];
  /** Booked this week, but Journey can't tell whether it is her first visit. */
  unsure: number;
}

export interface NewClientsInput {
  todayKey: string;
  nowMin: number;
  week: { start: string; end: string };
  clients: readonly NewClientInputClient[];
  bookings: readonly NewClientInputBooking[];
  /** The roster listener's answer (AppContent's useStudioRoster). */
  roster: "loading" | "ready" | "error";
  /** The HOME studio's cutover for a client (lib/client-coverage.ts `homeCutoverOf`). */
  cutoverOf: (client: NewClientInputClient) => string | null;
  tz?: string;
}

interface WeekBooking {
  day: string;
  startMin: number | null;
  startMs: number;
  trainerId: string | null;
  trainerName: string | null;
  createdAt: number | null;
}

const fullName = (c: NewClientInputClient) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "A new client";

/** Does anything prove she visited before this week? */
function earlierVisit(c: NewClientInputClient, weekStart: string, cutover: string | null, tz?: string): boolean {
  const firstJourneyDay = c.firstSessionDate ? studioDayKeyOf(c.firstSessionDate as DateLike, tz) : null;
  const coverage = historyCoverage(
    {
      priorHistory: c.priorHistory,
      historyIsComplete: c.historyIsComplete,
      firstJourneyDay,
      mindbodyVisits: typeof c.clientsNumberOfVisitsAtSite === "number" ? c.clientsNumberOfVisitsAtSite : null,
    },
    cutover,
  );
  if (coverage === "partial") return true;
  const inferred = firstVisitOf(c, tz);
  if (inferred && inferred.day < weekStart) return true;
  if (firstJourneyDay && firstJourneyDay < weekStart) return true;
  if (typeof c.lastSessionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.lastSessionDate) && c.lastSessionDate < weekStart) return true;
  return false;
}

/** Journey holds her whole story, or Mindbody counts no visit yet. */
function knownFromScratch(c: NewClientInputClient): boolean {
  if (c.historyIsComplete === true) return true;
  const prior = priorHistoryOf(c);
  if (prior && priorUncounted(prior) === 0) return true;
  return c.clientsNumberOfVisitsAtSite === 0;
}

export function newClientsThisWeek(input: NewClientsInput): NewClients {
  if (input.roster === "loading") return { state: "loading", clients: [], unsure: 0 };
  if (input.roster === "error") return { state: "failed", clients: [], unsure: 0 };
  const { week, todayKey, nowMin, tz } = input;

  const byClient = new Map<string, WeekBooking[]>();
  for (const b of input.bookings) {
    if (!b?.clientId || b.status === "Cancelled" || isStaffBlock(b)) continue;
    const start = toDate(b.startTime as DateLike);
    if (!start) continue;
    const day = studioDateKey(start, tz);
    if (!day || day < week.start || day > week.end) continue;
    const hm = zonedHM(start, tz);
    const list = byClient.get(b.clientId) ?? [];
    list.push({
      day,
      startMin: hm ? hm.hour * 60 + hm.minute : null,
      startMs: start.getTime(),
      trainerId: b.trainerId ?? null,
      trainerName: b.trainerName ?? null,
      createdAt: millisOf(b.createdAt),
    });
    byClient.set(b.clientId, list);
  }
  for (const list of byClient.values()) list.sort((a, b) => a.startMs - b.startMs);

  const rows: NewClientRow[] = [];
  let unsure = 0;
  const seen = new Set<string>();

  const place = (c: NewClientInputClient, id: string, day: string, basis: NewClientRow["basis"]) => {
    const booking = (byClient.get(id) ?? []).find((b) => b.day === day) ?? null;
    const upcoming = day > todayKey || (day === todayKey && booking?.startMin != null && booking.startMin > nowMin);
    const visitMs = booking ? booking.startMs : null;
    rows.push({
      clientId: id,
      name: fullName(c),
      day,
      startMin: booking?.startMin ?? null,
      trainerId: booking?.trainerId ?? null,
      trainerName: booking?.trainerName ?? null,
      upcoming,
      appearedAt: upcoming ? booking?.createdAt ?? null : visitMs ?? dayStartish(day),
      basis,
    });
  };

  for (const c of input.clients) {
    const id = c.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const first = firstVisitOf(c, tz);
    if (first?.authoritative) {
      if (first.day >= week.start && first.day <= week.end) place(c, id, first.day, "mindbody");
      continue;
    }
    const booked = byClient.get(id) ?? [];
    if (booked.length === 0) continue;
    if (earlierVisit(c, week.start, input.cutoverOf(c), tz)) continue;
    if (knownFromScratch(c)) {
      const firstJourneyDay = c.firstSessionDate ? studioDayKeyOf(c.firstSessionDate as DateLike, tz) : null;
      const day = firstJourneyDay && firstJourneyDay >= week.start && firstJourneyDay <= week.end ? firstJourneyDay : booked[0].day;
      place(c, id, day, "journey");
      continue;
    }
    unsure += 1;
  }

  rows.sort((a, b) => a.day.localeCompare(b.day) || (a.startMin ?? 0) - (b.startMin ?? 0) || a.name.localeCompare(b.name));
  return { state: "known", clients: rows, unsure };
}

/** Noon UTC of a day key: an instant inside that studio day, for ordering only. */
function dayStartish(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 12);
}

/**
 * "Adelard Took · first visit today at 3:00 PM, with you" ·
 * "Hilda Bracegirdle · first visit Wednesday, with Beregond".
 */
export function newClientLine(row: NewClientRow, todayKey: string, me: ReadonlySet<string>): string {
  const when = weekDayWords(row.day, todayKey);
  const at = row.startMin != null && (row.day === todayKey || row.upcoming) ? ` at ${minutesToClock(row.startMin)}` : "";
  const who = row.trainerId && me.has(row.trainerId) ? ", with you" : row.trainerName ? `, with ${firstName(row.trainerName)}` : "";
  return `${row.name} · first visit ${when}${at}${who}`;
}

/** The line under the list when not everyone could be checked, or the whole list couldn't be. */
export function newClientsCaveat(n: NewClients): string | null {
  if (n.state === "loading") return "Checking for new clients…";
  if (n.state === "failed") return "Couldn't check for new clients: the studio's client list didn't load.";
  if (n.unsure === 0) return null;
  return n.unsure === 1
    ? "Couldn't check 1 client booked this week: Journey doesn't have that client's first visit on file."
    : `Couldn't check ${n.unsure} clients booked this week: Journey doesn't have their first visit on file.`;
}

/* ------------------------------------------------------------------ *
 * The notices
 * ------------------------------------------------------------------ */

export interface SinceAnnouncement {
  id: string;
  title: string;
  shortContent?: string;
  authorId?: string;
  authorName?: string;
  createdAt?: unknown;
  priority?: string;
  /** Asks everyone to say "I've read it" (announcements' `asksRead`). */
  asksRead?: boolean;
}

/**
 * Where a notice that asks stands with this person: it asks until they
 * answer, and their answer is theirs alone (announcementReads/{uid}.acks).
 */
export type NoticeAck =
  | { state: "not-asked" }
  | { state: "asking" }
  | { state: "acked"; at: number | null };

/** "You said you'd read it · today at 10:12 AM" (the time only once the stamp has landed). */
export function ackWords(ack: NoticeAck, todayKey: string): string | null {
  if (ack.state !== "acked") return null;
  return ack.at === null ? "You said you'd read it" : `You said you'd read it · ${whenWords(ack.at, todayKey)}`;
}

export interface SinceMachine {
  machineId: string;
  name: string;
  /** Off the floor on the roster, or flagged on the Floor Map. */
  source: "roster" | "flag";
  at: number | null;
  by: string | null;
  note: string | null;
}

export interface SincePlaybookEntry {
  id: string;
  title: string;
  worked?: string;
  authorName?: string;
  createdAt?: unknown;
  retiredAt?: unknown;
  sourceRequestId?: string;
}

export interface SinceHeart {
  key: string;
  /** What the work was: "the closing wipe-down". */
  what: string;
  /** Who sent them, first names. */
  from: string[];
  at: number | null;
}

export type SinceNotice =
  | { kind: "announcement"; key: string; at: number | null; isNew: boolean; announcement: SinceAnnouncement; role: string | null; ack: NoticeAck }
  | { kind: "new-clients"; key: string; at: number | null; isNew: boolean; clients: NewClients }
  | { kind: "out-of-service"; key: string; at: number | null; isNew: boolean; machine: SinceMachine }
  | { kind: "playbook"; key: string; at: number | null; isNew: boolean; entry: SincePlaybookEntry }
  | { kind: "hearts"; key: string; at: number | null; isNew: boolean; hearts: SinceHeart[] };

export interface SinceInput {
  now: number;
  /** The marker (ms); null with no marker yet; undefined while it loads (nothing is new yet). */
  seenAt: number | null | undefined;
  announcements: readonly SinceAnnouncement[];
  /** The poster's role label, when the app knows the person. */
  roleOf?: (authorId: string | undefined) => string | null;
  newClients: NewClients;
  machines: readonly SinceMachine[];
  playbook: readonly SincePlaybookEntry[];
  hearts: readonly SinceHeart[];
  /** Notices tapped as seen on this iPad this session. */
  readKeys: ReadonlySet<string>;
  /** Announcements this person said they'd read: id → when (ms), null while the stamp is on its way. */
  acked?: ReadonlyMap<string, number | null>;
}

/** Was this after the marker (or, on a first visit, in the last week)? */
export function isAfterMarker(at: number | null, seenAt: number | null | undefined, now: number): boolean {
  if (at === null || seenAt === undefined) return false;
  if (seenAt === null) return at >= now - FIRST_VISIT_WINDOW_DAYS * DAY_MS;
  return at > seenAt;
}

/**
 * Every notice, in the board's order: leadership first, then new clients,
 * machines out of service, the Playbook, and what's to you. Newest first
 * inside each. A notice with nothing to say is left out; the new-clients
 * notice stays whenever it has a list OR something to say about what it
 * couldn't check.
 */
export function sinceNotices(input: SinceInput): { notices: SinceNotice[]; newCount: number } {
  const { now, seenAt, readKeys } = input;
  const fresh = (key: string, at: number | null) => !readKeys.has(key) && isAfterMarker(at, seenAt, now);
  const out: SinceNotice[] = [];

  const anns = [...input.announcements].sort((a, b) => (millisOf(b.createdAt) ?? 0) - (millisOf(a.createdAt) ?? 0));
  for (const a of anns) {
    const key = `ann:${a.id}`;
    const at = millisOf(a.createdAt);
    const ack: NoticeAck = !a.asksRead
      ? { state: "not-asked" }
      : input.acked?.has(a.id)
        ? { state: "acked", at: input.acked.get(a.id) ?? null }
        : { state: "asking" };
    // A notice that asks stays new until this person answers: a tap or the
    // marker doesn't stand in for "I've read it".
    out.push({ kind: "announcement", key, at, isNew: ack.state === "asking" || fresh(key, at), announcement: a, role: input.roleOf?.(a.authorId) ?? null, ack });
  }

  const nc = input.newClients;
  if (nc.clients.length > 0 || nc.state !== "known" || nc.unsure > 0) {
    const key = "new-clients";
    const at = nc.clients.reduce<number | null>((m, r) => (r.appearedAt !== null && (m === null || r.appearedAt > m) ? r.appearedAt : m), null);
    out.push({ kind: "new-clients", key, at, isNew: fresh(key, at), clients: nc });
  }

  const machines = [...input.machines].sort((a, b) => (b.at ?? 0) - (a.at ?? 0) || a.name.localeCompare(b.name));
  for (const m of machines) {
    const key = `oos:${m.source}:${m.machineId}`;
    out.push({ kind: "out-of-service", key, at: m.at, isNew: fresh(key, m.at), machine: m });
  }

  const since = now - PLAYBOOK_LOOKBACK_DAYS * DAY_MS;
  const kept = input.playbook
    .filter((e) => !e.retiredAt && (millisOf(e.createdAt) ?? 0) >= since)
    .sort((a, b) => (millisOf(b.createdAt) ?? 0) - (millisOf(a.createdAt) ?? 0))
    .slice(0, 3);
  for (const e of kept) {
    const key = `pb:${e.id}`;
    const at = millisOf(e.createdAt);
    out.push({ kind: "playbook", key, at, isNew: fresh(key, at), entry: e });
  }

  const heartsSince = now - HEARTS_LOOKBACK_DAYS * DAY_MS;
  const hearts = input.hearts.filter((h) => h.from.length > 0 && (h.at === null || h.at >= heartsSince));
  if (hearts.length > 0) {
    const key = "hearts";
    const at = hearts.reduce<number | null>((m, h) => (h.at !== null && (m === null || h.at > m) ? h.at : m), null);
    out.push({ kind: "hearts", key, at, isNew: fresh(key, at), hearts });
  }

  return { notices: out, newCount: out.filter((n) => n.isNew).length };
}

/** "Sent you a heart for the closing wipe-down." — the to-you line, in words. */
export function heartsLine(hearts: readonly SinceHeart[]): string {
  const people = [...new Set(hearts.flatMap((h) => h.from))];
  const who =
    people.length === 1 ? people[0] : people.length === 2 ? `${people[0]} and ${people[1]}` : `${people[0]}, ${people[1]} and ${people.length - 2} more`;
  const total = hearts.reduce((n, h) => n + h.from.length, 0);
  const what = hearts.length === 1 ? ` for ${hearts[0].what}` : ` for ${hearts.length} things you finished`;
  return `${who} sent you ${total === 1 ? "a heart" : `${total} hearts`}${what}.`;
}

/** "Flagged by Mablung, Sat 9:10 AM" · "Off the floor since Tuesday". */
export function machineLine(m: SinceMachine, todayKey: string, tz?: string): string {
  const when = m.at !== null ? whenWords(m.at, todayKey, tz) : null;
  if (m.source === "flag") return `Flagged${m.by ? ` by ${firstName(m.by)}` : ""}${when ? `, ${when}` : ""}.`;
  return when ? `Off the floor since ${when}.` : "Off the floor.";
}

/** "today at 9:10 AM", "yesterday at 4:02 PM", "Saturday", "Sep 12". */
export function whenWords(at: number, todayKey: string, tz?: string): string {
  const d = new Date(at);
  const day = studioDateKey(d, tz);
  const hm = zonedHM(d, tz);
  const clock = hm ? minutesToClock(hm.hour * 60 + hm.minute) : "";
  if (!day) return "";
  if (day === todayKey) return `today at ${clock}`;
  if (day === addDays(todayKey, -1)) return `yesterday at ${clock}`;
  if (day >= addDays(todayKey, -6) && day < todayKey) return WEEKDAY[weekdayOf(day)];
  const [, m, dd] = day.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${dd}`;
}
