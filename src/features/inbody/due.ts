/**
 * IS SHE DUE AN INBODY SCAN? — the one answer (FileMaker parity, Oct 1 2026).
 *
 * FileMaker said it when a client was opened: "This client is due for an
 * InBody scan, it has been 51 sessions since their last scan". Journey
 * recorded scans and never said one was due. AJ, Oct 1 2026, on how often:
 * "up to the studio or even that client". So:
 *
 *   - the studio's number is a studio setting (`inbodyEverySessions`,
 *     features/studio-settings: the studio's own, else Max Strength's
 *     default, else the app's 50), read for the client's HOME studio, the
 *     same studio her InBody variation comes from;
 *   - the client may have her own (`clients/{id}.inbodyEvery`: a number of
 *     sessions, or "never" for "not for her"), set on Notes & Profile →
 *     Body & Pulse → InBody through the record form.
 *
 * WHAT IS COUNTED. Completed sessions in Journey on a studio day AFTER her
 * last scan's test day; a session on the scan day itself is the visit the
 * scan was taken at, and is not counted. Only Completed sessions: an
 * abandoned or running one never counts.
 *
 * WHAT IS NEVER CLAIMED (docs/business/migration-and-prior-history.md).
 *   - No scan in Journey, and Journey does not hold her whole story: she
 *     may well have been scanned in FileMaker. The answer is "No InBody scan
 *     in Journey yet", never a count.
 *   - Her last scan in Journey is older than every session Journey holds,
 *     and Journey does not hold her whole story (or the session list given
 *     is only a page of them): the sessions between the scan and the first
 *     one Journey has are not known. The count is a floor — "at least 12" —
 *     and a floor below her number never says she is not due.
 *   - No scan and her whole story: counted from her first session, and the
 *     sentence says there has been no scan rather than naming a last one.
 *
 * The briefing shows the line only when she is due, and it never stands in
 * the way of Start: it is information, the trainer decides.
 *
 * Pure apart from `sessionDayKey`'s time zone (the studio's Eastern day);
 * due.test.ts.
 */
import type { HistoryCoverage } from "../../lib/prior-history";
import type { WorkoutSession } from "../../types";
import { sessionDayKey } from "../client-history/model";

/** The bounds a number of sessions between scans must sit in, the studio's and a client's alike. */
export const INBODY_EVERY_MIN = 4;
export const INBODY_EVERY_MAX = 200;

/** What `clients/{id}.inbodyEvery` holds: her own number, "never", or nothing (the studio's). */
export type InBodyEvery = number | "never";

/** A client's own number, if it is a usable one; "never"; or null (follow the studio). Never bent into range. */
export function clientEveryOf(raw: unknown): InBodyEvery | null {
  if (raw === "never") return "never";
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  return raw >= INBODY_EVERY_MIN && raw <= INBODY_EVERY_MAX ? raw : null;
}

export interface InBodyDueInput {
  /** Her latest scan's test day (yyyy-mm-dd), or null when Journey holds none. */
  latestScanDay: string | null;
  /** The studio days of her Completed sessions in Journey, any order. */
  sessionDays: readonly string[];
  /** True when `sessionDays` is every Completed session Journey has for her, not a page of them. */
  listComplete: boolean;
  /** How much of her story Journey holds (lib/client-coverage.ts). */
  coverage: HistoryCoverage;
  /** The studio's number (the resolved studio setting). */
  studioEvery: number;
  /** The raw `clients/{id}.inbodyEvery`. */
  clientEvery?: unknown;
  /**
   * False while her sessions are still loading, or when their read failed:
   * nothing is counted, because an unread list is not an empty one.
   * Defaults to true.
   */
  sessionsRead?: boolean;
}

