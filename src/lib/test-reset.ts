/**
 * THE PRE-LAUNCH RESET: what to delete and what to clear (Oct 10 2026).
 *
 * AJ, Oct 7 2026: "any session currently in journey will be wiped before we
 * enter into beta". Every session in production is test data. Before the
 * corporate studios launch, the sessions go, and so does everything that was
 * built from them; clients, bookings, contracts, studios, machines, rosters,
 * routine presets and trainers stay. `scripts/reset-test-data.ts` reads the
 * database and does the writes; THIS file decides, from plain document data,
 * which documents go and which fields change, so the decision is tested
 * without a database. The runbook is docs/ops/RESET-BEFORE-LAUNCH.md.
 *
 * It is not the old purge script (which deleted clients, studios and
 * trainers): it never deletes a client, a trainer or a studio.
 *
 * THE GROUPS. `core` always runs. The optional groups are AJ's call at run
 * time (`--also settings,routines`), and the dry run counts every one of them
 * so he decides with numbers. `GROUP_WORDS` says what each holds.
 *
 * WHAT TIES A RECORD TO A SESSION (read from the code, Oct 10 2026):
 *   - a note (journalEntries) or FORD detail carries the session's id, or a
 *     session-time origin (a note written in a session's machine menu can have
 *     the origin and no id). A note whose session is ALREADY gone counts too:
 *     Discard and History's delete leave a session's notes behind.
 *   - a thread update hangs off its root by `threadId`, and an update can
 *     hang off an update, so the updates of a deleted root are followed down
 *     to the last one (never up: a deleted update keeps its root).
 *   - on a client the sessions TOUCHED (a session or set of hers goes, a
 *     machine map holds something, or a counter only a session moves does):
 *     the counters every Finish moves (lib/sync-utils.ts), back to what a
 *     new client is made with (COUNTERS_AS_CREATED); the snapshot's last
 *     visit and coach (RENEWAL_SESSION_FIELDS); a "sessions before Journey"
 *     the profile's Confirm made after a test session.
 *   - on any client, with a date in the test sessions' time (from the day
 *     before the first was written; a re-run reads that day from the earlier
 *     run's backup): the first-session date Start wrote (not one typed on
 *     the old form), a first visit backfilled from sessions; and Journey's
 *     own last-session day, a prospect's consultation a Finish marked done,
 *     the machine maps still on the client, the FORD summary (worked out
 *     again from what is left whenever it no longer matches), the leaders'
 *     Seen marks and trainers' "no need to remind me" on the notes that go.
 *
 * WHAT IS KEPT unless AJ asks: sessions imported from paper charts or
 * FileMaker (they are history, not tests: `imported-history`), FORD details
 * caught in the briefing (no session id: `ford-briefing`), old-style
 * session notes with no session (they read as profile notes), and Demo Mode
 * (its own Reset button; `--include-demo`). A record tied to a kept session
 * is kept with it.
 *
 * NEVER a whole client written back: a client keeps every field the reset
 * doesn't name, and a change is a field write (a delete, a counter back to
 * its first value, the FORD summary set again).
 */

import { DEMO_STUDIO_ID } from "../features/demo-mode/constants";
import { isDemoRecord } from "../features/demo-mode/is-demo";
import { fordStudioIdOf, summariseFord } from "../features/ford/ford-rollup";
import type { ClientFordSummary, FordEntry } from "../features/ford/types";
import type { Client } from "../types";
import { priorUncounted, type PriorHistory } from "./prior-history";

/* ------------------------------------------------------------------ *
 * Groups and parts
 * ------------------------------------------------------------------ */

export type GroupId =
  | "core"
  | "imported-history"
  | "ford-briefing"
  | "settings"
  | "settings-all"
  | "setting-history"
  | "routines"
  | "pulse"
  | "floor-notes"
  | "prior-history"
  | "operations";

export const OPTIONAL_GROUPS: readonly GroupId[] = [
  "imported-history",
  "ford-briefing",
  "settings",
  "settings-all",
  "setting-history",
  "routines",
  "pulse",
  "floor-notes",
  "prior-history",
  "operations",
];

export const GROUP_WORDS: Record<GroupId, string> = {
  core: "Sessions and everything built from them (always)",
  "imported-history": "Sessions imported from paper charts or FileMaker, and their sets",
  "ford-briefing": "FORD details caught in the pre-session briefing (they carry no session)",
  settings: "Machine set-ups: the weights only (current, starting, next); the dials stay",
  "settings-all": "Machine set-ups deleted whole, dials included",
  "setting-history": "Setting change records on the machines, before the --before time",
  routines: "Routines, their plans and plan changes, routine change records, the B switch",
  pulse: "Pulse: progress reports and check-ins, client focuses (old ones too), the Pulse snapshot",
  "floor-notes": "Floor notes on the machines, before the --before time",
  "prior-history": "Sessions before Journey typed by a trainer, and first days at the studio",
  operations: "Operations and Relay records: watch list, cases, Seen marks, day logs, renewal conversations, old incidents",
};

/** `--also a,b,c` → the groups, or the words that weren't one. */
export function parseAlso(text: string | undefined): { groups: Set<GroupId>; unknown: string[]; note: string | null } {
  const groups = new Set<GroupId>(["core"]);
  const unknown: string[] = [];
  for (const raw of (text ?? "").split(",")) {
    const word = raw.trim().toLowerCase();
    if (!word) continue;
    if ((OPTIONAL_GROUPS as readonly string[]).includes(word)) groups.add(word as GroupId);
    else unknown.push(raw.trim());
  }
  let note: string | null = null;
  if (groups.has("settings") && groups.has("settings-all")) {
    groups.delete("settings");
    note = "settings-all deletes the set-ups whole, so settings (the weights only) has nothing left to do.";
  }
  return { groups, unknown, note };
}

export type Phase = "early" | "main" | "late";

/** One line of the summary: a kind of thing the reset deletes or changes. */
export interface PartSpec {
  id: string;
  group: GroupId;
  /** Plain words, no names, no note text. */
  label: string;
  /** "docs": documents deleted; "fields": fields changed on documents kept. */
  kind: "docs" | "fields";
  /**
   * When it is written. `early` before anything else (the trainers' old
   * counts map, so a session's delete trigger can't copy it back), `late`
   * after the session delete triggers have settled (the counts they write),
   * `main` the rest.
   */
  phase: Phase;
}

