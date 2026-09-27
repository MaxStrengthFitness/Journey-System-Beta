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
import { timeLabel } from "./check";
import {
  EMPTY_WEEK,
  WEEKDAY_NAME,
  WEEKDAYS_IN_ORDER,
  clockOf,
  minutesOf,
  normalizeWeek,
  weekStatus,
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

export interface DayOfWeek {
  weekday: number;
  name: string;
  hours: WorkHours[];
  regulars: Regular[];
}

/** The week's seven days, Monday first, each with its hours and its regulars. */
export function daysOf(week: StandingWeek): DayOfWeek[] {
  return WEEKDAYS_IN_ORDER.map((weekday) => ({
    weekday,
    name: WEEKDAY_NAME[weekday],
    hours: week.hours.filter((h) => h.weekday === weekday),
    regulars: week.regulars.filter((r) => r.weekday === weekday),
  }));
}

/** A regular whose time falls outside every range of hours set for that day. */
export function outsideHours(week: StandingWeek, r: Regular): boolean {
  const hours = week.hours.filter((h) => h.weekday === r.weekday);
  if (hours.length === 0) return false;
  const at = minutesOf(r.start);
  if (at === null) return false;
  return !hours.some((h) => at >= minutesOf(h.from)! && at < minutesOf(h.to)!);
}

/**
 * The trainer works at the studio: home, also works at, or a guest there.
 * The rules ask the same question (firestore.rules, trainerWorksAt), and
 * everyone works at the Demo studio.
 */
export function worksAt(
  t: Pick<Trainer, "primaryHomeStudioId" | "accessibleStudioIds" | "activeGuestStudioIds"> | null | undefined,
  studioId: string | null | undefined,
): boolean {
  if (!t || !studioId) return false;
  if (isDemoStudioId(studioId)) return true;
  return t.primaryHomeStudioId === studioId || (t.accessibleStudioIds ?? []).includes(studioId) || (t.activeGuestStudioIds ?? []).includes(studioId);
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
  const w = normalizeWeek(week ?? EMPTY_WEEK);
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
 * The hours a new range starts with. A second range on a day starts an hour
 * after the first ends (a split shift). A day's first range copies the
 * nearest earlier day's, so a Monday-to-Friday week is typed once; failing
 * that, 7:00 AM to 1:00 PM.
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

/* ------------------------------------------------------------------ *
 * What a proposal changes
 * ------------------------------------------------------------------ */

const hoursOn = (week: StandingWeek, weekday: number) =>
  week.hours.filter((h) => h.weekday === weekday).map(rangeLabel).join(" and ");
const slotLabel = (r: Pick<Regular, "weekday" | "start">) => `${WEEKDAY_NAME[r.weekday]} at ${timeLabel(r.start)}`;

/**
 * One sentence per change from `from` to `to`, Monday first: the hours, then
 * the regulars, then the note. A regular who leaves one slot and takes
 * another is a move, said once. Nothing when there is no `from` — a first
 * proposal is read whole, not as a list of changes.
 */
export function weekChanges(from: StandingWeek | null, to: StandingWeek | null): string[] {
  if (!from || !to) return [];
  const out: string[] = [];

  for (const weekday of WEEKDAYS_IN_ORDER) {
    const was = hoursOn(from, weekday);
    const now = hoursOn(to, weekday);
    if (was === now) continue;
    const day = WEEKDAY_NAME[weekday];
    if (!was) out.push(`Works ${day}, ${now}.`);
    else if (!now) out.push(`No longer works ${day} (was ${was}).`);
    else out.push(`${day}'s hours: ${now}, was ${was}.`);
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
