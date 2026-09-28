/**
 * READ-ONLY — did Local set-up already take a studio's own machine off its
 * floor? ALWAYS READ-ONLY: there is no --commit, and nothing here writes
 * anything or asks Mindbody anything.
 *
 * Round: the Local set-up fix (Sep 28 2026). Until then, saving Local set-up
 * on a machine (My Studio → Machines → a machine → Local set-up, or Admins →
 * All locations → Equipment → Local setup) merged a whole roster document
 * into studios/{s}/roster/{machineId}:
 *
 *     source: "catalog", basedOn: <the machine's own id>, status: "active"
 *
 * On a studio's OWN machine (source "custom", which carries its whole
 * `definition`) that made it a copy of a catalog machine that does not
 * exist. useStudioMachines drops such an entry, so the machine left the floor
 * list, the Active Session and the Catalog, and no screen could open it
 * again. The merge left its `definition` on the document, and only a
 * studio's own machine has one, which is how this script knows one. Its
 * lineage (`basedOn`, the Max Strength machine it is most like) was
 * overwritten; the script says where it can still be found.
 *
 * It also lists anything else the floor would drop for the same reason: a
 * catalog machine whose `basedOn` names no machine in the catalog, and an
 * entry with no `source` at all. And, for information, a catalog machine
 * whose `basedOn` is not its own id (every writer sets the two equal).
 *
 * The same save also put machines that were out of service back in service.
 * That leaves no trace on the document, so this script cannot find it: a
 * leader's look at the floor's Out of service switches is the only check.
 *
 * WHAT IT READS: the studios (names), the catalog's machine ids, every
 * studio's roster, and catalogSubmissions only if something is damaged (an
 * offer records the lineage the machine had).
 *
 * READING THE RESULT
 *   "NOTHING DAMAGED"   no studio's own machine was hit; the fix only
 *                       prevents it from here on.
 *   Anything listed     named by studio and machine, with when it was last
 *                       written and by whom (that write is the Local set-up
 *                       save). Nothing is repaired here: putting one back
 *                       (source "custom", its lineage restored) is a
 *                       separate write AJ approves first.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/check-roster-damage.ts
 *
 * Needs service-account.json in the project folder (scripts/lib/admin.ts).
 */

import { connectFirestore, writeReport } from "./lib/admin.ts";

type Kind = "damaged" | "orphaned" | "no-source" | "id-mismatch";

interface Finding {
  kind: Kind;
  studioId: string;
  studioName: string;
  machineId: string;
  /** The machine's own name, from its definition, when it has one. */
  name: string | null;
  source: string | null;
  basedOn: string | null;
  status: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  /** Where a damaged machine's lost lineage can still be read. */
  lineage?: string;
}

const WHAT: Record<Kind, string> = {
  damaged: "A STUDIO'S OWN MACHINE, REWRITTEN AS A CATALOG COPY (off the floor)",
  orphaned: "A catalog copy of a machine the catalog does not have (off the floor)",
  "no-source": "No source at all (off the floor)",
  "id-mismatch": "A catalog copy whose basedOn is not its own id (on the floor; for information)",
};

