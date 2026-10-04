/**
 * ONE DIRECTORY ROW — what each cell says about a client, and the key it
 * sorts by. Pure: row.test.ts, run with TZ=America/New_York.
 *
 * The directory round (Sep 27 2026). AJ: "When I look at a client I want to
 * know when they are in next when they were in last and how many sessions
 * they have left ... I should be able to sort those categories so I can
 * search Nancy and then sort by last seen." Three screens used to work out
 * "last", "next" and "left" each their own way (the Directory, the Hub's
 * search cards, Admin → Clients) and could not agree. This file is the one
 * row model; every cell REUSES the helper that already answers it:
 *
 *   name        lib/client-name        legal first + the coach's nickname
 *   age         client-admin/account   ageAndBirthday (from the digits)
 *   last in     lib/client-coverage +  what Journey saw, what the nightly
 *               lib/prior-history      record saw, and — when neither has a
 *                                      day — "Before Journey", "Nothing
 *                                      recorded" or "Unknown", never a blank
 *   next        the bookings the app already holds (about 8 days), then the
 *               nightly record's next booking, then "Nothing booked" ONLY
 *               while the bookings are fresh; "Unknown" otherwise
 *   left        client-admin/account   sessionsSplit with the studio's own
 *                                      package table — never "0" unread
 *   total       lib/prior-history      the prior-history arithmetic, only
 *                                      when the number may be quoted
 *   since       lib/client-since       only a date Mindbody or Journey can
 *                                      prove, never the day Journey met her
 *
 * THE HOUSE RULES IT KEEPS (CLAUDE.md): a failed or stale read is unknown,
 * never a fact; a confident wrong number is worse than a missing one; a
 * migrating client is never "new" or "#1"; dates are the studio's Eastern
 * day and a date-only string is compared as text, never handed to
 * `new Date()`. Every "Unknown" carries its reason in words for the ⓘ.
 *
 * No reads happen here. The screen hands in what the app already streams
 * (the roster, the held bookings, the last day's sessions, the studio's
 * package table) through `prepareDirectory`, which indexes each list ONCE so
 * 300 rows cost one pass, not 300 scans.
 */
import type { Client, KaizenRosterEntry, ScheduleEntry, WorkoutSession } from "../../types";
import { clientFirstName, clientInitials, goesByNickname } from "../../lib/client-name";
import { canQuoteSessionNumber, coverageOfClient, homeCutoverOf } from "../../lib/client-coverage";
import {
  PRIOR_SOURCE_LABEL,
  priorHistoryOf,
  priorUncounted,
  totalSessions,
  type HistoryCoverage,
} from "../../lib/prior-history";
import { resolveClientSince } from "../../lib/client-since";
import { formatStudioTime, studioDateKey, studioDayKeyOf, toDate } from "../../lib/studio-time";
import { WEEK_AHEAD_DAYS } from "../../lib/schedule-window";
import { isStaffBlock } from "../../lib/booking-state";
import { ageAndBirthday, sessionsSplit } from "../client-admin/account";
import { resolveContractTier } from "../client-admin/contract";
import type { PackageNameIndex } from "../renewals/settings";
import type { RenewalSnapshot } from "../renewals/types";
import { addDays, daysBetween, sessionDayKey, weekdayOf } from "../client-history/model";
import { parseHeightInches } from "../machine-trends/trends";

/* ------------------------------------------------------------------ */
/* Words shared by every cell                                          */
/* ------------------------------------------------------------------ */

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const isDayKey = (v: unknown): v is string => typeof v === "string" && DAY_KEY.test(v);

/** "Sep 17" (this year) or "Mar 2025" (another year), from a day key's digits. */
export function dayWords(day: string, today: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return y === Number(today.slice(0, 4)) ? `${MONTH_SHORT[m - 1]} ${d}` : monthYearWords(day);
}

