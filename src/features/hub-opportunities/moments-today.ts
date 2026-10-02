/**
 * MOMENTS TODAY — who is coming in on the day on screen, and what is worth
 * knowing about each of them. Pure: moments-today.test.ts (TZ=America/New_York).
 *
 * The Hub's second layer (directory-and-opportunities round, Sep 27 2026).
 * AJ: "list every client coming in that day", sortable "by appointment time,
 * by last seen, by session count, by sessions left, by birthday (turns 80 on
 * June 4th)", "so trainers can see opportunities for that day quickly".
 * Research-hub §6.4–6.5 (the O1 Run-sheet) and §7 (the noise rules).
 *
 * EVERYTHING IS ASKED ABOUT THE SELECTED DAY, never today, so a trainer
 * flipping to Thursday sees Thursday's truth: the birthday window, the
 * milestone (her count plus the bookings before it), the break measured to
 * that booking. That is what makes the day strip honest.
 *
 * ONE VOCABULARY, REUSED. Nothing here decides anything a helper already
 * answers:
 *   Read first   the Hub's own Critical read (`criticalNotesOn` over
 *                useHubCriticalNotes), through `getClientAlertState` — the
 *                card's exact rule; an unread client claims nothing
 *   Watch        no liability waiver signed (Mindbody's "nw", AJ Sep 28 2026:
 *                `waiverState` says "not-signed", never for "not synced
 *                yet", and only where the studio's waivers are kept in
 *                Mindbody at all: `waiverFlagState`, hub fixes Oct 1 2026),
 *                then the last Pulse's red flags, the same alert state
 *   Welcome      a consultation (the card's rule), sessions 1–3 when the
 *                number may be quoted, first time with this trainer where
 *                Journey holds her whole story, and back after a break
 *                measured in MISSED SESSIONS at her own pace
 *                (`renewal.pacePerWeek`), claimed only inside the part of
 *                her timeline Journey owns (`ownedWindow` / `canClaimGap`)
 *   Celebrate    a milestone from Operations' ONE list (`SESSION_MILESTONES`,
 *                admin/overview/moments.ts) when the total may be quoted
 *                (`canQuoteSessionNumber`), and a birthday within a week
 *                either side — "turns 80" only when the year is on file
 *   Renew        `renewalPromptDue`, in the Wrap-up's own words (`promptText`)
 *   Get to know  the ✎ "Ask about" from FORD (get-to-know.ts): a detail whose
 *                day comes round within the week, or noted in the last two
 *                weeks, one per client, from the Hub's one FORD read (wave 2
 *                hub, Sep 28 2026; `fordFor`, handed in as `criticalFor` is)
 *
 * All stars (wave 2 hub, AJ's Hub question 6) is not a moment: it is a
 * section of the Sessions sort, after Regulars, and a sentence in the peek
 * and the opened row, for a client the nightly marks name (`allStarOf`,
 * all-stars.ts). The engine never counts her 26 weeks.
 *
 * No reads: the caller hands in the Hub's bookings, roster, sessions,
 * Critical notes, FORD details and nightly marks, and the directory's rows
 * for the facts (last in, left).
 */
import { isMine } from "../../lib/mine";
import type { Client, ScheduleEntry } from "../../types";
import type { JournalEntry } from "../../types/journal";
import type { FordEntry } from "../ford/types";
import { clientDisplayName } from "../../lib/client-name";
import { homeCutoverOf } from "../../lib/client-coverage";
import { canClaimMilestone, sessionNumberWords, sessionTotalOf, totalIsSayable, type SessionTotalBasis } from "../../lib/session-total";
import { priorHistoryOf, type HistoryCoverage } from "../../lib/prior-history";
import { canClaimGap, dayAfter, ownedWindow } from "../../lib/history-claims";
import { bookingState, isStaffBlock, type BookingMarks, type LoggedSessions } from "../../lib/booking-state";
import { getClientAlertState } from "../../lib/client-alerts";
import { waiverFlagState } from "../../lib/client-waiver";
import { criticalNotesOn } from "../../lib/hub-critical-notes";
import { formatStudioTime, studioDateKey, toDate, zonedHM } from "../../lib/studio-time";
import { SESSION_MILESTONES } from "../admin/overview/moments";
import { promptText, renewalPromptDue } from "../renewals/conversation";
import { renewalOf } from "../renewals/auto-renew";
import { daysBetween, weekdayOf } from "../client-history/model";
import { bookedWithMe, pastDayWords, type DirectoryRow } from "../client-directory/row";
import { ASK_ABOUT_LABEL, askAboutFor } from "./get-to-know";
import { ALL_STARS_LABEL, ALL_STAR_WEEKS, allStarMarkWords, type AllStarMark } from "./all-stars";

