/**
 * Pulls the journal entries a pain point is likely to be about: `incident`
 * entries (something went wrong in the room) and injury notes — Health notes
 * about an injury or a surgery, and the older `life / Injury` ones —
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
import { studioDayKeyOf } from "../../lib/studio-time";

export interface JournalSuggestion {
  id: string;
  /** "Incident" | "Injury" | "Surgery" */
  kindLabel: string;
  body: string;
  /** ISO yyyy-mm-dd */
  date: string;
  machineId: string | null;
  isOpen: boolean;
}

// The Eastern day the entry happened on. A UTC day put an evening incident
// on the next day's session (Sep 2026).
const toIso = (v: any): string => {
  try {
    return studioDayKeyOf(v) ?? "";
  } catch {
    return "";
  }
};

/**
 * What a pain point may link to, and the word for it — or null. Until Oct 3
 * 2026 this asked only for `life / Injury`, so every injury note written
 * since the notes catalog (`kind: "injury"`) never appeared here. A Health
 * note about a medication, a diagnosis or care outside the studio is not a
 * pain; an update hangs off its thread's root, which is the one linked.
 */
export function painLinkLabel(e: Pick<JournalEntry, "kind" | "category" | "isArchived"> & { threadId?: string | null }): string | null {
  if (e.isArchived || e.threadId) return null;
  if (e.kind === "incident") return "Incident";
  if (e.kind === "injury") {
    if (e.category === "Surgery") return "Surgery";
    if (!e.category || e.category === "Injury") return "Injury";
    return null;
  }
  if (e.kind === "life" && (e.category === "Injury" || e.category === "Surgery")) return e.category;
  return null;
}

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
          const kindLabel = painLinkLabel(e);
          if (!kindLabel) continue;
          rows.push({
            id: e.id,
            kindLabel,
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
