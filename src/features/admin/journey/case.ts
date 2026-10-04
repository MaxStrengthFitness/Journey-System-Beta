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
 * TWO KINDS OF CASE, one answer:
 *
 *   worked out   no case is stored for her: the owner is her usual trainer
 *                (the renewal snapshot's `primaryTrainerId`, who coached most
 *                of her visits over the last 90 days), else "a leader"; the
 *                next step is written by rules from her state and whether the
 *                owner is in today; it is the leader's once the day she
 *                crossed the line (states.ts `since`) is CASE_ESCALATE_DAYS
 *                behind — and, since nothing records a step on a worked-out
 *                case, the page says to check with the owner first.
 *   stored       wave 2 (AJ, Sep 28 2026: "all yes"): a leader opened it
 *                (case-store.ts, studios/{s}/cases/{clientId}): the owner, the
 *                next step, the due day, the outcome and its reason are what
 *                the team wrote. "After 3 days with no step it comes to the
 *                leader" is worked out from `updatedAt` — any change by the
 *                owner or a leader is a step. A step left empty reads the
 *                rules' own.
 *
 * "BOOKED AGAIN" IS WORKED OUT ON READ, never set by the sync (the sync is
 * the Mindbody integration): a case still open whose client has a booking
 * Journey can see reads "Booked again", and offers to close it; a worked-out
 * case closes the same way by itself (Back).
 */
import { addDays, daysBetween } from "../../client-history/model";
import type { CaseOutcome, StoredCase } from "./case-store";
import type { ClientJourney, JourneyState } from "./states";

/** After this many days with no step recorded, a case is the leader's (AJ's question 7, default). */
export const CASE_ESCALATE_DAYS = 3;

export interface CaseOwnerInput {
  /** Her usual trainer, when last night's record names one Journey knows; `uid` is their sign-in id (a stored owner's id). */
  trainer: { id: string; name: string; uid?: string | null } | null;
  /** Their first and last booking today ("in 7:00 AM – 3:00 PM"), or null when not in today. */
  inToday: string | null;
}

export interface StoredCaseInput {
  stored: StoredCase | null;
  /** The studio day of `stored.updatedAt`, worked out on the studio's clock by the caller. */
  updatedOn: string | null;
}

export interface CaseView {
  /** Someone should act: slipping or lapsed (worked out), or a stored case still open. */
  open: boolean;
  /** A case is stored for her (a leader opened one). */
  stored: boolean;
  owner: { id: string | null; name: string; usual: boolean };
  nextStep: string;
  /** When the case becomes the leader's if nobody has caught her (worked out), or the day the team set (stored), yyyy-mm-dd. */
  dueDay: string | null;
  /** It is the leader's now. */
  leaders: boolean;
  /** Why it is the leader's, in words, when it is. */
  leadersWhy: string | null;
  /** "Booked again" — worked out from her bookings or stored; paused and lost are the team's words. */
  outcome: CaseOutcome | null;
  /** Booked again, worked out on read, on a case still open in the store: offer to close it. */
  bookedAgainOnRead: boolean;
  outcomeWords: string;
}

const OPEN: ReadonlySet<JourneyState> = new Set(["drifting", "at-risk", "lapsed"]);

const dayWords = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
};

/** Is this a state a leader would open a case for? */
export function caseWorthy(state: JourneyState): boolean {
  return OPEN.has(state);
}

/** The next step the rules would write for her (a stored case's empty step reads this). */
function ruleStep(j: ClientJourney, owner: { usual: boolean; name: string }, first: string, dueDay: string | null, inToday: string | null): string {
  switch (j.state) {
    case "drifting":
      return inToday
        ? `${first} is in today (${inToday}): ask if they know why. If nobody knows by ${dueDay ? dayWords(dueDay) : "the third day"}, ${owner.usual ? first : "a leader"} phones the client (a person, not the app) and writes a note on the profile about how it went.`
        : `Ask ${owner.usual ? first : "the client's usual trainer"} next time they're in. If nobody knows by ${dueDay ? dayWords(dueDay) : "the third day"}, ${owner.usual ? first : "a leader"} phones the client (a person, not the app) and writes a note on the profile about how it went.`;
    case "at-risk":
      return `${owner.usual ? first : "A leader"} phones the client ${inToday ? "today" : "the next day they're in"} (a person, not the app) and writes a note on the profile about how it went.`;
    case "lapsed":
      return "A note on file. If the client comes by, someone has a word in person; one call from whoever knows the client best is fine.";
    case "inactive":
      return j.inactive?.kind === "manual"
        ? "Nothing to chase: a leader marked the client inactive. If a win-back is worth trying, open a case and name who reaches out (a person, not the app)."
        : "A win-back, if it's worth one: whoever knows the client best reaches out once (a person, not the app) and writes a note on the profile about how it went.";
    case "back":
      return "Welcome the client back. Booking again closed the case by itself.";
    case "away":
      return j.why.includes("until") ? "Nothing to do before the day due back." : "Nothing to do; next time someone speaks with the client, ask about a day back.";
    case "new":
      return "Book the next two before the client leaves, and find a standing slot.";
    case "settling":
      return `Nothing to do. ${owner.usual ? first : "The trainer"} is building a rhythm.`;
    case "steady":
      return "Nothing to do. The rhythm is steady.";
    default:
      return j.unknownWhy === "bookings-unread"
        ? "Nothing can be judged until the bookings are read. Check Setup → Mindbody."
        : j.unknownWhy === "too-new"
          ? "Nothing to judge yet. A rhythm is measured once six visits over four weeks are on record."
          : "Nothing can be judged until last night's record includes this client.";
  }
}

