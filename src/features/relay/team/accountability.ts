/**
 * THE TEAM TAB'S ARITHMETIC — who has work with their name on it, who
 * finished it, and who is behind.
 *
 * Round: Planner rework, Sep 2026. AJ: "Studio leaders need to be able to see
 * what the team is assigned, what they've completed and what they are failing
 * to do and who might be failing to do so."
 *
 * WHAT COUNTS — AND WHAT NEVER DOES
 * Only work with a person's name on it can be held against that person:
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

/** How long a claimed request may sit open before it is "holding". */
export const HOLDING_DAYS = 2;

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

export type Standing = "behind" | "on-track" | "quiet";

/** One sentence on a person's card. `flag` lines are the reasons they are behind. */
export interface RecordLine {
  text: string;
  tone: "flag" | "plain" | "good";
}

export interface PersonRecord {
  person: TaskAuthor;
  standing: Standing;
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
    /** Parts they ticked on open or recently finished jobs. */
    partsDone: number;
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
      const partsDone = jobs.reduce(
        (n, j) => n + Object.values(j.parts).filter((p) => p.doneBy?.id === id).length,
        0,
      );
      const closed = jobs.filter((j) => j.status === "done" && j.completedBy?.id === id).length;

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

      const behind =
        missed.length > 0 ||
        leftOpen.length > 0 ||
        overdue.length > 0 ||
        holding.length > 0 ||
        initiativeFlags.some((f) => f.overdue);
      const anything =
        mine.length > 0 || onJobs.length > 0 || finished > 0 || partsDone > 0 || closed > 0 || initiativeFlags.length > 0;
      const standing: Standing = behind ? "behind" : anything ? "on-track" : "quiet";

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
      if (credit.length) good(`Finished ${credit.join(", ")} this week.`);
      if (!lines.length) plain("Nothing with their name on it this week.");

      return {
        person,
        standing,
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
    .sort((a, b) => {
      const rank: Record<Standing, number> = { behind: 0, "on-track": 1, quiet: 2 };
      const weight = (r: PersonRecord) =>
        r.week.missed.length * 3 + r.jobs.overdue.length * 2 + r.holding.length + r.week.leftOpen.length;
      return rank[a.standing] - rank[b.standing] || weight(b) - weight(a) || a.person.name.localeCompare(b.person.name);
    });
}

export interface TeamSummary {
  assignedPast: number;
  assignedPastDone: number;
  behind: number;
  jobsOpen: number;
  jobsOverdue: number;
  upForGrabs: number;
}

export function teamSummary(records: PersonRecord[], jobs: TeamJob[], todayKey: string): TeamSummary {
  const open = jobs.filter((j) => j.status === "open");
  return {
    assignedPast: records.reduce((n, r) => n + r.week.assigned, 0),
    assignedPastDone: records.reduce((n, r) => n + r.week.assignedDone, 0),
    behind: records.filter((r) => r.standing === "behind").length,
    jobsOpen: open.length,
    jobsOverdue: open.filter((j) => jobTiming(j, todayKey) === "overdue").length,
    upForGrabs: open.filter((j) => j.assigneeIds.length === 0).length,
  };
}

/** The window the Team tab reads: the last seven studio days, today included. */
export function teamWindow(todayKey: string, days = 7): { from: string; to: string } {
  return { from: addDays(todayKey, -(days - 1)), to: todayKey };
}
