/**
 * READ-ONLY — what do real clients' packages look like in Mindbody's API?
 *
 * Round: Renewals, Phase 0 (Sep 2026). The renewal math reads two things from
 * Mindbody: when a contract's billing ends (the contract's EndDate and its
 * scheduled autopay charges) and how many sessions a client still holds (their
 * pricing options). AJ's account screenshots showed the shapes on screen; this
 * confirms them through the API the nightly job uses, for a handful of real
 * clients, before anyone relies on the numbers.
 *
 * It prints no names or contact details — only package names, counts and
 * dates, as "client 1", "client 2"... The full answer goes to backups/.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/mindbody-renewals-discovery.ts --studio <studioId>
 *   npx tsx scripts/mindbody-renewals-discovery.ts --studio <studioId> --count 20
 *
 * Costs 3 Mindbody calls per client (5 clients = 15 calls).
 */

import { connectFirestore, flag, writeReport } from "./lib/admin.ts";
import { mindbodyConfigured, pullClientCommercial } from "../server/mindbody-client.ts";

async function main() {
  if (!mindbodyConfigured()) {
    console.error("Mindbody credentials are missing from .env.");
    process.exit(1);
  }
  const studioId = flag("studio");
  const count = Math.min(Math.max(Number(flag("count") ?? 5) || 5, 1), 50);
  if (!studioId) {
    console.error("Pass --studio <studioId>. The studio ids are in the Operations dashboard's Studios tab.");
    process.exit(1);
  }
  const db = connectFirestore();
  const studio = await db.collection("studios").doc(studioId).get();
  const site = studio.exists ? String(studio.get("mindbodySiteId") ?? "").trim() : "";
  if (!site) {
    console.error(`Studio ${studioId} has no Mindbody site id.`);
    process.exit(1);
  }

  // Active clients with a visit on record first: the likeliest to hold a package.
  const snap = await db
    .collection("clients")
    .where("homeStudioId", "==", studioId)
    .limit(400)
    .get();
  const candidates = snap.docs
    .filter((d) => d.get("isActive") !== false && !d.get("provisional"))
    .sort((a, b) => String(b.get("lastSessionDate") ?? "").localeCompare(String(a.get("lastSessionDate") ?? "")))
    .slice(0, count);

  const contractNames = new Map<string, number>();
  const serviceNames = new Map<string, number>();
  const clients: unknown[] = [];
  let n = 0;
  for (const d of candidates) {
    n++;
    const mbId = String(d.get("mindbodyClientId") || d.id);
    const pull = await pullClientCommercial(site, mbId, { memberships: true });
    for (const c of pull.contracts ?? []) {
      contractNames.set(c.contractName, (contractNames.get(c.contractName) ?? 0) + 1);
    }
    for (const s of pull.services ?? []) {
      serviceNames.set(s.name, (serviceNames.get(s.name) ?? 0) + 1);
    }
    console.log(`\nclient ${n}`);
    for (const c of pull.contracts ?? []) {
      const ev = c.upcomingAutopayEvents ?? [];
      console.log(
        `  contract "${c.contractName}"  ${c.startDate?.slice(0, 10) ?? "?"} -> ${c.endDate?.slice(0, 10) ?? "?"}` +
          `  autopay ${c.autopayStatus || "?"}  ${ev.length} charges scheduled` +
          (ev.length ? ` (next ${ev[0].scheduleDate?.slice(0, 10)}, last ${ev[ev.length - 1].scheduleDate?.slice(0, 10)}, $${ev[0].chargeAmount})` : ""),
      );
    }
    for (const s of pull.services ?? []) {
      console.log(
        `  pricing option "${s.name}"  ${s.remaining ?? "?"} of ${s.count ?? "?"} left` +
          `  active ${s.activeDate?.slice(0, 10) ?? "?"}  expires ${s.expirationDate?.slice(0, 10) ?? "?"}` +
          (s.current === false ? "  (not current)" : ""),
      );
    }
    for (const m of pull.memberships ?? []) {
      console.log(`  membership "${m.membershipName}"  ${m.remaining ?? "?"} of ${m.count ?? "?"} left`);
    }
    if (pull.error) console.log(`  (a Mindbody call failed: ${pull.error.slice(0, 120)})`);
    clients.push({
      client: n,
      contracts: pull.contracts,
      services: pull.services,
      memberships: pull.memberships,
    });
  }

  console.log("\nContract names seen:");
  for (const [name, k] of contractNames) console.log(`  ${k} x "${name}"`);
  console.log("Pricing option names seen:");
  for (const [name, k] of serviceNames) console.log(`  ${k} x "${name}"`);
  const file = writeReport("mindbody-renewals-discovery", { site, studioId, clients });
  console.log(`\nFull answer: ${file}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});
