/**
 * Merging a temporary profile into the real Mindbody record.
 *
 * THE THING THAT MAKES THIS DANGEROUS
 *
 * A temporary client is not an empty shell by the time anyone reconciles it.
 * It has sessions, exercise logs, journal entries, focuses, machine settings
 * and progress reports filed against its document id. Merging is therefore not
 * "copy a name across" — it is repointing every one of those, and a collection
 * missed is a client's training history quietly abandoned.
 *
 * So the reference list below is the single source of truth, exported rather
 * than duplicated. It exists because `scripts/migrate-canonical-client-ids.ts`
 * has its own copy of this list and that copy is out of date: it covers
 * `focusRecords` and `trainerFocuses` but not `journalEntries` or
 * `clientFocuses` — and the journal round's own docstring says clientFocuses
 * REPLACES the pair the script does cover. A second hand-maintained list is
 * how that happens.
 *
 * TOMBSTONES
 *
 * This codebase has two vocabularies for "merged away":
 *   · migratedTo / migratedAt        — the old migration script
 *   · supersededById / mergedFromId  — the trainer-identity round, and the
 *                                      Client type
 * The second is canonical. The first is still READ, because a document
 * tombstoned by the old script must not look live to the new one.
 *
 * Pure. The Firestore writes live in mergeClient.ts.
 */

import type { Client } from "../../../types";
import { nameKey } from "./provisional";

/* ==================================================================== *
 * What points at a client
 * ==================================================================== */

/** Collections holding the client's document id in a plain field. */
export const CLIENT_REFERENCE_FIELDS: { collection: string; field: string }[] = [
  { collection: "sessions", field: "clientId" },
  { collection: "sessionNotes", field: "clientId" },
  { collection: "exerciseLogs", field: "clientId" },
  { collection: "schedules", field: "clientId" },
  { collection: "routines", field: "clientId" },
  { collection: "routineAdjustments", field: "clientId" },
  { collection: "progressReports", field: "clientId" },
  { collection: "clinicalIncidents", field: "clientId" },
  { collection: "machineSettingChanges", field: "clientId" },
  // The current journal pair. Both were missing from the migration script's
  // list, and they are the collections that superseded the two it had.
  { collection: "journalEntries", field: "clientId" },
  { collection: "clientFocuses", field: "clientId" },
  // Legacy, still read through the journal adapter.
  { collection: "focusRecords", field: "clientId" },
  { collection: "trainerFocuses", field: "clientId" },
  // An unresolved Mindbody event that happened to resolve to the merged id.
  { collection: "mindbodyLimbo", field: "clientId" },
];

/**
 * clientMachineSettings is keyed `{clientId}_{machineId}`, so it cannot be
 * patched — each document has to be re-keyed, which is a read, a write at the
 * new id and a delete at the old one.
 */
export const CLIENT_COMPOSITE_ID_COLLECTION = "clientMachineSettings";

/**
 * Not repointed, and why:
 *
 *   · trainers.kaizenRoster[] — an array on another collection's documents.
 *     Handled separately by the merge so a tracked client is not lost, but it
 *     is not a field patch.
 *   · leaderboards — client ids appear nested in arrays and as map KEYS.
 *     Rebuilt nightly from sessions, so repointing the sessions is enough and
 *     touching the aggregate would only risk corrupting it.
 *   · clients/{id}/crossTrainAccess — declared in firestore.rules and written
 *     by nothing in the app. Listed so a future reader knows it was checked
 *     rather than missed.
 *   · bug_reports.context.clientId — a diagnostic snapshot of a moment. It is
 *     supposed to say which id was in play at the time.
 */
export const CLIENT_REFERENCES_DELIBERATELY_SKIPPED = [
  "trainers.kaizenRoster[].clientId (handled by the merge, not a patch)",
  "leaderboards (derived nightly from sessions)",
  "clients/{id}/crossTrainAccess (unwritten by the app)",
  "bug_reports.context.clientId (a snapshot of a moment)",
] as const;

/* ==================================================================== *
 * Tombstones
 * ==================================================================== */

interface AnyTombstone {
  supersededById?: string | null;
  supersededByUid?: string | null;
  /** The old migration script's vocabulary. Read, never written. */
  migratedTo?: string | null;
}

/**
 * True for a document that has already been merged away by ANY of the
 * mechanisms this codebase has used. Code written against one vocabulary is
 * blind to a tombstone written by the other, and a document that looks live
 * to the merge but is really a corpse is how history gets duplicated.
 */
export function isMergedAway(record: AnyTombstone | undefined | null): boolean {
  return !!(record?.supersededById || record?.supersededByUid || record?.migratedTo);
}

/* ==================================================================== *
 * Finding the real record
 * ==================================================================== */

export interface MatchReason {
  label: string;
  weight: number;
}

export interface Candidate {
  client: Client;
  score: number;
  reasons: MatchReason[];
  /** Strong enough to offer as the default choice. */
  suggested: boolean;
}

/** Above this a match is offered as the default; a human still confirms it. */
export const SUGGEST_THRESHOLD = 50;

const norm = (s?: string) => (s ?? "").trim().toLowerCase();
const digits = (s?: string) => (s ?? "").replace(/\D/g, "");