/** "Aug 2026", from a day key's digits. */
export function monthYearWords(day: string): string {
  const [y, m] = day.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${y}`;
}

/** A day in the past, as a person says it: "Today", "Yesterday", "Tue", "Sep 17", "Mar 2025". */
export function pastDayWords(day: string, today: string): string {
  const ago = daysBetween(day, today);
  if (ago <= 0) return "Today";
  if (ago === 1) return "Yesterday";
  if (ago < 7) return WEEKDAY_SHORT[weekdayOf(day)];
  return dayWords(day, today);
}

/** A day ahead: "Today", "Tomorrow", "Thu", "Oct 14". */
export function futureDayWords(day: string, today: string): string {
  const ahead = daysBetween(today, day);
  if (ahead <= 0) return "Today";
  if (ahead === 1) return "Tomorrow";
  if (ahead < 7) return WEEKDAY_SHORT[weekdayOf(day)];
  return dayWords(day, today);
}

/** 66 → "5′6″" (the prime marks, not quotes). */
export function heightWords(inches: number): string {
  const ft = Math.floor(inches / 12);
  return `${ft}\u2032${inches - ft * 12}\u2033`;
}

/** Typographic primes and curly quotes read as the typed ones, so "5′6″" parses like 5'6". */
export function plainHeightText(text: string): string {
  return text
    .replace(/[\u2032\u2019\u00b4`]/g, "'")
    .replace(/[\u2033\u201d\u201c]/g, '"');
}

const clean = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/* ------------------------------------------------------------------ */
/* What the screen hands in                                            */
/* ------------------------------------------------------------------ */

type StudioLike = { id?: string; name?: string; journeyCutoverDate?: string | null };

export interface DirectoryInput {
  /** The studio's day, `yyyy-mm-dd` (studioTodayKey). */
  today: string;
  now: Date;
  tz?: string;
  /** Every studio the app streams: the home studio's cutover and name. */
  studios?: ReadonlyArray<StudioLike> | null;
  activeStudioId?: string | null;
  /**
   * The bookings the app already holds (`useLiveSchedule`): yesterday through
   * about eight days ahead at this studio. Null while they have not loaded.
   */
  schedules: ReadonlyArray<ScheduleEntry> | null;
  /**
   * The held bookings were read recently enough to say "nothing booked".
   * Stale, failed or never read: false — and then no row says it.
   */
  bookingsFresh: boolean;
  /** "9:14 AM" — when the bookings were last read, for the Unknown reason. */
  bookingsAsOf?: string | null;
  /** How far ahead the held bookings reach, in studio days. */
  horizonDays?: number;
  /**
   * The studio's sessions of the last day (`useSessions`) — today's finished
   * session is the freshest "last in" there is. Null when unknown.
   */
  recentSessions?: ReadonlyArray<WorkoutSession> | null;
  /**
   * The HOME studio's package table (`buildPackageNameIndex` over
   * `useRenewalSettings`). Null until it has answered, or after a read that
   * failed — then "left" is unknown rather than a guess.
   */
  packageIndex: Pick<PackageNameIndex, "tierFor" | "isExtraSessions"> | null;
  /**
   * The studio `packageIndex` was read for. A client whose HOME is another
   * studio is judged by her home studio's table (the profile's rule), which
   * this screen has not read — so her "left" is unknown, never a guess made
   * with the wrong table. Absent: the table is taken to be every client's.
   */
  packageStudioId?: string | null;
  /** The signed-in trainer's Kaizen Roster. */
  kaizen?: ReadonlyArray<KaizenRosterEntry> | null;
  /** Every id the signed-in trainer's bookings and sessions may carry (`myTrainerIds`). */
  myIds?: ReadonlyArray<string> | null;
  /** The signed-in trainer's full name, for a booking that names its trainer only by name. */
  myName?: string | null;
  /** A trainer id → the name a trainer goes by ("Mike"). */
  trainerNameOf?: (trainerId: string) => string | null;
}

/** The input with its lists indexed once. Build it with `prepareDirectory`. */
export interface DirectoryContext extends DirectoryInput {
  horizonDays: number;
  /** The last studio day the held bookings are trusted to cover. */
  horizonEnd: string;
  /** clientId → her held, uncancelled bookings, soonest first. Null while not loaded. */
  bookingsByClient: Map<string, ScheduleEntry[]> | null;
  /** clientId → her session finished TODAY at this studio. */
  finishedToday: Map<string, WorkoutSession>;
  kaizenById: Map<string, KaizenRosterEntry>;
  myIdSet: Set<string>;
}

