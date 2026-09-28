/**
 * EVERY SENTENCE OPENINGS SAYS (docs/rounds/2026-09-27-openings.md, "The words,
 * exactly"). Sentences, not scores: each claim names its sample ("7 of the
 * last 8 Mondays"), and below the minimum the screen says so.
 *
 * WHO SEES NAMES (AJ, Sep 27 2026: "im not too concerned for permission at
 * this stage of the beta, just keep it relaxed and we will tighten up
 * later"). Everyone who works at the studio sees the same Openings, other
 * trainers' names included; the person looking is "you". Trainers are
 * listed in name order, never with a count beside a name.
 *
 * CLIENT NAMES ONLY AFTER A TAP, on every part of Openings, as a courtesy to
 * the client standing at the iPad: a line's own sentence says "a regular" or
 * "a cancellation", and `lineDetail` is what the tap reveals. The Wrap-up's
 * sheet shows times only, never a name and never why a time is free.
 *
 * Every offer ends: "Check it in Mindbody before you promise it. Journey
 * doesn't book." Journey reads appointments, not a trainer's bookable hours
 * or time off in Mindbody, and it books nothing (Mindbody charges $2.50 an
 * appointment booked through its API).
 *
 * ONE PLACE. The screens' own few words live here too: the lines while a
 * read is on its way, the gate's line, what a part says when the marks
 * couldn't be read, "Mark this time"'s form, the Wrap-up's "Times with
 * room" sheet, and Team's and the Overview's lines. No screen types a
 * sentence of its own (the round's integration pass folded ui/words.ts,
 * ui/mark-words.ts and the sheet's words in here, word for word). The two
 * words a colleague's week is read with, NO_AGREED_WEEK and EMPTY_WEEK, are
 * the standing week's (standing-week/present.ts).
 *
 * PURE MODULE.
 */
import { formatStudioDate, studioDateKey, toDate } from "../../lib/studio-time";
import { dayLabel } from "../standing-week/check";
import { minutesOf, WEEKDAY_NAME, type StandingWeekDoc } from "../standing-week/week";
import type { BackFrom } from "./back-from";
import { addDays } from "./coverage";
import { median } from "./days";
import { WINDOW_WEEKS } from "./fold";
import { MAX_MARK_NOTE, disagreement, markAgeDays, needsReview, offerable, type MarkWord, type OpeningsMark } from "./marks";
import type { NextDays, NextDaysLine, RoomTime } from "./next-days";
import type { Offer } from "./offer";
import { clockLabel, timeName, weekdayPlural } from "./rows";
import type { OpeningsSummary } from "./summary-doc";
import { MIN_WEEKS, atLeastShare, type UsualTime } from "./usual";

/* ------------------------------------------------------------------ *
 * The fixed lines
 * ------------------------------------------------------------------ */

export const CHECK_IN_MINDBODY = "Check it in Mindbody before you promise it.";
export const OFFER_FOOT = "Check it in Mindbody before you promise it. Journey doesn't book.";
export const SAFE_TO_SHOW = "Safe to show a client";

/** A part waiting on the summary (or the marks it is read with). */
export const READING_USUAL_WEEK = "Reading the usual week…";

/** A part waiting on the studio's standing weeks (Team's own phrase). */
export const READING_WEEKS = "Reading the standing weeks…";

/** The gate's line, for someone who may not read the studio's standing weeks. */
export function notForYouSentence(studioName: string): string {
  return `Openings is for the people who work at ${studioName}.`;
}

/* ------------------------------------------------------------------ *
 * Names
 * ------------------------------------------------------------------ */

export interface Person {
  /** trainers/{id}. */
  id: string;
  name: string;
}

