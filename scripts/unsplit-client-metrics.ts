/**
 * THE WAY BACK from scripts/split-client-metrics.ts (the iPad round's roster
 * split, Oct 6 2026; read src/features/machine-totals/README.md first). Copies
 * each client's machine maps from clients/{id}/machineTotals/current back
 * onto clients/{id} and deletes the totals document.
 *
 * DRY RUN BY DEFAULT: it reads, says what it would copy back, and writes
 * nothing without --commit.
 *
 * WHEN. Only if a build from BEFORE the roster split has to run again (the
 * restore tag restore/2026-10-06-before-roster): that build reads the maps
 * from the client document alone, so a migrated client would show no last
 * weights. The app from the split on reads both sides and never needs this.
 *
 * WHAT, per client, in one transaction with up to 19 others: the client's
 * currentMachineMetrics, machineStats and machineStatsBackfilledAt are set to
 * the app's own merge of the client's fields and the totals document
 * (totals.ts, mergeMachineTotals: newer last sets kept, counts ADDED), and the
 * totals document is deleted in the same transaction. The delete is not
 * optional: the merge sums the counts across the two sides, so a copy that
 * left the document behind would count every session twice. A client with no
 * totals document is skipped, so a second run copies nothing.
 *
 * THE ORDER, if it is ever needed (ship-ipad-roster.ps1 prints it too):
 *   1. this, with --commit, while the split's app is still live (it reads
 *      both sides, so nothing on screen changes);
 *   2. push the restore tag to master (the build from before the split);
 *   3. once every iPad has loaded that build (the next morning), this again
 *      with --commit: it copies back anything the split's app wrote between
 *      1 and 2;
 *   4. deploy firestore.rules from the same restore tag, last: the split's
 *      rules refuse the old build's backfill marker, and the old rules would
 *      have refused the split's app the totals document while it was live.
 *
 * USAGE (PowerShell, from the project folder or a worktree)
 *
 *   Against production (needs the service-account key, scripts/lib/admin.ts;
 *   --key points at it from a worktree), refused unless the project id is
 *   typed twice:
 *     npx tsx scripts/unsplit-client-metrics.ts --key <path to service-account.json> --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa --confirm-project gen-lang-client-0731527386
 *       dry run: what would be copied back
 *     ... --commit                 copy back every client
 *     ... --studio <studioId>      one studio's home clients (scripts need ids, not names)
 *
 *   Against the emulator (the perf lab):
 *     $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8085"
 *     npx tsx scripts/unsplit-client-metrics.ts --project demo-perf-lab --database perf-lab --commit
 *
 * Options: --studio <id>  --limit <n>  --chunk <n> (clients per transaction, default 20)
 *
 * RESTORE POINT. With --commit, what each client held before (its three
 * fields and the totals document) is written to
 * backups/unsplit-client-metrics-<time>.json after every transaction.
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";
import { runClientUnsplit, unsplitSummaryLines, type UnsplitRecord } from "./lib/unsplit-client-metrics-core.ts";

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
  console.log(
    commit
      ? "COMMIT: machine maps will be copied back onto clients/{id} and each machineTotals/current deleted."
      : "DRY RUN: nothing will be written.",
  );
  console.log(studioId ? `Studio: ${studioId} (its home clients).` : "Every client.");
  const copied: UnsplitRecord[] = [];
  let reportFile: string | null = null;
  const record = (part: UnsplitRecord[]) => {
    copied.push(...part);
    if (!reportFile) {
      const dir = path.resolve(process.cwd(), "backups");
      fs.mkdirSync(dir, { recursive: true });
      reportFile = path.join(dir, `unsplit-client-metrics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    }
    fs.writeFileSync(reportFile, JSON.stringify({ studioId, copied }, null, 2));
  };
  const summary = await runClientUnsplit({ db, commit, studioId, limit, chunk, record });
  for (const line of unsplitSummaryLines(summary, commit)) console.log(line);
  if (reportFile) console.log(`What the copied clients held before: ${reportFile}`);
  if (!commit && summary.toCopy > 0) console.log("Nothing was written. Add --commit to copy them back.");
  process.exit(summary.failed > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});
