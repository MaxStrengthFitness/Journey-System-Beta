/**
 * Give the second person on a shared Mindbody number a Journey record of
 * their own, and move their bookings onto it. Dry run by default; --commit
 * writes.
 *
 * Round: client identity (Sep 23 2026, docs/rounds/2026-09-23-client-
 * identity.md). Both MSF Mindbody sites number clients from 100000001, so
 * `clients/{X}` can hold one person while the other site books a different
 * one under X. The sync, the webhook and Limbo now file the second person at
 * `clients/{site}-{X}` (src/lib/mindbody-site.ts). This script puts the
 * bookings that arrived BEFORE that right:
 *
 *   filed on the wrong person   clientId X, booked at a studio on the other
 *                               site from X's home (what the damage check finds)
 *   left unlinked               clientId empty, by phases 26–27 or by
 *                               scripts/unlink-crossed-bookings.ts
 *
 * Both are moved to `{site}-{X}`, which is made from the booking if it does
 * not exist yet: the name Mindbody gave the booking, home studio = the studio
 * of their most recent booking, `mindbodyClientId` X and `mindbodySiteId`.
 * Nothing else is touched — a booking linked to any other record is listed,
 * never changed, and sessions are never touched.
 *
 * It supersedes scripts/unlink-crossed-bookings.ts: run this one instead.
 *
 * SAFETY
 *   - --commit first writes a JSON backup of every booking it will change.
 *   - Each booking is re-read in a transaction and moved only if it is still
 *     linked the way the dry run saw it.
 *   - A record is created only where none exists (create, not merge).
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/rehome-colliding-bookings.ts             # dry run
 *   npx tsx scripts/rehome-colliding-bookings.ts --commit    # backup, then write
 *   npx tsx scripts/rehome-colliding-bookings.ts --report backups\<collisions>.json
 */

import fs from "fs";
import path from "path";
import { Timestamp } from "firebase-admin/firestore";
import { connectFirestore, writeReport, flag } from "./lib/admin.ts";
import { chooseClientDoc, siteQualifiedClientId } from "../src/lib/mindbody-site.ts";

const COMMIT = process.argv.includes("--commit");

function newestReport(): string | null {
  const dir = "backups";
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("mindbody-client-collisions-") && f.endsWith(".json"))
    .sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

const iso = (v: any): string | null =>
  typeof v?.toDate === "function" ? v.toDate().toISOString() : null;

interface Move {
  rowId: string;
  mindbodyId: string;
  site: string;
  studioId: string;
  bookedName: string;
  when: string | null;
  from: string | null;
  to: string;
}

