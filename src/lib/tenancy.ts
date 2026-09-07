/**
 * WHICH STUDIOS' RECORDS THIS TRAINER MAY READ.
 *
 * Round: cross-studio tenancy pass, Sep 2026.
 *
 * WHY THIS FILE HAD TO EXIST BEFORE THE RULES COULD CHANGE
 * -------------------------------------------------------
 * `clients` and `sessions` were both `allow read: if isAuthenticated()`. Any
 * trainer at any studio could read every client record and every session in
 * the platform. The rules that fix that are per-document — and Firestore
 * rejects an ENTIRE query if any document it would return fails the rule.
 *
 * So a rule change alone would not have tightened security; it would have
 * blanked out the client directory, client search, and half a dozen other
 * screens. Every list query against those collections has to name the studios
 * it is asking about, and this module is where "which studios" is decided
 * once instead of in each of them.
 *
 * THE `in` CLAUSE IS WHAT KEEPS IT CHEAP
 * --------------------------------------
 * `where("homeStudioId", "in", myStudios)` is satisfiable by the rule with a
 * single cached read of the trainer document, however many clients come back.
 * The alternative — one query per studio, merged — costs a round trip per
 * studio for the same answer. Firestore caps `in` at 30 values; a trainer with
 * more than 30 studios is not a case this product has, and `capStudioIds`
 * makes the truncation explicit rather than letting Firestore throw.
 *
 * WHAT THIS DELIBERATELY DOES NOT COVER
 * -------------------------------------
 * Cross-train clients — someone whose home studio is elsewhere but who has
 * approved training at mine — are readable by the RULES but are not returned
 * by a `homeStudioId in [...]` query, because their home studio is not in the
 * list. That is the right trade for search: you search the clients your studio
 * holds. Cross-train clients reach the app the way they always have, through
 * the day's schedule, which fetches them by document id.
 */

import type { Trainer } from "../types";

/** Firestore's cap on the number of values in an `in` clause. */
export const MAX_IN_VALUES = 30;

/**
 * Every studio this trainer stands in: home, granted, guest, owned.
 *
 * Order is stable and duplicates are removed, so two calls produce the same
 * query and React memoisation on the result actually holds.
 */
export function readableStudioIds(
  trainer: Pick<
    Trainer,
    | "primaryHomeStudioId"
    | "accessibleStudioIds"
    | "activeGuestStudioIds"
    | "ownedStudioIds"
  > | null | undefined,
): string[] {
  if (!trainer) return [];
  const all = [
    trainer.primaryHomeStudioId,
    ...(trainer.accessibleStudioIds ?? []),
    ...(trainer.activeGuestStudioIds ?? []),
    ...(trainer.ownedStudioIds ?? []),
  ].filter((id): id is string => Boolean(id));
  return [...new Set(all)];
}

/**
 * Trim a studio list to what an `in` clause will accept.
 *
 * Returns the list unchanged when it fits. When it does not, the caller has a
 * trainer with more studios than Firestore can ask about at once, and
 * silently dropping the tail would hide records with no indication — so this
 * is exported separately and the callers that use it say so.
 */
export function capStudioIds(ids: string[]): string[] {
  return ids.length <= MAX_IN_VALUES ? ids : ids.slice(0, MAX_IN_VALUES);
}

/**
 * The studios a query should ask about, given the trainer and the studio they
 * are currently standing in.
 *
 * A single active studio narrows to that one — a trainer working the floor at
 * Powell does not want Dublin's clients in their search results, and the
 * narrower query is also cheaper. With no active studio (an admin screen, or
 * before the studio context resolves) it widens to everything they may read.
 *
 * Returns an EMPTY array when the trainer may read nothing, and callers must
 * treat that as "ask for nothing" rather than "ask for everything" — an `in`
 * clause with an empty array throws, and the old behaviour of falling through
 * to an unconstrained query is the bug this whole pass is about.
 */
export function queryStudioIds(
  trainer: Parameters<typeof readableStudioIds>[0],
  activeStudioId: string | null | undefined,
  { includeAll = false }: { includeAll?: boolean } = {},
): string[] {
  const all = readableStudioIds(trainer);
  if (!includeAll && activeStudioId && all.includes(activeStudioId)) {
    return [activeStudioId];
  }
  if (!includeAll && activeStudioId && all.length === 0) {
    // No trainer profile loaded yet, but we know where they are standing.
    return [activeStudioId];
  }
  return capStudioIds(all);
}

/** Merge parallel snapshots into one list, newest write per id winning. */
export function dedupeById<T extends { id: string }>(groups: T[][]): T[] {
  const map = new Map<string, T>();
  for (const group of groups) {
    for (const item of group) map.set(item.id, item);
  }
  return [...map.values()];
}
