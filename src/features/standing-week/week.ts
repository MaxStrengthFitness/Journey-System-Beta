/**
 * THE STANDING WEEK — a trainer's usual week at a studio (voice-review round,
 * Sep 27 2026; docs/rounds/2026-09-27-standing-week.md is the round).
 *
 * The hours they work and their regulars ("Judy, Monday 8:00"). The trainer
 * PROPOSES it on My Profile; a studio leader AGREES it on My Studio → Team.
 * Journey checks the coming week's Mindbody bookings against the agreed week
 * (check.ts) and never writes to Mindbody: the front desk books the regulars,
 * as recurring appointments, exactly as before.
 *
 * Every time is the studio's own wall clock, "HH:MM", and every day a weekday
 * 0–6 (0 = Sunday, as `weekdayOf` reports it). Nothing here knows an instant:
 * the week is the same week on the day the clocks change.
 *
 * AWAY (voice review follow-up, Sep 27 2026). AJ: "if someone has a vacation
 * then it should block it out." A list of studio days the trainer is away,
 * `away: [{ id, from, to, note }]`, beside the week rather than inside it: it
 * needs no agreement, so the trainer sets it on My Profile and a leader on
 * Team, and a trainer with no proposal can still set it. The week check
 * skips the trainer's slots on those days. Journey's own: nothing about it
 * goes to Mindbody.
 *
 * PURE MODULE.
 */

export interface WorkHours {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** "HH:MM", the studio's clock. */
  from: string;
  to: string;
}

export interface Regular {
  /** Stable within the week, so an edit keeps its row. */
  id: string;
  weekday: number;
  /** "HH:MM", the studio's clock. */
  start: string;
  clientId: string;
  /** As the trainer chose it; the client's record is the truth. */
  clientName: string;
}

export interface StandingWeek {
  hours: WorkHours[];
  regulars: Regular[];
  note?: string;
}

/** Days away, both ends included: studio days, "YYYY-MM-DD". */
export interface AwayRange {
  /** Stable within the list, so a remove finds its row. */
  id: string;
  from: string;
  to: string;
  note?: string;
}

export interface StandingWeekDoc {
  /** The document id: the trainer's Auth uid. */
  id: string;
  studioId: string;
  trainerUid: string;
  /** trainers/{id} — what a booking's `trainerId` carries. */
  trainerId: string;
  trainerName: string;
  proposed: StandingWeek | null;
  proposedAt?: unknown;
  proposedBy?: { id: string; name: string } | null;
  final: StandingWeek | null;
  finalAt?: unknown;
  finalBy?: { id: string; name: string } | null;
  /** Days away, earliest first. Always set by normalizeDoc; optional so a hand-built doc may leave it out. */
  away?: AwayRange[];
}

/** The rules hold the same limits (firestore.rules, standingWeekValid). */
export const MAX_HOURS = 14;
export const MAX_REGULARS = 80;
export const MAX_NOTE = 500;
/**
 * Six ranges still to come at a time: the rules check each one, and a
 * request may evaluate only so many expressions (firestore.rules,
 * standingWeekAwayValid). Past ranges drop off as it saves.
 */
export const MAX_AWAY = 6;
export const MAX_AWAY_NOTE = 200;

export const EMPTY_WEEK: StandingWeek = { hours: [], regulars: [] };