/**
 * How likely is `candidate` to be the same person as `temp`?
 *
 * Email is weighted highest because it is the only field a human typed once
 * and Mindbody stores verbatim. Name alone is deliberately BELOW the suggest
 * threshold: two clients called Ken Sexton at one studio is unlikely but a
 * merged history is unrecoverable, so a name match asks rather than proposes.
 */
export function scoreCandidate(temp: Client, candidate: Client): Candidate {
  const reasons: MatchReason[] = [];

  if (norm(temp.email) && norm(temp.email) === norm(candidate.email)) {
    reasons.push({ label: "Same email", weight: 50 });
  }
  if (digits(temp.phone).length >= 7 && digits(temp.phone) === digits(candidate.phone)) {
    reasons.push({ label: "Same phone", weight: 35 });
  }
  const tempName = nameKey(temp.firstName, temp.lastName);
  if (tempName && tempName === nameKey(candidate.firstName, candidate.lastName)) {
    reasons.push({ label: "Same name", weight: 30 });
  }
  if (temp.homeStudioId && temp.homeStudioId === candidate.homeStudioId) {
    reasons.push({ label: "Same studio", weight: 10 });
  }
  if (
    temp.dateOfBirth &&
    candidate.dateOfBirth &&
    temp.dateOfBirth === candidate.dateOfBirth
  ) {
    reasons.push({ label: "Same date of birth", weight: 25 });
  }

  const score = reasons.reduce((n, r) => n + r.weight, 0);
  return { client: candidate, score, reasons, suggested: score >= SUGGEST_THRESHOLD };
}

/**
 * The real records that might be this temporary person, best first.
 *
 * Only records that CAME FROM MINDBODY are candidates: merging one temporary
 * profile into another leaves the pair no closer to the source of truth and
 * doubles the eventual work.
 */
export function rankCandidates(temp: Client, all: Client[]): Candidate[] {
  return all
    .filter(
      (c) =>
        c.id &&
        c.id !== temp.id &&
        !c.provisional &&
        !isMergedAway(c) &&
        !!(c.mindbodyId || c.mindbodyClientId),
    )
    .map((c) => scoreCandidate(temp, c))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.client.firstName.localeCompare(b.client.firstName));
}

/* ==================================================================== *
 * Guards
 * ==================================================================== */

export type MergeProblem =
  | { code: "same-record"; message: string }
  | { code: "not-provisional"; message: string }
  | { code: "already-merged"; message: string }
  | { code: "survivor-merged"; message: string }
  | { code: "survivor-not-real"; message: string };

/**
 * Everything that must be true before a merge is allowed to start.
 *
 * All five are cheap and all five have a way of being hit by a double-tap, a
 * stale list, or two managers reconciling the same person at once.
 */
export function checkMerge(temp: Client, survivor: Client): MergeProblem | null {
  if (!temp.id || !survivor.id || temp.id === survivor.id) {
    return { code: "same-record", message: "A record cannot be merged into itself." };
  }
  if (!temp.provisional) {
    return {
      code: "not-provisional",
      message:
        "Only a temporary profile can be merged away. This record came from Mindbody.",
    };
  }
  if (isMergedAway(temp)) {
    return {
      code: "already-merged",
      message: "This temporary profile has already been merged.",
    };
  }
  if (isMergedAway(survivor)) {
    return {
      code: "survivor-merged",
      message:
        "That record has itself been merged into another one. Pick the surviving record instead.",
    };
  }
  if (!survivor.mindbodyId && !survivor.mindbodyClientId) {
    return {
      code: "survivor-not-real",
      message:
        "The surviving record has no Mindbody id. Merging one temporary profile into another leaves both no closer to the source of truth.",
    };
  }
  return null;
}

/* ==================================================================== *
 * The plan
 * ==================================================================== */

export interface MergeStep {
  key: string;
  label: string;
}

/**
 * The merge, in the order it must happen.
 *
 * Order is load-bearing. References are repointed FIRST and the temporary
 * record is tombstoned LAST, so an interruption anywhere leaves a temporary
 * profile that is still visibly temporary and still reconcilable. Tombstoning
 * first would strand whatever had not yet moved, with nothing on screen
 * saying so.
 *
 * Every step is idempotent — a repoint queries for the old id and finds
 * nothing on a second run — so the honest recovery from a failure is simply
 * to run it again.
 */
export function mergeSteps(): MergeStep[] {
  return [
    ...CLIENT_REFERENCE_FIELDS.map((r) => ({
      key: `${r.collection}.${r.field}`,
      label: `Repoint ${r.collection}`,
    })),
    { key: CLIENT_COMPOSITE_ID_COLLECTION, label: "Re-key machine settings" },
    { key: "kaizenRoster", label: "Update trainer Kaizen Rosters" },
    { key: "survivor", label: "Record where the history came from" },
    { key: "tombstone", label: "Mark the temporary profile merged" },
  ];
}

/** What to write on the record that survives. */
export function survivorPatch(tempId: string, now: Date = new Date()) {
  return { mergedFromId: tempId, mergedAt: now.toISOString() };
}

/**
 * What to write on the temporary record.
 *
 * Tombstoned, never deleted — anything still holding the temporary id stays
 * traceable, which is the same call the trainer-identity round made and for
 * the same reason.
 */
export function tombstonePatch(survivorId: string, now: Date = new Date()) {
  return {
    supersededById: survivorId,
    supersededAt: now.toISOString(),
    provisional: false,
    isActive: false,
  };
}
