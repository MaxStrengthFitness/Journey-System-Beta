import { changeSentence, changeWhen, type ChangesRead } from "../machine-codex/change-log";
import { useMachineChanges } from "../machine-codex/change-log-store";

/**
 * WHAT CHANGED on a standard machine (catalog wave 3, Sep 29 2026; the
 * Codex's question 1). On a catalog machine's page, for anyone signed in:
 * each save of the standard as one sentence — who, what fields, when —
 * newest first, from `machines/{id}/changes` (features/machine-codex/
 * change-log.ts is the record, its store the read).
 *
 * Three answers, never two: a log that couldn't be read says so; a log with
 * nothing in it says the record began on Sep 29 2026 (the machine's earlier
 * corrections were made before it was kept) rather than "never changed";
 * a log with entries lists them. Values are never here — they are on the
 * page above — so this never contradicts it.
 */
export function MachineChangeLog({ read, tz }: { read: ChangesRead; tz?: string }) {
  if (read.state === "loading") {
    return <p className="mcat-changes__empty">Reading what changed…</p>;
  }
  if (read.state === "unreadable") {
    return <p className="mcat-changes__empty">The change log couldn't be read just now.</p>;
  }
  if (read.changes.length === 0) {
    return <p className="mcat-changes__empty">No changes recorded. The log began on Sep 29, 2026; earlier corrections aren't in it.</p>;
  }
  return (
    <ol className="mcat-changes" aria-label="What changed">
      {read.changes.map((c) => {
        const when = changeWhen(c, tz);
        return (
          <li key={c.id} className="mcat-changes__item">
            <span className="mcat-changes__what">{changeSentence(c)}</span>
            <span className="mcat-changes__when">{when ?? "Just now, still sending"}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The same, reading for itself: once per catalog machine, and only while
 * the fold it sits in is open (`active`), like the trends panel. Closed
 * means nothing is read for a trainer who did not ask.
 */
export function MachineChangeLogRead({ catalogId, active, tz }: { catalogId: string; active: boolean; tz?: string }) {
  const read = useMachineChanges(catalogId, active);
  return <MachineChangeLog read={read} tz={tz} />;
}
