/**
 * THE MACHINE MENU — the Staircase's one model (AJ, Oct 4 2026: Q1 (a), "ill
 * take all your recommended").
 *
 * Tapping a machine's name opens one card for that client on that machine,
 * in a session and on the profile alike, and its picture of how the client
 * has done is drawn from THIS model and nothing else, so the two doors can't
 * disagree. One column per Journey session that has a record on the machine
 * (performed, practice, skipped, not reached), oldest first; a session where
 * the machine wasn't on the plan gets no column.
 *
 * It absorbs two older pieces, whose rules it keeps:
 *   - equipment/progression.ts: performed sets only, one point per session at
 *     the heaviest performed load, the session's own day, and
 *     MIN_PROGRESSION_POINTS (below it a sentence, never a line);
 *   - journey-grid/machine-story.ts: the last counted set and the lightest and
 *     heaviest loads, without its "Started / Best / Lowest" words (nothing on
 *     the card ranks a set).
 *
 * The rules every reader of it inherits (docs/business/the-floor.md, and
 * docs/business/migration-and-prior-history.md):
 *   - Only a PERFORMED set moves the line or a count (lib/set-outcome.ts).
 *     Practice and blood flow keep their column, off the line; a skip keeps
 *     its column with its reason; not reached keeps its column.
 *   - Quality by exception: only 3 (max strength) and 1 (needs improvement)
 *     are marks. 2, or nothing, is plain — the grid's adapter fills a missing
 *     quality with 2, and so do the importer's defaults.
 *   - Holds are seconds, on their own; a one-side-at-a-time set keeps both
 *     sides. Nothing is averaged.
 *   - Counts come from the columns READ, never from a running total
 *     (`canQuoteLifetime`). The start wall is drawn only when every Journey
 *     session has been read.
 *   - A long gap is folded at the studio's own Drifting line (driftMultiple ×
 *     this machine's usual gap, never under driftMinDays; the studio settings
 *     registry names this file as a reader). Folding is geometry; calling the
 *     gap a break is a claim, made only through `canClaimGap`.
 *   - A set's settings snapshot is the saved settings at the time the set was
 *     written, not a measurement. An empty one ({}, the past-session form)
 *     is "not recorded" and never makes a set-up boundary.
 *
 * Nothing here suggests a weight. It never imports `progressionCue`.
 *
 * PURE — no React, no Firestore. Days are the studio's Eastern day.
 */
import type { MachineNote } from "../../types";
import type { JournalEntry } from "../../types/journal";
import { NO_WINDOW, canClaimGap, type OwnedWindow } from "../../lib/history-claims";
import { isBegunLog, isBloodFlow, type SetOutcome, type SkipReason } from "../../lib/set-outcome";
import { studioDayKeyOf, toDate } from "../../lib/studio-time";
import { assembleThreads, zoneOf } from "../client-notes/threads";
import { machineNoteWords, machineNotesFor } from "../equipment/machine-notes";
import { toIsoDate, toJourneySet, type LogLike } from "../journey-grid/adapters";
import { SETTING_BY_KEY } from "../studio-settings/registry";
import { isDialRow, labelKey, netChanges, placeRows, typedReason, type SettingPair, type SettingRow } from "./setting-history";
import { isSettingsCopy } from "./settings-copy";

/** Below this many counted sessions the card says a sentence and draws no line. */
export const MIN_PROGRESSION_POINTS = 2;

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

/** The session fields the model reads. A `WorkoutSession` fits. */
export interface TimelineSessionInput {
  id?: string;
  date?: string | null;
  sessionNumber?: number | null;
  trainerInitials?: string | null;
  trainerName?: string | null;
  hostedAtStudioId?: string | null;
  status?: string | null;
  sessionMachineIds?: readonly string[] | null;
}

/** The set fields the model reads. An `ExerciseLog` fits. */
export interface TimelineLogInput {
  id?: string;
  sessionId: string;
  machineId: string;
  studioId?: string | null;
  weight?: string | number | null;
  loadLb?: string | number | null;
  reps?: string | number | null;
  seconds?: string | number | null;
  isTSC?: boolean | null;
  isStaticHold?: boolean | null;
  repQuality?: number | null;
  side?: "Left" | "Right" | null;
  repsLeft?: number | null;
  repsRight?: number | null;
  outcome?: SetOutcome | null;
  bloodFlow?: boolean | null;
  skipReason?: string | null;
  skipNote?: string | null;
  machineSettings?: Record<string, string> | null;
  createdAt?: unknown;
  machineStartedAt?: unknown;
  machineEndedAt?: unknown;
  machineDurationSeconds?: number | null;
}

