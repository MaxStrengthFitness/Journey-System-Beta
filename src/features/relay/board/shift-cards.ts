/**
 * OPENING AND CLOSE OUT — two small cards on the Board, at the start and the
 * end of a trainer's day (Relay room, Sep 28 2026; the redesign's phase 6).
 *
 * The blueprint borrowed them from Sunsama's daily plan and shutdown: "a
 * short guided start to the day, a short shutdown at the end", and its take
 * was "Opening and Close out as two small cards on the Board, never new
 * screens." So:
 *
 *   OPENING    from ninety minutes before the trainer's first session until
 *              it starts (or through the studio's opening shift, whoever is
 *              in): what is waiting, each line with its door. The opening
 *              chores (the studio's, never a person's count), what is handed
 *              to you, cover asks, and the first session.
 *   CLOSE OUT  once the trainer's last session of the day has ended (or in
 *              the studio's closing shift, for someone with nothing booked):
 *              what is still open on today's list, each with the way to hand
 *              it on that already existed (back to the board, hand back,
 *              step off, move to tomorrow, ask the team), and the day so
 *              far, in facts.
 *
 * Both come from the Tracker's own lists (../tracker.ts), so the Board and
 * the Tracker never disagree about what is yours. Nothing is stored: "Got
 * it" folds a card for the day on this iPad (module memory, forgotten at
 * sign-out), and every hand-on is a write the app already made. Two of the
 * blueprint's lines wait for the Journal, which is new data AJ has not
 * approved: Opening's "you chose 3 things to carry today" and Close out's
 * "one line for yourself", saved as the day's log. `dayDraft` is the facts
 * that log would start from.
 *
 * Pure apart from the fold memory: no React, no Firestore, no clock.
 */
import type { TaskRow } from "../../studio-tasks/types";
import type { TaskRequest } from "../../studio-tasks/requests";
import type { TeamJob } from "../jobs/types";
import type { DoneEntry, Tracker } from "../tracker";
import { forgetOnSignOut } from "../../sign-out/memory";
import { minutesToClock, studioMinutesNow, type NowContext } from "./now-context";
import { shiftRings } from "./rings";
import type { DoorId } from "./doors";

export type ShiftCard = "opening" | "closeout";

/** Opening shows from this many minutes before the trainer's first session. */
export const OPENING_LEAD_MINUTES = 90;

type NowLike = Pick<NowContext, "nowMin" | "phase" | "sessions" | "hours">;

/** Which card the Board shows now, if either. */
export function shiftCardNow(now: NowLike): ShiftCard | null {
  if (now.sessions.length > 0) {
    const first = Math.min(...now.sessions.map((s) => s.startMin));
    const last = Math.max(...now.sessions.map((s) => s.endMin));
    if (now.nowMin >= last) return "closeout";
    if (now.nowMin < first && (now.phase === "opening" || now.nowMin >= first - OPENING_LEAD_MINUTES)) return "opening";
    return null;
  }
  if (now.phase === "opening") return "opening";
  if (now.phase === "closing") return "closeout";
  return null;
}

