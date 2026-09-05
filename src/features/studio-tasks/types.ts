/**
 * STUDIO TASKS — cleaning, maintenance and floor operations.
 *
 * Round: Studio To-Do, Sep 2026.
 *
 * TEMPLATES AND INSTANCES, NOT A `done` FLAG
 * ------------------------------------------
 * The obvious model is one document per task with a checkbox on it. It does not
 * survive contact with the requirement, because the list has to RESET — nightly,
 * on certain weekdays, or per AM/PM shift. Under a single document, "reset on
 * Mondays" is a destructive write that erases who did what, and there is no way
 * to answer "was the leg press wiped down last Tuesday".
 *
 * So: a template says what should happen and how often; an instance is one
 * occurrence of it on one studio day. Templates are edited by managers and
 * rarely change. Instances are created for a day, checked off by trainers, and
 * kept.
 *
 * THE DETERMINISTIC ID IS THE IMPORTANT PART
 * ------------------------------------------
 * An instance's document id is derived entirely from (template, date, shift,
 * machine) — see instanceId() in recurrence.ts. That makes materialization
 * IDEMPOTENT: the first trainer to open the list on a given day writes the
 * day's instances with setDoc(merge), and every subsequent open is a no-op that
 * cannot duplicate them, even if three trainers open the screen at the same
 * second on three iPads.
 *
 * Which means this ships with NO Cloud Function. A scheduled function can be
 * added later to pre-materialize so the list is warm at open; it will write the
 * same ids and collide with nothing.
 *
 * localDate IS STUDIO-LOCAL
 * -------------------------
 * Always computed with lib/studio-time, never from the device clock. A trainer
 * whose iPad is in another timezone would otherwise mint a second day's worth of
 * instances just after midnight, and the list would appear to reset at random.
 */

/**
 * Which half of the day a task belongs to.
 *
 * 'any' is not "unknown" — it means the task stands for the whole day and is
 * done once, whenever. Opening and closing duties are 'am' and 'pm', and a
 * template set to those generates a SEPARATE instance for each, which is the
 * point: closing is not satisfied by having opened.
 */
export type TaskShift = "am" | "pm" | "any";

export const TASK_SHIFTS: TaskShift[] = ["am", "pm", "any"];

export const SHIFT_LABEL: Record<TaskShift, string> = {
  am: "Opening",
  pm: "Closing",
  any: "Anytime",
};

export type TaskKind = "machine" | "facility" | "client";

export type TaskCategory =
  | "cleaning"
  | "maintenance"
  | "ops"
  | "client-service";

export const CATEGORY_LABEL: Record<TaskCategory, string> = {
  cleaning: "Cleaning",
  maintenance: "Maintenance",
  ops: "Operations",
  "client-service": "Client service",
};

export type RecurrenceType = "daily" | "weekly" | "monthly" | "once";

export interface TaskRecurrence {
  type: RecurrenceType;
  /**
   * weekly only. 0 = Sunday, matching Date#getDay. Empty behaves as "every day
   * of the week" rather than "never", because a weekly template with no days
   * selected is a half-finished edit, and silently generating nothing is the
   * least debuggable possible outcome.
   */
  daysOfWeek?: number[];
  /** monthly only. 1-31; a day past the end of a short month is skipped. */
  dayOfMonth?: number;
  /** once only. Studio-local 'YYYY-MM-DD'. */
  onDate?: string;
  /**
   * Which shifts this generates on a due day. One instance per shift listed.
   * Defaults to ['any'].
   */
  shifts?: TaskShift[];
}

/**
 * What the task is about.
 *
 * `machineIds: "all"` is stored as the literal string rather than an expanded
 * list on purpose: a studio that adds a machine next month should get it
 * included in "wipe down every machine" without anyone re-saving the template.
 */
export type TaskTarget =
  | { kind: "machine"; machineIds: string[] | "all" }
  | { kind: "facility"; area?: string }
  | {
      kind: "client";
      clientId?: string;
      /** Deep-links the check-off into the real flow rather than a bare tick. */
      action?: "inbody" | "assessment" | "progress-report" | "custom";
    };

/** Firestore: studios/{studioId}/taskTemplates/{templateId} */
export interface TaskTemplate {
  id: string;
  studioId: string;

  title: string;
  detail?: string;
  kind: TaskKind;
  category: TaskCategory;
  target: TaskTarget;
  recurrence: TaskRecurrence;

  /** Studio-local "HH:MM". Display and ordering only; nothing enforces it. */
  timeOfDay?: string;
  /** Completion is blocked until a note is written. For maintenance checks. */
  requiresNote?: boolean;
  /** Suggested owner. Never enforced — anyone on the floor can close a task. */
  assigneeTrainerId?: string;

  order?: number;
  active: boolean;

  createdAt?: unknown;
  createdBy?: string;
  updatedAt?: unknown;
  updatedBy?: string;
}

export type TaskStatus = "open" | "done" | "skipped";

/**
 * Firestore: studios/{studioId}/taskInstances/{instanceId}
 * where instanceId = instanceId(...) from recurrence.ts.
 */
export interface TaskInstance {
  id: string;
  studioId: string;
  templateId: string;

  /** Studio-local 'YYYY-MM-DD'. */
  localDate: string;
  shift: TaskShift;
  /** Set only for machine-scoped templates: one instance per machine. */
  machineId?: string;

  status: TaskStatus;
  note?: string;
  /** Maintenance only: closed with a problem, which flags the machine. */
  flagged?: boolean;

  completedAt?: unknown;
  completedBy?: { id: string; name: string } | null;

  /** Denormalized so a completed instance still reads correctly after the
   *  template is renamed or deleted. */
  title: string;
  category: TaskCategory;
  kind: TaskKind;

  createdAt?: unknown;
}

/** One instance the day's plan says should exist. */
export interface PlannedInstance {
  id: string;
  templateId: string;
  localDate: string;
  shift: TaskShift;
  machineId?: string;
  title: string;
  category: TaskCategory;
  kind: TaskKind;
}

/** A planned instance joined to its stored state, ready to render. */
export interface TaskRow extends PlannedInstance {
  template: TaskTemplate;
  instance: TaskInstance | null;
  status: TaskStatus;
  /** Machine display name, when machine-scoped. */
  machineName?: string;
  /** Client display name, when client-scoped. */
  clientName?: string;
}

/** What a client task actually opens. */
export type ClientTaskAction =
  | "inbody"
  | "assessment"
  | "progress-report"
  | "custom";

export const CLIENT_ACTION_LABEL: Record<ClientTaskAction, string> = {
  inbody: "InBody scan",
  assessment: "Assessment",
  "progress-report": "Progress report",
  custom: "Something else",
};
