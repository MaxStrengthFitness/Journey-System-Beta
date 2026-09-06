/**
 * TRAINER IDENTITY — claiming a placeholder profile.
 *
 * THE PROBLEM
 * -----------
 * Every Firestore rule answers "is this your document?" by comparing
 * request.auth.uid to the document id. So `trainers/{uid}` is the only
 * trainer document a person can ever write.
 *
 * But an admin creating a profile for someone who has not signed in yet has
 * no uid to use — so `AdminUserDirectory` and `FranchiseTeamManagement`
 * reached for addDoc, which assigns a random id. Those profiles are visible
 * in the roster and usable for scheduling, and completely unwritable by the
 * person they belong to. They are PLACEHOLDERS, not accounts, and this module
 * makes that explicit.
 *
 * THE CLAIM
 * ---------
 * The uid only exists at sign-in, so that is when the placeholder becomes an
 * account: copy it to `trainers/{uid}`, then mark the placeholder superseded.
 *
 * ORDER MATTERS, AND IT IS THE ONLY THING THAT DOES.
 * Write the new document FIRST, supersede the old one SECOND. Firestore has
 * no transaction across a create-and-update that a security rule will accept
 * here, so the claim can be interrupted between the two — and every way it
 * can be interrupted has to leave the person better off, never worse:
 *
 *   interrupted after step 1   trainers/{uid} exists, placeholder still live.
 *                              Sign-in looks up the uid FIRST (phase 2), so
 *                              they get the working document. The next claim
 *                              finishes the job.
 *   interrupted before step 1  nothing happened. Exactly as before.
 *
 * The reverse order has no such property: superseding first and then failing
 * would strand someone with no profile at all.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It does not touch documents that were not created as placeholders. An
 * existing mismatched profile predates this round, may be referenced by
 * sessions, schedules and rosters, and repointing those is a data migration
 * with a backup and a dry run — not something to run silently inside a
 * sign-in handler. `isClaimable` is what enforces that line.
 *
 * It does not delete the placeholder either. Anything still pointing at the
 * old id keeps resolving until the migration repoints it; a tombstone that
 * says where the data went is worth more than a clean deletion.
 */

/** Fields the claim reads. Kept narrow so this module stays pure. */
export interface ClaimablePlaceholder {
  id: string;
  email?: string | null;
  /** Written by the admin creation paths. Absent on anything older. */
  pendingClaim?: boolean;
  /** Set once claimed. Present means this document is a tombstone. */
  supersededByUid?: string | null;
}

export type ClaimDecision =
  { kind: "claim"; fromId: string } | { kind: "skip"; reason: string };

/**
 * Should this placeholder be claimed for this uid?
 *
 * A string discriminant rather than a boolean, so the reason survives into
 * the log — "why did my profile not get fixed" is a question worth being able
 * to answer without a debugger. Same shape as RosterResult and
 * StaffResolution elsewhere in the codebase.
 */
export function decideClaim(
  placeholder: ClaimablePlaceholder | null | undefined,
  uid: string | null | undefined,
  tokenEmail: string | null | undefined,
): ClaimDecision {
  if (!placeholder) return { kind: "skip", reason: "no placeholder" };
  if (!uid) return { kind: "skip", reason: "no uid" };

  if (placeholder.id === uid) {
    return { kind: "skip", reason: "already keyed on the uid" };
  }
  if (placeholder.supersededByUid) {
    return { kind: "skip", reason: "already claimed" };
  }

  // The line between this and the migration. A profile that was not created
  // as a placeholder may be referenced from sessions, schedules and rosters,
  // and moving it is a migration, not a sign-in side effect.
  if (placeholder.pendingClaim !== true) {
    return { kind: "skip", reason: "not a placeholder — needs the migration" };
  }

  // Belt and braces over the rules: the caller found this document by
  // matching the token email, and this asserts that match rather than
  // trusting it. A claim keyed on the wrong document would hand one person
  // another person's profile.
  const placeholderEmail = (placeholder.email ?? "").trim().toLowerCase();
  const claimantEmail = (tokenEmail ?? "").trim().toLowerCase();
  if (!placeholderEmail || !claimantEmail) {
    return { kind: "skip", reason: "no email to match on" };
  }
  if (placeholderEmail !== claimantEmail) {
    return { kind: "skip", reason: "email does not match the signed-in user" };
  }

  return { kind: "claim", fromId: placeholder.id };
}

/**
 * The document written to `trainers/{uid}`.
 *
 * `pendingClaim` is dropped rather than set false — the profile is no longer
 * a placeholder in any sense, and a lingering false would keep it looking
 * like one to anything that checks for the key.
 */
export function claimedProfile(
  placeholderData: Record<string, unknown>,
  uid: string,
  nowIso: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...placeholderData };
  delete next.pendingClaim;
  delete next.supersededByUid;
  delete next.id;
  next.claimedFromId = placeholderData.id ?? null;
  next.claimedAt = nowIso;
  next.authUid = uid;
  return next;
}

/** The tombstone left on the placeholder. */
export function tombstone(uid: string, nowIso: string) {
  return {
    supersededByUid: uid,
    supersededAt: nowIso,
    systemStatus: "superseded",
  };
}

/**
 * Does this profile still need the migration?
 *
 * Used by the dry run in scripts/, and by anything that wants to report how
 * many people are still affected. A profile is stranded when its id is not a
 * uid and no claim can fix it automatically.
 */
export function isStranded(
  profile: {
    id: string;
    pendingClaim?: boolean;
    supersededByUid?: string | null;
  },
  knownAuthUids: Set<string>,
): boolean {
  if (profile.supersededByUid) return false;
  if (knownAuthUids.has(profile.id)) return false;
  return profile.pendingClaim !== true;
}

/**
 * A claimed placeholder is tombstoned rather than deleted, so it is still in
 * the collection — and every list that reads `trainers` would otherwise show
 * the same person twice, once under a document nobody can write.
 *
 * Filtered in code rather than by a Firestore query on purpose: a
 * `where("supersededByUid", "==", null)` would silently drop every document
 * that has never carried the field at all, which today is all of them.
 */
export function isSuperseded(
  trainer: { supersededByUid?: string | null } | null | undefined,
): boolean {
  return !!trainer?.supersededByUid;
}

/** Drop tombstones from a roster, directory or picker. */
export function withoutSuperseded<
  T extends { supersededByUid?: string | null },
>(trainers: T[]): T[] {
  return trainers.filter((t) => !isSuperseded(t));
}
