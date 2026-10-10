/**
 * THE PRE-LAUNCH RESET: wipes the test sessions and everything built from
 * them, keeps the people, the bookings, the contracts, the studios, the
 * machines and the trainers (Oct 10 2026; AJ: "create the proper reset
 * script"). Read docs/ops/RESET-BEFORE-LAUNCH.md first: it is the runbook,
 * in plain words, with every command.
 *
 * What goes and what stays is decided in src/lib/test-reset.ts (pure,
 * tested); the backup format and the way back are src/lib/test-reset-codec.ts.
 * This file reads, prints, backs up and writes. NOT scripts/purge-database.ts,
 * which deletes clients, studios and trainers.
 *
 * DRY RUN BY DEFAULT: it reads everything, counts every group (taken or not),
 * and writes nothing without --commit.
 *
 * USAGE (PowerShell, from the project folder)
 *
 *   Production (needs service-account.json, scripts/lib/admin.ts), refused
 *   unless the project id is typed a second time:
 *     npx tsx scripts/reset-test-data.ts --project gen-lang-client-0731527386 --confirm-project gen-lang-client-0731527386
 *       dry run: what it would do, every optional group counted
 *     ... --also settings,routines --commit
 *       the reset, with the optional groups AJ chose
 *
 *   Options:
 *     --also a,b,c            optional groups: imported-history, ford-briefing, settings,
 *                             settings-all, setting-history, routines, pulse,
 *                             floor-notes, prior-history, operations
 *     --before <ISO time>     setting-history and floor-notes take only what was written
 *                             before it (default: now)
 *     --include-demo          Demo Mode too (then press Reset Demo Mode in the app)
 *     --ignore-open-sessions  commit although a session was open in the last 12 hours
 *     --settle-seconds <n>    how long the trainers' counts must stay still before
 *                             they are deleted (default 60; the session delete trigger
 *                             writes them)
 *     --key <path>            the service-account key (else ./service-account.json)
 *
 *   The way back, from the backup a --commit wrote (never overwrites anything
 *   that exists now):
 *     npx tsx scripts/reset-test-data.ts --project ... --confirm-project ... --restore backups\reset-<stamp>
 *     ... --restore backups\reset-<stamp> --commit
 *
 *   Against an emulator (nothing leaves this computer):
 *     $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8085"
 *     npx tsx scripts/reset-test-data.ts --project demo-perf-lab --database perf-lab [--commit]
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
  type DocIn,
  type FieldStep,
  type GroupId,
  type Phase,
  type ResetInput,
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

const argv = process.argv.slice(2);
const hasFlag = (name: string) => argv.includes(`--${name}`);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

/* ------------------------------------------------------------------ *
 * Connecting
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
    if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(emulator)) {
      throw new Error(`Refusing: FIRESTORE_EMULATOR_HOST is ${emulator}, not this computer.`);
    }
    const projectId = flag("project") || process.env.GCLOUD_PROJECT;
    if (!projectId) throw new Error("Pass --project (the emulator's project, e.g. demo-perf-lab).");
    const databaseId = flag("database") || "(default)";
    console.log(`Firestore EMULATOR at ${emulator}: project ${projectId}, database ${databaseId}`);
    const app = initializeApp({ projectId });
    const db = databaseId === "(default)" ? getFirestore(app) : getFirestore(app, databaseId);
    return { db, projectId, databaseId, emulator: true };
  }

  // A real project: refused unless its id is typed a second time, dry run included.
  const admin = await import("./lib/admin.ts");
  const { projectId, databaseId } = admin.resolveTarget();
  const confirmed = flag("confirm-project");
  if (!projectId || confirmed !== projectId) {
    throw new Error(
      `Refusing: this reads ${projectId ?? "an unknown project"} (database ${databaseId}). ` +
        `Type the project id again with --confirm-project ${projectId ?? "<id>"} to go on.`,
    );
  }
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
  ] = await Promise.all([
    // Under each session, at any depth, and any old `logs` whose session document is gone.
    Promise.all([readChildren(db, sessions), readGroup(db, "logs", /^sessions\/[^/]+\/logs\/[^/]+$/)]).then(([a, b]) => uniqueByPath([...a, ...b])),
    Promise.all([readChildren(db, routines), readGroup(db, "planChanges", /^routines\/[^/]+\/planChanges\/[^/]+$/)]).then(([a, b]) => uniqueByPath([...a, ...b])),
    readCollection(db, "exerciseLogs"),
    readCollection(db, "sessionNotes"),
    readCollection(db, "journalEntries"),
    readCollection(db, "clinicalIncidents"),
    readCollection(db, "clients", CLIENT_FIELDS_READ),
    readGroup(db, "machineTotals", /^clients\/[^/]+\/machineTotals\/[^/]+$/),
    readGroup(db, "ford", /^clients\/[^/]+\/ford\/[^/]+$/),
    readCollection(db, "trainers", ["rollups", "isDemo"]),
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
    readGroup(db, "renewals", /^studios\/[^/]+\/renewals\/[^/]+$/, ["outcome", "isDemo", "studioId"]),
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
  };
}

/* ------------------------------------------------------------------ *
 * Printing the plan
 * ------------------------------------------------------------------ */

