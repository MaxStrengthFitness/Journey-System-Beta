/**
 * THE PRE-LAUNCH RESET: wipes the test sessions and everything built from
 * them, keeps the people, the bookings, the contracts, the studios, the
 * machines and the trainers (Oct 10 2026; AJ: "create the proper reset
 * script"). Read docs/ops/RESET-BEFORE-LAUNCH.md first: it is the runbook,
 * in plain words, with every command.
 *
 * What goes and what stays is decided in src/lib/test-reset.ts (pure,
 * tested); the backup format and the way back are src/lib/test-reset-codec.ts.
 * This file reads, prints, backs up and writes.
 *
 * DRY RUN BY DEFAULT: it reads everything, counts every group (taken or not),
 * prints how many documents it would write, and writes nothing without
 * --commit and --expect naming that number.
 *
 * USAGE (PowerShell, from the project folder)
 *
 *   Production (needs service-account.json, scripts/lib/admin.ts). The project
 *   and the database are named, the project twice:
 *     npx tsx scripts/reset-test-data.ts --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa --confirm-project gen-lang-client-0731527386
 *       dry run: what it would do, every optional group counted, and N
 *     ... --also settings,routines --commit --expect N
 *       the reset, with the optional groups chosen, exactly as the dry run said
 *
 *   Options:
 *     --also a,b,c            optional groups: imported-history, ford-briefing, settings,
 *                             settings-all, setting-history, routines, pulse,
 *                             floor-notes, prior-history, operations
 *     --before <ISO time>     setting-history and floor-notes take only what was written
 *                             before it (default: now)
 *     --include-demo          Demo Mode too (then press Reset in Demo Mode)
 *     --expect <n>            with --commit: the documents the dry run said it would write
 *     --ignore-open-sessions  commit although a session was open in the last 12 hours
 *     --after-cutover         commit although a studio has a Journey cutover date
 *                             (real sessions may be on the floor: they would go too)
 *     --settle-seconds <n>    how long the trainers' counts must stay still before
 *                             they are deleted (default 60)
 *     --key <path>            the service-account key (else ./service-account.json)
 *   Any other flag stops it: a typo must never be ignored.
 *
 *   The way back, from the backup a --commit wrote (newest backup first when
 *   there are several; never overwrites anything that exists now):
 *     ... --restore backups\reset-<stamp>             dry run
 *     ... --restore backups\reset-<stamp> --commit
 *
 *   Against an emulator (nothing leaves this computer):
 *     $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8085"
 *     npx tsx scripts/reset-test-data.ts --project demo-perf-lab --database perf-lab [--commit --expect N]
 *
 * WHAT IT PRINTS: ids and counts, never a client's name or a note's words.
 * The backup (backups/, git-ignored) holds the documents themselves.
 */

import fs from "node:fs";
import path from "node:path";
import { initializeApp } from "firebase-admin/app";
import {
  BulkWriter,
  DocumentReference,
  FieldPath,
  FieldValue,
  GeoPoint,
  Timestamp,
  getFirestore,
  type DocumentSnapshot,
  type Firestore,
  type Precondition,
} from "firebase-admin/firestore";
import {
  ABSENT,
  CLIENT_FIELDS_READ,
  EMPTY_INPUT,
  GROUP_WORDS,
  OPTIONAL_GROUPS,
  PARTS,
  blockingOpenSessions,
  parseAlso,
  partLine,
  partOf,
  planReset,
  plural,
  type DeleteStep,
  type DocIn,
  type FieldStep,
  type GroupId,
  type ResetInput,
  type ResetOptions,
  type ResetPlan,
} from "../src/lib/test-reset.ts";
import {
  BACKUP_FILE,
  BACKUP_VERSION,
  ENCODED_ABSENT,
  MANIFEST_FILE,
  decodeData,
  decodeValue,
  encodeData,
  encodeValue,
  isEncodedAbsent,
  parseBackupLines,
  planRestore,
  type BackupLine,
  type BackupManifest,
  type ValueKit,
} from "../src/lib/test-reset-codec.ts";

/** The live app's Firebase project and its named database (CLAUDE.md, Environments). */
const PRODUCTION = { projectId: "gen-lang-client-0731527386", databaseId: "ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa" } as const;

/* ------------------------------------------------------------------ *
 * The flags: every one known, anything else stops it
 * ------------------------------------------------------------------ */

const VALUE_FLAGS = ["also", "before", "settle-seconds", "key", "project", "database", "confirm-project", "restore", "expect"] as const;
const BOOL_FLAGS = ["commit", "include-demo", "ignore-open-sessions", "after-cutover"] as const;
/** Flags that say something about a reset and nothing about a restore. */
const RESET_ONLY = ["also", "before", "settle-seconds", "expect", "include-demo", "ignore-open-sessions", "after-cutover"] as const;

function parseFlags(argv: readonly string[]): { values: Map<string, string>; bools: Set<string> } {
  const values = new Map<string, string>();
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`"${arg}" isn't a flag, or follows one that takes no value. Nothing was read or written.`);
    const name = arg.slice(2);
    if ((BOOL_FLAGS as readonly string[]).includes(name)) {
      bools.add(name);
    } else if ((VALUE_FLAGS as readonly string[]).includes(name)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value. Nothing was read or written.`);
      if (values.has(name)) throw new Error(`--${name} is given twice. Nothing was read or written.`);
      values.set(name, value);
      i += 1;
    } else {
      throw new Error(
        `--${name} isn't a flag this script knows. The flags: ${[...VALUE_FLAGS, ...BOOL_FLAGS].map((f) => `--${f}`).join(" ")}. Nothing was read or written.`,
      );
    }
  }
  if (values.has("restore")) {
    const wrong = RESET_ONLY.filter((f) => values.has(f) || bools.has(f));
    if (wrong.length) throw new Error(`${wrong.map((f) => `--${f}`).join(", ")} ${wrong.length === 1 ? "is" : "are"} for a reset, not a restore. Nothing was read or written.`);
  }
  return { values, bools };
}

let FLAGS: ReturnType<typeof parseFlags> = { values: new Map(), bools: new Set() };
const hasFlag = (name: string) => FLAGS.bools.has(name);
const flag = (name: string): string | undefined => FLAGS.values.get(name);

/* ------------------------------------------------------------------ *
 * Connecting: say where first, and refuse anything ambiguous
 * ------------------------------------------------------------------ */

