/**
 * WHAT A SCREEN MAY SAY ABOUT A CLIENT'S HISTORY - the words, in one place.
 *
 * `prior-history.ts` is the rule and `client-coverage.ts` turns a client into
 * a coverage. This file is the third half: every sentence a screen used to
 * write on its own authority about a client's PAST - "First time on this
 * machine", "#3", "No visit in 5 weeks", "Total Sessions", "All time",
 * "Start of history" - asked here instead, so the same migrating client
 * cannot read "first time" on one screen and "nothing recorded" on the next.
 *
 * AJ, Sep 24 2026: "we need to ensure that legacy FileMaker clients aren't
 * defaulting to 'first time' or 'on a break' if their historical data
 * dictates otherwise."
 *
 * THE RULE EVERY FUNCTION HERE FOLLOWS
 * ------------------------------------
 * A claim about the CLIENT ("first time", "session #4", "a five-week break")
 * is made only when Journey holds her whole story (`complete`). Anything
 * short of that gets a claim about our RECORDS instead ("nothing recorded",
 * "sessions in Journey") or nothing at all. Every coverage argument is the
 * cautious one when a caller has none to give, so a forgotten prop fails
 * towards saying too little - never towards calling a twelve-year client new.
 *
 * PURE MODULE - no React, no Firestore, no clock. Dates arrive as studio day
 * keys (yyyy-mm-dd) and are compared as text, never handed to `new Date()`.
 */
import {
  priorUncounted,
  type HistoryCoverage,
  type PriorHistory,
} from "./prior-history";

/* ------------------------------------------------------------------ *
 * A machine with nothing on it
 * ------------------------------------------------------------------ */

/**
 * The line a trainer reads walking up to a machine this client has no set on
 * (the Now Bar, the machine sheet, the set-up prompt). Machine-level history
 * is not coming across from FileMaker, so for anyone whose story predates
 * Journey an empty machine is a fact about our records, not about her.
 */
export function noMachineHistoryLine(coverage: HistoryCoverage = "unknown"): string {
  return coverage === "complete" ? "First time on this machine" : "Nothing recorded on this machine";
}

/**
 * The sentence under that line on the machine sheet, where the set-up guide
 * opens. `name` is the client's first name ("This client" when unknown).
 */
export function noMachineHistoryBody(
  name: string,
  coverage: HistoryCoverage = "unknown",
  hasGuide = true,
): string {
  const guide = hasGuide ? " below" : " (none on file for this machine yet)";
  return coverage === "complete"
    ? `${name} has no history here yet. Set up from the guide${guide}, then save the settings so the next trainer has them.`
    : `Journey has no sets for ${name} on this machine; anything from before Journey is not recorded here. Check the set-up against the guide${guide}, then save the settings so the next trainer has them.`;
}

/** The set-up prompt's sub-line, for a machine with no settings saved. */
export function setupPromptLine(coverage: HistoryCoverage = "unknown"): string {
  return coverage === "complete"
    ? "Set it up for this client before the first set."
    : "No settings are saved here for this client yet. Set it up before the set.";
}

/**
 * The post-session tag beside a machine performed with no earlier set on
 * record. Null - say nothing - unless it really is her first time.
 */
export function firstTimeTag(coverage: HistoryCoverage = "unknown"): string | null {
  return coverage === "complete" ? "First time" : null;
}

/** "2 new machines", for the post-session headline. Null when not claimable. */
export function newMachinesPhrase(count: number, coverage: HistoryCoverage = "unknown"): string | null {
  if (coverage !== "complete" || !(count > 0)) return null;
  return `${count} new machine${count === 1 ? "" : "s"}`;
}

/** The words on a machine's History card, for what Journey has seen of it. */
export interface MachineUsageWords {
  /** The whole card when there is nothing on the machine. */
  never: string;
  /** The label over the first day. */
  first: string;
  /** The label over the count of sessions. */
  times: string;
  /** "{from} -> {to} lb {since}". */
  since: string;
}

export function machineUsageWords(coverage: HistoryCoverage = "unknown"): MachineUsageWords {
  return coverage === "complete"
    ? {
        never: "Never performed by this client.",
        first: "First performed",
        times: "Times performed",
        since: "since first set",
      }
    : {
        never: "Nothing recorded on this machine in Journey.",
        first: "First in Journey",
        times: "Times in Journey",
        since: "since first set in Journey",
      };
}

/* ------------------------------------------------------------------ *
 * Session numbers and counts
 * ------------------------------------------------------------------ */

/**
 * "#413", or null when the number cannot be quoted. `quotable` is
 * `canQuoteSessionNumber(client, coverage)` - the Hub card's own gate - so a
 * migration client nobody has recorded a total for shows no number rather
 * than Journey's "#3".
 */
export function sessionNumberTag(n: number | null | undefined, quotable: boolean): string | null {
  if (!quotable || typeof n !== "number" || !Number.isFinite(n) || n < 1) return null;
  return `#${Math.trunc(n)}`;
}

/**
 * The label over a completed-session count. When the number is only what
 * Journey has seen, it says so rather than passing for her lifetime total.
 */
export function sessionCountLabel(quotable: boolean): string {
  return quotable ? "Completed sessions" : "Sessions in Journey";
}

/* ------------------------------------------------------------------ *
 * The start of the record, and "all"
 * ------------------------------------------------------------------ */

