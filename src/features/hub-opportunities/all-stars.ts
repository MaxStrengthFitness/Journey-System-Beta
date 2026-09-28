/**
 * ALL STARS (hub cherry round, Sep 28 2026). Pure: all-stars.test.ts.
 *
 * AJ, Hub question 6 on the Redesign Blueprints: "New is 1 to 3, building is
 * 4 to 49, regulars are 50 and up. we could aslo add a catagory for our all
 * stars for the clients that come 2 times a week almost every week of the
 * year for over 6 months".
 *
 * THE RULE (proposed back to him, decisions.json `toConfirm`): twice a week
 * on average, in at least 9 of every 10 weeks, for the last 26 weeks. Read
 * this way, so a two-week holiday doesn't cost the name — "almost every week
 * of the year" is what the 9 in 10 is for:
 *
 *   - the window is the 26 whole weeks before the day asked about (today is
 *     left out, so a session not logged YET never decides it);
 *   - "in at least 9 of every 10 weeks": a visit in at least 24 of the 26
 *     (23 of 26 is 88%, short of 9 in 10);
 *   - "twice a week on average": over the weeks she came, rounded to the
 *     nearest quarter as the renewals pace is ("nobody's habit is known to
 *     two decimal places", renewals/engine.ts) — 2 or more;
 *   - a visit is a studio day with a Journey session logged (done means
 *     logged, lib/booking-state); two on one day are one visit.
 *
 * THE MIGRATION (prior history is real history). A week with nothing in
 * Journey is only a missed week when Journey would have seen the visit, so
 * the name is given ONLY when Journey holds every visit in the window: the
 * part of her timeline Journey owns (`ownedWindow`, lib/history-claims)
 * reaches back past the window's first day, and so does the record the
 * visits were read from. Anything short of that is "can't tell", and a
 * screen says nothing — never a guess, and never "not an all star" either:
 * "not yet" is for the rule's own use and no screen shows it.
 *
 * WIRED (wave 2 hub, Sep 28 2026; AJ: "all yes"). Twenty-six weeks of a
 * client's visits are in nothing the Hub holds, and the iPad never works
 * them out: the nightly renewals job does (the Operations helper's addition,
 * wave 2), and writes the studio's all stars to ONE document,
 * `studios/{studioId}/watch/hubMarks` — `allStars: [{ clientId,
 * weeksWithVisit, perWeek }]` and `computedAt`. The Hub reads it once per
 * studio visit (use-hub-marks.ts) and `readHubMarks` below decides what may
 * be said: nothing when the document is missing, older than three days or
 * not one this app can read, and nothing about a client who isn't in it.
 * Where it shows: an "All stars" section after New · Building · Regulars on
 * the Sessions sort, and `allStarWords` ("All star: in 25 of the last 26
 * weeks, about twice a week.") in the peek and the opened row.
 */
import type { OwnedWindow } from "../../lib/history-claims";
import { addDays } from "../client-history/model";

/** The window, in whole weeks. */
export const ALL_STAR_WEEKS = 26;
/** Weeks with a visit, of the window: 9 in every 10, rounded up (24 of 26). */
export const ALL_STAR_MIN_WEEKS = Math.ceil(ALL_STAR_WEEKS * 0.9);
/** Visits a week, on average over the weeks she came. */
export const ALL_STAR_PER_WEEK = 2;

/** The name, where the Sessions sort would say New, Building and Regulars. */
export const ALL_STARS_LABEL = "All stars";

export type AllStarStanding =
  | {
      standing: "all-star";
      /** Weeks with a visit, of the 26. */
      weeksIn: number;
      /** Visits a week over those weeks, to the nearest quarter. */
      perWeek: number;
      /** The window, first and last studio day. */
      from: string;
      to: string;
    }
  /** Journey holds the whole window and she doesn't meet the rule. No screen says so. */
  | { standing: "not-yet" }
  /** Journey can't hold every visit in the window: say nothing. */
  | { standing: "cant-tell"; reason: "window-not-owned" | "records-too-short" };

export interface AllStarInput {
  /** The studio day it is asked about, yyyy-mm-dd — the real today. */
  asOf: string;
  /** Studio days she trained (a Journey session logged), any order; repeats are fine. */
  visitDays: ReadonlyArray<string>;
  /** The first studio day the visits were read in full from, or null when unknown. */
  recordsFrom: string | null;
  /** The part of her timeline Journey owns (`ownedWindow`). */
  owned: OwnedWindow;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The 26 whole weeks before `asOf`: [first day, last day]. */
export function allStarWindow(asOf: string): { from: string; to: string } {
  const to = addDays(asOf, -1);
  return { from: addDays(to, -(ALL_STAR_WEEKS * 7 - 1)), to };
}

export function allStarStanding({ asOf, visitDays, recordsFrom, owned }: AllStarInput): AllStarStanding {
  const { from, to } = allStarWindow(asOf);
  // Journey must own every day of the window, or a quiet week proves nothing.
  if (!owned.complete && !(owned.from && owned.from <= from)) return { standing: "cant-tell", reason: "window-not-owned" };
  // And the visits must have been read from before it began.
  if (!recordsFrom || !DAY_KEY.test(recordsFrom) || recordsFrom > from) return { standing: "cant-tell", reason: "records-too-short" };

  const days = new Set(visitDays.filter((d) => DAY_KEY.test(d) && d >= from && d <= to));
  let weeksIn = 0;
  for (let w = 0; w < ALL_STAR_WEEKS; w++) {
    const end = addDays(to, -7 * w);
    const start = addDays(end, -6);
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (days.has(d)) {
        weeksIn++;
        break;
      }
    }
  }
  if (weeksIn < ALL_STAR_MIN_WEEKS) return { standing: "not-yet" };
  const perWeek = Math.round((days.size / weeksIn) * 4) / 4;
  if (perWeek < ALL_STAR_PER_WEEK) return { standing: "not-yet" };
  return { standing: "all-star", weeksIn, perWeek, from, to };
}

