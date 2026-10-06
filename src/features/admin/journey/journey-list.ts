/**
 * THE STUDIO'S JOURNEY — every client's state, the lenses, and the order each
 * list reads in. Pure: journey-list.test.ts (TZ=America/New_York).
 *
 * The redesign's Operations room, phase 4 (Sep 28 2026). One pass over what
 * the page already holds: the roster (each client's nightly snapshot), the
 * week's bookings as the server answered them, the studio's package table
 * and renewal settings, the trainers, the watchlist and the stored cases
 * (wave 2, case-store.ts). Each client's facts
 * come from the Client Directory's ONE row model (client-directory/row.ts),
 * so Last in and Next here are the directory's own; her state from
 * states.ts; her case from case.ts. No read per client.
 *
 *   the lenses        All clients · Renewal window (the renewal pipeline's
 *                     own lanes: talk now, before the charge, coming up) ·
 *                     New (her first sessions to the studio's Settling in
 *                     line, 24 by default, from a total that may be quoted)
 *   the night         wave 2: when last night's states are TODAY's and were
 *                     worked out with the studio's lines as they are now
 *                     (nightly.ts `summaryIsFresh`), each client's is used —
 *                     her rhythm measured from her visits, since when, and
 *                     what she was — unless the page knows something the
 *                     night didn't (a visit since, a new booking, or her
 *                     booking here gone: `nightStillHolds`); then her state
 *                     is worked out here, still with the night's rhythm
 *   the order         slipping lists read "catchable first": clients a leader
 *                     has already answered (snoozed, dismissed) last, then
 *                     those whose usual trainer is in today, then the closest
 *                     to the line
 */
import type { Client, KaizenRosterEntry, ScheduleEntry, Trainer } from "../../../types";
import { isStaffBlock } from "../../../lib/booking-state";
import { formatStudioTime, studioDateKey, toDate } from "../../../lib/studio-time";
import { addDays } from "../../client-history/model";
import { buildDirectoryRows, prepareDirectory, type DirectoryRow } from "../../client-directory/row";
import type { PackageNameIndex } from "../../renewals/settings";
import { laneOf } from "../../renewals/pipeline";
import type { RenewalSettings, RenewalSnapshot } from "../../renewals/types";
import { watchState, type WatchState, type WatchlistEntry } from "../attention/attention";
import { caseOf, type CaseView } from "./case";
import type { StoredCase } from "./case-store";
import { journeyOfDoc, nightStillHolds, rhythmOfDoc, summaryIsFresh, type ClientStateDoc, type JourneySummary } from "./nightly";
import { BESIDE_STATES, LINE_STATES, isSlipping, journeyOf, type ClientJourney, type JourneyLines, type JourneyState } from "./states";
import type { InactiveMark } from "./inactive";

export type JourneyLens = "all" | "renewal" | "new";

export const LENSES: ReadonlyArray<{ id: JourneyLens; label: string }> = [
  { id: "all", label: "All clients" },
  { id: "renewal", label: "Renewal window" },
  { id: "new", label: "New" },
];

export interface JourneyEntry {
  id: string;
  client: Client;
  row: DirectoryRow;
  journey: ClientJourney;
  case: CaseView;
  /** The case a leader stored for her (wave 2), or null: the case is then worked out. */
  storedCase: StoredCase | null;
  /** What last night's run knew of her state (wave 2): since when, and what it was; null when no fresh night covers her. */
  night: { since: string; was: JourneyState | null } | null;
  /** Her state is the night's own (the page knew nothing newer); false when worked out here. */
  fromNight: boolean;
  /** In the renewal pipeline's live lanes (talk now, before the charge, coming up). */
  inRenewalWindow: boolean;
  /** Her first sessions to the studio's Settling in line, from a total that may be quoted. */
  early: boolean;
  /** Her usual trainer, when last night's record names one Journey knows; `uid` is their sign-in id. */
  usual: { id: string; name: string; uid: string } | null;
  /** "7:00 AM – 3:00 PM" when her usual trainer has bookings today; null otherwise. */
  usualInToday: string | null;
  watch: WatchState;
  watchEntry: WatchlistEntry | null;
}

