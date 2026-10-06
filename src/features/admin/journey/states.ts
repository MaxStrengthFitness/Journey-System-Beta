/**
 * WHERE EACH CLIENT IS ON HER JOURNEY — one state, with its sentence, its
 * proof and the line it crossed. Pure: states.test.ts (TZ=America/New_York).
 *
 * The redesign's Operations room, phase 3 (Sep 28 2026; research-operations
 * §5.2). AJ's question 4 took the default: keep the names — New, Settling
 * in, Steady, Drifting, At risk, Lapsed, and beside the line Away, Back and
 * Unknown — on leader screens only. Question 5 took the default: Drifting at
 * twice her usual gap (at least 7 days) with nothing booked, At risk at the
 * studio's own number, Lapsed at 45 days, each meant to be a studio setting —
 * and each is one since wave 2 (below).
 *
 * THE LINES, and where each number lives:
 *
 *   At risk   the studio's own number: `breakDays` on the studio's renewal
 *             settings ("Warn me when a client has not visited for (days)",
 *             My Studio → Studio). That setting already exists.
 *   Drifting  `driftMultiple` × her usual gap, never under `driftMinDays` —
 *             the attendance watch's rule, which this file replaced (the
 *             attendance watch is this page now).
 *   Lapsed    `lapsedDays`.
 *   New       sessions 1 to `newMax`; Settling in to `settlingMax`.
 *
 * The last five are STUDIO SETTINGS since wave 2 (AJ, Sep 28 2026: "all
 * yes", and "let the admins assign the default within the app"): each
 * studio's own, else Max Strength's default set by head office in the app,
 * else the app's (features/studio-settings, `registry.ts` holds the app's
 * defaults and nothing here repeats them). Every rule below takes them as
 * `lines` (`JourneyLines`), so no caller can forget the studio's own; a
 * screen resolves them with `useStudioSettings`, the nightly job with
 * `resolveAll`, and `linesOf` turns either into the five. Setup → Rules
 * shows each with where it came from; My Studio → Studio changes them.
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
 *
 * INACTIVE, THE END OF THE LINE (the inactive round, Oct 1 2026; AJ: "a
 * client is active>MIA>inactive"). After Lapsed: past the studio's
 * `inactiveDays` (90 by default, always past Lapsed: resolve.ts) with nothing
 * booked, on Lapsed's own evidence, so a client Journey can't judge stays
 * Unknown and Away is never made Inactive by itself; or a leader's mark
 * (`mark`, inactive.ts), which holds until she visits after the day it was
 * made. A booking makes either kind active again: she reads Back.
 */
import { addDays, daysBetween } from "../../client-history/model";
import { formatDateWords } from "../../../lib/studio-time";
import type { RenewalSnapshot } from "../../renewals/types";
// The pure halves only: the job imports this file, and the settings' index
// brings the Firestore listeners with it.
import { SETTING_BY_KEY, type SettingKey } from "../../studio-settings/registry";
import { resolveAll, type ResolvedSetting } from "../../studio-settings/resolve";
import { rhythmFromSnapshot, rhythmProof, type Rhythm, type RhythmResult } from "./rhythm";
import { markHolds, markReasonWords, pastInactiveLine, type InactiveMark } from "./inactive";

export type JourneyState = "new" | "settling" | "steady" | "drifting" | "at-risk" | "lapsed" | "inactive" | "away" | "back" | "unknown";

/** The line, in its order: active, then MIA (Drifting · At risk · Lapsed), then Inactive. */
export const LINE_STATES: readonly JourneyState[] = ["new", "settling", "steady", "drifting", "at-risk", "lapsed", "inactive"];

/** MIA, as the leaders say it (Operations → Month's list, and the Journey's): Drifting · At risk · Lapsed. */
export const MIA_STATES: readonly JourneyState[] = ["drifting", "at-risk", "lapsed"];
/** Beside the line. */
export const BESIDE_STATES: readonly JourneyState[] = ["away", "back", "unknown"];