async function main() {
  const reportPath = flag("report") ?? newestReport();
  if (!reportPath || !fs.existsSync(reportPath)) {
    console.error("No collision report found. Run scripts/check-mindbody-client-collisions.ts first,");
    console.error("or pass one with --report <path>.");
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const ids = [
    ...new Set<string>(
      [...(report.different ?? []), ...(report.unknownHome ?? [])].map((r: any) => String(r.mindbodyId)),
    ),
  ];
  console.log(`Collision report: ${reportPath}`);
  console.log(`Shared Mindbody numbers: ${ids.length}`);
  console.log(COMMIT ? "MODE: COMMIT\n" : "MODE: dry run — nothing will be written.\n");

  const db = connectFirestore();

  const studios: Array<{ id: string; mindbodySiteId?: string }> = [];
  const nameOfStudio = new Map<string, string>();
  for (const d of (await db.collection("studios").get()).docs) {
    const site = d.get("mindbodySiteId");
    studios.push({ id: d.id, mindbodySiteId: site != null ? String(site).trim() : undefined });
    nameOfStudio.set(d.id, String(d.get("name") ?? d.id));
  }
  const siteOf = (studioId: unknown) =>
    typeof studioId === "string" ? studios.find((s) => s.id === studioId)?.mindbodySiteId ?? null : null;

  // Every Mindbody booking under a shared number, 30 numbers per query.
  const rows: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await db.collection("schedules").where("mindbodyClientId", "in", ids.slice(i, i + 30)).get();
    rows.push(...snap.docs);
  }

  const clientCache = new Map<string, FirebaseFirestore.DocumentData | null>();
  const readClient = async (id: string) => {
    if (!clientCache.has(id)) {
      const s = await db.collection("clients").doc(id).get();
      clientCache.set(id, s.exists ? s.data()! : null);
    }
    return clientCache.get(id)!;
  };

  const moves: Move[] = [];
  const leftAlone: string[] = [];
  for (const r of rows) {
    const x = String(r.get("mindbodyClientId"));
    const site = siteOf(r.get("studioId"));
    if (!site) continue;
    const current = (r.get("clientId") as string | null) ?? null;

    const qualifiedId = siteQualifiedClientId(site, x);
    const choice = chooseClientDoc({
      mindbodyClientId: x,
      site,
      qualifiedExists: (await readClient(qualifiedId)) !== null,
      plain: await readClient(x),
      studios,
    });
    if (choice.docId !== qualifiedId || current === qualifiedId) continue;
    // Only the two states this round explains are moved.
    if (current !== null && current !== x) {
      leftAlone.push(`${r.id} (linked to ${current})`);
      continue;
    }
    moves.push({
      rowId: r.id,
      mindbodyId: x,
      site,
      studioId: r.get("studioId"),
      bookedName: String(r.get("clientName") ?? ""),
      when: iso(r.get("startTime")),
      from: current,
      to: qualifiedId,
    });
  }

  moves.sort((a, b) => (a.to + (a.when ?? "")).localeCompare(b.to + (b.when ?? "")));
  const people = new Map<string, Move[]>();
  for (const m of moves) (people.get(m.to) ?? people.set(m.to, []).get(m.to)!).push(m);

  for (const [docId, list] of people) {
    const exists = (await readClient(docId)) !== null;
    const latest = [...list].sort((a, b) => (b.when ?? "").localeCompare(a.when ?? ""))[0];
    console.log(
      `${docId}  "${latest.bookedName}"  ${exists ? "record exists" : `NEW record, home ${nameOfStudio.get(latest.studioId)}`}`,
    );
    for (const m of list) {
      console.log(
        `    booking ${m.rowId.padEnd(8)} ${m.when?.slice(0, 10) ?? "no date"}  at ${nameOfStudio.get(m.studioId)}  ` +
          `${m.from ? `was on ${m.from} (the other site's person)` : "was unlinked"}`,
      );
    }
  }
  console.log(`\nPeople: ${people.size}   Bookings to move: ${moves.length}`);
  if (leftAlone.length) {
    console.log(`Linked to some other record, left alone: ${leftAlone.length}`);
    for (const l of leftAlone) console.log(`    ${l}`);
  }

  if (!COMMIT) {
    if (moves.length) console.log("\nRe-run with --commit to back these up and write them.");
    return;
  }
  if (!moves.length) {
    console.log("Nothing to do.");
    return;
  }

  const backup: Record<string, unknown> = {};
  for (const r of rows) if (moves.some((m) => m.rowId === r.id)) backup[r.id] = r.data();
  const backupFile = writeReport("rehome-colliding-bookings-backup", { ranAt: new Date().toISOString(), moves, rows: backup });
  console.log(`\nBackup written: ${backupFile}`);

  let made = 0;
  for (const [docId, list] of people) {
    if ((await readClient(docId)) !== null) continue;
    const latest = [...list].sort((a, b) => (b.when ?? "").localeCompare(a.when ?? ""))[0];
    const earliest = [...list].sort((a, b) => (a.when ?? "").localeCompare(b.when ?? ""))[0];
    const name = latest.bookedName.trim();
    const [first, ...rest] = name && name !== "Unknown Client" ? name.split(" ") : [];
    await db.collection("clients").doc(docId).create({
      firstName: first || "Mindbody",
      lastName: rest.join(" ") || (first ? "" : `Client ${latest.mindbodyId}`),
      ...(first ? { mindbody_name: name } : {}),
      mindbodyClientId: latest.mindbodyId,
      mindbodySiteId: latest.site,
      homeStudioId: latest.studioId,
      isActive: true,
      height: "",
      remainingSessions: 0,
      sessionCount: 0,
      completedSessions: 0,
      ...(earliest.when
        ? {
            firstAppointmentDate: Timestamp.fromDate(new Date(earliest.when)),
            firstAppointmentDateSource: "rehome:earliest-booking",
          }
        : {}),
      createdAt: Timestamp.now(),
      mindbodySyncedAt: Timestamp.now(),
      createdBy: "mindbody:rehome-script",
      isMindbodyStub: false,
    });
    made++;
  }

  let moved = 0;
  let changed = 0;
  for (const m of moves) {
    const ref = db.collection("schedules").doc(m.rowId);
    const ok = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || ((snap.get("clientId") as string | null) ?? null) !== m.from) return false;
      tx.update(ref, { clientId: m.to });
      return true;
    });
    if (ok) moved++;
    else changed++;
  }

  console.log(`Records made: ${made}   Bookings moved: ${moved}`);
  if (changed) console.log(`Skipped (changed since the read): ${changed}`);
  console.log("Then: npx tsx scripts/check-collision-damage.ts should say NOTHING CROSSED.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
