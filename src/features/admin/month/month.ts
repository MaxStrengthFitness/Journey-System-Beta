/**
 * OPERATIONS → MONTH — a given month's renewals, birthdays and
 * anniversaries, and the studio's MIA list. Pure: month.test.ts
 * (TZ=America/New_York).
 *
 * AJ, Sep 29 2026: "in operations we need the ability to be able to see all
 * of a given month's renewals, birthdays and anniversaries and MIA list. A
 * lot of studio leadership will normally ask themselves: what do I need to
 * worry about today, this week and this month. Today the clients coming in
 * matter the most. Tomorrow is making sure we are ready for them and the
 * rest this week. The sooner we can get ahead of an issue the better."
 *
 * Today is the brief and Week is the week; this is the month, and it is
 * the sixth destination of Operations for that reason (shell/places.ts:
 * Today · Week · Month · Clients · Team · Setup). Any month can be opened —
 * next month to get ahead, last month to look back — and every list is
 * worked out from what Operations already reads: the roster's nightly
 * renewal snapshots, the renewal conversations, each client's date of
 * birth, her first day (`lib/client-since.ts`) and the Journey's states.
 * Nothing is read per client and nothing new is written.
 *
 * WHAT IT REFUSES TO SAY (the house rules):
 *
 *   - A renewal is placed in a month by the day the package effectively
 *     ends (`focusDate`, the pipeline's own key). A client whose renewal
 *     timing is unknown is COUNTED as unknown, never left out silently.
 *   - "Nobody has talked to them yet" is said only when the conversations
 *     were read (`cyclesKnown`); a failed read says it couldn't be read.
 *   - An anniversary comes only from a date that proves she was here: the
 *     day a person set (`firstStudioDay`, the surest), else Mindbody's
 *     (`resolveClientSince`, `fromMindbody`). A guessed day is SAID to be a
 *     guess, with a nudge to set the real one on her Account page — the
 *     whole point of the first-day field is that inferred dates are only
 *     upper bounds. A Journey-only date gives no anniversary at all.
 *   - The MIA list is the Journey's one rule (`journey/states.ts`), never a
 *     second one: Drifting, At risk and Lapsed, each with the day she
 *     crossed the line. It is "as of today" whichever month is open, and
 *     nothing is listed until the Journey is ready.
 */
import type { Client } from "../../../types";
import { clientDisplayName } from "../../../lib/client-name";
import { resolveClientSince, type ClientSinceSource } from "../../../lib/client-since";
import { historyCoverage } from "../../../lib/prior-history";
import { studioDateKey } from "../../../lib/studio-time";
import { leaningLabel } from "../../renewals/conversation";
import { laneOf, nextStep, type PipelineLane } from "../../renewals/pipeline";
import { situationSentence } from "../../renewals/sentences";
import type { RenewalCycle, RenewalSettings, RenewalSnapshot } from "../../renewals/types";
import type { JourneyEntry } from "../journey/journey-list";
import { STATE_NAMES, type JourneyState } from "../journey/states";
import { SINCE_SOURCE_WORDS } from "../overview/moments";

/* ------------------------------------------------------------------ *
 * Months
 * ------------------------------------------------------------------ */

/** `YYYY-MM` of a day key. */
export const monthOf = (day: string): string => day.slice(0, 7);

