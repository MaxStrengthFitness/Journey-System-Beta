/**
 * Sets still waiting to be sent win over a snapshot (session record, Sep 26 2026).
 *
 * The Active Session writes each set through a short queue (WorkoutTrackerView's
 * `queueLogWrite`): the rep and weight fields call through on every keystroke,
 * so a set's write waits for the trainer to stop typing before it goes. Its
 * `exerciseLogs` listener used to rebuild the whole `logs` map from every
 * snapshot. When machine A's write landed while machine B's was still in the
 * queue, the snapshot carried B's OLD numbers and the rebuild put them back on
 * screen: the number being typed reverted, and the next keystroke was typed onto
 * the reverted value. Torso Rotation's Left and Right are two documents, so
 * typing one side and then the other was the easiest way to meet it.
 *
 * The fix: a set with a write still in the queue keeps what the trainer typed.
 * The snapshot supplies everything else about it, and every other set exactly
 * as the database has it. Once the queued write is sent, Firestore's own local
 * copy carries the typed values, so the next snapshot agrees and nothing is
 * overlaid any more.
 */
import type { ExerciseLog } from "../types";
import { logDocId } from "./exercise-log-id";

/** Stamped by the server when the write lands; never something a trainer typed. */
const SERVER_STAMPED = new Set(["updatedAt", "createdAt"]);

/** One queued write, as `logs` keys it. */
export interface PendingLogEdit {
  key: string;
  fields: Record<string, unknown>;
}

/**
 * The queued writes, keyed the way the `logs` map is (session, machine, side).
 *
 * The queue itself is keyed by DOCUMENT id, which is a random id for a set
 * written before derived ids (see exercise-log-id.ts), so the map key is worked
 * out from the payload instead. A payload without a session or machine cannot be
 * placed and is left out.
 */
export function pendingLogEdits(
  queue: Iterable<{ payload: Record<string, unknown> }>,
): PendingLogEdit[] {
  const out: PendingLogEdit[] = [];
  for (const { payload } of queue) {
    const sessionId = payload.sessionId;
    const machineId = payload.machineId;
    if (typeof sessionId !== "string" || !sessionId) continue;
    if (typeof machineId !== "string" || !machineId) continue;
    const side = payload.side === "Left" || payload.side === "Right" ? payload.side : undefined;
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (!SERVER_STAMPED.has(k)) fields[k] = v;
    }
    out.push({ key: logDocId(sessionId, machineId, side), fields });
  }
  return out;
}

/**
 * The `logs` map a snapshot should produce, keeping queued edits.
 *
 * `snapshot` is the map built from the listener's documents, `prev` the map on
 * screen. A queued set is the snapshot's copy with the queued fields laid over
 * it; one the snapshot does not have yet (its first write is still queued) is
 * the copy on screen with the same fields laid over it. Everything else is the
 * snapshot's. With nothing queued this is the snapshot itself, as before.
 */
export function keepPendingEdits(
  snapshot: Record<string, ExerciseLog>,
  prev: Record<string, ExerciseLog>,
  pending: PendingLogEdit[],
): Record<string, ExerciseLog> {
  if (pending.length === 0) return snapshot;
  const next: Record<string, ExerciseLog> = { ...snapshot };
  for (const { key, fields } of pending) {
    const base = snapshot[key] ?? prev[key];
    next[key] = { ...(base ?? { id: key }), ...fields } as ExerciseLog;
  }
  return next;
}
