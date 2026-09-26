/**
 * What sign-out asks first (session record, Sep 26 2026).
 *
 * Sign-out asked only about typing. Two things on a shared floor iPad it
 * never mentioned:
 *
 *   - The trainer's own session still open. It stays open in the studio's
 *     records whoever signs in next, and the next person does not resume it.
 *   - Saves that have not reached the database. Firestore keeps each person's
 *     unsent writes on the iPad under that person, and sends them only while
 *     that person is signed in here, so signing out strands them on this iPad
 *     until the same trainer signs in on it again.
 *
 * So sign-out asks when either is true. A question, never a block: "Sign out
 * anyway" always works.
 */

/**
 * Asks the Active Session to send the sets still waiting on its typing timer,
 * now. Sign-out does this first: the screen otherwise sends them only when it
 * closes, which happens AFTER the sign-out, as nobody, and the database
 * refuses a write from nobody.
 */
export const SEND_SETS_NOW_EVENT = "journey:send-sets-now";

export function sendSetsNow(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SEND_SETS_NOW_EVENT));
}

/** Long enough for an iPad with nothing waiting to say so; short enough not to be felt. */
export const UNSENT_CHECK_MS = 500;

export interface SignOutFacts {
  /** The trainer's own open session's client, if one is open. */
  openSessionClientName: string | null;
  /** Saves on this iPad the database has not confirmed. */
  unsent: boolean;
}

export function signOutQuestion({ openSessionClientName, unsent }: SignOutFacts): string | null {
  const parts: string[] = [];
  if (openSessionClientName !== null) {
    const who = openSessionClientName.trim() || "a client";
    parts.push(`Your session with ${who} is still open. It stays open until someone finishes it.`);
  }
  if (unsent) {
    parts.push(
      "Some of this iPad's saves haven't reached the studio's records yet. If you sign out now, they wait on this iPad until you sign in here again.",
    );
  }
  return parts.length ? `${parts.join(" ")} Sign out anyway?` : null;
}

/**
 * Whether saves are waiting: `waitForAll` settles once every write made so far
 * has reached the database, at once when there is nothing to send. No answer
 * in time means something is waiting. A wait that cannot be asked, or fails,
 * says nothing is known to be waiting: sign-out is never held up by a
 * question it cannot ask.
 */
export function unsentWritesWaiting(waitForAll: () => Promise<void>, ms: number = UNSENT_CHECK_MS): Promise<boolean> {
  let waiting: Promise<void>;
  try {
    waiting = waitForAll();
  } catch {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(true), ms);
    waiting.then(
      () => {
        clearTimeout(timer);
        resolve(false);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
}
