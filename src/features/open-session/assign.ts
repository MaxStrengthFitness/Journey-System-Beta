/**
 * WHO'S THIS? (the open session round, Oct 9 2026; finding 3 of
 * `docs/rounds/2026-10-09-open-session.md`, AJ's picks "1b 2a 3a").
 *
 * An open session is started before its client is chosen. Naming the client
 * used to happen only at Finish, and it half failed: it awaited every step,
 * wrote the sets one at a time, and the rules refused a set's client
 * changing, so the session moved and its sets didn't. The only sign was a
 * `console.error`, the trainer landed on a blank screen, and Finish never ran
 * (no session number, counters, machine totals, Wrap-up or Next time).
 *
 * Now the client can be named at any time, from the session bar's Who's
 * this?, or still at Finish. It is ONE batch, issued and never awaited: the
 * session gets the client's fields as a client Start writes them, and every
 * set the session holds gets the client (the rules let a set with no client
 * take its session's client in that same batch, `logTakesItsSessionsClient`).
 * Then it is an ordinary client session on screen, and Finish runs as for any
 * other: the session number, the counters, the totals, the Wrap-up, Next time.
 *
 * Pure: assign.test.ts.
 */

/** What an assign reads of the client. */
export interface AssignClient {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  homeStudioId?: string | null;
  sessionCount?: number | null;
  mindbodyClientId?: string | null;
  mindbodyId?: string | null;
}

/**
 * The fields a client Start writes about the client
 * (`WorkoutTrackerView`'s `startNewSession`), for an open session given its
 * client: who, where they belong, whether it is a cross-train visit, and the
 * session's number (the client's count + 1, as Start numbers it). The
 * client's snapshot for analytics (`clientAge`, `clientOccupation` …) is
 * Finish's, as it is for every session (`completeWorkoutSession`). Nothing
 * in it is `undefined`, which Firestore refuses.
 */
export function assignSessionPatch(f: {
  client: AssignClient;
  /** Where the session is being run. */
  hostedAtStudioId: string | null | undefined;
  /** `serverTimestamp()`, passed in so this stays pure. */
  stamp: unknown;
}): Record<string, unknown> {
  const c = f.client;
  const home = (c.homeStudioId || "").trim() || null;
  const hosted = (f.hostedAtStudioId || "").trim() || null;
  return {
    clientId: c.id,
    isUnassigned: false,
    mindbodyClientId: c.mindbodyClientId || c.mindbodyId || null,
    clientName: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
    homeStudioId: home ?? "",
    clientHomeStudioId: home ?? "",
    // Start's own test: the client belongs somewhere, and it isn't here.
    isCrossTrain: home !== null && hosted !== null && home !== hosted,
    sessionNumber: (Number(c.sessionCount) || 0) + 1,
    lastHeartbeatAt: f.stamp,
  };
}

/** A set of the session, as far as the assign needs it. */
export interface HeldSet {
  id: string;
  sessionId?: string | null;
  machineId?: string | null;
  clientId?: string | null;
}

/**
 * Every set of this session the batch gives the client, once each: what the
 * iPad holds on screen, what its typing timer still had (sent just before
 * the batch), and what the database answered (the iPad's copy, and the
 * server's when the iPad's copy may not hold them all). They are gathered
 * when the batch is built, never before, so a set typed in between is in it:
 * the rules never let a set follow on its own once the session has its
 * client. A set needs its machine (the rules want `sessionId` and
 * `machineId` on every set). One that already has THIS client (the screen
 * marks its sets the moment the client is chosen) is named again, which the
 * rules allow; one that has ANOTHER client is left alone: the rules would
 * refuse the whole batch for it (a set's client never moves), so it is
 * counted apart.
 */
export function setsToAssign(
  sessionId: string,
  clientId: string,
  sources: ReadonlyArray<ReadonlyArray<HeldSet>>,
): { sets: { id: string; machineId: string }[]; withClient: string[] } {
  const sets = new Map<string, { id: string; machineId: string }>();
  const withClient = new Set<string>();
  for (const source of sources) {
    for (const s of source) {
      if (!s?.id || s.sessionId !== sessionId || !s.machineId) continue;
      if (s.clientId && s.clientId !== clientId) {
        withClient.add(s.id);
        continue;
      }
      if (!sets.has(s.id)) sets.set(s.id, { id: s.id, machineId: s.machineId });
    }
  }
  for (const id of withClient) sets.delete(id);
  return { sets: [...sets.values()], withClient: [...withClient] };
}

/** One set's write in the batch: merged, so a set's numbers are never touched. */
export function assignSetPatch(
  sessionId: string,
  set: { machineId: string },
  client: AssignClient,
): Record<string, unknown> {
  const home = (client.homeStudioId || "").trim();
  return {
    sessionId,
    machineId: set.machineId,
    clientId: client.id,
    homeStudioId: home,
    clientHomeStudioId: home,
  };
}

/**
 * How long Who's this? waits for the server's list of the session's sets,
 * when the iPad's copy may not hold them all (its sets listener has not had
 * the server's answer yet: a session just taken over or resumed). The screen
 * never waits: the session is the client's at once, and a Finish tapped
 * meanwhile issues the batch with what is known.
 */
export const ASSIGN_SERVER_READ_WAIT_MS = 3000;

/**
 * The fields of a set on screen to send again after a refused assign: the
 * set's own numbers, never its client (the session is still open) and never
 * the fields only its first write sets. Sets edited while the batch was on
 * its way were sent naming the client, and the rules refused them with it.
 */
export function resendSetFields(log: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(log)) {
    if (v === undefined) continue;
    if (k === "id" || k === "clientId" || k === "createdAt" || k === "homeStudioId" || k === "clientHomeStudioId") continue;
    out[k] = v;
  }
  return out;
}

/** The toast when the database refuses the assign. The session stays open on screen. */
export function assignRefusedWords(firstName: string | null | undefined): string {
  const who = (firstName || "").trim() || "the client";
  return `The session didn't go onto ${who}'s record, so it is still open. Check the connection, then press Who's this? again.`;
}
