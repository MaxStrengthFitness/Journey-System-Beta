/**
 * THE CARDS — every piece of the studio's day as one card on one board
 * (the Relay Board rebuild, Oct 3 2026).
 *
 * AJ, Oct 3 2026: "this is replacing the laminated paper of a to-do list of
 * daily things to do at a studio. Right now, when I open this, I don't even
 * know what the heck to look at first." He picked the kamishibai board (the
 * lean factory card board: rows are the parts of the day, columns are where
 * the work happens; every card flips to done with who and when) with a
 * checkbox on every card, one part of the day at a time, and no job picked
 * for anyone: "the board is the plan".
 *
 *   part     Opening · Between clients · Close · This week. A chore's shift
 *            says which (am, any, pm); an ask, a team job or an initiative
 *            is Between clients when it's for today (or has no day) and This
 *            week when it's for a later day.
 *   column   Floor · Desk · Clients · Team: where the work happens.
 *   state    to do · taken (someone's on it) · started (5 of 8) · waiting
 *            (someone asked and nobody has it) · later (Close, before
 *            closing) · done, with who and when.
 *   box      what the checkbox does: "done" finishes it in one tap (with an
 *            Undo), "open" opens it (a question needs its answer, a cover
 *            needs an "I can", a team job may need its parts or a note:
 *            AJ, Oct 3 2026, "Box opens the job"), "none" means there is no
 *            box: an initiative and a renewal talk are opened, never ticked.
 *
 * Nothing is stored for it, nothing is ranked, nobody is counted: built from
 * the rows, asks, jobs and clients the Board already holds. Pure.
 */
import type { Client } from "../../../types";
import type { TaskRequest } from "../../studio-tasks/requests";
import { shiftGroups, type ShiftGroup } from "../../studio-tasks/board";
import { taskScopeOf, type StudioTaskCategory, type TaskRow, type TaskShift } from "../../studio-tasks/types";
import { formatStudioTime, studioDateKey } from "../../../lib/studio-time";
import { jobProgress, jobTopic } from "../jobs/jobs";
import type { TeamJob } from "../jobs/types";
import { coverTimeOf, neededWords } from "./cover";
import type { ShiftPhase } from "./now-context";
import { renewalPromptDue } from "../../renewals/conversation";

export type CardPart = "open" | "day" | "close" | "week";
export type CardColumn = "floor" | "desk" | "clients" | "team";
export type CardState = "todo" | "taken" | "started" | "waiting" | "later" | "done";
export type CardBox = "done" | "open" | "none";
export type CardGlyph = "cover" | "question" | "help" | "note" | "job" | "lead" | "renewal" | null;

export const CARD_PARTS: { id: CardPart; label: string; when: string }[] = [
  { id: "open", label: "Opening", when: "until the first client" },
  { id: "day", label: "Between clients", when: "anytime today" },
  { id: "close", label: "Close", when: "the end of the day" },
  { id: "week", label: "This week", when: "the days ahead" },
];

export const CARD_COLUMNS: { id: CardColumn; label: string }[] = [
  { id: "floor", label: "Floor" },
  { id: "desk", label: "Desk" },
  { id: "clients", label: "Clients" },
  { id: "team", label: "Team" },
];

export type CardSource =
  | { kind: "group"; group: ShiftGroup }
  | { kind: "client"; row: TaskRow }
  | { kind: "ask"; request: TaskRequest }
  | { kind: "job"; job: TeamJob }
  | { kind: "initiative"; request: TaskRequest }
  | { kind: "renewal"; client: Client };

export interface BoardCard {
  id: string;
  part: CardPart;
  column: CardColumn;
  title: string;
  glyph: CardGlyph;
  state: CardState;
  /** The one quiet line under the title: who did it and when, who's on it, how long it's waited, whose it is. */
  line: string;
  /** Parts done of the whole (machines wiped, a job's parts), or null for one thing. */
  parts: { done: number; total: number } | null;
  estMinutes: number | null;
  /** Your name is on it, or it's your own to-do. */
  mine: boolean;
  box: CardBox;
  source: CardSource;
  /** Clock order within the part ("HH:MM", or null). */
  at: string | null;
}

