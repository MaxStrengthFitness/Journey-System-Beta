/**
 * A STUDIO'S MONTH, COUNTED BY THE NIGHT (speed round, Oct 5 2026; R27).
 *
 * Hours and Insights used to read the studio's raw sessions every time they
 * opened: a month (Hours) or up to ninety days (Insights) of whole session
 * documents, capped at 1,500 (sessions-range.ts). The cap is reached at about
 * 220 clients for a month and about 73 for Insights' ninety days, so a busy
 * studio's numbers were quietly cut, and the read was the slowest thing on
 * Operations.
 *
 * Now the nightly renewals job (server/month-tally-step.ts) reads each
 * studio's sessions ONCE, the same query the screens make (hosted at the
 * studio, by `createdAt`), and writes two documents per month for the
 * current month and the four before it:
 *
 *   studios/{s}/watch/hours-YYYY-MM     Hours' counts: per trainer, per week,
 *                                       sessions and the measured minutes.
 *                                       Small, so "All my studios" can read
 *                                       one per studio.
 *   studios/{s}/watch/sessions-YYYY-MM  every session of the month as one
 *                                       short line (its day, when it was
 *                                       logged, trainer, client, machines,
 *                                       minutes, five yes/no facts), which is
 *                                       everything Insights' sums, medians
 *                                       and distinct counts are made of.
 *
 * Both hold CLOSED DAYS only (up to the studio's yesterday when the job ran,
 * `throughDay`). The screen adds what came after with one small live read:
 * the studio's sessions logged since `liveFromMs`, less `lateIds` (the ones
 * the job already counted from that stretch). So today is always live, and
 * a past session logged today is counted today, never twice.
 *
 * The screens fall back to the raw read, as before, when a document is
 * missing, from an older run than last night's, or too big to write. A failed
 * read is unknown, never empty.
 *
 * Pure: the job and the screens both run these functions, so the counts can
 * never disagree with the raw read's. month-tally.test.ts.
 */
import type { WorkoutSession } from "../../../types";
import { addDays } from "../../client-history/model";
import {
  hoursTally,
  queryWindowForMonth,
  shiftMonth,
  type HoursCell,
  type HoursTally,
  type MonthKey,
  type TrainerHours,
} from "../hours/hours";
import { activeMinutes, hasFeel, hasNote, millis, sessionDay, trainerKeyOf, type TrainerNames } from "../insights/metrics";

export const MONTH_TALLY_VERSION = 1;

/**
 * The current month and the four before it: Insights' longest window is
 * ninety days, and a session logged up to two weeks late belongs to a month
 * before the window opens. Older months are read raw, as before.
 */
export const MONTHS_KEPT = 5;

/** The live read starts this long before the job's read began, so nothing logged during it falls between. */
export const LIVE_MARGIN_MS = 5 * 60_000;

/** A month's lines past this many bytes are not written; the screens read raw for that month. */
export const MAX_DIGEST_BYTES = 800_000;

export const hoursDocId = (month: MonthKey) => `hours-${month}`;
export const sessionsDocId = (month: MonthKey) => `sessions-${month}`;

/** The months the job writes on a night whose studio day is `today`, newest first. */
export function monthsKept(today: string): MonthKey[] {
  const current = today.slice(0, 7);
  return Array.from({ length: MONTHS_KEPT }, (_, i) => shiftMonth(current, -i));
}

/* ------------------------------------------------------------------ *
 * One session, as a line
 * ------------------------------------------------------------------ */

export interface DigestRow {
  id: string;
  /** The day it belongs to (`sessionDay`). */
  day: string;
  /** When it was logged (`createdAt`), in ms. */
  createdMs: number;
  trainerKey: string | null;
  clientId: string | null;
  completed: boolean;
  note: boolean;
  feel: boolean;
  cross: boolean;
  first: boolean;
  /** Measured minutes (`activeMinutes`) to the hundredth, or null. */
  minutes: number | null;
  machineIds: string[];
}