const asIso = (v: unknown): string | null => {
  if (!v) return null;
  if (typeof (v as { toDate?: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof v === "string" ? v : null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

async function main() {
  console.log("Read-only. Nothing is written, and no Mindbody calls.\n");
  const db = connectFirestore();

  const catalogIds = new Set((await db.collection("machines").select().get()).docs.map((d) => d.id));
  const studios = await db.collection("studios").select("name").get();
  console.log(`Catalog machines: ${catalogIds.size}`);
  console.log(`Studios:          ${studios.size}\n`);

  const findings: Finding[] = [];
  const perStudio: Array<{ studioId: string; studioName: string; entries: number; own: string[]; catalog: number }> = [];

  for (const studio of studios.docs) {
    const studioName = str(studio.get("name")) ?? studio.id;
    const roster = await db.collection("studios").doc(studio.id).collection("roster").get();
    // The studio's own machines, intact: the ones this bug could have hit.
    const own: string[] = [];
    let catalog = 0;

    for (const d of roster.docs) {
      const data = d.data();
      const source = str(data.source);
      const basedOn = str(data.basedOn);
      const definition = data.definition as { name?: unknown } | undefined;
      const hasDefinition = typeof definition === "object" && definition !== null;
      if (source === "custom") {
        own.push(`${d.id}${hasDefinition && str(definition!.name) ? ` "${str(definition!.name)}"` : ""}, ${str(data.status) ?? "no status"}`);
      }
      if (source === "catalog") catalog++;

      let kind: Kind | null = null;
      if (source === "catalog" && (hasDefinition || data.adoptedFrom)) kind = "damaged";
      else if (source === "catalog" && (!basedOn || !catalogIds.has(basedOn))) kind = "orphaned";
      else if (source !== "catalog" && source !== "custom") kind = "no-source";
      else if (source === "catalog" && basedOn !== d.id) kind = "id-mismatch";
      if (!kind) continue;

      findings.push({
        kind,
        studioId: studio.id,
        studioName,
        machineId: d.id,
        name: hasDefinition ? str(definition!.name) : null,
        source,
        basedOn,
        status: str(data.status),
        updatedAt: asIso(data.updatedAt),
        updatedBy: str(data.updatedBy),
      });
    }
    perStudio.push({ studioId: studio.id, studioName, entries: roster.size, own, catalog });
  }

  for (const s of perStudio) {
    console.log(
      `  ${s.studioName.padEnd(28)} ${String(s.entries).padStart(3)} machines ` +
        `(${s.catalog} Max Strength, ${s.own.length} the studio's own)`,
    );
    for (const machine of s.own) console.log(`      own, intact: ${machine}`);
  }
  console.log("");

  // Where a damaged machine's lineage can still be read: the machine it was
  // copied from, or the offer it was sent to the catalog with.
  const damaged = findings.filter((f) => f.kind === "damaged");
  if (damaged.length > 0) {
    const offers = await db.collection("catalogSubmissions").select("studioId", "machineId", "basedOn").get();
    for (const f of damaged) {
      const doc = await db.collection("studios").doc(f.studioId).collection("roster").doc(f.machineId).get();
      const from = doc.get("adoptedFrom") as { studioId?: string; machineId?: string } | undefined;
      if (from?.studioId && from.machineId) {
        // A copy's lineage is the original's (machine-db: `basedOn ?? machineId`).
        const original = await db.collection("studios").doc(from.studioId).collection("roster").doc(from.machineId).get();
        if (original.exists) {
          f.lineage = `${str(original.get("basedOn")) ?? from.machineId} (the machine it was copied from)`;
        }
      }
      if (!f.lineage) {
        const offer = offers.docs.find((o) => o.get("studioId") === f.studioId && o.get("machineId") === f.machineId);
        const lineage = offer ? str(offer.get("basedOn")) : null;
        if (lineage) f.lineage = `${lineage} (the offer to the catalog, ${offer!.id})`;
      }
    }
  }

  const byKind = (kind: Kind) => findings.filter((f) => f.kind === kind);
  if (damaged.length === 0) {
    console.log("NOTHING DAMAGED.");
    console.log("No studio's own machine was rewritten as a catalog copy by Local set-up.");
  }
  for (const kind of ["damaged", "orphaned", "no-source", "id-mismatch"] as Kind[]) {
    const list = byKind(kind);
    if (list.length === 0) continue;
    console.log(`\n${WHAT[kind]}: ${list.length}`);
    for (const f of list) {
      console.log(
        `  ${f.studioName} / ${f.machineId}${f.name ? ` "${f.name}"` : ""}  ` +
          `source ${f.source ?? "none"}, basedOn ${f.basedOn ?? "none"}, status ${f.status ?? "none"}` +
          (f.updatedAt ? `, last written ${f.updatedAt}` : "") +
          (f.updatedBy ? ` by ${f.updatedBy}` : ""),
      );
      if (kind === "damaged") {
        console.log(`      its lineage: ${f.lineage ?? "not recorded anywhere this script can read"}`);
      }
    }
  }

  const file = writeReport("roster-damage", {
    ranAt: new Date().toISOString(),
    catalogMachines: catalogIds.size,
    studios: perStudio,
    findings,
  });
  console.log(`\nFull detail: ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
