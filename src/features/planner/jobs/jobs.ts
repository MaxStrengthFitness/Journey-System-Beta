/**
 * TEAM JOBS — every rule, without React or Firestore.
 *
 * Round: Planner rework, Sep 2026. Shapes and the reasoning behind them are in
 * ./types.ts.
 */

import { addDays, weekdayOf } from "../../studio-tasks/recurrence";
import type { TaskAuthor } from "../../studio-tasks/mutations";
import {
  JOB_DETAIL_MAX,
  JOB_MAX_ASSIGNEES,
  JOB_MAX_PARTS,
  JOB_NOTE_MAX,
  JOB_PART_LABEL_MAX,
  JOB_TITLE_MAX,
  type JobAbout,
  type JobDraft,
  type JobPart,
  type JobStatus,
  type TeamJob,
} from "./types";

/* ------------------------------------------------------------------ *
 * Building a job
 * ------------------------------------------------------------------ */

export function blankJobDraft(): JobDraft {
  return {
    title: "",
    detail: "",
    category: "ops",
    about: { kind: "facility" },
    assignees: [],
    openToAll: true,
    partLabels: [],
    dueOn: null,
    requiresNote: false,
    notifyOnDone: true,
  };
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Part ids are positional and stable: p01, p02 … so a map sorts by key. */
export function partId(index: number): string {
  return `p${String(index + 1).padStart(2, "0")}`;
}

/**
 * The parts a job starts with.
 *
 *   client   one part per client — "client outreach for MIA clients" is a
 *            list of people, and each call is someone's to tick
 *   machine  one part per machine — a deep clean is a list of machines
 *   facility whatever the leader typed, one per line; none is fine, and
 *            then the job is one piece of work
 */
export function partsFor(
  about: JobAbout,
  partLabels: string[],
  machineName: (id: string) => string,
): Record<string, JobPart> {
  const labels: { label: string; refId: string | null }[] =
    about.kind === "client"
      ? about.clientIds.map((id) => ({ label: about.clientNames[id] || "A client", refId: id }))
      : about.kind === "machine"
        ? about.machineIds.map((id) => ({ label: machineName(id) || id, refId: id }))
        : partLabels.map(clean).filter(Boolean).map((label) => ({ label, refId: null }));
  const out: Record<string, JobPart> = {};
  labels.slice(0, JOB_MAX_PARTS).forEach((p, i) => {
    const id = partId(i);
    out[id] = {
      id,
      label: p.label.slice(0, JOB_PART_LABEL_MAX),
      order: i,
      refId: p.refId,
      doneBy: null,
    };
  });
  return out;
}

export interface JobProblem {
  field: "title" | "detail" | "about" | "parts" | "assignees" | "dueOn";
  message: string;
}

export function validateJobDraft(d: JobDraft, todayKey: string): JobProblem[] {
  const out: JobProblem[] = [];
  const title = clean(d.title);
  if (!title) out.push({ field: "title", message: "Say what the job is." });
  if (title.length > JOB_TITLE_MAX) {
    out.push({ field: "title", message: `Keep the title under ${JOB_TITLE_MAX} characters.` });
  }
  if (d.detail.length > JOB_DETAIL_MAX) {
    out.push({ field: "detail", message: `Keep the instructions under ${JOB_DETAIL_MAX.toLocaleString()} characters.` });
  }
  if (d.about.kind === "client" && d.about.clientIds.length === 0) {
    out.push({ field: "about", message: "Pick the clients this job is about." });
  }
  if (d.about.kind === "machine" && d.about.machineIds.length === 0) {
    out.push({ field: "about", message: "Pick the machines this job is about." });
  }
  const count =
    d.about.kind === "client"
      ? d.about.clientIds.length
      : d.about.kind === "machine"
        ? d.about.machineIds.length
        : d.partLabels.map(clean).filter(Boolean).length;
  if (count > JOB_MAX_PARTS) {
    out.push({ field: "parts", message: `A job can have ${JOB_MAX_PARTS} parts at most — split it in two.` });
  }
  if (d.assignees.length > JOB_MAX_ASSIGNEES) {
    out.push({ field: "assignees", message: `Name ${JOB_MAX_ASSIGNEES} people at most.` });
  }
  if (d.dueOn && todayKey && d.dueOn < todayKey) {
    out.push({ field: "dueOn", message: "That date has already passed." });
  }
  return out;
}

/** The document a new job is written as, minus timestamps. */
export function jobFields(
  d: JobDraft,
  studioId: string,
  createdBy: TaskAuthor,
  machineName: (id: string) => string,
): Omit<TeamJob, "id" | "createdAt" | "updatedAt" | "completedAt"> {
  const assignees = uniqueActors(d.assignees).slice(0, JOB_MAX_ASSIGNEES);
  return {
    studioId,
    title: clean(d.title).slice(0, JOB_TITLE_MAX),
    detail: d.detail.trim().slice(0, JOB_DETAIL_MAX),
    category: d.category,
    about:
      d.about.kind === "client"
        ? {
            kind: "client",
            clientIds: d.about.clientIds.slice(0, JOB_MAX_PARTS),
            clientNames: Object.fromEntries(
              d.about.clientIds.slice(0, JOB_MAX_PARTS).map((id) => [id, (d.about as { clientNames: Record<string, string> }).clientNames[id] ?? ""]),
            ),
          }
        : d.about.kind === "machine"
          ? { kind: "machine", machineIds: d.about.machineIds.slice(0, JOB_MAX_PARTS) }
          : { kind: "facility" },
    assignees,
    assigneeIds: assignees.map((a) => a.id),
    // Nobody named means anyone may take it; the flag is only meaningful
    // when somebody is.
    openToAll: assignees.length === 0 ? true : d.openToAll,
    parts: partsFor(d.about, d.partLabels, machineName),
    dueOn: d.dueOn || null,
    requiresNote: d.requiresNote,
    notifyOnDone: d.notifyOnDone,
    status: "open",
    closingNote: null,
    completedBy: null,
    closedOn: null,
    createdBy,
  };
}

export function uniqueActors(list: TaskAuthor[]): TaskAuthor[] {
  const seen = new Set<string>();
  const out: TaskAuthor[] = [];
  for (const a of list) {
    if (!a?.id || seen.has(a.id)) continue;
    seen.add(a.id);
    out.push({ id: a.id, name: (a.name || "A trainer").slice(0, 80) });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * From Firestore — defensive, so one odd document never blanks the lane
 * ------------------------------------------------------------------ */

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const actor = (v: unknown): TaskAuthor | null => {
  const a = v as { id?: unknown; name?: unknown } | null;
  return a && typeof a.id === "string" && a.id ? { id: a.id, name: typeof a.name === "string" ? a.name : "A trainer" } : null;
};

export function jobFromDoc(id: string, studioId: string, d: Record<string, unknown> | undefined): TeamJob {
  const data = d ?? {};
  const rawAbout = (data.about ?? {}) as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const about: JobAbout =
    rawAbout.kind === "client"
      ? {
          kind: "client",
          clientIds: ids(rawAbout.clientIds),
          clientNames:
            rawAbout.clientNames && typeof rawAbout.clientNames === "object"
              ? (rawAbout.clientNames as Record<string, string>)
              : {},
        }
      : rawAbout.kind === "machine"
        ? { kind: "machine", machineIds: ids(rawAbout.machineIds) }
        : { kind: "facility" };
  const parts: Record<string, JobPart> = {};
  const rawParts = data.parts && typeof data.parts === "object" ? (data.parts as Record<string, Record<string, unknown>>) : {};
  for (const [key, p] of Object.entries(rawParts)) {
    if (!p || typeof p !== "object") continue;
    parts[key] = {
      id: key,
      label: str(p.label, JOB_PART_LABEL_MAX) || "Part",
      order: typeof p.order === "number" ? p.order : 999,
      refId: typeof p.refId === "string" ? p.refId : null,
      doneBy: actor(p.doneBy),
      doneAt: p.doneAt,
    };
  }
  const assignees = uniqueActors(Array.isArray(data.assignees) ? (data.assignees as TaskAuthor[]) : []);
  const status: JobStatus = data.status === "done" || data.status === "cancelled" ? data.status : "open";
  return {
    id,
    studioId,
    title: str(data.title, JOB_TITLE_MAX) || "Untitled job",
    detail: str(data.detail, JOB_DETAIL_MAX),
    category: typeof data.category === "string" ? data.category : "ops",
    about,
    assignees,
    assigneeIds: assignees.map((a) => a.id),
    openToAll: assignees.length === 0 ? true : data.openToAll === true,
    parts,
    dueOn: typeof data.dueOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.dueOn) ? data.dueOn : null,
    requiresNote: data.requiresNote === true,
    notifyOnDone: data.notifyOnDone !== false,
    status,
    closingNote: typeof data.closingNote === "string" ? data.closingNote.slice(0, JOB_NOTE_MAX) : null,
    completedBy: actor(data.completedBy),
    completedAt: data.completedAt,
    closedOn: typeof data.closedOn === "string" ? data.closedOn : null,
    createdBy: actor(data.createdBy) ?? { id: "", name: "A leader" },
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

/* ------------------------------------------------------------------ *
 * Reading a job
 * ------------------------------------------------------------------ */

export function sortedParts(job: Pick<TeamJob, "parts">): JobPart[] {
  return Object.values(job.parts).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export interface JobProgress {
  done: number;
  total: number;
  /** Every part ticked (or, with no parts, the job is closed). */
  allDone: boolean;
}

export function jobProgress(job: Pick<TeamJob, "parts" | "status">): JobProgress {
  const parts = Object.values(job.parts);
  if (parts.length === 0) {
    const done = job.status === "done" ? 1 : 0;
    return { done, total: 1, allDone: done === 1 };
  }
  const done = parts.filter((p) => p.doneBy).length;
  return { done, total: parts.length, allDone: done === parts.length };
}

export type JobTiming = "overdue" | "today" | "soon" | "later" | "whenever";

/** How pressing the due date is. "soon" is within three days. */
export function jobTiming(job: Pick<TeamJob, "dueOn">, todayKey: string): JobTiming {
  if (!job.dueOn || !todayKey) return "whenever";
  if (job.dueOn < todayKey) return "overdue";
  if (job.dueOn === todayKey) return "today";
  if (job.dueOn <= addDays(todayKey, 3)) return "soon";
  return "later";
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "today" · "tomorrow" · "Friday" (this week) · "Sep 30". */
export function dayWords(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return "today";
  if (dateKey === addDays(todayKey, 1)) return "tomorrow";
  if (dateKey === addDays(todayKey, -1)) return "yesterday";
  if (dateKey > todayKey && dateKey <= addDays(todayKey, 6)) return WEEKDAY[weekdayOf(dateKey)];
  const [, m, d] = dateKey.split("-").map(Number);
  return `${MONTH[m - 1]} ${d}`;
}

export function dueLabel(job: Pick<TeamJob, "dueOn" | "status">, todayKey: string): string | null {
  if (!job.dueOn) return null;
  const when = dayWords(job.dueOn, todayKey);
  if (job.status !== "open") return `Was due ${when}`;
  return jobTiming(job, todayKey) === "overdue" ? `Overdue — was due ${when}` : `Due ${when}`;
}

export function isUpForGrabs(job: Pick<TeamJob, "status" | "assigneeIds" | "openToAll">): boolean {
  return job.status === "open" && (job.assigneeIds.length === 0 || job.openToAll);
}

export function isOnJob(job: Pick<TeamJob, "assigneeIds">, trainerId: string | null | undefined): boolean {
  return Boolean(trainerId && job.assigneeIds.includes(trainerId));
}

/** Who is on it, in a line: "Priya and Marcus" · "Priya, Marcus and 2 more" · "Nobody yet". */
export function peopleLine(people: TaskAuthor[], meId?: string | null): string {
  if (people.length === 0) return "Nobody yet";
  const first = (a: TaskAuthor) => (a.id === meId ? "you" : a.name.split(" ")[0] || a.name);
  const names = [...people]
    // You first: it is the fact that matters most to the reader.
    .sort((a, b) => Number(b.id === meId) - Number(a.id === meId))
    .map(first);
  if (names.length === 1) return cap(names[0]);
  if (names.length === 2) return cap(`${names[0]} and ${names[1]}`);
  if (names.length === 3) return cap(`${names[0]}, ${names[1]} and ${names[2]}`);
  return cap(`${names[0]}, ${names[1]} and ${names.length - 2} more`);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The order jobs are read in. Yours first (it is your list), then whatever
 * is most pressing, then what nobody has picked up, then newest.
 */
export function sortJobs(jobs: TeamJob[], trainerId: string | null, todayKey: string): TeamJob[] {
  const rank: Record<JobTiming, number> = { overdue: 0, today: 1, soon: 2, later: 3, whenever: 4 };
  const statusRank: Record<JobStatus, number> = { open: 0, done: 1, cancelled: 2 };
  return [...jobs].sort(
    (a, b) =>
      statusRank[a.status] - statusRank[b.status] ||
      Number(isOnJob(b, trainerId)) - Number(isOnJob(a, trainerId)) ||
      rank[jobTiming(a, todayKey)] - rank[jobTiming(b, todayKey)] ||
      (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") ||
      Number(a.assigneeIds.length > 0) - Number(b.assigneeIds.length > 0) ||
      a.title.localeCompare(b.title),
  );
}

/** Which board chip a job belongs under. Jobs show under All too. */
export function jobTopic(job: Pick<TeamJob, "about">): "clients" | "equipment" | "help" {
  if (job.about.kind === "client") return "clients";
  if (job.about.kind === "machine") return "equipment";
  return "help";
}

/** What closing a job needs, or null when it can be closed. */
export function closeProblem(job: Pick<TeamJob, "requiresNote">, note: string): string | null {
  const n = note.trim();
  if (job.requiresNote && n.length < 3) return "This job asks for a closing message — what did you find or do?";
  if (n.length > JOB_NOTE_MAX) return `Keep it under ${JOB_NOTE_MAX.toLocaleString()} characters.`;
  return null;
}

/** People who ticked at least one part, in the order parts are listed. */
export function contributors(job: Pick<TeamJob, "parts">): TaskAuthor[] {
  return uniqueActors(sortedParts(job).map((p) => p.doneBy).filter((a): a is TaskAuthor => Boolean(a)));
}

/** How many parts each person ticked. */
export function partsBy(job: Pick<TeamJob, "parts">, trainerId: string): number {
  return Object.values(job.parts).filter((p) => p.doneBy?.id === trainerId).length;
}

export function jobErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? "";
  if (code === "permission-denied") {
    return "The database refused that. Posting and editing a job is for head trainers and studio leaders; if that's you, the new rules may not be deployed yet.";
  }
  if (code === "unavailable" || code === "deadline-exceeded") return "No connection right now. Try again in a moment.";
  if (code === "unauthenticated") return "You've been signed out. Sign back in and try again.";
  return "Couldn't save that. Try again.";
}

/* ------------------------------------------------------------------ *
 * The composer's helpers
 * ------------------------------------------------------------------ */

export interface DueChoice {
  label: string;
  dateKey: string;
}

/**
 * One-tap due dates. "By Friday" is the coming Friday — next week's when it
 * is already Friday or the weekend, because "by Friday" said on a Saturday
 * means the next one.
 */
export function dueChoices(todayKey: string): DueChoice[] {
  const dow = weekdayOf(todayKey);
  const toFriday = dow < 5 ? 5 - dow : 12 - dow;
  return [
    { label: "Today", dateKey: todayKey },
    { label: "Tomorrow", dateKey: addDays(todayKey, 1) },
    { label: "By Friday", dateKey: addDays(todayKey, toFriday) },
    { label: "In a week", dateKey: addDays(todayKey, 7) },
    { label: "In two weeks", dateKey: addDays(todayKey, 14) },
  ];
}

/** The review sentence under the composer: what posting this will do. */
export function jobSummary(
  d: JobDraft,
  todayKey: string,
  opts: { meId?: string | null } = {},
): string {
  const partCount =
    d.about.kind === "client"
      ? d.about.clientIds.length
      : d.about.kind === "machine"
        ? d.about.machineIds.length
        : d.partLabels.map(clean).filter(Boolean).length;
  const what =
    d.about.kind === "client"
      ? `${partCount} client${partCount === 1 ? "" : "s"} to tick off`
      : d.about.kind === "machine"
        ? `${partCount} machine${partCount === 1 ? "" : "s"} to tick off`
        : partCount > 0
          ? `${partCount} part${partCount === 1 ? "" : "s"} to tick off`
          : "one piece of work";
  const who =
    d.assignees.length === 0
      ? "Up for grabs — anyone at the studio can take it"
      : `${peopleLine(uniqueActors(d.assignees), opts.meId)} ${d.assignees.length === 1 ? "is" : "are"} on it${d.openToAll ? ", and anyone else can join" : ""}`;
  const when = d.dueOn ? `, due ${dayWords(d.dueOn, todayKey)}` : ", no due date";
  const close = d.requiresNote ? " Closing it needs a message." : "";
  return `${who}${when}. ${cap(what)}.${close}`;
}
