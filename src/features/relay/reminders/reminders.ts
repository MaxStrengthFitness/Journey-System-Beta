/**
 * PERSONAL REMINDERS — when a trainer's own task should ring their bell.
 *
 * Round: Planner rework, Sep 2026. AJ: trainers "create personal reminders
 * linked to the calendar with specific notifications".
 *
 * A reminder is not a new kind of thing. It is a personal task (the private
 * list at trainers/{uid}/task*) with a set time and `remindMinutesBefore`.
 * That keeps one list, one form (the task wizard) and one "done" tick — and a
 * reminder for a repeating task simply rings each day it is due.
 *
 * HOW IT RINGS — AND THE LIMIT, STATED
 * Nothing in this app contacts a trainer (no push, text or email — a standing
 * decision). The bell is written by the trainer's OWN iPad: a small watcher
 * (./useReminderBell.ts) runs while the app is open and, when a reminder
 * comes due, writes one notification into their own bell at a deterministic
 * id, so two iPads signed in as the same person ring it once. If no iPad has
 * the app open at that moment, the reminder rings the next time one does —
 * as long as it is still relevant (see LATE_GRACE_MINUTES).
 *
 * PURE MODULE — no React, no Firestore.
 */

import { studioDayKeyOf, wallClockToInstant } from "../../../lib/studio-time";
import { addDays, isTemplateDueOn, shiftsFor } from "../../studio-tasks/recurrence";
import { normaliseTime } from "../../studio-tasks/task-wizard";
import { taskScopeOf, type TaskInstance, type TaskTemplate } from "../../studio-tasks/types";

/**
 * How long after a task's own time a missed reminder may still ring. An iPad
 * that wakes at 4:10 should still say "3:30 call Grace's physio" — you may not
 * have done it — but not at 9pm, when it is noise.
 */
export const LATE_GRACE_MINUTES = 120;

/** The notification document id for one reminder on one day. */
export function reminderId(templateId: string, dateKey: string): string {
  return `reminder__${templateId}__${dateKey}`;
}

export function hasReminder(t: TaskTemplate): boolean {
  return (
    taskScopeOf(t) === "personal" &&
    t.active !== false &&
    typeof t.remindMinutesBefore === "number" &&
    Boolean(normaliseTime(t.timeOfDay))
  );
}

/** The moment the task itself is for, on one studio day. */
export function taskInstant(t: TaskTemplate, dateKey: string): Date | null {
  const time = normaliseTime(t.timeOfDay);
  if (!time) return null;
  return wallClockToInstant(`${dateKey}T${time}:00`);
}

export interface DueReminder {
  id: string;
  template: TaskTemplate;
  dateKey: string;
  /** When the task is for. */
  at: Date;
  /** When the bell should ring. */
  ringAt: Date;
}

/**
 * Was this task already closed on that day? A personal task's instance ids
 * follow the same coordinates as a studio task's; a machine task has one per
 * machine and is treated as closed only when every one we know of is.
 */
function closedOn(t: TaskTemplate, dateKey: string, instances: Record<string, TaskInstance>): boolean {
  const mine = Object.values(instances).filter((i) => i.templateId === t.id && i.localDate === dateKey);
  if (mine.length === 0) return false;
  const shifts = shiftsFor(t);
  if (t.target.kind !== "machine") {
    return shifts.every((s) => mine.some((i) => i.shift === s && i.status !== "open"));
  }
  return mine.every((i) => i.status !== "open");
}

/**
 * The reminders that should ring now: due, not yet rung (per `rung`), not
 * already done, and not too stale to matter.
 *
 * Looks at today and tomorrow, because "the day before" rings today for a
 * task that is tomorrow.
 */
export function dueReminders(args: {
  templates: TaskTemplate[];
  instances: Record<string, TaskInstance>;
  now: Date;
  rung: ReadonlySet<string>;
}): DueReminder[] {
  const { templates, instances, now, rung } = args;
  const today = studioDayKeyOf(now);
  if (!today) return [];
  const out: DueReminder[] = [];
  for (const t of templates) {
    if (!hasReminder(t)) continue;
    for (const dateKey of [addDays(today, -1), today, addDays(today, 1)]) {
      if (!isTemplateDueOn(t, dateKey)) continue;
      const at = taskInstant(t, dateKey);
      if (!at) continue;
      const ringAt = new Date(at.getTime() - (t.remindMinutesBefore ?? 0) * 60_000);
      if (ringAt.getTime() > now.getTime()) continue;
      if (now.getTime() > at.getTime() + LATE_GRACE_MINUTES * 60_000) continue;
      const id = reminderId(t.id, dateKey);
      if (rung.has(id)) continue;
      if (closedOn(t, dateKey, instances)) continue;
      out.push({ id, template: t, dateKey, at, ringAt });
    }
  }
  return out.sort((a, b) => a.ringAt.getTime() - b.ringAt.getTime());
}

/** When the watcher should next look: the soonest future ring, or null. */
export function nextRing(templates: TaskTemplate[], now: Date): Date | null {
  const today = studioDayKeyOf(now);
  if (!today) return null;
  let best: Date | null = null;
  for (const t of templates) {
    if (!hasReminder(t)) continue;
    for (const dateKey of [today, addDays(today, 1), addDays(today, 2)]) {
      if (!isTemplateDueOn(t, dateKey)) continue;
      const at = taskInstant(t, dateKey);
      if (!at) continue;
      const ringAt = new Date(at.getTime() - (t.remindMinutesBefore ?? 0) * 60_000);
      if (ringAt.getTime() <= now.getTime()) continue;
      if (!best || ringAt.getTime() < best.getTime()) best = ringAt;
    }
  }
  return best;
}

export interface Upcoming {
  key: string;
  template: TaskTemplate;
  dateKey: string;
  /** "HH:MM", studio time. */
  time: string;
  reminds: boolean;
}

/**
 * A trainer's timed personal tasks over the next `days` studio days, in time
 * order — the "Coming up" list on My tasks and the strip on the calendar.
 * Untimed tasks are left out: they belong to "Today", not to a clock.
 */
export function upcomingTimed(templates: TaskTemplate[], fromKey: string, days: number): Upcoming[] {
  const out: Upcoming[] = [];
  for (let i = 0; i < days; i += 1) {
    const dateKey = addDays(fromKey, i);
    for (const t of templates) {
      if (taskScopeOf(t) !== "personal" || t.active === false) continue;
      const time = normaliseTime(t.timeOfDay);
      if (!time || !isTemplateDueOn(t, dateKey)) continue;
      out.push({
        key: `${t.id}__${dateKey}`,
        template: t,
        dateKey,
        time,
        reminds: typeof t.remindMinutesBefore === "number",
      });
    }
  }
  return out.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.time.localeCompare(b.time) || a.template.title.localeCompare(b.template.title));
}

/** The body line of a reminder notification. */
export function reminderBody(r: Pick<DueReminder, "template" | "dateKey">, todayKey: string, clock: (hhmm: string) => string): string {
  const time = clock(normaliseTime(r.template.timeOfDay) ?? "");
  const day = r.dateKey === todayKey ? "Today" : r.dateKey === addDays(todayKey, 1) ? "Tomorrow" : r.dateKey;
  return r.template.detail?.trim() ? `${day} at ${time} — ${r.template.detail.trim().slice(0, 200)}` : `${day} at ${time}.`;
}