export interface StudioJourneysInput {
  clients: readonly Client[];
  studioId: string;
  today: string;
  now: Date;
  tz?: string;
  studios: ReadonlyArray<{ id?: string; name?: string; journeyCutoverDate?: string | null }>;
  /** The week's bookings (today and six days); only trusted as "nothing booked" when `weekReady`. */
  weekEntries: readonly ScheduleEntry[];
  weekReady: boolean;
  packageIndex: Pick<PackageNameIndex, "tierFor" | "isExtraSessions"> | null;
  trainers: readonly Trainer[];
  myIds?: readonly string[];
  myName?: string | null;
  kaizen?: readonly KaizenRosterEntry[] | null;
  settings: Pick<RenewalSettings, "breakDays" | "horizonMonths" | "chargeWarnDays" | "chargeWarnMinBanked" | "conversationAtSessionsLeft">;
  nightlyStale: boolean;
  /** The studio's five lines (studio-settings: its own, else Max Strength's default, else the app's). */
  lines: JourneyLines;
  watchlist: ReadonlyMap<string, WatchlistEntry>;
  /** The studio's stored cases by client (wave 2); absent or null while unread, and every case is worked out. */
  cases?: ReadonlyMap<string, StoredCase> | null;
  /** Last night's states and their summary (wave 2); used only while the summary is today's with today's lines. */
  stored?: { summary: Pick<JourneySummary, "asOf" | "lines" | "breakDays"> | null; states: ReadonlyMap<string, ClientStateDoc> } | null;
  /** The studio's leaders' inactive marks by client (inactive.ts); absent or null while unread. */
  marks?: ReadonlyMap<string, InactiveMark> | null;
}

const homeOf = (c: Client): string | null => c.homeStudioId || (c as { studioId?: string }).studioId || null;

/** Who a trainer id names: the trainer document id, or an older account's sign-in uid. */
export function trainerById(trainers: readonly Trainer[], id: string | null | undefined): Trainer | null {
  if (!id) return null;
  return trainers.find((t) => t.id === id || t.authUid === id) ?? null;
}

/**
 * Today's bookings by whose they are, read once (the iPad round, Oct 2026):
 * studioJourneys asked shiftToday for every client, and each ask walked the
 * whole week reading every booking's studio day (the perf lab: Operations ->
 * Today's hottest code of its own). Keyed by trainer id, and by name for a
 * booking that names no id, each the first start and the last end today.
 */
export interface ShiftIndex {
  byId: Map<string, { first: number; last: number }>;
  byName: Map<string, { first: number; last: number }>;
}

export function shiftIndex(entries: readonly ScheduleEntry[], today: string, tz?: string): ShiftIndex {
  const byId = new Map<string, { first: number; last: number }>();
  const byName = new Map<string, { first: number; last: number }>();
  for (const b of entries) {
    if (b.status === "Cancelled" || isStaffBlock(b)) continue;
    const key = b.trainerId || (b.trainerName ?? "").trim().toLowerCase();
    if (!key || studioDateKey(b.startTime, tz) !== today) continue;
    const start = toDate(b.startTime)?.getTime();
    const end = toDate(b.endTime)?.getTime() ?? (typeof start === "number" ? start + 30 * 60_000 : undefined);
    if (typeof start !== "number" || typeof end !== "number") continue;
    const map = b.trainerId ? byId : byName;
    const was = map.get(key);
    map.set(key, was ? { first: Math.min(was.first, start), last: Math.max(was.last, end) } : { first: start, last: end });
  }
  return { byId, byName };
}

/** shiftToday from the index: the same answer, without walking the week. */
export function shiftFromIndex(index: ShiftIndex, trainer: Trainer | null, tz?: string): string | null {
  if (!trainer) return null;
  let first: number | null = null;
  let last: number | null = null;
  const take = (span: { first: number; last: number } | undefined) => {
    if (!span) return;
    first = first === null ? span.first : Math.min(first, span.first);
    last = last === null ? span.last : Math.max(last, span.last);
  };
  for (const id of new Set([trainer.id, trainer.authUid].filter(Boolean) as string[])) take(index.byId.get(id));
  const name = (trainer.fullName ?? "").trim().toLowerCase();
  if (name) take(index.byName.get(name));
  if (first === null || last === null) return null;
  return `${formatStudioTime(new Date(first), tz)} – ${formatStudioTime(new Date(last), tz)}`;
}

/** A trainer's first and last booking today, as "7:00 AM – 3:00 PM"; null when they have none. */
export function shiftToday(entries: readonly ScheduleEntry[], trainer: Trainer | null, today: string, tz?: string): string | null {
  if (!trainer) return null;
  const ids = new Set([trainer.id, trainer.authUid].filter(Boolean) as string[]);
  const name = (trainer.fullName ?? "").trim().toLowerCase();
  let first: number | null = null;
  let last: number | null = null;
  for (const b of entries) {
    if (b.status === "Cancelled" || isStaffBlock(b)) continue;
    const mine = (b.trainerId && ids.has(b.trainerId)) || (!b.trainerId && name && (b.trainerName ?? "").trim().toLowerCase() === name);
    if (!mine || studioDateKey(b.startTime, tz) !== today) continue;
    const start = toDate(b.startTime)?.getTime();
    const end = toDate(b.endTime)?.getTime() ?? (typeof start === "number" ? start + 30 * 60_000 : undefined);
    if (typeof start !== "number" || typeof end !== "number") continue;
    first = first === null ? start : Math.min(first, start);
    last = last === null ? end : Math.max(last, end);
  }
  if (first === null || last === null) return null;
  return `${formatStudioTime(new Date(first), tz)} – ${formatStudioTime(new Date(last), tz)}`;
}