/** Who the screen is for: their trainers/{id} (for "you") and their sign-in id (for a mark they set). */
export interface Viewer {
  trainerId: string | null;
  uid?: string | null;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name.trim();

/**
 * A trainer's name as the screen says it: the first name, or the whole name
 * when two people share the first. Never cut short. An unknown id is "a
 * trainer".
 */
export function nameBook(people: readonly Person[]): (id: string) => string {
  const byId = new Map<string, string>();
  for (const p of people) if (p.id && p.name.trim() && !byId.has(p.id)) byId.set(p.id, p.name.trim());
  const firsts = new Map<string, number>();
  for (const name of byId.values()) firsts.set(firstName(name).toLowerCase(), (firsts.get(firstName(name).toLowerCase()) ?? 0) + 1);
  return (id) => {
    const name = byId.get(id);
    if (!name) return "a trainer";
    return (firsts.get(firstName(name).toLowerCase()) ?? 0) > 1 ? name : firstName(name);
  };
}

/** Everyone Openings may name: the summary's, the trainers', the standing weeks'. */
export function peopleOf(summary: OpeningsSummary | null, trainers: readonly Person[], docs: readonly Pick<StandingWeekDoc, "trainerId" | "trainerName">[]): Person[] {
  return [
    ...trainers,
    ...docs.filter((d) => d.trainerId).map((d) => ({ id: d.trainerId, name: d.trainerName })),
    ...Object.values(summary?.who ?? {}).map((w) => ({ id: w.id, name: w.n })),
  ];
}

const listed = (words: readonly string[]): string =>
  words.length <= 1 ? (words[0] ?? "") : words.length === 2 ? `${words[0]} and ${words[1]}` : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

/** "you", "Sam", "you and Sam", "Pat, Sam and you": the person looking first, then name order. */
export function whoSays(ids: readonly string[], names: (id: string) => string, viewer: Viewer): string {
  const unique = [...new Set(ids)];
  const you = viewer.trainerId && unique.includes(viewer.trainerId) ? ["you"] : [];
  const others = unique.filter((id) => id !== viewer.trainerId).map(names).sort((a, b) => a.localeCompare(b));
  return listed([...you, ...others]);
}

/* ------------------------------------------------------------------ *
 * Dates and counts
 * ------------------------------------------------------------------ */

/** "Oct 2". */
export function shortDay(dateKey: string, tz: string): string {
  return formatStudioDate(`${dateKey}T12:00:00`, { month: "short", day: "numeric" }, tz);
}

/** "Sunday, Oct 25". */
export function longDay(dateKey: string, tz: string): string {
  return formatStudioDate(`${dateKey}T12:00:00`, { weekday: "long", month: "short", day: "numeric" }, tz);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "the last 8 Mondays", or "the 6 Mondays counted" / "judged" when fewer. */
function span(weekday: number, of: number, basis: "counted" | "judged"): string {
  if (of === WINDOW_WEEKS) return `the last ${of} ${weekdayPlural(weekday)}`;
  return `the ${of} ${of === 1 ? WEEKDAY_NAME[weekday] : weekdayPlural(weekday)} ${basis}`;
}

/* ------------------------------------------------------------------ *
 * The usual week
 * ------------------------------------------------------------------ */

/** The word on the grid's button. */
export function wordLabel(u: UsualTime): string {
  switch (u.word) {
    case "always-full":
      return "Always full";
    case "usually-full":
      return "Usually full";
    case "usually-room":
      return "Usually has room";
    case "mixed":
      return "Mixed";
    case "booked":
      return `${u.usuallyBooked} booked`;
    case "rotation":
      return "Rotation";
    case "not-enough":
      return "–";
    case "blank":
      return "";
  }
}

/** What the numbers say, without the time: "full in 7 of the last 8 Mondays". */
export function usualDetail(u: UsualTime): string {
  const judged = span(u.weekday, u.judged, "judged");
  const counted = span(u.weekday, u.counted, "counted");
  switch (u.word) {
    case "always-full":
      return `full in all of ${judged}`;
    case "usually-full":
    case "mixed":
      return `full in ${u.full} of ${judged}`;
    case "usually-room":
      return `room in ${u.room} of ${judged}${u.nobodyBooked > 0 ? `, and nobody booked in ${u.nobodyBooked} of them` : ""}`;
    case "booked":
      return u.usuallyBooked > 0
        ? `usually ${u.usuallyBooked} booked (${u.usuallyBooked} or more in ${u.reachedIn} of ${counted})`
        : `usually none booked (booked in ${u.reachedIn} of ${counted})`;
    case "rotation":
      return `usually ${u.usuallyRotation} booked on the rotation`;
    case "not-enough":
      return u.counted === 0 ? `no ${weekdayPlural(u.weekday)} counted yet` : `${plural(u.counted, WEEKDAY_NAME[u.weekday], weekdayPlural(u.weekday))} counted so far`;
    case "blank":
      // Every counted week was judged (usual.ts), so "nobody in" is known; the sample is named.
      return `nothing booked and nobody in, in all of ${counted}`;
  }
}

/** Why an "N booked" time says nothing about room. */
function whyNoRoom(u: UsualTime): string {
  if (u.why === "nobody-in") return "Room isn't judged: most weeks, nobody's agreed week had them in then.";
  const unplacedOnly = u.weeks.some((w) => w.notJudged === "unplaced") && !u.weeks.some((w) => w.notJudged === "unagreed");
  return unplacedOnly ? "Room can't be judged yet: some bookings couldn't be placed with a trainer." : "Room can't be judged yet: not every trainer's week is agreed.";
}

/**
 * The time's whole sentence, the button's label for VoiceOver too:
 * "Monday 8:00 AM · Always full: full in all of the last 8 Mondays."
 */
export function usualSentence(u: UsualTime): string {
  const time = timeName(u.key);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  switch (u.word) {
    case "booked":
      return `${time} · ${cap(usualDetail(u))}. ${whyNoRoom(u)}`;
    case "rotation":
      return `${time} · ${cap(usualDetail(u))}. ${weekdayPlural(u.weekday)} run on the rotation: ask the front desk.`;
    case "not-enough":
      return `${time} · Not enough weeks yet: ${usualDetail(u)}.`;
    case "blank":
      return `${time} · ${cap(usualDetail(u))}.`;
    default:
      return `${time} · ${wordLabel(u)}: ${usualDetail(u)}.`;
  }
}

/** The sheet's lines about the days left out: "Not counted: Mon, Oct 12. Journey didn't read it in full." */
export function notCountedLines(u: UsualTime, tz: string): string[] {
  const usual = median(u.weeks.filter((w) => w.verdict !== "unread").map((w) => w.dayBooked));
  const article = /^[AEIOU]/.test(WEEKDAY_NAME[u.weekday]) ? "an" : "a";
  const out: string[] = [];
  for (const w of [...u.weeks].reverse()) {
    if (w.verdict === "unread") out.push(`Not counted: ${dayLabel(w.day, tz)}. Journey didn't read it in full.`);
    else if (w.verdict === "closed") {
      const booked = w.dayBooked === 0 ? "no bookings" : plural(w.dayBooked, "booking", "bookings");
      const was = usual === null ? "" : ` (${article} ${WEEKDAY_NAME[u.weekday]} usually has ${Math.round(usual)})`;
      out.push(`Not counted: ${dayLabel(w.day, tz)}, ${booked}${was}. Closed, or nearly.`);
    } else if (!w.judged) {
      out.push(
        w.notJudged === "unplaced"
          ? `Not judged: ${dayLabel(w.day, tz)}. A booking that day couldn't be placed with a trainer.`
          : `Not judged: ${dayLabel(w.day, tz)}. Not every trainer's week was agreed that day.`,
      );
    }
  }
  return out;
}

/** "Usually 4 booked." once enough weeks are counted. */
export function usuallyBookedLine(u: UsualTime): string | null {
  if (u.counted < MIN_WEEKS) return null;
  return u.usuallyBooked === 0 ? "Usually none booked." : `Usually ${u.usuallyBooked} booked.`;
}

/** "Usually in: you and Sam." once enough weeks are judged. */
export function usuallyInLine(u: UsualTime, names: (id: string) => string, viewer: Viewer): string | null {
  if (u.judged < MIN_WEEKS) return null;
  if (u.usuallyIn.length === 0) return u.usuallyInCount === 0 ? "Usually nobody in." : `Usually ${plural(u.usuallyInCount, "trainer", "trainers")} in, not always the same.`;
  return `Usually in: ${whoSays(u.usuallyIn, names, viewer)}.`;
}

/** "4 regulars at Monday 8:00 AM on the agreed weeks." */
export function regularsLine(count: number, key: string): string | null {
  if (count <= 0) return null;
  return `${plural(count, "regular", "regulars")} at ${timeName(key)} on the agreed weeks.`;
}

/** "Cancelled in 3 of the last 8 Mondays (2 of them late)." */
export function cancellationsLine(u: UsualTime): string | null {
  if (u.cancelledWeeks === 0 || u.counted === 0) return null;
  const late = u.lateWeeks > 0 ? ` (${u.lateWeeks} of them late)` : "";
  return `Cancelled in ${u.cancelledWeeks} of ${span(u.weekday, u.counted, "counted")}${late}.`;
}

/**
 * When the bookings regularly outnumber the trainers in: the nearest the grid
 * comes to "too many at once". Never on a rotation time: nobody's usual week
 * is missing there (AJ: the rotation is "just ... context").
 */
export function outnumberedLine(u: UsualTime): string | null {
  if (u.word === "rotation" || u.judged < MIN_WEEKS || !atLeastShare(u.outnumbered, u.judged)) return null;
  return `More booked than the agreed weeks have in, in ${u.outnumbered} of ${span(u.weekday, u.judged, "judged")}. Someone's usual week may be missing this time.`;
}

/** The mark's lines, disagreement first: "The bookings disagree: …", "Marked Always full by Jo, Oct 3.", "The bookings say: …", "Marked 64 days ago. Still true?" */
export function markLines(u: UsualTime, mark: OpeningsMark | null, viewer: Viewer, today: string, tz: string): string[] {
  if (!mark) return [];
  const out: string[] = [];
  const against = disagreement(u, mark);
  if (against === "room") out.push(`The bookings disagree: room in ${u.room} of ${span(u.weekday, u.judged, "judged")}.`);
  if (against === "full") out.push(`The bookings disagree: full in ${u.full} of ${span(u.weekday, u.judged, "judged")}.`);
  const who = viewer.uid && mark.by.id === viewer.uid ? "you" : firstName(mark.by.name) || "a trainer";
  const when = mark.at ? `, ${shortDay(dateKeyOf(mark.at, tz), tz)}` : "";
  out.push(`Marked ${mark.mark === "full" ? "Always full" : "Usually has room"} by ${who}${when}.`);
  if (!against && u.word !== "not-enough" && u.word !== "blank") out.push(`The bookings say: ${usualDetail(u)}.`);
  if (needsReview(mark, today, tz)) out.push(`Marked ${markAgeDays(mark, today, tz)} days ago. Still true?`);
  return out;
}

const dateKeyOf = (d: Date, tz: string) => studioDateKey(d, tz) ?? "";

/* ------------------------------------------------------------------ *
 * A time's sheet: "Mark this time" (phase 6)
 *
 * The sheet's lines about the time are the ones above (`markLines` first).
 * What is here is the form's own few words: its heading and buttons, the
 * note's hint, what it says when a write fails or waits on the iPad, and
 * `markChangeLine`, what the chosen word would change for THIS time.
 * ------------------------------------------------------------------ */

/** A time's sheet, when the marks couldn't be read: never "no mark". */
export const MARKS_UNKNOWN_TIME = "Can't tell just now whether anyone has marked this time.";

/** The three writes a time's sheet makes. */
export type MarkAction = "save" | "keep" | "remove";

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

/**
 * What choosing a word would change, for THIS time (the proposal's "What a
 * mark changes"). The core's `offerable` decides, never a fixed line: a time
 * that reads Always full is never offered whatever the mark, and a time that
 * can be offered is listed on A new regular time only when someone's agreed
 * week has them in then with no regular there, and the coming weeks don't
 * show it taken (`offers`). When it reads Usually has room already, the offer
 * is the numbers' own sentence and names no mark (`offerSentence`).
 */
export function markChangeLine(u: UsualTime, word: MarkWord): string {
  if (word === "full") return "Always full counts as usually full on Next 7 days, and is never offered as a new regular time.";
  const provisional: OpeningsMark = { id: u.key, weekday: u.weekday, time: "", mark: "room", note: "", by: { id: "", name: "" }, at: null };
  if (!offerable(u.word, provisional)) return "This time reads Always full, so it isn't offered as a new regular time, whatever the mark.";
  const beside =
    u.word === "usually-room" ? "" : u.word === "not-enough" || u.word === "blank" ? ", with the mark beside it" : ", with the mark and the numbers beside it";
  return `Usually has room can be offered as a new regular time when someone's agreed week has them in then with no regular there, and the coming weeks don't show it taken${beside}.`;
}

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

/**
 * A write made while the iPad is offline (or with no answer in a moment) is
 * on the iPad at once and reaches the studio when the connection is back
 * (session-record's `settleOrQueue`): the form closes and says so, rather
 * than "Saving…" until the Wi-Fi returns.
 */
export const MARK_QUEUED: Record<MarkAction, string> = {
  save: "Saved on this iPad. It goes to the studio when the connection is back.",
  keep: "Kept on this iPad. It goes to the studio when the connection is back.",
  remove: "Removed on this iPad. It goes to the studio when the connection is back.",
};

/** What the leave question calls a half-written mark: "You have unsaved changes to the mark on Monday 8:00 AM." */
export function markLabel(key: string): string {
  return `the mark on ${timeName(key)}`;
}

/** A mark's note, as the sheet shows it: in quotation marks, as it was written. */
export function markNoteLine(note: string): string {
  return `“${note}”`;
}

/* ------------------------------------------------------------------ *
 * Above the grid
 * ------------------------------------------------------------------ */

/** "From the weeks Journey has read in full since Oct 5 (6 weeks)." */
export function sinceLine(summary: Pick<OpeningsSummary, "since" | "weeks">, weeksCounted: number, tz: string): string | null {
  if (!summary.since || weeksCounted === 0) return null;
  const oldest = summary.weeks[summary.weeks.length - 1]?.m;
  if (oldest && summary.since < oldest) {
    return weeksCounted === WINDOW_WEEKS ? `From the last ${WINDOW_WEEKS} weeks, all read in full.` : `From ${weeksCounted} of the last ${WINDOW_WEEKS} weeks, the ones Journey read in full.`;
  }
  return `From the weeks Journey has read in full since ${shortDay(summary.since, tz)} (${plural(weeksCounted, "week", "weeks")}).`;
}

/** "Built Sunday, Oct 4." */
export function builtLine(summary: Pick<OpeningsSummary, "builtAt">, tz: string): string {
  const at = toDate(summary.builtAt);
  return at ? `Built ${formatStudioDate(at, { weekday: "long", month: "short", day: "numeric" }, tz)}.` : "Built on a day Journey can't read.";
}

/** Before four weeks are counted, the whole of the usual week is one sentence. */
export function notEnoughSentence(weeksCounted: number, since: string | null, firstWords: string | null, tz: string): string {
  const has = weeksCounted === 0 ? "It has none so far." : `It has ${weeksCounted} so far${since ? `, counted since ${shortDay(since, tz)}` : ""}.`;
  const when = firstWords ? ` The first words can come on ${longDay(firstWords, tz)}.` : "";
  return `The usual week needs ${MIN_WEEKS} weeks Journey has read in full. ${has}${when}`;
}

/**
 * Whose week isn't agreed yet, by name (AJ's relaxed answer), or the one
 * sentence for a studio where none is: then the grid shows how many are
 * usually booked, not whether there's room. `team` is everyone who works at
 * the studio (who-works-here).
 */
export function unagreedLine(team: readonly Person[], docs: readonly Pick<StandingWeekDoc, "trainerId" | "final">[], studioName: string, names: (id: string) => string): string | null {
  const agreed = new Set(docs.filter((d) => d.final && d.trainerId).map((d) => d.trainerId));
  if (agreed.size === 0) {
    return `Who's in comes from the standing weeks leaders agree on Team. None is agreed at ${studioName} yet, so this shows how many are usually booked, not whether there's room.`;
  }
  const waiting = [...new Set(team.filter((p) => !agreed.has(p.id)).map((p) => names(p.id)))].sort((a, b) => a.localeCompare(b));
  if (waiting.length === 0) return null;
  return waiting.length === 1 ? `${waiting[0]}'s week isn't agreed yet.` : `${listed(waiting.map((n) => `${n}'s`))} weeks aren't agreed yet.`;
}

/**
 *   never      the job has never written one
 *   unreadable it couldn't be read
 *   unlinked   the studio's Mindbody isn't linked
 */
export function summaryStateSentence(state: "never" | "unreadable" | "unlinked", studioName: string): string {
  switch (state) {
    case "never":
      return "The usual week is built early each Sunday. The first one comes this Sunday.";
    case "unreadable":
      return "Can't read the usual week just now.";
    case "unlinked":
      return `${studioName}'s bookings aren't linked to Journey, so Openings can't read them.`;
  }
}

/* ------------------------------------------------------------------ *
 * Next 7 days
 * ------------------------------------------------------------------ */

/** What the list says above (or instead of) its lines; null when the lines speak for themselves. */
export function nextDaysStateSentence(n: Pick<NextDays, "state" | "agreedAny" | "lines">, studioName: string): string | null {
  switch (n.state) {
    case "loading":
    case "failed":
    case "offline":
      return "Can't tell yet. The next 7 days' bookings haven't come back from the server.";
    case "unconnected":
      return summaryStateSentence("unlinked", studioName);
    case "ready":
      if (!n.agreedAny) return "No standing week is agreed yet, so this lists cancellations only.";
      return n.lines.length === 0 ? "Nothing has opened up in the next 7 days." : null;
  }
}

/** The line's usual word, lower case, as it sits in the line: "usually full", "usually 4 booked". */
function usualPart(line: Pick<NextDaysLine, "usual" | "mark">): string | null {
  if (line.mark?.mark === "full" && line.usual?.word !== "always-full" && line.usual?.word !== "usually-full") return "marked always full";
  const u = line.usual;
  if (!u) return null;
  switch (u.word) {
    case "always-full":
      return "always full";
    case "usually-full":
      return "usually full";
    case "usually-room":
      return "usually has room";
    case "mixed":
      return "mixed";
    case "booked":
      return u.usuallyBooked > 0 ? `usually ${u.usuallyBooked} booked` : null;
    case "rotation":
      return "usually on the rotation";
    default:
      return null;
  }
}

/** "room with you", "room with Sam", "room with 1 trainer". */
function roomPart(line: Pick<NextDaysLine, "room">, names: (id: string) => string, viewer: Viewer): string | null {
  const room = line.room;
  if (!room || room.count === 0) return null;
  if (room.with.length === room.count) return `room with ${whoSays(room.with, names, viewer)}`;
  return `room with ${plural(room.count, "trainer", "trainers")}`;
}

/**
 * The reason, without its full stop: "A regular isn't booked for it".
 *
 * About THE SLOT, never her week: the check finds a regular "open" when she
 * isn't booked for that slot, and a twice-a-week regular booked Monday can
 * still have an open Thursday (check.ts: nothing there claims she "isn't
 * booked that week"). Its own `findingSentence` says "isn't booked for it".
 *
 * A cancellation's reason says nobody has booked INTO THE TIME since: it is
 * never "not rebooked", because on Changes a rebook is the client's own other
 * booking that week (a reschedule), and she may well have one.
 */
function reasonText(line: NextDaysLine, tz: string): string {
  const r = line.reasons[0];
  if (!r) return "";
  switch (r.kind) {
    case "regular-open":
      return "A regular isn't booked for it";
    case "regular-moved": {
      const to = r.finding.movedTo;
      return to ? `A regular is booked ${dayLabel(to.dateKey, tz)} at ${clockLabel(minutesOf(to.start) ?? 0)} instead` : "A regular is booked another time instead";
    }
    case "cancellation":
      return `A cancellation on ${shortDay(r.cancelledOn, tz)}, and nobody has booked into it since${line.room ? "" : ` (${line.bookedNow} booked now)`}`;
    case "usually-full":
      return "Nothing is booked with them yet";
  }
}

/**
 * "; booked again from Mon, Oct 19" (joined onto a reason). Every answer is
 * about the days AFTER the slot (back-from.ts), so none says "the next 7
 * days": a booking between today and the slot was never looked at.
 */
function backFromTail(b: BackFrom, tz: string): string {
  switch (b.kind) {
    case "booked-again":
      return `booked again from ${dayLabel(b.day, tz)}`;
    case "next-on-file":
      return `next booking on file after it: ${dayLabel(b.day, tz)}`;
    case "none-30":
      return `not booked again through ${dayLabel(b.through, tz)}`;
    case "none-7":
      return `not booked again through ${dayLabel(b.through, tz)}; can't tell after that yet`;
    case "cant-tell":
      return "can't tell yet when they're next booked";
  }
}

/** "Booked again from Mon, Oct 19." on its own. */
export function backFromSentence(b: BackFrom, tz: string): string {
  if (b.kind === "cant-tell") return "Can't tell yet.";
  const t = backFromTail(b, tz);
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}.`;
}

/**
 * The line, naming no client: "Mon, Oct 5 · 8:00 AM · usually full · room
 * with 1 trainer. A regular isn't booked for it; booked again from Mon,
 * Oct 19." `backFrom` is joined on only for a line about one client.
 */
export function lineSentence(line: NextDaysLine, names: (id: string) => string, viewer: Viewer, tz: string, backFrom?: BackFrom | null): string {
  const head = [dayLabel(line.dateKey, tz), clockLabel(line.row), usualPart(line), roomPart(line, names, viewer)].filter(Boolean).join(" · ");
  const reason = reasonText(line, tz);
  const tail = backFrom && line.clients.length === 1 ? `; ${backFromTail(backFrom, tz)}` : "";
  return reason ? `${head}. ${reason}${tail}.` : `${head}.`;
}

/** What a tap on the line reveals: each client, by name, and what happened. */
export function lineDetail(line: NextDaysLine, names: (id: string) => string, viewer: Viewer, tz: string): string[] {
  return line.clients.map((c) => {
    const name = c.clientName || "A client";
    const whose = c.trainerId ? (viewer.trainerId === c.trainerId ? "your" : `${names(c.trainerId)}'s`) : "a";
    if (c.reason === "cancellation") {
      const r = line.reasons.find((x) => x.kind === "cancellation" && x.clientName === c.clientName);
      const on = r && r.kind === "cancellation" && r.cancelledOn ? ` on ${shortDay(r.cancelledOn, tz)}` : "";
      const withWhom = c.trainerId ? ` (with ${viewer.trainerId === c.trainerId ? "you" : names(c.trainerId)})` : "";
      return `${name} cancelled${on}${withWhom}.`;
    }
    const r = line.reasons.find((x) => (x.kind === "regular-open" || x.kind === "regular-moved") && x.finding.clientName === c.clientName);
    if (r && r.kind === "regular-moved" && r.finding.movedTo) {
      return `${name}, ${whose} regular, is booked ${dayLabel(r.finding.movedTo.dateKey, tz)} at ${clockLabel(minutesOf(r.finding.movedTo.start) ?? 0)} instead.`;
    }
    // The slot, not her week (reasonText).
    return `${name}, ${whose} regular, isn't booked for it.`;
  });
}

