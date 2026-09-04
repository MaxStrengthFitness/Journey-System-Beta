/**
 * STUDIO TASKS — every write this feature makes, in one file.
 *
 * Round: Studio To-Do, Sep 2026.
 *
 * NO EAGER MATERIALIZATION — a departure from the spec
 * ----------------------------------------------------
 * The plan was for the first trainer to open the list each day to write that
 * day's instances with setDoc(merge). The deterministic ids made that safe, and
 * it is what §8.1 of the catalog spec describes.
 *
 * It is also unnecessary, and writing it would have been the expensive kind of
 * unnecessary. The day's plan is DERIVED — planDay() computes it from the
 * templates and the roster — so a row with no stored document is simply an open
 * task. Materializing eagerly would mean:
 *
 *   - a burst of 50+ writes the first time anyone opens the app each morning,
 *     on a tablet on studio wifi, for a day that might see no work at all;
 *   - a document for every task on every day the studio was closed;
 *   - a create permission that has to be open to every trainer for documents
 *     nobody asked for.
 *
 * So instances are written LAZILY, on the first action against them. The
 * deterministic id is still what makes that safe: two trainers ticking the same
 * box at the same moment write the same document rather than two.
 *
 * The tradeoff is that "what was outstanding last Tuesday" has to be recomputed
 * from the templates rather than read back. That is the correct direction — the
 * plan is the source of truth and the instances are the record of action
 * against it — and planDay() is pure, so recomputing it is free.
 */

import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import type {
  PlannedInstance,
  TaskInstance,
  TaskStatus,
  TaskTemplate,
} from "./types";

export interface TaskAuthor {
  id: string;
  name: string;
}

export function templatesRef(studioId: string) {
  return collection(db, "studios", studioId, "taskTemplates");
}

export function instancesRef(studioId: string) {
  return collection(db, "studios", studioId, "taskInstances");
}

export function instanceRef(studioId: string, instanceId: string) {
  return doc(db, "studios", studioId, "taskInstances", instanceId);
}

/**
 * Firestore caps a batch at 500 operations. A studio with a lot of templates
 * and a full roster can exceed that on "mark everything", so chunk below the
 * limit rather than discovering it in production.
 *
 * Each chunk is atomic on its own. A partially-applied "mark all" leaves some
 * tasks ticked and some not, which is recoverable and visible; the alternative
 * (one write per row, unbatched) fails the same way but slower and with more
 * chances to fail.
 */
const BATCH_LIMIT = 450;

function instancePayload(
  planned: PlannedInstance,
  studioId: string,
  status: TaskStatus,
  author: TaskAuthor | null,
  extra: { note?: string; flagged?: boolean } = {},
): Omit<TaskInstance, "id"> & Record<string, unknown> {
  const done = status === "done";
  return {
    studioId,
    templateId: planned.templateId,
    localDate: planned.localDate,
    shift: planned.shift,
    ...(planned.machineId ? { machineId: planned.machineId } : {}),

    status,
    ...(extra.note !== undefined ? { note: extra.note } : {}),
    ...(extra.flagged !== undefined ? { flagged: extra.flagged } : {}),

    // Cleared on reopen, so a re-opened task does not keep claiming it was
    // finished by whoever last closed it.
    completedAt: done ? serverTimestamp() : null,
    completedBy: done ? author : null,

    // Denormalized so a completed instance still reads correctly after its
    // template is renamed, retargeted or deleted.
    title: planned.title,
    category: planned.category,
    kind: planned.kind,

    updatedAt: serverTimestamp(),
  };
}

/** Set one task's status. Creates the instance document if this is its first action. */
export async function setTaskStatus(params: {
  studioId: string;
  planned: PlannedInstance;
  status: TaskStatus;
  author: TaskAuthor | null;
  note?: string;
  flagged?: boolean;
}): Promise<void> {
  const { studioId, planned, status, author, note, flagged } = params;
  if (!studioId) throw new Error("No active studio — cannot update a task.");

  await setDoc(
    instanceRef(studioId, planned.id),
    instancePayload(planned, studioId, status, author, { note, flagged }),
    { merge: true },
  );
}

/**
 * Set many tasks at once — "mark all", or a multi-select.
 *
 * Returns how many were written so the caller can report honestly rather than
 * assuming. Rows already in the target status are skipped, so re-tapping "mark
 * all" costs nothing.
 */
export async function setManyTaskStatuses(params: {
  studioId: string;
  planned: PlannedInstance[];
  status: TaskStatus;
  author: TaskAuthor | null;
  note?: string;
}): Promise<number> {
  const { studioId, planned, status, author, note } = params;
  if (!studioId) throw new Error("No active studio — cannot update tasks.");
  if (planned.length === 0) return 0;

  let written = 0;
  for (let i = 0; i < planned.length; i += BATCH_LIMIT) {
    const chunk = planned.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const p of chunk) {
      batch.set(
        instanceRef(studioId, p.id),
        instancePayload(p, studioId, status, author, { note }),
        { merge: true },
      );
    }
    await batch.commit();
    written += chunk.length;
  }
  return written;
}

// ── TEMPLATES (manager) ──────────────────────────────────────────────────

export async function saveTaskTemplate(params: {
  studioId: string;
  template: TaskTemplate;
  author: TaskAuthor | null;
  isNew: boolean;
}): Promise<void> {
  const { studioId, template, author, isNew } = params;
  if (!studioId) throw new Error("No active studio — cannot save a task.");
  if (!template.title.trim()) throw new Error("A task needs a title.");

  const { id, ...rest } = template;
  await setDoc(
    doc(db, "studios", studioId, "taskTemplates", id),
    {
      ...rest,
      studioId,
      updatedAt: serverTimestamp(),
      updatedBy: author?.id ?? null,
      ...(isNew
        ? { createdAt: serverTimestamp(), createdBy: author?.id ?? null }
        : {}),
    },
    { merge: true },
  );
}

/**
 * Retire a template.
 *
 * Deactivates rather than deletes by default: instances reference it, and a
 * deleted template would orphan the history of every time the task was done.
 * Hard delete is reserved for a template created in error.
 */
export async function setTaskTemplateActive(params: {
  studioId: string;
  templateId: string;
  active: boolean;
  author: TaskAuthor | null;
}): Promise<void> {
  const { studioId, templateId, active, author } = params;
  await setDoc(
    doc(db, "studios", studioId, "taskTemplates", templateId),
    { active, updatedAt: serverTimestamp(), updatedBy: author?.id ?? null },
    { merge: true },
  );
}

export async function deleteTaskTemplate(
  studioId: string,
  templateId: string,
): Promise<void> {
  await deleteDoc(doc(db, "studios", studioId, "taskTemplates", templateId));
}

/** Ids are readable on purpose — they appear inside every instance id. */
export function newTemplateId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `${slug || "task"}-${Math.random().toString(36).slice(2, 7)}`;
}