const startMs = (b: ScheduleEntry): number | null => toDate(b.startTime)?.getTime() ?? null;
/** A booking's end; a booking with none is taken to be the studio's 30-minute slot. */
const endMs = (b: ScheduleEntry): number | null => {
  const end = toDate(b.endTime)?.getTime();
  if (typeof end === "number") return end;
  const start = startMs(b);
  return start === null ? null : start + 30 * 60_000;
};

export function prepareDirectory(input: DirectoryInput): DirectoryContext {
  const horizonDays = input.horizonDays ?? WEEK_AHEAD_DAYS;
  let bookingsByClient: Map<string, ScheduleEntry[]> | null = null;
  if (input.schedules) {
    bookingsByClient = new Map();
    for (const b of input.schedules) {
      // A Mindbody "Unavailable" block is a trainer's time, never a booking
      // (lib/booking-state.ts, isStaffBlock; the Openings round, Sep 27 2026).
      if (!b || b.status === "Cancelled" || !b.clientId || isStaffBlock(b)) continue;
      if (startMs(b) === null) continue;
      const list = bookingsByClient.get(b.clientId) ?? [];
      list.push(b);
      bookingsByClient.set(b.clientId, list);
    }
    for (const list of bookingsByClient.values()) list.sort((a, b) => (startMs(a) ?? 0) - (startMs(b) ?? 0));
  }
  const finishedToday = new Map<string, WorkoutSession>();
  for (const s of input.recentSessions ?? []) {
    if (!s || s.status !== "Completed" || !s.clientId) continue;
    if (sessionDayKey(s, input.tz) !== input.today) continue;
    finishedToday.set(s.clientId, s);
  }
  const kaizenById = new Map<string, KaizenRosterEntry>();
  for (const e of input.kaizen ?? []) if (e?.clientId) kaizenById.set(e.clientId, e);
  return {
    ...input,
    horizonDays,
    horizonEnd: addDays(input.today, horizonDays),
    bookingsByClient,
    finishedToday,
    kaizenById,
    myIdSet: new Set((input.myIds ?? []).filter(Boolean)),
  };
}

/* ------------------------------------------------------------------ */
/* Whose booking — "with Ana", "with you"                              */
/* ------------------------------------------------------------------ */

const lower = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Is this booking with the signed-in trainer? The standing week's rule
 * (standing-week/check.ts, WHOSE BOOKING): the id decides when the sync wrote
 * one, the name when it didn't, and a booking that names nobody (the sync's
 * "{studio} Rotation") is nobody's.
 */
export function bookedWithMe(b: Pick<ScheduleEntry, "trainerId" | "trainerName">, ctx: Pick<DirectoryContext, "myIdSet" | "myName">): boolean {
  if (b.trainerId) return ctx.myIdSet.has(b.trainerId);
  const name = lower(b.trainerName);
  if (!name || name.endsWith(" rotation")) return false;
  return !!ctx.myName && name === lower(ctx.myName);
}

function firstWord(name: string | null | undefined): string | null {
  const w = clean(name).split(" ")[0];
  return w || null;
}

/** "with you", "with Ana", or null when the booking names nobody. */
function bookingWith(b: ScheduleEntry, ctx: DirectoryContext): string | null {
  if (bookedWithMe(b, ctx)) return "with you";
  const byId = b.trainerId ? ctx.trainerNameOf?.(b.trainerId) : null;
  if (byId) return `with ${firstWord(byId)}`;
  const name = clean(b.trainerName);
  if (!name || name.toLowerCase().endsWith(" rotation")) return null;
  return `with ${firstWord(name)}`;
}

function sessionWith(s: WorkoutSession, ctx: DirectoryContext): string | null {
  const id = s.trainerId ?? s.startedByTrainerId ?? null;
  if (id && ctx.myIdSet.has(id)) return "with you";
  const name = id ? ctx.trainerNameOf?.(id) : null;
  if (name) return `with ${firstWord(name)}`;
  return s.trainerInitials ? `with ${s.trainerInitials}` : null;
}

/* ------------------------------------------------------------------ */
/* The row                                                             */
/* ------------------------------------------------------------------ */

export type LastInState = "known" | "before-journey" | "nothing-recorded" | "unknown";
export type NextState = "booked" | "none" | "unknown";
export type KnownState = "known" | "unknown";

