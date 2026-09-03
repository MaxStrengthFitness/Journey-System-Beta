import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";

/**
 * The audit trail for one machine and one client.
 *
 * This subscription is affordable precisely BECAUSE of the dual pane: only the
 * selected machine is ever queried, so a twenty-machine roster costs one
 * listener instead of twenty. In the old card grid this could not have existed.
 */

interface HistoryEntry {
  id: string;
  timestamp?: string;
  trainerName?: string;
  changeType?: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
}

const LABELS: Record<string, string> = {
  INITIAL_SETUP: "Initial setup",
  SETTINGS: "Settings",
  WEIGHT: "Weights",
  MASS_APPLY: "Mass-applied standards",
};

export function ChangeHistory({
  machineId,
  clientId,
}: {
  machineId: string;
  clientId: string;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setEntries([]);
    const q = query(
      collection(db, "machines", machineId, "settingHistory"),
      where("clientId", "==", clientId),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as HistoryEntry);
        // Sorted here rather than in the query: an orderBy silently drops docs
        // missing the field, and early history rows predate `timestamp`.
        rows.sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
        setEntries(rows.slice(0, 12));
      },
      (error) => handleFirestoreError(error, OperationType.GET, "machine setting history"),
    );
    return () => unsub();
  }, [machineId, clientId]);

  if (entries.length === 0) return null;

  return (
    <section className="eq-card">
      <header className="eq-card__head">
        <h3 className="eq-card__title">Change history</h3>
      </header>
      <div className="eq-card__body">
        <div className="eq-hist">
          {entries.map((e) => {
            const when = e.timestamp ? new Date(e.timestamp) : null;
            return (
              <div className="eq-hist__row" key={e.id}>
                <span className="eq-hist__when">
                  {when && !Number.isNaN(when.getTime())
                    ? when.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                    : "—"}
                </span>
                <span className="eq-hist__what">
                  <b>{LABELS[e.changeType || ""] || e.changeType || "Change"}</b>
                  {e.newValue ? ` → ${e.newValue}` : ""}
                  {e.reason && <em className="eq-hist__why">{e.reason}</em>}
                </span>
                <span className="eq-hist__who">{e.trainerName}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
