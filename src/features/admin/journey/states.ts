/**
 * WHERE EACH CLIENT IS ON HER JOURNEY — one state, with its sentence, its
 * proof and the line it crossed. Pure: states.test.ts (TZ=America/New_York).
 *
 * The redesign's Operations room, phase 3 (Sep 28 2026; research-operations
 * §5.2). AJ's question 4 took the default: keep the names — New, Settling
 * in, Steady, Drifting, At risk, Lapsed, and beside the line Away, Back and
 * Unknown — on leader screens only. Question 5 took the default: Drifting at
 * twice her usual gap (at least 7 days) with nothing booked, At risk at the
 * studio's own number, Lapsed at 45 days, each meant to be a studio setting.
 *
 * THE LINES, and where each number lives:
 *
 *   At risk   the studio's own number: `breakDays` on the studio's renewal
 *             settings ("Warn me when a client has not visited for (days)",
 *             My Studio → Studio). That setting already exists.
 *   Drifting  DRIFT_MULTIPLE × her usual gap, never under DRIFT_MIN_DAYS —
 *             the attendance watch's own rule (overview/questions.ts).
 *   Lapsed    LAPSED_DAYS.
 *   New       sessions 1 to NEW_MAX; Settling in to SETTLING_MAX.
 *
 * The last four are NAMED CONSTANTS for now. Making each a studio setting
 * means storing new fields on the studio's settings, a data change that waits
 * for AJ's OK; until then the Rules page (Setup → Rules) says each number.
 *
 * WHAT IT REFUSES TO SAY (the house rules):
 *
 *   - A client whose last visit isn't known is UNKNOWN, never Lapsed. Last in
 *     comes from the Client Directory's row model (last night's record of her
 *     Mindbody bookings and Journey sessions, her last session, her machine
 *     days), so a gap is a Mindbody-backed fact, never a low Journey count.
 *   - New and Settling in come only from a total that may be quoted
 *     (lib/client-coverage canQuoteSessionNumber, through the row's `total`):
 *     a twelve-year client nobody has recorded a total for is never "New".
 *   - With no measured rhythm there is no Drifting and no Steady: she is New
 *     or Settling in when her total says so, otherwise Unknown, "too new to
 *     judge". The studio's own line (At risk) and the lapse line still apply,
 *     because they need only her last visit.
 *   - A nightly record that has stopped changing (brief.ts, NIGHTLY_STALE_
 *     DAYS) makes every state Unknown: a frozen pace is no rhythm.
 *   - "Nothing booked" is said only when the bookings were read: the row's
 *     `next` is "none" only off a fresh read, and "unknown" is never nothing.
 *     A client past a line whose bookings couldn't be read is Unknown, never
 *     Steady.
 */
import { addDays, daysBetween } from "../../client-history/model";
import type { RenewalSnapshot } from "../../renewals/types";
import { rhythmFromSnapshot, rhythmProof, type Rhythm, type RhythmResult } from "./rhythm";

export type JourneyState = "new" | "settling" | "steady" | "drifting" | "at-risk" | "lapsed" | "away" | "back" | "unknown";

/** The line, in its order. */
export const LINE_STATES: readonly JourneyState[] = ["new", "settling", "steady", "drifting", "at-risk", "lapsed"];
/** Beside the line. */
export const BESIDE_STATES: readonly JourneyState[] = ["away", "back", "unknown"];

export const STATE_NAMES: Record<JourneyState, string> = {
  new: "New",
  settling: "Settling in",
  steady: "Steady",
  drifting: "Drifting",
  "at-risk": "At risk",
  lapsed: "Lapsed",
  away: "Away",
  back: "Back",
  unknown: "Unknown",
};

/** Drifting: this many times her usual gap… (the attendance watch's LONG_BREAK_MULTIPLE). */
export const DRIFT_MULTIPLE = 2;
/** …but never under this many days (the attendance watch's MIN_BREAK_DAYS). */
export const DRIFT_MIN_DAYS = 7;
/** Lapsed: this many days since her last visit with nothing booked. A studio setting once AJ approves storing it. */
export const LAPSED_DAYS = 45;
/** New: sessions 1 to this many (a total that may be quoted). */
export const NEW_MAX = 10;
/** Settling in: to this many sessions. */
export const SETTLING_MAX = 24;

export type LineCrossed = "twice-usual" | "studio-line" | "lapse-line" | "due-back" | null;

export type UnknownWhy = "no-record" | "stale-record" | "no-visit" | "bookings-unread" | "too-new";

export interface JourneyInput {
  /** The client is active (inactive clients are not on the Journey at all). */
  active: boolean;
  snapshot: RenewalSnapshot | null;
  /** Her last visit (the row model's Last in, when known), yyyy-mm-dd. */
  lastVisit: string | null;
  /** Her next booking, as the row model read it. */
  next: { state: "booked" | "none" | "unknown"; day: string | null };
  /** Her session total when it may be quoted; null when it can't. */
  quotableTotal: number | null;
  today: string;
  /** The studio's "warn me when a client has not visited for (days)". */
  breakDays: number;
  /** The studio's nightly record has stopped changing. */
  nightlyStale: boolean;
  /** A rhythm measured some other way (from visit days); by default, from the snapshot. */
  rhythm?: RhythmResult;
}

