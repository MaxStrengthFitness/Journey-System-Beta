import { useEffect, useState } from "react";
import { limit, onSnapshot, query, where } from "firebase/firestore";
import { studioDateKey } from "../../../lib/studio-time";
import { addDays } from "../../studio-tasks/recurrence";
import { jobFromDoc } from "./jobs";
import { teamJobsRef } from "./mutations";
import type { TeamJob } from "./types";

/**
 * A studio's team jobs: every open one, plus the ones closed recently.
 *
 * ONE LISTENER, on `status in [...]` — a single-field filter, covered by
 * Firestore's automatic index, so nothing to deploy. Closed jobs are capped:
 * a studio's history of finished jobs grows forever, and the lane only needs
 * the last few ("Priya finished the birthday cards") and the Team tab only
 * the last fortnight.
 *
 * A failed read is "unknown", never "no jobs": `error` is set and the lanes
 * say so.
 */
/** How far back finished jobs are read — the Team tab looks back two weeks. */
export const CLOSED_DAYS = 14;

export interface TeamJobsState {
  jobs: TeamJob[];
  loading: boolean;
  error: string | null;
}

export function useTeamJobs(studioId: string | null | undefined): TeamJobsState {
  const [open, setOpen] = useState<{ list: TeamJob[]; ready: boolean; error: string | null }>({
    list: [],
    ready: false,
    error: null,
  });
  const [closed, setClosed] = useState<{ list: TeamJob[]; ready: boolean }>({ list: [], ready: false });

  useEffect(() => {
    if (!studioId) {
      setOpen({ list: [], ready: true, error: null });
      setClosed({ list: [], ready: true });
      return;
    }
    setOpen((p) => ({ ...p, ready: false, error: null }));
    setClosed((p) => ({ ...p, ready: false }));
    const offOpen = onSnapshot(
      query(teamJobsRef(studioId), where("status", "==", "open"), limit(200)),
      (snap) =>
        setOpen({
          list: snap.docs.map((d) => jobFromDoc(d.id, studioId, d.data({ serverTimestamps: "estimate" }))),
          ready: true,
          error: null,
        }),
      (err) => {
        console.warn("[jobs] read failed:", err);
        setOpen({
          list: [],
          ready: true,
          error:
            (err as { code?: string })?.code === "permission-denied"
              ? "Team jobs couldn't load — the new database rules may not be deployed yet."
              : "Couldn't load team jobs. Check the connection.",
        });
      },
    );
    // Recently closed: a range on `closedOn` alone (the studio day it was
    // finished), which the automatic single-field index covers. A reopened
    // job has closedOn null and drops out of this read; the one above has it.
    const since = addDays(studioDateKey(new Date()) ?? "1970-01-01", -CLOSED_DAYS);
    const offClosed = onSnapshot(
      query(teamJobsRef(studioId), where("closedOn", ">=", since), limit(100)),
      (snap) =>
        setClosed({
          list: snap.docs
            .map((d) => jobFromDoc(d.id, studioId, d.data({ serverTimestamps: "estimate" })))
            .filter((j) => j.status === "done"),
          ready: true,
        }),
      (err) => {
        console.warn("[jobs] closed read failed:", err);
        setClosed({ list: [], ready: true });
      },
    );
    return () => {
      offOpen();
      offClosed();
    };
  }, [studioId]);

  return {
    jobs: [...open.list, ...closed.list],
    loading: !open.ready || !closed.ready,
    error: open.error,
  };
}
