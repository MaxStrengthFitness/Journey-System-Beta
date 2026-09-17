/**
 * CAPTURE — one composer instead of five. The pure half.
 *
 * Round: Relay, Sep 2026. The Sep 16 Planner had New task, New reminder, New
 * studio task, Post a team job, Ask the team and the board's own ask box —
 * six doors, each asking the same four questions in different words. A
 * trainer with eleven minutes had to decide which door before typing.
 *
 * Capture asks for the sentence FIRST and the destination second:
 *
 *   Me         a personal task or reminder (trainers/{uid}/taskTemplates)
 *   The Floor  an ask on the studio board (studios/{s}/taskRequests) — or,
 *              for a leader who flips "Studio task", a recurring template
 *   Someone    a hand-off to a named colleague: an ask that carries their
 *              name (forId) and rings their bell — or, for a leader who flips
 *              "Team job", a job with parts (studios/{s}/teamJobs)
 *
 * The rules decide who may write what (only leaders create studio templates
 * and team jobs; any trainer posts a request), and the state here follows
 * them rather than offering a form that would be refused.
 *
 * Everything else — when, repeat, a machine or client, a duration, a closing
 * note — is a chip or lives under "More". The default save is one tap.
 */
import type { Client } from "../../../types";
import { newTemplateId, type TaskAuthor } from "../../studio-tasks/mutations";
import { addDays, dayOfMonthOf, weekdayOf } from "../../studio-tasks/recurrence";
import type { CreateRequestInput, RequestKind } from "../../studio-tasks/requests";
import { normaliseTime, remindLabel, taskSentence, withoutUndefined } from "../../studio-tasks/task-wizard";
import type {
  RecurrenceType,
  TaskCategory,
  TaskShift,
  TaskTemplate,
} from "../../studio-tasks/types";
import { BUILT_IN_CATEGORIES, SHIFT_LABEL } from "../../studio-tasks/types";
import type { JobDraft } from "../jobs/types";
import type { Person } from "../kit";

export type CaptureDestination = "me" | "floor" | "someone";
export const DESTINATION_LABEL: Record<CaptureDestination, string> = {
  me: "Me",
  floor: "The Floor",
  someone: "Someone",
};

/** The asks a trainer can post from Capture. Initiatives stay with leaders. */
export type AskKind = Exclude<RequestKind, "initiative" | "handoff">;
export const ASK_KINDS: AskKind[] = ["todo", "heads-up", "help", "cover", "question", "other"];

export const DURATION_CHOICES = [2, 5, 10, 20, 30, 60] as const;

export const REMIND_CHOICES: { value: number | null; label: string }[] = [
  { value: null, label: "No bell" },
  { value: 0, label: "At the time" },
  { value: 10, label: "10 min before" },
  { value: 30, label: "30 min before" },
  { value: 60, label: "1 h before" },
  { value: 1440, label: "The day before" },
];

export interface CaptureClient {
  id: string;
  name: string;
}

export interface CaptureState {
  /** The sentence. The first line is the title; anything after is the detail. */
  text: string;
  destination: CaptureDestination;

  /** Floor: an ask on the board, or (leaders) a studio task template. */
  floorForm: "ask" | "task";
  askKind: AskKind;

  /** Someone: a hand-off ask, or (leaders) a team job with parts. */
  people: Person[];
  someoneForm: "handoff" | "job";
  partLines: string;
  openToAll: boolean;

  /** What it is about. */
  machineIds: string[] | "all" | null;
  client: CaptureClient | null;

  /** When. `date` null means today. */
  date: string | null;
  time: string | null;
  shift: TaskShift;
  repeat: RecurrenceType;
  daysOfWeek: number[];
  remindMinutesBefore: number | null;

  /** Rules, under More. */
  estMinutes: number | null;
  category: TaskCategory | null;
  requiresNote: boolean;
  notifyOnDone: boolean;
  /** Me: filed under Growth (professional development), out of Today. */
  growth: boolean;
}

