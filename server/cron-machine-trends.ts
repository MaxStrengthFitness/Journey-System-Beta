/**
 * Render Cron Job entry point: the WEEKLY machine-trends rebuild.
 *
 * Replaces cron-leaderboards.ts (cost round, Sep 2026). The Render service
 * keeps its old name, `journey-cron-leaderboards`, because a renamed service
 * in the blueprint is a NEW service to Render; only its schedule and command
 * changed. See render.yaml.
 *
 * Schedule: 0 7 * * 0  (Sundays 07:00 UTC = 3am Eastern in summer, 2am in winter)
 *
 * Env: MACHINE_TRENDS_WINDOW_DAYS (default 90), MACHINE_TRENDS_DRY_RUN=true
 * to compute and log without writing.
 */

import { runCron } from "./cron-runtime.ts";
import { getDb } from "./firebase-admin.ts";
import { runMachineTrends } from "./machine-trends-job.ts";

void runCron("cron-machine-trends", async () => {
  const windowDays = Number(process.env.MACHINE_TRENDS_WINDOW_DAYS);
  await runMachineTrends({
    db: getDb(),
    dryRun: process.env.MACHINE_TRENDS_DRY_RUN === "true",
    windowDays: Number.isFinite(windowDays) && windowDays > 0 ? windowDays : undefined,
  });
});
