import { Check, Sparkles, TriangleAlert, Wrench } from "lucide-react";
import { formatStudioDate } from "../../lib/studio-time";
import type { MachineUpkeep } from "./useMachineUpkeep";
import type { TaskRow } from "./types";

/**
 * Cleaning and maintenance for ONE machine, shown in the Catalog.
 *
 * Round: Studio To-Do, Sep 2026.
 *
 * Two entry points, one data model: a trainer standing at a machine with the
 * Catalog open should not have to walk to the To-Do screen to record that they
 * wiped it down. But this does NOT invent an ad-hoc instance — it completes
 * today's real task for this machine, from the studio's own template. If there
 * is no such task scheduled today there is nothing to tick, and the card says
 * so rather than manufacturing a record that belongs to no checklist.
 */
export interface MachineUpkeepCardProps {
  machineId: string;
  /** Today's task rows for this machine, from the studio's templates. */
  rows: TaskRow[];
  upkeep?: MachineUpkeep;
  onComplete: (row: TaskRow) => void;
  onAddNote: (row: TaskRow) => void;
  busy?: boolean;
}

function when(dateKey?: string): string {
  if (!dateKey) return "never";
  return formatStudioDate(`${dateKey}T12:00:00`, {
    month: "short",
    day: "numeric",
  });
}

export function MachineUpkeepCard({
  rows,
  upkeep,
  onComplete,
  onAddNote,
  busy,
}: MachineUpkeepCardProps) {
  const flagged = upkeep?.flagged;

  return (
    <div className="stu">
      {flagged && (
        <p className="stu__flag">
          <TriangleAlert size={14} aria-hidden className="stu__flag-icon" />
          <span>
            <strong>Flagged for maintenance.</strong>{" "}
            {flagged.note || "A trainer reported a problem."}
            <span className="stu__flag-by">
              {flagged.completedBy?.name
                ? ` — ${flagged.completedBy.name}, ${when(flagged.localDate)}`
                : ` — ${when(flagged.localDate)}`}
            </span>
          </span>
        </p>
      )}

      <dl className="stu__facts">
        <div>
          <dt>
            <Sparkles size={11} aria-hidden /> Last cleaned
          </dt>
          <dd>
            {when(upkeep?.lastCleaned?.localDate)}
            {upkeep?.lastCleaned?.completedBy?.name
              ? ` · ${upkeep.lastCleaned.completedBy.name}`
              : ""}
          </dd>
        </div>
        <div>
          <dt>
            <Wrench size={11} aria-hidden /> Last serviced
          </dt>
          <dd>
            {when(upkeep?.lastServiced?.localDate)}
            {upkeep?.lastServiced?.completedBy?.name
              ? ` · ${upkeep.lastServiced.completedBy.name}`
              : ""}
          </dd>
        </div>
      </dl>

      {rows.length === 0 ? (
        <p className="stu__none">
          Nothing scheduled for this machine today.
        </p>
      ) : (
        <ul className="stu__tasks">
          {rows.map((row) => {
            const done = row.status === "done";
            return (
              <li key={row.id} className="stu__task" data-done={done || undefined}>
                <button
                  type="button"
                  className="stu__tick"
                  onClick={() => onComplete(row)}
                  disabled={busy}
                  aria-pressed={done}
                  aria-label={`${done ? "Re-open" : "Complete"} ${row.title}`}
                >
                  {done ? <Check size={14} strokeWidth={3} aria-hidden /> : null}
                </button>
                <span className="stu__task-text">
                  <span className="stu__task-name">{row.title}</span>
                  <span className="stu__task-sub">
                    {done && row.instance?.completedBy?.name
                      ? `Done by ${row.instance.completedBy.name}`
                      : row.template?.requiresNote
                        ? "Note required"
                        : row.category}
                  </span>
                </span>
                <button
                  type="button"
                  className="stu__note"
                  onClick={() => onAddNote(row)}
                  disabled={busy}
                >
                  Note
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