/* ------------------------------------------------------------------ */
/* Families and filters                                                */
/* ------------------------------------------------------------------ */

export type MomentFamily = "read-first" | "watch" | "welcome" | "celebrate" | "renew" | "get-to-know";

export type MomentKind =
  | "critical"
  | "waiver"
  | "pulse"
  | "consult"
  | "early-session"
  | "first-with-trainer"
  | "back"
  | "milestone"
  | "birthday"
  | "renew"
  | "ask-about";

export interface Moment {
  family: MomentFamily;
  kind: MomentKind;
  /** Two or three words for a chip on the row. */
  chip: string;
  /** The whole sentence, for the opened row. */
  sentence: string;
  /**
   * The mark's own words, whole, where they are more than the chip: the
   * Critical note's or priority note's words, the Pulse flags. The Hub card
   * gives them to its triangle and glyphs as their label.
   */
  words?: string;
  /**
   * Said at this Loudness: Get to know is a small line at Note loudness
   * (the Atlas answers, Oct 2 2026), never a Heads up.
   */
  loudness?: "standard";
}

/**
 * The Key's order when space runs out: Read first › Watch › Welcome ›
 * Celebrate › Renew › Get to know (research-hub §5), so on a busy card the ✎
 * is the first to fold into "+N".
 */
const FAMILY_ORDER: Record<MomentFamily, number> = { "read-first": 0, watch: 1, welcome: 2, celebrate: 3, renew: 4, "get-to-know": 5 };

/** Every family, in the Key's order. */
export const MOMENT_FAMILIES: ReadonlyArray<MomentFamily> = ["read-first", "watch", "welcome", "celebrate", "renew", "get-to-know"];

export type FilterId = "all" | MomentFamily;
export const FILTERS: ReadonlyArray<{ id: FilterId; label: string }> = [
  { id: "all", label: "All" },
  { id: "read-first", label: "Read first" },
  { id: "celebrate", label: "Celebrate" },
  { id: "welcome", label: "Welcome" },
  { id: "renew", label: "Renew" },
  { id: "watch", label: "Watch" },
  { id: "get-to-know", label: "Get to know" },
];

/** At most this many chips on a row (research-hub §7 rule 4). */
export const MAX_ROW_CHIPS = 3;
/** A break worth a word: this many sessions missed at her own pace. */
export const BACK_MIN_MISSED = 3;
/** A birthday is worth a word this many days either side of the day. */
export const BIRTHDAY_WINDOW = 7;
/** "Ending soon" on the Left sort: at or under this many left in the contract. */
export const ENDING_SOON_AT = 12;

/* ------------------------------------------------------------------ */
/* Small words                                                         */
/* ------------------------------------------------------------------ */

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

const monthDay = (key: string) => `${MONTH[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(8, 10))}`;

/* ------------------------------------------------------------------ */
/* Birthdays, asked about a day                                        */
/* ------------------------------------------------------------------ */

export interface BirthdayFrom {
  /** Days from the day to the NEAREST birthday: negative when it has just passed. */
  nearest: number;
  /** The birthday's day key at that nearest occurrence. */
  nearestKey: string;
  /** Days from the day to the next one (0 on the day). */
  next: number;
  nextKey: string;
  /** Her age at the nearest birthday, or null when the year is not on file. */
  turnsAtNearest: number | null;
  turnsAtNext: number | null;
}

/**
 * Where a date of birth falls relative to `day`, read from its digits (never
 * through a Date in UTC). A year before 1900 is a placeholder: no age is
 * said (the ageFromDob rule).
 */
export function birthdayFrom(dob: string | null | undefined, day: string): BirthdayFrom | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dob ?? "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const md = `${m[2]}-${m[3]}`;
  if (Number(m[2]) < 1 || Number(m[2]) > 12 || Number(m[3]) < 1 || Number(m[3]) > 31) return null;
  const y = Number(day.slice(0, 4));
  const occ = [y - 1, y, y + 1].map((yy) => ({ yy, key: `${yy}-${md}`, diff: daysBetween(day, `${yy}-${md}`) }));
  const nearest = [...occ].sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff) || b.diff - a.diff)[0];
  const next = occ.filter((o) => o.diff >= 0).sort((a, b) => a.diff - b.diff)[0];
  const known = year >= 1900;
  return {
    nearest: nearest.diff,
    nearestKey: nearest.key,
    next: next.diff,
    nextKey: next.key,
    turnsAtNearest: known ? nearest.yy - year : null,
    turnsAtNext: known ? next.yy - year : null,
  };
}

