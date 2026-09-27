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
 * Since the Openings round (Sep 27) it also writes each linked studio's
 * Openings summary (studios/{s}/watch/openings, server/openings-step.ts).
 *
 * --only openings runs just that step, so seeding Openings never re-runs the
 * whole weekly job: it reads each linked studio's last eight weeks of
 * bookings, its whole-read record, its standing weeks and last Sunday's
 * summary, and prints each studio's summary size and the weeks counted. It
 * asks Mindbody nothing. With --commit it writes ONLY the Openings documents.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/run-machine-trends.ts                 # dry run: read + summarise, write nothing
 *   npx tsx scripts/run-machine-trends.ts --commit        # write machineTrends/{machineId} + _summary, the watch documents, Openings
 *   npx tsx scripts/run-machine-trends.ts --days 30       # a shorter window (the trends only)
 *   npx tsx scripts/run-machine-trends.ts --only openings                   # dry run of Openings alone
 *   npx tsx scripts/run-machine-trends.ts --only openings --studio westlake # one studio
 *   npx tsx scripts/run-machine-trends.ts --only openings --commit          # write just the Openings documents
 *
 * Needs service-account.json in the project folder (scripts/lib/admin.ts).
 */

import { connectFirestore, flag, hasFlag } from "./lib/admin.ts";
import { runMachineTrends } from "../server/machine-trends-job.ts";
import { kib, runOpeningsStep, type OpeningsStudioResult } from "../server/openings-step.ts";
import { WINDOW_WEEKS } from "../src/features/openings/fold.ts";

const OUTCOME: Record<OpeningsStudioResult["outcome"], string> = {
  written: "written",
  "dry-run": "would be written",
  skipped: "skipped, last week's kept",
  "write-failed": "write failed, last week's kept",
};

async function runOpeningsOnly(commit: boolean, studio: string | undefined) {
  const db = connectFirestore();
  console.log(
    commit
      ? "COMMIT: each linked studio's Openings summary (studios/{s}/watch/openings) will be written. Nothing else is."
      : "DRY RUN: nothing will be written.",
  );
  const result = await runOpeningsStep({ db, dryRun: !commit, only: studio ? [studio] : undefined, log: (line) => console.log(line) });
  if (result.studios.length === 0) {
    console.log(studio ? `No linked studio with the id "${studio}".` : "No studio's bookings are linked to Journey.");
    return;
  }
  console.log("");
  const width = Math.max(6, ...result.studios.map((s) => s.name.length));
  console.log(`${"Studio".padEnd(width)}  Weeks counted  Summary size  Outcome`);
  for (const s of result.studios) {
    const weeks = s.weeksCounted === undefined ? "-" : `${s.weeksCounted} of ${WINDOW_WEEKS}`;
    const size = s.bytes === undefined ? "-" : kib(s.bytes);
    console.log(`${s.name.padEnd(width)}  ${weeks.padEnd(13)}  ${size.padEnd(12)}  ${OUTCOME[s.outcome]}${s.reason ? ` (${s.reason})` : ""}`);
  }
}

async function main() {
  const commit = hasFlag("commit");
  const only = flag("only");
  if (only !== undefined && only !== "openings") {
    console.error(`--only takes one step, "openings". Got "${only}".`);
    process.exit(1);
  }
  if (only === "openings") {
    await runOpeningsOnly(commit, flag("studio"));
    process.exit(0);
  }

  const days = flag("days") !== undefined ? Number(flag("days")) : undefined;
  const db = connectFirestore();
  console.log(
    commit
      ? "COMMIT: machineTrends documents, each studio's performance watch and each linked studio's Openings summary will be written."
      : "DRY RUN: nothing will be written.",
  );
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
