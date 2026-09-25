/**
 * Give the studio picker's old access requests the name and email the staff
 * screens list them by.
 *
 * DRY RUN BY DEFAULT: reads, prints what it would change, writes a before-
 * report into backups/, and changes nothing without --commit. The local .env
 * points at PRODUCTION, so --commit writes to live records.
 *
 * Round: the nameless-request fix (Sep 24 2026). Until then the studio
 * picker's Request Access wrote an access_requests document with
 * type "studio_access", trainerId, trainerName and studioId — but no fullName
 * and no email. The staff roster (src/features/admin/staff/roster.ts) lists
 * requests by fullName, so each one was a nameless row, and two of them
 * crashed My Studio → Team and Operations → Staff & Roles.
 *
 * The app no longer needs this to show them: the roster now falls back to
 * trainerName and then to the person's account, and says "Name not given"
 * rather than crashing. What the repair adds is the stored fields, so any
 * other reader of the document (a report, a future screen) finds them too.
 *
 * WHAT IT DOES, per PENDING request with no fullName:
 *   studio_access, account found   fills in fullName (the account's name, else
 *                                  the old trainerName) and email (the
 *                                  account's), only where the field is missing
 *   studio_access, already in      reported as stale and left alone: the
 *                                  person can already get into that studio,
 *                                  and the roster hides it for that reason
 *   studio_access, no account      fills in fullName from trainerName if there
 *                                  is one; otherwise reported and left alone
 *   a sign-up with no name         reported and left alone. The rules require
 *                                  fullName on a sign-up, so this should be
 *                                  none, and a name cannot be guessed
 *
 * Nothing is deleted, no status is changed, and only fullName and email are
 * ever written — the two fields roster.ts reads.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/repair-studio-access-requests.ts             # dry run
 *   npx tsx scripts/repair-studio-access-requests.ts --commit    # write
 *
 * Needs service-account.json (scripts/lib/admin.ts).
 */

import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { connectFirestore, hasFlag, writeReport } from "./lib/admin.ts";

const text = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

interface Line {
  requestId: string;
  type: string;
  studioId: string | null;
  trainerId: string | null;
  outcome: "fill" | "stale" | "no-account" | "sign-up-without-name";
  patch?: { fullName?: string; email?: string };
}

/** trainers/{trainerId}, else the document that records it as its authUid. */
async function findAccount(db: Firestore, trainerId: string): Promise<DocumentData | null> {
  const byId = await db.collection("trainers").doc(trainerId).get();
  if (byId.exists) return byId.data() ?? null;
  const byUid = await db.collection("trainers").where("authUid", "==", trainerId).limit(1).get();
  return byUid.empty ? null : byUid.docs[0].data();
}

function worksAt(t: DocumentData, studioId: string): boolean {
  const has = (field: string) => Array.isArray(t[field]) && (t[field] as unknown[]).includes(studioId);
  return (
    t.primaryHomeStudioId === studioId ||
    has("accessibleStudioIds") ||
    has("activeGuestStudioIds") ||
    has("ownedStudioIds")
  );
}

async function main() {
  const commit = hasFlag("commit");
  const db = connectFirestore();
  console.log(commit ? "COMMIT: missing names and emails will be written." : "DRY RUN: nothing will be written.");

  const snap = await db.collection("access_requests").where("status", "==", "Pending").get();
  const nameless = snap.docs.filter((d) => !text(d.data().fullName));
  console.log(`${snap.size} pending requests, ${nameless.length} with no name.`);

  const lines: Line[] = [];
  for (const d of nameless) {
    const r = d.data();
    const base = {
      requestId: d.id,
      type: text(r.type) || "sign-up",
      studioId: text(r.studioId || r.requestedStudioId) || null,
      trainerId: text(r.trainerId) || null,
    };

    if (r.type !== "studio_access") {
      lines.push({ ...base, outcome: "sign-up-without-name" });
      continue;
    }

    const account = base.trainerId ? await findAccount(db, base.trainerId) : null;
    if (account && base.studioId && worksAt(account, base.studioId)) {
      lines.push({ ...base, outcome: "stale" });
      continue;
    }

    const fullName = text(account?.fullName) || text(r.trainerName);
    const email = text(r.email) ? "" : text(account?.email).toLowerCase();
    const patch = { ...(fullName ? { fullName } : {}), ...(email ? { email } : {}) };
    if (Object.keys(patch).length === 0) {
      lines.push({ ...base, outcome: "no-account" });
      continue;
    }
    lines.push({ ...base, outcome: account ? "fill" : "no-account", patch });
  }

  const before = nameless.map((d) => ({ id: d.id, ...d.data() }));
  const file = writeReport("studio-access-requests", { commit, before, lines });

  for (const l of lines) {
    const where = `access_requests/${l.requestId} (${l.type}, studio ${l.studioId ?? "none"}, trainer ${l.trainerId ?? "none"})`;
    if (l.patch) {
      console.log(`  ${commit ? "set  " : "would"} ${where}: ${JSON.stringify(l.patch)}`);
    } else if (l.outcome === "stale") {
      console.log(`  stale ${where}: already has access to that studio — left alone`);
    } else if (l.outcome === "no-account") {
      console.log(`  none  ${where}: no account and no trainerName — left alone`);
    } else {
      console.log(`  none  ${where}: a sign-up with no name — left alone`);
    }
  }

  const toWrite = lines.filter((l) => l.patch);
  if (commit) {
    for (const l of toWrite) {
      await db.collection("access_requests").doc(l.requestId).update(l.patch!);
    }
  }

  console.log(
    `Done${commit ? "" : " (dry run)"}: ${toWrite.length} ${commit ? "repaired" : "would be repaired"}, ` +
      `${lines.filter((l) => l.outcome === "stale").length} stale, ` +
      `${lines.filter((l) => !l.patch && l.outcome !== "stale").length} left as they are.`,
  );
  console.log(`Report (with every document as it was before): ${file}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});