export function studioJourneys(i: StudioJourneysInput): JourneyEntry[] {
  const home = i.clients.filter((c) => c.id && c.isActive !== false && homeOf(c) === i.studioId);
  const names = new Map(i.trainers.filter((t) => t.id).map((t) => [t.id as string, t.nickname?.trim() || t.fullName]));
  const ctx = prepareDirectory({
    today: i.today,
    now: i.now,
    tz: i.tz,
    studios: i.studios,
    activeStudioId: i.studioId,
    schedules: i.weekEntries,
    bookingsFresh: i.weekReady,
    // The week read is today and six days: a booking last night's record holds past it still counts.
    horizonDays: 6,
    recentSessions: null,
    packageIndex: i.packageIndex,
    packageStudioId: i.studioId,
    kaizen: i.kaizen ?? null,
    myIds: i.myIds ?? [],
    myName: i.myName ?? null,
    trainerNameOf: (id) => names.get(id) ?? null,
  });
  const rows = new Map(buildDirectoryRows(home, ctx).map((r) => [r.id, r]));
  const settings = i.settings as RenewalSettings;
  const nightFresh = Boolean(i.stored && summaryIsFresh(i.stored.summary, i.today, i.lines, i.settings.breakDays));
  const horizonEnd = addDays(i.today, 6);
  // Each trainer's day, once: many clients share a usual trainer.
  const shifts = i.weekReady ? shiftIndex(i.weekEntries, i.today, i.tz) : null;
  const shiftOf = new Map<Trainer, string | null>();
  const out: JourneyEntry[] = [];
  for (const client of home) {
    const row = rows.get(client.id as string);
    if (!row) continue;
    const snapshot = (client.renewal as RenewalSnapshot | undefined) ?? null;
    const doc = nightFresh ? (i.stored?.states.get(client.id as string) ?? null) : null;
    const lastVisit = row.lastIn.state === "known" ? row.lastIn.day : null;
    const mark = i.marks?.get(client.id as string) ?? null;
    const live = journeyOf({
      active: true,
      snapshot,
      lastVisit,
      next: { state: row.next.state, day: row.next.day },
      quotableTotal: row.total.state === "known" ? row.total.value : null,
      today: i.today,
      breakDays: i.settings.breakDays,
      nightlyStale: i.nightlyStale,
      lines: i.lines,
      // The night measured her rhythm from her visits; the page can only estimate it from her pace.
      ...(doc ? { rhythm: rhythmOfDoc(doc) } : {}),
      mark,
    });
    // A leader's mark (or one taken back since the night) is the page's to read: her state is worked out here.
    const holds = Boolean(
      doc && !mark && doc.inactiveKind !== "manual" && nightStillHolds(doc, { lastVisit, next: { state: row.next.state, day: row.next.day, source: row.next.source }, horizonEnd }),
    );
    const journey = holds && doc ? journeyOfDoc(doc, i.today, i.lines) : live;
    const night = doc && doc.state === journey.state ? { since: doc.since, was: doc.was } : null;
    const trainer = trainerById(i.trainers, snapshot?.primaryTrainerId);
    const usual = trainer?.id ? { id: trainer.id, name: trainer.fullName, uid: trainer.authUid || trainer.id } : null;
    let usualInToday: string | null = null;
    if (shifts && trainer) {
      if (!shiftOf.has(trainer)) shiftOf.set(trainer, shiftFromIndex(shifts, trainer, i.tz));
      usualInToday = shiftOf.get(trainer) ?? null;
    }
    const lane = snapshot ? laneOf(snapshot, null, settings, i.today) : null;
    const entry = i.watchlist.get(client.id as string) ?? null;
    const stored = i.cases?.get(client.id as string) ?? null;
    out.push({
      id: client.id as string,
      client,
      row,
      journey,
      case: caseOf(journey, { trainer: usual, inToday: usualInToday }, i.today, { stored, updatedOn: stored?.updatedAt ? studioDateKey(stored.updatedAt, i.tz) : null }),
      storedCase: stored,
      night,
      fromNight: holds,
      inRenewalWindow: lane === "talk-now" || lane === "before-charge" || lane === "coming-up",
      early: row.total.state === "known" && row.total.value !== null && row.total.value <= i.lines.settlingMax,
      usual,
      usualInToday,
      watch: watchState(entry ?? undefined, i.today),
      watchEntry: entry,
    });
  }
  return out;
}

