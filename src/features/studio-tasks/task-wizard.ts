/**
 * THE TASK WIZARD — the rules behind the three-step task form.
 *
 * Round: Planner rework, Sep 2026. The old form asked every question on one
 * long scroll. The wizard asks them in the order a person thinks them:
 *
 *   What   the title, the instructions, and what it is about
 *   When   how often, which part of the day, a set time — and, for your own
 *          tasks, a reminder
 *   Rules  the category, whether closing needs a note, whether you hear
 *          when it is finished — and the sentence that says what saving will
 *          do
 *
 * Editing a task opens on the last step with every step reachable, because
 * an edit is usually one field.
 *
 * PURE MODULE — no React, no Firestore.
 */

import { zonedHM } from "../../lib/studio-time";
import { addDays, weekdayOf } from "./recurrence";
import {
  CLIENT_ACTION_LABEL,
  SHIFT_LABEL,
  taskScopeOf,
  type TaskShift,
  type TaskTemplate,
} from "./types";

export type WizardStep = "what" | "when" | "rules";
export const WIZARD_STEPS: WizardStep[] = ["what", "when", "rules"];
export const WIZARD_STEP_LABEL: Record<WizardStep, string> = {
  what: "What",
  when: "When",
  rules: "Rules",
};

/** How long before a set time a reminder rings. Minutes; 0 = at the time. */
export const REMIND_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 0, label: "At the time" },
  { minutes: 10, label: "10 min before" },
  { minutes: 30, label: "30 min before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 24 * 60, label: "The day before" },
];

export interface WizardProblem {
  step: WizardStep;
  field: "title" | "client" | "machines" | "date" | "days" | "time" | "remind";
  message: string;
}

