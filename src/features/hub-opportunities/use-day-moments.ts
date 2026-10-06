/**
 * THE DAY'S MOMENTS, worked out once for the Hub (calm Hub round, Sep 28 2026).
 *
 * Every client booked on the day on screen, with her moments, her facts and
 * her session number: `momentsToday` over the directory's rows. The Run-sheet
 * made this for itself in the directory round; the Schedule layer's cards,
 * its peek and the day summary now read the same entries, so the grid and the
 * list can never disagree (research-hub §7, rule 10: "when they disagree,
 * it's a bug").
 *
 * Reads: none of its own beyond the studio's package table
 * (`useRenewalSettings`, `studios/{s}/config/renewals`), the one document the
 * profile and the directory read, so "left" says their number. The bookings,
 * the roster, the sessions, the Critical notes, the FORD details (Get to
 * know, wave 2 hub: `use-hub-ford.ts`, once per studio visit) and the
 * nightly marks (All stars, wave 2 hub: `use-hub-marks.ts`, one document per
 * studio visit) are the Hub's. No read per client, ever.
 *
 * Eager on purpose: ClientsView is in the first bundle and the grid needs it
 * on the first paint. Nothing here imports a stylesheet or a screen.
 *
 * WHAT IT WORKS OUT AGAIN, AND WHEN (speed round, Oct 5 2026, R6). It used to
 * work everything out again every minute, on every session write (a running
 * session's heartbeat included) and on every day tap, over every booking the
 * app held, so a Calendar month browsed made the Hub slower for the rest of
 * the visit. Now:
 *   - the bookings are the Hub's own window round today (ClientsView's
 *     `hubSchedules`), indexed once by day and by client (`indexBookings`);
 *   - the directory's rows (the costly part) are worked out once per studio
 *     day and when their data changes: the bookings, the roster, the
 *     FINISHED sessions (`useCompletedSessions`: a heartbeat changes nothing
 *     here), the package table. The engine reads only a row's coverage,
 *     Last in and Left, none of which moves with the clock, so the rows are
 *     worked out as of the start of the studio's day (their Next and In
 *     today are not read here);
 *   - the day's entries are worked out again only when the clock passes an
 *     instant that can change one (`bookingBoundaries`: a slot coming within
 *     half an hour, its start, its end, its end plus the slack), when the
 *     studio's day turns, or when the data or the day on screen changes.
 *     Between those, a minute tick works nothing out;
 *   - the strip's dots ask `celebratesOn`, not a whole day's entries each.
 */
import { useMemo, useRef } from "react";
import type { Client, ScheduleEntry, Trainer, WorkoutSession } from "../../types";
import type { JournalEntry } from "../../types/journal";
import type { FordEntry } from "../ford/types";
import type { AllStarMark } from "./all-stars";
import { loggedSessions, type BookingMarks, type LoggedSessions } from "../../lib/booking-state";
import { useCompletedSessions } from "../../lib/completed-sessions";
import { myTrainerIds } from "../../lib/live-session";
import { studioDayBoundsForKey, studioTodayKey } from "../../lib/studio-time";
import { useRenewalSettings } from "../renewals/useRenewalSettings";
import { buildPackageNameIndex } from "../renewals/settings";
import { buildDirectoryRows, newDirectoryRowCache, prepareDirectory, type DirectoryRowCache } from "../client-directory/row";
import { waiversKeptInMindbody } from "../../lib/client-waiver";
import {
  bookingBoundaries,
  celebratesOn,
  clockStep,
  indexBookings,
  momentsToday,
  type MomentsTodayInput,
  type RunSheetEntry,
} from "./moments-today";

export interface DayMomentsProps {
  /** The day on screen (the Hub's selected day), `yyyy-mm-dd`. */
  day: string;
  now: Date;
  /**
   * The bookings the engine works from: the Hub's own window round today
   * (ClientsView's `hubSchedules`), not everything the Calendar fetched.
   */
  schedules: ReadonlyArray<ScheduleEntry>;
  clients: ReadonlyArray<Client>;
  /** The studio's session stream; only its COMPLETED sessions are read. */
  sessions: ReadonlyArray<WorkoutSession>;
  sessionsKnown: boolean;
  /** The day's "didn't come" marks (`useBookingMarks().marks`); null when not read. */
  marks?: BookingMarks | null;
  studios?: ReadonlyArray<{ id?: string; name?: string; journeyCutoverDate?: string | null }>;
  activeStudioId: string | null;
  authTrainer: Trainer | null;
  uid?: string | null;
  trainers: ReadonlyArray<Trainer>;
  /** The Hub's one Critical read: her notes, or null when unread. */
  criticalFor: (clientId: string) => readonly JournalEntry[] | null;
  /** The Hub's one FORD read (`useHubFord().fordFor`): absent while Get to know isn't in play. */
  fordFor?: (clientId: string) => readonly FordEntry[] | null;
  /** The nightly marks (`useHubMarks().allStarOf`): absent when they may not be spoken. */
  allStarOf?: (clientId: string) => AllStarMark | null;
}

export interface DayMoments {
  /** Every client booked on the day, one entry each, soonest first. */
  entries: RunSheetEntry[];
  /** The same entries by client id, for a card to find its own. */
  byClientId: ReadonlyMap<string, RunSheetEntry>;
  /**
   * What the entries were worked out from, so a card can ask a question of
   * its own booking with the same answers (its session number: a client
   * booked twice in a day has two).
   */
  input: MomentsTodayInput;
  /** The Hub's sessions as `loggedSessions`, or null while they are unknown. */
  logged: LoggedSessions | null;
  /**
   * Would a day have something to celebrate (the strip's dot)? The engine's
   * own answer (`celebratesOn`), asked cheaply and remembered per day; one
   * function until the data or the engine's clock moves.
   */
  celebratesOn: (day: string) => boolean;
}

