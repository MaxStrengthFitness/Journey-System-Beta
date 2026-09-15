/**
 * What a trainer document says the signed-in person's ROLE CLAIM should be.
 * Pure: no Firebase imports, so the trigger (claims.ts), the PC backfill
 * (scripts/backfill-trainer-claims.ts) and the tests all share one answer.
 *
 * WHY A CLAIM. firestore.rules resolves the caller's role for almost every
 * rule. It checks `request.auth.token.role` first and, only when that is
 * absent, reads trainers/{uid} — a billed document read on nearly every
 * request the app makes. Nothing ever set the claim, so the read happened
 * every time (cost round, Sep 2026). With the claim mirrored from the
 * document, the role checks cost nothing; the STUDIO checks
 * (primaryHomeStudioId, accessibleStudioIds, …) still read the document,
 * because the rules need the lists themselves.
 *
 * ONLY `role` IS MIRRORED. The rules also honour a `studioId` claim, and it
 * grants studio-leader access with no role check at all — so it is never set.
 */

/** The role vocabulary — mirrors UserRole in src/types.ts. */
export const TRAINER_ROLES = [
  "Admin",
  "Founder",
  "Overseer",
  "FranchiseOwner",
  "Owner",
  "StudioOwner",
  "HeadTrainer",
  "StudioLeader",
  "LifeTransformer",
  "Trainer",
] as const;

export type TrainerRole = (typeof TRAINER_ROLES)[number];

/** What the rules assume when a trainer document has no role. */
export const DEFAULT_ROLE: TrainerRole = "LifeTransformer";

export interface TrainerDocLike {
  role?: unknown;
  /** A placeholder that a sign-in has since claimed: the live document is trainers/{supersededByUid}. */
  supersededByUid?: unknown;
  /** Older documents whose id is not the auth uid name it here. */
  authUid?: unknown;
}

export type RoleClaims = { role: TrainerRole } | Record<string, never>;

/**
 * The claims the auth user should carry for this document. `{}` means
 * "clear them": the document is gone or is a superseded placeholder.
 */
export function desiredClaims(doc: TrainerDocLike | null | undefined): RoleClaims {
  if (!doc) return {};
  if (typeof doc.supersededByUid === "string" && doc.supersededByUid) return {};
  return { role: roleOf(doc) };
}

export function roleOf(doc: TrainerDocLike): TrainerRole {
  const role = doc.role;
  if (typeof role === "string" && (TRAINER_ROLES as readonly string[]).includes(role)) return role as TrainerRole;
  return DEFAULT_ROLE;
}

/**
 * The auth uid a trainer document belongs to: its `authUid` when an older
 * document names one, otherwise its id. Whether that uid is a real auth user
 * is checked by the caller (auth().getUser), because a document created by
 * addDoc has a random id that is nobody's uid.
 */
export function authUidOf(docId: string, doc: TrainerDocLike | null | undefined): string {
  if (doc && typeof doc.authUid === "string" && doc.authUid) return doc.authUid;
  return docId;
}

/** True when the user's current claims already say what the document says — nothing to write. */
export function claimsMatch(current: Record<string, unknown> | undefined, wanted: RoleClaims): boolean {
  const currentRole = current && typeof current.role === "string" ? current.role : undefined;
  const wantedRole = "role" in wanted ? wanted.role : undefined;
  if (currentRole !== wantedRole) return false;
  // A stray studioId claim (see the header) is always removed.
  return !(current && "studioId" in current);
}
