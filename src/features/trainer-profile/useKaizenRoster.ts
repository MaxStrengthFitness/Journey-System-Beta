import { useCallback, useState } from "react";
import { Timestamp, doc, getDocFromServer, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import { useToast } from "../../contexts/ToastContext";
import type { Client, KaizenReason, KaizenRosterEntry, Trainer } from "../../types";
import { addToRoster, removeFromRoster, updateRosterEntry } from "./roster";
import { TIMED_OUT, withTimeout } from "../front-door/boot-lookup";

/** How long a roster change waits for the server's copy before it uses the one in hand. */
const FRESH_READ_MS = 4000;

/**
 * Adding to and removing from a trainer's Kaizen Roster.
 *
 * Writes the whole array with updateDoc rather than arrayUnion/arrayRemove.
 * Two reasons, and the second is the one that decides it:
 *
 *  - arrayRemove needs an EXACT object match to find the element, so removing
 *    an entry would mean reconstructing every field byte-for-byte.
 *  - serverTimestamp() cannot be written inside an array at all, so `addedAt`
 *    is a client-clock Timestamp either way. A device with a wrong clock
 *    misorders its own roster and nothing else -- acceptable for a bookmark,
 *    which is why this is not worth a subcollection.
 *
 * The array being rewritten wholesale is safe here because a roster has
 * exactly one writer: firestore.rules only lets a trainer write their own.
 *
 * Every change is built on the SERVER's copy of the roster, read right before
 * the write (the speed round's review, Oct 5 2026). Since the speed round the
 * app opens on the iPad's own copy of the trainers, which can be days old for
 * the first moment after opening; a roster built on it would silently drop
 * whatever another iPad added since. Only when the server can't be reached
 * (offline, or no answer within FRESH_READ_MS) is the copy in hand used, as it
 * always was offline.
 */
export function useKaizenRoster(trainer: Trainer | null | undefined) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [saving, setSaving] = useState(false);

  /** The roster to build on: the server's, else the copy in hand. */
  const currentRoster = useCallback(async (): Promise<KaizenRosterEntry[] | undefined> => {
    if (!trainer?.id) return trainer?.kaizenRoster;
    try {
      const snap = await withTimeout(getDocFromServer(doc(db, "trainers", trainer.id)), FRESH_READ_MS);
      if (snap !== TIMED_OUT && snap.exists()) {
        return (snap.data()?.kaizenRoster as KaizenRosterEntry[] | undefined) ?? [];
      }
    } catch {
      /* Offline: the copy in hand. */
    }
    return trainer.kaizenRoster;
  }, [trainer]);

  const write = useCallback(
    async (build: (current: KaizenRosterEntry[] | undefined) => KaizenRosterEntry[] | null): Promise<boolean> => {
      if (!trainer?.id) return false;
      setSaving(true);
      try {
        const next = build(await currentRoster());
        // The builder declined (the server's copy refuses the change): nothing to write.
        if (next === null) return false;
        await updateDoc(doc(db, "trainers", trainer.id), { kaizenRoster: next });
        return true;
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `trainers/${trainer.id}`);
        toastError("Couldn't save your Kaizen Roster. Try again.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [trainer?.id, currentRoster, toastError],
  );

  const add = useCallback(
    async (
      client: Pick<Client, "id" | "firstName" | "lastName">,
      reason: KaizenReason,
      options: { note?: string; reviewBy?: Date | null } = {},
    ): Promise<boolean> => {
      if (!trainer?.id || !client.id) return false;

      const entry: KaizenRosterEntry = {
        clientId: client.id,
        clientName: `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "Client",
        reason,
        addedAt: Timestamp.now(),
        addedByTrainerId: trainer.id,
      };
      if (options.note?.trim()) entry.note = options.note.trim();
      if (options.reviewBy) entry.reviewBy = Timestamp.fromDate(options.reviewBy);

      // Checked first on the copy in hand, so a refusal is said at once.
      const precheck = addToRoster(trainer.kaizenRoster, entry);
      if (precheck.kind !== "ok") {
        toastError(precheck.message);
        return false;
      }

      let refusal = null as string | null;
      const saved = await write((current) => {
        const result = addToRoster(current, entry);
        if (result.kind === "ok") return result.next;
        // The server's copy refuses it (another iPad already added this client,
        // or filled the roster): say so and write nothing.
        refusal = result.message;
        return null;
      });
      if (refusal) {
        toastError(refusal);
        return false;
      }
      // No notification of any kind: adding someone to your own working list
      // is not an event anybody else needs told about, and the Sep 4 freeze on
      // contacting clients and trainers still stands.
      if (saved) toastSuccess(`${entry.clientName} added to your Kaizen Roster.`);
      return saved;
    },
    [trainer, write, toastError, toastSuccess],
  );

  const remove = useCallback(
    async (clientId: string): Promise<boolean> => {
      if (!trainer?.id) return false;
      // No confirmation dialog. This is a bookmark, not a record -- and it can
      // be put back in one tap.
      return write((current) => removeFromRoster(current, clientId));
    },
    [trainer, write],
  );

  const update = useCallback(
    async (
      clientId: string,
      patch: Partial<Pick<KaizenRosterEntry, "reason" | "note" | "reviewBy">>,
    ): Promise<boolean> => {
      if (!trainer?.id) return false;
      return write((current) => updateRosterEntry(current, clientId, patch));
    },
    [trainer, write],
  );

  return { add, remove, update, saving };
}