function birthdayWords(b: BirthdayFrom): { chip: string; sentence: string; milestone: boolean } {
  const d = b.nearest;
  const turns = b.turnsAtNearest;
  const milestone = turns !== null && turns >= 30 && turns % 10 === 0;
  const wd = weekdayOf(b.nearestKey);
  if (d === 0) {
    return { chip: turns !== null ? `Turns ${turns} today` : "Birthday today", sentence: turns !== null ? `Turns ${turns} today.` : "Birthday today.", milestone };
  }
  if (d > 0) {
    return {
      chip: milestone ? `Turns ${turns} ${WEEKDAY[wd]}` : `Birthday ${WEEKDAY[wd]}`,
      sentence: turns !== null ? `Turns ${turns} on ${WEEKDAY_LONG[wd]}, ${monthDay(b.nearestKey)}.` : `Birthday on ${WEEKDAY_LONG[wd]}, ${monthDay(b.nearestKey)}.`,
      milestone,
    };
  }
  return {
    chip: `Birthday was ${WEEKDAY[wd]}`,
    sentence: turns !== null ? `Turned ${turns} on ${WEEKDAY_LONG[wd]}, ${monthDay(b.nearestKey)}.` : `Birthday was ${WEEKDAY_LONG[wd]}, ${monthDay(b.nearestKey)}.`,
    milestone,
  };
}

/* ------------------------------------------------------------------ */
/* One row of the run-sheet                                            */
/* ------------------------------------------------------------------ */

export type RunSortKey = "time" | "lastSeen" | "sessions" | "left" | "birthday";

export interface Fact {
  /** The sentence the fixed column reads for this sort. */
  sentence: string;
  /** The section it falls in, and whether that is "Can't tell yet". */
  bucket: string;
  unknown: boolean;
  /** Sorts inside the section (lower first in the default direction). */
  value: number | null;
}

export interface RunSheetEntry {
  /** The booking's id (the first of hers that day). */
  key: string;
  booking: ScheduleEntry;
  clientId: string | null;
  client: Client | null;
  /** The name she goes by, whole — never cut. */
  name: string;
  start: number;
  end: number;
  /** "9:20 – 9:40 AM". */
  timeText: string;
  /** "with Pippin", "with you", or null. */
  withText: string | null;
  /** "done", "not logged", "now" — or null. */
  stateText: string | null;
  mine: boolean;
  /** Every moment, in the Key's order. */
  moments: Moment[];
  facts: Record<RunSortKey, Fact>;
  /** Her Critical notes could not be read: Read first may be missing. */
  criticalUnknown: boolean;
  /**
   * Her FORD could not be checked (the Hub's FORD read failed, or came back
   * at its guard rail without any of hers): something to ask about may be
   * missing, so nothing may say "nothing special".
   */
  askUnknown: boolean;
  /**
   * The session number this booking will be, from her TOTAL (before Journey
   * plus Journey's, lib/session-total.ts) — confirmed, whole, or Mindbody's
   * guess (`sessionBasis` says which). Null when no total can be said.
   */
  sessionNumber: number | null;
  /**
   * Where her total's "before Journey" comes from (`sessionTotalOf`), or null
   * with no client. "mindbody": the number is a guess, said as "from
   * Mindbody, not yet confirmed" where a trainer opens it (the peek), and no
   * milestone is claimed off it.
   */
  sessionBasis: SessionTotalBasis | null;
  /** With no total at all ("journey-only"): Journey's own number for this booking, said "#6 in Journey". */
  journeyNumber: number | null;
  /** Her total so far that `sessionNumber` counts on from, so a second booking that day is numbered the same way. */
  sessionTotal: number | null;
  /**
   * The nightly marks name her an all star (wave 2 hub): her weeks, her pace
   * and the sentence the peek and the opened row say. Null for everyone
   * else — nothing ever says who isn't one.
   */
  allStar: { weeksIn: number; perWeek: number; words: string } | null;
  /**
   * Clinical history is on her record. Standing context, never a mark or a
   * filter (it would sit on most clients the studio has): the Hub's peek and
   * the opened row say it quietly, and the briefing holds the detail.
   */
  clinicalOnFile: boolean;
}