export const STATE_NAMES: Record<JourneyState, string> = {
  new: "New",
  settling: "Settling in",
  steady: "Steady",
  drifting: "Drifting",
  "at-risk": "At risk",
  lapsed: "Lapsed",
  inactive: "Inactive",
  away: "Away",
  back: "Back",
  unknown: "Unknown",
};

/**
 * THE LINES a studio may set for itself (wave 2, Sep 28 2026; Inactive since
 * Oct 1 2026). Their values are the studio settings' (features/studio-
 * settings/registry.ts: `driftMultiple`, `driftMinDays`, `lapsedDays`,
 * `inactiveDays`, `newMax`, `settlingMax`).
 */
export interface JourneyLines {
  /** Drifting: this many times her usual gap… (the attendance watch's rule before the Journey took it over). */
  driftMultiple: number;
  /** …but never under this many days. */
  driftMinDays: number;
  /** Lapsed: this many days since her last visit, with nothing booked. */
  lapsedDays: number;
  /** Inactive: this many days since her last visit, with nothing booked (always past Lapsed). */
  inactiveDays: number;
  /** New: sessions 1 to this many (a total that may be quoted). */
  newMax: number;
  /** Settling in: to this many sessions. */
  settlingMax: number;
}

export type LineKey = keyof JourneyLines;

/** The lines, in the order Setup → Rules reads them. */
export const LINE_KEYS: readonly LineKey[] = ["driftMultiple", "driftMinDays", "lapsedDays", "inactiveDays", "newMax", "settlingMax"];

const lineValue = (all: Record<SettingKey, ResolvedSetting>, key: LineKey): number => {
  const v = all[key]?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : (SETTING_BY_KEY[key].appDefault as number);
};

/** The five lines out of a studio's resolved settings (`resolveAll`, or `useStudioSettings().all`). */
export function linesOf(all: Record<SettingKey, ResolvedSetting>): JourneyLines {
  return {
    driftMultiple: lineValue(all, "driftMultiple"),
    driftMinDays: lineValue(all, "driftMinDays"),
    lapsedDays: lineValue(all, "lapsedDays"),
    inactiveDays: lineValue(all, "inactiveDays"),
    newMax: lineValue(all, "newMax"),
    settlingMax: lineValue(all, "settlingMax"),
  };
}

/**
 * The app's own lines — the registry's app defaults, and nothing more: what
 * a studio reads until its settings and head office's answer, and what the
 * tests measure against. Never a studio's line on its own.
 */
export const APP_LINES: JourneyLines = linesOf(resolveAll({ studio: null, company: null }));

/** Two sets of lines are the same five numbers. */
export function sameLines(a: JourneyLines, b: JourneyLines): boolean {
  return LINE_KEYS.every((k) => a[k] === b[k]);
}

/** "Twice", "2.5 times": the drift multiple in a sentence. */
export function multipleWords(m: number): string {
  return m === 2 ? "Twice" : m === 3 ? "Three times" : `${m} times`;
}

export type LineCrossed = "twice-usual" | "studio-line" | "lapse-line" | "due-back" | "inactive-line" | "marked" | null;

/** How she became Inactive: past the studio's line by herself, or a leader's mark. */
export type InactiveKind = "automatic" | "manual";

export interface InactiveInfo {
  kind: InactiveKind;
  /** The day she became Inactive: her last visit plus the line, or the day she was marked. */
  since: string;
  /** The leader's mark, when it is one. */
  mark: InactiveMark | null;
}

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
  /** The studio's five lines (its own, else Max Strength's default, else the app's). */
  lines: JourneyLines;
  /** A rhythm measured some other way (from visit days); by default, from the snapshot. */
  rhythm?: RhythmResult;
  /** A leader's inactive mark for her at this studio (inactive.ts), when there is one. */
  mark?: InactiveMark | null;
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
  /** The drift line in days for her (the studio's multiple of her usual gap, never under its least), when measured. */
  driftDays: number | null;
  /** The sentence: why she is where she is. */
  why: string;
  /** What backs it. */
  proof: string;
  /** Inactive: how, and since when (null, or absent, for every other state). */
  inactive?: InactiveInfo | null;
}

