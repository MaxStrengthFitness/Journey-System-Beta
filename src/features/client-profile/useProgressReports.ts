/**
 * THE PROFILE'S PROGRESS REPORTS — one listener, and whether it answered.
 *
 * Moved out of ClientProfileView (client codex, Sep 2026) so the wiring that
 * says "read" or "failed" has a test: nothing mounts ClientProfileView, and a
 * dropped `failed` stamp would have left the codex's Pulse history "loading"
 * forever with the suite still green.
 *
 * The same query as before — this client's reports, newest first, 50 — and
 * the same gate: it runs only while a screen that shows them is open (the
 * Activity Archive, or Notes & Profile, which keeps its panel mounted after
 * the first visit and so keeps this open with it). Its readers:
 *   - the report banner above the header (the newest one);
 *   - the Activity Archive's shelf;
 *   - the codex, which derives the Pulse history from this page of reports
 *     rather than reading them again (`pulseFromReports`).
 *
 * The list is NOT cleared on a client change — the listener is simply
 * re-made — so the status is stamped with the client it answered for and
 * read through `answerFor` (client-answer.ts): the last client's "ready"
 * never stands for this one, and a reader filters the list by clientId.
 * Out of quota, the listener never opens, so the status is `failed` rather
 * than waiting forever.
 */
import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import type { ProgressReport } from "../../types";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import {
  progressReportsStatusOf,
  type ClientAnswer,
  type ProgressReportsStatus,
} from "./client-answer";

/** How many reports the profile holds: the newest 50. */
export const PROFILE_REPORTS_LIMIT = 50;

export interface ProfileProgressReports {
  /** Newest first. May still hold the LAST client's reports until this one's arrive. */
  reports: ProgressReport[];
  status: ProgressReportsStatus;
}

export function useProgressReports({
  clientId,
  enabled,
  quotaBlocked = false,
  uid,
}: {
  clientId: string | null | undefined;
  /** A screen that shows the reports is open. */
  enabled: boolean;
  /** The app is out of Firestore quota: nothing is opened. */
  quotaBlocked?: boolean;
  /** The signed-in user; nothing is read before there is one. */
  uid: string | null | undefined;
}): ProfileProgressReports {
  const [reports, setReports] = useState<ProgressReport[]>([]);
  const [read, setRead] = useState<ClientAnswer<"ready" | "failed"> | null>(null);

  useEffect(() => {
    if (!clientId || quotaBlocked || !uid || !enabled) return;
    const q = query(
      collection(db, "progressReports"),
      where("clientId", "==", clientId),
      orderBy("createdAt", "desc"),
      limit(PROFILE_REPORTS_LIMIT),
    );
    return onSnapshot(
      q,
      (snap) => {
        setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ProgressReport));
        setRead({ clientId, value: "ready" });
      },
      (error: unknown) => {
        // Said before the handler, which throws outside a browser.
        setRead({ clientId, value: "failed" });
        handleFirestoreError(error, OperationType.GET, "progressReports");
      },
    );
    // quotaBlocked is read, not a dependency: a listener already open keeps
    // running when the flag goes up later (as it always has here).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, enabled, uid]);

  return { reports, status: progressReportsStatusOf(read, clientId, { quotaBlocked }) };
}