export interface MomentsTodayInput {
  /** The SELECTED studio day. */
  day: string;
  /** The actual studio day. */
  today: string;
  now: Date;
  tz?: string;
  /** Every booking the Hub holds (the week ahead): the day's are picked out here. */
  schedules: ReadonlyArray<ScheduleEntry>;
  clientsById: ReadonlyMap<string, Client>;
  /** The directory's rows for those clients, built on the real today. */
  rowsById: ReadonlyMap<string, DirectoryRow>;
  studios?: ReadonlyArray<{ id?: string; journeyCutoverDate?: string | null }> | null;
  /** `loggedSessions(...)` over the Hub's sessions, or null when unknown. */
  logged: LoggedSessions | null;
  /** The day's "didn't come" marks (`useBookingMarks().marks`), or null when not read: a marked booking is "didn't come", never "not logged" (Operations wave 3). */
  marks?: BookingMarks | null;
  /** The Hub's one Critical read: a client's notes, or null when unread. */
  criticalFor: (clientId: string) => readonly JournalEntry[] | null;
  /**
   * The Hub's one FORD read (use-hub-ford.ts): a client's details, `[]` when
   * read and none, null when unknown. Absent: Get to know is not in play (no
   * read, or not answered yet), and nothing is said either way.
   */
  fordFor?: (clientId: string) => readonly FordEntry[] | null;
  /**
   * The nightly marks (use-hub-marks.ts): the all star the job named, or
   * null. Absent when the marks are missing, stale or unreadable: then no
   * one is one, and nothing is said.
   */
  allStarOf?: (clientId: string) => AllStarMark | null;
  myIds: ReadonlyArray<string>;
  myName?: string | null;
  trainerNameOf?: (trainerId: string) => string | null;
  /**
   * Whether the studio keeps its waivers in Mindbody at all
   * (`waiversKeptInMindbody` over the roster; hub fixes, Oct 1 2026). False:
   * Mindbody's "not signed" says nothing about the client, and no card is
   * flagged. Absent: true, as before.
   */
  waiversKeptInMindbody?: boolean;
}

const startOf = (b: ScheduleEntry) => toDate(b.startTime)?.getTime() ?? 0;
const endOf = (b: ScheduleEntry) => toDate(b.endTime)?.getTime() ?? startOf(b) + 30 * 60_000;

function firstWord(v: string | null | undefined): string | null {
  const w = (v ?? "").trim().split(/\s+/)[0];
  return w || null;
}

function withWords(b: ScheduleEntry, input: MomentsTodayInput, myIdSet: Set<string>): string | null {
  if (bookedWithMe(b, { myIdSet, myName: input.myName ?? null })) return "with you";
  const byId = b.trainerId ? input.trainerNameOf?.(b.trainerId) : null;
  if (byId) return `with ${firstWord(byId)}`;
  const name = (b.trainerName ?? "").trim();
  if (!name || name.toLowerCase().endsWith(" rotation")) return null;
  return `with ${firstWord(name)}`;
}

/**
 * The number this booking will be: her count, plus her bookings between now
 * and this one (Operations' `count + i + 1`), plus this one — unless it is
 * today's and already logged, when the count holds it already (the card's rule).
 * The Hub card asks it per booking (a client booked twice in a day has two).
 */
export function sessionNumberFor(
  client: Client,
  booking: ScheduleEntry,
  input: MomentsTodayInput,
  /** Her count so far: her total (`sessionTotalOf(...).total`), or Journey's own for "#6 in Journey". Null: no number. */
  base: number | null,
): number | null {
  const count = typeof base === "number" && Number.isFinite(base) ? Math.trunc(base) : null;
  if (count === null) return null;
  const day = studioDateKey(booking.startTime, input.tz);
  if (day && day === input.today && client.id && input.logged?.has(client.id, day)) return count;
  const nowMs = input.now.getTime();
  const thisStart = startOf(booking);
  const between = input.schedules.filter(
    (b) => b.clientId === client.id && b.status !== "Cancelled" && !isStaffBlock(b) && startOf(b) > nowMs && startOf(b) < thisStart,
  ).length;
  return count + between + 1;
}

function sessionWords(n: number): string {
  if (n === 1) return "First session";
  return `${ordinal(n)} session`;
}

function coverageOf(row: DirectoryRow | undefined): HistoryCoverage {
  return row?.coverage ?? "unknown";
}