/** A session as the line the job keeps, or null when it has no day or no logged time. */
export function digestRow(id: string, s: WorkoutSession): DigestRow | null {
  const day = sessionDay(s);
  const createdMs = millis(s.createdAt);
  if (!day || createdMs === null) return null;
  const minutes = activeMinutes(s);
  return {
    id,
    day,
    createdMs,
    trainerKey: trainerKeyOf(s),
    clientId: typeof s.clientId === "string" && s.clientId ? s.clientId : null,
    completed: s.status === "Completed",
    note: hasNote(s),
    feel: hasFeel(s),
    cross: Boolean(s.isCrossTrain),
    first: s.sessionNumber === 1,
    minutes: minutes === null ? null : Math.round(minutes * 100) / 100,
    machineIds: Array.isArray(s.sessionMachineIds) ? s.sessionMachineIds.filter((m): m is string => typeof m === "string" && m !== "") : [],
  };
}

/**
 * A line back as a session the metrics read exactly as they read the real
 * one: the same day, logged time, trainer, client, status (only "Completed"
 * is ever asked about), note, feel, cross-train, first session, machines and
 * measured minutes.
 */
export function rowAsSession(r: DigestRow): WorkoutSession {
  const s: Record<string, unknown> = {
    id: r.id,
    date: r.day,
    createdAt: new Date(r.createdMs),
    status: r.completed ? "Completed" : "In-Progress",
    clientId: r.clientId ?? "",
    sessionMachineIds: r.machineIds,
  };
  if (r.trainerKey?.startsWith("initials:")) s.trainerInitials = r.trainerKey.slice("initials:".length);
  else if (r.trainerKey) s.trainerId = r.trainerKey;
  if (r.note) s.notes = "noted";
  if (r.feel) s.clientFeel = "recorded";
  if (r.cross) s.isCrossTrain = true;
  if (r.first) s.sessionNumber = 1;
  if (r.minutes !== null) {
    s.startTime = new Date(r.createdMs);
    s.endTime = new Date(r.createdMs + r.minutes * 60_000);
  }
  return s as unknown as WorkoutSession;
}

/* ------------------------------------------------------------------ *
 * The month's lines, as stored
 * ------------------------------------------------------------------ */

export interface SessionsMonthDoc {
  v: number;
  month: MonthKey;
  /** The last closed day counted: the studio's yesterday when the job ran. */
  throughDay: string;
  /** The live read starts here. */
  liveFromMs: number;
  /** Lines counted that were logged at or after `liveFromMs`: the live read leaves them out. */
  lateIds: string[];
  /** Lookup lists: a line names a trainer, a client and machines by their place in these. */
  trainers: string[];
  clients: string[];
  machines: string[];
  /** "day|logged(base 36 ms)|trainer|client|flags|minutes×100|machine.machine". */
  rows: string[];
  count: number;
  /** The lines were too long to keep; the screens read this month raw. */
  tooBig?: boolean;
}

const FLAG = { completed: 1, note: 2, feel: 4, cross: 8, first: 16 } as const;

