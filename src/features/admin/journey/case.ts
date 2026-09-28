/**
 * A CLIENT'S CASE — who owns catching her, the next step, when it comes to
 * the leader, and how it ended. Pure: case.test.ts.
 *
 * The redesign's Operations room, phase 4 (Sep 28 2026; research-operations
 * §6.3, the Gainsight call to action). A slipping client becomes a case: why,
 * proof, owner, next step and outcome. AJ's answers took the defaults:
 *
 *   q6  a person phoning a client counts as in person — a human call, noted
 *       afterwards. The app itself never contacts anyone, so every next step
 *       names a PERSON and says so.
 *   q7  the usual trainer owns a case, and after CASE_ESCALATE_DAYS with no
 *       step it comes to the leader.
 *
 * WHAT IS NOT STORED (the case fields — owner, next step, due date, outcome
 * and reason on the attendance watchlist — need AJ's OK, and "Booked again"
 * set by the sync is a sync change): so this file works the case OUT of what
 * is already known, and nothing here is written.
 *
 *   owner      her usual trainer: the renewal snapshot's `primaryTrainerId`
 *              (who coached most of her visits over the last 90 days), else
 *              "a leader". Handing it on needs the owner field: not built.
 *   next step  written by rules from her state and whether the owner is in
 *              today (the week's bookings).
 *   due        the day she crossed the line (states.ts `since`) plus
 *              CASE_ESCALATE_DAYS. Journey can't record a step yet, so past
 *              that day the case says it is the leader's AND to check with
 *              the owner first — never that nobody did anything.
 *   outcome    only the one Journey can see by itself: she booked again
 *              (Back). Away, Not reached and Lost are a leader's words and
 *              need the outcome field: not built.
 */
import { addDays } from "../../client-history/model";
import type { ClientJourney, JourneyState } from "./states";

/** After this many days with no step recorded, a case is the leader's (AJ's question 7, default). */
export const CASE_ESCALATE_DAYS = 3;

export interface CaseOwnerInput {
  /** Her usual trainer, when last night's record names one Journey knows. */
  trainer: { id: string; name: string } | null;
  /** Their first and last booking today ("in 7:00 AM – 3:00 PM"), or null when not in today. */
  inToday: string | null;
}

export interface CaseView {
  /** She is a case: slipping or lapsed, or due back with nothing booked. */
  open: boolean;
  owner: { id: string | null; name: string; usual: boolean };
  nextStep: string;
  /** When the case becomes the leader's if nobody has caught her, yyyy-mm-dd. */
  dueDay: string | null;
  /** Past the due day. */
  leaders: boolean;
  /** "Booked again" — the one outcome Journey sees by itself. */
  outcome: "booked-again" | null;
  outcomeWords: string;
}

const OPEN: ReadonlySet<JourneyState> = new Set(["drifting", "at-risk", "lapsed"]);

const dayWords = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
};

export function caseOf(j: ClientJourney, who: CaseOwnerInput, today: string): CaseView {
  const owner = who.trainer ? { id: who.trainer.id, name: who.trainer.name, usual: true } : { id: null, name: "A leader", usual: false };
  const first = owner.usual ? owner.name.split(" ")[0] : "A leader";
  const open = OPEN.has(j.state);
  const dueDay = open && j.since ? addDays(j.since, CASE_ESCALATE_DAYS) : null;
  const leaders = Boolean(dueDay && today > dueDay);
  const inToday = who.inToday;

  let nextStep: string;
  switch (j.state) {
    case "drifting":
      nextStep = inToday
        ? `${first} is in today (${inToday}): ask if they know why. If nobody knows by ${dueDay ? dayWords(dueDay) : "the third day"}, ${owner.usual ? first : "a leader"} phones her (a person, not the app) and writes a note on her profile about how it went.`
        : `Ask ${owner.usual ? first : "her usual trainer"} next time they're in. If nobody knows by ${dueDay ? dayWords(dueDay) : "the third day"}, ${owner.usual ? first : "a leader"} phones her (a person, not the app) and writes a note on her profile about how it went.`;
      break;
    case "at-risk":
      nextStep = `${owner.usual ? first : "A leader"} phones her ${inToday ? "today" : "the next day they're in"} (a person, not the app) and writes a note on her profile about how it went.`;
      break;
    case "lapsed":
      nextStep = "A note on file. If she comes by, someone catches her in person; one call from the person who knows her best is fine.";
      break;
    case "back":
      nextStep = "Welcome her back. Booking again closed the case by itself.";
      break;
    case "away":
      nextStep = j.why.includes("until") ? "Nothing to do until she's due back." : "Nothing to do; ask when she expects to be back next time someone speaks with her.";
      break;
    case "new":
      nextStep = "Book her next two before she leaves, and find her a standing slot.";
      break;
    case "settling":
      nextStep = `Nothing to do. ${owner.usual ? first : "Her trainer"} is building her rhythm.`;
      break;
    case "steady":
      nextStep = "Nothing to do. She's in her own rhythm.";
      break;
    default:
      nextStep =
        j.unknownWhy === "bookings-unread"
          ? "Nothing can be judged until her bookings are read. Check Setup → Mindbody."
          : j.unknownWhy === "too-new"
            ? "Nothing to judge yet. Her rhythm is measured once six visits over four weeks are on record."
            : "Nothing can be judged until last night's record reaches her.";
  }
  if (open && leaders) {
    nextStep = `${nextStep} It's past ${dayWords(dueDay as string)}, so it's the leader's now. Journey can't record a step yet, so check with ${owner.usual ? first : "the team"} first.`;
  }

  const outcome = j.state === "back" ? "booked-again" : null;
  const outcomeWords = outcome ? "Booked again: the case closed by itself when Journey saw the booking from Mindbody." : open ? "Booked again closes the case by itself. Journey notices the booking from Mindbody." : "";
  return { open, owner, nextStep, dueDay, leaders, outcome, outcomeWords };
}
