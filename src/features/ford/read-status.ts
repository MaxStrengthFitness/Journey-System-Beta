/**
 * Whether a client's FORD could be read — and what to say when it could not.
 *
 * Until the client codex round, a refused or failed FORD read came back as an
 * empty list, so the Life section, the briefing cue and the sweep all said
 * "nothing on file yet" about people with plenty on file. For every trainer
 * below franchise owner that was EVERY client: the per-client query named no
 * studio, and the read rule refuses a list it cannot prove is inside one
 * (firestore.rules, `match /{path=**}/ford/{fordId}`).
 *
 * A failed read means "unknown", never "empty" (CLAUDE.md, Data). So the hook
 * reports one of four states, and nothing may claim "nothing on file" unless
 * the state is `ready`.
 *
 * Pure, no Firestore: `read-status.test.ts` pins it.
 */

export type FordReadStatus =
  /** No answer yet — including while the hook is disabled, or the client
   *  (and so the studio to read by) is not known yet. */
  | "loading"
  /** The snapshot answered. Only now does an empty list mean nothing on file. */
  | "ready"
  /** The listener errored for a reason that is not the rules saying no (the
   *  backend unavailable, a quota, an internal error), or the client names no
   *  studio to read by. A listener that errors is finished, so this does not
   *  recover until the screen mounts again.
   *
   *  NOT offline: the app keeps a persistent cache (src/firebase.ts), so an
   *  offline read answers from what this iPad last saw and comes back
   *  `ready` — empty if it never opened this client's FORD. And the query is
   *  equality-only, so it cannot hit a missing index. */
  | "failed"
  /** The rules said no: this reader does not work at the client's home
   *  studio (a cross-train visit). Their FORD is that studio's to read. */
  | "denied";

/** The error from onSnapshot/getDocs, as a status. */
export function fordReadStatusOfError(err: unknown): Exclude<FordReadStatus, "loading" | "ready"> {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  // The web SDK says "permission-denied"; the REST and admin shapes say
  // "PERMISSION_DENIED". Either is the rules, not the network.
  return code === "permission-denied" || code === "PERMISSION_DENIED" ? "denied" : "failed";
}

/** True once an empty list may be read as "nothing on file". */
export function fordReadIsReady(status: FordReadStatus): boolean {
  return status === "ready";
}

/**
 * The sentences a FORD screen shows instead of its empty state. Neutral on
 * purpose — no name and no pronoun — so any screen can use them.
 */
export const FORD_READ_NOTICE = {
  failed:
    "FORD couldn't be read on this iPad just now, so this isn't the same as nothing on file. Open the profile again to retry.",
  denied: "FORD is kept by the client's home studio, and only its team can read it or add to it.",
  /** `failed` because the client names no studio: a retry cannot help, and
   *  the rules refuse a detail stamped with no studio, so nothing can be added. */
  noStudio:
    "This client has no home studio on file, so FORD can't be read or added to until they have one.",
} as const satisfies Record<Exclude<FordReadStatus, "loading" | "ready"> | "noStudio", string>;

/**
 * The sentence a FORD screen shows in place of its empty state, or null when
 * the read answered (or has not yet). `studioId` is the studio the read
 * filters on (`fordStudioIdOf`): with none, the read "failed" for a reason a
 * retry cannot fix, so the screen says that instead of offering a retry.
 */
export function fordReadNotice(status: FordReadStatus, studioId: string): string | null {
  if (status === "denied") return FORD_READ_NOTICE.denied;
  if (status !== "failed") return null;
  return studioId ? FORD_READ_NOTICE.failed : FORD_READ_NOTICE.noStudio;
}

/**
 * Whether a FORD screen offers "Add a detail". Not to a cross-train visitor
 * (`denied`), and not for a client with no studio — the create rule
 * (`isTrainerOfStudio(studioId)`) refuses both writes, so offering them would
 * only lose the sentence. A merely FAILED read still offers it: a failed READ
 * is no reason to refuse a WRITE (never block a save).
 */
export function fordCanAdd(status: FordReadStatus, studioId: string): boolean {
  return status !== "denied" && studioId !== "";
}
