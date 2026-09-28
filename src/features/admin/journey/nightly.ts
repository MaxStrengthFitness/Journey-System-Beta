/**
 * THE NIGHT'S STATES — every client's state worked out by the nightly
 * renewals job, the studio's Journey summary, and the Hub's All stars; and,
 * for the screens, the stored state read back. Pure: nightly.test.ts
 * (TZ=America/New_York). The job's step (server/journey-step.ts) reads, calls
 * `nightStudio`, and writes what comes back; nothing here touches Firestore.
 *
 * Wave 2 of the Operations room (Sep 28 2026; AJ: "all yes" to client states
 * written nightly and a nightly summary per studio, and to the Hub's All
 * stars stored with the 26-week read it needs).
 *
 * ONE RULE, RUN AT NIGHT. The state is `journeyOf` (states.ts) — the rule
 * every Operations screen asks — handed better evidence than a screen has:
 *
 *   her rhythm      `rhythmFromVisits`, the research's rule, from the visit
 *                   days themselves (the same attendance the renewal engine
 *                   read tonight: Journey sessions, and bookings that count as
 *                   visits under done-means-logged and the cutover rule, and
 *                   never a booking a leader marked "didn't come"), where a
 *                   screen can only estimate it from last night's pace;
 *   last in, next   the Client Directory's ONE row model (client-directory/
 *                   row.ts), given tonight's snapshot and every studio's
 *                   bookings in the job's window, so a booking at another
 *                   location is seen;
 *   the lines       the studio settings, resolved as resolve.ts does
 *                   (`resolveAll`): the studio's own, else Max Strength's
 *                   default, else the app's.
 *
 * WHAT IS KEPT (studios/{s}/clientStates/{clientId}, leaders only): the
 * state, `since` (the day she crossed its line, else the first night the job
 * saw her in it — carried from the night before while the state holds),
 * `was` (the state before), the reasons [why, proof], her usual gap and what
 * backs it, last visit and next booking (and whether that booking is at this
 * studio: a screen checks it against the week it reads). A document changes
 * only when one of those does, so a steady client's is written once.
 *
 * THE SUMMARY (studios/{s}/watch/journey, leaders only): the counts by state,
 * the studio day it was worked out for (`asOf`), and the lines and break
 * days it used — a screen trusts the stored states only when the summary is
 * TODAY's and its lines are the studio's lines now.
 *
 * ALL STARS (studios/{s}/watch/hubMarks, everyone who works there): the Hub
 * room's rule (hub-opportunities/all-stars.ts), given 26 whole weeks of her
 * logged sessions, and only for a client whose whole window Journey holds
 * (`ownedWindow`): a FileMaker client is never called one off a partial
 * record, and nobody is ever called "not an all star".
 */
import type { Client, ScheduleEntry } from "../../../types";
import { isStaffBlock } from "../../../lib/booking-state";
import { coverageOfClient, homeCutoverOf } from "../../../lib/client-coverage";
import { ownedWindow } from "../../../lib/history-claims";
import { priorHistoryOf } from "../../../lib/prior-history";
import { studioDateKey, toDate } from "../../../lib/studio-time";
import { daysBetween } from "../../client-history/model";
import { buildDirectoryRows, prepareDirectory } from "../../client-directory/row";
import { allStarStanding } from "../../hub-opportunities/all-stars";
import type { PackageNameIndex } from "../../renewals/settings";
import type { RenewalSnapshot } from "../../renewals/types";
import { gapWords, rhythmFromVisits, type Rhythm, type RhythmResult } from "./rhythm";
import {
  BESIDE_STATES,
  LINE_KEYS,
  LINE_STATES,
  countStates,
  driftLine,
  journeyOf,
  sameLines,
  type ClientJourney,
  type JourneyLines,
  type JourneyState,
  type LineCrossed,
  type UnknownWhy,
} from "./states";

export const CLIENT_STATES = "clientStates";
export const JOURNEY_WATCH_ID = "journey";
export const HUB_MARKS_ID = "hubMarks";
export const NIGHTLY_VERSION = 1;