export function caseOf(j: ClientJourney, who: CaseOwnerInput, today: string, store: StoredCaseInput = { stored: null, updatedOn: null }): CaseView {
  const s = store.stored;
  const usualUid = who.trainer ? who.trainer.uid || who.trainer.id : null;

  /* ---- a stored case: what the team wrote ---- */
  if (s) {
    const usual = Boolean(usualUid && s.owner.id === usualUid);
    const owner = { id: s.owner.id, name: s.owner.name || "Someone on the team", usual };
    const first = owner.name.split(" ")[0];
    const booked = j.nextBooking !== null;
    const bookedAgainOnRead = s.outcome === "open" && booked;
    const open = s.outcome === "open" && !bookedAgainOnRead;
    const quiet = store.updatedOn ? daysBetween(store.updatedOn, today) : null;
    const leaders = open && quiet !== null && quiet > CASE_ESCALATE_DAYS;
    const nextStep = s.nextStep.trim() || ruleStep(j, owner, first, s.dueOn, usual ? who.inToday : null);
    const outcome: CaseOutcome | null = bookedAgainOnRead ? "booked-again" : s.outcome === "open" ? null : s.outcome;
    const reason = s.reason ? ` ${s.reason.trim().replace(/\.?$/, ".")}` : "";
    const outcomeWords = bookedAgainOnRead
      ? `Booked again: Journey sees the next booking on ${dayWords(j.nextBooking as string)}. Close the case once you're happy the client is back.`
      : s.outcome === "booked-again"
        ? `Closed: booked again.${reason}`
        : s.outcome === "paused"
          ? `Paused.${reason || " No reason written."}`
          : s.outcome === "lost"
            ? `Lost.${reason || " No reason written."}`
            : "Open. Booked again closes it: Journey notices the booking from Mindbody, and the case offers to close.";
    return {
      open,
      stored: true,
      owner,
      nextStep,
      dueDay: s.dueOn,
      leaders,
      leadersWhy: leaders && store.updatedOn ? `No step recorded since ${dayWords(store.updatedOn)}, so it's the leader's now. Check with ${first} first.` : null,
      outcome,
      bookedAgainOnRead,
      outcomeWords,
    };
  }

  /* ---- worked out: nothing stored ---- */
  const owner = who.trainer ? { id: who.trainer.uid || who.trainer.id, name: who.trainer.name, usual: true } : { id: null, name: "A leader", usual: false };
  const first = owner.usual ? owner.name.split(" ")[0] : "A leader";
  const open = OPEN.has(j.state);
  const dueDay = open && j.since ? addDays(j.since, CASE_ESCALATE_DAYS) : null;
  const leaders = Boolean(dueDay && today > dueDay);
  let nextStep = ruleStep(j, owner, first, dueDay, who.inToday);
  const leadersWhy = open && leaders ? `It's past ${dayWords(dueDay as string)}, so it's the leader's now. No case is stored for this client, so check with ${owner.usual ? first : "the team"} first.` : null;
  if (leadersWhy) nextStep = `${nextStep} ${leadersWhy}`;
  const outcome: CaseOutcome | null = j.state === "back" ? "booked-again" : null;
  const outcomeWords = outcome ? "Booked again: the case closed by itself when Journey saw the booking from Mindbody." : open ? "Booked again closes the case by itself. Journey notices the booking from Mindbody." : "";
  return { open, stored: false, owner, nextStep, dueDay, leaders, leadersWhy, outcome, bookedAgainOnRead: false, outcomeWords };
}
