/**
 * THE POST-SESSION READ (tracker round, Sep 2026).
 *
 * The screen after Finish has thirty seconds and one job, in AJ's words:
 * "go over today's session, make sure they're set up for next time, and
 * leave them with a good attitude." Everything here is pure so the
 * sentences can be tested, and so the screen stays a renderer.
 *
 * Every claim names its sample and says "not enough yet" below it (the
 * "sentences, not scores" rule in CLAUDE.md).
 */

import { isPerformedLog, outcomeOf, type SetOutcome } from "./set-outcome";
import { newMachinesPhrase } from "./history-claims";
import type { HistoryCoverage } from "./prior-history";
import { BACK_FROM_DAYS } from "../features/openings/back-from";
import { CHECK_DAYS } from "../features/standing-week/check";
import type { ServerRead } from "../features/standing-week/server-read";
import { formatStudioDate, formatStudioTime, getActiveTimeZone, studioDateKey } from "./studio-time";

export interface TodayLog {
  machineId: string;
  weight?: string | number | null;
  loadLb?: string | number | null;
  reps?: string | number | null;
  seconds?: string | number | null;
  isTSC?: boolean;
  isStaticHold?: boolean;
  repQuality?: number | null;
  outcome?: SetOutcome | null;
  skipReason?: string | null;
  side?: "Left" | "Right";
}

/** The last performed set on a machine BEFORE today. */
export interface PriorSet {
  weight: number;
  reps?: number | null;
  seconds?: number | null;
  isTSC?: boolean;
  quality?: number | null;
}