/** One month's lines, encoded. `rows` must all be of that month and closed days. */
export function encodeMonth(
  month: MonthKey,
  rows: readonly DigestRow[],
  run: { throughDay: string; liveFromMs: number },
): SessionsMonthDoc {
  const index = () => {
    const list: string[] = [];
    const at = new Map<string, number>();
    return {
      list,
      of(v: string | null): string {
        if (v === null) return "";
        let i = at.get(v);
        if (i === undefined) {
          i = list.length;
          list.push(v);
          at.set(v, i);
        }
        return i.toString(36);
      },
    };
  };
  const trainers = index();
  const clients = index();
  const machines = index();
  const sorted = [...rows].sort((a, b) => a.createdMs - b.createdMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const lines = sorted.map((r) => {
    const flags =
      (r.completed ? FLAG.completed : 0) | (r.note ? FLAG.note : 0) | (r.feel ? FLAG.feel : 0) | (r.cross ? FLAG.cross : 0) | (r.first ? FLAG.first : 0);
    return [
      r.day,
      r.createdMs.toString(36),
      trainers.of(r.trainerKey),
      clients.of(r.clientId),
      flags.toString(36),
      r.minutes === null ? "" : Math.round(r.minutes * 100).toString(36),
      r.machineIds.map((m) => machines.of(m)).join("."),
    ].join("|");
  });
  return {
    v: MONTH_TALLY_VERSION,
    month,
    throughDay: run.throughDay,
    liveFromMs: run.liveFromMs,
    lateIds: sorted.filter((r) => r.createdMs >= run.liveFromMs).map((r) => r.id),
    trainers: trainers.list,
    clients: clients.list,
    machines: machines.list,
    rows: lines,
    count: lines.length,
  };
}

/** About how many bytes Firestore will hold for the document. */
export function approximateBytes(doc: SessionsMonthDoc): number {
  const strings = [...doc.rows, ...doc.trainers, ...doc.clients, ...doc.machines, ...doc.lateIds];
  return strings.reduce((n, s) => n + s.length + 1, 0) + 200;
}

/** The lines back, or null when the document isn't one this app can read. */
export function decodeMonth(raw: unknown): DigestRow[] | null {
  const d = raw as Partial<SessionsMonthDoc> | null | undefined;
  if (!d || d.v !== MONTH_TALLY_VERSION || d.tooBig || !Array.isArray(d.rows)) return null;
  const trainers = Array.isArray(d.trainers) ? d.trainers : [];
  const clients = Array.isArray(d.clients) ? d.clients : [];
  const machines = Array.isArray(d.machines) ? d.machines : [];
  const pick = (list: string[], code: string): string | null | undefined => {
    if (code === "") return null;
    return list[parseInt(code, 36)];
  };
  const out: DigestRow[] = [];
  for (let i = 0; i < d.rows.length; i += 1) {
    const parts = String(d.rows[i]).split("|");
    if (parts.length !== 7) return null;
    const [day, logged, t, c, f, m, ms] = parts;
    const flags = parseInt(f, 36);
    const trainerKey = pick(trainers, t);
    const clientId = pick(clients, c);
    const machineIds = ms === "" ? [] : ms.split(".").map((x) => pick(machines, x));
    if (trainerKey === undefined || clientId === undefined || machineIds.some((x) => typeof x !== "string")) return null;
    out.push({
      id: `${d.month}:${i}`,
      day,
      createdMs: parseInt(logged, 36),
      trainerKey,
      clientId,
      completed: Boolean(flags & FLAG.completed),
      note: Boolean(flags & FLAG.note),
      feel: Boolean(flags & FLAG.feel),
      cross: Boolean(flags & FLAG.cross),
      first: Boolean(flags & FLAG.first),
      minutes: m === "" ? null : parseInt(m, 36) / 100,
      machineIds: machineIds as string[],
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Hours' counts
 * ------------------------------------------------------------------ */

export interface HoursMonthDoc {
  v: number;
  month: MonthKey;
  throughDay: string;
  liveFromMs: number;
  lateIds: string[];
  /** By trainer key (an id, or "initials:XX"), in no order: names are the screen's. */
  trainers: Array<{ key: string; weeks: Record<string, number>; measuredSessions: number; measuredMinutes: number }>;
  unattributed: number;
  open: number;
}

/**
 * Hours' counts from a month's lines: `hoursTally` itself, over the lines
 * logged inside the month's window (a session logged more than two weeks
 * after its day isn't counted, as on the screen), with a slot of one minute
 * so a cell's minutes are its sessions.
 */
export function hoursMonthDoc(
  month: MonthKey,
  rows: readonly DigestRow[],
  run: { throughDay: string; liveFromMs: number; tz?: string },
): HoursMonthDoc {
  const window = queryWindowForMonth(month, run.tz);
  const inWindow = rows.filter((r) => r.createdMs >= window.startMs && r.createdMs <= window.endMs);
  const t = hoursTally(inWindow.map(rowAsSession), { month, sessionMinutes: 1 });
  return {
    v: MONTH_TALLY_VERSION,
    month,
    throughDay: run.throughDay,
    liveFromMs: run.liveFromMs,
    lateIds: inWindow.filter((r) => r.createdMs >= run.liveFromMs).map((r) => r.id).sort(),
    trainers: t.rows.map((row) => ({
      key: row.trainerKey,
      weeks: Object.fromEntries(Object.entries(row.weeks).map(([wk, cell]) => [wk, cell.sessions])),
      measuredSessions: row.measured.sessions,
      measuredMinutes: Math.round(row.measured.minutes * 100) / 100,
    })),
    unattributed: t.unattributed,
    open: t.open,
  };
}

/** Whether a stored Hours document can stand in for the raw read today. */
export function usableHoursDoc(raw: unknown, month: MonthKey, today: string): raw is HoursMonthDoc {
  const d = raw as Partial<HoursMonthDoc> | null | undefined;
  return Boolean(
    d &&
      d.v === MONTH_TALLY_VERSION &&
      d.month === month &&
      typeof d.throughDay === "string" &&
      d.throughDay >= addDays(today, -1) &&
      typeof d.liveFromMs === "number" &&
      Array.isArray(d.trainers) &&
      Array.isArray(d.lateIds),
  );
}

/** Whether a stored month of lines can stand in for the raw read today. */
export function usableSessionsDoc(raw: unknown, month: MonthKey, today: string): raw is SessionsMonthDoc {
  const d = raw as Partial<SessionsMonthDoc> | null | undefined;
  return Boolean(
    d &&
      d.v === MONTH_TALLY_VERSION &&
      d.month === month &&
      !d.tooBig &&
      typeof d.throughDay === "string" &&
      d.throughDay >= addDays(today, -1) &&
      typeof d.liveFromMs === "number" &&
      Array.isArray(d.rows) &&
      Array.isArray(d.lateIds),
  );
}

const EMPTY: HoursCell = { sessions: 0, minutes: 0 };
const add = (a: HoursCell | undefined, b: HoursCell | undefined): HoursCell => ({
  sessions: (a ?? EMPTY).sessions + (b ?? EMPTY).sessions,
  minutes: (a ?? EMPTY).minutes + (b ?? EMPTY).minutes,
});

/** The stored counts as the tally the Hours table draws, at this studio's slot and with these names. */
export function hoursTallyFromDoc(doc: HoursMonthDoc, opts: { sessionMinutes: number; names?: TrainerNames }): HoursTally {
  const base = hoursTally([], { month: doc.month, sessionMinutes: opts.sessionMinutes, names: opts.names });
  const names = opts.names ?? {};
  const slot = opts.sessionMinutes;
  const weekTotals: Record<string, HoursCell> = {};
  let month: HoursCell = EMPTY;
  const rows: TrainerHours[] = doc.trainers.map((t) => {
    const weeks: Record<string, HoursCell> = {};
    let total: HoursCell = EMPTY;
    for (const [wk, n] of Object.entries(t.weeks)) {
      const cell = { sessions: n, minutes: n * slot };
      weeks[wk] = cell;
      weekTotals[wk] = add(weekTotals[wk], cell);
      total = add(total, cell);
    }
    month = add(month, total);
    return {
      trainerKey: t.key,
      label: names[t.key] ?? (t.key.startsWith("initials:") ? t.key.slice("initials:".length) : "Unnamed trainer"),
      weeks,
      month: total,
      measured: { sessions: t.measuredSessions, minutes: t.measuredMinutes },
    };
  });
  return {
    ...base,
    rows: rows.sort((a, b) => a.label.localeCompare(b.label)),
    totals: { weeks: weekTotals, month },
    unattributed: doc.unattributed,
    open: doc.open,
  };
}

/** Two tallies of the same month and slot, added: the night's and the live read's. */
export function mergeHoursTallies(a: HoursTally, b: HoursTally): HoursTally {
  const byKey = new Map<string, TrainerHours>();
  for (const row of [...a.rows, ...b.rows]) {
    const had = byKey.get(row.trainerKey);
    if (!had) {
      byKey.set(row.trainerKey, { ...row, weeks: { ...row.weeks }, measured: { ...row.measured } });
      continue;
    }
    for (const [wk, cell] of Object.entries(row.weeks)) had.weeks[wk] = add(had.weeks[wk], cell);
    had.month = add(had.month, row.month);
    had.measured = { sessions: had.measured.sessions + row.measured.sessions, minutes: had.measured.minutes + row.measured.minutes };
  }
  const weekTotals: Record<string, HoursCell> = { ...a.totals.weeks };
  for (const [wk, cell] of Object.entries(b.totals.weeks)) weekTotals[wk] = add(weekTotals[wk], cell);
  return {
    ...a,
    rows: [...byKey.values()].sort((x, y) => x.label.localeCompare(y.label)),
    totals: { weeks: weekTotals, month: add(a.totals.month, b.totals.month) },
    unattributed: a.unattributed + b.unattributed,
    open: a.open + b.open,
  };
}

/**
 * The live read's sessions that the night didn't count: logged since
 * `liveFromMs` and not among the lines it already holds. Applies to every
 * month the night wrote in one run, so their `lateIds` are passed together.
 */
export function sessionsAfterTheNight<T extends { id?: string }>(live: readonly T[], lateIds: Iterable<string>): T[] {
  const seen = new Set(lateIds);
  return live.filter((s) => !s.id || !seen.has(s.id));
}

/** Hours for one studio and month: the night's counts plus the live sessions, each inside the month's window. */
export function hoursFromNightAndLive(
  doc: HoursMonthDoc,
  live: readonly WorkoutSession[],
  opts: { sessionMinutes: number; names?: TrainerNames; tz?: string },
): HoursTally {
  const window = queryWindowForMonth(doc.month, opts.tz);
  const fresh = sessionsAfterTheNight(live, doc.lateIds).filter((s) => {
    const at = millis(s.createdAt);
    return at !== null && at >= window.startMs && at <= window.endMs;
  });
  return mergeHoursTallies(
    hoursTallyFromDoc(doc, opts),
    hoursTally(fresh as WorkoutSession[], { month: doc.month, sessionMinutes: opts.sessionMinutes, names: opts.names }),
  );
}

/* ------------------------------------------------------------------ *
 * Insights' window
 * ------------------------------------------------------------------ */

/**
 * The months whose lines can hold a session logged inside Insights' window:
 * from the month two weeks before it opens (a late-logged session belongs to
 * its day) to the current one. Null when that reaches past what the night
 * keeps, so the screen reads raw.
 */
export function monthsForWindow(startMs: number, today: string, dayOf: (ms: number) => string): MonthKey[] | null {
  const from = addDays(dayOf(startMs), -14).slice(0, 7);
  const kept = monthsKept(today);
  const i = kept.indexOf(from);
  if (i < 0) return null;
  return kept.slice(0, i + 1);
}

/**
 * Insights' sessions from the night's lines and the live read: every line
 * logged inside the window, as a session the metrics read, and the live
 * sessions the night didn't hold. Null when the months aren't all from the
 * same night (the live read would then start in the wrong place).
 */
export function insightsSessions(
  docs: readonly SessionsMonthDoc[],
  live: readonly WorkoutSession[],
  window: { startMs: number; endMs: number },
): WorkoutSession[] | null {
  if (docs.length === 0) return null;
  const from = docs[0].liveFromMs;
  if (docs.some((d) => d.liveFromMs !== from)) return null;
  const out: WorkoutSession[] = [];
  const lateIds: string[] = [];
  for (const d of docs) {
    const rows = decodeMonth(d);
    if (!rows) return null;
    for (const r of rows) if (r.createdMs >= window.startMs && r.createdMs <= window.endMs) out.push(rowAsSession(r));
    lateIds.push(...d.lateIds);
  }
  for (const s of sessionsAfterTheNight(live, lateIds)) {
    const at = millis(s.createdAt);
    if (at !== null && at >= window.startMs && at <= window.endMs) out.push(s);
  }
  return out;
}