export function buildEntry(bookings: ScheduleEntry[], input: MomentsTodayInput, myIdSet: Set<string>): RunSheetEntry {
  const booking = bookings[0];
  const clientId = booking.clientId ?? null;
  const client = clientId ? input.clientsById.get(clientId) ?? null : null;
  const row = clientId ? input.rowsById.get(clientId) : undefined;
  const start = startOf(booking);
  const end = endOf(booking);
  const startText = formatStudioTime(new Date(start), input.tz);
  const endText = formatStudioTime(new Date(end), input.tz);
  // "9:20 \u2013 9:40 AM"; the start keeps its AM/PM only when the slot crosses noon.
  const timeText = `${startText.slice(-2) === endText.slice(-2) ? startText.replace(/ [AP]M$/, "") : startText} \u2013 ${endText}`;
  const state = bookingState(booking, input.logged, input.now, input.tz, input.marks ?? null);
  const stateText = state === "completed" ? "done" : state === "never-logged" ? "not logged" : state === "no-show" ? "late cancel" : state === "in-progress" ? "now" : null;
  const withText = withWords(booking, input, myIdSet);
  const name = client ? clientDisplayName(client, booking.clientName || "Client") : (booking.clientName || "Client").trim();

  const unknownFact = (sentence: string): Fact => ({ sentence, bucket: "cant-tell", unknown: true, value: null });
  const facts: Record<RunSortKey, Fact> = {
    time: timeFact(booking, input, start, end),
    lastSeen: unknownFact("Can\u2019t tell yet"),
    sessions: unknownFact("Total not recorded yet"),
    left: unknownFact("No package read yet"),
    birthday: unknownFact("No birthday on file"),
  };
  const moments: Moment[] = [];
  let criticalUnknown = false;
  let askUnknown = false;
  let sessionNumber: number | null = null;
  let sessionBasis: SessionTotalBasis | null = null;
  let journeyNumber: number | null = null;
  let sessionTotal: number | null = null;
  let allStar: RunSheetEntry["allStar"] = null;
  let clinicalOnFile = false;

  if (client && clientId) {
    const coverage = coverageOf(row);
    // Her total (lib/session-total.ts): confirmed, whole, or Mindbody's
    // guess. Milestones and "first session" only off a confirmed or whole one.
    const totals = sessionTotalOf(client, coverage);
    sessionBasis = totals.basis;
    const claim = canClaimMilestone(totals.basis);

    /* ---- Read first and Watch: the card's own alert state ---- */
    const notes = input.criticalFor(clientId);
    criticalUnknown = notes === null;
    const alert = getClientAlertState(client, criticalNotesOn(notes ?? [], input.day, input.tz));
    clinicalOnFile = alert.hasClinicalHistory;
    if (alert.hasPriorityNote) {
      moments.push({ family: "read-first", kind: "critical", chip: "Read first", sentence: `Read first: ${alert.priorityLabel ?? "a priority note"}`, words: alert.priorityLabel ?? "Priority note" });
    }
    // Watch, in the Key's order: the waiver (second only to Read first), then Pulse.
    if (waiverFlagState(client, input.waiversKeptInMindbody ?? true).state === "not-signed") {
      moments.push({ family: "watch", kind: "waiver", chip: "No waiver signed", sentence: "No liability waiver signed in Mindbody.", words: "No waiver signed" });
    }
    if (alert.hasCheckInRedFlag) {
      moments.push({ family: "watch", kind: "pulse", chip: "Pulse flag", sentence: `Pulse: ${alert.checkInFlagLabel}`, words: alert.checkInFlagLabel ?? "Pulse flag" });
    }

    /* ---- sessions ---- */
    sessionTotal = totalIsSayable(totals) ? totals.total : null;
    sessionNumber = sessionNumberFor(client, booking, input, sessionTotal);
    journeyNumber = totals.basis === "journey-only" ? sessionNumberFor(client, booking, input, totals.journey) : null;
    const isToday = input.day === input.today;
    const milestone = claim && sessionNumber !== null && SESSION_MILESTONES.includes(sessionNumber);
    if (sessionNumber !== null) {
      const n = sessionNumber;
      const early = claim && n <= 3;
      facts.sessions = {
        sentence: milestone ? `${ordinal(n)} session${isToday ? " today" : ""}` : early ? sessionWords(n) : (sessionNumberWords(n, totals.basis, { explain: true }) ?? `#${n}`),
        bucket: milestone ? "milestone" : early ? "new" : n < 50 ? "building" : "regulars",
        unknown: false,
        value: n,
      };
    } else if (journeyNumber !== null) {
      // No total to say: Journey's own number, and it says so ("#6 in Journey").
      facts.sessions = unknownFact(sessionNumberWords(journeyNumber, "journey-only") ?? "Total not recorded yet");
    }

    /* ---- All stars: the nightly marks' word, never counted here ---- */
    // Her own section on the Sessions sort, after Regulars — unless today is
    // a milestone, which is today's news and keeps its section. The claim is
    // the job's (only where Journey holds every visit in the 26 weeks), so it
    // stands even when her total can't be quoted.
    const star = input.allStarOf?.(clientId) ?? null;
    if (star) {
      allStar = { weeksIn: star.weeksIn, perWeek: star.perWeek, words: allStarMarkWords(star) };
      if (!milestone) {
        const weeks = `in ${star.weeksIn} of the last ${ALL_STAR_WEEKS} weeks`;
        facts.sessions = {
          sentence: sessionNumber !== null ? `#${sessionNumber} \u00b7 ${weeks}` : `${weeks.charAt(0).toUpperCase()}${weeks.slice(1)}`,
          bucket: "all-stars",
          unknown: false,
          value: sessionNumber,
        };
      }
    }

    /* ---- Welcome ---- */
    const consult = /consult/i.test(booking.serviceName || "") || (!!client.requiresConsultation && !client.consultationCompleted);
    if (consult) moments.push({ family: "welcome", kind: "consult", chip: "Consultation", sentence: "A consultation." });
    if (!consult && claim && sessionNumber !== null && sessionNumber <= 3) {
      moments.push({ family: "welcome", kind: "early-session", chip: sessionWords(sessionNumber), sentence: `Her ${sessionNumber === 1 ? "first" : ordinal(sessionNumber)} session.` });
    }
    // First time with this trainer: only when Journey holds her whole story,
    // so the tally is every session she has had.
    const tally = client.trainerTally;
    if (
      coverage === "complete" &&
      tally &&
      booking.trainerId &&
      sessionNumber !== null &&
      sessionNumber > 1 &&
      !((tally[booking.trainerId] ?? 0) > 0)
    ) {
      const who = input.trainerNameOf?.(booking.trainerId) ?? booking.trainerName;
      moments.push({ family: "welcome", kind: "first-with-trainer", chip: `First with ${firstWord(who) ?? "trainer"}`, sentence: `Her first session with ${firstWord(who) ?? "this trainer"}.` });
    }

    /* ---- last seen, and back after a break ---- */
    const last = row?.lastIn;
    if (last?.state === "known" && last.day) {
      const gap = daysBetween(last.day, input.day);
      const pace = client.renewal?.pacePerWeek;
      const window = ownedWindow({ coverage, prior: priorHistoryOf(client), cutover: homeCutoverOf(input.studios ?? null, client) });
      const gapFrom = dayAfter(last.day);
      const claimable = !!gapFrom && canClaimGap(gapFrom, window);
      const missed = typeof pace === "number" && pace > 0 && gap > 0 ? Math.floor((gap * pace) / 7) - 1 : null;
      if (gap <= 0) {
        facts.lastSeen = { sentence: "In today already", bucket: "usual", unknown: false, value: 0 };
      } else if (missed !== null && missed >= BACK_MIN_MISSED && claimable) {
        const weeks = Math.round(gap / 7);
        facts.lastSeen = { sentence: `Back after ${weeks} weeks \u2014 missed about ${missed}`, bucket: "back", unknown: false, value: gap };
        moments.push({ family: "welcome", kind: "back", chip: `Back after ${weeks} wk`, sentence: `Back after ${weeks} weeks \u2014 missed about ${missed} at her usual pace.` });
      } else {
        facts.lastSeen = { sentence: `Last in ${pastDayWords(last.day, input.day)} (${gap} ${gap === 1 ? "day" : "days"})`, bucket: "usual", unknown: false, value: gap };
      }
    } else if (last?.state === "nothing-recorded" && coverage === "complete" && sessionNumber === 1) {
      facts.lastSeen = { sentence: isToday ? "First visit today" : "First visit", bucket: "first", unknown: false, value: -1 };
    } else if (last?.state === "before-journey") {
      facts.lastSeen = unknownFact("Can\u2019t tell yet \u2014 her visits are recorded before Journey");
    }

    /* ---- Celebrate ---- */
    if (milestone && sessionNumber !== null) {
      moments.push({ family: "celebrate", kind: "milestone", chip: `${ordinal(sessionNumber)}${isToday ? " today" : ""}`, sentence: `Her ${ordinal(sessionNumber)} session.` });
    }
    const bday = birthdayFrom(client.dateOfBirth, input.day);
    if (bday) {
      const words = birthdayWords(bday);
      if (Math.abs(bday.nearest) <= BIRTHDAY_WINDOW) moments.push({ family: "celebrate", kind: "birthday", chip: words.chip, sentence: words.sentence });
      const nextWd = WEEKDAY[weekdayOf(bday.nextKey)];
      const sentence =
        bday.next === 0
          ? bday.turnsAtNext !== null
            ? `Turns ${bday.turnsAtNext} today`
            : "Birthday today"
          : bday.nearest < 0 && bday.nearest >= -BIRTHDAY_WINDOW
            ? bday.turnsAtNearest !== null
              ? `Turned ${bday.turnsAtNearest} \u00b7 ${WEEKDAY[weekdayOf(bday.nearestKey)]} ${monthDay(bday.nearestKey)}`
              : `Birthday was ${monthDay(bday.nearestKey)}`
            : bday.turnsAtNext !== null
              ? `turns ${bday.turnsAtNext} \u00b7 ${bday.next <= 7 ? `${nextWd} ` : ""}${monthDay(bday.nextKey)}`
              : `Birthday ${monthDay(bday.nextKey)}`;
      const near = Math.abs(bday.nearest) <= BIRTHDAY_WINDOW;
      facts.birthday = {
        sentence,
        bucket: bday.next === 0 ? "today" : near ? "week" : bday.next <= 30 ? "month" : "later",
        unknown: false,
        value: near ? bday.nearest : bday.next,
      };
    }

    /* ---- Left, and Renew ---- */
    const left = row?.left;
    // With her auto-renewal mark and the lock applied now (auto-renew.ts):
    // a client marked "not on auto-renewal" gets no before-the-charge talk.
    const renewal = renewalOf(client);
    const talk = renewalPromptDue(renewal);
    if (talk && renewal) moments.push({ family: "renew", kind: "renew", chip: "Renewal talk", sentence: promptText(renewal) });
    if (left && left.state === "known") {
      const inContract = left.perPayment ? `${left.value} on hand in contract` : left.value === 0 ? "None left in contract" : `${left.value} left in contract`;
      const extra = left.sub ? ` \u00b7 ${left.sub}` : "";
      facts.left = talk
        ? {
            sentence: renewal?.situation === "ended" ? "Package ended \u2014 talk today?" : `${inContract} \u2014 talk today?`,
            bucket: "talk",
            unknown: false,
            value: left.value,
          }
        : {
            sentence: `${inContract}${extra}`,
            bucket: left.perPayment ? "monthly" : (left.value ?? 0) <= ENDING_SOON_AT ? "ending" : "plenty",
            unknown: false,
            value: left.value,
          };
    } else if (talk && renewal) {
      facts.left = { sentence: renewal.situation === "ended" ? "Package ended \u2014 talk today?" : "Renewal due \u2014 talk today?", bucket: "talk", unknown: false, value: null };
    }

    /* ---- Get to know: the ✎ Ask about, from the Hub's one FORD read ---- */
    // Asked about the booking's day, like every moment. The chip and the
    // sentence are the list's and the peek's; on the grid the mark is a glyph
    // whose label is only ASK_ABOUT_LABEL — FORD details never on the grid.
    if (input.fordFor) {
      const details = input.fordFor(clientId);
      if (details === null) {
        askUnknown = true;
      } else {
        const ask = askAboutFor(details, input.day, input.tz);
        if (ask) moments.push({ family: "get-to-know", kind: "ask-about", chip: ask.chip, sentence: ask.sentence, words: ASK_ABOUT_LABEL, loudness: ask.loudness });
      }
    }
  }

  moments.sort((a, b) => FAMILY_ORDER[a.family] - FAMILY_ORDER[b.family]);
  // One Mine everywhere (src/lib/mine.ts): booked with you that day, or coached by you in the last 60 days.
  const mine = isMine(client, myIdSet, { bookedWithMe: bookings.some((b) => bookedWithMe(b, { myIdSet, myName: input.myName ?? null })) });

  return {
    key: booking.id ?? `${clientId}:${start}`,
    booking,
    clientId,
    client,
    name,
    start,
    end,
    timeText,
    withText,
    stateText,
    mine,
    moments,
    facts,
    criticalUnknown,
    askUnknown,
    sessionNumber,
    sessionBasis,
    journeyNumber,
    sessionTotal,
    allStar,
    clinicalOnFile,
  };
}