export type InBodyDue =
  /** "Not for her": nothing is counted or said. */
  | { kind: "off" }
  /** Her sessions aren't read (yet): nothing is claimed either way. */
  | { kind: "unread" }
  /** No scan in Journey and not her whole story: no count is claimed. */
  | { kind: "no-scan"; every: number; everySource: "client" | "studio" }
  | {
      kind: "count";
      /** Sessions since her last scan (or since her first session, when there was never one). */
      sessions: number;
      /** `sessions` is a floor: there may be more Journey cannot see. */
      atLeast: boolean;
      /** What the count runs from. */
      since: "scan" | "first-session";
      every: number;
      everySource: "client" | "studio";
      due: boolean;
    };

export function inbodyDue(input: InBodyDueInput): InBodyDue {
  const own = clientEveryOf(input.clientEvery);
  if (own === "never") return { kind: "off" };
  const every = own ?? input.studioEvery;
  const everySource = own !== null ? "client" : "studio";
  const whole = input.coverage === "complete";
  // With no scan and not her whole story there is nothing to count, read or not.
  if (input.sessionsRead === false && (input.latestScanDay || whole)) return { kind: "unread" };
  const days = input.sessionDays.filter((d) => typeof d === "string" && d.length >= 10);

  if (input.latestScanDay) {
    const scan = input.latestScanDay.slice(0, 10);
    const after = days.filter((d) => d > scan).length;
    // Every session we hold is after the scan: what came between the scan and
    // the first of them is either on a page not given, or before Journey.
    const allAfter = days.every((d) => d > scan);
    const atLeast = allAfter && (!input.listComplete || !whole);
    return { kind: "count", sessions: after, atLeast, since: "scan", every, everySource, due: after >= every };
  }

  if (!whole) return { kind: "no-scan", every, everySource };
  return {
    kind: "count",
    sessions: days.length,
    atLeast: !input.listComplete,
    since: "first-session",
    every,
    everySource,
    due: days.length >= every,
  };
}

/** The studio days of the Completed sessions in a list, for `sessionDays`. */
export function completedSessionDays(sessions: readonly WorkoutSession[] | null | undefined): string[] {
  const out: string[] = [];
  for (const s of sessions ?? []) {
    if (!s || s.status !== "Completed") continue;
    const day = sessionDayKey(s);
    if (day) out.push(day);
  }
  return out;
}

const plural = (n: number) => `${n} session${n === 1 ? "" : "s"}`;

/**
 * The briefing's one quiet line, or null when there is nothing to say there
 * (not due, not counted, or not for her). `possessive` is her · his · their.
 */
export function inbodyDueLine(due: InBodyDue, possessive: string): string | null {
  if (due.kind !== "count" || !due.due) return null;
  const n = `${due.atLeast ? "at least " : ""}${plural(due.sessions)}`;
  return due.since === "scan"
    ? `Due an InBody: ${n} since ${possessive} last scan`
    : `Due an InBody: ${n} and no scan yet`;
}

/** The InBody card's sentence, for every state. */
export function inbodyDueSentence(due: InBodyDue, possessive: string): string {
  if (due.kind === "off") return "InBody reminders are off for this client.";
  if (due.kind === "no-scan") return "No InBody scan in Journey yet.";
  if (due.kind === "unread") return `Counting ${possessive} sessions…`;
  const n = `${due.atLeast ? "At least " : ""}${plural(due.sessions)}`;
  const lead = due.atLeast ? n : n.charAt(0).toUpperCase() + n.slice(1);
  const body =
    due.since === "scan" ? `${lead} since ${possessive} last scan` : `${lead} and no scan yet`;
  if (due.due) return `${body}: due a scan (every ${due.every}).`;
  if (due.atLeast) return `${body} that Journey can see. A scan is due every ${due.every}.`;
  const left = due.every - due.sessions;
  return `${body}. Due in ${plural(left)} (every ${due.every}).`;
}

/** Where the number came from, in words. */
export function inbodyEverySourceWords(due: InBodyDue): string | null {
  if (due.kind === "off" || due.kind === "unread") return null;
  return due.everySource === "client" ? "this client's own number" : "the studio's number";
}