/** A dial on the machine: the storage key a snapshot uses, and the words it goes by. */
export interface TimelineField {
  key: string;
  label: string;
}

export type TimelineReadState = "loading" | "failed" | "cache-only" | "ready";

export interface TimelineInput {
  machineId: string;
  /**
   * The machine's name as the card shows it, or every name a settings copy
   * may have been written under (the floor's first, then the catalog's).
   */
  machineName: string | readonly string[];
  fields?: readonly TimelineField[];
  /**
   * The sessions whose sets were READ, in any order. Columns come only from
   * these, and so do the visits counted inside a gap: reading is by whole
   * sessions, newest first, so every session between two loaded columns is
   * itself loaded.
   */
  sessions: readonly TimelineSessionInput[];
  /** Their sets, any machine (other machines are ignored). */
  logs: readonly TimelineLogInput[];
  /** The studio day today (yyyy-mm-dd). */
  today: string;
  /** The session running on this iPad, when there is one. */
  runningSessionId?: string | null;
  /** The studio whose unit this is: a session hosted elsewhere is marked, never compared. */
  unitStudioId?: string | null;
  /** Every Journey session has been read: the start wall is drawn. */
  everythingRead: boolean;
  /** More sessions can be read (Load older). */
  moreToLoad: boolean;
  /** The machine's setting changes for this client, parsed; null while unread or when the read failed. */
  history: readonly SettingRow[] | null;
  /** The client's journal; null while unread or when the read failed. */
  journal: readonly JournalEntry[] | null;
  /** The old `clientMachineSettings.machineNotes` list, read for data written before the one list. */
  legacyNotes?: readonly MachineNote[] | null;
  /** The studio's Drifting line (`useStudioSettings`); the app's defaults when absent. */
  drift?: { multiple: number; minDays: number };
  /** The part of the timeline Journey owns (`ownedWindow`); nothing is claimable without one. */
  window?: OwnedWindow;
  readState?: TimelineReadState;
}

/* ------------------------------------------------------------------ *
 * Output
 * ------------------------------------------------------------------ */

export type ColumnMark = "max" | "poor" | null;

/** One side of a one-side-at-a-time set. */
export interface ColumnSide {
  side: "L" | "R";
  outcome: SetOutcome;
  weight: number | null;
  reps: number | null;
  seconds: number | null;
  mark: ColumnMark;
}

/** A performed set in the column, for the readout (two performed sets in a session are both said). */
export interface ColumnSet {
  weight: number | null;
  reps: number | null;
  seconds: number | null;
  mark: ColumnMark;
  side: "L" | "R" | null;
}

export interface TimelineColumn {
  index: number;
  sessionId: string;
  /** The session's studio day. */
  day: string;
  /** The session's stored number. Shown only through `sessionNumberTag`. */
  sessionNumber: number | null;
  trainerInitials: string | null;
  trainerName: string | null;
  /** Where the session was hosted. */
  studioId: string | null;
  /** Hosted at another studio than the unit's: marked, its settings never compared. */
  atOtherStudio: boolean;
  /** Where the machine came in the session's own order, when the session recorded one. */
  machineOrder: { position: number; of: number } | null;
  outcome: SetOutcome;
  /** Performed and before today: the only kind of column a count or the line reads. */
  counted: boolean;
  /**
   * The load the column draws: the heaviest performed load; for a practice
   * column its own load (drawn hollow, off the line); null for a skip, a
   * not-reached column, or a set with no load.
   */
  weight: number | null;
  /** The reps of the set that drives the column (null for a hold, or by side). */
  reps: number | null;
  /** Hold seconds, for a timed static contraction. */
  seconds: number | null;
  isHold: boolean;
  mark: ColumnMark;
  /** Both sides, for a one-side-at-a-time set. Never averaged. */
  sides: { L: ColumnSide | null; R: ColumnSide | null } | null;
  practice: "practice" | "bloodFlow" | null;
  skipReason: SkipReason | null;
  skipNote: string | null;
  /** Every performed set, heaviest first. */
  performedSets: ColumnSet[];
  /** The settings snapshot as saved with the set; null when none was recorded ({}). */
  settings: Record<string, string> | null;
  /** When the set was written (device or server time, ms), and that moment's studio day. */
  loggedAt: number | null;
  loggedDay: string | null;
  /** Today's session (or the one running): drawn, never counted. */
  isToday: boolean;
}

