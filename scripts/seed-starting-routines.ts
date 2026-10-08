/**
 * Brings the Academy's eleven starting routines into the app as head
 * office's routine presets (the first-session design round, Oct 8 2026; read
 * docs/rounds/2026-10-08-first-session-screens.md §4.2 and
 * src/features/routine-plan/README.md first).
 *
 * AJ, "2a": "The Academy's eleven are brought in once, by a script AJ runs
 * (dry run first), renamed without 'female' or 'male'. Admins then edit,
 * retire or add."
 *
 * DRY RUN BY DEFAULT: it reads which of the eleven are already there and
 * which an earlier run wrote, says what it would write, and writes nothing
 * without --commit.
 *
 * WHAT. Each of the Academy's Exercise Selection Template rows becomes
 * routinePresets/academy-<template> (academy-low-back, academy-knee, and the
 * two no-reported-issues rows as academy-clear-dip-adduction and
 * academy-clear-chest-pulldown, by what tells them apart): company tier,
 * scope "global", its road as machineIds, and a `start` part (day one, the
 * steps in the order they join, the intake words that suggest it, its kind,
 * its source), nobody's default (head office picks one in the editor). The
 * documents are src/features/routine-plan/starting-seed.ts's, the same
 * transform Start a plan uses before this has run, so a plan started either
 * side of the seed names the same routine.
 *
 * NEVER OVERWRITES, NEVER BRINGS ONE BACK.
 * - An id that is there now (an administrator may have edited it) is
 *   skipped, and the write itself is a create, which Firestore refuses for a
 *   document that exists.
 * - Every id a run writes is listed in the seed's record,
 *   system/startingRoutinesSeed, in the same batch. An id the record lists
 *   that is gone now was retired by an administrator (the template editor
 *   retires by Delete), so a later run leaves it out and says so. To bring
 *   one back on purpose: --again academy-arms (several: comma-separated).
 * - A run after an interrupted one finishes the rest: the batch is all or
 *   nothing, the record included.
 *
 * USAGE (PowerShell, from the project folder)
 *
 *   Against production (needs service-account.json, scripts/lib/admin.ts),
 *   which it refuses unless you type the project id again:
 *     npx tsx scripts/seed-starting-routines.ts --project gen-lang-client-0731527386 --confirm-project gen-lang-client-0731527386
 *       dry run: what it would write
 *     npx tsx scripts/seed-starting-routines.ts --project gen-lang-client-0731527386 --confirm-project gen-lang-client-0731527386 --commit
 *       writes them
 *
 *   Against an emulator (nothing leaves this computer):
 *     $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8085"
 *     npx tsx scripts/seed-starting-routines.ts --project demo-perf-lab --database perf-lab --commit
 *
 * It imports only pure modules from src (no React, no browser Firebase).
 */

import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  SEED_RECORD,
  seededIdsFromRecord,
  startingSeedPlan,
  unknownSeedIds,
} from "../src/features/routine-plan/starting-seed.ts";
import { academyStartingRoutines } from "../src/features/routine-plan/starting-routines.ts";

const argv = process.argv.slice(2);
const hasFlag = (name: string) => argv.includes(`--${name}`);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const COLLECTION = "routinePresets";

async function connect(): Promise<Firestore> {
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
    return databaseId === "(default)" ? getFirestore(app) : getFirestore(app, databaseId);
  }

  // A real project: refused unless its id is typed a second time.
  const admin = await import("./lib/admin.ts");
  const { projectId, databaseId } = admin.resolveTarget();
  const confirmed = flag("confirm-project");
  if (!projectId || confirmed !== projectId) {
    throw new Error(
      `Refusing: this would write to ${projectId ?? "an unknown project"} (database ${databaseId}). ` +
        `Type the project id again with --confirm-project ${projectId ?? "<id>"} to go on.`,
    );
  }
  return admin.connectFirestore();
}

async function main() {
  const commit = hasFlag("commit");
  const again = new Set(
    (flag("again") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const typos = unknownSeedIds(again);
  if (typos.length > 0) {
    throw new Error(
      typos.length === 1
        ? `--again names ${typos[0]}, which isn't one of the Academy's starting routines.`
        : `--again names ${typos.join(", ")}, which aren't among the Academy's starting routines.`,
    );
  }

  const db = await connect();
  console.log(commit ? "COMMIT: the routines below will be written." : "DRY RUN: nothing will be written.");

  // Read by id (no query, so no index): the seed's record, and which of the eleven are there now.
  const recordRef = db.collection(SEED_RECORD.collection).doc(SEED_RECORD.id);
  const ids = academyStartingRoutines().map((r) => r.id);
  const [record, ...snaps] = await db.getAll(recordRef, ...ids.map((id) => db.collection(COLLECTION).doc(id)));
  const seededBefore = seededIdsFromRecord(record.exists ? record.data() : undefined);
  if (record.exists) {
    const at = record.get("lastWrittenAt");
    const when = at && typeof at.toDate === "function" ? `on ${at.toDate().toISOString()}` : "at a time not recorded";
    console.log(`The seed has run before: ${seededBefore.size} routines written, the last ${when}.`);
  } else {
    console.log("The seed has not run here before.");
  }
  const existing = new Set(snaps.filter((s) => s.exists).map((s) => s.id));
  const plan = startingSeedPlan(existing, { seededBefore, again });

  for (const id of plan.skip) console.log(`  = ${id}  already there, left as it is`);
  for (const id of plan.retired) {
    console.log(`  - ${id}  written by an earlier run and removed since, left out (--again ${id} brings it back)`);
  }
  for (const { id, doc } of plan.write) {
    console.log(`  + ${id}  "${doc.name}"${again.has(id) ? "  (asked for again)" : ""}`);
    console.log(`      day one: ${doc.start.dayOne.join(", ")}`);
    console.log(`      road (${doc.machineIds.length}): ${doc.machineIds.join(", ")}`);
    if (doc.start.matchWords && doc.start.matchWords.length > 0) {
      console.log(`      words: ${doc.start.matchWords.join(", ")}`);
    }
  }

  if (plan.write.length === 0) {
    console.log(
      plan.retired.length > 0
        ? "Nothing to write: every Academy routine is there or was removed on purpose."
        : "Nothing to write: every one of the Academy's starting routines is there.",
    );
    process.exit(0);
  }
  if (!commit) {
    console.log(plan.write.length === 1 ? "Nothing was written. Add --commit to write this one." : `Nothing was written. Add --commit to write these ${plan.write.length}.`);
    process.exit(0);
  }

  // One batch of creates and the record: all of them or none, and a create never replaces a document.
  const batch = db.batch();
  for (const { id, doc } of plan.write) {
    batch.create(db.collection(COLLECTION).doc(id), { ...doc, createdAt: FieldValue.serverTimestamp() });
  }
  batch.set(
    recordRef,
    {
      ids: FieldValue.arrayUnion(...plan.write.map((w) => w.id)),
      lastWrittenAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();
  const wrote = plan.write.length === 1 ? "1 starting routine" : `${plan.write.length} starting routines`;
  console.log(`Wrote ${wrote} to ${COLLECTION}, and listed ${plan.write.length === 1 ? "it" : "them"} in ${SEED_RECORD.collection}/${SEED_RECORD.id}.`);
  console.log("Next: head office picks its default starting routine in the routine template editor.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});
