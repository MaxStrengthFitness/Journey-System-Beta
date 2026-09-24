/**
 * Remove `clients/test-client-001`, the fake client the webhook test button
 * (server.ts, /api/mindbody/test-webhook) wrote into PRODUCTION in August
 * 2026: no name, home studio Solon, so it could show as a blank row on
 * Solon's roster. Demo Mode is where practice data lives now. Sep 24 2026,
 * AJ's call.
 *
 * Dry run by default; --commit writes. Refuses to delete if anything still
 * points at the record (every collection in reconcile.ts's list, plus
 * machine settings), and backs the document up to backups/ first.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/delete-test-client.ts            # look
 *   npx tsx scripts/delete-test-client.ts --commit   # backup, then delete
 */

import { connectFirestore, writeReport } from "./lib/admin.ts";
import {
  CLIENT_COMPOSITE_ID_COLLECTION,
  CLIENT_REFERENCE_FIELDS,
} from "../src/features/admin/provisional/reconcile.ts";

const ID = "test-client-001";
const COMMIT = process.argv.includes("--commit");

async function main() {
  const db = connectFirestore();
  const ref = db.collection("clients").doc(ID);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`clients/${ID} does not exist. Nothing to do.`);
    return;
  }
  const data = snap.data()!;
  console.log(`clients/${ID}: name "${data.firstName ?? ""} ${data.lastName ?? ""}", home ${data.homeStudioId ?? "none"}`);

  // Anything that looks like a real person stops it.
  if (data.firstName && data.lastName && data.firstName !== "Test") {
    console.log("STOP: this record has a real-looking name. Not deleting.");
    process.exit(1);
  }

  let refs = 0;
  for (const r of [...CLIENT_REFERENCE_FIELDS, { collection: CLIENT_COMPOSITE_ID_COLLECTION, field: "clientId" }]) {
    const n = (await db.collection(r.collection).where(r.field, "==", ID).count().get()).data().count;
    if (n) console.log(`  ${n} in ${r.collection}`);
    refs += n;
  }
  for (const sub of ["inbodyScans", "sharedNotes", "ford", "crossTrainAccess"]) {
    const n = (await ref.collection(sub).count().get()).data().count;
    if (n) console.log(`  ${n} in ${sub} under it`);
    refs += n;
  }
  if (refs) {
    console.log(`STOP: ${refs} document(s) still point at it. Not deleting.`);
    process.exit(1);
  }
  console.log("Nothing points at it.");

  if (!COMMIT) {
    console.log("Re-run with --commit to back it up and delete it.");
    return;
  }
  console.log(`Backup written: ${writeReport("delete-test-client-backup", { id: ID, data })}`);
  await ref.delete();
  console.log(`Deleted clients/${ID}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