export type CapturePreset = Partial<CaptureState>;

export function blankCapture(preset: CapturePreset = {}): CaptureState {
  return {
    text: "",
    destination: "me",
    floorForm: "ask",
    askKind: "todo",
    people: [],
    someoneForm: "handoff",
    partLines: "",
    openToAll: true,
    machineIds: null,
    client: null,
    date: null,
    time: null,
    shift: "any",
    repeat: "once",
    daysOfWeek: [],
    remindMinutesBefore: null,
    estMinutes: null,
    category: null,
    requiresNote: false,
    notifyOnDone: false,
    growth: false,
    ...preset,
  };
}

export function titleOf(text: string): string {
  return text.trim().split("\n")[0]?.trim().slice(0, 160) ?? "";
}

export function detailOf(text: string): string {
  const lines = text.trim().split("\n");
  return lines.slice(1).join("\n").trim().slice(0, 2000);
}

/**
 * The category follows the entity unless the trainer picked one: a machine
 * means cleaning, a client means client service, a growth item is growth,
 * and anything else is operations — the same defaults the old wizard used
 * when a kind was chosen, now chosen for you.
 */
export function inferredCategory(s: CaptureState): TaskCategory {
  if (s.category) return s.category;
  if (s.growth && s.destination === "me") return "growth";
  if (s.machineIds) return "cleaning";
  if (s.client) return "client-service";
  return "ops";
}

export const CATEGORY_CHOICES: { id: TaskCategory; label: string }[] = [
  ...BUILT_IN_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
  { id: "growth", label: "Growth" },
];