export const PARTS: readonly PartSpec[] = [
  { id: "sessions", group: "core", label: "Sessions (open, unfinished and finished)", kind: "docs", phase: "main" },
  { id: "session-children", group: "core", label: "Documents filed under those sessions (the old sets shape)", kind: "docs", phase: "main" },
  { id: "exercise-logs", group: "core", label: "Sets (exerciseLogs)", kind: "docs", phase: "main" },
  { id: "session-notes", group: "core", label: "Old-style session notes (sessionNotes)", kind: "docs", phase: "main" },
  { id: "journal-session", group: "core", label: "Client notes written in or for a session", kind: "docs", phase: "main" },
  { id: "journal-thread-updates", group: "core", label: "Updates on those notes (written anywhere)", kind: "docs", phase: "main" },
  { id: "clinical-incidents-session", group: "core", label: "Old incident reports from a session (clinicalIncidents)", kind: "docs", phase: "main" },
  { id: "ford-session", group: "core", label: "FORD details caught in a session", kind: "docs", phase: "main" },
  { id: "ford-summary", group: "core", label: "FORD summary on clients, worked out again from what is left", kind: "fields", phase: "main" },
  { id: "machine-totals", group: "core", label: "Client machine totals (clients/{id}/machineTotals)", kind: "docs", phase: "main" },
  { id: "client-counters", group: "core", label: "Counters on clients the sessions touched, back to a new client's (sessions, tally, top trainer, lifetime reps and weight)", kind: "fields", phase: "main" },
  { id: "client-last-session", group: "core", label: "Last session day written by Journey", kind: "fields", phase: "main" },
  { id: "client-legacy-totals", group: "core", label: "Machine maps still on the client document (pre-split)", kind: "fields", phase: "main" },
  { id: "client-first-session", group: "core", label: "First session date set by Journey's own first session", kind: "fields", phase: "main" },
  { id: "client-first-appointment", group: "core", label: "First visit dates backfilled from Journey sessions", kind: "fields", phase: "main" },
  { id: "client-consultation", group: "core", label: "A prospect's consultation marked done by a session", kind: "fields", phase: "main" },
  { id: "client-prior-confirmed", group: "core", label: "Sessions before Journey confirmed from Mindbody's count (less Journey's)", kind: "fields", phase: "main" },
  { id: "acks-deleted", group: "core", label: "Leaders' Seen marks on deleted notes and session pain reports", kind: "docs", phase: "main" },
  { id: "dismissals-deleted", group: "core", label: "Trainers' \"no need to remind me\" on deleted notes", kind: "fields", phase: "main" },
  { id: "open-session-ghosts", group: "core", label: "Set-ups an open session saved to no client (clientMachineSettings/_*)", kind: "docs", phase: "main" },
  { id: "trainer-legacy-rollups", group: "core", label: "Trainers' old session-count map (trainers/{id}.rollups)", kind: "fields", phase: "early" },
  { id: "trainer-stats", group: "core", label: "Trainers' session counts (trainers/{id}/stats/rollups)", kind: "docs", phase: "late" },
  { id: "leaderboards", group: "core", label: "Old leaderboards (nothing reads them)", kind: "docs", phase: "main" },
  { id: "job-renewal", group: "core", label: "The last visit and coach on those clients' renewal snapshots (the nightly job works the rest out again)", kind: "fields", phase: "main" },
  { id: "job-client-states", group: "core", label: "Client states (the nightly job writes them again)", kind: "docs", phase: "main" },
  { id: "job-watch", group: "core", label: "The nightly job's Journey summary, All stars and month tallies", kind: "docs", phase: "main" },
  { id: "imported-sessions", group: "imported-history", label: "Sessions imported from charts or FileMaker", kind: "docs", phase: "main" },
  { id: "imported-logs", group: "imported-history", label: "Their sets", kind: "docs", phase: "main" },
  { id: "ford-briefing", group: "ford-briefing", label: "FORD details caught in the briefing", kind: "docs", phase: "main" },
  { id: "settings-weights", group: "settings", label: "Weights on machine set-ups (current, starting, next)", kind: "fields", phase: "main" },
  { id: "settings-docs", group: "settings-all", label: "Machine set-ups (clientMachineSettings), whole", kind: "docs", phase: "main" },
  { id: "setting-history", group: "setting-history", label: "Setting changes (machines/{id}/settingHistory)", kind: "docs", phase: "main" },
  { id: "machine-setting-changes", group: "setting-history", label: "Old setting changes (machineSettingChanges, nothing reads them)", kind: "docs", phase: "main" },
  { id: "routines", group: "routines", label: "Routines", kind: "docs", phase: "main" },
  { id: "routine-children", group: "routines", label: "Plan changes filed under a routine", kind: "docs", phase: "main" },
  { id: "routine-adjustments", group: "routines", label: "Routine change records (routineAdjustments)", kind: "docs", phase: "main" },
  { id: "client-routine-b", group: "routines", label: "The B switch on clients whose routines go", kind: "fields", phase: "main" },
  { id: "progress-reports", group: "pulse", label: "Progress reports and Pulse check-ins", kind: "docs", phase: "main" },
  { id: "client-focuses", group: "pulse", label: "Client focuses", kind: "docs", phase: "main" },
  { id: "legacy-focuses", group: "pulse", label: "Old focuses (trainerFocuses, focusRecords)", kind: "docs", phase: "main" },
  { id: "client-pulse", group: "pulse", label: "The Pulse snapshot on clients", kind: "fields", phase: "main" },
  { id: "floor-notes", group: "floor-notes", label: "Floor notes on machines", kind: "docs", phase: "main" },
  { id: "client-prior-history", group: "prior-history", label: "Sessions before Journey typed by a trainer; first day at the studio", kind: "fields", phase: "main" },
  { id: "watchlist", group: "operations", label: "Attendance watch list decisions", kind: "docs", phase: "main" },
  { id: "cases", group: "operations", label: "Cases on slipping clients", kind: "docs", phase: "main" },
  { id: "acks-other", group: "operations", label: "Other Seen marks on Operations", kind: "docs", phase: "main" },
  { id: "day-logs", group: "operations", label: "Relay day logs", kind: "docs", phase: "main" },
  { id: "renewal-touches", group: "operations", label: "Renewal conversations", kind: "docs", phase: "main" },
  { id: "clinical-incidents-other", group: "operations", label: "Other old incident reports (clinicalIncidents)", kind: "docs", phase: "main" },
];

const PART_BY_ID = new Map(PARTS.map((p) => [p.id, p]));

export function partOf(id: string): PartSpec {
  const part = PART_BY_ID.get(id);
  if (!part) throw new Error(`No reset part called ${id}.`);
  return part;
}

/* ------------------------------------------------------------------ *
 * Field lists
 * ------------------------------------------------------------------ */

/** Client fields every finished session moves (lib/sync-utils.ts completeWorkoutSession, lib/client-rollups.ts). */
export const CLIENT_COUNTER_FIELDS = [
  "completedSessions",
  "sessionCount",
  "lifetimeReps",
  "lifetimeWeight",
  "trainerTally",
  "topTrainerId",
  "topTrainerName",
  "topTrainerSessions",
  "trainerTallyUpdatedAt",
] as const;

/**
 * What a touched client's counters go back to: what every door that makes a
 * client writes (the Add Client intake, lib/new-client-intake.ts, and each
 * Mindbody path: the webhook's clientResolver, the pull sync, onboarding and
 * Limbo's release all write `completedSessions: 0, sessionCount: 0` and
 * nothing else). `sessionCount` is the prior record's uncounted sessions when
 * one stays (the profile's reconciler writes the same: Journey's count plus
 * the prior). Everything else in CLIENT_COUNTER_FIELDS no creating door
 * writes, so it goes: an absent lifetime total or tally is what a new client
 * has (the Wrap-up and the Top Trainer backfill read absent as none).
 */
export const COUNTERS_AS_CREATED = ["completedSessions", "sessionCount"] as const;

/** The counters nothing but a session (or a chart import) moves off 0: a client holding one was touched by sessions. */
export const SESSION_ONLY_COUNTERS = ["completedSessions", "lifetimeReps", "lifetimeWeight", "trainerTally", "topTrainerId"] as const;

/** The machine maps that moved to clients/{id}/machineTotals/current (features/machine-totals). */
export const CLIENT_LEGACY_TOTALS_FIELDS = ["currentMachineMetrics", "machineStats", "machineStatsBackfilledAt"] as const;

/**
 * The two maps a session fills. `machineStatsBackfilledAt` is not one: opening
 * a client's Programming writes it with an EMPTY `machineStats`
 * (equipment/useMachineStats.ts) whether or not she ever trained.
 */
export const MACHINE_MAPS = ["currentMachineMetrics", "machineStats"] as const;