/** The narrowing chips: "With you", "Anyone", then one per trainer in name order (AJ's relaxed answer: for everyone). */
export function chips(trainerIds: readonly string[], names: (id: string) => string, viewer: Viewer): { trainerId: string | null; label: string }[] {
  const others = [...new Set(trainerIds)]
    .filter((id) => id !== viewer.trainerId)
    .map((id) => ({ trainerId: id, label: `With ${names(id)}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [...(viewer.trainerId ? [{ trainerId: viewer.trainerId, label: "With you" }] : []), { trainerId: null, label: "Anyone" }, ...others];
}

/** Who a chip narrows to, as a sentence says it: "you", or the name `nameBook` gives. */
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

/* ------------------------------------------------------------------ *
 * A new regular time
 * ------------------------------------------------------------------ */

/** While the coming weeks are read: in an offer's sentence, and as Most weeks' line on the Wrap-up's sheet. */
export const CHECKING_COMING = "Checking the coming weeks…";

/** "Tuesday 10:30 AM · usually has room: room in 6 of the last 8 Tuesdays, and free on the next 3 Tuesdays on file." */
export function offerSentence(o: Offer, tz: string): string {
  const time = timeName(o.key);
  const days = weekdayPlural(o.weekday);
  const coming =
    o.coming.state === "free"
      ? `, and free on the next ${o.coming.days.length} ${days} on file.`
      : o.coming.state === "checking"
        ? `. ${CHECKING_COMING}`
        : `. Can't check the coming ${days} yet.`;
  if (o.usual?.word === "usually-room") return `${time} · usually has room: ${usualDetail(o.usual)}${coming}`;
  const by = o.mark ? ` by ${firstName(o.mark.by.name) || "a trainer"}${o.mark.at ? `, ${shortDay(dateKeyOf(o.mark.at, tz), tz)}` : ""}` : "";
  const says = o.usual && o.usual.word !== "not-enough" && o.usual.word !== "blank" ? ` (the bookings say: ${usualDetail(o.usual)})` : "";
  return `${time} · marked Usually has room${by}${says}${coming}`;
}

/** "This Tuesday, Nov 10: room." */
export function thisWeekSentence(o: Offer, tz: string): string | null {
  if (!o.thisWeek) return null;
  const state = o.thisWeek.state === "cant-tell" ? "can't tell yet" : o.thisWeek.state;
  return `This ${WEEKDAY_NAME[o.weekday]}, ${shortDay(o.thisWeek.day, tz)}: ${state}.`;
}

/** "With Pat", "With you and Pat". */
export function offerWho(o: Offer, names: (id: string) => string, viewer: Viewer): string {
  return `With ${whoSays(o.who, names, viewer)}`;
}

export const NO_OFFERS = "No usual times with room right now. The front desk can see every opening in Mindbody.";

/**
 * A new regular time, when the marks couldn't be read (refused, offline, or
 * only this iPad's cache answered). A time a colleague marked Always full is
 * never offered, so with the marks unknown nothing is offered for good.
 */
export const MARKS_UNKNOWN_OFFERS = "Can't tell just now whether anyone has marked a time Always full, so no time is offered for good yet.";

/**
 * A new regular time (and the Wrap-up's Most weeks), when the chip alone
 * empties the list: the studio has times to offer, none of them this
 * trainer's.
 */
export function noOffersWithSentence(trainerId: string, names: (id: string) => string, viewer: Viewer): string {
  const who = chipWho(trainerId, names, viewer);
  return who === "you"
    ? "You have no usual times with room to offer right now. Anyone shows the rest of the studio."
    : `${who.charAt(0).toUpperCase()}${who.slice(1)} has no usual times with room to offer right now. Anyone shows the rest of the studio.`;
}

/* ------------------------------------------------------------------ *
 * Who's usually in
 * ------------------------------------------------------------------ */

/** With nobody on the studio's staff (as Team says it). */
export function nobodyHereSentence(studioName: string): string {
  return `Nobody works at ${studioName} yet.`;
}

/** The regulars' names, only after a tap. */
export const SHOW_REGULARS = "Show the regulars' names";
export const HIDE_REGULARS = "Hide the regulars' names";

/* ------------------------------------------------------------------ *
 * The Wrap-up's "Times with room" (times only, worded for the client to see)
 * ------------------------------------------------------------------ */

export const WRAP_UP_LOOKING = "Looking for times…";
export const WRAP_UP_CANT_CHECK = "Can't check the times right now. Ask the front desk.";
export const WRAP_UP_CANT_TELL = "Can't tell right now.";

/** The door's words and the sheet's title. */
export const TIMES_WITH_ROOM = "Times with room";
/** The sheet's two parts. */
export const NEXT_7_DAYS = "Next 7 days";
export const MOST_WEEKS = "Most weeks";
/**
 * Next 7 days, with no time with room anywhere Journey can see. Never a flat
 * "nothing open": `timesWithRoom` knows only the hours of an AGREED week, and
 * leaves out a half-hour with a booking it can't place, so a trainer with no
 * agreed week, or the front desk, may well have room. Hedged as NO_OFFERS is.
 */
export const NO_TIMES_NEXT_7 = "No times with room in the next 7 days. The front desk can see every opening in Mindbody.";
/** Next 7 days, when "With you" alone empties it while Anyone has times. */
export const YOU_NO_TIMES_NEXT_7 = "You have no times with room in the next 7 days. Anyone shows the rest of the studio.";
/** Most weeks, listed without the coming weeks checked (the month wasn't read in full today, or that read failed). */
export const COMING_CANT_CHECK = "Can't check the coming weeks yet.";
/** Closes the sheet, back to the Wrap-up. */
export const DONE = "Done";

/** "Saturdays run on the rotation. Ask the front desk." */
export function rotationDaySentence(weekday: number): string {
  return `${weekdayPlural(weekday)} run on the rotation. Ask the front desk.`;
}

/**
 * The next 7 days' times with room, grouped by day: "Mon, Oct 5: 6:00 AM ·
 * 8:00 AM (this week only) · 11:30 AM". Each time's `said` is its chip as the
 * sheet shows it, "(this week only)" included.
 */
export function timesWithRoomByDay(
  times: readonly RoomTime[],
  tz: string,
): { dateKey: string; label: string; times: { label: string; thisWeekOnly: boolean; said: string }[]; sentence: string }[] {
  const days = new Map<string, RoomTime[]>();
  for (const t of times) {
    if (!days.has(t.dateKey)) days.set(t.dateKey, []);
    days.get(t.dateKey)!.push(t);
  }
  return [...days.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dateKey, list]) => {
      const chipsOf = [...list]
        .sort((a, b) => a.row - b.row)
        .map((t) => {
          const at = clockLabel(t.row);
          return { label: at, thisWeekOnly: t.thisWeekOnly, said: t.thisWeekOnly ? `${at} (this week only)` : at };
        });
      const label = dayLabel(dateKey, tz);
      return { dateKey, label, times: chipsOf, sentence: `${label}: ${chipsOf.map((c) => c.said).join(" · ")}` };
    });
}

/* ------------------------------------------------------------------ *
 * Team's line and the Overview's line (phase 7)
 * ------------------------------------------------------------------ */

/**
 * Team keeps one line with a door: "3 free slots in the next 7 days · See
 * them on Openings." It counts exactly the regulars Openings' Next 7 days
 * lists, so it takes the `nextDays` result, never the raw check: the check
 * also holds slots earlier today and on Sundays, which Openings leaves out.
 * It counts the regulars, not the lines: two trainers' regulars out at the
 * same half-hour are one line and two free slots. Team must build the
 * `nextDays` input as Openings does (the same `worksHere` and `staffIds`),
 * and the door opens Openings on "Anyone", since the count is the studio's.
 */
export function teamLine(next: Pick<NextDays, "state" | "lines">): string | null {
  if (next.state !== "ready") return null;
  const free = next.lines.reduce((n, l) => n + l.reasons.filter((r) => r.kind === "regular-open" || r.kind === "regular-moved").length, 0);
  if (free === 0) return null;
  return `${plural(free, "free slot", "free slots")} in the next 7 days · See ${free === 1 ? "it" : "them"} on Openings.`;
}

/**
 * Team, when the week was read and Openings lists no free slot, though the
 * check found something Openings doesn't list (someone else booked in a
 * regular's slot, a slot earlier today, a Sunday): never "booked as usual",
 * and never a heading over nothing. Null until the week is read, or when
 * `teamLine` has a line.
 */
export function teamNoneSentence(next: Pick<NextDays, "state" | "lines">): string | null {
  if (next.state !== "ready" || teamLine(next) !== null) return null;
  return "No free slots ahead in the next 7 days.";
}

/** Under the Overview's first few Openings lines: "and 2 more on Openings" (the Overview's own "and N more" pattern). */
export function overviewMoreLine(more: number): string {
  return `and ${more} more on Openings`;
}

/** The Overview's "next three days" line for a usually-full time with room: "Mon, Oct 5 · 8:00 AM, usually full, has room · See it on Openings." */
export function overviewLines(lines: readonly NextDaysLine[], today: string, tz: string, days = 3): string[] {
  const last = addDays(today, days - 1);
  return lines
    .filter((l) => l.usuallyFull && (l.room?.count ?? 0) > 0 && l.dateKey <= last)
    .map((l) => `${dayLabel(l.dateKey, tz)} · ${clockLabel(l.row)}, ${usualPart(l) ?? "usually full"}, has room · See it on Openings.`);
}