export function useDayMoments({
  day,
  now,
  schedules,
  clients,
  sessions,
  sessionsKnown,
  marks = null,
  studios,
  activeStudioId,
  authTrainer,
  uid,
  trainers,
  criticalFor,
  fordFor,
  allStarOf,
}: DayMomentsProps): DayMoments {
  const today = studioTodayKey(now);
  const myIds = useMemo(() => myTrainerIds(authTrainer, uid ?? null), [authTrainer, uid]);
  const myName = authTrainer?.fullName ?? null;
  const trainerNames = useMemo(() => new Map(trainers.map((t) => [t.id, t.nickname?.trim() || t.fullName])), [trainers]);
  const trainerNameOf = useMemo(() => (id: string) => trainerNames.get(id) ?? null, [trainerNames]);

  const renewalSettings = useRenewalSettings(activeStudioId);
  const packageIndex = useMemo(() => {
    if (renewalSettings.loading || renewalSettings.error || renewalSettings.forStudioId !== activeStudioId) return null;
    return buildPackageNameIndex(renewalSettings.settings);
  }, [renewalSettings.loading, renewalSettings.error, renewalSettings.forStudioId, renewalSettings.settings, activeStudioId]);

  // Only the finished sessions count here: a running session's heartbeat leaves this list as it was.
  const completed = useCompletedSessions(sessions);
  // Known or not, a finished session in hand counts; only "never logged" waits for the server (R16).
  const logged = useMemo(() => loggedSessions(completed, undefined, { complete: sessionsKnown }), [completed, sessionsKnown]);
  const clientsById = useMemo(() => new Map(clients.filter((c) => c.id).map((c) => [c.id as string, c])), [clients]);
  const keepsWaivers = useMemo(() => waiversKeptInMindbody(clients), [clients]);
  const index = useMemo(() => indexBookings(schedules), [schedules]);

  /* The directory's rows: once per studio day, and when their data changes. */
  // The context apart from the clients, so one client's write (useStudioRoster
  // keeps every other client the same object) rebuilds that client's row only
  // (row.ts DirectoryRowCache; the iPad round, Oct 2026).
  const rowCache = useRef<DirectoryRowCache>(newDirectoryRowCache());
  const rowsCtx = useMemo(
    () =>
      prepareDirectory({
        today,
        // The start of the studio's day: the engine reads no row fact that moves with the clock.
        now: studioDayBoundsForKey(today).start,
        studios: studios ?? [],
        activeStudioId,
        schedules,
        bookingsFresh: false,
        recentSessions: sessionsKnown ? completed : null,
        packageIndex,
        packageStudioId: activeStudioId,
        myIds,
        myName,
        trainerNameOf,
      }),
    [today, schedules, studios, activeStudioId, sessionsKnown, completed, packageIndex, myIds, myName, trainerNameOf],
  );
  const rowsById = useMemo(() => {
    const booked = clients.filter((c) => c.id && index.byClient.has(c.id));
    return new Map(buildDirectoryRows(booked, rowsCtx, rowCache.current).map((r) => [r.id, r]));
  }, [rowsCtx, index, clients]);

  /*
   * The engine's clock: the minute clock, moved on only when it passes an
   * instant that can change an entry, or the studio's day turns. The same
   * step gives the same answers, so nothing below is worked out again.
   */
  const boundaries = useMemo(() => bookingBoundaries(schedules), [schedules]);
  const step = clockStep(boundaries, now.getTime());
  const clockRef = useRef<{ step: number; today: string; boundaries: readonly number[]; now: Date } | null>(null);
  const held = clockRef.current;
  const engineNow = held && held.step === step && held.today === today && held.boundaries === boundaries ? held.now : now;
  clockRef.current = { step, today, boundaries, now: engineNow };

  const base = useMemo<Omit<MomentsTodayInput, "day">>(
    () => ({
      today,
      now: engineNow,
      schedules,
      index,
      clientsById,
      rowsById,
      studios: studios ?? [],
      logged,
      marks,
      criticalFor,
      fordFor,
      allStarOf,
      myIds,
      myName,
      trainerNameOf,
      // Mindbody's "not signed" flags a card only where the studio keeps its
      // waivers in Mindbody at all (hub fixes, Oct 1 2026; lib/client-waiver).
      waiversKeptInMindbody: keepsWaivers,
    }),
    [today, engineNow, schedules, index, clientsById, rowsById, studios, logged, marks, criticalFor, fordFor, allStarOf, myIds, myName, trainerNameOf, keepsWaivers],
  );

  /* The strip's dots: asked per day, remembered until the engine's input moves. */
  const celebrates = useMemo(() => {
    const asked = new Map<string, boolean>();
    return (key: string): boolean => {
      let yes = asked.get(key);
      if (yes === undefined) {
        yes = celebratesOn({ ...base, day: key }, key);
        asked.set(key, yes);
      }
      return yes;
    };
  }, [base]);

  return useMemo(() => {
    const input: MomentsTodayInput = { ...base, day };
    const entries = momentsToday(input);
    const byClientId = new Map<string, RunSheetEntry>();
    for (const e of entries) if (e.clientId) byClientId.set(e.clientId, e);
    return { entries, byClientId, input, logged, celebratesOn: celebrates };
  }, [base, day, logged, celebrates]);
}
