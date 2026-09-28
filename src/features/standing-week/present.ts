/**
 * WHAT A STANDING WEEK SAYS ON SCREEN (voice-review round, Sep 27 2026).
 *
 * The clock choices the editor offers, a week laid out Monday first, where a
 * week stands in a sentence, and — for the leader reviewing a proposal — what
 * the proposal changes, one sentence per change. Sentences, not scores.
 *
 * PURE MODULE.
 */
import type { Trainer } from "../../types";
import { formatStudioDate, toDate, type DateLike } from "../../lib/studio-time";
import { isDemoStudioId } from "../demo-mode/is-demo";
import { dayLabel, timeLabel } from "./check";
import {
  BLANK_WEEK,
  WEEKDAY_NAME,
  WEEKDAYS_IN_ORDER,
  clockOf,
  minutesOf,
  normalizeWeek,
  weekStatus,
  type AwayRange,
  type Regular,
  type StandingWeek,
  type StandingWeekDoc,
  type WorkHours,
} from "./week";

/** The editor's clock: every quarter hour from 5:00 AM to 9:45 PM. */
export const FIRST_CLOCK_MINUTES = 5 * 60;
export const LAST_CLOCK_MINUTES = 21 * 60 + 45;
const STEP_MINUTES = 15;

/**
 * The times on offer, as "HH:MM". A value already in the week that is off
 * the quarter-hour grid (a leader typed 8:10 somewhere) is kept in the list,
 * so opening the editor never changes a week nobody touched.
 */
export function clockChoices(options: { after?: string; keep?: string } = {}): string[] {
  const after = options.after ? minutesOf(options.after) : null;
  const out: string[] = [];
  for (let m = FIRST_CLOCK_MINUTES; m <= LAST_CLOCK_MINUTES; m += STEP_MINUTES) {
    if (after !== null && m <= after) continue;
    out.push(clockOf(m));
  }
  const keep = options.keep;
  if (keep && minutesOf(keep) !== null && !out.includes(keep)) {
    out.push(keep);
    out.sort((a, b) => minutesOf(a)! - minutesOf(b)!);
  }
  return out;
}

export function rangeLabel(h: Pick<WorkHours, "from" | "to">): string {
  return `${timeLabel(h.from)} – ${timeLabel(h.to)}`;
}

/* ------------------------------------------------------------------ *
 * The editor's words (Openings round, Sep 27 2026)
 * ------------------------------------------------------------------ */

/** A day with no blocks, in the editor and on a colleague's card. */
export const NO_BLOCKS = "Doesn't take clients";

/**
 * A colleague's week, read only (the colleague card, and Openings → Who's
 * usually in): a proposal nobody has agreed is theirs and their leader's,
 * so it reads NO_AGREED_WEEK; an agreed week with nothing on any day reads
 * EMPTY_WEEK.
 */
export const NO_AGREED_WEEK = "No agreed week yet.";
export const EMPTY_WEEK = "An empty week.";

/** The chip on a regular whose time falls outside every block that day (`outsideHours`). */
export const OUTSIDE_BLOCKS = "Outside when they take clients";

/**
 * The line under the days. Openings reads a half-hour inside a block with
 * nothing booked as room it can offer a client, so a habitual break typed
 * inside one long block would be offered; two or three blocks with the
 * breaks between them are not. (The round document drafted it "A break
 * between blocks"; a break BETWEEN blocks is the one that never shows.)
 */
export const BREAKS_LINE = "A break inside a block shows as room on Openings, so leave the breaks out.";

/**
 * A day's blocks in one phrase: "7:00 AM – 9:00 AM", "… and …", or with
 * three, "…, … and …".
 */