/**
 * The two fields of the renewal snapshot that test sessions leave behind.
 * `lastVisitDate` is carried night to night (engine.ts `lastVisitHint`: the
 * stored day is fed back in, so a test session's day never leaves).
 * `primaryTrainerId` is read off the STORED snapshot when a package's outcome
 * is recorded (renewals-job.ts), before tonight's is written. Everything else
 * in the snapshot is worked out again from scratch every night, and the rest
 * of it (the package, the cycle) is what tonight's outcomes compare against
 * (outcomes.ts rule 2), so it stays.
 */
export const RENEWAL_SESSION_FIELDS = ["lastVisitDate", "primaryTrainerId"] as const;

/** firstAppointmentDate's sources that are Journey's own sessions (client-story/first-visit.ts). */
export const SESSION_BACKFILL_SOURCES = ["backfill:firstSessionDate", "backfill:earliest-session"] as const;

export const SETTINGS_WEIGHT_FIELDS = ["currentWeight", "startingWeight", "startingWeightDate", "nextWeight"] as const;

/** Every client field the reset reads, for the script's projection. */
export const CLIENT_FIELDS_READ = [
  "homeStudioId",
  "studioId",
  "isDemo",
  "provisional",
  "supersededById",
  ...CLIENT_COUNTER_FIELDS,
  "lastSessionDate",
  ...CLIENT_LEGACY_TOTALS_FIELDS,
  "firstSessionDate",
  "firstAppointmentDate",
  "firstAppointmentDateSource",
  "consultationCompleted",
  "requiresConsultation",
  "renewal",
  "isRoutineBActive",
  "subjectiveSnapshot",
  "priorHistory",
  "firstStudioDay",
  "fordSummary",
] as const;

/**
 * The note the profile's Confirm writes on a "sessions before Journey" record
 * (client-profile/prior-history-door.ts `confirmGuessStatement`): Mindbody's
 * visits LESS Journey's own sessions, so the test sessions are in it. A record
 * a trainer typed (any source, Mindbody's included) has no such note.
 */
export const CONFIRM_NOTE = "Mindbody's visit count, confirmed on the profile.";

/** The session journal origins (types/journal.ts): before it, during it, after it. */
export const SESSION_ORIGINS = ["pre_session", "in_session", "post_session"] as const;

/** FORD origins tied to a session (ford/types.ts); `briefing` carries no session and is its own group. */
export const FORD_SESSION_ORIGINS = ["in_session", "post_session"] as const;

/** The FORD "In one line" detail (ford-write.ts saveFordOneLine): never a session's. */
export const FORD_ONE_LINE_ID = "one-line";

/** At most this many details make the FORD summary, as the app reads them (ford-write.ts). */
export const FORD_SUMMARY_READ_LIMIT = 500;

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

/** One document as the script read it. `data` may be a projection (clients, trainers). */
export interface DocIn {
  path: string;
  data: Record<string, unknown>;
  /** The read's update time, handed back as the write's precondition (opaque here). */
  updateTime?: unknown;
}

/** Everything the plan looks at, each list read whole (no query, no index). */
export interface ResetInput {
  sessions: DocIn[];
  /** Any document filed under a session (sessions/{id}/logs/{id}, ...). */
  sessionChildren: DocIn[];
  exerciseLogs: DocIn[];
  sessionNotes: DocIn[];
  journalEntries: DocIn[];
  clinicalIncidents: DocIn[];
  /** clients/*, projected to CLIENT_FIELDS_READ. */
  clients: DocIn[];
  /** clients/{id}/machineTotals/* */
  machineTotals: DocIn[];
  /** clients/{id}/ford/* */
  ford: DocIn[];
  /** trainers/*, projected to rollups and isDemo. */
  trainers: DocIn[];
  /** trainers/{id}/stats/* */
  trainerStats: DocIn[];
  leaderboards: DocIn[];
  /** studios/{id}/clientStates/* */
  clientStates: DocIn[];
  /** studios/{id}/watch/* */
  watch: DocIn[];
  /** studios/{id}/acknowledgements/* */
  acknowledgements: DocIn[];
  /** noteDismissals/{uid} */
  noteDismissals: DocIn[];
  clientMachineSettings: DocIn[];
  /** machines/{id}/settingHistory/* */
  settingHistory: DocIn[];
  machineSettingChanges: DocIn[];
  routines: DocIn[];
  /** Any document filed under a routine (routines/{id}/planChanges/{id}, ...). */
  routineChildren: DocIn[];
  routineAdjustments: DocIn[];
  progressReports: DocIn[];
  clientFocuses: DocIn[];
  trainerFocuses: DocIn[];
  focusRecords: DocIn[];
  /** studios/{id}/floorNotes/* */
  floorNotes: DocIn[];
  /** studios/{id}/watchlist/* */
  watchlist: DocIn[];
  /** studios/{id}/cases/* */
  cases: DocIn[];
  /** studios/{id}/dayLogs/* */
  dayLogs: DocIn[];
  /** studios/{id}/renewals/{cycle}/touches/* */
  renewalTouches: DocIn[];
  /** studios/{id}/renewals/* (counted only: never changed) */
  renewalCycles: DocIn[];
  /** studios/*, projected to journeyCutoverDate, isDemo and name (read only: a cutover refuses a commit). */
  studios: DocIn[];
}

export const EMPTY_INPUT: ResetInput = {
  studios: [],
  sessions: [],
  sessionChildren: [],
  exerciseLogs: [],
  sessionNotes: [],
  journalEntries: [],
  clinicalIncidents: [],
  clients: [],
  machineTotals: [],
  ford: [],
  trainers: [],
  trainerStats: [],
  leaderboards: [],
  clientStates: [],
  watch: [],
  acknowledgements: [],
  noteDismissals: [],
  clientMachineSettings: [],
  settingHistory: [],
  machineSettingChanges: [],
  routines: [],
  routineChildren: [],
  routineAdjustments: [],
  progressReports: [],
  clientFocuses: [],
  trainerFocuses: [],
  focusRecords: [],
  floorNotes: [],
  watchlist: [],
  cases: [],
  dayLogs: [],
  renewalTouches: [],
  renewalCycles: [],
};

export interface ResetOptions {
  groups: ReadonlySet<GroupId>;
  includeDemo: boolean;
  /** setting-history and floor-notes take only what was written before this instant (ms). */
  beforeMs: number;
  /** Now (ms), for the open-session check. */
  nowMs: number;
  /**
   * When the test sessions began, as an EARLIER run of the reset worked it out
   * (its backup's manifest). A run after the sessions are gone has none of its
   * own to read it from, and every date rule needs it.
   */
  eraStartMs?: number | null;
}

/* ------------------------------------------------------------------ *
 * Output
 * ------------------------------------------------------------------ */

/** A field that is not there (before the reset, or after it). */
export const ABSENT: unique symbol = Symbol("absent");
export type MaybeValue = unknown | typeof ABSENT;

export interface DeleteStep {
  path: string;
  part: string;
  group: GroupId;
  phase: Phase;
  data: Record<string, unknown>;
  updateTime?: unknown;
}

export interface FieldChange {
  /** The field's path, segment by segment (["threads", "abc"] is threads.abc). */
  field: string[];
  part: string;
  group: GroupId;
  before: MaybeValue;
  after: MaybeValue;
}

/** Every change to one kept document, merged across parts: one update per document. */
export interface FieldStep {
  path: string;
  phase: Phase;
  updateTime?: unknown;
  changes: FieldChange[];
}

export interface PartCount {
  part: PartSpec;
  /** Whether this run takes it (its group is asked for). */
  included: boolean;
  /** Documents deleted, or documents with a field changed. */
  docs: number;
  /** Fields changed (a "fields" part). */
  fields: number;
  /** The same, in Demo Mode, left out (0 with --include-demo). */
  demoDocs: number;
  demoFields: number;
}

