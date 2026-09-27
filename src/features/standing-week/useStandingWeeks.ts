import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { isCacheOnly, serverRead } from "./server-read";
import { standingWeekRef } from "./store";
import { useServerWait } from "./useServerWait";
import { normalizeDoc, type StandingWeekDoc } from "./week";

/**
 * The standing weeks, live (voice-review round, Sep 27 2026).
 *
 *   useStandingWeeks(studioId)      every trainer's week at the studio — My
 *                                   Studio → Team reads it
 *   useStandingWeek(studioId, uid)  one trainer's — My Profile, and a
 *                                   colleague's profile, read it
 *
 * One small collection per studio (a document per trainer), so no index and
 * no limit. A failed read is "unknown", never "no weeks": `error` is set and
 * the screen says so rather than showing everyone as having proposed nothing.
 *
 * THE FIRST ANSWER COMES FROM THE SERVER (voice review follow-up, Sep 27
 * 2026). Firestore keeps a persistent cache here, and a cache-only snapshot
 * is not an answer: offline with nothing cached it is an empty list, and Team
 * would say "{name} hasn't proposed a standing week here" and offer to set
 * one over the proposal it never saw. So the listener asks for metadata
 * changes (without them it is never told when the server merely confirms
 * what the cache held), stays `loading` until the server has answered once,
 * and says it can't tell (an `error` sentence) when this iPad is offline or
 * the server hasn't answered in SERVER_WAIT_MS. Once the server has answered,
 * the listener is in step with it and later snapshots are shown as they come:
 * a blip in the Wi-Fi does not take a leader's open review away. The week
 * check's bookings are held to the stricter rule (useWeekSchedule's
 * `confirmed`), because Mindbody changes them where this iPad can't see.
 */

export interface StandingWeeksState {
  docs: StandingWeekDoc[];
  loading: boolean;
  error: string | null;
}

export interface StandingWeekState {
  doc: StandingWeekDoc | null;
  loading: boolean;
  error: string | null;
}

export function readError(err: unknown): string {
  return (err as { code?: string })?.code === "permission-denied"
    ? "Standing weeks couldn't load — the new database rules may not be deployed yet."
    : "Couldn't load the standing weeks. Check the connection.";
}

/** Offline, or the server hasn't answered: can't tell, never "no weeks". */
export const OFFLINE_ERROR = "This iPad can't reach the database just now, so the standing weeks can't be read. They load again once it's back online.";

const NO_DOCS: StandingWeekDoc[] = [];

interface Held<T> {
  value: T;
  loading: boolean;
  error: string | null;
  /** The server hasn't answered this listener yet: what is held came from the cache. */
  fromCache: boolean;
}

/** What a screen may show of a held read: the server's answer, "reading", or "can't tell". */
function useAnswer<T>(held: Held<T>, empty: T): { value: T; loading: boolean; error: string | null } {
  const wait = useServerWait(held.loading || held.fromCache);
  const read = serverRead({ loading: held.loading, failed: held.error !== null, fromCache: held.fromCache, ...wait });
  if (read === "ready" || read === "failed") return { value: held.value, loading: false, error: held.error };
  if (read === "offline") return { value: empty, loading: false, error: OFFLINE_ERROR };
  return { value: empty, loading: true, error: null };
}

export function useStandingWeeks(studioId: string | null | undefined): StandingWeeksState {
  const [held, setHeld] = useState<Held<StandingWeekDoc[]>>({ value: NO_DOCS, loading: Boolean(studioId), error: null, fromCache: false });

  useEffect(() => {
    if (!studioId) {
      setHeld({ value: NO_DOCS, loading: false, error: null, fromCache: false });
      return;
    }
    setHeld({ value: NO_DOCS, loading: true, error: null, fromCache: false });
    let answered = false;
    return onSnapshot(
      collection(db, "studios", studioId, "standingWeeks"),
      { includeMetadataChanges: true },
      (snap) => {
        if (!isCacheOnly(snap)) answered = true;
        setHeld({
          value: snap.docs
            .map((d) => normalizeDoc(d.id, d.data({ serverTimestamps: "estimate" })))
            .sort((a, b) => a.trainerName.localeCompare(b.trainerName)),
          loading: false,
          error: null,
          fromCache: !answered,
        });
      },
      (err) => {
        console.warn("[standing-week] read failed:", err);
        setHeld({ value: NO_DOCS, loading: false, error: readError(err), fromCache: false });
      },
    );
  }, [studioId]);

  const { value, loading, error } = useAnswer(held, NO_DOCS);
  return { docs: value, loading, error };
}

export function useStandingWeek(studioId: string | null | undefined, trainerUid: string | null | undefined): StandingWeekState {
  const [held, setHeld] = useState<Held<StandingWeekDoc | null>>({ value: null, loading: Boolean(studioId && trainerUid), error: null, fromCache: false });

  useEffect(() => {
    if (!studioId || !trainerUid) {
      setHeld({ value: null, loading: false, error: null, fromCache: false });
      return;
    }
    setHeld({ value: null, loading: true, error: null, fromCache: false });
    let answered = false;
    return onSnapshot(
      standingWeekRef(studioId, trainerUid),
      { includeMetadataChanges: true },
      (snap) => {
        if (!isCacheOnly(snap)) answered = true;
        setHeld({
          value: snap.exists() ? normalizeDoc(snap.id, snap.data({ serverTimestamps: "estimate" })) : null,
          loading: false,
          error: null,
          fromCache: !answered,
        });
      },
      (err) => {
        console.warn("[standing-week] read failed:", err);
        setHeld({ value: null, loading: false, error: readError(err), fromCache: false });
      },
    );
  }, [studioId, trainerUid]);

  const { value, loading, error } = useAnswer(held, null);
  return { doc: value, loading, error };
}
