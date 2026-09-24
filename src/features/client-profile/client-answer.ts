/**
 * AN ANSWER HELD FOR ONE CLIENT (client codex, Sep 2026).
 *
 * ClientProfileView is not remounted when the trainer moves to another
 * client, so anything it keeps in state "for this client" survives the
 * change unless something clears it — and clearing in an effect leaves one
 * render in which the new client wears the old client's answer. So an
 * answer is stamped with the client it is for, and read through
 * `answerFor`: for any other client it is no answer at all ("not known
 * yet"), never the last client's number.
 *
 * Two of the profile's answers use it, both for the Notes & Profile codex:
 *   - whether the progress-reports listener answered (`progressReportsStatus`
 *     — Pulse history is read from that list, and a list that was never read
 *     must not be taken for "no Pulse on file");
 *   - the Journey session count (`journeyCompletedCount`), which is null
 *     until the count query answers. The header's `calculatedSessionCount`
 *     starts at 0, and a 0 there reads as "new" to anything that counts it.
 *
 * Pure: no React, no Firestore.
 */

export interface ClientAnswer<T> {
  /** The client this answer is for. */
  clientId: string;
  value: T;
}

/** The answer when it is for this client; otherwise null ("not known yet"). */
export function answerFor<T>(
  answer: ClientAnswer<T> | null | undefined,
  clientId: string | null | undefined,
): T | null {
  if (!answer || !clientId || answer.clientId !== clientId) return null;
  return answer.value;
}

/**
 * Whether this client's progress reports have been read:
 *   - `loading` — no answer yet for this client (including a listener that
 *     has not opened: the list is only read on two tabs);
 *   - `ready`   — the listener answered; an empty list is a real "none";
 *   - `failed`  — the listener errored, or the app is out of quota and it
 *     was never opened for this client. Unknown, never empty.
 */
export type ProgressReportsStatus = "loading" | "ready" | "failed";

export function progressReportsStatusOf(
  answer: ClientAnswer<Exclude<ProgressReportsStatus, "loading">> | null | undefined,
  clientId: string | null | undefined,
  opts: { quotaBlocked?: boolean } = {},
): ProgressReportsStatus {
  // An answer for this client stands (a listener already open keeps running
  // when the quota flag is raised later). Without one, out of quota, the
  // listener is never opened: waiting would be forever.
  return answerFor(answer, clientId) ?? (opts.quotaBlocked ? "failed" : "loading");
}
