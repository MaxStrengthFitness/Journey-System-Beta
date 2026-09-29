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
 */
import { useMemo } from "react";
import type { Client, ScheduleEntry, Trainer, WorkoutSession } from "../../types";
import type { JournalEntry } from "../../types/journal";
import type { FordEntry } from "../ford/types";
import type { AllStarMark } from "./all-stars";
import { isStaffBlock, loggedSessions, type BookingMarks, type LoggedSessions } from "../../lib/booking-state";
import { myTrainerIds } from "../../lib/live-session";
import { studioTodayKey } from "../../lib/studio-time";
import { useRenewalSettings } from "../renewals/useRenewalSettings";
import { buildPackageNameIndex } from "../renewals/settings";
import { buildDirectoryRows, prepareDirectory } from "../client-directory/row";
import { momentsToday, type MomentsTodayInput, type RunSheetEntry } from "./moments-today";

export interface DayMomentsProps {
  /** The day on screen (the Hub's selected day), `yyyy-mm-dd`. */
  day: string;
  now: Date;
  schedules: ReadonlyArray<ScheduleEntry>;
  clients: ReadonlyArray<Client>;
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
  const trainerNames = useMemo(() => new Map(trainers.map((t) => [t.id, t.nickname?.trim() || t.fullName])), [trainers]);

  const renewalSettings = useRenewalSettings(activeStudioId);
  const packageIndex = useMemo(() => {
    if (renewalSettings.loading || renewalSettings.error || renewalSettings.forStudioId !== activeStudioId) return null;
    return buildPackageNameIndex(renewalSettings.settings);
  }, [renewalSettings.loading, renewalSettings.error, renewalSettings.forStudioId, renewalSettings.settings, activeStudioId]);

  const logged = useMemo(() => loggedSessions(sessionsKnown ? sessions : null), [sessions, sessionsKnown]);
  const clientsById = useMemo(() => new Map(clients.filter((c) => c.id).map((c) => [c.id as string, c])), [clients]);

  return useMemo(() => {
    const bookedIds = new Set(schedules.filter((b) => !isStaffBlock(b)).map((b) => b.clientId).filter(Boolean) as string[]);
    const booked = clients.filter((c) => c.id && bookedIds.has(c.id));
    const trainerNameOf = (id: string) => trainerNames.get(id) ?? null;
    const ctx = prepareDirectory({
      today,
      now,
      studios: studios ?? [],
      activeStudioId,
      schedules,
      bookingsFresh: false,
      recentSessions: sessionsKnown ? sessions : null,
      packageIndex,
      packageStudioId: activeStudioId,
      myIds,
      myName: authTrainer?.fullName ?? null,
      trainerNameOf,
    });
    const rows = buildDirectoryRows(booked, ctx);
    const input: MomentsTodayInput = {
      day,
      today,
      now,
      schedules,
      clientsById,
      rowsById: new Map(rows.map((r) => [r.id, r])),
      studios: studios ?? [],
      logged,
      marks,
      criticalFor,
      fordFor,
      allStarOf,
      myIds,
      myName: authTrainer?.fullName ?? null,
      trainerNameOf,
    };
    const entries = momentsToday(input);
    const byClientId = new Map<string, RunSheetEntry>();
    for (const e of entries) if (e.clientId) byClientId.set(e.clientId, e);
    return { entries, byClientId, input, logged };
  }, [day, today, now, schedules, clients, clientsById, studios, activeStudioId, sessionsKnown, sessions, packageIndex, myIds, authTrainer?.fullName, trainerNames, logged, marks, criticalFor, fordFor, allStarOf]);
}