// Constant option sets: formatDateWords keys its formatter on the object, once.
const DAY_WORDS: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" };
const DAY_WORDS_YEAR: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };
const dayWords = (day: string, today: string) => {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const sameYear = y === Number(today.slice(0, 4));
  return formatDateWords(date, sameYear ? DAY_WORDS : DAY_WORDS_YEAR, "en-US");
};

const daysText = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** The drift line for a usual gap: the studio's multiple of it (twice, by default), never under its least (a week). */
export function driftLine(gapDays: number, lines: Pick<JourneyLines, "driftMultiple" | "driftMinDays">): number {
  return Math.max(lines.driftMinDays, Math.ceil(gapDays * lines.driftMultiple));
}

/** The stage a quotable total puts her at, or null past Settling in or with no total. */
export function stageOf(total: number | null, lines: Pick<JourneyLines, "newMax" | "settlingMax">): "new" | "settling" | null {
  if (total === null || total < 0) return null;
  if (total <= lines.newMax) return "new";
  if (total <= lines.settlingMax) return "settling";
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
    inactive: null as InactiveInfo | null,
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

  /* ---- A leader's mark (the inactive round): Inactive until she books, or visits after the day it was made ---- */
  const mark = i.mark ?? null;
  if (mark && markHolds(mark, i.lastVisit)) {
    const r = i.rhythm ?? (i.snapshot ? rhythmFromSnapshot(i.snapshot) : null);
    const markRhythm = r && r.measured === true ? r.rhythm : null;
    const marked = `Marked inactive${mark.markedBy.name ? ` by ${mark.markedBy.name}` : ""} on ${dayWords(mark.day, i.today)}`;
    const last = i.lastVisit ? `last visit ${dayWords(i.lastVisit, i.today)}` : "no visit on record";
    const markCommon = {
      ...base,
      judged: markRhythm !== null,
      rhythm: markRhythm,
      rhythmWhy: r && r.measured === false ? r.why : null,
      unknownWhy: null as UnknownWhy | null,
      daysSince: i.lastVisit ? daysBetween(i.lastVisit, i.today) : null,
      driftDays: markRhythm ? driftLine(markRhythm.gapDays, i.lines) : null,
    };
    if (i.next.state === "booked") {
      return {
        ...markCommon,
        state: "back",
        why: `${marked} (${markReasonWords(mark)}), and booked again since: back with us.`,
        proof: `${last} · ${i.next.day ? `next booking ${dayWords(i.next.day, i.today)}` : "booked"}`,
      };
    }
    return {
      ...markCommon,
      state: "inactive",
      crossed: "marked",
      since: mark.day,
      why: `${marked}: ${markReasonWords(mark)}.`,
      proof: `${last} · ${i.next.state === "none" ? "nothing booked" : "next booking unknown"}`,
      inactive: { kind: "manual", since: mark.day, mark },
    };
  }

  if (!i.snapshot) return unknown("no-record", "No nightly record for this client yet, so the visits can't be judged.", "Last night's record doesn't include this client yet.");
  if (i.nightlyStale) return unknown("stale-record", "The nightly record has stopped changing, so the rhythm isn't judged from it.", "The studio's nightly record hasn't changed in days.");

  const s = i.snapshot;
  const rhythmResult = i.rhythm ?? rhythmFromSnapshot(s);
  const rhythm = rhythmResult.measured === true ? rhythmResult.rhythm : null;
  const rhythmWhy = rhythmResult.measured === false ? rhythmResult.why : null;
  const daysSince = i.lastVisit ? daysBetween(i.lastVisit, i.today) : null;
  const L = i.lines;
  const drift = rhythm ? driftLine(rhythm.gapDays, L) : null;
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
        why: `Due back on ${dayWords(s.awayUntil, i.today)}, and nothing is booked.`,
        proof: `${reason} until ${dayWords(s.awayUntil, i.today)} · ${lastText} · nothing booked`,
      };
    }
    if (s.awayUntil && s.awayUntil < i.today) {
      return {
        ...unknown("bookings-unread", `Due back on ${dayWords(s.awayUntil, i.today)}, and whether anything is booked couldn't be read.`, `${reason} until ${dayWords(s.awayUntil, i.today)} · ${lastText} · next booking unknown`, rhythmWhy),
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
    const stage = stageOf(i.quotableTotal, L);
    if (stage && i.quotableTotal !== null) {
      return {
        ...common,
        state: stage,
        why: stage === "new" ? `At session ${i.quotableTotal} of the first ${L.newMax}.` : `Settling in: ${i.quotableTotal} sessions.`,
        proof: `${lastText} · ${nextText}`,
      };
    }
    return unknown("no-visit", "No visit on record since the studio's bookings began syncing, so the gap can't be measured.", `${nextText}`, rhythmWhy);
  }

  /* ---- The lines she crossed with nothing booked ---- */
  if (nothingBooked) {
    // Inactive by herself: past the studio's Inactive line (always past Lapsed), on Lapsed's own evidence.
    if (pastInactiveLine(daysSince, true, L.inactiveDays)) {
      const since = addDays(i.lastVisit as string, L.inactiveDays);
      return {
        ...common,
        state: "inactive",
        crossed: "inactive-line",
        since,
        why: `${daysText(daysSince)} since the last visit, past the studio's ${L.inactiveDays}-day line, and nothing is booked, so inactive.`,
        proof: `${lastText} · nothing booked${withRhythm}`,
        inactive: { kind: "automatic", since, mark: null },
      };
    }
    if (daysSince >= L.lapsedDays) {
      return {
        ...common,
        state: "lapsed",
        crossed: "lapse-line",
        since: addDays(i.lastVisit as string, L.lapsedDays),
        why: `${daysText(daysSince)} since the last visit, past the ${L.lapsedDays}-day line, and nothing is booked.`,
        proof: `${lastText} · nothing booked${withRhythm}`,
      };
    }
    if (daysSince >= i.breakDays) {
      return {
        ...common,
        state: "at-risk",
        crossed: "studio-line",
        since: addDays(i.lastVisit as string, i.breakDays),
        why: `${daysText(daysSince)} since the last visit, past the studio's ${i.breakDays}-day line, and nothing is booked.`,
        proof: `${lastText} · nothing booked${withRhythm}`,
      };
    }
    if (drift !== null && rhythm && daysSince >= drift) {
      return {
        ...common,
        state: "drifting",
        crossed: "twice-usual",
        since: addDays(i.lastVisit as string, drift),
        why: `Usually trains ${rhythm.words}. It has been ${daysText(daysSince)}, and nothing is booked.`,
        proof: `${lastText} · nothing booked · ${multipleWords(L.driftMultiple).toLowerCase()} the usual gap is ${daysText(drift)} · ${rhythmProof(rhythm)}`,
      };
    }
  }

  /* ---- A line crossed, and her bookings unread: nothing can be said ---- */
  const crossedLine = daysSince >= L.inactiveDays || daysSince >= L.lapsedDays || daysSince >= i.breakDays || (drift !== null && daysSince >= drift);
  if (crossedLine && i.next.state === "unknown") {
    return {
      ...unknown("bookings-unread", `${daysText(daysSince)} since the last visit, and whether anything is booked couldn't be read, so slipping can't be judged.`, `${lastText} · next booking unknown${withRhythm}`, rhythmWhy),
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
  const stage = stageOf(i.quotableTotal, L);
  if (stage && i.quotableTotal !== null) {
    return {
      ...common,
      state: stage,
      why: stage === "new" ? `At session ${i.quotableTotal} of the first ${L.newMax}.` : `Settling in: ${i.quotableTotal} sessions${rhythm ? `, ${rhythm.words}` : ""}.`,
      proof: `${lastText} · ${nextText}${withRhythm}`,
    };
  }

  /* ---- Steady, or too new to judge ---- */
  if (rhythm) {
    return {
      ...common,
      state: "steady",
      why: `Trains ${rhythm.words}, a steady rhythm.`,
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
