/**
 * NEXT UP — at most three things for THIS trainer, RIGHT NOW.
 *
 * Round: Relay, Sep 2026. The Sep 16 Floor was a stack of lanes that, on a
 * quiet day, read as mostly empty-state copy and never answered "I have
 * twelve minutes — what should I do?". This ranks everything open on the
 * Floor by a visible rule and returns the top three:
 *
 *   1. handed to me by name, or assigned to me
 *   2. overdue or due today
 *   3. fits the gap before my next session (estMinutes vs gapMinutes)
 *   4. nobody is on it yet
 *   5. about the client I just trained, or a machine we just used
 *
 * Pure. Items are built from the rows, jobs and asks the Floor already
 * holds, so the queue costs no read. "Not me" snoozes an item for the rest of
 * the shift phase in module memory — an iPad's worth of "later", nothing
 * written, nothing anyone else sees.
 */
import type { TaskRequest } from "../../studio-tasks/requests";
import type { TaskRow } from "../../studio-tasks/types";
import { shiftGroups, type ShiftGroup } from "../../studio-tasks/board";
import { isOnJob, isUpForGrabs, jobTiming } from "../jobs/jobs";
import type { TeamJob } from "../jobs/types";
import { fitsGap, type ShiftPhase } from "./now-context";
import { forgetOnSignOut } from "../../sign-out/memory";

export type NextUpItem =
  | { kind: "group"; id: string; group: ShiftGroup; title: string; estMinutes: number | null; origin: "floor" }
  | { kind: "client"; id: string; row: TaskRow; title: string; estMinutes: number | null; origin: "floor" }
  | { kind: "ask"; id: string; request: TaskRequest; title: string; estMinutes: number | null; origin: "floor" | "mine" }
  | { kind: "job"; id: string; job: TeamJob; title: string; estMinutes: number | null; origin: "floor" };

export interface NextUpScored {
  item: NextUpItem;
  score: number;
  /** The reasons, in words, for the card's small print. */
  why: string[];
  fits: boolean | null;
}

export interface NextUpInput {
  rows: TaskRow[];
  jobs: TeamJob[];
  requests: TaskRequest[];
  trainerId: string | null;
  uid: string | null;
  todayKey: string;
  gapMinutes: number | null;
  /** Client of the session that just ended, and the machines it used. */
  lastClientId?: string | null;
  lastMachineIds?: string[];
  snoozed?: Set<string>;
  limit?: number;
}

/** Wiping a machine is two minutes; a whole group is its open count × that. */
const MINUTES_PER_MACHINE_ROW = 2;
const DEFAULT_TASK_MINUTES = 5;

function groupMinutes(g: ShiftGroup): number | null {
  const est = g.rows[0]?.template.estMinutes;
  const open = g.total - g.done;
  if (typeof est === "number") return g.rows[0]?.template.kind === "machine" ? est * open : est;
  if (g.rows[0]?.template.kind === "machine") return MINUTES_PER_MACHINE_ROW * open;
  return DEFAULT_TASK_MINUTES;
}

export function nextUpItems(input: NextUpInput): NextUpItem[] {
  const out: NextUpItem[] = [];
  const shift: TaskRow[] = [];
  for (const r of input.rows) {
    if (r.status !== "open") continue;
    if (r.kind === "client") {
      out.push({ kind: "client", id: `row:${r.id}`, row: r, title: r.title, estMinutes: r.template.estMinutes ?? DEFAULT_TASK_MINUTES, origin: "floor" });
    } else {
      shift.push(r);
    }
  }
  for (const g of shiftGroups(shift, undefined, { trainerId: input.trainerId })) {
    if (g.complete) continue;
    out.push({ kind: "group", id: `group:${g.templateId}:${g.shift}`, group: g, title: g.title, estMinutes: groupMinutes(g), origin: "floor" });
  }
  for (const j of input.jobs) {
    if (j.status !== "open") continue;
    if (!isOnJob(j, input.trainerId) && !isOnJob(j, input.uid) && !isUpForGrabs(j)) continue;
    out.push({ kind: "job", id: `job:${j.id}`, job: j, title: j.title, estMinutes: j.estMinutes ?? null, origin: "floor" });
  }
  for (const r of input.requests) {
    if (r.status !== "open" || r.kind === "initiative") continue;
    const mine = Boolean(r.forId && (r.forId === input.uid || r.forId === input.trainerId));
    out.push({ kind: "ask", id: `ask:${r.id}`, request: r, title: r.title, estMinutes: r.estMinutes ?? null, origin: mine ? "mine" : "floor" });
  }
  return out;
}

function isMineByName(item: NextUpItem, input: NextUpInput): boolean {
  const ids = new Set([input.uid, input.trainerId].filter(Boolean) as string[]);
  switch (item.kind) {
    case "ask":
      return Boolean(item.request.forId && ids.has(item.request.forId));
    case "job":
      return item.job.assigneeIds.some((id) => ids.has(id));
    case "group":
      return Boolean(item.group.assignedTo && ids.has(item.group.assignedTo.id));
    case "client":
      return Boolean(item.row.instance?.assignedTo && ids.has(item.row.instance.assignedTo.id));
  }
}

