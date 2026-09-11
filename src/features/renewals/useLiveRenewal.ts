/**
 * One client's renewal, worked out now, in the browser.
 *
 * The nightly job writes every client's snapshot (clients/{id}.renewal) so
 * lists cost nothing. A single-client screen — the Renewal card, the Brief —
 * can do better: right after a leader presses Sync on the Mindbody card, the
 * stored snapshot is up to a day old. This runs the SAME engine on the same
 * inputs, for one client, with three small reads:
 *
 *   - the client's bookings from 90 days back to 30 ahead,
 *   - their workouts from the last 90 days,
 *   - the first booking ever synced for their studio (before it, attendance
 *     is unknown, not zero).
 *
 * It replaces the proposal's "recompute" endpoint: that would have needed the
 * database's admin key on the public web service, which render.yaml keeps off
 * it on purpose. Nothing is written here — the nightly job stays the only
 * writer of the stored snapshot.
 */

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { Client, ScheduleEntry, WorkoutSession } from "../../types";
import { getActiveTimeZone, studioTodayKey } from "../../lib/studio-time";
import { buildRenewalSnapshot } from "./engine";
import {
  attendanceFromSchedules,
  attendanceFromSessions,
  attendanceSinceOf,
  feelFromSessions,
} from "./attendance";
import { useRenewalSettings } from "./useRenewalSettings";
import type { RenewalSettings, RenewalSnapshot } from "./types";

const DAY_MS = 86_400_000;

interface Inputs {
  schedules: ScheduleEntry[];
  sessions: WorkoutSession[];
  earliestBooking: unknown;
}

export interface LiveRenewalState {
  /** Worked out just now; null until the reads finish. */
  live: RenewalSnapshot | null;
  /** What the nightly job last stored. */
  stored: RenewalSnapshot | null;
  /** The best available: live when ready, else stored. */
  snapshot: RenewalSnapshot | null;
  settings: RenewalSettings;
  loading: boolean;
  error: string | null;
}

export function useLiveRenewal(
  client: Client | null | undefined,
  options: { enabled?: boolean; machineNames?: Record<string, string> } = {},
): LiveRenewalState {
  const enabled = options.enabled !== false;
  // Only listens while the screen that needs it is open.
  const { settings, loading: settingsLoading } = useRenewalSettings(
    enabled ? client?.homeStudioId ?? null : null,
  );
  const [inputs, setInputs] = useState<Inputs | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientId = client?.id ?? null;
  const studioId = client?.homeStudioId ?? null;
  // Re-read after a Mindbody sync lands on the document.
  const syncMark = String(
    (client?.mindbodyServicesSyncedAt as any)?.seconds ?? client?.mindbodyServicesSyncedAt ?? "",
  );

  useEffect(() => {
    if (!enabled || !clientId || !studioId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const now = Date.now();
    const since = new Date(now - 91 * DAY_MS).toISOString().slice(0, 10);
    Promise.all([
      getDocs(
        query(
          collection(db, "schedules"),
          where("clientId", "==", clientId),
          where("startTime", ">=", Timestamp.fromMillis(now - 91 * DAY_MS)),
          where("startTime", "<=", Timestamp.fromMillis(now + 31 * DAY_MS)),
          orderBy("startTime", "asc"),
        ),
      ),
      getDocs(
        query(
          collection(db, "sessions"),
          where("clientId", "==", clientId),
          where("date", ">=", since),
          orderBy("date", "desc"),
        ),
      ),
      getDocs(
        query(
          collection(db, "schedules"),
          where("studioId", "==", studioId),
          orderBy("startTime", "asc"),
          limit(1),
        ),
      ),
    ])
      .then(([schedules, sessions, earliest]) => {
        if (cancelled) return;
        setInputs({
          schedules: schedules.docs.map((d) => d.data() as ScheduleEntry),
          sessions: sessions.docs.map((d) => d.data() as WorkoutSession),
          earliestBooking: earliest.empty ? null : earliest.docs[0].get("startTime"),
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[renewals] live read failed:", err);
        // A failed read is unknown, never empty: keep showing the stored one.
        setError("Couldn't refresh the renewal just now — showing last night's.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, clientId, studioId, syncMark]);

  const live = useMemo(() => {
    // Wait for the studio's own thresholds: a snapshot worked out against the
    // defaults for a moment would flash the wrong answer.
    if (!client || !inputs || settingsLoading) return null;
    const tz = getActiveTimeZone();
    const now = new Date();
    const today = studioTodayKey(now, tz);
    return buildRenewalSnapshot({
      client,
      settings,
      today,
      attendance: [
        ...attendanceFromSchedules(inputs.schedules, now, tz),
        ...attendanceFromSessions(inputs.sessions, tz, today),
      ],
      sessionFeel: feelFromSessions(inputs.sessions, tz),
      machineNames: options.machineNames,
      attendanceSince: attendanceSinceOf(inputs.earliestBooking, tz),
    });
  }, [client, inputs, settings, settingsLoading, options.machineNames]);

  const stored = client?.renewal ?? null;
  return {
    live,
    stored,
    snapshot: live ?? stored,
    settings,
    loading: loading || (enabled && settingsLoading),
    error,
  };
}
