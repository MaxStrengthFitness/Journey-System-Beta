/**
 * STUDIO TASKS — which tasks exist on a given studio day.
 *
 * Round: Studio To-Do, Sep 2026.
 *
 * Pure and synchronous on purpose: the entire scheduling policy is unit-testable
 * without Firestore, and the same functions run client-side today and inside a
 * scheduled Cloud Function later without either being the authority.
 */

import type {
  PlannedInstance,
  TaskShift,
  TaskTemplate,
} from "./types";

/**
 * Weekday for a studio-local 'YYYY-MM-DD', 0 = Sunday.
 *
 * Parsed as UTC deliberately. The key already NAMES a calendar day in the
 * studio's timezone — it has been through lib/studio-time to get here — so
 * running it through the device's local timezone again would shift it a day for
 * anyone west of the studio. `new Date("2026-09-06")` is parsed as UTC by spec
 * but `new Date(2026, 8, 6)` is local, and mixing them is the classic
 * off-by-one-day bug.
 */
export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * N days after a studio-local 'YYYY-MM-DD', as another one.
 *
 * UTC arithmetic for the same reason weekdayOf parses as UTC: the key already
 * NAMES a calendar day in the studio's timezone, and running it back through
 * the device's local zone would shift it a day for anyone west of the studio.
 * Date.UTC also rolls month and year ends for free, so no clamping is needed.
 */
export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(t.getUTCDate()).padStart(2, "0");
  return `${t.getUTCFullYear()}-${mm}-${dd}`;
}

/** Day of month for a studio-local 'YYYY-MM-DD'. */
export function dayOfMonthOf(dateKey: string): number {
  return Number(dateKey.split("-")[2]);
}

/** True when this template should generate work on this studio day. */
export function isTemplateDueOn(
  template: TaskTemplate,
  dateKey: string,
): boolean {
  if (!template.active) return false;
  const r = template.recurrence;

  switch (r.type) {
    case "daily":
      return true;

    case "weekly": {
      const days = r.daysOfWeek ?? [];
      // An empty selection is a half-finished edit, not "never". Generating
      // nothing would be the least debuggable possible outcome for a manager
      // who thinks they just scheduled something.
      if (days.length === 0) return true;
      return days.includes(weekdayOf(dateKey));
    }

    case "monthly": {
      if (!r.dayOfMonth) return false;
      // A template set to the 31st simply does not fire in a 30-day month.
      // Clamping it to the last day would silently move the task, which is
      // worse for a quarterly service check than skipping it.
      return dayOfMonthOf(dateKey) === r.dayOfMonth;
    }

    case "once":
      return r.onDate === dateKey;

    default:
      return false;
  }
}

/** Which shifts a template generates on a due day. */
export function shiftsFor(template: TaskTemplate): TaskShift[] {
  const shifts = template.recurrence.shifts;
  return shifts && shifts.length > 0 ? shifts : ["any"];
}

/**
 * The document id for one instance.
 *
 * Derived ENTIRELY from its coordinates, which is what makes materialization
 * idempotent: three trainers opening the list on three iPads in the same second
 * all compute the same ids and setDoc(merge) onto the same documents instead of
 * creating three copies of the day.
 *
 * Firestore forbids '/' in a document id and caps it at 1500 bytes; '__' as the
 * separator keeps ids readable in the console and machine ids already use single
 * hyphens, so there is nothing to escape.
 */
export function instanceId(
  templateId: string,
  dateKey: string,
  shift: TaskShift,
  machineId?: string,
): string {
  const base = `${templateId}__${dateKey}__${shift}`;
  return machineId ? `${base}__${machineId}` : base;
}

/**
 * Every instance one template should produce on one day.
 *
 * `machineIds: "all"` expands against the studio's CURRENT roster at read time
 * rather than at save time, so equipment added next month is covered by "wipe
 * down every machine" without anyone re-saving the template.
 */
