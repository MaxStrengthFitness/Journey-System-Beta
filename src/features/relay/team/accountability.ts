/**
 * TEAM'S ARITHMETIC — what each person has with their name on it, and what
 * they finished, over the last seven studio days (My Studio → Team).
 *
 * Round: Planner rework, Sep 2026. AJ: "Studio leaders need to be able to see
 * what the team is assigned, what they've completed and what they are failing
 * to do and who might be failing to do so." The voice-review round (Sep 27
 * 2026) took the verdict out: no "behind" or "on track", people listed by
 * name, each card only its own person's sentences.
 *
 * WHAT COUNTS — AND WHAT NEVER DOES
 * Only work with a person's name on it is said on that person's card:
 *
 *   - a studio task a head trainer ASSIGNED them, on a day that is over,
 *     still open                                       → "missed"
 *   - a studio task they CLAIMED themselves (and nobody assigned), on a day
 *     that is over, still open                          → "left open"
 *   - a team job they are ON, past its due date, with parts left
 *   - a request they claimed that is still open after two days
 *   - an initiative whose due date has passed without their number met
 *
 * Unassigned shift work is the TEAM's, and the per-task "Last 7 days" table
 * already answers for it; charging it to "whoever was working" would blame
 * people for a list nobody gave them. Assignment and claims are advisory (see
 * features/studio-tasks/types.ts) — so a task someone ELSE finished is done,
 * and is never held against the person named on it. Skipped is not missed.
 * And nothing here looks at notes: the anti-blocker rule (ARCHITECTURE §1.6)
 * says a trainer is never measured on whether they wrote one.
 *
 * TODAY IS NOT JUDGED. A task assigned for today is "open", not "missed",
 * until the studio day is over — closing duties are open at 3pm by design.
 *
 * A SENTENCE COUNTS WHAT IT NAMES (voice review follow-up, Sep 27 2026).
 * "Finished ... in the last seven days" counts tasks, job parts and jobs
 * inside those seven days only. The jobs read looks back fourteen days
 * (useTeamJobs), and a part ticked a month ago on a job still open used to
 * count as this week's.
 *
 * SENTENCES, NOT SCORES: every line is a count with the things counted named.
 * No percentages — a rate over two assigned tasks is a confident wrong number.
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { TaskAuthor } from "../../studio-tasks/mutations";
import { SHIFT_LABEL, type TaskInstance, type TaskTemplate } from "../../studio-tasks/types";
import type { InitiativeProgress } from "../../studio-tasks/initiatives";
import { dayWords, jobProgress, jobTiming } from "../jobs/jobs";
import type { TeamJob } from "../jobs/types";
import { addDays, weekdayOf } from "../../studio-tasks/recurrence";
import { studioDateKey, type DateLike } from "../../../lib/studio-time";

/** How long a claimed request may sit open before it is "holding". */
export const HOLDING_DAYS = 2;

/** Team's window: the last seven studio days, today included. */
const TEAM_DAYS = 7;

/** The first studio day of a window of `days` days that ends today. */
export const firstDayOf = (todayKey: string, days = TEAM_DAYS): string => addDays(todayKey, -(days - 1));

/** The studio day a stored moment fell on, or null when there is none. */
const studioDayOf = (v: unknown): string | null => (v ? studioDateKey(v as DateLike) : null);

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const shortDay = (dateKey: string) => DAY[weekdayOf(dateKey)];

export interface MissedItem {
  templateId: string;
  title: string;
  dateKey: string;
  shift: TaskInstance["shift"];
  /** Rows in the group (a machine task is one row per machine). */
  rows: number;
}

export interface JobFlag {
  jobId: string;
  title: string;
  dueOn: string;
  left: number;
}

export interface HeldRequest {
  requestId: string;
  title: string;
  days: number;
}

export interface InitiativeFlag {
  requestId: string;
  title: string;
  count: number;
  target: number;
  overdue: boolean;
}

/**
 * One sentence on a person's card: `flag` is something still open with their
 * name on it, `good` something they finished. No line is a verdict on them.
 */
export interface RecordLine {
  text: string;
  tone: "flag" | "plain" | "good";
}

export interface PersonRecord {
  person: TaskAuthor;
  /** Today's studio tasks with their name on them. */
  today: { assigned: number; done: number };
  /** Past days in the window. */
  week: {
    assigned: number;
    assignedDone: number;
    missed: MissedItem[];
    leftOpen: MissedItem[];
    /** Rows they closed, assigned or not. */
    finished: number;
  };
  jobs: {
    on: number;
    overdue: JobFlag[];
    /** Parts they ticked inside the window. */
    partsDone: number;
    /** Jobs they closed inside the window. */
    closed: number;
  };
  holding: HeldRequest[];
  initiatives: InitiativeFlag[];
  /** Plain-English lines, most important first. */
  lines: RecordLine[];
}

