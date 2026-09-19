/**
 * Runs the weekly machine-trends job from the PC — the same code Render runs
 * on Sunday nights (server/machine-trends-job.ts). DRY RUN BY DEFAULT: it
 * reads the window, prints what it found per machine, and writes nothing
 * without --commit.
 *
 * Round: cost round (Sep 2026). Use it for the first build of machineTrends,
 * or to refresh the trends now rather than waiting for Sunday. Since the
 * Operations round (Sep 19) the same run writes each studio's performance
 * watch (studios/{s}/watch/performance) — the Monday page's third question.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/run-machine-trends.ts                 # dry run: read + summarise, write nothing
 *   npx tsx scripts/run-machine-trends.ts --commit        # write machineTrends/{machineId} + _summary
 *   npx tsx scripts/run-machine-trends.ts --days 30       # a shorter window
 *
 * Needs service-account.json in the project folder (scripts/lib/admin.ts).
 */

import { connectFirestore, flag, hasFlag } from "./lib/admin.ts";
import { runMachineTrends } from "../server/machine-trends-job.ts";

async function main() {
  const commit = hasFlag("commit");
  const days = flag("days") !== undefined ? Number(flag("days")) : undefined;
  const db = connectFirestore();
  console.log(commit ? "COMMIT: machineTrends documents and each studio's performance watch will be written." : "DRY RUN: nothing will be written.");
  await runMachineTrends({
    db,
    dryRun: !commit,
    windowDays: Number.isFinite(days) ? days : undefined,
    log: (line) => console.log(line),
  });
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});