/** Monday first, the way a studio's week reads; Sunday last. */
export const WEEKDAYS_IN_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];
export const WEEKDAY_NAME: readonly string[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAY_SHORT: readonly string[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isClock(v: unknown): v is string {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/** Minutes since the studio's midnight, or null for anything that isn't "HH:MM". */
export function minutesOf(clock: string): number | null {
  if (!isClock(clock)) return null;
  return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
}

export function clockOf(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

const isWeekday = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6;
const order = (weekday: number) => WEEKDAYS_IN_ORDER.indexOf(weekday);

/**
 * A week as stored, made safe to read: anything malformed is left out rather
 * than guessed, hours that end before they start are dropped, and both lists
 * come back Monday first, earliest first, held to the rules' limits.
 */
export function normalizeWeek(raw: unknown): StandingWeek {
  const w = (raw ?? {}) as { hours?: unknown; regulars?: unknown; note?: unknown };
  const hours = (Array.isArray(w.hours) ? w.hours : [])
    .filter((h): h is WorkHours => {
      const x = h as Partial<WorkHours> | null;
      return !!x && isWeekday(x.weekday) && isClock(x.from) && isClock(x.to) && minutesOf(x.from)! < minutesOf(x.to)!;
    })
    .map((h) => ({ weekday: h.weekday, from: h.from, to: h.to }))
    .sort((a, b) => order(a.weekday) - order(b.weekday) || minutesOf(a.from)! - minutesOf(b.from)!)
    .slice(0, MAX_HOURS);
  const regulars = (Array.isArray(w.regulars) ? w.regulars : [])
    .filter((r): r is Regular => {
      const x = r as Partial<Regular> | null;
      return !!x && typeof x.id === "string" && x.id !== "" && isWeekday(x.weekday) && isClock(x.start) && typeof x.clientId === "string" && x.clientId !== "";
    })
    .map((r) => ({ id: r.id, weekday: r.weekday, start: r.start, clientId: r.clientId, clientName: typeof r.clientName === "string" ? r.clientName.slice(0, 120) : "" }))
    .sort((a, b) => order(a.weekday) - order(b.weekday) || minutesOf(a.start)! - minutesOf(b.start)! || a.clientName.localeCompare(b.clientName))
    .slice(0, MAX_REGULARS);
  const note = typeof w.note === "string" ? w.note.trim().slice(0, MAX_NOTE) : "";
  return { hours, regulars, ...(note ? { note } : {}) };
}

export function isDateKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v);
}

/**
 * Days away as stored, made safe to read: a range with a bad date, or one
 * that ends before it starts, is left out rather than guessed; earliest
 * first, held to the rules' limits.
 */
export function normalizeAway(raw: unknown): AwayRange[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((r): r is AwayRange => {
      const x = r as Partial<AwayRange> | null;
      return !!x && typeof x.id === "string" && x.id !== "" && isDateKey(x.from) && isDateKey(x.to) && x.from <= x.to;
    })
    .map((r) => {
      const note = typeof r.note === "string" ? r.note.trim().slice(0, MAX_AWAY_NOTE) : "";
      return { id: r.id.slice(0, 40), from: r.from, to: r.to, ...(note ? { note } : {}) };
    })
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
    .slice(0, MAX_AWAY);
}

/** The ranges that haven't ended by `today`: the only ones a screen shows. */
export function upcomingAway(away: readonly AwayRange[] | null | undefined, today: string): AwayRange[] {
  return normalizeAway(away ?? []).filter((r) => r.to >= today);
}

/** The range that covers `dateKey`, if the trainer is away that day. */
export function awayOn(away: readonly AwayRange[] | null | undefined, dateKey: string): AwayRange | null {
  return (away ?? []).find((r) => r.from <= dateKey && dateKey <= r.to) ?? null;
}

/**
 * Days away ready to write: past ranges dropped (only today and after are
 * shown, so nobody could remove them), no undefined anywhere.
 */
export function awayForWrite(away: readonly AwayRange[], today: string): AwayRange[] {
  return upcomingAway(away, today).map((r) => ({ id: r.id, from: r.from, to: r.to, ...(r.note ? { note: r.note } : {}) }));
}

/** A new range's id: unique within the list. */
export function newAwayId(existing: readonly AwayRange[], seed = Date.now()): string {
  const taken = new Set(existing.map((r) => r.id));
  let n = seed % 1_000_000;
  let id = `a${n.toString(36)}`;
  while (taken.has(id)) {
    n += 1;
    id = `a${n.toString(36)}`;
  }
  return id;
}

/** A stored document, made safe to read. */
export function normalizeDoc(id: string, raw: unknown): StandingWeekDoc {
  const d = (raw ?? {}) as Partial<StandingWeekDoc>;
  return {
    id,
    studioId: typeof d.studioId === "string" ? d.studioId : "",
    trainerUid: typeof d.trainerUid === "string" ? d.trainerUid : id,
    trainerId: typeof d.trainerId === "string" ? d.trainerId : "",
    trainerName: typeof d.trainerName === "string" ? d.trainerName : "",
    proposed: d.proposed ? normalizeWeek(d.proposed) : null,
    proposedAt: d.proposedAt ?? null,
    proposedBy: d.proposedBy ?? null,
    final: d.final ? normalizeWeek(d.final) : null,
    finalAt: d.finalAt ?? null,
    finalBy: d.finalBy ?? null,
    away: normalizeAway(d.away),
  };
}

/** Two weeks say the same thing (row ids and order aside). */
export function sameWeek(a: StandingWeek | null, b: StandingWeek | null): boolean {
  if (!a || !b) return a === b;
  const x = normalizeWeek(a);
  const y = normalizeWeek(b);
  const hours = (w: StandingWeek) => w.hours.map((h) => `${h.weekday} ${h.from}-${h.to}`).join("|");
  const regulars = (w: StandingWeek) => w.regulars.map((r) => `${r.weekday} ${r.start} ${r.clientId}`).join("|");
  return hours(x) === hours(y) && regulars(x) === regulars(y) && (x.note ?? "") === (y.note ?? "");
}

/**
 * Where a trainer's week stands:
 *   none      nothing proposed, nothing agreed
 *   proposed  a proposal a leader hasn't agreed yet
 *   agreed    agreed, and the proposal (if any) says the same
 *   changed   agreed, but the trainer has proposed something different since
 */
export type WeekStatus = "none" | "proposed" | "agreed" | "changed";

export function weekStatus(doc: Pick<StandingWeekDoc, "proposed" | "final"> | null | undefined): WeekStatus {
  if (!doc || (!doc.proposed && !doc.final)) return "none";
  if (!doc.final) return "proposed";
  if (!doc.proposed || sameWeek(doc.proposed, doc.final)) return "agreed";
  return "changed";
}

/** "4 days · 9 regulars", or what is missing. Counts with the thing counted. */
export function weekSummary(week: StandingWeek | null): string {
  if (!week) return "No week yet";
  const days = new Set(week.hours.map((h) => h.weekday)).size;
  const regulars = week.regulars.length;
  if (days === 0 && regulars === 0) return "An empty week";
  const parts = [
    days > 0 ? `${days} ${days === 1 ? "day" : "days"}` : "no hours set",
    `${regulars} ${regulars === 1 ? "regular" : "regulars"}`,
  ];
  return parts.join(" · ");
}

/** A week ready to write: normalized, no undefined anywhere (Firestore refuses it). */
export function weekForWrite(week: StandingWeek): StandingWeek {
  const w = normalizeWeek(week);
  return { hours: w.hours, regulars: w.regulars, ...(w.note ? { note: w.note } : {}) };
}

/** A new regular's id: unique within the week, stable once written. */
export function newRegularId(existing: readonly Regular[], seed = Date.now()): string {
  const taken = new Set(existing.map((r) => r.id));
  let n = seed % 1_000_000;
  let id = `r${n.toString(36)}`;
  while (taken.has(id)) {
    n += 1;
    id = `r${n.toString(36)}`;
  }
  return id;
}