export function blocksLabel(blocks: readonly Pick<WorkHours, "from" | "to">[]): string {
  const parts = blocks.map(rangeLabel);
  return parts.length <= 2 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The add button on a day, and what it says to VoiceOver: "Add a block on Monday". */
export function addBlockLabel(blocksThatDay: number, dayName: string): { text: string; label: string } {
  const text = blocksThatDay === 0 ? "Add a block" : "Add another block";
  return { text, label: `${text} on ${dayName}` };
}

/**
 * A block's own name for VoiceOver, so three blocks on a day don't read as
 * three "Monday: starts": the first is the day's, the next "Monday, block 2".
 */
export function blockName(dayName: string, index: number): string {
  return index === 0 ? dayName : `${dayName}, block ${index + 1}`;
}

export interface DayOfWeek {
  weekday: number;
  name: string;
  hours: WorkHours[];
  regulars: Regular[];
}

/** The week's seven days, Monday first, each with its blocks (`hours`) and its regulars. */
export function daysOf(week: StandingWeek): DayOfWeek[] {
  return WEEKDAYS_IN_ORDER.map((weekday) => ({
    weekday,
    name: WEEKDAY_NAME[weekday],
    hours: week.hours.filter((h) => h.weekday === weekday),
    regulars: week.regulars.filter((r) => r.weekday === weekday),
  }));
}

/**
 * A regular whose time falls outside every block set for that day: the chip
 * "Outside when they take clients". A day with no blocks says nothing.
 */
export function outsideHours(week: StandingWeek, r: Regular): boolean {
  const hours = week.hours.filter((h) => h.weekday === r.weekday);
  if (hours.length === 0) return false;
  const at = minutesOf(r.start);
  if (at === null) return false;
  return !hours.some((h) => at >= minutesOf(h.from)! && at < minutesOf(h.to)!);
}

/**
 * May this trainer ACT at the studio (propose a week there)? Home, also works
 * at, or a guest there. The rules ask the same question (firestore.rules,
 * trainerWorksAt), and everyone may act at the Demo studio. This is
 * authorisation, not membership: who Team LISTS is lib/who-works-here.ts.
 */
export function worksAt(
  t: Pick<Trainer, "primaryHomeStudioId" | "accessibleStudioIds" | "activeGuestStudioIds"> | null | undefined,
  studioId: string | null | undefined,
): boolean {
  if (!t || !studioId) return false;
  if (isDemoStudioId(studioId)) return true;
  return t.primaryHomeStudioId === studioId || (t.accessibleStudioIds ?? []).includes(studioId) || (t.activeGuestStudioIds ?? []).includes(studioId);
}

/** Roles the rules let read every studio's weeks (firestore.rules, writesForStudio). */
const READS_EVERY_STUDIO: readonly string[] = ["Admin", "Founder", "Overseer", "Owner", "FranchiseOwner"];

/**
 * The viewer may read the studio's standing weeks: they work there, or they
 * read every studio's (administrators, the founder, franchise owners). The
 * rules ask the same question (standingWeeks read: writesForStudio); a
 * colleague's card is offered only where the read will be allowed, so it
 * never says the rules refused it.
 */
export function mayReadWeeks(
  viewer: (Pick<Trainer, "primaryHomeStudioId" | "accessibleStudioIds" | "activeGuestStudioIds"> & { role?: string | null }) | null | undefined,
  studioId: string | null | undefined,
): boolean {
  if (!viewer || !studioId) return false;
  return READS_EVERY_STUDIO.includes(viewer.role ?? "") || worksAt(viewer, studioId);
}

/* ------------------------------------------------------------------ *
 * The editor's form
 * ------------------------------------------------------------------ */

/**
 * A week as the editor holds it: the note is always a string, so an empty
 * note and a missing one are the same form value (the save leaves an empty
 * note out), and the lists stay in the week's own order so "nothing changed"
 * compares equal.
 */
export interface WeekForm {
  hours: WorkHours[];
  regulars: Regular[];
  note: string;
}

export function formOf(week: StandingWeek | null | undefined): WeekForm {
  const w = normalizeWeek(week ?? BLANK_WEEK);
  return { hours: w.hours, regulars: w.regulars, note: w.note ?? "" };
}

export function weekOfForm(form: WeekForm): StandingWeek {
  return normalizeWeek({ hours: form.hours, regulars: form.regulars, note: form.note });
}

/** The form after an edit, in the week's own order. The note is kept as typed. */
export function tidyForm(form: WeekForm): WeekForm {
  const w = normalizeWeek({ hours: form.hours, regulars: form.regulars });
  return { hours: w.hours, regulars: w.regulars, note: form.note };
}

/**
 * The times a new block starts with. Another block on a day (the second or
 * the third) starts an hour after the day's latest block ends: the break
 * left out. A day's first block copies the nearest earlier day's, so a
 * Monday-to-Friday week is typed once; failing that, 7:00 AM to 1:00 PM.
 */
export function defaultHours(week: Pick<StandingWeek, "hours">, weekday: number): WorkHours {
  const sameDay = week.hours.filter((h) => h.weekday === weekday);
  if (sameDay.length > 0) {
    const end = Math.max(...sameDay.map((h) => minutesOf(h.to)!));
    const from = Math.min(end + 60, LAST_CLOCK_MINUTES - STEP_MINUTES);
    return { weekday, from: clockOf(from), to: clockOf(Math.min(from + 240, LAST_CLOCK_MINUTES)) };
  }
  const order = WEEKDAYS_IN_ORDER.indexOf(weekday);
  for (let i = order - 1; i >= 0; i -= 1) {
    const earlier = week.hours.find((h) => h.weekday === WEEKDAYS_IN_ORDER[i]);
    if (earlier) return { weekday, from: earlier.from, to: earlier.to };
  }
  return { weekday, from: "07:00", to: "13:00" };
}

/* ------------------------------------------------------------------ *
 * Where a week stands, in a sentence
 * ------------------------------------------------------------------ */

const on = (at: unknown, tz?: string): string => {
  const d = toDate(at as DateLike);
  return d ? ` on ${formatStudioDate(d, { month: "short", day: "numeric" }, tz)}` : "";
};
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const agreedBy = (doc: StandingWeekDoc, tz?: string) =>
  `Agreed${doc.finalBy?.name ? ` by ${doc.finalBy.name}` : ""}${on(doc.finalAt, tz)}.`;

/** The trainer's own view: "Proposed on Sep 27. Waiting for a studio leader to agree it." */
export function myWeekSentence(doc: StandingWeekDoc | null, tz?: string): string {
  switch (weekStatus(doc)) {
    case "none":
      return "Not proposed yet.";
    case "proposed":
      return `Proposed${on(doc!.proposedAt, tz)}. Waiting for a studio leader to agree it.`;
    case "agreed":
      return agreedBy(doc!, tz);
    case "changed":
      return `${agreedBy(doc!, tz)} You proposed a change${on(doc!.proposedAt, tz)}; it's waiting for a studio leader.`;
  }
}

/** A leader's view of one person: "Sam proposed a change on Sep 29." */
export function teamWeekSentence(doc: StandingWeekDoc | null, name: string, tz?: string): string {
  const who = firstName(name);
  switch (weekStatus(doc)) {
    case "none":
      return `${who} hasn't proposed a standing week here.`;
    case "proposed":
      return `${who} proposed a week${on(doc!.proposedAt, tz)}. Not agreed yet.`;
    case "agreed":
      return agreedBy(doc!, tz);
    case "changed":
      return `${agreedBy(doc!, tz)} ${who} proposed a change${on(doc!.proposedAt, tz)}.`;
  }
}

/**
 * The Review's line, for the leader deciding: who proposed the week and
 * when — "Proposed by Sam Lee on Sep 27. Not agreed yet." It is where
 * `proposedBy` is read (every number has a reader); an agreed week, or none,
 * reads as the row does.
 */
export function reviewSentence(doc: StandingWeekDoc | null, name: string, tz?: string): string {
  const by = doc?.proposedBy?.name?.trim() || name.trim() || "the trainer";
  switch (weekStatus(doc)) {
    case "proposed":
      return `Proposed by ${by}${on(doc!.proposedAt, tz)}. Not agreed yet.`;
    case "changed":
      return `${agreedBy(doc!, tz)} A change proposed by ${by}${on(doc!.proposedAt, tz)}.`;
    default:
      return teamWeekSentence(doc, name, tz);
  }
}

/* ------------------------------------------------------------------ *
 * What a proposal changes
 * ------------------------------------------------------------------ */

const hoursOn = (week: StandingWeek, weekday: number) => blocksLabel(week.hours.filter((h) => h.weekday === weekday));
const slotLabel = (r: Pick<Regular, "weekday" | "start">) => `${WEEKDAY_NAME[r.weekday]} at ${timeLabel(r.start)}`;

/**
 * One sentence per change from `from` to `to`, Monday first: when they take
 * clients (the blocks), then the regulars, then the note. A regular who
 * leaves one slot and takes another is a move, said once. Nothing when there
 * is no `from` — a first proposal is read whole, not as a list of changes.
 *
 * The words (Openings round, Sep 27 2026): "Takes clients on Friday, …",
 * "No longer takes clients on Friday (was …)", "Monday: …, was …". A block
 * is when a trainer takes clients, not the hours they work.
 */
export function weekChanges(from: StandingWeek | null, to: StandingWeek | null): string[] {
  if (!from || !to) return [];
  const out: string[] = [];

  for (const weekday of WEEKDAYS_IN_ORDER) {
    const was = hoursOn(from, weekday);
    const now = hoursOn(to, weekday);
    if (was === now) continue;
    const day = WEEKDAY_NAME[weekday];
    if (!was) out.push(`Takes clients on ${day}, ${now}.`);
    else if (!now) out.push(`No longer takes clients on ${day} (was ${was}).`);
    else out.push(`${day}: ${now}, was ${was}.`);
  }

  const key = (r: Regular) => `${r.weekday} ${r.start}`;
  const clients = new Map<string, { name: string; was: Regular[]; now: Regular[] }>();
  for (const r of from.regulars) {
    const c = clients.get(r.clientId) ?? { name: r.clientName, was: [], now: [] };
    c.was.push(r);
    clients.set(r.clientId, c);
  }
  for (const r of to.regulars) {
    const c = clients.get(r.clientId) ?? { name: r.clientName, was: [], now: [] };
    c.name = r.clientName || c.name;
    c.now.push(r);
    clients.set(r.clientId, c);
  }
  const moves: { at: Regular; text: string }[] = [];
  for (const c of clients.values()) {
    const gone = c.was.filter((r) => !c.now.some((n) => key(n) === key(r)));
    const added = c.now.filter((r) => !c.was.some((w) => key(w) === key(r)));
    const name = c.name || "A client";
    if (gone.length === 1 && added.length === 1) {
      moves.push({ at: added[0], text: `Moves ${name} from ${slotLabel(gone[0])} to ${slotLabel(added[0])}.` });
      continue;
    }
    for (const r of gone) moves.push({ at: r, text: `Drops ${name}, ${slotLabel(r)}.` });
    for (const r of added) moves.push({ at: r, text: `Adds ${name}, ${slotLabel(r)}.` });
  }
  const order = (r: Regular) => WEEKDAYS_IN_ORDER.indexOf(r.weekday) * 1440 + (minutesOf(r.start) ?? 0);
  moves.sort((a, b) => order(a.at) - order(b.at) || a.text.localeCompare(b.text));
  out.push(...moves.map((m) => m.text));

  const wasNote = (from.note ?? "").trim();
  const nowNote = (to.note ?? "").trim();
  if (wasNote !== nowNote) out.push(nowNote ? `Note: "${nowNote}"` : "Takes the note off.");
  return out;
}

/* ------------------------------------------------------------------ *
 * Days away
 * ------------------------------------------------------------------ */

/** "Mon, Oct 5 – Fri, Oct 9", or one day: "Mon, Oct 5". */
export function awayLabel(r: Pick<AwayRange, "from" | "to">, tz?: string): string {
  return r.from === r.to ? dayLabel(r.from, tz) : `${dayLabel(r.from, tz)} – ${dayLabel(r.to, tz)}`;
}