export function expandTemplate(
  template: TaskTemplate,
  dateKey: string,
  studioMachineIds: string[],
): PlannedInstance[] {
  if (!isTemplateDueOn(template, dateKey)) return [];

  const base = {
    templateId: template.id,
    localDate: dateKey,
    title: template.title,
    category: template.category,
    kind: template.kind,
  };

  if (
    template.target.kind === "machine" &&
    template.target.machineIds === "all" &&
    studioMachineIds.length === 0
  ) {
    // A due template that expands to nothing is invisible: no row, no error,
    // and the day list then tells the manager who just saved it that there is
    // "Nothing scheduled today". Name it instead. (Sep 5 2026.)
    console.warn(
      `[studio-tasks] "${template.title}" targets every machine, but no ` +
        `machines are available for this studio, so it produced no rows.`,
    );
  }

  const out: PlannedInstance[] = [];

  for (const shift of shiftsFor(template)) {
    if (template.target.kind === "machine") {
      const ids =
        template.target.machineIds === "all"
          ? studioMachineIds
          : template.target.machineIds.filter((id) =>
              studioMachineIds.includes(id),
            );

      for (const machineId of ids) {
        out.push({
          ...base,
          shift,
          machineId,
          id: instanceId(template.id, dateKey, shift, machineId),
        });
      }
    } else {
      out.push({
        ...base,
        shift,
        id: instanceId(template.id, dateKey, shift),
      });
    }
  }

  return out;
}

/**
 * Take the rows of one group and repeat them forward over the next `days`.
 *
 * Round: Task assignment, Sep 2026. This is what lets a head trainer say
 * "Marcus has closing this week" in one action instead of re-assigning every
 * morning — which is the assignment nobody maintains, and the reason the old
 * `assigneeTrainerId` on the TEMPLATE was deleted rather than wired.
 *
 * Projects the rows that are ALREADY ON SCREEN rather than re-expanding the
 * template against the roster. Same machines, same shift, same titles, new
 * dates — so what a head trainer assigns is exactly what they were looking at,
 * and this needs no second read of the studio's machine list to stay in step
 * with it.
 *
 * `days` counts calendar days from `fromDateKey` inclusive, not occurrences: a
 * Tuesdays-and-Fridays template asked for 7 days returns the Tuesday and the
 * Friday, which is what "this week" means to the person tapping it. Days the
 * template is not due produce nothing.
 *
 * WRITING AHEAD IS SAFE, and it is worth saying why, because the model
 * elsewhere leans on documents being absent:
 *
 *   - Instance ids are derived entirely from their coordinates, so assigning
 *     ahead and then materializing on the day converge on ONE document.
 *   - useStudioTasks joins with `instance?.status ?? "open"`, so an
 *     assignment-only document with no status reads as open. Correct.
 *   - useTaskCompliance treats a planned row with no document as never
 *     touched, and only ever looks BACKWARDS. You cannot assign into the past,
 *     so no historical row gains a document it did not have.
 */
export function repeatPlanForward(
  rows: PlannedInstance[],
  template: TaskTemplate,
  fromDateKey: string,
  days: number,
): PlannedInstance[] {
  if (rows.length === 0) return [];
  const out: PlannedInstance[] = [];
  for (let i = 0; i < Math.max(1, days); i += 1) {
    const dateKey = addDays(fromDateKey, i);
    // Day 0 is today, which is already due by definition — but a template can
    // be edited between the plan being computed and this running, so it is
    // checked like every other day rather than assumed.
    if (!isTemplateDueOn(template, dateKey)) continue;
    for (const row of rows) {
      out.push({
        ...row,
        localDate: dateKey,
        id: instanceId(row.templateId, dateKey, row.shift, row.machineId),
      });
    }
  }
  return out;
}

/** The whole day's plan, in a stable order. */
export function planDay(
  templates: TaskTemplate[],
  dateKey: string,
  studioMachineIds: string[],
): PlannedInstance[] {
  const planned = templates.flatMap((t) =>
    expandTemplate(t, dateKey, studioMachineIds),
  );

  const shiftRank: Record<TaskShift, number> = { am: 0, any: 1, pm: 2 };
  const orderOf = new Map(templates.map((t) => [t.id, t.order ?? 999]));

  return planned.sort(
    (a, b) =>
      shiftRank[a.shift] - shiftRank[b.shift] ||
      (orderOf.get(a.templateId) ?? 999) - (orderOf.get(b.templateId) ?? 999) ||
      a.title.localeCompare(b.title) ||
      (a.machineId ?? "").localeCompare(b.machineId ?? ""),
  );
}
