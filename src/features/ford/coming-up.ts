/**
 * COMING UP — the dates on the FORD page, soonest first, the client's own
 * birthday included.
 *
 * Client codex, Sep 2026. Every client has one date the studio already knows
 * and FORD never showed: the birthday Mindbody holds. It is the one gesture
 * every client is owed, so it leads Coming up beside the dated FORD details.
 *
 * Counted on the STUDIO's day (`todayKey`, studioTodayKey()), through the
 * same `daysUntilBirthday` Relay's Mine uses, so the FORD page, the Hub card
 * and Relay can never disagree about how far away a birthday is. Every date
 * is taken at local noon (`studioNoon`) so a day key never slips to the day
 * before in Eastern.
 *
 * A FORD detail that IS this birthday — an annual "Birthday" on the same
 * month and day — is folded into the birthday's row rather than listed twice,
 * and its gesture rides on the row. A legacy `client.events` birthday is
 * dropped the same way but not linked: it is read only.
 *
 * Pure: coming-up.test.ts, run with TZ=America/New_York.
 */
import { daysUntilBirthday } from "../../lib/hub-markers";
import { upcomingFord } from "./ford-rollup";
import { urgencyOf, type FordEntry, type FordUrgency } from "./types";

/** A studio day key ("2026-09-24") at local noon. */
export function studioNoon(todayKey: string): Date {
  return new Date(`${todayKey}T12:00:00`);
}

export interface BirthdayRow {
  kind: "birthday";
  key: "birthday";
  /** The next birthday, at local noon. */
  when: Date;
  daysAway: number;
  /** The age they turn; null when the birth year is not believable. */
  turning: number | null;
  urgency: FordUrgency;
  /** The annual FORD "Birthday" detail this row stands for, when there is one. */
  linked: FordEntry | null;
}

export interface DetailRow {
  kind: "detail";
  key: string;
  entry: FordEntry;
  when: Date;
  daysAway: number;
  urgency: FordUrgency;
}

export type ComingUpRow = BirthdayRow | DetailRow;

const BIRTHDAY_WORD = /\bbirthday\b/i;

function birthYearOf(dateOfBirth: string): number | null {
  const m = /^(\d{4})/.exec(dateOfBirth.trim());
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) && y >= 1900 ? y : null;
}

/**
 * Every date coming up: the Mindbody birthday (when there is a believable
 * date of birth) and the dated FORD details from today on, sorted by date.
 * Past one-off details are not coming up and are left out (upcomingFord).
 */
export function comingUp(args: {
  dateOfBirth: string | null | undefined;
  entries: readonly FordEntry[];
  todayKey: string;
}): ComingUpRow[] {
  const now = studioNoon(args.todayKey);
  const details = upcomingFord(args.entries as FordEntry[], { now });

  let birthday: BirthdayRow | null = null;
  const dob = typeof args.dateOfBirth === "string" ? args.dateOfBirth : "";
  const daysAway = dob ? daysUntilBirthday(dob, now) : null;
  if (daysAway !== null && daysAway >= 0) {
    const when = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAway, 12, 0, 0, 0);
    const born = birthYearOf(dob);
    const turning = born !== null && when.getFullYear() > born ? when.getFullYear() - born : null;
    birthday = {
      kind: "birthday",
      key: "birthday",
      when,
      daysAway,
      turning,
      urgency: urgencyOf(when, "none", now),
      linked: null,
    };
  }

  const rows: ComingUpRow[] = [];
  for (const d of details) {
    const isThisBirthday =
      birthday !== null &&
      d.entry.recurrence === "annual" &&
      d.when.getMonth() === birthday.when.getMonth() &&
      d.when.getDate() === birthday.when.getDate() &&
      (BIRTHDAY_WORD.test(d.entry.subject ?? "") || BIRTHDAY_WORD.test(d.entry.body ?? ""));
    if (isThisBirthday && birthday) {
      if (!d.entry.isLegacy && !birthday.linked) birthday.linked = d.entry;
      continue;
    }
    rows.push({
      kind: "detail",
      key: d.entry.id,
      entry: d.entry,
      when: d.when,
      daysAway: d.daysAway,
      urgency: urgencyOf(d.when, "none", now),
    });
  }
  if (birthday) rows.push(birthday);
  // By the day, not the instant (a detail's date is midnight, the birthday
  // noon): on the same day the birthday goes first, then the details in the
  // order upcomingFord gave them.
  const rank = (r: ComingUpRow) => (r.kind === "birthday" ? 0 : 1);
  return rows.sort((a, b) => a.daysAway - b.daysAway || rank(a) - rank(b));
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd, 69th. */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