/** A long gap, folded. `index` is the column after it. */
export interface FoldInfo {
  index: number;
  days: number;
  fromDay: string;
  toDay: string;
  /** Sessions read inside the gap, on any machine: visits without this one. */
  visits: number;
  /** The gap began where Journey owns the timeline (`canClaimGap`). */
  claimable: boolean;
}

/** A set-up change, drawn at the left edge of column `index`. */
export interface SetupBoundary {
  index: number;
  /** What moved, from the history netted, else the snapshots' difference. */
  changes: SettingPair[];
  /** The reason a trainer typed, or null for none recorded. */
  reason: string | null;
  /** The history wasn't read, so the reason can't be told. */
  reasonUnread: boolean;
  trainerName: string | null;
  /** Saved on the day of this session, and which came first can't be told. */
  sameDay: boolean;
  fromHistory: boolean;
  fromSnapshot: boolean;
}

/** A run of columns with one set-up, between boundaries (an other-studio column inside it is drawn hatched). */
export interface SetupStretch {
  start: number;
  end: number;
  /** The snapshot the band says ("Seat 5 · Back pad 2", as saved), by label; null when none was recorded. */
  settings: { label: string; value: string }[] | null;
}

export type NoteLoudness = "standard" | "elevated" | "critical";

export type NotePlace =
  | { kind: "column"; index: number }
  /** Between column `after` and the next. */
  | { kind: "between"; after: number }
  /** After the newest column: the right edge. */
  | { kind: "edge" }
  /** Older than every column read: not drawn on the chart. */
  | { kind: "before" };

/** A note about the client on this machine, as the lane places it. Thread roots only; settings copies removed. */
export interface LaneNote {
  id: string;
  journalEntryId: string | null;
  loudness: NoteLoudness;
  resolved: boolean;
  authorName: string;
  /** The note's own words, without the machine name the journal copy carries. */
  words: string;
  day: string | null;
  place: NotePlace;
}