export interface TodayLine {
  machineId: string;
  name: string;
  outcome: SetOutcome;
  weight: number | null;
  count: number | null;
  isTSC: boolean;
  quality: number | null;
  /** Today against the last performed set; null when there is no prior set. */
  loadDelta: number | null;
  countDelta: number | null;
  /**
   * No earlier performed set on record for this machine. That is her FIRST
   * time only when Journey holds her whole story - the screen asks
   * `firstTimeTag(coverage)` before saying so (lib/history-claims.ts).
   */
  first: boolean;
  skipReason?: string | null;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/**
 * One line per planned machine, in the order the routine was performed.
 * Torso Rotation's two sides collapse into one line (the left side's
 * numbers, which is what the grid shows too).
 *
 * `priorKnown: false` when the client's earlier sets have not been read (a
 * session given its client a moment before Finish, the open session's Who's
 * this?; the whole-branch review, Oct 9 2026): nothing is compared and no
 * machine is called a first, since "no earlier set" would only mean "not
 * read yet".
 */
export function todayLines(params: {
  order: readonly string[];
  logs: readonly TodayLog[];
  nameOf: (machineId: string) => string;
  priorOf: (machineId: string) => PriorSet | undefined;
  priorKnown?: boolean;
}): TodayLine[] {
  const { order, logs, nameOf } = params;
  const known = params.priorKnown !== false;
  const priorOf = (id: string) => (known ? params.priorOf(id) : undefined);
  const byMachine = new Map<string, TodayLog>();
  for (const l of logs) {
    if (l.side === "Right" && byMachine.has(l.machineId)) continue;
    if (!byMachine.has(l.machineId) || l.side !== "Right") byMachine.set(l.machineId, l);
  }
  const ids = [...order];
  for (const id of byMachine.keys()) if (!ids.includes(id)) ids.push(id);

  return ids.map((machineId) => {
    const log = byMachine.get(machineId);
    const prior = priorOf(machineId);
    const outcome: SetOutcome = log ? outcomeOf(log) : "not_reached";
    const weight = log ? (num(log.loadLb) ?? num(log.weight)) : null;
    const isTSC = !!(log?.isTSC || log?.isStaticHold);
    const count = log ? (isTSC ? num(log.seconds) : num(log.reps)) : null;
    const performed = !!log && isPerformedLog(log);
    const comparable = performed && prior && !!prior.isTSC === isTSC;
    return {
      machineId,
      name: nameOf(machineId),
      outcome,
      weight,
      count,
      isTSC,
      quality: log?.repQuality ?? null,
      loadDelta: comparable && weight !== null ? weight - prior.weight : null,
      countDelta:
        comparable && count !== null
          ? count - ((isTSC ? prior.seconds : prior.reps) ?? 0)
          : null,
      first: known && performed && !prior,
      skipReason: log?.skipReason ?? null,
    };
  });
}

/**
 * "6 of 6 machines · 3 max-strength sets · load up on 2".
 *
 * "2 new machines" joins it only when Journey holds the client's whole story
 * (`coverage` complete): machine history does not come across from FileMaker,
 * so to a migration client every machine looks new. Cautious by default.
 */
export function todayHeadline(lines: readonly TodayLine[], coverage: HistoryCoverage = "unknown"): string {
  const planned = lines.length;
  const performed = lines.filter((l) => l.outcome === "performed");
  const maxSets = performed.filter((l) => l.quality === 3).length;
  const loadUp = performed.filter((l) => (l.loadDelta ?? 0) > 0).length;
  const repsUp = performed.filter((l) => (l.loadDelta ?? 0) === 0 && (l.countDelta ?? 0) > 0).length;
  const firsts = performed.filter((l) => l.first).length;
  const parts: string[] = [];
  parts.push(`${performed.length} of ${planned} machine${planned === 1 ? "" : "s"}`);
  if (maxSets > 0) parts.push(`${maxSets} max-strength set${maxSets === 1 ? "" : "s"}`);
  if (loadUp > 0) parts.push(`load up on ${loadUp}`);
  if (repsUp > 0) parts.push(`more reps on ${repsUp}`);
  const firstsPhrase = newMachinesPhrase(firsts, coverage);
  if (firstsPhrase) parts.push(firstsPhrase);
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ *
 * The journey — strength since the first session
 * ------------------------------------------------------------------ */

export interface JourneyRowInput {
  machineId: string;
  name: string;
  /** Movement group or body region, for the "trending well with…" line. */
  group: string;
  /** First recorded load on this machine. */
  startWeight: number | null;
  /** Today's load (or the latest performed load). */
  nowWeight: number | null;
  /** Sessions on this machine, today included. */
  sessions: number;
  startDate?: string | null;
}

export interface JourneyRead {
  /** Whole-percent load change across machines with enough history. */
  pct: number | null;
  machines: number;
  since: string | null;
  /** Groups ranked by gain; the strongest first. */
  byGroup: { group: string; pct: number; machines: number }[];
  /** The one machine with the biggest gain. */
  standout: { name: string; startWeight: number; nowWeight: number; pct: number } | null;
  enough: boolean;
}

/** Minimum history before the screen makes a claim about the journey. */
export const JOURNEY_MIN_MACHINES = 3;
export const JOURNEY_MIN_SESSIONS = 3;

export function strengthJourney(rows: readonly JourneyRowInput[]): JourneyRead {
  const usable = rows.filter(
    (r) =>
      r.startWeight !== null &&
      r.nowWeight !== null &&
      r.startWeight! > 0 &&
      r.sessions >= JOURNEY_MIN_SESSIONS,
  );
  const enough = usable.length >= JOURNEY_MIN_MACHINES;
  const pctOf = (rs: readonly JourneyRowInput[]) => {
    const start = rs.reduce((s, r) => s + (r.startWeight as number), 0);
    const now = rs.reduce((s, r) => s + (r.nowWeight as number), 0);
    return start > 0 ? Math.round(((now - start) / start) * 100) : 0;
  };
  const groups = new Map<string, JourneyRowInput[]>();
  for (const r of usable) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  const byGroup = [...groups.entries()]
    .map(([group, rs]) => ({ group, pct: pctOf(rs), machines: rs.length }))
    .filter((g) => g.machines >= 2)
    .sort((a, b) => b.pct - a.pct);
  const standoutRow = usable
    .map((r) => ({
      name: r.name,
      startWeight: r.startWeight as number,
      nowWeight: r.nowWeight as number,
      pct: Math.round((((r.nowWeight as number) - (r.startWeight as number)) / (r.startWeight as number)) * 100),
    }))
    .sort((a, b) => b.pct - a.pct)[0];
  const since = usable
    .map((r) => r.startDate)
    .filter((d): d is string => !!d)
    .sort()[0] ?? null;
  return {
    pct: enough ? pctOf(usable) : null,
    machines: usable.length,
    since,
    byGroup: enough ? byGroup : [],
    standout: enough && standoutRow && standoutRow.pct > 0 ? standoutRow : null,
    enough,
  };
}

/** The sentence the trainer reads out. */
export function journeySentence(read: JourneyRead, firstName: string): string {
  if (!read.enough || read.pct === null) {
    return `Not enough history yet to call a trend — ${JOURNEY_MIN_SESSIONS} sessions on ${JOURNEY_MIN_MACHINES} machines is the bar.`;
  }
  const dir = read.pct > 0 ? "up" : read.pct < 0 ? "down" : "level";
  const amount = read.pct === 0 ? "" : ` ${Math.abs(read.pct)}%`;
  const since = read.since ? ` since ${formatShortDay(read.since)}` : "";
  let s = `${firstName}'s working loads are ${dir}${amount}${since} across ${read.machines} machines.`;
  const best = read.byGroup[0];
  if (best && best.pct > 0) s += ` Strongest trend: ${best.group.toLowerCase()}, up ${best.pct}%.`;
  return s;
}

/* ------------------------------------------------------------------ *
 * Next session
 * ------------------------------------------------------------------ */

export interface BookingLike {
  clientId?: string;
  startTime?: unknown;
  status?: string;
  /** Where the booking is: a booking at another studio on the same Mindbody is still her next. */
  studioId?: string | null;
}

function toMs(v: unknown): number | null {
  if (!v) return null;
  const t = v as { toMillis?: () => number; toDate?: () => Date };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.toDate === "function") return t.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  const ms = new Date(v as string).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** The client's soonest future booking that is still on the books. */
export function nextBookingFor<T extends BookingLike>(
  clientId: string,
  bookings: readonly T[],
  now = Date.now(),
): { at: Date; booking: T } | null {
  let best: { at: Date; booking: T } | null = null;
  for (const b of bookings) {
    if (b.clientId !== clientId) continue;
    if (b.status === "Cancelled" || b.status === "Completed" || b.status === "No-Show") continue;
    const ms = toMs(b.startTime);
    if (ms === null || ms <= now) continue;
    if (!best || ms < best.at.getTime()) best = { at: new Date(ms), booking: b };
  }
  return best;
}

/**
 * "Today · 9:00 AM", "Tomorrow · 9:00 AM" or "Thu, Nov 12 · 9:00 AM", on the
 * STUDIO's clock (lib/studio-time.ts), never the device's: an iPad set to
 * another zone, or GitHub's UTC runner, must read the booking as the studio
 * does. It read the device's clock until Sep 28 2026, which on Eastern iPads
 * happened to agree; CI's first run of the Openings round's Next tests in UTC
 * showed "1:00 PM" for an 8:00 AM booking.
 */
export function formatNextBooking(at: Date, now = new Date(), tz: string = getActiveTimeZone()): string {
  const dayKey = studioDateKey(at, tz);
  const todayKey = studioDateKey(now, tz);
  const days = dayKey && todayKey ? Math.round((keyUtc(dayKey) - keyUtc(todayKey)) / 86_400_000) : null;
  const time = formatStudioTime(at, tz);
  if (days === 0) return `Today · ${time}`;
  if (days === 1) return `Tomorrow · ${time}`;
  const when = formatStudioDate(at, { weekday: "short", month: "short", day: "numeric" }, tz);
  return `${when} · ${time}`;
}

/** Midnight UTC of a `YYYY-MM-DD` key: only for counting whole days between two keys. */
function keyUtc(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/* ------------------------------------------------------------------ *
 * The Next card's answer, and the door to Times with room
 * (Openings round, Sep 27 2026, phase 8)
 * ------------------------------------------------------------------ */

/**
 * WHAT THE NEXT CARD MAY SAY ABOUT HER NEXT BOOKING.
 *
 * Until this round the card judged "nothing booked" from the schedule the
 * Hub already held, about eight days of THIS studio, so a client booked ten
 * days out, or at Strongsville, read as unbooked; and it said the strongest
 * claim there is, "Nothing booked yet", exactly when Journey had read least.
 * Now:
 *
 *   booked      a booking still on the books. The schedule already on screen
 *               answers at once; otherwise her own bookings from now on
 *               (the profile header's query), heard from the server. A
 *               booking at another studio on the same Mindbody counts, and
 *               says where (`elsewhere`): Westlake, Strongsville and
 *               Willoughby share one, so a booking at any of the three is
 *               hers. Solon keeps its own records, so a Solon booking of a
 *               Westlake client isn't seen.
 *   checking    her bookings haven't come back from the server yet.
 *   none        the server confirmed nothing on file. Never "nothing booked"
 *               plainly: `days` is how far ahead Journey holds bookings,
 *               BACK_FROM_DAYS (30) once the studio's month was read in full
 *               today, CHECK_DAYS (7) otherwise, or while that isn't known.
 *   cant-check  offline, the read failed, or only this iPad's cache answered
 *               (server-read.ts): a cache is never an answer, even one with a
 *               booking in it. And at a studio whose bookings aren't linked
 *               (no Site ID, or marked offline): Journey holds none of its
 *               bookings, so "nothing booked" there would be a claim about
 *               nothing it read (the final review). A booking it did hear of,
 *               at a linked studio on the same Mindbody, still answers.
 */
export type NextBookingAnswer =
  | { state: "booked"; at: Date; elsewhere: string | null }
  | { state: "checking" }
  | { state: "none"; days: number }
  | { state: "cant-check" };

/** A booking at a studio Journey can't name. */
export const ANOTHER_STUDIO = "another studio";

export interface NextBookingInput<T extends BookingLike> {
  clientId: string;
  /** The schedule already on screen (the Hub's): a booking there is shown at once. */
  loaded: readonly T[];
  /** Her own bookings from now on, as the listener last heard them. */
  heard: readonly T[];
  /** Whether the listener's answer is the server's (only "ready" is an answer). */
  read: ServerRead;
  /** The studio's month was read in full today; null while the sync lease is still coming. */
  monthRead: boolean | null;
  /** The studio the iPad is in; a booking anywhere else says where. */
  hereStudioId: string | null;
  /** A studio's name, or null when Journey doesn't know it. */
  studioName: (studioId: string) => string | null;
  /** The studio's bookings are linked (Openings' `bookingsKnown`); unlinked, Journey holds none of this studio's bookings. */
  linked: boolean;
  now?: number;
}

export function nextBookingAnswer<T extends BookingLike>(input: NextBookingInput<T>): NextBookingAnswer {
  const now = input.now ?? Date.now();
  const where = (b: BookingLike): string | null => {
    const id = b.studioId;
    if (!id || !input.hereStudioId || id === input.hereStudioId) return null;
    return input.studioName(id)?.trim() || ANOTHER_STUDIO;
  };
  const onScreen = nextBookingFor(input.clientId, input.loaded, now);
  if (onScreen) return { state: "booked", at: onScreen.at, elsewhere: where(onScreen.booking) };
  if (input.read === "loading") return { state: "checking" };
  if (input.read !== "ready") return { state: "cant-check" };
  const heard = nextBookingFor(input.clientId, input.heard, now);
  if (heard) return { state: "booked", at: heard.at, elsewhere: where(heard.booking) };
  if (!input.linked) return { state: "cant-check" };
  return { state: "none", days: input.monthRead === true ? BACK_FROM_DAYS : CHECK_DAYS };
}

/**
 * The Next card's one line. "Checking…" sits in the same space the answer
 * will take, so nothing on the card moves while the client reads it.
 */
export function nextBookingSentence(answer: NextBookingAnswer, now = new Date()): string {
  switch (answer.state) {
    case "booked":
      return `Next session: ${formatNextBooking(answer.at, now)}${answer.elsewhere ? ` at ${answer.elsewhere}` : ""}.`;
    case "checking":
      return "Checking the next booking…";
    case "none":
      return `Nothing booked in the next ${answer.days} days. Book the next one before they leave.`;
    case "cant-check":
      return "Can't check the next booking right now.";
  }
}

/**
 * THE DOOR TO TIMES WITH ROOM.
 *
 *   none        nothing to offer yet (the first weeks after launch never open
 *               an empty sheet);
 *   quiet       a text button, on every Wrap-up with something to offer,
 *               including a client who is booked but wants a better regular
 *               time, and while her bookings are still coming or can't be
 *               checked;
 *   prominent   the plum line and a button, only when the server confirmed
 *               nothing is booked. A booking that arrives while the screen is
 *               open (the desk booked her; the webhook writes it within
 *               seconds) turns the card green and the door steps back.
 */
export type TimesDoor = "none" | "quiet" | "prominent";

export function timesDoor(answer: NextBookingAnswer, somethingToOffer: boolean): TimesDoor {
  if (!somethingToOffer) return "none";
  return answer.state === "none" ? "prominent" : "quiet";
}

function formatShortDay(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

/* ------------------------------------------------------------------ *
 * The Wrap-up's title: a plain congratulation (the Atlas answers, Oct 2 2026)
 * ------------------------------------------------------------------ */

/**
 * AJ, Oct 2 2026: "a few generic 'congratulations' messages that it randomly
 * picks". They replace "{name}, strong work." / "good work.", which judged the
 * session from the stars. None of these makes a claim about how she did: the
 * client reads this title, and the screen below it says what happened.
 * `{name}` is her first name.
 */
export const CONGRATULATIONS: readonly string[] = [
  "Well done, {name}.",
  "Nicely done, {name}.",
  "Congratulations, {name}.",
  "That's a wrap, {name}.",
  "Another one done, {name}.",
  "Thanks for the work today, {name}.",
];

/** The same words without a name, for a client with no first name on file. */
const WITHOUT_NAME = ["Well done.", "Nicely done.", "Congratulations.", "That's a wrap.", "Another one done.", "Thanks for the work today."];

/** A small stable hash (FNV-1a), so the pick never changes on a re-render. */
function stableHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * One congratulation, picked "at random" but seeded by the session, so the
 * same session always says the same thing (a re-render, coming back to the
 * screen) and different sessions vary.
 */
export function congratulation(seed: string, firstName: string): string {
  const i = stableHash(seed || "wrap-up") % CONGRATULATIONS.length;
  const name = (firstName || "").trim();
  return name ? CONGRATULATIONS[i].replace("{name}", name) : WITHOUT_NAME[i];
}