function dueState(item: NextUpItem, todayKey: string): "overdue" | "today" | "none" {
  const due = item.kind === "ask" ? item.request.dueOn : item.kind === "job" ? item.job.dueOn : item.kind === "client" ? todayKey : null;
  if (!due) return "none";
  if (item.kind === "job") {
    const t = jobTiming(item.job, todayKey);
    return t === "overdue" ? "overdue" : t === "today" ? "today" : "none";
  }
  if (due < todayKey) return "overdue";
  if (due === todayKey) return "today";
  return "none";
}

function someoneOnIt(item: NextUpItem, input: NextUpInput): boolean {
  const ids = new Set([input.uid, input.trainerId].filter(Boolean) as string[]);
  switch (item.kind) {
    case "ask":
      return Boolean(item.request.claimedBy && !ids.has(item.request.claimedBy.id));
    case "job":
      return item.job.assigneeIds.length > 0 && !item.job.assigneeIds.some((id) => ids.has(id));
    case "group":
      return Boolean(item.group.claimedBy && !ids.has(item.group.claimedBy.id));
    case "client":
      return Boolean(item.row.instance?.claimedBy && !ids.has(item.row.instance.claimedBy.id));
  }
}

function touchesLast(item: NextUpItem, input: NextUpInput): boolean {
  const client = input.lastClientId ?? null;
  const machines = new Set(input.lastMachineIds ?? []);
  switch (item.kind) {
    case "ask":
      return Boolean((client && item.request.clientId === client) || (item.request.machineId && machines.has(item.request.machineId)));
    case "client":
      return Boolean(client && item.row.template.target.kind === "client" && item.row.template.target.clientId === client);
    case "group":
      return item.group.rows.some((r) => r.machineId && machines.has(r.machineId) && r.status === "open");
    case "job":
      return item.job.about.kind === "client" ? Boolean(client && item.job.about.clientIds.includes(client)) : item.job.about.kind === "machine" ? item.job.about.machineIds.some((id) => machines.has(id)) : false;
  }
}

export function scoreNextUp(item: NextUpItem, input: NextUpInput): NextUpScored {
  let score = 0;
  const why: string[] = [];
  if (isMineByName(item, input)) {
    score += 100;
    why.push(item.kind === "ask" ? `handed to you by ${item.request.createdBy.name.split(" ")[0]}` : "assigned to you");
  }
  const due = dueState(item, input.todayKey);
  if (due === "overdue") {
    score += 60;
    why.push("overdue");
  } else if (due === "today") {
    score += 40;
    why.push("due today");
  }
  const fits = input.gapMinutes === null ? null : fitsGap(item.estMinutes, input.gapMinutes);
  if (fits === true) {
    score += 25;
    if (item.estMinutes != null) why.push("fits your gap");
  } else if (fits === false) {
    score -= 30;
  }
  if (someoneOnIt(item, input)) {
    score -= 20;
  } else {
    score += 10;
  }
  if (touchesLast(item, input)) {
    score += 15;
    why.push("from the session you just had");
  }
  // Urgent asks (a cover) outrank the rest of their tier.
  if (item.kind === "ask" && item.request.priority === "urgent") {
    score += 30;
    why.push("urgent");
  }
  return { item, score, why, fits };
}

export function nextUp(input: NextUpInput): NextUpScored[] {
  const limit = input.limit ?? 3;
  const snoozed = input.snoozed ?? new Set<string>();
  return nextUpItems(input)
    .filter((i) => !snoozed.has(i.id))
    .map((i) => scoreNextUp(i, input))
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * "Not me" — snoozed for the rest of this shift phase, on this iPad,
 * until whoever said it signs out
 * ------------------------------------------------------------------ */

const snoozes = new Map<string, Set<string>>();

// "Not me" is a person talking. The next one to sign in on this iPad has not
// said it, so they see the item (sign-out round, Sep 24 2026).
forgetOnSignOut(() => {
  snoozes.clear();
});

function snoozeKey(studioId: string, todayKey: string, phase: ShiftPhase): string {
  return `${studioId}|${todayKey}|${phase}`;
}

export function snoozedIds(studioId: string | null, todayKey: string, phase: ShiftPhase): Set<string> {
  if (!studioId) return new Set();
  return snoozes.get(snoozeKey(studioId, todayKey, phase)) ?? new Set();
}

export function snooze(studioId: string, todayKey: string, phase: ShiftPhase, id: string): Set<string> {
  const key = snoozeKey(studioId, todayKey, phase);
  const next = new Set(snoozes.get(key) ?? []);
  next.add(id);
  snoozes.set(key, next);
  return next;
}

/** Test seam. */
export function resetSnoozes(): void {
  snoozes.clear();
}

/** The empty-state prompt: what a trainer could do with the gap they have. */
export function emptyPrompt(gapMinutes: number | null, nextClient: string | null): { title: string; body: string } {
  if (gapMinutes === null) return { title: "Nothing waiting on the Floor.", body: "Everything open is on someone's list. Capture anything you notice." };
  if (gapMinutes < 5) return { title: "Nothing waiting, and your next session is about to start.", body: nextClient ? `${nextClient} is up.` : "" };
  return {
    title: "Quiet floor.",
    body: `${gapMinutes} min${nextClient ? ` until ${nextClient}` : ""}. Wipe down a warm machine on the map, or capture something you noticed.`,
  };
}