/** How far back the job reads logged sessions for All stars: the 26 weeks and a day either side. */
export const ALL_STARS_READ_DAYS = 26 * 7 + 2;

const ALL_STATES: readonly JourneyState[] = [...LINE_STATES, ...BESIDE_STATES];
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** One client's stored state (computedAt is the step's, at write). */
export interface ClientStateDoc {
  state: JourneyState;
  /** The day she entered this state: the day she crossed its line, else the first night the job saw her in it. */
  since: string;
  /** The state before it, as the job last saw her; null on her first night. */
  was: JourneyState | null;
  /** [why, proof]: the sentences a screen shows. */
  reasons: string[];
  usualGapDays: number | null;
  /** Visits behind the usual gap, when it is measured. */
  rhythmVisits: number | null;
  /** The gaps the usual gap is the median of, newest last. */
  rhythmGaps: number[];
  /** Why there is no usual gap yet, when there isn't one. */
  rhythmWhy: string | null;
  judged: boolean;
  crossed: LineCrossed;
  unknownWhy: UnknownWhy | null;
  lastVisit: string | null;
  nextBooked: string | null;
  /** Her next booking is at this studio (a screen can check it against the week it reads). */
  nextBookedHere: boolean;
}

export interface JourneySummary {
  v: number;
  /** The studio day the states were worked out for. */
  asOf: string;
  counts: Record<JourneyState, number>;
  /** Active clients whose home is this studio: every one has a state. */
  clients: number;
  /** The lines and the At-risk line the states were worked out with. */
  lines: JourneyLines;
  breakDays: number;
}

export interface AllStarMark {
  clientId: string;
  weeksWithVisit: number;
  perWeek: number;
}

export interface NightStudioInput {
  studioId: string;
  /** The studio day, yyyy-mm-dd. */
  today: string;
  now: Date;
  tz: string;
  /** Every studio's cutover (a client's home cutover decides what Journey holds of her story). */
  studios: ReadonlyArray<{ id: string; name?: string; journeyCutoverDate: string | null }>;
  /** The studio's clients (its home clients, any state): tonight's snapshot is `snapshots`. */
  clients: readonly Client[];
  snapshots: ReadonlyMap<string, RenewalSnapshot>;
  /** Every booking the job read, by client (every studio, 90 days back to 30 ahead). */
  bookingsByClient: ReadonlyMap<string, readonly ScheduleEntry[]>;
  /** Her visit days tonight (the attendance the renewal engine read: kind "visit"). */
  visitDaysByClient: ReadonlyMap<string, readonly string[]>;
  /** Studio days with a Journey session logged, over the All-stars read, by client; null when that read failed. */
  loggedDaysByClient: ReadonlyMap<string, readonly string[]> | null;
  /** The first studio day the logged sessions were read from, in full. */
  loggedFrom: string | null;
  packageIndex: Pick<PackageNameIndex, "tierFor" | "isExtraSessions"> | null;
  breakDays: number;
  lines: JourneyLines;
  /** Last night's stored states, by client. */
  previous: ReadonlyMap<string, ClientStateDoc>;
}

export interface NightStudioResult {
  states: Map<string, ClientStateDoc>;
  summary: JourneySummary;
  /** Null when the logged sessions couldn't be read: the Hub keeps last night's. */
  allStars: AllStarMark[] | null;
}

const homeOf = (c: Client): string | null => c.homeStudioId || (c as { studioId?: string }).studioId || null;

function nextBookingAt(bookings: readonly ScheduleEntry[] | undefined, nowMs: number): ScheduleEntry | null {
  let best: ScheduleEntry | null = null;
  let bestMs = Infinity;
  for (const b of bookings ?? []) {
    if (!b || b.status === "Cancelled" || isStaffBlock(b)) continue;
    const end = toDate(b.endTime)?.getTime() ?? (toDate(b.startTime)?.getTime() ?? NaN) + 30 * 60_000;
    const start = toDate(b.startTime)?.getTime();
    if (typeof start !== "number" || !(end > nowMs)) continue;
    if (start < bestMs) {
      best = b;
      bestMs = start;
    }
  }
  return best;
}

