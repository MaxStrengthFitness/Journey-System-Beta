/**
 * Merge a client's leftover duplicate record into their real one. Dry run by
 * default; --commit writes.
 *
 * Round: client identity (Sep 24 2026). The collision check flagged a handful
 * of people as "the same person at both Mindbody sites". They are not: every
 * booking of theirs is at Solon. What they have is TWO Journey records — the
 * canonical `clients/{mindbodyClientId}` and an older record at a random id
 * with the same Mindbody id and name and no home studio, left from before the
 * canonical-id migration — and their bookings are split between the two. So a
 * trainer opening one sees half their schedule.
 *
 * A DUPLICATE is a client record that
 *   - carries a Mindbody id M (`mindbodyClientId` or `mindbodyId`),
 *   - lives at some OTHER id — not M, and not a site-qualified `{site}-M`
 *     (that is the second person on a shared number: a different human,
 *     src/lib/mindbody-site.ts),
 *   - is not already merged away, and
 *   - has the same name as `clients/M`, which exists and is not merged away,
 *     and whose home studio is not on a DIFFERENT site from its own.
 *
 * The merge is the app's own (src/features/admin/provisional/mergeClient.ts,
 * the "Merge into real record" dialog) done with the Admin SDK, in the same
 * load-bearing order and from the same list of what points at a client
 * (reconcile.ts CLIENT_REFERENCE_FIELDS): every reference repointed, machine
 * settings re-keyed (the real record's setting wins), Kaizen Rosters updated,
 * the real record's running totals (trainerTally, top trainer, machineStats)
 * rebuilt from the whole history with the app's own rollupFromHistory — a
 * duplicate can carry most of someone's training (Heather Corlett's held 76
 * sessions) — the survivor told where its history came from, and the duplicate
 * TOMBSTONED — never deleted. The app's dialog only merges temporary
 * (provisional) profiles, which is why this is a script.
 *
 * Anything the script cannot move safely stops that person's merge and says
 * why: a subcollection under the duplicate (InBody scans, shared notes, FORD)
 * or a profile field only the duplicate holds.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/merge-duplicate-client-records.ts            # dry run
 *   npx tsx scripts/merge-duplicate-client-records.ts --commit   # backup, then merge
 */

import { connectFirestore, writeReport } from "./lib/admin.ts";
import {
  CLIENT_COMPOSITE_ID_COLLECTION,
  CLIENT_REFERENCE_FIELDS,
  isMergedAway,
  survivorPatch,
  tombstonePatch,
} from "../src/features/admin/provisional/reconcile.ts";
import { nameKey } from "../src/features/admin/provisional/provisional.ts";
import { siteOfClient } from "../src/lib/mindbody-site.ts";
import { rollupFromHistory } from "../src/lib/client-rollups.ts";
import { FieldValue } from "firebase-admin/firestore";

const COMMIT = process.argv.includes("--commit");
const SUBCOLLECTIONS = ["inbodyScans", "sharedNotes", "ford", "crossTrainAccess"];
/** Profile fields worth carrying over when only the duplicate has them. */
const PROFILE_FIELDS = [
  "email", "phone", "dateOfBirth", "gender", "address", "emergencyContactName",
  "emergencyContactPhone", "notes", "occupation", "height", "wingspan", "priorHistory",
];
const isBlank = (v: unknown) =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

