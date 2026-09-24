/**
 * BODY & PULSE → HOW SHE ARRIVES AND LEAVES — the briefing's answers at the
 * door and the trainer's dose after the session, session by session (AJ's
 * decision 9).
 *
 * Client codex, Sep 2026 (phase 13). Every session asks, at the door, "How's
 * the body since last time?" (and sleep, energy and stress when the trainer
 * thinks to), and after it the trainer judges how the session landed. Those
 * answers sit on the session documents. This module reads them for the Over
 * time card and the figure's region list:
 *
 *   readiness  `readinessDial` (rating/session-reads.ts) — the Dial, with the
 *              legacy sleepQuality / energyLevel / stressLevel fallbacks
 *   the dose   `doseOf` — the Dial, with the legacy clientFeel fallback
 *   regions    `regionDial` — a body region tapped at the door
 *
 * NO NEW READ. The sessions are the journal's own — `useClientJournal`
 * already streams her newest SESSION_SUMMARY_LIMIT session documents (no
 * exercise logs) for the wrap-up notes, and hands them out as
 * `recentSessions`. A failed listener is final, so there is no "Try again".
 *
 * NOT ASKED IS NOT "AS USUAL". An untouched dial is null and counts as not
 * asked; a sentence speaks only from RULE_OF_THREE answers ("not enough for a
 * line yet (needs 3)"). And every count says "her last {n} sessions", never
 * "all": the page may not reach back six months, and when it does not the
 * sentence says since when ("(since Mar 3)").
 *
 * ONLY WHERE IT COULD HAVE BEEN ASKED. "Not asked" is said only of a session
 * the briefing ran for. An imported session (FileMaker, a chart) and one
 * logged later (Log past session) never had a briefing or an after-session
 * screen, and the recovery question has no legacy field and did not exist
 * before RECOVERY_ASKED_FROM — so those sessions are left out of the count
 * and named for what they are ("3 more were imported, and imports don't
 * record the door"), never counted as unasked. An empty Journey history is
 * "no detail here", never "this never happened" (the migration rule).
 *
 * The app describes; the trainer decides: `doseSentence` (lib/post-session)
 * is deliberately NOT used — its "next time" clauses are progression talk.
 *
 * Pure: no React, no Firestore. arrivals.test.ts (TZ=America/New_York).
 */
import type { DialValue, WorkoutSession } from "../../../types";
import type { JournalLoad } from "../../../hooks/useClientJournal";
import { doseOf, readinessDial, regionDial } from "../../rating/session-reads";
import {
  DOSE_SCALE,
  READINESS_KEYS,
  READINESS_SCALES,
  RECOVERY_ASKED_FROM,
  REGION_SCALE,
  dialWord,
  type DialScale,
  type ReadinessKey,
} from "../../rating/scales";
import { RULE_OF_THREE } from "../../clinical-review/types";
import { isBackfilledSession, isLegacySession, sessionDayKey, sessionStartInstant } from "../../client-history/model";
import type { Pronouns } from "../kit/pronouns";
import type { DoorTaps, FigureRegion } from "./figure-map";
import { dayWords } from "./pulse-read";

/* ------------------------------------------------------------------ */
/* What is read                                                        */
/* ------------------------------------------------------------------ */

/** The briefing's four questions and the dose, in the order the timeline draws them. */
export type ArriveKey = ReadinessKey | "dose";
export const ARRIVE_ORDER: readonly ArriveKey[] = ["recovery", "sleep", "energy", "stress", "dose"];

/**
 * The briefing's body map (data/body-regions.ts) onto the figure's regions,
 * so a region tapped at the door lands on the region the figure lists.
 */
export const SESSION_REGION_TO_FIGURE: Readonly<Record<string, FigureRegion>> = {
  Neck: "neck",
  Shoulders: "shoulder",
  "Upper Back": "upper_back",
  Chest: "chest",
  "Lower Back": "lower_back",
  Core: "abdomen",
  Hips: "hip",
  Glutes: "glute",
  Quads: "thigh",
  Hamstrings: "hamstring",
  Knees: "knee",
  Calves: "calf_shin",
  Ankles: "ankle",
  "Wrists / Forearms": "wrist_hand",
};

