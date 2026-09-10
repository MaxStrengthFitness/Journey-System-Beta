/**
 * INITIATIVES — a manager asks the whole floor for something, and can see who
 * did it and with which clients.
 *
 * "I need you all to do at least five progress reports this week" is not a
 * task and it is not a question. A task is done once by one person; a question
 * wants an answer. This wants NINE people to each do a thing five times, and
 * the manager wants to open the five each trainer picked.
 *
 * ============================================================================
 * WHY THIS RIDES ON taskRequests INSTEAD OF A NEW COLLECTION
 * ============================================================================
 * An initiative needs replies, a claim, reactions, priority, an expiry and an
 * author — all of which taskRequests already has, tested and ruled. A parallel
 * collection would duplicate every one of them and then drift. So an
 * initiative is a request with `kind: "initiative"` and a `target`.
 *
 * ============================================================================
 * WHY SUBMISSIONS ARE A SUBCOLLECTION KEYED BY TRAINER ID
 * ============================================================================
 * The tempting shape is an array or a map on the request document. The Kaizen
 * Roster is exactly that and it is correct there — because a roster has ONE
 * writer, so rewriting the whole array is safe.
 *
 * An initiative has NINE writers, at the same time, on nine iPads. Whole-array
 * writes would silently drop each other's entries: last writer wins and the
 * trainer who submitted first never finds out they were erased.
 *
 *   studios/{studioId}/taskRequests/{requestId}/submissions/{trainerId}
 *
 * One document per trainer, id = their uid. Two consequences, both good:
 *   - the rule is `request.auth.uid == trainerId` and there is nothing for a
 *     future query to remember, same structural argument as personal tasks;
 *   - a trainer can only ever clobber their own submission.
 *
 * PURE MODULE. The writes live in mutations.ts.
 */
import type { ClientTaskAction } from "./types";

/** What the initiative is asking each trainer to do, and how many times. */
export interface InitiativeTarget {
  /** How many each trainer should log. 0 or absent = participation only. */
  perTrainer?: number;
  /**
   * What the entries are. Drives the submit dialog's client picker and lets a
   * completed entry deep-link to the right screen — an InBody submission opens
   * the InBody tab, not a generic profile.
   */
  action?: ClientTaskAction;
  /** YYYY-MM-DD, studio-local. Separate from the request's own expiry. */
  dueOn?: string;
}

/**
 * One client a trainer logged against an initiative.
 *
 * The client id IS stored here, unlike the playbook. That is deliberate and
 * the distinction matters: this records that a routine piece of coaching
 * admin happened for a named client, which is ordinary operational record.
 * The playbook records a physical complaint and a workaround, which is not.
 */
export interface SubmissionEntry {
  clientId: string;
  clientName: string;
  at?: unknown;
  note?: string;
}

/** studios/{studioId}/taskRequests/{requestId}/submissions/{trainerId} */
export interface InitiativeSubmission {
  trainerId: string;
  trainerName: string;
  entries: SubmissionEntry[];
  /** Denormalised so a progress bar needs no array read. */
  count: number;
  updatedAt?: unknown;
}

export interface TrainerProgress {
  trainerId: string;
  trainerName: string;
  count: number;
  target: number;
  met: boolean;
  entries: SubmissionEntry[];
}

export interface InitiativeProgress {
  /** Trainers who have logged at least one entry. */
  started: number;
  /** Trainers who hit the per-trainer target. */
  met: number;
  /** Everyone expected to take part. */
  expected: number;
  totalEntries: number;
  perTrainer: TrainerProgress[];
  /** 0-1, by TRAINERS MET rather than entries — see below. */
  ratio: number;
}

/**
 * Roll up an initiative.
 *
 * `ratio` counts trainers who MET the target, not entries logged. Nine
 * trainers at 5 of 5 and one trainer at 45 of 5 are very different studios,
 * and an entry-count bar would show both as 100%. The point of the initiative
 * is that everyone did it, not that the total was reached.
 *
 * `expected` is passed in rather than derived from the submissions, because
 * the trainers who have NOT submitted are the entire question a manager is
 * asking this screen. Deriving it from what exists would make them invisible.
 */