/** The month `n` months on (negative for back). */
export function shiftMonth(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}`;
}

/** "October 2026". */
export function monthLabel(month: string): string {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

export function daysInMonth(month: string): number {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
}

/** "Tue, Oct 6" — a day key read as a calendar day, never through the zone. */
export function dayWords(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

const nameOf = (c: Client) => clientDisplayName(c, "A client");

/* ------------------------------------------------------------------ *
 * The rows
 * ------------------------------------------------------------------ */

export type MonthTone = "alert" | "warn" | "info";

export interface MonthRow {
  key: string;
  clientId: string;
  name: string;
  /** `YYYY-MM-DD` the row falls on. */
  day: string;
  /** The claim, in one sentence. */
  sentence: string;
  /** What backs it. */
  proof: string;
  /** The badge word: "Talk now", "Turns 80", "10 years", "Lapsed". */
  badge: string;
  tone: MonthTone;
}

/* ------------------------------------------------------------------ *
 * 1. Renewals — by the day the package effectively ends
 * ------------------------------------------------------------------ */

export interface MonthRenewals {
  rows: MonthRow[];
  /** Clients whose renewal timing is unknown: counted, never dropped. */
  unknown: number;
  /** Renewals in the month with nobody having logged a conversation; null when the conversations couldn't be read. */
  notTalked: number | null;
}

const LANE_WORD: Record<PipelineLane, string> = {
  "talk-now": "Talk now",
  "before-charge": "Before the charge",
  "coming-up": "Coming up",
  lapsed: "Lapsed",
  away: "Away",
};

const LANE_TONE: Record<PipelineLane, MonthTone> = {
  "talk-now": "alert",
  "before-charge": "warn",
  "coming-up": "info",
  lapsed: "warn",
  away: "info",
};

const OUTCOME_WORD: Record<string, string> = {
  renewed: "Renewed",
  upgraded: "Renewed · upgraded",
  downgraded: "Renewed · downgraded",
  "pay-as-you-go": "Pay as you go",
  lost: "Lost",
};

export function monthRenewals(
  clients: readonly Client[],
  month: string,
  cycles: Record<string, RenewalCycle>,
  settings: RenewalSettings,
  today: string,
  cyclesKnown: boolean,
): MonthRenewals {
  const rows: MonthRow[] = [];
  let unknown = 0;
  let notTalked = 0;
  for (const c of clients) {
    if (!c.id || c.isActive === false) continue;
    const s = c.renewal as RenewalSnapshot | undefined;
    if (!s) continue;
    if (s.situation === "unknown") {
      unknown += 1;
      continue;
    }
    const day = s.focusDate;
    if (!day || monthOf(day) !== month) continue;
    const cycle = s.cycleKey ? (cycles[s.cycleKey] ?? null) : null;
    const lane = laneOf(s, cycle, settings, today);
    const outcome = cycle?.outcome ?? null;
    let badge: string;
    let tone: MonthTone;
    let sentence: string;
    if (s.renewalOnBooks) {
      badge = "Renewed";
      tone = "info";
      sentence = situationSentence(s, today);
    } else if (outcome && OUTCOME_WORD[outcome]) {
      badge = OUTCOME_WORD[outcome];
      tone = outcome === "lost" ? "warn" : "info";
      sentence = situationSentence(s, today);
    } else if (lane) {
      badge = LANE_WORD[lane];
      tone = LANE_TONE[lane];
      sentence = nextStep(s, cycle, settings, today);
    } else {
      badge = "Ends";
      tone = "info";
      sentence = situationSentence(s, today);
    }
    const live = !s.renewalOnBooks && !outcome && (lane === "talk-now" || lane === "before-charge" || lane === "coming-up");
    if (live && !cycle?.lastTouchAt) notTalked += 1;
    const talked = cycle?.lastTouchAt
      ? `Last talked to by ${cycle.lastTouchByName ?? "someone"}${cycle.latestLeaning ? ` — ${leaningLabel(cycle.latestLeaning).toLowerCase()}` : ""}.`
      : live
        ? cyclesKnown
          ? "Nobody has talked to them yet."
          : "Whether anyone has talked to them couldn't be read just now."
        : "";
    rows.push({
      key: `renewal:${c.id}`,
      clientId: c.id,
      name: nameOf(c),
      day,
      sentence,
      proof: [`${s.packageLabel ?? "Package"} ends ${dayWords(day)}${s.chargeDateSource === "estimate" ? " (estimated)" : ""}.`, talked].filter(Boolean).join(" "),
      badge,
      tone,
    });
  }
  rows.sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name));
  return { rows, unknown, notTalked: cyclesKnown ? notTalked : null };
}

/* ------------------------------------------------------------------ *
 * 2. Birthdays — from the date of birth's digits
 * ------------------------------------------------------------------ */

export interface MonthBirthdays {
  rows: MonthRow[];
  /** Active clients with no readable date of birth. */
  noDate: number;
}

/** The yyyy-mm-dd of a date of birth, from its digits (never through UTC). */
export function dobKeyOf(dob: unknown): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dob ?? "").trim());
  if (!m) return null;
  const key = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() + 1 === Number(m[2]) && d.getUTCDate() === Number(m[3]) ? key : null;
}

/** The day a Feb 29 birthday falls on in a year without one: Feb 28. */
function dayInMonth(month: string, dayOfMonth: number): string {
  const d = Math.min(dayOfMonth, daysInMonth(month));
  return `${month}-${String(d).padStart(2, "0")}`;
}

export function monthBirthdays(clients: readonly Client[], month: string): MonthBirthdays {
  const rows: MonthRow[] = [];
  let noDate = 0;
  const year = Number(month.slice(0, 4));
  for (const c of clients) {
    if (!c.id || c.isActive === false) continue;
    const dob = dobKeyOf(c.dateOfBirth);
    if (!dob) {
      noDate += 1;
      continue;
    }
    if (dob.slice(5, 7) !== month.slice(5, 7)) continue;
    const turns = year - Number(dob.slice(0, 4));
    if (turns <= 0) continue;
    const day = dayInMonth(month, Number(dob.slice(8, 10)));
    const decade = turns % 10 === 0;
    rows.push({
      key: `birthday:${c.id}`,
      clientId: c.id,
      name: nameOf(c),
      day,
      sentence: `Turns ${turns} on ${dayWords(day)}.`,
      proof: decade ? "A decade birthday." : "",
      badge: decade ? `Turns ${turns}` : "Birthday",
      tone: decade ? "warn" : "info",
    });
  }
  rows.sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name));
  return { rows, noDate };
}

/* ------------------------------------------------------------------ *
 * 3. Anniversaries — whole years with the studio
 * ------------------------------------------------------------------ */

export interface MonthAnniversaries {
  rows: MonthRow[];
  /**
   * Clients whose anniversary falls this month by Mindbody's date, which no
   * one has confirmed yet: NOT listed (AJ, Oct 2 2026: anniversaries wait for
   * a confirmed date), only counted, with a nudge to confirm it on Account.
   */
  guessed: number;
  /** Active clients with no date that proves when they started: no anniversary can be said. */
  noDate: number;
}

const SINCE_FIELD: Partial<Record<ClientSinceSource, string>> = {
  stated: "firstStudioDay",
  firstSession: "firstSessionDate",
  firstAppointment: "firstAppointmentDate",
  mindbodyCreated: "mindbodyCreatedAt",
};

/**
 * Her first day as a calendar day. A date-only string is read as text (the
 * date trap: read as UTC it is the previous evening in Ohio); an instant is
 * read in the studio's zone.
 */
export function firstDayOf(client: Client, cutover: string | null | undefined, tz?: string): { day: string; source: ClientSinceSource; confirmed: boolean } | null {
  const since = resolveClientSince(client, { coverage: historyCoverage(client, cutover ?? null) });
  if (!since || !since.fromMindbody) return null;
  const field = SINCE_FIELD[since.source];
  const raw = field ? (client as unknown as Record<string, unknown>)[field] : undefined;
  const day = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : studioDateKey(since.date, tz);
  return day ? { day, source: since.source, confirmed: since.confirmed } : null;
}

export function monthAnniversaries(clients: readonly Client[], month: string, cutover: string | null | undefined, tz?: string): MonthAnniversaries {
  const rows: MonthRow[] = [];
  let guessed = 0;
  let noDate = 0;
  const year = Number(month.slice(0, 4));
  for (const c of clients) {
    if (!c.id || c.isActive === false) continue;
    const first = firstDayOf(c, cutover, tz);
    if (!first) {
      noDate += 1;
      continue;
    }
    if (first.day.slice(5, 7) !== month.slice(5, 7)) continue;
    const years = year - Number(first.day.slice(0, 4));
    if (years < 1) continue;
    const day = dayInMonth(month, Number(first.day.slice(8, 10)));
    const stated = first.source === "stated";
    // Anniversaries wait for a confirmed date (AJ, Oct 2 2026): Mindbody's
    // first appointment is counted as waiting, never celebrated.
    if (!first.confirmed) {
      guessed += 1;
      continue;
    }
    rows.push({
      key: `years:${c.id}`,
      clientId: c.id,
      name: nameOf(c),
      day,
      sentence: `${years} ${years === 1 ? "year" : "years"} with the studio on ${dayWords(day)}.`,
      proof: stated
        ? `First day ${dayWords(first.day)}, ${first.day.slice(0, 4)} — set on their profile.`
        : `First day ${dayWords(first.day)}, ${first.day.slice(0, 4)} (${SINCE_SOURCE_WORDS[first.source] ?? "Mindbody's record"}) — Journey holds their whole story.`,
      badge: `${years} ${years === 1 ? "year" : "years"}`,
      tone: "info",
    });
  }
  rows.sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name));
  return { rows, guessed, noDate };
}

/* ------------------------------------------------------------------ *
 * 4. MIA — the Journey's slipping and lapsed clients, as of today
 * ------------------------------------------------------------------ */

export const MIA_STATES: readonly JourneyState[] = ["drifting", "at-risk", "lapsed"];

export interface MiaRow extends MonthRow {
  state: JourneyState;
  /** The Journey's own sentence for her. */
  why: string;
}

export interface MonthMia {
  rows: MiaRow[];
  counts: Record<"drifting" | "at-risk" | "lapsed", number>;
  /** Clients the Journey can't judge: counted, never called fine. */
  unknown: number;
  /**
   * Clients Inactive today who went inactive in the month shown (past the
   * studio's line, or marked by a leader, that month; the inactive round,
   * Oct 1 2026). They are not MIA: the Inactive list is Clients → Journey's.
   */
  wentInactive: number;
}

const MIA_TONE: Record<string, MonthTone> = { drifting: "warn", "at-risk": "alert", lapsed: "warn" };

/**
 * Drifting first — the earliest line, the most catchable — then At risk,
 * then Lapsed; inside each, the most recently crossed first, because the
 * sooner she is caught the better. A client already answered (snoozed or
 * dismissed) keeps her place but says so.
 */
export function monthMia(entries: readonly JourneyEntry[], today: string, month: string = today.slice(0, 7)): MonthMia {
  const counts = { drifting: 0, "at-risk": 0, lapsed: 0 };
  let unknown = 0;
  let wentInactive = 0;
  const rows: MiaRow[] = [];
  for (const e of entries) {
    const state = e.journey.state;
    if (state === "unknown") {
      unknown += 1;
      continue;
    }
    if (state === "inactive") {
      const since = e.journey.inactive?.since ?? e.journey.since;
      if (since && since.slice(0, 7) === month) wentInactive += 1;
      continue;
    }
    if (!MIA_STATES.includes(state)) continue;
    counts[state as keyof typeof counts] += 1;
    const answered = e.watch === "snoozed" ? "snoozed" : e.watch === "dismissed" ? "dismissed: someone knows why" : null;
    const usual = e.usual ? (e.usualInToday ? `${e.usual.name} is in today, ${e.usualInToday}` : `usually with ${e.usual.name}`) : null;
    rows.push({
      key: `mia:${e.id}`,
      clientId: e.id,
      name: e.row.name.display,
      day: e.journey.since ?? today,
      state,
      why: e.journey.why,
      sentence: e.journey.why,
      proof: [e.journey.proof, usual, e.case.stored ? `${e.case.owner?.name ?? "Someone"} owns the case.` : null, answered].filter(Boolean).join(" · "),
      badge: STATE_NAMES[state],
      tone: MIA_TONE[state] ?? "warn",
    });
  }
  const order: Record<string, number> = { drifting: 0, "at-risk": 1, lapsed: 2 };
  rows.sort((a, b) => order[a.state] - order[b.state] || b.day.localeCompare(a.day) || a.name.localeCompare(b.name));
  return { rows, counts, unknown, wentInactive };
}

/* ------------------------------------------------------------------ *
 * The month in one sentence
 * ------------------------------------------------------------------ */

export interface MonthSummaryInput {
  month: string;
  today: string;
  renewals: MonthRenewals;
  birthdays: MonthBirthdays;
  anniversaries: MonthAnniversaries;
  /** Null until the Journey is ready. */
  mia: MonthMia | null;
}

/** "October: 6 renewals, 4 birthdays and 3 anniversaries. 5 clients are MIA today." */
export function monthSentence(i: MonthSummaryInput): string {
  const monthName = monthLabel(i.month).split(" ")[0];
  const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
  const parts = [n(i.renewals.rows.length, "renewal"), n(i.birthdays.rows.length, "birthday"), n(i.anniversaries.rows.length, "anniversary", "anniversaries")];
  const list = `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  const when = i.month < monthOf(i.today) ? " had" : i.month > monthOf(i.today) ? " will have" : " has";
  const mia = i.mia ? ` ${n(i.mia.rows.length, "client is", "clients are")} MIA today${i.mia.unknown > 0 ? `, and ${n(i.mia.unknown, "can't be judged yet", "can't be judged yet")}` : ""}.` : " The MIA list is still being worked out.";
  return `${monthName}${when} ${list}.${mia}`;
}

/** The rows of a list grouped by day, in day order, for a screen to draw with a heading per day. */
export function byDay<T extends MonthRow>(rows: readonly T[]): Array<{ day: string; rows: T[] }> {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const list = groups.get(r.day) ?? [];
    list.push(r);
    groups.set(r.day, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, list]) => ({ day, rows: list }));
}
