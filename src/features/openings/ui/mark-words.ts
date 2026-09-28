/**
 * WHAT "MARK THIS TIME" SAYS (Openings round, Sep 27 2026, phase 6: marks).
 *
 * Every sentence about the time itself is present.ts's: a mark's own lines
 * ("Marked Always full by Jo, Oct 3.", "The bookings say: …", "Marked 64 days
 * ago. Still true?") and the bookings' disagreement ("The bookings disagree:
 * room in 6 of the last 8 Mondays.") come from `markLines`, never from here.
 * What is here is the form's own few words: its heading, its buttons, what
 * each word changes, the note's hint, and what it says when a write fails.
 *
 * They sit beside words.ts (the screens' other words, in one place) only
 * while other parts of the round write that file at the same time; the next
 * pass folds them into it, and both into present.ts, after which this file
 * goes. No part types a sentence of its own.
 *
 * PURE MODULE.
 */
import { MAX_MARK_NOTE, type MarkWord } from "../marks";
import { timeName } from "../rows";

/** The foot of a time's sheet: its heading, and the button that opens the form. */
export const MARK_THIS_TIME = "Mark this time";
export const CHANGE_THE_MARK = "Change the mark";
export const REMOVE_THE_MARK = "Remove the mark";

/** Before anyone has marked the time. */
export const MARK_INTRO = "Say what this time is, in the grid's own words. A mark sits beside the numbers and never replaces them.";

/** A mark's two words: the grid's own. */
export const MARK_WORD: Record<MarkWord, string> = {
  full: "Always full",
  room: "Usually has room",
};

/** The choice's label. */
export const MARK_CHOICE_LABEL = "This time is";

/** What each word changes (the proposal's "What a mark changes"). */
export const MARK_CHANGES: Record<MarkWord, string> = {
  full: "Always full counts as usually full on Next 7 days, and is never offered as a new regular time.",
  room: "Usually has room is offered as a new regular time, with the mark and the numbers shown beside it.",
};

export const MARK_NOTE_LABEL = "A note, if it helps";

/** Under the note: who sees it, and how much is left. "Everyone at Westlake sees it, with your name. 12 of 200." */
export function markNoteHint(studioName: string, length: number): string {
  return `Everyone at ${studioName} sees it, with your name. ${length} of ${MAX_MARK_NOTE}.`;
}

export const SAVE_THE_MARK = "Save the mark";
export const SAVING_THE_MARK = "Saving…";
export const CANCEL = "Cancel";

/** The review's two answers, under "Marked 64 days ago. Still true?". */
export const KEEP = "Keep";
export const REMOVE = "Remove";

/** Before a mark goes, one question: it goes for everyone. */
export function removeQuestion(studioName: string): string {
  return `Remove this mark? It goes for everyone at ${studioName}.`;
}
export const REMOVE_IT = "Remove it";

export const SAVE_FAILED = "Couldn't save the mark just now. Check the connection and try again.";
export const KEEP_FAILED = "Couldn't keep the mark just now. Check the connection and try again.";
export const REMOVE_FAILED = "Couldn't remove the mark just now. Check the connection and try again.";

/** What the leave question calls a half-written mark: "You have unsaved changes to the mark on Monday 8:00 AM." */
export function markLabel(key: string): string {
  return `the mark on ${timeName(key)}`;
}

/** A mark's note, as the sheet shows it: in quotation marks, as it was written. */
export function markNoteLine(note: string): string {
  return `“${note}”`;
}
