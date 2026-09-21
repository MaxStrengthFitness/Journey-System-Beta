/**
 * THE FLOOR AND THE STANDARD — what My Studio → Machines decides.
 *
 * Round: My Studio, Sep 2026. AJ's two update rules for the MSF standard
 * (Sep 18):
 *
 *   machines are ADOPTED    a studio sees what the standard added and takes
 *                           each machine when it is ready; a machine the
 *                           standard dropped stays usable, marked
 *   fields are INHERITED    a corrected house default reaches every studio
 *                           that has not overridden it (the roster's
 *                           `overrides`, already how the catalog works)
 *
 * "New in the standard" therefore needs no versioning: it is the standard
 * machines the floor does not have. And "adopt the MSF standard" on a new
 * floor is the same list, taken all at once.
 *
 * Also here: the document a studio sends corporate when it submits one of
 * its own machines for the catalog (`catalogSubmissions`), and the marker
 * left on the roster entry so the floor shows it is pending.
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { MachineCatalogEntry, MachineDefinition, StudioMachineRosterEntry } from "../../types/machines";
import { canonicalMachineId } from "../catalog/machine-identity";
import { isStandardSetMachine } from "../admin/studios/registry";

export interface StandardGaps<T> {
  /** Standard-set catalog machines this floor does not have (any status). */
  newInStandard: T[];
  /** Floor entries that follow a catalog machine the standard no longer lists, or the catalog retired. */
  noLongerStandard: StudioMachineRosterEntry[];
}

type CatalogLike = Pick<MachineCatalogEntry, "id" | "status" | "inStandardSet"> & { name?: string };

/**
 * What the standard has that the floor does not, and what the floor has that
 * the standard dropped. A switched-off machine still counts as "has" — the
 * studio decided about it once; putting it back is "We have this", not a
 * new adoption.
 */
export function standardGaps<T extends CatalogLike>(
  catalog: T[],
  roster: StudioMachineRosterEntry[],
): StandardGaps<T> {
  const onFloor = new Set<string>();
  for (const e of roster) onFloor.add(canonicalMachineId(e.machineId));

  const seen = new Set<string>();
  const newInStandard: T[] = [];
  for (const c of catalog) {
    if (!isStandardSetMachine(c)) continue;
    const key = canonicalMachineId(c.id, c.name);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!onFloor.has(key)) newInStandard.push(c);
  }

  const byId = new Map<string, T>();
  for (const c of catalog) byId.set(canonicalMachineId(c.id, c.name), c);
  const noLongerStandard = roster.filter((e) => {
    if (e.source !== "catalog") return false;
    if (e.status === "inactive") return false;
    const c = byId.get(canonicalMachineId(e.basedOn ?? e.machineId));
    if (!c) return false;
    return !isStandardSetMachine(c);
  });

  return { newInStandard, noLongerStandard };
}

/* ------------------------------------------------------------------ *
 * Submitting a machine to corporate
 * ------------------------------------------------------------------ */

export type SubmissionStatus = "pending" | "published" | "declined" | "withdrawn";

/** catalogSubmissions/{id} — one document per submission. */
export interface CatalogSubmissionDoc {
  studioId: string;
  studioName: string;
  /** The studio's roster id for the machine (`sm-…`). */
  machineId: string;
  definition: MachineDefinition;
  /** The catalog machine it is most like, when the studio said so. */
  basedOn: string | null;
  submittedBy: string;
  submittedByName: string;
  /** What the leader told corporate — why it deserves the catalog. */
  note: string;
  status: SubmissionStatus;
  /**
   * The definition as corporate CORRECTED it, saved from the review screen
   * (features/admin/catalog/SubmissionReview.tsx). Absent until an admin
   * edits one.
   *
   * Publishing reads this when it is here and `definition` when it is not,
   * so a studio's wording of the method is never adopted by accident: an
   * admin who reworded the cadence publishes their words, and an admin who
   * changed nothing publishes the studio's, deliberately.
   */
  reviewedDefinition?: MachineDefinition;
  reviewedBy?: string;
  reviewedAt?: unknown;
  /** Set by corporate when it decides. */
  decidedBy?: string;
  decidedAt?: unknown;
  decisionNote?: string;
  /** The catalog id it was published under. */
  publishedAs?: string;
  /**
   * Which fields corporate changed between what arrived and what published,
   * as `MachineDefinition` keys. The record of where a catalog sentence came
   * from, and what the studio is told on its own floor.
   */
  correctedFields?: string[];
}

/** What sits on the roster entry while corporate decides. */
export interface RosterSubmissionMarker {
  id: string;
  status: SubmissionStatus;
  /**
   * Set on publish when corporate reworded something: the changed fields in
   * plain English ("execution and cadence and the key cues"). The studio
   * learns its machine went in and that the method reads differently now,
   * which is the honest version of "Published" and takes one extra word.
   */
  corrected?: string;
}

export const SUBMISSION_NOTE_MAX = 500;

export interface SubmissionInput {
  studioId: string;
  studioName: string;
  entry: StudioMachineRosterEntry;
  author: { uid: string; name: string };
  note: string;
}

/**
 * The submission, or why there is none to make. Only a studio's OWN machine
 * can be offered: an MSF machine is already in the catalog, and a copy
 * adopted from another studio is that studio's to offer.
 */
export function buildSubmission(
  input: SubmissionInput,
): { ok: true; doc: CatalogSubmissionDoc } | { ok: false; reason: string } {
  const { entry } = input;
  if (entry.source !== "custom") {
    return { ok: false, reason: "This is an MSF catalog machine already." };
  }
  if (entry.adoptedFrom) {
    return {
      ok: false,
      reason: `This is a copy of ${entry.adoptedFrom.studioName}'s machine — it is theirs to offer.`,
    };
  }
  if (!entry.definition?.name?.trim()) {
    return { ok: false, reason: "Give the machine a name before offering it." };
  }
  const note = input.note.trim().slice(0, SUBMISSION_NOTE_MAX);
  return {
    ok: true,
    doc: {
      studioId: input.studioId,
      studioName: input.studioName,
      machineId: entry.machineId,
      definition: entry.definition,
      basedOn: entry.basedOn ?? null,
      submittedBy: input.author.uid,
      submittedByName: input.author.name,
      note,
      status: "pending",
    },
  };
}

/** The sentence under a machine that carries a submission marker. */
export function submissionLabel(marker: RosterSubmissionMarker | null | undefined): string | null {
  if (!marker) return null;
  switch (marker.status) {
    case "pending":
      return "Offered to the MSF catalog — waiting on corporate";
    case "published":
      return marker.corrected
        ? `Published to the MSF catalog — corporate adjusted ${marker.corrected}`
        : "Published to the MSF catalog";
    case "declined":
      return "Corporate passed on this one";
    case "withdrawn":
      return null;
    default:
      return null;
  }
}