export interface TimelineModel {
  machineId: string;
  machineName: string;
  fields: readonly TimelineField[];
  columns: TimelineColumn[];
  /** Per column: the fold before it, or null. */
  foldAt: (FoldInfo | null)[];
  folds: FoldInfo[];
  /** The gap, in days, at which a fold is drawn. */
  foldThresholdDays: number;
  /** Per column: the set-up boundary at its left edge, or null. */
  boundaryAt: (SetupBoundary | null)[];
  boundaries: SetupBoundary[];
  stretches: SetupStretch[];
  notes: LaneNote[];
  /** The journal was read; false: the lane says notes couldn't be loaded. */
  notesRead: boolean;
  /** The setting changes were read; false: reasons read "reason couldn't be loaded". */
  historyRead: boolean;
  /** Performed sessions before today, in what was read. */
  counted: { count: number; firstDay: string | null; lastDay: string | null };
  /** Practice and blood flow columns before today. */
  practiceCount: number;
  /** The column for today's session, when it has a begun set. */
  todayIndex: number | null;
  /** The loaded history holds a timed hold / a set with reps (both: the hold row is drawn). */
  hasHolds: boolean;
  hasRepSets: boolean;
  /** The loaded history holds a set-up change: the Set-up lane is drawn. */
  setupLane: boolean;
  everythingRead: boolean;
  /** Drawn only when everything is read and there is something to draw. */
  startWall: boolean;
  moreToLoad: boolean;
  readState: TimelineReadState;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since an epoch for a yyyy-mm-dd key, by calendar arithmetic (no time zone involved). */
export function dayNumber(key: string): number {
  const m = DAY.exec(key);
  if (!m) return NaN;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/** Whole days from `a` to `b`. */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((x, y) => x - y);
  const h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const markOf = (q: unknown): ColumnMark => (q === 3 ? "max" : q === 1 ? "poor" : null);

const millisOf = (v: unknown): number | null => toDate(v as never)?.getTime() ?? null;

/** The app's own Drifting line, when a screen has no studio settings to give. */
export const DEFAULT_DRIFT = {
  multiple: SETTING_BY_KEY.driftMultiple.appDefault ?? 2,
  minDays: SETTING_BY_KEY.driftMinDays.appDefault ?? 7,
};

/**
 * The gap at which a fold is drawn: at least the studio's Drifting multiple
 * times this machine's median gap, never under its minimum. With fewer than
 * three gaps there is no usual gap to speak of, so twice the minimum.
 */
export function foldThreshold(gaps: readonly number[], drift = DEFAULT_DRIFT): number {
  if (gaps.length < 3) return 2 * drift.minDays;
  return Math.max(drift.minDays, drift.multiple * median(gaps));
}

/**
 * Does a set belong on the chart? Every set of a finished session does: Finish
 * stamped its outcome, a not-reached placeholder included. A session still in
 * progress (the one running, or one never finished) holds Start's seeded
 * placeholders — a weight and nothing else — and only a set someone worked
 * on (`isBegunLog`) is drawn from it.
 */
export function isDrawableLog(
  log: TimelineLogInput,
  session: Pick<TimelineSessionInput, "id" | "status">,
  runningSessionId?: string | null,
): boolean {
  const unfinished = session.id === runningSessionId || session.status === "In-Progress";
  return unfinished ? isBegunLog(log) : true;
}

function asLogLike(log: TimelineLogInput): LogLike {
  return {
    sessionId: log.sessionId,
    machineId: log.machineId,
    weight: log.weight ?? log.loadLb ?? undefined,
    reps: log.reps ?? undefined,
    seconds: log.seconds ?? undefined,
    isTSC: log.isTSC ?? undefined,
    isStaticHold: log.isStaticHold ?? undefined,
    repQuality: log.repQuality === 1 || log.repQuality === 2 || log.repQuality === 3 ? log.repQuality : undefined,
    side: log.side ?? undefined,
    outcome: log.outcome ?? undefined,
    bloodFlow: log.bloodFlow ?? undefined,
    skipReason: log.skipReason ?? undefined,
  };
}

interface ReadSet {
  log: TimelineLogInput;
  outcome: SetOutcome;
  weight: number | null;
  reps: number | null;
  seconds: number | null;
  isHold: boolean;
  mark: ColumnMark;
  side: "L" | "R" | null;
  bloodFlow: boolean;
  skipReason: SkipReason | null;
  at: number | null;
}

function readSet(log: TimelineLogInput): ReadSet | null {
  const set = toJourneySet(asLogLike(log));
  if (!set) return null;
  const weight = set.weight > 0 ? set.weight : null;
  return {
    log,
    outcome: set.outcome,
    weight: set.outcome === "skipped" || set.outcome === "not_reached" ? null : weight,
    reps: typeof set.reps === "number" ? set.reps : null,
    seconds: typeof set.seconds === "number" ? set.seconds : null,
    isHold: !!set.isTSC,
    mark: markOf(log.repQuality),
    side: set.side ?? null,
    bloodFlow: isBloodFlow(asLogLike(log)),
    skipReason: set.skipReason ?? null,
    at: millisOf(log.createdAt),
  };
}

/** Heavier first; at one load, more reps first; a hold (no count) after a counted set. */
function heavierFirst(a: ReadSet, b: ReadSet): number {
  const wa = a.weight ?? -1;
  const wb = b.weight ?? -1;
  if (wa !== wb) return wb - wa;
  return (b.isHold ? -1 : b.reps ?? -1) - (a.isHold ? -1 : a.reps ?? -1);
}

const sideOf = (s: ReadSet): ColumnSide => ({
  side: s.side as "L" | "R",
  outcome: s.outcome,
  weight: s.weight,
  reps: s.isHold ? null : s.reps,
  seconds: s.isHold ? s.seconds : null,
  mark: s.mark,
});

const settingsOf = (log: TimelineLogInput | undefined): Record<string, string> | null => {
  const s = log?.machineSettings;
  if (!s || typeof s !== "object") return null;
  const entries = Object.entries(s).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "");
  return entries.length ? Object.fromEntries(entries.map(([k, v]) => [k, String(v)])) : null;
};

/* ------------------------------------------------------------------ *
 * Columns
 * ------------------------------------------------------------------ */

function buildColumn(
  session: TimelineSessionInput & { id: string },
  day: string,
  logs: TimelineLogInput[],
  input: TimelineInput,
): Omit<TimelineColumn, "index"> | null {
  const sets = logs.map(readSet).filter((s): s is ReadSet => s !== null);
  if (sets.length === 0) return null;

  const performed = sets.filter((s) => s.outcome === "performed").sort(heavierFirst);
  const practice = sets.filter((s) => s.outcome === "practice").sort(heavierFirst);
  const skipped = sets.filter((s) => s.outcome === "skipped");
  const outcome: SetOutcome = performed.length
    ? "performed"
    : practice.length
      ? "practice"
      : skipped.length
        ? "skipped"
        : "not_reached";
  const lead = performed[0] ?? practice[0] ?? skipped[0] ?? sets[0];

  // One side at a time: two logs (Left, Right), or one log carrying both counts.
  const pick = (side: "L" | "R"): ReadSet | undefined => {
    const list = sets.filter((s) => s.side === side);
    return list.find((s) => s.outcome === "performed") ?? list[0];
  };
  const left = pick("L");
  const right = pick("R");
  let sides: TimelineColumn["sides"] = null;
  if (left || right) {
    sides = { L: left ? sideOf(left) : null, R: right ? sideOf(right) : null };
  } else if (num(lead.log.repsLeft) !== null || num(lead.log.repsRight) !== null) {
    const both = (side: "L" | "R", reps: number | null): ColumnSide | null =>
      reps === null ? null : { side, outcome: lead.outcome, weight: lead.weight, reps, seconds: null, mark: lead.mark };
    sides = { L: both("L", num(lead.log.repsLeft)), R: both("R", num(lead.log.repsRight)) };
  }

  const isToday = day === input.today || session.id === input.runningSessionId;
  const studioId = session.hostedAtStudioId || lead.log.studioId || null;
  const order = session.sessionMachineIds ?? null;
  const position = order ? order.indexOf(input.machineId) : -1;
  const shown = outcome === "performed" ? performed[0] : outcome === "practice" ? practice[0] : null;
  const loggedAt = sets.reduce<number | null>((m, s) => (s.at === null ? m : m === null ? s.at : Math.min(m, s.at)), null);

  return {
    sessionId: session.id,
    day,
    sessionNumber: typeof session.sessionNumber === "number" && Number.isFinite(session.sessionNumber) ? session.sessionNumber : null,
    trainerInitials: (session.trainerInitials ?? "").trim().replace(/^—$/, "").toUpperCase() || null,
    trainerName: session.trainerName?.trim() || null,
    studioId,
    atOtherStudio: !!(input.unitStudioId && studioId && studioId !== input.unitStudioId),
    machineOrder: order && position >= 0 ? { position: position + 1, of: order.length } : null,
    outcome,
    counted: outcome === "performed" && !isToday,
    weight: shown?.weight ?? null,
    reps: shown && !shown.isHold && !sides ? shown.reps : null,
    seconds: shown?.isHold ? shown.seconds : null,
    isHold: !!shown?.isHold,
    mark: shown?.mark ?? null,
    sides,
    practice: outcome === "practice" ? (practice.some((s) => s.bloodFlow) ? "bloodFlow" : "practice") : null,
    skipReason: outcome === "skipped" ? (skipped[0].skipReason ?? "unknown") : null,
    skipNote: outcome === "skipped" ? skipped.map((s) => s.log.skipNote?.trim()).find((t) => !!t) ?? null : null,
    performedSets: performed.map((s) => ({
      weight: s.weight,
      reps: s.isHold ? null : s.reps,
      seconds: s.isHold ? s.seconds : null,
      mark: s.mark,
      side: s.side,
    })),
    settings: settingsOf(lead.log),
    loggedAt,
    loggedDay: loggedAt === null ? null : studioDayKeyOf(new Date(loggedAt)),
    isToday,
  };
}

/** The columns, oldest first: every read session with a drawable set on this machine. */
export function buildColumns(input: TimelineInput): TimelineColumn[] {
  const sessions = new Map<string, TimelineSessionInput & { id: string }>();
  for (const s of input.sessions) if (s?.id) sessions.set(s.id, s as TimelineSessionInput & { id: string });

  const bySession = new Map<string, TimelineLogInput[]>();
  for (const log of input.logs) {
    if (!log || log.machineId !== input.machineId || !log.sessionId) continue;
    const session = sessions.get(log.sessionId);
    if (!session || !isDrawableLog(log, session, input.runningSessionId)) continue;
    const list = bySession.get(log.sessionId);
    if (list) list.push(log);
    else bySession.set(log.sessionId, [log]);
  }

  const out: Omit<TimelineColumn, "index">[] = [];
  for (const [id, logs] of bySession) {
    const session = sessions.get(id)!;
    const day = toIsoDate(session.date ?? "");
    if (!DAY.test(day)) continue;
    const col = buildColumn(session, day, logs, input);
    if (col) out.push(col);
  }
  out.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0) ||
      a.sessionId.localeCompare(b.sessionId),
  );
  return out.map((c, index) => ({ ...c, index }));
}

