/**
 * Finish never hangs, and never counts a session twice (session record, Sep 26 2026).
 *
 * A Firestore write is on the iPad the moment it is made: it goes into the
 * iPad's own copy of the database, survives a reload there, and is passed on
 * when the connection allows. What a write's promise waits for is the
 * DATABASE's answer, and offline that answer never comes. End Session awaited
 * it, so with no signal "Saving…" never ended and the post-session screen
 * never came. Leaving that screen with a closing note did the same.
 *
 * `settleOrQueue` waits for the answer for a moment, and not at all while the
 * iPad knows it is offline. A refusal inside that moment is reported, as
 * before. Past it, the write is taken as saved on the iPad, and the caller
 * moves on and says so.
 *
 * `finishedElsewhere` asks the database, briefly, whether the session was
 * already finished on another iPad, because Finish adds to the client's
 * running totals and a second Finish would add them again. If there is no
 * answer in time (offline), it says no, and Finish goes ahead as it always has.
 */

/** Long enough for an ordinary answer; short enough that a trainer never waits on a dead connection. */
export const FINISH_WAIT_MS = 3_000;
/** The "already finished?" question gets less: it only decides whether to write at all. */
export const FINISHED_ELSEWHERE_WAIT_MS = 2_000;

export type FinishOutcome<T> =
  | { kind: "saved"; value: T }
  | { kind: "failed"; error: unknown }
  | { kind: "queued" };

/**
 * The save's answer if it comes within `ms`, otherwise "queued". Offline it
 * does not wait at all, but a save that fails at once (a refusal the iPad can
 * judge itself) is still reported, never taken as queued.
 */
export function settleOrQueue<T>(save: Promise<T>, online: boolean, ms: number = FINISH_WAIT_MS): Promise<FinishOutcome<T>> {
  const settled: Promise<FinishOutcome<T>> = save.then(
    (value) => ({ kind: "saved", value }),
    (error) => ({ kind: "failed", error }),
  );
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ kind: "queued" }), online ? ms : 0);
    void settled.then((outcome) => {
      clearTimeout(timer);
      resolve(outcome);
    });
  });
}

/** A promise's value if it arrives within `ms`, otherwise null. A rejection is null too. */
export function withinOrNull<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/**
 * Whether the database says this session is already finished. `readStatus`
 * asks the SERVER (not the iPad's copy) for the session's status. Offline, or
 * with no answer in time, the answer is no: Finish must never be blocked by a
 * question it cannot ask.
 */
export async function finishedElsewhere(
  readStatus: () => Promise<string | null | undefined>,
  online: boolean,
  ms: number = FINISHED_ELSEWHERE_WAIT_MS,
): Promise<boolean> {
  if (!online) return false;
  let read: Promise<string | null | undefined>;
  try {
    read = readStatus();
  } catch {
    return false;
  }
  const status = await withinOrNull(read, ms);
  return status === "Completed";
}
