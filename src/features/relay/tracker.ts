/**
 * THE TRACKER — a trainer's own list, by WHEN (Relay room, Sep 28 2026; the
 * redesign's phase 5, AJ's "mission tracker").
 *
 * Mine sorted work by where it came from (your list, handed to you, team
 * jobs, assigned at the studio, follow-ups, coming up, growth, done today):
 * eight lanes that answered "whose is it" when a trainer between sessions is
 * asking "what's next". Things 3 sorts by when, and so does the Tracker:
 *
 *   TODAY
 *     Handed to you  work with your name on it that someone else put there:
 *                    an ask handed to you, a studio chore a leader assigned
 *                    you, a team job with your name. A leader's assignment
 *                    is simply yours (AJ, q5), so it offers Done and "I
 *                    can't", never "Take it · Not me · Later".
 *     Now            your own to-dos for today, and anything you took on
 *                    the Board that is due today or overdue
 *     Follow-ups     your clients' birthdays and the dates they mentioned,
 *                    in the next two weeks (board/mine.ts)
 *     Closing        your own to-dos for the end of the day (the closing
 *                    shift, or a time from Closing on) — Things 3's "This
 *                    Evening"
 *   Coming up        your timed to-dos in the next six days, and what you
 *                    took that is due later
 *   Anytime          what you took with no day on it (an ask, a team job)
 *   Someday · Growth your own growth as a trainer, kept out of Today
 *   Done             what you finished today: your to-dos, the chores and
 *                    asks you closed, the jobs you finished
 *
 * Over the data that exists today and nothing more: the personal task
 * lists, the studio's rows, the asks and the team jobs the tab already
 * reads. Nothing is stored for it. A to-do always has a day in Journey (a
 * personal task lands on today unless another is picked), so Anytime holds
 * only work taken from the Board.
 *
 * Pure: no React, no Firestore, no clock of its own.
 */
import { taskScopeOf, type TaskRow, type TaskTemplate } from "../studio-tasks/types";
import type { TaskRequest } from "../studio-tasks/requests";
import type { TeamJob } from "./jobs/types";
import { upcomingTimed, type Upcoming } from "./reminders/reminders";
import { addDays } from "../studio-tasks/recurrence";
import { isGrowthRow, type FollowUp } from "./board/mine";
import { clockToMinutes } from "./board/now-context";
import { studioDateKey } from "../../lib/studio-time";

export type TrackerList = "today" | "coming" | "anytime" | "someday" | "done";

export const TRACKER_LISTS: { id: TrackerList; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "coming", label: "Coming up" },
  { id: "anytime", label: "Anytime" },
  { id: "someday", label: "Someday · Growth" },
  { id: "done", label: "Done" },
];

/** Something with your name on it that someone else put there. */
export type HandedItem =
  | { kind: "ask"; key: string; request: TaskRequest; from: string }
  | { kind: "row"; key: string; row: TaskRow; from: string | null }
  | { kind: "job"; key: string; job: TeamJob; from: string };

/** Something you took on the Board (claimed, or a job you are on). */
export type TakenItem =
  | { kind: "ask"; key: string; request: TaskRequest; due: string | null }
  | { kind: "job"; key: string; job: TeamJob; due: string | null };

export interface DoneEntry {
  key: string;
  /** When it was done (ms since epoch), or null when the time isn't known. */
  at: number | null;
  what: string;
  where: "Your list" | "Floor" | "Asks" | "Team jobs";
  /** Your own to-do, so the Done list can reopen it (a tick taken back). */
  row?: TaskRow;
  /** A team job, so the Done list can say when it was claimed and finished. */
  job?: TeamJob;
}

export interface TrackerInput {
  rows: TaskRow[];
  templates: TaskTemplate[];
  /** Open asks. */
  requests: TaskRequest[];
  /** Asks closed recently (useStudioRequests' recentlyResolved). */
  resolved: TaskRequest[];
  /** Open and recently closed team jobs. */
  jobs: TeamJob[];
  followUps: FollowUp[];
  /** The Auth uid and the trainer document id: the two differ on older accounts. */
  uid: string | null;
  trainerId: string | null;
  todayKey: string;
  /** When Closing starts, in minutes since the studio's midnight. */
  closingMin: number;
}

export interface Tracker {
  handed: HandedItem[];
  now: TaskRow[];
  nowTaken: TakenItem[];
  followUps: FollowUp[];
  closing: TaskRow[];
  coming: Upcoming[];
  comingTaken: TakenItem[];
  anytime: TakenItem[];
  someday: TaskRow[];
  done: DoneEntry[];
  counts: Record<TrackerList, number>;
}