export interface OpenSession {
  path: string;
  /** The last sign of life: heartbeat, else start, else creation (ms), or null when none is recorded. */
  lastSignMs: number | null;
  /** Within the last 12 hours. */
  recent: boolean;
  demo: boolean;
}

/** Things the reset never changes but AJ may want to know about. */
export interface LeftAlone {
  label: string;
  count: number;
}

export interface ResetPlan {
  /** What this run deletes, in its groups (demo left out unless asked for). */
  deletes: DeleteStep[];
  /** What this run changes on documents it keeps, one step per document and phase. */
  fieldSteps: FieldStep[];
  /** Every part, taken or not, with its counts: the dry run prints all of them. */
  counts: PartCount[];
  openSessions: OpenSession[];
  /** Whether any session going was in a trainer's count (its delete trigger will run). */
  countedSessionsDeleted: number;
  /** Documents this run writes: deleted, plus kept ones with a field changed. `--expect` must name it. */
  plannedDocuments: number;
  /** Studios outside Demo Mode with a Journey cutover date: real sessions may be on the floor. */
  cutoverStudios: { id: string; day: string }[];
  /** Clients whose first-session date this run clears (ids only), printed so a person can look. */
  firstSessionClearIds: string[];
  /** The moment the earliest session began (ms): a first-session date before it was typed, not Journey's. */
  sessionEraStartMs: number | null;
  leftAlone: LeftAlone[];
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Milliseconds from a Firestore Timestamp, a Date, an ISO string or epoch ms; null when it isn't a time. */
export function millisOf(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    // A date-only key is a studio day: read it at noon UTC so either side of the date line holds it.
    const t = /^\d{4}-\d{2}-\d{2}$/.test(text) ? Date.parse(`${text}T12:00:00Z`) : Date.parse(text);
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === "object") {
    const v = value as { toMillis?: () => number; seconds?: unknown; _seconds?: unknown; nanoseconds?: unknown };
    if (typeof v.toMillis === "function") {
      const ms = v.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    const seconds = typeof v.seconds === "number" ? v.seconds : typeof v._seconds === "number" ? v._seconds : null;
    if (seconds !== null) return seconds * 1000 + Math.floor(Number(v.nanoseconds ?? 0) / 1e6);
  }
  return null;
}

/** The last segment of a path: the document id. */
export function idOf(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

/** `clients/abc/ford/x` → `abc`: the id of the document a subcollection document hangs off. */
export function parentIdOf(path: string): string | null {
  const parts = path.split("/");
  return parts.length >= 4 ? parts[parts.length - 3] : null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

const OPEN_WINDOW_MS = 12 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** The last sign of life of a session: heartbeat, else start, else creation. */
function lastSignOf(data: Record<string, unknown>): number | null {
  const times = [data.lastHeartbeatAt, data.startTime, data.createdAt, data.clientStartTime]
    .map(millisOf)
    .filter((t): t is number => t !== null);
  return times.length ? Math.max(...times) : null;
}

const EASTERN = "America/New_York";
const EASTERN_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const EASTERN_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: EASTERN, year: "numeric", month: "2-digit", day: "2-digit" });

/** The studio's (Eastern) day of an instant, yyyy-mm-dd. */
export function easternDay(ms: number): string {
  return EASTERN_DAY.format(new Date(ms));
}

/**
 * A first-session date TYPED on the retired client form (fbfc9d30): it
 * stored `Timestamp.fromDate` of the typed day at local midnight, so the
 * value is an Eastern midnight to the second with no fraction. Start writes
 * `serverTimestamp()`, which carries the server's sub-second time.
 */
export function looksTyped(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const v = value as { nanoseconds?: unknown };
  if (typeof v.nanoseconds !== "number" || v.nanoseconds !== 0) return false;
  const ms = millisOf(value);
  if (ms === null || ms % 1000 !== 0) return false;
  return EASTERN_CLOCK.format(new Date(ms)) === "00:00:00";
}

/** Two stored values the same (plain data, as the plan compares them). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  const ma = millisOf(a);
  const mb = millisOf(b);
  if (ma !== null || mb !== null) return ma === mb && (a as { nanoseconds?: unknown }).nanoseconds === (b as { nanoseconds?: unknown }).nanoseconds;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((x, i) => sameValue(x, (b as unknown[])[i]));
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  return ka.length === kb.length && ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** A value a session put there: not the 0, "", null, {} or [] an intake or a sync writes. */
export function holdsSomething(value: unknown): boolean {
  if (value === null || value === undefined || value === "" || value === 0 || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) return Object.keys(value as object).length > 0;
  return true;
}

/** A session imported from a paper chart or FileMaker (client-history/model.ts isLegacySession). */
export function isImportedSession(data: Record<string, unknown>): boolean {
  return (
    Boolean(data.legacy_filemaker_id) ||
    data.trainerId === "legacy-trainer" ||
    data.trainerInitials === "Legacy" ||
    data.trainerInitials === "Chart"
  );
}

/** Journey's own "YYYY-MM-DD" (Finish); Mindbody's lastVisited (the webhook) carries a time and is kept. */
export function isJourneyLastSessionDate(value: unknown): boolean {
  if (typeof value === "string") return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  return value !== null && value !== undefined && millisOf(value) !== null;
}

/** A trainer's counts document that still remembers a session (an all-zero one is the nightly's, and stays). */
export function rollupHoldsSessions(data: Record<string, unknown>): boolean {
  for (const f of ["sessionsCoached", "sessionsCoached30d", "sessionsCoached90d", "clientsCoached90d", "avgPerWeek"]) {
    const v = data[f];
    if (typeof v === "number" && v !== 0) return true;
  }
  return data.lastSessionAt != null || data.firstSessionAt != null;
}

/** A month tally (watch/hours-YYYY-MM, watch/sessions-YYYY-MM) that counted a session; the job's empty month is not one. */
export function tallyHoldsSessions(data: Record<string, unknown>): boolean {
  for (const f of ["trainers", "rows", "lateIds", "openIds", "open", "clients", "machines"]) {
    const v = data[f];
    if (Array.isArray(v) && v.length > 0) return true;
  }
  for (const f of ["count", "unattributed", "open"]) {
    const v = data[f];
    if (typeof v === "number" && v > 0) return true;
  }
  return false;
}

/** The value at a field path, or ABSENT. */
export function valueAt(data: Record<string, unknown> | null | undefined, field: readonly string[]): MaybeValue {
  let at: unknown = data;
  for (const seg of field) {
    if (at === null || typeof at !== "object" || Array.isArray(at)) return ABSENT;
    if (!(seg in (at as Record<string, unknown>))) return ABSENT;
    at = (at as Record<string, unknown>)[seg];
  }
  return at === undefined ? ABSENT : at;
}

/**
 * Who belongs to Demo Mode: the demo studio's clients (by their home or the
 * flag), its sessions (hosted there, or for one of its clients), its trainers
 * (the flag), and anything else carrying the demo studio's id, the flag, or a
 * demo client or session.
 */
export class DemoScope {
  readonly clients = new Set<string>();
  readonly sessions = new Set<string>();
  readonly trainers = new Set<string>();

  constructor(input: Pick<ResetInput, "clients" | "sessions" | "trainers">) {
    for (const c of input.clients) {
      if (isDemoRecord(c.data as never)) this.clients.add(idOf(c.path));
    }
    for (const s of input.sessions) {
      const clientId = str(s.data.clientId);
      if (isDemoRecord(s.data as never) || (clientId && this.clients.has(clientId))) this.sessions.add(idOf(s.path));
    }
    for (const t of input.trainers) {
      if (t.data.isDemo === true) this.trainers.add(idOf(t.path));
    }
  }

