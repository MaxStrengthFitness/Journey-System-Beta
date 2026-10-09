/**
 * SETTINGS HELD ON THE SESSION: the two writes (the open session round, Oct
 * 9 2026; AJ's "3a"). What and why are in `held-setup.ts`.
 *
 *   - `keepHeldSetup`: the card's Save in an open session. ONE update to the
 *     session, `heldSetup.{machineId}` = `{ values, sources?, at, byUid }`,
 *     issued and handed back to wait on only through `settleOrQueue` (a tap
 *     never waits). The session's own trainer, or anyone who works at its
 *     studio, may write it (the sessions update rule;
 *     tests/firestore.rules.test.ts).
 *   - `queueHeldMoves`: Assign. Every held machine's values are saved to the
 *     chosen client (`queueSettingsSave`), into the ASSIGN'S batch, writing
 *     only the dials the held set-up set (`dialsOnly` and `writeDials`): a
 *     held value wins only for those, and every other dial the client has
 *     stays as the database holds it. The caller deletes `heldSetup` in the
 *     same batch, and runs `afterCommit` (the journal copies and the
 *     machine-fit rows) only once that batch has committed.
 */
import { FieldPath, doc, serverTimestamp, updateDoc, type WriteBatch } from "firebase/firestore";
import { db } from "../../firebase";
import { queueSettingsSave, type JournalContext, type MutationAuthor } from "../equipment/mutations";
import type { SettingFieldSpec } from "../equipment/types";
import type { SettingSource } from "../machine-fit/types";
import { heldSetupEntry, heldSetupField, type HeldMove } from "./held-setup";

/** Keep one machine's values on the open session. One write, issued at once; its promise is the database's answer. */
export function keepHeldSetup(f: {
  sessionId: string;
  machineId: string;
  values: Record<string, string>;
  /** Where a value came from when it isn't typed ("suggested"); typed is left out. */
  sources?: Record<string, SettingSource> | null;
  byUid: string;
}): Promise<void> {
  if (!f.sessionId || !f.machineId) return Promise.reject(new Error("A held set-up names its session and its machine."));
  const entry = heldSetupEntry(f.values, f.byUid, serverTimestamp(), f.sources);
  const ref = doc(db, "sessions", f.sessionId);
  const field = heldSetupField(f.machineId);
  return field ? updateDoc(ref, { [field]: entry }) : updateDoc(ref, new FieldPath("heldSetup", f.machineId), entry);
}

/**
 * Put every held machine's move into the assign's batch: its settings
 * document and its history row, as a save in a client's session makes them.
 * Says which machines are in the batch; a move that could not be (a refusal
 * at the call) is left out, and then the caller keeps `heldSetup` on the
 * session rather than clearing values that never reached the client.
 *
 * Nothing is written outside the batch here. `afterCommit` issues each
 * move's journal copy (at the session's link) and its machine-fit row (only
 * where the server said what the client had, `HeldMove.fitRow`): the caller
 * runs it once the batch has committed, so a refused assign leaves no copy
 * of settings that never landed.
 */
export function queueHeldMoves(
  batch: WriteBatch,
  f: {
    clientId: string;
    moves: readonly HeldMove[];
    nameOf: (machineId: string) => string;
    author: MutationAuthor;
    /** Who kept a machine's set-up (`heldAuthorsOf`), when not `author`: its move is signed by them. */
    authorOf?: (machineId: string) => MutationAuthor | null;
    journal: JournalContext;
    homeStudioId: string | null;
  },
): { queued: string[]; failed: string[]; afterCommit: () => void } {
  const queued: string[] = [];
  const failed: string[] = [];
  const copies: (() => void)[] = [];
  for (const move of f.moves) {
    try {
      const q = queueSettingsSave(batch, {
        clientId: f.clientId,
        machineId: move.machineId,
        fields: move.fields as SettingFieldSpec[],
        saved: move.saved,
        draft: move.draft,
        author: f.authorOf?.(move.machineId) ?? f.author,
        isInitialSetup: move.firstSetup,
        machineName: f.nameOf(move.machineId),
        journal: f.journal,
        existingSources: (move.sources as Record<string, SettingSource> | null) ?? null,
        changedSources: move.changedSources,
        // The fit row is written whole: only off the server's answer.
        homeStudioId: move.fitRow ? f.homeStudioId : null,
        existingAcks: move.fitAcks ?? null,
        dialsOnly: true,
        writeDials: move.writeDials,
      });
      if (q) copies.push(q.afterCommit);
      queued.push(move.machineId);
    } catch (error) {
      console.error("[assign] a held set-up could not be put in the batch", move.machineId, error);
      failed.push(move.machineId);
    }
  }
  const afterCommit = () => {
    for (const run of copies) {
      try {
        run();
      } catch (error) {
        console.error("[assign] a held set-up's journal copy or fit row was not issued", error);
      }
    }
  };
  return { queued, failed, afterCommit };
}