/* ------------------------------------------------------------------ *
 * Folds
 * ------------------------------------------------------------------ */

function buildFolds(
  columns: readonly TimelineColumn[],
  input: TimelineInput,
): { foldAt: (FoldInfo | null)[]; threshold: number } {
  const gaps: number[] = [];
  for (let i = 1; i < columns.length; i++) gaps.push(daysBetween(columns[i - 1].day, columns[i].day));
  const threshold = foldThreshold(gaps, input.drift ?? DEFAULT_DRIFT);
  const days = input.sessions
    .filter((s) => !!s?.id)
    .map((s) => toIsoDate(s.date ?? ""))
    .filter((d) => DAY.test(d));
  const window = input.window ?? NO_WINDOW;
  const foldAt = columns.map((c, i): FoldInfo | null => {
    if (i === 0) return null;
    const gap = gaps[i - 1];
    if (!(gap >= threshold)) return null;
    const fromDay = columns[i - 1].day;
    return {
      index: i,
      days: gap,
      fromDay,
      toDay: c.day,
      visits: days.filter((d) => d > fromDay && d < c.day).length,
      claimable: canClaimGap(fromDay, window),
    };
  });
  return { foldAt, threshold };
}

/* ------------------------------------------------------------------ *
 * Set-up stretches
 * ------------------------------------------------------------------ */