interface Target {
  db: Firestore;
  projectId: string;
  databaseId: string;
  emulator: boolean;
}

async function connect(): Promise<Target> {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulator) {
    // The emulator: no credential, no .env, and only on this computer.
    const projectId = flag("project") || process.env.GCLOUD_PROJECT || "";
    const databaseId = flag("database") || "(default)";
    console.log(`EMULATOR at ${emulator}: project ${projectId || "(none)"}, database ${databaseId}`);
    if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(emulator)) {
      throw new Error(`Refusing: FIRESTORE_EMULATOR_HOST is ${emulator}, not this computer.`);
    }
    if (projectId === PRODUCTION.projectId || databaseId === PRODUCTION.databaseId) {
      throw new Error(
        "Refusing: FIRESTORE_EMULATOR_HOST is set AND the production project or database is named. Which one did you mean? " +
          "For production, close this window and open a new PowerShell (the emulator setting goes with it). For the emulator, name its own project.",
      );
    }
    if (!projectId) throw new Error("Pass --project (the emulator's project, e.g. demo-perf-lab).");
    const app = initializeApp({ projectId });
    const db = databaseId === "(default)" ? getFirestore(app) : getFirestore(app, databaseId);
    return { db, projectId, databaseId, emulator: true };
  }

  // A real project: production only, named in full, the project twice.
  const projectId = flag("project") ?? "";
  const databaseId = flag("database") ?? "";
  console.log(`PRODUCTION: project ${projectId || "(not named)"}, database ${databaseId || "(not named)"}`);
  if (projectId !== PRODUCTION.projectId || databaseId !== PRODUCTION.databaseId) {
    throw new Error(
      `Refusing: outside an emulator this script runs only against production, named in full: ` +
        `--project ${PRODUCTION.projectId} --database ${PRODUCTION.databaseId} --confirm-project ${PRODUCTION.projectId}. Nothing was read or written.`,
    );
  }
  if (flag("confirm-project") !== projectId) {
    throw new Error(`Refusing: type the project id again with --confirm-project ${projectId} to go on. Nothing was read or written.`);
  }
  const admin = await import("./lib/admin.ts");
  const db = admin.connectFirestore();
  return { db, projectId, databaseId, emulator: false };
}

/* ------------------------------------------------------------------ *
 * The value kit: Firestore's own types in and out of the backup
 * ------------------------------------------------------------------ */

function kitFor(db: Firestore): ValueKit {
  return {
    timestampParts: (v) => (v instanceof Timestamp ? { seconds: v.seconds, nanoseconds: v.nanoseconds } : null),
    makeTimestamp: (s, n) => new Timestamp(s, n),
    geoPointParts: (v) => (v instanceof GeoPoint ? { latitude: v.latitude, longitude: v.longitude } : null),
    makeGeoPoint: (lat, lng) => new GeoPoint(lat, lng),
    refPath: (v) => (v instanceof DocumentReference ? v.path : null),
    makeRef: (p) => db.doc(p),
    bytesOf: (v) => (v instanceof Uint8Array ? v : null),
    makeBytes: (b) => Buffer.from(b),
  };
}

/* ------------------------------------------------------------------ *
 * Reading: whole collections, no query, no index
 * ------------------------------------------------------------------ */

const toDoc = (snap: DocumentSnapshot): DocIn => ({ path: snap.ref.path, data: (snap.data() ?? {}) as Record<string, unknown>, updateTime: snap.updateTime });

async function readCollection(db: Firestore, name: string, fields?: readonly string[]): Promise<DocIn[]> {
  const ref = db.collection(name);
  const snap = await (fields ? ref.select(...fields) : ref).get();
  return snap.docs.map(toDoc);
}

/** Every document in subcollections called `name` whose path matches `shape` (e.g. clients/x/ford/y). */
async function readGroup(db: Firestore, name: string, shape: RegExp, fields?: readonly string[]): Promise<DocIn[]> {
  const ref = db.collectionGroup(name);
  const snap = await (fields ? ref.select(...fields) : ref).get();
  return snap.docs.filter((d) => shape.test(d.ref.path)).map(toDoc);
}