export interface DirectoryRow {
  id: string;
  client: Client;
  name: {
    /** The legal first name, as the record has it. */
    first: string;
    /** The coach's nickname when it differs from the legal first name. */
    nickname: string | null;
    last: string;
    /** `Judith "Judy" Alvarez` — legal and nickname together, never truncated. */
    display: string;
    /** The name she goes by first ("Judy"): what ties sort on. */
    goesBy: string;
    initials: string;
  };
  coverage: HistoryCoverage;
  kaizen: KaizenRosterEntry | null;
  /** Exceptions only (never "Active" on 240 rows). */
  badges: string[];
  /** "Solon" when her home studio is not the one on this iPad. */
  visitingFrom: string | null;
  age: {
    value: number | null;
    text: string;
    /** "Birthday Thursday", "Turns 80 today" — only within a week. */
    birthdayPhrase: string | null;
    /** A decade birthday (turns 60, 70, 80…) inside that week. */
    milestone: boolean;
    daysToBirthday: number | null;
    turns: number | null;
  };
  gender: "female" | "male" | "other" | null;
  occupation: { text: string | null; retired: boolean };
  height: { inches: number | null; text: string };
  lastIn: {
    state: LastInState;
    /** The studio day, when known. */
    day: string | null;
    text: string;
    /** "with Mike", or where a Before Journey record comes from. */
    sub: string | null;
    /** Why, in words, for the ⓘ. */
    reason: string | null;
  };
  next: {
    state: NextState;
    /** Epoch ms of the booking's start (noon of the day for the nightly record's date). */
    at: number | null;
    day: string | null;
    text: string;
    sub: string | null;
    reason: string | null;
    /** Where it came from: the bookings the app holds, or last night's record. */
    source: "held" | "nightly" | null;
  };
  left: {
    state: KnownState;
    /** Sessions left (or on hand) in the contract — the sort key. */
    value: number | null;
    text: string;
    /** "+12 extra", or what else she holds. */
    sub: string | null;
    reason: string | null;
    perPayment: boolean;
  };
  total: {
    state: KnownState;
    value: number | null;
    text: string;
    /** "304 before Journey". */
    sub: string | null;
    reason: string | null;
  };
  since: { year: number | null; at: number | null; text: string; label: string | null };
  /**
   * When her package or contract comes up for renewal (AJ, Oct 3 2026: "can
   * we also filter by renewal date for their contract?"). The day is the
   * nightly snapshot's `focusDate`, the day the package effectively ends,
   * which Operations -> Month and the renewals pipeline sort by too; with no
   * snapshot yet, the end of the contract Mindbody says is billing her.
   * "renewed": the next package is already signed. "paid": paid in full (or
   * banked sessions) with no date worked out: it ends when her sessions run
   * out, so it has no day of its own (AJ, Oct 3 2026: "These are paid in full").
   */
  renews: { state: "known" | "renewed" | "paid" | "none" | "unknown"; day: string | null; text: string; sub: string | null; reason: string | null };
  /** Her booking today (the first not yet over, else the last), for In today and Start. */
  today: { at: number; end: number; text: string; with: string | null; over: boolean } | null;
  /** Booked with the signed-in trainer in the held bookings. */
  bookedWithMe: boolean;
}

/** The client's home studio, read the way the rules read it (`homeStudioId`, else the older `studioId`). */
function homeOf(client: Client): string | null {
  return client.homeStudioId || (client as { studioId?: string }).studioId || null;
}

/* ---- name ---- */

function nameOf(client: Client): DirectoryRow["name"] {
  const first = clean(client.firstName);
  const last = clean(client.lastName);
  const nickname = goesByNickname(client) ? clean(client.nickname) : null;
  const display = [first, nickname ? `\u201c${nickname}\u201d` : null, last].filter(Boolean).join(" ") || "Unnamed client";
  return {
    first,
    nickname,
    last,
    display,
    goesBy: clientFirstName(client, last),
    initials: clientInitials(client) || "?",
  };
}

/* ---- age ---- */

function birthdayPhraseOf(daysUntil: number | null, turns: number | null, birthday: string, today: string): { phrase: string | null; milestone: boolean } {
  if (daysUntil === null || daysUntil > 7) return { phrase: null, milestone: false };
  const milestone = turns !== null && turns >= 30 && turns % 10 === 0;
  const when =
    daysUntil === 0
      ? "today"
      : daysUntil === 1
        ? "tomorrow"
        : daysUntil < 7
          ? WEEKDAY_LONG[weekdayOf(addDays(today, daysUntil))]
          : birthday;
  return { phrase: milestone ? `Turns ${turns} ${when}` : `Birthday ${when}`, milestone };
}