export function initiativeProgress(
  submissions: InitiativeSubmission[],
  roster: { id: string; name: string }[],
  target: InitiativeTarget | undefined,
): InitiativeProgress {
  const per = Math.max(0, target?.perTrainer ?? 0);
  const byId = new Map(submissions.map((s) => [s.trainerId, s]));

  const perTrainer: TrainerProgress[] = roster.map((t) => {
    const s = byId.get(t.id);
    const count = s?.count ?? s?.entries?.length ?? 0;
    return {
      trainerId: t.id,
      trainerName: s?.trainerName || t.name,
      count,
      target: per,
      // A participation-only initiative (no per-trainer number) is met by one
      // entry. Requiring zero would mark everyone done before anyone acted.
      met: per > 0 ? count >= per : count > 0,
      entries: s?.entries ?? [],
    };
  });

  // A submission from someone no longer on the roster still counts toward the
  // studio's total — the work happened. It just cannot be chased.
  for (const s of submissions) {
    if (!roster.some((t) => t.id === s.trainerId)) {
      perTrainer.push({
        trainerId: s.trainerId,
        trainerName: s.trainerName,
        count: s.count ?? s.entries.length,
        target: per,
        met: per > 0 ? (s.count ?? s.entries.length) >= per : s.entries.length > 0,
        entries: s.entries,
      });
    }
  }

  const started = perTrainer.filter((t) => t.count > 0).length;
  const met = perTrainer.filter((t) => t.met).length;
  const expected = Math.max(roster.length, perTrainer.length);
  const totalEntries = perTrainer.reduce((n, t) => n + t.count, 0);

  return {
    started,
    met,
    expected,
    totalEntries,
    ratio: expected > 0 ? met / expected : 0,
    // Behind first: this list exists so a manager can chase, and the people
    // who have done it need nothing from them.
    perTrainer: perTrainer.sort(
      (a, b) => Number(a.met) - Number(b.met) || a.count - b.count ||
        a.trainerName.localeCompare(b.trainerName),
    ),
  };
}

/** What the signed-in trainer still owes. Drives the card's own call to action. */
export function myShare(
  progress: InitiativeProgress,
  trainerId: string | null | undefined,
): { count: number; target: number; remaining: number; met: boolean } | null {
  if (!trainerId) return null;
  const mine = progress.perTrainer.find((t) => t.trainerId === trainerId);
  if (!mine) return { count: 0, target: 0, remaining: 0, met: false };
  return {
    count: mine.count,
    target: mine.target,
    remaining: Math.max(0, mine.target - mine.count),
    met: mine.met,
  };
}

/**
 * Adding a client to a submission, without duplicates.
 *
 * Returns the same array when the client is already logged rather than a new
 * one — so a double tap on a slow connection is a no-op instead of two entries
 * and a count of 2 for one report.
 */
export function withEntry(
  entries: SubmissionEntry[],
  entry: SubmissionEntry,
): SubmissionEntry[] {
  if (entries.some((e) => e.clientId === entry.clientId)) return entries;
  return [...entries, entry];
}

export function withoutEntry(
  entries: SubmissionEntry[],
  clientId: string,
): SubmissionEntry[] {
  return entries.filter((e) => e.clientId !== clientId);
}

/* ------------------------------------------------------------------ *
 * Who an initiative is actually addressed to
 * ------------------------------------------------------------------ */

/**
 * The trainers a studio initiative counts against.
 *
 * PRIMARY HOME STUDIO ONLY, and that is the interesting decision.
 * `accessibleStudioIds` and `activeGuestStudioIds` are wider, and using either
 * would sweep in every trainer who has ever covered a shift here. They would
 * each show as nought of five in the roll-up, the denominator would be wrong,
 * and a manager reading "3 of 14 done" for a studio with six trainers would
 * conclude the floor is failing when it is finished.
 *
 * A guest who does the work anyway is not lost: initiativeProgress appends a
 * row for any submission from someone off the roster, so their entries count
 * toward the studio's total. They just are not chased for it.
 *
 * Placeholder profiles (created for someone who has not signed in yet) are
 * excluded — they cannot submit, so counting them guarantees the initiative
 * never reads as complete.
 */
export function studioRoster(
  trainers: {
    id?: string;
    fullName?: string;
    primaryHomeStudioId?: string;
    authUid?: string;
    isActive?: boolean;
    supersededByUid?: string | null;
  }[],
  studioId: string | null,
): { id: string; name: string }[] {
  if (!studioId) return [];
  return trainers
    .filter(
      (t) =>
        Boolean(t.id) &&
        t.primaryHomeStudioId === studioId &&
        t.isActive !== false &&
        !t.supersededByUid,
    )
    .map((t) => ({ id: t.id!, name: t.fullName?.trim() || "A trainer" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