const millis = (v: unknown): number => (v as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
const dayOfMillis = (ms: number): string | null => (ms ? studioDateKey(new Date(ms)) : null);

/** "HH:MM" first (earliest first), then untimed, then by title. */
function byTimeThenTitle(a: TaskRow, b: TaskRow): number {
  const ta = a.template.timeOfDay ?? "";
  const tb = b.template.timeOfDay ?? "";
  if (ta && tb && ta !== tb) return ta.localeCompare(tb);
  if (ta && !tb) return -1;
  if (!ta && tb) return 1;
  return a.title.localeCompare(b.title);
}

/** A to-do for the end of the day: the closing shift, or a time from Closing on. */
export function isClosingRow(row: TaskRow, closingMin: number): boolean {
  if (row.shift === "pm") return true;
  const t = clockToMinutes(row.template.timeOfDay ?? null);
  return t !== null && t >= closingMin;
}

export function buildTracker(input: TrackerInput): Tracker {
  const me = new Set([input.uid, input.trainerId].filter(Boolean) as string[]);
  const isMe = (id: string | null | undefined) => Boolean(id && me.has(id));

  /* Handed to you. */
  const handed: HandedItem[] = [];
  for (const r of input.requests) {
    if (r.status !== "open" || r.kind === "initiative" || !isMe(r.forId)) continue;
    handed.push({ kind: "ask", key: `ask:${r.id}`, request: r, from: r.createdBy.name });
  }
  for (const row of input.rows) {
    if (taskScopeOf(row.template) === "personal" || row.status !== "open") continue;
    if (!isMe(row.instance?.assignedTo?.id)) continue;
    handed.push({ kind: "row", key: `row:${row.id}`, row, from: row.instance?.assignedBy?.name ?? null });
  }
  for (const j of input.jobs) {
    if (j.status !== "open" || !j.assigneeIds.some(isMe) || isMe(j.createdBy?.id)) continue;
    handed.push({ kind: "job", key: `job:${j.id}`, job: j, from: j.createdBy?.name ?? "The studio" });
  }

  /* Your own to-dos, today. */
  const personal = input.rows.filter((r) => taskScopeOf(r.template) === "personal");
  const openToday = personal.filter((r) => r.status === "open").sort(byTimeThenTitle);
  const someday = openToday.filter(isGrowthRow);
  const ordinary = openToday.filter((r) => !isGrowthRow(r));
  const closing = ordinary.filter((r) => isClosingRow(r, input.closingMin));
  const now = ordinary.filter((r) => !isClosingRow(r, input.closingMin));

  /* What you took on the Board, sorted by its day. */
  const taken: TakenItem[] = [];
  const handedKeys = new Set(handed.map((h) => h.key));
  for (const r of input.requests) {
    if (r.status !== "open" || r.kind === "initiative" || !isMe(r.claimedBy?.id)) continue;
    if (handedKeys.has(`ask:${r.id}`)) continue;
    taken.push({ kind: "ask", key: `ask:${r.id}`, request: r, due: r.dueOn ?? null });
  }
  for (const j of input.jobs) {
    if (j.status !== "open" || !j.assigneeIds.some(isMe)) continue;
    if (handedKeys.has(`job:${j.id}`)) continue;
    taken.push({ kind: "job", key: `job:${j.id}`, job: j, due: j.dueOn ?? null });
  }
  const nowTaken = taken.filter((t) => t.due !== null && t.due <= input.todayKey);
  const comingTaken = taken.filter((t) => t.due !== null && t.due > input.todayKey).sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
  const anytime = taken.filter((t) => t.due === null);

  /* Coming up: your timed to-dos from tomorrow, six days. */
  const coming = upcomingTimed(
    input.templates.filter((t) => taskScopeOf(t) === "personal"),
    addDays(input.todayKey, 1),
    6,
  );

  /* Done, today. */
  const done: DoneEntry[] = [];
  for (const r of personal) {
    if (r.status !== "done") continue;
    done.push({ key: `row:${r.id}`, at: millis(r.instance?.completedAt) || null, what: r.title, where: "Your list", row: r });
  }
  for (const r of input.rows) {
    if (taskScopeOf(r.template) === "personal" || r.status !== "done" || !isMe(r.instance?.completedBy?.id)) continue;
    done.push({
      key: `row:${r.id}`,
      at: millis(r.instance?.completedAt) || null,
      what: r.machineName ? `${r.title}: ${r.machineName}` : r.title,
      where: "Floor",
    });
  }
  for (const r of input.resolved) {
    if (!isMe(r.resolvedBy?.id)) continue;
    const at = millis(r.resolvedAt);
    if (dayOfMillis(at) !== input.todayKey) continue;
    done.push({ key: `ask:${r.id}`, at, what: r.title, where: "Asks" });
  }
  for (const j of input.jobs) {
    if (j.status !== "done" || !isMe(j.completedBy?.id)) continue;
    const at = millis(j.completedAt);
    if ((j.closedOn ?? dayOfMillis(at)) !== input.todayKey) continue;
    done.push({ key: `job:${j.id}`, at: at || null, what: j.title, where: "Team jobs", job: j });
  }
  done.sort((a, b) => (b.at ?? 0) - (a.at ?? 0) || a.what.localeCompare(b.what));

  return {
    handed,
    now,
    nowTaken,
    followUps: input.followUps,
    closing,
    coming,
    comingTaken,
    anytime,
    someday,
    done,
    counts: {
      today: handed.length + now.length + nowTaken.length + input.followUps.length + closing.length,
      coming: coming.length + comingTaken.length,
      anytime: anytime.length,
      someday: someday.length,
      done: done.length,
    },
  };
}
