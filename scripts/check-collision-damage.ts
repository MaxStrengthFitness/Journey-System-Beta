/**
 * READ-ONLY — has a colliding client id ALREADY put someone's work on the
 * wrong person's record?
 *
 * Round: the collision finding (Sep 23 2026). Run this AFTER
 * scripts/check-mindbody-client-collisions.ts, which found 43 Mindbody client
 * ids that name a different person at each of MSF's two sites.
 *
 * WHY A SECOND SCRIPT
 * The collision check answers "could this go wrong". It reports
 * `alreadyMixed` by looking at contracts and pricing options — data that only
 * arrives through Master Sync, which is site-anchored and therefore safe. So
 * an empty `alreadyMixed` does NOT mean nothing has gone wrong.
 *
 * The path that can actually cross the streams is the SCHEDULE pull-sync. It
 * resolves a booking's client by id alone (lib/mindbody-api-sync.ts,
 * `resolveCanonicalClientId`), and `checkClientIds` looks a document up by id
 * across the whole `clients` collection with no studio filter. So a Westlake
 * booking for Mindbody client 100000005 finds Solon's client 100000005 and
 * files the booking against them.
 *
 * That leaves a trace this script can find: a schedule row or a session whose
 * studio sits on a DIFFERENT Mindbody site from the client's own home studio.
 *
 * WHAT IT DOES — nothing but reads, and no Mindbody calls at all.
 *   1. Reads the newest mindbody-client-collisions-*.json in backups/ (or the
 *      file named with --report) for the list of colliding ids.
 *   2. Builds studio -> site from the studios collection.
 *   3. For each colliding id, reads that client's schedules and sessions and
 *      asks whether any of them were hosted on the other site.
 *
 * READING THE RESULT
 *   "Nothing crossed"  -> the collision is still only a risk. Fix the sync
 *                         before it becomes damage.
 *   Anything listed    -> those rows are on the wrong person NOW. They name
 *                         the client, the studio and the date so a leader can
 *                         check them against Mindbody.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/check-collision-damage.ts
 *   npx tsx scripts/check-collision-damage.ts --report backups\<file>.json
 */

import fs from "fs";
import path from "path";
import { connectFirestore, writeReport, flag } from "./lib/admin.ts";

interface Crossed {
  mindbodyId: string;
  clientDocId: string;
  journeyName: string;
  homeStudioId: string | null;
  homeSite: string | null;
  collection: "schedules" | "sessions";
  rowId: string;
  rowStudioId: string | null;
  rowSite: string | null;
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

const asIso = (v: any): string | null => {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate().toISOString();
  if (typeof v === "string") return v;
  return null;
};

async function main() {
  const reportPath = flag("report") ?? newestReport();
  if (!reportPath || !fs.existsSync(reportPath)) {
    console.error(
      "No collision report found. Run scripts/check-mindbody-client-collisions.ts first,",
    );
    console.error("or pass one with --report <path>.");
    process.exit(1);
  }
  console.log(`Collision report: ${reportPath}`);

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const flagged: Array<{ mindbodyId: string; docId: string; journeyName: string }> = [
    ...(report.different ?? []),
    ...(report.unknownHome ?? []).filter((r: any) => r.sameName === false),
  ];
  const ids = [...new Set(flagged.map((r) => String(r.mindbodyId)))];
  const nameOf = new Map(flagged.map((r) => [String(r.mindbodyId), r.journeyName]));
  console.log(`Colliding client ids to check: ${ids.length}`);
  console.log("Read-only. No Mindbody calls.\n");

  const db = connectFirestore();

  const siteOfStudio = new Map<string, string | null>();
  const nameOfStudio = new Map<string, string>();
  const studios = await db.collection("studios").get();
  studios.docs.forEach((d) => {
    const site = d.get("mindbodySiteId");
    siteOfStudio.set(d.id, site ? String(site).trim() : null);
    nameOfStudio.set(d.id, String(d.get("name") ?? d.id));
  });

  const crossed: Crossed[] = [];
  let scheduleRows = 0;
  let sessionRows = 0;
  let clientsMissing = 0;

  for (const id of ids) {
    const clientSnap = await db.collection("clients").doc(id).get();
    if (!clientSnap.exists) {
      clientsMissing++;
      continue;
    }
    const homeStudioId = (clientSnap.get("homeStudioId") as string) ?? null;
    const homeSite = homeStudioId ? siteOfStudio.get(homeStudioId) ?? null : null;

    for (const coll of ["schedules", "sessions"] as const) {
      const field = coll === "schedules" ? "studioId" : "hostedAtStudioId";
      const rows = await db.collection(coll).where("clientId", "==", id).get();
      if (coll === "schedules") scheduleRows += rows.size;
      else sessionRows += rows.size;

      for (const r of rows.docs) {
        const rowStudioId = (r.get(field) as string) ?? (r.get("studioId") as string) ?? null;
        const rowSite = rowStudioId ? siteOfStudio.get(rowStudioId) ?? null : null;
        // Only a POSITIVE mismatch counts. An unknown site is unknown, not wrong.
        if (!homeSite || !rowSite || rowSite === homeSite) continue;
        crossed.push({
          mindbodyId: id,
          clientDocId: clientSnap.id,
          journeyName: nameOf.get(id) ?? String(clientSnap.get("firstName") ?? ""),
          homeStudioId,
          homeSite,
          collection: coll,
          rowId: r.id,
          rowStudioId,
          rowSite,
          when: asIso(r.get("startTime")) ?? (r.get("date") as string) ?? asIso(r.get("createdAt")),
        });
      }
    }
  }

  console.log(`Client documents read:      ${ids.length - clientsMissing}`);
  console.log(`  (ids with no document):   ${clientsMissing}`);
  console.log(`Schedule rows examined:     ${scheduleRows}`);
  console.log(`Session rows examined:      ${sessionRows}`);
  console.log("");

  if (crossed.length === 0) {
    console.log("NOTHING CROSSED.");
    console.log("No booking or session on a colliding id was hosted on the other");
    console.log("Mindbody site. The collision is still only a risk -- fix the sync");
    console.log("before it becomes damage.");
  } else {
    console.log(`${crossed.length} ROW(S) ARE ON THE WRONG PERSON.`);
    console.log("Each of these was hosted by a studio on a different Mindbody site");
    console.log("from the client whose record it is filed under.\n");
    for (const c of crossed.slice(0, 40)) {
      console.log(
        `  ${c.collection.padEnd(9)} ${c.rowId}  client ${c.mindbodyId} ` +
          `"${c.journeyName}" (home site ${c.homeSite}) ` +
          `hosted by ${nameOfStudio.get(c.rowStudioId ?? "") ?? c.rowStudioId} ` +
          `(site ${c.rowSite})${c.when ? ` on ${c.when.slice(0, 10)}` : ""}`,
      );
    }
    if (crossed.length > 40) console.log(`  ...and ${crossed.length - 40} more in the report`);
  }

  const file = writeReport("collision-damage", {
    ranAt: new Date().toISOString(),
    collisionReport: reportPath,
    idsChecked: ids.length,
    clientsMissing,
    scheduleRows,
    sessionRows,
    crossed,
  });
  console.log(`\nFull detail: ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
