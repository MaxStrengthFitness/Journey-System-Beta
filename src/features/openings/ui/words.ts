/**
 * THE FEW WORDS OPENINGS' SCREENS SAY THAT THE CORE HAS NO SENTENCE FOR YET
 * (Openings round, Sep 27 2026, the section's review).
 *
 * Every sentence about the studio's times is present.ts's. What is here is
 * the rest, in ONE place rather than typed into each part: the loading
 * lines, the gate's line, what a screen says when the marks couldn't be
 * read, the two sentences for a chip that narrows a list to nothing while
 * Anyone still has something, and Who's usually in's copies of
 * ColleagueStandingWeek's words. They are handed to the core to fold into
 * present.ts (and the two card words into standing-week/present.ts), after
 * which this file imports them from there, or goes.
 *
 * PURE MODULE.
 */
import type { Viewer } from "../present";

/** A part waiting on the summary (or the marks it is read with). */
export const READING_USUAL_WEEK = "Reading the usual week…";

/** A part waiting on the studio's standing weeks. */
export const READING_WEEKS = "Reading the standing weeks…";

/** A time's sheet, when the marks couldn't be read: never "no mark". */
export const MARKS_UNKNOWN_TIME = "Can't tell just now whether anyone has marked this time.";

/**
 * A new regular time, when the marks couldn't be read (refused, offline, or
 * only this iPad's cache answered). A time a colleague marked Always full is
 * never offered, so with the marks unknown nothing is offered for good.
 */
export const MARKS_UNKNOWN_OFFERS = "Can't tell just now whether anyone has marked a time Always full, so no time is offered for good yet.";

/** The gate's line, for someone who may not read the studio's standing weeks. */
export function notForYouSentence(studioName: string): string {
  return `Openings is for the people who work at ${studioName}.`;
}

/** Who's usually in, with nobody on the studio's staff (as Team says it). */
export function nobodyHereSentence(studioName: string): string {
  return `Nobody works at ${studioName} yet.`;
}

/** Who's usually in: ColleagueStandingWeek's own words for a week (a copy until standing-week/present.ts exports them). */
export const NO_AGREED_WEEK = "No agreed week yet.";
export const EMPTY_WEEK = "An empty week.";

/** Who's usually in: the regulars' names, only after a tap. */
export const SHOW_REGULARS = "Show the regulars' names";
export const HIDE_REGULARS = "Hide the regulars' names";

/** Who a chip narrows to, as a sentence says it: "you", or the name present.ts gives. */
function chipWho(trainerId: string, names: (id: string) => string, viewer: Viewer): string {
  return trainerId === viewer.trainerId ? "you" : names(trainerId);
}

/**
 * Next 7 days, when the chip alone empties the list: the studio has lines,
 * none with this trainer. Never "Nothing has opened up in the next 7 days",
 * which is a claim about the whole studio.
 */
export function nothingOpenedWithSentence(trainerId: string, names: (id: string) => string, viewer: Viewer): string {
  return `Nothing has opened up with ${chipWho(trainerId, names, viewer)} in the next 7 days. Anyone shows the rest of the studio.`;
}

/**
 * A new regular time, when the chip alone empties the list: the studio has
 * times to offer, none of them this trainer's.
 */
export function noOffersWithSentence(trainerId: string, names: (id: string) => string, viewer: Viewer): string {
  const who = chipWho(trainerId, names, viewer);
  return who === "you"
    ? "You have no usual times with room to offer right now. Anyone shows the rest of the studio."
    : `${who.charAt(0).toUpperCase()}${who.slice(1)} has no usual times with room to offer right now. Anyone shows the rest of the studio.`;
}
