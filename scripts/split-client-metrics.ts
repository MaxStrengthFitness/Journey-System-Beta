/**
 * Moves each client's machine maps off clients/{id} into their own document,
 * clients/{id}/machineTotals/current (the iPad round, Oct 6 2026; read
 * src/features/machine-totals/README.md first).
 *
 * DRY RUN BY DEFAULT: it reads, says what it would move, and writes nothing
 * without --commit.
 *
 * WHY. Every open of the app streams the studio's client list, and 73% of a
 * client document was currentMachineMetrics and machineStats, which the Hub
 * and the Directory never draw. Moving them makes every open's roster about a
 * quarter of the size.
 *
 * WHAT, per client, in one transaction with up to 19 others:
 *   - the totals document's currentMachineMetrics, machineStats and
 *     machineStatsBackfilledAt are set to the app's own merge of the client's
 *     old fields and whatever the app already wrote there (newer last sets
 *     kept, counts added: totals.ts, mergeMachineTotals), so every screen
 *     reads the same before and after;
 *   - the three fields are deleted from the client (FieldValue.delete());
 *   - lastSessionDate moves forward to the last day a machine was performed
 *     when that day is later, because the Directory's "Last in" read it off
 *     currentMachineMetrics.
 * A client that no longer holds the fields is skipped: running it twice, or
 * again after an interrupted run, is safe. A failed transaction leaves its
 * clients exactly as they were.
 *
 * ORDER (the deploy): the rules (they add the totals document's access), then
 * the app, then this, once the iPads have loaded the new version (an iPad
 * still on the old one keeps writing the old fields; the merge counts those
 * correctly, and a second run of this script moves them).
 *
 * USAGE (PowerShell, from the project folder)
 *
 *   Against production (needs service-account.json, scripts/lib/admin.ts),
 *   which it refuses unless you type the project id:
 *     npx tsx scripts/split-client-metrics.ts --project gen-lang-client-0731527386 --confirm-project gen-lang-client-0731527386
 *       dry run, every studio: what would move
 *     npx tsx scripts/split-client-metrics.ts --project gen-lang-client-0731527386 --confirm-project gen-lang-client-0731527386 --studio <studioId> --commit
 *       one studio (scripts need ids, not names)
 *     ... --commit --limit 50     a first small run, then look at a client or two
 *
 *   Against the emulator (the perf lab: demo-perf-lab, database perf-lab):
 *     $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8085"
 *     npx tsx scripts/split-client-metrics.ts --project demo-perf-lab --database perf-lab --commit
 *
 * Options: --studio <id>  --limit <n>  --chunk <n> (clients per transaction, default 20)
 *
 * RESTORE POINT. With --commit, what each moved client held before (the
 * three fields, lastSessionDate, and its totals document as it was) is
 * written to backups/split-client-metrics-<time>.json after every
 * transaction, so a run stopped halfway still has its record. PITR is the
 * other way back.
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";
import { runClientSplit, splitSummaryLines, type SplitRecord } from "./lib/split-client-metrics-core.ts";

const argv = process.argv.slice(2);
const hasFlag = (name: string) => argv.includes(`--${name}`);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

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
      `Refusing: this would read ${projectId ?? "an unknown project"} (database ${databaseId}). ` +
        `Type the project id again with --confirm-project ${projectId ?? "<id>"} to go on.`,
    );
  }
  return admin.connectFirestore();
}

async function main() {
  const commit = hasFlag("commit");
  const limit = flag("limit") ? Number(flag("limit")) : null;
  const chunk = flag("chunk") ? Number(flag("chunk")) : undefined;
  if (limit !== null && !(Number.isInteger(limit) && limit > 0)) throw new Error("--limit takes a whole number above 0.");
  const db = await connect();
  const studioId = flag("studio") ?? null;
  console.log(commit ? "COMMIT: machine maps will move to clients/{id}/machineTotals/current." : "DRY RUN: nothing will be written.");
  console.log(studioId ? `Studio: ${studioId} (its home clients).` : "Every client.");
  // The restore point: every moved client as it was, the file rewritten
  // after each transaction (backups/ is git-ignored, as every script's is).
  const moved: SplitRecord[] = [];
  let reportFile: string | null = null;
  const record = (part: SplitRecord[]) => {
    moved.push(...part);
    if (!reportFile) {
      const dir = path.resolve(process.cwd(), "backups");
      fs.mkdirSync(dir, { recursive: true });
      reportFile = path.join(dir, `split-client-metrics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    }
    fs.writeFileSync(reportFile, JSON.stringify({ studioId, moved }, null, 2));
  };
  const summary = await runClientSplit({ db, commit, studioId, limit, chunk, record });
  for (const line of splitSummaryLines(summary, commit)) console.log(line);
  if (reportFile) console.log(`What the moved clients held before: ${reportFile}`);
  if (!commit && summary.toMove > 0) console.log("Nothing was written. Add --commit to move them.");
  process.exit(summary.failed > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});
