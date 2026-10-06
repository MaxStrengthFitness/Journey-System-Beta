/**
 * THE DIRECTORY'S CONTEXT, ONCE (hub fixes, Oct 1 2026).
 *
 * What every row is worked out against (row.ts `prepareDirectory`): the held
 * bookings and how fresh they are, the last day's sessions, the studio's
 * package table (the profile's own one-document read), who "you" are and
 * the trainers' names. The Client Directory and the Hub's search both build
 * it here, so a client's Last in · Next · Left read the same on both — the
 * Hub's search used to draw cards of its own that said "Previous session: No
 * history" for a client with 54 sessions.
 *
 * No read of its own beyond `useRenewalSettings` (one document).
 */
import { useMemo } from "react";
import type { KaizenRosterEntry, ScheduleEntry, Trainer, WorkoutSession } from "../../types";
import { formatStudioDate, formatStudioTime, studioDateKey } from "../../lib/studio-time";
import { SCHEDULE_STALE_MS } from "../../lib/schedule-window";
import { useRenewalSettings } from "../renewals/useRenewalSettings";
import { buildPackageNameIndex } from "../renewals/settings";
import { prepareDirectory, type DirectoryContext } from "./row";
import { bookingBoundaries } from "../../lib/booking-state";

/** How long the held bookings may go unread before "Nothing booked" is no longer said. */
export const BOOKINGS_FRESH_MS = 2 * SCHEDULE_STALE_MS;

/**
 * The instants at which the rows say something different about the time
 * (lib/boundary-clock.ts): the held bookings' own (booking-state.ts
 * bookingBoundaries: Next moves on, "Coming up" becomes "Earlier today", a
 * row's time is over) and the moment the held bookings turn stale ("Nothing
 * booked" is no longer said). The studio's day turning is the clock's own.
 */
export function directoryBoundaries(schedules: ReadonlyArray<ScheduleEntry> | null, schedulesFetchedAt: number | null): number[] {
  const out = bookingBoundaries(schedules);
  // Fresh while now - fetchedAt <= BOOKINGS_FRESH_MS: stale from the next millisecond.
  if (schedulesFetchedAt !== null) out.push(schedulesFetchedAt + BOOKINGS_FRESH_MS + 1);
  return out;
}

export interface DirectoryContextInput {
  now: Date;
  /** The studio's day, yyyy-mm-dd. */
  today: string;
  studios: ReadonlyArray<{ id?: string; name?: string; journeyCutoverDate?: string | null }>;
  activeStudioId: string | null;
  schedules: ReadonlyArray<ScheduleEntry> | null;
  /** When the held bookings were last read (useLiveSchedule's lastFetchedAt), epoch ms. */
  schedulesFetchedAt: number | null;
  sessions: ReadonlyArray<WorkoutSession> | null;
  sessionsKnown: boolean;
  kaizen?: ReadonlyArray<KaizenRosterEntry>;
  myIds: ReadonlyArray<string>;
  myName: string | null;
  trainers: ReadonlyArray<Trainer>;
}

export function useDirectoryContext(input: DirectoryContextInput): {
  ctx: DirectoryContext;
  bookingsFresh: boolean;
  bookingsAsOf: string | null;
} {
  const { now, today, studios, activeStudioId, schedules, schedulesFetchedAt, sessions, sessionsKnown, kaizen, myIds, myName, trainers } = input;
  const trainerNames = useMemo(() => new Map(trainers.map((t) => [t.id, t.nickname?.trim() || t.fullName])), [trainers]);

  /* ---- the studio's package table: the profile's own read ---- */
  const renewalSettings = useRenewalSettings(activeStudioId);
  const packageIndex = useMemo(() => {
    if (renewalSettings.loading || renewalSettings.error || renewalSettings.forStudioId !== activeStudioId) return null;
    return buildPackageNameIndex(renewalSettings.settings);
  }, [renewalSettings.loading, renewalSettings.error, renewalSettings.forStudioId, renewalSettings.settings, activeStudioId]);

  /* ---- freshness ---- */
  const bookingsFresh = schedulesFetchedAt !== null && now.getTime() - schedulesFetchedAt <= BOOKINGS_FRESH_MS;
  const bookingsAsOf =
    schedulesFetchedAt === null
      ? null
      : studioDateKey(new Date(schedulesFetchedAt)) === today
        ? formatStudioTime(new Date(schedulesFetchedAt))
        : `${formatStudioDate(new Date(schedulesFetchedAt), { weekday: "short" })} ${formatStudioTime(new Date(schedulesFetchedAt))}`;

  const ctx = useMemo(
    () =>
      prepareDirectory({
        today,
        now,
        studios,
        activeStudioId,
        schedules: schedules ?? null,
        bookingsFresh,
        bookingsAsOf,
        recentSessions: sessionsKnown ? sessions : null,
        packageIndex,
        packageStudioId: activeStudioId,
        kaizen,
        myIds,
        myName,
        trainerNameOf: (id) => trainerNames.get(id) ?? null,
      }),
    [today, now, studios, activeStudioId, schedules, bookingsFresh, bookingsAsOf, sessionsKnown, sessions, packageIndex, kaizen, myIds, myName, trainerNames],
  );
  return { ctx, bookingsFresh, bookingsAsOf };
}
