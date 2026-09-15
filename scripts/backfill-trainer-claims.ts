/**
 * One-time backfill: sets the `role` custom claim on every existing trainer's
 * auth user from their trainers/{id} document. From then on the Cloud
 * Function syncTrainerClaims (functions/src/claims.ts) keeps it current.
 *
 * DRY RUN BY DEFAULT: lists what each user's claim is and what it would
 * become; writes nothing without --commit.
 *
 * Cost round (Sep 2026). Why: firestore.rules checks request.auth.token.role
 * before reading trainers/{uid}; with the claim set, the role checks stop
 * costing a document read.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/backfill-trainer-claims.ts             # dry run
 *   npx tsx scripts/backfill-trainer-claims.ts --commit    # set the claims
 *
 * Needs service-account.json (scripts/lib/admin.ts). A trainer document
 * whose id is nobody's auth uid (the addDoc-created ones) is listed as
 * "not an auth user" and skipped — that person signs in by email and gets a
 * uid-keyed document on their next sign-in, which the trigger then mirrors.
 *
 * A signed-in trainer picks the claim up on their next sign-in, or within an
 * hour (token refresh). Nothing changes what anyone can do: the rules read
 * the same role from the token that they used to read from the document.
 */

import { createRequire } from "node:module";
import { getAuth } from "firebase-admin/auth";
import { connectFirestore, hasFlag } from "./lib/admin.ts";
import type { TrainerDocLike } from "../functions/src/claims-logic.ts";

// functions/ is a CommonJS tree (its package.json has no "type": "module"),
// so from this ESM script its named exports are invisible to Node's loader.
// require() sees the whole module object; the type comes from the import above.
const require = createRequire(import.meta.url);
const { authUidOf, claimsMatch, desiredClaims } =
  require("../functions/src/claims-logic.ts") as typeof import("../functions/src/claims-logic.ts");

async function main() {
  const commit = hasFlag("commit");
  const db = connectFirestore();
  const auth = getAuth();
  console.log(commit ? "COMMIT: claims will be written." : "DRY RUN: nothing will be written.");

  const snap = await db.collection("trainers").get();
  let set = 0;
  let same = 0;
  let skipped = 0;
  for (const d of snap.docs) {
    const doc = d.data() as TrainerDocLike;
    const uid = authUidOf(d.id, doc);
    const wanted = desiredClaims(doc);
    let current: Record<string, unknown> | undefined;
    try {
      current = (await auth.getUser(uid)).customClaims;
    } catch (err: any) {
      if (err?.code === "auth/user-not-found") {
        skipped += 1;
        console.log(`  skip  trainers/${d.id}: ${uid} is not an auth user`);
        continue;
      }
      throw err;
    }
    if (claimsMatch(current, wanted)) {
      same += 1;
      continue;
    }
    const from = JSON.stringify(current?.role ?? null);
    const to = JSON.stringify("role" in wanted ? wanted.role : null);
    console.log(`  ${commit ? "set " : "would"} ${uid}: role ${from} -> ${to}`);
    if (commit) await auth.setCustomUserClaims(uid, wanted);
    set += 1;
  }
  console.log(
    `Done${commit ? "" : " (dry run)"}: ${snap.size} trainer documents, ${set} claims ${commit ? "set" : "would be set"}, ` +
      `${same} already right, ${skipped} not auth users.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});
