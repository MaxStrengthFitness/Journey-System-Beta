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
 * UNWIRED, ON PURPOSE. Twenty-six weeks of a client's visits are in nothing
 * the Hub holds: the app streams one day of sessions, the Hub's bookings run
 * from yesterday to a week ahead, and the nightly renewals job reads 90 days
 * (its proof counts 12 weeks, its pace 8). Reading 26 weeks of sessions for
 * a studio on the Hub is the kind of scan the house rules refuse, and having
 * the nightly job keep the answer on the client is a new stored field and a
 * longer read for that job — both need AJ's OK. The rule and its words wait
 * here for whichever he picks.
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
