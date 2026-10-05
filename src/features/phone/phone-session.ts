/**
 * The phone's session cards: the pure half (Journey Lite, Oct 1 2026).
 *
 * On a phone the Active Session keeps everything it does on the iPad (the
 * briefing, Start, every write, Finish, the Wrap-up) and draws its live part
 * as one card per machine instead of the grid and the Now Bar. Each card
 * shows the machine's LAST FIVE times, side by side, because one session at a
 * time says nothing (AJ, Oct 1 2026: "just showing one session at a time will
 * not do, seeing at least 5 sessions at a time is actually meaningful").
 *
 * The five are the machine's own last five times on record, not the client's
 * last five sessions: a card stands alone on a phone, with no column beside
 * it to line up with, and a machine she skipped last week would otherwise
 * show a blank where her story is. A not-reached set is not a time she did
 * the machine, so it is not one of the five; a practice or a skip is, and
 * says so.
 *
 * Nothing here decides a weight. The weight on the card is the iPad's own
 * pre-fill (the prescription, else the last performed load), and the reps are
 * never pre-filled: last time's count is a ghost (the-floor.md, "Where the eye
 * goes").
 */
import type { JourneyRow, JourneySession, JourneySet, LiveSet, RepQuality } from "../journey-grid/types";
import type { SetOutcome } from "../../lib/set-outcome";
import { noMachineHistoryLine } from "../../lib/history-claims";
import type { HistoryCoverage } from "../../lib/prior-history";

/** How many past times a card shows. */
export const PAST_SHOWN = 5;

export interface PastCell {
  sessionId: string;
  /** "Sep 3" — the studio day the session was for. */
  dateText: string;
  /** Load in lb; null when the set carried none (a skip). */
  weight: number | null;
  /** "9", "45s", "L 9 · R 8" is not kept (the grid shows one side), or null. */
  count: string | null;
  quality: RepQuality;
  outcome: SetOutcome;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2026-09-03" → "Sep 3". Read from the string itself, never through a Date:
 * a date-only ISO string is UTC, and Eastern evening would read it as the day
 * before (KNOWN-TRAPS, dates).
 */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return "";
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}` : "";
}

function countOf(set: JourneySet): string | null {
  if (set.outcome === "skipped" || set.outcome === "not_reached") return null;
  if (set.isTSC) return typeof set.seconds === "number" ? `${set.seconds}s` : null;
  return typeof set.reps === "number" ? String(set.reps) : null;
}

/**
 * The machine's last `n` times, oldest first (the newest on the right, as on
 * the iPad's grid). `history` is the client's past sessions oldest → newest.
 */
export function lastTimes(row: JourneyRow, history: JourneySession[], n = PAST_SHOWN): PastCell[] {
  const out: PastCell[] = [];
  for (let i = history.length - 1; i >= 0 && out.length < n; i--) {
    const session = history[i];
    const set = row.sets[session.id];
    if (!set || set.outcome === "not_reached") continue;
    out.push({
      sessionId: session.id,
      dateText: shortDate(session.date),
      weight: set.outcome === "skipped" || !(set.weight > 0) ? null : set.weight,
      count: countOf(set),
      quality: set.quality,
      outcome: set.outcome,
    });
  }
  return out.reverse();
}

/**
 * What the strip says when the sessions loaded here hold no time on the
 * machine: the machine menu's rule (machine-menu/header-words.ts, design
 * §F 5). It said "First time on this machine in Journey." whatever the read
 * held, so a machine done in an older session the phone hadn't read, or one
 * a running total knows, was called new.
 *
 *   - The sets haven't been read yet, or the read failed: it says so first,
 *     before anything else, because "not in the sessions loaded here" would
 *     suggest they were read. A failed read is never empty.
 *   - A running total knows it (`client.machineStats` or
 *     `currentMachineMetrics`; evidence only, never a count): done before,
 *     not in the sessions loaded here.
 *   - Every session read: `noMachineHistoryLine` — "First time on this
 *     machine" only when Journey holds the client's whole story.
 *   - Older sessions unread: nothing in the sessions loaded here.
 */
export function noPastWords(opts: {
  knownElsewhere: boolean;
  everythingRead: boolean;
  coverage?: HistoryCoverage;
  /** How far the read of the sets has got (the tracker's logs window); absent, it answered. */
  state?: "loading" | "ready" | "cache-only" | "failed";
}): string {
  if (opts.state === "loading") return "Loading past times…";
  if (opts.state === "failed") return "Couldn't load past times.";
  if (opts.knownElsewhere) return "Done here in Journey before · not in the sessions loaded here.";
  if (opts.everythingRead) return `${noMachineHistoryLine(opts.coverage ?? "unknown")}.`;
  return `${noMachineHistoryLine("unknown")} in the sessions loaded here.`;
}

/** Her newest PERFORMED set on this machine: the ghost under today's count. */
export function lastPerformed(row: JourneyRow, history: JourneySession[]): JourneySet | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const set = row.sets[history[i].id];
    if (set && set.outcome === "performed") return set;
  }
  return null;
}

/**
 * Is today's count in seconds? What the trainer set today wins; with nothing
 * logged yet, a machine she last did as a timed hold opens as one.
 */
export function countsSeconds(value: LiveSet | undefined, last: JourneySet | null): boolean {
  if (value && (value.reps != null || value.seconds != null || value.isTSC)) return !!value.isTSC;
  return !!last?.isTSC;
}

/** The weight on today's card: today's entry, else the iPad's own pre-fill. */
export function todayWeight(value: LiveSet | undefined, row: JourneyRow): number | null {
  if (value && typeof value.weight === "number") return value.weight;
  return typeof row.prescribedWeight === "number" ? row.prescribedWeight : null;
}

/** One step of the weight, never below zero. */
export function stepWeight(weight: number | null, step: number, dir: 1 | -1): number {
  const next = (weight ?? 0) + step * dir;
  return next < 0 ? 0 : Math.round(next * 100) / 100;
}

/**
 * Has this machine been logged today? The session bar's own count: a count
 * entered, or a practice or a skip said.
 */
export function cardLogged(value: LiveSet | undefined): boolean {
  if (!value) return false;
  if (value.outcome === "practice" || value.outcome === "skipped") return true;
  return value.isTSC ? value.seconds != null : value.reps != null;
}

/**
 * What a count box holds, as typed: digits only, at most three, and empty
 * means no set (tapping on without typing logs nothing).
 */
export function parseCount(text: string): number | null {
  const digits = (text || "").replace(/\D/g, "").slice(0, 3);
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/** A weight box, as typed: a number with at most one decimal point, or none. */
export function parseWeight(text: string): number | null {
  const cleaned = (text || "").replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * The quality buttons toggle: tapping the mark that is on returns the set to
 * an ordinary one (2), never to "no quality" once a count is in.
 */
export function toggledQuality(current: RepQuality | null | undefined, tapped: 1 | 3): RepQuality {
  return current === tapped ? 2 : tapped;
}