const GROUP_ORDER: GroupId[] = ["core", ...OPTIONAL_GROUPS];

function printPlan(plan: ResetPlan, groups: ReadonlySet<GroupId>, mode: "plan" | "done") {
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
      console.log(`    ${partLine(c, mode)}`);
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

/** Codes worth another try: deadline, exhausted, aborted, internal, unavailable. */
const RETRYABLE = new Set([4, 8, 10, 13, 14]);

function writer(db: Firestore): BulkWriter {
  const w = db.bulkWriter();
  w.onWriteError((err) => RETRYABLE.has(Number(err.code)) && err.failedAttempts < 10);
  return w;
}

interface Outcome {
  ok: number;
  failed: { path: string; why: string }[];
}

const errWords = (err: unknown): string => {
  const e = err as { code?: unknown; message?: unknown };
  if (Number(e?.code) === 9) return "changed since it was read (run the reset again)";
  if (Number(e?.code) === 5) return "not there any more";
  if (Number(e?.code) === 6) return "already there";
  return String(e?.message ?? err).split("\n")[0].slice(0, 160);
};

function preconditionOf(updateTime: unknown): Precondition | undefined {
  return updateTime instanceof Timestamp ? { lastUpdateTime: updateTime } : undefined;
}

/** A field change as BulkWriter.update's variadic arguments. */
function updateArgs(changes: { field: string[]; value: unknown }[]): unknown[] {
  const args: unknown[] = [];
  for (const c of changes) {
    args.push(new FieldPath(...c.field), c.value);
  }
  return args;
}

async function runPhase(
  db: Firestore,
  deletes: { path: string; part: string; updateTime?: unknown }[],
  fieldSteps: FieldStep[],
  results: Map<string, Outcome>,
  { precondition }: { precondition: boolean },
) {
  const w = writer(db);
  const record = (part: string, p: Promise<unknown>, at: string) =>
    p.then(
      () => {
        const o = results.get(part) ?? { ok: 0, failed: [] };
        o.ok += 1;
        results.set(part, o);
      },
      (err) => {
        const o = results.get(part) ?? { ok: 0, failed: [] };
        o.failed.push({ path: at, why: errWords(err) });
        results.set(part, o);
      },
    );
  const pending: Promise<unknown>[] = [];
  for (const d of deletes) {
    const pre = precondition ? preconditionOf(d.updateTime) : undefined;
    pending.push(record(d.part, pre ? w.delete(db.doc(d.path), pre) : w.delete(db.doc(d.path)), d.path));
  }
  for (const step of fieldSteps) {
    const changes = step.changes.map((c) => ({ field: c.field, value: c.after === ABSENT ? FieldValue.delete() : stripUndefined(c.after) }));
    const pre = precondition ? preconditionOf(step.updateTime) : undefined;
    const args = updateArgs(changes);
    if (pre) args.push(pre);
    const [first, firstValue, ...rest] = args;
    const p = w.update(db.doc(step.path), first as FieldPath, firstValue, ...(rest as never[]));
    // One update per document, counted under every part it touched.
    const parts = [...new Set(step.changes.map((c) => c.part))];
    pending.push(
      p.then(
        () => {
          for (const part of parts) {
            const o = results.get(part) ?? { ok: 0, failed: [] };
            o.ok += 1;
            results.set(part, o);
          }
        },
        (err) => {
          for (const part of parts) {
            const o = results.get(part) ?? { ok: 0, failed: [] };
            o.failed.push({ path: step.path, why: errWords(err) });
            results.set(part, o);
          }
        },
      ),
    );
  }
  await w.close();
  await Promise.all(pending);
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

function backupLinesOf(plan: ResetPlan, kit: ValueKit): BackupLine[] {
  const lines: BackupLine[] = [];
  for (const d of plan.deletes) {
    lines.push({ kind: "doc", path: d.path, group: d.group, part: d.part, data: encodeData(d.data, kit, d.path) });
  }
  for (const step of plan.fieldSteps) {
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

function writeBackup(dir: string, lines: BackupLine[], manifest: BackupManifest) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, BACKUP_FILE);
  const fd = fs.openSync(file, "w");
  try {
    for (const line of lines) fs.writeSync(fd, `${JSON.stringify(line)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  writeManifest(dir, manifest);
  // Read it back: a backup that can't be parsed is no backup.
  const back = parseBackupLines(fs.readFileSync(file, "utf8"));
  if (back.length !== lines.length) throw new Error(`The backup reads back ${back.length} lines, not ${lines.length}. Nothing was changed.`);
}

function writeManifest(dir: string, manifest: BackupManifest) {
  const file = path.join(dir, MANIFEST_FILE);
  const fd = fs.openSync(file, "w");
  try {
    fs.writeSync(fd, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/* ------------------------------------------------------------------ *
 * The follow-up commands
 * ------------------------------------------------------------------ */

function followUps(target: Target, includeDemo: boolean, groups: ReadonlySet<GroupId>) {
  const where = target.emulator
    ? ` --project ${target.projectId}${target.databaseId === "(default)" ? "" : ` --database ${target.databaseId}`}`
    : "";
  console.log("");
  console.log("CHECK: the same command without --commit should now find nothing left (Demo Mode aside). Run it before the jobs below.");
  console.log("NEXT, in this order (each is a dry run without --commit; run it once without to look):");
  console.log(`  1. npx tsx scripts/rebuild-machine-fit.ts${where} --commit`);
  console.log(`       the machine-fit index from the set-ups that are left${groups.has("settings-all") || groups.has("settings") ? "" : " (only the open sessions' ghost set-ups went, so little changes)"}`);
  console.log(`  2. npx tsx scripts/run-machine-trends.ts${where} --commit`);
  console.log("       machine trends, Kaizen reports, the performance watch and Openings, from no sets");
  console.log(`  3. npx tsx scripts/run-renewals.ts${where} --commit --max-pulls 0 --first-sync-max 0`);
  console.log("       renewal snapshots, client states and month tallies again, with no Mindbody call");
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

  console.log(commit ? "COMMIT: the reset below will be written, after a backup." : "DRY RUN: nothing will be written.");
  console.log(`Groups: ${[...groups].join(", ")}${includeDemo ? ", and Demo Mode" : " (Demo Mode left out)"}.`);
  if (note) console.log(note);
  console.log(`"Before" for setting history and floor notes: ${new Date(beforeMs).toISOString()}.`);
  console.log("Reading...");
  const input = await readEverything(db);
  console.log(
    `Read ${plural(input.sessions.length, "session")}, ${plural(input.exerciseLogs.length, "set")}, ${plural(input.journalEntries.length, "client note")}, ` +
      `${plural(input.clients.length, "client")}, ${plural(input.trainers.length, "trainer")}.`,
  );

  const plan = planReset(input, { groups, includeDemo, beforeMs, nowMs });
  printPlan(plan, groups, "plan");
  console.log("");
  if (plan.sessionEraStartMs !== null) {
    console.log(`Journey's sessions begin ${new Date(plan.sessionEraStartMs).toISOString().slice(0, 10)}: a first-session date before that was typed, and is kept.`);
  }
  if (plan.leftAlone.length > 0) {
    console.log("Left alone (for you to decide; this reset never changes them):");
    for (const l of plan.leftAlone) console.log(`    ${l.label}: ${l.count.toLocaleString("en-US")}`);
  }
  printOpenSessions(plan, includeDemo);
  const docs = plan.deletes.length;
  const fieldDocs = plan.fieldSteps.length;
  const fields = plan.fieldSteps.reduce((n, s) => n + s.changes.length, 0);
  console.log("");
  console.log(`This run: ${plural(docs, "document")} deleted, ${plural(fields, "field")} changed on ${plural(fieldDocs, "document")} kept.`);

  if (!commit) {
    printChecklist();
    console.log("");
    console.log(docs + fieldDocs === 0 ? "Nothing to do: the reset has nothing left to take." : "Nothing was written. Add --commit to do it (with --also for any group above).");
    return;
  }

  if (docs + fieldDocs === 0) {
    console.log("Nothing to do: the reset has nothing left to take. Nothing was written.");
    return;
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
  const lines = backupLinesOf(plan, kit);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve(process.cwd(), "backups", `reset-${stamp}`);
  const manifest: BackupManifest = {
    version: BACKUP_VERSION,
    projectId: target.projectId,
    databaseId: target.databaseId,
    startedAt: "",
    groups: [...groups],
    includeDemo,
    before: new Date(beforeMs).toISOString(),
    documents: docs,
    fieldDocuments: fieldDocs,
    fields,
  };
  manifest.startedAt = new Date().toISOString();
  writeBackup(dir, lines, manifest);
  console.log("");
  console.log(`Backup: ${dir} (${plural(lines.length, "line")}; the way back is --restore "${dir}").`);
  console.log(`POINT-IN-TIME RECOVERY: nothing has been written before ${manifest.startedAt}. Firestore can bring the database back to that minute for 7 days.`);

  const results = new Map<string, Outcome>();
  const inPhase = (phase: Phase) => ({
    deletes: plan.deletes.filter((d) => d.phase === phase),
    fields: plan.fieldSteps.filter((s) => s.phase === phase),
  });

  // 1. The trainers' old counts map, so a delete trigger can't copy it into a new counts document.
  const early = inPhase("early");
  await runPhase(db, early.deletes, early.fields, results, { precondition: true });
  // 2. Everything else, each against the version that was backed up.
  const main = inPhase("main");
  console.log(`Writing: ${plural(main.deletes.length, "delete")}, ${plural(main.fields.length, "document")} with fields changed...`);
  await runPhase(db, main.deletes, main.fields, results, { precondition: true });
  // 3. The trainers' counts, once the session delete trigger has stopped writing them.
  const late = inPhase("late");
  if (late.deletes.length + late.fields.length > 0) {
    if (plan.countedSessionsDeleted > 0) {
      console.log(
        `Waiting for the trainers' counts to settle: ${plural(plan.countedSessionsDeleted, "counted session")} went, and each delete runs a trigger that takes one off ` +
          `(${settleSeconds} s without a change, at most 15 minutes)`,
      );
      const settled = await waitForTrainerCounts(db, settleSeconds * 1000, 15 * 60 * 1000);
      console.log(settled ? " settled." : " still changing after 15 minutes; deleting them anyway (run the reset again in an hour to catch a straggler).");
    }
    await runPhase(db, late.deletes, late.fields, results, { precondition: false });
  }

  manifest.finishedAt = new Date().toISOString();
  writeManifest(dir, manifest);

  // What was done, per part.
  console.log("");
  console.log("DONE:");
  let failures = 0;
  for (const part of PARTS) {
    const o = results.get(part.id);
    if (!o) continue;
    const spec = partOf(part.id);
    const verb = spec.kind === "docs" ? "deleted" : "changed";
    console.log(`    ${spec.label}: ${plural(o.ok, "document")} ${verb}${o.failed.length ? `, ${o.failed.length} not` : ""}`);
    for (const f of o.failed.slice(0, 20)) console.log(`        ${f.path}: ${f.why}`);
    if (o.failed.length > 20) console.log(`        ... and ${o.failed.length - 20} more`);
    failures += o.failed.length;
  }
  console.log(failures === 0 ? "Every write landed." : `${plural(failures, "write")} did not land. Run the same command again: it takes only what is left.`);
  followUps(target, includeDemo, groups);
}

/* ------------------------------------------------------------------ *
 * The way back
 * ------------------------------------------------------------------ */

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
    throw new Error(
      `Refusing: the backup is of ${manifest.projectId} / ${manifest.databaseId}, and this is ${target.projectId} / ${target.databaseId}.`,
    );
  }
  const lines = parseBackupLines(fs.readFileSync(backupFile, "utf8"));
  console.log(commit ? "COMMIT: the backup below will be put back." : "DRY RUN: nothing will be written.");
  console.log(`Backup of ${manifest.startedAt}${manifest.finishedAt ? "" : " (that run stopped part way)"}: ${plural(lines.length, "line")}.`);

  // What is there now: every backed-up document, by id (no query).
  const kit = kitFor(db);
  const docPaths = lines.filter((l) => l.kind === "doc").map((l) => l.path);
  const fieldPaths = [...new Set(lines.filter((l) => l.kind === "fields").map((l) => l.path))];
  const existsNow = new Set<string>();
  const current = new Map<string, { data: Record<string, unknown>; updateTime: Timestamp }>();
  const all = [...new Set([...docPaths, ...fieldPaths])];
  for (let i = 0; i < all.length; i += 300) {
    const snaps = await db.getAll(...all.slice(i, i + 300).map((p) => db.doc(p)));
    for (const s of snaps) {
      if (!s.exists) continue;
      existsNow.add(s.ref.path);
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
    console.log("    A trainer's counts document exists again (the 3 AM job remade it): Admins, Machinery, System tools: rebuild the trainer counts from the sessions.");
  }

  if (!commit) {
    console.log("");
    console.log("Nothing was written. Add --commit to put it back.");
    return;
  }

  const results = new Map<string, Outcome>();
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
  const firstFields = plan.fields.filter((f) => lines.some((l) => l.kind === "fields" && l.path === f.path && l.changes.some((c) => c.part === "trainer-legacy-rollups")));
  const restFields = plan.fields.filter((f) => !firstFields.includes(f));
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
  console.log(failures === 0 ? "Everything in the backup that could go back is back." : `${plural(failures, "write")} did not land; run the restore again.`);
  console.log("Then run the three follow-up commands again (machine fit, machine trends, renewals) so the jobs' documents match.");
}

/* ------------------------------------------------------------------ */

async function main() {
  const target = await connect();
  const restoreDir = flag("restore");
  if (hasFlag("restore") && !restoreDir) throw new Error("--restore takes the backup folder (backups\\reset-<stamp>).");
  if (restoreDir) await restore(target, restoreDir);
  else await reset(target);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});

