import { useEffect, useState } from "react";
import type { WorkoutSession } from "../../types";
import { fetchSessionsInRange } from "../admin/sessions-range";
import { yourWeekQueryStart } from "./your-week";

/**
 * YOUR WEEK'S ONE READ (Openings round, phase 11, Sep 27 2026).
 *
 * The read Operations → Insights → Hours makes — the studio's sessions by
 * `createdAt`, on the existing (hostedAtStudioId, createdAt) index — from the
 * day before last Monday, answered by the SERVER, then filtered to the
 * trainer in memory. No new index, no listener, one read per open.
 *
 * Why the studio and not `trainerId ==`: naming the studio is what lets the
 * rules allow the read (`trainerWorksAt`). A query on `trainerId` alone is
 * allowed only when the sessions carry the reader's sign-in uid, which older
 * accounts' sessions don't (the rules test "Your week's read" holds this).
 *
 * States: "loading" until the server answers; "failed" for a refusal, a
 * failure, or no connection (a read only this iPad's cache could answer is
 * not an answer); "truncated" when the read's cap was reached, because a
 * number worked out from part of the fortnight would be wrong; "ready".
 */
export type YourWeekRead = "loading" | "ready" | "failed" | "truncated";

export interface YourWeekState {
  status: YourWeekRead;
  /** The trainer's own sessions from the read; empty unless ready. */
  sessions: WorkoutSession[];
}

export function useYourWeek(input: { studioId: string | null; trainerId: string | null; today: string; tz?: string }): YourWeekState {
  const { studioId, trainerId, today, tz } = input;
  const startMs = yourWeekQueryStart(today, tz);
  const [state, setState] = useState<YourWeekState>({ status: "loading", sessions: [] });

  useEffect(() => {
    if (!studioId || !trainerId) {
      setState({ status: "failed", sessions: [] });
      return;
    }
    let cancelled = false;
    setState({ status: "loading", sessions: [] });
    void (async () => {
      try {
        const result = await fetchSessionsInRange({ studioId, startMs, fromServer: true });
        if (cancelled) return;
        if (result.truncated) {
          setState({ status: "truncated", sessions: [] });
          return;
        }
        setState({ status: "ready", sessions: result.sessions.filter((s) => s.trainerId === trainerId) });
      } catch (err) {
        // Quietly: an offline iPad is not an error worth a toast, and the card
        // says it can't read.
        console.warn("[your-week] the sessions read failed:", err);
        if (!cancelled) setState({ status: "failed", sessions: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studioId, trainerId, startMs]);

  return state;
}