export interface ClientJourney {
  state: JourneyState;
  /** A measured rhythm stands behind the state (false: "too new to judge"). */
  judged: boolean;
  rhythm: Rhythm | null;
  /** Why the rhythm isn't measured, when it isn't. */
  rhythmWhy: string | null;
  unknownWhy: UnknownWhy | null;
  daysSince: number | null;
  lastVisit: string | null;
  nextBooking: string | null;
  /** Which line she crossed, for the proof to name. */
  crossed: LineCrossed;
  /** The day she crossed it (her last visit plus the line), when there is one. */
  since: string | null;
  /** The drift line in days for her (twice her usual gap, at least 7), when measured. */
  driftDays: number | null;
  /** The sentence: why she is where she is. */
  why: string;
  /** What backs it. */
  proof: string;
}

const dayWords = (day: string, today: string) => {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const sameYear = y === Number(today.slice(0, 4));
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
};

const daysText = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** The drift line for a usual gap: twice it, never under a week. */
export function driftLine(gapDays: number): number {
  return Math.max(DRIFT_MIN_DAYS, Math.ceil(gapDays * DRIFT_MULTIPLE));
}

/** The stage a quotable total puts her at, or null past Settling in or with no total. */
export function stageOf(total: number | null): "new" | "settling" | null {
  if (total === null || total < 0) return null;
  if (total <= NEW_MAX) return "new";
  if (total <= SETTLING_MAX) return "settling";
  return null;
}

/**
 * One client's state. Order matters, and it is the research's: Away first
 * (a known reason is not a risk), then the lines she crossed with nothing
 * booked (Lapsed, At risk, Drifting), then Back (booked again after
 * crossing one), then her stage (New, Settling in), then Steady — or
 * Unknown when nothing can be judged.
 */
