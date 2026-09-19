/**
 * MY TASKS — a trainer's own list, sorted for a glance between sessions.
 *
 * Round: Learning + Planner, Sep 2026.
 *
 * Personal tasks already existed (trainers/{uid}/task*, private by path — see
 * TaskScope in features/studio-tasks/types.ts). What did not exist was a place
 * to SEE them: they were mixed into the studio's shift strip with a "Just you"
 * badge, and "New personal task" was reachable only through Manage → task
 * form → back. So a trainer's own list existed and was effectively hidden.
 *
 * "My tasks" is that list on its own:
 *   open      what is still on it today, in time order
 *   done      what they already ticked today
 *   assigned  studio tasks a head trainer put their name on today — the one
 *             piece of the shared list that is also, genuinely, theirs
 *
 * PURE MODULE — no React, no Firestore.
 */

import { taskScopeOf, type TaskRow } from "../studio-tasks/types";

export interface MyTaskBuckets {
  open: TaskRow[];
  done: TaskRow[];
  assigned: TaskRow[];
}

/** "HH:MM" first (earliest first), then untimed, then by title. */
function byTimeThenTitle(a: TaskRow, b: TaskRow): number {
  const ta = a.template.timeOfDay ?? "";
  const tb = b.template.timeOfDay ?? "";
  if (ta && tb && ta !== tb) return ta.localeCompare(tb);
  if (ta && !tb) return -1;
  if (!ta && tb) return 1;
  return a.title.localeCompare(b.title);
}

export function myTaskBuckets(rows: TaskRow[], trainerId: string | null): MyTaskBuckets {
  const open: TaskRow[] = [];
  const done: TaskRow[] = [];
  const assigned: TaskRow[] = [];
  for (const r of rows) {
    if (taskScopeOf(r.template) === "personal") {
      if (r.status === "open") open.push(r);
      else if (r.status === "done") done.push(r);
      continue;
    }
    if (trainerId && r.status === "open" && r.instance?.assignedTo?.id === trainerId) {
      assigned.push(r);
    }
  }
  return {
    open: open.sort(byTimeThenTitle),
    done: done.sort(byTimeThenTitle),
    assigned: assigned.sort(byTimeThenTitle),
  };
}

/** "09:30" -> "9:30 AM". Anything else is shown as it is. */
export function timeLabel(hhmm: string | undefined): string | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const h = Number(m[1]);
  if (h > 23) return hhmm;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

/** The line under a task's title: its time, its client, its machine. */
export function taskMeta(row: TaskRow): string {
  return [timeLabel(row.template.timeOfDay), row.clientName, row.machineName]
    .filter(Boolean)
    .join(" · ");
}
