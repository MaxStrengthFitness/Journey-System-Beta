/**
 * GOALS — the why, and whether it has been turned into something checkable.
 *
 * Pure: no React, no Firebase. The Goals section of the client record
 * (GoalsPanel.tsx) is a thin screen over these functions.
 *
 * THE MODEL (Goals & Focus round, Sep 2026)
 * -----------------------------------------
 *   globalNotes     the original why — what brought them in. The anchor.
 *   smartGoal       what they are working toward NOW, in a sentence.
 *   smartChecks     which of S·M·A·R·T that sentence meets. A coach ticks
 *                   them; nothing is inferred from the text, because a
 *                   confident wrong "SMART" badge is worse than none.
 *   goalTargetDate  the T. A yyyy-mm-dd key, read at local noon.
 *   goalHistory     goals marked achieved, newest first, capped at 30.
 *
 * All of it is written through the dossier's Save bar (only changed fields),
 * so marking a goal achieved is four field edits that land in one write.
 */
import type { Client } from "../../types";

export type SmartKey = "s" | "m" | "a" | "r" | "t";
export type SmartChecks = Record<SmartKey, boolean>;
export type GoalHistoryEntry = NonNullable<Client["goalHistory"]>[number];

export const SMART_KEYS: readonly SmartKey[] = ["s", "m", "a", "r", "t"];

/** The five letters, each with the one line a coach checks it against. */
export const SMART_DEFS: Record<SmartKey, { letter: string; word: string; line: string }> = {
  s: { letter: "S", word: "Specific", line: "Says who, what, where, when and why." },
  m: { letter: "M", word: "Measurable", line: "Has a number you can check." },
  a: { letter: "A", word: "Achievable", line: "Within reach for this client, with work." },
  r: { letter: "R", word: "Relevant", line: "Serves their original why." },
  t: { letter: "T", word: "Time-bound", line: "Has a target date." },
};

export const EMPTY_SMART: SmartChecks = { s: false, m: false, a: false, r: false, t: false };

/** How many achieved goals the client record keeps. */
export const GOAL_HISTORY_CAP = 30;

/**
 * Whatever is on the record, as five booleans. Tolerant on purpose: the field
 * is absent on every client before this round, and the Save bar's "Discard
 * edits" resets an unknown field to "".
 */
export function normalizeSmartChecks(raw: unknown): SmartChecks {
  if (!raw || typeof raw !== "object") return { ...EMPTY_SMART };
  const r = raw as Record<string, unknown>;
  return {
    s: r.s === true,
    m: r.m === true,
    a: r.a === true,
    r: r.r === true,
    t: r.t === true,
  };
}

export function smartCount(checks: SmartChecks): number {
  return SMART_KEYS.reduce((n, k) => n + (checks[k] ? 1 : 0), 0);
}

export function sameSmartChecks(a: SmartChecks, b: SmartChecks): boolean {
  return SMART_KEYS.every((k) => a[k] === b[k]);
}

/** "SMART goal" only when all five are ticked; otherwise how far it has come. */
export function smartBadge(checks: SmartChecks): { smart: boolean; label: string } {
  const n = smartCount(checks);
  return n === SMART_KEYS.length
    ? { smart: true, label: "SMART goal" }
    : { smart: false, label: `Raw goal · ${n} of 5` };
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(value: unknown): value is string {
  return typeof value === "string" && DAY_KEY.test(value);
}

/**
 * A yyyy-mm-dd key as a local-noon Date. `new Date("2026-11-26")` is UTC
 * midnight — the 25th in Ohio — so a key is never handed to Date bare.
 */
export function dayKeyToDate(key: string): Date | null {
  if (!isDayKey(key)) return null;
  const [y, m, d] = key.split("-").map(Number);
  const out = new Date(y, m - 1, d, 12, 0, 0, 0);
  return isNaN(out.getTime()) ? null : out;
}

/** Whole calendar days from `now` to the key; negative once it has passed. */
export function daysUntil(key: string, now: Date = new Date()): number | null {
  const target = dayKeyToDate(key);
  if (!target) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** "Nov 26, 2026" for a key, "" for anything else. */
export function formatDayKey(key: string | undefined | null): string {
  const d = key ? dayKeyToDate(key) : null;
  return d
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "";
}

/** "in 12 days" / "today" / "3 days ago" for a target date. */
export function targetDateLabel(key: string, now: Date = new Date()): string {
  const n = daysUntil(key, now);
  if (n === null) return "";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${Math.abs(n)} days ago`;
}

/**
 * The history row for a goal being marked achieved, or null when there is no
 * goal to mark. Empty and undefined values are LEFT OUT rather than written:
 * Firestore refuses `undefined` anywhere in a document, arrays included.
 */
export function buildAchievedGoal(input: {
  goal: string | undefined | null;
  targetDate?: string | null;
  setAt?: string | null;
  reward?: string | null;
  byTrainerId?: string | null;
  byName?: string | null;
  now?: Date;
}): GoalHistoryEntry | null {
  const goal = (input.goal || "").trim();
  if (!goal) return null;
  const entry: GoalHistoryEntry = {
    goal,
    achievedAt: (input.now ?? new Date()).toISOString(),
  };
  if (isDayKey(input.targetDate)) entry.targetDate = input.targetDate;
  const setAt = (input.setAt || "").trim();
  if (setAt) entry.setAt = setAt;
  const reward = (input.reward || "").trim();
  if (reward) entry.reward = reward.slice(0, 200);
  const by = (input.byTrainerId || "").trim();
  if (by) entry.byTrainerId = by;
  const name = (input.byName || "").trim();
  if (name) entry.byName = name;
  return entry;
}

/**
 * Put an achieved goal at the front of the history and keep the newest
 * `cap`. Tolerates a missing or malformed history (anything not an array is
 * treated as empty; rows without a goal are dropped).
 */
export function pushGoalHistory(
  history: unknown,
  entry: GoalHistoryEntry,
  cap: number = GOAL_HISTORY_CAP,
): GoalHistoryEntry[] {
  const prior = Array.isArray(history)
    ? (history as unknown[]).filter(
        (h): h is GoalHistoryEntry =>
          !!h && typeof h === "object" && typeof (h as GoalHistoryEntry).goal === "string",
      )
    : [];
  return [entry, ...prior].slice(0, Math.max(0, cap));
}

/** The history as stored, newest first, safe to render. */
export function readGoalHistory(history: unknown): GoalHistoryEntry[] {
  if (!Array.isArray(history)) return [];
  return (history as unknown[])
    .filter(
      (h): h is GoalHistoryEntry =>
        !!h && typeof h === "object" && typeof (h as GoalHistoryEntry).goal === "string",
    )
    .slice()
    .sort((a, b) => (Date.parse(b.achievedAt) || 0) - (Date.parse(a.achievedAt) || 0));
}
