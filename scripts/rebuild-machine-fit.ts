/**
 * Rebuilds every studio's machine-fit index from the saved machine set-ups.
 * DRY RUN BY DEFAULT: it reads, prints what it would write per studio, and
 * writes nothing without --commit.
 *
 * Round: machine fit (Sep 2026). Run it ONCE after the round is deployed —
 * every set-up saved before then is in clientMachineSettings but not in the
 * index, so suggestions and the set-up check start from nothing until it has
 * run. Safe to run again at any time: it replaces each document whole.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/rebuild-machine-fit.ts            # dry run: read + summarise, write nothing
 *   npx tsx scripts/rebuild-machine-fit.ts --commit   # write studios/{s}/machineFit/{machineId}
 *
 * Then refresh the company tier so every studio can lean on it:
 *   npx tsx scripts/run-machine-trends.ts --commit
 *
 * Needs service-account.json in the project folder (scripts/lib/admin.ts).
 */

import { connectFirestore, hasFlag } from "./lib/admin.ts";
import { rebuildMachineFit } from "../server/machine-fit-rebuild.ts";

async function main() {
  const commit = hasFlag("commit");
  const db = connectFirestore();
  console.log(commit ? "COMMIT: machineFit documents will be replaced." : "DRY RUN: nothing will be written.");
  await rebuildMachineFit({ db, dryRun: !commit, log: (line) => console.log(line) });
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});