/** When Close out opens today, in studio minutes: when the last session ends, or when Closing starts. */
export function closeoutAt(now: Pick<NowContext, "sessions" | "hours">): number {
  if (now.sessions.length > 0) return Math.max(...now.sessions.map((s) => s.endMin));
  return now.hours.closing;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

function andList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

export interface OpeningLine {
  key: string;
  text: string;
  /** Where the line's button goes: one of the Board's doors, or the Tracker. */
  go: DoorId | "tracker" | null;
}

export interface OpeningInput {
  now: Pick<NowContext, "nowMin" | "sessions">;
  rows: TaskRow[];
  /** Open requests. */
  requests: TaskRequest[];
  /** The Auth uid and the trainer document id: the two differ on older accounts. */
  me: ReadonlySet<string>;
  /** How many things are handed to you (the Tracker's Handed to you). */
  handed: number;
}

/**
 * What is waiting at the start of the day, a line each, only what is there:
 * a line with nothing to say is left out, and a card with no lines is not
 * drawn (an empty list is never announced as a fact; it may be a read that
 * hasn't answered).
 */
export function openingLines(input: OpeningInput): OpeningLine[] {
  const out: OpeningLine[] = [];
  // The studio's chores (shiftRings leaves a trainer's own to-dos out).
  const ring = shiftRings(input.rows).find((r) => r.phase === "opening");
  if (ring && ring.total > 0) {
    out.push(
      ring.closed
        ? { key: "chores", text: `Opening chores: all ${ring.total} done.`, go: null }
        : { key: "chores", text: `Opening chores: ${ring.done} of ${ring.total} done.`, go: "floor" },
    );
  }
  if (input.handed > 0) {
    out.push({ key: "handed", text: input.handed === 1 ? "One thing is handed to you." : `${input.handed} things are handed to you.`, go: "tracker" });
  }
  const covers = input.requests.filter((r) => r.status === "open" && r.kind === "cover" && !r.claimedBy && !input.me.has(r.createdBy.id));
  if (covers.length === 1) {
    out.push({ key: "cover", text: `${firstName(covers[0].createdBy.name)} needs cover: ${covers[0].title}.`, go: "help" });
  } else if (covers.length > 1) {
    out.push({ key: "cover", text: `${covers.length} teammates need cover.`, go: "help" });
  }
  const sessions = [...input.now.sessions].sort((a, b) => a.startMin - b.startMin);
  const first = sessions[0];
  if (first && input.now.nowMin < first.startMin) {
    const at = `${minutesToClock(first.startMin)} with ${first.clientName}`;
    out.push({
      key: "first",
      text: sessions.length === 1 ? `One session today, at ${at}.` : `${sessions.length} sessions today. The first is at ${at}.`,
      go: null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Close out
 * ------------------------------------------------------------------ */

export type CloseoutItem =
  /** An ask someone put your name on: back on the board for anyone. */
  | { key: string; kind: "handed-ask"; title: string; request: TaskRequest; from: string }
  /** An ask you took: hand it back. */
  | { key: string; kind: "taken-ask"; title: string; request: TaskRequest }
  /** A chore a leader named you on: only a leader may un-name it, so ask the team. */
  | { key: string; kind: "chore"; title: string; row: TaskRow; from: string | null }
  /** A team job you are on, due today or overdue: step off. */
  | { key: string; kind: "job"; title: string; job: TeamJob }
  /** Your own to-do for today: a one-off moves to tomorrow; a repeating one comes back by itself. */
  | { key: string; kind: "todo"; title: string; row: TaskRow; once: boolean };

/**
 * What is still open on today's list, from the Tracker's Today and the asks
 * you took (a claim ends with the day). Work due on a later day is not left
 * over, and a team job with no day on it carries on quietly.
 */
export function closeoutItems(t: Pick<Tracker, "handed" | "now" | "nowTaken" | "anytime" | "closing">, todayKey: string): CloseoutItem[] {
  const dueToday = (due: string | null | undefined) => !due || due <= todayKey;
  const out: CloseoutItem[] = [];
  for (const h of t.handed) {
    if (h.kind === "ask") {
      if (dueToday(h.request.dueOn)) out.push({ key: h.key, kind: "handed-ask", title: h.request.title, request: h.request, from: h.from });
    } else if (h.kind === "row") {
      out.push({ key: h.key, kind: "chore", title: h.row.machineName ? `${h.row.title}: ${h.row.machineName}` : h.row.title, row: h.row, from: h.from });
    } else if (h.job.dueOn && h.job.dueOn <= todayKey) {
      out.push({ key: h.key, kind: "job", title: h.job.title, job: h.job });
    }
  }
  for (const x of [...t.nowTaken, ...t.anytime]) {
    if (x.kind === "ask") out.push({ key: x.key, kind: "taken-ask", title: x.request.title, request: x.request });
    else if (x.due) out.push({ key: x.key, kind: "job", title: x.job.title, job: x.job });
  }
  for (const r of [...t.now, ...t.closing]) {
    out.push({ key: `row:${r.id}`, kind: "todo", title: r.title, row: r, once: r.template.recurrence?.type === "once" });
  }
  return out;
}

/** "Monday, September 28" for a studio day key. */
function dayWords(todayKey: string): string {
  const [y, m, d] = todayKey.split("-").map(Number);
  if (!y || !m || !d) return "Today";
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

/**
 * The day so far, in facts: the day, the trainer's booked sessions, and what
 * they finished in Journey (oldest first, three named). A sentence with
 * nothing behind it is left out rather than said as "none".
 */
export function dayDraft(input: { now: Pick<NowContext, "todayKey" | "sessions">; done: DoneEntry[] }): string[] {
  const out = [`${dayWords(input.now.todayKey)}.`];
  const sessions = input.now.sessions;
  if (sessions.length > 0) {
    const lastEnd = Math.max(...sessions.map((s) => s.endMin));
    out.push(
      `${sessions.length === 1 ? "One session" : `${sessions.length} sessions`} on your schedule today, the last ending at ${minutesToClock(lastEnd)}.`,
    );
  }
  const done = [...input.done].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  if (done.length > 0) {
    const named = done.slice(0, 3).map((d) => (d.at ? `${d.what} at ${minutesToClock(studioMinutesNow(new Date(d.at)))}` : d.what));
    const more = done.length - named.length;
    out.push(
      `You finished ${done.length === 1 ? "one thing" : `${done.length} things`} in Journey: ${andList(more > 0 ? [...named, `${more} more`] : named)}.`,
    );
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * "Got it" — a card folded for the day, on this iPad
 * ------------------------------------------------------------------ */

const folds = new Map<string, number>();
// The next person on a shared iPad sees their own Opening.
forgetOnSignOut(() => folds.clear());

const foldKey = (studioId: string, todayKey: string, card: ShiftCard) => `${studioId}|${todayKey}|${card}`;

export function foldShiftCard(studioId: string | null, todayKey: string, card: ShiftCard, atMin: number): void {
  if (!studioId || !todayKey) return;
  folds.set(foldKey(studioId, todayKey, card), atMin);
}

export function unfoldShiftCard(studioId: string | null, todayKey: string, card: ShiftCard): void {
  if (!studioId || !todayKey) return;
  folds.delete(foldKey(studioId, todayKey, card));
}

/** The studio minute a card was folded today, or null. */
export function foldedAt(studioId: string | null, todayKey: string, card: ShiftCard): number | null {
  if (!studioId || !todayKey) return null;
  return folds.get(foldKey(studioId, todayKey, card)) ?? null;
}

/** Test seam. */
export function resetShiftCards(): void {
  folds.clear();
}
