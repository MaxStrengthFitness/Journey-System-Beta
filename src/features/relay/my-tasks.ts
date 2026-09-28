/**
 * MY TASKS — the small print of a trainer's own list.
 *
 * Round: Learning + Planner, Sep 2026. Since the Relay room (Sep 28 2026)
 * the list itself is the Tracker, sorted by when in ./tracker.ts; this file
 * keeps the line under a task's title (its time, its client, its machine).
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

import type { TaskRow } from "../studio-tasks/types";

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
