/**
 * WHO IS SYNCED, WHO IS NOT, AND WHAT CATCHING UP WOULD COST.
 *
 * The counting half of the Mindbody backfill
 * (docs/rounds/2026-09-22-mindbody-sync-plan.md). Nothing in the repo has ever
 * known how many clients there actually are - "~250 a studio" is an estimate,
 * and beta planning has been resting on it. This answers it from the database.
 *
 * It is also the VERIFICATION tool the plan calls for. After a backfill runs,
 * its own report is not proof: it only knows about the clients it reached.
 * This proves it the other way round, by listing everyone the backfill did
 * NOT reach. The deliverable is that list, and it has to be empty.
 *
 * SAFETY MODEL
 * ------------
 *   - READ ONLY. There is no --commit and no write path. It cannot change a
 *     client even if you ask it to.
 *   - NO MINDBODY CALLS, ever. It does not import the Mindbody client, so it
 *     cannot spend a call or a cent. Run it as often as you like.
 *   - One pass over `clients`, with `.select()` so it pays for the fields it
 *     reads and not the whole document. No per-client queries in a loop -
 *     that rule is scar tissue from the Aug 30 quota storm.
 *   - A JSON report of everyone unsynced goes to backups/ (gitignored: it
 *     carries client names).
 *
 * WHY IT ENUMERATES RATHER THAN QUERIES
 * -------------------------------------
 * `mindbodyMasterSyncedAt` is an ISO string with no index, and Firestore
 * cannot query for an ABSENT field at all - so "who has never been synced" is
 * necessarily a read-everything-and-filter, exactly as
 * scripts/backfill-client-since.ts already does it.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/mindbody-sync-report.ts                    # everything
 *   npx tsx scripts/mindbody-sync-report.ts --studio <id>      # one studio
 *   npx tsx scripts/mindbody-sync-report.ts --stale-days 30    # count old syncs too
 *
 * "To sync" is clients never Master-Synced. Since the cost plan (Sep 26 2026)
 * a synced client does not go stale on a timer - AJ ranked client details
 * "only when it changes", and the webhook brings the change - so an old sync
 * counts only when you ask with --stale-days. For the launch proof (everyone
 * booked in 30 days or seen in 6 months), use onboard-studio.ts --verify.
 *   npx tsx scripts/mindbody-sync-report.ts --key C:\path\to\key.json
 */

import { connectFirestore, flag, hasFlag, writeReport } from "./lib/admin.ts";

/** What Master Sync costs, counted from server/mindbody-client.ts pullClientMaster. */
const CALLS_PER_CLIENT = 5;
/**
 * The price on Mindbody's pricing page (AJ, Sep 26 2026): $0.002 a call, free
 * only for developers under 5,000 calls a billing cycle. The Sep 2026 invoice
 * charged no overage past 5,000, so the account may still be on the older
 * "1,000 a day free" deal - the question for Mindbody is in
 * docs/rounds/2026-09-26-cost-plan.md. Until it is answered, this prices every
 * call.
 */
const DOLLARS_PER_CALL = 0.002;

const DAY_MS = 24 * 60 * 60 * 1000;

interface Row {
  id: string;
  name: string;
  studio: string;
  active: boolean;
  syncedAt: string | null;
  ageDays: number | null;
  visits: number | null;
  hasPrior: boolean;
  mindbodyLinked: boolean;
}

/** The same rule mindbodyIdOf uses, inlined so this script imports nothing app-side. */
function looksMindbodyLinked(d: Record<string, any>, id: string): boolean {
  if (d.provisional || d.supersededById || d.migratedTo) return false;
  const explicit = d.mindbodyClientId || d.mindbodyId;
  if (typeof explicit === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(explicit.trim())) return true;
  return /^\d{1,20}$/.test(id);
}

function pct(n: number, of: number): string {
  if (!of) return "  -  ";
  return `${String(Math.round((n / of) * 100)).padStart(3)}%`;
}

