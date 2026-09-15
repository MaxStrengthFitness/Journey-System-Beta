import { auth } from "../../firebase";
import type { Trainer } from "../../types";
import type { MutationAuthor } from "./mutations";

/**
 * Who a write from this feature is attributed to.
 *
 * The id is the Auth uid, not `trainer.id`: the journalEntries rule pins
 * authorId to the uid, and the two differ on older accounts. One helper so
 * the Equipment tab and the machine window can never disagree about it.
 */
export function authorFromTrainer(trainer: Trainer | null | undefined): MutationAuthor | null {
  if (!trainer) return null;
  return {
    id: auth.currentUser?.uid || trainer.id || "unknown",
    fullName: trainer.fullName || trainer.initials || "Unknown",
    initials: trainer.initials,
  };
}
