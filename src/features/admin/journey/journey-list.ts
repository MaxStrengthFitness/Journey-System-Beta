/**
 * THE STUDIO'S JOURNEY — every client's state, the lenses, and the order each
 * list reads in. Pure: journey-list.test.ts (TZ=America/New_York).
 *
 * The redesign's Operations room, phase 4 (Sep 28 2026). One pass over what
 * the page already holds: the roster (each client's nightly snapshot), the
 * week's bookings as the server answered them, the studio's package table
 * and renewal settings, the trainers and the watchlist. Each client's facts
 * come from the Client Directory's ONE row model (client-directory/row.ts),
 * so Last in and Next here are the directory's own; her state from
 * states.ts; her case from case.ts. No read per client.
 *
 *   the lenses        All clients · Renewal window (the renewal pipeline's
 *                     own lanes: talk now, before the charge, coming up) ·
 *                     New (her first sessions to the studio's Settling in
 *                     line, 24 by default, from a total that may be quoted)
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
import { BESIDE_STATES, LINE_STATES, isSlipping, journeyOf, type ClientJourney, type JourneyLines, type JourneyState } from "./states";

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
  /** In the renewal pipeline's live lanes (talk now, before the charge, coming up). */
  inRenewalWindow: boolean;
  /** Her first sessions to the studio's Settling in line, from a total that may be quoted. */
  early: boolean;
  /** Her usual trainer, when last night's record names one Journey knows. */
  usual: { id: string; name: string } | null;
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
}

const homeOf = (c: Client): string | null => c.homeStudioId || (c as { studioId?: string }).studioId || null;

/** Who a trainer id names: the trainer document id, or an older account's sign-in uid. */
export function trainerById(trainers: readonly Trainer[], id: string | null | undefined): Trainer | null {
  if (!id) return null;
  return trainers.find((t) => t.id === id || t.authUid === id) ?? null;
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
  const out: JourneyEntry[] = [];
  for (const client of home) {
    const row = rows.get(client.id as string);
    if (!row) continue;
    const snapshot = (client.renewal as RenewalSnapshot | undefined) ?? null;
    const journey = journeyOf({
      active: true,
      snapshot,
      lastVisit: row.lastIn.state === "known" ? row.lastIn.day : null,
      next: { state: row.next.state, day: row.next.day },
      quotableTotal: row.total.state === "known" ? row.total.value : null,
      today: i.today,
      breakDays: i.settings.breakDays,
      nightlyStale: i.nightlyStale,
      lines: i.lines,
    });
    const trainer = trainerById(i.trainers, snapshot?.primaryTrainerId);
    const usual = trainer?.id ? { id: trainer.id, name: trainer.fullName } : null;
    const usualInToday = i.weekReady ? shiftToday(i.weekEntries, trainer, i.today, i.tz) : null;
    const lane = snapshot ? laneOf(snapshot, null, settings, i.today) : null;
    const entry = i.watchlist.get(client.id as string) ?? null;
    out.push({
      id: client.id as string,
      client,
      row,
      journey,
      case: caseOf(journey, { trainer: usual, inToday: usualInToday }, i.today),
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
    if (state === "away") return (a.client.renewal?.awayUntil ?? "9999").localeCompare(b.client.renewal?.awayUntil ?? "9999") || byName(a, b);
    if (state === "new" || state === "settling") return (a.row.total.value ?? 0) - (b.row.total.value ?? 0) || byName(a, b);
    if (state === "unknown") return (UNKNOWN_ORDER[a.journey.unknownWhy ?? ""] ?? 9) - (UNKNOWN_ORDER[b.journey.unknownWhy ?? ""] ?? 9) || byName(a, b);
    return byName(a, b);
  });
}

/**
 * THIS WEEK, from what can be derived without a stored history: who crossed
 * a line in the last seven days (the day they crossed it is their last visit
 * plus the line), and who booked again after one. Who moved toward steady
 * needs yesterday's states, which aren't stored (the nightly job writing
 * them waits for AJ's OK), so it isn't claimed.
 */
export function thisWeek(entries: readonly JourneyEntry[], today: string): { startedSlipping: JourneyEntry[]; lapsedThisWeek: JourneyEntry[]; back: JourneyEntry[] } {
  const from = addDays(today, -6);
  const crossed = (e: JourneyEntry) => Boolean(e.journey.since && e.journey.since >= from && e.journey.since <= today);
  return {
    startedSlipping: entries.filter((e) => isSlipping(e.journey.state) && crossed(e)),
    lapsedThisWeek: entries.filter((e) => e.journey.state === "lapsed" && crossed(e)),
    back: entries.filter((e) => e.journey.state === "back"),
  };
}