type Snapshot = Map<string, { label: string; value: string }>;

function snapshotOf(col: TimelineColumn, fields: readonly TimelineField[]): Snapshot | null {
  if (!col.settings) return null;
  const out: Snapshot = new Map();
  for (const [key, value] of Object.entries(col.settings)) {
    const label = fields.find((f) => f.key === key)?.label ?? key;
    out.set(labelKey(label), { label, value: value.trim() });
  }
  return out;
}

function diffSnapshots(a: Snapshot, b: Snapshot): SettingPair[] {
  const keys = new Set([...a.keys(), ...b.keys()]);
  const out: SettingPair[] = [];
  for (const k of keys) {
    const from = a.get(k)?.value ?? "";
    const to = b.get(k)?.value ?? "";
    if (from !== to) out.push({ label: b.get(k)?.label ?? a.get(k)?.label ?? k, from, to });
  }
  return out;
}

const brings = (changes: readonly SettingPair[], target: readonly SettingPair[]): boolean =>
  target.every((t) => changes.some((c) => labelKey(c.label) === labelKey(t.label) && c.to === t.to));

function reasonFrom(rows: readonly SettingRow[]): { reason: string | null; trainerName: string | null } {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = typedReason(rows[i]);
    if (r) return { reason: r, trainerName: rows[i].trainerName };
  }
  const last = rows[rows.length - 1];
  return { reason: null, trainerName: last?.trainerName ?? null };
}

