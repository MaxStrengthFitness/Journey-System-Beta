/**
 * Runs the nightly renewals job from the PC — the same code Render runs at
 * 2:30am (server/renewals-job.ts). DRY RUN BY DEFAULT: it works everything
 * out and prints a summary, and writes nothing without --commit.
 *
 * Round: Renewals (Sep 2026). Use it for the first backfill, to see what a
 * night would do before the cron job does it, or to refresh one studio now.
 *
 * It also records how packages ended (renewed, upgraded, downgraded, lost) on
 * the studios' renewal cycles — features/renewals/outcomes.ts.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/run-renewals.ts                    # dry run, no Mindbody calls
 *   npx tsx scripts/run-renewals.ts --pull             # dry run, WITH Mindbody pulls (read-only)
 *   npx tsx scripts/run-renewals.ts --commit           # write snapshots and pulled data
 *   npx tsx scripts/run-renewals.ts --commit --studio <studioId> --max-pulls 50
 *
 * Mindbody: each pulled client costs 2 calls; the first 1,000 calls a day are
 * free. --max-pulls caps it (default 300). Without --pull or --commit, no
 * Mindbody call is made at all.
 */

import { connectFirestore, flag, hasFlag } from "./lib/admin.ts";
import { runRenewals } from "../server/renewals-job.ts";

async function main() {
  const commit = hasFlag("commit");
  const pull = commit || hasFlag("pull");
  const maxPulls = flag("max-pulls") !== undefined ? Number(flag("max-pulls")) : undefined;
  const db = connectFirestore();
  console.log(
    commit
      ? "COMMIT: snapshots, renewal outcomes and pulled Mindbody data will be written."
      : "DRY RUN: nothing will be written.",
  );
  await runRenewals({
    db,
    dryRun: !commit,
    noPulls: !pull,
    maxPulls: Number.isFinite(maxPulls) ? maxPulls : undefined,
    onlyStudio: flag("studio"),
    log: (line) => console.log(line),
  });
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});