export function journeyOf(i: JourneyInput): ClientJourney {
  const base = {
    lastVisit: i.lastVisit,
    nextBooking: i.next.state === "booked" ? i.next.day : null,
    crossed: null as LineCrossed,
    since: null as string | null,
  };
  const unknown = (why: UnknownWhy, sentence: string, proof: string, rhythmWhy: string | null = null): ClientJourney => ({
    ...base,
    state: "unknown",
    judged: false,
    rhythm: null,
    rhythmWhy,
    unknownWhy: why,
    daysSince: i.lastVisit ? daysBetween(i.lastVisit, i.today) : null,
    driftDays: null,
    why: sentence,
    proof,
  });

  if (!i.snapshot) return unknown("no-record", "No nightly record for her yet, so her visits can't be judged.", "Last night's record hasn't reached her.");
  if (i.nightlyStale) return unknown("stale-record", "The nightly record has stopped changing, so her rhythm isn't judged from it.", "The studio's nightly record hasn't changed in days.");

  const s = i.snapshot;
  const rhythmResult = i.rhythm ?? rhythmFromSnapshot(s);
  const rhythm = rhythmResult.measured === true ? rhythmResult.rhythm : null;
  const rhythmWhy = rhythmResult.measured === false ? rhythmResult.why : null;
  const daysSince = i.lastVisit ? daysBetween(i.lastVisit, i.today) : null;
  const drift = rhythm ? driftLine(rhythm.gapDays) : null;
  const booked = i.next.state === "booked";
  const nothingBooked = i.next.state === "none";
  const lastText = i.lastVisit ? `last visit ${dayWords(i.lastVisit, i.today)}` : "no visit on record";
  const nextText = booked && i.next.day ? `next booking ${dayWords(i.next.day, i.today)}` : nothingBooked ? "nothing booked" : "next booking unknown";
  const withRhythm = rhythm ? ` · usually ${rhythm.words} (${rhythmProof(rhythm)})` : "";
  const judged = rhythm !== null;
  const common = { ...base, judged, rhythm, rhythmWhy, unknownWhy: null as UnknownWhy | null, daysSince, driftDays: drift };

  /* ---- Away: a person (or Mindbody's own event) recorded a reason and a return date ---- */
  if (s.situation === "away") {
    const reason = s.awayReason ?? "Away";
    if (s.awayUntil && s.awayUntil < i.today && booked) {
      return {
        ...common,
        state: "back",
        why: `Back from ${reason.toLowerCase()}: booked again.`,
        proof: `${reason} until ${dayWords(s.awayUntil, i.today)} · ${lastText} · ${nextText}`,
      };
    }
    if (s.awayUntil && s.awayUntil < i.today && nothingBooked) {
      return {
        ...common,
        state: "at-risk",
        crossed: "due-back",
        since: addDays(s.awayUntil, 1),
        why: `She was due back on ${dayWords(s.awayUntil, i.today)}, and nothing is booked.`,
        proof: `${reason} until ${dayWords(s.awayUntil, i.today)} · ${lastText} · nothing booked`,
      };
    }
    if (s.awayUntil && s.awayUntil < i.today) {
      return {
        ...unknown("bookings-unread", `She was due back on ${dayWords(s.awayUntil, i.today)}, and whether anything is booked couldn't be read.`, `${reason} until ${dayWords(s.awayUntil, i.today)} · ${lastText} · next booking unknown`, rhythmWhy),
        daysSince,
      };
    }
    return {
      ...common,
      state: "away",
      why: s.awayUntil ? `${reason} until ${dayWords(s.awayUntil, i.today)}.` : `${reason}, with no return date on record.`,
      proof: `${lastText} · ${nextText}`,
    };
  }

  /* ---- No last visit: nothing to measure a gap from ---- */
  if (daysSince === null) {
    const stage = stageOf(i.quotableTotal);
    if (stage && i.quotableTotal !== null) {
      return {
        ...common,
        state: stage,
        why: stage === "new" ? `At session ${i.quotableTotal} of her first ${NEW_MAX}.` : `Settling in: ${i.quotableTotal} sessions.`,
        proof: `${lastText} · ${nextText}`,
      };
    }
    return unknown("no-visit", "No visit on record since the studio's bookings began syncing, so her gap can't be measured.", `${nextText}`, rhythmWhy);
  }

  /* ---- The lines she crossed with nothing booked ---- */
  if (nothingBooked) {
    if (daysSince >= LAPSED_DAYS) {
      return {
        ...common,
        state: "lapsed",
        crossed: "lapse-line",
        since: addDays(i.lastVisit as string, LAPSED_DAYS),
        why: `${daysText(daysSince)} since her last visit, past the ${LAPSED_DAYS}-day line, and nothing is booked.`,
        proof: `${lastText} · nothing booked${withRhythm}`,
      };
    }
    if (daysSince >= i.breakDays) {
      return {
        ...common,
        state: "at-risk",
        crossed: "studio-line",
        since: addDays(i.lastVisit as string, i.breakDays),
        why: `${daysText(daysSince)} since her last visit, past the studio's ${i.breakDays}-day line, and nothing is booked.`,
        proof: `${lastText} · nothing booked${withRhythm}`,
      };
    }
    if (drift !== null && rhythm && daysSince >= drift) {
      return {
        ...common,
        state: "drifting",
        crossed: "twice-usual",
        since: addDays(i.lastVisit as string, drift),
        why: `She usually trains ${rhythm.words}. It has been ${daysText(daysSince)}, and nothing is booked.`,
        proof: `${lastText} · nothing booked · twice her usual gap is ${daysText(drift)} · ${rhythmProof(rhythm)}`,
      };
    }
  }

  /* ---- A line crossed, and her bookings unread: nothing can be said ---- */
  const crossedLine = daysSince >= LAPSED_DAYS || daysSince >= i.breakDays || (drift !== null && daysSince >= drift);
  if (crossedLine && i.next.state === "unknown") {
    return {
      ...unknown("bookings-unread", `${daysText(daysSince)} since her last visit, and whether anything is booked couldn't be read, so whether she is slipping can't be said.`, `${lastText} · next booking unknown${withRhythm}`, rhythmWhy),
      daysSince,
      driftDays: drift,
    };
  }

  /* ---- Back: booked again after crossing a line ---- */
  if (booked && crossedLine) {
    return {
      ...common,
      state: "back",
      why: `Booked again after ${daysText(daysSince)} away.`,
      proof: `${lastText} · ${nextText}${withRhythm}`,
    };
  }

  /* ---- Her stage, when her total may be quoted ---- */
  const stage = stageOf(i.quotableTotal);
  if (stage && i.quotableTotal !== null) {
    return {
      ...common,
      state: stage,
      why: stage === "new" ? `At session ${i.quotableTotal} of her first ${NEW_MAX}.` : `Settling in: ${i.quotableTotal} sessions${rhythm ? `, ${rhythm.words}` : ""}.`,
      proof: `${lastText} · ${nextText}${withRhythm}`,
    };
  }

  /* ---- Steady, or too new to judge ---- */
  if (rhythm) {
    return {
      ...common,
      state: "steady",
      why: `Trains ${rhythm.words}, in her own rhythm.`,
      proof: `${lastText} · ${nextText} · ${rhythmProof(rhythm)}`,
    };
  }
  return {
    ...unknown("too-new", "Too new to judge: not enough visits on record for a usual gap yet.", `${lastText} · ${nextText}`, rhythmWhy),
    daysSince,
  };
}

/** How many clients are in each state. */
export function countStates(journeys: readonly ClientJourney[]): Record<JourneyState, number> {
  const out = Object.fromEntries([...LINE_STATES, ...BESIDE_STATES].map((s) => [s, 0])) as Record<JourneyState, number>;
  for (const j of journeys) out[j.state] += 1;
  return out;
}

/** Slipping away: the two states worth catching before they lapse. */
export function isSlipping(state: JourneyState): boolean {
  return state === "drifting" || state === "at-risk";
}