/**
 * How a session came to be in Journey, which decides whether the door and
 * the dose could have been recorded at all:
 *
 *   run       run on the floor in Journey: the briefing and the post-session
 *             screen both ran
 *   imported  brought in from earlier records (FileMaker, a chart) — the
 *             legacy markers, or no start time at all (every session run in
 *             Journey has one; the chart importer writes none, even when it
 *             matched the trainer)
 *   logged    entered afterwards with Log past session (the 12:00 UTC mark)
 */
export type ArrivalOrigin = "run" | "imported" | "logged";

export function originOf(s: WorkoutSession): ArrivalOrigin {
  if (isLegacySession(s)) return "imported";
  if (isBackfilledSession(s)) return "logged";
  return sessionStartInstant(s) ? "run" : "imported";
}

/** One completed session, as the door and the dose recorded it. */
export interface Arrival {
  sessionId: string;
  /** The studio day it belongs to (`sessionDayKey`). */
  day: string;
  origin: ArrivalOrigin;
  /** Each question's answer; null = not asked (never "as usual"). */
  readiness: Record<ReadinessKey, DialValue | null>;
  /** How it landed; null = not judged. */
  dose: DialValue | null;
  /** The body regions tapped at the door, on the figure's regions. */
  regions: ReadonlyArray<{ region: FigureRegion; dial: DialValue | null }>;
}

/** The dial a key reads off an arrival. */
export function arriveValue(a: Arrival, key: ArriveKey): DialValue | null {
  return key === "dose" ? a.dose : a.readiness[key];
}

export function scaleOf(key: ArriveKey): DialScale {
  return key === "dose" ? DOSE_SCALE : READINESS_SCALES[key];
}

/**
 * Whether the question (or the dose) could have been answered at this
 * session: it was, or the session was run in Journey — and, for recovery, on
 * or after the day the briefing began asking it. Only these sessions may be
 * counted as "not asked".
 */
export function couldAsk(a: Arrival, key: ArriveKey): boolean {
  if (arriveValue(a, key) !== null) return true;
  if (a.origin !== "run") return false;
  return !(key === "recovery" && a.day < RECOVERY_ASKED_FROM);
}

/* ------------------------------------------------------------------ */
/* How far back the page reaches                                       */
/* ------------------------------------------------------------------ */

/**
 * How much of her history the journal's page of sessions covers:
 *
 *   all      fewer than the limit came back — every session she has
 *   since    the page is full; everything from `day` on is in it
 *   unknown  the page is full of sessions whose dates sort above every
 *            yyyy-mm-dd (an old "9/1/2024" style), so it cannot say which
 *            recent sessions it holds
 *
 * The listener orders by the `date` STRING, descending. A missing session
 * therefore sorts at or below the smallest date string the page holds, and a
 * yyyy-mm-dd day at or above that string is in the page. Every session run
 * or imported in Journey is dated yyyy-mm-dd; only an old hand-typed date is
 * not, and those sort above or below the whole Journey era by their first
 * character.
 */
export type PageReach = { kind: "all" } | { kind: "since"; day: string } | { kind: "unknown" };

const ISO_PREFIX = /^(\d{4})-(\d{1,2})-(\d{1,2})/;

export function pageReach(sessions: ReadonlyArray<Pick<WorkoutSession, "date">>, limit: number): PageReach {
  if (sessions.length < limit) return { kind: "all" };
  let cut: string | null = null;
  for (const s of sessions) {
    const d = typeof s.date === "string" ? s.date : "";
    if (cut === null || d < cut) cut = d;
  }
  const iso = cut ? ISO_PREFIX.exec(cut) : null;
  if (iso) return { kind: "since", day: `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}` };
  // Below "2000": every yyyy-mm-dd day sorts above it, so all of them are in the page.
  if ((cut ?? "") < "2000") return { kind: "all" };
  return { kind: "unknown" };
}

/* ------------------------------------------------------------------ */
/* The arrivals                                                        */
/* ------------------------------------------------------------------ */

export interface ArriveWindow {
  /** First studio day, yyyy-mm-dd, inclusive. */
  from: string;
  /** Last studio day (today), inclusive. */
  to: string;
}

/**
 * Her completed sessions inside the window, oldest first, each with what the
 * door and the dose recorded. In-progress sessions are left out (nothing is
 * judged until the end), and so is a session whose day cannot be told.
 */