function ageOf(client: Client, today: string): DirectoryRow["age"] {
  const ab = ageAndBirthday(client.dateOfBirth, today);
  if (!ab) return { value: null, text: "Not on file", birthdayPhrase: null, milestone: false, daysToBirthday: null, turns: null };
  const b = birthdayPhraseOf(ab.daysUntil, ab.turns, ab.birthday, today);
  return {
    // Never an age without a birth year: ageAndBirthday gives null for one.
    value: ab.age,
    text: ab.age === null ? "Not on file" : String(ab.age),
    birthdayPhrase: b.phrase,
    milestone: b.milestone,
    daysToBirthday: ab.daysUntil,
    turns: ab.turns,
  };
}

/* ---- gender, occupation, height ---- */

export function genderOf(value: unknown): DirectoryRow["gender"] {
  const g = clean(value).toLowerCase();
  if (!g) return null;
  if (g === "female" || g === "f" || g === "woman") return "female";
  if (g === "male" || g === "m" || g === "man") return "male";
  return "other";
}

function occupationOf(client: Client): DirectoryRow["occupation"] {
  const text = clean(client.occupation) || null;
  const retired = client.isRetired === true || (!!text && /\bretir/i.test(text));
  return { text, retired };
}

function heightOf(client: Client): DirectoryRow["height"] {
  const inches = typeof client.height === "string" ? parseHeightInches(plainHeightText(client.height)) : null;
  return { inches, text: inches === null ? "Not on file" : heightWords(inches) };
}

/* ---- last in ---- */

/** The day a stored value names, read the date-trap-safe way; null past today or unreadable. */
function pastDayOf(value: unknown, today: string, tz?: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const day = studioDayKeyOf(value as never, tz);
  if (!day || !isDayKey(day) || day > today) return null;
  return day;
}

function latestMachineDay(client: Client, today: string, tz?: string): string | null {
  let best: string | null = null;
  for (const m of Object.values(client.currentMachineMetrics ?? {})) {
    const day = pastDayOf((m as { lastPerformedDate?: unknown } | null)?.lastPerformedDate, today, tz);
    if (day && (!best || day > best)) best = day;
  }
  return best;
}

function lastInOf(client: Client, ctx: DirectoryContext, coverage: HistoryCoverage): DirectoryRow["lastIn"] {
  const id = client.id ?? "";
  const todays = id ? ctx.finishedToday.get(id) : undefined;
  if (todays) {
    return { state: "known", day: ctx.today, text: "Today", sub: sessionWith(todays, ctx), reason: "A session finished in Journey today." };
  }

  // Every other piece of evidence names a day she was in; the latest wins.
  const evidence: Array<{ day: string; reason: string }> = [];
  const push = (day: string | null, reason: string) => {
    if (day) evidence.push({ day, reason });
  };
  push(pastDayOf(client.lastSessionDate, ctx.today, ctx.tz), "Her record's last session.");
  const nightly = client.renewal?.lastVisitDate;
  push(isDayKey(nightly) && nightly <= ctx.today ? nightly : null, "Last night's record of her visits (Mindbody bookings and Journey sessions).");
  push(latestMachineDay(client, ctx.today, ctx.tz), "The last day a machine setting was recorded for her.");

  if (evidence.length > 0) {
    evidence.sort((a, b) => b.day.localeCompare(a.day));
    const { day, reason } = evidence[0];
    // "with Mike" only when a booking the app holds for that very day says so.
    const booking = (ctx.bookingsByClient?.get(id) ?? []).find((b) => studioDateKey(b.startTime, ctx.tz) === day);
    return { state: "known", day, text: pastDayWords(day, ctx.today), sub: booking ? bookingWith(booking, ctx) : null, reason };
  }

  // No day anywhere. What is honest to say depends on how much of her story
  // Journey holds (the migration rule, CLAUDE.md).
  const prior = priorHistoryOf(client);
  if (prior || coverage === "partial") {
    const through = prior?.through && isDayKey(prior.through) ? prior.through : null;
    return {
      state: "before-journey",
      day: null,
      text: "Before Journey",
      sub: prior ? `${PRIOR_SOURCE_LABEL[prior.source]}${through ? ` record to ${monthYearWords(through)}` : ""}` : null,
      reason: "Her visits so far are recorded before Journey (FileMaker), not here.",
    };
  }
  if (coverage === "complete" || client.renewal) {
    return { state: "nothing-recorded", day: null, text: "Nothing recorded", sub: null, reason: "No visit is recorded in Journey or in last night's record." };
  }
  return {
    state: "unknown",
    day: null,
    text: "Unknown",
    sub: null,
    reason: "Journey has no visit for her, and her history before Journey is not recorded yet.",
  };
}

