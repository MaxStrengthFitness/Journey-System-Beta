/**
 * TEAM JOBS — one piece of work, several people, chipped away at together.
 *
 * Round: Planner rework, Sep 2026. AJ: head trainers and studio leaders need
 * to "assign highly specific tasks to individual trainers or open tasks to the
 * general studio pool (deep clean the studio, prep next month's birthday
 * cards, client outreach for MIA clients)", and to "assign a single large task
 * to multiple trainers so they can chip away at it together". Trainers "pick
 * up floating tasks requested by leadership, mark assigned tasks complete, and
 * leave closing messages".
 *
 * WHY NOT A STUDIO TASK TEMPLATE
 * A template is a standing duty that resets every day (see
 * features/studio-tasks/types.ts). A job is the opposite: it is done once, may
 * take a week, and several named people share it. Forcing it into a
 * template would mean an instance per day for something that is not daily.
 *
 * WHY NOT A REQUEST ON THE BOARD
 * A request is an ask that lives "until answered" and whoever answers it is
 * whoever picked it up. A job is WORK with names on it, a due date and parts,
 * and leaders are asked "who is behind on it" — a question requests never
 * had to answer.
 *
 * ONE DOCUMENT, PARTS AS A MAP — AND WHY A MAP
 *   studios/{studioId}/teamJobs/{jobId}
 *
 * Several trainers tick parts on several iPads at the same moment. An ARRAY
 * of parts would be rewritten whole on every tick and two ticks would erase
 * each other (the lesson from initiative submissions). A MAP keyed by part id
 * is updated one key at a time — `parts.p3.doneBy` — which Firestore applies
 * atomically per key, so concurrent ticks on different parts never collide.
 * Joining and leaving use arrayUnion / arrayRemove for the same reason.
 *
 * NOTHING LOCKS. A name on a job is a statement of who is expected, exactly
 * like an assignment on a studio task: anyone at the studio can tick a part or
 * close the job, because the app must never be the reason work did not get
 * done.
 */

import type { TaskAuthor } from "../../studio-tasks/mutations";
import type { TaskCategory } from "../../studio-tasks/types";

export type JobStatus = "open" | "done" | "cancelled";

/** What the job is about. Client and machine jobs make one part per item. */
export type JobAbout =
  | { kind: "facility" }
  | { kind: "machine"; machineIds: string[] }
  | { kind: "client"; clientIds: string[]; clientNames: Record<string, string> };

export type JobAboutKind = JobAbout["kind"];

export interface JobPart {
  id: string;
  label: string;
  order: number;
  /** For a client or machine part: which one. */
  refId?: string | null;
  doneBy?: TaskAuthor | null;
  doneAt?: unknown;
}

/** studios/{studioId}/teamJobs/{jobId} */
export interface TeamJob {
  id: string;
  studioId: string;
  title: string;
  detail: string;
  category: TaskCategory;
  about: JobAbout;

  /** Who is expected on it. Empty = up for grabs. */
  assignees: TaskAuthor[];
  /** The same ids, for `array-contains` ("my jobs") and the rules. */
  assigneeIds: string[];
  /**
   * Named people AND anyone else may join. A job with nobody named is always
   * open; this lets a leader name two people and still say "more hands
   * welcome".
   */
  openToAll: boolean;

  parts: Record<string, JobPart>;

  /** Studio-local 'YYYY-MM-DD', or null for "whenever". */
  dueOn: string | null;
  /** Closing the job needs a closing message — "what did you find?" */
  requiresNote: boolean;
  /** Ring the poster's bell when it is closed. */
  notifyOnDone: boolean;

  status: JobStatus;
  closingNote: string | null;
  completedBy: TaskAuthor | null;
  completedAt?: unknown;
  /** Studio-local day it was closed; null while open. Drives the "recently
   *  finished" read without a composite index. */
  closedOn?: string | null;

  createdBy: TaskAuthor;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** What the composer hands to the mutations. */
export interface JobDraft {
  title: string;
  detail: string;
  category: TaskCategory;
  about: JobAbout;
  assignees: TaskAuthor[];
  openToAll: boolean;
  /** Free-typed parts, for a facility job ("Mirrors", "Bathrooms"). */
  partLabels: string[];
  dueOn: string | null;
  requiresNote: boolean;
  notifyOnDone: boolean;
}

/* Limits. Mirrored in firestore.rules (teamJobValid). */
export const JOB_TITLE_MAX = 160;
export const JOB_DETAIL_MAX = 2000;
export const JOB_NOTE_MAX = 1000;
export const JOB_MAX_PARTS = 60;
export const JOB_MAX_ASSIGNEES = 30;
export const JOB_PART_LABEL_MAX = 120;