function buildSetup(
  columns: readonly TimelineColumn[],
  input: TimelineInput,
  fields: readonly TimelineField[],
): { boundaryAt: (SetupBoundary | null)[]; stretches: SetupStretch[] } {
  const n = columns.length;
  const historyRead = input.history !== null;
  const rows = (input.history ?? []).filter(isDialRow);
  const rowsByGap: SettingRow[][] = Array.from({ length: n + 1 }, () => []);
  const unsureAt: boolean[] = Array.from({ length: n + 1 }, () => false);
  for (const p of placeRows(rows, columns)) {
    rowsByGap[p.gap].push(p.row);
    if (p.sameDayUnsure) unsureAt[p.gap] = true;
  }

  const boundaries = new Map<number, SetupBoundary>();
  const snaps = columns.map((c) => snapshotOf(c, fields));
  const comparable = columns.filter((c) => !c.atOtherStudio).map((c) => c.index);

  let prev = -1;
  let prevPrev = -1;
  let lastSnapIdx = -1;
  /** Per column: the last column before it with a snapshot (-1 for none). */
  const snapBefore = new Map<number, number>();
  for (const idx of comparable) {
    snapBefore.set(idx, lastSnapIdx);
    const snap = snaps[idx];
    let here: SettingRow[] = [];
    if (prev >= 0) for (let g = prev + 1; g <= idx; g++) here = here.concat(rowsByGap[g]);
    let historyPairs = prev >= 0 ? netChanges(here) : [];

    // The set before already shows what these rows changed to: the change
    // was made during that session, after its set was first written (Start
    // writes it), and the tracker re-saves the snapshot with every set. It is
    // that session's change, drawn once, before it.
    const prevSnap = prev >= 0 ? snaps[prev] : null;
    if (historyPairs.length && prevSnap && historyPairs.every((p) => (prevSnap.get(labelKey(p.label))?.value ?? "") === p.to)) {
      const at = boundaries.get(prev);
      if (at) {
        const why = reasonFrom(here);
        boundaries.set(prev, { ...at, fromHistory: true, reason: at.reason ?? why.reason, trainerName: at.trainerName ?? why.trainerName });
      } else if (prevPrev >= 0 && (snapBefore.get(prev) ?? -1) < 0) {
        // Only where no earlier snapshot says otherwise: had one shown the
        // same set-up, the rows would contradict the sets, and the card
        // draws nothing it can't stand behind.
        boundaries.set(prev, {
          index: prev,
          changes: historyPairs,
          ...reasonFrom(here),
          reasonUnread: false,
          sameDay: false,
          fromHistory: true,
          fromSnapshot: false,
        });
      }
      historyPairs = [];
    }

    const lastSnap = lastSnapIdx >= 0 ? snaps[lastSnapIdx] : null;
    const snapDiff = snap && lastSnap ? diffSnapshots(lastSnap, snap) : [];
    let snapPairs = snapDiff;
    if (snapPairs.length) {
      for (const [bi, b] of boundaries) {
        if (bi > lastSnapIdx && bi < idx && brings(b.changes, snapPairs)) {
          snapPairs = [];
          break;
        }
      }
    }

    if (historyPairs.length || snapPairs.length) {
      // The reason for a change the snapshots show: the rows between the two
      // snapshots, when what they netted to is what the snapshot now says.
      let why = reasonFrom(here);
      if (!historyPairs.length) {
        let between: SettingRow[] = [];
        for (let g = lastSnapIdx + 1; g <= idx; g++) between = between.concat(rowsByGap[g]);
        why = brings(netChanges(between), snapPairs) ? reasonFrom(between) : { reason: null, trainerName: null };
      }
      boundaries.set(idx, {
        index: idx,
        changes: historyPairs.length ? historyPairs : snapPairs,
        reason: why.reason,
        trainerName: why.trainerName,
        reasonUnread: !historyRead,
        sameDay: historyPairs.length > 0 && unsureAt[idx],
        fromHistory: historyPairs.length > 0,
        fromSnapshot: snapDiff.length > 0,
      });
    }

    if (snap) lastSnapIdx = idx;
    prevPrev = prev;
    prev = idx;
  }

  const boundaryAt: (SetupBoundary | null)[] = columns.map((c) => boundaries.get(c.index) ?? null);
  const stretches: SetupStretch[] = [];
  let start = 0;
  for (let i = 1; i <= n; i++) {
    if (i === n || boundaryAt[i]) {
      if (n > 0) {
        const own = snaps.slice(start, i).find((s, k) => s && !columns[start + k].atOtherStudio) ?? null;
        stretches.push({ start, end: i - 1, settings: own ? [...own.values()] : null });
      }
      start = i;
    }
  }
  return { boundaryAt, stretches };
}

/* ------------------------------------------------------------------ *
 * Notes
 * ------------------------------------------------------------------ */

function placeNote(
  columns: readonly TimelineColumn[],
  sessionId: string | null | undefined,
  sessionDay: string | null | undefined,
  day: string | null,
): NotePlace {
  if (sessionId) {
    const c = columns.find((col) => col.sessionId === sessionId);
    if (c) return { kind: "column", index: c.index };
  }
  if (columns.length === 0) return { kind: "edge" };
  const d = (sessionDay && DAY.test(sessionDay) ? sessionDay : null) ?? day;
  if (!d) return { kind: "before" };
  const same = columns.find((col) => col.day === d);
  if (same) return { kind: "column", index: same.index };
  if (d < columns[0].day) return { kind: "before" };
  let after = 0;
  for (let i = 0; i < columns.length; i++) if (columns[i].day < d) after = i;
  return after >= columns.length - 1 ? { kind: "edge" } : { kind: "between", after };
}