export function arrivalsOf(sessions: readonly WorkoutSession[], window: ArriveWindow): Arrival[] {
  const out: Arrival[] = [];
  for (const s of sessions) {
    if (!s || s.status !== "Completed") continue;
    const day = sessionDayKey(s);
    if (!day || day < window.from || day > window.to) continue;
    const check = s.preSessionCheckIn ?? null;
    const readiness = {} as Record<ReadinessKey, DialValue | null>;
    for (const k of READINESS_KEYS) readiness[k] = readinessDial(check, k);
    const regions: Array<{ region: FigureRegion; dial: DialValue | null }> = [];
    const seen = new Set<FigureRegion>();
    for (const tag of check?.bodyStates ?? []) {
      const region = tag ? SESSION_REGION_TO_FIGURE[tag.region] : undefined;
      if (!region || seen.has(region)) continue;
      seen.add(region);
      regions.push({ region, dial: regionDial(tag) });
    }
    out.push({ sessionId: String(s.id ?? ""), day, origin: originOf(s), readiness, dose: doseOf(s), regions });
  }
  // Oldest first; a day's two sessions keep the page's order (newest first → reversed).
  return out.reverse().sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/**
 * What the card reads from the journal's sessions: whether they answered,
 * the arrivals in the window, and since when the count holds when the page
 * does not reach the window's start. `unordered` is a page whose dates can't
 * say which sessions are recent (`pageReach` → unknown): nothing is drawn.
 */
export interface ArrivalsRead {
  state: JournalLoad | "unordered";
  arrivals: Arrival[];
  /** Set when the page stops short of the window's first day. */
  sinceDay: string | null;
}

export function readArrivals({
  sessions,
  state,
  window,
  limit,
}: {
  sessions: readonly WorkoutSession[] | null | undefined;
  state: JournalLoad | null | undefined;
  window: ArriveWindow;
  /** The journal's page size (SESSION_SUMMARY_LIMIT). */
  limit: number;
}): ArrivalsRead {
  if (state !== "ready") return { state: state === "failed" ? "failed" : "loading", arrivals: [], sinceDay: null };
  const list = sessions ?? [];
  const reach = pageReach(list, limit);
  if (reach.kind === "unknown") return { state: "unordered", arrivals: [], sinceDay: null };
  const sinceDay = reach.kind === "since" && reach.day > window.from ? reach.day : null;
  return { state: "ready", arrivals: arrivalsOf(list, window), sinceDay };
}

/* ------------------------------------------------------------------ */
/* Summaries and sentences                                             */
/* ------------------------------------------------------------------ */

export interface ArriveSummary {
  key: ArriveKey;
  /** Sessions it was asked at (judged at, for the dose). */
  asked: number;
  /** Sessions it COULD have been asked at (`couldAsk`) — the count's denominator. */
  sessions: number;
  /** Asked, and below the centre ("A bit short", "Rough night"; "Drained", "Wiped out"). */
  below: number;
  sinceDay: string | null;
  /**
   * Sessions in the window left out of `sessions` because nothing could be
   * recorded at them — named for what they are, never called unasked:
   * imported from earlier records (FileMaker, a chart), logged later with
   * Log past session, or run in Journey before the briefing asked the
   * question (recovery, before RECOVERY_ASKED_FROM).
   */
  imported: number;
  logged: number;
  before: number;
}

export function arriveSummary(read: Pick<ArrivalsRead, "arrivals" | "sinceDay">, key: ArriveKey): ArriveSummary {
  let asked = 0;
  let below = 0;
  let sessions = 0;
  let imported = 0;
  let logged = 0;
  let before = 0;
  for (const a of read.arrivals) {
    const v = arriveValue(a, key);
    if (v !== null) {
      asked += 1;
      sessions += 1;
      if (v < 0) below += 1;
    } else if (couldAsk(a, key)) sessions += 1;
    else if (a.origin === "imported") imported += 1;
    else if (a.origin === "logged") logged += 1;
    else before += 1;
  }
  return { key, asked, sessions, below, sinceDay: read.sinceDay, imported, logged, before };
}

const q = (text: string) => `“${text}”`;
const was = (n: number) => (n === 1 ? "was" : "were");
const capFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** What a key records: the door, or how the session landed. */
const recordsWhat = (key: ArriveKey) => (key === "dose" ? "how it landed" : "the door");

/** "Sep 16" — the day the recovery question was added to the briefing. */
const addedOn = (now: Date) => dayWords(RECOVERY_ASKED_FROM, now) || RECOVERY_ASKED_FROM;

/**
 * The sessions a count is out of: "her last 24 sessions", "her last 24
 * sessions (since Mar 3)", "her one session in these six months". "Run in
 * Journey" is added when imported or logged sessions were left out, and
 * "since the question was added (Sep 16)" replaces the page's reach when
 * sessions from before the question were.
 */
function outOf(n: number, s: ArriveSummary, p: Pick<Pronouns, "possessive">, now: Date): string {
  const ran = s.imported + s.logged > 0 ? " run in Journey" : "";
  if (s.before > 0) {
    // The page holds a session from before the question, so every session since it is in the page.
    const from = ` since the question was added (${addedOn(now)})`;
    return n === 1 ? `${p.possessive} one session${ran}${from}` : `${p.possessive} ${n} sessions${ran}${from}`;
  }
  const since = s.sinceDay ? dayWords(s.sinceDay, now) : "";
  if (n === 1) return `${p.possessive} one session${ran} ${since ? `since ${since}` : "in these six months"}`;
  return `${p.possessive} last ${n} sessions${ran}${since ? ` (since ${since})` : ""}`;
}

/**
 * The sessions left out because nothing could be recorded at them, said for
 * what they are — " 3 more were imported, and imports don't record the
 * door." — rather than counted as "not asked". "" when none were.
 */
function leftOut({ key, imported: i, logged: l }: ArriveSummary): string {
  const what = recordsWhat(key);
  if (i > 0 && l > 0) return ` ${i} more ${was(i)} imported and ${l} logged later; neither records ${what}.`;
  if (i > 0) return ` ${i} more ${was(i)} imported, and imports don't record ${what}.`;
  if (l > 0) return ` ${l} more ${was(l)} logged later, and Log past session doesn't record ${what}.`;
  return "";
}

/**
 * Sessions in the window, but none it could have been asked at: say why
 * each could not record it, never "wasn't asked".
 *
 *   The briefing asks “How's the body since last time?” at the door. Her 30
 *   sessions in these six months came before the question was added (Sep 16).
 */
function nothingRecordable(s: ArriveSummary, p: Pronouns, now: Date): string {
  const { key, imported: i, logged: l, before: b, sinceDay } = s;
  const total = i + l + b;
  const what = recordsWhat(key);
  const lead =
    key === "dose"
      ? "The trainer judges how it landed after each session."
      : `The briefing asks ${q(scaleOf(key).ask)} at the door.`;
  const since = sinceDay ? dayWords(sinceDay, now) : "";
  const theirs =
    total === 1
      ? `${p.possessive} one session ${since ? `since ${since}` : "in these six months"}`
      : since
        ? `${p.possessive} last ${total} sessions (since ${since})`
        : `${p.possessive} ${total} sessions in these six months`;
  if (b === total) return `${lead} ${capFirst(theirs)} came before the question was added (${addedOn(now)}).`;
  if (i === total) return `${lead} ${capFirst(theirs)} ${was(total)} imported, and imports don't record ${what}.`;
  if (l === total) {
    return `${lead} ${capFirst(theirs)} ${was(total)} logged later, and Log past session doesn't record ${what}.`;
  }
  const parts = [
    b > 0 ? `${b} came before the question was added (${addedOn(now)})` : "",
    i > 0 ? `${i} ${was(i)} imported` : "",
    l > 0 ? `${l} ${was(l)} logged later` : "",
  ].filter(Boolean);
  const list = `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${lead} None of ${theirs} could record it: ${list}.`;
}

/**
 * The sentence for one question (or the dose) over her sessions in the
 * window. Words, never a number or a score; below RULE_OF_THREE answers it
 * says there is not enough for a line; a question not asked is "not asked",
 * never "as usual" — and only a session it could have been asked at is ever
 * called unasked (`couldAsk`).
 *
 *   “How's the body since last time?” asked at 12 of her last 24 sessions.
 *   “Still feeling it” or “Still wrecked” at 3 of them.
 */
export function arriveSentence(summary: ArriveSummary, p: Pronouns, now: Date): string {
  const { key, asked, sessions: n, sinceDay } = summary;
  const scale = scaleOf(key);
  const dose = key === "dose";
  const [w0, w1, w2] = scale.words;

  if (n === 0) {
    if (summary.imported + summary.logged + summary.before > 0) return nothingRecordable(summary, p, now);
    const span = sinceDay ? `since ${dayWords(sinceDay, now)}` : "in these six months";
    return `${dose ? "Not judged yet" : "Not asked yet"}: Journey holds no session of ${p.possessiveAlone} ${span}.`;
  }

  const tail = leftOut(summary);
  if (asked === 0) {
    const none = n === 1 ? outOf(1, summary, p, now) : `any of ${outOf(n, summary, p, now)}`;
    if (dose) return `How it landed wasn't judged after ${none}.${tail}`;
    const lead = key === "recovery" ? `The briefing asks ${q(scale.ask)} at the door. It` : q(scale.ask);
    return `${lead} wasn't asked at ${none}.${tail}`;
  }

  const where = n === 1 ? outOf(1, summary, p, now) : `${asked} of ${outOf(n, summary, p, now)}`;
  const head = dose
    ? `How it landed, judged by the trainer after ${where}`
    : `${q(scale.ask)} asked at ${where}`;

  return `${head}${answered(summary, [w0, w1, w2])}${tail}`;
}

/** What follows the "asked at …" head: too few answers, or how many were below the centre. */
function answered({ key, asked, below }: ArriveSummary, [w0, w1, w2]: readonly string[]): string {
  if (asked < RULE_OF_THREE) return `, not enough for a line yet (needs ${RULE_OF_THREE}).`;
  if (below === 0) {
    // The dose's right side is "too little", not "better": say only what did not happen.
    return key === "dose" ? `. Never ${q(w1)} or ${q(w0)}.` : `. At or above ${q(w2)} every time.`;
  }
  return `. ${q(w1)} or ${q(w0)} at ${below} of them.`;
}

/**
 * The same sentence without the question, for a timeline lane whose title
 * already is the question (its first line says where it is asked): "Asked
 * at 5 of her last 24 sessions. “A bit short” or “Rough night” at 2 of
 * them." — for the dose, "Judged at 5 of her last 6 sessions. …".
 */
export function arriveDetail(summary: ArriveSummary, p: Pronouns, now: Date): string {
  const { key, asked, sessions: n } = summary;
  const dose = key === "dose";
  if (n === 0) return arriveSentence(summary, p, now);
  const tail = leftOut(summary);
  if (asked === 0) {
    const none = n === 1 ? outOf(1, summary, p, now) : `any of ${outOf(n, summary, p, now)}`;
    return `${dose ? "Not judged" : "Not asked"} at ${none}.${tail}`;
  }
  const where = n === 1 ? outOf(1, summary, p, now) : `${asked} of ${outOf(n, summary, p, now)}`;
  return `${dose ? "Judged" : "Asked"} at ${where}${answered(summary, scaleOf(key).words)}${tail}`;
}

/* ------------------------------------------------------------------ */
/* The body map at the door                                            */
/* ------------------------------------------------------------------ */

/**
 * How often each region was tapped on the briefing's body map, for the
 * figure's region list ("At the door: “Stiff” on Mar 10 · tapped at 3 of her
 * last 24 sessions."): the sessions it was tapped at, of the sessions whose
 * door could have been recorded — run in Journey (the body map is older than
 * the Dial, so there is no start day), or tapped — and the newest tap's word
 * and day. `runOnly` says imported or logged sessions were left out.
 */
export function regionTaps(read: Pick<ArrivalsRead, "arrivals">): Map<FigureRegion, DoorTaps> {
  const out = new Map<FigureRegion, DoorTaps>();
  const counted = read.arrivals.filter((a) => a.origin === "run" || a.regions.length > 0);
  const n = counted.length;
  const runOnly = counted.length < read.arrivals.length;
  for (const a of counted) {
    for (const r of a.regions) {
      const prev = out.get(r.region);
      // Oldest first, so a later tap is the newer one.
      out.set(r.region, {
        k: (prev?.k ?? 0) + 1,
        n,
        runOnly,
        latest: { word: dialWord(REGION_SCALE, r.dial), day: a.day },
      });
    }
  }
  return out;
}
