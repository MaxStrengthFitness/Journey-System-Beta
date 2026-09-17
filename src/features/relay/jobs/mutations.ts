/**
 * TEAM JOBS — every write, in one file.
 *
 * Concurrency is the whole design here (see ./types.ts): parts are ticked one
 * map key at a time, and people join and leave with arrayUnion/arrayRemove,
 * so nine trainers on nine iPads never overwrite each other.
 */

import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../../firebase";
import { studioDateKey } from "../../../lib/studio-time";
import { notify } from "../../notifications";
import type { TaskAuthor } from "../../studio-tasks/mutations";
import { jobFields, uniqueActors } from "./jobs";
import type { JobDraft, TeamJob } from "./types";

export function teamJobsRef(studioId: string) {
  return collection(db, "studios", studioId, "teamJobs");
}

export function teamJobRef(studioId: string, jobId: string) {
  return doc(db, "studios", studioId, "teamJobs", jobId);
}

const who = (a: TaskAuthor): TaskAuthor => ({ id: a.id, name: (a.name || "A trainer").slice(0, 80) });

/** Posts a new job and tells the people named on it. Returns its id. */
export async function postTeamJob(args: {
  studioId: string;
  draft: JobDraft;
  author: TaskAuthor;
  machineName: (id: string) => string;
}): Promise<string> {
  const { studioId, draft, author, machineName } = args;
  const ref = doc(teamJobsRef(studioId));
  const fields = jobFields(draft, studioId, who(author), machineName);
  const now = serverTimestamp();
  await setDoc(ref, { ...fields, createdAt: now, updatedAt: now });
  await Promise.all(
    fields.assignees.map((a) =>
      notify({
        to: a.id,
        actor: author,
        kind: "job-assigned",
        title: `${author.name} put you on "${fields.title}"`,
        body: fields.dueOn ? `Due ${fields.dueOn}. Anyone can help finish it.` : "Anyone can help finish it.",
        studioId,
        link: { view: "studio-tasks", id: `job:${ref.id}` },
      }),
    ),
  );
  return ref.id;
}

/**
 * A leader changes who is on a job. Only the people ADDED hear about it —
 * "you are no longer needed" is a worse message than none.
 */
export async function setJobPeople(args: {
  job: TeamJob;
  assignees: TaskAuthor[];
  openToAll: boolean;
  author: TaskAuthor;
}): Promise<void> {
  const { job, author } = args;
  const assignees = uniqueActors(args.assignees);
  await updateDoc(teamJobRef(job.studioId, job.id), {
    assignees,
    assigneeIds: assignees.map((a) => a.id),
    openToAll: assignees.length === 0 ? true : args.openToAll,
    updatedAt: serverTimestamp(),
  });
  const before = new Set(job.assigneeIds);
  await Promise.all(
    assignees
      .filter((a) => !before.has(a.id))
      .map((a) =>
        notify({
          to: a.id,
          actor: author,
          kind: "job-assigned",
          title: `${author.name} put you on "${job.title}"`,
          body: "Anyone can help finish it.",
          studioId: job.studioId,
          link: { view: "studio-tasks", id: `job:${job.id}` },
        }),
      ),
  );
}

/** "I'll take it" / "I'll help" — the floor adding itself. */
export async function joinJob(job: TeamJob, me: TaskAuthor): Promise<void> {
  await updateDoc(teamJobRef(job.studioId, job.id), {
    assignees: arrayUnion(who(me)),
    assigneeIds: arrayUnion(me.id),
    updatedAt: serverTimestamp(),
  });
  // The poster hears that an up-for-grabs job was picked up: that is the
  // answer to "did anyone step up?"
  if (job.assigneeIds.length === 0) {
    await notify({
      to: job.createdBy.id,
      actor: me,
      kind: "job-taken",
      title: `${me.name} took "${job.title}"`,
      studioId: job.studioId,
      link: { view: "studio-tasks", id: `job:${job.id}` },
    });
  }
}

/**
 * Stepping off. arrayRemove matches the whole object, so the entry is removed
 * as it is actually stored — a name changed since joining would otherwise
 * leave the person on the job.
 */
export async function leaveJob(job: TeamJob, me: TaskAuthor): Promise<void> {
  const stored = job.assignees.filter((a) => a.id === me.id);
  await updateDoc(teamJobRef(job.studioId, job.id), {
    assignees: arrayRemove(...(stored.length ? stored : [who(me)])),
    assigneeIds: arrayRemove(me.id),
    updatedAt: serverTimestamp(),
  });
}

/** Ticks or unticks one part. One map key — never the whole map. */
export async function setJobPart(job: TeamJob, partId: string, by: TaskAuthor | null): Promise<void> {
  await updateDoc(teamJobRef(job.studioId, job.id), {
    [`parts.${partId}.doneBy`]: by ? who(by) : null,
    [`parts.${partId}.doneAt`]: by ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
}

/** Closes a job with its closing message, and tells whoever posted it. */
export async function closeJob(job: TeamJob, by: TaskAuthor, note: string): Promise<void> {
  const closingNote = note.trim() || null;
  await updateDoc(teamJobRef(job.studioId, job.id), {
    status: "done",
    closedOn: studioDateKey(new Date()),
    closingNote,
    completedBy: who(by),
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (job.notifyOnDone) {
    await notify({
      to: job.createdBy.id,
      actor: by,
      kind: "job-done",
      title: `${by.name} finished "${job.title}"`,
      ...(closingNote ? { body: closingNote } : {}),
      studioId: job.studioId,
      link: { view: "studio-tasks", id: `job:${job.id}` },
    });
  }
}

export async function reopenJob(job: TeamJob): Promise<void> {
  await updateDoc(teamJobRef(job.studioId, job.id), {
    status: "open",
    closedOn: null,
    completedBy: null,
    completedAt: null,
    updatedAt: serverTimestamp(),
  });
}

/** A leader's call: the job is no longer wanted. Kept, not deleted. */
export async function cancelJob(job: TeamJob): Promise<void> {
  await updateDoc(teamJobRef(job.studioId, job.id), {
    status: "cancelled",
    updatedAt: serverTimestamp(),
  });
}

/** A leader edits the words and the date. People and parts have their own writes. */
export async function editJobDetails(
  job: TeamJob,
  patch: Pick<TeamJob, "title" | "detail" | "dueOn" | "requiresNote" | "notifyOnDone">,
): Promise<void> {
  await updateDoc(teamJobRef(job.studioId, job.id), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteJob(job: TeamJob): Promise<void> {
  await deleteDoc(teamJobRef(job.studioId, job.id));
}
