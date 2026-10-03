/**
 * ONE-TIME — clear the Limbo items the webhook should never have parked.
 *
 * Round: Limbo cleanup (Oct 2 2026). Limbo held 168 open items:
 *   - 114 from Mindbody's developer sandbox (site -99): nameless cancellations
 *     no studio could own. DISMISSED, exactly as the Dismiss button does
 *     (`resolvedAt` + `dismissed: true`), so Undo on the Limbo screen still
 *     brings any one back.
 *   - 54 client items on the shared site 29068, parked because a client event
 *     names no location. For each client:
 *       already has a home studio (the nightly contracts sync placed them)
 *         -> RESOLVED with that studio, exactly as Release does;
 *       no home studio, and Mindbody's homeLocation names exactly one studio
 *         -> homeStudioId set on that one field, then resolved (the rule the
 *            webhook now follows, commit 42653283);
 *       otherwise -> LEFT for a person on the Limbo screen.
 * Nothing is deleted. A client already placed is never moved.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/clean-limbo-oct2.ts            # dry run, writes nothing
 *   npx tsx scripts/clean-limbo-oct2.ts --commit   # writes
 */
import { connectFirestore, hasFlag, writeReport } from "./lib/admin.ts";
import { Timestamp } from "firebase-admin/firestore";

const SANDBOX = "-99";
const commit = hasFlag("commit");
const db = connectFirestore();

const studios = (await db.collection("studios").get()).docs.map((d) => ({
  id: d.id,
  site: String(d.data().mindbodySiteId ?? "").trim(),
  loc: String(d.data().mindbodyLocationId ?? "").trim(),
  name: String(d.data().name ?? d.id),
}));
const nameOf = (id: string) => studios.find((s) => s.id === id)?.name ?? id;

const open = (await db.collection("mindbodyLimbo").where("resolvedAt", "==", null).get()).docs;
console.log(`${commit ? "COMMIT" : "DRY RUN"} · ${open.length} open Limbo items\n`);

const report: Record<string, unknown>[] = [];
let batch = db.batch();
let inBatch = 0;
const flush = async () => {
  if (commit && inBatch) await batch.commit();
  batch = db.batch();
  inBatch = 0;
};
const stage = async (fn: () => void) => {
  fn();
  if (++inBatch >= 400) await flush();
};

// A client's record on this site: the plain number, else the site-qualified one.
async function clientRecord(site: string, clientId: string) {
  for (const id of [clientId, `${site}-${clientId}`]) {
    const snap = await db.collection("clients").doc(id).get();
    if (!snap.exists) continue;
    const d = snap.data()!;
    const recSite = String(d.mindbodySiteId ?? "").trim();
    const homeSite = studios.find((s) => s.id === d.homeStudioId)?.site ?? "";
    if (!recSite || recSite === site || homeSite === site) return snap;
  }
  return null;
}

const now = Timestamp.now();
const tally = { sandbox: 0, alreadyPlaced: 0, placedByHome: 0, left: 0 };
const placedThisRun = new Map<string, string>();

for (const item of open) {
  const x = item.data();
  const site = String(x.siteId ?? "").trim();

  if (site === SANDBOX) {
    tally.sandbox++;
    report.push({ id: item.id, action: "dismiss-sandbox" });
    await stage(() => batch.update(item.ref, { resolvedAt: now, dismissed: true }));
    continue;
  }

  if (x.kind !== "client" || !x.clientId) continue;
  const clientId = String(x.clientId);
  const rec = await clientRecord(site, clientId);
  const home = (rec?.data()?.homeStudioId as string | undefined) ?? placedThisRun.get(clientId);

  if (home) {
    tally.alreadyPlaced++;
    report.push({ id: item.id, clientId, action: "resolve", studio: nameOf(home) });
    await stage(() => batch.update(item.ref, { resolvedAt: now, resolvedStudioId: home }));
    continue;
  }

  const p = (x.payload?.eventData ?? x.payload ?? {}) as Record<string, unknown>;
  const raw = p.homeLocation && typeof p.homeLocation === "object"
    ? (p.homeLocation as Record<string, unknown>).id
    : p.homeLocation;
  const loc = raw === undefined || raw === null ? "" : String(raw).trim();
  const matches = studios.filter((s) => s.site === site && s.loc && s.loc === loc);

  if (rec && matches.length === 1) {
    const studio = matches[0];
    tally.placedByHome++;
    placedThisRun.set(clientId, studio.id);
    report.push({ id: item.id, clientId, doc: rec.id, action: "place-by-homeLocation", homeLocation: loc, studio: studio.name });
    console.log(`  place ${clientId} -> ${studio.name} (homeLocation ${loc})`);
    await stage(() => {
      batch.update(rec.ref, { homeStudioId: studio.id });
      batch.update(item.ref, { resolvedAt: now, resolvedStudioId: studio.id });
    });
    continue;
  }

  tally.left++;
  report.push({ id: item.id, clientId, action: "leave", homeLocation: loc || null, record: !!rec });
  console.log(`  leave ${clientId} (homeLocation ${loc || "none"}${rec ? "" : ", no record"})`);
}
await flush();

console.log(
  `\nSandbox dismissed ${tally.sandbox} · already placed, resolved ${tally.alreadyPlaced} · ` +
    `placed by homeLocation ${tally.placedByHome} · left for a person ${tally.left}`,
);
console.log(`Report: ${writeReport(`limbo-cleanup-${commit ? "commit" : "dry"}`, { tally, report })}`);
if (!commit) console.log("Dry run: nothing written. Add --commit to write.");
