/**
 * Notification links the studio-tasks feature writes. Pure, so it can be
 * tested without Firebase (notify.ts itself imports the SDK).
 */

import type { NotificationLink } from "../notifications/types";
import { toStoredLearningRef } from "../learning/ref";

/**
 * Where a flagged machine's notification lands: that machine's page.
 *
 * Carries a Learning ref (Learning + Planner round) as well as the old
 * `{ view, id }`, which the bell now also honours. A task with no machine
 * links to the Planner instead — never `id: undefined`, which Firestore
 * refuses, and notify() would swallow the error and send nothing.
 */
export function machineLink(
  machineId: string | null | undefined,
  machineName?: string | null,
): NotificationLink {
  if (!machineId) return { view: "studio-tasks" };
  const learning = toStoredLearningRef({ kind: "machine", id: machineId }, machineName);
  return learning
    ? { view: "machine-anatomy", id: machineId, learning }
    : { view: "machine-anatomy", id: machineId };
}
