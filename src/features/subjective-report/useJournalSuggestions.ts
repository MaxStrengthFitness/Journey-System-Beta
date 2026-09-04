/**
 * Pulls the journal entries a pain point is likely to be about: `incident`
 * entries (something went wrong in the room) and `life / Injury` entries,
 * written pre-, mid- or post-session. The pain map offers them as one-tap
 * links so the 90-day check-in and the session notes point at the same
 * event instead of describing it twice.
 *
 * Same clientId + occurredAt query the Journal tab uses, so no new index.
 */
import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import type { JournalEntry } from "../../types/journal";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";

export interface JournalSuggestion {
  id: string;
  /** "Incident" | "Injury" */
  kindLabel: string;
  body: string;
  /** ISO yyyy-mm-dd */
  date: string;
  machineId: string | null;
  isOpen: boolean;
}

const toIso = (v: any): string => {
  try {
    const d = v?.toDate ? v.toDate() : new Date(v);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
  } catch {
    return "";
  }
};

export function useJournalSuggestions(clientId: string | undefined) {
  const [suggestions, setSuggestions] = useState<JournalSuggestion[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!clientId) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "journalEntries"),
            where("clientId", "==", clientId),
            orderBy("occurredAt", "desc"),
            limit(150),
          ),
        );
        if (cancelled) return;
        const rows: JournalSuggestion[] = [];
        for (const d of snap.docs) {
          const e = { id: d.id, ...(d.data() as JournalEntry) };
          if (e.isArchived) continue;
          const isIncident = e.kind === "incident";
          const isInjury = e.kind === "life" && e.category === "Injury";
          if (!isIncident && !isInjury) continue;
          rows.push({
            id: e.id,
            kindLabel: isIncident ? "Incident" : "Injury",
            body: e.body || "",
            date: toIso(e.occurredAt),
            machineId: e.machineId ?? null,
            isOpen: !e.resolvedAt,
          });
        }
        setSuggestions(rows);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, "journalEntries");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return suggestions;
}