function buildNotes(columns: readonly TimelineColumn[], input: TimelineInput, names: readonly string[]): LaneNote[] {
  const name = names[0] ?? "";
  const journal = input.journal;
  const out: LaneNote[] = [];

  if (journal) {
    const onMachine = journal.filter(
      (e) => e && e.machineId === input.machineId && !e.isArchived && (e.body ?? "").trim() !== "" && !isSettingsCopy(e, input.history, names),
    );
    for (const thread of assembleThreads(onMachine)) {
      const root = thread.root;
      const day = studioDayKeyOf(root.occurredAt ?? null);
      out.push({
        id: `journal:${root.id}`,
        journalEntryId: root.id,
        loudness: root.importance === "critical" || root.importance === "elevated" ? root.importance : "standard",
        resolved: zoneOf(thread, input.today) === "resolved",
        authorName: root.authorName ?? "",
        words: machineNoteWords(root.body, name),
        day,
        place: placeNote(columns, root.sessionId, root.sessionDay, day),
      });
    }
  }

  // The old list, for notes written before the journal held them all
  // (machine-notes.ts): only the ones with no journal copy. A "flag for
  // maintenance" there filed as Critical, as its journal copy would have.
  const legacy = machineNotesFor({
    machineId: input.machineId,
    machineName: name,
    legacy: input.legacyNotes ?? [],
    journal: journal ? journal.filter((e) => e && e.machineId === input.machineId) : null,
  }).filter((v) => !v.journalEntryId);
  for (const v of legacy) {
    const day = v.timestamp ? studioDayKeyOf(v.timestamp) : null;
    out.push({
      id: `legacy:${v.id ?? v.timestamp}`,
      journalEntryId: null,
      loudness: v.isImportant ? "critical" : "standard",
      resolved: false,
      authorName: v.authorName ?? "",
      words: machineNoteWords(v.content ?? "", name),
      day,
      place: placeNote(columns, null, null, day),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The model
 * ------------------------------------------------------------------ */

export function buildTimelineModel(input: TimelineInput): TimelineModel {
  const names = (typeof input.machineName === "string" ? [input.machineName] : [...input.machineName]).filter((n) => !!n?.trim());
  const fields = input.fields ?? [];
  const columns = buildColumns(input);
  const { foldAt, threshold } = buildFolds(columns, input);
  const { boundaryAt, stretches } = buildSetup(columns, input, fields);
  const counted = columns.filter((c) => c.counted);
  const today = columns.findIndex((c) => c.isToday);
  const boundaries = boundaryAt.filter((b): b is SetupBoundary => b !== null);

  return {
    machineId: input.machineId,
    machineName: names[0] ?? "",
    fields,
    columns,
    foldAt,
    folds: foldAt.filter((f): f is FoldInfo => f !== null),
    foldThresholdDays: threshold,
    boundaryAt,
    boundaries,
    stretches,
    notes: buildNotes(columns, input, names),
    notesRead: input.journal !== null,
    historyRead: input.history !== null,
    counted: {
      count: counted.length,
      firstDay: counted[0]?.day ?? null,
      lastDay: counted[counted.length - 1]?.day ?? null,
    },
    practiceCount: columns.filter((c) => c.outcome === "practice" && !c.isToday).length,
    todayIndex: today >= 0 ? columns[today].index : null,
    hasHolds: columns.some((c) => c.outcome === "performed" && c.isHold),
    hasRepSets: columns.some((c) => c.outcome === "performed" && !c.isHold),
    setupLane: boundaries.length > 0,
    everythingRead: input.everythingRead,
    startWall: input.everythingRead && columns.length > 0,
    moreToLoad: input.moreToLoad,
    readState: input.readState ?? "ready",
  };
}

/* ------------------------------------------------------------------ *
 * Reads over the model (what machine-story.ts used to answer)
 * ------------------------------------------------------------------ */

/** The newest counted column (the header's "Last time" before today), or null. */
export function lastCounted(model: Pick<TimelineModel, "columns">): TimelineColumn | null {
  for (let i = model.columns.length - 1; i >= 0; i--) if (model.columns[i].counted) return model.columns[i];
  return null;
}

/** The newest column before today, whatever happened in it, or null. */
export function newestBeforeToday(model: Pick<TimelineModel, "columns">): TimelineColumn | null {
  for (let i = model.columns.length - 1; i >= 0; i--) if (!model.columns[i].isToday) return model.columns[i];
  return null;
}

/** The lightest and heaviest performed loads among the given columns (all of them by default). */
export function loadRange(columns: readonly TimelineColumn[]): { lightest: number; heaviest: number } | null {
  const loads = columns.filter((c) => c.outcome === "performed" && c.weight !== null).map((c) => c.weight as number);
  if (loads.length === 0) return null;
  return { lightest: Math.min(...loads), heaviest: Math.max(...loads) };
}

/** Is there enough to draw a line? Counted columns at or past MIN_PROGRESSION_POINTS. */
export function canDrawLine(model: Pick<TimelineModel, "counted">): boolean {
  return model.counted.count >= MIN_PROGRESSION_POINTS;
}
