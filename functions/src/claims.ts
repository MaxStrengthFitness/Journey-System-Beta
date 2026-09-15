/**
 * syncTrainerClaims — mirrors trainers/{id}.role onto the auth user's custom
 * claims whenever a trainer document is created, changed or deleted.
 *
 * Cost round (Sep 2026). See claims-logic.ts for why: every role check in
 * firestore.rules reads trainers/{uid} unless `request.auth.token.role` is
 * set, and nothing set it. This keeps the claim equal to the document, so
 * the read stops happening and nothing else changes — the rules already
 * prefer the claim and fall back to the document when it is absent.
 *
 * WHAT IT DOES NOT DO
 *   · Write to Firestore. A trigger on `trainers` that wrote to `trainers`
 *     would fire itself; the token is the only thing touched.
 *   · Set `studioId`. The rules treat that claim as studio-leader access
 *     with no role check. Only `role` is ever mirrored.
 *   · Invent a user. A document whose id (or authUid) is not an auth user —
 *     the addDoc-created ones — is skipped and logged, never an error.
 *
 * FRESHNESS. A signed-in person's token carries the claim it was minted with
 * for up to an hour; useAuthInitialization forces a refresh at sign-in when
 * the token's role disagrees with the document, so a role change lands at
 * the next sign-in at the latest. Until then the OLD claim wins in the rules
 * (they check the token first) — the same hour a demotion always took.
 *
 * DEPLOY: firebase deploy --only functions:syncTrainerClaims
 * BACKFILL existing trainers once: npx tsx scripts/backfill-trainer-claims.ts --commit
 */

import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { authUidOf, claimsMatch, desiredClaims, type TrainerDocLike } from "./claims-logic";

const REGION = "us-central1";
const JOURNEY_DATABASE = "ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa";

export const syncTrainerClaims = onDocumentWritten(
  {
    document: "trainers/{trainerId}",
    region: REGION,
    database: JOURNEY_DATABASE,
  },
  async (event) => {
    const after = event.data?.after?.exists ? (event.data.after.data() as TrainerDocLike) : null;
    const before = event.data?.before?.exists ? (event.data.before.data() as TrainerDocLike) : null;
    const uid = authUidOf(event.params.trainerId, after ?? before);
    const wanted = desiredClaims(after);

    let user: admin.auth.UserRecord;
    try {
      user = await admin.auth().getUser(uid);
    } catch (err: any) {
      if (err?.code === "auth/user-not-found") {
        console.log(`[syncTrainerClaims] trainers/${event.params.trainerId}: ${uid} is not an auth user; nothing to mirror.`);
        return;
      }
      throw err;
    }

    if (claimsMatch(user.customClaims, wanted)) return;

    await admin.auth().setCustomUserClaims(uid, wanted);
    console.log(
      `[syncTrainerClaims] ${uid}: role claim ${JSON.stringify(user.customClaims?.role ?? null)} → ${JSON.stringify(
        "role" in wanted ? wanted.role : null,
      )}`,
    );
  },
);