export interface TeamRequestLike {
  id: string;
  kind: string;
  title: string;
  status: string;
  claimedBy?: TaskAuthor | null;
  claimedAt?: unknown;
}

export interface InitiativeLike {
  id: string;
  title: string;
  dueOn?: string;
  progress: InitiativeProgress;
}

export interface TeamRecordInput {
  roster: TaskAuthor[];
  todayKey: string;
  /** Every studio task instance in the window, today included. */
  instances: TaskInstance[];
  templates: TaskTemplate[];
  jobs: TeamJob[];
  requests: TeamRequestLike[];
  initiatives: InitiativeLike[];
  /** The window in studio days, today included: seven unless a test says otherwise. */
  days?: number;
  now?: number;
}

function millis(v: unknown): number {
  if (!v) return 0;
  const t = v as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  if (v instanceof Date) return v.getTime();
  return typeof v === "number" ? v : 0;
}

/** Instance rows grouped the way a person reads them: one line per task per day. */
function groupMissed(list: { inst: TaskInstance; title: string }[]): MissedItem[] {
  const byKey = new Map<string, MissedItem>();
  for (const { inst, title } of list) {
    const key = `${inst.templateId}|${inst.localDate}|${inst.shift}`;
    const hit = byKey.get(key);
    if (hit) hit.rows += 1;
    else byKey.set(key, { templateId: inst.templateId, title, dateKey: inst.localDate, shift: inst.shift, rows: 1 });
  }
  return [...byKey.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey) || a.title.localeCompare(b.title));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Closing checklist (Mon), Wipe down every machine (Sat, 12 machines)". */
export function missedList(items: MissedItem[], max = 3): string {
  const shown = items.slice(0, max).map((m) => {
    const bits = [shortDay(m.dateKey)];
    if (m.rows > 1) bits.push(`${m.rows} machines`);
    const shift = m.shift !== "any" && !/open|clos/i.test(m.title) ? ` — ${SHIFT_LABEL[m.shift].toLowerCase()}` : "";
    return `${m.title}${shift} (${bits.join(", ")})`;
  });
  const more = items.length - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(", ");
}