/* ---- next ---- */

function nextOf(client: Client, ctx: DirectoryContext): DirectoryRow["next"] {
  const id = client.id ?? "";
  const nowMs = ctx.now.getTime();
  if (ctx.bookingsByClient) {
    const held = (ctx.bookingsByClient.get(id) ?? []).find((b) => (endMs(b) ?? 0) > nowMs);
    if (held) {
      const at = startMs(held) as number;
      const day = studioDateKey(held.startTime, ctx.tz) as string;
      const ahead = daysBetween(ctx.today, day);
      const text = ahead < 7 ? `${futureDayWords(day, ctx.today)} ${formatStudioTime(held.startTime, ctx.tz)}` : dayWords(day, ctx.today);
      return { state: "booked", at, day, text, sub: bookingWith(held, ctx), reason: null, source: "held" };
    }
  }
  // Last night's record reaches about a month ahead. Beyond what the app
  // holds it is the only word; inside it, the live bookings know better (a
  // booking missing from them was cancelled since) — unless they are stale.
  const nightly = client.renewal?.nextBookingDate;
  if (isDayKey(nightly) && nightly >= ctx.today && (nightly > ctx.horizonEnd || !ctx.bookingsFresh || !ctx.bookingsByClient)) {
    const [y, m, d] = nightly.split("-").map(Number);
    return {
      state: "booked",
      at: new Date(y, m - 1, d, 12).getTime(),
      day: nightly,
      text: futureDayWords(nightly, ctx.today),
      sub: "as of last night",
      reason: "From last night's record of her bookings.",
      source: "nightly",
    };
  }
  // The held bookings are THIS studio's. A client whose home is elsewhere
  // books there, and those bookings are not read here: no booking in this
  // studio's list says nothing about hers.
  const home = homeOf(client);
  if (ctx.activeStudioId && home && home !== ctx.activeStudioId) {
    return {
      state: "unknown",
      at: null,
      day: null,
      text: "Unknown",
      sub: null,
      reason: "Her bookings at her home studio aren't read on this studio's iPad.",
      source: null,
    };
  }
  if (ctx.bookingsByClient && ctx.bookingsFresh) {
    return {
      state: "none",
      at: null,
      day: null,
      text: "Nothing booked",
      sub: `next ${ctx.horizonDays} days`,
      reason: `No booking at this studio in the next ${ctx.horizonDays} days.`,
      source: null,
    };
  }
  return {
    state: "unknown",
    at: null,
    day: null,
    text: "Unknown",
    sub: null,
    reason: ctx.bookingsAsOf ? `Bookings last read ${ctx.bookingsAsOf}, so a next booking may be missing.` : "Bookings haven't loaded yet.",
    source: null,
  };
}

/* ---- left ---- */

function leftOf(client: Client, ctx: DirectoryContext): DirectoryRow["left"] {
  const unknown = (reason: string): DirectoryRow["left"] => ({ state: "unknown", value: null, text: "Unknown", sub: null, reason, perPayment: false });
  const services = client.mindbodyServices ?? {};
  const pulled = !!client.mindbodyServicesSyncedAt || Object.keys(services).length > 0;
  if (!pulled) return unknown("Her packages haven't been pulled from Mindbody yet.");
  if (!ctx.packageIndex) return unknown("The studio's package table hasn't loaded.");
  const home = homeOf(client);
  if (ctx.packageStudioId && home && home !== ctx.packageStudioId) {
    return unknown("Her home studio's package table isn't read on this studio's iPad.");
  }

  // Left means left in the contract; given sessions are extra, beside it
  // (AJ, Sep 26 2026) — the profile header's own pair.
  const split = sessionsSplit(client, ctx.packageIndex);
  const extras = [split.extra > 0 ? `+${split.extra} extra` : null, split.other > 0 ? `${split.other} on other options` : null]
    .filter(Boolean)
    .join(" \u00b7 ") || null;
  if (split.hasContract) {
    const n = split.contract;
    const text = split.perPayment ? (n === 0 ? "None on hand" : `${n} on hand`) : n === 0 ? "None left" : `${n} left`;
    return {
      state: "known",
      value: n,
      text,
      sub: extras,
      reason: split.perPayment ? "Paid a month at a time: what she holds now, not what is left in the contract." : null,
      perPayment: split.perPayment,
    };
  }
  return {
    state: "known",
    value: 0,
    text: "None left",
    sub: extras,
    reason: "No contract option with sessions on it in Mindbody.",
    perPayment: false,
  };
}

