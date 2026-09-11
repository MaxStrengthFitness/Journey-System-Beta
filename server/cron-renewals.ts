/**
 * Render Cron Job entry point: the nightly renewals job (server/renewals-job.ts).
 *
 * CONTACTS NOBODY and writes nothing to Mindbody. It reads bookings, workouts
 * and each studio's renewal settings, pulls contracts and pricing options from
 * Mindbody for the clients who most need it, and rewrites the renewal
 * snapshot on each client document where it changed.
 *
 * Schedule: 30 6 * * *  (06:30 UTC = 2:30am Eastern in summer, 1:30am in winter)
 *
 * Environment, all set on the cron service in Render (see render.yaml):
 *   FIREBASE_SERVICE_ACCOUNT, VITE_FIREBASE_PROJECT_ID,
 *   VITE_FIREBASE_FIRESTORE_DATABASE_ID            which database, and the key
 *   MINDBODY_API_KEY, MINDBODY_SOURCE_NAME,
 *   MINDBODY_SOURCE_PASSWORD                         read-only Mindbody pulls
 *   RENEWALS_MAX_PULLS    optional; clients pulled a night (default 300 = ~600 calls)
 *   RENEWALS_DRY_RUN      optional; "true" computes everything and writes nothing
 */

import { runCron } from "./cron-runtime.ts";
import { getDb } from "./firebase-admin.ts";
import { runRenewals } from "./renewals-job.ts";

void runCron("cron-renewals", async () => {
  const maxPulls = Number(process.env.RENEWALS_MAX_PULLS);
  await runRenewals({
    db: getDb(),
    dryRun: process.env.RENEWALS_DRY_RUN === "true",
    maxPulls: Number.isFinite(maxPulls) && maxPulls >= 0 ? maxPulls : undefined,
  });
});