export function teamRecord(input: TeamRecordInput): PersonRecord[] {
  const { roster, todayKey, instances, templates, jobs, requests, initiatives } = input;
  const now = input.now ?? Date.now();
  const fromKey = firstDayOf(todayKey, input.days ?? TEAM_DAYS);
  const inWindow = (day: string | null | undefined) => Boolean(day && day >= fromKey && day <= todayKey);
  const titleOf = new Map(templates.map((t) => [t.id, t.title]));
  const studioInstances = instances.filter((i) => i.scope !== "personal");

  // Anyone who acted in the window but is not on the roster still gets a row
  // if something is held against them — a guest who was assigned closing.
  const people = new Map<string, TaskAuthor>();
  for (const p of roster) people.set(p.id, p);
  for (const i of studioInstances) {
    if (i.assignedTo?.id && !people.has(i.assignedTo.id)) people.set(i.assignedTo.id, i.assignedTo);
  }

  return [...people.values()]
    .map((person) => {
      const id = person.id;
      const mine = studioInstances.filter((i) => i.assignedTo?.id === id);
      const today = mine.filter((i) => i.localDate === todayKey);
      const past = mine.filter((i) => i.localDate < todayKey);
      const missed = groupMissed(
        past.filter((i) => i.status === "open").map((inst) => ({ inst, title: titleOf.get(inst.templateId) ?? "A studio task" })),
      );
      const leftOpen = groupMissed(
        studioInstances
          .filter((i) => i.localDate < todayKey && !i.assignedTo?.id && i.claimedBy?.id === id && i.status === "open")
          .map((inst) => ({ inst, title: titleOf.get(inst.templateId) ?? "A studio task" })),
      );
      const finished = studioInstances.filter((i) => i.status === "done" && i.completedBy?.id === id).length;

      const onJobs = jobs.filter((j) => j.status === "open" && j.assigneeIds.includes(id));
      const overdue: JobFlag[] = onJobs
        .filter((j) => jobTiming(j, todayKey) === "overdue")
        .map((j) => {
          const p = jobProgress(j);
          return { jobId: j.id, title: j.title, dueOn: j.dueOn!, left: p.total - p.done };
        })
        .filter((f) => f.left > 0);
      // Inside the window only: a part ticked weeks ago on a job still open,
      // or a job closed thirteen days ago, is not "the last seven days".
      const partsDone = jobs.reduce(
        (n, j) => n + Object.values(j.parts).filter((p) => p.doneBy?.id === id && inWindow(studioDayOf(p.doneAt))).length,
        0,
      );
      const closed = jobs.filter(
        (j) => j.status === "done" && j.completedBy?.id === id && inWindow(j.closedOn ?? studioDayOf(j.completedAt)),
      ).length;

      const holding: HeldRequest[] = requests
        .filter((r) => r.status === "open" && r.kind !== "initiative" && r.claimedBy?.id === id)
        .map((r) => {
          const at = millis(r.claimedAt);
          return { requestId: r.id, title: r.title, days: at ? Math.floor((now - at) / 86_400_000) : 0 };
        })
        .filter((h) => h.days >= HOLDING_DAYS);

      const initiativeFlags: InitiativeFlag[] = initiatives
        .map((ini) => {
          const row = ini.progress.perTrainer.find((t) => t.trainerId === id);
          if (!row) return null;
          const overdueIni = Boolean(ini.dueOn && ini.dueOn < todayKey);
          return {
            requestId: ini.id,
            title: ini.title,
            count: row.count,
            target: row.target,
            overdue: overdueIni,
            met: row.met,
          };
        })
        .filter((x): x is InitiativeFlag & { met: boolean } => Boolean(x) && !x!.met)
        .map(({ met: _met, ...f }) => f);

      const lines: RecordLine[] = [];
      const flag = (text: string) => lines.push({ text, tone: "flag" });
      const plain = (text: string) => lines.push({ text, tone: "plain" });
      const good = (text: string) => lines.push({ text, tone: "good" });
      if (missed.length) {
        const rows = missed.length;
        flag(`Missed ${plural(rows, "assigned task")}: ${missedList(missed)}.`);
      }
      if (overdue.length) {
        for (const f of overdue.slice(0, 2)) {
          flag(`On “${f.title}” — overdue since ${dayWords(f.dueOn, todayKey)}, ${plural(f.left, "part")} left.`);
        }
      }
      if (holding.length) {
        const h = holding[0];
        flag(`Has held “${h.title}” for ${plural(h.days, "day")}${holding.length > 1 ? ` (and ${holding.length - 1} more)` : ""}.`);
      }
      if (leftOpen.length) {
        flag(`Took ${plural(leftOpen.length, "task")} and left ${leftOpen.length === 1 ? "it" : "them"} open: ${missedList(leftOpen)}.`);
      }
      for (const f of initiativeFlags.slice(0, 2)) {
        const say = f.overdue ? flag : plain;
        if (f.target > 0) {
          say(`${f.count} of ${f.target} for “${f.title}”${f.overdue ? " — past its date" : ""}.`);
        } else if (f.overdue) {
          say(`Nothing logged for “${f.title}”, which is past its date.`);
        }
      }
      if (today.length) {
        const done = today.filter((i) => i.status !== "open").length;
        if (done === today.length) good(`Today: all ${plural(today.length, "assigned task")} done.`);
        else plain(`Today: ${done} of ${plural(today.length, "assigned task")} done so far.`);
      }
      if (onJobs.length && !overdue.length) {
        plain(`On ${plural(onJobs.length, "team job")}, none overdue.`);
      }
      const credit: string[] = [];
      if (finished) credit.push(plural(finished, "task"));
      if (partsDone) credit.push(plural(partsDone, "job part"));
      if (closed) credit.push(plural(closed, "job"));
      if (credit.length) good(`Finished ${credit.join(", ")} in the last seven days.`);
      if (!lines.length) plain("Nothing with their name on it in the last seven days.");

      return {
        person,
        today: { assigned: today.length, done: today.filter((i) => i.status !== "open").length },
        week: {
          assigned: past.length,
          assignedDone: past.filter((i) => i.status !== "open").length,
          missed,
          leftOpen,
          finished,
        },
        jobs: { on: onJobs.length, overdue, partsDone, closed },
        holding,
        initiatives: initiativeFlags,
        lines,
      } satisfies PersonRecord;
    })
    // By name (voice-review round, Sep 27 2026). They were ordered behind
    // first and then by a weight nobody saw (missed x3, overdue x2, ...),
    // which made the list a ranking of the team. Recognition, never ranking
    // (AJ's Do it on "Recognition turns into ranking", and question 4: per
    // trainer, "no list sorted worst first"). Each card's own sentences say
    // what that person has on them; no card outranks another.
    .sort((a, b) => a.person.name.localeCompare(b.person.name));
}