function timeFact(booking: ScheduleEntry, input: MomentsTodayInput, start: number, end: number): Fact {
  const nowMs = input.now.getTime();
  let bucket: string;
  if (input.day === input.today) {
    bucket = end <= nowMs ? "earlier" : start <= nowMs + 30 * 60_000 ? "now" : "later";
  } else {
    const hour = zonedHM(booking.startTime, input.tz)?.hour ?? 0;
    bucket = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  }
  return { sentence: "", bucket, unknown: false, value: start };
}

/** Every client booked on the day, one entry each (her first booking that day leads). */
export function momentsToday(input: MomentsTodayInput): RunSheetEntry[] {
  const myIdSet = new Set(input.myIds.filter(Boolean));
  const byClient = new Map<string, ScheduleEntry[]>();
  for (const b of input.schedules) {
    if (!b || b.status === "Cancelled" || isStaffBlock(b)) continue;
    if (studioDateKey(b.startTime, input.tz) !== input.day) continue;
    const key = b.clientId ?? `unlinked:${b.id ?? b.clientName}`;
    const list = byClient.get(key) ?? [];
    list.push(b);
    byClient.set(key, list);
  }
  const entries: RunSheetEntry[] = [];
  for (const list of byClient.values()) {
    list.sort((a, b) => startOf(a) - startOf(b));
    const entry = buildEntry(list, input, myIdSet);
    entry.facts.time.sentence = [entry.timeText, entry.withText].filter(Boolean).join(" \u00b7 ");
    entries.push(entry);
  }
  return entries.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ */
/* Filters, chips, and the sections of each sort                       */
/* ------------------------------------------------------------------ */

export function hasFamily(entry: RunSheetEntry, family: MomentFamily): boolean {
  return entry.moments.some((m) => m.family === family);
}

export function filterCounts(entries: ReadonlyArray<RunSheetEntry>): Record<FilterId, number> {
  const out: Record<FilterId, number> = { all: entries.length, "read-first": 0, watch: 0, welcome: 0, celebrate: 0, renew: 0, "get-to-know": 0 };
  for (const e of entries) {
    for (const f of MOMENT_FAMILIES) if (hasFamily(e, f)) out[f] += 1;
  }
  return out;
}

/** The facts each sort states in its column: the row never repeats one as a chip. */
const SORT_RESTATES: Record<RunSortKey, MomentKind[]> = {
  time: [],
  lastSeen: ["back"],
  sessions: ["milestone", "early-session"],
  left: ["renew"],
  birthday: ["birthday"],
};

/** At most three chips, Read first always among them, never the sorted fact. */
export function rowChips(entry: RunSheetEntry, sort: RunSortKey): Moment[] {
  return entry.moments.filter((m) => !SORT_RESTATES[sort].includes(m.kind)).slice(0, MAX_ROW_CHIPS);
}

export interface RunSection {
  id: string;
  label: string;
  entries: RunSheetEntry[];
  /** Collapsed by default ("Can't tell yet", "Earlier today"). */
  folded: boolean;
}

const SECTION_ORDER: Record<RunSortKey, Array<{ id: string; label: string; folded?: boolean }>> = {
  time: [
    { id: "now", label: "Now and the next 30 min" },
    { id: "later", label: "Later today" },
    { id: "morning", label: "Morning" },
    { id: "afternoon", label: "Afternoon" },
    { id: "evening", label: "Evening" },
    { id: "earlier", label: "Earlier today", folded: true },
  ],
  lastSeen: [
    { id: "back", label: "Back after a break" },
    { id: "first", label: "First visits" },
    { id: "usual", label: "Usual rhythm" },
  ],
  sessions: [
    { id: "milestone", label: "Milestone" },
    { id: "new", label: "New (1\u20133)" },
    { id: "building", label: "Building (4\u201349)" },
    { id: "regulars", label: "Regulars (50+)" },
    // AJ's Hub question 6 (wave 2 hub): only for a client the nightly marks name.
    { id: "all-stars", label: ALL_STARS_LABEL },
  ],
  left: [
    { id: "talk", label: "Talk about renewing" },
    { id: "ending", label: "Ending soon" },
    { id: "plenty", label: "Plenty" },
    { id: "monthly", label: "Monthly \u2014 on hand" },
  ],
  birthday: [
    { id: "today", label: "Today" },
    { id: "week", label: "This week" },
    { id: "month", label: "Next 30 days" },
    { id: "later", label: "Later" },
  ],
};

/** Each sort's default direction for the value inside a section: 1 = lower first. */
const DEFAULT_SIGN: Record<RunSortKey, 1 | -1> = { time: 1, lastSeen: -1, sessions: 1, left: 1, birthday: 1 };

export const RUN_SORTS: ReadonlyArray<{ id: RunSortKey; label: string; words: string }> = [
  { id: "time", label: "Time", words: "earliest first" },
  { id: "lastSeen", label: "Last seen", words: "longest away first" },
  { id: "sessions", label: "Sessions", words: "milestones, then fewest first" },
  { id: "left", label: "Left", words: "fewest left first" },
  { id: "birthday", label: "Birthday", words: "soonest first" },
];

/**
 * The entries in sections for a sort. `reversed` is the second tap on the
 * active sort: the known sections and the order inside them flip; "Can't
 * tell yet" stays last and folded.
 */
export function runSections(entries: ReadonlyArray<RunSheetEntry>, sort: RunSortKey, reversed = false): RunSection[] {
  const order = SECTION_ORDER[sort];
  const sign = DEFAULT_SIGN[sort] * (reversed ? -1 : 1);
  const known = order.map((s) => ({ ...s, entries: [] as RunSheetEntry[] }));
  const cant: RunSheetEntry[] = [];
  for (const e of entries) {
    const f = e.facts[sort];
    const target = f.unknown ? null : known.find((s) => s.id === f.bucket);
    if (target) target.entries.push(e);
    else cant.push(e);
  }
  const byValue = (a: RunSheetEntry, b: RunSheetEntry) => {
    const va = a.facts[sort].value;
    const vb = b.facts[sort].value;
    if (va !== null && vb !== null && va !== vb) return sign * (va - vb);
    return a.start - b.start || a.name.localeCompare(b.name);
  };
  const sections: RunSection[] = known
    .filter((s) => s.entries.length > 0)
    .map((s) => ({ id: s.id, label: s.label, folded: !!s.folded, entries: s.entries.sort(byValue) }));
  if (reversed) sections.reverse();
  if (cant.length > 0) {
    sections.push({ id: "cant-tell", label: "Can\u2019t tell yet", folded: true, entries: cant.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name)) });
  }
  return sections;
}
