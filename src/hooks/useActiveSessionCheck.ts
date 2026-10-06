import { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { WorkoutSession } from "../types";
import { splitInProgress } from "../lib/live-session";

/**
 * A client's In-Progress sessions, split by the one staleness rule
 * (lib/live-session.ts `splitInProgress`):
 *
 *   - `activeInProgressSession` is the live one — the header's "In
 *     progress" menu (Continue or Watch, and Discard).
 *   - `staleInProgressSession` is the newest abandoned one, shown only when
 *     nothing is live. Start is never withheld because of it; the header
 *     says it is there and offers Discard, and the Active Session asks
 *     before carrying on with it.
 *
 * This read `limit(1)` until Sep 24 2026, so an abandoned session could
 * stand in front of a live one and the header offered Start while a
 * session was running. A client has a handful of In-Progress sessions at
 * the very most; the limit below is a guard rail, not a page.
 */
export function useActiveSessionCheck(clientId: string | null) {
  const [activeInProgressSession, setActiveInProgressSession] =
    useState<WorkoutSession | null>(null);
  const [staleInProgressSession, setStaleInProgressSession] =
    useState<WorkoutSession | null>(null);
  const [isCheckingActiveSession, setIsCheckingActiveSession] = useState(false);
  /* Every In-Progress session's id, stamped with the client the listener
     answered for (speed round, Oct 5 2026): the profile reads a client's
     history again when one of these leaves — finished or discarded, here
     or on another iPad (features/client-profile/history-freshness.ts).
     `failed` says the listener stopped (refused, quota, network): what is
     open is then unknown, and the profile goes back to reading the page on
     every return to Journey rather than trusting a silence. */
  const [inProgressFor, setInProgressFor] = useState<{ clientId: string; ids: string[]; failed?: boolean } | null>(null);

  useEffect(() => {
    if (!clientId) {
      setActiveInProgressSession(null);
      setStaleInProgressSession(null);
      setInProgressFor(null);
      return;
    }

    setIsCheckingActiveSession(true);
    const q = query(
      collection(db, "sessions"),
      where("clientId", "==", clientId),
      where("status", "==", "In-Progress"),
      limit(20),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const sessions = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as WorkoutSession,
        );
        const { live, stale } = splitInProgress(sessions);
        setActiveInProgressSession(live);
        setStaleInProgressSession(live ? null : (stale[0] ?? null));
        setInProgressFor({ clientId, ids: sessions.map((x) => x.id!).filter(Boolean).sort() });
        setIsCheckingActiveSession(false);
      },
      (err) => {
        console.error("Error checking active session", err);
        setInProgressFor({ clientId, ids: [], failed: true });
        setIsCheckingActiveSession(false);
      },
    );

    return () => unsubscribe();
  }, [clientId]);

  return { activeInProgressSession, staleInProgressSession, isCheckingActiveSession, inProgressFor };
}