export function inLens(e: JourneyEntry, lens: JourneyLens): boolean {
  if (lens === "renewal") return e.inRenewalWindow;
  if (lens === "new") return e.early;
  return true;
}

/** How many clients are in each state, through a lens. */
export function stateCounts(entries: readonly JourneyEntry[], lens: JourneyLens): Record<JourneyState, number> {
  const out = Object.fromEntries([...LINE_STATES, ...BESIDE_STATES].map((s) => [s, 0])) as Record<JourneyState, number>;
  for (const e of entries) if (inLens(e, lens)) out[e.journey.state] += 1;
  return out;
}

const WATCH_ORDER: Record<WatchState, number> = { watching: 0, snoozed: 1, dismissed: 2 };
const UNKNOWN_ORDER: Record<string, number> = { "bookings-unread": 0, "no-visit": 1, "no-record": 2, "stale-record": 3, "too-new": 4 };

/** One state's list through a lens, in the order a leader works it. */
export function listFor(entries: readonly JourneyEntry[], state: JourneyState, lens: JourneyLens): JourneyEntry[] {
  const list = entries.filter((e) => e.journey.state === state && inLens(e, lens));
  const name = (e: JourneyEntry) => e.row.name.goesBy.toLowerCase();
  const byName = (a: JourneyEntry, b: JourneyEntry) => name(a).localeCompare(name(b)) || a.row.name.display.localeCompare(b.row.name.display);
  return list.sort((a, b) => {
    if (isSlipping(state) || state === "lapsed") {
      return (
        WATCH_ORDER[a.watch] - WATCH_ORDER[b.watch] ||
        Number(Boolean(b.usualInToday)) - Number(Boolean(a.usualInToday)) ||
        (a.journey.daysSince ?? 0) - (b.journey.daysSince ?? 0) ||
        byName(a, b)
      );
    }
    // Inactive: the most recent first, the likeliest win-backs.
    if (state === "inactive") return (b.journey.inactive?.since ?? b.journey.since ?? "").localeCompare(a.journey.inactive?.since ?? a.journey.since ?? "") || byName(a, b);
    if (state === "away") return (a.client.renewal?.awayUntil ?? "9999").localeCompare(b.client.renewal?.awayUntil ?? "9999") || byName(a, b);
    if (state === "new" || state === "settling") return (a.row.total.value ?? 0) - (b.row.total.value ?? 0) || byName(a, b);
    if (state === "unknown") return (UNKNOWN_ORDER[a.journey.unknownWhy ?? ""] ?? 9) - (UNKNOWN_ORDER[b.journey.unknownWhy ?? ""] ?? 9) || byName(a, b);
    return byName(a, b);
  });
}

/**
 * THIS WEEK: who crossed a line in the last seven days (the day they
 * crossed it is their last visit plus the line), and who booked again after
 * one. Who moved toward steady needs yesterday's states: since wave 2 the
 * nightly job keeps each client's `since` and `was`, so it is said when last
 * night's states cover the studio (a client back in her rhythm, or booked
 * again, who was slipping or lapsed before), and not claimed otherwise.
 */
export function thisWeek(
  entries: readonly JourneyEntry[],
  today: string,
): { startedSlipping: JourneyEntry[]; lapsedThisWeek: JourneyEntry[]; inactiveThisWeek: JourneyEntry[]; back: JourneyEntry[]; towardSteady: JourneyEntry[] | null } {
  const from = addDays(today, -6);
  const crossed = (e: JourneyEntry) => Boolean(e.journey.since && e.journey.since >= from && e.journey.since <= today);
  // Who moved toward steady needs yesterday's states: the night's `was` (wave 2). Null when no night covers anyone.
  const covered = entries.some((e) => e.night !== null);
  const slipped: ReadonlySet<JourneyState> = new Set(["drifting", "at-risk", "lapsed"]);
  return {
    startedSlipping: entries.filter((e) => isSlipping(e.journey.state) && crossed(e)),
    lapsedThisWeek: entries.filter((e) => e.journey.state === "lapsed" && crossed(e)),
    // Past the Inactive line, or marked by a leader, in the last seven days.
    inactiveThisWeek: entries.filter((e) => e.journey.state === "inactive" && crossed(e)),
    back: entries.filter((e) => e.journey.state === "back"),
    towardSteady: covered
      ? entries.filter((e) => e.night && (e.journey.state === "steady" || e.journey.state === "back") && e.night.was !== null && slipped.has(e.night.was) && e.night.since >= from && e.night.since <= today)
      : null,
  };
}
