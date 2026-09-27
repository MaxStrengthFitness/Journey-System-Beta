import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { standingWeekRef } from "./store";
import { normalizeDoc, type StandingWeekDoc } from "./week";

/**
 * The standing weeks, live (voice-review round, Sep 27 2026).
 *
 *   useStandingWeeks(studioId)      every trainer's week at the studio — My
 *                                   Studio → Team reads it
 *   useStandingWeek(studioId, uid)  one trainer's — My Profile reads it
 *
 * One small collection per studio (a document per trainer), so no index and
 * no limit. A failed read is "unknown", never "no weeks": `error` is set and
 * the screen says so rather than showing everyone as having proposed nothing.
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

export function useStandingWeeks(studioId: string | null | undefined): StandingWeeksState {
  const [state, setState] = useState<StandingWeeksState>({ docs: [], loading: Boolean(studioId), error: null });

  useEffect(() => {
    if (!studioId) {
      setState({ docs: [], loading: false, error: null });
      return;
    }
    setState({ docs: [], loading: true, error: null });
    return onSnapshot(
      collection(db, "studios", studioId, "standingWeeks"),
      (snap) =>
        setState({
          docs: snap.docs
            .map((d) => normalizeDoc(d.id, d.data({ serverTimestamps: "estimate" })))
            .sort((a, b) => a.trainerName.localeCompare(b.trainerName)),
          loading: false,
          error: null,
        }),
      (err) => {
        console.warn("[standing-week] read failed:", err);
        setState({ docs: [], loading: false, error: readError(err) });
      },
    );
  }, [studioId]);

  return state;
}

export function useStandingWeek(studioId: string | null | undefined, trainerUid: string | null | undefined): StandingWeekState {
  const [state, setState] = useState<StandingWeekState>({ doc: null, loading: Boolean(studioId && trainerUid), error: null });

  useEffect(() => {
    if (!studioId || !trainerUid) {
      setState({ doc: null, loading: false, error: null });
      return;
    }
    setState({ doc: null, loading: true, error: null });
    return onSnapshot(
      standingWeekRef(studioId, trainerUid),
      (snap) =>
        setState({
          doc: snap.exists() ? normalizeDoc(snap.id, snap.data({ serverTimestamps: "estimate" })) : null,
          loading: false,
          error: null,
        }),
      (err) => {
        console.warn("[standing-week] read failed:", err);
        setState({ doc: null, loading: false, error: readError(err) });
      },
    );
  }, [studioId, trainerUid]);

  return state;
}
