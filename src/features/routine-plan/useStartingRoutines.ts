/**
 * The starting routines a studio's trainers pick from, and the studio's
 * choice, for one screen (Start a plan, the briefing's plan card, My Studio →
 * Studio → Starting routines).
 *
 *   const starting = useStartingRoutines(studioId);
 *   starting.routines   // the app's, or the Academy's eleven (`fromCode`)
 *   starting.choice     // { use, defaultId }, or null while unknown
 *   starting.status     // "loading" | "ready" | "failed"
 *
 * One read of each when the screen mounts (`starting-store.ts`), no
 * listener: they change when an administrator or a leader edits them, not
 * while a trainer looks. `reload()` reads again (after a leader saves the
 * choice). Nothing read is kept in module scope, so nothing is left for the
 * next person on a shared iPad.
 *
 * Nothing waits on it: until the read answers, and when it fails, the
 * routines are the Academy's eleven, so Start a plan always has a start to
 * offer and never blocks a session; `status` and `fromCode` let the screen
 * say which. The choice stays null (unknown) until it answers, never "hasn't
 * chosen" off a read that failed.
 *
 * `{ enabled: false }` reads nothing (and says "loading"): the briefing
 * holds this hook for every client, and reads only when its plan card is
 * drawn (the design round, §5: "one of the studio's choice when Start a
 * plan or the briefing's plan card opens"), never for a client with a
 * routine.
 */
import { useCallback, useEffect, useState } from "react";
import { db } from "../../firebase";
import { NO_CHOICE, routinesToOffer, type StartingRoutinesAnswer } from "./starting-read";
import type { StartingRoutine, StartingRoutineChoice } from "./starting-routines";
import { readStartingChoice, readStartingRoutines } from "./starting-store";

export type StartingRoutinesStatus = "loading" | "ready" | "failed";

export interface StartingRoutinesState {
  routines: StartingRoutine[];
  /** The Academy's eleven built in code, not the app's: before the seed has run, or while the read hasn't answered. */
  fromCode: boolean;
  /** The studio's choice; null while it is unknown (loading, or its read failed). */
  choice: StartingRoutineChoice | null;
  /** "failed" when either read failed, or the routines' only answer was an empty one from the cache. */
  status: StartingRoutinesStatus;
  /** Read both again. */
  reload: () => void;
}

interface Read {
  key: string;
  routines: StartingRoutine[];
  fromCode: boolean;
  choice: StartingRoutineChoice | null;
  status: Exclude<StartingRoutinesStatus, "loading">;
}

/** Which read a result belongs to: the studio, and how many times it was read again. */
function keyOf(studioId: string | null | undefined, nonce: number): string {
  return `${studioId ?? ""}|${nonce}`;
}

/**
 * Before any answer: the Academy's eleven, so a screen draws at once. Worked
 * out once, on first use. It is built from code and the same for everyone,
 * so it is not a memory a sign-out needs to forget.
 */
let beforeAnswer: StartingRoutine[] | null = null;
function academyFallback(): StartingRoutine[] {
  if (!beforeAnswer) beforeAnswer = routinesToOffer(null).routines;
  return beforeAnswer;
}

export function useStartingRoutines(
  studioId: string | null | undefined,
  options: { enabled?: boolean } = {},
): StartingRoutinesState {
  const enabled = options.enabled ?? true;
  const [nonce, setNonce] = useState(0);
  const [read, setRead] = useState<Read | null>(null);
  const key = keyOf(studioId, nonce);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const key = keyOf(studioId, nonce);
    const routinesRead: Promise<StartingRoutinesAnswer> = readStartingRoutines(db, studioId);
    const choiceRead: Promise<StartingRoutineChoice> = studioId
      ? readStartingChoice(db, studioId)
      : Promise.resolve({ ...NO_CHOICE });
    void Promise.allSettled([routinesRead, choiceRead]).then(([r, c]) => {
      if (!live) return;
      const answer = r.status === "fulfilled" ? r.value : null;
      const offered = routinesToOffer(answer);
      const choice = c.status === "fulfilled" ? c.value : null;
      const ok = answer !== null && answer.known && choice !== null;
      // A studio's own routines beside the Academy's code copy (before the seed).
      const own = offered.fromCode ? offered.routines.filter((r) => r.tier === "studio") : [];
      setRead({
        key,
        // The same list as before the answer, so a screen holding it sees no change.
        routines: offered.fromCode ? (own.length > 0 ? [...academyFallback(), ...own] : academyFallback()) : offered.routines,
        fromCode: offered.fromCode,
        choice,
        status: ok ? "ready" : "failed",
      });
    });
    return () => {
      live = false;
    };
  }, [studioId, nonce, enabled]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // A read for another studio (or before a reload) is never shown as this one's.
  if (!enabled || !read || read.key !== key) {
    return { routines: academyFallback(), fromCode: true, choice: null, status: "loading", reload };
  }
  return { routines: read.routines, fromCode: read.fromCode, choice: read.choice, status: read.status, reload };
}