async function main() {
  console.log(COMMIT ? "MODE: COMMIT\n" : "MODE: dry run — nothing will be written.\n");
  const db = connectFirestore();

  const studios: Array<{ id: string; mindbodySiteId?: string }> = [];
  for (const d of (await db.collection("studios").get()).docs) {
    const s = d.get("mindbodySiteId");
    studios.push({ id: d.id, mindbodySiteId: s != null ? String(s).trim() : undefined });
  }

  const all = await db.collection("clients").get();
  const byId = new Map(all.docs.map((d) => [d.id, d.data()]));

  type Pair = { dupId: string; realId: string; name: string; counts: Record<string, number>; blockers: string[]; carry: Record<string, unknown> };
  const pairs: Pair[] = [];
  for (const d of all.docs) {
    const data = d.data();
    const m = String(data.mindbodyClientId ?? data.mindbodyId ?? "").trim();
    if (!m || d.id === m || /^\d+-\d+$/.test(d.id) || isMergedAway(data)) continue;
    const real = byId.get(m);
    if (!real || isMergedAway(real)) continue;
    if (nameKey(data.firstName, data.lastName) !== nameKey(real.firstName, real.lastName)) continue;
    const dupSite = siteOfClient(data, studios);
    const realSite = siteOfClient(real, studios);
    if (dupSite && realSite && dupSite !== realSite) continue;

    const counts: Record<string, number> = {};
    for (const ref of CLIENT_REFERENCE_FIELDS) {
      const n = (await db.collection(ref.collection).where(ref.field, "==", d.id).count().get()).data().count;
      if (n) counts[ref.collection] = n;
    }
    const ms = (await db.collection(CLIENT_COMPOSITE_ID_COLLECTION).where("clientId", "==", d.id).count().get()).data().count;
    if (ms) counts[CLIENT_COMPOSITE_ID_COLLECTION] = ms;

    const blockers: string[] = [];
    for (const sub of SUBCOLLECTIONS) {
      const n = (await d.ref.collection(sub).count().get()).data().count;
      if (n) blockers.push(`${n} document(s) in ${sub} under the duplicate`);
    }
    const carry: Record<string, unknown> = {};
    for (const f of PROFILE_FIELDS) if (!isBlank(data[f]) && isBlank(real[f])) carry[f] = data[f];

    pairs.push({ dupId: d.id, realId: m, name: `${real.firstName ?? ""} ${real.lastName ?? ""}`.trim(), counts, blockers, carry });
  }

  for (const p of pairs) {
    const moves = Object.entries(p.counts).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing points at it";
    console.log(`${p.name}: clients/${p.dupId}  ->  clients/${p.realId}`);
    console.log(`    moves: ${moves}`);
    if (Object.keys(p.carry).length) console.log(`    fills blanks on the real record: ${Object.keys(p.carry).join(", ")}`);
    for (const b of p.blockers) console.log(`    STOP: ${b} — left for a person to move`);
  }
  const ready = pairs.filter((p) => !p.blockers.length);
  console.log(`\nDuplicates found: ${pairs.length}   Ready to merge: ${ready.length}`);

  if (!COMMIT) {
    if (ready.length) console.log("\nRe-run with --commit to back these up and merge them.");
    return;
  }
  if (!ready.length) return;

  const backup: Record<string, unknown> = {};
  for (const p of ready) {
    backup[p.dupId] = { client: byId.get(p.dupId), real: byId.get(p.realId), refs: {} as Record<string, unknown> };
    for (const ref of [...CLIENT_REFERENCE_FIELDS, { collection: CLIENT_COMPOSITE_ID_COLLECTION, field: "clientId" }]) {
      const snap = await db.collection(ref.collection).where(ref.field, "==", p.dupId).get();
      if (!snap.empty) (backup[p.dupId] as any).refs[ref.collection] = snap.docs.map((x) => ({ id: x.id, data: x.data() }));
    }
  }
  console.log(`\nBackup written: ${writeReport("merge-duplicate-client-records-backup", backup)}`);

  const trainers = await db.collection("trainers").get();
  for (const p of ready) {
    const { dupId, realId } = p;
    // 1. Every reference, repointed. Idempotent: a re-run finds nothing left.
    for (const ref of CLIENT_REFERENCE_FIELDS) {
      const snap = await db.collection(ref.collection).where(ref.field, "==", dupId).get();
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = db.batch();
        for (const x of snap.docs.slice(i, i + 400)) batch.update(x.ref, { [ref.field]: realId });
        await batch.commit();
      }
    }
    // 2. Machine settings, re-keyed; the real record's setting wins.
    const ms = await db.collection(CLIENT_COMPOSITE_ID_COLLECTION).where("clientId", "==", dupId).get();
    for (const x of ms.docs) {
      const data = x.data();
      const machineId = data.machineId ?? x.id.slice(dupId.length + 1);
      if (!machineId) continue;
      const target = db.collection(CLIENT_COMPOSITE_ID_COLLECTION).doc(`${realId}_${machineId}`);
      if (!(await target.get()).exists) await target.set({ ...data, clientId: realId });
      await x.ref.delete();
    }
    // 3. Kaizen Rosters.
    for (const t of trainers.docs) {
      const roster = t.get("kaizenRoster");
      if (!Array.isArray(roster) || !roster.some((e: any) => e?.clientId === dupId)) continue;
      const seen = new Set<string>();
      const next = roster
        .map((e: any) => (e?.clientId === dupId ? { ...e, clientId: realId } : e))
        .filter((e: any) => (seen.has(e?.clientId ?? "") ? false : (seen.add(e?.clientId ?? ""), true)));
      await t.ref.update({ kaizenRoster: next });
    }
    // 4. The running totals, rebuilt from the WHOLE history now on the real
    //    record — the app's own rollupFromHistory, whole-field replace, as the
    //    profile's backfill does. (sessionCount re-derives itself on the next
    //    profile open: ClientProfileView's one arithmetic rule.)
    const sessions = await db.collection("sessions").where("clientId", "==", realId).get();
    const logs = await db.collection("exerciseLogs").where("clientId", "==", realId).get();
    const rolled = rollupFromHistory(
      sessions.docs.map((x) => ({ id: x.id, ...(x.data() as any) })),
      logs.docs.map((x) => x.data() as any),
      trainers.docs.map((t) => ({ id: t.id, ...(t.data() as any) })),
    );
    // 5. The survivor learns where its history came from, and any blank the
    //    duplicate could fill. 6. Then, and only then, the tombstone.
    await db.collection("clients").doc(realId).update({
      ...p.carry,
      ...survivorPatch(dupId),
      trainerTally: rolled.trainerTally,
      topTrainerId: rolled.topTrainerId,
      topTrainerName: rolled.topTrainerName,
      topTrainerSessions: rolled.topTrainerSessions,
      machineStats: rolled.machineStats,
      machineStatsBackfilledAt: FieldValue.serverTimestamp(),
    });
    await db.collection("clients").doc(dupId).update(tombstonePatch(realId));
    console.log(`Merged ${p.name}: ${dupId} -> ${realId}`);
  }
  console.log(`\nDone: ${ready.length} merged.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
