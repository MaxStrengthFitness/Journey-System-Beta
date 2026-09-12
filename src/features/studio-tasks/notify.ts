/**
 * Who hears about a completed task, and who does not.
 *
 * Round: Settings tiers & Task Board, Sep 2026.
 *
 * The whole value of this file is the SILENCE it enforces. A studio runs 30-40
 * completions a day; announcing all of them would train every manager to
 * ignore the bell inside a week, and then the one notification that mattered —
 * a machine flagged as broken — arrives in a channel nobody reads.
 *
 * So four filters, in order of how much volume each removes:
 *
 *   1. Recurring templates are silent unless explicitly opted in. Nobody wants
 *      a receipt for the bin being emptied on a Tuesday.
 *   2. Nobody is told about their own action (enforced in notify()).
 *   3. Personal tasks never notify. There is no one else involved.
 *   4. A flagged machine ALWAYS notifies, opt-in or not, because "the leg
 *      press pad is split" is the message this system exists to carry.
 */

import { notify } from "../notifications";
import { machineLink } from "./links";
import type { TaskAuthor } from "./mutations";
import type { TaskRow } from "./types";
import { taskScopeOf } from "./types";

/**
 * Does finishing this template's task earn a notification?
 *
 * Pure and exported so the volume policy - the thing that decides whether the
 * bell stays useful - is unit-testable without Firestore.
 *
 * The default is the interesting part: an explicit choice wins, and absent one
 * a ONE-OFF task notifies while a RECURRING task does not. "Restock the InBody
 * paper before Thursday" is a favour someone asked for and the asker wants to
 * know it is handled; "empty the bins" on a Tuesday is not news.
 */
export function shouldNotifyOnComplete(template: {
  notifyCreatorOnComplete?: boolean;
  recurrence?: { type?: string };
}): boolean {
  if (typeof template.notifyCreatorOnComplete === "boolean") {
    return template.notifyCreatorOnComplete;
  }
  return template.recurrence?.type === "once";
}

export interface NotifyTaskCompletionParams {
  row: TaskRow;
  author: TaskAuthor | null;
  studioId: string | null;
  /** Falls back to the template's creator when not given. */
  studioLeaderId?: string | null;
  flagged?: boolean;
  note?: string;
}

/**
 * Tell someone a head trainer put their name on something.
 *
 * DELIBERATELY NOT SUBJECT TO THE VOLUME FILTERS ABOVE. Every one of those
 * exists to stop receipts for work already done from drowning the bell. This
 * is the opposite message: it is about work that has NOT happened, somebody
 * else decided it was yours, and it happens a handful of times a week rather
 * than forty times a day. A trainer who is not told they were assigned
 * something has been assigned nothing.
 *
 * Silent in the two cases where there is no one to tell: assigning yourself,
 * and clearing an assignment (the person who was holding it finds out from
 * the screen, and a "you are no longer needed" notification is a worse
 * message than none).
 */
export async function notifyTaskAssignment(params: {
  row: { title: string; machineName?: string };
  assignee: TaskAuthor | null;
  assignedBy: TaskAuthor | null;
  studioId: string | null;
  /** How many days the assignment covers, for the body line. */
  days?: number;
}): Promise<void> {
  const { row, assignee, assignedBy, studioId, days = 1 } = params;
  if (!studioId || !assignee || !assignedBy) return;
  if (assignee.id === assignedBy.id) return;

  const machineSuffix = row.machineName ? ` — ${row.machineName}` : "";
  await notify({
    to: assignee.id,
    actor: assignedBy,
    kind: "task-assigned",
    title: `${assignedBy.name} assigned you "${row.title}"${machineSuffix}`,
    body:
      days > 1
        ? `For the next ${days} days. Anyone can still close it.`
        : "For today. Anyone can still close it.",
    studioId,
    link: { view: "studio-tasks" },
  });
}

export async function notifyTaskCompletion(
  params: NotifyTaskCompletionParams,
): Promise<void> {
  const { row, author, studioId, studioLeaderId, flagged, note } = params;
  if (!studioId || !author) return;

  const template = row.template;
  // A personal task has an audience of one, and they just did it.
  if (!template || taskScopeOf(template) === "personal") return;

  const machineSuffix = row.machineName ? ` — ${row.machineName}` : "";

  // Filter 4: a problem always travels, whatever the template says.
  if (flagged) {
    await notify({
      to: studioLeaderId ?? template.createdBy,
      actor: author,
      kind: "machine-flagged",
      title: `${author.name} flagged ${row.machineName ?? row.title}`,
      body: note || "A trainer reported a problem.",
      studioId,
      link: machineLink(row.machineId, row.machineName),
    });
    return;
  }

  // Filter 1: recurring work is silent unless a manager asked to hear it.
  if (!shouldNotifyOnComplete(template)) return;

  await notify({
    to: template.createdBy,
    actor: author,
    kind: "task-completed",
    title: `${author.name} completed "${row.title}"${machineSuffix}`,
    ...(note ? { body: note } : {}),
    studioId,
    link: { view: "studio-tasks" },
  });
}
