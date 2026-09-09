/**
 * One canonical exerciseLogs document per (session, machine, side).
 *
 * The id is derived rather than random so that writing a set is idempotent.
 * Three separate paths write a set -- the placeholders created when a session
 * starts, the same for an unassigned/walk-in session, and updateLogMultiple as
 * the trainer works -- and they race each other and the snapshot that reports
 * them. A single grid patch also calls updateLogMultiple more than once for one
 * set (weight and reps arrive as separate calls). With random ids, each of
 * those paths could mint a *new* document for the same set, leaving two rows
 * where the grid shows one and only the last-iterated survives.
 *
 * Deriving it means every writer addresses the same document, so create-or-
 * update is safe to call as often as we like, from wherever.
 *
 * Matches the key used for the local `logs` map, so the two cannot drift.
 *
 * Safe as a Firestore document id: session ids are Firestore auto-ids and
 * machine ids are slugs (`leg_press`, `4_way_neck`) -- neither contains "/".
 */
export const logDocId = (
  sessionId: string,
  machineId: string,
  side?: "Left" | "Right",
) => `${sessionId}_${machineId}${side ? "_" + side : ""}`;