  /** A document's own data says demo, or it hangs off a demo client, session or studio. */
  isDemo(doc: DocIn, extra: { clientId?: string | null; sessionId?: string | null } = {}): boolean {
    if (doc.path.startsWith(`studios/${DEMO_STUDIO_ID}/`)) return true;
    if (isDemoRecord(doc.data as never)) return true;
    const clientId = extra.clientId ?? str(doc.data.clientId);
    if (clientId && this.clients.has(clientId)) return true;
    const sessionId = extra.sessionId ?? str(doc.data.sessionId);
    if (sessionId && this.sessions.has(sessionId)) return true;
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * The builder: counts every part, keeps the steps of the parts taken
 * ------------------------------------------------------------------ */

class Builder {
  readonly deletes: DeleteStep[] = [];
  private readonly fieldSteps = new Map<string, FieldStep>();
  private readonly counts = new Map<string, PartCount>();
  private readonly deleted = new Set<string>();

  constructor(private readonly options: ResetOptions) {
    for (const part of PARTS) {
      this.counts.set(part.id, {
        part,
        included: options.groups.has(part.group),
        docs: 0,
        fields: 0,
        demoDocs: 0,
        demoFields: 0,
      });
    }
  }

  /** Whether a part in this group, for a record in or out of Demo Mode, is taken by this run. */
  takes(group: GroupId, demo: boolean): boolean {
    return this.options.groups.has(group) && (!demo || this.options.includeDemo);
  }

  willDelete(path: string): boolean {
    return this.deleted.has(path);
  }

  deleteDoc(partId: string, doc: DocIn, demo: boolean): boolean {
    const count = this.counts.get(partId)!;
    if (this.deleted.has(doc.path)) return true;
    if (demo && !this.options.includeDemo) count.demoDocs += 1;
    else count.docs += 1;
    const taken = this.takes(count.part.group, demo);
    if (taken) {
      this.deleted.add(doc.path);
      this.deletes.push({
        path: doc.path,
        part: count.part.id,
        group: count.part.group,
        phase: count.part.phase,
        data: doc.data,
        updateTime: doc.updateTime,
      });
    }
    return taken;
  }

  /** Field changes on a kept document: each `[field, after]`; a field already as asked changes nothing. */
  changeFields(partId: string, doc: DocIn, changes: ReadonlyArray<[string[], MaybeValue]>, demo: boolean): boolean {
    const real = changes
      .map(([field, after]) => ({ field, after, before: valueAt(doc.data, field) }))
      .filter((c) => !(c.before === ABSENT && c.after === ABSENT))
      .filter((c) => c.before === ABSENT || c.after === ABSENT || !sameValue(c.before, c.after));
    if (real.length === 0) return false;
    const count = this.counts.get(partId)!;
    if (demo && !this.options.includeDemo) {
      count.demoDocs += 1;
      count.demoFields += real.length;
    } else {
      count.docs += 1;
      count.fields += real.length;
    }
    const taken = this.takes(count.part.group, demo);
    if (!taken) return false;
    const key = `${count.part.phase}\u0000${doc.path}`;
    const step = this.fieldSteps.get(key) ?? { path: doc.path, phase: count.part.phase, updateTime: doc.updateTime, changes: [] };
    for (const c of real) {
      const name = c.field.join("\u0000");
      if (step.changes.some((x) => x.field.join("\u0000") === name)) continue;
      step.changes.push({ field: c.field, part: count.part.id, group: count.part.group, before: c.before, after: c.after });
    }
    this.fieldSteps.set(key, step);
    return true;
  }

  clearFields(partId: string, doc: DocIn, fields: readonly string[], demo: boolean): boolean {
    return this.changeFields(partId, doc, fields.map((f) => [[f], ABSENT] as [string[], MaybeValue]), demo);
  }

  steps(): FieldStep[] {
    // A document the run deletes needs no field change.
    return [...this.fieldSteps.values()].filter((s) => !this.deleted.has(s.path));
  }

  result(): PartCount[] {
    return PARTS.map((p) => this.counts.get(p.id)!);
  }
}

/* ------------------------------------------------------------------ *
 * The plan
 * ------------------------------------------------------------------ */

export function planReset(input: ResetInput, options: ResetOptions): ResetPlan {
  const b = new Builder(options);
  const demo = new DemoScope(input);

  /* ---- sessions: which go, which stay ---- */
  const openSessions: OpenSession[] = [];
  const existingSessions = new Set<string>();
  const goingSessions = new Set<string>();
  /** Clients a session going was for: their counters, snapshot and totals are the sessions'. */
  const sessionClients = new Set<string>();
  let countedSessionsDeleted = 0;
  let eraStart: number | null = null;
  for (const s of input.sessions) {
    const id = idOf(s.path);
    existingSessions.add(id);
    const isDemo = demo.sessions.has(id);
    const imported = isImportedSession(s.data);
    if (b.deleteDoc(imported ? "imported-sessions" : "sessions", s, isDemo)) {
      goingSessions.add(id);
      const clientId = str(s.data.clientId);
      if (clientId) sessionClients.add(clientId);
      if (s.data.rollupCounted === true) countedSessionsDeleted += 1;
    }
    // When Journey's own sessions began: the moment the first one was WRITTEN
    // (Start stamps firstSessionDate then). Not a session's day, which Log past
    // session can set years back, and not Demo Mode's seeded past.
    const written = millisOf(s.data.createdAt);
    if (!imported && !isDemo && written !== null && (eraStart === null || written < eraStart)) eraStart = written;
    if (s.data.status !== "Completed") {
      const lastSign = lastSignOf(s.data);
      openSessions.push({
        path: s.path,
        lastSignMs: lastSign,
        recent: lastSign !== null && options.nowMs - lastSign < OPEN_WINDOW_MS,
        demo: isDemo,
      });
    }
  }
  // A run after the sessions went (a second one, the next morning) reads the
  // start from the earlier run's backup.
  if (typeof options.eraStartMs === "number" && Number.isFinite(options.eraStartMs) && (eraStart === null || options.eraStartMs < eraStart)) {
    eraStart = options.eraStartMs;
  }
  /** On or after the day before the test sessions began (a day's slack for the time zone). */
  const inEra = (ms: number | null): boolean => ms !== null && eraStart !== null && ms >= eraStart - DAY_MS;

  /**
   * What a record carrying this session id goes with: "going" (the session
   * goes, or is already gone: Discard and History's delete leave a session's
   * notes behind), "demo" (a Demo Mode session left out: the record is
   * counted as Demo Mode's), "kept" (an imported session that stays: so does
   * the record), "none" (no session id).
   */
  const tieOf = (sessionId: string | null): "none" | "going" | "demo" | "kept" => {
    if (!sessionId) return "none";
    if (goingSessions.has(sessionId) || !existingSessions.has(sessionId)) return "going";
    return demo.sessions.has(sessionId) ? "demo" : "kept";
  };

  const importedSessionIds = new Set(input.sessions.filter((s) => isImportedSession(s.data)).map((s) => idOf(s.path)));
  for (const child of input.sessionChildren) {
    const sessionId = child.path.split("/")[1];
    b.deleteDoc(importedSessionIds.has(sessionId) ? "imported-sessions" : "session-children", child, demo.sessions.has(sessionId));
  }

  /* ---- sets ---- */
  for (const log of input.exerciseLogs) {
    const sessionId = str(log.data.sessionId);
    const isDemo = demo.isDemo(log);
    const taken =
      sessionId && importedSessionIds.has(sessionId) ? b.deleteDoc("imported-logs", log, isDemo) : b.deleteDoc("exercise-logs", log, isDemo);
    const clientId = str(log.data.clientId);
    if (taken && clientId) sessionClients.add(clientId);
  }

  /* ---- old-style session notes ---- */
  for (const note of input.sessionNotes) {
    // One with no session shows on the client's notes as a manual profile
    // note (useClientJournal's adapter, origin "manual"), and stays.
    const tie = tieOf(str(note.data.sessionId));
    if (tie === "kept" || tie === "none") continue;
    b.deleteDoc("session-notes", note, tie === "demo" || demo.isDemo(note));
  }

  /* ---- journal: session notes, then every update below them ---- */
  const journalGone = new Set<string>(); // ids taken by this run
  const journalSeedDemo = new Set<string>(); // ids that would go but are Demo Mode's
  for (const entry of input.journalEntries) {
    const sessionId = str(entry.data.sessionId);
    const tie = tieOf(sessionId);
    const origin = str(entry.data.origin);
    const sessionTime = origin !== null && (SESSION_ORIGINS as readonly string[]).includes(origin);
    // Tied to an imported session that stays: stays with it.
    if (tie === "kept") continue;
    if (tie === "none" && !sessionTime) continue;
    const isDemo = tie === "demo" || demo.isDemo(entry);
    if (b.deleteDoc("journal-session", entry, isDemo)) journalGone.add(idOf(entry.path));
    else if (isDemo) journalSeedDemo.add(idOf(entry.path));
  }
  // Updates hang off a root by threadId, and can hang off an update: follow them down.
  const byThread = new Map<string, DocIn[]>();
  for (const entry of input.journalEntries) {
    const threadId = str(entry.data.threadId);
    if (!threadId) continue;
    const list = byThread.get(threadId) ?? [];
    list.push(entry);
    byThread.set(threadId, list);
  }
  const followDown = (roots: Set<string>, demoTree: boolean) => {
    const queue = [...roots];
    const seen = new Set(roots);
    while (queue.length) {
      const id = queue.shift()!;
      for (const update of byThread.get(id) ?? []) {
        const uid = idOf(update.path);
        if (seen.has(uid)) continue;
        seen.add(uid);
        queue.push(uid);
        if (b.willDelete(update.path)) continue;
        if (b.deleteDoc("journal-thread-updates", update, demoTree)) journalGone.add(uid);
      }
    }
  };
  followDown(new Set(journalGone), false);
  followDown(journalSeedDemo, true);

  /* ---- old incident reports ---- */
  const incidentsGone = new Set<string>();
  for (const incident of input.clinicalIncidents) {
    const tie = tieOf(str(incident.data.sessionId));
    if (tie === "kept") continue;
    const isDemo = tie === "demo" || demo.isDemo(incident);
    const part = tie === "none" ? "clinical-incidents-other" : "clinical-incidents-session";
    if (b.deleteDoc(part, incident, isDemo)) incidentsGone.add(idOf(incident.path));
  }

  /* ---- FORD ---- */
  const fordByClient = new Map<string, DocIn[]>();
  const fordTouched = new Set<string>();
  for (const entry of input.ford) {
    const clientId = parentIdOf(entry.path) ?? "";
    const list = fordByClient.get(clientId) ?? [];
    list.push(entry);
    fordByClient.set(clientId, list);
    if (idOf(entry.path) === FORD_ONE_LINE_ID) continue;
    const tie = tieOf(str(entry.data.sessionId));
    if (tie === "kept") continue;
    const origin = str(entry.data.origin);
    const isDemo = tie === "demo" || demo.isDemo(entry, { clientId });
    let taken = false;
    if (tie !== "none" || (origin !== null && (FORD_SESSION_ORIGINS as readonly string[]).includes(origin))) {
      taken = b.deleteDoc("ford-session", entry, isDemo);
    } else if (origin === "briefing") {
      taken = b.deleteDoc("ford-briefing", entry, isDemo);
    }
    if (taken) fordTouched.add(clientId);
  }

  /* ---- machine totals ---- */
  for (const t of input.machineTotals) {
    const clientId = parentIdOf(t.path);
    const taken = b.deleteDoc("machine-totals", t, demo.isDemo(t, { clientId }));
    // Only a map with something in it was a session's: opening Programming
    // writes an empty one for anyone.
    if (taken && clientId && MACHINE_MAPS.some((f) => holdsSomething(t.data[f]))) sessionClients.add(clientId);
  }

  /* ---- client fields ---- */
  const routineClients = new Set<string>();
  for (const r of input.routines) {
    const clientId = str(r.data.clientId);
    if (clientId) routineClients.add(clientId);
  }
  let firstSessionDatesKept = 0;
  let firstVisitsKept = 0;
  let lastSessionDatesKept = 0;
  let provisional = 0;
  const firstSessionClearIds: string[] = [];
  for (const c of input.clients) {
    const id = idOf(c.path);
    const isDemo = demo.clients.has(id);
    if (c.data.provisional === true && !c.data.supersededById && !isDemo) provisional += 1;

    // A client the sessions touched: one going was hers, or a counter only a
    // session moves holds something. Every client the intake or a Mindbody
    // sync made starts with 0s; those are left as they are.
    const touched =
      sessionClients.has(id) ||
      SESSION_ONLY_COUNTERS.some((f) => holdsSomething(c.data[f])) ||
      MACHINE_MAPS.some((f) => holdsSomething(c.data[f]));

    // "Sessions before Journey". Confirm on Account writes Mindbody's visits
    // LESS Journey's count, "through" the day before her first Journey
    // session: with a test session behind it, both numbers are the tests'. A
    // Confirm made before she had any Journey session ("through" is the day it
    // was recorded) took nothing off, and stays. A record a trainer typed is
    // the prior-history group's.
    const prior = c.data.priorHistory as { source?: unknown; note?: unknown; through?: unknown; recordedAt?: unknown } | undefined;
    const isConfirm = Boolean(prior && typeof prior === "object" && prior.source === "mindbody" && prior.note === CONFIRM_NOTE);
    const typedPrior = Boolean(prior && typeof prior === "object" && !isConfirm);
    let confirmTainted = false;
    if (isConfirm) {
      const through = typeof prior!.through === "string" ? prior!.through : null;
      const recorded = millisOf(prior!.recordedAt);
      const beforeItsDay = through === null || recorded === null || through < easternDay(recorded);
      // "through" is the day BEFORE the first session: a day's more slack.
      const throughMs = through === null ? null : millisOf(through);
      confirmTainted = beforeItsDay && (touched || (throughMs !== null && inEra(throughMs + DAY_MS)));
    }
    if (confirmTainted) b.clearFields("client-prior-confirmed", c, ["priorHistory"], isDemo);
    b.clearFields("client-prior-history", c, typedPrior ? ["priorHistory", "firstStudioDay"] : ["firstStudioDay"], isDemo);
    // The prior record after this run, for the count it leaves behind.
    const priorStays =
      prior && typeof prior === "object" && !(confirmTainted && b.takes("core", isDemo)) && !(typedPrior && b.takes("prior-history", isDemo));

    if (touched) {
      // Back to what a door that makes a client writes (COUNTERS_AS_CREATED);
      // the rest a new client doesn't have.
      b.changeFields(
        "client-counters",
        c,
        CLIENT_COUNTER_FIELDS.map((f): [string[], MaybeValue] => {
          if (f === "completedSessions") return [[f], 0];
          if (f === "sessionCount") return [[f], priorStays ? priorUncounted(prior as unknown as PriorHistory) : 0];
          return [[f], ABSENT];
        }),
        isDemo,
      );
      // Only a client the sessions touched loses these: anyone else's snapshot
      // may hold a real visit older than the job's 90-day read.
      if (c.data.renewal && typeof c.data.renewal === "object") {
        b.changeFields("job-renewal", c, RENEWAL_SESSION_FIELDS.map((f): [string[], MaybeValue] => [["renewal", f], ABSENT]), isDemo);
      }
    }
    b.clearFields("client-legacy-totals", c, CLIENT_LEGACY_TOTALS_FIELDS, isDemo);

    if (c.data.lastSessionDate !== undefined) {
      if (isJourneyLastSessionDate(c.data.lastSessionDate)) b.clearFields("client-last-session", c, ["lastSessionDate"], isDemo);
      else if (!isDemo) lastSessionDatesKept += 1;
    }

    // Start writes firstSessionDate at a client's first Journey session (the
    // server's time). A date from before the test sessions began, or one
    // typed on the retired client form (an Eastern midnight to the second),
    // stays.
    if (c.data.firstSessionDate !== undefined && c.data.firstSessionDate !== null) {
      const at = millisOf(c.data.firstSessionDate);
      if (inEra(at) && !looksTyped(c.data.firstSessionDate)) {
        if (b.clearFields("client-first-session", c, ["firstSessionDate"], isDemo)) firstSessionClearIds.push(id);
      } else if (!isDemo) firstSessionDatesKept += 1;
    }

    // A first visit backfilled from Journey's sessions; the webhook writes a
    // real one over the date without touching the source, so only a date in
    // the test sessions' time is theirs.
    const source = str(c.data.firstAppointmentDateSource);
    if (source && (SESSION_BACKFILL_SOURCES as readonly string[]).includes(source)) {
      if (inEra(millisOf(c.data.firstAppointmentDate))) {
        b.clearFields("client-first-appointment", c, ["firstAppointmentDate", "firstAppointmentDateSource"], isDemo);
      } else if (!isDemo) firstVisitsKept += 1;
    }

    // Finish marks the consultation done; for a prospect that is the only
    // writer (the intake wrote false). Everyone else's mark is read only
    // beside requiresConsultation, and stays.
    if (c.data.requiresConsultation === true && c.data.consultationCompleted === true) {
      b.clearFields("client-consultation", c, ["consultationCompleted"], isDemo);
    }

    if (routineClients.has(id)) b.clearFields("client-routine-b", c, ["isRoutineBActive"], isDemo);
    b.clearFields("client-pulse", c, ["subjectiveSnapshot"], isDemo);

    // The FORD summary, worked out again from the details that stay, the way
    // the app reads them (the client's FORD studio, at most 500): for a client
    // who loses one, and for any whose stored summary no longer matches what
    // is left (an earlier run whose write didn't land).
    const stored = c.data.fordSummary;
    if (fordTouched.has(id) || (stored && typeof stored === "object")) {
      const studio = fordStudioIdOf(c.data as unknown as Client);
      const left = (fordByClient.get(id) ?? [])
        .filter((e) => !b.willDelete(e.path))
        .map((e) => ({ id: idOf(e.path), ...e.data }) as unknown as FordEntry)
        .filter((e) => (e as unknown as { studioId?: unknown }).studioId === studio)
        .slice(0, FORD_SUMMARY_READ_LIMIT);
      const summary = summariseFord(left);
      if (fordTouched.has(id) || !sameFordCounts(stored, summary)) {
        b.changeFields("ford-summary", c, [[["fordSummary"], summary]], isDemo);
      }
    }
  }

  /* ---- Seen marks and "no need to remind me" on what goes ---- */
  const demoClients = demo.clients;
  for (const ack of input.acknowledgements) {
    const key = idOf(ack.path);
    const isDemo = demo.isDemo(ack);
    const colon = key.indexOf(":");
    const kind = colon > 0 ? key.slice(0, colon) : key;
    const rest = colon > 0 ? key.slice(colon + 1) : "";
    let tied = false;
    if (kind === "note") tied = journalGone.has(rest.startsWith("team:") ? rest.slice(5) : rest);
    else if (kind === "incident") tied = incidentsGone.has(rest);
    else if (kind === "pain") {
      // A pain report is read off sessions' check-ins only (admin/overview/questions.ts).
      const clientId = rest.split(":")[0];
      tied = goingSessions.size > 0 && !demoClients.has(clientId);
    }
    b.deleteDoc(tied ? "acks-deleted" : "acks-other", ack, isDemo);
  }
  for (const d of input.noteDismissals) {
    const threads = d.data.threads;
    if (!threads || typeof threads !== "object") continue;
    const gone = Object.keys(threads as Record<string, unknown>).filter((id) => journalGone.has(id));
    if (gone.length === 0) continue;
    b.changeFields("dismissals-deleted", d, gone.map((id) => [["threads", id], ABSENT] as [string[], MaybeValue]), false);
  }

  /* ---- open sessions' ghost set-ups ---- */
  for (const s of input.clientMachineSettings) {
    if (!str(s.data.clientId) && idOf(s.path).startsWith("_")) b.deleteDoc("open-session-ghosts", s, demo.isDemo(s));
  }

  /* ---- trainers ---- */
  for (const t of input.trainers) {
    b.clearFields("trainer-legacy-rollups", t, ["rollups"], demo.trainers.has(idOf(t.path)));
  }
  for (const s of input.trainerStats) {
    if (idOf(s.path) !== "rollups") continue;
    if (!rollupHoldsSessions(s.data)) continue;
    b.deleteDoc("trainer-stats", s, demo.trainers.has(parentIdOf(s.path) ?? ""));
  }
  for (const l of input.leaderboards) b.deleteDoc("leaderboards", l, false);

  /* ---- the nightly job's output ---- */
  for (const s of input.clientStates) {
    b.deleteDoc("job-client-states", s, demo.isDemo(s, { clientId: idOf(s.path) }));
  }
  for (const w of input.watch) {
    const id = idOf(w.path);
    const tally = /^(hours|sessions)-\d{4}-\d{2}$/.test(id);
    if (id !== "journey" && id !== "hubMarks" && !tally) continue;
    // The nightly job writes every studio's last five months, zeros and all;
    // an empty one is its, and stays.
    if (tally && !tallyHoldsSessions(w.data)) continue;
    b.deleteDoc("job-watch", w, demo.isDemo(w));
  }

  /* ---- settings ---- */
  for (const s of input.clientMachineSettings) {
    const clientId = str(s.data.clientId);
    if (!clientId && idOf(s.path).startsWith("_")) continue; // the ghosts, above
    const isDemo = demo.isDemo(s, { clientId: clientId ?? idOf(s.path).split("_")[0] });
    b.clearFields("settings-weights", s, SETTINGS_WEIGHT_FIELDS, isDemo);
    b.deleteDoc("settings-docs", s, isDemo);
  }
  const undated = { history: 0, floor: 0 };
  const beforeCutoff = (doc: DocIn, fields: string[]): boolean | null => {
    for (const f of fields) {
      const at = millisOf(doc.data[f]);
      if (at !== null) return at < options.beforeMs;
    }
    return null;
  };
  for (const h of input.settingHistory) {
    const before = beforeCutoff(h, ["timestamp", "createdAt", "at"]);
    if (before === null) undated.history += 1;
    if (before !== true) continue;
    b.deleteDoc("setting-history", h, demo.isDemo(h));
  }
  for (const h of input.machineSettingChanges) {
    const before = beforeCutoff(h, ["timestamp", "createdAt", "changedAt", "at"]);
    if (before === null) undated.history += 1;
    if (before !== true) continue;
    b.deleteDoc("machine-setting-changes", h, demo.isDemo(h));
  }

  /* ---- routines ---- */
  const demoRoutines = new Set<string>();
  for (const r of input.routines) {
    const isDemo = demo.isDemo(r);
    if (isDemo) demoRoutines.add(idOf(r.path));
    b.deleteDoc("routines", r, isDemo);
  }
  for (const child of input.routineChildren) {
    b.deleteDoc("routine-children", child, demoRoutines.has(child.path.split("/")[1]) || demo.isDemo(child));
  }
  for (const a of input.routineAdjustments) b.deleteDoc("routine-adjustments", a, demo.isDemo(a));

  /* ---- pulse ---- */
  for (const r of input.progressReports) b.deleteDoc("progress-reports", r, demo.isDemo(r));
  for (const f of input.clientFocuses) b.deleteDoc("client-focuses", f, demo.isDemo(f));
  for (const f of [...input.trainerFocuses, ...input.focusRecords]) b.deleteDoc("legacy-focuses", f, demo.isDemo(f));

  /* ---- floor notes ---- */
  const floorRootsGone = new Set<string>();
  const floorRootsDemo = new Set<string>();
  for (const n of input.floorNotes) {
    if (str(n.data.threadId)) continue;
    const before = beforeCutoff(n, ["createdAt", "updatedAt"]);
    if (before === null) undated.floor += 1;
    if (before !== true) continue;
    const isDemo = demo.isDemo(n);
    if (b.deleteDoc("floor-notes", n, isDemo)) floorRootsGone.add(n.path);
    else if (isDemo) floorRootsDemo.add(n.path);
  }
  for (const n of input.floorNotes) {
    const threadId = str(n.data.threadId);
    if (!threadId) continue;
    const rootPath = n.path.replace(/[^/]+$/, threadId);
    if (floorRootsGone.has(rootPath)) b.deleteDoc("floor-notes", n, false);
    else if (floorRootsDemo.has(rootPath)) b.deleteDoc("floor-notes", n, true);
  }

  /* ---- operations ---- */
  for (const w of input.watchlist) b.deleteDoc("watchlist", w, demo.isDemo(w, { clientId: idOf(w.path) }));
  for (const c of input.cases) b.deleteDoc("cases", c, demo.isDemo(c, { clientId: idOf(c.path) }));
  for (const d of input.dayLogs) b.deleteDoc("day-logs", d, demo.isDemo(d));
  for (const t of input.renewalTouches) b.deleteDoc("renewal-touches", t, demo.isDemo(t));

  /* ---- what is left alone, for AJ ---- */
  const leftAlone: LeftAlone[] = [];
  if (firstSessionDatesKept > 0) {
    leftAlone.push({ label: "First session dates from before the test sessions, or typed on the old client form", count: firstSessionDatesKept });
  }
  if (firstVisitsKept > 0) leftAlone.push({ label: "First visits backfilled from sessions but dated before the test sessions (Mindbody's since)", count: firstVisitsKept });
  if (lastSessionDatesKept > 0) leftAlone.push({ label: "Last visit dates with a time on them (from Mindbody's webhook)", count: lastSessionDatesKept });
  if (undated.history > 0) leftAlone.push({ label: "Setting change records with no time on them", count: undated.history });
  if (undated.floor > 0) leftAlone.push({ label: "Floor notes with no time on them", count: undated.floor });
  if (provisional > 0) leftAlone.push({ label: "Temporary clients added in the app (provisional, never merged): delete by hand if they were tests", count: provisional });
  const cyclesWithOutcome = input.renewalCycles.filter((r) => r.data.outcome != null && !demo.isDemo(r)).length;
  if (cyclesWithOutcome > 0) leftAlone.push({ label: "Renewal outcomes already recorded (from Mindbody packages; never rebuilt)", count: cyclesWithOutcome });
  const linkedReports = input.progressReports.filter((r) => linksDeletedNote(r.data, journalGone)).length;
  if (linkedReports > 0 && !options.groups.has("pulse")) {
    leftAlone.push({ label: "Pulse reports whose pain points link a deleted note (shown as linked to N notes)", count: linkedReports });
  }

  const fieldSteps = b.steps();
  return {
    deletes: b.deletes,
    fieldSteps,
    counts: b.result(),
    openSessions,
    countedSessionsDeleted,
    plannedDocuments: b.deletes.length + new Set(fieldSteps.map((s) => s.path)).size,
    cutoverStudios: cutoverStudiosOf(input.studios),
    firstSessionClearIds,
    sessionEraStartMs: eraStart,
    leftAlone,
  };
}

/**
 * Studios outside Demo Mode with a Journey cutover date. Before launch there
 * are none; once there is one, real sessions may be on the floor and a reset
 * would take them too, so a commit needs `--after-cutover`.
 */
export function cutoverStudiosOf(studios: readonly DocIn[]): { id: string; day: string }[] {
  return studios
    .filter((s) => !isDemoRecord({ ...s.data, studioId: idOf(s.path) } as never) && s.data.isDemo !== true)
    .map((s) => ({ id: idOf(s.path), day: str(s.data.journeyCutoverDate) ?? "" }))
    .filter((s) => s.day !== "");
}

/** A stored FORD summary still says what the details say (the dated line and the stamp aside: they move with the clock). */
export function sameFordCounts(stored: unknown, next: ClientFordSummary): boolean {
  if (!stored || typeof stored !== "object") return false;
  const s = stored as Partial<ClientFordSummary>;
  return (
    sameValue(s.counts ?? null, next.counts) &&
    (s.untagged ?? 0) === next.untagged &&
    (s.openOpportunities ?? 0) === next.openOpportunities &&
    sameValue(s.pinned ?? {}, next.pinned)
  );
}

/** A progress report's pain points that link a journal entry the run deletes. */
function linksDeletedNote(data: Record<string, unknown>, gone: ReadonlySet<string>): boolean {
  const points = (data.subjective as { painPoints?: unknown } | undefined)?.painPoints;
  if (!Array.isArray(points)) return false;
  return points.some((p) => Array.isArray((p as { linkedJournalEntryIds?: unknown })?.linkedJournalEntryIds)
    && ((p as { linkedJournalEntryIds: unknown[] }).linkedJournalEntryIds).some((id) => typeof id === "string" && gone.has(id)));
}

/** Recent open sessions block a commit: an iPad mid-session would write them back from its queue. */
export function blockingOpenSessions(plan: ResetPlan, includeDemo: boolean): OpenSession[] {
  return plan.openSessions.filter((s) => s.recent && (includeDemo || !s.demo));
}

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

export const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** One summary line per part: counts only, never a name or a note's words. */
export function partLine(c: PartCount, mode: "plan" | "done"): string {
  const nothing = c.docs === 0 && c.demoDocs === 0;
  const verb =
    c.part.kind === "docs"
      ? mode === "done" ? "deleted" : "would delete"
      : mode === "done" ? "changed" : "would change";
  const what = c.part.kind === "docs" ? plural(c.docs, "document") : `${plural(c.fields, "field")} on ${plural(c.docs, "document")}`;
  const demo =
    c.demoDocs > 0
      ? c.part.kind === "docs"
        ? `; ${c.demoDocs.toLocaleString("en-US")} more in Demo Mode, left out`
        : `; ${plural(c.demoFields, "more field")} in Demo Mode, left out`
      : "";
  return `${c.part.label}: ${nothing ? "nothing" : c.docs === 0 ? "none here" : `${verb} ${what}`}${demo}`;
}
