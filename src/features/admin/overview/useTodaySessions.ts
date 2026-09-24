/**
 * TODAY'S JOURNEY SESSIONS — what the Overview checks today's bookings against.
 *
 * AJ, Sep 24 2026: a booking is done when a Journey session was logged for
 * that client that day (`lib/booking-state`); Mindbody's own "Completed"
 * never reaches the booking. The page's 14-day read (`../sessions-range`) is
 * one-shot and anchored on the studio day, so a session finished at ten
 * would not reach the tiles until tomorrow. This one is live, like the
 * week's schedule it is checked against: the chase list shrinks the minute
 * a trainer presses End Session.
 *
 * One listener, one studio: `hostedAtStudioId` + `createdAt` from the start
 * of the studio day — the (hostedAtStudioId, createdAt desc) index the app's
 * own 24-hour stream already uses, so no new index. Capped: a busy studio
 * does forty sessions a day, and if the cap is ever reached the read counts
 * as incomplete, because a booking whose session fell off the end would
 * otherwise read as never logged.
 *
 * `logged` is null while loading, after a failure and when truncated —
 * unknown, never "nothing logged" (the house rule).
 */
import { useEffect, useMemo, useState } from "react";
import { collection, limit as fsLimit, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../../../firebase";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import { loggedSessions, type LoggedSessions } from "../../../lib/booking-state";
import { studioDayBoundsForKey } from "../../../lib/studio-time";
import type { WorkoutSession } from "../../../types";

export const TODAY_SESSIONS_CAP = 400;

export interface TodaySessions {
  /** The client-days logged today; null = not known (loading, failed or truncated). */
  logged: LoggedSessions | null;
  loading: boolean;
  /** The read failed, or reached the cap. */
  failed: boolean;
}

interface State {
  sessions: WorkoutSession[] | null;
  loading: boolean;
  failed: boolean;
}

export function useTodaySessions(studioId: string | null, today: string, tz?: string): TodaySessions {
  const [state, setState] = useState<State>({ sessions: null, loading: true, failed: false });

  useEffect(() => {
    setState({ sessions: null, loading: Boolean(studioId && today), failed: false });
    if (!studioId || !today) return;
    const from = studioDayBoundsForKey(today, tz).start;
    return onSnapshot(
      query(
        collection(db, "sessions"),
        where("hostedAtStudioId", "==", studioId),
        where("createdAt", ">=", Timestamp.fromDate(from)),
        orderBy("createdAt", "desc"),
        fsLimit(TODAY_SESSIONS_CAP),
      ),
      (snap) => {
        const truncated = snap.size >= TODAY_SESSIONS_CAP;
        setState({
          sessions: truncated ? null : snap.docs.map((d) => ({ ...(d.data() as WorkoutSession), id: d.id })),
          loading: false,
          failed: truncated,
        });
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, "sessions");
        setState({ sessions: null, loading: false, failed: true });
      },
    );
  }, [studioId, today, tz]);

  const logged = useMemo(() => loggedSessions(state.sessions, tz), [state.sessions, tz]);
  return { logged, loading: state.loading, failed: state.failed };
}
