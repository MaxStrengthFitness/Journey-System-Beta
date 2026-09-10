/**
 * CLIENT TASKS — the ones with a name attached.
 *
 * These were mixed in with cleaning on the old screen, which is exactly
 * backwards. "Wipe the leg press" is a chore; "Priya's progress report is due"
 * is a person waiting on you, and the two do not belong in one list sorted by
 * shift.
 *
 * THE PRIMARY ACTION IS NOT THE CHECKBOX
 * A client task is a pointer at the screen where the work is actually done, so
 * the big target is "Open" and the tick is secondary. Ticking it without doing
 * it is possible — somebody has to be able to close a loop that was closed off
 * the app — but it should take a deliberate second look, not be the thing your
 * thumb lands on.
 *
 * Overdue is shown as a date, not a red badge. A trainer scanning between
 * sessions can act on "due Friday"; they cannot act on urgency.
 */
import { CalendarClock, Check, ChevronRight } from "lucide-react";
import type { ClientTaskAction, TaskRow } from "./types";
import { CLIENT_ACTION_LABEL } from "./types";

export interface ClientTasksLaneProps {
  rows: TaskRow[];
  busyIds?: Set<string>;
  /** Narrow to what this trainer claimed or was assigned. */
  mineOnly?: boolean;
  currentUserId?: string | null;
  onComplete: (row: TaskRow) => void;
  onReopen?: (row: TaskRow) => void;
  onOpenClientTask?: (clientId: string, action?: ClientTaskAction) => void;
}

/** The client half of a template's target, when it has one. */
function clientTarget(row: TaskRow):
  | { clientId: string; action?: ClientTaskAction }
  | null {
  const t = row.template?.target as
    | { kind?: string; clientId?: string; action?: ClientTaskAction }
    | undefined;
  if (!t || t.kind !== "client" || !t.clientId) return null;
  return { clientId: t.clientId, action: t.action };
}

export function ClientTasksLane({
  rows,
  busyIds,
  mineOnly,
  currentUserId,
  onComplete,
  onReopen,
  onOpenClientTask,
}: ClientTasksLaneProps) {
  /*
   * MINE means claimed by you, or a personal task of yours. An unclaimed
   * studio-wide client task belongs to nobody yet, so it is not yours — and
   * hiding it under MINE is how one gets missed by everybody.
   */
  const visible = mineOnly
    ? rows.filter(
        (r) =>
          r.instance?.claimedBy?.id === currentUserId ||
          r.template?.ownerId === currentUserId,
      )
    : rows;

  if (visible.length === 0) return null;

  const open = visible.filter((r) => r.status !== "done");
  const done = visible.filter((r) => r.status === "done");

  return (
    <section className="sh__lane" aria-label="Client tasks">
      <header className="sh__lane-head sh__lane-head--static">
        <h2 className="sh__lane-title">Clients waiting on us</h2>
        <span className="sh__lane-count tabular">
          {done.length} / {visible.length}
        </span>
      </header>

      <ul className="sh__clients">
        {[...open, ...done].map((row) => {
          const target = clientTarget(row);
          const isDone = row.status === "done";
          const busy = busyIds?.has(row.id);
          const label = target?.action
            ? CLIENT_ACTION_LABEL[target.action]
            : row.title;

          return (
            <li
              key={row.id}
              className={`sh__client${isDone ? " sh__client--done" : ""}`}
            >
              <button
                type="button"
                className={`sh__row-tick${isDone ? " sh__row-tick--on" : ""}`}
                disabled={busy}
                aria-pressed={isDone}
                aria-label={
                  isDone
                    ? `Re-open ${label} for ${row.clientName ?? "this client"}`
                    : `Mark ${label} done for ${row.clientName ?? "this client"}`
                }
                onClick={() => (isDone ? onReopen?.(row) : onComplete(row))}
              >
                {isDone && <Check size={12} strokeWidth={3} aria-hidden />}
              </button>

              {target && onOpenClientTask ? (
                <button
                  type="button"
                  className="sh__client-main"
                  onClick={() =>
                    onOpenClientTask(target.clientId, target.action)
                  }
                >
                  <span className="sh__client-name">
                    {row.clientName ?? "Client"}
                  </span>
                  <span className="sh__client-what">{label}</span>
                  <ChevronRight size={15} className="sh__client-go" aria-hidden />
                </button>
              ) : (
                <span className="sh__client-main sh__client-main--flat">
                  <span className="sh__client-name">
                    {row.clientName ?? "Client"}
                  </span>
                  <span className="sh__client-what">{label}</span>
                </span>
              )}

              {/*
                timeOfDay is display-only and nothing enforces it, so it is
                shown as a hint and never as a deadline.
              */}
              {row.template?.timeOfDay && !isDone && (
                <span className="sh__client-due">
                  <CalendarClock size={12} aria-hidden />
                  {row.template.timeOfDay}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