/** The stored document for one client's journey tonight, `since` and `was` carried from last night. */
export function stateDocOf(j: ClientJourney, previous: ClientStateDoc | null, today: string, nextBookedHere: boolean): ClientStateDoc {
  const held = previous && previous.state === j.state;
  const since = j.crossed && j.since ? j.since : held && previous && DAY_KEY.test(previous.since) ? previous.since : today;
  const was = previous ? (held ? previous.was : previous.state) : null;
  return {
    state: j.state,
    since,
    was,
    reasons: [j.why, j.proof],
    usualGapDays: j.rhythm ? j.rhythm.gapDays : null,
    rhythmVisits: j.rhythm ? j.rhythm.visits : null,
    rhythmGaps: j.rhythm ? [...j.rhythm.gaps] : [],
    rhythmWhy: j.rhythmWhy,
    judged: j.judged,
    crossed: j.crossed,
    unknownWhy: j.unknownWhy,
    lastVisit: j.lastVisit,
    nextBooked: j.nextBooking,
    nextBookedHere: j.nextBooking ? nextBookedHere : false,
  };
}

/** Two stored states say the same thing (the write stamp aside): an unchanged client isn't written again. */
export function sameStateDoc(a: ClientStateDoc | null | undefined, b: ClientStateDoc | null | undefined): boolean {
  if (!a || !b) return false;
  const keys: Array<keyof ClientStateDoc> = ["state", "since", "was", "usualGapDays", "rhythmVisits", "rhythmWhy", "judged", "crossed", "unknownWhy", "lastVisit", "nextBooked", "nextBookedHere"];
  if (keys.some((k) => (a[k] ?? null) !== (b[k] ?? null))) return false;
  const same = (x: readonly unknown[] | undefined, y: readonly unknown[] | undefined) => (x ?? []).length === (y ?? []).length && (x ?? []).every((v, i) => v === (y ?? [])[i]);
  return same(a.reasons, b.reasons) && same(a.rhythmGaps, b.rhythmGaps);
}

/** One studio's night: each active home client's state, the summary and All stars. */
export function nightStudio(i: NightStudioInput): NightStudioResult {
  const nowMs = i.now.getTime();
  const home = i.clients.filter((c) => c.id && c.isActive !== false && homeOf(c) === i.studioId);
  // The row model reads last night's record off the client: hand it tonight's.
  const withTonight = home.map((c) => {
    const snap = i.snapshots.get(c.id as string);
    return snap ? ({ ...c, renewal: snap } as Client) : c;
  });
  const bookings: ScheduleEntry[] = [];
  for (const c of withTonight) bookings.push(...(i.bookingsByClient.get(c.id as string) ?? []));
  const ctx = prepareDirectory({
    today: i.today,
    now: i.now,
    tz: i.tz,
    studios: i.studios,
    activeStudioId: i.studioId,
    schedules: bookings,
    // The job read every booking from the server, thirty days ahead.
    bookingsFresh: true,
    horizonDays: 30,
    recentSessions: null,
    packageIndex: i.packageIndex,
    packageStudioId: i.studioId,
    myIds: [],
    myName: null,
    trainerNameOf: () => null,
  });
  const rows = new Map(buildDirectoryRows(withTonight, ctx).map((r) => [r.id, r]));

  const states = new Map<string, ClientStateDoc>();
  const journeys: ClientJourney[] = [];
  const allStars: AllStarMark[] = [];
  for (const client of withTonight) {
    const id = client.id as string;
    const row = rows.get(id);
    if (!row) continue;
    const snapshot = (client.renewal as RenewalSnapshot | undefined) ?? null;
    const visits = (i.visitDaysByClient.get(id) ?? []).filter((d) => d <= i.today);
    const rhythm: RhythmResult = rhythmFromVisits(visits, i.today);
    const journey = journeyOf({
      active: true,
      snapshot,
      lastVisit: row.lastIn.state === "known" ? row.lastIn.day : null,
      next: { state: row.next.state, day: row.next.day },
      quotableTotal: row.total.state === "known" ? row.total.value : null,
      today: i.today,
      breakDays: i.breakDays,
      nightlyStale: false,
      lines: i.lines,
      rhythm,
    });
    journeys.push(journey);
    const next = nextBookingAt(i.bookingsByClient.get(id), nowMs);
    states.set(id, stateDocOf(journey, i.previous.get(id) ?? null, i.today, Boolean(next && next.studioId === i.studioId)));

    if (i.loggedDaysByClient) {
      const cutover = homeCutoverOf(i.studios, client);
      const standing = allStarStanding({
        asOf: i.today,
        visitDays: i.loggedDaysByClient.get(id) ?? [],
        recordsFrom: i.loggedFrom,
        owned: ownedWindow({ coverage: coverageOfClient(client, cutover), prior: priorHistoryOf(client), cutover }),
      });
      if (standing.standing === "all-star") allStars.push({ clientId: id, weeksWithVisit: standing.weeksIn, perWeek: standing.perWeek });
    }
  }
  const summary: JourneySummary = {
    v: NIGHTLY_VERSION,
    asOf: i.today,
    counts: countStates(journeys),
    clients: journeys.length,
    lines: { ...i.lines },
    breakDays: i.breakDays,
  };
  return { states, summary, allStars: i.loggedDaysByClient ? allStars.sort((a, b) => a.clientId.localeCompare(b.clientId)) : null };
}

