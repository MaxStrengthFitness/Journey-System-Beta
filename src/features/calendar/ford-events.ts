/**
 * THE CALENDAR'S EVENTS ARE CLIENTS' FORD DATES (the Atlas answers, Oct 2
 * 2026). Pure: ford-events.test.ts.
 *
 * AJ: Calendar Events are "clients' FORD dates (birthdays, vacations)". They
 * replace the frozen `client.events` list, which nothing has written since
 * FORD arrived. Two sources, both already in hand or read the Hub's way:
 *
 *   BIRTHDAYS   every client's Mindbody birthday (`dateOfBirth`, on the
 *               client list the app already streams), EVERY year, with her
 *               name: "Ruth Avery's birthday". Read from its digits, never
 *               through a Date in the iPad's zone; Feb 29 falls on Mar 1 in
 *               a year without one.
 *   FORD DATES  each dated detail on the studio's FORD (one read of the
 *               month on screen, `useCalendarFord`): a one-off day on its
 *               day, an annual one (an anniversary) every year, and a
 *               detail with a window ("in Florida Oct 3 – 10", a vacation)
 *               across its days. The title starts with her name and then
 *               the detail in the trainer's own words.
 *
 * Never shown: an archived or legacy detail, the team's In one line, a
 * detail marked no longer true (`resolvedAt`), or an empty one. A client
 * whose home is another studio is not on this studio's calendar (her FORD is
 * her home studio's, and so is her birthday).
 */
import type { FordEntry } from "../ford/types";
import { isOneLineDoc } from "../ford/one-line";
import { studioDayKeyOf } from "../../lib/studio-time";
import type { CalendarEvent } from "./types";

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})/;

export interface CalendarClient {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: unknown;
  homeStudioId?: string | null;
  studioId?: string | null;
  isActive?: boolean | null;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** "YYYY-MM-DD" at local noon — no zone can push it across a day line. */
export function dayToDate(key: string): Date {
  return new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)), 12, 0, 0);
}

/** The days a month-and-day falls on between two day keys (inclusive), one per year. */
export function annualDaysIn(stored: string, from: string, to: string): string[] {
  const m = DAY_KEY.exec(stored);
  if (!m) return [];
  const md = `${m[2]}-${m[3]}`;
  const out: string[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    const key = md === "02-29" && !isLeap(y) ? `${y}-03-01` : `${y}-${md}`;
    if (key >= from && key <= to) out.push(key);
  }
  return out;
}

function nameOf(c: CalendarClient | undefined): string {
  if (!c) return "";
  return `${c.firstName ?? ""} ${c.lastName ?? ""}`.replace(/\s+/g, " ").trim();
}

function homeOf(c: CalendarClient): string | null {
  return c.homeStudioId || c.studioId || null;
}

function shown(e: FordEntry): boolean {
  if (!e || !e.id || !e.clientId) return false;
  if (e.isArchived || e.isLegacy || isOneLineDoc(e)) return false;
  if (e.resolvedAt) return false;
  return typeof e.body === "string" && e.body.trim().length > 0;
}

export interface FordCalendarInput {
  /** The studio's dated FORD details for the range (null while unread or failed). */
  details: readonly FordEntry[] | null;
  /** The client list the app holds. */
  clients: readonly CalendarClient[];
  /** The studio on screen: only its own clients' birthdays. Absent: every client listed. */
  studioId?: string | null;
  /** First and last day on screen, inclusive. */
  from: string;
  to: string;
  tz?: string;
}

/** Birthdays and FORD dates on the days on screen, by day then name. */
export function fordCalendarEvents(input: FordCalendarInput): CalendarEvent[] {
  const { from, to, tz } = input;
  const byId = new Map<string, CalendarClient>();
  for (const c of input.clients) if (c?.id) byId.set(c.id, c);
  const out: Array<CalendarEvent & { day: string }> = [];

  for (const c of input.clients) {
    if (!c?.id || c.isActive === false) continue;
    if (input.studioId && homeOf(c) && homeOf(c) !== input.studioId) continue;
    const dob = typeof c.dateOfBirth === "string" ? DAY_KEY.exec(c.dateOfBirth.trim()) : null;
    const name = nameOf(c);
    if (!dob || !name) continue;
    for (const day of annualDaysIn(`${dob[1]}-${dob[2]}-${dob[3]}`, from, to)) {
      out.push({ id: `bday:${c.id}:${day}`, day, title: `${name}’s birthday`, clientId: c.id, clientName: name, date: dayToDate(day), type: "birthday" });
    }
  }

  for (const e of input.details ?? []) {
    if (!shown(e)) continue;
    const client = byId.get(e.clientId);
    if (input.studioId && client && homeOf(client) && homeOf(client) !== input.studioId) continue;
    const name = nameOf(client);
    const what = (e.subject?.trim() ? `${e.subject.trim()}: ` : "") + e.body.trim().replace(/\s+/g, " ");
    const title = name ? `${name} · ${what}` : what;
    const stored = studioDayKeyOf(e.eventDate ?? null, tz);
    if (stored) {
      const days = e.recurrence === "annual" || e.repeat === "yearly" ? annualDaysIn(stored, from, to) : stored >= from && stored <= to ? [stored] : [];
      for (const day of days) {
        out.push({ id: `ford:${e.id}:${day}`, day, title, clientId: e.clientId, clientName: name, date: dayToDate(day), type: "ford" });
      }
      continue;
    }
    // A window — a vacation, a hospital stay — across its days on screen.
    const start = studioDayKeyOf(e.effectiveFrom ?? null, tz);
    const end = studioDayKeyOf(e.effectiveUntil ?? null, tz);
    if (start && end && end >= start && start <= to && end >= from) {
      const first = start < from ? from : start;
      const last = end > to ? to : end;
      out.push({ id: `ford:${e.id}:${first}`, day: first, title, clientId: e.clientId, clientName: name, date: dayToDate(first), endDate: last > first ? dayToDate(last) : undefined, type: "ford" });
    }
  }

  return out
    .sort((a, b) => a.day.localeCompare(b.day) || (a.type === b.type ? 0 : a.type === "birthday" ? -1 : 1) || (a.clientName ?? "").localeCompare(b.clientName ?? ""))
    .map(({ day: _day, ...e }) => e);
}
