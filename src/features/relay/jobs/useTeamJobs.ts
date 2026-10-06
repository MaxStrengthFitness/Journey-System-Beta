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
 * TWO LISTENERS, each on a single field (`status == open`, and a range on
 * `closedOn`). Production is Firestore Enterprise edition, which builds no
 * index by itself, so each has its own composite in firestore.indexes.json
 * ((status, closedOn) and (closedOn, status), R2, Oct 5 2026). Closed
 * jobs are capped: a studio's history of finished jobs grows
 * forever, and the lanes only need the last few ("Priya finished the
 * birthday cards").
 *
 * My Studio → Team counts only its own seven days from this (a job by the
 * day it was closed, a part by the day it was ticked — relay/team/
 * accountability.ts): the read reaching back further does not stretch what
 * Team's sentences say (voice review follow-up, Sep 27 2026).
 *
 * A failed read is "unknown", never "no jobs": `error` is set and the lanes
 * say so.
 */
/** How far back finished jobs are read, for the lanes' "recently finished". */
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
    // finished), served by the (closedOn, status) index. A reopened
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