/** What the Journey grid's rail says once the oldest session is on screen. */
export function historyStartWords(coverage: HistoryCoverage = "unknown"): { label: string; spoken: string } {
  return coverage === "complete"
    ? { label: "Start of history", spoken: "Start of history. There are no older sessions." }
    : {
        label: "Start of Journey",
        spoken: "Start of this client's sessions in Journey. Anything before Journey is not recorded here.",
      };
}

/** The Deep Dive's widest range. "All time" only when Journey holds all of it. */
export function allTimeLabel(coverage: HistoryCoverage = "unknown"): string {
  return coverage === "complete" ? "All time" : "All in Journey";
}

/**
 * The progress report's session tile. It is printed and handed to the
 * client, so it names the window it counts rather than calling Journey's
 * first session her first session.
 */
export interface ReportSessionWords {
  /** Over the big number. */
  total: string;
  /** Over the date under it. */
  first: string;
  /** The editor's "use this date" button. */
  useFirst: string;
  /** "412 before Journey" when a prior record says so; otherwise null. */
  before: string | null;
}

export function reportSessionWords(
  coverage: HistoryCoverage = "unknown",
  prior: PriorHistory | null = null,
): ReportSessionWords {
  const uncounted = priorUncounted(prior);
  const before = uncounted > 0 ? `${uncounted} before Journey` : null;
  return coverage === "complete"
    ? { total: "Total Sessions", first: "First Session", useFirst: "Use First Session", before }
    : { total: "Sessions", first: "Since", useFirst: "Use First in Journey", before };
}

/**
 * The "Report required" banner's sentence. Earlier progress reports may be
 * in FileMaker, so for anyone whose story predates Journey the banner says
 * where it looked.
 */
export function noReportSentence(coverage: HistoryCoverage = "unknown"): string {
  return coverage === "complete"
    ? "This client has no progress report on file. Please perform an evaluation."
    : "No progress report in Journey yet. Please perform an evaluation.";
}

/** How long a client has been with the studio before a report is expected. */
export const REPORT_AFTER_MONTHS = 3;

/**
 * WHETHER A PROGRESS REPORT IS EXPECTED YET - "has she been here three
 * months?", answered from evidence rather than from the day Journey met her.
 *
 * The banner used to test the Journey document's `createdAt`, which for a
 * roster imported last month says every twelve-year client is new - so the
 * one client most overdue a report was the one the banner kept quiet about.
 *
 * `earliest` is the oldest date ANYTHING on the record gives
 * (`earliestKnownDate` in client-since.ts): a single old date proves tenure.
 * A prior record proves it outright - somebody wrote down sessions from
 * before Journey. Neither known: say nothing, as the banner always did for a
 * client who looks new.
 */
export function isEstablishedClient(
  input: { earliest: Date | null; prior: PriorHistory | null },
  now: Date,
): boolean {
  if (input.prior && input.prior.sessions > 0) return true;
  if (!input.earliest || Number.isNaN(input.earliest.getTime())) return false;
  const line = new Date(now.getTime());
  line.setMonth(line.getMonth() - REPORT_AFTER_MONTHS);
  return input.earliest.getTime() <= line.getTime();
}

/* ------------------------------------------------------------------ *
 * Breaks
 * ------------------------------------------------------------------ */

/**
 * THE PART OF A CLIENT'S TIMELINE JOURNEY OWNS.
 *
 * A gap between two Journey sessions is a break only if Journey would have
 * seen a session in it. During the migration it often would not: FileMaker
 * stays live through beta, so a client in twice a week can have three weeks
 * recorded only there - and the History tab called that a three-week break.
 *
 * Journey owns every day of a `complete` client's story. For anyone else it
 * owns the days from when her studio moved onto Journey (the cutover), or
 * after the day her prior record runs through - whichever is LATER, because
 * both have to be true for a missing session to mean a missed visit. With
 * neither known, Journey owns no day and no break is claimed.
 *
 * Long-standing clients stay `partial` forever by design (their prior
 * history is permanent), which is why this is a day and not a yes/no: once
 * her studio is live, a real break is still a break.
 */
export interface OwnedWindow {
  /** Journey holds her whole story; every gap is claimable. */
  complete: boolean;
  /** The first studio day Journey holds every session from, or null for none. */
  from: string | null;
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The day after a yyyy-mm-dd key, in calendar arithmetic (no time zone involved). */
export function dayAfter(key: string): string | null {
  const m = DAY_KEY.exec(key);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1));
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function ownedWindow(input: {
  coverage: HistoryCoverage;
  prior?: PriorHistory | null;
  /** The HOME studio's `journeyCutoverDate`. */
  cutover?: string | null;
}): OwnedWindow {
  if (input.coverage === "complete") return { complete: true, from: null };
  const days: string[] = [];
  if (input.cutover && DAY_KEY.test(input.cutover)) days.push(input.cutover);
  const after = input.prior?.through ? dayAfter(input.prior.through) : null;
  if (after) days.push(after);
  if (days.length === 0) return { complete: false, from: null };
  return { complete: false, from: days.sort()[days.length - 1] };
}

/** The whole timeline is claimable. The default for a caller with no window. */
export const WHOLE_STORY: OwnedWindow = { complete: true, from: null };

/** Nothing is claimable - the cautious default for a screen. */
export const NO_WINDOW: OwnedWindow = { complete: false, from: null };

/** May a screen call a gap that began on `gapFrom` a break? */
export function canClaimGap(gapFrom: string, window: OwnedWindow): boolean {
  if (window.complete) return true;
  return !!window.from && gapFrom >= window.from;
}