async function main() {
  const staleArg = flag("stale-days");
  const staleDays = staleArg === undefined ? null : Number(staleArg);
  const onlyStudio = flag("studio");
  const now = Date.now();
  const db = connectFirestore();

  console.log("=".repeat(76));
  console.log("Mindbody sync report — READ ONLY, no Mindbody calls, no writes");
  console.log(
    `${staleDays === null ? "Never-synced clients only" : `Stale after ${staleDays} days`}${onlyStudio ? ` · studio ${onlyStudio}` : ""}`,
  );
  console.log("=".repeat(76));

  /* ---- studios, so the report can say names rather than ids ---- */
  const studiosSnap = await db.collection("studios").get();
  const studioName: Record<string, string> = {};
  const studioSite: Record<string, string> = {};
  for (const d of studiosSnap.docs) {
    studioName[d.id] = String(d.get("name") ?? d.id);
    studioSite[d.id] = String(d.get("mindbodySiteId") ?? "").trim();
  }
  console.log(`Studios: ${studiosSnap.size}`);

  /* ---- one pass over clients ---- */
  let q = db
    .collection("clients")
    .select(
      "homeStudioId",
      "firstName",
      "lastName",
      "isActive",
      "mindbodyMasterSyncedAt",
      "clientsNumberOfVisitsAtSite",
      "priorHistory",
      "mindbodyClientId",
      "mindbodyId",
      "provisional",
      "supersededById",
      "migratedTo",
    ) as FirebaseFirestore.Query;
  if (onlyStudio) q = q.where("homeStudioId", "==", onlyStudio);

  const snap = await q.get();
  const rows: Row[] = snap.docs.map((doc) => {
    const d = doc.data() as Record<string, any>;
    const syncedAt = typeof d.mindbodyMasterSyncedAt === "string" ? d.mindbodyMasterSyncedAt : null;
    const at = syncedAt ? Date.parse(syncedAt) : NaN;
    return {
      id: doc.id,
      name: `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim() || doc.id,
      studio: String(d.homeStudioId ?? ""),
      active: d.isActive !== false,
      syncedAt,
      ageDays: Number.isFinite(at) ? Math.floor((now - at) / DAY_MS) : null,
      visits: typeof d.clientsNumberOfVisitsAtSite === "number" ? d.clientsNumberOfVisitsAtSite : null,
      hasPrior: !!d.priorHistory,
      mindbodyLinked: looksMindbodyLinked(d, doc.id),
    };
  });

  /* ---- per studio ---- */
  const byStudio = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.studio || "(no home studio)";
    if (!byStudio.has(k)) byStudio.set(k, []);
    byStudio.get(k)!.push(r);
  }

  const needsSync = (r: Row) =>
    r.mindbodyLinked && (r.ageDays === null || (staleDays !== null && r.ageDays > staleDays));

  console.log("");
  console.log(
    "studio".padEnd(22) +
      "clients".padStart(8) +
      "active".padStart(8) +
      "linked".padStart(8) +
      "synced".padStart(8) +
      "visits".padStart(8) +
      "prior".padStart(8) +
      "to sync".padStart(9),
  );
  console.log("-".repeat(79));

  const line = (label: string, rs: Row[]) => {
    const linked = rs.filter((r) => r.mindbodyLinked).length;
    console.log(
      label.slice(0, 21).padEnd(22) +
        String(rs.length).padStart(8) +
        String(rs.filter((r) => r.active).length).padStart(8) +
        String(linked).padStart(8) +
        String(rs.filter((r) => r.syncedAt).length).padStart(8) +
        String(rs.filter((r) => r.visits !== null).length).padStart(8) +
        String(rs.filter((r) => r.hasPrior).length).padStart(8) +
        String(rs.filter(needsSync).length).padStart(9),
    );
  };

  for (const [id, rs] of [...byStudio.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const site = studioSite[id] ? ` (site ${studioSite[id]})` : "";
    line((studioName[id] ?? id) + site, rs);
  }
  console.log("-".repeat(79));
  line("ALL", rows);

  /* ---- how stale is "synced"? ---- */
  const synced = rows.filter((r) => r.ageDays !== null);
  const bucket = (lo: number, hi: number) =>
    synced.filter((r) => r.ageDays! >= lo && r.ageDays! < hi).length;
  console.log("");
  console.log("Of the clients that HAVE been synced:");
  console.log(`  today            ${String(bucket(0, 1)).padStart(6)}`);
  console.log(`  1-7 days ago     ${String(bucket(1, 7)).padStart(6)}`);
  console.log(`  7-30 days ago    ${String(bucket(7, 30)).padStart(6)}`);
  console.log(`  over 30 days     ${String(synced.filter((r) => r.ageDays! >= 30).length).padStart(6)}`);

  /* ---- the answer AJ has been estimating ---- */
  const linked = rows.filter((r) => r.mindbodyLinked);
  const todo = rows.filter(needsSync);
  const calls = todo.length * CALLS_PER_CLIENT;
  const dollars = calls * DOLLARS_PER_CALL;

  console.log("");
  console.log("=".repeat(76));
  console.log("WHAT CATCHING UP WOULD COST");
  console.log("=".repeat(76));
  console.log(`  Clients in the database        ${rows.length}`);
  console.log(`  Linked to Mindbody             ${linked.length}  ${pct(linked.length, rows.length)}`);
  console.log(`  ${staleDays === null ? "Never synced                 " : "Never synced or stale        "}  ${todo.length}`);
  console.log(`  Mindbody calls to catch up     ${calls.toLocaleString()}  (${CALLS_PER_CLIENT} a client)`);
  console.log(`  At $${DOLLARS_PER_CALL} a call           about $${dollars.toFixed(2)}, once`);
  console.log("");
  console.log(`  Clients with a visit count     ${rows.filter((r) => r.visits !== null).length}`);
  console.log(`  Clients with a prior record    ${rows.filter((r) => r.hasPrior).length}`);

  /* ---- bookings and sessions, for the same planning ---- */
  try {
    const sched = await db.collection("schedules").count().get();
    const sess = await db.collection("sessions").count().get();
    console.log("");
    console.log(`  Bookings in the database       ${sched.data().count.toLocaleString()}`);
    console.log(`  Sessions recorded in Journey   ${sess.data().count.toLocaleString()}`);
  } catch (err: any) {
    console.log(`  (could not count bookings/sessions: ${err?.message || err})`);
  }

  /* ---- the proof artifact ---- */
  const file = writeReport("mindbody-sync-report", {
    generatedAt: new Date(now).toISOString(),
    staleDays,
    onlyStudio: onlyStudio ?? null,
    totals: {
      clients: rows.length,
      linked: linked.length,
      needingSync: todo.length,
      callsToCatchUp: calls,
      withVisitCount: rows.filter((r) => r.visits !== null).length,
      withPriorHistory: rows.filter((r) => r.hasPrior).length,
    },
    /* THE deliverable: everyone a backfill has not reached. After a run,
       this list must be empty. */
    notSynced: todo.map((r) => ({
      id: r.id,
      name: r.name,
      studio: studioName[r.studio] ?? r.studio,
      lastSyncedAt: r.syncedAt,
      ageDays: r.ageDays,
    })),
    /* Linked to nothing in Mindbody: a backfill will skip these for good, so
       they need a person, not another run. */
    notLinked: rows
      .filter((r) => !r.mindbodyLinked)
      .map((r) => ({ id: r.id, name: r.name, studio: studioName[r.studio] ?? r.studio })),
  });

  console.log("");
  console.log(`Full report: ${file}`);
  if (todo.length === 0) {
    console.log("Nobody is unsynced. That is the result a backfill is aiming for.");
  } else {
    console.log(`${todo.length} client${todo.length === 1 ? "" : "s"} still to sync — they are listed in that file.`);
  }
  if (hasFlag("verbose")) {
    for (const r of todo.slice(0, 50)) {
      console.log(`  ${r.id.padEnd(12)} ${r.name.padEnd(28)} ${studioName[r.studio] ?? r.studio}`);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});