export interface CardsInput {
  rows: TaskRow[];
  /** Every open request, initiatives included. */
  requests: TaskRequest[];
  /** Asks closed recently: the ones closed today show as done. */
  resolved?: TaskRequest[];
  jobs: TeamJob[];
  /** The studio's clients: whoever has a renewal talk due gets a card. */
  clients?: Client[];
  studioId?: string | null;
  categories?: StudioTaskCategory[];
  uid: string | null;
  trainerId: string | null;
  todayKey: string;
  /** The studio's shift phase now: Close's cards are "not yet" before closing. */
  phase: ShiftPhase;
  /** Now, ms since epoch: "waiting 2 h". */
  nowMs: number;
  tz?: string;
}

/** The part of the day it is now: the tab the Board opens on. */
export function partNow(phase: ShiftPhase): CardPart {
  if (phase === "opening") return "open";
  if (phase === "mid") return "day";
  return "close";
}

const SHIFT_PART: Record<TaskShift, CardPart> = { am: "open", any: "day", pm: "close" };

const millis = (v: unknown): number | null => {
  const ms = (v as { toMillis?: () => number } | null | undefined)?.toMillis?.();
  if (typeof ms === "number") return ms;
  if (typeof v === "number") return v;
  return null;
};

const first = (name: string | null | undefined): string => (name ?? "").trim().split(/\s+/)[0] || "Someone";

/** "6:55 AM", or null when the time isn't known. */
function clock(ms: number | null, tz?: string): string | null {
  if (ms === null) return null;
  const t = formatStudioTime(new Date(ms), tz, "");
  return t || null;
}

/** "Kyle · 6:55 AM", "You · 11:20 AM", or just the name when the time isn't known. */
function doneLine(by: { id: string; name: string } | null | undefined, ms: number | null, me: Set<string>, tz?: string): string {
  const who = by ? (me.has(by.id) ? "You" : first(by.name)) : "Done";
  const at = clock(ms, tz);
  return at ? `${who} · ${at}` : who;
}

