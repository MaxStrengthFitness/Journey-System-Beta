/**
 * THE OVERVIEW'S OWN READS — four one-shot reads per open, one studio.
 *
 *   incidents    clinicalIncidents for the studio (the pain panel)
 *   critical     the studio's critical notes (journalEntries; the index
 *                studioId + importance + occurredAt from the Operations round)
 *   dated        notes with a window that has not ended yet, and the
 *                studio's yearly notes (two small queries, one new index:
 *                studioId + effectiveUntil; two equalities need none) — the Moments
 *                panel's birthdays and anniversaries
 *   watch        studios/{s}/watch/performance, the Sunday job's list
 *
 * Every read that fails says so: null means "could not be read", never
 * "nothing there" (the house rule). Re-run when the studio changes.
 */
import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, limit as fsLimit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../../../firebase";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import { studioDayBoundsForKey } from "../../../lib/studio-time";
import type { ClinicalIncident } from "../../../types";
import type { JournalEntry } from "../../../types/journal";
import type { PerformanceWatchDocument } from "./performance";

const INCIDENT_LIMIT = 100;
const CRITICAL_LIMIT = 100;
const DATED_LIMIT = 200;

export interface OverviewReads {
  incidents: ClinicalIncident[] | null;
  critical: JournalEntry[] | null;
  dated: JournalEntry[] | null;
  /** undefined = loading, null = the job has never written one, else the document. */
  watch: PerformanceWatchDocument | null | undefined;
  loading: boolean;
  failed: { incidents: boolean; critical: boolean; dated: boolean; watch: boolean };
}

const EMPTY: OverviewReads = { incidents: null, critical: null, dated: null, watch: undefined, loading: true, failed: { incidents: false, critical: false, dated: false, watch: false } };

export function useOverviewReads(studioId: string | null, today: string, tz?: string): OverviewReads {
  const [state, setState] = useState<OverviewReads>(EMPTY);
  useEffect(() => {
    let cancelled = false;
    setState(EMPTY);
    if (!studioId || !today) return;
    void (async () => {
      const entriesOf = (snap: { docs: Array<{ id: string; data: () => unknown }> }) => snap.docs.map((d) => ({ ...(d.data() as JournalEntry), id: d.id }));
      const [inc, crit, dated, watch] = await Promise.all([
        getDocs(query(collection(db, "clinicalIncidents"), where("studioId", "==", studioId), fsLimit(INCIDENT_LIMIT)))
          .then((snap) => snap.docs.map((d) => ({ ...(d.data() as ClinicalIncident), id: d.id })))
          .catch((err) => {
            handleFirestoreError(err, OperationType.GET, "clinicalIncidents");
            return null;
          }),
        getDocs(query(collection(db, "journalEntries"), where("studioId", "==", studioId), where("importance", "==", "critical"), orderBy("occurredAt", "desc"), fsLimit(CRITICAL_LIMIT)))
          .then(entriesOf)
          .catch((err) => {
            handleFirestoreError(err, OperationType.GET, "journalEntries");
            return null;
          }),
        Promise.all([
          getDocs(query(collection(db, "journalEntries"), where("studioId", "==", studioId), where("effectiveUntil", ">=", Timestamp.fromDate(studioDayBoundsForKey(today, tz).start)), fsLimit(DATED_LIMIT))).then(entriesOf),
          getDocs(query(collection(db, "journalEntries"), where("studioId", "==", studioId), where("repeat", "==", "yearly"), fsLimit(DATED_LIMIT))).then(entriesOf),
        ])
          .then(([ending, yearly]) => {
            const byId = new Map<string, JournalEntry>();
            for (const e of [...ending, ...yearly]) byId.set(e.id, e);
            return [...byId.values()];
          })
          .catch((err) => {
            handleFirestoreError(err, OperationType.GET, "journalEntries");
            return null;
          }),
        getDoc(doc(db, "studios", studioId, "watch", "performance"))
          .then((snap) => (snap.exists() ? (snap.data() as PerformanceWatchDocument) : null))
          .catch((err) => {
            handleFirestoreError(err, OperationType.GET, "watch");
            return "failed" as const;
          }),
      ]);
      if (cancelled) return;
      setState({
        incidents: inc,
        critical: crit,
        dated,
        watch: watch === "failed" ? undefined : watch,
        loading: false,
        failed: { incidents: inc === null, critical: crit === null, dated: dated === null, watch: watch === "failed" },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [studioId, today, tz]);
  return state;
}