/* ---- total ---- */

function totalOf(client: Client, coverage: HistoryCoverage): DirectoryRow["total"] {
  const count = typeof client.sessionCount === "number" && Number.isFinite(client.sessionCount) ? Math.max(0, Math.trunc(client.sessionCount)) : null;
  // The Hub card's own gate: never "#1" or "new" off Journey's count for a
  // client whose story began before Journey.
  if (!canQuoteSessionNumber(client, coverage)) {
    return { state: "unknown", value: null, text: "Unknown", sub: null, reason: "Her sessions before Journey aren't recorded yet, so a total would be too low." };
  }
  if (count === null) {
    return { state: "unknown", value: null, text: "Unknown", sub: null, reason: "Not counted yet. Opening her profile counts it." };
  }
  const prior = priorHistoryOf(client);
  const uncounted = priorUncounted(prior);
  // `sessionCount` already carries the prior record once the profile has
  // reconciled it; a count below the prior part cannot, so it is Journey's
  // alone and the arithmetic adds the rest.
  const total = prior && count < uncounted ? (totalSessions(count, prior) as number) : count;
  return {
    state: "known",
    value: total,
    text: total === 0 ? "None yet" : String(total),
    sub: uncounted > 0 ? `${uncounted} before Journey` : null,
    reason: null,
  };
}

/* ---- since ---- */

function sinceOf(client: Client, coverage: HistoryCoverage): DirectoryRow["since"] {
  const since = resolveClientSince(client, { coverage });
  // "In Journey since" is not when she started: it sorts with Not on file.
  if (!since || !since.fromMindbody) return { year: null, at: null, text: "Not on file", label: null };
  return { year: since.date.getFullYear(), at: since.date.getTime(), text: `${MONTH_SHORT[since.date.getMonth()]} ${since.date.getFullYear()}`, label: "Client since" };
}

/* ---- renews ---- */

function shortDay(ymd: string, today: string): string {
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  return `${MONTH_SHORT[m - 1]} ${d}${ymd.slice(0, 4) === today.slice(0, 4) ? "" : `, ${ymd.slice(0, 4)}`}`;
}

/**
 * Paid in full or banked sessions, by the profile's one answer
 * (`resolveContractTier`: a trainer's mark on The package first, then the
 * renewal snapshot, then Mindbody's contract and pricing option names).
 */