/** "9:5" → "09:05"; anything that isn't a clock time → null. */
export function normaliseTime(value: string | undefined | null): string | null {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec((value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function problemsFor(t: TaskTemplate, step?: WizardStep): WizardProblem[] {
  const out: WizardProblem[] = [];
  if (!t.title.trim()) out.push({ step: "what", field: "title", message: "Give the task a title." });
  if (t.target.kind === "machine" && t.target.machineIds !== "all" && t.target.machineIds.length === 0) {
    out.push({ step: "what", field: "machines", message: "Choose at least one machine, or pick “Every machine”." });
  }
  if (t.target.kind === "client" && !t.target.clientId && taskScopeOf(t) === "personal") {
    out.push({ step: "what", field: "client", message: "Choose the client this is about." });
  }
  if (t.recurrence.type === "once" && !/^\d{4}-\d{2}-\d{2}$/.test(t.recurrence.onDate ?? "")) {
    out.push({ step: "when", field: "date", message: "Pick the day it's for." });
  }
  if (t.timeOfDay && !normaliseTime(t.timeOfDay)) {
    out.push({ step: "when", field: "time", message: "That isn't a time — use the clock picker." });
  }
  if (typeof t.remindMinutesBefore === "number" && !normaliseTime(t.timeOfDay)) {
    out.push({ step: "when", field: "remind", message: "A reminder needs a set time." });
  }
  return step ? out.filter((p) => p.step === step) : out;
}

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "9:30 AM". */
export function clockLabel(hhmm: string): string {
  const t = normaliseTime(hhmm);
  if (!t) return hhmm;
  const h = Number(t.slice(0, 2));
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${t.slice(3)} ${suffix}`;
}

function dateLabel(key: string, todayKey?: string): string {
  if (todayKey) {
    if (key === todayKey) return "today";
    if (key === addDays(todayKey, 1)) return "tomorrow";
  }
  const [, m, d] = key.split("-").map(Number);
  return `${DAY_SHORT[weekdayOf(key)]}, ${MONTH[m - 1]} ${d}`;
}

function oxford(list: string[]): string {
  if (list.length <= 1) return list.join("");
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

export function remindLabel(minutes: number): string {
  if (minutes === 0) return "at the time";
  if (minutes === 24 * 60) return "the day before";
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"} before`;
  return `${minutes} minutes before`;
}

/**
 * The review sentence: what saving this task will do, in one or two
 * sentences. "Every day at closing, on every machine. Closing it needs a note."
 */
export function taskSentence(
  t: TaskTemplate,
  ctx: { todayKey?: string; machineName?: (id: string) => string; clientName?: (id: string) => string } = {},
): string {
  const r = t.recurrence;
  const when =
    r.type === "once"
      ? r.onDate
        ? `Once, ${dateLabel(r.onDate, ctx.todayKey)}`
        : "Once (pick a day)"
      : r.type === "weekly"
        ? (r.daysOfWeek ?? []).length === 0 || (r.daysOfWeek ?? []).length === 7
          ? "Every day"
          : `Every ${oxford([...(r.daysOfWeek ?? [])].sort().map((d) => DAY_SHORT[d]))}`
        : r.type === "monthly"
          ? `On day ${r.dayOfMonth ?? 1} of each month`
          : "Every day";

  const shifts = (r.shifts ?? ["any"]).filter((s): s is TaskShift => s !== "any");
  const part = shifts.length ? ` at ${oxford(shifts.map((s) => SHIFT_LABEL[s].toLowerCase()))}` : "";
  const time = normaliseTime(t.timeOfDay) ? `, ${clockLabel(t.timeOfDay!)}` : "";

  const about =
    t.target.kind === "machine"
      ? t.target.machineIds === "all"
        ? ", on every machine"
        : t.target.machineIds.length === 1
          ? `, on ${ctx.machineName?.(t.target.machineIds[0]) || "one machine"}`
          : `, on ${t.target.machineIds.length} machines`
      : t.target.kind === "client"
        ? t.target.clientId
          ? `, for ${ctx.clientName?.(t.target.clientId) || "a client"}${
              t.target.action && t.target.action !== "custom"
                ? ` (opens the ${CLIENT_ACTION_LABEL[t.target.action].toLowerCase()})`
                : ""
            }`
          : ", with a client"
        : "";

  const sentences = [`${when}${part}${time}${about}.`];
  if (taskScopeOf(t) === "personal") {
    sentences.push("Only you see it.");
    if (typeof t.remindMinutesBefore === "number" && normaliseTime(t.timeOfDay)) {
      sentences.push(`Your bell rings ${remindLabel(t.remindMinutesBefore)}.`);
    }
  } else {
    sentences.push("Everyone at the studio sees it on the days it's due.");
  }
  if (t.requiresNote) sentences.push("Closing it needs a note.");
  if (taskScopeOf(t) === "studio") {
    const notify = t.notifyCreatorOnComplete ?? r.type === "once";
    if (notify) sentences.push("You'll hear when it's done.");
  }
  return sentences.join(" ");
}

/**
 * Firestore refuses `undefined` anywhere in a document ("Unsupported field
 * value: undefined") — the Kaizen roster's one-tap add failed for a week on
 * exactly that. The old task form could produce one: "Choose a client…" set
 * `target.clientId` to undefined. Everything a task write sends goes through
 * here first.
 */
export function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => withoutUndefined(v)) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = withoutUndefined(v);
    }
    return out as T;
  }
  return value;
}

/** The step a fresh form opens on, and the step an edit opens on. */
export function firstStep(isNew: boolean): WizardStep {
  return isNew ? "what" : "rules";
}

export function nextStep(step: WizardStep): WizardStep | null {
  const i = WIZARD_STEPS.indexOf(step);
  return i < WIZARD_STEPS.length - 1 ? WIZARD_STEPS[i + 1] : null;
}

export function prevStep(step: WizardStep): WizardStep | null {
  const i = WIZARD_STEPS.indexOf(step);
  return i > 0 ? WIZARD_STEPS[i - 1] : null;
}

/**
 * A quick reminder: a personal, one-off task at a set time with the bell on.
 * "New reminder" on My tasks opens the wizard already shaped like this.
 */
export function reminderPreset(todayKey: string, now: Date): Partial<TaskTemplate> {
  // The next half hour on the studio's clock, as a starting point the
  // trainer will change.
  const hm = zonedHM(now) ?? { hour: 9, minute: 0 };
  const mins = hm.hour * 60 + hm.minute;
  const next = Math.min(23 * 60 + 30, Math.ceil((mins + 1) / 30) * 30);
  const hh = String(Math.floor(next / 60)).padStart(2, "0");
  const mm = String(next % 60).padStart(2, "0");
  return {
    kind: "facility",
    category: "ops",
    target: { kind: "facility" },
    recurrence: { type: "once", onDate: todayKey, shifts: ["any"] },
    timeOfDay: `${hh}:${mm}`,
    remindMinutesBefore: 0,
  };
}