/**
 * The sentence with its proof, for the peek or an opened row: "All star: in
 * 25 of the last 26 weeks, about twice a week." Null for anything but the
 * name itself — a screen never says who isn't one.
 */
export function allStarWords(s: AllStarStanding): string | null {
  if (s.standing !== "all-star") return null;
  const n = Math.round(s.perWeek);
  const pace = n === 2 ? "about twice a week" : n === 3 ? "about three times a week" : `about ${n} times a week`;
  return `All star: in ${s.weeksIn} of the last ${ALL_STAR_WEEKS} weeks, ${pace}.`;
}

/* ------------------------------------------------------------------ */
/* The nightly marks (wave 2 hub)                                      */
/* ------------------------------------------------------------------ */

/** The document the nightly renewals job writes: `studios/{studioId}/watch/hubMarks`. */
export const HUB_MARKS_WATCH_ID = "hubMarks";
/** Marks older than this are stale, and the Hub says nothing (AJ's wave 2 brief: "older than 3 days"). */
export const HUB_MARKS_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
/** A `computedAt` further ahead of the iPad's clock than this is not one to trust. */
const HUB_MARKS_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

/** One client the job named an all star, as the Hub holds her. */
export interface AllStarMark {
  clientId: string;
  /** Weeks with a visit, of the last 26. */
  weeksIn: number;
  /** Visits a week over those weeks, to the nearest quarter. */
  perWeek: number;
}

export type HubMarksRead =
  | { state: "ok"; computedAt: Date; allStars: ReadonlyMap<string, AllStarMark> }
  /** Written, but longer ago than three days: say nothing. */
  | { state: "stale"; computedAt: Date }
  /** Not a document this app can read (no date, no list): say nothing. */
  | { state: "unreadable" };

/** A Firestore Timestamp, a Date, an ISO string, milliseconds or `{ seconds }`, as a Date. */
function instantOf(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (v && typeof v === "object") {
    const t = v as { toDate?: () => Date; seconds?: unknown };
    if (typeof t.toDate === "function") {
      try {
        return instantOf(t.toDate());
      } catch {
        return null;
      }
    }
    if (typeof t.seconds === "number") return instantOf(t.seconds * 1000);
  }
  return null;
}

/**
 * One row the job wrote, or null for one the rule wouldn't stand behind —
 * dropped, never guessed at. The iPad recomputes nothing: it only checks the
 * numbers are the rule's (24 to 26 weeks, about twice a week or more).
 */
function markOf(row: unknown): AllStarMark | null {
  if (!row || typeof row !== "object") return null;
  const r = row as { clientId?: unknown; weeksWithVisit?: unknown; perWeek?: unknown };
  const clientId = typeof r.clientId === "string" ? r.clientId.trim() : "";
  if (!clientId) return null;
  const weeksIn = r.weeksWithVisit;
  if (typeof weeksIn !== "number" || !Number.isInteger(weeksIn) || weeksIn < ALL_STAR_MIN_WEEKS || weeksIn > ALL_STAR_WEEKS) return null;
  if (typeof r.perWeek !== "number" || !Number.isFinite(r.perWeek)) return null;
  const perWeek = Math.round(r.perWeek * 4) / 4;
  if (perWeek < ALL_STAR_PER_WEEK) return null;
  return { clientId, weeksIn, perWeek };
}

/**
 * What the Hub may say from the nightly marks, `now` being the iPad's clock.
 * Only "ok" says anything, and only about the clients it names.
 */
export function readHubMarks(data: unknown, now: Date): HubMarksRead {
  if (!data || typeof data !== "object") return { state: "unreadable" };
  const d = data as { computedAt?: unknown; allStars?: unknown };
  const computedAt = instantOf(d.computedAt);
  if (!computedAt || !Array.isArray(d.allStars)) return { state: "unreadable" };
  const age = now.getTime() - computedAt.getTime();
  if (age < -HUB_MARKS_FUTURE_SKEW_MS) return { state: "unreadable" };
  if (age > HUB_MARKS_MAX_AGE_MS) return { state: "stale", computedAt };
  const allStars = new Map<string, AllStarMark>();
  for (const row of d.allStars) {
    const mark = markOf(row);
    if (mark) allStars.set(mark.clientId, mark);
  }
  return { state: "ok", computedAt, allStars };
}

/** "All star: in 25 of the last 26 weeks, about twice a week." for a client the marks name. */
export function allStarMarkWords(mark: AllStarMark): string {
  return allStarWords({ standing: "all-star", weeksIn: mark.weeksIn, perWeek: mark.perWeek, from: "", to: "" }) as string;
}