function paidInFull(client: Client): DirectoryRow["renews"] | null {
  const tier = resolveContractTier(client);
  if (tier.payment !== "pif" && tier.payment !== "sessions-only") return null;
  return {
    state: "paid",
    day: null,
    text: tier.payment === "pif" ? "Paid in full" : "Sessions only",
    sub: "ends when sessions run out",
    reason: null,
  };
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function renewsOf(client: Client, today: string): DirectoryRow["renews"] {
  const s = client.renewal as RenewalSnapshot | undefined;
  if (s) {
    if (s.renewalOnBooks && YMD.test(s.renewalOnBooks.startsOn)) {
      return { state: "renewed", day: s.renewalOnBooks.startsOn, text: "Renewed", sub: `next starts ${shortDay(s.renewalOnBooks.startsOn, today)}`, reason: null };
    }
    if (s.situation === "unknown") {
      return { state: "unknown", day: null, text: "Unknown", sub: null, reason: s.dataGaps?.[0] ?? "Not enough Mindbody data to work out her renewal." };
    }
    const day = s.focusDate;
    if (day && YMD.test(day)) {
      const est = s.chargeDateSource === "estimate" || (s.paymentMode !== "monthly" && !!s.runOutDate) ? " (est.)" : "";
      const sub =
        day < today
          ? "Ended"
          : s.paymentMode === "monthly"
            ? s.autoRenews === true
              ? `Renews${est}`
              : s.autoRenews === false
                ? `Billing ends${est}`
                : `Payments finish${est}`
            : `Runs out${est}`;
      return { state: "known", day, text: shortDay(day, today), sub, reason: null };
    }
    return paidInFull(client) ?? { state: "none", day: null, text: "No end date", sub: null, reason: "No end date on file for her package." };
  }
  // No snapshot yet: the latest active contract Mindbody is billing.
  let best: string | null = null;
  for (const raw of Object.values(client.mindbodyContracts ?? {})) {
    const c = raw as { status?: unknown; autopayStatus?: unknown; endDate?: unknown } | null;
    if (!c || c.status !== "Active" || c.autopayStatus !== "Active") continue;
    const end = studioDayKeyOf(c.endDate as never);
    if (end && end >= today && (!best || end > best)) best = end;
  }
  if (best) return { state: "known", day: best, text: shortDay(best, today), sub: "Contract ends", reason: null };
  return (
    paidInFull(client) ?? {
      state: "unknown",
      day: null,
      text: "Unknown",
      sub: null,
      reason:
        "No renewal worked out for her yet, and no contract billing her in Mindbody with an end date. If she paid in full, mark it on her profile: Notes & Profile \u2192 Account \u2192 The package.",
    }
  );
}

/* ---- today ---- */

function todayOf(client: Client, ctx: DirectoryContext): DirectoryRow["today"] {
  const list = (ctx.bookingsByClient?.get(client.id ?? "") ?? []).filter((b) => studioDateKey(b.startTime, ctx.tz) === ctx.today);
  if (list.length === 0) return null;
  const nowMs = ctx.now.getTime();
  const pick = list.find((b) => (endMs(b) ?? 0) > nowMs) ?? list[list.length - 1];
  const at = startMs(pick) as number;
  const end = endMs(pick) as number;
  return { at, end, text: formatStudioTime(pick.startTime, ctx.tz), with: bookingWith(pick, ctx), over: end <= nowMs };
}

/* ---- the whole row ---- */

export function buildDirectoryRow(client: Client, ctx: DirectoryContext): DirectoryRow {
  const id = client.id ?? "";
  const cutover = homeCutoverOf(ctx.studios ?? null, client);
  const coverage = coverageOfClient(client, cutover);
  const home = homeOf(client);
  const visitingFrom =
    ctx.activeStudioId && home && home !== ctx.activeStudioId
      ? clean((ctx.studios ?? []).find((s) => s.id === home)?.name) || "another studio"
      : null;
  const badges: string[] = [];
  if (client.isActive === false) badges.push("Inactive");
  if (client.provisional === true) badges.push("Temporary");
  if (!home) badges.push("No home studio");

  return {
    id,
    client,
    name: nameOf(client),
    coverage,
    kaizen: ctx.kaizenById.get(id) ?? null,
    badges,
    visitingFrom,
    age: ageOf(client, ctx.today),
    gender: genderOf(client.gender),
    occupation: occupationOf(client),
    height: heightOf(client),
    lastIn: lastInOf(client, ctx, coverage),
    next: nextOf(client, ctx),
    left: leftOf(client, ctx),
    total: totalOf(client, coverage),
    since: sinceOf(client, coverage),
    renews: renewsOf(client, ctx.today),
    today: todayOf(client, ctx),
    bookedWithMe: (ctx.bookingsByClient?.get(id) ?? []).some((b) => bookedWithMe(b, ctx)),
  };
}

/** Every row, in the roster's order. Clients with no id or no name at all are left out, as before. */
export function buildDirectoryRows(clients: ReadonlyArray<Client>, ctx: DirectoryContext): DirectoryRow[] {
  const out: DirectoryRow[] = [];
  const seen = new Set<string>();
  for (const c of clients) {
    if (!c?.id || seen.has(c.id)) continue;
    if (!clean(c.firstName) && !clean(c.lastName)) continue;
    seen.add(c.id);
    out.push(buildDirectoryRow(c, ctx));
  }
  return out;
}