/* ------------------------------------------------------------------ *
 * Reading it back (the screens)
 * ------------------------------------------------------------------ */

const STATE_SET: ReadonlySet<string> = new Set(ALL_STATES);
const CROSSED: ReadonlySet<string> = new Set(["twice-usual", "studio-line", "lapse-line", "due-back"]);
const UNKNOWN_WHY: ReadonlySet<string> = new Set(["no-record", "stale-record", "no-visit", "bookings-unread", "too-new"]);

const dayOrNull = (v: unknown): string | null => (typeof v === "string" && DAY_KEY.test(v) ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A stored state read defensively; null when it isn't one a screen can stand behind. */
export function parseStateDoc(data: Record<string, unknown> | null | undefined): ClientStateDoc | null {
  if (!data || !STATE_SET.has(data.state as string)) return null;
  const since = dayOrNull(data.since);
  const reasons = Array.isArray(data.reasons) ? data.reasons.filter((r): r is string => typeof r === "string") : [];
  if (!since || reasons.length < 2) return null;
  return {
    state: data.state as JourneyState,
    since,
    was: STATE_SET.has(data.was as string) ? (data.was as JourneyState) : null,
    reasons,
    usualGapDays: numOrNull(data.usualGapDays),
    rhythmVisits: numOrNull(data.rhythmVisits),
    rhythmGaps: Array.isArray(data.rhythmGaps) ? data.rhythmGaps.filter((g): g is number => typeof g === "number" && Number.isFinite(g)) : [],
    rhythmWhy: typeof data.rhythmWhy === "string" ? data.rhythmWhy : null,
    judged: data.judged === true,
    crossed: CROSSED.has(data.crossed as string) ? (data.crossed as LineCrossed) : null,
    unknownWhy: UNKNOWN_WHY.has(data.unknownWhy as string) ? (data.unknownWhy as UnknownWhy) : null,
    lastVisit: dayOrNull(data.lastVisit),
    nextBooked: dayOrNull(data.nextBooked),
    nextBookedHere: data.nextBookedHere === true,
  };
}

/** The summary read defensively; null when it isn't this version's. */
export function parseSummary(data: Record<string, unknown> | null | undefined): (JourneySummary & { computedAt: Date | null }) | null {
  if (!data || data.v !== NIGHTLY_VERSION) return null;
  const asOf = dayOrNull(data.asOf);
  const lines = data.lines as Record<string, unknown> | undefined;
  const breakDays = numOrNull(data.breakDays);
  if (!asOf || !lines || breakDays === null || LINE_KEYS.some((k) => numOrNull(lines[k]) === null)) return null;
  const counts = Object.fromEntries(ALL_STATES.map((s) => [s, numOrNull((data.counts as Record<string, unknown> | undefined)?.[s]) ?? 0])) as Record<JourneyState, number>;
  const at = data.computedAt as { toDate?: () => Date } | Date | undefined;
  const computedAt = at instanceof Date ? at : at && typeof at.toDate === "function" ? at.toDate() : null;
  return {
    v: NIGHTLY_VERSION,
    asOf,
    counts,
    clients: numOrNull(data.clients) ?? 0,
    lines: Object.fromEntries(LINE_KEYS.map((k) => [k, lines[k] as number])) as unknown as JourneyLines,
    breakDays,
    computedAt,
  };
}

/** The stored states may be trusted today: worked out for this studio day, with the lines the studio has now. */
export function summaryIsFresh(s: Pick<JourneySummary, "asOf" | "lines" | "breakDays"> | null, today: string, lines: JourneyLines, breakDays: number): boolean {
  return Boolean(s && s.asOf === today && sameLines(s.lines, lines) && s.breakDays === breakDays);
}

/** Her usual gap as the night measured it, from the stored state (the proof keeps its gaps). */
export function rhythmOfDoc(d: ClientStateDoc): RhythmResult {
  if (d.usualGapDays === null || d.rhythmVisits === null) {
    return { measured: false, visits: d.rhythmVisits, why: d.rhythmWhy ?? "not enough visits on record for a usual gap yet" };
  }
  const rhythm: Rhythm = { gapDays: d.usualGapDays, visits: d.rhythmVisits, words: gapWords(d.usualGapDays), source: "visits", pacePerWeek: null, gaps: [...d.rhythmGaps] };
  return { measured: true, rhythm };
}

/** Her journey as the night worked it out, read back for today (only when the summary is fresh). */
export function journeyOfDoc(d: ClientStateDoc, today: string, lines: JourneyLines): ClientJourney {
  const r = rhythmOfDoc(d);
  const rhythm = r.measured === true ? r.rhythm : null;
  return {
    state: d.state,
    judged: d.judged,
    rhythm,
    rhythmWhy: r.measured === false ? d.rhythmWhy : null,
    unknownWhy: d.unknownWhy,
    daysSince: d.lastVisit ? daysBetween(d.lastVisit, today) : null,
    lastVisit: d.lastVisit,
    nextBooking: d.nextBooked,
    crossed: d.crossed,
    since: d.crossed ? d.since : null,
    driftDays: rhythm ? driftLine(rhythm.gapDays, lines) : null,
    why: d.reasons[0] ?? "",
    proof: d.reasons[1] ?? "",
  };
}

export interface LiveFacts {
  lastVisit: string | null;
  next: { state: "booked" | "none" | "unknown"; day: string | null; source?: "held" | "nightly" | null };
  /** The last studio day the page's own bookings reach (today plus six on Operations). */
  horizonEnd: string;
}

/**
 * Does the page know anything the night didn't? A visit after the night's
 * last visit, a booking it didn't have (or an earlier one), or a booking at
 * this studio inside the week the page reads that is gone. Then the stored
 * state is stale for her and the page works her state out itself. What the
 * page can't see (a booking at another studio) never contradicts the night.
 */
export function nightStillHolds(d: ClientStateDoc, live: LiveFacts): boolean {
  if (live.lastVisit && (!d.lastVisit || live.lastVisit > d.lastVisit)) return false;
  if (live.next.state === "booked") {
    if (live.next.source === "nightly") return d.nextBooked !== null;
    if (!live.next.day) return true;
    if (d.nextBooked === null) return false;
    // The same booking; or a later one here, when the night's earlier one was at another studio the page doesn't read.
    return live.next.day === d.nextBooked || (!d.nextBookedHere && live.next.day > d.nextBooked);
  }
  if (live.next.state === "none") {
    if (d.nextBooked === null) return true;
    // Her next booking was at this studio inside the week the page read, and it's gone.
    return !(d.nextBookedHere && d.nextBooked <= live.horizonEnd);
  }
  return true;
}
