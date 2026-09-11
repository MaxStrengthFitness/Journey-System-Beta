/**
 * READ-ONLY — do the two Mindbody sites share any client ids?
 *
 * Round: Renewals, Phase 0 (Sep 2026). RUN THIS BEFORE subscribing site 29068
 * to more webhooks, and before trusting renewals for westlake, Strongsville or
 * Willoughby.
 *
 * WHY IT MATTERS
 * A Mindbody client lives at clients/{mindbodyClientId} — the id alone, with
 * no site in it. Mindbody only promises an id is unique inside ONE site, and
 * MSF has two: 29068 (westlake, Strongsville, Willoughby) and 5746957 (Solon).
 * If client 100001234 exists at both, the two people share one Journey
 * document: one person's contracts, bookings and renewal land on the other's
 * profile. Nothing in the app can tell.
 *
 * WHAT IT DOES — nothing but reads
 *   1. Reads every client document and the studios (to know each client's
 *      home site).
 *   2. Asks the OTHER site's Mindbody whether it has a client with the same id
 *      (GET /client/clients?ClientIds=..., 50 ids a call — about 15 calls for
 *      the whole roster).
 *   3. Also looks for documents that already carry contracts or pricing
 *      options from a site that is not their home site — a collision that has
 *      already happened.
 *   4. Prints a summary and writes the full list to backups/ (gitignored,
 *      because it carries names).
 *
 * READING THE RESULT
 *   "No shared ids"            -> safe; identity can stay as it is.
 *   "Same id, SAME name"       -> probably one person with an account at both
 *                                 sites. Worth a look, not an emergency.
 *   "Same id, DIFFERENT names" -> two people on one document. Stop and send the
 *                                 report to Claude before going further.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/check-mindbody-client-collisions.ts
 */

import { connectFirestore, writeReport } from "./lib/admin.ts";
import { mindbodyConfigured, mindbodyGet } from "../server/mindbody-client.ts";

const SITES = ["29068", "5746957"];
const BATCH = 50;

interface ClientRow {
  docId: string;
  mindbodyId: string;
  name: string;
  homeStudioId: string | null;
  homeSite: string | null;
  foreignSiteData: string[];
}

function normalizeName(first: unknown, last: unknown): string {
  return `${String(first ?? "").trim()} ${String(last ?? "").trim()}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  if (!mindbodyConfigured()) {
    console.error("MINDBODY_API_KEY / MINDBODY_SOURCE_NAME / MINDBODY_SOURCE_PASSWORD are missing from .env.");
    process.exit(1);
  }
  const db = connectFirestore();

  const studios = await db.collection("studios").get();
  const siteByStudio = new Map<string, string | null>();
  studios.docs.forEach((d) => {
    const site = d.get("mindbodySiteId");
    siteByStudio.set(d.id, site ? String(site).trim() : null);
  });

  const snap = await db.collection("clients").get();
  const rows: ClientRow[] = [];
  let skipped = 0;
  for (const d of snap.docs) {
    const c = d.data();
    if (c.provisional || c.supersededById || c.migratedTo) {
      skipped++;
      continue;
    }
    const mindbodyId = String(c.mindbodyClientId || c.mindbodyId || d.id).trim();
    const homeStudioId = typeof c.homeStudioId === "string" ? c.homeStudioId : null;
    const homeSite = homeStudioId ? siteByStudio.get(homeStudioId) ?? null : null;
    const foreignSiteData = new Set<string>();
    for (const map of [c.mindbodyContracts, c.mindbodyMemberships, c.mindbodyServices]) {
      for (const rec of Object.values((map ?? {}) as Record<string, any>)) {
        const s = rec?.siteId !== undefined && rec?.siteId !== null ? String(rec.siteId) : null;
        if (s && homeSite && s !== homeSite) foreignSiteData.add(s);
      }
    }
    rows.push({
      docId: d.id,
      mindbodyId,
      name: normalizeName(c.firstName, c.lastName),
      homeStudioId,
      homeSite,
      foreignSiteData: Array.from(foreignSiteData),
    });
  }
  console.log(`Clients checked: ${rows.length} (skipped ${skipped} temporary or merged-away records)`);

  // For every site, ask it about the ids whose home is ANOTHER site (or unknown).
  const hits: Array<{
    docId: string;
    mindbodyId: string;
    journeyName: string;
    homeSite: string | null;
    otherSite: string;
    otherName: string;
    sameName: boolean;
  }> = [];
  let calls = 0;
  for (const site of SITES) {
    const ask = rows.filter((r) => r.homeSite !== site);
    for (let i = 0; i < ask.length; i += BATCH) {
      const batch = ask.slice(i, i + BATCH);
      const res = await mindbodyGet(site, "client/clients", {
        ClientIds: batch.map((r) => r.mindbodyId),
        Limit: 200,
      });
      calls++;
      if (!res.ok) {
        console.error(`Site ${site}: Mindbody refused a lookup (HTTP ${res.status}). Stopping — nothing was changed.`);
        process.exit(1);
      }
      const byId = new Map(batch.map((r) => [r.mindbodyId, r]));
      for (const mb of res.data?.Clients ?? []) {
        const row = byId.get(String(mb?.Id ?? "").trim());
        if (!row) continue;
        const otherName = normalizeName(mb?.FirstName, mb?.LastName);
        hits.push({
          docId: row.docId,
          mindbodyId: row.mindbodyId,
          journeyName: row.name,
          homeSite: row.homeSite,
          otherSite: site,
          otherName,
          sameName: otherName === row.name,
        });
      }
    }
  }

  const different = hits.filter((h) => !h.sameName && h.homeSite !== null);
  const same = hits.filter((h) => h.sameName && h.homeSite !== null);
  const unknownHome = hits.filter((h) => h.homeSite === null);
  const alreadyMixed = rows.filter((r) => r.foreignSiteData.length > 0);

  console.log("");
  console.log(`Mindbody lookups: ${calls} calls`);
  console.log(`Same id at both sites, DIFFERENT names: ${different.length}`);
  console.log(`Same id at both sites, same name:       ${same.length}`);
  console.log(`Found at a site, but the Journey record has no home studio: ${unknownHome.length}`);
  console.log(`Records already holding another site's contracts or pricing options: ${alreadyMixed.length}`);
  for (const h of different.slice(0, 25)) {
    console.log(`  ${h.mindbodyId}: "${h.journeyName}" in Journey (site ${h.homeSite}) vs "${h.otherName}" at site ${h.otherSite}`);
  }
  if (different.length > 25) console.log(`  ...and ${different.length - 25} more in the report`);

  const file = writeReport("mindbody-client-collisions", {
    ranAt: new Date().toISOString(),
    clientsChecked: rows.length,
    calls,
    different,
    same,
    unknownHome,
    alreadyMixed: alreadyMixed.map((r) => ({
      docId: r.docId,
      name: r.name,
      homeSite: r.homeSite,
      foreignSiteData: r.foreignSiteData,
    })),
  });
  console.log("");
  console.log(`Full list: ${file}`);
  console.log(
    different.length === 0 && alreadyMixed.length === 0
      ? "RESULT: no shared ids between different people. Safe to continue."
      : "RESULT: shared ids found. Stop here and send the report to Claude before subscribing site 29068.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});