export interface CaptureProblem {
  field: "text" | "people" | "machines" | "date" | "days" | "time" | "remind";
  message: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function captureProblems(s: CaptureState, ctx: { todayKey: string }): CaptureProblem[] {
  const out: CaptureProblem[] = [];
  if (!titleOf(s.text)) out.push({ field: "text", message: "Say what it is first." });
  if (s.destination === "someone" && s.people.length === 0) {
    out.push({ field: "people", message: "Name who it goes to." });
  }
  if (Array.isArray(s.machineIds) && s.machineIds.length === 0) {
    out.push({ field: "machines", message: "Pick a machine, or clear the chip." });
  }
  if (s.date && (!DATE_RE.test(s.date) || s.date < ctx.todayKey)) {
    out.push({ field: "date", message: "That day has passed." });
  }
  if (s.repeat === "weekly" && s.daysOfWeek.length === 0) {
    out.push({ field: "days", message: "Pick at least one day." });
  }
  if (s.time && !normaliseTime(s.time)) out.push({ field: "time", message: "That isn't a clock time." });
  if (s.remindMinutesBefore !== null && !s.time) {
    out.push({ field: "remind", message: "A bell needs a time." });
  }
  return out;
}

/** The days a weekly capture repeats on, "Mon, Wed and Fri". */
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function oxford(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function dayWords(dateKey: string | null, todayKey: string): string {
  if (!dateKey || dateKey === todayKey) return "today";
  if (dateKey === addDays(todayKey, 1)) return "tomorrow";
  const d = new Date(`${dateKey}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/**
 * The sentence at the foot of the sheet — the whole confirmation step. It
 * rewrites live as chips change.
 */
export function captureSentence(
  s: CaptureState,
  ctx: { todayKey: string; studioName: string; machineName?: (id: string) => string },
): string {
  const title = titleOf(s.text);
  if (!title) return "Say what it is, then who it's for.";

  if (s.destination === "me" && s.repeat === "once" && s.floorForm === "ask") {
    // Personal, one-off — the common case. Written directly; the template
    // sentence would say "Once, today" which reads oddly for a to-do.
    const when = s.time
      ? `${dayWords(s.date, ctx.todayKey)} at ${clock12(s.time)}`
      : dayWords(s.date, ctx.todayKey);
    const bell =
      s.remindMinutesBefore !== null && s.time ? ` Your bell rings ${remindLabel(s.remindMinutesBefore)}.` : "";
    const where = s.growth ? " Filed under Growth." : "";
    return `For you, ${when}. Only you see it.${bell}${where}`;
  }

  if (s.destination === "me" || (s.destination === "floor" && s.floorForm === "task")) {
    const t = toTemplate(s, { studioId: "studio", ownerId: "me", todayKey: ctx.todayKey });
    return taskSentence(t, { todayKey: ctx.todayKey, machineName: ctx.machineName });
  }

  if (s.destination === "someone") {
    const names = oxford(s.people.map((p) => p.name.split(" ")[0]));
    if (s.someoneForm === "job") {
      const parts = partLinesOf(s.partLines).length;
      const due = s.date ? `, by ${dayWords(s.date, ctx.todayKey)}` : "";
      return `A team job for ${names || "the team"}${due}.${parts ? ` ${parts} parts to tick off.` : ""}${
        s.openToAll ? " Anyone else can join." : ""
      }${s.notifyOnDone ? " You'll hear when it's finished." : ""}`;
    }
    const due = s.date ? ` by ${dayWords(s.date, ctx.todayKey)}` : "";
    return `Handed to ${names || "someone"}${due}. It rings their bell once and waits on their list.${
      s.notifyOnDone ? " You'll hear when it's done." : ""
    }`;
  }

  // The Floor, as an ask.
  const about = s.machineIds
    ? s.machineIds === "all"
      ? " Every machine."
      : s.machineIds.length === 1
        ? ` ${ctx.machineName?.(s.machineIds[0]) ?? "One machine"}.`
        : ` ${s.machineIds.length} machines.`
    : s.client
      ? ` About ${s.client.name}.`
      : "";
  const due = s.date ? ` Wanted by ${dayWords(s.date, ctx.todayKey)}.` : "";
  const est = s.estMinutes ? ` About ${s.estMinutes} min.` : "";
  return `On the Floor${s.askKind === "todo" ? "" : ` as a ${ASK_KIND_WORD[s.askKind]}`}. Anyone at ${
    ctx.studioName
  } can take it.${about}${due}${est}`;
}

const ASK_KIND_WORD: Record<AskKind, string> = {
  todo: "to-do",
  "heads-up": "heads-up",
  help: "call for a hand",
  cover: "cover request",
  question: "question",
  other: "note to the floor",
};

export function clock12(hhmm: string): string {
  const t = normaliseTime(hhmm);
  if (!t) return hhmm;
  const [h, m] = t.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function partLinesOf(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 60);
}

/* ------------------------------------------------------------------ *
 * To the documents the app already writes
 * ------------------------------------------------------------------ */

function recurrenceOf(s: CaptureState, todayKey: string): TaskTemplate["recurrence"] {
  const shifts: TaskShift[] = [s.shift];
  switch (s.repeat) {
    case "daily":
      return { type: "daily", shifts };
    case "weekly":
      return { type: "weekly", daysOfWeek: [...s.daysOfWeek].sort(), shifts };
    case "monthly":
      return { type: "monthly", dayOfMonth: dayOfMonthOf(s.date ?? todayKey), shifts };
    default:
      return { type: "once", onDate: s.date ?? todayKey, shifts };
  }
}

function targetOf(s: CaptureState): TaskTemplate["target"] {
  if (s.machineIds) return { kind: "machine", machineIds: s.machineIds };
  if (s.client) return { kind: "client", clientId: s.client.id, action: "custom" };
  return { kind: "facility" };
}

/**
 * A task template — personal (Me) or studio (a leader's Floor task). The
 * shape TaskWizard produces, so useStudioTasks expands it the same way.
 */
export function toTemplate(
  s: CaptureState,
  ctx: { studioId: string; ownerId: string; todayKey: string },
): TaskTemplate {
  const personal = s.destination === "me";
  const time = normaliseTime(s.time) ?? undefined;
  const template: TaskTemplate = {
    id: newTemplateId(titleOf(s.text)),
    studioId: ctx.studioId,
    scope: personal ? "personal" : "studio",
    ownerId: personal ? ctx.ownerId : undefined,
    title: titleOf(s.text),
    detail: detailOf(s.text) || undefined,
    kind: s.machineIds ? "machine" : s.client ? "client" : "facility",
    category: inferredCategory(s),
    target: targetOf(s),
    recurrence: recurrenceOf(s, ctx.todayKey),
    timeOfDay: time,
    remindMinutesBefore: personal && time ? s.remindMinutesBefore : null,
    requiresNote: s.requiresNote || undefined,
    notifyCreatorOnComplete: personal ? undefined : s.notifyOnDone,
    estMinutes: s.estMinutes ?? undefined,
    active: true,
  };
  return withoutUndefined(template);
}

/** A hand-off or an ask on the board. */
export function toRequest(
  s: CaptureState,
  ctx: { studioId: string; author: TaskAuthor; todayKey: string },
): CreateRequestInput {
  const handoff = s.destination === "someone";
  const to = handoff ? s.people[0] : undefined;
  return {
    studioId: ctx.studioId,
    author: ctx.author,
    kind: handoff ? "handoff" : s.askKind,
    title: titleOf(s.text),
    detail: detailOf(s.text) || undefined,
    clientId: s.client?.id,
    machineId: Array.isArray(s.machineIds) && s.machineIds.length === 1 ? s.machineIds[0] : undefined,
    priority: s.askKind === "cover" ? "urgent" : handoff ? "normal" : "low",
    expiry: "none",
    forId: to?.id,
    forName: to?.name,
    dueOn: s.date ?? undefined,
    estMinutes: s.estMinutes ?? undefined,
    notifyOnDone: s.notifyOnDone || undefined,
  };
}

/** A team job (leaders). */
export function toJobDraft(s: CaptureState, ctx: { clients: Client[] }): JobDraft {
  const about: JobDraft["about"] = s.machineIds
    ? { kind: "machine", machineIds: s.machineIds === "all" ? [] : s.machineIds }
    : s.client
      ? {
          kind: "client",
          clientIds: [s.client.id],
          clientNames: { [s.client.id]: s.client.name },
        }
      : { kind: "facility" };
  void ctx;
  return {
    title: titleOf(s.text),
    detail: detailOf(s.text),
    category: inferredCategory(s),
    about,
    assignees: s.people.map((p) => ({ id: p.id, name: p.name })),
    openToAll: s.openToAll,
    partLabels: partLinesOf(s.partLines),
    dueOn: s.date,
    requiresNote: s.requiresNote,
    notifyOnDone: s.notifyOnDone,
  };
}

/** The chips row: what each chip says when set. */
export function whenChipLabel(s: CaptureState, todayKey: string): string {
  const day = dayWords(s.date, todayKey);
  const shift = s.shift !== "any" ? ` · ${SHIFT_LABEL[s.shift]}` : "";
  if (s.time) return `${day} ${clock12(s.time)}${shift}`;
  if (!s.date && s.shift === "any") return "When";
  return `${day[0].toUpperCase()}${day.slice(1)}${shift}`;
}

export function repeatChipLabel(s: CaptureState): string {
  switch (s.repeat) {
    case "daily":
      return "Every day";
    case "weekly":
      return s.daysOfWeek.length ? `Every ${oxford([...s.daysOfWeek].sort().map((d) => DAY_SHORT[d]))}` : "Weekly";
    case "monthly":
      return "Monthly";
    default:
      return "Repeat";
  }
}

/** The weekday of a date key, for a weekly default. */
export function weekdayOfKey(dateKey: string): number {
  return weekdayOf(dateKey);
}