/* ------------------------------------------------------------------ *
 * Open loops: the shift list's machine reports
 * ------------------------------------------------------------------ */

/** A problem reported on the shift list, still open on Team. */
export interface ShiftReport {
  /** The machine, or the task row itself for a report with no machine. */
  key: string;
  machineId?: string;
  templateId: string;
  /**
   * The duty's title as the row itself recorded it (instancePayload writes
   * it), so a report still reads after its template is renamed or deleted.
   */
  title?: string;
  /** The studio day it was reported. */
  dateKey: string;
  note?: string;
  by: TaskAuthor | null;
}

/**
 * The shift list's reports for Open loops (voice review follow-up, Sep 27
 * 2026): a flagged task row — a machine check closed with a problem — from
 * Team's seven days, not only today's. They used to drop off Team at
 * midnight while the seven-day table beside them still showed the flag.
 *
 * ONE ROW PER MACHINE, the latest report on it; and none for a machine the
 * Floor Map already flags, which Open loops lists on a row of its own.
 *
 * A REPORT IS A ROW CLOSED WITH A PROBLEM: status "done" and flagged. A
 * skipped row is not one (useMachineUpkeep leaves those out too), and nor
 * is a reopened one — reopening keeps the old `flagged` on the document
 * (instancePayload only writes it when told), but the check is no longer
 * closed, and it has nobody's name on it.
 *
 * A LATER CLEAN CHECK CLOSES IT. When the same duty on the same machine was
 * done without a flag on a later day, the problem was looked at again and
 * not found, so the report is over: Team has no button to clear a report,
 * and without this one would sit on Open loops until it aged out of the
 * week. Team's seven days are otherwise the whole reach on purpose:
 * Learning and the Catalog keep a report until someone clears it
 * (useMachineUpkeep). Whether a report should outlive the week belongs with
 * the one maintenance log, AJ's call.
 *
 * `instances` may hold the same row twice (the seven-day read and today's
 * live one): the LATER one in the list wins, so pass the live rows last.
 */
export function shiftListReports(
  instances: readonly (TaskInstance | null | undefined)[],
  /**
   * The machines the Floor Map flags. Kept for callers; since the one
   * maintenance record (Oct 2 2026) no machine row is a report here at all.
   */
  _floorMapFlagged: ReadonlySet<string> = new Set(),
): ShiftReport[] {
  const latestById = new Map<string, TaskInstance>();
  for (const i of instances) if (i?.id) latestById.set(i.id, i);
  const rows = [...latestById.values()].filter((i) => i.scope !== "personal");
  // The last day each duty (on each machine) was closed clean.
  const dutyKey = (i: TaskInstance) => `${i.templateId}|${i.machineId ?? ""}`;
  const lastClean = new Map<string, string>();
  for (const i of rows) {
    if (i.status !== "done" || i.flagged) continue;
    const had = lastClean.get(dutyKey(i));
    if (!had || had < i.localDate) lastClean.set(dutyKey(i), i.localDate);
  }
  const byKey = new Map<string, ShiftReport>();
  for (const i of rows) {
    if (!i.flagged || i.status !== "done") continue;
    // ONE MAINTENANCE RECORD (Oct 2 2026): a problem on a MACHINE row flags
    // the machine in its care record when it is reported
    // (useTaskActions.closeWithNote, machine-care.ts checklistFlagFor), and
    // Open loops lists that flag as a Flagged machine. So a machine row is
    // never a report of its own here: a flag cleared on the Floor Map is
    // cleared on Team too, and the two can't disagree. Only a duty with no
    // machine is a shift-list report.
    if (i.machineId) continue;
    const clean = lastClean.get(dutyKey(i));
    if (clean && clean > i.localDate) continue;
    const key = i.machineId || i.id;
    const had = byKey.get(key);
    if (had && had.dateKey >= i.localDate) continue;
    byKey.set(key, {
      key,
      ...(i.machineId ? { machineId: i.machineId } : {}),
      templateId: i.templateId,
      ...(i.title ? { title: i.title } : {}),
      dateKey: i.localDate,
      ...(i.note ? { note: i.note } : {}),
      by: i.completedBy ?? null,
    });
  }
  return [...byKey.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey) || a.key.localeCompare(b.key));
}
