/**
 * Unlink the bookings a colliding Mindbody client id filed on the WRONG
 * person. Dry run by default; --commit writes.
 *
 * Round: the collision finding (Sep 23 2026). Read the header of
 * scripts/check-collision-damage.ts first — this is the repair for what that
 * script finds, and it finds rows the same way.
 *
 * WHY THIS IS NEEDED AFTER PHASES 26–27
 * The schedule sync no longer files a booking from one Mindbody site on a
 * client whose home studio is on the other, and every sync rewrites the rows
 * it is asked about. So a crossed booking heals itself — but only once a sync
 * of that studio covers its date. The ones already in the past never will,
 * and until the rest do, the Solon client's profile shows a stranger's
 * appointments as their "next session".
 *
 * WHAT IT WRITES
 * `clientId: null` on each crossed schedule row, and nothing else. That is
 * exactly what the fixed sync writes for the same booking: the row stays on
 * the calendar under the name Mindbody gave it (`clientName` comes from the
 * appointment, so it already names the right person) and keeps its
 * `mindbodyClientId`; it just stops opening someone else's profile.
 *
 * SESSIONS ARE NEVER TOUCHED. A session is coaching data a trainer logged;
 * if one ever crosses, it is listed and left for a person to decide.
 *
 * SAFETY
 *   - Every row is re-read inside a transaction and only unlinked if it
 *     still points at the same client AND is still hosted on the other site.
 *   - --commit first writes a JSON backup of every row it is about to change
 *     into backups/ (gitignored: rows carry client names).
 *   - Only a POSITIVE site mismatch counts. A studio or client whose site is
 *     unknown is left alone — unknown is not wrong.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/unlink-crossed-bookings.ts             # dry run: lists them
 *   npx tsx scripts/unlink-crossed-bookings.ts --commit    # backup, then unlink
 *   npx tsx scripts/unlink-crossed-bookings.ts --report backups\<collisions>.json
 */

import fs from "fs";
import path from "path";
import { connectFirestore, writeReport, flag } from "./lib/admin.ts";

const COMMIT = process.argv.includes("--commit");

interface Row {
  rowId: string;
  mindbodyId: string;
  journeyName: string;
  bookedName: string | null;
  hostedBy: string;
  rowSite: string;
  homeSite: string;
  when: string | null;
}

function newestReport(): string | null {
  const dir = "backups";
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("mindbody-client-collisions-") && f.endsWith(".json"))
    .sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

const asIso = (v: any): string | null =>
  typeof v?.toDate === "function" ? v.toDate().toISOString() : typeof v === "string" ? v : null;

async function main() {
  const reportPath = flag("report") ?? newestReport();
  if (!reportPath || !fs.existsSync(reportPath)) {
    console.error("No collision report found. Run scripts/check-mindbody-client-collisions.ts first,");
    console.error("or pass one with --report <path>.");
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const flagged: Array<{ mindbodyId: string; journeyName: string }> = [
    ...(report.different ?? []),
    ...(report.unknownHome ?? []).filter((r: any) => r.sameName === false),
  ];
  const ids = [...new Set(flagged.map((r) => String(r.mindbodyId)))];
  const nameOf = new Map(flagged.map((r) => [String(r.mindbodyId), r.journeyName]));

  console.log(`Collision report: ${reportPath}`);
  console.log(`Colliding client ids: ${ids.length}`);
  console.log(COMMIT ? "MODE: COMMIT — rows below will be unlinked.\n" : "MODE: dry run — nothing will be written.\n");

  const db = connectFirestore();

  const siteOfStudio = new Map<string, string | null>();
  const nameOfStudio = new Map<string, string>();
  for (const d of (await db.collection("studios").get()).docs) {
    const site = d.get("mindbodySiteId");
    siteOfStudio.set(d.id, site ? String(site).trim() : null);
    nameOfStudio.set(d.id, String(d.get("name") ?? d.id));
  }
  const siteOf = (studioId: string | null | undefined) =>
    studioId ? siteOfStudio.get(studioId) ?? null : null;

  const rows: Row[] = [];
  const backup: Record<string, unknown> = {};
  const crossedSessions: string[] = [];

  for (const id of ids) {
    const client = await db.collection("clients").doc(id).get();
    if (!client.exists) continue;
    const homeSite = siteOf(client.get("homeStudioId"));
    if (!homeSite) continue;

    const schedules = await db.collection("schedules").where("clientId", "==", id).get();
    for (const r of schedules.docs) {
      const rowSite = siteOf(r.get("studioId"));
      if (!rowSite || rowSite === homeSite) continue;
      rows.push({
        rowId: r.id,
        mindbodyId: id,
        journeyName: nameOf.get(id) ?? String(client.get("firstName") ?? ""),
        bookedName: (r.get("clientName") as string) ?? null,
        hostedBy: nameOfStudio.get(r.get("studioId")) ?? String(r.get("studioId")),
        rowSite,
        homeSite,
        when: asIso(r.get("startTime")),
      });
      backup[r.id] = r.data();
    }

    const sessions = await db.collection("sessions").where("clientId", "==", id).get();
    for (const s of sessions.docs) {
      const hosted = (s.get("hostedAtStudioId") as string) ?? (s.get("studioId") as string) ?? null;
      const rowSite = siteOf(hosted);
      if (rowSite && rowSite !== homeSite) crossedSessions.push(`${s.id} (client ${id})`);
    }
  }

  rows.sort((a, b) => (a.mindbodyId + (a.when ?? "")).localeCompare(b.mindbodyId + (b.when ?? "")));
  const now = new Date().toISOString();
  for (const r of rows) {
    const past = r.when && r.when < now ? "past  " : "future";
    console.log(
      `  ${r.rowId.padEnd(8)} ${past} ${r.when?.slice(0, 10) ?? "no date"}  ` +
        `filed on "${r.journeyName}" (${r.mindbodyId}, site ${r.homeSite})  ` +
        `booked as "${r.bookedName}" at ${r.hostedBy} (site ${r.rowSite})`,
    );
  }
  console.log(`\nCrossed bookings: ${rows.length}`);
  if (crossedSessions.length) {
    console.log(`\nCROSSED SESSIONS — not touched, a person must decide: ${crossedSessions.length}`);
    for (const s of crossedSessions) console.log(`  ${s}`);
  }

  if (!COMMIT) {
    if (rows.length) console.log("\nRe-run with --commit to back these up and unlink them.");
    return;
  }
  if (!rows.length) {
    console.log("Nothing to do.");
    return;
  }

  const backupFile = writeReport("unlink-crossed-bookings-backup", {
    ranAt: now,
    collisionReport: reportPath,
    rows: backup,
  });
  console.log(`\nBackup written: ${backupFile}`);

  let unlinked = 0;
  let changedUnderUs = 0;
  for (const r of rows) {
    const ref = db.collection("schedules").doc(r.rowId);
    const done = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const stillSite = siteOf(snap.get("studioId"));
      if (snap.get("clientId") !== r.mindbodyId || !stillSite || stillSite === r.homeSite) return false;
      tx.update(ref, { clientId: null });
      return true;
    });
    if (done) unlinked++;
    else changedUnderUs++;
  }

  console.log(`Unlinked: ${unlinked}`);
  if (changedUnderUs) console.log(`Skipped (already changed since the read): ${changedUnderUs}`);
  console.log("Re-run scripts/check-collision-damage.ts to confirm nothing is left.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