/** "waiting 15 min", "waiting 2 h", "waiting 3 days" since it was posted. */
export function waitingWords(createdMs: number | null, nowMs: number): string {
  if (createdMs === null || nowMs < createdMs) return "waiting";
  const min = Math.floor((nowMs - createdMs) / 60_000);
  if (min < 60) return `waiting ${Math.max(1, min)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `waiting ${h} h`;
  const d = Math.floor(h / 24);
  return `waiting ${d} ${d === 1 ? "day" : "days"}`;
}

/** Desk words in a category's id or label: the rest of a studio's own chores are floor work. */
const DESK_WORDS = /desk|admin|office|front|paper|phone|email|call|order|computer|ipad|brief/i;

function choreColumn(g: ShiftGroup, categories: StudioTaskCategory[] | undefined): CardColumn {
  const t = g.rows[0]?.template;
  if (t?.kind === "machine") return "floor";
  if (g.upkeep === "cleaning" || g.upkeep === "maintenance") return "floor";
  const cat = categories?.find((c) => c.id === g.category);
  const words = `${g.category} ${cat?.label ?? ""} ${g.title}`;
  if (taskScopeOf(t ?? {}) === "personal") return DESK_WORDS.test(words) || !/clean|wipe|mop|vacuum|towel|bin|trash/i.test(words) ? "desk" : "floor";
  return DESK_WORDS.test(words) ? "desk" : "floor";
}

/** The latest completion in a group: its time and who. */
function lastDone(rows: TaskRow[]): { by: { id: string; name: string } | null; ms: number | null } {
  let best: { by: { id: string; name: string } | null; ms: number | null } = { by: null, ms: null };
  for (const r of rows) {
    if (r.status !== "done") continue;
    const ms = millis(r.instance?.completedAt);
    if (best.ms === null || (ms !== null && ms > best.ms)) best = { by: r.instance?.completedBy ?? best.by, ms };
  }
  return best;
}

function laterIn(part: CardPart, phase: ShiftPhase): boolean {
  return part === "close" && (phase === "opening" || phase === "mid");
}

/* ------------------------------------------------------------------ *
 * Each source, as a card
 * ------------------------------------------------------------------ */

function groupCard(g: ShiftGroup, input: CardsInput, me: Set<string>): BoardCard {
  const part = SHIFT_PART[g.shift];
  const t = g.rows[0]?.template;
  const personal = taskScopeOf(t ?? {}) === "personal";
  const parts = g.total > 1 ? { done: g.done, total: g.total } : null;
  const est = typeof t?.estMinutes === "number" ? (t.kind === "machine" ? t.estMinutes * Math.max(1, g.total - g.done) : t.estMinutes) : null;
  const assignedMe = Boolean(g.assignedTo && me.has(g.assignedTo.id));
  const claimedMe = Boolean(g.claimedBy && me.has(g.claimedBy.id));
  let state: CardState;
  let line: string;
  if (g.complete) {
    const d = lastDone(g.rows);
    state = "done";
    line = doneLine(g.completedBy ?? d.by, d.ms, me, input.tz);
  } else if (g.claimedBy || g.claimedCount > 0) {
    state = "taken";
    line = claimedMe ? "You're on it" : g.claimedBy ? `${first(g.claimedBy.name)} is on it` : `${g.claimedCount} people on it`;
  } else if (parts && parts.done > 0) {
    state = "started";
    line = `${parts.done} of ${parts.total} done`;
  } else {
    state = laterIn(part, input.phase) ? "later" : "todo";
    line = personal ? "Yours" : assignedMe ? "Yours today" : g.assignedTo ? `For ${first(g.assignedTo.name)}` : "Anyone";
  }
  if (state === "taken" && parts && parts.done > 0) line = `${line} · ${parts.done} of ${parts.total}`;
  return {
    id: `group:${g.scope}:${g.templateId}:${g.shift}`,
    part,
    column: choreColumn(g, input.categories),
    title: g.title,
    glyph: null,
    state,
    line,
    parts,
    estMinutes: state === "done" ? null : est,
    mine: personal || assignedMe || claimedMe,
    box: "done",
    source: { kind: "group", group: g },
    at: t?.timeOfDay ?? null,
  };
}

function clientCard(r: TaskRow, input: CardsInput, me: Set<string>): BoardCard {
  const part = SHIFT_PART[r.shift];
  const done = r.status !== "open";
  const claimed = r.instance?.claimedBy ?? null;
  const assigned = r.instance?.assignedTo ?? null;
  let state: CardState;
  let line: string;
  if (done) {
    state = "done";
    line = doneLine(r.instance?.completedBy, millis(r.instance?.completedAt), me, input.tz);
  } else if (claimed) {
    state = "taken";
    line = me.has(claimed.id) ? "You're on it" : `${first(claimed.name)} is on it`;
  } else {
    state = laterIn(part, input.phase) ? "later" : "todo";
    line = assigned ? (me.has(assigned.id) ? "Yours today" : `For ${first(assigned.name)}`) : "Anyone";
  }
  return {
    id: `row:${r.id}`,
    part,
    column: "clients",
    title: r.clientName && !r.title.includes(r.clientName) ? `${r.title}: ${r.clientName}` : r.title,
    glyph: null,
    state,
    line,
    parts: null,
    estMinutes: done ? null : r.template.estMinutes ?? null,
    mine: Boolean((assigned && me.has(assigned.id)) || (claimed && me.has(claimed.id))),
    box: "done",
    source: { kind: "client", row: r },
    at: r.template.timeOfDay ?? null,
  };
}

const ASK_GLYPH: Partial<Record<TaskRequest["kind"], CardGlyph>> = {
  cover: "cover",
  question: "question",
  help: "help",
  "heads-up": "note",
};

/** Which part an ask is for: today (or no day) is Between clients; a later day is This week. */
function askPart(r: TaskRequest, todayKey: string): CardPart {
  const t = coverTimeOf(r);
  const day = t?.day ?? r.sessionDate ?? r.dueOn ?? null;
  return day && day > todayKey ? "week" : "day";
}

function askColumn(r: TaskRequest): CardColumn {
  if (r.clientId) return "clients";
  if (r.machineId) return "floor";
  return "team";
}

function askCard(r: TaskRequest, input: CardsInput, me: Set<string>, closed: boolean): BoardCard {
  const part = askPart(r, input.todayKey);
  const forMe = Boolean(r.forId && me.has(r.forId));
  const createdMs = millis(r.createdAt);
  let state: CardState;
  let line: string;
  if (closed) {
    state = "done";
    line = doneLine(r.resolvedBy ?? null, millis(r.resolvedAt), me, input.tz);
  } else if (r.claimedBy) {
    state = "taken";
    line = me.has(r.claimedBy.id) ? "You're on it" : `${first(r.claimedBy.name)} is on it`;
  } else if (forMe) {
    state = "todo";
    line = `Handed to you by ${first(r.createdBy.name)}`;
  } else if (r.kind === "cover" || r.priority === "urgent") {
    const t = coverTimeOf(r);
    state = part === "week" ? "todo" : "waiting";
    line = t && t.day >= input.todayKey ? `${first(r.createdBy.name)} · ${neededWords(t, input.todayKey)}` : `${first(r.createdBy.name)} · ${waitingWords(createdMs, input.nowMs)}`;
  } else {
    state = "todo";
    line = r.forName ? `For ${first(r.forName)} · from ${first(r.createdBy.name)}` : `From ${first(r.createdBy.name)}`;
  }
  return {
    id: `ask:${r.id}`,
    part,
    column: askColumn(r),
    title: r.title,
    glyph: ASK_GLYPH[r.kind] ?? null,
    state,
    line,
    parts: null,
    estMinutes: closed ? null : r.estMinutes ?? null,
    mine: forMe || Boolean(r.claimedBy && me.has(r.claimedBy.id)),
    // A question waits for its answer and a cover for an "I can": the box opens them.
    box: r.kind === "question" || r.kind === "cover" ? "open" : "done",
    source: { kind: "ask", request: r },
    at: null,
  };
}

function jobCard(j: TeamJob, input: CardsInput, me: Set<string>): BoardCard {
  const prog = jobProgress(j);
  const total = Object.keys(j.parts ?? {}).length;
  const parts = total > 0 ? { done: prog.done, total } : null;
  const part: CardPart = j.dueOn && j.dueOn > input.todayKey ? "week" : j.dueOn ? "day" : "week";
  const onIt = j.assignees ?? [];
  const mine = j.assigneeIds.some((id) => me.has(id));
  let state: CardState;
  let line: string;
  if (j.status === "done") {
    state = "done";
    line = doneLine(j.completedBy, millis(j.completedAt), me, input.tz);
  } else if (parts && parts.done > 0) {
    state = "started";
    line = `${parts.done} of ${parts.total} done${onIt.length ? ` · ${onIt.map((p) => (me.has(p.id) ? "you" : first(p.name))).join(", ")}` : ""}`;
  } else if (onIt.length > 0) {
    state = "taken";
    line = mine && onIt.length === 1 ? "You're on it" : `${onIt.map((p) => (me.has(p.id) ? "You" : first(p.name))).join(", ")} on it`;
  } else {
    state = "todo";
    line = `Anyone · from ${first(j.createdBy?.name)}`;
  }
  const topic = jobTopic(j);
  return {
    id: `job:${j.id}`,
    part,
    column: topic === "clients" ? "clients" : topic === "help" ? "team" : "floor",
    title: j.title,
    glyph: "job",
    state,
    line,
    parts,
    estMinutes: state === "done" ? null : j.estMinutes ?? null,
    mine,
    // AJ, Oct 3 2026: "Box opens the job" (its parts or its closing note), unless one tap can finish it.
    box: total === 0 && !j.requiresNote ? "done" : "open",
    source: { kind: "job", job: j },
    at: null,
  };
}

function initiativeCard(r: TaskRequest): BoardCard {
  return {
    id: `ask:${r.id}`,
    part: "week",
    column: "team",
    title: r.title,
    glyph: "lead",
    state: "todo",
    line: `Everyone · from ${first(r.createdBy.name)}`,
    parts: null,
    estMinutes: null,
    mine: false,
    box: "none",
    source: { kind: "initiative", request: r },
    at: null,
  };
}

function renewalCard(c: Client): BoardCard {
  const s = c.renewal;
  const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "A client";
  const left = typeof s?.sessionsLeft === "number" ? s.sessionsLeft : null;
  const line =
    s?.situation === "ended"
      ? "Package ended"
      : left !== null
        ? `${left} ${left === 1 ? "session" : "sessions"} left`
        : s?.chargeWarning
          ? "Charge coming up"
          : "Talk about renewing";
  return {
    id: `renewal:${c.id}`,
    part: "week",
    column: "clients",
    title: `Renewal talk: ${name}`,
    glyph: "renewal",
    state: "todo",
    line,
    parts: null,
    estMinutes: null,
    mine: false,
    box: "none",
    source: { kind: "renewal", client: c },
    at: null,
  };
}

/* ------------------------------------------------------------------ *
 * The board
 * ------------------------------------------------------------------ */

const STATE_ORDER: Record<CardState, number> = { waiting: 0, todo: 1, started: 2, taken: 3, later: 4, done: 5 };

/** Within a cell: someone waiting first, then yours, then what's open, then not yet, then done. */
export function compareCards(a: BoardCard, b: BoardCard): number {
  return (
    STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
    Number(b.mine && b.state !== "done") - Number(a.mine && a.state !== "done") ||
    (a.at ?? "99:99").localeCompare(b.at ?? "99:99") ||
    a.title.localeCompare(b.title)
  );
}

export function boardCards(input: CardsInput): BoardCard[] {
  const me = new Set([input.uid, input.trainerId].filter(Boolean) as string[]);
  const cards: BoardCard[] = [];

  const shift: TaskRow[] = [];
  for (const r of input.rows) {
    if (r.kind === "client") cards.push(clientCard(r, input, me));
    else shift.push(r);
  }
  for (const g of shiftGroups(shift, input.categories, { trainerId: input.trainerId })) {
    // A group someone skipped entirely has nothing to do and nothing done: it stays off the board.
    if (g.total === 0) continue;
    cards.push(groupCard(g, input, me));
  }

  for (const r of input.requests) {
    if (r.status !== "open") continue;
    cards.push(r.kind === "initiative" ? initiativeCard(r) : askCard(r, input, me, false));
  }
  for (const r of input.resolved ?? []) {
    if (r.kind === "initiative") continue;
    const ms = millis(r.resolvedAt);
    if (ms === null || studioDateKey(new Date(ms), input.tz) !== input.todayKey) continue;
    cards.push(askCard(r, input, me, true));
  }

  for (const j of input.jobs) {
    if (j.status === "open") cards.push(jobCard(j, input, me));
    else if (j.status === "done" && j.closedOn === input.todayKey) cards.push(jobCard(j, input, me));
  }

  // Renewal talks, the renewals lane's own rule: this studio's clients whose snapshot says one is due.
  const seen = new Set<string>();
  for (const c of input.clients ?? []) {
    if (!c.id || seen.has(c.id)) continue;
    if (input.studioId && c.homeStudioId !== input.studioId) continue;
    seen.add(c.id);
    if (renewalPromptDue(c.renewal)) cards.push(renewalCard(c));
  }

  return cards.sort(compareCards);
}

/** One part's cards by column, each column in card order. */
export function cardsByColumn(cards: readonly BoardCard[], part: CardPart): Record<CardColumn, BoardCard[]> {
  const out: Record<CardColumn, BoardCard[]> = { floor: [], desk: [], clients: [], team: [] };
  for (const c of cards) if (c.part === part) out[c.column].push(c);
  for (const k of Object.keys(out) as CardColumn[]) out[k].sort(compareCards);
  return out;
}

/** "4 of 5": a part's done cards of all of them. */
export function partCount(cards: readonly BoardCard[], part: CardPart): { done: number; total: number } {
  const list = cards.filter((c) => c.part === part);
  return { done: list.filter((c) => c.state === "done").length, total: list.length };
}

/** How many of a part's cards have someone waiting on them (the tab's amber dot). */
export function waitingIn(cards: readonly BoardCard[], part: CardPart): number {
  return cards.filter((c) => c.part === part && c.state === "waiting").length;
}