/** At most `limit` of `run` at once. */
async function pool<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await run(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Every document filed under these documents, at any depth (a session's old `logs`, a routine's `planChanges`). */
async function readChildren(db: Firestore, parents: readonly DocIn[]): Promise<DocIn[]> {
  const found: DocIn[] = [];
  let level = parents.map((p) => db.doc(p.path));
  while (level.length > 0) {
    const nextLevel: DocumentReference[] = [];
    await pool(level, 16, async (ref) => {
      const subs = await ref.listCollections();
      for (const sub of subs) {
        const snap = await sub.get();
        for (const d of snap.docs) {
          found.push(toDoc(d));
          nextLevel.push(d.ref);
        }
      }
    });
    level = nextLevel;
  }
  return found;
}

function uniqueByPath(docs: DocIn[]): DocIn[] {
  const seen = new Map<string, DocIn>();
  for (const d of docs) if (!seen.has(d.path)) seen.set(d.path, d);
  return [...seen.values()];
}

/** The projection each list is read with (a re-read uses the same). */
const PROJECTION: Partial<Record<keyof ResetInput, readonly string[]>> = {
  clients: CLIENT_FIELDS_READ,
  trainers: ["rollups", "isDemo"],
  renewalCycles: ["outcome", "isDemo", "studioId"],
  studios: ["journeyCutoverDate", "isDemo", "name"],
};

async function readEverything(db: Firestore): Promise<ResetInput> {
  const sessions = await readCollection(db, "sessions");
  const routines = await readCollection(db, "routines");
  const [
    sessionChildren,
    routineChildren,
    exerciseLogs,
    sessionNotes,
    journalEntries,
    clinicalIncidents,
    clients,
    machineTotals,
    ford,
    trainers,
    trainerStats,
    leaderboards,
    clientStates,
    watch,
    acknowledgements,
    noteDismissals,
    clientMachineSettings,
    settingHistory,
    machineSettingChanges,
    routineAdjustments,
    progressReports,
    clientFocuses,
    trainerFocuses,
    focusRecords,
    floorNotes,
    watchlist,
    cases,
    dayLogs,
    renewalTouches,
    renewalCycles,
    studios,
  ] = await Promise.all([
    // Under each session, at any depth, and any old `logs` whose session document is gone.
    Promise.all([readChildren(db, sessions), readGroup(db, "logs", /^sessions\/[^/]+\/logs\/[^/]+$/)]).then(([a, b]) => uniqueByPath([...a, ...b])),
    Promise.all([readChildren(db, routines), readGroup(db, "planChanges", /^routines\/[^/]+\/planChanges\/[^/]+$/)]).then(([a, b]) => uniqueByPath([...a, ...b])),
    readCollection(db, "exerciseLogs"),
    readCollection(db, "sessionNotes"),
    readCollection(db, "journalEntries"),
    readCollection(db, "clinicalIncidents"),
    readCollection(db, "clients", PROJECTION.clients),
    readGroup(db, "machineTotals", /^clients\/[^/]+\/machineTotals\/[^/]+$/),
    readGroup(db, "ford", /^clients\/[^/]+\/ford\/[^/]+$/),
    readCollection(db, "trainers", PROJECTION.trainers),
    readGroup(db, "stats", /^trainers\/[^/]+\/stats\/[^/]+$/),
    readCollection(db, "leaderboards"),
    readGroup(db, "clientStates", /^studios\/[^/]+\/clientStates\/[^/]+$/),
    readGroup(db, "watch", /^studios\/[^/]+\/watch\/[^/]+$/),
    readGroup(db, "acknowledgements", /^studios\/[^/]+\/acknowledgements\/[^/]+$/),
    readCollection(db, "noteDismissals"),
    readCollection(db, "clientMachineSettings"),
    readGroup(db, "settingHistory", /^machines\/[^/]+\/settingHistory\/[^/]+$/),
    readCollection(db, "machineSettingChanges"),
    readCollection(db, "routineAdjustments"),
    readCollection(db, "progressReports"),
    readCollection(db, "clientFocuses"),
    readCollection(db, "trainerFocuses"),
    readCollection(db, "focusRecords"),
    readGroup(db, "floorNotes", /^studios\/[^/]+\/floorNotes\/[^/]+$/),
    readGroup(db, "watchlist", /^studios\/[^/]+\/watchlist\/[^/]+$/),
    readGroup(db, "cases", /^studios\/[^/]+\/cases\/[^/]+$/),
    readGroup(db, "dayLogs", /^studios\/[^/]+\/dayLogs\/[^/]+$/),
    readGroup(db, "touches", /^studios\/[^/]+\/renewals\/[^/]+\/touches\/[^/]+$/),
    readGroup(db, "renewals", /^studios\/[^/]+\/renewals\/[^/]+$/, PROJECTION.renewalCycles),
    readCollection(db, "studios", PROJECTION.studios),
  ]);
  return {
    ...EMPTY_INPUT,
    sessions,
    sessionChildren,
    exerciseLogs,
    sessionNotes,
    journalEntries,
    clinicalIncidents,
    clients,
    machineTotals,
    ford,
    trainers,
    trainerStats,
    leaderboards,
    clientStates,
    watch,
    acknowledgements,
    noteDismissals,
    clientMachineSettings,
    settingHistory,
    machineSettingChanges,
    routines,
    routineChildren,
    routineAdjustments,
    progressReports,
    clientFocuses,
    trainerFocuses,
    focusRecords,
    floorNotes,
    watchlist,
    cases,
    dayLogs,
    renewalTouches,
    renewalCycles,
    studios,
  };
}

/** Reads these documents again, each with its list's projection; null for one that is gone. */
async function reread(db: Firestore, input: ResetInput, paths: readonly string[]): Promise<Map<string, DocIn | null>> {
  const listOf = new Map<string, keyof ResetInput>();
  for (const key of Object.keys(input) as (keyof ResetInput)[]) for (const d of input[key]) listOf.set(d.path, key);
  const out = new Map<string, DocIn | null>();
  const byMask = new Map<string, string[]>();
  for (const p of paths) {
    const list = listOf.get(p);
    const mask = list ? PROJECTION[list] : undefined;
    const key = mask ? mask.join(",") : "";
    byMask.set(key, [...(byMask.get(key) ?? []), p]);
  }
  for (const [key, group] of byMask) {
    for (let i = 0; i < group.length; i += 300) {
      const refs = group.slice(i, i + 300).map((p) => db.doc(p));
      const snaps = key ? await db.getAll(...refs, { fieldMask: key.split(",") }) : await db.getAll(...refs);
      for (const s of snaps) out.set(s.ref.path, s.exists ? toDoc(s) : null);
    }
  }
  return out;
}

/** The input with these documents as they are now (gone ones taken out). */
function withFresh(input: ResetInput, fresh: Map<string, DocIn | null>): ResetInput {
  const out = { ...input } as ResetInput;
  for (const key of Object.keys(input) as (keyof ResetInput)[]) {
    if (!input[key].some((d) => fresh.has(d.path))) continue;
    out[key] = input[key].flatMap((d) => (fresh.has(d.path) ? (fresh.get(d.path) ? [fresh.get(d.path)!] : []) : [d]));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Printing the plan
 * ------------------------------------------------------------------ */

const GROUP_ORDER: GroupId[] = ["core", ...OPTIONAL_GROUPS];

function printPlan(plan: ResetPlan, groups: ReadonlySet<GroupId>) {
  for (const group of GROUP_ORDER) {
    const counts = plan.counts.filter((c) => c.part.group === group);
    const taken = groups.has(group);
    const any = counts.some((c) => c.docs > 0 || c.demoDocs > 0);
    console.log("");
    console.log(`${group}${group === "core" ? "" : taken ? "  [ASKED FOR]" : "  [not asked for: --also " + group + "]"}: ${GROUP_WORDS[group]}`);
    if (!any) {
      console.log("    nothing to do");
      continue;
    }
    for (const c of counts) {
      if (c.docs === 0 && c.demoDocs === 0) continue;
      console.log(`    ${partLine(c, "plan")}`);
    }
  }
}

function printOpenSessions(plan: ResetPlan, includeDemo: boolean) {
  const open = plan.openSessions.filter((s) => includeDemo || !s.demo);
  if (open.length === 0) {
    console.log("Open sessions: none.");
    return;
  }
  const recent = open.filter((s) => s.recent);
  console.log(`Open sessions (not finished): ${open.length}, of which ${recent.length} had a sign of life in the last 12 hours.`);
  for (const s of recent) {
    console.log(`    ${s.path}  last sign of life ${s.lastSignMs === null ? "not recorded" : new Date(s.lastSignMs).toISOString()}`);
  }
}

function printChecklist() {
  console.log("");
  console.log("BEFORE --commit (docs/ops/RESET-BEFORE-LAUNCH.md):");
  console.log("  [ ] Nobody is in a session on any iPad or phone, at any studio.");
  console.log("  [ ] Every iPad has been online with Journey open for a minute since its last session (its queue is sent).");
  console.log("  [ ] Not between 2 and 4 in the morning Eastern (the nightly jobs run then).");
  console.log("AFTER it: sign every iPad out (and back in), so no screen keeps the old numbers in memory.");
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/** Codes worth another try at once: deadline, exhausted, aborted, internal, unavailable. */
const RETRYABLE = new Set([4, 8, 10, 13, 14]);
/** FAILED_PRECONDITION: the document changed since it was read (Mindbody's webhook, mostly). */
const CHANGED = 9;
/** Rounds of reading a changed document again and planning it again. */
const RETRY_ROUNDS = 3;

function writer(db: Firestore): BulkWriter {
  const w = db.bulkWriter();
  w.onWriteError((err) => RETRYABLE.has(Number(err.code)) && err.failedAttempts < 10);
  return w;
}

interface Failure {
  path: string;
  /** A delete, or a field step on a document kept. */
  kind: "doc" | "fields";
  parts: string[];
  code: number | null;
  why: string;
}

interface PhaseResult {
  ok: Map<string, number>;
  failed: Failure[];
}

const errWords = (err: unknown): string => {
  const e = err as { code?: unknown; message?: unknown };
  if (Number(e?.code) === CHANGED) return "changed since it was read";
  if (Number(e?.code) === 5) return "not there any more";
  if (Number(e?.code) === 6) return "already there";
  return String(e?.message ?? err).split("\n")[0].slice(0, 160);
};

type PreconditionKind = "update-time" | "exists" | "none";

function preconditionOf(kind: PreconditionKind, updateTime: unknown): Precondition | undefined {
  if (kind === "exists") return { exists: true };
  if (kind === "update-time" && updateTime instanceof Timestamp) return { lastUpdateTime: updateTime };
  return undefined;
}

/** A field change as BulkWriter.update's variadic arguments. */
function updateArgs(changes: { field: string[]; value: unknown }[]): unknown[] {
  const args: unknown[] = [];
  for (const c of changes) args.push(new FieldPath(...c.field), c.value);
  return args;
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (v !== undefined) out[k] = stripUndefined(v);
    return out;
  }
  return value;
}

async function runPhase(db: Firestore, deletes: readonly DeleteStep[], fieldSteps: readonly FieldStep[], kind: PreconditionKind): Promise<PhaseResult> {
  const result: PhaseResult = { ok: new Map(), failed: [] };
  const w = writer(db);
  const settle = (what: Failure["kind"], parts: string[], at: string, p: Promise<unknown>) =>
    p.then(
      () => {
        for (const part of parts) result.ok.set(part, (result.ok.get(part) ?? 0) + 1);
      },
      (err) => {
        const code = Number((err as { code?: unknown })?.code);
        result.failed.push({ path: at, kind: what, parts, code: Number.isFinite(code) ? code : null, why: errWords(err) });
      },
    );
  const pending: Promise<unknown>[] = [];
  for (const d of deletes) {
    const pre = preconditionOf(kind, d.updateTime);
    pending.push(settle("doc", [d.part], d.path, pre ? w.delete(db.doc(d.path), pre) : w.delete(db.doc(d.path))));
  }
  for (const step of fieldSteps) {
    const changes = step.changes.map((c) => ({ field: c.field, value: c.after === ABSENT ? FieldValue.delete() : stripUndefined(c.after) }));
    const args = updateArgs(changes);
    const pre = preconditionOf(kind, step.updateTime);
    if (pre) args.push(pre);
    const [first, firstValue, ...rest] = args;
    // One update per document, counted under every part it touched.
    const parts = [...new Set(step.changes.map((c) => c.part))];
    pending.push(settle("fields", parts, step.path, w.update(db.doc(step.path), first as FieldPath, firstValue, ...(rest as never[]))));
  }
  await w.close();
  await Promise.all(pending);
  return result;
}

/** Waits until the trainers' counts documents have stopped changing for `quietMs` (the session delete trigger writes them). */
async function waitForTrainerCounts(db: Firestore, quietMs: number, maxMs: number): Promise<boolean> {
  const start = Date.now();
  let last = "";
  let stillSince = Date.now();
  for (;;) {
    const snap = await db.collectionGroup("stats").select().get();
    const sig = snap.docs
      .filter((d) => /^trainers\/[^/]+\/stats\/rollups$/.test(d.ref.path))
      .map((d) => `${d.ref.path}@${d.updateTime.toMillis()}`)
      .sort()
      .join("|");
    if (sig !== last) {
      last = sig;
      stillSince = Date.now();
    }
    if (Date.now() - stillSince >= quietMs) return true;
    if (Date.now() - start >= maxMs) return false;
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, Math.min(5000, Math.max(500, quietMs / 4))));
  }
}

/* ------------------------------------------------------------------ *
 * The backup
 * ------------------------------------------------------------------ */

function backupLinesOf(deletes: readonly DeleteStep[], fieldSteps: readonly FieldStep[], kit: ValueKit): BackupLine[] {
  const lines: BackupLine[] = [];
  for (const d of deletes) {
    lines.push({ kind: "doc", path: d.path, group: d.group, part: d.part, data: encodeData(d.data, kit, d.path) });
  }
  for (const step of fieldSteps) {
    lines.push({
      kind: "fields",
      path: step.path,
      changes: step.changes.map((c) => ({
        field: c.field,
        group: c.group,
        part: c.part,
        before: c.before === ABSENT ? ENCODED_ABSENT : encodeValue(c.before, kit, `${step.path}.${c.field.join(".")}`),
        after: c.after === ABSENT ? ENCODED_ABSENT : encodeValue(stripUndefined(c.after), kit, `${step.path}.${c.field.join(".")}`),
      })),
    });
  }
  return lines;
}

/** Appends lines to the backup and makes sure they are on the disk before any write they cover. */
function appendBackup(dir: string, lines: readonly BackupLine[]) {
  const fd = fs.openSync(path.join(dir, BACKUP_FILE), "a");
  try {
    for (const line of lines) fs.writeSync(fd, `${JSON.stringify(line)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function writeBackup(dir: string, lines: readonly BackupLine[], manifest: BackupManifest) {
  fs.mkdirSync(dir, { recursive: true });
  appendBackup(dir, lines);
  writeManifest(dir, manifest);
  // Read it back: a backup that can't be parsed is no backup.
  const back = parseBackupLines(fs.readFileSync(path.join(dir, BACKUP_FILE), "utf8"));
  if (back.length !== lines.length) throw new Error(`The backup reads back ${back.length} lines, not ${lines.length}. Nothing was changed.`);
}

/** Written to a file beside it and renamed over it: a manifest is never half written. */
function writeManifest(dir: string, manifest: BackupManifest) {
  const file = path.join(dir, MANIFEST_FILE);
  const temp = `${file}.writing`;
  const fd = fs.openSync(temp, "w");
  try {
    fs.writeSync(fd, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, file);
}

/** When the test sessions began, as the newest earlier backup of this database worked it out. */
function earlierEraStart(target: Target): { ms: number; dir: string } | null {
  const root = path.resolve(process.cwd(), "backups");
  if (!fs.existsSync(root)) return null;
  let found: { ms: number; dir: string } | null = null;
  for (const name of fs.readdirSync(root).filter((n) => n.startsWith("reset-")).sort()) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(root, name, MANIFEST_FILE), "utf8")) as BackupManifest;
      if (m.projectId !== target.projectId || m.databaseId !== target.databaseId) continue;
      if (typeof m.eraStartMs === "number" && (found === null || m.eraStartMs < found.ms)) found = { ms: m.eraStartMs, dir: name };
    } catch {
      /* not a reset backup */
    }
  }
  return found;
}

/* ------------------------------------------------------------------ *
 * The follow-up commands
 * ------------------------------------------------------------------ */

function followUps(target: Target, includeDemo: boolean, groups: ReadonlySet<GroupId>) {
  const where = target.emulator
    ? ` --project ${target.projectId}${target.databaseId === "(default)" ? "" : ` --database ${target.databaseId}`}`
    : "";
  console.log("");
  console.log("CHECK: the dry run (the same command without --commit and --expect) should now find nothing left (Demo Mode aside). Run it before the jobs below.");
  console.log("NEXT, in this order (each is a dry run without --commit; run it once without to look):");
  console.log(`  1. npx tsx scripts/rebuild-machine-fit.ts${where} --commit`);
  console.log(`       the machine-fit index from the set-ups that are left${groups.has("settings-all") || groups.has("settings") ? "" : " (only the open sessions' ghost set-ups went, so little changes)"}`);
  console.log(`  2. npx tsx scripts/run-machine-trends.ts${where} --commit`);
  console.log("       machine trends, Kaizen reports, the performance watch and Openings, from no sets");
  console.log(`  3. npx tsx scripts/run-renewals.ts${where} --commit --max-pulls 0 --first-sync-max 0`);
  console.log("       renewal snapshots and month tallies again, with no Mindbody call (client states only for a studio past its cutover)");
  console.log("  4. Sign every iPad out and back in.");
  if (includeDemo) console.log("  5. In the app: Demo Mode, Reset, so the practice studio has its sessions again.");
  console.log("  The nightly jobs and the trainers' counts (3 AM) carry on by themselves from tonight.");
}

/* ------------------------------------------------------------------ *
 * The reset
 * ------------------------------------------------------------------ */

async function reset(target: Target) {
  const { db } = target;
  const commit = hasFlag("commit");
  const includeDemo = hasFlag("include-demo");
  const { groups, unknown, note } = parseAlso(flag("also"));
  if (unknown.length > 0) {
    throw new Error(`--also names ${unknown.join(", ")}, which ${unknown.length === 1 ? "isn't a group" : "aren't groups"}. The groups: ${OPTIONAL_GROUPS.join(", ")}.`);
  }
  const nowMs = Date.now();
  const beforeText = flag("before");
  const beforeMs = beforeText ? Date.parse(beforeText) : nowMs;
  if (Number.isNaN(beforeMs)) throw new Error(`--before ${beforeText} isn't a time (try 2026-11-01T00:00:00-04:00).`);
  const settleSeconds = flag("settle-seconds") !== undefined ? Number(flag("settle-seconds")) : 60;
  if (!Number.isFinite(settleSeconds) || settleSeconds < 0) throw new Error("--settle-seconds takes a number of seconds.");
  const expectText = flag("expect");
  if (expectText !== undefined && !/^\d+$/.test(expectText)) throw new Error(`--expect takes the number of documents the dry run printed, not "${expectText}".`);
  if (expectText !== undefined && !commit) throw new Error("--expect goes with --commit.");

  console.log(commit ? "COMMIT: the reset below will be written, after a backup." : "DRY RUN: nothing will be written.");
  console.log(`Groups: ${[...groups].join(", ")}${includeDemo ? ", and Demo Mode" : " (Demo Mode left out)"}.`);
  if (note) console.log(note);
  console.log(`"Before" for setting history and floor notes: ${new Date(beforeMs).toISOString()}.`);
  const earlier = earlierEraStart(target);
  console.log("Reading...");
  const input = await readEverything(db);
  console.log(
    `Read ${plural(input.sessions.length, "session")}, ${plural(input.exerciseLogs.length, "set")}, ${plural(input.journalEntries.length, "client note")}, ` +
      `${plural(input.clients.length, "client")}, ${plural(input.trainers.length, "trainer")}, ${plural(input.studios.length, "studio")}.`,
  );

  const options: ResetOptions = { groups, includeDemo, beforeMs, nowMs, eraStartMs: earlier?.ms ?? null };
  const plan = planReset(input, options);
  printPlan(plan, groups);
  console.log("");
  if (plan.sessionEraStartMs !== null) {
    const fromEarlier = earlier !== null && earlier.ms === plan.sessionEraStartMs;
    console.log(
      `The test sessions began ${new Date(plan.sessionEraStartMs).toISOString()}` +
        `${fromEarlier ? ` (as the earlier run of ${earlier!.dir} read it)` : ""}: a first-session date, a backfilled first visit or a Confirm from before then is kept.`,
    );
  } else {
    console.log("No test session is left to say when they began, and no earlier backup here says it: the first-session dates, backfilled first visits and Confirms are all kept.");
  }
  if (plan.firstSessionClearIds.length > 0) {
    console.log(`First-session dates to clear (client ids): ${plan.firstSessionClearIds.join(", ")}`);
  }
  if (plan.leftAlone.length > 0) {
    console.log("Left alone (for you to decide; this reset never changes them):");
    for (const l of plan.leftAlone) console.log(`    ${l.label}: ${l.count.toLocaleString("en-US")}`);
  }
  if (plan.cutoverStudios.length > 0) {
    console.log(
      `STUDIOS PAST A JOURNEY CUTOVER: ${plan.cutoverStudios.map((s) => `${s.id} (${s.day})`).join(", ")}. ` +
        "Real sessions may be on the floor there, and this reset would take them too. A commit needs --after-cutover.",
    );
  }
  printOpenSessions(plan, includeDemo);
  const docs = plan.deletes.length;
  const fieldDocs = plan.fieldSteps.length;
  const fields = plan.fieldSteps.reduce((n, s) => n + s.changes.length, 0);
  console.log("");
  console.log(
    `PLANNED: ${plural(plan.plannedDocuments, "document")} (${docs.toLocaleString("en-US")} deleted, ${fieldDocs.toLocaleString("en-US")} kept with ${plural(fields, "field")} changed).`,
  );

  if (!commit) {
    printChecklist();
    console.log("");
    if (plan.plannedDocuments === 0) console.log("Nothing to do: the reset has nothing left to take.");
    else console.log(`Nothing was written. To commit exactly this, add: --commit --expect ${plan.plannedDocuments}`);
    return;
  }

  if (plan.plannedDocuments === 0) {
    console.log("Nothing to do: the reset has nothing left to take. Nothing was written.");
    return;
  }
  if (expectText === undefined || Number(expectText) !== plan.plannedDocuments) {
    throw new Error(
      expectText === undefined
        ? `Refusing: --commit needs --expect ${plan.plannedDocuments}, the number the dry run printed. Nothing was written.`
        : `Refusing: --expect ${expectText}, but this run would write ${plan.plannedDocuments}. Something changed since the dry run; run it again and look. Nothing was written.`,
    );
  }
  if (plan.cutoverStudios.length > 0 && !hasFlag("after-cutover")) {
    throw new Error("Refusing: a studio is past its Journey cutover (listed above), so real sessions may be in Journey. Add --after-cutover only if you are sure. Nothing was written.");
  }
  const blocking = blockingOpenSessions(plan, includeDemo);
  if (blocking.length > 0 && !hasFlag("ignore-open-sessions")) {
    printChecklist();
    throw new Error(
      `Refusing: ${plural(blocking.length, "session")} ${blocking.length === 1 ? "was" : "were"} open in the last 12 hours (listed above). ` +
        "An iPad still in a session would send it back from its queue. Finish or discard it, wait for the iPad to sync, " +
        "or add --ignore-open-sessions if you are sure no iPad holds it. Nothing was written.",
    );
  }

  // The backup: every document deleted and every field changed, before any write.
  const kit = kitFor(db);
  const lines = backupLinesOf(plan.deletes, plan.fieldSteps, kit);
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve(process.cwd(), "backups", `reset-${stamp}`);
  const manifest: BackupManifest = {
    version: BACKUP_VERSION,
    projectId: target.projectId,
    databaseId: target.databaseId,
    startedAt: startedAt.toISOString(),
    groups: [...groups],
    includeDemo,
    before: new Date(beforeMs).toISOString(),
    documents: docs,
    fieldDocuments: fieldDocs,
    fields,
    eraStartMs: plan.sessionEraStartMs,
  };
  writeBackup(dir, lines, manifest);
  const minute = new Date(Math.floor(startedAt.getTime() / 60_000) * 60_000).toISOString().replace(":00.000Z", " UTC");
  console.log("");
  console.log(`Backup: ${dir} (${plural(lines.length, "line")}; the way back is --restore "${dir}").`);
  console.log(`POINT-IN-TIME RECOVERY: nothing was written before ${startedAt.toISOString()} (UTC). The minute to ask for is ${minute}.`);

  const done = new Map<string, number>();
  const failed: Failure[] = [];
  const tally = (r: PhaseResult) => {
    for (const [part, n] of r.ok) done.set(part, (done.get(part) ?? 0) + n);
  };

  // 1. The trainers' old counts map, so a delete trigger can't copy it into a
  //    new counts document. Nothing else writes it, so it is cleared whatever
  //    else changed on the trainer; and if it can't be, nothing else starts.
  const early = { deletes: plan.deletes.filter((d) => d.phase === "early"), fields: plan.fieldSteps.filter((s) => s.phase === "early") };
  if (early.deletes.length + early.fields.length > 0) {
    const r = await runPhase(db, early.deletes, early.fields, "exists");
    tally(r);
    if (r.failed.length > 0) {
      for (const f of r.failed) console.log(`    ${f.path}: ${f.why}`);
      throw new Error(
        `Stopped before deleting anything: ${plural(r.failed.length, "trainer")}' old counts couldn't be cleared (above). ` +
          `Nothing else was written; the backup ${dir} holds the trainers' counts as they were. Look at the trainers above, then run the dry run again.`,
      );
    }
  }

  // The emulator proof's stand-in for Mindbody's webhook writing between the
  // read and the write (docs/ops/RESET-BEFORE-LAUNCH.md, "How it was proved").
  // Never read outside an emulator.
  const touch = target.emulator ? process.env.RESET_PROOF_TOUCH : undefined;
  if (touch) {
    for (const spec of touch.split(";").filter(Boolean)) {
      const at = spec.indexOf("=");
      await db.doc(spec.slice(0, at)).update(JSON.parse(spec.slice(at + 1)) as Record<string, unknown>);
      console.log(`(proof: ${spec.slice(0, at)} changed after the read)`);
    }
  }

  // 2. Everything else, each against the version that was backed up. A
  //    document that changed since it was read (Mindbody's webhook) is read
  //    again, planned again, backed up again and written again.
  const main = { deletes: plan.deletes.filter((d) => d.phase === "main"), fields: plan.fieldSteps.filter((s) => s.phase === "main") };
  console.log(`Writing: ${plural(main.deletes.length, "delete")}, ${plural(main.fields.length, "document")} with fields changed...`);
  let r = await runPhase(db, main.deletes, main.fields, "update-time");
  tally(r);
  let retries = 0;
  let changedSince = r.failed.filter((f) => f.code === CHANGED);
  failed.push(...r.failed.filter((f) => f.code !== CHANGED));
  let current = input;
  for (let round = 1; round <= RETRY_ROUNDS && changedSince.length > 0; round += 1) {
    const paths = [...new Set(changedSince.map((f) => f.path))];
    console.log(`Round ${round}: ${plural(paths.length, "document")} changed since they were read; reading them again.`);
    const fresh = await reread(db, current, paths);
    current = withFresh(current, fresh);
    const again = planReset(current, { ...options, eraStartMs: plan.sessionEraStartMs });
    const wanted = new Set(paths);
    const del = again.deletes.filter((d) => d.phase === "main" && wanted.has(d.path));
    const steps = again.fieldSteps.filter((s) => s.phase === "main" && wanted.has(s.path));
    const stepPaths = new Set(steps.map((s) => s.path));
    const delPaths = new Set(del.map((d) => d.path));
    // A kept document whose changes are all as wanted now still gets a line,
    // empty, so a restore never brings back the stale one (the codec: the
    // last line for a document wins, whole).
    const empty = changedSince
      .filter((f) => f.kind === "fields" && fresh.get(f.path) && !stepPaths.has(f.path))
      .map((f): BackupLine => ({ kind: "fields", path: f.path, changes: [] }));
    appendBackup(dir, [...backupLinesOf(del, steps, kit), ...empty]);
    retries += paths.length;
    // Nothing left to do for it (gone, or already as wanted): done.
    for (const f of changedSince.filter((x) => !stepPaths.has(x.path) && !delPaths.has(x.path))) {
      for (const part of f.parts) done.set(part, (done.get(part) ?? 0) + 1);
    }
    r = await runPhase(db, del, steps, "update-time");
    tally(r);
    changedSince = r.failed.filter((f) => f.code === CHANGED);
    failed.push(...r.failed.filter((f) => f.code !== CHANGED));
  }
  failed.push(...changedSince);

  // 3. The trainers' counts, once the session delete trigger has stopped writing them.
  const late = { deletes: plan.deletes.filter((d) => d.phase === "late"), fields: plan.fieldSteps.filter((s) => s.phase === "late") };
  if (late.deletes.length + late.fields.length > 0) {
    if (plan.countedSessionsDeleted > 0) {
      console.log(
        `Waiting for the trainers' counts to settle: ${plural(plan.countedSessionsDeleted, "counted session")} went, and each delete runs a trigger that takes one off ` +
          `(${settleSeconds} s without a change, at most 15 minutes)`,
      );
      const settled = await waitForTrainerCounts(db, settleSeconds * 1000, 15 * 60 * 1000);
      console.log(settled ? " settled." : " still changing after 15 minutes; deleting them now. Tomorrow morning's dry run shows any the trigger wrote after.");
    }
    r = await runPhase(db, late.deletes, late.fields, "none");
    tally(r);
    failed.push(...r.failed);
  }

  manifest.finishedAt = new Date().toISOString();
  manifest.retries = retries;
  writeManifest(dir, manifest);

  // What was done, per part.
  console.log("");
  console.log("DONE:");
  for (const part of PARTS) {
    const ok = done.get(part.id) ?? 0;
    const not = failed.filter((f) => f.parts.includes(part.id));
    if (ok === 0 && not.length === 0) continue;
    const spec = partOf(part.id);
    console.log(`    ${spec.label}: ${plural(ok, "document")} ${spec.kind === "docs" ? "deleted" : "changed"}${not.length ? `, ${not.length} not` : ""}`);
    for (const f of not.slice(0, 20)) console.log(`        ${f.path}: ${f.why}`);
    if (not.length > 20) console.log(`        ... and ${not.length - 20} more`);
  }
  if (retries > 0) console.log(`(${plural(retries, "document")} had changed since the read and ${retries === 1 ? "was" : "were"} read and planned again.)`);
  const failedDocs = new Set(failed.map((f) => f.path)).size;
  console.log(
    failedDocs === 0
      ? "Every write landed."
      : `${plural(failedDocs, "document")} did not take the reset. Tomorrow morning, run the dry run again and look; commit what it shows with its own --expect.`,
  );
  followUps(target, includeDemo, groups);
}

/* ------------------------------------------------------------------ *
 * The way back
 * ------------------------------------------------------------------ */

/** A field name no document has: asked for, it reads whether the document exists and nothing else. */
const EXISTS_PROBE = "resetExistsProbe";

async function restore(target: Target, dirArg: string) {
  const { db } = target;
  const commit = hasFlag("commit");
  const dir = path.resolve(process.cwd(), dirArg);
  const manifestFile = path.join(dir, MANIFEST_FILE);
  const backupFile = path.join(dir, BACKUP_FILE);
  if (!fs.existsSync(manifestFile) || !fs.existsSync(backupFile)) {
    throw new Error(`${dir} has no ${MANIFEST_FILE} and ${BACKUP_FILE}: not a reset backup.`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as BackupManifest;
  if (manifest.version !== BACKUP_VERSION) throw new Error(`The backup is version ${manifest.version}; this script reads ${BACKUP_VERSION}.`);
  if (manifest.projectId !== target.projectId || manifest.databaseId !== target.databaseId) {
    throw new Error(`Refusing: the backup is of ${manifest.projectId} / ${manifest.databaseId}, and this is ${target.projectId} / ${target.databaseId}.`);
  }
  const lines = parseBackupLines(fs.readFileSync(backupFile, "utf8"));
  console.log(commit ? "COMMIT: the backup below will be put back." : "DRY RUN: nothing will be written.");
  console.log(`Backup of ${manifest.startedAt}${manifest.finishedAt ? "" : " (that run stopped part way)"}: ${plural(lines.length, "line")}.`);
  const newer = fs
    .readdirSync(path.dirname(dir))
    .filter((n) => n.startsWith("reset-") && n > path.basename(dir))
    .filter((n) => {
      try {
        const m = JSON.parse(fs.readFileSync(path.join(path.dirname(dir), n, MANIFEST_FILE), "utf8")) as BackupManifest;
        return m.projectId === target.projectId && m.databaseId === target.databaseId;
      } catch {
        return false;
      }
    });
  if (newer.length > 0) {
    console.log(`NOTE: ${plural(newer.length, "later reset backup")} of this database ${newer.length === 1 ? "is" : "are"} beside it (${newer.join(", ")}). Restore the newest first, then this one.`);
  }

  // What is there now: every backed-up document, by id (no query), reading
  // only the fields a restore compares.
  const kit = kitFor(db);
  const docPaths = [...new Set(lines.filter((l) => l.kind === "doc").map((l) => l.path))];
  const fieldLines = lines.filter((l): l is Extract<BackupLine, { kind: "fields" }> => l.kind === "fields");
  const fieldPaths = [...new Set(fieldLines.map((l) => l.path))];
  const mask = [...new Map(fieldLines.flatMap((l) => l.changes.map((c) => [c.field.join("\u0000"), new FieldPath(...c.field)] as const))).values()];
  const existsNow = new Set<string>();
  const current = new Map<string, { data: Record<string, unknown>; updateTime: Timestamp }>();
  for (let i = 0; i < docPaths.length; i += 300) {
    const snaps = await db.getAll(...docPaths.slice(i, i + 300).map((p) => db.doc(p)), { fieldMask: [EXISTS_PROBE] });
    for (const s of snaps) if (s.exists) existsNow.add(s.ref.path);
  }
  for (let i = 0; i < fieldPaths.length; i += 300) {
    const refs = fieldPaths.slice(i, i + 300).map((p) => db.doc(p));
    const snaps = await db.getAll(...refs, { fieldMask: mask.length ? mask : [EXISTS_PROBE] });
    for (const s of snaps) {
      if (!s.exists) continue;
      current.set(s.ref.path, { data: encodeData((s.data() ?? {}) as Record<string, unknown>, kit, s.ref.path), updateTime: s.updateTime! });
    }
  }
  const plan = planRestore(lines, existsNow, (p) => current.get(p)?.data ?? null);

  const byPart = new Map<string, { create: number; exists: number }>();
  for (const l of plan.create) {
    const o = byPart.get(l.part) ?? { create: 0, exists: 0 };
    o.create += 1;
    byPart.set(l.part, o);
  }
  for (const l of plan.docsExistingNow) {
    const o = byPart.get(l.part) ?? { create: 0, exists: 0 };
    o.exists += 1;
    byPart.set(l.part, o);
  }
  console.log("");
  for (const [part, o] of byPart) {
    const label = PARTS.find((p) => p.id === part)?.label ?? part;
    console.log(`    ${label}: ${commit ? "" : "would "}create ${plural(o.create, "document")}${o.exists ? `; ${plural(o.exists, "is", "are")} there now, left alone` : ""}`);
  }
  const fieldCount = plan.fields.reduce((n, f) => n + f.restores.length, 0);
  console.log(`    Fields: ${commit ? "" : "would "}put back ${plural(fieldCount, "field")} on ${plural(plan.fields.length, "document")}`);
  if (plan.fieldsChangedSince.length) {
    console.log(`    ${plural(plan.fieldsChangedSince.length, "field")} changed since the reset, left alone:`);
    for (const f of plan.fieldsChangedSince.slice(0, 20)) console.log(`        ${f.path} ${f.field.join(".")}`);
  }
  if (plan.fieldDocsGone.length) console.log(`    ${plural(plan.fieldDocsGone.length, "document")} whose fields changed are gone now, left alone.`);
  if (plan.docsExistingNow.some((l) => l.part === "trainer-stats")) {
    console.log(
      "    A trainer's counts document is there again (the 3 AM job makes one every night), so the old one stays out. " +
        "After this restore: Admins, Machinery, System tools, Rebuild trainer rollups, Rebuild. It counts every session again.",
    );
  }

  if (!commit) {
    console.log("");
    console.log("Nothing was written. Add --commit to put it back.");
    return;
  }

  const results = new Map<string, { ok: number; failed: { path: string; why: string }[] }>();
  const note = (part: string, ok: boolean, at: string, why?: string) => {
    const o = results.get(part) ?? { ok: 0, failed: [] };
    if (ok) o.ok += 1;
    else o.failed.push({ path: at, why: why ?? "" });
    results.set(part, o);
  };
  // The trainers' counts first: each session put back runs the trigger, which
  // must find its trainer's count there (a counted session changes nothing).
  const first = plan.create.filter((l) => l.part === "trainer-stats");
  const rest = plan.create.filter((l) => l.part !== "trainer-stats");
  const trainerFieldPaths = new Set(fieldLines.filter((l) => l.changes.some((c) => c.part === "trainer-legacy-rollups")).map((l) => l.path));
  const firstFields = plan.fields.filter((f) => trainerFieldPaths.has(f.path));
  const restFields = plan.fields.filter((f) => !trainerFieldPaths.has(f.path));
  for (const [docs, fieldsToRestore] of [[first, firstFields], [rest, restFields]] as const) {
    const w = writer(db);
    const pending: Promise<unknown>[] = [];
    for (const l of docs) {
      pending.push(w.create(db.doc(l.path), decodeData(l.data, kit)).then(() => note(l.part, true, l.path), (err) => note(l.part, false, l.path, errWords(err))));
    }
    for (const f of fieldsToRestore) {
      const changes = f.restores.map((r) => ({ field: r.field, value: isEncodedAbsent(r.value) ? FieldValue.delete() : decodeValue(r.value, kit) }));
      const args = updateArgs(changes);
      const at = current.get(f.path);
      if (at) args.push({ lastUpdateTime: at.updateTime });
      const [firstArg, firstValue, ...others] = args;
      pending.push(
        w.update(db.doc(f.path), firstArg as FieldPath, firstValue, ...(others as never[])).then(
          () => note("fields", true, f.path),
          (err) => note("fields", false, f.path, errWords(err)),
        ),
      );
    }
    await w.close();
    await Promise.all(pending);
  }
  console.log("");
  console.log("DONE:");
  let failures = 0;
  for (const [part, o] of results) {
    const label = PARTS.find((p) => p.id === part)?.label ?? (part === "fields" ? "Documents with fields put back" : part);
    console.log(`    ${label}: ${plural(o.ok, "document")} put back${o.failed.length ? `, ${o.failed.length} not` : ""}`);
    for (const f of o.failed.slice(0, 20)) console.log(`        ${f.path}: ${f.why}`);
    failures += o.failed.length;
  }
  console.log(failures === 0 ? "Everything in the backup that could go back is back." : `${plural(failures, "write")} did not land; run the restore again (it skips what is back).`);
  console.log("Then run the three follow-up commands again (machine fit, machine trends, renewals) so the jobs' documents match.");
}

/* ------------------------------------------------------------------ */

async function main() {
  FLAGS = parseFlags(process.argv.slice(2));
  const target = await connect();
  const restoreDir = flag("restore");
  if (restoreDir) await restore(target, restoreDir);
  else await reset(target);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});
